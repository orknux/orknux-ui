import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  fetchModelUsage,
  formatChange,
  formatCompact,
  formatLatency,
  formatTokens,
  removeModel,
} from '../../api/models';
import type { ModelUsage } from '../../api/models';
import type { SessionUser } from '../../api/session';
import { AppShell } from '../../components/AppShell';
import { BackLink } from '../../components/BackLink';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import {
  ModelDetailsFields,
  ModelQuotaFields,
  ModelThrottleFields,
  ModelWindowFields,
  useModelForm,
} from '../../components/ModelForm';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import { UsageChart } from './UsageChart';
import styles from './ModelSettingsPage.module.css';
import { t } from '../../i18n';

export interface ModelSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * A model's own page: its settings, what it has been used for, and its Danger
 * Zone.
 *
 * The settings are `ModelForm`'s, which the workflow editor also draws in the
 * drawer beside an image or decision node; this page adds the two things a
 * drawer has no room for - the usage figures and the removal.
 */
export function ModelSettingsPage({ session, onSignOut }: ModelSettingsPageProps) {
  const { workspaceId = '', modelId = '' } = useParams();
  const navigate = useNavigate();

  const form = useModelForm(workspaceId, modelId);
  const { model, loadError, saveError, saved, saving } = form;
  const [usage, setUsage] = useState<ModelUsage | null>(null);
  /**
   * The window the figures are for, as typed.
   *
   * Empty is the thirty days the page opens on, which is what it always showed.
   * Held as strings because that is what a date box holds and what the query
   * takes: half a date is somebody still typing, not a window.
   */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** What the figures on screen were actually asked for; see the effect. */
  const [asked, setAsked] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [usageError, setUsageError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  /*
   * The metrics are their own request, for two reasons: the settings should
   * still show if the usage query is the thing that failed, and the window can
   * change without the model having changed.
   */
  useEffect(() => {
    let abandoned = false;
    fetchModelUsage(modelId, 30, asked.from || undefined, asked.to || undefined)
      .then((held) => {
        if (abandoned) return;
        setUsage(held);
        setUsageError(null);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setUsage(null);
        /*
         * Said rather than swallowed. A date the server could not read used to
         * be indistinguishable from a model nothing has called - and the one
         * needs a different date, the other needs a call made.
         */
        setUsageError(cause instanceof Error ? cause.message : t('Could not load the usage metrics.'));
      });
    return () => {
      abandoned = true;
    };
  }, [modelId, asked]);

  /** Enter in any box on any of the three cards is the same press as the header's Save. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.save();
  }

  async function handleRemove() {
    if (model === null || removing) return;
    setRemoving(true);
    try {
      await removeModel(model.id);
      navigate(`/workspace/${workspaceId}/models`);
    } catch (cause) {
      setRemoving(false);
      form.setSaveError(cause instanceof Error ? cause.message : t('Could not remove the model.'));
    }
  }

  const limit = model?.tokenLimit ?? null;
  const used = usage?.periodTokens ?? 0;
  const share = limit === null || limit === 0 ? null : Math.min(used / limit, 1);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      {/* Any edit after a save puts "Saved." away: it said the page agreed with the server, and now it does not. */}
      <div className={styles.page} onChangeCapture={() => form.setSaved(false)}>
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to={`/workspace/${workspaceId}/models`} label={t('Models')} />
          <Link className={styles.crumbLink} to={`/workspace/${workspaceId}/models`}>
            {t('Models')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{model?.name ?? '…'}</span>
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{model?.name ?? 'Model'}</h1>
          {/*
            The one Save, beside the title, so saving never needs a scroll to the
            foot of a card - and one rather than three, so a page with three cards
            edited is one press rather than three. Issue #386.
          */}
          {model !== null && (
            <div className={styles.headerActions}>
              {saved && saveError === null && <p className={styles.saved}>{t('Saved.')}</p>}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void form.save()}
                disabled={saving}
              >
                {saving ? t('Saving…') : t('Save Changes')}
              </button>
            </div>
          )}
        </div>
        {/* Under the title rather than at the foot of a card: it is where the press was. */}
        {saveError !== null && (
          <p className={styles.saveError} role="alert">
            {saveError}
          </p>
        )}
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        </section>
      ) : model === null ? (
        <section className={styles.card}>
          <p className={styles.notice}><Loader /></p>
        </section>
      ) : (
        <>
          <section className={styles.card}>
            <h2 className={styles.sectionHeading}>{t('Provider Details')}</h2>
            <ModelDetailsFields form={form} />
          </section>

          {/*
            Where the window is set, which is where the rest of the application
            says it is set.

            An agent's session memory is a share of this number, and refusing a
            share said "Set the model's context window on the Models screen
            first" while the Models screen only ever printed it — recorded when
            a model was added and unchangeable afterwards, and null on every
            model that arrived any other way. Issue #252.
          */}
          <form className={styles.card} onSubmit={handleSubmit}>
            <h2 className={styles.sectionHeading}>{form.draws ? t('Price') : t('Context Window')}</h2>
            <ModelWindowFields form={form} />
          </form>

          <section className={styles.card}>
            <h2 className={styles.sectionHeading}>{t('Usage Metrics')}</h2>

            {/*
              The window the figures are for.
              Thirty days was fixed and nothing on this page could ask for
              anything else - and every question somebody actually brings here is
              about a different one: what yesterday's run cost, what was spent
              last month, whether the spike on the 14th was this model.
              Above the figures rather than inside them, because an empty window
              is a reason to change it: a picker that disappeared the moment
              nothing matched would be a dead end.
            */}
            <div className={styles.usageRange}>
              <label className={styles.rangeField} htmlFor="usage-from">
                <span className={styles.rangeLabel}>{t('From')}</span>
                <input
                  id="usage-from"
                  name="usageFrom"
                  className={styles.rangeInput}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className={styles.rangeField} htmlFor="usage-to">
                <span className={styles.rangeLabel}>{t('To')}</span>
                <input
                  id="usage-to"
                  name="usageTo"
                  className={styles.rangeInput}
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={styles.rangeButton}
                onClick={() => setAsked({ from, to })}
                disabled={from === asked.from && to === asked.to}
              >
                {t('Apply')}
              </button>
              {/*
                The way back, and only where there is something to go back from:
                a Reset beside two empty boxes is a control that does nothing.
              */}
              {(asked.from !== '' || asked.to !== '') && (
                <button
                  type="button"
                  className={styles.rangeReset}
                  onClick={() => {
                    setFrom('');
                    setTo('');
                    setAsked({ from: '', to: '' });
                  }}
                >
                  {t('Last 30 days')}
                </button>
              )}
            </div>

            {usageError !== null ? (
              <p className={styles.emptyMetrics}>{usageError}</p>
            ) : usage === null || usage.empty ? (
              /*
               * Nothing has called this model, so there is nothing to show. A
               * grid of zeros would read as a result rather than as an absence.
               */
              /*
               * Two different absences, said differently. Nothing ever needs a
               * call made; nothing in a window somebody chose needs a different
               * window, and telling them the model has never been used would be
               * a false statement about the model.
               */
              <p className={styles.emptyMetrics}>
                {asked.from === '' && asked.to === ''
                  ? t('No usage has been recorded for this model yet. The figures here are summed from real calls, so they stay empty until something makes one.')
                  : t('Nothing was recorded for this model between those dates. The figures are summed from real calls, so a window with no calls in it is empty rather than zero.')}
              </p>
            ) : (
              <>
                <div className={styles.statsRow}>
                  <Stat
                    label={t('Total Requests')}
                    value={formatCompact(usage.requests)}
                    change={formatChange(usage.requestsChange)}
                    good={(usage.requestsChange ?? 0) >= 0}
                  />
                  <Stat
                    label={t('Tokens Used')}
                    value={formatCompact(usage.totalTokens)}
                    change={formatChange(usage.tokensChange)}
                    good={(usage.tokensChange ?? 0) >= 0}
                  />
                  <Stat
                    label={t('Avg Latency')}
                    value={formatLatency(usage.averageLatencyMillis)}
                    change={formatChange(usage.latencyChange)}
                    /* Slower is worse, so the sign reads the other way round. */
                    good={(usage.latencyChange ?? 0) <= 0}
                  />
                </div>

                <div className={styles.chartArea}>
                  {/* What the window came to, which is what was asked for. */}
                  <p className={styles.chartTitle}>Usage Over Time ({usage.days} days)</p>
                  <UsageChart series={usage.series} />
                  <div className={styles.chartDates}>
                    <span>{usage.from}</span>
                    <span>{usage.to}</span>
                  </div>
                </div>

                <div className={styles.breakdown}>
                  <p className={styles.breakdownTitle}>
                    {asked.from === '' && asked.to === ''
                      ? `Token Breakdown (Last ${usage.days} Days)`
                      : `Token Breakdown (${usage.from} to ${usage.to})`}
                  </p>
                  <div className={styles.breakdownGrid}>
                    <Figure label={t('Input Tokens')} value={formatTokens(usage.inputTokens)} />
                    <Figure label={t('Output Tokens')} value={formatTokens(usage.outputTokens)} />
                    <Figure label={t('Total Tokens')} value={formatTokens(usage.totalTokens)} />
                    <Figure
                      label={t('Cost Estimate')}
                      value={usage.costEstimate === null ? '—' : `$${usage.costEstimate.toFixed(2)}`}
                      accent
                    />
                  </div>
                </div>
              </>
            )}
          </section>

          <form className={styles.card} onSubmit={handleSubmit}>
            <h2 className={styles.sectionHeading}>{t('Quotas & Limits')}</h2>

            <ModelQuotaFields
              form={form}
              between={
                <div className={styles.usageBlock}>
                  <div className={styles.usageHeader}>
                    <span className={styles.label}>{t('Current Usage')}</span>
                    <span className={share !== null && share >= 0.8 ? styles.usageWarn : styles.usageValue}>
                      {limit === null
                        ? `${formatCompact(used)} tokens, no limit set`
                        : `${formatCompact(used)} / ${formatCompact(limit)} tokens (${Math.round((share ?? 0) * 100)}%)`}
                    </span>
                  </div>
                  <div className={styles.usageTrack}>
                    <div
                      className={share !== null && share >= 0.8 ? styles.usageFillWarn : styles.usageFill}
                      style={{ width: `${(share ?? 0) * 100}%` }}
                    />
                  </div>
                  <p className={styles.usageNote}>Counting from {usage?.periodStart ?? '—'}.</p>
                </div>
              }
            />
          </form>

          {/*
            The model's own throttle, on its own card like the quotas above — a
            quota is what the workspace will allow, a throttle is the pace a
            call is let out at.
          */}
          <form className={styles.card} onSubmit={handleSubmit}>
            <span className={styles.labelWithHint}>
              <h2 className={styles.sectionHeading}>{t('Throttle')}</h2>
              {/* About the section: what an empty box and a typed 0 each mean. */}
              <FieldHint label={t('Throttle')}>
                {t('Empty inherits the provider\'s default, 0 turns a dimension off.')}
              </FieldHint>
            </span>

            <ModelThrottleFields form={form} />
          </form>

          <section className={styles.dangerCard}>
            <h2 className={styles.dangerHeading}>{t('Danger Zone')}</h2>
            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <span className={styles.dangerTitle}>{t('Remove Model')}</span>
                <span className={styles.dangerNote}>
                  {t('Remove this model from your workspace configuration')}
                </span>
              </div>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void handleRemove()}
                disabled={removing}
              >
                {removing ? t('Removing…') : t('Remove Model')}
              </button>
            </div>
          </section>
        </>
      )}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  change,
  good,
}: {
  label: string;
  value: string;
  change: string | null;
  good: boolean;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {/* Nothing to compare with is nothing to say, rather than a zero. */}
      {change !== null && (
        <span className={good ? styles.statChangeGood : styles.statChangeBad}>{change} vs last period</span>
      )}
    </div>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={styles.figure}>
      <span className={accent ? styles.figureLabelAccent : styles.figureLabel}>{label}</span>
      <span className={accent ? styles.figureValueAccent : styles.figureValue}>{value}</span>
    </div>
  );
}
