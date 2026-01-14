import { create } from 'zustand'

export type LogDialogSource = 'task' | 'pm' | null

interface DialogState {
  // Node dialog
  nodeDialogOpen: boolean
  nodeDialogTaskId: string | null

  // Log dialog
  logDialogOpen: boolean
  logDialogTitle: string | null
  logDialogTaskId: string | null
  logDialogSource: LogDialogSource

  // Actions
  openNodeDialog: (taskId: string) => void
  closeNodeDialog: () => void
  openLogDialog: (title: string, taskId?: string | null, source?: LogDialogSource) => void
  closeLogDialog: () => void
}

export const useDialogStore = create<DialogState>((set) => ({
  nodeDialogOpen: false,
  nodeDialogTaskId: null,

  logDialogOpen: false,
  logDialogTitle: null,
  logDialogTaskId: null,
  logDialogSource: null,

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

  openLogDialog: (title, taskId = null, source = null) =>
    set({
      logDialogOpen: true,
      logDialogTitle: title,
      logDialogTaskId: taskId,
      logDialogSource: source
    }),

  closeLogDialog: () =>
    set({
      logDialogOpen: false,
      logDialogTitle: null,
      logDialogTaskId: null,
      logDialogSource: null
    })
}))
