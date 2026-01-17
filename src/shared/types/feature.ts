export type FeatureStatus = 'planning' | 'backlog' | 'in_progress' | 'needs_attention' | 'completed' | 'archived';

export interface Feature {
  id: string;
  name: string;
  status: FeatureStatus;
  branchName: string;
  createdAt: string;  // ISO timestamp
  updatedAt: string;  // ISO timestamp
  description?: string;  // Optional multi-line description
  attachments?: string[];  // Optional array of file paths relative to feature directory
  autoMerge?: boolean;  // Optional flag for auto-merge when completed (defaults to false)
}
