import { ipcMain } from 'electron'
import { getSettingsStore } from '../storage/settings-store'
import type { AppSettings } from '@shared/types/settings'

/**
 * Register IPC handlers for settings operations.
 */
export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', async (): Promise<AppSettings> => {
    const store = getSettingsStore()
    if (!store) throw new Error('Settings store not initialized')
    return store.load()
  })

  ipcMain.handle('settings:save', async (_event, settings: AppSettings): Promise<void> => {
    const store = getSettingsStore()
    if (!store) throw new Error('Settings store not initialized')
    await store.save(settings)
  })

  ipcMain.handle(
    'settings:get',
    async <K extends keyof AppSettings>(_event: Electron.IpcMainInvokeEvent, key: K): Promise<AppSettings[K]> => {
      const store = getSettingsStore()
      if (!store) throw new Error('Settings store not initialized')
      return store.get(key)
    }
  )

  ipcMain.handle(
    'settings:set',
    async <K extends keyof AppSettings>(
      _event: Electron.IpcMainInvokeEvent,
      key: K,
      value: AppSettings[K]
    ): Promise<void> => {
      const store = getSettingsStore()
      if (!store) throw new Error('Settings store not initialized')
      await store.set(key, value)
    }
  )
}
