/**
 * SessionManager Compaction and Token Estimation Tests
 *
 * Tests for token estimation, compaction trigger logic, and request building.
 */

import * as fs from 'fs/promises'
import { SessionManager, getSessionManager, resetSessionManager } from '../session-manager'
import {
  estimateTokens,
  estimateMessagesTokens,
  estimateCheckpointTokens,
  estimateContextTokens,
  estimateAgentDescriptionTokens,
  estimateRequest,
  estimateTokensReclaimed,
  determineMessagesToKeep,
  formatContextAsPrompt,
  formatCheckpointAsPrompt,
  formatMessagesAsPrompt,
  TOKEN_LIMIT
} from '../token-estimator'
import type {
  Session,
  ChatMessage,
  Checkpoint,
  SessionContext,
  AgentDescription
} from '../../../../shared/types/session'

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

// Mock crypto
let uuidCounter = 0
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockImplementation(() => `test-uuid-${++uuidCounter}`)
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
    completed: ['Compacted task 1'],
    inProgress: ['Current work'],
    pending: ['Future task'],
    blockers: [],
    decisions: ['Key decision']
  })
}))

describe('Token Estimation', () => {
  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0)
    })

    it('returns 0 for null/undefined', () => {
      expect(estimateTokens(null as unknown as string)).toBe(0)
      expect(estimateTokens(undefined as unknown as string)).toBe(0)
    })

    it('calculates correct token count using 4 chars per token', () => {
      // 20 characters / 4 = 5 tokens
      expect(estimateTokens('12345678901234567890')).toBe(5)
      // 8 characters / 4 = 2 tokens
      expect(estimateTokens('12345678')).toBe(2)
      // 3 characters / 4 = 1 token (ceiling)
      expect(estimateTokens('123')).toBe(1)
    })

    it('rounds up for partial tokens', () => {
      // 5 characters / 4 = 1.25 -> 2 tokens
      expect(estimateTokens('12345')).toBe(2)
    })
  })

  describe('estimateMessagesTokens', () => {
    it('returns 0 for empty message array', () => {
      expect(estimateMessagesTokens([])).toBe(0)
    })

    it('calculates tokens for single message', () => {
      const messages: ChatMessage[] = [{
        id: '1',
        role: 'user',
        content: '12345678901234567890', // 20 chars = 5 tokens
        timestamp: new Date().toISOString()
      }]
      // 5 tokens + 10 overhead = 15
      expect(estimateMessagesTokens(messages)).toBe(15)
    })

    it('calculates tokens for multiple messages', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: '12345678', timestamp: new Date().toISOString() }, // 2 + 10 = 12
        { id: '2', role: 'assistant', content: '12345678', timestamp: new Date().toISOString() } // 2 + 10 = 12
      ]
      expect(estimateMessagesTokens(messages)).toBe(24)
    })

    it('uses metadata.tokens when available', () => {
      const messages: ChatMessage[] = [{
        id: '1',
        role: 'user',
        content: 'any content',
        timestamp: new Date().toISOString(),
        metadata: { tokens: { input: 100, output: 200 } }
      }]
      // Should use 100 + 200 + 10 (overhead) - estimate for content + 10
      // The formula subtracts content estimate and adds actual tokens
      const contentEstimate = estimateTokens('any content')
      const expected = contentEstimate + 10 - contentEstimate + 100 + 200
      expect(estimateMessagesTokens(messages)).toBe(expected)
    })
  })

  describe('estimateCheckpointTokens', () => {
    it('calculates tokens for empty checkpoint', () => {
      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: [],
          inProgress: [],
          pending: [],
          blockers: [],
          decisions: []
        },
        compactionInfo: {
          messagesCompacted: 0,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: {
          totalCompactions: 0,
          totalMessages: 0,
          totalTokens: 0
        }
      }
      // Empty arrays + 50 overhead
      expect(estimateCheckpointTokens(checkpoint)).toBe(50)
    })

    it('includes tokens from all summary sections', () => {
      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: ['12345678', '12345678'], // 8+8 = 16 chars = 4 tokens
          inProgress: ['12345678'], // 8 chars = 2 tokens
          pending: ['12345678'], // 8 chars = 2 tokens
          blockers: ['12345678'], // 8 chars = 2 tokens
          decisions: ['12345678'] // 8 chars = 2 tokens
        },
        compactionInfo: {
          messagesCompacted: 10,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: {
          totalCompactions: 1,
          totalMessages: 10,
          totalTokens: 500
        }
      }
      // 4 + 2 + 2 + 2 + 2 + 50 overhead = 62
      // With newlines in join: completed = "12345678\n12345678" = 17 chars = 5 tokens (ceiling)
      const expected = 5 + 2 + 2 + 2 + 2 + 50
      expect(estimateCheckpointTokens(checkpoint)).toBe(expected)
    })

    it('throws when given null checkpoint', () => {
      // Note: estimateCheckpointTokens expects a valid Checkpoint, caller should handle null
      expect(() => estimateCheckpointTokens(null as unknown as Checkpoint)).toThrow()
    })
  })

  describe('estimateContextTokens', () => {
    it('calculates tokens for minimal context', () => {
      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: 'Test Feature' // 12 chars = 3 tokens
      }
      // 3 + 100 overhead = 103
      expect(estimateContextTokens(context)).toBe(103)
    })

    it('includes all optional fields in calculation', () => {
      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: '12345678', // 2 tokens
        featureGoal: '12345678', // 2 tokens
        taskTitle: '12345678', // 2 tokens
        dagSummary: '12345678', // 2 tokens
        dependencies: ['12345678'], // 2 tokens
        dependents: ['12345678'], // 2 tokens
        projectStructure: '12345678', // 2 tokens
        claudeMd: '12345678', // 2 tokens
        projectMd: '12345678', // 2 tokens
        recentCommits: ['12345678'], // 2 tokens
        attachments: ['12345678'] // 2 tokens
      }
      // 22 + 100 overhead = 122
      expect(estimateContextTokens(context)).toBe(122)
    })
  })

  describe('estimateAgentDescriptionTokens', () => {
    it('calculates tokens for description with role only', () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: '12345678901234567890', // 20 chars = 5 tokens
        createdAt: new Date().toISOString()
      }
      // 5 + 20 overhead = 25
      expect(estimateAgentDescriptionTokens(description)).toBe(25)
    })

    it('includes tool instructions in calculation', () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: '12345678901234567890', // 5 tokens
        toolInstructions: '12345678901234567890', // 5 tokens
        createdAt: new Date().toISOString()
      }
      // 5 + 5 + 20 overhead = 30
      expect(estimateAgentDescriptionTokens(description)).toBe(30)
    })
  })

  describe('estimateRequest', () => {
    it('combines all components correctly', () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: '12345678901234567890', // 5 tokens
        createdAt: new Date().toISOString()
      }

      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: '12345678' // 2 tokens
      }

      const messages: ChatMessage[] = [{
        id: '1',
        role: 'user',
        content: '12345678', // 2 tokens
        timestamp: new Date().toISOString()
      }]

      const result = estimateRequest({
        agentDescription: description,
        context,
        messages,
        userPrompt: '12345678' // 2 tokens
      })

      // Agent: 5 + 20 = 25
      // Context: 2 + 100 = 102
      // Messages: 2 + 10 = 12
      // User prompt: 2
      // System = 25 + 102 + 12 = 139
      // Total = 139 + 2 = 141
      expect(result.total).toBe(141)
      expect(result.userPrompt).toBe(2)
      expect(result.limit).toBe(TOKEN_LIMIT)
    })

    it('includes checkpoint when provided', () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: '',
        createdAt: new Date().toISOString()
      }

      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: ''
      }

      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: ['12345678'], // 2 tokens
          inProgress: [],
          pending: [],
          blockers: [],
          decisions: []
        },
        compactionInfo: {
          messagesCompacted: 0,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: { totalCompactions: 0, totalMessages: 0, totalTokens: 0 }
      }

      const result = estimateRequest({
        agentDescription: description,
        context,
        checkpoint,
        messages: [],
        userPrompt: ''
      })

      // Agent: 0 + 20 = 20
      // Context: 0 + 100 = 100
      // Checkpoint: 2 + 50 = 52
      // Total = 20 + 100 + 52 = 172
      expect(result.total).toBe(172)
    })

    it('sets needsCompaction when over 90k threshold', () => {
      const largeContent = 'x'.repeat(400000) // ~100k tokens
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: largeContent,
        createdAt: new Date().toISOString()
      }

      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: ''
      }

      const result = estimateRequest({
        agentDescription: description,
        context,
        messages: [],
        userPrompt: ''
      })

      expect(result.needsCompaction).toBe(true)
    })

    it('does not set needsCompaction under 90k threshold', () => {
      const description: AgentDescription = {
        agentType: 'pm',
        roleInstructions: '12345678',
        createdAt: new Date().toISOString()
      }

      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: ''
      }

      const result = estimateRequest({
        agentDescription: description,
        context,
        messages: [],
        userPrompt: ''
      })

      expect(result.needsCompaction).toBe(false)
    })
  })

  describe('estimateTokensReclaimed', () => {
    it('estimates tokens reclaimed from compaction', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'x'.repeat(400), timestamp: new Date().toISOString() } // 100 + 10 = 110
      ]

      const reclaimed = estimateTokensReclaimed(messages)
      // Current: 110 tokens
      // New checkpoint estimate: 110 * 0.3 = 33
      // Reclaimed: 110 - 33 = 77
      expect(reclaimed).toBe(77)
    })

    it('includes current checkpoint in calculation', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'x'.repeat(400), timestamp: new Date().toISOString() } // 110 tokens
      ]

      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: ['x'.repeat(200)], // 50 tokens
          inProgress: [],
          pending: [],
          blockers: [],
          decisions: []
        },
        compactionInfo: {
          messagesCompacted: 0,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: { totalCompactions: 0, totalMessages: 0, totalTokens: 0 }
      }

      const reclaimed = estimateTokensReclaimed(messages, checkpoint)
      // Current: 110 + 100 (50 + 50 overhead) = 210
      // New checkpoint estimate: 210 * 0.3 = 63
      // Reclaimed: 210 - 63 = 147
      expect(reclaimed).toBe(147)
    })
  })

  describe('determineMessagesToKeep', () => {
    it('keeps messages within token limit', () => {
      const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        role: 'user' as const,
        content: 'x'.repeat(40), // 10 + 10 = 20 tokens each
        timestamp: new Date().toISOString()
      }))

      // With default 10k limit, can fit 10000 / 20 = 500 messages
      const keep = determineMessagesToKeep(messages)
      expect(keep).toBe(10) // All messages fit
    })

    it('returns subset when messages exceed limit', () => {
      const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        role: 'user' as const,
        content: 'x'.repeat(4000), // 1000 + 10 = 1010 tokens each
        timestamp: new Date().toISOString()
      }))

      // With default 10k limit, can fit ~9 messages
      const keep = determineMessagesToKeep(messages)
      expect(keep).toBeLessThan(10)
      expect(keep).toBeGreaterThan(0)
    })

    it('always keeps at least 1 message', () => {
      const messages: ChatMessage[] = [{
        id: '1',
        role: 'user',
        content: 'x'.repeat(1000000), // Way over limit
        timestamp: new Date().toISOString()
      }]

      const keep = determineMessagesToKeep(messages, 100)
      expect(keep).toBe(1)
    })

    it('respects custom token limit', () => {
      const messages: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        role: 'user' as const,
        content: 'x'.repeat(40), // 10 + 10 = 20 tokens each
        timestamp: new Date().toISOString()
      }))

      // With 50 token limit, can fit 50 / 20 = 2 messages
      const keep = determineMessagesToKeep(messages, 50)
      expect(keep).toBe(2)
    })
  })
})

