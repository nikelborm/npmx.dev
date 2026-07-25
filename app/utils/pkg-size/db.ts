import type {
  AnalysisSessionEntity,
  DependencyEdgeEntity,
  PackageData,
  PackageEntity,
} from '~/utils/pkg-size/types'
import Dexie from 'dexie'

class NpmxPkgSizeDB extends Dexie {
  packages!: Dexie.Table<PackageEntity, string>
  dependencyEdges!: Dexie.Table<DependencyEdgeEntity, number>
  sessions!: Dexie.Table<AnalysisSessionEntity, string>

  constructor() {
    super('NpmxPkgSizeDB', {
      autoOpen: false,
    })

    // Defining strategic indexes to avoid full table scans
    this.version(1).stores({
      // PK: id. Secondary index: name (vital for Diff and checking version collisions)
      packages: 'id, name',
      // PK: id. Secondary indexes: parentKey (to traverse down the tree) and resolvedVersionKey (to traverse up)
      dependencyEdges: '++id, parentKey, resolvedVersionKey',
      // PK: rootKey
      sessions: 'rootKey',
    })

    this.packages = this.table('packages')
    this.dependencyEdges = this.table('dependencyEdges')
    this.sessions = this.table('sessions')
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
    await this.dependencyEdges.add({
      parentKey,
      childName,
      childRange,
      resolvedVersionKey,
      isOptional,
    })
  }
}

export const db = new NpmxPkgSizeDB()
