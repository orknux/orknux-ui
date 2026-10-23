import { graphql } from './client';

/**
 * The numbers the server behaves by, set from Admin -> Settings. Issue #453.
 *
 * One list rather than a field each: the server adds a number by adding an
 * entry, and this page draws whatever comes back, grouped by its section.
 */
export interface Tunable {
  /** What it is stored under, and what `setTunable` takes. */
  key: string;
  /** Which group it belongs to, as a name. */
  section: string;
  /** That group's heading, in English from the server. */
  sectionTitle: string;
  label: string;
  hint: string;
  /** What it counts: seconds, items, MB... */
  unit: string;
  /** What the server uses now. */
  value: number;
  /** What the configuration file says, which a cleared box goes back to. */
  configured: number;
  /** Whether an administrator has chosen, as against the file deciding. */
  set: boolean;
  least: number;
  most: number;
  /** The environment variable that sets where a fresh installation starts. */
  variable: string;
}

const FIELDS = 'key section sectionTitle label hint unit value configured set least most variable';

export async function fetchTunables(): Promise<Tunable[]> {
  const data = await graphql<{ tunables: Tunable[] }>(`query { tunables { ${FIELDS} } }`);
  return data.tunables;
}

/** Sets one; `null` hands it back to the configuration file. */
export async function setTunable(key: string, value: number | null): Promise<Tunable> {
  const data = await graphql<{ setTunable: Tunable }>(
    `mutation ($key: String!, $value: Int) { setTunable(key: $key, value: $value) { ${FIELDS} } }`,
    { key, value },
  );
  return data.setTunable;
}
