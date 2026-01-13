import { create } from 'zustand';

interface DialogState {
  // Node dialog
  nodeDialogOpen: boolean;
  nodeDialogTaskId: string | null;

  // Actions
  openNodeDialog: (taskId: string) => void;
  closeNodeDialog: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  nodeDialogOpen: false,
  nodeDialogTaskId: null,

  openNodeDialog: (taskId) =>
    set({
      nodeDialogOpen: true,
      nodeDialogTaskId: taskId,
    }),

  closeNodeDialog: () =>
    set({
      nodeDialogOpen: false,
      nodeDialogTaskId: null,
    }),
}));
