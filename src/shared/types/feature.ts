export type FeatureStatus = 'planning' | 'backlog' | 'in_progress' | 'needs_attention' | 'completed' | 'archived';

export interface Feature {
  id: string;
  name: string;
  status: FeatureStatus;
  branchName: string;
  createdAt: string;  // ISO timestamp
  updatedAt: string;  // ISO timestamp
}
