import { useEffect, useRef, useState } from 'react';

import { fetchWorkspaceArtifacts } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import dialog from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import styles from './DesignPicturePickerDialog.module.css';

export interface DesignPicturePickerDialogProps {
  open: boolean;
  workspaceId: string;
  /** What the window is for, as its title says: Import, Add layer. */
  title: string;
  onClose: () => void;
  onPick: (picture: Artifact) => void;
}

/** How many artifacts one page asks for; a page may hold fewer pictures, since documents are among them. */
const PAGE = 48;

/**
 * A picture already in Orknux, chosen by its thumbnail: Design's own and the
 * rest of the Artifacts page - what runs, tasks and agents drew or kept.
 *
 * Asked of the Artifacts list rather than of Design's gallery alone, because a
 * picture an agent saved is just as much a picture to work on; what is not a
 * picture is left off, and unsaved versions are on no list at all.
 */
export function DesignPicturePickerDialog({ open, workspaceId, title, onClose, onPick }: DesignPicturePickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Artifact[] | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const shown = dialogRef.current;
    if (shown === null) return;
    if (open && !shown.open) shown.showModal();
    else if (!open && shown.open) shown.close();
  }, [open]);

  // Asked of the server rather than sieved here: the list is paged, and a match on page four would be missed.
  useEffect(() => {
    if (!open) return;
    let left = false;
    const asked = window.setTimeout(() => {
      fetchWorkspaceArtifacts(workspaceId, page, PAGE, search)
        .then((answer) => {
          if (left) return;
          const pictures = answer.content.filter((one) => one.contentType.startsWith('image/') && one.versionOf === null);
          setFound((held) => (page === 0 || held === null ? pictures : [...held, ...pictures]));
          setPages(answer.totalPages);
          setError(null);
        })
        .catch((cause) => {
          if (left) return;
          setFound([]);
          setError(cause instanceof Error ? cause.message : t('Could not list the pictures.'));
        });
    }, page === 0 ? 250 : 0);
    return () => {
      left = true;
      window.clearTimeout(asked);
    };
  }, [open, workspaceId, search, page]);

  return (
    <dialog ref={dialogRef} className={`${dialog.dialog} ${styles.picker}`} onCancel={onClose} onClose={onClose} data-testid="picture-picker">
      <div className={dialog.body}>
        <header className={dialog.header}>
          <h2 className={dialog.title}>{title}</h2>
        </header>
        <div className={dialog.inputWrapper}>
          <input
            className={dialog.input}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder={t('Search')}
            aria-label={t('Search')}
            autoFocus
            data-testid="picture-picker-search"
          />
        </div>
        {found === null ? (
          <p className={dialog.dialogMessage}>{t('Loading…')}</p>
        ) : found.length === 0 ? (
          <p className={dialog.dialogMessage} data-testid="picture-picker-none">
            {error ?? t('No pictures found.')}
          </p>
        ) : (
          <div className={styles.grid} data-testid="picture-picker-grid">
            {found.map((one) => (
              <button
                key={one.id}
                type="button"
                className={styles.item}
                onClick={() => onPick(one)}
                title={one.name ?? one.prompt}
                data-testid="picture-picker-item"
                data-id={one.id}
              >
                <img src={one.url} alt={one.name ?? one.prompt} loading="lazy" />
                <span className={styles.caption}>{one.name ?? one.prompt}</span>
              </button>
            ))}
          </div>
        )}
        <div className={dialog.actions}>
          {page + 1 < pages && (
            <button type="button" className={dialog.ghost} onClick={() => setPage((held) => held + 1)} data-testid="picture-picker-more">
              {t('Show more')}
            </button>
          )}
          <button type="button" className={dialog.ghost} onClick={onClose}>
            {t('Cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
