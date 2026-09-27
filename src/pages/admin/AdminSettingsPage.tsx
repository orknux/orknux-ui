import { useEffect, useState } from 'react';

import {
  fetchInstallationSettings,
  setAgentSleepSeconds,
  setAgentSleepTimes,
  setAgentMaxSubagents,
  setAgentMaxSubagentsAtOnce,
  setMaxRepeatedToolCalls,
  setMaxToolCallsAtOnce,
  setRepeatedToolCallsWindowSeconds,
  setRepeatedToolCallWarnings,
  setScratchpadBudgetBytes,
  setToolsNamedInSearch,
  setScratchpadFileBudgetBytes,
  setScratchpadKeepDays,
  setToolSummariesFullUpTo,
  setToolSummaryTrimPercent,
  setCommandMarker,
  setAttachmentsEnabled,
  setSessionsRemovable,
  setChatEnabled,
  setExecutionRetentionDays,
  setMetricsAnonymous,
  setChatMaxRounds,
  setPluginMaxSourceKb,
  setPluginTimeoutSeconds,
  setRevisionRetentionDays,
  setTaskSweepMinutes,
} from '../../api/installation';
import type { InstallationSettings } from '../../api/installation';
import type { SessionUser } from '../../api/session';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { forgetInstallation } from '../../session/installation';
import { shellUser } from '../../session/user';
import styles from './AdminSettingsPage.module.css';
import { t } from '../../i18n';

export interface AdminSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * What this installation allows, for the whole organisation.
 *
 * Two kinds of setting live side by side here, and the difference is worth
 * seeing: a switch is something an administrator decides, and a value in grey is
 * something the operator decided in the configuration file. Where the file has
 * said no, the switch is not offered — it would be a control that cannot do what
 * it says.
 */
