import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { createSheet, deleteSheet, fetchSheets, importSheet, renameSheet, SHEET_FILES } from '../../api/sheets';
import type { Sheet } from '../../api/sheets';
import { timeAgo } from '../../api/tools';
import { refuseOversized } from '../../api/uploads';
import penIcon from '../../assets/pen.svg';
import trashIcon from '../../assets/trash-grey.svg';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { t, tf } from '../../i18n';
import { shellUser } from '../../session/user';
import rail from '../workspace/WorkspaceMemoryPage.module.css';
import table from '../workspace/CatalogueTable.module.css';
import styles from './DesignSheetsPage.module.css';
import { dataUrl } from './DocumentImportMenu';

export interface DesignSheetsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const sheetPath = (workspaceId: string, id: string) => `/workspace/${workspaceId}/design/sheets/${id}`;

/**
 * The workspace's sheets, in Design beside its documents: a row for each, the
 * one worked on last first. New makes an empty one and opens it; Import makes
 * one from a workbook or a CSV, read on the server, formulas and all.
 */
export function DesignSheetsPage({ session, onSignOut }: DesignSheetsPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<{ done: number; of: number } | null>(null);
  const [naming, setNaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Sheet | null>(null);
  const [hunting, setHunting] = useState('');
  const picker = useRef<HTMLInputElement | null>(null);
  const sought = hunting.trim().toLowerCase();
  const shown = sheets === null || sought === '' ? sheets : sheets.filter((sheet) => sheet.name.toLowerCase().includes(sought));

  async function load() {
    try {
      setSheets(await fetchSheets(workspaceId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not load the sheets.'));
    }
  }

  useEffect(() => {
    if (workspaceId === '') return;
    let left = false;
    fetchSheets(workspaceId)
      .then((found) => {
        if (!left) setSheets(found);
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the sheets.'));
      });
    return () => {
      left = true;
    };
  }, [workspaceId]);

  async function make() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const made = await createSheet(workspaceId, t('Untitled sheet'));
      navigate(sheetPath(workspaceId, made.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not make the sheet.'));
    } finally {
      setBusy(false);
    }
  }

  async function importMany(files: File[]) {
    if (files.length === 0 || importing !== null) return;
    setError(null);
    const failed: string[] = [];
    for (const [at, file] of files.entries()) {
      setImporting({ done: at, of: files.length });
      try {
        await refuseOversized([file]);
        await importSheet(workspaceId, file.name, await dataUrl(file));
      } catch (cause) {
        failed.push(cause instanceof Error ? `${file.name} (${cause.message})` : file.name);
      }
    }
    setImporting(null);
    if (failed.length > 0) setError(tf('Could not import {names}', { names: failed.join(', ') }));
    await load();
  }

  async function rename() {
    if (naming === null) return;
    const held = naming;
    setNaming(null);
    const before = sheets?.find((one) => one.id === held.id);
    if (before === undefined || held.name.trim() === '' || held.name.trim() === before.name) return;
    try {
      const renamed = await renameSheet(held.id, held.name.trim());
      setSheets((all) => all?.map((one) => (one.id === renamed.id ? renamed : one)) ?? all);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the sheet.'));
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
          <h1 className={table.title}>{t('Sheets')}</h1>
          <p className={table.subtitle}>{t('Spreadsheets of cells and formulas, filled in by hand or by a model, in this workspace.')}</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.importButton}
            onClick={() => picker.current?.click()}
            disabled={importing !== null}
            title={t('Import .xlsx, .xls, .ods or .csv files as sheets')}
            data-testid="sheets-import"
          >
            {importing === null ? t('Import') : tf('Importing {done} of {of}…', { done: importing.done + 1, of: importing.of })}
          </button>
          <input
            ref={picker}
            type="file"
            accept={SHEET_FILES}
            multiple
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              void importMany(files);
            }}
            data-testid="sheets-import-file"
          />
          <button type="button" className={table.createButton} onClick={() => void make()} disabled={busy} data-testid="new-sheet">
            {t('+ New sheet')}
          </button>
        </div>
      </header>

      <SearchRow>
        <SearchBox value={hunting} onChange={setHunting} placeholder={t('Search sheets...')} label={t('Search sheets')} />
      </SearchRow>

      {error !== null && (
        <p className={table.pageError} role="alert">
          {error}
        </p>
      )}

      <div className={table.card}>
        <div className={table.tableHeader}>
          <span className={styles.colName}>{t('Name')}</span>
          <span className={styles.colCount}>{t('Tabs')}</span>
          <span className={styles.colCount}>{t('Cells')}</span>
          <span className={styles.colUpdated}>{t('Updated')}</span>
          <span className={styles.colActions}>{t('Actions')}</span>
        </div>
        {sheets === null && error === null && (
          <p className={table.notice}>
            <Loader />
          </p>
        )}
        {sheets?.length === 0 && (
          <p className={table.notice} data-testid="sheets-none">
            {t('No sheets yet.')}
          </p>
        )}
        {sheets !== null && sheets.length > 0 && shown?.length === 0 && (
          <p className={table.notice} data-testid="sheets-none-match">
            {t('No sheet matches what you typed.')}
          </p>
        )}
        {shown?.map((sheet) => (
          <div key={sheet.id} className={table.row} data-testid="sheet-row" data-sheet-id={sheet.id} data-name={sheet.name}>
            <span className={styles.colName}>
              {naming?.id === sheet.id ? (
                <input
                  className={styles.nameInput}
                  value={naming.name}
                  onChange={(event) => setNaming({ id: sheet.id, name: event.target.value })}
                  onBlur={() => void rename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void rename();
                    if (event.key === 'Escape') setNaming(null);
                  }}
                  aria-label={t('Name')}
                  autoFocus
                  data-testid="sheet-name-input"
                />
              ) : (
                <Link className={table.name} to={sheetPath(workspaceId, sheet.id)} data-testid="sheet-open">
                  {sheet.name}
                </Link>
              )}
            </span>
            <span className={styles.colCount}>{sheet.tabCount}</span>
            <span className={styles.colCount}>{sheet.cellCount}</span>
            <span className={styles.colUpdated} title={sheet.updatedAt}>
              {timeAgo(sheet.updatedAt)}
            </span>
            <span className={styles.colActions}>
              <button
                type="button"
                className={rail.iconButton}
                onClick={() => setNaming({ id: sheet.id, name: sheet.name })}
                aria-label={tf('Rename {name}', { name: sheet.name })}
                title={t('Rename')}
                data-testid="sheet-rename"
              >
                <img src={penIcon} alt="" width={14} height={14} />
              </button>
              <button
                type="button"
                className={rail.iconButton}
                onClick={() => setRemoving(sheet)}
                aria-label={tf('Remove {name}', { name: sheet.name })}
                title={t('Remove the sheet')}
                data-testid="sheet-remove"
              >
                <img src={trashIcon} alt="" width={14} height={14} />
              </button>
            </span>
          </div>
        ))}
      </div>

      <ConfirmDialog
        subject={removing?.name ?? null}
        kind="removeSheet"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteSheet(removing.id);
          setSheets((all) => all?.filter((one) => one.id !== removing.id) ?? all);
          setRemoving(null);
        }}
      />
    </AppShell>
  );
}
