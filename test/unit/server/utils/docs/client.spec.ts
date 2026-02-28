import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @deno/doc
const docMock = vi.fn()
vi.mock('@deno/doc', () => ({
  doc: (...args: unknown[]) => docMock(...args),
}))

vi.mock('#shared/utils/npm', () => ({
  encodePackageName: (name: string) => name.replaceAll('/', '%2f'),
}))

// $fetch.raw() is used for esm.sh HEAD requests (still global). The npm registry path
// is now injected via the DocsFetch parameter — we pass `testFetch` below.
const $fetchRawMock = vi.fn()
const $fetchMock = Object.assign(vi.fn(), { raw: $fetchRawMock })
vi.stubGlobal('$fetch', $fetchMock)

const { getDocNodes, getDocNodesForEntrypoint, getSubpathExports } =
  await import('../../../../../server/utils/docs/client')

// Test seam for the injected `DocsFetch`: delegates to the global $fetch mock so each
// test can set responses via `setupMocks(...)` exactly as before.
const testFetch = (url: string, options?: { timeout?: number }): Promise<unknown> =>
  $fetchMock(url, options)

/**
 * @param headMap - Maps esm.sh URLs to their `x-typescript-types` header value.
 *   `string` = types URL returned, `null` = 200 with no header, key absent = 404.
 * @param registryResponse - Single response served for any npm registry GET.
 */
function setupMocks(
  headMap: Record<string, string | null>,
  registryResponse?: Record<string, unknown>,
) {
  $fetchRawMock.mockImplementation(async (url: string) => {
    const typesUrl = headMap[url]
    if (typesUrl === undefined) throw new Error(`404 Not Found: ${url}`)
    return {
      headers: new Headers(typesUrl ? { 'x-typescript-types': typesUrl } : {}),
    }
  })

  $fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('https://registry.npmjs.org/') && registryResponse) {
      return registryResponse
    }
    throw new Error(`Unexpected $fetch call: ${url}`)
  })
}

describe('docs/client - getDocNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns doc nodes when root entry has types', async () => {
    const typesUrl = 'https://esm.sh/ufo@1.5.0/dist/index.d.ts'
    setupMocks({ 'https://esm.sh/ufo@1.5.0': typesUrl })
    docMock.mockResolvedValue({ [typesUrl]: [{ name: 'parseURL', kind: 'function' }] })

    const result = await getDocNodes('ufo', '1.5.0', testFetch)

    expect(result.nodes).toEqual([{ name: 'parseURL', kind: 'function' }])
    expect(docMock).toHaveBeenCalledWith(
      [typesUrl],
      expect.objectContaining({ load: expect.any(Function), resolve: expect.any(Function) }),
    )
  })

  it('returns empty nodes when root has no x-typescript-types header and no exports', async () => {
    setupMocks({ 'https://esm.sh/pkg@1.0.0': null }, { exports: undefined })

    const result = await getDocNodes('pkg', '1.0.0', testFetch)

    expect(result.nodes).toEqual([])
    expect(docMock).not.toHaveBeenCalled()
  })

  it('collects nodes from multiple specifiers in doc result', async () => {
    const typesUrl = 'https://esm.sh/pkg@1.0.0/index.d.ts'
    setupMocks({ 'https://esm.sh/pkg@1.0.0': typesUrl })

    const reExportedUrl = 'https://esm.sh/pkg@1.0.0/types.d.ts'
    docMock.mockResolvedValue({
      [typesUrl]: [{ name: 'foo', kind: 'function' }],
      [reExportedUrl]: [{ name: 'Bar', kind: 'interface' }],
    })

    const result = await getDocNodes('pkg', '1.0.0', testFetch)

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.map(n => n.name).sort()).toEqual(['Bar', 'foo'])
  })

  describe('failure isolation', () => {
    it('returns empty nodes when esm.sh, the npm registry, or @deno/doc throws', async () => {
      // All three external boundaries fail simultaneously — the function still resolves.
      $fetchRawMock.mockRejectedValue(new Error('Network error'))
      $fetchMock.mockRejectedValue(new Error('Network error'))
      docMock.mockRejectedValue(new Error('WASM error'))

      const result = await getDocNodes('pkg', '1.0.0', testFetch)

      expect(result.nodes).toEqual([])
    })
  })

  describe('subpath exports fallback', () => {
    it('falls back to subpath exports when root returns 404', async () => {
      const routerTypes = 'https://esm.sh/@thepassle/app-tools@0.10.2/types/router/index.d.ts'
      const apiTypes = 'https://esm.sh/@thepassle/app-tools@0.10.2/types/api/index.d.ts'

      setupMocks(
        {
          'https://esm.sh/@thepassle/app-tools@0.10.2/router.js': routerTypes,
          'https://esm.sh/@thepassle/app-tools@0.10.2/api.js': apiTypes,
        },
        {
          exports: {
            './router.js': { types: './types/router/index.d.ts', default: './router.js' },
            './api.js': { types: './types/api/index.d.ts', default: './api.js' },
          },
        },
      )

      docMock.mockResolvedValue({
        [routerTypes]: [{ name: 'Router', kind: 'class' }],
        [apiTypes]: [{ name: 'createApi', kind: 'function' }],
      })

      const result = await getDocNodes('@thepassle/app-tools', '0.10.2', testFetch)

      expect(result.nodes).toHaveLength(2)
      expect(docMock).toHaveBeenCalledWith(
        expect.arrayContaining([routerTypes, apiTypes]),
        expect.any(Object),
      )
    })

    it('skips wildcard, root, and untyped exports', async () => {
      const stateTypes = 'https://esm.sh/pkg@1.0.0/types/state/index.d.ts'

      setupMocks(
        { 'https://esm.sh/pkg@1.0.0/state.js': stateTypes },
        {
          exports: {
            '.': { types: './index.d.ts', default: './index.js' },
            './utils/*': { types: './types/utils/*', default: './utils/*' },
            './no-types.js': { default: './no-types.js' },
            './state.js': { types: './types/state/index.d.ts', default: './state.js' },
            './package.json': './package.json',
          },
        },
      )

      docMock.mockResolvedValue({ [stateTypes]: [{ name: 'createState', kind: 'function' }] })

      const result = await getDocNodes('pkg', '1.0.0', testFetch)

      // Only `./state.js` is processed — wildcards, root, untyped, and string-valued exports are skipped.
      expect(result.nodes).toHaveLength(1)
      expect(docMock).toHaveBeenCalledWith([stateTypes], expect.any(Object))
    })

    it('handles partial subpath failures gracefully', async () => {
      const apiTypes = 'https://esm.sh/pkg@1.0.0/api.d.ts'

      setupMocks(
        // router.js HEAD fails (key absent → throws), api.js succeeds
        { 'https://esm.sh/pkg@1.0.0/api.js': apiTypes },
        {
          exports: {
            './router.js': { types: './router.d.ts', default: './router.js' },
            './api.js': { types: './api.d.ts', default: './api.js' },
          },
        },
      )

      docMock.mockResolvedValue({ [apiTypes]: [{ name: 'createApi', kind: 'function' }] })

      const result = await getDocNodes('pkg', '1.0.0', testFetch)

      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0]!.name).toBe('createApi')
    })

    it('returns empty when no subpath exports have types on esm.sh', async () => {
      setupMocks(
        { 'https://esm.sh/pkg@1.0.0/sub.js': null },
        { exports: { './sub.js': { types: './sub.d.ts', default: './sub.js' } } },
      )

      const result = await getDocNodes('pkg', '1.0.0', testFetch)

      expect(result.nodes).toEqual([])
      expect(docMock).not.toHaveBeenCalled()
    })
  })
})

