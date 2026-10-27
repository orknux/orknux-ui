import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  clearInstallationMail,
  fetchInstallationMail,
  sendInstallationTestMail,
  setInstallationMail,
} from '../../api/installationMail';
import type { InstallationMail, InstallationMailTest } from '../../api/installationMail';
import type { MailSecurity } from '../../api/integrations';
import { FieldHint } from '../../components/FieldHint';
import { Select } from '../../components/Select';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import styles from './MailSection.module.css';
import type { PendingWrite } from './LogLevelsSection';

/** How the session with the mail server is secured, and the port each one listens on. */
const SECURITY: { value: MailSecurity; label: string; port: number }[] = [
  { value: 'STARTTLS', label: 'STARTTLS', port: 587 },
  { value: 'TLS', label: t('TLS (implicit)'), port: 465 },
  { value: 'NONE', label: t('None'), port: 25 },
];

/** What the boxes hold, as typed. */
interface Form {
  host: string;
  port: string;
  security: MailSecurity;
  username: string;
  password: string;
  from: string;
}

/**
 * What the boxes start from: a stored server's own values, or empty boxes over
 * the environment's, which are shown greyed out as placeholders - the Address
 * section's arrangement, so a box left empty reads as "what ORKNUX_MAIL_* says".
 */
function formOf(held: InstallationMail): Form {
  const stored = held.source === 'STORED';
  return {
    host: stored ? (held.host ?? '') : '',
    port: stored && held.port !== null ? String(held.port) : '',
    security: held.security ?? 'STARTTLS',
    username: stored ? (held.username ?? '') : '',
    password: '',
    from: stored ? (held.from ?? '') : '',
  };
}

function same(a: Form, b: Form): boolean {
  return (
    a.host.trim() === b.host.trim() &&
    a.port.trim() === b.port.trim() &&
    a.security === b.security &&
    a.username.trim() === b.username.trim() &&
    a.password === '' &&
    b.password === '' &&
    a.from.trim() === b.from.trim()
  );
}

export interface MailSectionProps {
  /** Told when the boxes differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
  /** While the page is saving, so the boxes are not typed into mid-save. */
  busy?: boolean;
  /** The signed-in administrator's own address, where a test mail goes unless another is typed. */
  ownAddress?: string | null;
}

/**
 * Admin -> Settings -> Mail: the server this installation sends its own mail
 * through - password resets and issue news. What is stored here wins over
 * ORKNUX_MAIL_*; "Use environment settings" forgets it. The fields go out with
 * the page's one Save; Test sits on the line below, where its answer is shown.
 */
