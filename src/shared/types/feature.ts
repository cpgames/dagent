/**
 * Feature status in the workflow pipeline.
 *
 * Flow: not_started -> creating_worktree -> investigating -> ready_for_planning -> planning -> ready -> developing -> verifying -> needs_merging -> merging -> archived
 *
 * - not_started: Feature created but not yet started (BacklogManager)
 * - creating_worktree: Setting up worktree for feature (SetupManager)
 * - investigating: PM agent exploring codebase, asking questions (InvestigationManager)
 * - ready_for_planning: PM has enough info, user can trigger planning (ReadyForPlanningManager)
 * - planning: PM agent creating tasks from spec (PlanningManager)
 * - ready: Tasks ready for execution, user can start dev (ReadyForDevelopmentManager)
 * - developing: Dev agents working on tasks (DevelopmentManager)
 * - verifying: QA agents verifying tasks (VerificationManager)
 * - needs_merging: All tasks complete, waiting in merge queue (MergeManager)
 * - merging: Bidirectional merge in progress (MergeManager)
 * - archived: Feature merged and archived (ArchiveManager)
 *
 * Note: Queue position is tracked via feature.queuePosition property, not status.
 * User input during investigation uses internal pools, not a separate status.
 */
export type FeatureStatus =
  | 'not_started'
  | 'creating_worktree'
  | 'investigating'
  | 'ready_for_planning'
  | 'planning'
  | 'ready'
  | 'developing'
  | 'verifying'
  | 'needs_merging'
  | 'merging'
  | 'archived';

/** Action to take when feature is completed */
export type CompletionAction = 'manual' | 'auto_pr' | 'auto_merge';

export interface Feature {
  id: string;
  name: string;
  status: FeatureStatus;
  branchName: string;
  createdAt: string;  // ISO timestamp
  updatedAt: string;  // ISO timestamp
  description?: string;  // Optional multi-line description
  attachments?: string[];  // Optional array of file paths relative to feature directory
  completionAction?: CompletionAction;  // Action when feature completes (defaults to 'manual')
  autoStart?: boolean;  // Auto-start execution when planning completes (defaults to false)

  // Feature manager fields
  /** Target branch to merge back to (captured when feature started) */
  targetBranch?: string;
  /** Feature manager ID assigned to this feature (1-3) */
  featureManagerId?: number;
  /** Position in manager queue (0 = active, 1+ = waiting) */
  queuePosition?: number;
  /** Full path to the manager worktree where feature data is stored */
  managerWorktreePath?: string;

  /** @deprecated Use completionAction instead */
  autoMerge?: boolean;  // Legacy field for backwards compatibility
}
