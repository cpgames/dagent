/**
 * Dev Session Migration Service
 *
 * Migrates old nodes/{taskId}/session.json files to new SessionManager format.
 * Old format: TaskAgentSession with messages array
 * New format: SessionManager session with chat_*.json, checkpoint_*.json, etc.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { getSessionManager } from '../session-manager'
import type { DevAgentSession } from '../../../shared/types'

export interface DevMigrationResult {
  success: boolean
  sessionId?: string
  messagesImported?: number
  backupPath?: string
  error?: string
}

/**
 * Check if a task needs dev session migration.
 */
export async function needsDevSessionMigration(
  projectRoot: string,
  featureId: string,
  taskId: string
): Promise<boolean> {
  // Check if old session.json exists
  const oldSessionPath = path.join(
    projectRoot,
    '.dagent-worktrees',
    featureId,
    '.dagent',
    'nodes',
    taskId,
    'session.json'
  )

  try {
    await fs.access(oldSessionPath)
    const data = await fs.readFile(oldSessionPath, 'utf-8')
    const oldSession: DevAgentSession = JSON.parse(data)

    // Check if it has messages to migrate
    if (!oldSession.messages || oldSession.messages.length === 0) {
      return false
    }

    // Check if new session already exists with messages
    const sessionManager = getSessionManager(projectRoot)
    const session = await sessionManager.getOrCreateSession({
      type: 'task',
      agentType: 'dev',
      featureId,
      taskId,
      taskState: 'in_dev'
    })

    const messages = await sessionManager.getAllMessages(session.id, featureId)
    return messages.length === 0 // Only migrate if new session is empty
  } catch {
    return false
  }
}

/**
 * Migrate a single task's dev session.
 */
export async function migrateDevSession(
  projectRoot: string,
  featureId: string,
  taskId: string
): Promise<DevMigrationResult> {
  const oldSessionPath = path.join(
    projectRoot,
    '.dagent-worktrees',
    featureId,
    '.dagent',
    'nodes',
    taskId,
    'session.json'
  )

  try {
    // Read old session
    const data = await fs.readFile(oldSessionPath, 'utf-8')
    const oldSession: DevAgentSession = JSON.parse(data)

    if (!oldSession.messages || oldSession.messages.length === 0) {
      return {
        success: true,
        messagesImported: 0
      }
    }

    // Create backup
    const backupPath = oldSessionPath + '.backup'
    await fs.copyFile(oldSessionPath, backupPath)

    // Get or create new session
    const sessionManager = getSessionManager(projectRoot)
    const session = await sessionManager.getOrCreateSession({
      type: 'task',
      agentType: 'dev',
      featureId,
      taskId,
      taskState: 'in_dev'
    })

    // Import messages
    for (const msg of oldSession.messages) {
      await sessionManager.addMessage(session.id, featureId, {
        role: msg.direction === 'task_to_harness' ? 'assistant' : 'user',
        content: msg.content,
        metadata: {
          migratedFrom: 'session.json',
          originalTimestamp: msg.timestamp,
          originalType: msg.type,
          internal: true
        } as any
      })
    }

    console.log(`[DevMigration] Migrated ${oldSession.messages.length} messages for task ${taskId}`)

    return {
      success: true,
      sessionId: session.id,
      messagesImported: oldSession.messages.length,
      backupPath
    }
  } catch (error) {
    console.error(`[DevMigration] Failed to migrate dev session for ${taskId}:`, error)
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

/**
 * Migrate all dev sessions for a feature.
 */
export async function migrateAllDevSessions(
  projectRoot: string,
  featureId: string
): Promise<{ results: Map<string, DevMigrationResult>; totalMigrated: number }> {
  const results = new Map<string, DevMigrationResult>()
  let totalMigrated = 0

  const nodesDir = path.join(
    projectRoot,
    '.dagent-worktrees',
    featureId,
    '.dagent',
    'nodes'
  )

  try {
    const taskDirs = await fs.readdir(nodesDir)

    for (const taskId of taskDirs) {
      const needsMigration = await needsDevSessionMigration(projectRoot, featureId, taskId)
      if (needsMigration) {
        const result = await migrateDevSession(projectRoot, featureId, taskId)
        results.set(taskId, result)
        if (result.success && result.messagesImported && result.messagesImported > 0) {
          totalMigrated++
        }
      }
    }

    console.log(`[DevMigration] Completed: ${totalMigrated} tasks migrated for feature ${featureId}`)
  } catch {
    // nodes dir may not exist, that's OK
  }

  return { results, totalMigrated }
}