export function AdminSettingsPage({ session, onSignOut }: AdminSettingsPageProps) {
  const [settings, setSettings] = useState<InstallationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * What is typed in the retention box, as text.
   *
   * Kept apart from `settings` because a half-typed number is not a setting: a
   * field bound straight to the stored value cannot be cleared to type a new
   * one without saving an empty string on the way through.
   */
  const [retention, setRetention] = useState('');
  const [runRetention, setRunRetention] = useState('');
  /** The same, for the interval box: a half-typed number is not a setting. */
  const [sweep, setSweep] = useState('');
  /** And for the plugin source cap, for the same reason. */
  const [pluginSource, setPluginSource] = useState('');
  /** How long a plugin may take to load, as typed. */
  const [pluginWait, setPluginWait] = useState('');
  /** The installation's ceiling on tool rounds; an agent may carry its own. */
  const [rounds, setRounds] = useState('');
  /** The longest one of an agent's own waits may be, as typed. */
  const [sleep, setSleep] = useState('');
  /** And how many of those it may take in a row on one step. */
  const [sleeps, setSleeps] = useState('');
  /** How many other agents one agent may ask in one conversation. Issue #380. */
  const [asks, setAsks] = useState('');
  const [atOnce, setAtOnce] = useState('');
  /* The loop guard, three numbers. Issue #516. */
  const [repeats, setRepeats] = useState('');
  const [callsAtOnce, setCallsAtOnce] = useState('');
  const [repeatWindow, setRepeatWindow] = useState('');
  const [loopWarnings, setLoopWarnings] = useState('');
  // Held and typed in KB; the server keeps bytes. Issue #411.
  const [padBudget, setPadBudget] = useState('');
  /** Up to how many findable tools find_tools names outright. Issue #442. */
  const [named, setNamed] = useState('');
  /** How many tools fit in a briefing whole, and what each further block costs. Issue #481. */
  /** What a session's files may come to, in MB, and how long a pad is kept. Issues #491, #492. */
  const [fileBudget, setFileBudget] = useState('');
  const [keepDays, setKeepDays] = useState('');
  const [summariesFull, setSummariesFull] = useState('');
  const [summaryTrim, setSummaryTrim] = useState('');
  /** What marks a command in a message, installation-wide. Issue #402. */
  const [marker, setMarker] = useState('');

  useEffect(() => {
    /*
     * An answer that is no longer wanted is dropped rather than applied.
     *
     * This fills the form from what came back, so a reply landing late writes
     * the stored version over whatever is in the boxes - somebody's typing, or
     * the record they opened after this one. Nothing on screen says it
     * happened: it is the state behind the fields that is replaced, and the
     * state is what the save sends. #324, #862 and #863 were three reports of
     * it on three pages.
     */
    let abandoned = false;
    fetchInstallationSettings()
      .then((held) => {
        if (abandoned) return;
        setSettings(held);
        setRetention(String(held.revisionRetentionDays));
        setRunRetention(String(held.executionRetentionDays));
        setSweep(String(held.taskSweepMinutes));
        setPluginSource(String(held.pluginMaxSourceKb));
        setPluginWait(String(held.pluginTimeoutSeconds));
        setRounds(String(held.chatMaxRounds));
        setSleep(String(held.agentSleepSeconds));
        setSleeps(String(held.agentSleepTimes));
        setAsks(String(held.agentMaxSubagents));
        setAtOnce(String(held.agentMaxSubagentsAtOnce));
        setRepeats(String(held.maxRepeatedToolCalls));
        setCallsAtOnce(String(held.maxToolCallsAtOnce));
        setRepeatWindow(String(held.repeatedToolCallsWindowSeconds));
        setLoopWarnings(String(held.repeatedToolCallWarnings));
        setPadBudget(String(Math.round(held.scratchpadBudgetBytes / 1024)));
        setNamed(String(held.toolsNamedInSearch));
        setFileBudget(String(Math.round(held.scratchpadFileBudgetBytes / (1024 * 1024))));
        setKeepDays(String(held.scratchpadKeepDays));
        setSummariesFull(String(held.toolSummariesFullUpTo));
        setSummaryTrim(String(held.toolSummaryTrimPercent));
        setMarker(held.commandMarker);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setError(cause instanceof Error ? cause.message : t('Could not read the settings.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  /** Every switch on this page saves the same way; only the mutation differs. */
  /**
   * The numbers this page holds, against what the server last said.
   *
   * Compared as strings and as numbers both: a box holding "90 " and one
   * holding "090" are the same answer, and an empty box is somebody in the
   * middle of typing rather than a change to write.
   */
  const pending = settings === null
    ? []
    : [
        { typed: retention, held: settings.revisionRetentionDays, write: setRevisionRetentionDays },
        { typed: runRetention, held: settings.executionRetentionDays, write: setExecutionRetentionDays },
        { typed: sweep, held: settings.taskSweepMinutes, write: setTaskSweepMinutes },
        { typed: pluginWait, held: settings.pluginTimeoutSeconds, write: setPluginTimeoutSeconds },
        { typed: rounds, held: settings.chatMaxRounds, write: setChatMaxRounds },
        { typed: sleep, held: settings.agentSleepSeconds, write: setAgentSleepSeconds },
        { typed: sleeps, held: settings.agentSleepTimes, write: setAgentSleepTimes },
        { typed: asks, held: settings.agentMaxSubagents, write: setAgentMaxSubagents },
        { typed: atOnce, held: settings.agentMaxSubagentsAtOnce, write: setAgentMaxSubagentsAtOnce },
        { typed: repeats, held: settings.maxRepeatedToolCalls, write: setMaxRepeatedToolCalls },
        {
          typed: repeatWindow,
          held: settings.repeatedToolCallsWindowSeconds,
          write: setRepeatedToolCallsWindowSeconds,
        },
        { typed: loopWarnings, held: settings.repeatedToolCallWarnings, write: setRepeatedToolCallWarnings },
        { typed: callsAtOnce, held: settings.maxToolCallsAtOnce, write: setMaxToolCallsAtOnce },
        {
          typed: padBudget,
          held: Math.round(settings.scratchpadBudgetBytes / 1024),
          write: (kb: number) => setScratchpadBudgetBytes(kb * 1024),
        },
        { typed: named, held: settings.toolsNamedInSearch, write: setToolsNamedInSearch },
        {
          typed: fileBudget,
          held: Math.round(settings.scratchpadFileBudgetBytes / (1024 * 1024)),
          write: (mb: number) => setScratchpadFileBudgetBytes(mb * 1024 * 1024),
        },
        { typed: keepDays, held: settings.scratchpadKeepDays, write: setScratchpadKeepDays },
        { typed: summariesFull, held: settings.toolSummariesFullUpTo, write: setToolSummariesFullUpTo },
        { typed: summaryTrim, held: settings.toolSummaryTrimPercent, write: setToolSummaryTrimPercent },
        { typed: pluginSource, held: settings.pluginMaxSourceKb, write: setPluginMaxSourceKb },
      ].filter((one) => one.typed.trim() !== '' && Number(one.typed) !== one.held);

  const changed = pending.length > 0;

  /**
   * Every changed number, one call each, in the order they appear.
   *
   * One at a time rather than together, because each is its own mutation and
   * its own refusal: a number out of range says which number it was, and the
   * ones before it are already stored. The page then shows what the server
   * holds, so a refusal leaves the box that caused it standing and the rest
   * agreeing with the server.
   */
  async function saveAll() {
    if (settings === null || busy || !changed) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      let held = settings;
      for (const one of pending) {
        held = await one.write(Number(one.typed));
      }
      setSettings(held);
      setRetention(String(held.revisionRetentionDays));
      setRunRetention(String(held.executionRetentionDays));
      setSweep(String(held.taskSweepMinutes));
      setPluginSource(String(held.pluginMaxSourceKb));
      setPluginWait(String(held.pluginTimeoutSeconds));
      forgetInstallation();
      setSaved(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  async function save(change: () => Promise<InstallationSettings>) {
    if (settings === null || busy) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const held = await change();
      setSettings(held);
      setRetention(String(held.revisionRetentionDays));
      setSweep(String(held.taskSweepMinutes));
      setPluginSource(String(held.pluginMaxSourceKb));
      setPluginWait(String(held.pluginTimeoutSeconds));
      // The shell reads the same settings to decide whether to offer the Chat
      // tab, so it is told rather than left showing a link to a page that is off.
      forgetInstallation();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      user={shellUser(session)}
      onSignOut={onSignOut}
      sidebar={<AdminSidebar active="settings" />}
    >
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{t('Settings')}</h1>
            <p className={styles.subtitle}>
              {t('What this installation allows, for every workspace in it.')}
            </p>
          </div>
          {/*
            One Save, at the top, for every number on the page.

            There were four - one per field, each beside its own box - and four
            buttons that do the same verb is four decisions about when to press
            rather than one. Somebody changing two numbers had to notice that
            the first had its own button.

            The switches above keep none: a switch that needs saving is a
            switch that lies about what it is showing, and those take effect as
            they are flipped.
          */}
          {settings !== null && (
            <div className={styles.headActions}>
              {saved && <span className={styles.savedMark}>{t('Saved.')}</span>}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void saveAll()}
                disabled={busy || !changed}
                aria-label={t('Save the settings on this page')}
              >{t('Save')}</button>
            </div>
          )}
        </header>

        {settings === null && error === null && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}
        {error !== null && (
          <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
            {error}
          </p>
        )}

        {settings !== null && (
          <>
            <h2 className={styles.sectionHeading}>
              <span className={styles.headingWithHint}>
                {t('Chat')}
                <FieldHint label={t('Chat')}>
                  Set in the configuration file, under <code>orknux.chat</code>.
                </FieldHint>
              </span>
            </h2>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <p className={styles.settingLabel}>{t('Chat')}</p>
                <p className={styles.settingNote}>
                  {settings.chatConfigurable
                    ? t('Whether this installation has a chat. Off takes the tab away and refuses new messages; the conversations already had are kept.')
                    : t('Turned off in the configuration file, which is the operator’s decision: this cannot switch it back on.')}
                </p>
              </div>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => void save(() => setChatEnabled(!settings.chatEnabled))}
                disabled={busy || !settings.chatConfigurable}
                role="switch"
                aria-checked={settings.chatEnabled}
                aria-label={settings.chatEnabled ? t('Turn chat off') : t('Turn chat on')}
              >
                <img
                  src={settings.chatEnabled ? toggleOnIcon : toggleOffIcon}
                  alt=""
                  width={36}
                  height={20}
                  data-keeps-colour
                />
              </button>
            </div>

            {/*
              The ceiling on how long an agent may look things up before it has
              to say something. It was eight, written into the code, and an agent
              holding twenty tools spent them on listing and loading before the
              work began - what came back was "kept looking things up without
              reaching an answer", with everything it had gathered thrown away.
            */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How many rounds of tool calls an agent gets')}</p>
                  <FieldHint label={t('How many rounds of tool calls an agent gets')}>
                    {t('A round is one call to the model: it answers, or it asks for tools and what it asks for is run and handed back. An agent that has not answered by the last one is stopped, because a model talking to itself is billed for every round. This is the number every agent follows; one whose work is longer can be given its own on its page. Between 2 and 100.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="chat-max-rounds"
                  name="chatMaxRounds"
                  className={styles.input}
                  type="number"
                  min={2}
                  max={100}
                  value={rounds}
                  onChange={(event) => setRounds(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many rounds of tool calls an agent gets')}
                />
                <span className={styles.retentionUnit}>{t('rounds')}</span>
              </div>
            </div>

            {/*
              The other way an agent can end a turn: waiting. Some work is not
              finished and not failing - a build is running, somebody has been
              asked, a job lands at six - and the only two things an agent could
              do about it were hold the round open, billed by the minute, or
              answer as though the work were done. It can now stop and be started
              again later; these two say for how long, and how many times.
            */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('The longest an agent may wait before it is asked again')}</p>
                  <FieldHint label={t('The longest an agent may wait before it is asked again')}>
                    {t('An agent can end its turn by asking to be woken instead of answering, when what it needs has not happened yet - a build still running, a colleague who has been asked. The step stops there and the run comes back to it when the time is up, so nothing is held and no model is billed while it passes. An agent asking for longer than this is given this instead. Between 1 second and 24 hours.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="agent-sleep-seconds"
                  name="agentSleepSeconds"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={86400}
                  value={sleep}
                  onChange={(event) => setSleep(event.target.value)}
                  disabled={busy}
                  aria-label={t('The longest an agent may wait before it is asked again')}
                />
                <span className={styles.retentionUnit}>{t('seconds')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How many times in a row an agent may wait')}</p>
                  <FieldHint label={t('How many times in a row an agent may wait')}>
                    {t('Waiting is a decision the agent takes again every time it wakes, so the one that matters is not the first but the twentieth: without a bound, an agent that keeps deciding to wait a little longer never finishes. Counted per step, and an agent that has spent them all is told to finish. Zero means no agent may wait at all. Between 0 and 100.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="agent-sleep-times"
                  name="agentSleepTimes"
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  value={sleeps}
                  onChange={(event) => setSleeps(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many times in a row an agent may wait')}
                />
                <span className={styles.retentionUnit}>{t('times')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How many other agents an agent may ask')}</p>
                  <FieldHint label={t('How many other agents an agent may ask')}>
                    {t('Each ask starts a conversation of its own, with its own model calls and tools, on the asking agent’s say-so - so this is the number that bounds what one question can fan out into. Counted per conversation, and an agent that has spent them is told so and answers with what it has. Zero takes the tool off the table. A workspace may carry its own number in its settings, which wins over this one. Between 0 and 100.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="agent-max-subagents"
                  name="agentMaxSubagents"
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  value={asks}
                  onChange={(event) => setAsks(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many other agents an agent may ask')}
                />
                <span className={styles.retentionUnit}>{t('agents')}</span>
              </div>
            </div>

            {/* And how many of those may be going at the same time. Issue #461. */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How many of those may work at once')}</p>
                  <FieldHint label={t('How many of those may work at once')}>
                    {t('A different number from the one above: that bounds how many an agent may ask in a conversation, this bounds how many are working at the same time. It began to matter when asking stopped blocking - before that they ran one after another whatever this said. An ask past the ceiling waits its turn rather than being refused, because a refusal would send the model round again with the same ask in other words. Counted per conversation, so one busy conversation cannot starve the rest. Between 1 and 20.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="agent-max-subagents-at-once"
                  name="agentMaxSubagentsAtOnce"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={20}
                  value={atOnce}
                  onChange={(event) => setAtOnce(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many of those may work at once')}
                />
                <span className={styles.retentionUnit}>{t('at once')}</span>
              </div>
            </div>

            {/*
              The loop guard. Issue #516.

              Three fields together, because none of them means anything alone:
              a count with no window would stop an agent that checks something
              every minute, and a window with no count would stop nothing.
            */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Identical tool calls before a turn is stopped')}</p>
                  <FieldHint label={t('Identical tool calls before a turn is stopped')}>
                    {t('The same tool, the same arguments and the same answer, that many times inside the window below, and the turn is told it is going round in circles. Repetition on its own is fine - an agent watching something calls the same tool and is working - so what makes it a loop is how close together the calls are. Two sessions once spent their whole budget this way, one of them calling the same pair a hundred and fifty times. Between 2 and 50.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="max-repeated-tool-calls"
                  name="maxRepeatedToolCalls"
                  className={styles.input}
                  type="number"
                  min={2}
                  max={50}
                  value={repeats}
                  onChange={(event) => setRepeats(event.target.value)}
                  disabled={busy}
                  aria-label={t('Identical tool calls before a turn is stopped')}
                />
                <span className={styles.retentionUnit}>{t('calls')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Tool calls allowed in one message')}</p>
                  <FieldHint label={t('Tool calls allowed in one message')}>
                    {t('How many tools one message may ask for at once. The guard above counts across rounds and cannot see a single message that asks for the same thing a hundred times, which is what a decode looks like when it comes apart. Calls over this are refused with the rule quoted back, not dropped, so the model is told why. Between 1 and 500.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="max-tool-calls-at-once"
                  name="maxToolCallsAtOnce"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={500}
                  value={callsAtOnce}
                  onChange={(event) => setCallsAtOnce(event.target.value)}
                  disabled={busy}
                  aria-label={t('Tool calls allowed in one message')}
                />
                <span className={styles.retentionUnit}>{t('calls')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Counted within')}</p>
                  <FieldHint label={t('Counted within')}>
                    {t('How close together those calls have to be. Calls further apart than this do not count, which is what lets an agent poll something deliberately: it checks, waits, and checks again, and the older calls fall outside the window. Set it below the interval anything here is meant to poll at. Between 1 second and a day.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="repeated-tool-calls-window"
                  name="repeatedToolCallsWindowSeconds"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={86400}
                  value={repeatWindow}
                  onChange={(event) => setRepeatWindow(event.target.value)}
                  disabled={busy}
                  aria-label={t('Counted within')}
                />
                <span className={styles.retentionUnit}>{t('seconds')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Warnings before the turn ends')}</p>
                  <FieldHint label={t('Warnings before the turn ends')}>
                    {t('A turn that is going round in circles is first told so, and asked to finish with what it has - which is usually something, since the work often happened before the loop started. This is how many times it is told before the turn is ended instead. Between 1 and 10.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="repeated-tool-call-warnings"
                  name="repeatedToolCallWarnings"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={10}
                  value={loopWarnings}
                  onChange={(event) => setLoopWarnings(event.target.value)}
                  disabled={busy}
                  aria-label={t('Warnings before the turn ends')}
                />
                <span className={styles.retentionUnit}>{t('warnings')}</span>
              </div>
            </div>

            {/* How much a session's scratchpads may hold in all. Set in KB;
                the server keeps bytes. Issue #411. */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How much a session’s scratchpads may hold')}</p>
                  <FieldHint label={t('How much a session’s scratchpads may hold')}>
                    {t('A scratchpad is a working file an agent keeps within a session - a document it drafts, code it writes, notes it organises - and this bounds how much one conversation’s scratchpads may occupy in all, so an agent told to write something long cannot grow them without limit. Counted across every scratchpad the session holds. Between 1 and 65536 KB.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="scratchpad-budget"
                  name="scratchpadBudget"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={65536}
                  value={padBudget}
                  onChange={(event) => setPadBudget(event.target.value)}
                  disabled={busy}
                  aria-label={t('How much a session’s scratchpads may hold, in kilobytes')}
                />
                <span className={styles.retentionUnit}>{t('KB')}</span>
              </div>
            </div>

            {/* Up to how many findable tools find_tools names outright, so a
                model asks for one by name rather than guessing words. A number
                somebody can change, not one in the source. Issue #442. */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How many findable tools are named outright')}</p>
                  <FieldHint label={t('How many findable tools are named outright')}>
                    {t('An agent granted more tools than it carries is given find_tools to look the rest up. Up to this many of them, find_tools names every one in its own description and when a search finds nothing, so the model asks for a tool by name instead of guessing words for a search; above it, the tool says only how many there are. Names are short, so a few dozen cost less than one tool’s full declaration; a small model may read a long list less well than a large one. Zero never names them. Between 0 and 500.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="tools-named-in-search"
                  name="toolsNamedInSearch"
                  className={styles.input}
                  type="number"
                  min={0}
                  max={500}
                  value={named}
                  onChange={(event) => setNamed(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many findable tools are named outright')}
                />
                <span className={styles.retentionUnit}>{t('tools')}</span>
              </div>
            </div>

            {/* What a session's pictures may come to, and how long its
                workings are kept at all. Issues #491 and #492. */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Files kept per session')}</p>
                  <FieldHint label={t('Files kept per session')}>
                    {t('A scratchpad can hold a picture or a document as well as text, and those are megabytes each that live as long as the session does. Past this, the oldest files in that session are removed until it is under again — the newest being the one in use — and the agent is told which went. Text scratchpads are never touched. Between 1 and 512 MB.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="scratchpad-file-budget"
                  name="scratchpadFileBudget"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={512}
                  value={fileBudget}
                  onChange={(event) => setFileBudget(event.target.value)}
                  disabled={busy}
                  aria-label={t('Files kept per session')}
                />
                <span className={styles.retentionUnit}>{t('MB')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Scratchpads are kept for')}</p>
                  <FieldHint label={t('Scratchpads are kept for')}>
                    {t('How long a scratchpad nobody has touched is kept before a sweeper removes it. Counted from the last change, so a document still being worked on survives. The session and its transcript are left alone: these are the workings beside it. Zero keeps them for ever, which suits an installation that treats them as part of the record. Between 0 and 1825 days.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="scratchpad-keep-days"
                  name="scratchpadKeepDays"
                  className={styles.input}
                  type="number"
                  min={0}
                  max={1825}
                  value={keepDays}
                  onChange={(event) => setKeepDays(event.target.value)}
                  disabled={busy}
                  aria-label={t('Scratchpads are kept for')}
                />
                <span className={styles.retentionUnit}>{t('days')}</span>
              </div>
            </div>

            {/* Every tool an agent holds is named in its system prompt with a
                phrase saying what it is for. Cheap at twenty tools and not at
                three hundred, so the lines are cut as the list grows - and by
                how much is the installation's, not a number in the source.
                Issue #481. */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Tools whose summary is kept in full')}</p>
                  <FieldHint label={t('Tools whose summary is kept in full')}>
                    {t('An agent’s system prompt names every tool it holds with a short phrase, so it knows what it has instead of guessing words for a search. Up to this many tools each phrase is kept whole; for every further block of this many, the percentage below comes off what is kept, cut from the end so the first words survive. Between 10 and 1000.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="tool-summaries-full-up-to"
                  name="toolSummariesFullUpTo"
                  className={styles.input}
                  type="number"
                  min={10}
                  max={1000}
                  value={summariesFull}
                  onChange={(event) => setSummariesFull(event.target.value)}
                  disabled={busy}
                  aria-label={t('Tools whose summary is kept in full')}
                />
                <span className={styles.retentionUnit}>{t('tools')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Trimmed off each further block')}</p>
                  <FieldHint label={t('Trimmed off each further block')}>
                    {t('How much comes off a tool’s phrase for each further block of tools past the number above: at 25%, an agent holding twice that many keeps three quarters of each phrase and one holding three times keeps half. Cut from the end, so what is written first survives. Zero switches the trimming off. Between 0 and 50.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="tool-summary-trim-percent"
                  name="toolSummaryTrimPercent"
                  className={styles.input}
                  type="number"
                  min={0}
                  max={50}
                  value={summaryTrim}
                  onChange={(event) => setSummaryTrim(event.target.value)}
                  disabled={busy}
                  aria-label={t('Trimmed off each further block')}
                />
                <span className={styles.retentionUnit}>{t('percent')}</span>
              </div>
            </div>

            {/* What marks a command in a message that starts a run; a workspace
                may carry its own. Text, so it saves on its own. Issue #402. */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Command marker')}</p>
                  <FieldHint label={t('Command marker')}>
                    {t('What marks a command in a message that starts a run - with ! as the marker, "@orknux !review" carries the command review, which an agent node’s Skill IDs can load a skill from. Orknux’s own syntax, because Slack intercepts a message starting with / and refuses one it does not know. One to three characters, none a letter or a digit, so ordinary words are never commands. A workspace may set its own in its settings.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="command-marker"
                  name="commandMarker"
                  className={styles.input}
                  type="text"
                  maxLength={3}
                  spellCheck={false}
                  value={marker}
                  onChange={(event) => setMarker(event.target.value)}
                  disabled={busy}
                  aria-label={t('Command marker')}
                />
                {saved && <span className={styles.savedMark}>{t('Saved.')}</span>}
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || marker.trim() === '' || marker.trim() === settings.commandMarker}
                  onClick={() => void save(() => setCommandMarker(marker.trim()))}
                >{t('Save')}</button>
              </div>
            </div>

            <h2 id="attachments" className={styles.sectionHeading}>
              <span className={styles.headingWithHint}>
                {t('Attachments')}
                <FieldHint label={t('Attachments')}>
                  Set in the configuration file, under <code>orknux.attachments</code>. Each
                  workspace keeps its files in its own directory beneath that location.
                </FieldHint>
              </span>
            </h2>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <p className={styles.settingLabel}>{t('Files in chats')}</p>
                <p className={styles.settingNote}>
                  {settings.attachmentsConfigurable
                    ? t('Whether people may attach files to a chat. Off takes the button away; what has already been uploaded stays where it is.')
                    : t('Turned off in the configuration file, which is the operator’s decision: this cannot switch it back on.')}
                </p>
              </div>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => void save(() => setAttachmentsEnabled(!settings.attachmentsEnabled))}
                disabled={busy || !settings.attachmentsConfigurable}
                role="switch"
                aria-checked={settings.attachmentsEnabled}
                aria-label={settings.attachmentsEnabled ? t('Turn attachments off') : t('Turn attachments on')}
              >
                <img
                  src={settings.attachmentsEnabled ? toggleOnIcon : toggleOffIcon}
                  alt=""
                  width={36}
                  height={20}
                  data-keeps-colour
                />
              </button>
            </div>

            {/*
              The operator's half, read-only. A filesystem path is not something
              to hand a browser the ability to change — but somebody wondering
              where a file went should not have to read a container's YAML.
            */}
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt className={styles.factName}>{t('Storage')}</dt>
                <dd className={styles.factValue}>{settings.attachmentStorage}</dd>
              </div>
              <div className={styles.fact}>
                <dt className={styles.factName}>{t('Location')}</dt>
                <dd className={`${styles.factValue} ${styles.mono}`}>{settings.attachmentLocation}</dd>
              </div>
              <div className={styles.fact}>
                <dt className={styles.factName}>{t('Largest file')}</dt>
                <dd className={styles.factValue}>{settings.attachmentMaxFileSizeMb} MB</dd>
              </div>
            </dl>
            <h2 id="metrics" className={styles.sectionHeading}>{t('Metrics')}</h2>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Scraping without signing in')}</p>
                  {/*
                    What turning this on exposes is exactly the sort of
                    consequence the rules put behind the (?): read once by
                    somebody deciding, and in the way of everybody else.
                  */}
                  <FieldHint label={t('Scraping without signing in')}>
                    On publishes <code>/actuator/prometheus</code> to anybody who can reach this
                    server’s port: how many workspaces exist, how often workflows run and how often
                    they fail. Turn it on only where the scrape crosses a network the scraper alone is
                    on. A Prometheus that can send an Authorization header should carry an API token
                    instead and leave this off.
                  </FieldHint>
                </span>
              </div>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => void save(() => setMetricsAnonymous(!settings.metricsAnonymous))}
                disabled={busy}
                role="switch"
                aria-checked={settings.metricsAnonymous}
                aria-label={
                  settings.metricsAnonymous
                    ? t('Stop answering metrics to callers who have not signed in')
                    : t('Answer metrics to callers who have not signed in')
                }
              >
                <img
                  src={settings.metricsAnonymous ? toggleOnIcon : toggleOffIcon}
                  alt=""
                  width={36}
                  height={20}
                  data-keeps-colour
                />
              </button>
            </div>

            {/*
              Whether a conversation may be thrown away.

              A session is the record of what an agent was asked and what it
              answered, and on some installations that is the only account of a
              decision anybody has. Removing one is a person tidying up after a
              mistyped key or a run they were trying out - which is what it is
              for - but where the record has to stand it is a hole somebody can
              put in it with one press and no way back.
            */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('Conversations can be removed')}</p>
                  <FieldHint label={t('Conversations can be removed')}>
                    {t('A conversation is the record of what an agent was asked and what it answered, and on some installations it is the only account of a decision anybody has. Removing one takes the whole transcript with it and there is no way back, so an installation that has to be able to say what happened should turn this off. On until somebody does, which is how it has always worked.')}
                  </FieldHint>
                </span>
              </div>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => void save(() => setSessionsRemovable(!settings.sessionsRemovable))}
                disabled={busy}
                role="switch"
                aria-checked={settings.sessionsRemovable}
                aria-label={
                  settings.sessionsRemovable
                    ? t('Stop allowing conversations to be removed')
                    : t('Allow conversations to be removed')
                }
              >
                <img
                  src={settings.sessionsRemovable ? toggleOnIcon : toggleOffIcon}
                  alt=""
                  width={36}
                  height={20}
                  data-keeps-colour
                />
              </button>
            </div>

            {settings.metricsAnonymous && (
              <p className={styles.warning}>
                {t('Open now: anyone who can reach this port is reading those numbers without an account.')}
              </p>
            )}

            {/*
              This is the one switch with a rival: the environment sets what a
              fresh installation answers, and an administrator’s stored answer
              takes over from there. An operator who edited their config file and
              finds the screen ignoring it is owed the reason, so the two are
              only ever silent about each other when they agree.
            */}
            <p className={styles.fieldNote}>
              {settings.metricsAnonymous === settings.metricsAnonymousConfigured ? (
                <>
                  <code>ORKNUX_METRICS_ANONYMOUS</code> in the environment says{' '}
                  {settings.metricsAnonymousConfigured ? 'on' : 'off'}, and this switch agrees with
                  it. What is stored here takes effect on the next scrape rather than the next
                  restart.
                </>
              ) : (
                <>
                  <code>ORKNUX_METRICS_ANONYMOUS</code> in the environment says{' '}
                  {settings.metricsAnonymousConfigured ? 'on' : 'off'}, but an administrator stored{' '}
                  {settings.metricsAnonymous ? 'on' : 'off'} here, and the stored answer is the one
                  in force. Editing the environment will not move it back — this switch will.
                </>
              )}
            </p>

            <h2 id="component-history" className={styles.sectionHeading}>{t('Component history')}</h2>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How long versions are kept')}</p>
                  <FieldHint label={t('How long versions are kept')}>
                    {t('Every save of a function, tool, skill or agent keeps what it was before, and every publication of a workflow is kept as a version of it. A version is a whole copy — the code, the parameters, the prompt — so this is what decides how much disk the history takes. Counted from when a version stopped being current, not from when it was written. A workflow’s live publication is never swept, however old it is.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="revision-retention-days"
                  name="revisionRetentionDays"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={3650}
                  value={retention}
                  onChange={(event) => setRetention(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many days of component history to keep')}
                />
                <span className={styles.retentionUnit}>{t('days')}</span>
              </div>
            </div>

            {/*
              The same rival the metrics switch has: the environment says what a
              fresh installation keeps, and a stored answer takes over from
              there. Said only where they differ, because an operator who edited
              their config file and finds it ignored is owed the reason.
            */}
            {settings.revisionRetentionDays !== settings.revisionRetentionDaysConfigured && (
              <p className={styles.fieldNote}>
                <code>ORKNUX_REVISION_RETENTION_DAYS</code> in the environment says{' '}
                {settings.revisionRetentionDaysConfigured} days, but an administrator stored{' '}
                {settings.revisionRetentionDays} here, and the stored answer is the one in force.
              </p>
            )}

            <h2 id="run-history" className={styles.sectionHeading}>{t('Run history')}</h2>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How long finished runs are kept')}</p>
                  <FieldHint label={t('How long finished runs are kept')}>
                    {t('Every run a workflow makes is kept with its steps and its log lines, and nothing deleted one until this existed — so a busy installation grew this table without bound. Counted from when a run finished. A run still going is never swept, however long it has been going, and deleting a workspace takes its runs with it.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="execution-retention-days"
                  name="executionRetentionDays"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={3650}
                  value={runRetention}
                  onChange={(event) => setRunRetention(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many days of run history to keep')}
                />
                <span className={styles.retentionUnit}>{t('days')}</span>
              </div>
            </div>

            {settings.executionRetentionDays !== settings.executionRetentionDaysConfigured && (
              <p className={styles.fieldNote}>
                <code>ORKNUX_EXECUTION_RETENTION_DAYS</code> in the environment says{' '}
                {settings.executionRetentionDaysConfigured} days, but an administrator stored{' '}
                {settings.executionRetentionDays} here, and the stored answer is the one in force.
              </p>
            )}

            {/*
              Drawn only where it can do anything. An installation running
              Temporal recovers a stuck task through Temporal, and the interval
              comes from the configuration file there — so this is not a switch
              turned off, it is a decision that is not this screen's to take,
              and a greyed-out box would only invite somebody to wonder why.
            */}
            {settings.taskSweepConfigurable && (
              <>
                <h2 id="queued-tasks" className={styles.sectionHeading}>{t('Queued tasks')}</h2>

                <div className={styles.setting}>
                  <div className={styles.settingText}>
                    <span className={styles.labelWithHint}>
                      <p className={styles.settingLabel}>{t('How long before a stuck task is picked up')}</p>
                      <FieldHint label={t('How long before a stuck task is picked up')}>
                        {t('A task is written down and then handed to a worker, and that hand-over can be lost — a restart at the wrong moment, or a pool with nothing free to take it. Something looks on this interval and hands over anything that has been waiting longer, so a task cannot sit unstarted for ever. A task a worker already has is never handed over twice, whatever this says. Five minutes unless ORKNUX_TASK_SWEEP_MINUTES says otherwise; the next pass reads it, so no restart is needed.')}
                      </FieldHint>
                    </span>
                  </div>
                  <div className={styles.retention}>
                    <input
                      id="task-sweep-minutes"
                      name="taskSweepMinutes"
                      className={styles.input}
                      type="number"
                      min={1}
                      max={1440}
                      value={sweep}
                      onChange={(event) => setSweep(event.target.value)}
                      disabled={busy}
                      aria-label={t('How many minutes a task may wait before it is picked up')}
                    />
                    <span className={styles.retentionUnit}>{t('minutes')}</span>
                  </div>
                </div>
              </>
            )}

            <h2 id="plugins" className={styles.sectionHeading}>{t('Plugins')}</h2>

            {/*
              The loading bound, and it says so: what a plugin's tool may then
              take is a workspace's setting, and one screen claiming both would
              be one number two people argue about.
            */}
            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How long a plugin may take to load')}</p>
                  <FieldHint label={t('How long a plugin may take to load')}>
                    {t('The bundle is evaluated once when it is loaded, and this is how long that may take before the load is stopped. What one of its functions or tools may then take is set per workspace, under Timeouts. 30 seconds unless somebody says otherwise; every load reads it fresh, so no restart is needed.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="plugin-timeout-seconds"
                  name="pluginTimeoutSeconds"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={300}
                  value={pluginWait}
                  onChange={(event) => setPluginWait(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many seconds a plugin may take to load')}
                />
                <span className={styles.retentionUnit}>{t('seconds')}</span>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingText}>
                <span className={styles.labelWithHint}>
                  <p className={styles.settingLabel}>{t('How large a plugin source file may be')}</p>
                  <FieldHint label={t('How large a plugin source file may be')}>
                    {t('One cap for the plugin\'s own file, each library it ships, and each file a load-from-URL fetches. A source is stored whole and read whole on every call, so this number is about the heap as much as the disk. 5120 KB unless somebody says otherwise; every load reads it fresh, so no restart is needed.')}
                  </FieldHint>
                </span>
              </div>
              <div className={styles.retention}>
                <input
                  id="plugin-max-source-kb"
                  name="pluginMaxSourceKb"
                  className={styles.input}
                  type="number"
                  min={64}
                  max={20480}
                  value={pluginSource}
                  onChange={(event) => setPluginSource(event.target.value)}
                  disabled={busy}
                  aria-label={t('How many KB one plugin source file may be')}
                />
                <span className={styles.retentionUnit}>KB</span>
              </div>
            </div>

          </>
        )}
      </section>
    </AppShell>
  );
}
