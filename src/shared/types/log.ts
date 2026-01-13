export type LogEntryType = 'intention' | 'approval' | 'rejection' | 'modification' | 'action' | 'error';
export type AgentType = 'harness' | 'task' | 'merge';

export interface LogEntry {
  timestamp: string;
  type: LogEntryType;
  agent: AgentType;
  taskId?: string;
  content: string;
}

export interface AgentLog {
  entries: LogEntry[];
}
