import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { readCommandRun, runCommand, stopCommandRun } from '../api/commands';
import type { CommandRun, CommandRunOffer } from '../api/commands';
import { t, tf } from '../i18n';
import styles from './RunnableCode.module.css';

/** How often a running command is read for what it printed since. */
const READ_EVERY_MILLIS = 400;

/** The languages whose blocks are a session with prompts, where only the prompted lines are commands. */
const SESSION_LANGUAGES = ['console', 'shell'];
const POWERSHELL_LANGUAGES = ['powershell', 'ps1', 'ps', 'pwsh'];

/**
 * The command a block holds, as it would be typed.
 *
 * A `console` block is a terminal session - `$ ls` and then what ls printed -
 * and a PowerShell one often carries its `PS C:\>` prompt; where the prompts
 * are there, the prompted lines are the command and the rest is output. A
 * block with no prompts is run as it is written.
 */
export function commandOf(language: string, code: string): string {
  const text = code.replace(/\n$/, '');
  const lines = text.split('\n');
  const prompt = SESSION_LANGUAGES.includes(language)
    ? /^\$ /
    : POWERSHELL_LANGUAGES.includes(language)
      ? /^PS [^>\n]*> /
      : null;
  if (prompt === null || !lines.some((line) => prompt.test(line))) return text;
  return lines
    .filter((line) => prompt.test(line))
    .map((line) => line.replace(prompt, ''))
    .join('\n');
}

export interface RunnableCodeProps {
  /** What the block was tagged, lower case. */
  language: string;
  /** The block's text, as written. */
  code: string;
  offer: CommandRunOffer;
  /**
   * Draws the block: `controls` go in its bar beside Copy, `output` under its
   * code. The block's own shape stays Markdown's; this only adds to it.
   */
  children: (controls: ReactNode, output: ReactNode) => ReactElement;
}

/**
 * Run on a shell block in a chat answer: the command runs on the machine the
 * server is on and what it prints is drawn under the block as it arrives.
 * Run as administrator asks the operating system - UAC, or pkexec's dialog -
 * and never Orknux.
 */
export function RunnableCode({ language, code, offer, children }: RunnableCodeProps) {
  const [run, setRun] = useState<CommandRun | null>(null);
  const [printed, setPrinted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The run being followed, so a read that comes back after another run started is dropped. */
  const following = useRef<string | null>(null);

  const running = run?.state === 'RUNNING';

  useEffect(() => () => {
    following.current = null;
  }, []);

  useEffect(() => {
    if (run === null || run.state !== 'RUNNING') return;
    const id = run.id;
    const timer = window.setTimeout(() => {
      readCommandRun(id, run.next)
        .then((read) => {
          if (following.current !== id) return;
          setPrinted((held) => held + read.output);
          setRun(read);
        })
        .catch((cause: unknown) => {
          if (following.current !== id) return;
          setError(cause instanceof Error ? cause.message : t('The run could not be read.'));
          setRun(null);
        });
    }, READ_EVERY_MILLIS);
    return () => window.clearTimeout(timer);
  }, [run]);

  async function start(elevated: boolean) {
    setBusy(true);
    setError(null);
    setPrinted('');
    try {
      const started = await runCommand(commandOf(language, code), language, elevated);
      following.current = started.id;
      setPrinted(started.output);
      setRun(started);
    } catch (cause: unknown) {
      following.current = null;
      setRun(null);
      setError(cause instanceof Error ? cause.message : t('The command could not be run.'));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (run === null) return;
    try {
      await stopCommandRun(run.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('The run could not be stopped.'));
    }
  }

  const controls = (
    <span className={styles.controls} data-runnable={language}>
      {running ? (
        <button type="button" className={styles.button} onClick={() => void stop()} data-command-stop="">
          {t('Stop')}
        </button>
      ) : (
        <>
          <button type="button" className={styles.button} onClick={() => void start(false)} disabled={busy} data-command-run="">
            {t('Run')}
          </button>
          {offer.elevation && (
            <button
              type="button"
              className={styles.button}
              onClick={() => void start(true)}
              disabled={busy}
              data-command-run-elevated=""
            >
              {t('Run as administrator')}
            </button>
          )}
        </>
      )}
    </span>
  );

  const output = (
    <>
      {error !== null && (
        <p className={`${styles.status} ${styles.failed}`} role="alert">
          {error}
        </p>
      )}
      {run !== null && (
        <div className={styles.result} data-command-output="" data-state={run.state}>
          {printed !== '' && <pre className={styles.output}>{printed}</pre>}
          <p className={`${styles.status} ${run.state === 'EXITED' && run.exitCode === 0 ? '' : styles.failed}`}>
            {statusOf(run)}
            {run.truncated && ` ${t('Output past the limit was not kept.')}`}
          </p>
        </div>
      )}
    </>
  );

  return children(controls, output);
}

/** One line on how the run stands, said as the server reported it. */
function statusOf(run: CommandRun): string {
  switch (run.state) {
    case 'RUNNING':
      return run.elevated ? t('Running as administrator…') : t('Running…');
    case 'EXITED':
      return run.exitCode === null ? t('Ended.') : tf('Exited with {code}.', { code: run.exitCode });
    case 'STOPPED':
      return t('Stopped.');
    case 'TIMED_OUT':
      return tf('Stopped after {seconds} seconds, the longest a command may take.', { seconds: run.timeoutSeconds });
    case 'DECLINED':
      return t('The administrator prompt was declined.');
    case 'FAILED':
      return run.message === null ? t('The command could not be run.') : tf('Not run: {reason}', { reason: run.message });
  }
}
