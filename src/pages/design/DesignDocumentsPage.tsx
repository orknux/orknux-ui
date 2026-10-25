import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  createDocument,
  createDocumentCatalog,
  deleteDocument,
  deleteDocumentCatalog,
  documentPath,
  fetchDocumentCatalogs,
  fetchDocuments,
  moveDocument,
  renameDocument,
  renameDocumentCatalog,
} from '../../api/documents';
import type { DesignDocument, DocumentCatalog } from '../../api/documents';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import eyeIcon from '../../assets/eye.svg';
import fileTextIcon from '../../assets/file-text.svg';
import folderOpenIcon from '../../assets/folder-open.svg';
import folderIcon from '../../assets/folder.svg';
import penIcon from '../../assets/pen.svg';
import plusIcon from '../../assets/plus.svg';
import searchIcon from '../../assets/search.svg';
import trashIcon from '../../assets/trash-grey.svg';
import { AppShell } from '../../components/AppShell';
import { CatalogNameDialog } from '../../components/CatalogNameDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { MoveToCatalog } from '../../components/MoveToCatalog';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { t, tf } from '../../i18n';
import { shellUser } from '../../session/user';
import rail from '../workspace/WorkspaceMemoryPage.module.css';
import table from '../workspace/CatalogueTable.module.css';
import styles from './DesignDocumentsPage.module.css';

export interface DesignDocumentsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** How long the box waits for the typing to stop before the server is asked. */
const SEARCH_PAUSE_MS = 250;

/** The rail's own row for every catalog at once; not a catalog id. */
const ALL = 'all';

/**
 * The workspace's documents, in Design beside its wireframes: catalogs down the
 * left, as the memory page has them, and the documents of the one chosen - or
 * of all of them - on the right, the one worked on last first.
 *
 * The search is the server's and reads the words in a document as well as its
 * name, since what somebody remembers of a document is as often what it said.
 * New makes an empty document in the catalog being looked at and opens it in
 * the editor; the eye opens it to be read.
 */
