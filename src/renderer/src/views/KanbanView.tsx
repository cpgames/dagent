import { useMemo, useState } from 'react';
import { useFeatureStore } from '../stores/feature-store';
import { useViewStore } from '../stores/view-store';
import { useExecutionStore } from '../stores/execution-store';
import { KanbanColumn, type MergeType } from '../components/Kanban';
import { DeleteFeatureDialog, FeatureMergeDialog } from '../components/Feature';
import type { Feature, FeatureStatus } from '@shared/types';

/**
 * Column configuration for the Kanban board.
 * Order matches DAGENT_SPEC 3.1: Not Started -> In Progress -> Needs Attention -> Completed
 */
const columns: { title: string; status: FeatureStatus }[] = [
  { title: 'Not Started', status: 'not_started' },
  { title: 'In Progress', status: 'in_progress' },
  { title: 'Needs Attention', status: 'needs_attention' },
  { title: 'Completed', status: 'completed' },
];

/**
 * KanbanView - Displays features as cards in status columns.
 * Shows the workflow state of all features with navigation to DAG view.
 */
export default function KanbanView() {
  const { features, isLoading, setActiveFeature, removeFeature, deleteFeature } = useFeatureStore();
  const setView = useViewStore((state) => state.setView);
  const { start: startExecution } = useExecutionStore();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);

  // Start execution state
  const [startingFeatureId, setStartingFeatureId] = useState<string | null>(null);

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [featureToMerge, setFeatureToMerge] = useState<Feature | null>(null);
  const [mergeType, setMergeType] = useState<MergeType | null>(null);

  // Group features by status
  const featuresByStatus = useMemo(() => {
    const grouped: Record<FeatureStatus, Feature[]> = {
      not_started: [],
      in_progress: [],
      needs_attention: [],
      completed: [],
    };

    for (const feature of features) {
      grouped[feature.status].push(feature);
    }

    return grouped;
  }, [features]);

  // Handle feature selection - navigate to DAG view
  const handleSelectFeature = (featureId: string) => {
    setActiveFeature(featureId);
    setView('dag');
  };

  // Handle feature archive
  const handleArchiveFeature = (featureId: string) => {
    // For now, just remove from the store
    // Later will call storage.archiveFeature via IPC
    removeFeature(featureId);
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
        <p className="text-gray-400">Loading features...</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full p-6 pb-4">
        <div className="flex gap-3 h-full overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          {columns.map((column) => (
            <KanbanColumn
              key={column.status}
              title={column.title}
              status={column.status}
              features={featuresByStatus[column.status]}
              onSelectFeature={handleSelectFeature}
              onArchiveFeature={handleArchiveFeature}
              onDeleteFeature={handleDeleteFeature}
              onStartFeature={handleStartFeature}
              onMergeFeature={handleMergeFeature}
              startingFeatureId={startingFeatureId}
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
