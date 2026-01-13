# External Integrations

**Analysis Date:** 2026-01-13

## APIs & External Services

**AI Agent Communication:**
- Claude API - Powers all AI agents (harness, task, merge)
  - SDK/Client: @anthropic-ai/sdk (planned)
  - Auth: API key or OAuth token
  - Usage: Agent spawning, intention processing, code generation
  - Per `DAGENT_SPEC.md` sections 6, 7, 10

**No Other External APIs:**
- Application is standalone desktop tool
- No cloud services, databases, or SaaS integrations
- All data stored locally

## Data Storage

**Databases:**
- None - All data stored as JSON files

**File Storage:**
- Local filesystem only
- Feature data: `.dagent-worktrees/{feature}/.dagent/`
- Archived data: `.dagent-archived/{feature}/`
- Credentials: `~/.dagent/credentials.json`
- Per `DAGENT_SPEC.md` section 9

**Caching:**
- None - Stateless execution model

## Authentication & Identity

**Auth Provider:**
- Claude Code / Anthropic API
  - Per `DAGENT_SPEC.md` section 10

**Priority Order:**
1. Claude CLI auto-detect: `~/.config/claude/` or equivalent
2. OAuth Token (env): `CLAUDE_CODE_OAUTH_TOKEN`
3. OAuth Token (stored): `~/.dagent/credentials.json`
4. API Key (stored): `~/.dagent/credentials.json`
5. API Key (env): `ANTHROPIC_API_KEY`
6. Manual entry: UI prompt

**Credential Storage:**
```json
// ~/.dagent/credentials.json
{
  "type": "oauth",
  "token": "oauth_xxxxx",
  "storedAt": "2024-01-15T10:30:00Z"
}
// or
{
  "type": "api_key",
  "key": "sk-ant-xxxxx",
  "storedAt": "2024-01-15T10:30:00Z"
}
```

## Git Integration

**Git Operations:**
- simple-git npm package - Git operations from Node.js
  - Per `DAGENT_SPEC.md` section 12.3

**Branch Structure:**
```
main
 └── feature/{name}                    (feature branch)
         ├── feature/{name}/task-{id}  (task branch)
         └── ...
```

**Worktree Management:**
- Feature worktree: Created on feature start, persists until archive
- Task worktree: Created on task start, deleted after merge
- Location: `.dagent-worktrees/`
- Per `DAGENT_SPEC.md` section 8

## Monitoring & Observability

**Error Tracking:**
- None (local application)
- Errors logged to `.dagent/` JSON files

**Analytics:**
- None

**Logs:**
- Structured JSON logging
- Harness log: `.dagent/harness_log.json`
- Task logs: `.dagent/nodes/{id}/logs.json`
- Per `DAGENT_SPEC.md` section 4.6

## CI/CD & Deployment

**Hosting:**
- Standalone Electron desktop application
- No server deployment

**Distribution (planned):**
- Platform-specific installers (Windows, macOS, Linux)
- Built with Electron Builder or similar

**CI Pipeline:**
- Not yet established
- Recommended: GitHub Actions for testing and builds

## Environment Configuration

**Development:**
- Required: Node.js, Git
- Optional: `ANTHROPIC_API_KEY` or Claude CLI credentials
- Local `.dagent-worktrees/` for testing

**Production:**
- Standalone application
- Credentials: `~/.dagent/credentials.json` or env vars
- Data: User's project directories

## IPC Communication

**Electron IPC:**
- Main ↔ Renderer communication
- Per `DAGENT_SPEC.md` section 2.2

**Channels (planned):**
- `feature:create` - Create new feature
- `feature:execute` - Start DAG execution
- `feature:stop` - Stop execution
- `dag:update` - Update DAG state
- `agent:log` - Agent log entry

## Context Management

**CLAUDE.md:**
- Project context for agents
- Managed via Context View
- Injected into all agent prompts
- Per `DAGENT_SPEC.md` section 3.5

---

*Integration audit: 2026-01-13*
*Note: This is a specification-only codebase - integrations are planned, not implemented*