export function DesignDocumentsPage({ session, onSignOut }: DesignDocumentsPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const [addressed] = useSearchParams();
  const [catalogs, setCatalogs] = useState<DocumentCatalog[] | null>(null);
  const [selected, setSelected] = useState<string>(() => addressed.get('catalog') ?? ALL);
  const [documents, setDocuments] = useState<DesignDocument[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The row being renamed, and what is typed. */
  const [naming, setNaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<DesignDocument | null>(null);
  const [removingCatalog, setRemovingCatalog] = useState<DocumentCatalog | null>(null);
  /** The catalog dialog: a new one, or the one being renamed. */
  const [catalogDialog, setCatalogDialog] = useState<{ renaming: DocumentCatalog | null } | null>(null);
  /** Bumped after a change, so the list is asked again. */
  const [revision, setRevision] = useState(0);

  const current = catalogs?.find((catalog) => catalog.id === selected) ?? null;

  const loadCatalogs = useCallback(async () => {
    const found = await fetchDocumentCatalogs(workspaceId);
    setCatalogs(found);
    setSelected((present) => (present === ALL || found.some((one) => one.id === present) ? present : ALL));
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId === '') return;
    loadCatalogs().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the document catalogs.')));
  }, [loadCatalogs, workspaceId]);

  useEffect(() => {
    if (workspaceId === '') return;
    let stale = false;
    const pause = window.setTimeout(
      () => {
        fetchDocuments(workspaceId, selected === ALL ? null : selected, search)
          .then((found) => {
            if (!stale) setDocuments(found);
          })
          .catch((cause: unknown) => {
            if (!stale) setError(cause instanceof Error ? cause.message : t('Could not load the documents.'));
          });
      },
      search.trim() === '' ? 0 : SEARCH_PAUSE_MS,
    );
    return () => {
      stale = true;
      window.clearTimeout(pause);
    };
  }, [workspaceId, selected, search, revision]);

  async function guard(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That did not work.'));
    }
  }

  async function changed() {
    setRevision((present) => present + 1);
    await loadCatalogs();
  }

  async function make() {
    if (busy) return;
    setBusy(true);
    await guard(async () => {
      const made = await createDocument(workspaceId, t('Untitled document'), selected === ALL ? null : selected);
      navigate(documentPath(workspaceId, made.id));
    });
    setBusy(false);
  }

  async function rename() {
    if (naming === null) return;
    const held = naming;
    setNaming(null);
    const before = documents?.find((one) => one.id === held.id);
    if (before === undefined || held.name.trim() === '' || held.name.trim() === before.name) return;
    await guard(async () => {
      const renamed = await renameDocument(held.id, held.name.trim());
      setDocuments((all) => all?.map((one) => (one.id === renamed.id ? renamed : one)) ?? all);
    });
  }

  const searching = search.trim() !== '';
  const heading = current?.name ?? t('All documents');

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <div className={rail.split}>
        <aside className={rail.catalogs} data-testid="document-catalogs">
          <header className={rail.catalogsHeader}>
            <p className={rail.catalogsTitle}>{t('DOCUMENT CATALOGS')}</p>
            <button
              type="button"
              className={rail.newCatalog}
              onClick={() => setCatalogDialog({ renaming: null })}
              aria-label={t('New catalog')}
              title={t('New catalog')}
              data-testid="new-document-catalog"
            >
              <img src={plusIcon} alt="" width={10} height={10} />
            </button>
          </header>

          <div className={rail.railSearch}>
            <img src={searchIcon} alt="" width={14} height={14} />
            <input
              className={rail.searchInput}
              type="search"
              placeholder={t('Search documents...')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={t('Search documents')}
              data-testid="document-search"
            />
          </div>

          <div className={rail.catalogsList}>
            <button
              type="button"
              className={selected === ALL ? rail.catalogCurrent : rail.catalog}
              onClick={() => setSelected(ALL)}
              aria-current={selected === ALL ? 'true' : undefined}
              data-testid="document-catalog-row"
              data-catalog={ALL}
            >
              <img src={fileTextIcon} alt="" width={14} height={14} />
              <span className={rail.catalogName}>{t('All documents')}</span>
              <span className={selected === ALL ? rail.countCurrent : rail.count}>
                {catalogs?.reduce((sum, one) => sum + one.documentCount, 0) ?? ''}
              </span>
            </button>
            {catalogs === null && (
              <p className={rail.sidebarNote}>
                <Loader />
              </p>
            )}
            {catalogs?.map((catalog) => {
              const open = catalog.id === selected;
              return (
                <button
                  key={catalog.id}
                  type="button"
                  className={open ? rail.catalogCurrent : rail.catalog}
                  onClick={() => setSelected(catalog.id)}
                  aria-current={open ? 'true' : undefined}
                  data-testid="document-catalog-row"
                  data-catalog={catalog.name}
                >
                  <img src={open ? folderOpenIcon : folderIcon} alt="" width={14} height={14} />
                  <span className={rail.catalogName}>{catalog.name}</span>
                  <span className={open ? rail.countCurrent : rail.count}>{catalog.documentCount}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={rail.panel}>
          <header className={rail.catalogHeader}>
            <h1 className={rail.catalogHeading} data-testid="document-catalog-heading">
              {heading}
            </h1>
            {current !== null && (
              <div className={rail.catalogActions}>
                <button
                  type="button"
                  className={rail.iconButton}
                  onClick={() => setCatalogDialog({ renaming: current })}
                  aria-label={tf('Rename {name}', { name: current.name })}
                  title={t('Rename')}
                  data-testid="rename-document-catalog"
                >
                  <img src={penIcon} alt="" width={14} height={14} />
                </button>
                <button
                  type="button"
                  className={rail.iconButton}
                  onClick={() => setRemovingCatalog(current)}
                  aria-label={tf('Delete {name}', { name: current.name })}
                  title={t('Delete')}
                  data-testid="delete-document-catalog"
                >
                  <img src={trashIcon} alt="" width={14} height={14} />
                </button>
              </div>
            )}
            <button
              type="button"
              className={`${table.createButton} ${styles.newDocument}`}
              onClick={() => void make()}
              disabled={busy}
              data-testid="new-document"
            >
              {t('+ New document')}
            </button>
          </header>
          <div className={rail.rule} />

          {error !== null && (
            <p className={table.pageError} role="alert" data-testid="documents-error">
              {error}
            </p>
          )}

          <div className={table.card}>
            <div className={table.tableHeader}>
              <span className={styles.colName}>{t('Name')}</span>
              {selected === ALL && <span className={styles.colCatalog}>{t('Catalog')}</span>}
              <span className={styles.colWords}>{t('Words')}</span>
              <span className={styles.colUpdated}>{t('Updated')}</span>
              <span className={styles.colActions}>{t('Actions')}</span>
            </div>
            {documents === null && (
              <p className={table.notice}>
                <Loader />
              </p>
            )}
            {documents?.length === 0 && (
              <p className={table.notice} data-testid="documents-none">
                {searching ? t('No document matches what you typed.') : t('No documents yet.')}
              </p>
            )}
            {documents?.map((document) => (
              <div key={document.id} className={table.row} data-testid="document-row" data-document-id={document.id} data-name={document.name}>
                <span className={styles.colName}>
                  {naming?.id === document.id ? (
                    <input
                      className={styles.nameInput}
                      value={naming.name}
                      onChange={(event) => setNaming({ id: document.id, name: event.target.value })}
                      onBlur={() => void rename()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void rename();
                        if (event.key === 'Escape') setNaming(null);
                      }}
                      aria-label={t('Name')}
                      autoFocus
                      data-testid="document-name-input"
                    />
                  ) : (
                    <Link className={table.name} to={documentPath(workspaceId, document.id)} data-testid="document-open">
                      {document.name}
                    </Link>
                  )}
                  {document.excerpt !== '' && <span className={styles.excerpt}>{document.excerpt}</span>}
                </span>
                {selected === ALL && (
                  <span className={styles.colCatalog} data-testid="document-catalog">
                    {document.catalogName}
                  </span>
                )}
                <span className={styles.colWords}>{document.words}</span>
                <span className={styles.colUpdated} title={document.updatedAt}>
                  {timeAgo(document.updatedAt)}
                </span>
                <span className={styles.colActions}>
                  <Link
                    className={rail.iconButton}
                    to={documentPath(workspaceId, document.id, true)}
                    aria-label={tf('View {name}', { name: document.name })}
                    title={t('View')}
                    data-testid="document-view"
                  >
                    <img src={eyeIcon} alt="" width={14} height={14} />
                  </Link>
                  <button
                    type="button"
                    className={rail.iconButton}
                    onClick={() => setNaming({ id: document.id, name: document.name })}
                    aria-label={tf('Rename {name}', { name: document.name })}
                    title={t('Rename')}
                    data-testid="document-rename"
                  >
                    <img src={penIcon} alt="" width={14} height={14} />
                  </button>
                  <MoveToCatalog
                    name={document.name}
                    catalogs={catalogs ?? []}
                    currentCatalogId={document.catalogId}
                    className={rail.iconButton}
                    move={(target) => moveDocument(document.id, target)}
                    onMoved={() => guard(changed)}
                  />
                  <button
                    type="button"
                    className={rail.iconButton}
                    onClick={() => setRemoving(document)}
                    aria-label={tf('Delete {name}', { name: document.name })}
                    title={t('Delete')}
                    data-testid="document-delete"
                  >
                    <img src={trashIcon} alt="" width={14} height={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <CatalogNameDialog
        open={catalogDialog !== null}
        title={catalogDialog?.renaming === null ? t('New catalog') : t('Rename the catalog')}
        message={t('Documents are filed in catalogs.')}
        submitLabel={catalogDialog?.renaming === null ? t('Create') : t('Rename')}
        initialName={catalogDialog?.renaming?.name ?? ''}
        onClose={() => setCatalogDialog(null)}
        onSubmit={async (name) => {
          const renaming = catalogDialog?.renaming ?? null;
          if (renaming === null) {
            const made = await createDocumentCatalog(workspaceId, name);
            setSelected(made.id);
          } else {
            await renameDocumentCatalog(renaming.id, name);
          }
          setCatalogDialog(null);
          await loadCatalogs();
        }}
      />

      <ConfirmDialog
        subject={removing?.name ?? null}
        kind="removeDocument"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteDocument(removing.id);
          setRemoving(null);
          await changed();
        }}
      />

      <ConfirmDialog
        subject={removingCatalog?.name ?? null}
        kind="removeDocumentCatalog"
        onClose={() => setRemovingCatalog(null)}
        onConfirm={async () => {
          if (removingCatalog === null) return;
          await deleteDocumentCatalog(removingCatalog.id);
          setRemovingCatalog(null);
          setSelected(ALL);
          await changed();
        }}
      />
    </AppShell>
  );
}
