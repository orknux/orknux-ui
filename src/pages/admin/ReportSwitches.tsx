import { useEffect, useState } from 'react';

import { fetchChatReviewsEnabled, fetchSessionRatingsEnabled, setChatReviews, setSessionRatings } from '../../api/ratings';
import { fetchUsageTracking, setUsageTracking } from '../../api/usage';
import type { UsageTracking } from '../../api/usage';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import styles from './AdminSettingsPage.module.css';

export interface ReportSwitchesProps {
  /** Where a switch that could not be read or changed says so: the page's own error line. */
  onError: (message: string) => void;
}

/**
 * Admin -> Settings -> Reports: what the reports have to read.
 *
 * They were on the Reports page, beside what they decide, and moved here with
 * every other switch an administrator makes for the installation; the reports
 * now only say when one is off and link to it. Each row's id is what that link
 * names. A switch takes effect as it is flipped, as every switch on this page
 * does, rather than waiting for the Save.
 */
export function ReportSwitches({ onError }: ReportSwitchesProps) {
  return (
    <>
      <ReportSwitch
        id="usage-tracking"
        heading={t('Usage tracking')}
        hint={t('Records who prompted every model call. Off records nothing at all; what was recorded stays readable.')}
        read={fetchUsageTracking}
        write={setUsageTracking}
        on={t('Turn usage tracking off')}
        off={t('Turn usage tracking on')}
        onError={onError}
      />
      {/* Two doors to the Ratings report, two switches: the agents' tool, and the chat's own menu. */}
      <ReportSwitch
        id="session-ratings"
        heading={t('Session ratings')}
        hint={t('Lets agents send Orknux the review a person gives a conversation. Off offers no agent the tool; what was sent stays readable.')}
        read={fetchSessionRatingsEnabled}
        write={setSessionRatings}
        on={t('Turn session ratings off')}
        off={t('Turn session ratings on')}
        onError={onError}
      />
      <ReportSwitch
        id="chat-reviews"
        heading={t('Chat reviews')}
        hint={t("Offers Send a review in the chat's + menu, so a person can review a chat without asking its agent.")}
        read={fetchChatReviewsEnabled}
        write={setChatReviews}
        on={t('Turn chat reviews off')}
        off={t('Turn chat reviews on')}
        onError={onError}
      />
    </>
  );
}

/** One switch: its name, whether it is on, and the press that changes it. Used beyond Reports too. */
export function ReportSwitch({ id, heading, hint, read, write, on, off, onError }: {
  id: string;
  heading: string;
  hint: string;
  read: () => Promise<UsageTracking>;
  write: (enabled: boolean) => Promise<UsageTracking>;
  /** What pressing it says while it is on, and while it is off. */
  on: string;
  off: string;
  onError: (message: string) => void;
}) {
  const [held, setHeld] = useState<UsageTracking | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    read()
      .then(setHeld)
      .catch((cause: unknown) => onError(cause instanceof Error ? cause.message : t('Could not load the settings.')));
  }, [read, onError]);

  async function flip() {
    if (held === null) return;
    setBusy(true);
    try {
      setHeld(await write(!held.enabled));
    } catch (cause: unknown) {
      onError(cause instanceof Error ? cause.message : t('Could not change the switch.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.setting} id={id}>
      <div className={styles.settingText}>
        <span className={styles.labelWithHint}>
          <p className={styles.settingLabel}>{heading}</p>
          <FieldHint label={heading}>{hint}</FieldHint>
        </span>
      </div>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => void flip()}
        disabled={busy || held === null}
        role="switch"
        aria-checked={held?.enabled ?? false}
        aria-label={held?.enabled ? on : off}
      >
        <img src={held?.enabled ? toggleOnIcon : toggleOffIcon} alt="" width={36} height={20} data-keeps-colour />
      </button>
    </div>
  );
}
