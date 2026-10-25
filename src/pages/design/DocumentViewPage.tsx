import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { documentPath, fetchDocument } from '../../api/documents';
import type { DesignDocument } from '../../api/documents';
import type { SessionUser } from '../../api/session';
import pencilIcon from '../../assets/pencil.svg';
import searchIcon from '../../assets/search.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { t } from '../../i18n';
import { shellUser } from '../../session/user';
import shell from './DesignImageEditorPage.module.css';
import { DocumentExportMenu } from './DocumentExportMenu';
import { DocumentFind } from './DocumentFind';
import { DocumentPaper, geometryOf, useDocumentEditor } from './DocumentPaper';
import { NoteCard, useNoteHover } from './DocumentSelectionTools';
import { DocumentSide } from './DocumentSide';
import styles from './DocumentEditorPage.module.css';

export interface DocumentViewPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

export function DocumentViewRoute(props: DocumentViewPageProps) {
  const { documentId = '' } = useParams();
  return <DocumentViewPage key={documentId} {...props} />;
}

/**
 * A document to be read: its pages and nothing else - no formatting bar, no
 * chat, nothing that can change it - at an address of its own, so it can be
 * linked to and sent to anybody in the workspace. The same editor and the same
 * paper as the editor, made read-only, so what is read is what was written.
 * Find works here as it does there; Replace does not. Its outline and its
 * highlights are in the column on the left, and a highlight's note is read by
 * hovering it or pressing it - read, never changed or taken off.
 */
export function DocumentViewPage({ session, onSignOut }: DocumentViewPageProps) {
  const { workspaceId = '', documentId = '' } = useParams();
  const [held, setHeld] = useState<DesignDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const scope = useRef<HTMLDivElement | null>(null);
  const [noteOpen, setNoteOpen] = useNoteHover(scope);

  useEffect(() => {
    if (documentId === '') return;
    let left = false;
    fetchDocument(documentId)
      .then((found) => {
        if (left) return;
        if (found === null) setMissing(true);
        else setHeld(found);
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the document.'));
      });
    return () => {
      left = true;
    };
  }, [documentId]);

  const geometry = useMemo(() => geometryOf({ page: held?.page ?? { widthMm: 210, heightMm: 297, marginMm: 25 } }), [held]);
  const { editor, pages } = useDocumentEditor({ document: held, geometry, editable: false });

  if (missing) {
    return (
      <AppShell title={t('Document')} user={shellUser(session)} workspacePath={`/workspace/${workspaceId}`} showAdmin={session.admin} onSignOut={onSignOut} sidebar={null} hideSidebar>
        <p className={styles.missing}>
          {t('There is no such document here.')}{' '}
          <Link to={`/workspace/${workspaceId}/design/documents`} data-testid="missing-back">
            {t('Back to documents')}
          </Link>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={held?.name ?? t('Document')}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={null}
      hideSidebar
      fills
    >
      <div className={shell.toolbar}>
        <Link className={shell.back} to={`/workspace/${workspaceId}/design/documents`} data-testid="document-back">
          ← {t('Documents')}
        </Link>
        <span className={shell.toolbarTitle} data-testid="document-title">
          {held?.name ?? ''}
        </span>
        <div className={shell.toolbarRight}>
          <div className={styles.modes} role="group" aria-label={t('Mode')}>
            <Link className={styles.mode} to={documentPath(workspaceId, documentId)} data-testid="document-to-edit">
              <img src={pencilIcon} alt="" width={14} height={14} />
              {t('Edit')}
            </Link>
            <span className={`${styles.mode} ${styles.modeOn}`} aria-current="true">
              {t('View')}
            </span>
          </div>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button
            type="button"
            className={shell.tool}
            onClick={() => setFinding(true)}
            disabled={editor === null}
            title={t('Find')}
            aria-label={t('Find')}
            data-testid="document-find-open"
          >
            <img src={searchIcon} alt="" width={16} height={16} />
          </button>
          <DocumentExportMenu documentId={held?.id ?? null} name={held?.name ?? ''} />
        </div>
      </div>
      <div className={shell.editor}>
        <div className={styles.body}>
        {editor !== null && <DocumentSide editor={editor} scope={scope} tick={0} />}
        <div className={styles.canvas} ref={scope} tabIndex={-1} data-testid="document-view">
          <DocumentFind editor={editor} replacing={false} scope={scope} open={finding} onOpen={setFinding} />
          {held === null || editor === null ? (
            <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
          ) : (
            <div className={styles.desk}>
              <DocumentPaper editor={editor} geometry={geometry} pages={pages} />
            </div>
          )}
          {editor !== null && noteOpen !== null && (
            <NoteCard
              key={noteOpen.id}
              editor={editor}
              open={noteOpen}
              onPin={() => setNoteOpen({ ...noteOpen, pinned: true })}
              onClose={() => setNoteOpen(null)}
            />
          )}
        </div>
        </div>
      </div>
    </AppShell>
  );
}
