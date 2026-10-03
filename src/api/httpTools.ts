import { graphql } from './client';

/**
 * Admin -> Settings -> HTTP tools. Issue #602.
 *
 * Whether an agent's http_get, http_request and http_download are offered, and
 * where they may go. Only the agents' tools: `orknux.http`, which functions and
 * plugins call, is governed by the proxy rules alone.
 */
export type HttpToolPolicyKind = 'ANY' | 'LIST';

export interface HttpToolRule {
  /** A regular expression matched against the whole URL. */
  url: string;
  methods: string[];
}

export interface HttpToolSettings {
  enabled: boolean;
  policy: HttpToolPolicyKind;
  rules: HttpToolRule[];
  /** What a rule may allow: the methods the tools send. */
  methods: string[];
}

export type HttpToolOutcome = 'SWITCHED_OFF' | 'ANY_URL' | 'ALLOWED' | 'NO_RULE_MATCHES' | 'METHOD_NOT_LISTED';

export interface HttpToolCheck {
  allowed: boolean;
  outcome: HttpToolOutcome;
  /** The rule that allowed it, from 1; null where none did. */
  matchedRule: number | null;
  /** Every rule whose pattern matches the URL, whatever its methods, from 1. */
  urlMatches: number[];
  /** What an agent would be told, in English. */
  message: string;
}

export interface HttpToolPolicyInput {
  policy: HttpToolPolicyKind;
  rules: HttpToolRule[];
}

const FIELDS = 'enabled policy rules { url methods } methods';

export async function fetchHttpToolSettings(): Promise<HttpToolSettings> {
  const data = await graphql<{ httpToolSettings: HttpToolSettings }>(`query { httpToolSettings { ${FIELDS} } }`);
  return data.httpToolSettings;
}

export async function setHttpToolsEnabled(enabled: boolean): Promise<HttpToolSettings> {
  const data = await graphql<{ setHttpToolsEnabled: HttpToolSettings }>(
    `mutation ($enabled: Boolean!) { setHttpToolsEnabled(enabled: $enabled) { ${FIELDS} } }`,
    { enabled },
  );
  return data.setHttpToolsEnabled;
}

export async function saveHttpToolPolicy(input: HttpToolPolicyInput): Promise<HttpToolSettings> {
  const data = await graphql<{ saveHttpToolPolicy: HttpToolSettings }>(
    `mutation ($input: HttpToolPolicyInput!) { saveHttpToolPolicy(input: $input) { ${FIELDS} } }`,
    { input },
  );
  return data.saveHttpToolPolicy;
}

/**
 * What a request would meet, answered by the matcher the tools ask. `draft` is
 * the policy as the page holds it, saved or not.
 */
export async function checkHttpTool(url: string, method: string, draft: HttpToolPolicyInput): Promise<HttpToolCheck> {
  const data = await graphql<{ httpToolCheck: HttpToolCheck }>(
    `query ($url: String!, $method: String!, $draft: HttpToolPolicyInput) {
      httpToolCheck(url: $url, method: $method, draft: $draft) { allowed outcome matchedRule urlMatches message }
    }`,
    { url, method, draft },
  );
  return data.httpToolCheck;
}
