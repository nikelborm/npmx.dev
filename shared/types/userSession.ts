import type { Did } from '@atcute/lexicons'

export interface UserServerSession {
  public?:
    | {
        did: Did
        handle: string
        pds: string
        avatar?: string
        relogin?: boolean
      }
    | undefined

  profile: {
    website?: string
    description?: string
    displayName?: string
  }

  // DO NOT USE
  // Here for historic reasons to redirect users logged in with the previous oauth to login again
  oauthSession?: unknown
}
