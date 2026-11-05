import { graphql } from './client';
import type { PageOf } from './client';

/** One MCP client's connection to one workspace: who, with what, from where, and when. */
export interface McpClientSession {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  username: string;
  tokenName: string | null;
  clientName: string | null;
  clientVersion: string | null;
  userAgent: string | null;
  /** The client's address: the first X-Forwarded-For hop where a proxy wrote one. */
  ipAddress: string;
  /** The connection's own address where it differs - the proxy's. */
  peerAddress: string | null;
  /** From a reverse lookup; null until looked up, or where there is none. */
  hostname: string | null;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  connected: boolean;
  calls: number;
}

export interface McpSessionPage extends PageOf<McpClientSession> {
  connectedCount: number;
}

/** One thing an MCP client asked for, and how it went. */
export interface McpClientCall {
  id: string;
  sessionId: string;
  workspaceId: string;
  workspaceName: string | null;
  username: string;
  clientName: string | null;
  ipAddress: string;
  hostname: string | null;
  method: string;
  tool: string | null;
  arguments: string | null;
  failed: boolean;
  error: string | null;
  durationMs: number;
  at: string;
}

const SESSIONS_QUERY = `
  query McpSessions($workspaceId: ID, $connectedOnly: Boolean, $page: Int, $size: Int) {
    mcpSessions(workspaceId: $workspaceId, connectedOnly: $connectedOnly, page: $page, size: $size) {
      page size totalElements totalPages connectedCount
      content {
        id workspaceId workspaceName username tokenName clientName clientVersion userAgent
        ipAddress peerAddress hostname startedAt lastSeenAt endedAt connected calls
      }
    }
  }
`;

const CALLS_QUERY = `
  query McpCalls($workspaceId: ID, $sessionId: ID, $failedOnly: Boolean, $page: Int, $size: Int) {
    mcpCalls(workspaceId: $workspaceId, sessionId: $sessionId, failedOnly: $failedOnly, page: $page, size: $size) {
      page size totalElements totalPages
      content {
        id sessionId workspaceId workspaceName username clientName ipAddress hostname
        method tool arguments failed error durationMs at
      }
    }
  }
`;

/** MCP clients' sessions, newest seen first: every workspace's when [workspaceId] is null, which only an administrator may ask. */
export async function fetchMcpSessions(
  workspaceId: string | null,
  page: number,
  size: number,
  connectedOnly = false,
): Promise<McpSessionPage> {
  const data = await graphql<{ mcpSessions: McpSessionPage }>(SESSIONS_QUERY, { workspaceId, connectedOnly, page, size });
  return data.mcpSessions;
}

/** What MCP clients called, newest first: in one workspace, one session, or everywhere. */
export async function fetchMcpCalls(
  workspaceId: string | null,
  sessionId: string | null,
  page: number,
  size: number,
  failedOnly = false,
): Promise<PageOf<McpClientCall>> {
  const data = await graphql<{ mcpCalls: PageOf<McpClientCall> }>(CALLS_QUERY, { workspaceId, sessionId, failedOnly, page, size });
  return data.mcpCalls;
}
