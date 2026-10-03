import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { checkHttpTool, fetchHttpToolSettings, saveHttpToolPolicy, setHttpToolsEnabled } from '../../api/httpTools';
import type { HttpToolCheck, HttpToolPolicyInput, HttpToolPolicyKind, HttpToolSettings } from '../../api/httpTools';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import trashIcon from '../../assets/trash-2.svg';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';
import styles from './HttpToolsSection.module.css';

export interface HttpToolsSectionProps {
  /** Told whether the policy on screen differs from the server's, so the page's Save can send it. */
  onPending: (writes: PendingWrite[]) => void;
}

/** A rule as the page holds it: the key is the page's own, so a removed row does not hand its input to the next. */
interface DraftRule {
  key: number;
  url: string;
  methods: string[];
}

/**
 * Admin -> Settings -> HTTP tools. Issue #602.
 *
 * The switch applies the moment it is flipped, like every switch on this page;
 * the policy and its rules go out with the page's one Save, like its numbers.
 * The tester asks the server about the rules as they stand on screen, saved or
 * not: the question somebody has while writing a pattern is whether *this*
 * pattern lets that address through, and making them save first to find out
 * would be making them change what every agent may reach in order to ask.
 * Untouched, what is on screen is what is saved, so the same button answers
 * both.
 */
