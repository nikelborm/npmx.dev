/**
 * API Documentation Generator
 *
 * Generates TypeScript API documentation for npm packages.
 * Uses esm.sh to resolve package types, which handles @types/* packages automatically.
 * Uses @deno/doc (WASM build of deno_doc) for documentation generation.
 *
 * @module server/utils/docs
 */

import type { DocsGenerationResult } from '#shared/types/deno-doc'
import {
  getDocNodes,
  getDocNodesForEntrypoint,
  getSubpathExports,
  getTypesUrlForSubpath,
  type DocsFetch,
} from './client'
import { buildSymbolLookup, flattenNamespaces, mergeOverloads } from './processing'
import { renderDocNodes, renderToc } from './render'

/**
 * Generate API documentation for an npm package (or a specific entrypoint).
 *
 * Uses @deno/doc (WASM build of deno_doc) with esm.sh URLs to extract
 * TypeScript type information and JSDoc comments, then renders them as HTML.
 *
 * @param packageName - The npm package name (e.g., "react", "@types/lodash")
 * @param version - The package version (e.g., "19.2.3")
 * @param entrypoint - Optional subpath export (e.g., "router.js") for multi-entrypoint packages
 * @param registryFetch - Fetch function for npm registry calls (request-scoped, may be cached)
 * @returns Generated documentation or null if no types are available
 */
export async function generateDocsWithDeno(
  packageName: string,
  version: string,
  entrypoint: string | undefined,
  registryFetch: DocsFetch,
): Promise<DocsGenerationResult | null> {
  const normalizedEntrypoint = entrypoint === '.' ? undefined : entrypoint
  const result = normalizedEntrypoint
    ? await getDocNodesForEntrypoint(packageName, version, normalizedEntrypoint)
    : await getDocNodes(packageName, version, registryFetch)

  if (!result.nodes || result.nodes.length === 0) {
    return null
  }

  // Process nodes: flatten namespaces, merge overloads, and build lookup
  const flattenedNodes = flattenNamespaces(result.nodes)
  const mergedSymbols = mergeOverloads(flattenedNodes)
  const symbolLookup = buildSymbolLookup(flattenedNodes)

  // Render HTML and TOC from pre-computed merged symbols
  const html = await renderDocNodes(mergedSymbols, symbolLookup)
  const toc = renderToc(mergedSymbols)

  return { html, toc, nodes: flattenedNodes }
}

/**
 * Get the list of docs entrypoints for a package. Returns `.` for the root
 * entrypoint when the package has both root docs and typed subpath exports.
 */
export async function getEntrypoints(
  packageName: string,
  version: string,
  registryFetch: DocsFetch,
): Promise<string[] | null> {
  const [rootTypesUrl, subpaths] = await Promise.all([
    getTypesUrlForSubpath(packageName, version),
    getSubpathExports(packageName, version, registryFetch),
  ])

  if (subpaths.length === 0) {
    return null
  }

  return rootTypesUrl ? ['.', ...subpaths] : subpaths
}
