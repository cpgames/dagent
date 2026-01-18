import path from 'path'
import { readJson, writeJson } from './json-store'
import type { AppSettings } from '@shared/types/settings'
import { DEFAULT_SETTINGS } from '@shared/types/settings'

/**
 * Settings storage service.
 * Manages reading/writing app settings to .dagent/settings.json.
 */
export class SettingsStore {
  constructor(private projectRoot: string) {}

  /**
   * Get the path to the settings file.
   */
  private getSettingsPath(): string {
    return path.join(this.projectRoot, '.dagent', 'settings.json')
  }

  /**
   * Load settings from disk.
   * Returns stored settings merged with defaults to handle new settings being added.
   */
  async load(): Promise<AppSettings> {
    const filePath = this.getSettingsPath()
    const stored = await readJson<Partial<AppSettings>>(filePath)

    // Merge with defaults to ensure all settings have values
    return {
      ...DEFAULT_SETTINGS,
      ...stored
    }
  }

  /**
   * Save settings to disk.
   */
  async save(settings: AppSettings): Promise<void> {
    const filePath = this.getSettingsPath()
    await writeJson(filePath, settings)
  }

  /**
   * Get a single setting value.
   */
  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const settings = await this.load()
    return settings[key]
  }

  /**
   * Set a single setting value.
   */
  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const settings = await this.load()
    settings[key] = value
    await this.save(settings)
  }
}

// Singleton instance
let settingsStoreInstance: SettingsStore | null = null

/**
 * Initialize the settings store singleton.
 * Must be called after project is set.
 */
export function initializeSettingsStore(projectRoot: string): SettingsStore {
  settingsStoreInstance = new SettingsStore(projectRoot)
  return settingsStoreInstance
}

/**
 * Get the settings store singleton.
 * Returns null if not initialized.
 */
export function getSettingsStore(): SettingsStore | null {
  return settingsStoreInstance
}
