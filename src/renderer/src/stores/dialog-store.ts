import { create } from 'zustand'

interface DialogState {
  // Node dialog
  nodeDialogOpen: boolean
  nodeDialogTaskId: string | null

  // Task chat overlay
  taskChatOpen: boolean
  taskChatTaskId: string | null
  taskChatFeatureId: string | null

  // Actions
  openNodeDialog: (taskId: string) => void
  closeNodeDialog: () => void
  openTaskChat: (taskId: string, featureId: string) => void
  closeTaskChat: () => void
}

export const useDialogStore = create<DialogState>((set) => ({
  nodeDialogOpen: false,
  nodeDialogTaskId: null,

  taskChatOpen: false,
  taskChatTaskId: null,
  taskChatFeatureId: null,

  openNodeDialog: (taskId) =>
    set({
      nodeDialogOpen: true,
      nodeDialogTaskId: taskId
    }),

  closeNodeDialog: () =>
    set({
      nodeDialogOpen: false,
      nodeDialogTaskId: null
    }),

  openTaskChat: (taskId, featureId) =>
    set({
      taskChatOpen: true,
      taskChatTaskId: taskId,
      taskChatFeatureId: featureId
    }),

  closeTaskChat: () =>
    set({
      taskChatOpen: false,
      taskChatTaskId: null,
      taskChatFeatureId: null
    })
}))
