export type FeatureStatus = 'not_started' | 'creating_worktree' | 'investigating' | 'questioning' | 'planning' | 'ready' | 'in_progress' | 'completed' | 'archived';

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
  /** @deprecated Use completionAction instead */
  autoMerge?: boolean;  // Legacy field for backwards compatibility
}
