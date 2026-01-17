/**
 * Chat to Session Migration Service
 *
 * Migrates old chat.json files from FeatureStore format to new SessionManager format.
 * Preserves all messages and creates proper session structure.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { getSessionManager } from '../session-manager'
import { getFeatureDir } from '../../storage/paths'
import type { ChatHistory } from '@shared/types'
import type { CreateSessionOptions } from '@shared/types/session'

export interface MigrationResult {
  success: boolean
  featureId: string
  messagesImported: number
  sessionId?: string
  error?: string
  backupPath?: string
}

/**
 * Migrate PM chat for a single feature from old format to session format.
 *
 * @param projectRoot - Project root directory
 * @param featureId - Feature ID to migrate
 * @returns Migration result
 */
export async function migratePMChat(
  projectRoot: string,
  featureId: string
): Promise<MigrationResult> {
  try {
    // 1. Check if old chat.json exists
    const featureDir = getFeatureDir(projectRoot, featureId)
    const oldChatPath = path.join(featureDir, 'chat.json')

    try {
      await fs.access(oldChatPath)
    } catch {
      // No old chat file, nothing to migrate
      return {
        success: true,
        featureId,
        messagesImported: 0
      }
    }

    // 2. Read old chat.json
    const oldChatContent = await fs.readFile(oldChatPath, 'utf-8')
    const oldChat: ChatHistory = JSON.parse(oldChatContent)

    if (!oldChat.entries || oldChat.entries.length === 0) {
      return {
        success: true,
        featureId,
        messagesImported: 0
      }
    }

    // 3. Create backup before migration
    const backupPath = path.join(featureDir, 'chat.json.backup')
    await fs.copyFile(oldChatPath, backupPath)

    // 4. Get or create session
    const sessionManager = getSessionManager(projectRoot)
    const sessionOptions: CreateSessionOptions = {
      type: 'feature',
      agentType: 'pm',
      featureId
    }
    const session = await sessionManager.getOrCreateSession(sessionOptions)

    // 5. Add each message to session
    let messagesImported = 0
    for (const entry of oldChat.entries) {
      // Map old ChatEntry to session message
      const role = entry.role === 'user' ? 'user' : 'assistant'

      await sessionManager.addMessage(
        session.id,
        featureId,
        {
          role,
          content: entry.content,
          metadata: {
            migratedFrom: 'chat.json',
            originalTimestamp: entry.timestamp
          } as any
        }
      )
      messagesImported++
    }

    // 6. Optionally create initial checkpoint from imported messages
    // For now, let natural compaction handle this

    console.log(`[Migration] Migrated ${messagesImported} messages for feature ${featureId}`)

    return {
      success: true,
      featureId,
      messagesImported,
      sessionId: session.id,
      backupPath
    }
  } catch (error) {
    console.error(`[Migration] Failed to migrate PM chat for ${featureId}:`, error)
    return {
      success: false,
      featureId,
      messagesImported: 0,
      error: (error as Error).message
    }
  }
}

/**
 * Migrate PM chats for all features in a project.
 *
 * @param projectRoot - Project root directory
 * @returns Array of migration results
 */
export async function migrateAllPMChats(
  projectRoot: string
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []

  try {
    // Find all feature directories
    const dagentDir = path.join(projectRoot, '.dagent-worktrees')

    try {
      await fs.access(dagentDir)
    } catch {
      // No worktrees directory
      return results
    }

    const entries = await fs.readdir(dagentDir, { withFileTypes: true })
    const featureDirs = entries.filter((e) => e.isDirectory())

    // Migrate each feature
    for (const dir of featureDirs) {
      const featureId = dir.name
      const result = await migratePMChat(projectRoot, featureId)
      results.push(result)
    }

    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length
    console.log(`[Migration] Completed: ${successful} succeeded, ${failed} failed`)

    return results
  } catch (error) {
    console.error('[Migration] Failed to migrate all PM chats:', error)
    return results
  }
}

/**
 * Check if a feature needs migration.
 *
 * @param projectRoot - Project root directory
 * @param featureId - Feature ID to check
 * @returns True if old chat.json exists and session doesn't have messages
 */
export async function needsMigration(
  projectRoot: string,
  featureId: string
): Promise<boolean> {
  try {
    const featureDir = getFeatureDir(projectRoot, featureId)
    const oldChatPath = path.join(featureDir, 'chat.json')

    // Check if old chat exists
    try {
      await fs.access(oldChatPath)
    } catch {
      return false // No old chat, no migration needed
    }

    // Read old chat to check if it has entries
    try {
      const oldChatContent = await fs.readFile(oldChatPath, 'utf-8')
      const oldChat: ChatHistory = JSON.parse(oldChatContent)
      if (!oldChat.entries || oldChat.entries.length === 0) {
        return false // Empty old chat, no migration needed
      }
    } catch {
      return false // Can't read old chat, skip migration
    }

    // Check if session already has messages
    const sessionManager = getSessionManager(projectRoot)
    const sessionId = `pm-feature-${featureId}`
    const messages = await sessionManager.getAllMessages(sessionId, featureId)

    // Need migration if old chat has entries but session is empty
    return messages.length === 0
  } catch {
    return false
  }
}
