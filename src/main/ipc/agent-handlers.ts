import { ipcMain } from 'electron'
import { getAgentPool } from '../agents'
import type { AgentType, AgentSpawnOptions, AgentPoolConfig } from '../agents'

export function registerAgentHandlers(): void {
  ipcMain.handle('agent:get-config', async () => {
    const pool = getAgentPool()
    return pool.getConfig()
  })

  ipcMain.handle('agent:update-config', async (_event, config: Partial<AgentPoolConfig>) => {
    const pool = getAgentPool()
    pool.updateConfig(config)
    return pool.getConfig()
  })

  ipcMain.handle('agent:get-all', async () => {
    const pool = getAgentPool()
    return pool.getAgents()
  })

  ipcMain.handle('agent:get-by-id', async (_event, id: string) => {
    const pool = getAgentPool()
    return pool.getAgent(id)
  })

  ipcMain.handle('agent:get-by-type', async (_event, type: AgentType) => {
    const pool = getAgentPool()
    return pool.getAgentsByType(type)
  })

  ipcMain.handle('agent:get-harness', async () => {
    const pool = getAgentPool()
    return pool.getHarness()
  })

  ipcMain.handle('agent:can-spawn', async (_event, type: AgentType) => {
    const pool = getAgentPool()
    return pool.canSpawn(type)
  })

  ipcMain.handle('agent:get-available-slots', async (_event, type: AgentType) => {
    const pool = getAgentPool()
    return pool.getAvailableSlots(type)
  })

  ipcMain.handle('agent:register', async (_event, options: AgentSpawnOptions) => {
    const pool = getAgentPool()
    return pool.registerAgent(options)
  })

  ipcMain.handle(
    'agent:update-status',
    async (_event, id: string, status: 'idle' | 'busy' | 'terminated', taskId?: string) => {
      const pool = getAgentPool()
      return pool.updateAgentStatus(id, status, taskId)
    }
  )

  ipcMain.handle('agent:terminate', async (_event, id: string) => {
    const pool = getAgentPool()
    return pool.terminateAgent(id)
  })

  ipcMain.handle('agent:terminate-all', async () => {
    const pool = getAgentPool()
    pool.terminateAll()
    return true
  })

  ipcMain.handle('agent:cleanup', async () => {
    const pool = getAgentPool()
    return pool.cleanup()
  })

  ipcMain.handle('agent:get-status', async () => {
    const pool = getAgentPool()
    return pool.getStatus()
  })
}
