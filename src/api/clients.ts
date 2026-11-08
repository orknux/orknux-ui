import { graphql } from './client';

/** A one-time code to type into an Orknux client; see `clients.graphqls` on the server. */
export interface ClientPairingCode {
  code: string;
  expiresAt: string;
}

/** A client the signed-in person connected with a pairing code. */
export interface ConnectedClient {
  id: string;
  name: string;
  client: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function startClientPairing(): Promise<ClientPairingCode> {
  const data = await graphql<{ startClientPairing: ClientPairingCode }>('mutation { startClientPairing { code expiresAt } }');
  return data.startClientPairing;
}

export async function fetchMyClients(): Promise<ConnectedClient[]> {
  const data = await graphql<{ myClients: ConnectedClient[] }>('query { myClients { id name client createdAt lastUsedAt } }');
  return data.myClients;
}

export async function disconnectClient(id: string): Promise<boolean> {
  const data = await graphql<{ disconnectClient: boolean }>('mutation($id: ID!) { disconnectClient(id: $id) }', { id });
  return data.disconnectClient;
}
