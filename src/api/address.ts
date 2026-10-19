import { graphql } from './client';

/** Where the installation is reached from: what the links it writes are built on. */
export interface InstallationAddress {
  /** The address links are built on now; empty where none is set anywhere. */
  url: string;
  /** What Admin Settings set, or null where ORKNUX_BASE_URL rules. */
  stored: string | null;
  /** ORKNUX_BASE_URL. */
  configured: string;
}

const FIELDS = 'url stored configured';

export async function fetchInstallationAddress(): Promise<InstallationAddress> {
  const data = await graphql<{ installationAddress: InstallationAddress }>(`query InstallationAddress { installationAddress { ${FIELDS} } }`);
  return data.installationAddress;
}

/** Blank goes back to ORKNUX_BASE_URL. */
export async function setInstallationAddress(url: string): Promise<InstallationAddress> {
  const data = await graphql<{ setInstallationAddress: InstallationAddress }>(
    `mutation SetInstallationAddress($url: String) { setInstallationAddress(url: $url) { ${FIELDS} } }`,
    { url },
  );
  return data.setInstallationAddress;
}
