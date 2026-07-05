import { setTimeout } from 'node:timers/promises'
import type { LockFunction } from '@atcute/oauth-node-client'
import { Redis } from '@upstash/redis'

/**
 * Creates a distributed lock using Upstash Redis.
 * Falls back gracefully if the lock cannot be acquired.
 */
function createUpstashLock(redis: Redis): LockFunction {
  return async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const lockKey = `oauth:lock:${key}`
    const lockValue = crypto.randomUUID()
    const lockTTL = 30 // seconds

    // Try to acquire lock with NX (only set if not exists) and EX (expire)
    const acquired = await redis.set(lockKey, lockValue, {
      nx: true,
      ex: lockTTL,
    })

    if (!acquired) {
      // Another instance holds the lock, wait briefly and retry once
      await setTimeout(100)
      const retryAcquired = await redis.set(lockKey, lockValue, {
        nx: true,
        ex: lockTTL,
      })
      if (!retryAcquired) {
        // Still can't acquire, proceed without lock (better than failing)
        // The worst case is a token refresh race, which will just require re-auth
        return await fn()
      }
    }

    try {
      return await fn()
    } finally {
      // Release lock only if we still own it (compare-and-delete)
      const currentValue = await redis.get(lockKey)
      if (currentValue === lockValue) {
        await redis.del(lockKey)
      }
    }
  }
}

/**
 * Returns the appropriate lock mechanism based on environment:
 * - Production with Upstash config: distributed Redis lock
 * - Otherwise: undefined (OAuthClient uses its own in-memory lock by default)
 */
export function getOAuthLock(): LockFunction | undefined {
  const config = useRuntimeConfig()

  // Use distributed lock in production if Upstash is configured
  if (!import.meta.dev && config.upstash?.redisRestUrl && config.upstash?.redisRestToken) {
    const redis = new Redis({
      url: config.upstash.redisRestUrl,
      token: config.upstash.redisRestToken,
    })
    return createUpstashLock(redis)
  }

  // Fall back to undefined for dev/preview — OAuthClient defaults to in-memory lock
  return undefined
}
