export type FeatureStatus = 'not_started' | 'in_progress' | 'needs_attention' | 'completed';

export interface Feature {
  id: string;
  name: string;
  status: FeatureStatus;
  branchName: string;
  createdAt: string;  // ISO timestamp
  updatedAt: string;  // ISO timestamp
}
