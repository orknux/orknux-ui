import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { hostedPageAddress, hostWireframe, unhostWireframe } from '../../api/wireframes';
import type { Wireframe } from '../../api/wireframes';
import form from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeExport.module.css';

/**
 * The wireframe editor's Host menu: the wireframe as an HTML page at an address
 * of its own, on the Artifacts page, that always serves the drawing as it is
 * saved - every save writes the page again, from this editor, the orknux_*
 * tools or the chat alike, so there is nothing to do again after a change.
 *
 * One button in the toolbar, as Export is, so it costs the bar one place on a
 * narrow window; what it holds - the address, copying it, opening it, stopping -
 * is in the menu under it. Reads "Hosted" while it is.
 */
export function WireframeHost({ wireframe, onChanged }: { wireframe: Wireframe | null; onChanged: (now: Wireframe) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="wireframe-host-menu"], [data-testid="wireframe-host"]') === null) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  const hostedAs = wireframe?.hostedAs ?? null;
  const address = hostedAs === null ? null : hostedPageAddress(hostedAs);

  async function act(doing: (id: string) => Promise<Wireframe>) {
    if (wireframe === null) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await doing(wireframe.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That did not work.'));
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
        disabled={wireframe === null || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={error ?? (hostedAs === null ? t('Host this wireframe as an HTML page') : `${t('Hosted as a page')}: ${hostedAs}`)}
        data-testid="wireframe-host"
        data-hosted={hostedAs === null ? 'false' : 'true'}
        data-artifact={hostedAs ?? undefined}
      >
        {busy ? t('Hosting…') : hostedAs === null ? t('Host page') : t('Hosted')} ▾
      </button>
      {open && (
        <div className={shell.exportItems} role="menu" data-testid="wireframe-host-menu">
          {hostedAs === null || address === null ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void act(hostWireframe);
              }}
              title={t('Give this wireframe a page on the Artifacts page that always shows it as it is saved here.')}
              data-testid="wireframe-host-start"
            >
              {t('Host as HTML page')}
            </button>
          ) : (
            <>
              <span className={styles.hostNote}>
                {t('Hosted as')}{' '}
                <Link to={`/workspace/${wireframe?.workspaceId ?? ''}/artifacts/${hostedAs}`} data-testid="wireframe-hosted-artifact">
                  {hostedAs}
                </Link>
                {' · '}
                {t('every save shows there.')}
              </span>
              <a className={styles.hostAddress} href={address} target="_blank" rel="noreferrer" data-testid="wireframe-hosted-link">
                {address}
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(address)
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => setError(t('The link could not be copied; select it and copy it instead.')));
                }}
                data-testid="wireframe-host-copy"
              >
                {copied ? t('Copied') : t('Copy link')}
              </button>
              <button type="button" role="menuitem" onClick={() => window.open(address, '_blank', 'noopener')} data-testid="wireframe-host-open">
                {t('Open page')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void act(unhostWireframe);
                }}
                title={t('Take the page off the Artifacts page; the wireframe stays here')}
                data-testid="wireframe-host-stop"
              >
                {t('Stop hosting')}
              </button>
            </>
          )}
        </div>
      )}
      {error !== null && (
        <span className={styles.error} role="alert" data-testid="wireframe-host-error">
          {error}
        </span>
      )}
    </div>
  );
}
