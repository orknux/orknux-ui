import { useEffect, useState } from 'react';

import { documentExportUrl } from '../../api/documents';
import type { DocumentFormat } from '../../api/documents';
import form from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeExport.module.css';

/** The formats, in the order the menu offers them; what each is said on hover. */
const FORMATS: { format: DocumentFormat; label: string; hint: () => string }[] = [
  { format: 'pdf', label: 'PDF', hint: () => t('Its pages, as they print') },
  { format: 'md', label: 'Markdown', hint: () => t('Its text, with its pictures beside it in a zip') },
  { format: 'odt', label: 'ODT', hint: () => t('A text document for LibreOffice, Word or Google Docs') },
  { format: 'ods', label: 'ODS', hint: () => t('Each table on a sheet of a spreadsheet') },
];

/**
 * A document's Export menu: written out on the server, so an export is the
 * same file an agent gets from orknux_document_export. What is on the screen
 * is saved first - the server writes out what it holds - and the file is then
 * downloaded from its address. The wireframe editor's menu and classes.
 */
export function DocumentExportMenu({
  documentId,
  name,
  beforeExport,
}: {
  documentId: string | null;
  name: string;
  /** Saves what is on the screen; false where it could not be. */
  beforeExport?: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="document-export-menu"], [data-testid="document-export"]') === null) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  async function exportAs(format: DocumentFormat) {
    if (documentId === null) return;
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      if (beforeExport !== undefined && !(await beforeExport())) {
        setError(t('Could not save the document before exporting it.'));
        return;
      }
      const link = window.document.createElement('a');
      link.href = documentExportUrl(documentId, format);
      link.download = name;
      link.rel = 'noopener';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shell.exportMenu}>
      <button
        type="button"
        className={`${form.ghost} ${shell.toolbarButton}`}
        onClick={() => {
          setError(null);
          setOpen((held) => !held);
        }}
        disabled={documentId === null || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={error ?? undefined}
        data-testid="document-export"
      >
        {t('Export')} ▾
      </button>
      {open && (
        <div className={shell.exportItems} role="menu" data-testid="document-export-menu">
          {FORMATS.map((one) => (
            <button
              key={one.format}
              type="button"
              role="menuitem"
              onClick={() => void exportAs(one.format)}
              title={one.hint()}
              data-testid={`document-export-${one.format}`}
            >
              {one.label}
            </button>
          ))}
        </div>
      )}
      {error !== null && (
        <span className={styles.error} role="alert" data-testid="document-export-error">
          {error}
        </span>
      )}
    </div>
  );
}
