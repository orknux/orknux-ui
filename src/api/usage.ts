import { graphql } from './client';

/** Where the person who prompted a model call is known from. */
export type PromptSource = 'SLACK' | 'ORKNUX' | 'NONE';

export interface UsageTracking {
  enabled: boolean;
  changedAt: string | null;
  changedBy: string | null;
}

export interface UsageFilter {
  /** YYYY-MM-DD. */
  from?: string;
  to?: string;
  workspaceId?: string;
  source?: PromptSource;
  /** Over the person alone: their name or id. */
  search?: string;
}

/** What the people table can be put in the order of; see the server's usageReport. */
export type UsageOrder = 'TOKENS' | 'NAME' | 'SOURCE' | 'SESSIONS' | 'INPUT' | 'CACHED' | 'OUTPUT' | 'COST' | 'LAST_ACTIVE';

export interface UsagePerson {
  key: string;
  source: PromptSource;
  personKey: string;
  name: string | null;
  connectionName: string | null;
  sessions: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  cost: string | null;
  partlyUnpriced: boolean;
  lastActiveAt: string;
}

export interface UsageReport {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  cost: string | null;
  partlyUnpriced: boolean;
  people: number;
  sessions: number;
  unattributedTokens: number;
  total: number;
  rows: UsagePerson[];
}

export interface UsageSessionShare {
  sessionId: string;
  title: string | null;
  workspaceId: string;
  workspaceName: string | null;
  tokens: number;
  sessionTokens: number;
  /** What their calls here cost, where any was priced. */
  cost: string | null;
  partlyUnpriced: boolean;
  /** When they last prompted it. */
  lastActiveAt: string | null;
  others: string[];
}

const TRACKING_FIELDS = 'enabled changedAt changedBy';

export async function fetchUsageTracking(): Promise<UsageTracking> {
  const data = await graphql<{ usageTracking: UsageTracking }>(`query { usageTracking { ${TRACKING_FIELDS} } }`);
  return data.usageTracking;
}

export async function setUsageTracking(enabled: boolean): Promise<UsageTracking> {
  const data = await graphql<{ setUsageTracking: UsageTracking }>(
    `mutation($enabled: Boolean!) { setUsageTracking(enabled: $enabled) { ${TRACKING_FIELDS} } }`,
    { enabled },
  );
  return data.setUsageTracking;
}

export async function fetchUsageReport(
  filter: UsageFilter,
  page: number,
  size: number,
  order: UsageOrder = 'TOKENS',
  ascending = false,
): Promise<UsageReport> {
  const data = await graphql<{ usageReport: UsageReport }>(
    `query($filter: UsageReportFilter, $page: Int, $size: Int, $order: String, $ascending: Boolean) {
       usageReport(filter: $filter, page: $page, size: $size, order: $order, ascending: $ascending) {
         inputTokens cachedInputTokens outputTokens cost partlyUnpriced people sessions unattributedTokens total
         rows {
           key source personKey name connectionName sessions inputTokens cachedInputTokens outputTokens
           cost partlyUnpriced lastActiveAt
         }
       }
     }`,
    { filter, page, size, order: order === 'TOKENS' ? null : order, ascending },
  );
  return data.usageReport;
}

/** The largest page the server hands out; an export walks the report in pages of this. */
export const USAGE_EXPORT_PAGE = 200;

/**
 * The whole report as CSV, every page of it, for whatever reads spreadsheets.
 * Built here rather than served: the rows are what the table shows, and a
 * second rendering of them on the server would be a second report.
 */
export async function usageReportCsv(filter: UsageFilter, order: UsageOrder, ascending: boolean): Promise<string> {
  const rows: UsagePerson[] = [];
  for (let page = 0; ; page++) {
    const held = await fetchUsageReport(filter, page, USAGE_EXPORT_PAGE, order, ascending);
    rows.push(...held.rows);
    if (rows.length >= held.total || held.rows.length === 0) break;
  }
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    ['person', 'source', 'id', 'connection', 'sessions', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'cost', 'last_active'],
    ...rows.map((one) => [
      one.source === 'NONE' ? 'Unattributed' : one.name ?? one.personKey,
      one.source,
      one.personKey,
      one.connectionName,
      one.sessions,
      one.inputTokens,
      one.cachedInputTokens,
      one.outputTokens,
      one.cost,
      one.lastActiveAt,
    ]),
  ];
  return lines.map((line) => line.map(cell).join(',')).join('\n') + '\n';
}

export async function fetchUsagePersonSessions(
  person: string,
  filter: UsageFilter,
  page: number,
  size: number,
): Promise<{ total: number; items: UsageSessionShare[] }> {
  const data = await graphql<{ usagePersonSessions: { total: number; items: UsageSessionShare[] } }>(
    `query($person: String!, $filter: UsageReportFilter, $page: Int, $size: Int) {
       usagePersonSessions(person: $person, filter: $filter, page: $page, size: $size) {
         total items { sessionId title workspaceId workspaceName tokens sessionTokens cost partlyUnpriced lastActiveAt others }
       }
     }`,
    { person, filter, page, size },
  );
  return data.usagePersonSessions;
}

/** One day of the report, in the server's zone; cachedInputTokens is a part of inputTokens. */
export interface UsageDay {
  /** YYYY-MM-DD. */
  day: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  cost: string | null;
  partlyUnpriced: boolean;
}

/** The report day by day, every day of the period, under the same filter as the totals. */
export async function fetchUsageSeries(filter: UsageFilter): Promise<UsageDay[]> {
  const data = await graphql<{ usageSeries: UsageDay[] }>(
    `query($filter: UsageReportFilter) {
       usageSeries(filter: $filter) { day inputTokens cachedInputTokens outputTokens cost partlyUnpriced }
     }`,
    { filter },
  );
  return data.usageSeries;
}

/** 48213000 -> "48.2M", for a column of totals read at a glance; the exact count is in the title. */
export function shortTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}
