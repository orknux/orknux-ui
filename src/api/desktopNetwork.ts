import { graphql } from './client';

/**
 * The desktop app's network switch: this computer only, or the network with
 * everybody signing in. Only the desktop app's server has one; everywhere else
 * the query answers null and Admin › Settings draws no card.
 */
export type DesktopNetworkMode = 'LOCAL' | 'EXPOSED';

export interface DesktopNetwork {
  /** What the server runs as now. */
  mode: DesktopNetworkMode;
  /** What the next start will be; differs from `mode` only until the restart that applies it. */
  chosen: DesktopNetworkMode;
  restartRequired: boolean;
  /** Where others on the network reach it once exposed. */
  addresses: string[];
  /** Who signs in once exposed. */
  account: string;
  /** Whether the server starts again by itself once the setting is saved. */
  restarts: boolean;
}

const FIELDS = 'mode chosen restartRequired addresses account restarts';

export async function fetchDesktopNetwork(): Promise<DesktopNetwork | null> {
  const data = await graphql<{ desktopNetwork: DesktopNetwork | null }>(`query { desktopNetwork { ${FIELDS} } }`);
  return data.desktopNetwork;
}

export async function setDesktopNetwork(mode: DesktopNetworkMode, password?: string): Promise<DesktopNetwork> {
  const data = await graphql<{ setDesktopNetwork: DesktopNetwork }>(
    `mutation ($mode: DesktopNetworkMode!, $password: String) { setDesktopNetwork(mode: $mode, password: $password) { ${FIELDS} } }`,
    { mode, password },
  );
  return data.setDesktopNetwork;
}
