import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { NEW_CONDITION, fetchWorkspaceConditions } from '../api/conditions';
import type { Condition } from '../api/conditions';
import { fetchWorkspaceConnections } from '../api/integrations';
import type { WorkspaceConnection } from '../api/integrations';
import {
  TRIGGER_ACTIONS,
  TRIGGER_ACTION_LABEL,
  cannotReceive,
  createTrigger,
  fetchSlackBotUsers,
  fetchSupportedTriggerActions,
  updateTrigger,
} from '../api/triggers';
import type { SlackBotUser, Trigger, TriggerAction, TriggerType, WebhookAuthType } from '../api/triggers';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import toggleOffIcon from '../assets/toggle-off.svg';
import toggleOnIcon from '../assets/toggle-on.svg';
import {
  NEW_FUNCTION,
  NEW_FUNCTION_NAME,
  createFunction,
  fetchWorkspaceFunctions,
  refusingFunction,
  validFunctionName,
} from '../api/functions';
import type { WorkspaceFunction } from '../api/functions';
import { NEW_OBJECT, createObject, fetchWorkspaceObjects } from '../api/objects';
import type { WorkflowObject } from '../api/objects';
import { ConditionDialog } from './ConditionDialog';
import { CRON_FIELDS, describeCron } from './cronText';
import { DefinitionPicker } from './DefinitionPicker';
import { FieldHint } from './FieldHint';
import { IconField } from './IconField';
import { NameDialog } from './NameDialog';
import own from './TriggerForm.module.css';
import { t } from '../i18n';

/**
 * The class names the form paints itself with.
 *
 * Handed in rather than imported, because this form is shown in two places that
 * are not the same surface: a modal panel while a trigger is being created, and
 * a card on its own page once it exists. The fields are identical in both — so
 * there is one form — and the look belongs to whichever frame is holding it.
 */
/**
 * How long the panel waits after the last change before it writes.
 *
 * Long enough that typing a name is one write rather than eleven, short
 * enough that nobody gets to the graph's Save before it has happened.
 */
const PANEL_SAVE_MS = 600;

export interface TriggerFormStyles {
  /** The form itself: a modal's body, or a settings card. */
  body: string;
  fields: string;
  field: string;
  labelRow: string;
  label: string;
  /** The link out of a field, to what the field is pointing at. */
  jump: string;
  input: string;
  select: string;
  inputWrapper: string;
  inputWrapperTall: string;
  textarea: string;
  inputMono: string;
  inputCron: string;
  prefix: string;
  /**
   * What a field has to say for itself where that is not an explanation of it.
   *
   * What a field means is behind the (?) beside its label, which the form draws
   * for itself. What is left under a field is what the (?) must not swallow: an
   * empty state, a consequence of what saving is about to do, and a reading of
   * what has just been chosen.
   */
  fieldHint: string;
  error: string;
  actions: string;
  ghost: string;
  filled: string;
}

export interface TriggerFormProps {
  workspaceId: string;
  /**
   * The workflow a new one belongs to, where it is that workflow's own.
   *
   * The workflow editor's "Custom" row sends this; null at every other door
   * into this form. Ignored when editing - what a trigger belongs to is
   * decided once, where it is made.
   */
  workflowId?: string | null;
  /** Null creates one; a trigger edits it, with its type fixed. */
  trigger?: Trigger | null;
  styles: TriggerFormStyles;
  onSaved: (trigger: Trigger) => void;
  /** Left out where the frame already offers a way back, as a page's breadcrumb does. */
  onCancel?: () => void;
  /**
   * A name given from outside, for a definition that has no name of its own to
   * give.
   *
   * A Custom definition belongs to one node and is reached through that node,
   * so its name is the node's: asking for a second one in the node's own panel
   * is asking somebody to name the same thing twice, and the name they type is
   * one nothing ever shows them again. Set, and the field is not drawn.
   */
  namedAfter?: string;
}

/** The zones the form offers; anything else can be typed into the server. */
const TIMEZONES = ['UTC', 'Europe/Warsaw', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];

/** The whole of a workspace's shapes fits in the picker. */
const OBJECT_PAGE_SIZE = 100;

/*
 * The rows that make a definition instead of choosing one.
 *
 * Held still rather than written into the JSX, because the picker treats a new
 * row object as a new list and puts its cursor back to the top - which, from a
 * form that re-renders on every keystroke, would be a picker nobody can arrow
 * down through.
 */
const NEW_FUNCTION_ROW = { value: NEW_FUNCTION, label: t('+ New function') };
const NEW_CONDITION_ROW = { value: NEW_CONDITION, label: t('+ New condition') };
const NEW_OBJECT_ROW = { value: NEW_OBJECT, label: t('+ New object') };

/** Choosing nothing is a real answer here, so it is a row like any other. */
const ANY_EVENT_ROW = { value: '', label: t('Fire on everything') };

/**
 * What a trigger waits for and what it hands on. The form changes with the type:
 * an incoming connection asks which connection and which event, a scheduled one
 * asks for a cron expression and the zone it is read in, a webhook asks for the
 * path it answers on and the shape a caller has to send.
 *
 * It asks for no workflow: this defines a catalogue entry, and a workflow picks
 * one up by pointing a trigger node at it in the editor.
 *
 * Nothing here resets: the state is read from `trigger` as it mounts, and the
 * frames mount it fresh — the dialog renders it only while open, the page keys it
 * by which trigger is being edited. An effect that put the fields back would be a
 * second answer to the same question, and the two would eventually disagree.
 */
