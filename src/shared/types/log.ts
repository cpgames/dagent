export type LogEntryType = 'intention' | 'approval' | 'rejection' | 'modification' | 'action' | 'error' | 'pm-query' | 'pm-response';
export type AgentType = 'harness' | 'task' | 'merge' | 'pm';

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
