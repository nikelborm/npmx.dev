import type { StateStore, StoredState } from '@atcute/oauth-node-client'
import { OAUTH_CACHE_STORAGE_BASE } from './storage'

// It is recommended that oauth state is only saved for 30 minutes
const STATE_EXPIRATION = CACHE_MAX_AGE_ONE_MINUTE * 30

export class OAuthStateStore implements StateStore {
  private readonly cache: CacheAdapter

  constructor() {
    this.cache = getCacheAdapter(OAUTH_CACHE_STORAGE_BASE)
  }

  private createStorageKey(key: string) {
    return `state:${key}`
  }

  async get(key: string): Promise<StoredState | undefined> {
    const state = await this.cache.get<StoredState>(this.createStorageKey(key))
    return state ?? undefined
  }

  async set(key: string, val: StoredState) {
    await this.cache.set<StoredState>(this.createStorageKey(key), val, STATE_EXPIRATION)
  }

  async delete(key: string) {
    await this.cache.delete(this.createStorageKey(key))
  }

  async clear() {
    // Cache adapter does not expose bulk-clear; individual states expire via TTL
  }
}