describe('Prompt Formatting', () => {
  describe('formatContextAsPrompt', () => {
    it('formats minimal context', () => {
      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: 'Test Feature'
      }

      const prompt = formatContextAsPrompt(context)
      expect(prompt).toContain('## Project Context')
      expect(prompt).toContain('**Feature:** Test Feature')
    })

    it('includes optional task context', () => {
      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        taskId: 'task-1',
        taskTitle: 'Write tests',
        taskState: 'in_dev',
        dependencies: ['task-0'],
        dependents: ['task-2']
      }

      const prompt = formatContextAsPrompt(context)
      expect(prompt).toContain('## Current Task')
      expect(prompt).toContain('**ID:** task-1')
      expect(prompt).toContain('**Title:** Write tests')
      expect(prompt).toContain('**State:** in_dev')
      expect(prompt).toContain('**Blocked By:** task-0')
      expect(prompt).toContain('**Blocking:** task-2')
    })

    it('includes project files context', () => {
      const context: SessionContext = {
        projectRoot: 'C:\\test',
        featureId: 'feat-1',
        featureName: 'Test Feature',
        projectStructure: 'src/main/...',
        claudeMd: 'CLAUDE.md content',
        projectMd: 'PROJECT.md content',
        recentCommits: ['abc123 - Commit 1'],
        attachments: ['file1.txt']
      }

      const prompt = formatContextAsPrompt(context)
      expect(prompt).toContain('## Project Structure')
      expect(prompt).toContain('src/main/')
      expect(prompt).toContain('## CLAUDE.md')
      expect(prompt).toContain('## PROJECT.md')
      expect(prompt).toContain('## Recent Commits')
      expect(prompt).toContain('## Attachments')
    })
  })

  describe('formatCheckpointAsPrompt', () => {
    it('formats checkpoint with all sections', () => {
      const checkpoint: Checkpoint = {
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: ['Task A', 'Task B'],
          inProgress: ['Task C'],
          pending: ['Task D'],
          blockers: ['Blocker 1'],
          decisions: ['Decision 1']
        },
        compactionInfo: {
          messagesCompacted: 50,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: {
          totalCompactions: 3,
          totalMessages: 150,
          totalTokens: 75000
        }
      }

      const prompt = formatCheckpointAsPrompt(checkpoint)
      expect(prompt).toContain('## Session Checkpoint')
      expect(prompt).toContain('### Completed')
      expect(prompt).toContain('- Task A')
      expect(prompt).toContain('- Task B')
      expect(prompt).toContain('### In Progress')
      expect(prompt).toContain('- Task C')
      expect(prompt).toContain('### Pending')
      expect(prompt).toContain('- Task D')
      expect(prompt).toContain('### Blockers')
      expect(prompt).toContain('- Blocker 1')
      expect(prompt).toContain('### Key Decisions')
      expect(prompt).toContain('- Decision 1')
    })

    it('omits empty sections', () => {
      const checkpoint: Checkpoint = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          completed: ['Task A'],
          inProgress: [],
          pending: [],
          blockers: [],
          decisions: []
        },
        compactionInfo: {
          messagesCompacted: 0,
          oldestMessageTimestamp: new Date().toISOString(),
          newestMessageTimestamp: new Date().toISOString(),
          compactedAt: new Date().toISOString()
        },
        stats: { totalCompactions: 0, totalMessages: 0, totalTokens: 0 }
      }

      const prompt = formatCheckpointAsPrompt(checkpoint)
      expect(prompt).toContain('### Completed')
      expect(prompt).not.toContain('### In Progress')
      expect(prompt).not.toContain('### Pending')
      expect(prompt).not.toContain('### Blockers')
      expect(prompt).not.toContain('### Key Decisions')
    })
  })

  describe('formatMessagesAsPrompt', () => {
    it('returns empty string for no messages', () => {
      expect(formatMessagesAsPrompt([])).toBe('')
    })

    it('formats messages with role and content', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant', content: 'Hi there', timestamp: new Date().toISOString() }
      ]

      const prompt = formatMessagesAsPrompt(messages)
      expect(prompt).toContain('## Recent Conversation')
      expect(prompt).toContain('**User**')
      expect(prompt).toContain('Hello')
      expect(prompt).toContain('**Assistant**')
      expect(prompt).toContain('Hi there')
    })
  })
})

