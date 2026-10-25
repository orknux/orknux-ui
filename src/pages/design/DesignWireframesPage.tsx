import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { createWireframe, deleteWireframe, elementsOf, fetchWireframes, renameWireframe } from '../../api/wireframes';
import type { Wireframe } from '../../api/wireframes';
import pencilIcon from '../../assets/pencil.svg';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { TrashIcon } from '../../components/TrashIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { t, tf } from '../../i18n';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import gallery from '../workspace/WorkspaceArtifactsPage.module.css';
import styles from './DesignWireframesPage.module.css';
import { WireframePreview } from './WireframeDrawing';

export interface DesignWireframesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * The workspace's wireframes, beside its images in Design. Issue #655.
 *
 * A card for each, drawn small from its own document, the one worked on last
 * first. Opening one goes to the editor; New makes an empty one and opens it
 * there, where it is named by clicking its title as a picture is.
 */
export function DesignWireframesPage({ session, onSignOut }: DesignWireframesPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const [wireframes, setWireframes] = useState<Wireframe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The card being renamed, and what is typed. */
  const [naming, setNaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Wireframe | null>(null);
  /** What the list is narrowed to: a name, or any words drawn on a wireframe. */
  const [hunting, setHunting] = useState('');
  const sought = hunting.trim().toLowerCase();
  const shown =
    wireframes === null || sought === ''
      ? wireframes
      : wireframes.filter(
          (wireframe) =>
            wireframe.name.toLowerCase().includes(sought) ||
            elementsOf(wireframe).some((element) => (element.text ?? '').toLowerCase().includes(sought)),
        );

  useEffect(() => {
    if (workspaceId === '') return;
    let left = false;
    fetchWireframes(workspaceId)
      .then((found) => {
        if (!left) setWireframes(found);
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the wireframes.'));
      });
    return () => {
      left = true;
    };
  }, [workspaceId]);

  const open = (id: string) => navigate(`/workspace/${workspaceId}/design/wireframes/${id}`);

  async function make() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const made = await createWireframe(workspaceId, t('Untitled wireframe'));
      open(made.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not make the wireframe.'));
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (naming === null) return;
    const held = naming;
    setNaming(null);
    const before = wireframes?.find((one) => one.id === held.id);
    if (before === undefined || held.name.trim() === '' || held.name.trim() === before.name) return;
    try {
      const renamed = await renameWireframe(held.id, held.name.trim());
      setWireframes((all) => all?.map((one) => (one.id === renamed.id ? renamed : one)) ?? all);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the wireframe.'));
    }
  }

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={table.header}>
        <div className={table.titleGroup}>
          <h1 className={table.title}>{t('Wireframes')}</h1>
          <p className={table.subtitle}>{t('Screens sketched by hand or drawn by a model, in this workspace.')}</p>
        </div>
        <button type="button" className={table.createButton} onClick={() => void make()} disabled={busy} data-testid="new-wireframe">
          {t('+ New wireframe')}
        </button>
      </header>

      <SearchRow>
        <SearchBox value={hunting} onChange={setHunting} placeholder={t('Search wireframes...')} label={t('Search wireframes')} />
      </SearchRow>

      {error !== null && (
        <p className={table.pageError} role="alert">
          {error}
        </p>
      )}

      <section className={table.card}>
        {wireframes === null && error === null && (
          <p className={table.notice}>
            <Loader />
          </p>
        )}
        {wireframes?.length === 0 && <p className={table.notice}>{t('No wireframes yet.')}</p>}
        {wireframes !== null && wireframes.length > 0 && shown?.length === 0 && (
          <p className={table.notice} data-testid="wireframe-none-match">
            {t('No wireframe matches what you typed.')}
          </p>
        )}
        {shown !== null && shown.length > 0 && (
          <div className={gallery.gallery} data-testid="wireframe-list">
            {shown.map((wireframe) => (
              <figure key={wireframe.id} className={gallery.card} data-testid="wireframe-card" data-wireframe-id={wireframe.id}>
                <button
                  type="button"
                  className={styles.thumb}
                  onClick={() => open(wireframe.id)}
                  aria-label={`${t('Open in editor')}: ${wireframe.name}`}
                  title={t('Open in editor')}
                  data-testid="wireframe-open"
                >
                  <WireframePreview elements={elementsOf(wireframe)} id={wireframe.id} workspaceId={wireframe.workspaceId} />
                </button>
                <figcaption className={`${gallery.caption} ${styles.caption}`}>
                  <div className={styles.nameRow}>
                    {naming?.id === wireframe.id ? (
                      <input
                        className={styles.nameInput}
                        value={naming.name}
                        onChange={(event) => setNaming({ id: wireframe.id, name: event.target.value })}
                        onBlur={() => void rename()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void rename();
                          if (event.key === 'Escape') setNaming(null);
                        }}
                        aria-label={t('Name')}
                        autoFocus
                        data-testid="wireframe-name-input"
                      />
                    ) : (
                      <span className={styles.name} title={wireframe.name} data-testid="wireframe-name">
                        {wireframe.name}
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => setNaming({ id: wireframe.id, name: wireframe.name })}
                      aria-label={t('Rename the wireframe')}
                      title={t('Rename the wireframe')}
                      data-testid="wireframe-rename"
                    >
                      <img src={pencilIcon} alt="" width={14} height={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => setRemoving(wireframe)}
                      aria-label={t('Remove the wireframe')}
                      title={t('Remove the wireframe')}
                      data-testid="wireframe-remove"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <span className={gallery.facts}>
                    {tf('{count} elements', { count: wireframe.elementCount })}
                    <span className={gallery.dot}>·</span>
                    {timeAgo(wireframe.updatedAt)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        subject={removing?.name ?? null}
        kind="removeWireframe"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteWireframe(removing.id);
          setWireframes((all) => all?.filter((one) => one.id !== removing.id) ?? all);
          setRemoving(null);
        }}
      />
    </AppShell>
  );
}
