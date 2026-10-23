import { useEffect, useState } from 'react';

import { fetchTunables, setTunable } from '../../api/tunables';
import type { Tunable } from '../../api/tunables';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import styles from './TunablesSection.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface TunablesSectionProps {
  /** Told which of this section's numbers differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
}

/**
 * Admin -> Settings -> Limits: every number the server behaves by that is not a
 * setting of its own above. Issue #453.
 *
 * Drawn from the list the server answers rather than written out box by box, so
 * a number the server adds appears here the same day. The numbers go out with
 * the page's one Save, like every other number on it; going back to the
 * configured default is immediate, like a switch.
 */
export function TunablesSection({ onPending }: TunablesSectionProps) {
  const [tunables, setTunables] = useState<Tunable[] | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function hold(answer: Tunable[]) {
    setTunables(answer);
    setTyped(Object.fromEntries(answer.map((one) => [one.key, String(one.value)])));
  }

  /** One came back from a write: replace it, and its box, and leave the rest as typed. */
  function holdOne(answer: Tunable) {
    setTunables((held) => (held === null ? held : held.map((one) => (one.key === answer.key ? answer : one))));
    setTyped((was) => ({ ...was, [answer.key]: String(answer.value) }));
  }

  useEffect(() => {
    let abandoned = false;
    fetchTunables()
      .then((answer) => {
        if (!abandoned) hold(answer);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the limits.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    if (tunables === null) {
      onPending([]);
      return;
    }
    const writes: PendingWrite[] = [];
    for (const one of tunables) {
      const box = (typed[one.key] ?? '').trim();
      if (box !== '' && Number(box) !== one.value) {
        writes.push(async () => holdOne(await setTunable(one.key, Number(box))));
      }
    }
    onPending(writes);
  }, [tunables, typed, onPending]);

  async function backToDefault(one: Tunable) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      holdOne(await setTunable(one.key, null));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  // In the order the server lists them, which is the order of its sections.
  const sections: { title: string; section: string; items: Tunable[] }[] = [];
  for (const one of tunables ?? []) {
    const last = sections[sections.length - 1];
    if (last !== undefined && last.section === one.section) last.items.push(one);
    else sections.push({ title: one.sectionTitle, section: one.section, items: [one] });
  }

  return (
    <>
      <h2 id="limits" className={page.sectionHeading}>
        <span className={page.headingWithHint}>
          {t('Limits')}
          <FieldHint label={t('Limits')}>
            {t('The timeouts, retries and caps the server works within. Each starts at what its ORKNUX_TUNING_ variable says; a number set here wins, applies without a restart, and is audited.')}
          </FieldHint>
        </span>
      </h2>

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {sections.map((group) => (
        <div key={group.section} className={styles.group} data-tuning-section={group.section}>
          <h3 className={styles.groupHeading}>{t(group.title)}</h3>
          {group.items.map((one) => (
            <div key={one.key} className={page.setting} data-tunable={one.key}>
              <div className={page.settingText}>
                <span className={page.labelWithHint}>
                  <p className={page.settingLabel}>{t(one.label)}</p>
                  <FieldHint label={t(one.label)}>
                    {`${t(one.hint)} ${tf('Between {least} and {most}; {variable} sets the default, {configured}.', {
                      least: String(one.least),
                      most: String(one.most),
                      variable: one.variable,
                      configured: String(one.configured),
                    })}`}
                  </FieldHint>
                </span>
              </div>
              <div className={page.retention}>
                {one.set && one.value !== one.configured && (
                  <button
                    type="button"
                    className={styles.reset}
                    data-default
                    onClick={() => void backToDefault(one)}
                    disabled={busy}
                    aria-label={tf('Back to the default of {configured}', { configured: String(one.configured) })}
                  >
                    {tf('Default: {configured}', { configured: String(one.configured) })}
                  </button>
                )}
                <input
                  id={`tunable-${one.key}`}
                  name={one.key}
                  className={page.input}
                  type="number"
                  min={one.least}
                  max={one.most}
                  value={typed[one.key] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTyped((was) => ({ ...was, [one.key]: value }));
                  }}
                  disabled={busy}
                  aria-label={t(one.label)}
                />
                <span className={page.retentionUnit}>{t(one.unit)}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
