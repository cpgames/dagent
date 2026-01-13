export interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  media?: string[];  // Relative paths to attached files
  timestamp: string; // ISO timestamp
}

export interface ChatHistory {
  entries: ChatEntry[];
}
