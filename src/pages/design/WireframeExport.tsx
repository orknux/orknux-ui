import { useEffect, useState } from 'react';

import type { WireframeElement } from '../../api/wireframes';
import form from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeExport.module.css';
import { exportWireframe } from './wireframeFiles';
import type { WireframeExportFormat } from './wireframeFiles';

/** The formats, in the order the menu offers them; what each is said on hover. */
const FORMATS: { format: WireframeExportFormat; label: string; hint: () => string }[] = [
  { format: 'html', label: 'HTML', hint: () => t('One page, each frame a screen') },
  { format: 'svg', label: 'SVG', hint: () => t('The drawing as drawn, as a vector picture') },
  { format: 'png', label: 'PNG', hint: () => t('The drawing as drawn, as a picture') },
];

/**
 * The wireframe editor's Export menu: the drawing on the screen, saved or not,
 * as an HTML page, an SVG or a PNG named after the wireframe. The same menu,
 * and the same classes, as the image editor's.
 */
export function WireframeExport({ id, name, elements }: { id: string | null; name: string; elements: WireframeElement[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="wireframe-export-menu"], [data-testid="wireframe-export"]') === null) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  async function exportAs(format: WireframeExportFormat) {
    if (id === null) return;
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await exportWireframe(id, name, elements, format);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not export the wireframe.'));
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
        disabled={id === null || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={error ?? undefined}
        data-testid="wireframe-export"
      >
        {t('Export')} ▾
      </button>
      {open && (
        <div className={shell.exportItems} role="menu" data-testid="wireframe-export-menu">
          {FORMATS.map((one) => (
            <button
              key={one.format}
              type="button"
              role="menuitem"
              onClick={() => void exportAs(one.format)}
              title={one.hint()}
              data-testid={`wireframe-export-${one.format}`}
            >
              {one.label}
            </button>
          ))}
        </div>
      )}
      {error !== null && (
        <span className={styles.error} role="alert" data-testid="wireframe-export-error">
          {error}
        </span>
      )}
    </div>
  );
}
