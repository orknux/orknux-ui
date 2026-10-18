import type { SessionUser } from '../api/session';
import type { AppShellUser } from '../components/AppShell';

/** e.g. ["ROLE_ADMINS", "ROLE_USERS"] -> "Admins". */
export function roleLabel(roles: string[]): string {
  const role = roles[0];
  if (role === undefined) return 'Member';
  const name = role.replace(/^ROLE_/, '').toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The signed-in user as the app shell's top bar wants it. */
export function shellUser(session: SessionUser): AppShellUser {
  // Their name where the installation has one - a directory's, or on the desktop app the person at the machine.
  const name = session.displayName?.trim() || session.username;
  return {
    name,
    role: roleLabel(session.roles),
    initials: name.slice(0, 2).toUpperCase(),
    email: session.email ?? undefined,
    // The shell decides for itself whether to offer the admin corner, rather
    // than believing whatever the page it is drawing happened to pass.
    admin: session.admin,
  };
}
