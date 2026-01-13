# Testing Patterns

**Analysis Date:** 2026-01-13

## Test Framework

**Runner:**
- Not yet established
- Recommended: Vitest (fast, TypeScript-native, works with React)

**Assertion Library:**
- Not yet established
- Recommended: Vitest built-in expect

**Run Commands (planned):**
```bash
npm test                              # Run all tests
npm test -- --watch                   # Watch mode
npm test -- path/to/file.test.ts     # Single file
npm run test:coverage                 # Coverage report
```

## Test File Organization

**Location (recommended):**
- *.test.ts alongside source files for unit tests
- tests/integration/ for integration tests
- tests/e2e/ for end-to-end tests

**Naming:**
- module-name.test.ts for unit tests
- feature-name.integration.test.ts for integration
- user-flow.e2e.test.ts for E2E

**Structure (planned):**
```
src/
  main/
    agents/
      harness.ts
      harness.test.ts
    git/
      manager.ts
      manager.test.ts
  renderer/
    components/
      DAG/
        Node.tsx
        Node.test.tsx
tests/
  integration/
    agent-communication.test.ts
    git-worktree.test.ts
  e2e/
    feature-creation.test.ts
```

## Test Structure

**Suite Organization (recommended):**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('HarnessAgent', () => {
  describe('processIntention', () => {
    beforeEach(() => {
      // reset state
    });

    it('should approve valid intention', () => {
      // arrange
      const intention = createTestIntention();

      // act
      const result = processIntention(intention);

      // assert
      expect(result.type).toBe('APPROVED');
    });

    it('should reject intention with missing context', () => {
      expect(() => processIntention(null)).toThrow();
    });
  });
});
```

**Patterns:**
- Use beforeEach for per-test setup
- Use afterEach to restore mocks
- Arrange/Act/Assert pattern
- One focus per test

## Mocking

**Framework (recommended):**
- Vitest built-in mocking (vi)
- Module mocking for external dependencies

**What to Mock:**
- Claude API calls
- Git operations (simple-git)
- File system operations
- Child process spawning
- Electron IPC

**What NOT to Mock:**
- Pure business logic functions
- Data transformations
- State management stores

**Patterns (example):**
```typescript
import { vi } from 'vitest';

// Mock Claude API
vi.mock('@anthropic/sdk', () => ({
  Claude: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({ content: 'mocked response' })
    }
  }))
}));

// Mock simple-git
vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({
    checkout: vi.fn(),
    merge: vi.fn(),
    worktree: vi.fn()
  })
}));
```

## Fixtures and Factories

**Test Data (recommended):**
```typescript
// Factory pattern
function createTestFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'test-feature',
    name: 'Test Feature',
    status: 'not_started',
    branchName: 'feature/test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: '1234',
    title: 'Test Task',
    description: 'Test description',
    status: 'ready',
    locked: false,
    position: { x: 100, y: 100 },
    ...overrides
  };
}

function createTestDAG(): DAGGraph {
  return {
    nodes: [createTestTask()],
    connections: []
  };
}
```

**Location:**
- Factory functions: tests/factories/
- Fixtures: tests/fixtures/

## Coverage

**Requirements:**
- Not yet established
- Recommended: Focus on critical paths (agent logic, DAG operations)

**Priority Areas:**
- Harness agent decision logic
- DAG dependency resolution
- Git worktree operations
- Task state transitions
- Merge conflict handling

## Test Types

**Unit Tests:**
- Scope: Single function/class in isolation
- Mocking: Mock all external dependencies
- Examples: DAG algorithms, state transitions, validation

**Integration Tests:**
- Scope: Multiple modules together
- Mocking: Mock external boundaries only
- Examples: Agent-harness communication, git operations

**E2E Tests (planned):**
- Framework: Playwright or Spectron for Electron
- Scope: Full user flows
- Examples: Create feature, execute DAG, archive feature

## Key Test Scenarios

**Agent Communication:**
- Intention approval flow
- Intention rejection handling
- Intention modification
- Multiple concurrent tasks

**DAG Operations:**
- Task dependency resolution
- Topological ordering
- Ready task identification
- Status transitions

**Git Operations:**
- Worktree creation/deletion
- Branch merging
- Conflict detection
- Archive process

**UI Interactions:**
- Node creation/editing
- Connection drawing
- Lock toggling
- Undo/redo

---

*Testing analysis: 2026-01-13*
*Note: This is a specification-only codebase - testing patterns are planned, not implemented*
