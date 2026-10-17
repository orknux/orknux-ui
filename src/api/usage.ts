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
}

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

export async function fetchUsageReport(filter: UsageFilter, page: number, size: number): Promise<UsageReport> {
  const data = await graphql<{ usageReport: UsageReport }>(
    `query($filter: UsageReportFilter, $page: Int, $size: Int) {
       usageReport(filter: $filter, page: $page, size: $size) {
         inputTokens cachedInputTokens outputTokens cost partlyUnpriced people sessions unattributedTokens total
         rows {
           key source personKey name connectionName sessions inputTokens cachedInputTokens outputTokens
           cost partlyUnpriced lastActiveAt
         }
       }
     }`,
    { filter, page, size },
  );
  return data.usageReport;
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
         total items { sessionId title workspaceId workspaceName tokens sessionTokens others }
       }
     }`,
    { person, filter, page, size },
  );
  return data.usagePersonSessions;
}

/** 48213000 -> "48.2M", for a column of totals read at a glance; the exact count is in the title. */
export function shortTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}