export function HttpToolsSection({ onPending }: HttpToolsSectionProps) {
  const [held, setHeld] = useState<HttpToolSettings | null>(null);
  const [kind, setKind] = useState<HttpToolPolicyKind>('ANY');
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testMethod, setTestMethod] = useState('GET');
  const [testing, setTesting] = useState(false);
  const [answer, setAnswer] = useState<HttpToolCheck | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const next = useRef(0);

  function hold(settings: HttpToolSettings) {
    setHeld(settings);
    setKind(settings.policy);
    setRules(settings.rules.map((rule) => ({ key: next.current++, url: rule.url, methods: [...rule.methods] })));
  }

  useEffect(() => {
    let abandoned = false;
    fetchHttpToolSettings()
      .then((settings) => {
        if (!abandoned) hold(settings);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the HTTP tools settings.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  const draft: HttpToolPolicyInput = {
    policy: kind,
    rules: rules.map((rule) => ({ url: rule.url, methods: rule.methods })),
  };
  const draftText = JSON.stringify(draft);
  const savedText = held === null ? null : JSON.stringify({ policy: held.policy, rules: held.rules });

  useEffect(() => {
    if (held === null || draftText === savedText) {
      onPending([]);
      return;
    }
    const input = JSON.parse(draftText) as HttpToolPolicyInput;
    onPending([
      async () => {
        setError(null);
        try {
          hold(await saveHttpToolPolicy(input));
        } catch (cause: unknown) {
          // Said here as well as at the top of the page: the rule it names is down here.
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      },
    ]);
  }, [held, draftText, savedText, onPending]);

  /* An answer about rules that have since changed is an answer about other rules. */
  useEffect(() => {
    setAnswer(null);
    setTestError(null);
  }, [draftText]);

  async function toggle() {
    if (held === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const settings = await setHttpToolsEnabled(!held.enabled);
      // Only the switch: what is being typed below is not thrown away by flipping it.
      setHeld({ ...held, enabled: settings.enabled });
      setAnswer(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  function change(key: number, edit: (rule: DraftRule) => DraftRule) {
    setRules((all) => all.map((rule) => (rule.key === key ? edit(rule) : rule)));
  }

  async function test(event: FormEvent) {
    event.preventDefault();
    if (testUrl.trim() === '') return;
    setTesting(true);
    setTestError(null);
    setAnswer(null);
    try {
      setAnswer(await checkHttpTool(testUrl.trim(), testMethod, draft));
    } catch (cause: unknown) {
      setTestError(cause instanceof Error ? cause.message : t('Could not test that address.'));
    } finally {
      setTesting(false);
    }
  }

  const methods = held?.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

  return (
    <>
      <h2 id="http-tools" className={page.sectionHeading}>
        <span className={page.headingWithHint}>
          {t('HTTP tools')}
          <FieldHint label={t('HTTP tools')}>
            {t('The http_get, http_request and http_download tools of every agent. Functions, JavaScript tools and plugins calling orknux.http are not affected; the proxy rules still apply to everything.')}
          </FieldHint>
        </span>
      </h2>

      {error !== null && (
        <p className={styles.error} role="alert" data-http-tools-error="">
          {error}
        </p>
      )}

      {held !== null && (
        <>
          <div className={page.setting}>
            <div className={page.settingText}>
              <p className={page.settingLabel}>{t('HTTP tools')}</p>
              <p className={page.settingNote}>
                {held.enabled
                  ? t('Offered to the agents they are granted to.')
                  : t('Switched off: no agent is offered them, and every grant is kept for when they are back.')}
              </p>
            </div>
            <button
              type="button"
              id="http-tools-enabled"
              className={page.toggle}
              onClick={() => void toggle()}
              disabled={busy}
              role="switch"
              aria-checked={held.enabled}
              aria-label={held.enabled ? t('Turn the HTTP tools off') : t('Turn the HTTP tools on')}
            >
              <img src={held.enabled ? toggleOnIcon : toggleOffIcon} alt="" width={36} height={20} data-keeps-colour />
            </button>
          </div>

          <div className={page.setting}>
            <div className={page.settingText}>
              <span className={page.labelWithHint}>
                <p className={page.settingLabel}>{t('Where they may go')}</p>
                <FieldHint label={t('Where they may go')}>
                  {t('Under an allow list, a request is made only when some rule matches its whole URL and lists its method; http_get and http_download are GET. Redirects are not followed, so a new address is a new request, checked the same way.')}
                </FieldHint>
              </span>
            </div>
            <div className={styles.policy} role="radiogroup" aria-label={t('Where they may go')}>
              <label className={styles.choice}>
                <input
                  type="radio"
                  name="http-tools-policy"
                  value="ANY"
                  checked={kind === 'ANY'}
                  onChange={() => setKind('ANY')}
                  data-http-policy="ANY"
                />
                {t('Allow any URL')}
              </label>
              <label className={styles.choice}>
                <input
                  type="radio"
                  name="http-tools-policy"
                  value="LIST"
                  checked={kind === 'LIST'}
                  onChange={() => setKind('LIST')}
                  data-http-policy="LIST"
                />
                {t('Allow list')}
              </label>
            </div>
          </div>

          {kind === 'LIST' && (
            <div className={styles.rules} data-http-rules="">
              {rules.length === 0 && <p className={page.settingNote}>{t('No rules yet, so nothing may be requested.')}</p>}
              {rules.map((rule, at) => {
                const position = at + 1;
                const matchedUrl = answer?.urlMatches.includes(position) ?? false;
                const allowing = answer?.matchedRule === position;
                return (
                  <div
                    key={rule.key}
                    className={[styles.rule, matchedUrl ? styles.ruleMatched : '', allowing ? styles.ruleAllowing : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-http-rule={position}
                    data-http-rule-matched={matchedUrl ? (allowing ? 'allows' : 'url') : undefined}
                  >
                    <span className={styles.position}>{position}</span>
                    <input
                      className={styles.pattern}
                      value={rule.url}
                      placeholder="https://api\.example\.com/.*"
                      spellCheck={false}
                      maxLength={400}
                      onChange={(event) => change(rule.key, (one) => ({ ...one, url: event.target.value }))}
                      aria-label={tf('URL pattern of rule {position}', { position })}
                    />
                    <span className={styles.methods}>
                      {methods.map((method) => {
                        const on = rule.methods.includes(method);
                        return (
                          <button
                            key={method}
                            type="button"
                            className={on ? `${styles.method} ${styles.methodOn}` : styles.method}
                            aria-pressed={on}
                            data-http-method={method}
                            onClick={() =>
                              change(rule.key, (one) => ({
                                ...one,
                                methods: on
                                  ? one.methods.filter((other) => other !== method)
                                  : methods.filter((other) => other === method || one.methods.includes(other)),
                              }))
                            }
                          >
                            {method}
                          </button>
                        );
                      })}
                    </span>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => setRules((all) => all.filter((one) => one.key !== rule.key))}
                      aria-label={tf('Remove rule {position}', { position })}
                    >
                      <img src={trashIcon} alt="" width={16} height={16} />
                    </button>
                  </div>
                );
              })}
              <div>
                <button
                  type="button"
                  id="http-tools-add-rule"
                  className={styles.secondaryButton}
                  onClick={() => setRules((all) => [...all, { key: next.current++, url: '', methods: ['GET'] }])}
                >
                  {t('Add rule')}
                </button>
              </div>
            </div>
          )}

          {/*
            The question somebody has the moment there is a rule. Answered by the
            server, by the matcher the tools themselves ask, so the page cannot
            be confident about an answer a tool call would give differently.
          */}
          <section className={styles.testCard} data-http-tester="">
            <h3 className={styles.testTitle}>
              <span className={page.labelWithHint}>
                {t('Whether an address may be requested')}
                <FieldHint label={t('Whether an address may be requested')}>
                  {t('Checks the policy and rules as they are on this page, before they are saved.')}
                </FieldHint>
              </span>
            </h3>
            <form className={styles.testRow} onSubmit={(event) => void test(event)}>
              <select
                id="http-tools-test-method"
                className={styles.testMethod}
                value={testMethod}
                onChange={(event) => setTestMethod(event.target.value)}
                aria-label={t('Method to test')}
              >
                {methods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <input
                id="http-tools-test-url"
                className={styles.testInput}
                type="text"
                placeholder="https://api.example.com/v1/status"
                value={testUrl}
                spellCheck={false}
                onChange={(event) => setTestUrl(event.target.value)}
                aria-label={t('An address to test against the HTTP tools policy')}
              />
              <button
                type="submit"
                id="http-tools-test"
                className={styles.testButton}
                disabled={testing || testUrl.trim() === ''}
              >
                {testing ? t('Checking…') : t('Check')}
              </button>
            </form>

            {testError !== null && (
              <p className={styles.refused} data-http-test-error="">
                {testError}
              </p>
            )}

            {answer !== null && (
              <div className={styles.testAnswer} data-http-test-outcome={answer.outcome}>
                <p className={answer.allowed ? styles.allowed : styles.refused}>{said(answer, testMethod)}</p>
                {!answer.allowed && answer.outcome !== 'SWITCHED_OFF' && (
                  <p className={page.settingNote}>
                    {t('An agent is told:')} <code>{answer.message}</code>
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

/** The tester's answer in a sentence of the reader's language; what the agent is told stays English. */
function said(answer: HttpToolCheck, method: string): string {
  switch (answer.outcome) {
    case 'SWITCHED_OFF':
      return t('Refused: the HTTP tools are switched off.');
    case 'ANY_URL':
      return t('Allowed: the policy allows any URL.');
    case 'ALLOWED':
      return tf('Allowed by rule {position}.', { position: answer.matchedRule ?? '' });
    case 'NO_RULE_MATCHES':
      return t('Refused: no rule matches this URL.');
    case 'METHOD_NOT_LISTED':
      return tf('Refused: the URL matches rule {positions}, but not for {method}.', {
        positions: answer.urlMatches.join(', '),
        method,
      });
  }
}
