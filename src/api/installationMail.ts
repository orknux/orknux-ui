import { graphql } from './client';
import type { MailSecurity } from './integrations';

/** Where the server the installation sends its own mail through comes from. */
export type InstallationMailSource = 'STORED' | 'ENVIRONMENT' | 'NONE';

/**
 * The installation's mail server in force: what Admin Settings stored, or else
 * what ORKNUX_MAIL_* set. Never a workspace's connection, and never a password -
 * only whether one is set.
 */
export interface InstallationMail {
  source: InstallationMailSource;
  host: string | null;
  /** Null where the security's usual port is used. */
  port: number | null;
  username: string | null;
  from: string | null;
  security: MailSecurity | null;
  passwordSet: boolean;
  /** Who stored it; null unless the source is STORED. */
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface InstallationMailInput {
  host: string;
  port: number | null;
  username: string | null;
  /** Empty or null keeps the stored password. */
  password: string | null;
  from: string;
  security: MailSecurity;
}

/** What a test mail came to: sent, or what the mail server said. */
export interface InstallationMailTest {
  sent: boolean;
  to: string;
  message: string;
}

const FIELDS = 'source host port username from security passwordSet updatedBy updatedAt';

export async function fetchInstallationMail(): Promise<InstallationMail> {
  const data = await graphql<{ installationMail: InstallationMail }>(`query InstallationMail { installationMail { ${FIELDS} } }`);
  return data.installationMail;
}

export async function setInstallationMail(input: InstallationMailInput): Promise<InstallationMail> {
  const data = await graphql<{ setInstallationMail: InstallationMail }>(
    `mutation SetInstallationMail($input: InstallationMailInput!) { setInstallationMail(input: $input) { ${FIELDS} } }`,
    { input },
  );
  return data.setInstallationMail;
}

/** "Use environment settings": forgets what Admin Settings stored. */
export async function clearInstallationMail(): Promise<InstallationMail> {
  const data = await graphql<{ clearInstallationMail: InstallationMail }>(
    `mutation ClearInstallationMail { clearInstallationMail { ${FIELDS} } }`,
  );
  return data.clearInstallationMail;
}

/** Null or empty sends it to the caller's own address. */
export async function sendInstallationTestMail(to: string | null): Promise<InstallationMailTest> {
  const data = await graphql<{ sendInstallationTestMail: InstallationMailTest }>(
    `mutation SendInstallationTestMail($to: String) { sendInstallationTestMail(to: $to) { sent to message } }`,
    { to },
  );
  return data.sendInstallationTestMail;
}
