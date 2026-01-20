import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFeatureStore } from '../stores/feature-store';
import { useViewStore } from '../stores/view-store';
import { useExecutionStore } from '../stores/execution-store';
import { KanbanColumn, type MergeType } from '../components/Kanban';
import { DeleteFeatureDialog, FeatureMergeDialog } from '../components/Feature';
import type { Feature, FeatureStatus } from '@shared/types';

/**
 * Analysis status for a feature.
 */
interface AnalysisStatus {
  analyzing: boolean;
  pendingCount: number;
}

/**
 * Column configuration for the Kanban board.
 * 4-column layout mapping 9 states:
 * - Backlog: not_started (feature exists but no worktree)
 * - In Progress: creating_worktree, investigating, questioning, planning, ready, in_progress
 * - Completed: completed
 * - Archived: archived
 */
const columns: { title: string; statuses: FeatureStatus[] }[] = [
  { title: 'Backlog', statuses: ['not_started'] },
  { title: 'In Progress', statuses: ['creating_worktree', 'investigating', 'questioning', 'planning', 'ready', 'in_progress'] },
  { title: 'Completed', statuses: ['completed'] },
  { title: 'Archived', statuses: ['archived'] },
];

/**
 * KanbanView - Displays features as cards in status columns.
 * Shows the workflow state of all features with navigation to DAG view.
 */
