import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFeatureStore } from '../stores/feature-store';
import { useViewStore } from '../stores/view-store';
import { KanbanColumn, type MergeType } from '../components/Kanban';
import { DeleteFeatureDialog, FeatureMergeDialog, FeatureDialog, type FeatureEditData } from '../components/Feature';
import type { Feature, FeatureStatus } from '@shared/types';
import './KanbanView.css';

/**
 * Task execution status for a feature.
 */
interface FeatureTaskStatus {
  analyzing: boolean;
  isDeveloping: boolean;
  isVerifying: boolean;
}

/**
 * Column configuration for the Kanban board.
 * 4-column layout mapping simplified workflow:
 * - Backlog: backlog (feature exists, not yet started)
 * - In Progress: creating_worktree (worktree being set up), active (has worktree, work in progress)
 * - Merging: merging (all tasks done, ready to merge)
 * - Archived: archived (user manually archived)
 */
const columns: { title: string; statuses: FeatureStatus[] }[] = [
  { title: 'Backlog', statuses: ['backlog'] },
  { title: 'In Progress', statuses: ['creating_worktree', 'active'] },
  { title: 'Merging', statuses: ['merging'] },
  { title: 'Archived', statuses: ['archived'] },
];

/**
 * Props for KanbanView component.
 */
interface KanbanViewProps {
  /** Selected worktree filters - Set of worktreeIds to show (empty = show none, full = show all) */
  selectedManagerFilters: Set<number>;
  /** Callback to open New Feature dialog */
  onNewFeature: () => void;
}

/**
 * KanbanView - Displays features as cards in status columns.
 * Shows the workflow state of all features with navigation to DAG view.
 */
export default function KanbanView({ selectedManagerFilters, onNewFeature }: KanbanViewProps) {
  const { features, isLoading, setActiveFeature, deleteFeature } = useFeatureStore();
  const setView = useViewStore((state) => state.setView);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [featureToMerge, setFeatureToMerge] = useState<Feature | null>(null);
  const [mergeType, setMergeType] = useState<MergeType | null>(null);

  // Edit dialog state (for backlog features)
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [featureToEdit, setFeatureToEdit] = useState<Feature | null>(null);

  // Task execution status per feature
  const [taskStatus, setTaskStatus] = useState<Record<string, FeatureTaskStatus>>({});

  // Handle analysis events
  const handleAnalysisEvent = useCallback((data: { featureId: string; event: { type: string; taskId?: string; taskTitle?: string; decision?: string; newTaskCount?: number; error?: string } }) => {
    const { featureId, event } = data;

    setTaskStatus((prev) => {
      const current = prev[featureId] || { analyzing: false, isDeveloping: false, isVerifying: false };

      switch (event.type) {
        case 'analyzing':
          return { ...prev, [featureId]: { ...current, analyzing: true } };
        case 'kept':
        case 'split':
        case 'complete':
          return { ...prev, [featureId]: { ...current, analyzing: false } };
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

  // Group features by column (each column may contain multiple statuses)
  // Apply pool filter: Backlog and Archived show all, In Progress and Completed filter by selected pool
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
        // Apply worktree filter for In Progress and Merging columns
        const shouldFilter = column.title === 'In Progress' || column.title === 'Merging';
        const worktreeIdToNum = { neon: 1, cyber: 2, pulse: 3 } as const;
        const worktreeNum = feature.worktreeId ? worktreeIdToNum[feature.worktreeId] : undefined;

        if (shouldFilter && worktreeNum !== undefined && !selectedManagerFilters.has(worktreeNum)) {
          continue; // Skip features not matching any selected filter
        }

        grouped.get(column.title)!.push(feature);
      } else {
        // Safety fallback: put unknown statuses in Backlog
        console.warn(`Feature ${feature.id} has unknown status '${feature.status}', defaulting to Backlog`);
        grouped.get('Backlog')!.push(feature);
      }
    }

    return grouped;
  }, [features, selectedManagerFilters]);

  // Handle feature selection - navigate to DAG view or open edit dialog for backlog
  const handleSelectFeature = (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    if (feature?.status === 'backlog') {
      // Open edit dialog for backlog features
      setFeatureToEdit(feature);
      setEditDialogOpen(true);
      return;
    }
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

  // Handle merge feature - opens merge dialog
  const handleMergeFeature = (featureId: string, type: MergeType) => {
    const feature = features.find((f) => f.id === featureId);
    if (feature) {
      setFeatureToMerge(feature);
      setMergeType(type);
      setMergeDialogOpen(true);
    }
  };

  // Handle feature drop - update status via IPC
  const handleDropFeature = async (featureId: string, fromStatus: FeatureStatus, toStatus: FeatureStatus) => {

    // Special case: backlog -> In Progress requires starting the feature (creates worktree)
    // Note: toStatus can be 'creating_worktree' or 'active' depending on column configuration
    if (fromStatus === 'backlog' && (toStatus === 'active' || toStatus === 'creating_worktree')) {
      try {
        const result = await window.electronAPI.feature.startWorktreeCreation(featureId);
        if (!result.success) {
          console.error('Failed to start feature via drag:', result.error);
        } else {
          // Navigate to DAG view immediately so user sees the investigation in real-time
          // Chat store needs currentFeatureId set to receive streamed events
          setActiveFeature(featureId);
          setView('dag');
        }
      } catch (error) {
        console.error('Error starting feature via drag:', error);
      }
      return;
    }

    // Standard status update
    try {
      const result = await window.electronAPI.feature.updateStatus(featureId, toStatus);
      if (!result.success) {
        console.error('Failed to update feature status:', result.error);
      }
    } catch (error) {
      console.error('Error updating feature status:', error);
    }
  };

  // Handle feature save (from edit dialog)
  const handleSaveFeature = async (featureId: string, data: FeatureEditData) => {
    const existingFeature = features.find((f) => f.id === featureId);
    if (!existingFeature) return;

    // Build updated feature
    const updatedFeature: Feature = {
      ...existingFeature,
      name: data.name,
      description: data.description,
      // Only update worktreeId if it was provided (user had permission to change it)
      ...(data.worktreeId && { worktreeId: data.worktreeId }),
      updatedAt: new Date().toISOString()
    };

    // Save via IPC
    await window.electronAPI.storage.saveFeature(updatedFeature);

    // Update local store
    useFeatureStore.getState().updateFeature(featureId, updatedFeature);
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
      <div className="h-full p-6 pb-4 flex flex-col">
        <div className="kanban-view__board flex gap-3 min-w-fit flex-1">
          {columns.map((column) => (
            <KanbanColumn
              key={column.title}
              title={column.title}
              status={column.statuses[0]}
              features={featuresByColumn.get(column.title) || []}
              onSelectFeature={handleSelectFeature}
              onDeleteFeature={handleDeleteFeature}
              onMergeFeature={handleMergeFeature}
              onDropFeature={handleDropFeature}
              taskStatus={taskStatus}
              onNewFeature={column.title === 'Backlog' ? onNewFeature : undefined}
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
      <FeatureDialog
        isOpen={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setFeatureToEdit(null);
        }}
        mode="edit"
        feature={featureToEdit}
        onSave={handleSaveFeature}
      />
    </>
  );
}
