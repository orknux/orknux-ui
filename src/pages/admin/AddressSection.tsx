import { useEffect, useState } from 'react';

import { fetchInstallationAddress, setInstallationAddress } from '../../api/address';
import type { InstallationAddress } from '../../api/address';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import { withScheme } from '../../components/address';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface AddressSectionProps {
  /** Told when the box differs from the server's, so the page's Save can send it. */
  onPending: (writes: PendingWrite[]) => void;
  /** While the page is saving, so the box is not typed into mid-save. */
  busy?: boolean;
}

/**
 * Admin -> Settings -> Address: where this installation is reached from, which
 * every link it writes into a mail or an agent's answer is built on. Empty goes
 * back to ORKNUX_BASE_URL, shown as the placeholder.
 */
export function AddressSection({ onPending, busy = false }: AddressSectionProps) {
  const [held, setHeld] = useState<InstallationAddress | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  function hold(address: InstallationAddress) {
    setHeld(address);
    setTyped(address.stored ?? '');
  }

  useEffect(() => {
    let abandoned = false;
    fetchInstallationAddress()
      .then((address) => {
        if (!abandoned) hold(address);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the address.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    const wanted = typed.trim().replace(/\/+$/, '');
    if (held === null || wanted === (held.stored ?? '')) {
      onPending([]);
      return;
    }
    onPending([
      async () => {
        setError(null);
        try {
          hold(await setInstallationAddress(wanted));
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      },
    ]);
  }, [held, typed, onPending]);

  return (
    <>
      <h2 id="address" className={page.sectionHeading}>
        {t('Address')}
      </h2>

      {error !== null && (
        <p className={`${page.notice} ${page.noticeError}`} role="alert">
          {error}
        </p>
      )}

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('Where this installation is reached from')}</p>
            <FieldHint label={t('Where this installation is reached from')}>
              {t('Every link the server writes into something that leaves it is built on this: password reset mails, issue notifications, and the links agents paste into Slack. Leave it empty for the address in ORKNUX_BASE_URL, shown greyed out.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="installation-address"
            name="installationAddress"
            className={`${page.input} ${page.wideInput}`}
            type="text"
            inputMode="url"
            spellCheck={false}
            placeholder={held?.configured ?? ''}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => setTyped(withScheme(typed))}
            disabled={busy || held === null}
            aria-label={t('Where this installation is reached from')}
          />
        </div>
      </div>
    </>
  );
}
