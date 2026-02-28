import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createError, type H3Event } from 'h3'

const getEntrypointsMock = vi.fn()
const generateDocsWithDenoMock = vi.fn()
const assertValidPackageNameMock = vi.fn()

vi.mock('#server/utils/docs', () => ({
  getEntrypoints: (...args: unknown[]) => getEntrypointsMock(...args),
  generateDocsWithDeno: (...args: unknown[]) => generateDocsWithDenoMock(...args),
}))

vi.mock('#shared/utils/npm', () => ({
  assertValidPackageName: (...args: unknown[]) => assertValidPackageNameMock(...args),
}))

vi.stubGlobal('defineCachedEventHandler', (fn: Function) => fn)

let routerParam: string | undefined

vi.stubGlobal('getRouterParam', (_event: unknown, _name: string) => routerParam)
vi.stubGlobal('createError', createError)

const handler = (await import('#server/api/registry/docs/[...pkg].get')).default

const fakeEvent = { context: {} } as H3Event

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('docs API handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerParam = undefined
  })

  describe('happy paths', () => {
    it('returns the first concrete entrypoint when the package has no root docs', async () => {
      routerParam = 'pkg/v/1.0.0'
      getEntrypointsMock.mockResolvedValue(['router.js', 'api.js'])

      const result = await handler(fakeEvent)

      // No doc generation happens — the client redirects to the first concrete entrypoint URL.
      expect(generateDocsWithDenoMock).not.toHaveBeenCalled()
      expect(result).toEqual({
        package: 'pkg',
        version: '1.0.0',
        html: '',
        toc: null,
        status: 'ok',
        entrypoints: ['router.js', 'api.js'],
        entrypoint: 'router.js',
      })
    })

    it('returns root docs when the package has both root and subpath entrypoints', async () => {
      routerParam = 'vue/v/3.5.30'
      getEntrypointsMock.mockResolvedValue(['.', 'server-renderer'])
      generateDocsWithDenoMock.mockResolvedValue({
        html: '<div>docs</div>',
        toc: '<nav>toc</nav>',
        nodes: [],
      })

      const result = await handler(fakeEvent)

      expect(generateDocsWithDenoMock).toHaveBeenCalledWith(
        'vue',
        '3.5.30',
        undefined,
        expect.any(Function),
      )
      expect(result).toEqual({
        package: 'vue',
        version: '3.5.30',
        html: '<div>docs</div>',
        toc: '<nav>toc</nav>',
        status: 'ok',
        entrypoints: ['.', 'server-renderer'],
        entrypoint: '.',
      })
    })

    it('returns root docs without entrypoints metadata for single-entrypoint packages', async () => {
      routerParam = 'ufo/v/1.5.0'
      getEntrypointsMock.mockResolvedValue(null)
      generateDocsWithDenoMock.mockResolvedValue({
        html: '<div>ufo</div>',
        toc: '<nav>toc</nav>',
        nodes: [],
      })

      const result = await handler(fakeEvent)

      expect(result).toEqual({
        package: 'ufo',
        version: '1.5.0',
        html: '<div>ufo</div>',
        toc: '<nav>toc</nav>',
        status: 'ok',
      })
      // Critical: no `entrypoints` or `entrypoint` field — frontend uses presence of `entrypoints` to decide whether to render the selector.
      expect(result).not.toHaveProperty('entrypoints')
      expect(result).not.toHaveProperty('entrypoint')
    })

    it('normalizes the "." entrypoint to undefined for the root', async () => {
      // The client may navigate to /package-docs/foo/v/1.0.0/. — the handler must treat this as the root.
      routerParam = 'foo/v/1.0.0/.'
      getEntrypointsMock.mockResolvedValue(['.', 'sub'])
      generateDocsWithDenoMock.mockResolvedValue({ html: 'h', toc: 't', nodes: [] })

      await handler(fakeEvent)

      expect(generateDocsWithDenoMock).toHaveBeenCalledWith(
        'foo',
        '1.0.0',
        undefined,
        expect.any(Function),
      )
    })

    it('passes a non-root entrypoint through unchanged', async () => {
      routerParam = 'vue/v/3.5.30/server-renderer'
      getEntrypointsMock.mockResolvedValue(['.', 'server-renderer'])
      generateDocsWithDenoMock.mockResolvedValue({ html: 'h', toc: 't', nodes: [] })

      const result = await handler(fakeEvent)

      expect(generateDocsWithDenoMock).toHaveBeenCalledWith(
        'vue',
        '3.5.30',
        'server-renderer',
        expect.any(Function),
      )
      expect(result).toMatchObject({ entrypoint: 'server-renderer' })
    })
  })

  describe('failure responses', () => {
    it('returns status: "error" with a user-facing message when generation throws', async () => {
      routerParam = 'broken/v/1.0.0'
      getEntrypointsMock.mockResolvedValue(['.', 'sub'])
      generateDocsWithDenoMock.mockRejectedValue(new Error('@deno/doc exploded'))
      // Suppress expected console.error from the handler's catch branch.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await handler(fakeEvent)

      expect(result).toMatchObject({
        package: 'broken',
        version: '1.0.0',
        html: '',
        toc: null,
        status: 'error',
        // Entrypoint metadata is preserved on error so the selector still renders.
        entrypoints: ['.', 'sub'],
        entrypoint: '.',
      })
      expect((result as { message?: string }).message).toBeTruthy()

      consoleSpy.mockRestore()
    })

    it('returns status: "missing" when generation succeeds but produces no docs', async () => {
      routerParam = 'no-types/v/1.0.0'
      getEntrypointsMock.mockResolvedValue(null)
      generateDocsWithDenoMock.mockResolvedValue(null)

      const result = await handler(fakeEvent)

      expect(result).toMatchObject({
        package: 'no-types',
        version: '1.0.0',
        html: '',
        toc: null,
        status: 'missing',
      })
      expect((result as { message?: string }).message).toBeTruthy()
    })

    it('preserves entrypoint metadata in "missing" responses', async () => {
      // A specific entrypoint of a multi-entrypoint package may have no types — selector still needs to render.
      routerParam = 'pkg/v/1.0.0/empty'
      getEntrypointsMock.mockResolvedValue(['.', 'empty'])
      generateDocsWithDenoMock.mockResolvedValue(null)

      const result = await handler(fakeEvent)

      expect(result).toMatchObject({
        status: 'missing',
        entrypoints: ['.', 'empty'],
        entrypoint: 'empty',
      })
    })
  })

  describe('input validation', () => {
    it('throws 404 when the package param is missing entirely', async () => {
      routerParam = undefined

      await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('throws 404 when the version is missing', async () => {
      routerParam = 'pkg-only'

      await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('propagates errors from assertValidPackageName', async () => {
      routerParam = 'bad name/v/1.0.0'
      assertValidPackageNameMock.mockImplementation(() => {
        throw createError({ statusCode: 400, message: 'invalid package name' })
      })

      await expect(handler(fakeEvent)).rejects.toMatchObject({ statusCode: 400 })
    })
  })
})