export default function KanbanView() {
  const { features, isLoading, setActiveFeature, deleteFeature } = useFeatureStore();
  const setView = useViewStore((state) => state.setView);
  const { start: startExecution, stop: stopExecution } = useExecutionStore();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);

  // Start execution state
  const [startingFeatureId, setStartingFeatureId] = useState<string | null>(null);

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [featureToMerge, setFeatureToMerge] = useState<Feature | null>(null);
  const [mergeType, setMergeType] = useState<MergeType | null>(null);

  // Analysis status per feature
  const [analysisStatus, setAnalysisStatus] = useState<Record<string, AnalysisStatus>>({});

  // Worktree creation progress per feature
  const [worktreeProgress, setWorktreeProgress] = useState<Record<string, string>>({});

  // Fetch initial pending counts for features in planning status only
  // Features in backlog or later stages cannot have needs_analysis tasks
  useEffect(() => {
    const fetchPendingCounts = async () => {
      const statuses: Record<string, AnalysisStatus> = {};
      for (const feature of features) {
        // Only check pending analysis for features in planning status
        if (feature.status === 'planning') {
          try {
            const result = await window.electronAPI.analysis.pending(feature.id);
            statuses[feature.id] = { analyzing: false, pendingCount: result.count };
          } catch {
            statuses[feature.id] = { analyzing: false, pendingCount: 0 };
          }
        } else {
          // Features not in planning have no pending analysis
          statuses[feature.id] = { analyzing: false, pendingCount: 0 };
        }
      }
      setAnalysisStatus(statuses);
    };

    if (features.length > 0) {
      fetchPendingCounts();
    }
  }, [features]);

  // Handle analysis events
  const handleAnalysisEvent = useCallback((data: { featureId: string; event: { type: string; taskId?: string; taskTitle?: string; decision?: string; newTaskCount?: number; error?: string } }) => {
    const { featureId, event } = data;

    setAnalysisStatus((prev) => {
      const current = prev[featureId] || { analyzing: false, pendingCount: 0 };

      switch (event.type) {
        case 'analyzing':
          return { ...prev, [featureId]: { ...current, analyzing: true } };
        case 'kept':
        case 'split':
          // Task was analyzed, decrement pending count
          return {
            ...prev,
            [featureId]: {
              analyzing: true,
              pendingCount: Math.max(0, current.pendingCount - 1) + (event.newTaskCount || 0)
            }
          };
        case 'complete':
          return { ...prev, [featureId]: { analyzing: false, pendingCount: 0 } };
        case 'error':
          return { ...prev, [featureId]: { ...current, analyzing: false } };
        default:
          return prev;
      }
    });
  }, []);

  // Subscribe to analysis events
  useEffect(() => {
    const unsubscribe = window.electronAPI.analysis.onEvent(handleAnalysisEvent);
    return unsubscribe;
  }, [handleAnalysisEvent]);

  // Subscribe to worktree progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.feature.onWorktreeProgress(
      (data: { featureId: string; message: string }) => {
        setWorktreeProgress(prev => ({
          ...prev,
          [data.featureId]: data.message
        }));
      }
    );
    return unsubscribe;
  }, []);

  // Group features by column (each column may contain multiple statuses)
  const featuresByColumn = useMemo(() => {
    const grouped: Map<string, Feature[]> = new Map();

    // Initialize empty arrays for each column
    for (const column of columns) {
      grouped.set(column.title, []);
    }

    for (const feature of features) {
      // Find which column this feature belongs to
      const column = columns.find(col => col.statuses.includes(feature.status));
      if (column) {
        grouped.get(column.title)!.push(feature);
      } else {
        // Safety fallback: put unknown statuses in Backlog
        console.warn(`Feature ${feature.id} has unknown status '${feature.status}', defaulting to Backlog`);
        grouped.get('Backlog')!.push(feature);
      }
    }

    return grouped;
  }, [features]);

  // Handle feature selection - navigate to DAG view
  const handleSelectFeature = (featureId: string) => {
    setActiveFeature(featureId);
    setView('dag');
  };

  // Handle feature delete - opens confirmation dialog
  const handleDeleteFeature = (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    if (feature) {
      setFeatureToDelete(feature);
      setDeleteDialogOpen(true);
    }
  };

  // Handle delete confirmation
  const handleConfirmDelete = async (deleteBranch: boolean) => {
    if (featureToDelete) {
      await deleteFeature(featureToDelete.id, deleteBranch);
      setDeleteDialogOpen(false);
      setFeatureToDelete(null);
    }
  };

  // Handle start execution
  const handleStartFeature = async (featureId: string) => {
    setStartingFeatureId(featureId);
    try {
      await startExecution(featureId);
    } finally {
      setStartingFeatureId(null);
    }
  };

  // Handle stop execution
  const handleStopFeature = async (_featureId: string) => {
    try {
      await stopExecution();
    } catch (error) {
      console.error('Failed to stop execution:', error);
    }
  };

  // Handle merge feature - opens merge dialog
  const handleMergeFeature = (featureId: string, type: MergeType) => {
    const feature = features.find((f) => f.id === featureId);
    if (feature) {
      setFeatureToMerge(feature);
      setMergeType(type);
      setMergeDialogOpen(true);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading features...</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full p-6 pb-4">
        <div className="kanban-view__board flex gap-3 min-w-fit">
          {columns.map((column) => (
            <KanbanColumn
              key={column.title}
              title={column.title}
              status={column.statuses[0]}
              features={featuresByColumn.get(column.title) || []}
              onSelectFeature={handleSelectFeature}
              onDeleteFeature={handleDeleteFeature}
              onStartFeature={handleStartFeature}
              onStopFeature={handleStopFeature}
              onMergeFeature={handleMergeFeature}
              startingFeatureId={startingFeatureId}
              analysisStatus={analysisStatus}
              worktreeProgress={worktreeProgress}
            />
          ))}
        </div>
      </div>
      <DeleteFeatureDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setFeatureToDelete(null);
        }}
        feature={featureToDelete}
        onConfirm={handleConfirmDelete}
      />
      <FeatureMergeDialog
        isOpen={mergeDialogOpen}
        onClose={() => {
          setMergeDialogOpen(false);
          setFeatureToMerge(null);
          setMergeType(null);
        }}
        feature={featureToMerge}
        mergeType={mergeType}
      />
    </>
  );
}
