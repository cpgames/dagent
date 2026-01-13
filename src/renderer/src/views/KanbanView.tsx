import { useMemo } from 'react';
import { useFeatureStore } from '../stores/feature-store';
import { useViewStore } from '../stores/view-store';
import { KanbanColumn } from '../components/Kanban';
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
  const { features, isLoading, setActiveFeature, removeFeature } = useFeatureStore();
  const setView = useViewStore((state) => state.setView);

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

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400">Loading features...</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <div className="flex gap-4 h-full overflow-x-auto">
        {columns.map((column) => (
          <KanbanColumn
            key={column.status}
            title={column.title}
            status={column.status}
            features={featuresByStatus[column.status]}
            onSelectFeature={handleSelectFeature}
            onArchiveFeature={handleArchiveFeature}
          />
        ))}
      </div>
    </div>
  );
}
