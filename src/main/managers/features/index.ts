// Feature managers are Neon, Cyber, Pulse (one per worktree)
// They are managed by FeatureManagerPool in git/worktree-pool-manager.ts
// This folder is intentionally empty - features don't use status-based managers like tasks do

// Features use folder-based storage:
// - Backlog: .dagent/features/backlog/{featureId}/
// - Archived: .dagent/features/archived/{featureId}/
// - Active: .dagent-worktrees/{neon|cyber|pulse}/.dagent/features/{featureId}/
