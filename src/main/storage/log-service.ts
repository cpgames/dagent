import { getStore } from './feature-store'
import type { LogEntry, AgentLog } from '@shared/types'

/**
 * LogService handles appending log entries to harness_log.json.
 * Uses a cache to avoid re-reading the file on every append.
 */
class LogService {
  private cache: Map<string, LogEntry[]> = new Map()

  /**
   * Append a log entry to the harness log for a feature.
   * Uses cache to avoid repeated file reads.
   */
  async appendEntry(featureId: string, entry: LogEntry): Promise<void> {
    // Load existing or use cache
    let entries = this.cache.get(featureId)
    if (!entries) {
      const existing = await getStore().loadHarnessLog(featureId)
      entries = existing?.entries || []
      this.cache.set(featureId, entries)
    }

    // Append and save
    entries.push(entry)
    await getStore().saveHarnessLog(featureId, { entries })
  }

  /**
   * Clear the cache for a specific feature or all features.
   * Call this when execution stops to ensure fresh loads next time.
   */
  clearCache(featureId?: string): void {
    if (featureId) {
      this.cache.delete(featureId)
    } else {
      this.cache.clear()
    }
  }

  /**
   * Get current entries from cache (for debugging).
   */
  getCachedEntries(featureId: string): LogEntry[] | undefined {
    return this.cache.get(featureId)
  }
}

// Singleton instance
let instance: LogService | null = null

export function getLogService(): LogService {
  if (!instance) {
    instance = new LogService()
  }
  return instance
}
