import { useEffect, useState } from 'react';

import { fetchBulkheads, inputOf, setBulkheads } from '../../api/bulkheads';
import type { Bulkheads, BulkheadsInput } from '../../api/bulkheads';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface BulkheadsSectionProps {
  /** Told which numbers differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
  /** While the page is saving, so the boxes are not typed into mid-save. */
  busy?: boolean;
}

type NumberKey = 'turnsAtOnce' | 'turnWaitSeconds' | 'heapPercent' | 'turnMemoryMb' | 'toolResultKb';
type SwitchKey = 'turnsEnabled' | 'heapEnabled' | 'memoryEnabled';

/**
 * Admin -> Settings -> Bulkheads. Issue #616.
 *
 * What keeps one agent turn from taking the whole server down. Three walls,
 * each a switch with its numbers beneath it: the switches take effect as they
 * are flipped, like every switch on the page, and the numbers go out with the
 * page's one Save. Off is how the server behaved before the wall existed.
 */
export function BulkheadsSection({ onPending, busy = false }: BulkheadsSectionProps) {
  const [held, setHeld] = useState<Bulkheads | null>(null);
  const [typed, setTyped] = useState<Record<NumberKey, string>>({
    turnsAtOnce: '',
    turnWaitSeconds: '',
    heapPercent: '',
    turnMemoryMb: '',
    toolResultKb: '',
  });
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hold(settings: Bulkheads) {
    setHeld(settings);
    setTyped({
      turnsAtOnce: String(settings.turnsAtOnce),
      turnWaitSeconds: String(settings.turnWaitSeconds),
      heapPercent: String(settings.heapPercent),
      turnMemoryMb: String(settings.turnMemoryMb),
      toolResultKb: String(settings.toolResultKb),
    });
  }

  useEffect(() => {
    let abandoned = false;
    fetchBulkheads()
      .then((settings) => {
        if (!abandoned) hold(settings);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the bulkheads.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    if (held === null) {
      onPending([]);
      return;
    }
    const keys: NumberKey[] = ['turnsAtOnce', 'turnWaitSeconds', 'heapPercent', 'turnMemoryMb', 'toolResultKb'];
    const moved = keys.filter((key) => typed[key].trim() !== '' && Number(typed[key]) !== held[key]);
    if (moved.length === 0) {
      onPending([]);
      return;
    }
    const input: BulkheadsInput = { ...inputOf(held) };
    for (const key of moved) input[key] = Number(typed[key]);
    onPending([
      async () => {
        setError(null);
        try {
          hold(await setBulkheads(input));
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      },
    ]);
  }, [held, typed, onPending]);

  async function flip(key: SwitchKey) {
    if (held === null || flipping) return;
    setFlipping(true);
    setError(null);
    try {
      hold(await setBulkheads({ ...inputOf(held), [key]: !held[key] }));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setFlipping(false);
    }
  }

  function toggle(key: SwitchKey, label: string, hint: string) {
    const on = held?.[key] ?? false;
    return (
      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{label}</p>
            <FieldHint label={label}>{hint}</FieldHint>
          </span>
        </div>
        <button
          type="button"
          id={`bulkhead-${key}`}
          className={page.toggle}
          onClick={() => void flip(key)}
          disabled={busy || flipping || held === null}
          role="switch"
          aria-checked={on}
          aria-label={label}
        >
          <img src={on ? toggleOnIcon : toggleOffIcon} alt="" width={36} height={20} data-keeps-colour />
        </button>
      </div>
    );
  }

  function number(key: NumberKey, label: string, hint: string, min: number, max: number, unit: string | null) {
    const off =
      held === null ||
      (key === 'turnsAtOnce' || key === 'turnWaitSeconds' ? !held.turnsEnabled : false) ||
      (key === 'heapPercent' ? !held.heapEnabled : false) ||
      (key === 'turnMemoryMb' || key === 'toolResultKb' ? !held.memoryEnabled : false);
    return (
      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{label}</p>
            <FieldHint label={label}>{hint}</FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id={`bulkhead-${key}-value`}
            name={key}
            className={page.input}
            type="number"
            min={min}
            max={max}
            value={typed[key]}
            onChange={(event) => setTyped((now) => ({ ...now, [key]: event.target.value }))}
            disabled={busy || off}
            aria-label={label}
          />
          {unit !== null && <span className={page.retentionUnit}>{unit}</span>}
        </div>
      </div>
    );
  }

  return (
    <>
      <h2 id="bulkheads" className={page.sectionHeading}>
        <span className={page.headingWithHint}>
          {t('Bulkheads')}
          <FieldHint label={t('Bulkheads')}>
            {t('What keeps one agent turn from taking the whole server down. Each wall can be switched off, which is how the server behaved before it existed. Changes apply to the next turn, without a restart.')}
          </FieldHint>
        </span>
      </h2>

      {error !== null && (
        <p className={`${page.notice} ${page.noticeError}`} role="alert">
          {error}
        </p>
      )}

      {held !== null && (
        <p className={page.settingNote} id="bulkheads-now">
          {tf('Running now: {turns} agent turns; heap after the last collection: {heap}.', {
            turns: held.runningTurns,
            heap: held.heapAfterGcPercent === null ? '-' : `${held.heapAfterGcPercent}%`,
          })}
        </p>
      )}

      {toggle(
        'turnsEnabled',
        t('Limit agent turns at once'),
        t('Workflow agent steps, chats and tasks together. A turn past the limit waits for a place and is refused if none comes free in time. A subagent runs inside the turn that asked for it.'),
      )}
      {number(
        'turnsAtOnce',
        t('Agent turns at once'),
        t('How many agent turns this server runs at the same time. A fat turn holds a few hundred megabytes at its peak, so a 2 GB heap takes about four. Between 1 and 1000.'),
        1,
        1000,
        null,
      )}
      {number(
        'turnWaitSeconds',
        t('How long a turn waits for a place'),
        t('After this the turn is refused with a message saying why, and a workflow step is retried by its node. Between 0 and 3600.'),
        0,
        3600,
        t('seconds'),
      )}
      {toggle(
        'heapEnabled',
        t('Stop turns when memory is short'),
        t('Before a turn starts and before each of its rounds, the heap is read as the last garbage collection left it. Above the line the turn stops with a message instead of carrying on into running out of memory.'),
      )}
      {number(
        'heapPercent',
        t('Heap after a collection, at most'),
        t('Read after a collection rather than as used now, so garbage not yet swept does not stop anything. Between 50 and 99.'),
        50,
        99,
        t('percent'),
      )}
      {toggle(
        'memoryEnabled',
        t('Bound what one turn holds'),
        t('A turn keeps every tool result it gathered and sends them all again each round. With this on the oldest are dropped first, each leaving a line saying so.'),
      )}
      {number(
        'turnMemoryMb',
        t('Tool results one turn may hold'),
        t('All of one turn’s tool results together. Far more than any model’s window takes, so a turn that reaches it was going to be refused anyway. Between 1 and 4096.'),
        1,
        4096,
        t('MB'),
      )}
      {number(
        'toolResultKb',
        t('The longest single tool result kept'),
        t('A longer result is cut, and the model is told how much was left out and to ask for less. Between 4 and 65536.'),
        4,
        65536,
        t('KB'),
      )}
    </>
  );
}
