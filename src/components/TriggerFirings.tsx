import { useEffect, useState } from 'react';

import { FIRING_OUTCOME_LABEL, fetchTriggerFirings } from '../api/triggers';
import type { TriggerFiring } from '../api/triggers';
import { FieldHint } from './FieldHint';
import { t } from '../i18n';

/**
 * The class names the log paints itself with.
 *
 * Handed in for the reason every other shared form asks for them: this is drawn
 * inside a row of the triggers table and again on one trigger's own page, and
 * the two frames are not the same shape. What a row says is identical in both.
 */
export interface TriggerFiringsStyles {
  log: string;
  empty: string;
  row: string;
  at: string;
  outcomeGood: string;
  outcomeQuiet: string;
  detail: string;
  /** A line and the (?) beside it, on one baseline. */
  labelWithHint: string;
}

export interface TriggerFiringsProps {
  /** Whose log this is; null draws nothing, which is what a page still loading has. */
  triggerId: string | null;
  styles: TriggerFiringsStyles;
  /** How many entries to read. Twenty is a screenful and the list page's answer. */
  limit?: number;
}

/**
 * When it happened, said the way a log is read.
 *
 * Relative while it is recent, because what somebody checking a trigger wants
 * to know is whether it fired *just now*; a date once it is old enough that the
 * answer is no longer minutes. Exported because the list's "Last fired" column
 * says the same thing about the same rows, and two formats for one fact is one
 * too many.
 */
export function firedAt(at: string): string {
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

/**
 * What one trigger has done, newest first.
 *
 * The entries that matter are mostly the ones no run came of - an event a
 * condition turned down, a definition nothing instances. Those appear nowhere
 * else, which is what makes a working trigger and a silent one look the same
 * from outside.
 *
 * Read when it is drawn rather than with whatever list holds it: twenty rows in
 * a table would otherwise be twenty queries for something nobody asked to see.
 */
export function TriggerFirings({ triggerId, styles, limit = 20 }: TriggerFiringsProps) {
  const [firings, setFirings] = useState<TriggerFiring[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (triggerId === null) return;
    /*
     * An answer that is no longer wanted is dropped rather than drawn: opening
     * one row and then another asks twice, and a slow first reply would write
     * one trigger's log under another trigger's name.
     */
    let current = true;
    setFirings([]);
    setError(null);
    fetchTriggerFirings(triggerId, 0, limit)
      .then((page) => {
        if (current) setFirings(page.content);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : t('Could not load the log.'));
      });
    return () => {
      current = false;
    };
  }, [triggerId, limit]);

  if (triggerId === null) return null;

  return (
    <div className={styles.log}>
      {error !== null && <p className={styles.empty}>{error}</p>}
      {/*
        "Nothing yet." stops being true the first time this fires. Why an empty
        log is unremarkable, and what "asked" means for a Slack trigger, is as
        true of a log with forty rows in it - so by the rules file's test it is
        not status, and it goes behind the (?) beside the line rather than away.
      */}
      {error === null && firings.length === 0 && (
        <p className={styles.empty}>
          <span className={styles.labelWithHint}>
            {t('Nothing yet.')}
            <FieldHint label={t('Nothing yet')}>
              {t(
                'This trigger has not been asked to do anything — for a Slack trigger that means no matching event has arrived. An empty log is what a trigger nobody has reached looks like, not a sign that anything is wrong with it.',
              )}
            </FieldHint>
          </span>
        </p>
      )}
      {firings.map((firing) => (
        <div key={firing.id} className={styles.row}>
          <span className={styles.at}>{firedAt(firing.at)}</span>
          <span className={firing.outcome === 'STARTED' ? styles.outcomeGood : styles.outcomeQuiet}>
            {FIRING_OUTCOME_LABEL[firing.outcome]}
          </span>
          <span className={styles.detail}>{firing.detail}</span>
        </div>
      ))}
    </div>
  );
}
