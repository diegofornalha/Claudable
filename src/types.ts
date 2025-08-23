export interface Neo4jServerConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface CreateMemoryArgs {
  label: string;
  properties: Record<string, any>;
}

export interface SearchMemoriesArgs {
  query?: string;
  label?: string;
  depth?: number;
  order_by?: string;
  limit?: number;
  since_date?: string;
}

export interface CreateConnectionArgs {
  fromMemoryId: number;
  toMemoryId: number;
  type: string;
  properties?: Record<string, any>;
}

export interface UpdateMemoryArgs {
  nodeId: number;
  properties: Record<string, any>;
}

export interface UpdateConnectionArgs {
  fromMemoryId: number;
  toMemoryId: number;
  type: string;
  properties: Record<string, any>;
}

export interface DeleteMemoryArgs {
  nodeId: number;
}

export interface DeleteConnectionArgs {
  fromMemoryId: number;
  toMemoryId: number;
  type: string;
}

export interface ListMemoryLabelsArgs {
  // No arguments needed for this tool
}

export function isCreateMemoryArgs(args: unknown): args is CreateMemoryArgs {
  return typeof args === 'object' && args !== null && typeof (args as CreateMemoryArgs).label === 'string' && typeof (args as CreateMemoryArgs).properties === 'object';
}

export function isSearchMemoriesArgs(args: unknown): args is SearchMemoriesArgs {
  if (typeof args !== 'object' || args === null) return false;
  const searchArgs = args as SearchMemoriesArgs;
  if (searchArgs.query !== undefined && typeof searchArgs.query !== 'string') return false;
  if (searchArgs.since_date !== undefined && typeof searchArgs.since_date !== 'string') return false;
  return true;
}

export function isCreateConnectionArgs(args: unknown): args is CreateConnectionArgs {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof (args as CreateConnectionArgs).fromMemoryId === 'number' &&
    typeof (args as CreateConnectionArgs).toMemoryId === 'number' &&
    typeof (args as CreateConnectionArgs).type === 'string'
  );
}

export function isUpdateMemoryArgs(args: unknown): args is UpdateMemoryArgs {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof (args as UpdateMemoryArgs).nodeId === 'number' &&
    typeof (args as UpdateMemoryArgs).properties === 'object'
  );
}

export function isUpdateConnectionArgs(args: unknown): args is UpdateConnectionArgs {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof (args as UpdateConnectionArgs).fromMemoryId === 'number' &&
    typeof (args as UpdateConnectionArgs).toMemoryId === 'number' &&
    typeof (args as UpdateConnectionArgs).type === 'string' &&
    typeof (args as UpdateConnectionArgs).properties === 'object'
  );
}

export function isDeleteMemoryArgs(args: unknown): args is DeleteMemoryArgs {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof (args as DeleteMemoryArgs).nodeId === 'number'
  );
}

export function isDeleteConnectionArgs(args: unknown): args is DeleteConnectionArgs {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof (args as DeleteConnectionArgs).fromMemoryId === 'number' &&
    typeof (args as DeleteConnectionArgs).toMemoryId === 'number' &&
    typeof (args as DeleteConnectionArgs).type === 'string'
  );
}

export function isListMemoryLabelsArgs(args: unknown): args is ListMemoryLabelsArgs {
  // This tool doesn't require any arguments, so just check it's an object
  return typeof args === 'object' && args !== null;
}