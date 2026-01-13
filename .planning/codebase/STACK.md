# Technology Stack

**Analysis Date:** 2026-01-13

## Languages

**Primary:**
- TypeScript - All application code (specified in `DAGENT_SPEC.md` section 2.1)

**Secondary:**
- JavaScript - Electron main process, build scripts

## Runtime

**Environment:**
- Node.js - Electron main process and backend
- Chromium - Electron renderer process (React UI)

**Package Manager:**
- Not yet established (specification-only codebase)
- Recommended: npm or pnpm based on spec patterns

## Frameworks

**Core:**
- Electron - Desktop application shell (`DAGENT_SPEC.md` section 2.1)
- React - UI framework (`DAGENT_SPEC.md` section 2.1)

**State Management:**
- Zustand - State management (`DAGENT_SPEC.md` section 12.3)

**Graph Rendering:**
- React Flow (or custom canvas) - DAG visualization (`DAGENT_SPEC.md` section 12.3)

**Testing:**
- Not yet established

**Build/Dev:**
- Not yet established (typical Electron projects use Vite or webpack)

## Key Dependencies

**Critical (from specification):**
- React Flow - DAG graph visualization (`DAGENT_SPEC.md` section 12.3)
- dnd-kit - Drag and drop functionality (`DAGENT_SPEC.md` section 12.3)
- simple-git - Git operations from Node.js (`DAGENT_SPEC.md` section 12.3)
- Zustand - State management (`DAGENT_SPEC.md` section 12.3)

**Infrastructure:**
- Electron IPC - Main/renderer communication (`DAGENT_SPEC.md` section 12.3)
- Node.js child_process - Agent process management (`DAGENT_SPEC.md` section 12.3)

**UI:**
- Tailwind CSS - Styling (`DAGENT_SPEC.md` section 12.3)

## Configuration

**Environment:**
- Not yet established
- Planned: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` env vars (`DAGENT_SPEC.md` section 10.1)

**Build:**
- Not yet established

## Platform Requirements

**Development:**
- Windows, macOS, Linux (any platform with Node.js)
- Git required for worktree operations

**Production:**
- Standalone Electron desktop application (`DAGENT_SPEC.md` section 2.1)
- Cross-platform: Windows, macOS, Linux

---

*Stack analysis: 2026-01-13*
*Note: This is a specification-only codebase - no implementation exists yet*
