import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocNodesMock = vi.fn()
const getDocNodesForEntrypointMock = vi.fn()
const getSubpathExportsMock = vi.fn()
const getTypesUrlForSubpathMock = vi.fn()

vi.mock('../../../../../server/utils/docs/client', () => ({
  getDocNodes: (...args: unknown[]) => getDocNodesMock(...args),
  getDocNodesForEntrypoint: (...args: unknown[]) => getDocNodesForEntrypointMock(...args),
  getSubpathExports: (...args: unknown[]) => getSubpathExportsMock(...args),
  getTypesUrlForSubpath: (...args: unknown[]) => getTypesUrlForSubpathMock(...args),
}))

vi.mock('../../../../../server/utils/docs/processing', () => ({
  flattenNamespaces: (nodes: unknown[]) => nodes,
  mergeOverloads: (nodes: unknown[]) => nodes,
  buildSymbolLookup: () => new Map(),
}))

vi.mock('../../../../../server/utils/docs/render', () => ({
  renderDocNodes: async () => '<div>docs</div>',
  renderToc: () => '<nav>toc</nav>',
}))

const { generateDocsWithDeno, getEntrypoints } =
  await import('../../../../../server/utils/docs/index')

// Sentinel passed as the required `registryFetch` arg. The underlying client functions
// are mocked, so this is never invoked — but the helpers verify it's threaded through.
const stubFetch: (url: string) => Promise<unknown> = vi.fn()

describe('docs/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEntrypoints', () => {
    it('returns null when the package only has root docs', async () => {
      getTypesUrlForSubpathMock.mockResolvedValue('https://esm.sh/ufo@1.5.0/dist/index.d.ts')
      getSubpathExportsMock.mockResolvedValue([])

      expect(await getEntrypoints('ufo', '1.5.0', stubFetch)).toBeNull()
    })

    it('returns null when the package has neither root types nor subpath exports', async () => {
      getTypesUrlForSubpathMock.mockResolvedValue(null)
      getSubpathExportsMock.mockResolvedValue([])

      expect(await getEntrypoints('pkg', '1.0.0', stubFetch)).toBeNull()
    })

    it('prepends the root entrypoint marker when both root docs and subpath docs exist', async () => {
      getTypesUrlForSubpathMock.mockResolvedValue('https://esm.sh/vue@3.5.30/dist/index.d.mts')
      getSubpathExportsMock.mockResolvedValue(['server-renderer', 'compiler-sfc'])

      expect(await getEntrypoints('vue', '3.5.30', stubFetch)).toEqual([
        '.',
        'server-renderer',
        'compiler-sfc',
      ])
    })

    it('returns subpath exports without the root marker when root has no types', async () => {
      getTypesUrlForSubpathMock.mockResolvedValue(null)
      getSubpathExportsMock.mockResolvedValue(['router.js', 'api.js'])

      expect(await getEntrypoints('@thepassle/app-tools', '0.10.2', stubFetch)).toEqual([
        'router.js',
        'api.js',
      ])
    })

    it('threads the registryFetch through to getSubpathExports', async () => {
      getTypesUrlForSubpathMock.mockResolvedValue(null)
      getSubpathExportsMock.mockResolvedValue([])

      await getEntrypoints('pkg', '1.0.0', stubFetch)

      expect(getSubpathExportsMock).toHaveBeenCalledWith('pkg', '1.0.0', stubFetch)
    })
  })

  describe('generateDocsWithDeno', () => {
    it('uses getDocNodes (with registryFetch) for the package root', async () => {
      getDocNodesMock.mockResolvedValue({ version: 1, nodes: [{ name: 'foo', kind: 'function' }] })

      const result = await generateDocsWithDeno('ufo', '1.5.0', undefined, stubFetch)

      expect(getDocNodesMock).toHaveBeenCalledWith('ufo', '1.5.0', stubFetch)
      expect(result).toEqual({
        html: '<div>docs</div>',
        toc: '<nav>toc</nav>',
        nodes: [{ name: 'foo', kind: 'function' }],
      })
    })

    it('uses getDocNodesForEntrypoint when an entrypoint is specified', async () => {
      getDocNodesForEntrypointMock.mockResolvedValue({
        version: 1,
        nodes: [{ name: 'Router', kind: 'class' }],
      })

      await generateDocsWithDeno('@thepassle/app-tools', '0.10.2', 'router.js', stubFetch)

      expect(getDocNodesForEntrypointMock).toHaveBeenCalledWith(
        '@thepassle/app-tools',
        '0.10.2',
        'router.js',
      )
    })

    it('treats the "." entrypoint marker as the package root', async () => {
      // Non-obvious normalization: callers pass "." for clarity, but the root API takes undefined.
      getDocNodesMock.mockResolvedValue({ version: 1, nodes: [{ name: 'createApp' }] })

      await generateDocsWithDeno('vue', '3.5.30', '.', stubFetch)

      expect(getDocNodesMock).toHaveBeenCalledWith('vue', '3.5.30', stubFetch)
      expect(getDocNodesForEntrypointMock).not.toHaveBeenCalled()
    })

    it('returns null when no doc nodes are produced', async () => {
      getDocNodesMock.mockResolvedValue({ version: 1, nodes: [] })

      expect(await generateDocsWithDeno('pkg', '1.0.0', undefined, stubFetch)).toBeNull()
    })
  })
})
