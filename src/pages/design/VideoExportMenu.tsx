import { useEffect, useState } from 'react';

import { exportDesignVideo } from '../../api/videos';
import type { VideoExportFormat } from '../../api/videos';
import form from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeExport.module.css';

/** The formats, in the order the menu offers them; what each is said on hover. */
const FORMATS: { format: VideoExportFormat; label: string; hint: () => string }[] = [
  { format: 'GIF', label: 'GIF', hint: () => t('A moving picture, without its sound') },
  { format: 'MP4', label: 'MP4', hint: () => t('With its sound, for nearly any player') },
  { format: 'MKV', label: 'MKV', hint: () => t('With its sound, in a Matroska file') },
];

/**
 * The video editor's Export menu: a finished video converted on the server,
 * and then downloaded from the address it answers, named after the video.
 * Converted before the download starts, so a refusal - too long, too large -
 * is said under the button rather than arriving as a broken file. The
 * document and wireframe editors' menu and classes.
 */
export function VideoExportMenu({ workspaceId, videoId }: { workspaceId: string; videoId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="video-export-menu"], [data-testid="video-export"]') === null) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  async function exportAs(format: VideoExportFormat) {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      const exported = await exportDesignVideo(workspaceId, videoId, format);
      const link = window.document.createElement('a');
      link.href = exported.url;
      link.download = exported.filename;
      link.rel = 'noopener';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not export the video.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shell.exportMenu}>
      <button
        type="button"
        /* As tall as Upscale and Download beside it: this bar's own height, not the image editor's. */
        className={form.ghost}
        onClick={() => {
          setError(null);
          setOpen((held) => !held);
        }}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy}
        title={error ?? undefined}
        data-testid="video-export"
      >
        {busy ? t('Exporting…') : `${t('Export')} ▾`}
      </button>
      {open && (
        <div className={shell.exportItems} role="menu" data-testid="video-export-menu">
          {FORMATS.map((one) => (
            <button
              key={one.format}
              type="button"
              role="menuitem"
              onClick={() => void exportAs(one.format)}
              title={one.hint()}
              data-testid={`video-export-${one.format.toLowerCase()}`}
            >
              {one.label}
            </button>
          ))}
        </div>
      )}
      {error !== null && (
        <span className={styles.error} role="alert" title={error} data-testid="video-export-error">
          {error}
        </span>
      )}
    </div>
  );
}
