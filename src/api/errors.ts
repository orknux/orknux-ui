import { graphql } from './client';
import type { UsageFilter } from './usage';

/** What failed: a workflow run, an agent's answer, or the quick chat's model. */
export type ErrorSource = 'RUN' | 'AGENT' | 'MODEL';

/** A column of the errors table the rows can be put in the order of. */
export type ErrorOrder = 'AT' | 'SOURCE' | 'SUBJECT' | 'MESSAGE' | 'WORKSPACE';

/** One thing that failed, as it was recorded when it happened. */
export interface ErrorRecord {
  id: string;
  at: string;
  workspaceId: string;
  /** Null for a workspace that has been removed. */
  workspaceName: string | null;
  source: ErrorSource;
  /** The workflow, agent or model by name, as it was called then. */
  subject: string;
  executionId: string | null;
  sessionId: string | null;
  message: string;
}

export interface ErrorSubject {
  source: ErrorSource;
  subject: string;
  count: number;
  last: string;
}

/** One day of the chart: how many of each source failed. */
export interface ErrorDay {
  day: string;
  runs: number;
  agents: number;
  models: number;
}

export interface ErrorReport {
  total: number;
  /** Every day of the period, oldest first, quiet days included. */
  days: ErrorDay[];
  counts: { source: ErrorSource; count: number }[];
  /** What failed most often, at most five. */
  often: ErrorSubject[];
  rows: ErrorRecord[];
}

/** Admin > Reports > Errors: what failed over the filter's period, newest first. */
export async function fetchErrorReport(
  filter: UsageFilter,
  source: ErrorSource | null,
  page: number,
  size: number,
  order: ErrorOrder = 'AT',
  ascending = false,
): Promise<ErrorReport> {
  const data = await graphql<{ errorReport: ErrorReport }>(
    `query($filter: UsageReportFilter, $source: ErrorSource, $page: Int, $size: Int, $order: ErrorOrder, $ascending: Boolean) {
       errorReport(filter: $filter, source: $source, page: $page, size: $size, order: $order, ascending: $ascending) {
         total
         counts { source count }
         often { source subject count last }
         days { day runs agents models }
         rows { id at workspaceId workspaceName source subject executionId sessionId message }
       }
     }`,
    { filter: { ...filter, source: undefined }, source, page, size, order, ascending },
  );
  return data.errorReport;
}