export function MailSection({ onPending, busy = false, ownAddress = null }: MailSectionProps) {
  const [held, setHeld] = useState<InstallationMail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [recipient, setRecipient] = useState(ownAddress ?? '');
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<InstallationMailTest | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  function hold(mail: InstallationMail) {
    setHeld(mail);
    setForm(formOf(mail));
  }

  useEffect(() => {
    let abandoned = false;
    fetchInstallationMail()
      .then((mail) => {
        if (!abandoned) hold(mail);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the mail server.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  const dirty = held !== null && form !== null && !same(form, formOf(held));

  useEffect(() => {
    if (held === null || form === null || !dirty) {
      onPending([]);
      return;
    }
    onPending([
      async () => {
        setError(null);
        const port = form.port.trim();
        try {
          hold(
            await setInstallationMail({
              host: form.host.trim(),
              port: port === '' ? null : Number(port),
              username: form.username.trim() === '' ? null : form.username.trim(),
              password: form.password === '' ? null : form.password,
              from: form.from.trim(),
              security: form.security,
            }),
          );
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      },
    ]);
  }, [held, form, dirty, onPending]);

  function change(patch: Partial<Form>) {
    setForm((now) => (now === null ? now : { ...now, ...patch }));
  }

  async function useEnvironment() {
    setClearing(true);
    setError(null);
    try {
      hold(await clearInstallationMail());
      setTested(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setClearing(false);
    }
  }

  async function test() {
    setTesting(true);
    setTested(null);
    setTestError(null);
    try {
      setTested(await sendInstallationTestMail(recipient.trim() === '' ? null : recipient.trim()));
    } catch (cause: unknown) {
      setTestError(cause instanceof Error ? cause.message : t('The test mail could not be sent.'));
    } finally {
      setTesting(false);
    }
  }

  const locked = busy || clearing || held === null;
  const environment = held !== null && held.source === 'ENVIRONMENT' ? held : null;
  const usualPort = SECURITY.find((one) => one.value === form?.security)?.port ?? 587;

  const source =
    held === null
      ? ''
      : held.source === 'STORED'
        ? tf('Set here by {user}', { user: held.updatedBy ?? '' })
        : held.source === 'ENVIRONMENT'
          ? t('From the environment, ORKNUX_MAIL_*')
          : t('None: no password reset or issue mail is sent');

  return (
    <>
      <h2 id="mail" className={page.sectionHeading}>
        <span className={page.headingWithHint}>
          {t('Mail')}
          <FieldHint label={t('Mail')}>
            {t('The server this installation sends its own mail through: password resets and issue news. What is set here wins over the ORKNUX_MAIL_* environment variables.')}
          </FieldHint>
        </span>
      </h2>

      {error !== null && (
        <p className={`${page.notice} ${page.noticeError}`} role="alert" data-mail-error="">
          {error}
        </p>
      )}

      <div className={page.setting}>
        <div className={page.settingText}>
          <p className={page.settingLabel}>{t('In use')}</p>
        </div>
        <div className={page.retention}>
          <span className={styles.source} data-mail-source={held?.source ?? ''}>
            {source}
          </span>
          {held?.source === 'STORED' && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void useEnvironment()}
              disabled={locked}
              data-mail-use-environment=""
            >
              {t('Use environment settings')}
            </button>
          )}
        </div>
      </div>

      <MailField label={t('Host')}>
        <input
          id="mail-host"
          name="mailHost"
          className={`${page.input} ${page.wideInput}`}
          type="text"
          spellCheck={false}
          placeholder={environment?.host ?? 'smtp.example.com'}
          value={form?.host ?? ''}
          onChange={(event) => change({ host: event.target.value })}
          disabled={locked}
          aria-label={t('Host')}
        />
      </MailField>

      <MailField label={t('Port')}>
        <input
          id="mail-port"
          name="mailPort"
          className={page.input}
          type="number"
          min={1}
          max={65535}
          placeholder={String(environment?.port ?? usualPort)}
          value={form?.port ?? ''}
          onChange={(event) => change({ port: event.target.value })}
          disabled={locked}
          aria-label={t('Port')}
        />
      </MailField>

      <MailField label={t('Security')}>
        <Select
          id="mail-security"
          name="mailSecurity"
          className={page.input}
          value={form?.security ?? 'STARTTLS'}
          onChange={(picked) => change({ security: picked as MailSecurity })}
          disabled={locked}
          aria-label={t('Security')}
        >
          {SECURITY.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </Select>
      </MailField>

      <MailField label={t('Username')}>
        <input
          id="mail-username"
          name="mailUsername"
          className={`${page.input} ${page.wideInput}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={environment?.username ?? ''}
          value={form?.username ?? ''}
          onChange={(event) => change({ username: event.target.value })}
          disabled={locked}
          aria-label={t('Username')}
        />
      </MailField>

      <MailField label={t('Password')}>
        <input
          id="mail-password"
          name="mailPassword"
          className={`${page.input} ${page.wideInput}`}
          type="password"
          autoComplete="new-password"
          placeholder={held?.passwordSet ? '••••••••' : ''}
          value={form?.password ?? ''}
          onChange={(event) => change({ password: event.target.value })}
          disabled={locked}
          aria-label={t('Password')}
          data-password-set={held?.passwordSet ? 'true' : 'false'}
        />
      </MailField>

      <MailField label={t('From address')}>
        <input
          id="mail-from"
          name="mailFrom"
          className={`${page.input} ${page.wideInput}`}
          type="email"
          spellCheck={false}
          placeholder={environment?.from ?? 'orknux@example.com'}
          value={form?.from ?? ''}
          onChange={(event) => change({ from: event.target.value })}
          disabled={locked}
          aria-label={t('From address')}
        />
      </MailField>

      {/* What a test found, with Test at the end of the line; Save is the page's, in the strip at the foot. */}
      <div className={styles.statusLine} data-mail-test-result={tested === null ? undefined : tested.sent ? 'sent' : 'failed'}>
        <div className={styles.status}>
          {testError !== null ? (
            <span className={styles.statusFailed} role="alert">
              {testError}
            </span>
          ) : tested !== null ? (
            <>
              <span className={`${styles.dot} ${tested.sent ? styles.dotUp : styles.dotDown}`} aria-hidden="true" />
              <span className={tested.sent ? styles.statusOk : styles.statusFailed}>
                {tested.sent ? tf('Sent to {address}', { address: tested.to }) : tested.message}
              </span>
            </>
          ) : (
            <span className={styles.statusIdle}>{t('Not tested')}</span>
          )}
        </div>
        <input
          id="mail-test-to"
          name="mailTestTo"
          className={`${page.input} ${styles.recipient}`}
          type="email"
          spellCheck={false}
          placeholder={t('Test mail to')}
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          disabled={testing}
          aria-label={t('Test mail to')}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void test()}
          disabled={testing || locked || dirty || held?.source === 'NONE'}
          data-mail-test=""
        >
          {testing ? t('Sending…') : t('Send test mail')}
        </button>
      </div>
    </>
  );
}

/** One labelled row of the form, in the page's own setting panel. */
function MailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={page.setting}>
      <div className={page.settingText}>
        <p className={page.settingLabel}>{label}</p>
      </div>
      <div className={page.retention}>{children}</div>
    </div>
  );
}
