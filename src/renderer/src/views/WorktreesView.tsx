import { useState, useEffect, useCallback } from 'react';
import { useFeatureStore } from '../stores/feature-store';
import { useViewStore } from '../stores/view-store';
import type { Feature } from '@shared/types';
import type { FeatureManagerInfo, FeatureManagerPoolStatus, MergeQueueEntry } from '@shared/types/pool';
import type { TokenStatus } from '../../../preload/index.d';
import { getFeatureManagerName } from '@shared/types/pool';
import './WorktreesView.css';

/**
 * Token status card showing worktree token ownership.
 */
interface TokenStatusCardProps {
  tokens: TokenStatus[];
}

function TokenStatusCard({ tokens }: TokenStatusCardProps) {
  return (
    <div className="token-status">
      <h3 className="token-status__title">Token Status</h3>
      <div className="token-status__grid">
        {tokens.map((token) => (
          <div
            key={token.worktreeId}
            className={`token-status__item ${token.available ? 'token-status__item--available' : 'token-status__item--held'}`}
          >
            <div className="token-status__header">
              <span className="token-status__id">Worktree {token.worktreeId}</span>
              <span className={`token-status__indicator ${token.available ? '' : 'token-status__indicator--active'}`} />
            </div>
            <div className="token-status__details">
              <span className="token-status__holder">
                {token.available ? 'Available' : token.holder || 'Unknown'}
              </span>
              {token.pendingCount > 0 && (
                <span className="token-status__pending">
                  {token.pendingCount} waiting
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Manager card component displaying a single feature manager with its features.
 */
interface ManagerCardProps {
  manager: FeatureManagerInfo;
  features: Feature[];
  onSelectFeature: (featureId: string) => void;
}

function ManagerCard({ manager, features, onSelectFeature }: ManagerCardProps) {
  const displayName = getFeatureManagerName(manager.featureManagerId);

  // Get status color based on manager status
  const getStatusColor = () => {
    switch (manager.status) {
      case 'busy':
        return 'var(--accent-primary)';
      case 'merging':
        return 'var(--color-success)';
      case 'initializing':
        return 'var(--accent-secondary)';
      default:
        return 'var(--text-muted)';
    }
  };

  // Get status label
  const getStatusLabel = () => {
    switch (manager.status) {
      case 'idle':
        return 'Idle';
      case 'busy':
        return 'Working';
      case 'merging':
        return 'Merging';
      case 'initializing':
        return 'Starting';
      default:
        return manager.status;
    }
  };

  // Get feature status badge color
  const getFeatureStatusColor = (status: string) => {
    switch (status) {
      case 'investigating':
      case 'ready_for_planning':
        return 'var(--accent-primary)';
      case 'planning':
        return 'var(--accent-secondary)';
      case 'ready':
      case 'developing':
        return 'var(--color-success)';
      case 'needs_merging':
      case 'merging':
        return 'var(--color-warning)';
      case 'creating_worktree':
        return 'var(--accent-secondary)';
      default:
        return 'var(--text-muted)';
    }
  };

  return (
    <div className="pool-card">
      {/* Manager Header */}
      <div className="pool-card__header">
        <div className="pool-card__title-row">
          <h3 className="pool-card__name">{displayName}</h3>
          <span
            className="pool-card__status"
            style={{ color: getStatusColor() }}
          >
            <span
              className={`pool-card__status-dot ${manager.status === 'busy' || manager.status === 'merging' ? 'pool-card__status-dot--pulse' : ''}`}
              style={{ backgroundColor: getStatusColor() }}
            />
            {getStatusLabel()}
          </span>
        </div>
        <p className="pool-card__branch">{manager.branchName}</p>
      </div>

      {/* Features List */}
      <div className="pool-card__features">
        {features.length === 0 ? (
          <div className="pool-card__empty">
            <span className="pool-card__empty-icon">-</span>
            <span className="pool-card__empty-text">No features assigned</span>
          </div>
        ) : (
          features.map((feature, index) => (
            <button
              key={feature.id}
              className="pool-card__feature"
              onClick={() => onSelectFeature(feature.id)}
            >
              <div className="pool-card__feature-header">
                <span className="pool-card__feature-position">
                  {index === 0 ? 'Active' : `Queue #${index}`}
                </span>
                <span
                  className="pool-card__feature-status"
                  style={{ color: getFeatureStatusColor(feature.status) }}
                >
                  {feature.status.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="pool-card__feature-name">{feature.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Manager Stats */}
      <div className="pool-card__stats">
        <span className="pool-card__stat">
          <span className="pool-card__stat-value">{features.length}</span>
          <span className="pool-card__stat-label">features</span>
        </span>
        <span className="pool-card__stat">
          <span className="pool-card__stat-value">{manager.queueLength}</span>
          <span className="pool-card__stat-label">queued</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Merge queue section showing pending merges.
 */
interface MergeQueueSectionProps {
  mergeQueue: MergeQueueEntry[];
  features: Feature[];
}

function MergeQueueSection({ mergeQueue, features }: MergeQueueSectionProps) {
  if (mergeQueue.length === 0) {
    return null;
  }

  return (
    <div className="merge-queue">
      <h3 className="merge-queue__title">Merge Queue</h3>
      <div className="merge-queue__list">
        {mergeQueue.map((entry, index) => {
          const feature = features.find(f => f.id === entry.featureId);
          return (
            <div key={entry.featureId} className="merge-queue__item">
              <span className="merge-queue__position">#{index + 1}</span>
              <span className="merge-queue__feature">{feature?.name || entry.featureId}</span>
              <span className={`merge-queue__status merge-queue__status--${entry.status}`}>
                {entry.status}
              </span>
              <span className="merge-queue__target">{entry.targetBranch}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PoolManagerView - Displays all pool worktrees with their assigned features.
 * Shows pool status, feature queues, and merge queue in a visual layout.
 */
export default function WorktreesView() {
  const { features, setActiveFeature } = useFeatureStore();
  const setView = useViewStore((state) => state.setView);

  const [poolStatus, setPoolStatus] = useState<FeatureManagerPoolStatus | null>(null);
  const [mergeQueue, setMergeQueue] = useState<MergeQueueEntry[]>([]);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch pool status and token status
  const fetchPoolStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.pool.getStatus();
      setPoolStatus(status);

      const queue = await window.electronAPI.pool.getMergeQueue();
      setMergeQueue(queue);

      // Fetch token status
      if (window.electronAPI.managers?.getTokenStatus) {
        const tokens = await window.electronAPI.managers.getTokenStatus();
        setTokenStatus(tokens);
      }
    } catch (error) {
      console.error('Failed to fetch pool status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchPoolStatus();

    // Poll every 2 seconds for updates
    const interval = setInterval(fetchPoolStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchPoolStatus]);

  // Subscribe to pool events
  useEffect(() => {
    const unsubscribers = [
      window.electronAPI.pool.onStatusChanged(() => fetchPoolStatus()),
      window.electronAPI.pool.onFeatureQueued(() => fetchPoolStatus()),
      window.electronAPI.pool.onFeatureStarted(() => fetchPoolStatus()),
      window.electronAPI.pool.onFeatureCompleted(() => fetchPoolStatus()),
      window.electronAPI.pool.onMergeStarted(() => fetchPoolStatus()),
      window.electronAPI.pool.onMergeCompleted(() => fetchPoolStatus()),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [fetchPoolStatus]);

  // Handle feature selection - navigate to DAG view
  const handleSelectFeature = (featureId: string) => {
    setActiveFeature(featureId);
    setView('dag');
  };

  // Get features assigned to a specific manager
  const getFeaturesForManager = (featureManagerId: number): Feature[] => {
    return features.filter(f => f.featureManagerId === featureManagerId);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="pool-manager-view">
        <div className="pool-manager-view__loading">
          <p>Loading pool status...</p>
        </div>
      </div>
    );
  }

  // Not initialized state
  if (!poolStatus || !poolStatus.initialized) {
    return (
      <div className="pool-manager-view">
        <div className="pool-manager-view__empty">
          <div className="pool-manager-view__empty-icon">-</div>
          <h3 className="pool-manager-view__empty-title">No Worktrees</h3>
          <p className="pool-manager-view__empty-text">
            Start a feature to create pool worktrees.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pool-manager-view">
      {/* Header Stats */}
      <div className="pool-manager-view__header">
        <div className="pool-manager-view__stats">
          <div className="pool-manager-view__stat">
            <span className="pool-manager-view__stat-value">{poolStatus.activeManagerCount}</span>
            <span className="pool-manager-view__stat-label">/ {poolStatus.maxManagers} Managers Active</span>
          </div>
          <div className="pool-manager-view__stat">
            <span className="pool-manager-view__stat-value">{poolStatus.totalQueuedFeatures}</span>
            <span className="pool-manager-view__stat-label">Features Queued</span>
          </div>
          <div className="pool-manager-view__stat">
            <span className="pool-manager-view__stat-value">{poolStatus.mergeQueueLength}</span>
            <span className="pool-manager-view__stat-label">Pending Merges</span>
          </div>
        </div>
      </div>

      {/* Manager Cards Grid */}
      <div className="pool-manager-view__grid">
        {poolStatus.managers.length === 0 ? (
          // Show placeholder cards for max managers when none exist yet
          Array.from({ length: poolStatus.maxManagers }, (_, i) => (
            <div key={i + 1} className="pool-card pool-card--placeholder">
              <div className="pool-card__header">
                <div className="pool-card__title-row">
                  <h3 className="pool-card__name">{getFeatureManagerName(i + 1)}</h3>
                  <span className="pool-card__status" style={{ color: 'var(--text-muted)' }}>
                    <span className="pool-card__status-dot" style={{ backgroundColor: 'var(--text-muted)' }} />
                    Not Created
                  </span>
                </div>
                <p className="pool-card__branch">manager-worktree-{i + 1}</p>
              </div>
              <div className="pool-card__features">
                <div className="pool-card__empty">
                  <span className="pool-card__empty-icon">-</span>
                  <span className="pool-card__empty-text">Will be created on demand</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          poolStatus.managers.map((manager) => (
            <ManagerCard
              key={manager.featureManagerId}
              manager={manager}
              features={getFeaturesForManager(manager.featureManagerId)}
              onSelectFeature={handleSelectFeature}
            />
          ))
        )}
      </div>

      {/* Merge Queue Section */}
      <MergeQueueSection mergeQueue={mergeQueue} features={features} />

      {/* Token Status Section (Debug) */}
      {tokenStatus.length > 0 && (
        <TokenStatusCard tokens={tokenStatus} />
      )}
    </div>
  );
}
