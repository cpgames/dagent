/**
 * PM Spec Handlers - IPC and direct function exports for spec management.
 * Enables PM agent to create and manage feature specifications.
 * Follows same pattern as pm-tools-handlers.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getFeatureSpecStore } from '../agents/feature-spec-store'
import { getCurrentProjectPath } from './project-handlers'
import type {
  CreateSpecInput,
  CreateSpecResult,
  UpdateSpecInput,
  UpdateSpecResult,
  GetSpecInput,
  GetSpecResult
} from '../agents/feature-spec-types'

/**
 * Register PM Spec IPC handlers for spec management.
 */
export function registerPMSpecHandlers(): void {
  // Create a new feature specification
  ipcMain.handle(
    'pm-spec:createSpec',
    async (_event, input: CreateSpecInput): Promise<CreateSpecResult> => {
      return pmCreateSpec(input)
    }
  )

  // Update an existing feature specification
  ipcMain.handle(
    'pm-spec:updateSpec',
    async (_event, input: UpdateSpecInput): Promise<UpdateSpecResult> => {
      return pmUpdateSpec(input)
    }
  )

  // Get a feature specification
  ipcMain.handle(
    'pm-spec:getSpec',
    async (_event, input: GetSpecInput): Promise<GetSpecResult> => {
      return pmGetSpec(input)
    }
  )
}

/**
 * Direct function exports for MCP server (bypasses IPC).
 * These allow the PM MCP server to call the same logic without going through IPC.
 */

/**
 * Create a new feature specification.
 */
export async function pmCreateSpec(input: CreateSpecInput): Promise<CreateSpecResult> {
  const projectRoot = getCurrentProjectPath()
  if (!projectRoot) {
    return { success: false, error: 'No project selected' }
  }

  try {
    const store = getFeatureSpecStore(projectRoot)

    // Create the spec
    await store.createSpec(input.featureId, input.featureName)

    // Add initial items if provided
    if (input.initialGoals) {
      for (const goal of input.initialGoals) {
        await store.addGoal(input.featureId, goal)
      }
    }

    if (input.initialRequirements) {
      for (const req of input.initialRequirements) {
        await store.addRequirement(input.featureId, req)
      }
    }

    if (input.initialConstraints) {
      for (const constraint of input.initialConstraints) {
        await store.addConstraint(input.featureId, constraint)
      }
    }

    if (input.initialAcceptanceCriteria) {
      for (const ac of input.initialAcceptanceCriteria) {
        await store.addAcceptanceCriterion(input.featureId, ac)
      }
    }

    // Add history entry
    await store.addHistoryEntry(input.featureId, `Initial spec from user: ${input.featureName}`)

    // Broadcast spec update to all windows
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('spec:updated', { featureId: input.featureId })
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Update an existing feature specification.
 * Uses "set" semantics - provided arrays replace existing content entirely.
 */
export async function pmUpdateSpec(input: UpdateSpecInput): Promise<UpdateSpecResult> {
  const projectRoot = getCurrentProjectPath()
  if (!projectRoot) {
    return { success: false, error: 'No project selected' }
  }

  try {
    const store = getFeatureSpecStore(projectRoot)

    // Check if spec exists
    const existingSpec = await store.loadSpec(input.featureId)
    if (!existingSpec) {
      return { success: false, error: `Spec not found for feature ${input.featureId}` }
    }

    // Update spec with "set" semantics
    await store.updateSpec(input.featureId, {
      goals: input.goals,
      requirements: input.requirements,
      constraints: input.constraints,
      acceptanceCriteria: input.acceptanceCriteria,
      historyNote: input.historyNote
    })

    // Broadcast spec update to all windows
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('spec:updated', { featureId: input.featureId })
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get a feature specification.
 */
export async function pmGetSpec(input: GetSpecInput): Promise<GetSpecResult> {
  const projectRoot = getCurrentProjectPath()
  if (!projectRoot) {
    return { spec: null, error: 'No project selected' }
  }

  try {
    const store = getFeatureSpecStore(projectRoot)
    const spec = await store.loadSpec(input.featureId)
    return { spec }
  } catch (error) {
    return { spec: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
