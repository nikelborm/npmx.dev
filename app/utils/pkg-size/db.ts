import type {
  AnalysisSessionEntity,
  DependencyEdgeEntity,
  PackageData,
  PackageEntity,
} from '~/utils/pkg-size/types'
import Dexie from 'dexie'

const MAX_SESSIONS = 25

class NpmxPkgSizeDB extends Dexie {
  packages!: Dexie.Table<PackageEntity, string>
  edges!: Dexie.Table<DependencyEdgeEntity, string>
  sessions!: Dexie.Table<AnalysisSessionEntity, string>

  constructor() {
    super('NpmxPkgSizeDB', {
      autoOpen: false,
    })

    // Version 1 (Legacy schema)
    this.version(1).stores({
      packages: 'id, name',
      dependencyEdges: '++id, parentKey, resolvedVersionKey',
      sessions: 'rootKey',
    })

    // Version 2: Added timestamp index & NEW edges table with composite PK
    this.version(2).stores({
      packages: 'id, name',
      dependencyEdges: null,
      edges: '[parentKey+childName], parentKey, resolvedVersionKey',
      sessions: 'rootKey, timestamp',
    })

    this.packages = this.table('packages')
    this.edges = this.table('edges')
    this.sessions = this.table('sessions')
  }

  /**
   * Helper to evict old sessions and keep the cache size bounded.
   */
  private async cleanup(): Promise<void> {
    if (!this.isOpen()) {
      await this.open()
    }

    const count = await this.sessions.count()

    if (count > MAX_SESSIONS) {
      const oldSessions = await this.sessions
        .orderBy('timestamp')
        .limit(count - MAX_SESSIONS)
        .toArray()

      const keysToDelete = oldSessions.map(s => s.rootKey)
      await this.sessions.bulkDelete(keysToDelete)
    }
  }

  async getSession(id: string): Promise<AnalysisSessionEntity | undefined> {
    if (!this.isOpen()) {
      await this.open()
    }

    return await this.sessions.where('rootKey').equals(id).first()
  }

  async getSessions(ids: string[]): Promise<AnalysisSessionEntity[] | undefined> {
    if (!this.isOpen()) {
      await this.open()
    }

    return await this.sessions.where('rootKey').anyOf(ids).toArray()
  }

  async initSession(rootKey: string | string[]): Promise<void> {
    // Run cleanup before creating new sessions
    await this.cleanup()

    if (!this.isOpen()) {
      await this.open()
    }

    await this.transaction('rw', this.sessions, async () => {
      if (Array.isArray(rootKey)) {
        await this.sessions.bulkPut(
          rootKey.map(key => ({
            rootKey: key,
            timestamp: Date.now(),
            resolvedPackageKeys: [],
            optionalPackageKeys: [],
            totalSize: 0,
            totalOptionalSize: 0,
            isFinished: false,
          })),
        )
      } else {
        await this.sessions.put({
          rootKey,
          timestamp: Date.now(),
          resolvedPackageKeys: [],
          optionalPackageKeys: [],
          totalSize: 0,
          totalOptionalSize: 0,
          isFinished: false,
        })
      }
    })
  }

  async updateSession(
    rootKey: string,
    resolvedPackageKeys: string[],
    optionalPackageKeys: string[],
    totalSize: number,
    totalOptionalSize: number,
    isFinished: boolean,
  ): Promise<void> {
    if (!this.isOpen()) {
      await this.open()
    }
    await this.transaction('rw', this.sessions, async () => {
      await this.sessions.update(rootKey, {
        resolvedPackageKeys,
        optionalPackageKeys,
        totalSize,
        totalOptionalSize,
        isFinished,
        // Bump timestamp to mark it as recently used
        timestamp: Date.now(),
      })
    })
  }

  async upsertPackage(pkgKey: string, pkgData: PackageData) {
    await this.packages.put({
      id: pkgKey,
      name: pkgData.name,
      version: pkgData.version,
      unpackedSize: pkgData.dist?.unpackedSize || 0,
      tarball: pkgData.dist?.tarball || '',
    })
  }

  async addDependencyEdge(
    parentKey: string,
    childName: string,
    resolvedVersionKey: string,
    childRange: string,
    isOptional: boolean,
  ) {
    // Uses put() with the new composite PK to automatically deduplicate edges
    await this.edges.put({
      parentKey,
      childName,
      childRange,
      resolvedVersionKey,
      isOptional,
    })
  }
}

export const db = new NpmxPkgSizeDB()
