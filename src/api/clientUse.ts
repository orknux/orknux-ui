import { graphql } from './client';

/** The door a client comes in by. */
export type ClientUseKind = 'BROWSER' | 'DESKTOP' | 'CLAUDE' | 'SHELL';

/** One person's copy of one Orknux client, for Admin > Reports > Clients. Administrators only. */
export interface ClientUse {
  username: string;
  displayName: string | null;
  kind: ClientUseKind;
  /** What it calls itself: Chrome, Windows, Linux, Shell. */
  client: string | null;
  /** Which copy of it: "Linux on studio". */
  name: string;
  version: string | null;
  /** A desktop client's own name for its computer; otherwise the system it runs on, where known. */
  computer: string | null;
  firstSeen: string;
  lastSeen: string;
  /** Connected to this server now. */
  connected: boolean;
}

export async function fetchClientUses(): Promise<ClientUse[]> {
  const data = await graphql<{ clientUses: ClientUse[] }>(
    `{ clientUses { username displayName kind client name version computer firstSeen lastSeen connected } }`,
  );
  return data.clientUses;
}
