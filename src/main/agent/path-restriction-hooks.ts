// src/main/agent/path-restriction-hooks.ts
// Hooks that enforce path restrictions on file operations to keep agents within their worktree

import * as path from 'path'

/**
 * Hook callback input for PreToolUse events
 */
interface PreToolUseHookInput {
  hook_event_name: string
  session_id: string
  cwd: string
  tool_name: string
  tool_input: Record<string, unknown>
}

/**
 * Hook callback context
 */
interface HookContext {
  signal?: AbortSignal
}

/**
 * Hook return type for permission decisions
 */
interface HookResult {
  hookSpecificOutput?: {
    hookEventName: string
    permissionDecision: 'allow' | 'deny' | 'ask'
    permissionDecisionReason?: string
    updatedInput?: Record<string, unknown>
  }
  systemMessage?: string
}

/**
 * Converts Unix-style Windows paths (e.g., /d/foo) to Windows-style (e.g., D:\foo)
 * This handles paths from Git Bash/MINGW environments
 */
function convertUnixWindowsPath(p: string): string {
  // Match patterns like /d/... or /c/... (Unix-style Windows drive paths)
  const unixDriveMatch = p.match(/^\/([a-zA-Z])\/(.*)$/)
  if (unixDriveMatch) {
    const driveLetter = unixDriveMatch[1].toUpperCase()
    const restOfPath = unixDriveMatch[2]
    return `${driveLetter}:\\${restOfPath.replace(/\//g, '\\')}`
  }
  return p
}

/**
 * Normalizes a path to use forward slashes and lowercase (for Windows compatibility)
 */
function normalizePath(p: string): string {
  // First convert Unix-style Windows paths (from Git Bash/MINGW)
  const converted = convertUnixWindowsPath(p)
  // Normalize path separators and resolve
  return path.normalize(converted).replace(/\\/g, '/').toLowerCase()
}

/**
 * Checks if a given path is within the allowed base directory
 */
function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const normalizedTarget = normalizePath(path.resolve(basePath, targetPath))
  const normalizedBase = normalizePath(path.resolve(basePath))

  // Check if target path starts with base path
  return normalizedTarget.startsWith(normalizedBase + '/') || normalizedTarget === normalizedBase
}

/**
 * Extracts file path from tool input based on tool type
 */
function getFilePathFromInput(toolName: string, toolInput: Record<string, unknown>): string | null {
  switch (toolName) {
    case 'Write':
    case 'Read':
    case 'Edit':
      return toolInput.file_path as string | null
    case 'Glob':
      return toolInput.path as string | null
    case 'Grep':
      return toolInput.path as string | null
    default:
      return null
  }
}

/**
 * Gets the key name for the file path in tool input
 */
function getFilePathKey(toolName: string): string | null {
  switch (toolName) {
    case 'Write':
    case 'Read':
    case 'Edit':
      return 'file_path'
    case 'Glob':
    case 'Grep':
      return 'path'
    default:
      return null
  }
}

/**
 * Creates a path restriction hook for file operation tools.
 * This hook enforces that all file operations stay within the specified worktree directory.
 * For absolute paths within the worktree, it rewrites them to relative paths.
 * For paths outside the worktree, it blocks the operation.
 *
 * @param worktreePath - The absolute path to the worktree directory that agents are allowed to access
 */
