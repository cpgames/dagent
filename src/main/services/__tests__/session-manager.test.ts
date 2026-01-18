/**
 * SessionManager Core Tests
 *
 * Tests for singleton pattern, session lifecycle, and core operations.
 */

import * as fs from 'fs/promises'
import { SessionManager, getSessionManager, resetSessionManager } from '../session-manager'
import type { Session, CreateSessionOptions, AgentType, SessionType, TaskState } from '../../../../shared/types/session'

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockImplementation(async () => {
    const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    throw error
  })
}))

// Mock BrowserWindow for event broadcasting
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([])
  }
}))

// Mock crypto for predictable IDs in tests
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid-1234')
}))

// Mock agent service for compaction
jest.mock('../../agent/agent-service', () => ({
  getAgentService: jest.fn().mockReturnValue({
    streamQuery: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined })
      })
    })
  })
}))

// Mock compaction prompts
jest.mock('../compaction-prompts', () => ({
  buildCompactionPrompt: jest.fn().mockReturnValue('mock compaction prompt'),
  parseCompactionResult: jest.fn().mockReturnValue({
    completed: [],
    inProgress: [],
    pending: [],
    blockers: [],
    decisions: []
  })
}))

describe('SessionManager', () => {
  const testProjectRoot = 'C:\\test\\project'

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()
    // Reset singleton instance
    resetSessionManager()
  })

  afterEach(() => {
    // Ensure singleton is reset after each test
    resetSessionManager()
  })

  describe('Singleton Pattern', () => {
    it('getSessionManager returns same instance when called multiple times', () => {
      const instance1 = getSessionManager(testProjectRoot)
      const instance2 = getSessionManager()

      expect(instance1).toBe(instance2)
    })

    it('resetSessionManager creates new instance', () => {
      const instance1 = getSessionManager(testProjectRoot)
      resetSessionManager()
      const instance2 = getSessionManager(testProjectRoot)

      expect(instance1).not.toBe(instance2)
    })

    it('getSessionManager throws error when not initialized and no projectRoot provided', () => {
      expect(() => getSessionManager()).toThrow('SessionManager not initialized')
    })

    it('constructor initializes empty activeSessions map', () => {
      const manager = new SessionManager(testProjectRoot)
      // Access private field via type assertion for testing
      const activeSessions = (manager as unknown as { activeSessions: Map<string, Session> }).activeSessions
      expect(activeSessions.size).toBe(0)
    })
  })

  describe('Session ID Building', () => {
    it('builds correct ID for feature session (PM agent)', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.id).toBe('pm-feature-feature-123')
    })

    it('builds correct ID for task session (Dev agent)', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'task' as SessionType,
        agentType: 'dev' as AgentType,
        featureId: 'feature-123',
        taskId: 'task-456',
        taskState: 'in_dev' as TaskState
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.id).toBe('dev-task-feature-123-task-456-in_dev')
    })

    it('builds correct ID for task session (QA agent)', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'task' as SessionType,
        agentType: 'qa' as AgentType,
        featureId: 'feature-123',
        taskId: 'task-456',
        taskState: 'in_qa' as TaskState
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.id).toBe('qa-task-feature-123-task-456-in_qa')
    })

    it('builds correct ID for harness agent feature session', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'harness' as AgentType,
        featureId: 'feature-789'
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.id).toBe('harness-feature-feature-789')
    })

    it('builds correct ID for merge agent task session', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'task' as SessionType,
        agentType: 'merge' as AgentType,
        featureId: 'feature-123',
        taskId: 'task-456',
        taskState: 'ready_for_merge' as TaskState
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.id).toBe('merge-task-feature-123-task-456-ready_for_merge')
    })

    it('builds ID without taskState when not provided for task type', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'task' as SessionType,
        agentType: 'dev' as AgentType,
        featureId: 'feature-123',
        taskId: 'task-456'
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.id).toBe('dev-task-feature-123-task-456')
    })
  })

  describe('Session Creation', () => {
    it('createSession creates valid session structure', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const session = await manager.getOrCreateSession(options)

      expect(session).toMatchObject({
        id: 'pm-feature-feature-123',
        type: 'feature',
        agentType: 'pm',
        featureId: 'feature-123',
        status: 'active',
        stats: {
          totalMessages: 0,
          totalTokens: 0,
          totalCompactions: 0
        }
      })
      expect(session.createdAt).toBeDefined()
      expect(session.updatedAt).toBeDefined()
      expect(session.files).toBeDefined()
      expect(session.files.chat).toContain('chat_')
      expect(session.files.checkpoint).toContain('checkpoint_')
      expect(session.files.context).toContain('context_')
      expect(session.files.agentDescription).toContain('agent-description_')
    })

    it('createSession saves session, chat, and checkpoint files', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      await manager.getOrCreateSession(options)

      // Should have called writeFile at least 3 times (session, chat, checkpoint)
      expect(fs.writeFile).toHaveBeenCalled()
      expect(fs.mkdir).toHaveBeenCalled()
    })

    it('getOrCreateSession returns existing session from cache', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const session1 = await manager.getOrCreateSession(options)

      // Clear write mocks to verify no new writes on second call
      jest.mocked(fs.writeFile).mockClear()

      const session2 = await manager.getOrCreateSession(options)

      expect(session1).toBe(session2) // Same reference
      expect(fs.writeFile).not.toHaveBeenCalled() // No new writes
    })
  })

  describe('Session Retrieval', () => {
    it('getSessionById returns null for non-existent session', async () => {
      const manager = new SessionManager(testProjectRoot)
      const session = await manager.getSessionById('non-existent-id', 'feature-123')
      expect(session).toBeNull()
    })

    it('getSessionById returns cached session', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const createdSession = await manager.getOrCreateSession(options)
      const retrievedSession = await manager.getSessionById(createdSession.id, 'feature-123')

      expect(retrievedSession).toBe(createdSession)
    })

    it('getSessionById attempts to load from disk if not in cache', async () => {
      const manager = new SessionManager(testProjectRoot)

      // First call should try to read from disk
      await manager.getSessionById('pm-feature-feature-123', 'feature-123')

      // Should have attempted to read session file
      expect(fs.readFile).toHaveBeenCalled()
    })
  })

  describe('Session Archiving', () => {
    it('archiveSession updates session status to archived', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const session = await manager.getOrCreateSession(options)
      expect(session.status).toBe('active')

      await manager.archiveSession(session.id, 'feature-123')

      // Session should be removed from active cache
      const retrieved = await manager.getSessionById(session.id, 'feature-123')
      // Since it's removed from cache and file doesn't exist, should be null
      expect(retrieved).toBeNull()
    })

    it('archiveSession saves updated session to disk', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const session = await manager.getOrCreateSession(options)
      jest.mocked(fs.writeFile).mockClear()

      await manager.archiveSession(session.id, 'feature-123')

      // Should have written the archived session
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('archiveSession does nothing for non-existent session', async () => {
      const manager = new SessionManager(testProjectRoot)
      jest.mocked(fs.writeFile).mockClear()

      await manager.archiveSession('non-existent', 'feature-123')

      // Should not have written anything
      expect(fs.writeFile).not.toHaveBeenCalled()
    })
  })

  describe('Session Files Structure', () => {
    it('session files have correct naming convention', async () => {
      const manager = new SessionManager(testProjectRoot)
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId: 'feature-123'
      }

      const session = await manager.getOrCreateSession(options)

      expect(session.files.chat).toBe('chat_pm-feature-feature-123.json')
      expect(session.files.checkpoint).toBe('checkpoint_pm-feature-feature-123.json')
      expect(session.files.context).toBe('context_pm-feature-feature-123.json')
      expect(session.files.agentDescription).toBe('agent-description_pm-feature-feature-123.json')
    })
  })
})