describe('docs/client - getDocNodesForEntrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns doc nodes for a specific entrypoint', async () => {
    const typesUrl = 'https://esm.sh/@thepassle/app-tools@0.10.2/types/router/index.d.ts'
    setupMocks({ 'https://esm.sh/@thepassle/app-tools@0.10.2/router.js': typesUrl })
    docMock.mockResolvedValue({ [typesUrl]: [{ name: 'Router', kind: 'class' }] })

    const result = await getDocNodesForEntrypoint('@thepassle/app-tools', '0.10.2', 'router.js')

    expect(result.nodes).toEqual([{ name: 'Router', kind: 'class' }])
    expect(docMock).toHaveBeenCalledWith([typesUrl], expect.any(Object))
  })

  it('returns empty nodes when the entrypoint has no types', async () => {
    setupMocks({ 'https://esm.sh/pkg@1.0.0/sub.js': null })

    const result = await getDocNodesForEntrypoint('pkg', '1.0.0', 'sub.js')

    expect(result.nodes).toEqual([])
    expect(docMock).not.toHaveBeenCalled()
  })
})

describe('docs/client - getSubpathExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts subpaths from nested condition objects (vue-style import/require)', async () => {
    // Real-world shape: vue declares types inside `import` and `require` conditions.
    setupMocks(
      {},
      {
        exports: {
          './server-renderer': {
            import: { types: './dist/server-renderer.d.mts', default: './server-renderer.mjs' },
            require: { types: './dist/server-renderer.d.ts', default: './server-renderer.js' },
          },
          './compiler-sfc': {
            browser: './compiler-sfc/index.browser.js',
            import: { types: './compiler-sfc/index.d.mts', default: './compiler-sfc/index.mjs' },
          },
        },
      },
    )

    const result = await getSubpathExports('pkg', '1.0.0', testFetch)

    expect(result).toEqual(['server-renderer', 'compiler-sfc'])
  })

  it('returns empty array when the package has no exports field', async () => {
    setupMocks({}, { name: 'pkg' })

    const result = await getSubpathExports('pkg', '1.0.0', testFetch)

    expect(result).toEqual([])
  })
})
