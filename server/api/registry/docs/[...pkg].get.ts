import type { DocsResponse } from '#shared/types'
import { assertValidPackageName } from '#shared/utils/npm'
import { parsePackageParam } from '#shared/utils/parse-package-param'
import { generateDocsWithDeno, getEntrypoints } from '#server/utils/docs'
import type { DocsFetch } from '#server/utils/docs/client'

export default defineCachedEventHandler(
  async event => {
    const pkgParam = getRouterParam(event, 'pkg')
    if (!pkgParam) {
      // TODO: throwing 404 rather than 400 as it's cacheable
      throw createError({ statusCode: 404, message: 'Package name is required' })
    }

    const { packageName, version, rest } = parsePackageParam(pkgParam)

    if (!packageName) {
      // TODO: throwing 404 rather than 400 as it's cacheable
      throw createError({ statusCode: 404, message: 'Package name is required' })
    }
    assertValidPackageName(packageName)

    if (!version) {
      // TODO: throwing 404 rather than 400 as it's cacheable
      throw createError({ statusCode: 404, message: 'Package version is required' })
    }

    // Extract entrypoint from remaining path segments (e.g., ["router.js"] -> "router.js")
    const entrypoint = rest.length > 0 ? rest.join('/') : undefined

    // Wrap the request-scoped cached fetch (set by the cache module) when available;
    // otherwise fall back to the global $fetch. Either way the doc helpers see one
    // consistent DocsFetch contract.
    const cachedFetch = event.context?.cachedFetch
    const docsFetch: DocsFetch = cachedFetch
      ? async (url, options) => (await cachedFetch(url, options)).data
      : async (url, options) => await $fetch(url, options)

    // Discover available entrypoints (null for single-entrypoint packages)
    const entrypoints = await getEntrypoints(packageName, version, docsFetch)
    const hasRootEntrypoint = entrypoints?.includes('.') ?? false
    const requestedEntrypoint = entrypoint === '.' ? undefined : entrypoint
    const currentEntrypoint =
      requestedEntrypoint ?? (entrypoints && hasRootEntrypoint ? '.' : undefined)
    const entrypointFields = entrypoints ? { entrypoints, entrypoint: currentEntrypoint } : {}

    // If the package only has subpath entrypoints, return the list so the
    // client can redirect to the first concrete entrypoint page.
    if (entrypoints && !hasRootEntrypoint && !requestedEntrypoint) {
      return {
        package: packageName,
        version,
        html: '',
        toc: null,
        status: 'ok',
        entrypoints,
        entrypoint: entrypoints[0],
      } satisfies DocsResponse
    }

    let generated
    try {
      generated = await generateDocsWithDeno(packageName, version, requestedEntrypoint, docsFetch)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Doc generation failed for ${packageName}@${version}:`, error)
      return {
        package: packageName,
        version,
        html: '',
        toc: null,
        status: 'error',
        message: 'Failed to generate documentation. Please try again later.',
        ...entrypointFields,
      } satisfies DocsResponse
    }

    if (!generated) {
      return {
        package: packageName,
        version,
        html: '',
        toc: null,
        status: 'missing',
        message: 'Docs are not available for this package. It may not have TypeScript types.',
        ...entrypointFields,
      } satisfies DocsResponse
    }

    return {
      package: packageName,
      version,
      html: generated.html,
      toc: generated.toc,
      status: 'ok',
      ...entrypointFields,
    } satisfies DocsResponse
  },
  {
    maxAge: 60 * 60, // 1 hour cache
    swr: true,
    getKey: event => {
      const pkg = getRouterParam(event, 'pkg') ?? ''
      return `docs:v3:${pkg}`
    },
  },
)
