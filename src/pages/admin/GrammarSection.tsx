import { useEffect, useState } from 'react';

import { fetchGrammarSettings, setGrammarServer } from '../../api/documents';
import type { GrammarSettings } from '../../api/documents';
import { withScheme } from '../../components/address';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface GrammarSectionProps {
  /** Told when the box differs from the server's, so the page's Save can send it. */
  onPending: (writes: PendingWrite[]) => void;
  busy?: boolean;
}

/**
 * Admin -> Settings -> Grammar: where the document editor's grammar check is
 * done. Empty is LanguageTool inside this server - or the server in
 * ORKNUX_GRAMMAR_SERVER_URL, shown as the placeholder.
 */
export function GrammarSection({ onPending, busy = false }: GrammarSectionProps) {
  const [held, setHeld] = useState<GrammarSettings | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  function hold(settings: GrammarSettings) {
    setHeld(settings);
    // What this page stores, not the file's: a server the file names is the placeholder.
    setTyped(settings.server !== null && settings.server !== settings.serverConfigured ? settings.server : '');
  }

  useEffect(() => {
    let abandoned = false;
    fetchGrammarSettings()
      .then((settings) => {
        if (!abandoned) hold(settings);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the grammar settings.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    const wanted = typed.trim().replace(/\/+$/, '');
    const stored = held === null || held.server === held.serverConfigured ? '' : (held.server ?? '');
    if (held === null || wanted === stored) {
      onPending([]);
      return;
    }
    onPending([
      async () => {
        setError(null);
        try {
          hold(await setGrammarServer(wanted));
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      },
    ]);
  }, [held, typed, onPending]);

  return (
    <>
      <h2 id="grammar" className={page.sectionHeading}>
        {t('Grammar')}
      </h2>

      {error !== null && (
        <p className={`${page.notice} ${page.noticeError}`} role="alert">
          {error}
        </p>
      )}

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('LanguageTool server')}</p>
            <FieldHint label={t('LanguageTool server')}>
              {t('Where the document editor checks grammar and spelling. Leave it empty for LanguageTool inside this server, which loads a language the first time a document in it is checked.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="grammar-server"
            name="grammarServer"
            className={`${page.input} ${page.wideInput}`}
            type="text"
            inputMode="url"
            spellCheck={false}
            placeholder={held?.serverConfigured ?? t('Built in')}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => setTyped(typed.trim() === '' ? '' : withScheme(typed))}
            disabled={busy || held === null}
            aria-label={t('LanguageTool server')}
            data-testid="grammar-server"
          />
        </div>
      </div>
    </>
  );
}
