export type DocsStatus = 'ok' | 'missing' | 'error'

export interface DocsResponse {
  package: string
  version: string
  html: string
  toc: string | null
  breadcrumbs?: string | null
  status: DocsStatus
  message?: string
  /** Available docs entrypoints. `.` denotes the package root entrypoint. */
  entrypoints?: string[]
  /** The current docs entrypoint being viewed. `.` denotes the package root entrypoint. */
  entrypoint?: string
}

export interface DocsSearchResponse {
  package: string
  version: string
  index: Record<string, unknown>
}
