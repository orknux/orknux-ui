import { graphql } from './client';

/**
 * An integration orknux.ai recommends for this workspace - Blender, KiCad, an
 * IDE - with what setting it up takes and the prompt "Ask Claude" hands over.
 * The server reads it through and fills the prompt in; see
 * `integration-recommendations.graphqls` on the server.
 */
export interface IntegrationRecommendation {
  /** This server's address for the integration's icon, or null where orknux.ai gives none and the card draws its initial. */
  icon: string | null;
  /** The same for a dark ground; null where the one icon serves both. */
  iconDark: string | null;
  key: string;
  name: string;
  vendor: string | null;
  summary: string;
  description: string;
  tags: string[];
  homepage: string | null;
  repository: string | null;
  license: string | null;
  maintainer: 'OFFICIAL' | 'COMMUNITY' | string | null;
  popularity: number | null;
  /** Its repository as GitHub reports it, read by orknux.ai; null where it is not on GitHub or not read yet. */
  github: { fullName: string; url: string; stars: number; archived: boolean; checkedAt: string | null } | null;
  kind: 'MCP_SERVER' | 'CONNECTION' | 'PLUGIN' | 'EXTENSION' | string;
  transport: 'STREAMABLE_HTTP' | 'SSE' | 'STDIO' | string | null;
  runsOn: 'ANYWHERE' | 'USER_MACHINE' | 'SERVER' | string;
  sampleTools: string[];
  effort: 'MINUTES' | 'QUARTER_HOUR' | 'HOUR' | 'AFTERNOON' | string;
  minutes: number;
  requirements: string[];
  needsAdmin: boolean;
  steps: string;
  claudePrompt: string;
  reason: string | null;
  installed: boolean;
  tooOld: string | null;
}

export interface IntegrationRecommendations {
  /** False where orknux.ai has no recommendations to offer at all. */
  offered: boolean;
  items: IntegrationRecommendation[];
  next: string | null;
  total: number;
}

export interface IntegrationTag {
  tag: string;
  label: string;
  count: number;
}

const RECOMMENDATIONS_QUERY = `
  query IntegrationRecommendations($workspaceId: ID!, $search: String, $tag: String, $after: String, $order: IntegrationSort, $ascending: Boolean) {
    integrationRecommendations(workspaceId: $workspaceId, search: $search, tag: $tag, after: $after, order: $order, ascending: $ascending) {
      offered total next
      items {
        key name vendor summary description tags homepage repository license maintainer popularity github { fullName url stars archived checkedAt }
        icon iconDark kind transport runsOn sampleTools effort minutes requirements needsAdmin steps claudePrompt
        reason installed tooOld
      }
    }
  }
`;

/** How the cards are ordered, and which way; null is the order's own way: most popular, A to Z, newest. */
export interface IntegrationSort {
  order: 'RECOMMENDED' | 'POPULAR' | 'NAME' | 'NEWEST';
  ascending: boolean | null;
}

export async function fetchIntegrationRecommendations(
  workspaceId: string,
  search: string,
  tag: string | null,
  after: string | null,
  sort: IntegrationSort = { order: 'RECOMMENDED', ascending: null },
): Promise<IntegrationRecommendations> {
  const data = await graphql<{ integrationRecommendations: IntegrationRecommendations }>(RECOMMENDATIONS_QUERY, {
    workspaceId,
    search: search.trim() || null,
    tag,
    after,
    order: sort.order,
    ascending: sort.ascending,
  });
  return data.integrationRecommendations;
}

export async function fetchIntegrationTags(): Promise<IntegrationTag[]> {
  const data = await graphql<{ integrationTags: IntegrationTag[] }>('query { integrationTags { tag label count } }');
  return data.integrationTags;
}

/**
 * The link that opens Claude Code in a terminal on this computer with the
 * prompt filled in and not sent: the person reads it and presses Enter, and
 * Claude takes it from there. Claude Code registers `claude-cli://` once a
 * message has been sent in it.
 */
export function claudeCodeLink(prompt: string): string {
  return 'claude-cli://open?q=' + encodeURIComponent(prompt);
}

/** The same for the Claude desktop app, which opens a Claude Code session with the prompt filled in. */
export function claudeDesktopLink(prompt: string): string {
  return 'claude://code/new?q=' + encodeURIComponent(prompt);
}
