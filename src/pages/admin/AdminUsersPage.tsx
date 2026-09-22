import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { fetchUsers, initialsOf } from '../../api/users';
import type { AppUser } from '../../api/users';
import pencilIcon from '../../assets/pencil.svg';
import plusIcon from '../../assets/plus.svg';
import searchIcon from '../../assets/search.svg';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { ColumnHeader } from '../../components/ColumnHeader';
import { ordered, useTableSort } from '../../components/tableSort';
import { Loader } from '../../components/Loader';
import { shellUser } from '../../session/user';
import styles from './AdminUsersPage.module.css';
import { t } from '../../i18n';

export interface AdminUsersPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** How long typing has to pause before the search is asked. */
const SEARCH_PAUSE_MS = 300;

/**
 * Everybody this installation knows.
 *
 * Two kinds on one list, told apart by a badge. EXTERNAL is somebody the
 * identity provider vouches for - recorded when they sign in, and not editable
 * here because here is not where they are true. INTERNAL is somebody this
 * installation made up: an identity to assign and mention, edited and created
 * on this page. Neither kind is an account with a password; the front door
 * still belongs to the provider.
 */
/** What this list can be put in the order of. */
type UserColumn = 'USER' | 'EMAIL' | 'TYPE' | 'ROLES' | 'MODIFIED';

export function AdminUsersPage({ session, onSignOut }: AdminUsersPageProps) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  /*
   * Ordered here: the list arrives whole, because an installation's accounts are
   * a list an administrator reads rather than pages through. Issue #358.
   */
  const [order, ascending, sortBy] = useTableSort<UserColumn>('admin-users', 'USER', true, ['MODIFIED']);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** The accounts in the order a heading asked for; the name breaks every tie. */
  const arranged =
    users === null
      ? null
      : ordered(
          users,
          (user) => {
            if (order === 'EMAIL') return user.email ?? '';
            if (order === 'TYPE') return user.type;
            if (order === 'ROLES') return user.roles.length;
            if (order === 'MODIFIED') return user.lastModifiedAt;
            return user.displayName;
          },
          ascending,
          (user) => user.displayName,
        );

  useEffect(() => {
    let current = true;
    setLoading(true);
    // A pause, so the list follows the typing without a request per keystroke.
    const timer = window.setTimeout(() => {
      fetchUsers(search.trim() || undefined)
        .then((found) => {
          if (!current) return;
          setUsers(found);
          setError(null);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (!current) return;
          setError(cause instanceof Error ? cause.message : t('Could not load the users.'));
          setLoading(false);
        });
    }, SEARCH_PAUSE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <AppShell
      user={shellUser(session)}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<AdminSidebar active="users" />}
    >
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>{t('Users')}</h1>
            <p className={styles.subtitle}>
              {t('Everybody this installation knows — recorded at sign-in, or created here.')}
            </p>
          </div>
          <button type="button" className={styles.create} onClick={() => navigate('/admin/users/new')}>
            <img src={plusIcon} alt="" width={14} height={14} />
            {t('Add User')}
          </button>
        </header>

        <div className={styles.searchRow}>
          <img src={searchIcon} alt="" width={14} height={14} />
          <input
            className={styles.search}
            type="search"
            value={search}
            placeholder={t('Search by name…')}
            aria-label={t('Search users')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            {/*
              Pressable, every column that holds something. Issue #358. Roles is
              a set, so it orders by how many an account has and then by name -
              which puts the accounts nobody has given anything together, and is
              what somebody pressing it is looking for.
            */}
            <ColumnHeader
              label={t('User')}
              order="USER"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colUser}
            />
            <ColumnHeader
              label={t('Email')}
              order="EMAIL"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colEmail}
            />
            <ColumnHeader
              label={t('Type')}
              order="TYPE"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colType}
            />
            <ColumnHeader
              label={t('Roles')}
              order="ROLES"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colRoles}
            />
            <ColumnHeader
              label={t('Last Modified')}
              order="MODIFIED"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colModified}
            />
            <span className={styles.colActions} aria-hidden="true" />
          </div>

          {loading && (
            <p className={styles.notice}>
              <Loader />
            </p>
          )}
          {!loading && users?.length === 0 && (
            <p className={styles.notice}>
              {search.trim() === '' ? t('Nobody yet. Users appear when they sign in.') : t('Nobody by that name.')}
            </p>
          )}

          {!loading &&
            arranged?.map((user) => (
              <div key={user.id} className={styles.row}>
                <span className={styles.colUser}>
                  <span className={styles.avatar} aria-hidden="true">
                    {initialsOf(user.displayName)}
                  </span>
                  <span className={styles.names}>
                    <span className={styles.displayName}>{user.displayName}</span>
                    {user.displayName !== user.username && (
                      <span className={styles.username}>{user.username}</span>
                    )}
                  </span>
                </span>
                <span className={styles.colEmail} title={user.email ?? undefined}>
                  {user.email ?? '—'}
                </span>
                <span className={styles.colType}>
                  <span className={user.type === 'INTERNAL' ? styles.badgeInternal : styles.badgeExternal}>
                    {user.type === 'INTERNAL' ? 'Internal' : 'External'}
                  </span>
                </span>
                <span className={styles.colRoles}>
                  {user.roles.length === 0 ? '—' : user.roles.map((role) => role.name).join(', ')}
                </span>
                <span className={styles.colModified}>
                  {timeAgo(user.lastModifiedAt)} by {user.lastModifiedBy}
                </span>
                <span className={styles.colActions}>
                  {/*
                    Offered for both kinds now. What an external user's page
                    lets an administrator change is their address and nothing
                    else - everything else about them is the provider's, and an
                    edit here would lose at their next sign-in.
                  */}
                  <Link
                    className={styles.edit}
                    to={`/admin/users/${user.id}`}
                    aria-label={user.editable ? `Edit ${user.displayName}` : `Edit ${user.displayName}'s email`}
                    title={user.editable ? 'Edit' : t('Edit email')}
                  >
                    <img src={pencilIcon} alt="" width={14} height={14} />
                  </Link>
                </span>
              </div>
            ))}
        </div>
      </section>
    </AppShell>
  );
}
