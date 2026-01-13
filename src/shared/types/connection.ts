export interface Connection {
  from: string;  // Source task ID
  to: string;    // Target task ID (depends on source)
}
