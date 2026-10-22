import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReadsSecrets } from './readsSecrets';
import { useParams } from 'react-router-dom';

import {
  clearPluginParameter,
  revealPluginParameter,
  fetchWorkspacePlugins,
  setPluginParameter,
} from '../../api/plugins';
import type { PluginParameterSetting, WorkspacePlugin } from '../../api/plugins';
import { fetchWorkspaceConnections, offersConnection } from '../../api/integrations';
import type { PluginConnectionType, WorkspaceConnection } from '../../api/integrations';
import type { SessionUser } from '../../api/session';
import type { Variable } from '../../api/variables';
import puzzleIcon from '../../assets/puzzle.svg';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { ColumnHeader } from '../../components/ColumnHeader';
import { FieldHint } from '../../components/FieldHint';
import { FieldPicker } from '../../components/FieldPicker';
import { RevealToggle } from '../../components/RevealToggle';
import type { FieldOption, FieldPickerLabels } from '../../components/FieldPicker';
import { Loader } from '../../components/Loader';
import { ordered, useTableSort } from '../../components/tableSort';
import { CompactPagination } from '../../components/CompactPagination';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { useSearch } from '../../components/useSearch';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import { useWorkspaceVariables } from './workspaceVariables';
import styles from './WorkspacePluginsPage.module.css';
import { t, tf } from '../../i18n';

export interface WorkspacePluginsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * Written here, or read from somewhere else.
 *
 * The same two words a node's parameter offers in the workflow editor, because it
 * is the same question, and somebody who has answered it once there should not
 * have to work out that this screen is asking it again.
 */
type Answer = 'VALUE' | 'REFERENCE';

/**
 * What the picker says when the list it offers is this workspace's variables
 * rather than the fields an earlier node produces.
 */
const VARIABLE_LABELS: FieldPickerLabels = {
  empty: t('Choose a variable…'),
  search: t('Search variables'),
  none: t('This workspace has no variables yet.'),
  noMatch: t('No variable matches'),
  gone: 'no longer in this workspace',
};

/**
 * What this workspace has told the plugins loaded into the installation.
 *
 * Not the admin plugins screen and deliberately not beside it. Loading a plugin
 * is one decision made once for everyone; pointing it at this team's tracker with
 * this team's token is a different decision, made by the people whose tracker and
 * token they are. So this lists the same plugins and answers a different question.
 *
 * A plugin missing something it said it needs is marked in the list and again on
 * the parameter itself. Both come from the server rather than being worked out
 * here, or the row and what is inside it would eventually disagree.
 */
