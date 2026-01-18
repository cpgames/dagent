/**
 * SessionManager Performance Tests
 *
 * Performance tests validating SessionManager behavior under load:
 * - Large session handling (1000, 10000 messages)
 * - Memory usage monitoring
 * - Performance benchmarks with timing assertions
 *
 * These tests are marked with 'benchmark' in describe blocks so they can be
 * skipped in CI runs while still being available for local benchmarking.
 */

import * as fs from 'fs/promises'
import { SessionManager, resetSessionManager } from '../session-manager'
import type {
  ChatSession,
  Session,
  CreateSessionOptions,
  AgentType,
  SessionType,
  Checkpoint,
  SessionContext,
  AgentDescription
} from '../../../../shared/types/session'

// ============================================
// Mock Setup
// ============================================

// Store for mock file contents
let mockFileStore: Map<string, string> = new Map()

// Mock fs/promises with in-memory store
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockImplementation(async (path: string, content: string) => {
    mockFileStore.set(path, content)
    return undefined
  }),
  readFile: jest.fn().mockImplementation(async (path: string) => {
    if (mockFileStore.has(path)) {
      return mockFileStore.get(path)
    }
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

// Use real uuid for unique message IDs
jest.mock('uuid', () => ({
  v4: jest.fn().mockImplementation(() => {
    return `uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  })
}))

// Mock agent service for compaction
jest.mock('../../agent/agent-service', () => ({
  getAgentService: jest.fn().mockReturnValue({
    streamQuery: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({
          done: false,
          value: {
            type: 'message',
            message: {
              type: 'assistant',
              content: JSON.stringify({
                completed: ['Processed messages'],
                inProgress: [],
                pending: [],
                blockers: [],
                decisions: []
              })
            }
          }
        })
      })
    })
  })
}))

// Mock compaction prompts
jest.mock('../compaction-prompts', () => ({
  buildCompactionPrompt: jest.fn().mockReturnValue('mock compaction prompt'),
  parseCompactionResult: jest.fn().mockReturnValue({
    completed: ['Compacted messages'],
    inProgress: [],
    pending: [],
    blockers: [],
    decisions: []
  })
}))

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a message with realistic content size.
 */
function generateMessage(index: number, role: 'user' | 'assistant' = 'user'): {
  role: 'user' | 'assistant'
  content: string
  metadata?: { tokens?: { input: number; output: number } }
} {
  // Create realistic message content (100-500 chars)
  const baseContent = `Message ${index}: This is a test message with some realistic content. `
  const padding = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(
    Math.floor(Math.random() * 5) + 1
  )

  return {
    role,
    content: baseContent + padding,
    metadata: {
      tokens: {
        input: role === 'user' ? 50 : 0,
        output: role === 'assistant' ? 100 : 0
      }
    }
  }
}

/**
 * Generate N messages alternating between user and assistant.
 */
function generateMessages(count: number): Array<{
  role: 'user' | 'assistant'
  content: string
  metadata?: { tokens?: { input: number; output: number } }
}> {
  const messages: Array<{
    role: 'user' | 'assistant'
    content: string
    metadata?: { tokens?: { input: number; output: number } }
  }> = []

  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    messages.push(generateMessage(i, role))
  }

  return messages
}

/**
 * Measure execution time of an async function.
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now()
  const result = await fn()
  const durationMs = performance.now() - start
  return { result, durationMs }
}

/**
 * Create a session with pre-populated messages for testing.
 */
async function createSessionWithMessages(
  manager: SessionManager,
  featureId: string,
  messageCount: number
): Promise<Session> {
  const options: CreateSessionOptions = {
    type: 'feature' as SessionType,
    agentType: 'pm' as AgentType,
    featureId
  }

  const session = await manager.getOrCreateSession(options)

  // Add messages
  const messages = generateMessages(messageCount)
  for (const msg of messages) {
    await manager.addMessage(session.id, featureId, msg)
  }

  return session
}

// ============================================
// Performance Tests
// ============================================

describe('SessionManager Performance [benchmark]', () => {
  const testProjectRoot = 'C:\\test\\project'
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    // Reset all mocks and stores before each test
    jest.clearAllMocks()
    mockFileStore.clear()
    resetSessionManager()
    // Suppress console.warn during performance tests (expected compaction warnings)
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    resetSessionManager()
    consoleWarnSpy.mockRestore()
  })

  describe('Large Session Handling (1000 messages)', () => {
    it('creates session with 1000 messages in reasonable time', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'large-session-1000'

      const { result: session, durationMs } = await measureTime(async () => {
        return await createSessionWithMessages(manager, featureId, 1000)
      })

      expect(session.stats.totalMessages).toBe(1000)
      // Should complete in under 30 seconds (generous for 1000 messages with I/O)
      expect(durationMs).toBeLessThan(30000)

      console.log(`[Benchmark] 1000 messages creation: ${durationMs.toFixed(2)}ms`)
    })

    it('addMessage remains fast with 1000 existing messages', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'add-msg-perf-1000'

      // Create session with 1000 messages
      const session = await createSessionWithMessages(manager, featureId, 1000)

      // Measure adding one more message
      const { durationMs } = await measureTime(async () => {
        await manager.addMessage(session.id, featureId, generateMessage(1001))
      })

      // Single addMessage should be < 50ms even with large session
      // Note: In real environment should be < 10ms, but mocked I/O adds overhead
      expect(durationMs).toBeLessThan(50)

      console.log(`[Benchmark] addMessage with 1000 existing: ${durationMs.toFixed(2)}ms`)
    })

    it('getRecentMessages is fast with 1000 messages', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'recent-msg-perf-1000'

      // Create session with 1000 messages
      const session = await createSessionWithMessages(manager, featureId, 1000)

      // Measure getting recent messages
      const { result: messages, durationMs } = await measureTime(async () => {
        return await manager.getRecentMessages(session.id, featureId, 50)
      })

      expect(messages.length).toBeLessThanOrEqual(50)
      // getRecentMessages should be < 50ms
      expect(durationMs).toBeLessThan(50)

      console.log(`[Benchmark] getRecentMessages(50) with 1000 messages: ${durationMs.toFixed(2)}ms`)
    })

    it('getAllMessages completes for 1000 messages', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'all-msg-perf-1000'

      // Create session with 1000 messages
      const session = await createSessionWithMessages(manager, featureId, 1000)

      // Measure getting all messages
      const { result: messages, durationMs } = await measureTime(async () => {
        return await manager.getAllMessages(session.id, featureId)
      })

      expect(messages.length).toBe(1000)
      // getAllMessages should complete in reasonable time
      expect(durationMs).toBeLessThan(500)

      console.log(`[Benchmark] getAllMessages with 1000 messages: ${durationMs.toFixed(2)}ms`)
    })
  })

  describe('Large Session Handling (10000 messages)', () => {
    // Use longer timeout for these tests
    jest.setTimeout(60000)

    it('addMessage latency remains acceptable with 10000 messages', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'add-msg-perf-10k'
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId
      }

      const session = await manager.getOrCreateSession(options)

      // Pre-populate with 10000 messages by directly writing to mock store
      const messages: Array<{
        id: string
        timestamp: string
        role: 'user' | 'assistant'
        content: string
      }> = []
      for (let i = 0; i < 10000; i++) {
        messages.push({
          id: `msg-${i}`,
          timestamp: new Date().toISOString(),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}: Test content with some padding.`
        })
      }

      const chatSession: ChatSession = {
        messages,
        totalMessages: 10000,
        oldestMessageTimestamp: messages[0].timestamp,
        newestMessageTimestamp: messages[messages.length - 1].timestamp
      }

      // Write directly to mock store
      const chatPath = `${testProjectRoot}\\.dagent-worktrees\\${featureId}\\.dagent\\sessions\\chat_${session.id}.json`
      mockFileStore.set(chatPath, JSON.stringify(chatSession))

      // Measure adding one more message
      const { durationMs } = await measureTime(async () => {
        await manager.addMessage(session.id, featureId, generateMessage(10001))
      })

      // addMessage should still be < 50ms (roadmap target is < 10ms for real I/O)
      // Note: In mocked environment with 10k message parsing, some overhead expected
      expect(durationMs).toBeLessThan(50)

      console.log(`[Benchmark] addMessage with 10k existing: ${durationMs.toFixed(2)}ms`)
    })

    it('getRecentMessages latency under 50ms with 10000 messages', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'recent-perf-10k'
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId
      }

      const session = await manager.getOrCreateSession(options)

      // Pre-populate with 10000 messages
      const messages: Array<{
        id: string
        timestamp: string
        role: 'user' | 'assistant'
        content: string
      }> = []
      for (let i = 0; i < 10000; i++) {
        messages.push({
          id: `msg-${i}`,
          timestamp: new Date().toISOString(),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}: Test content with realistic size padding here.`
        })
      }

      const chatSession: ChatSession = {
        messages,
        totalMessages: 10000
      }

      const chatPath = `${testProjectRoot}\\.dagent-worktrees\\${featureId}\\.dagent\\sessions\\chat_${session.id}.json`
      mockFileStore.set(chatPath, JSON.stringify(chatSession))

      // Measure getRecentMessages
      const { result, durationMs } = await measureTime(async () => {
        return await manager.getRecentMessages(session.id, featureId, 100)
      })

      expect(result.length).toBeLessThanOrEqual(100)
      // Should complete < 50ms (per roadmap requirement)
      expect(durationMs).toBeLessThan(50)

      console.log(`[Benchmark] getRecentMessages(100) with 10k messages: ${durationMs.toFixed(2)}ms`)
    })

    it('getAllMessages completes under 500ms for 10000 messages', async () => {
      const manager = new SessionManager(testProjectRoot)
      const featureId = 'all-perf-10k'
      const options: CreateSessionOptions = {
        type: 'feature' as SessionType,
        agentType: 'pm' as AgentType,
        featureId
      }

      const session = await manager.getOrCreateSession(options)

      // Pre-populate with 10000 messages
      const messages: Array<{
        id: string
        timestamp: string
        role: 'user' | 'assistant'
        content: string
      }> = []
      for (let i = 0; i < 10000; i++) {
        messages.push({
          id: `msg-${i}`,
          timestamp: new Date().toISOString(),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}: Test content.`
        })
      }

      const chatSession: ChatSession = {
        messages,
        totalMessages: 10000
      }

      const chatPath = `${testProjectRoot}\\.dagent-worktrees\\${featureId}\\.dagent\\sessions\\chat_${session.id}.json`
      mockFileStore.set(chatPath, JSON.stringify(chatSession))

      // Measure getAllMessages
      const { result, durationMs } = await measureTime(async () => {
        return await manager.getAllMessages(session.id, featureId)
      })

      expect(result.length).toBe(10000)
      // Should complete < 500ms for 10k messages (per roadmap requirement)
      expect(durationMs).toBeLessThan(500)

      console.log(`[Benchmark] getAllMessages with 10k messages: ${durationMs.toFixed(2)}ms`)
    })
  })

  describe('Memory Usage Monitoring', () => {
    it('tracks memory before and after large session creation', async () => {
      // Force GC if available
      if (global.gc) {
        global.gc()
      }

      const memoryBefore = process.memoryUsage()

      const manager = new SessionManager(testProjectRoot)
      const sessions: Session[] = []

      // Create 5 sessions with 100 messages each
      for (let i = 0; i < 5; i++) {
        const session = await createSessionWithMessages(manager, `memory-test-${i}`, 100)
        sessions.push(session)
      }

      const memoryAfterCreation = process.memoryUsage()
      const heapUsedDelta = memoryAfterCreation.heapUsed - memoryBefore.heapUsed

      console.log(`[Benchmark] Memory used by 5 sessions (500 messages): ${(heapUsedDelta / 1024 / 1024).toFixed(2)}MB`)

      // Should not use excessive memory (< 50MB for 500 messages)
      expect(heapUsedDelta).toBeLessThan(50 * 1024 * 1024)
    })

    it('memory is released after session cleanup', async () => {
      // This test verifies no significant memory leaks
      if (global.gc) {
        global.gc()
      }

      const memoryBefore = process.memoryUsage()

      // Create and cleanup sessions
      for (let i = 0; i < 3; i++) {
        const manager = new SessionManager(testProjectRoot)
        await createSessionWithMessages(manager, `leak-test-${i}`, 100)
        resetSessionManager()
        mockFileStore.clear()
      }

      if (global.gc) {
        global.gc()
      }

      const memoryAfterCleanup = process.memoryUsage()
      const heapUsedDelta = memoryAfterCleanup.heapUsed - memoryBefore.heapUsed

      console.log(`[Benchmark] Memory delta after cleanup: ${(heapUsedDelta / 1024 / 1024).toFixed(2)}MB`)

      // Memory should not grow significantly after cleanup
      // Allow some tolerance for test infrastructure
      expect(heapUsedDelta).toBeLessThan(20 * 1024 * 1024)
    })
  })
})
