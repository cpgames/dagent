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
 * Order matches new workflow: Planning -> Backlog -> In Progress -> Needs Attention -> Completed -> Archived
 */
const columns: { title: string; status: FeatureStatus }[] = [
  { title: 'Planning', status: 'planning' },
  { title: 'Backlog', status: 'backlog' },
  { title: 'In Progress', status: 'in_progress' },
  { title: 'Needs Attention', status: 'needs_attention' },
  { title: 'Completed', status: 'completed' },
  { title: 'Archived', status: 'archived' },
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

  // Fetch initial pending counts for all features
  useEffect(() => {
    const fetchPendingCounts = async () => {
      const statuses: Record<string, AnalysisStatus> = {};
      for (const feature of features) {
        try {
          const result = await window.electronAPI.analysis.pending(feature.id);
          statuses[feature.id] = { analyzing: false, pendingCount: result.count };
        } catch {
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

  // Group features by status
  const featuresByStatus = useMemo(() => {
    const grouped: Record<FeatureStatus, Feature[]> = {
      planning: [],
      backlog: [],
      in_progress: [],
      needs_attention: [],
      completed: [],
      archived: [],
    };

    for (const feature of features) {
      // Safety check: if feature has invalid status, default to 'needs_attention'
      const status = feature.status in grouped ? feature.status : 'needs_attention';
      if (status !== feature.status) {
        console.warn(`Feature ${feature.id} has invalid status '${feature.status}', defaulting to 'needs_attention'`);
      }
      grouped[status].push(feature);
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
              key={column.status}
              title={column.title}
              status={column.status}
              features={featuresByStatus[column.status]}
              onSelectFeature={handleSelectFeature}
              onDeleteFeature={handleDeleteFeature}
              onStartFeature={handleStartFeature}
              onStopFeature={handleStopFeature}
              onMergeFeature={handleMergeFeature}
              startingFeatureId={startingFeatureId}
              analysisStatus={analysisStatus}
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
