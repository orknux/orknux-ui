import { graphql } from './client';

/** What a flag is about: a person probing the product, or a fault in the harness or its setup. */
export type SessionFlagType = 'SECURITY' | 'TECHNICAL_ISSUE';

/** Whether a flag still stands. */
export type SessionFlagState = 'OPEN' | 'CLEARED';

/** A flag an agent raised on the conversation it was in, through flag_session. Administrators only. */
export interface SessionFlag {
  id: string;
  /** When it was raised. */
  at: string;
  workspaceId: string;
  /** Null for a workspace that has been removed. */
  workspaceName: string | null;
  sessionId: string;
  /** Null for a session that has been removed. */
  sessionTitle: string | null;
  agentName: string;
  type: SessionFlagType;
  /** From 0, harmless, to 5. */
  severity: number;
  note: string;
  state: SessionFlagState;
  clearedAt: string | null;
  /** The agent's name where it took its own back, the administrator's otherwise. */
  clearedBy: string | null;
}

/** One day of the flags chart: how many of each type, and how many at each severity from 0 to 5. */
export interface SessionFlagDay {
  day: string;
  security: number;
  technical: number;
  severities: number[];
}

export interface SessionFlagReport {
  total: number;
  open: number;
  security: number;
  technical: number;
  highest: number | null;
  days: SessionFlagDay[];
  rows: SessionFlag[];
}

export interface SessionFlagFilter {
  from?: string;
  to?: string;
  workspaceId?: string;
  type?: SessionFlagType;
  severityFrom?: number;
  severityTo?: number;
  state?: SessionFlagState;
  search?: string;
}

/** Every column the report draws, each of which sorts on the server. */
export type SessionFlagOrder =
  | 'FLAGGED_AT'
  | 'WORKSPACE'
  | 'SESSION'
  | 'AGENT'
  | 'TYPE'
  | 'SEVERITY'
  | 'NOTE'
  | 'STATE'
  | 'CLEARED_BY';

const FLAG_FIELDS = 'id at workspaceId workspaceName sessionId sessionTitle agentName type severity note state clearedAt clearedBy';

export async function fetchSessionFlagReport(
  filter: SessionFlagFilter,
  page: number,
  size: number,
  order: SessionFlagOrder = 'FLAGGED_AT',
  ascending = false,
): Promise<SessionFlagReport> {
  const data = await graphql<{ sessionFlagReport: SessionFlagReport }>(
    `query($filter: SessionFlagFilter, $page: Int, $size: Int, $order: SessionFlagOrder, $ascending: Boolean) {
       sessionFlagReport(filter: $filter, page: $page, size: $size, order: $order, ascending: $ascending) {
         total open security technical highest
         days { day security technical severities }
         rows { ${FLAG_FIELDS} }
       }
     }`,
    { filter, page, size, order, ascending },
  );
  return data.sessionFlagReport;
}

/** The flags one session carries, oldest first, for its page. Administrators. */
export async function fetchSessionFlags(sessionId: string): Promise<SessionFlag[]> {
  const data = await graphql<{ sessionFlags: SessionFlag[] }>(
    `query($sessionId: ID!) { sessionFlags(sessionId: $sessionId) { ${FLAG_FIELDS} } }`,
    { sessionId },
  );
  return data.sessionFlags;
}

export async function clearSessionFlag(id: string): Promise<SessionFlag> {
  const data = await graphql<{ clearSessionFlag: SessionFlag }>(
    `mutation($id: ID!) { clearSessionFlag(id: $id) { ${FLAG_FIELDS} } }`,
    { id },
  );
  return data.clearSessionFlag;
}

/** How many rows one request of the export asks for. */
const EXPORT_PAGE = 200;

/** The report as the table shows it - every page, in this order - as CSV text. */
export async function sessionFlagsCsv(filter: SessionFlagFilter, order: SessionFlagOrder, ascending: boolean): Promise<string> {
  const rows: SessionFlag[] = [];
  for (let page = 0; ; page++) {
    const held = await fetchSessionFlagReport(filter, page, EXPORT_PAGE, order, ascending);
    rows.push(...held.rows);
    if (rows.length >= held.total || held.rows.length === 0) break;
  }
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    ['flagged_at', 'workspace', 'session_id', 'session', 'agent', 'type', 'severity', 'note', 'state', 'cleared_at', 'cleared_by'],
    ...rows.map((one) => [
      one.at,
      one.workspaceName,
      one.sessionId,
      one.sessionTitle,
      one.agentName,
      one.type,
      one.severity,
      one.note,
      one.state,
      one.clearedAt,
      one.clearedBy,
    ]),
  ];
  return lines.map((line) => line.map(cell).join(',')).join('\n') + '\n';
}
