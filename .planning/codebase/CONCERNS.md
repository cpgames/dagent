# Codebase Concerns

**Analysis Date:** 2026-01-13

## Current State

This is a **specification-only codebase** - no implementation exists yet. The concerns below are architectural risks and implementation challenges identified from the specification (`DAGENT_SPEC.md`).

---

## Implementation Complexity

**DAG Dependency Resolution:**
- Issue: Topological ordering with dynamic graph changes
- Location: `DAGENT_SPEC.md` section 5
- Why challenging: Graph can change while execution is in progress
- Risk: Incorrect dependency resolution could cause parallel agents to conflict
- Mitigation: Strong test coverage for DAG algorithms

**Agent Coordination:**
- Issue: Harness-agent communication must be reliable and fast
- Location: `DAGENT_SPEC.md` section 7
- Why challenging: Multiple concurrent agents, intention/approval workflow
- Risk: Deadlocks, race conditions, lost messages
- Mitigation: Clear protocol, structured logging, timeout handling

**Git Worktree Management:**
- Issue: Complex lifecycle with feature and task worktrees
- Location: `DAGENT_SPEC.md` section 8
- Why challenging: Worktrees created/deleted dynamically, must handle cleanup
- Risk: Orphaned worktrees, branch conflicts, storage bloat
- Mitigation: Robust cleanup, worktree tracking, error recovery

## Potential Tech Debt

**Reference vs Fresh Implementation:**
- Issue: Spec mentions using Automaker patterns but not its "poorly implemented" git worktree code
- Location: `DAGENT_SPEC.md` section 12.1, 12.2
- Risk: Temptation to copy-paste instead of clean implementation
- Recommendation: Build from scratch with proper architecture

**Graph Versioning:**
- Issue: Undo/redo for graph changes, limited to 20 versions
- Location: `DAGENT_SPEC.md` section 5.5
- Risk: Memory usage for large graphs, version management complexity
- Recommendation: Efficient diff-based storage, not full snapshots

## Security Considerations

**Credential Storage:**
- Risk: API keys stored in plain JSON file (`~/.dagent/credentials.json`)
- Location: `DAGENT_SPEC.md` section 10.3
- Current mitigation: "OS keychain when possible" mentioned but not detailed
- Recommendation: Implement proper keychain integration for all platforms

**Agent Code Execution:**
- Risk: Task agents write code to filesystem
- Location: `DAGENT_SPEC.md` section 6
- Mitigation: Agents work in isolated worktrees, not main branch
- Recommendation: Consider additional sandboxing

**Context Injection:**
- Risk: CLAUDE.md content injected into all agent prompts
- Location: `DAGENT_SPEC.md` section 3.5
- Mitigation: User controls context content
- Recommendation: Validate/sanitize context before injection

## Performance Considerations

**Agent Pool Sizing:**
- Issue: Pool size based on "Claude plan limits"
- Location: `DAGENT_SPEC.md` section 6.1
- Risk: Unclear how to determine optimal size
- Recommendation: Make configurable, provide sensible defaults

**Large DAG Handling:**
- Issue: Graph rendering performance with many nodes
- Location: `DAGENT_SPEC.md` section 3.2
- Risk: UI slowdown with complex features
- Recommendation: Virtual rendering, node clustering for large graphs

**Chat History Growth:**
- Issue: Chat history stored per feature and per node
- Location: `DAGENT_SPEC.md` section 9
- Risk: Unbounded growth, large JSON files
- Recommendation: Implement history limits or pagination

## Missing Specifications

**Error Recovery:**
- Issue: What happens when harness agent crashes?
- Location: Not fully specified
- Risk: Lost execution state, orphaned task agents
- Recommendation: Add harness recovery protocol

**Concurrent Feature Execution:**
- Issue: Can multiple features execute simultaneously?
- Location: Not clearly specified
- Risk: Resource contention, confusing UX
- Recommendation: Clarify single vs multi-feature execution

**Network Failure Handling:**
- Issue: Claude API network errors not detailed
- Location: `DAGENT_SPEC.md` section 7
- Risk: Agent hangs, lost work
- Recommendation: Define retry strategy, timeout handling

**Merge Conflict Escalation:**
- Issue: What if merge agent can't resolve conflict?
- Location: `DAGENT_SPEC.md` section 7.5
- Risk: Blocked execution, requires manual intervention
- Recommendation: Define escalation path to user

## Test Coverage Gaps

**E2E Testing Strategy:**
- Issue: Electron + AI agents makes E2E testing complex
- Location: Not specified
- Risk: Integration bugs missed
- Recommendation: Define E2E approach early (Playwright + mocked agents?)

**Agent Behavior Testing:**
- Issue: AI agents have non-deterministic output
- Location: Not specified
- Risk: Flaky tests, untested edge cases
- Recommendation: Mock AI responses for unit tests, limited E2E with real AI

## Dependencies at Risk

**React Flow:**
- Risk: DAG visualization dependency, may not meet all needs
- Location: `DAGENT_SPEC.md` section 12.3
- Alternative: Custom canvas implementation
- Recommendation: Evaluate thoroughly before committing

**simple-git:**
- Risk: Node.js git wrapper may have edge case bugs
- Location: `DAGENT_SPEC.md` section 12.3
- Mitigation: Extensive git integration testing
- Alternative: Direct git CLI calls via child_process

## Architecture Decisions Needed

**State Synchronization:**
- Decision: How to sync Zustand state with JSON files?
- Options: Write-through, periodic save, on-demand
- Risk: Data loss, stale state
- Recommendation: Decide and document before implementation

**IPC Protocol:**
- Decision: Structured protocol for main ↔ renderer
- Options: Type-safe channels, generic events
- Risk: Runtime errors from mismatched types
- Recommendation: Use typed IPC with shared types

---

*Concerns audit: 2026-01-13*
*Note: These are pre-implementation concerns based on specification analysis*
