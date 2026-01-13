import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { DAGGraph, DAGVersion, DAGHistory, HistoryState } from '@shared/types'

const MAX_VERSIONS = 20

export class HistoryManager {
  private projectRoot: string
  private featureId: string
  private history: DAGHistory

  constructor(projectRoot: string, featureId: string) {
    this.projectRoot = projectRoot
    this.featureId = featureId
    this.history = {
      versions: [],
      currentIndex: -1,
      maxVersions: MAX_VERSIONS
    }
  }

  private getHistoryDir(): string {
    return join(
      this.projectRoot,
      '.dagent-worktrees',
      this.featureId,
      '.dagent',
      'dag_history'
    )
  }

  /**
   * Load existing history from disk.
   */
  load(): void {
    const historyDir = this.getHistoryDir()
    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true })
      return
    }

    const files = readdirSync(historyDir)
      .filter((f) => f.endsWith('.json'))
      .sort()

    this.history.versions = files.map((file, index) => {
      const content = readFileSync(join(historyDir, file), 'utf-8')
      const data = JSON.parse(content)
      return {
        version: index + 1,
        timestamp: data.timestamp || new Date().toISOString(),
        graph: data.graph || data,
        description: data.description
      }
    })

    // Current index is at the end
    this.history.currentIndex = this.history.versions.length - 1
  }

  /**
   * Push a new version. Truncates any redo history.
   */
  pushVersion(graph: DAGGraph, description?: string): void {
    // If we're not at the end, truncate forward history
    if (this.history.currentIndex < this.history.versions.length - 1) {
      this.history.versions = this.history.versions.slice(0, this.history.currentIndex + 1)
      this.cleanupDiskVersions()
    }

    // Add new version
    const version: DAGVersion = {
      version: this.history.versions.length + 1,
      timestamp: new Date().toISOString(),
      graph: JSON.parse(JSON.stringify(graph)), // Deep clone
      description
    }

    this.history.versions.push(version)
    this.history.currentIndex = this.history.versions.length - 1

    // Enforce max versions
    if (this.history.versions.length > MAX_VERSIONS) {
      this.history.versions.shift()
      this.history.currentIndex--
    }

    // Save to disk
    this.saveToDisk()
  }

  /**
   * Undo - go back one version.
   */
  undo(): DAGGraph | null {
    if (!this.canUndo()) return null

    this.history.currentIndex--
    return this.getCurrentGraph()
  }

  /**
   * Redo - go forward one version.
   */
  redo(): DAGGraph | null {
    if (!this.canRedo()) return null

    this.history.currentIndex++
    return this.getCurrentGraph()
  }

  canUndo(): boolean {
    return this.history.currentIndex > 0
  }

  canRedo(): boolean {
    return this.history.currentIndex < this.history.versions.length - 1
  }

  getCurrentGraph(): DAGGraph | null {
    if (this.history.currentIndex < 0 || this.history.versions.length === 0) {
      return null
    }
    return this.history.versions[this.history.currentIndex].graph
  }

  getState(): HistoryState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      currentVersion: this.history.currentIndex + 1,
      totalVersions: this.history.versions.length
    }
  }

  private saveToDisk(): void {
    const historyDir = this.getHistoryDir()
    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true })
    }

    // Re-write all versions with sequential numbering
    this.history.versions.forEach((version, index) => {
      const filename = `${String(index + 1).padStart(3, '0')}.json`
      const filepath = join(historyDir, filename)
      writeFileSync(
        filepath,
        JSON.stringify(
          {
            timestamp: version.timestamp,
            graph: version.graph,
            description: version.description
          },
          null,
          2
        )
      )
    })
  }

  private cleanupDiskVersions(): void {
    const historyDir = this.getHistoryDir()
    if (!existsSync(historyDir)) return

    const files = readdirSync(historyDir).filter((f) => f.endsWith('.json'))
    const keepCount = this.history.versions.length

    // Remove files beyond current version count
    files.forEach((file, index) => {
      if (index >= keepCount) {
        unlinkSync(join(historyDir, file))
      }
    })
  }
}

// Cache of history managers per feature
const historyManagers: Map<string, HistoryManager> = new Map()

export function getHistoryManager(projectRoot: string, featureId: string): HistoryManager {
  const key = `${projectRoot}:${featureId}`
  let manager = historyManagers.get(key)
  if (!manager) {
    manager = new HistoryManager(projectRoot, featureId)
    manager.load()
    historyManagers.set(key, manager)
  }
  return manager
}

export function clearHistoryManagers(): void {
  historyManagers.clear()
}