export function TriggerForm({
  workspaceId,
  workflowId = null,
  trigger = null,
  styles,
  onSaved,
  namedAfter,
  onCancel,
}: TriggerFormProps) {
  const [name, setName] = useState(trigger?.name ?? namedAfter ?? '');
  const [type, setType] = useState<TriggerType>(trigger?.type ?? 'INCOMING_CONNECTION');
  const [connectionId, setConnectionId] = useState(trigger?.connectionId ?? '');
  const [action, setAction] = useState<TriggerAction>(trigger?.action ?? 'MENTION');
  /**
   * Whose messages a reply watches for replies to.
   *
   * Not the connection above. That one is the socket this installation hears
   * Slack on; these are the bot tokens whose own messages a reply has to hang
   * under, which are usually other Slack apps entirely.
   */
  const [watched, setWatched] = useState<string[]>(trigger?.watchedConnectionIds ?? []);
  const [cron, setCron] = useState(trigger?.cron ?? '0 2 * * *');
  const [timezone, setTimezone] = useState(trigger?.timezone ?? 'UTC');
  const [payload, setPayload] = useState(trigger?.payload ?? '');
  /** Empty asks nothing, which is what a trigger does unless told otherwise. */
  const [conditionId, setConditionId] = useState(trigger?.conditionId ?? '');
  const [icon, setIcon] = useState<string | null>(trigger?.icon ?? null);
  /**
   * Whether it fires at all. A new one does, which is what somebody filling
   * this in means by filling it in.
   *
   * Here rather than only in the list because both places somebody looks at a
   * trigger properly — the dialog that makes one, the page that holds one — had
   * no way to say it: issues #247 and #257. It is saved with the rest of the
   * form, so turning it off is a change to the definition like any other and
   * not a second thing to remember afterwards.
   */
  const [enabled, setEnabled] = useState(trigger?.enabled ?? true);
  const [webhookPath, setWebhookPath] = useState(trigger?.webhookPath ?? '');
  const [objectId, setObjectId] = useState(trigger?.objectId ?? '');
  const [authType, setAuthType] = useState<WebhookAuthType>(trigger?.authType ?? 'NONE');
  const [authFunctionId, setAuthFunctionId] = useState(trigger?.authFunctionId ?? '');
  /**
   * What to call the function this trigger is about to bring into existence.
   *
   * Only read when the picker is on "New function". A webhook guarded by a
   * function is very often the reason that function is wanted at all, and a
   * workspace with none had nothing to choose here but a dead end.
   */
  const [newFunctionName, setNewFunctionName] = useState(NEW_FUNCTION_NAME);

  const [objects, setObjects] = useState<WorkflowObject[]>([]);
  const [functions, setFunctions] = useState<WorkspaceFunction[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  /** What the server says it can deliver; anything else is not worth offering. */
  const [deliverable, setDeliverable] = useState<TriggerAction[]>([]);
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  /** Which Slack user each connection posts as, and what is wrong where something is. */
  const [botUsers, setBotUsers] = useState<SlackBotUser[]>([]);
  /** Whether that has been asked for, so choosing Reply twice is not two rounds of it. */
  const [asked, setAsked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Which dialog is open on top of this form, if any.
   *
   * A condition and an object are both more than a name, and both already have
   * something that asks for the rest properly - the condition dialog, and the
   * same name-and-description step the Objects list uses before it opens the
   * editor. Neither is worth rebuilding in a corner of this form; what matters
   * is that going to make one does not cost the half-filled trigger.
   */
  const [makingCondition, setMakingCondition] = useState(false);
  const [makingObject, setMakingObject] = useState(false);

  /**
   * The definition this form made a moment ago, where it made one.
   *
   * A form in a node's panel writes itself, so the second write must be an
   * update - and "am I editing" was read off the prop the parent passes back,
   * which arrives a render later. In that gap the form asked for a second
   * definition with the same name, and the workspace refused it by name:
   * *An action named "Format agent output" already exists*. So the form
   * remembers what it made rather than waiting to be told.
   */
  const [madeId, setMadeId] = useState<string | null>(null);

  const editing = trigger !== null || madeId !== null;

  useEffect(() => {
    if (workspaceId === '') return;

    fetchWorkspaceConnections(workspaceId)
      .then((held) => {
        setConnections(held);
        setConnectionId((current) => (current === '' ? (held[0]?.id ?? '') : current));
      })
      .catch(() => setConnections([]));

    // The whole catalogue fits the picker, and a workspace with none simply
    // offers nothing to ask.
    fetchWorkspaceConditions(workspaceId, 0, OBJECT_PAGE_SIZE)
      .then((page) => setConditions(page.content))
      .catch(() => setConditions([]));

    fetchSupportedTriggerActions()
      .then(setDeliverable)
      .catch(() => setDeliverable([]));

    fetchWorkspaceObjects(workspaceId, 0, OBJECT_PAGE_SIZE)
      .then((page) => setObjects(page.content))
      .catch(() => setObjects([]));

    // Only the ones that can answer the question: a webhook is let in or kept
    // out, and a function returning an object has no opinion on that.
    fetchWorkspaceFunctions(workspaceId, 0, OBJECT_PAGE_SIZE)
      .then((page) => setFunctions(page.content.filter((held) => held.returnType === 'BOOLEAN')))
      .catch(() => setFunctions([]));
  }, [workspaceId]);

  const incoming = type === 'INCOMING_CONNECTION';
  const webhook = type === 'WEBHOOK';
  /** The one event that asks whose messages it is watching. */
  const reply = incoming && action === 'REPLY';
  /**
   * The two events Slack will not deliver without a history scope.
   *
   * A reply needs the answer to draw its rows; a message needs it only to say
   * whether the token can hear one at all. Both ask the same question, so both
   * ask it once.
   */
  const listens = incoming && (action === 'REPLY' || action === 'MESSAGE');

  /*
   * Who each Slack connection posts as, asked the first time a message or a
   * reply is chosen and not before.
   *
   * It is a Slack round trip per connection on a cold cache, and a schedule, a
   * webhook and a mention have no use for the answer - so asking it with the
   * rest of the catalogues would spend somebody else's rate limit on every
   * trigger anybody ever defined. The rows are drawn from the connections
   * either way, so nothing waits on this: what arrives is the handle and the
   * reason, filled in where the row already is.
   */
  useEffect(() => {
    if (!listens || workspaceId === '' || asked) return;
    setAsked(true);
    fetchSlackBotUsers(workspaceId)
      .then(setBotUsers)
      .catch(() => setBotUsers([]));
  }, [listens, workspaceId, asked]);

  /**
   * The connection saying this trigger could never fire, where it says so.
   *
   * Read off what has already arrived rather than asked a second time, and read
   * from the boxes rather than from the saved trigger: switching the Action
   * picker to Message is the moment the answer starts mattering, and it is a
   * moment before Save rather than after.
   */
  const silent = useMemo(
    () => cannotReceive({ type, action, connectionId: connectionId === '' ? null : connectionId }, botUsers),
    [type, action, connectionId, botUsers],
  );

  /*
   * What each picker offers, with a second line saying which one this is.
   *
   * The hint is searched alongside the name, so an object can be found by how
   * many fields it has and a condition by what it asks - which is how somebody
   * who has forgotten the name still knows the one they mean.
   */
  const connectionOptions = useMemo(
    () => connections.map((held) => ({ value: held.id, label: held.name, hint: held.effectiveUrl })),
    [connections],
  );

  const objectOptions = useMemo(
    () =>
      objects.map((shape) => ({
        value: shape.id,
        label: shape.name,
        hint: `${shape.propertyCount} ${shape.propertyCount === 1 ? 'field' : 'fields'}`,
      })),
    [objects],
  );

  const functionOptions = useMemo(
    () => functions.map((held) => ({ value: held.id, label: held.name, hint: held.signature })),
    [functions],
  );

  /*
   * The Slack connections, in the order the connection picker draws them.
   *
   * `slackBotUsers` answers about every Slack connection in the workspace, so
   * this is only the ordering and the wait: a list that reshuffled itself when
   * the answers arrived would move a row out from under somebody's cursor, and
   * one that was empty until they arrived would read as a workspace with no
   * Slack in it.
   */
  const slackBots = useMemo(() => {
    const known = new Map(botUsers.map((bot) => [bot.connectionId, bot]));
    return connections
      .filter((held) => held.type === 'SLACK')
      .map<SlackBotUser>(
        (held) =>
          known.get(held.id) ?? {
            connectionId: held.id,
            name: held.name,
            outcome: 'UNCHECKED',
            message: t('Not checked yet.'),
            userId: null,
            handle: null,
            receives: null,
          },
      );
  }, [connections, botUsers]);

  const conditionOptions = useMemo(
    () => [
      ANY_EVENT_ROW,
      ...conditions.map((held) => ({ value: held.id, label: held.name, hint: held.description })),
    ],
    [conditions],
  );

  /*
   * What the schedule in the box actually does, said back in English.
   *
   * Derived rather than kept in state, and derived from `cron` itself, so it
   * cannot lag the field by a keystroke: a reading that describes what was
   * typed a moment ago is a reading that is wrong exactly when somebody is
   * relying on it. Memoised on the string only because it is recomputed on
   * every render of a form with a dozen other fields in it.
   */
  const reading = useMemo(() => describeCron(cron), [cron]);

  /** In a node's panel, where the definition belongs to the node. */
  const embedded = namedAfter !== undefined;

  const complete =
    name.trim() !== '' &&
    (incoming
      ? connectionId !== '' && (!reply || watched.length > 0)
      : webhook
        ? webhookPath.trim() !== '' &&
          objectId !== '' &&
          (authType !== 'FUNCTION' ||
            (authFunctionId !== '' &&
              (authFunctionId !== NEW_FUNCTION || validFunctionName(newFunctionName))))
        : cron.trim() !== '');

  /**
   * Everything this form holds, in the shape the server takes.
   *
   * Its own function because two callers want it: the save itself, and
   * the panel's watcher, which compares one against the last to know
   * whether anything actually changed.
   */
  function settingsNow(chosenFunction: string = authFunctionId) {
  return {
      name: name.trim(),
      /*
       * The kind, which an update carries only for a definition a node owns -
       * the server ignores it on a shared one. Sent always rather than only
       * when embedded, because the value is what the form holds either way and
       * a field the server drops is cheaper than a branch here.
       */
      type,
      connectionId: incoming ? connectionId : undefined,
      action: incoming ? action : undefined,
      // Sent on every incoming trigger, empty included: the server assigns it
      // rather than leaving it alone, so switching Reply to Mention clears
      // what the reply was watching instead of leaving it behind.
      watchedConnectionIds: incoming ? (reply ? watched : []) : undefined,
      cron: incoming || webhook ? undefined : cron.trim(),
      timezone: incoming || webhook ? undefined : timezone,
      webhookPath: webhook ? webhookPath.trim() : undefined,
      objectId: webhook ? objectId : undefined,
      authType: webhook ? authType : undefined,
      authFunctionId: webhook && authType === 'FUNCTION' ? chosenFunction : null,
      payload: payload.trim(),
      // Undefined would leave the condition alone; the form has to be able to
      // take it off, so an empty pick is sent as null.
      conditionId: conditionId === '' ? null : conditionId,
      icon,
      enabled,
  };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  /*
   * In a node's panel there is no press: it saves as the panel saves.
   *
   * A Custom definition is part of the node, and everything else about a node
   * is stored by editing it - typing a name, choosing a function, dragging a
   * port. A Create button in the middle of that is a second kind of saving
   * somebody has to know about, and the state it leaves when nobody presses it
   * is the one that loses the whole definition on the next Save of the graph.
   *
   * So the embedded form writes itself: once it holds enough to be valid, and
   * again whenever what it holds changes. No dependency list on purpose - it
   * re-arms after every render and the timer is cleared each time, which is a
   * debounce on "stopped changing" rather than a list of thirty fields where
   * the one somebody forgets is the one that then never saves.
   */
  const lastWritten = useRef<string | null>(null);

  /**
   * What the form held when it opened, so an untouched one writes nothing.
   *
   * A subtype and its defaults are chosen on the first render, so a panel that
   * wrote whatever it held would make a definition out of opening it - a row
   * per node somebody clicked on and thought better of. Compared as a whole
   * rather than watched field by field, for the reason the watcher gives.
   */
  const opened = useRef<string | null>(null);
  if (opened.current === null) opened.current = JSON.stringify(settingsNow());
  const touched = JSON.stringify(settingsNow()) !== opened.current || trigger !== null || madeId !== null;

  useEffect(() => {
    /*
     * Finished or not.
     *
     * A definition belonging to one node is filled in a field at a time, and
     * the moment between "Function" and the function being chosen is an
     * ordinary moment - it is where somebody looks at the list. Refusing to
     * write until it was valid meant that Save landed on a node pointing at
     * nothing, and everything typed so far was gone on the next reload, which
     * is what "saving does not work" was. What is unfinished is said at
     * publish, where the rest of an unfinished graph is.
     *
     * There has to be something to write, though: a subtype is chosen on the
     * first render, so writing before anybody has touched the form would make
     * a definition out of opening the panel.
     */
    if (!embedded || submitting || !touched) return undefined;
    const timer = window.setTimeout(() => {
      const now = JSON.stringify(settingsNow());
      if (lastWritten.current === now) return;
      lastWritten.current = now;
      void save();
    }, PANEL_SAVE_MS);
    return () => window.clearTimeout(timer);
  });

  /** Stored, whether a press asked for it or the panel did. */
  async function save() {
    // A press still waits for a complete form; the panel does not. See the
    // watcher below for why.
    if (submitting || (!embedded && !complete)) return;

    setSubmitting(true);
    setError(null);
    try {
      /*
       * Named in the picker, made here, before the trigger that points at it.
       *
       * A trigger holding the id of something that does not exist would answer
       * every caller 401 for a reason nobody could look up, so the function goes
       * in first and the trigger gets a real id or nothing at all. What it starts
       * as turns everybody away, which is the safe half of a guard nobody has
       * written yet. Boolean, because letting a caller in or keeping it out is the
       * whole question, and the picker only lists functions that answer it.
       *
       * Kept in this form's own list as well: this is a settings page as often as
       * it is a dialog, and the picker it leaves behind has to be able to show
       * what was just chosen.
       */
      let chosenFunction = authFunctionId;
      if (webhook && authType === 'FUNCTION' && authFunctionId === NEW_FUNCTION) {
        const called = newFunctionName.trim();
        const made = await createFunction({
          workspaceId,
          name: called,
          returnType: 'BOOLEAN',
          ...refusingFunction(called),
        });
        setFunctions((current) => [...current, made]);
        setAuthFunctionId(made.id);
        chosenFunction = made.id;
      }

      const settings = settingsNow(chosenFunction);
      const saved = editing
        ? await updateTrigger(trigger?.id ?? madeId!, settings)
        : await createTrigger({ workspaceId, workflowId, ...settings });
      /*
       * Cleared on the way out, not only on the way to an error.
       *
       * The dialog unmounts this the moment it is told, so nothing there ever
       * noticed it was not: creating a trigger is one save and then the form is
       * gone. The settings page keeps it - it is keyed by which trigger is being
       * edited, and saving does not change that - so a form that left
       * `submitting` set stayed on "Saving…", disabled, for as long as the page
       * was open. One save per visit, and a reload to make a second.
       *
       * Not a new fault; it was simply unreachable until this form grew a
       * control somebody would want to change twice. `trigger-switch-check`
       * turns the switch off, saves, turns it on and saves again for that
       * reason.
       */
      setSubmitting(false);
      // What it made, so the next write is an update rather than a
      // second definition with the same name.
      if (madeId === null) setMadeId(saved.id);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the trigger.'));
    } finally {
      /*
       * However it ended.
       *
       * A form that is pressed goes away when it succeeds, so leaving this on
       * cost nothing there. A form in a node's panel stays open and writes
       * itself, and `submitting` is what the watcher checks before writing -
       * so the first successful save switched the panel off for good, and
       * everything typed after it was dropped without a word. Choose a
       * function, fill its parameters, reload: the parameters were never
       * there.
       */
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className={styles.body} onSubmit={handleSubmit}>
        <div className={styles.fields}>
          {namedAfter === undefined && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="trigger-name">{t('Trigger Name')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="trigger-name"
                name="triggerName"
                className={styles.input}
                type="text"
                placeholder={incoming ? 'e.g. Slack Mention Handler' : 'e.g. Midnight Cleanup Job'}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
              />
            </div>
          </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="trigger-type">{t('Type')}</label>
            <div className={styles.inputWrapper}>
              <select
                id="trigger-type"
                name="triggerType"
                className={`${styles.input} ${styles.select}`}
                value={type}
                onChange={(event) => setType(event.target.value as TriggerType)}
                /*
                  What a shared trigger waits for does not change; its settings
                  do. Several workflows may point at one, and a kind changed
                  under them is every one of them rewritten by somebody who was
                  editing a different screen.
                  
                  A definition belonging to one node is the opposite: it is
                  this node's, nothing else can see it, and being unable to
                  change its kind meant starting again by pointing the picker
                  somewhere else and back.
                 */
                disabled={editing && !embedded}
              >
                <option value="INCOMING_CONNECTION">{t('Connection')}</option>
                <option value="SCHEDULED">{t('Scheduled')}</option>
                <option value="WEBHOOK">{t('Webhook')}</option>
              </select>
              <img src={chevronDown12Icon} alt="" width={12} height={12} />
            </div>
          </div>

          {/*
            The switch, in the same shape it has in the list: the label on the
            left, the toggle out on the right. It is about the trigger itself
            rather than about what it waits for, so it sits above the fields the
            type decides and does not move when the type changes.
          */}
          <div className={styles.field}>
            <span className={styles.labelRow}>
              <span className={own.labelWithHint}>
                <span className={styles.label} id="trigger-enabled-label">{t('Enabled')}</span>
                <FieldHint label={t('Enabled')}>
                  {t('Switched off it stays in the catalogue and fires at nothing, and the workflows pointing at it stop being started.')}
                </FieldHint>
              </span>
              <button
                id="trigger-enabled"
                type="button"
                className={own.toggle}
                onClick={() => setEnabled((on) => !on)}
                aria-pressed={enabled}
                aria-labelledby="trigger-enabled-label"
                title={enabled ? 'Enabled' : 'Disabled'}
              >
                <img
                  src={enabled ? toggleOnIcon : toggleOffIcon}
                  data-keeps-colour
                  alt=""
                  width={36}
                  height={20}
                />
              </button>
            </span>
          </div>

          {webhook && (
            <>
              <div className={styles.field}>
                <span className={own.labelWithHint}>
                  <label className={styles.label} htmlFor="trigger-webhook-path">
                    {t('URL')}
                  </label>
                  <FieldHint label={t("URL")}>
                    {t('Where this installation answers. One trigger per path, across every workspace.')}
                  </FieldHint>
                </span>
                <div className={styles.inputWrapper}>
                  <span className={styles.prefix}>/api/webhooks/</span>
                  <input
                    id="trigger-webhook-path"
                    name="webhookPath"
                    className={`${styles.input} ${styles.inputMono}`}
                    type="text"
                    placeholder="build/finished"
                    value={webhookPath}
                    onChange={(event) => setWebhookPath(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={styles.field}>
                {/*
                  What the picker points at is a definition somebody may need to
                  read or change while deciding — a webhook stands or falls on
                  whether the caller's JSON matches this shape. Opened in a tab of
                  its own so that going to look at it does not throw away a form
                  that has not been saved yet.
                */}
                <span className={styles.labelRow}>
                  <span className={own.labelWithHint}>
                    <label className={styles.label} htmlFor="trigger-object">
                      {t('Expected object')}
                    </label>
                    <FieldHint label={t('Expected object')}>
                      {t('What a request has to contain. Anything else is answered 404 — and what does match is what the workflow can rely on being handed.')}
                    </FieldHint>
                  </span>
                  {objectId !== '' && (
                    <Link
                      className={styles.jump}
                      to={`/workspace/${workspaceId}/objects/${objectId}`}
                      target="_blank"
                      rel="noreferrer"
                      title={t('Opens the object\'s definition in a new tab')}
                      aria-label={t('Open the expected object\'s definition')}
                    >
                      <OpenDefinitionIcon />
                    </Link>
                  )}
                </span>
                <DefinitionPicker
                  id="trigger-object"
                  value={objectId}
                  options={objectOptions}
                  onChoose={(picked) => {
                    // The row is an instruction rather than an answer: nothing is
                    // stored until the dialog it opens comes back with a real id.
                    if (picked === NEW_OBJECT) setMakingObject(true);
                    else setObjectId(picked);
                  }}
                  placeholder={t('Select object…')}
                  searchPlaceholder={t("Search objects…")}
                  create={NEW_OBJECT_ROW}
                />
                {/* Said out loud rather than behind the (?), because an object made
                    from here starts empty and an empty shape demands nothing - which
                    is the opposite of what somebody choosing an expected object is
                    usually after. It is a reading of what has just been chosen, and
                    it is only there while that is what is chosen. */}
                {objects.find((shape) => shape.id === objectId)?.propertyCount === 0 && (
                  <p className={styles.fieldHint}>
                    {t('This one has no fields yet, so any JSON matches it. Open it in Objects to say what a caller has to send.')}
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <span className={own.labelWithHint}>
                  <label className={styles.label} htmlFor="trigger-auth">
                    {t('Authentication')}
                  </label>
                  {/*
                    Behind the (?), and the two options are not: what each one is
                    stays written into the rows themselves, where it is the only
                    thing telling them apart.
                  */}
                  <FieldHint label={t('Authentication')}>
                    {t('A caller the function turns down is answered 401, and the refusal is written into this trigger\'s history.')}
                  </FieldHint>
                </span>
                <div className={styles.inputWrapper}>
                  <select
                    id="trigger-auth"
                    name="authType"
                    className={`${styles.input} ${styles.select}`}
                    value={authType}
                    onChange={(event) => setAuthType(event.target.value as WebhookAuthType)}
                  >
                    <option value="NONE">{t('Open — the URL is the secret')}</option>
                    <option value="FUNCTION">
                      {t('Function — ask one of this workspace\'s functions')}
                    </option>
                  </select>
                  <img src={chevronDown12Icon} alt="" width={12} height={12} />
                </div>
              </div>

              {authType === 'FUNCTION' && (
                <div className={styles.field}>
                  {/* The same reason as the object above: this is a definition, and it opens. */}
                  <span className={styles.labelRow}>
                    <span className={own.labelWithHint}>
                      <label className={styles.label} htmlFor="trigger-auth-function">
                        {t('Function')}
                      </label>
                      <FieldHint label={t('Function')}>
                        Handed the request by name &mdash; <code>body</code>, <code>rawBody</code>,{' '}
                        <code>headers</code>, <code>path</code> &mdash; then its own external parameters,
                        which is where a stored secret comes from.
                      </FieldHint>
                    </span>
                    {/* Nothing to open while the picker is on a name: the function
                        is created when the trigger is saved, not before. */}
                    {authFunctionId !== '' && authFunctionId !== NEW_FUNCTION && (
                      <Link
                        className={styles.jump}
                        to={`/workspace/${workspaceId}/functions/${authFunctionId}`}
                        target="_blank"
                        rel="noreferrer"
                        title={t('Opens the function in a new tab')}
                        aria-label={t('Open the function\'s definition')}
                      >
                        <OpenDefinitionIcon />
                      </Link>
                    )}
                  </span>
                  {/* The way to make one sits above the list and outlasts the search:
                      a workspace's functions fill a hundred rows, and typing a name
                      that matches none of them is exactly when it is wanted. */}
                  <DefinitionPicker
                    id="trigger-auth-function"
                    value={authFunctionId}
                    options={functionOptions}
                    onChoose={setAuthFunctionId}
                    placeholder={t('Select function…')}
                    searchPlaceholder={t("Search functions…")}
                    create={NEW_FUNCTION_ROW}
                  />
                  {authFunctionId === NEW_FUNCTION && (
                    <div className={styles.inputWrapper}>
                      <input
                        id="trigger-new-function"
                        name="newFunctionName"
                        className={`${styles.input} ${styles.inputMono}`}
                        type="text"
                        aria-label={t('New function name')}
                        placeholder={NEW_FUNCTION_NAME}
                        value={newFunctionName}
                        // Selected on focus, as the function editor does it: the box
                        // arrives with a name in it, so typing over it is one gesture.
                        onFocus={(event) => event.target.select()}
                        onChange={(event) => setNewFunctionName(event.target.value)}
                      />
                    </div>
                  )}
                  {/*
                    What the field is handed went behind the (?); these two did
                    not. The first is what saving is about to do — make a function
                    that turns every caller away — and a consequence read after the
                    fact is one that has already happened. The second is an empty
                    state: it is what this field has instead of anything to choose.
                  */}
                  {authFunctionId === NEW_FUNCTION ? (
                    <p className={styles.fieldHint}>
                      {t('Created with this trigger, turning every caller away. Open it in Functions to say who may call.')}
                    </p>
                  ) : functions.length === 0 ? (
                    <p className={styles.fieldHint}>
                      {t('No function here returns true or false yet; one that does can be chosen here, or made above.')}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}

          {webhook ? null : incoming ? (
            <>
              <div className={styles.field}>
                <span className={styles.labelRow}>
                  <span className={own.labelWithHint}>
                    <label className={styles.label} htmlFor="trigger-connection">
                      {t('Connection')}
                    </label>
                    <FieldHint label={t('Connection')}>
                      {t('Select the connection that will trigger this event.')}
                    </FieldHint>
                  </span>
                  {connectionId !== '' && (
                    <Link
                      className={styles.jump}
                      to={`/workspace/${workspaceId}/integrations/connections/${connectionId}`}
                      target="_blank"
                      rel="noreferrer"
                      title={t('Opens the connection in a new tab')}
                      aria-label={t("Open the connection's definition")}
                    >
                      <OpenDefinitionIcon />
                    </Link>
                  )}
                </span>
                {/* Nothing to make from here: a connection is a URL, a token and a
                    handshake with the service, none of which can be got from a name
                    - so this says where they are instead of offering a row that
                    would only lead to a half-made one. */}
                <DefinitionPicker
                  id="trigger-connection"
                  value={connectionId}
                  options={connectionOptions}
                  onChoose={setConnectionId}
                  placeholder={t('Select connection…')}
                  searchPlaceholder={t("Search connections…")}
                />
                {/*
                  The empty state stays where the missing contents would be. A
                  workspace with no connections has nothing to pick, and where to
                  go about that is not an explanation of the field - it is the
                  only thing this field can say for itself.
                */}
                {connections.length === 0 && (
                  <p className={styles.fieldHint}>
                    {t('None set up yet. Connections carry credentials, so they are added under the workspace\'s Integrations and chosen here afterwards.')}
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <span className={own.labelWithHint}>
                  <label className={styles.label} htmlFor="trigger-action">{t('Action')}</label>
                  <FieldHint label={t('Action')}>
                    {t('The specific event that activates this trigger.')}
                    <br />
                    <br />
                    <strong>{t('Mention')}</strong> is somebody naming the bot: <code>@orknux deploy</code>. It
                    arrives only when the bot is spoken to, which makes it the quietest of the three.
                    <br />
                    <br />
                    <strong>{t('Message')}</strong> is anything anybody types in any channel the bot is a member
                    of. That is a great deal more traffic than a mention: every remark in every one of
                    those channels reaches this installation and is measured against the workspace&apos;s
                    triggers. It needs the <code>channels:history</code> scope on the bot token, and{' '}
                    <code>groups:</code>, <code>im:</code> or <code>mpim:</code> for private channels and
                    direct messages. A bot that is not in the channel hears nothing there whatever its
                    scopes say.
                    <br />
                    <br />
                    <strong>{t('Reply')}</strong> is a thread reply to a message one of the workspace&apos;s own
                    bots wrote. Slack puts the author of a thread&apos;s parent message on every reply, and
                    a bot token is a Slack user, so choosing which bots to watch is choosing which user ids
                    a reply is measured against. Replies written by bots never fire it, or a workflow
                    answering in a thread it watches would start itself for ever.
                    <br />
                    <br />
                    Both of those also need the event itself subscribed in your Slack app, under{' '}
                    <em>Event Subscriptions</em> &rarr; <em>Subscribe to bot events</em>:{' '}
                    <code>message.channels</code>, and <code>message.groups</code>,{' '}
                    <code>message.im</code> or <code>message.mpim</code> for the other kinds. A new app
                    has only <code>app_mention</code> there, and the scope above is not a substitute:
                    a scope says what the token may read, a subscription says what Slack will send. This
                    installation cannot check it — Slack shows an app&apos;s subscriptions to no bot token.
                  </FieldHint>
                </span>
                <div className={styles.inputWrapper}>
                  <select
                    id="trigger-action"
                    name="action"
                    className={`${styles.input} ${styles.select}`}
                    value={action}
                    onChange={(event) => setAction(event.target.value as TriggerAction)}
                  >
                    {TRIGGER_ACTIONS.filter((candidate) => deliverable.includes(candidate)).map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {TRIGGER_ACTION_LABEL[candidate]}
                      </option>
                    ))}
                  </select>
                  <img src={chevronDown12Icon} alt="" width={12} height={12} />
                </div>
                {/*
                  A consequence of saving, so it stays in the open rather than
                  going behind the (?). Somebody choosing Message is about to
                  point a workflow at every remark in every channel the bot is
                  in, and that is worth knowing before Save and not after.
                */}
                {action === 'MESSAGE' && (
                  <p className={styles.fieldHint} id="trigger-action-volume">
                    {t('Every message in every channel this bot is in will be measured against this trigger.')}
                  </p>
                )}
                {/*
                  A warning, so it stays in the open by the rules file's own
                  list. It is also the whole of issue #269's aftermath: this
                  trigger is Enabled, it has a connection and it has an action,
                  and Slack will never deliver it anything - which was drawn in
                  exactly one place, under a checkbox on a field only a reply
                  opens, where nobody who had not already guessed would look.

                  The server's sentence verbatim. It is the one the Replies To
                  rows have always drawn and the one `SlackBotUsers` composes
                  from the scopes it actually read, so there is nothing here to
                  drift from it.
                */}
                {silent !== null && (
                  <p className={own.cannotFire} id="trigger-action-receives">
                    {silent.message}
                  </p>
                )}
              </div>

              {reply && (
                <div className={styles.field}>
                  <span className={own.labelWithHint}>
                    <span className={styles.label} id="trigger-watched-label">
                      {t('Replies To')}
                    </span>
                    <FieldHint label={t('Replies To')}>
                      <p>{t('Which bots to watch for replies to.')}</p>
                    </FieldHint>
                  </span>
                  <ul className={own.watchList} aria-labelledby="trigger-watched-label">
                    {slackBots.map((bot) => (
                      <li key={bot.connectionId} className={own.watchRow}>
                        <label className={own.watchLabel}>
                          <input
                            type="checkbox"
                            id={`trigger-watch-${bot.connectionId}`}
                            checked={watched.includes(bot.connectionId)}
                            disabled={bot.outcome !== 'FOUND'}
                            onChange={(event) =>
                              setWatched((current) =>
                                event.target.checked
                                  ? [...current, bot.connectionId]
                                  : current.filter((held) => held !== bot.connectionId),
                              )
                            }
                          />
                          <span className={own.watchName}>{bot.name}</span>
                          {/* The handle and not the id: two connections on one
                              token draw the same one, which is the whole of
                              what a person needs to see here. */}
                          <span className={own.watchHandle}>{bot.handle ?? '\u2014'}</span>
                        </label>
                        {/*
                          Outside the label, deliberately.

                          A press on a link inside a `<label>` is forwarded to
                          the checkbox it belongs to, so going to read what a
                          connection is would have silently ticked or unticked
                          it - the same trap the agent grant rows were fixed
                          for.
                        */}
                        <Link
                          className={styles.jump}
                          to={`/workspace/${workspaceId}/integrations/connections/${bot.connectionId}`}
                          target="_blank"
                          rel="noreferrer"
                          title={t('Opens the connection in a new tab')}
                          aria-label={t("Open the connection's definition")}
                        >
                          <OpenDefinitionIcon />
                        </Link>
                        {bot.message !== '' && <p className={own.watchNote}>{bot.message}</p>}
                      </li>
                    ))}
                  </ul>
                  {slackBots.length === 0 && (
                    <p className={styles.fieldHint}>
                      {t('No Slack connections yet. A reply is matched against the bot a connection posts as, so one is added under the workspace\'s Integrations and chosen here afterwards.')}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className={styles.field}>
                <span className={own.labelWithHint}>
                  <label className={styles.label} htmlFor="trigger-cron">{t('Schedule')}</label>
                  <FieldHint label={t('Schedule')}>
                    {t('A cron expression defining when the trigger fires. Six fields, in this order:')}
                    <span className={own.cronLegend}>
                      {CRON_FIELDS.map((field) => (
                        <span key={field.position} className={own.cronLegendRow}>
                          <span className={own.cronLegendAt}>{field.position}</span>
                          <span className={own.cronLegendLabel}>{field.label}</span>
                          <span className={own.cronLegendAccepts}>{field.accepts}</span>
                        </span>
                      ))}
                    </span>
                    Five fields are read from the minute, with the second at zero — so{' '}
                    <code>0 2 * * *</code> and <code>0 0 2 * * *</code> are the same schedule. Both{' '}
                    <code>0</code> and <code>7</code> are Sunday.
                  </FieldHint>
                </span>
                <div className={styles.inputWrapper}>
                  <input
                    id="trigger-cron"
                    name="cron"
                    className={`${styles.input} ${styles.inputMono} ${styles.inputCron}`}
                    type="text"
                    placeholder="0 2 * * *"
                    value={cron}
                    aria-describedby="trigger-cron-reading"
                    onChange={(event) => setCron(event.target.value)}
                    required
                  />
                </div>
                {/*
                  What the expression does, under the expression.

                  In the open rather than behind the (?), because it is not an
                  explanation of the field - it is the result of what was just
                  typed into it, which the rules file keeps in the open for the
                  same reason an error stays in the open.

                  One line, always, whatever it says. It is recomputed on every
                  keystroke, and a hint that grows to two lines and back pushes
                  the Timezone select and the buttons below it up and down under
                  the pointer - which is precisely what makes a live reading feel
                  broken rather than helpful. The full sentence is on the title
                  for the rare one long enough to be clipped.
                */}
                <p
                  id="trigger-cron-reading"
                  className={`${styles.fieldHint} ${own.cronReading} ${
                    reading.state === 'unreadable' || reading.state === 'unreachable' ? own.cronReadingWrong : ''
                  }`}
                  title={reading.text}
                >
                  {reading.text}
                </p>
              </div>

              <div className={styles.field}>
                <span className={own.labelWithHint}>
                  <label className={styles.label} htmlFor="trigger-timezone">{t('Timezone')}</label>
                  <FieldHint label={t('Timezone')}>
                    {t('The timezone used to resolve the cron schedule.')}
                  </FieldHint>
                </span>
                <div className={styles.inputWrapper}>
                  <select
                    id="trigger-timezone"
                    name="timezone"
                    className={`${styles.input} ${styles.select}`}
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  >
                    {TIMEZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                  <img src={chevronDown12Icon} alt="" width={12} height={12} />
                </div>
              </div>
            </>
          )}

          <div className={styles.field}>
            {/* A condition is a definition too, and reading it is how somebody decides. */}
            <span className={styles.labelRow}>
              <span className={own.labelWithHint}>
                <label className={styles.label} htmlFor="trigger-condition">{t('Condition')}</label>
                <FieldHint label={t('Condition')}>
                  {t('Asked before anything starts, so an event it turns down leaves no run behind.')}
                </FieldHint>
              </span>
              {conditionId !== '' && (
                <Link
                  className={styles.jump}
                  to={`/workspace/${workspaceId}/conditions/${conditionId}`}
                  target="_blank"
                  rel="noreferrer"
                  title={t('Opens the condition in a new tab')}
                  aria-label={t('Open the condition\'s definition')}
                >
                  <OpenDefinitionIcon />
                </Link>
              )}
            </span>
            <DefinitionPicker
              id="trigger-condition"
              value={conditionId}
              options={conditionOptions}
              onChoose={(picked) => {
                // The row is an instruction rather than an answer: nothing is
                // stored until the dialog it opens comes back with a real id.
                if (picked === NEW_CONDITION) setMakingCondition(true);
                else setConditionId(picked);
              }}
              placeholder={t('Fire on everything')}
              searchPlaceholder={t("Search conditions…")}
              create={NEW_CONDITION_ROW}
            />
          </div>

          <IconField
            value={icon}
            onChange={setIcon}
            hint={t("Nodes drawn from this trigger start with it; each node can change its own.")}
          />

          <div className={styles.field}>
            <span className={own.labelWithHint}>
              <label className={styles.label} htmlFor="trigger-payload">{t('Payload')}</label>
              <FieldHint label={t('Payload')}>
                {incoming
                  ? t('JSON added underneath the event, for values the event does not carry.')
                  : webhook
                    ? t('JSON added underneath the request, for values the caller does not send.')
                    : t('JSON handed to the run. The clock carries no data, so this is what the workflow works on.')}
              </FieldHint>
            </span>
            <div className={`${styles.inputWrapper} ${styles.inputWrapperTall}`}>
              <textarea
                id="trigger-payload"
                name="payload"
                className={`${styles.input} ${styles.textarea} ${styles.inputMono}`}
                placeholder={'{ "format": "compact" }'}
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
              />
            </div>
          </div>
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {/*
          No press in a node's panel: it saves as the panel saves, and a
          Create button there is a second kind of saving somebody has to
          know about - the one whose unpressed state loses the whole
          definition on the next Save of the graph.

          Nor Delete. It was kept here on the argument that nothing else
          offers it, and that argument was wrong twice over: a definition
          belonging to one node goes when the node does or when the picker is
          pointed elsewhere, and a red button in the middle of a form somebody
          is filling in is a press away from losing the work. The list of
          definitions is where one is taken away deliberately.
        */}
        {embedded ? null : (
        <div className={styles.actions}>
          {onCancel !== undefined && (
            <button type="button" className={styles.ghost} onClick={onCancel} disabled={submitting}>
              {t('Cancel')}
            </button>
          )}
          <button type="submit" className={styles.filled} disabled={!complete || submitting}>
            {submitting ? t('Saving…') : editing ? t('Save Changes') : t('Create Trigger')}
          </button>
        </div>
        )}
      </form>

      {/*
        Beside the form rather than inside it, and only while open.
        A form nested in a form is not something a browser will keep apart: the
        inner dialog's submit would bubble into this one's handler and save the
        trigger somebody is still filling in.
      */}
      {makingCondition && (
        <ConditionDialog
          open
          workspaceId={workspaceId}
          condition={null}
          onClose={() => setMakingCondition(false)}
          onSaved={(made) => {
            // Into this form's own list as well as into the field: this is a
            // settings page as often as it is a dialog, and nothing is going to
            // fetch the conditions again while it stays open.
            setConditions((current) => [...current, made]);
            setConditionId(made.id);
            setMakingCondition(false);
          }}
        />
      )}

      {makingObject && (
        <NameDialog
          open
          title={t('Create Object')}
          message={t("Name the shape a caller has to send. Its fields are written in Objects.")}
          nameLabel={t("Object Name")}
          namePlaceholder={t('e.g. BuildFinished')}
          descriptionPlaceholder={t("What this describes")}
          submitLabel={t("Create Object")}
          onClose={() => setMakingObject(false)}
          onSubmit={async (called, description) => {
            const made = await createObject(workspaceId, { name: called, description });
            setObjects((current) => [...current, made]);
            setObjectId(made.id);
            setMakingObject(false);
          }}
        />
      )}
    </>
  );
}