export function createPathRestrictionHook(worktreePath: string) {
  const normalizedWorktree = normalizePath(path.resolve(worktreePath))
  const resolvedWorktree = path.resolve(worktreePath)

  return async (
    input: PreToolUseHookInput,
    _toolUseId: string | null,
    _context: HookContext
  ): Promise<HookResult> => {
    if (input.hook_event_name !== 'PreToolUse') {
      return {}
    }

    const toolName = input.tool_name
    const toolInput = input.tool_input

    // Handle file operation tools
    const filePath = getFilePathFromInput(toolName, toolInput)
    const filePathKey = getFilePathKey(toolName)

    if (filePath && filePathKey) {
      // Convert Unix-style Windows paths first
      const convertedPath = convertUnixWindowsPath(filePath)
      const isAbsolutePath = path.isAbsolute(convertedPath)

      if (isAbsolutePath) {
        // Absolute path - check if within worktree
        const normalizedFilePath = normalizePath(convertedPath)

        if (normalizedFilePath.startsWith(normalizedWorktree + '/') ||
            normalizedFilePath === normalizedWorktree) {
          // Path is within worktree - rewrite to relative path
          const resolvedFilePath = path.resolve(convertedPath)
          const relativePath = path.relative(resolvedWorktree, resolvedFilePath)

          // Ensure the relative path doesn't escape (no leading ..)
          if (!relativePath.startsWith('..')) {
            console.log(`[PathRestriction] REWRITE: Absolute path "${filePath}" → relative "./${relativePath}"`)

            // Return updated input with relative path
            return {
              hookSpecificOutput: {
                hookEventName: input.hook_event_name,
                permissionDecision: 'allow',
                updatedInput: {
                  ...toolInput,
                  [filePathKey]: `./${relativePath.replace(/\\/g, '/')}`
                }
              }
            }
          }
        }

        // Path is outside worktree - block it
        console.log(`[PathRestriction] BLOCKED: Absolute path "${filePath}" is outside worktree "${worktreePath}"`)
        return {
          hookSpecificOutput: {
            hookEventName: input.hook_event_name,
            permissionDecision: 'deny',
            permissionDecisionReason: `File operation blocked: Path "${filePath}" is outside the allowed worktree directory. Use relative paths from the current directory.`
          },
          systemMessage: `IMPORTANT: You must only access files within the current worktree directory. Use relative paths (e.g., "./file.txt" or "src/file.ts") instead of absolute paths.`
        }
      } else {
        // Relative path - resolve against cwd and verify
        const resolvedPath = path.resolve(input.cwd || worktreePath, filePath)
        if (!isPathWithinBase(resolvedPath, worktreePath)) {
          console.log(`[PathRestriction] BLOCKED: Relative path "${filePath}" resolves to "${resolvedPath}" which is outside worktree "${worktreePath}"`)
          return {
            hookSpecificOutput: {
              hookEventName: input.hook_event_name,
              permissionDecision: 'deny',
              permissionDecisionReason: `File operation blocked: Path "${filePath}" would resolve outside the allowed worktree directory.`
            },
            systemMessage: `IMPORTANT: The path "${filePath}" would access files outside your worktree. Stay within your assigned directory.`
          }
        }
      }
    }

    // Allow the operation
    return {}
  }
}

/**
 * Creates a bash command restriction hook.
 * This hook blocks bash commands that try to access files outside the worktree.
 *
 * @param worktreePath - The absolute path to the worktree directory
 */
export function createBashRestrictionHook(worktreePath: string) {
  const normalizedWorktree = normalizePath(path.resolve(worktreePath))

  return async (
    input: PreToolUseHookInput,
    _toolUseId: string | null,
    _context: HookContext
  ): Promise<HookResult> => {
    if (input.hook_event_name !== 'PreToolUse') {
      return {}
    }

    if (input.tool_name !== 'Bash') {
      return {}
    }

    const command = input.tool_input.command as string
    if (!command) {
      return {}
    }

    // Check for absolute paths in the command
    // Extract all potential absolute paths from the command
    const absolutePathRegex = /(?:^|[\s"'=:])([A-Za-z]:\\[^\s"']*|\/(?!dev\/null)[^\s"']*)/g
    let match

    while ((match = absolutePathRegex.exec(command)) !== null) {
      const foundPath = match[1]

      // Skip common safe paths
      if (foundPath === '/dev/null' ||
          foundPath.startsWith('/tmp/') ||
          foundPath === '/dev/stdout' ||
          foundPath === '/dev/stderr') {
        continue
      }

      const normalizedFoundPath = normalizePath(foundPath)

      // Check if this path is outside the worktree
      if (!normalizedFoundPath.startsWith(normalizedWorktree + '/') &&
          normalizedFoundPath !== normalizedWorktree) {
        console.log(`[PathRestriction] BLOCKED Bash: Command contains path "${foundPath}" outside worktree "${worktreePath}"`)
        return {
          hookSpecificOutput: {
            hookEventName: input.hook_event_name,
            permissionDecision: 'deny',
            permissionDecisionReason: `Bash command blocked: Contains path "${foundPath}" which is outside the allowed worktree directory.`
          },
          systemMessage: `IMPORTANT: Your bash command references files outside the worktree. Only use relative paths or paths within "${worktreePath}".`
        }
      }
    }

    // Allow the command
    return {}
  }
}

/**
 * Type definition for hook matcher configuration
 */
export interface HookMatcher {
  matcher?: string
  hooks: Array<(input: PreToolUseHookInput, toolUseId: string | null, context: HookContext) => Promise<HookResult>>
  timeout?: number
}

/**
 * Creates the complete hooks configuration for a dev agent with path restrictions.
 *
 * @param worktreePath - The absolute path to the worktree directory
 * @returns Hooks configuration object to pass to the SDK query options
 */
export function createDevAgentHooks(worktreePath: string): Record<string, HookMatcher[]> {
  const pathRestrictionHook = createPathRestrictionHook(worktreePath)
  const bashRestrictionHook = createBashRestrictionHook(worktreePath)

  return {
    PreToolUse: [
      // File operation tools
      {
        matcher: 'Write|Edit|Read|Glob|Grep',
        hooks: [pathRestrictionHook]
      },
      // Bash commands
      {
        matcher: 'Bash',
        hooks: [bashRestrictionHook]
      }
    ]
  }
}
