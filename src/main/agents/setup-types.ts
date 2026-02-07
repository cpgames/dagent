/**
 * Setup Agent Types
 * TypeScript types for project investigation and CLAUDE.md generation.
 */

/**
 * Detected tech stack information.
 */
export interface TechStackInfo {
  languages: string[]
  frameworks: string[]
  buildTools: string[]
  configFiles: string[]
}

/**
 * Project structure information.
 */
export interface ProjectStructureInfo {
  srcDirs: string[]
  hasTests: boolean
  hasDocs: boolean
  fileCount: number
}

/**
 * Result of project inspection.
 */
export interface ProjectInspection {
  type: 'empty' | 'brownfield'
  hasClaudeMd: boolean
  techStack?: TechStackInfo
  structure?: ProjectStructureInfo
}

/**
 * Setup Agent status lifecycle.
 */
export type SetupAgentStatus =
  | 'idle'
  | 'inspecting'
  | 'conversing'
  | 'generating'
  | 'completed'
  | 'error'

/**
 * Setup Agent state.
 */
export interface SetupAgentState {
  status: SetupAgentStatus
  projectRoot: string
  inspection: ProjectInspection | null
  claudeMdDraft: string | null
  error: string | null
  sessionId: string | null
}

/**
 * Default state for Setup Agent.
 */
export const DEFAULT_SETUP_AGENT_STATE: Omit<SetupAgentState, 'projectRoot' | 'sessionId'> = {
  status: 'idle',
  inspection: null,
  claudeMdDraft: null,
  error: null
}