function WorkspacePluginsView({ session, onSignOut, onDiscard }: WorkspacePluginsPageProps & { onDiscard: () => void }) {
  const { workspaceId = '' } = useParams();

  const [plugins, setPlugins] = useState<WorkspacePlugin[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which plugin's parameters are open. One at a time; this is a list, not a form. */
  const [open, setOpen] = useState<string | null>(null);

  /*
   * Narrowed and paged here rather than by the server.
   *
   * Honest on this page and not on the paged ones: the query answers with
   * every plugin loaded into the installation, so what is in the browser is
   * the population - nothing can be hiding on a page that was never fetched.
   */
  const [typed, setTyped, asked] = useSearch();

  /**
   * What is in every box on this page that has not been stored, by plugin and
   * then by parameter.
   *
   * Held here rather than on a row because the press that stores it is at the
   * bottom of the page: somebody setting a plugin up fills in what it asks
   * for - sometimes across two of them - and then looks down. A row that
   * stored itself the moment you left it was a row you could not correct
   * without a round trip.
   */
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  /**
   * The boxes emptied where they showed what is stored - a plain value, or a
   * secret somebody revealed. Only those: a stored secret's box opens empty,
   * and a character typed into it and taken back must not erase the secret.
   */
  const [clearing, setClearing] = useState<Set<string>>(() => new Set());
  /**
   * A variable picked under Reference and not yet saved, by plugin and name.
   *
   * Kept apart from the typed drafts because it is answered differently - by
   * which variable, not by text. Every control on this page waits for Save:
   * the pickers used to store the moment they changed while the boxes beside
   * them waited, so whether a change needed saving depended on which kind of
   * control it was made in.
   */
  const [references, setReferences] = useState<Record<string, Record<string, string>>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('plugins');

  // A new search is a new list, so it starts at its first page.
  useEffect(() => setPage(1), [asked]);

  const [order, ascending, sortBy] = useTableSort<'NAME' | 'PARAMETERS'>('plugins', 'NAME', true, [
    'PARAMETERS',
  ]);

  /** A plugin is found by the name it shows, by its key, or by who wrote it. */
  const matching = useMemo(() => {
    const looking = asked.trim().toLowerCase();
    if (plugins === null) return null;
    if (looking === '') return plugins;
    return plugins.filter((entry) => {
      const held = entry.plugin;
      return (
        held.name.toLowerCase().includes(looking) ||
        held.key.toLowerCase().includes(looking) ||
        (held.author ?? '').toLowerCase().includes(looking) ||
        (held.summary ?? '').toLowerCase().includes(looking)
      );
    });
  }, [plugins, asked]);

  /*
   * The order a heading asked for, applied here. Issue #358. The plugins arrive
   * whole - this page pages them itself - so the parameter count is a column
   * this list can honestly be ordered by, unlike the counts on the server-paged
   * lists where the number is worked out after the page has been chosen.
   */
  const arranged = useMemo(
    () =>
      matching === null
        ? null
        : ordered(
            matching,
            (entry) => (order === 'PARAMETERS' ? entry.parameters.length : entry.plugin.name),
            ascending,
            (entry) => entry.plugin.name,
          ),
    [matching, order, ascending],
  );

  const shown = useMemo(() => {
    if (arranged === null) return null;
    const from = (page - 1) * pageSize;
    return arranged.slice(from, from + pageSize);
  }, [arranged, page, pageSize]);
  /*
   * What the pickers offer, kept current rather than read once with the plugins.
   * A parameter is answered with a variable, and the variable it wants is often
   * made on the Variables page after this one was opened.
   */
  const { variables, refresh: refreshVariables } = useWorkspaceVariables(workspaceId);
  /*
   * What a connection parameter picks from. A connection is referenced by which
   * one it is, not by a number somebody read off another page's URL, so the row
   * offers the workspace's connections by name and stores the choice.
   */
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);

  useEffect(() => {
    if (workspaceId === '') return;
    let current = true;
    fetchWorkspaceConnections(workspaceId)
      .then((found) => {
        if (current) setConnections(found);
      })
      .catch(() => {
        // The list stays empty and the picker says so; the page still loads.
      });
    return () => {
      current = false;
    };
  }, [workspaceId]);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setLoading(true);
    setError(null);
    fetchWorkspacePlugins(workspaceId)
      .then((found) => {
        setPlugins(found);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setPlugins(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the plugins.'));
        setLoading(false);
      });
  }, [workspaceId]);

  useEffect(load, [load]);

  /**
   * Every box on this page holding something the server has not been told.
   *
   * Read off what is loaded rather than kept as a count, so a draft that has
   * just been stored stops being one the moment the answer comes back - the
   * parameters are replaced by what the server returned, and a draft equal to
   * a stored value is not unsaved by definition.
   */
  const unsaved = (plugins ?? []).flatMap((entry) =>
    entry.parameters
      .filter((parameter) => {
        const draft = drafts[entry.plugin.id]?.[parameter.name];
        if (draft === undefined) return false;
        // Emptied where the box showed what is stored: a change, which saving makes by clearing it.
        if (draft.trim() === '') return clearing.has(`${entry.plugin.id}/${parameter.name}`);
        return draft.trim() !== (parameter.literal ?? '');
      })
      .map((parameter) => ({ pluginId: entry.plugin.id, name: parameter.name, variableId: null as string | null }))
      .concat(
        entry.parameters
          .filter((parameter) => {
            const picked = references[entry.plugin.id]?.[parameter.name];
            return picked !== undefined && picked !== parameter.variableId;
          })
          .map((parameter) => ({
            pluginId: entry.plugin.id,
            name: parameter.name,
            variableId: references[entry.plugin.id]?.[parameter.name] ?? null,
          })),
      ),
  );

  /**
   * The press at the bottom of the page: everything typed, stored.
   *
   * One at a time rather than all at once. Each is its own write with its own
   * refusal - a number that is not a number, a variable from another workspace
   * - and a failure halfway through should leave what came before it stored
   * rather than rolled into one unreadable error.
   */
  async function saveAll() {
    for (const one of unsaved) {
      if (one.variableId !== null) {
        if (await onSet(one.pluginId, one.name, { variableId: one.variableId })) {
          setReferences((held) => {
            const mine = { ...(held[one.pluginId] ?? {}) };
            delete mine[one.name];
            return { ...held, [one.pluginId]: mine };
          });
        }
        continue;
      }
      const typed = (drafts[one.pluginId]?.[one.name] ?? '').trim();
      const stored = typed === ''
        ? await onClear(one.pluginId, one.name)
        : await onSet(one.pluginId, one.name, { literal: typed });
      /*
       * Stored, it is no longer a draft. Comparing the draft with what came
       * back was enough for a plain value and never for a secret, which comes
       * back as nothing: a typed secret read as unsaved for good after it was
       * saved, and the box went on holding it.
       */
      if (stored) {
        setDrafts((held) => {
          const mine = { ...(held[one.pluginId] ?? {}) };
          delete mine[one.name];
          return { ...held, [one.pluginId]: mine };
        });
      }
    }
  }

  /** One plugin's answer replaces that plugin's row, and nothing else moves. */
  function replace(answered: WorkspacePlugin) {
    setPlugins((current) =>
      current === null
        ? current
        : current.map((one) => (one.plugin.id === answered.plugin.id ? answered : one)),
    );
  }

  async function onSet(
    pluginId: string,
    name: string,
    answer: { literal: string } | { variableId: string },
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      replace(await setPluginParameter(workspaceId, pluginId, name, answer));
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not set that parameter.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onClear(pluginId: string, name: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      replace(await clearPluginParameter(workspaceId, pluginId, name));
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not clear that parameter.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      scrollContent
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>{t('Plugins')}</h1>
            <p className={styles.subtitle}>
              {t('What this workspace tells the plugins loaded into the installation. A plugin only ever sees what is set here, so this list is also the answer to what each one can reach.')}
            </p>
          </div>
        </header>

        <SearchRow>
          <SearchBox
            value={typed}
            onChange={setTyped}
            placeholder={t('Search plugins...')}
          />
        </SearchRow>

        {loading && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}
        {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
        {!loading && error === null && plugins?.length === 0 && (
          <p className={styles.notice}>
            {t('No plugins are loaded into this installation, so there is nothing to configure.')}
          </p>
        )}

        {/*
          Said outright, because a page listing plugins and offering nothing against
          any of them reads as broken rather than as finished. What can be set here
          is what a plugin asked for, so plugins that ask for nothing leave a list
          with nothing to open — and that sentence is the difference between a
          screen that is working and one somebody reports.
        */}
        {!loading && error === null && plugins !== null && plugins.length > 0 && asksForNothing(plugins) && (
          <p className={styles.notice}>
            <span className={styles.labelWithHint}>
              None of the plugins loaded into this installation ask for anything, so there is nothing
              for this workspace to set.
              {/*
                Why the list is empty is the status and stays. How a plugin comes
                to have anything here at all is teaching, and goes behind the (?).
              */}
              <FieldHint label={t('Nothing to set')}>
                A plugin declares what it has to be told and only what it declares can be answered
                here
                {session.admin
                  ? ' — the template on the admin plugins page shows how a plugin declares a parameter.'
                  : '.'}
              </FieldHint>
            </span>
          </p>
        )}

        {plugins !== null && plugins.length > 0 && matching?.length === 0 && (
          <p className={styles.notice}>{t('No plugin matches what you typed.')}</p>
        )}

        {plugins !== null && plugins.length > 0 && (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <ColumnHeader
                label={t('Plugin')}
                order="NAME"
                current={order}
                ascending={ascending}
                onSort={sortBy}
                className={styles.colName}
              />
              <ColumnHeader
                label={t('Parameters')}
                order="PARAMETERS"
                current={order}
                ascending={ascending}
                onSort={sortBy}
                className={styles.colParams}
              />
            </div>

            {shown?.map((entry) => {
              const opens = entry.parameters.length > 0;
              const showing = open === entry.plugin.id;

              return (
                <div key={entry.plugin.id} className={styles.group}>
                  <div className={styles.row}>
                    <span className={styles.colName}>
                      <img className={styles.icon} src={puzzleIcon} alt="" width={16} height={16} />
                      <span className={styles.nameBlock}>
                        <span className={styles.name}>
                          {/*
                            The name is the way in, because it is what somebody
                            reaches for first. A real button, so Tab reaches it and
                            a reader announces it as something that opens - and a
                            plugin with nothing to open stays plain text rather than
                            becoming a control that answers a click with nothing.
                          */}
                          {opens ? (
                            <button
                              type="button"
                              className={styles.nameButton}
                              aria-expanded={showing}
                              aria-controls={`plugin-parameters-${entry.plugin.id}`}
                              title={`${showing ? 'Close' : 'Open'} what ${entry.plugin.name} asks for`}
                              onClick={() => {
                                // Opening the parameters is reaching for the
                                // list they are answered from, so it is read
                                // again; the picker takes what lands.
                                if (!showing) refreshVariables();
                                setOpen(showing ? null : entry.plugin.id);
                              }}
                            >
                              {entry.plugin.name}
                              <span className={styles.caret} aria-hidden="true">
                                {showing ? '▴' : '▾'}
                              </span>
                            </button>
                          ) : (
                            <span title={`${entry.plugin.name} declares no parameters, so it has nothing to set`}>
                              {entry.plugin.name}
                            </span>
                          )}
                          {/*
                            The red mark the list is read for. Titled rather than
                            left as decoration, so hovering says which parameters
                            are missing without opening anything.
                          */}
                          {entry.missing.length > 0 && (
                            <span
                              className={styles.mark}
                              title={`Not set: ${entry.missing.join(', ')}`}
                              aria-label={`Not set: ${entry.missing.join(', ')}`}
                            >
                              ●
                            </span>
                          )}
                        </span>
                        <span className={styles.key}>{entry.plugin.key}</span>
                      </span>
                    </span>

                    <span className={styles.colParams}>
                      <Summary entry={entry} />
                    </span>
                  </div>

                  {showing && (
                    <div className={styles.details} id={`plugin-parameters-${entry.plugin.id}`}>
                      {entry.parameters.map((parameter) => (
                        <ParameterRow
                          key={parameter.name}
                          pluginId={entry.plugin.id}
                          pluginKey={entry.plugin.key}
                          kinds={entry.plugin.connectionTypes}
                          parameter={parameter}
                          variables={variables}
                          connections={connections}
                          busy={busy}
                          onPicked={(variableId) => {
                            setReferences((held) => ({
                              ...held,
                              [entry.plugin.id]: { ...(held[entry.plugin.id] ?? {}), [parameter.name]: variableId },
                            }));
                            // A reference picked replaces a value typed, as saving it would.
                            setDrafts((held) => {
                              const mine = { ...(held[entry.plugin.id] ?? {}) };
                              delete mine[parameter.name];
                              return { ...held, [entry.plugin.id]: mine };
                            });
                          }}
                          onClear={() => void onClear(entry.plugin.id, parameter.name)}
                          onTyped={(value, clears) => {
                            // And a value typed or chosen replaces a reference picked.
                            setReferences((held) => {
                              const mine = { ...(held[entry.plugin.id] ?? {}) };
                              delete mine[parameter.name];
                              return { ...held, [entry.plugin.id]: mine };
                            });
                            setDrafts((held) => ({
                              ...held,
                              [entry.plugin.id]: { ...(held[entry.plugin.id] ?? {}), [parameter.name]: value },
                            }));
                            setClearing((held) => {
                              const next = new Set(held);
                              const key = `${entry.plugin.id}/${parameter.name}`;
                              if (clears) next.add(key);
                              else next.delete(key);
                              return next;
                            });
                          }}
                          onSubmit={() => void saveAll()}
                          draft={drafts[entry.plugin.id]?.[parameter.name]}
                          picked={references[entry.plugin.id]?.[parameter.name]}
                          workspaceId={workspaceId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/*
          Shown whenever there is anything, not only when there is more than
          one page: it carries the page-size control as well as the numbers.
        */}
        {/*
          The press, at the bottom of the page.

          One for everything on it rather than one per plugin: setting a plugin
          up is filling in what it asks for and then looking down, and two of
          them being configured at once is one trip rather than two. Switched
          off with nothing to store rather than hidden, so its place does not
          move as somebody types - and saying how many boxes are waiting,
          because a page of forms and one button owes an answer to "did it take
          all of them".
        */}

        {matching !== null && matching.length > 0 && (
          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={matching.length}
            unit={t('plugins')}
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={setPageSize}
          />
        )}
        <SaveBar>
          {unsaved.length > 0 && (
            <span className={styles.pageUnsaved}>
              {unsaved.length === 1 ? t('1 unsaved') : `${unsaved.length} unsaved`}
            </span>
          )}
          <DiscardButton onDiscard={onDiscard} disabled={busy || unsaved.length === 0} />
          <button
            type="button"
            className={styles.pageSave}
            disabled={busy || unsaved.length === 0}
            onClick={() => void saveAll()}
          >{t('Save')}</button>
        </SaveBar>
      </section>
    </AppShell>
  );
}

/** Whether every plugin in the list declared no parameters at all. */
function asksForNothing(plugins: WorkspacePlugin[]): boolean {
  return plugins.every((one) => one.parameters.length === 0);
}

/** What the row says about a plugin without opening it. */
function Summary({ entry }: { entry: WorkspacePlugin }) {
  /*
   * "Declares no parameters" rather than "needs nothing": the first says whose
   * doing it is that the row cannot be opened, and the second reads as if this
   * page had decided there was nothing worth showing.
   */
  if (entry.parameters.length === 0) {
    return <span className={styles.muted}>{t('declares no parameters')}</span>;
  }
  if (entry.missing.length > 0) {
    return (
      <span className={styles.missingText}>
        {entry.missing.length === 1
          ? `${entry.missing[0]} is not set`
          : `${entry.missing.length} parameters are not set`}
      </span>
    );
  }
  return (
    <span className={styles.muted}>
      {entry.parameters.length === 1 ? t('1 parameter set') : `all ${entry.parameters.length} set`}
    </span>
  );
}

interface ParameterRowProps {
  pluginId: string;
  /** What the plugin calls itself, which is the first half of a kind it declares - `key/name`. */
  pluginKey: string;
  /** The kinds of connection this plugin declares, so a picker can name one as the plugin does. */
  kinds: PluginConnectionType[];
  parameter: PluginParameterSetting;
  variables: Variable[];
  connections: WorkspaceConnection[];
  busy: boolean;
  /** A variable chosen under Reference, held until Save like anything typed. */
  onPicked: (variableId: string) => void;
  onClear: () => void;
  /**
   * What is in the box right now, reported as it is typed.
   *
   * The press that stores it lives at the top of the page rather than on this
   * row, so the row holds the text and the page holds the decision. A choice in
   * a picker - a connection, one of the plugin's options - is reported the same
   * way, so every change on the page waits for Save alike.
   */
  onTyped: (value: string, clears: boolean) => void;
  /** Enter in the box, which saves the whole plugin's settings. */
  onSubmit: () => void;
  /** What is typed and not yet stored, or undefined once it has been - which puts the box back to what is stored. */
  draft?: string;
  /** The variable picked under Reference and not yet saved. */
  picked?: string;
  workspaceId: string;
}

/**
 * One parameter, and the two ways of answering it.
 *
 * Laid out the way a node's parameter is laid out in the workflow editor: the
 * name, then the Value-or-Reference switch, then whichever control that choice
 * asks for. It is the same question in both places, and reading as two unrelated
 * screens was the complaint.
 *
 * A secret can only be answered by pointing at a variable, because the server
 * refuses a typed-in value for one - a form that offered the box and then reported
 * the refusal would be inviting somebody to paste a token into a page that shows
 * it back. So the switch still says both words and Value is the one that cannot
 * be pressed, which says why rather than quietly leaving half the control out.
 *
 * A connection parameter is the opposite way round: the server refuses a
 * variable for one, and what it stores is which of the workspace's connections
 * was picked - so the box is a picker of them by name, never a number typed in.
 */
function ParameterRow({
  pluginId,
  pluginKey,
  kinds,
  parameter,
  variables,
  connections,
  busy,
  onPicked,
  onClear,
  onTyped,
  onSubmit,
  draft,
  picked,
  workspaceId,
}: ParameterRowProps) {
  const readsSecrets = useReadsSecrets(workspaceId);
  const [typed, setTyped] = useState(parameter.literal ?? '');

  // The stored value is the one to edit whenever it changes underneath, which it
  // does every time an answer comes back from the server - and once a draft is
  // stored, which for a secret changes nothing that comes back.
  useEffect(() => {
    if (draft === undefined) {
      setTyped(parameter.literal ?? '');
      setRevealed(false);
    }
  }, [parameter.literal, draft]);

  /*
   * A stored secret, shown when asked for: the server hands it back one at a
   * time and records that it did, as it does a connection's credentials. Put
   * in the box as the stored value rather than as a draft, so looking at it is
   * not a change - and taken away again when it is hidden.
   */
  const [revealed, setRevealed] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  async function toggleStored() {
    if (revealed) {
      setRevealed(false);
      setShowTyped(false);
      setTyped('');
      return;
    }
    setRevealError(null);
    try {
      const secret = await revealPluginParameter(workspaceId, pluginId, parameter.name);
      if (secret === null) return;
      setTyped(secret);
      setRevealed(true);
      setShowTyped(true);
    } catch (cause: unknown) {
      setRevealError(cause instanceof Error ? cause.message : t('Could not show that secret.'));
    }
  }

  const takesConnection = parameter.type.toLowerCase() === 'connection';
  /**
   * The connections this parameter may name: the declared kind's, or all of
   * them. A kind that is not SLACK, SMTP or HTTP is one this plugin declares
   * itself, and then only the connections wearing its label are offered - two
   * Prometheus servers to a Prometheus plugin, and not the wiki beside them.
   */
  const offeredConnections = takesConnection
    ? connections.filter((held) => offersConnection(held, parameter.connectionType, pluginKey))
    : [];
  /** What the declared kind is called on screen: the plugin's label for its own, the name for a core one. */
  const kindLabel =
    kinds.find((kind) => kind.name === parameter.connectionType)?.label ?? parameter.connectionType ?? '';
  /** What the picker shows for the stored choice: the name, or that it is gone. */
  const storedConnection =
    takesConnection && parameter.literal !== null
      ? offeredConnections.find((held) => held.id === parameter.literal) ?? null
      : null;

  /*
   * Which side the switch opens on: whichever the parameter is actually
   * answered by.
   *
   * A secret used to force REFERENCE because typing one was refused. It is
   * stored encrypted now, so a secret somebody typed opens on Value - where
   * the box says it is set - and one pointing at a variable opens on
   * Reference, like everything else.
   */
  const stored: Answer = parameter.variableId !== null ? 'REFERENCE' : 'VALUE';
  const [mode, setMode] = useState<Answer>(stored);
  /*
   * Whether what is being typed is readable. Issue #366.
   *
   * A key pasted with a character missing, or one the clipboard mangled, could
   * not be checked before it was saved - and the plugin that then refused to
   * authenticate said nothing about which of the two it was. Connections got
   * this in #339 and the variables page has it; this is the third place.
   *
   * Only ever what somebody is typing now. A stored secret is not shown,
   * because the server never hands one back: the placeholder saying there is
   * one is the whole of what it will say.
   */
  const [showTyped, setShowTyped] = useState(false);

  /*
   * Switching only changes which control is shown, and sends nothing: an answer
   * already stored is not thrown away by looking at the other way of giving one.
   * What is stored wins again the moment the server says anything, so the switch
   * cannot end up describing something other than what is set.
   */
  useEffect(() => setMode(stored), [stored]);

  const answered = parameter.literal !== null || parameter.variableId !== null;
  const fieldId = `plugin-parameter-${pluginId}-${parameter.name}`;

  /*
   * A workspace variable in the shape the picker offers things in. Grouped by
   * catalog for the reason the editor groups by node: a name on its own is not
   * always enough to know which one was meant.
   */
  const options = useMemo<FieldOption[]>(
    () =>
      variables.map((variable) => ({
        groupKey: variable.catalogId,
        groupName: variable.catalogName,
        field: variable.name,
        expression: variable.id,
        type: variable.type.toLowerCase(),
      })),
    [variables],
  );

  return (
    <div className={`${styles.parameter} ${parameter.missing ? styles.parameterMissing : ''}`}>
      <span className={styles.parameterHead}>
        <span className={styles.parameterNameGroup}>
          <label className={styles.parameterName} htmlFor={fieldId}>
            {parameter.name}
          </label>
          {/*
            What the plugin says this parameter is for, asked for rather than
            printed: a plugin with six parameters printed six paragraphs, and
            the boxes to fill in were outnumbered by prose about them.
          */}
          {parameter.description !== null && (
            <FieldHint label={parameter.name}>{parameter.description}</FieldHint>
          )}
          <span className={styles.parameterType}>{parameter.type.toLowerCase()}</span>
          {parameter.required && <span className={styles.required}>{t('required')}</span>}
          {parameter.secret && <span className={styles.secret}>{t('secret')}</span>}
        </span>
        <span className={styles.parameterActions}>
          {/*
            Against the parameter itself, which is what the issue asks for: a plugin
            marked in the list is one thing, being told which of its parameters is
            the problem is what somebody actually needs to act on.
          */}
          {parameter.missing && <span className={styles.parameterMark}>{t('not set')}</span>}
          {answered && (
            <button type="button" className={styles.parameterAction} disabled={busy} onClick={onClear}>
              {t('Clear')}
            </button>
          )}
        </span>
      </span>

      <div className={styles.modeRow}>
        <div className={styles.modeSwitch} role="group" aria-label={`${parameter.name} source`}>
          {(['VALUE', 'REFERENCE'] as Answer[]).map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? `${styles.modeOption} ${styles.modeOptionOn}` : styles.modeOption}
              aria-pressed={mode === option}
              disabled={takesConnection && option === 'REFERENCE'}
              title={
                takesConnection && option === 'REFERENCE'
                  ? t('A connection is picked from the workspace\'s connections, never read from a variable')
                  : undefined
              }
              onClick={() => setMode(option)}
            >
              {option === 'VALUE' ? 'Value' : 'Reference'}
            </button>
          ))}
        </div>
        {/*
          The two words the switch offers, explained once beside it. The same
          sentence stood under every parameter of every plugin, which is a lot
          of screen for something somebody reads once.
        */}
        <FieldHint label={t('Source')}>
          <strong>{t('Value')}</strong> is used exactly as written. <strong>{t('Reference')}</strong> reads one of this
          workspace&apos;s variables, and what that variable holds is never shown here.
        </FieldHint>
      </div>

      {mode === 'REFERENCE' ? (
        /*
         * Held to a width rather than filling the row. The picker is built to sit
         * in the editor's inspector, which is narrow, and a control stretched
         * across a full-width page stops looking like the same thing.
         */
        <div className={styles.reference}>
          <FieldPicker
            options={options}
            value={picked ?? parameter.variableId ?? ''}
            label={`${parameter.name} reference`}
            labels={VARIABLE_LABELS}
            onChange={(option) => onPicked(option.expression)}
          />
        </div>
      ) : takesConnection ? (
        /*
         * Which connection, by name. What the server stores is the connection's
         * id, but a number is not how anybody thinks of their Slack - and a
         * picker cannot be answered with an id that belongs to another
         * workspace, which the box it replaced happily accepted and the save
         * then refused.
         */
        <div className={styles.inputWrapper}>
          <select
            id={fieldId}
            className={`${styles.input} ${styles.parameterValue}`}
            value={draft ?? parameter.literal ?? ''}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value !== '') onTyped(event.target.value, false);
            }}
          >
            <option value="" disabled>
              {t('Choose a connection…')}
            </option>
            {offeredConnections.map((held) => (
              <option key={held.id} value={held.id}>
                {held.name}
              </option>
            ))}
            {/*
              A stored choice that is no longer among the workspace's
              connections stays visible rather than silently becoming the
              placeholder: the parameter is still set to it, and what it is set
              to is the one thing this control must not misreport.
            */}
            {parameter.literal !== null && storedConnection === null && (
              <option value={parameter.literal}>
                {`#${parameter.literal} (no longer in this workspace)`}
              </option>
            )}
          </select>
        </div>
      ) : parameter.options.length > 0 ? (
        /*
         * One of the values the plugin named.
         *
         * A plugin choosing between two backends used to take a string and
         * check it itself, throwing a sentence that listed the choices - so a
         * typo was found at the first call rather than at the moment it was
         * typed. Declared, it is a picker, and a value that is not on the list
         * cannot be chosen.
         */
        <div className={styles.inputWrapper}>
          <select
            id={fieldId}
            className={`${styles.input} ${styles.parameterValue}`}
            value={draft ?? parameter.literal ?? ''}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value !== '') onTyped(event.target.value, false);
            }}
          >
            <option value="" disabled>
              {t('Choose one…')}
            </option>
            {parameter.options.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
            {/*
              What it is set to, even where the plugin no longer offers it: a
              new version of a plugin may drop a choice, and the parameter is
              still set to the old one until somebody changes it. What this
              control must not do is misreport what it currently is.
            */}
            {parameter.literal !== null && !parameter.options.includes(parameter.literal) && (
              <option value={parameter.literal}>
                {`${parameter.literal} (no longer offered)`}
              </option>
            )}
          </select>
        </div>
      ) : (
        <div className={styles.inputWrapper}>
          {/*
            A secret is typed into a box that never shows it back.

            `password` so a shoulder and a screenshot see nothing, and the
            placeholder carries the only thing the server will say about a
            stored one: that there is one. Typing over it replaces it; there is
            nothing to edit, because nothing came back to edit.
          */}
          <input
            id={fieldId}
            type={parameter.secret && !showTyped ? 'password' : 'text'}
            className={`${styles.input} ${styles.parameterValue}`}
            value={typed}
            disabled={busy}
            autoComplete={parameter.secret ? 'new-password' : undefined}
            placeholder={
              parameter.secret && parameter.secretSet
                ? t('Set - type to replace it')
                : `A ${parameter.type.toLowerCase()}`
            }
            spellCheck={false}
            onChange={(event) => {
              setTyped(event.target.value);
              // Emptied where it showed what is stored: saving clears it.
              onTyped(event.target.value, event.target.value.trim() === '' && (revealed || parameter.literal !== null));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit();
            }}
          />
          {/*
            Offered only where there is something typed to show. An eye over an
            empty box reveals nothing and says there is something to look at,
            and over a box holding the placeholder it would promise the stored
            secret - which is the one thing it cannot give.
          */}
          {parameter.secret && typed !== '' && !revealed && (
            <RevealToggle
              shown={showTyped}
              label={parameter.name}
              onToggle={() => setShowTyped((on) => !on)}
            />
          )}
          {/* And over a stored one, which the server shows when asked. */}
          {parameter.secret && parameter.secretSet && readsSecrets && (typed === '' || revealed) && (draft ?? '') === '' && (
            <RevealToggle shown={revealed} label={parameter.name} onToggle={() => void toggleStored()} />
          )}
        </div>
      )}

      {/*
        Both of these stay printed. The first is a dead end - the only way to
        answer this parameter is a list that is empty - and the second is what
        the parameter currently is, which is a reading and not an explanation.
      */}
      {revealError !== null && <p className={styles.parameterNote} role="alert">{revealError}</p>}
      {parameter.secret && mode === 'REFERENCE' && variables.length === 0 && (
        <p className={styles.parameterNote}>
          {t('This workspace has no variables yet. Add one on the Variables page and it will be offered here - or type the secret in under Value, where it is stored encrypted and never shown back.')}
        </p>
      )}

      {takesConnection && offeredConnections.length === 0 && (
        <p className={styles.parameterNote}>
          {parameter.connectionType === null
            ? t('This workspace has no connections yet. Add one on the Integrations page and it will be offered here.')
            : tf('This workspace has no {kind} connections yet. Add one on the Integrations page and it will be offered here.', { kind: kindLabel })}
        </p>
      )}

      {parameter.variableName !== null && (
        <p className={styles.parameterNote}>
          Reads {parameter.variableName} when the plugin runs, so changing that variable changes what the
          plugin is handed.
        </p>
      )}
    </div>
  );
}

/**
 * The page, started over by Discard.
 *
 * Discard puts every field back to what the server holds. This page keeps
 * its drafts across many fields and sections, so rather than a second copy
 * of the code that fills them, the page is drawn again from the start and
 * fills them the one way it always does - a round trip, which is the price
 * of there being one way.
 */
export function WorkspacePluginsPage(props: WorkspacePluginsPageProps) {
  const [discards, setDiscards] = useState(0);
  return <WorkspacePluginsView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
