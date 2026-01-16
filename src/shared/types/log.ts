export type LogEntryType =
  | 'intention'
  | 'approval'
  | 'rejection'
  | 'modification'
  | 'action'
  | 'error'
  | 'pm-query'
  | 'pm-response'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'info'
  | 'warning';
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

export interface DevAgentMessage {
  timestamp: string;
  direction: 'task_to_harness' | 'harness_to_task';
  type: 'intention' | 'approval' | 'rejection' | 'progress' | 'completion' | 'error';
  content: string;
  metadata?: {
    toolName?: string;
    toolInput?: unknown;
    toolResult?: unknown;
  };
}

export interface DevAgentSession {
  taskId: string;
  agentId: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  startedAt: string;
  completedAt?: string;
  messages: DevAgentMessage[];
}