describe('SessionManager Compaction Integration', () => {
  const testProjectRoot = 'C:\\test\\project'
  let manager: SessionManager
  let session: Session
  const fileStore: Record<string, string> = {}

  beforeEach(async () => {
    jest.clearAllMocks()
    resetSessionManager()
    uuidCounter = 0
    Object.keys(fileStore).forEach(key => delete fileStore[key])

    jest.mocked(fs.writeFile).mockImplementation(async (filePath, data) => {
      fileStore[filePath as string] = data as string
    })

    jest.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const data = fileStore[filePath as string]
      if (data) return data
      const error = new Error('ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })

    manager = new SessionManager(testProjectRoot)
    session = await manager.getOrCreateSession({
      type: 'feature',
      agentType: 'pm',
      featureId: 'test-feature'
    })
  })

  afterEach(() => {
    resetSessionManager()
  })

  describe('forceCompact', () => {
    it('throws error for non-existent session', async () => {
      await expect(
        manager.forceCompact('non-existent', 'test-feature')
      ).rejects.toThrow('Session not found')
    })
  })

  describe('Request Building', () => {
    it('buildRequest combines all session components', async () => {
      // Set up session components
      await manager.setAgentDescription(session.id, 'test-feature', {
        agentType: 'pm',
        roleInstructions: 'You are a PM agent.',
        toolInstructions: 'Use CreateTask tool.',
        createdAt: new Date().toISOString()
      })

      await manager.updateContext(session.id, 'test-feature', {
        projectRoot: testProjectRoot,
        featureId: 'test-feature',
        featureName: 'Test Feature',
        featureGoal: 'Implement testing'
      })

      await manager.addMessage(session.id, 'test-feature', {
        role: 'user',
        content: 'Create a task for testing'
      })

      const request = await manager.buildRequest(
        session.id,
        'test-feature',
        'What tasks exist?'
      )

      expect(request.systemPrompt).toContain('You are a PM agent.')
      expect(request.systemPrompt).toContain('Use CreateTask tool.')
      expect(request.systemPrompt).toContain('Test Feature')
      expect(request.systemPrompt).toContain('Create a task for testing')
      expect(request.userPrompt).toBe('What tasks exist?')
      expect(request.totalTokens).toBeGreaterThan(0)
    })

    it('buildRequest throws for non-existent session', async () => {
      await expect(
        manager.buildRequest('non-existent', 'test-feature', 'Hello')
      ).rejects.toThrow('Session not found')
    })

    it('buildRequest throws when missing required components', async () => {
      // Session exists but context/agentDescription not set
      await expect(
        manager.buildRequest(session.id, 'test-feature', 'Hello')
      ).rejects.toThrow()
    })
  })

  describe('previewRequest', () => {
    it('returns token breakdown', async () => {
      // Set up session components
      await manager.setAgentDescription(session.id, 'test-feature', {
        agentType: 'pm',
        roleInstructions: 'x'.repeat(400), // ~100 tokens
        createdAt: new Date().toISOString()
      })

      await manager.updateContext(session.id, 'test-feature', {
        projectRoot: testProjectRoot,
        featureId: 'test-feature',
        featureName: 'x'.repeat(40) // ~10 tokens
      })

      const preview = await manager.previewRequest(
        session.id,
        'test-feature',
        'Test prompt'
      )

      expect(preview.breakdown).toMatchObject({
        agentDescTokens: expect.any(Number),
        contextTokens: expect.any(Number),
        checkpointTokens: expect.any(Number),
        messagesTokens: expect.any(Number),
        userPromptTokens: expect.any(Number),
        total: expect.any(Number)
      })
      expect(preview.breakdown.total).toBeGreaterThan(0)
    })

    it('handles empty user prompt', async () => {
      await manager.setAgentDescription(session.id, 'test-feature', {
        agentType: 'pm',
        roleInstructions: 'Test instructions',
        createdAt: new Date().toISOString()
      })

      await manager.updateContext(session.id, 'test-feature', {
        projectRoot: testProjectRoot,
        featureId: 'test-feature',
        featureName: 'Test Feature'
      })

      const preview = await manager.previewRequest(session.id, 'test-feature')
      expect(preview.userPrompt).toBe('')
      expect(preview.breakdown.userPromptTokens).toBe(0)
    })
  })
})
