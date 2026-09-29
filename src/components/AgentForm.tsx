import { useEffect, useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import { fetchBuiltInTools, fetchMemoryBudget, fetchWorkspaceAgents, updateAgent } from '../api/agents';
import type { Agent, BuiltInToolGovernance, SessionMemoryBudget } from '../api/agents';
import { fetchPluginTools } from '../api/plugins';
import { fetchMcpServers, fetchWorkspaceConnections } from '../api/integrations';
import type { McpServer, WorkspaceConnection } from '../api/integrations';
import { fetchMemoryCatalogs } from '../api/memory';
import { fetchWorkspace } from '../api/workspaces';
import type { MemoryCatalog } from '../api/memory';
import { answers, fetchModels } from '../api/models';
import type { Model } from '../api/models';
import {
  BUILT_IN_SKILLS,
  fetchPluginSkillCatalogs,
  fetchSkillCatalogs,
  fetchSkillOffers,
  inSkillScope,
} from '../api/skills';
import { fetchWorkspaceTools } from '../api/tools';
import chevronDownIcon from '../assets/chevron-down.svg';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import { CatalogueNote, useCatalogue } from './Catalogue';
import type { Catalogue } from './Catalogue';
import { ResizeHandle, useDragSize, useRoom, useWindowHeight } from './DragSize';
import { FieldHint } from './FieldHint';
import { IconField } from './IconField';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';
import { segments } from './searchMatches';
import own from './AgentForm.module.css';
import { t } from '../i18n';

/**
 * The class names the form paints itself with.
 *
 * Handed in rather than imported, for the reason `TriggerForm` asks for the
 * same: this form is shown on two surfaces that are not alike - a card on the
 * agent's own settings page, and a panel down the left of the workflow editor -
 * and the fields are identical in both, so there is one form and the look
 * belongs to whichever frame is holding it.
 */
export interface AgentFormStyles {
  /** The form itself: a settings card, or a panel's body. */
  body: string;
  fields: string;
  field: string;
  label: string;
  input: string;
  select: string;
  inputWrapper: string;
  inputWrapperTall: string;
  textarea: string;
  /*
   * There is no `fieldHint` here any more, and its absence is the point.
   *
   * It named the class the two printed paragraphs were drawn in - the argument
   * beside it was that the consequence of ticking a box must not be hidden
   * behind a hover. Issue #173 settled that the other way, and
   * UI-DESIGN-RULES.md now says so in as many words: a consequence worth
   * knowing before granting a permission belongs in the (?) beside that
   * permission. Taking the slot away leaves the next person nothing to print a
   * paragraph with.
   */
  error: string;
  actions: string;
  ghost: string;
  filled: string;
  /**
   * A label with something on the far side of the row from it, which here is
   * always the way out to what the field names.
   */
  labelRow: string;
  /**
   * The mark on that way out. Both frames already had the class, for the
   * trigger and condition forms they also hold - this form is the one that
   * named nothing it pointed at.
   */
  jump: string;
  /** Where a frame wants "Saved." said in the actions row rather than by itself. */
  savedNote?: string;
}

export interface AgentFormProps {
  workspaceId: string;
  /** The agent being edited. Making one is a name and a description, elsewhere. */
  agent: Agent;
  styles: AgentFormStyles;
  /** A heading inside the card, where the frame has no other place for one. */
  heading?: ReactNode;
  onSaved: (agent: Agent) => void;
  /** Left out where the frame already offers a way back, as a page's breadcrumb does. */
  onCancel?: () => void;
  /**
   * Where the page wants the Save button drawn, when that is not the foot of the
   * form. Issue #386.
   *
   * A settings page puts it in its header, beside the title, so saving a long
   * form never needs a scroll. The button is the same one - same submit, same
   * disabled and label states - reached through the `form` attribute and drawn
   * into this element by a portal. Left undefined in the workflow editor's
   * panel, where the button stays at the foot.
   */
  actionsSlot?: HTMLElement | null;
}

/** The whole of a workspace's tools fits in the list. */
const TOOL_PAGE_SIZE = 100;
/** And the skills, whose rows say what happens to each one. Issue #480. */
const SKILL_PAGE_SIZE = 200;

/**
 * How many of the workspace's other agents the picker offers.
 *
 * A hundred, like the tools beside it. A workspace with more agents than that
 * has more than anybody is choosing between in a list, and the grant is for the
 * two or three a specialist actually delegates to.
 */
const AGENT_CHOICES = 100;

/**
 * How short a grant list can be dragged. Two rows and a scrollbar: enough to
 * see there is a list, and that it goes on.
 */
const LIST_MIN = 80;

/**
 * How tall one can be dragged, as a share of the window.
 *
 * The same 70vh the stylesheet used to cap the native handle at: taller than
 * this and the fields under the list are off the screen, which is what the
 * bound on these lists was for in the first place - issue #172.
 */
const LIST_SHARE = 0.7;

/**
 * One row of the Tools grant: a workspace tool, or a tool a plugin offers.
 *
 * The two are one list because they are one grant. A name in `Agent.tools` may
 * be a plugin tool's as well as a workspace tool's, and either way the agent
 * is offered it as a tool - so a second box would be two lists feeding one
 * field, and the count over each would be a lie about the other. What tells
 * them apart is the row's muted word: the plugin's name, where a tool has
 * `off`.
 */
interface GrantableTool {
  /** The tool's id, or the plugin tool's name behind a prefix so the two cannot collide. */
  id: string;
  /** What the grant is stored under, for both kinds alike. */
  name: string;
  /** The plugin that offers it, `BUILT_IN` for the server's own, or null for the workspace's own tools. */
  plugin: string | null;
  /** Only a workspace tool can be switched off; a plugin's tool is on while its plugin is loaded. */
  off: boolean;
  /** The row's own page: the tool editor, or the page of the function a plugin tool fronts. Null where it has none. */
  link: string | null;
  /**
   * What switches a built-in, or null for a workspace's or a plugin's tool.
   *
   * `GRANT` is a row like any other. The rest come with a wider grant and are
   * drawn read-only, reading the state of that grant - see `fixedOf` on the
   * list. Issue #444.
   */
  governance: BuiltInToolGovernance | null;
  /** The phrase it is listed by in a briefing, shown on hover. Issue #481. */
  summary: string | null;
}

/**
 * A skill catalog an agent can be granted: the workspace's own, or a plugin's.
 *
 * One list for the same reason the tools are one list - it is one grant. A
 * name in `Agent.skillCatalogs` may be a workspace catalog's or a plugin's
 * key, and the agent draws on it either way, so a second box would be two
 * lists feeding one field. What tells them apart is the row's muted word: the
 * plugin's name, where a workspace catalog shows how many skills it holds.
 */
/**
 * One skill, on the list that says what happens to each. Issue #480.
 *
 * Drawn by name and stored by id, which is why the list passes `storedAs`: the
 * id is what a graph writes, what a command writes, and what the agent's two
 * lists hold, and the name is what a person reads.
 */
interface GrantableSkill {
  /** The skill's id, prefixed by its catalog so two catalogs' rows cannot collide. */
  id: string;
  /** What the agent's lists store: the skill's own id. */
  key: string;
  name: string;
  /** The catalog it lives in, which is what the grant above switches. */
  catalog: string;
  /** The plugin that brought it, or null for the workspace's own. */
  plugin: string | null;
  description: string | null;
  /** The skill's page, or null for one a plugin brought. */
  link: string | null;
}

interface GrantableCatalog {
  /** The catalog's id, or the plugin's key behind a prefix so the two cannot collide. */
  id: string;
  /** What the grant is stored under, for both kinds alike. */
  name: string;
  /** How many skills it holds. */
  count: number;
  /** The plugin that brought it, or null for the workspace's own. */
  plugin: string | null;
  /** The catalog's own page, or the plugin's. */
  link: string;
}

/**
 * How many rows a group must hold before it grows a search box.
 *
 * A workspace with four tools should not be handed a control for finding one
 * of four, and the box is not free: it costs a row of the height this change
 * is about. Eight is roughly what the scroll box shows without scrolling, so
 * the search arrives at the point the list stops being readable whole.
 */
const SEARCH_FROM = 8;

/**
 * What the tools this application brings itself are listed under.
 *
 * A group of its own rather than mixed into the workspace's: where a tool
 * comes from is what tells two rows of the same name apart, and "built in" is
 * an answer the way a plugin's name is. Every built-in is a row here since
 * issue #444 - the server's inventory says which - so this is the one list
 * somebody reads to see what an agent may do, and it is complete.
 */
const BUILT_IN = 'Built in';

/**
 * Why a built-in that comes with a wider grant cannot be switched on its row.
 *
 * Printed as the disabled control's title, so the reader who tries to press it
 * is told where the switch is rather than left with a button that does
 * nothing. Null for a row that is switched here - a workspace's, a plugin's,
 * or a built-in governed by its name. Issue #444.
 */
/**
 * Why a built-in row cannot be pressed while the workspace has not said so.
 * Issue #482.
 *
 * The rows stay where they are, read their state, and say this on hover. The
 * tools Orknux brings are what everything else assumes: an agent without a
 * scratchpad retypes files, one that cannot say it has finished answers in
 * prose, one without a clock invents today's date - and none of that reads as a
 * missing tool to whoever is watching it happen.
 */
function fixedAsBuiltIn(): string {
  return t(
    'Orknux brings this tool, and it is offered to every agent. ' +
      'Allow unsafe built-in tool visibility in this workspace’s settings to change it, ' +
      'knowing that an agent missing one of these behaves in ways this product cannot stand behind.',
  );
}

function fixedBecause(governance: BuiltInToolGovernance | null): string | null {
  switch (governance) {
    case 'SKILL_CATALOGS':
      return t('Granted by the skill catalogs — switch it there.');
    case 'MEMORY_CATALOGS':
      return t('Granted by the memory catalogs — switch it there.');
    case 'ORKNUX_ACCESS':
      return t('Granted by Orknux access — switch it there.');
    case 'SHELL_ACCESS':
      return t('Granted by shell access — switch it there.');
    default:
      return null;
  }
}

/**
 * The widest share the slider offers.
 *
 * The server's own ceiling, and it is the server that enforces it: a share past
 * this comes back refused, in a sentence saying why. This is the track's end,
 * not a second copy of the rule - nothing here decides what may be saved.
 */
const MAX_SHARE = 50;

/**
 * Where the track reads "Default" - the position that means nothing is set.
 *
 * Zero rather than a checkbox beside the slider, because the two states are one
 * question: an agent either has a share of its own or takes whatever it is
 * given, and dragging off the end of the track into "no share" is that question
 * asked once. It is also the only honest resting place for a slider with
 * nothing set - any other position would be a percentage nobody chose.
 *
 * What being given means changed under it: an agent at Default now follows its
 * workspace's default where there is one, and only falls to the built-in
 * allowance where there is not. The position did not move; the figures under it
 * say which of the two it landed on.
 */
const DEFAULT_SHARE = 0;

/**
 * How long the slider must be still before its preview is asked for.
 *
 * A range input fires on every step of a drag, and each one of these is a round
 * trip. Long enough that dragging across the track is one request and not
 * fifty; short enough that letting go shows the figures immediately.
 */
const PREVIEW_PAUSE = 150;

/**
 * What a row with no plugin is filed under in the origin filter.
 *
 * Not a plugin name and cannot collide with one: a plugin key is an
 * identifier, and this is a sentence.
 */
const OWN_GROUP = 'this workspace';

/** Grouped the way the server groups them in its own sentences. */
function thousands(count: number): string {
  return count.toLocaleString('en-US');
}

interface GrantListProps<Item> {
  /** The heading, spelled as the panel spells it: `Tools`, `Skill Catalogs`. */
  label: string;
  /**
   * The same thing mid-sentence - `tools`, `skill catalogs`. It is what the
   * search box is called, and a screen reader reads it as *Search tools*.
   */
  what: string;
  /** The frame's class names; this group is one of its fields. */
  styles: AgentFormStyles;
  /** Everything the workspace has of this kind, and whether it could be read. */
  catalogue: Catalogue<Item>;
  /** What to say when the workspace really has none - not when a search found none. */
  empty: string;
  keyOf: (item: Item) => string;
  /** The name the grant is stored under, which is also the name searched. */
  nameOf: (item: Item) => string;
  /**
   * The line a row shows on hover: a tool's summary, a skill's description.
   *
   * What the list cannot afford to draw and a person still wants to read.
   * Issues #480 and #481.
   */
  titleOf?: (item: Item) => string | null;
  /**
   * What the grant is stored as, where that is not the name on the row.
   *
   * The skills list is the one: a skill is stored by its id - the string a
   * graph and a command write - and drawn by its name, which is the thing a
   * person reads. Every other list stores what it draws, so this is left out
   * and the name is both. Issue #480.
   */
  storedAs?: (item: Item) => string;
  /** The muted word at the end of a row: how much it holds, or `off`. */
  metaOf?: (item: Item) => ReactNode;
  /**
   * Where the row's own page is, or null where it has none.
   *
   * A grant list names things the workspace defines elsewhere, and deciding
   * whether to tick one means knowing what it is - which until now meant
   * finding the page by hand. Issue #251.
   */
  linkOf?: (item: Item) => string | null;
  /**
   * The (?) beside the heading, where the kind of grant needs a word of
   * explanation. The catalogs do not; MCP servers do, because the word says
   * nothing about what connecting to one lets the agent do - and Tools does
   * now that its list mixes the workspace's own with what plugins brought.
   */
  hint?: ReactNode;
  /**
   * Which plugin a row came from, where the list mixes several origins.
   *
   * Tools is the one that does: the workspace's own sit beside everything its
   * plugins brought, and a workspace with a few plugins loaded has a list
   * where searching by name only helps if you already know the name. Left out
   * for a list with one origin, where a filter offering "all of them" and
   * nothing else is a control that does nothing.
   *
   * Null for a row the workspace itself defines.
   */
  groupOf?: (item: Item) => string | null;
  /** The names granted now. */
  granted: string[];
  onChange: (granted: string[]) => void;
  /**
   * Which granted rows are marked as always carried, where that is a question
   * this list asks at all. Issue #372.
   *
   * Absent on every list but the tools, and on that one only where the agent
   * carries a ceiling: without one nothing is ever dropped, so marking a row
   * would be marking it against something that never happens. A second column
   * that appears when a number is typed is how the form says the two are the
   * same decision.
   */
  marked?: string[];
  onMark?: (marked: string[]) => void;
  /**
   * Why this row cannot be switched here, or null where it can.
   *
   * The built-ins that come with a wider grant - the skill tools with the
   * skill catalogs, the memories with the memory catalogs, `orknux_*` with
   * orknux access, the shells with shell access - are rows so the list is
   * complete, and read Always or Hide off that grant. Their control is
   * disabled and says so, because a control that can be pressed and does
   * nothing is worse than one that is not there. Issue #444.
   */
  fixedOf?: (item: Item) => string | null;
  /**
   * Rows whose on-state is Always, and which cycle Hide and Always only.
   *
   * The orknux_* tools: they are carried whenever the grant is on - the server
   * has no Offer for them - so a third state would be a control that changes
   * nothing. They are switched one by one inside the grant, as asked.
   */
  alwaysWhenOn?: (item: Item) => boolean;
}

/**
 * One kind of grant: everything the workspace offers of it, and which of them
 * this agent has.
 *
 * The three grant groups on this form - memory catalogs, skill catalogs, tools -
 * were the same twenty-five lines three times over, and so were three copies of
 * what issue #172 was filed about: every row drawn at full height with no bound,
 * and no way to find one but to scroll and read. One component with three call
 * sites, so the next thing that is wrong with a grant list is wrong in one place.
 *
 * Two rules it keeps that a plain filter would not.
 *
 * **A granted row is always drawn.** Rows are filtered by what somebody typed,
 * except that a ticked one survives whatever they typed. A search that can hide
 * a grant is how the same tool gets granted twice and how one fails to be
 * revoked: the box is unticked because the row is not there, not because the
 * grant is not there, and nothing on the screen tells those apart.
 *
 * Kept *in place*, rather than pinned above the results, which was the other way
 * to keep them visible. Pinning reorders the list on the press: a row that jumps
 * to the top the moment it is ticked moves out from under the pointer that
 * ticked it, and the next click - landing on whatever slid into that spot -
 * grants something nobody chose. That is the same double-grant hazard read from
 * the other end. Here nothing ever moves; rows appear and disappear, and the
 * ones that cannot disappear are the ones that matter.
 *
 * **A row kept against the search says so.** It is drawn dashed, so a list
 * answering `slack` with four rows of which one matched does not read as a
 * filter that is broken.
 */
function GrantList<Item>({
  label,
  what,
  styles,
  catalogue,
  empty,
  keyOf,
  nameOf,
  titleOf,
  storedAs,
  metaOf,
  linkOf,
  hint,
  groupOf,
  granted,
  onChange,
  marked,
  onMark,
  fixedOf,
  alwaysWhenOn,
}: GrantListProps<Item>) {
  const [search, setSearch] = useState('');
  /*
   * Rows switched here since the page opened. These, and only these, stay on
   * screen against a search: the hazard the rule below guards is a row pressed
   * a moment ago vanishing from under the pointer. Keeping every granted row
   * did that too, until every agent held the built-ins - then a search for one
   * tool drew a hundred and fifty "kept" rows and read as a search that did
   * nothing.
   */
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  /*
   * The row whose card is open, and where to draw it. Fixed to the viewport
   * rather than inside the row: the rows scroll in a box that clips, and a card
   * cut off at its edge is the summary somebody hovered to read.
   */
  const [peek, setPeek] = useState<{ key: string; top: number; left: number } | null>(null);
  const touch = (value: string) => setTouched((held) => (held.has(value) ? held : new Set(held).add(value)));
  /** Which plugin is being shown, or '' for all of them. */
  const [group, setGroup] = useState('');
  /** Which status to show, on a list that has them: 'all', 'hide', 'offer', 'always'. Issue #413. */
  const [status, setStatus] = useState('all');
  const items = catalogue.items;
  const needle = search.trim().toLowerCase();

  /*
   * How tall the rows' box is, and the handle that changes it - issue #385,
   * done again.
   *
   * The box used to open at a fixed 240px with a native resize corner, which
   * drew a list of three rows as three rows and 200px of nothing above the
   * corner. It opens at the height of its content now, up to the 240px the
   * stylesheet caps it at, and is dragged from there by the same handle the run
   * page and the function editor use: `initial: null` leaves the opening height
   * to the content, and only a drag turns it into a number. One key per list,
   * so the tools list dragged tall does not drag the connections list with it.
   *
   * The box is measured so a drag begins from where the content put it; it is
   * the border box, because the height a drag sets is one.
   */
  const [watchBox, drawnHeight] = useRoom('height', 'border');
  const tall = useWindowHeight();
  const ceiling = Math.max(LIST_MIN, Math.round(tall * LIST_SHARE));
  const height = useDragSize({
    storageKey: `orknux.agent.${what.replace(/\s+/g, '-')}-height`,
    initial: null,
    measured: drawnHeight,
    min: LIST_MIN,
    max: ceiling,
    edge: 'bottom',
  });
  /** What the handle says it controls. */
  const boxId = useId();

  /*
   * Worked out on the way past rather than memoised. This is one `includes` per
   * row over a list the server caps at a hundred, which is nothing beside the
   * render it is part of - and a memo here would want the caller's `nameOf`
   * closure in its dependencies, a new function on every render, so it would
   * miss every time and cost the comparison as well.
   */
  const rows = items.map((item) => {
    const name = nameOf(item);
    /** What the grant lists hold for this row: its id, or its name. Issue #480. */
    const value = storedAs?.(item) ?? name;
    /*
     * The two narrowings are not the same thing, and do not behave the same.
     *
     * A search is a guess at a name: a ticked row survives it, because a grant
     * somebody cannot see is a grant they cannot revoke, and the row they
     * typed past is the one they were about to untick.
     *
     * The origin filter is not a guess. Choosing one plugin says "only this
     * plugin's" outright, and keeping every other plugin's granted rows in
     * view made the control do nothing you could see: an agent with nineteen
     * grants answered "PDF" with one PDF row and eighteen others. So it hides
     * ticked rows too - and says how many it hid, which is what keeps the
     * grant from being hidden *silently*.
     */
    const inGroup = group === '' || (groupOf?.(item) ?? OWN_GROUP) === group;
    return {
      item,
      name,
      value,
      inGroup,
      ticked: granted.includes(value),
      matches: needle === '' || name.toLowerCase().includes(needle),
      /** Why the row is read-only, or null where its control works. Issue #444. */
      fixed: fixedOf?.(item) ?? null,
    };
  });

  /**
   * The origins this list actually holds, in the order somebody reads them.
   *
   * Read off the rows rather than asked for: a plugin with nothing in this
   * list is not an option worth offering, and one loaded after the page opened
   * appears without anything having to be told about it.
   */
  const groups = groupOf === undefined
    ? []
    : [...new Set(items.map((item) => groupOf(item) ?? OWN_GROUP))].sort((left, right) =>
        left === OWN_GROUP ? -1 : right === OWN_GROUP ? 1 : left.localeCompare(right),
      );

  /*
   * A grant the catalogue has no row for still gets one.
   *
   * The rule above - a ticked row is never hidden - was written about the
   * search box, but the catalogue can hide a grant just as easily: the thing
   * was renamed, or deleted, or the list did not arrive. The grant is still
   * stored and still sent to the agent, so a list that draws only what the
   * workspace currently has shows an agent with fewer grants than it has, and
   * the only way to drop one becomes editing something else. Drawn last, marked
   * as unknown, and revocable - which is the one thing anybody wants from it.
   */
  const orphans = granted.filter((name) => !rows.some((row) => row.value === name));

  const shown = rows.filter((row) => row.inGroup && (row.matches || (row.ticked && touched.has(row.value))));

  /*
   * A tool's grant as one cycling control: Hide, Offer, Always. Issue #413.
   *
   * Only where the caller offers the Always state at all (`onMark`), which is
   * the tools list; every other grant list stays a plain tick. Every row of
   * the tools list cycles all three since #444 - the built-ins included, which
   * are names in the grant list like anything else - except a row that is
   * fixed, which reads the grant it comes with and cannot be pressed.
   */
  type ToolState = 'hide' | 'offer' | 'always';
  const toolState = (row: { item: Item; value: string; ticked: boolean; fixed: string | null }): ToolState => {
    if (!row.ticked) return 'hide';
    if (alwaysWhenOn?.(row.item) ?? false) return 'always';
    // A fixed row is carried whenever the grant it comes with is on - there is
    // no mark to read - so its on-state is Always, never Offer. Issue #444.
    if (row.fixed !== null) return 'always';
    return (marked?.includes(row.value) ?? false) ? 'always' : 'offer';
  };
  const cycleTool = (row: { item: Item; value: string; ticked: boolean; fixed: string | null }) => {
    if (row.fixed !== null) return;
    const state = toolState(row);
    if (alwaysWhenOn?.(row.item) ?? false) {
      // Hide <-> Always, the whole of it for these rows.
      touch(row.value);
      onChange(state === 'hide' ? [...granted, row.value] : granted.filter((one) => one !== row.value));
      return;
    }
    if (state === 'hide') {
      // Hide -> Offer: the grant.
      touch(row.value);
      onChange([...granted, row.value]);
    } else if (state === 'offer') {
      // Offer -> Always.
      touch(row.value);
      onMark?.([...(marked ?? []), row.value]);
    } else {
      // Always -> Hide, dropping any mark it carried.
      touch(row.value);
      onChange(granted.filter((one) => one !== row.value));
      onMark?.((marked ?? []).filter((one) => one !== row.value));
    }
  };
  /* The rows the status filter leaves, on a list that has statuses. Issue #413. */
  const visible =
    onMark !== undefined && status !== 'all' ? shown.filter((row) => toolState(row) === status) : shown;
  const STATE_LABEL: Record<ToolState, string> = { hide: t('Hide'), offer: t('Offer'), always: t('Always') };
  const STATE_TITLE: Record<ToolState, string> = {
    hide: t('Hidden — the agent cannot use this. Click to offer it.'),
    offer: t('Offered — available, loaded when a job needs it once a tool limit is set. Click to always carry it.'),
    always: t('Always — carried in front of the model every turn, once a tool limit is set. Click to hide it.'),
  };
  const STATE_CLASS: Record<ToolState, string> = { hide: own.stateHide, offer: own.stateOffer, always: own.stateAlways };

  /*
   * What a press of "grant these" acts on: the rows the filter and the search
   * actually name.
   *
   * Not `shown`, which is deliberately wider - a ticked row survives a search
   * so that a grant nobody can see is not a grant nobody can revoke. Granting
   * that row again does nothing, but *clearing* it would take away a grant the
   * search never claimed to be about, which is the same silent loss the
   * never-hide-a-ticked-row rule exists to prevent.
   */
  // A fixed row is not the press's to grant or clear: it is switched with the
  // grant it comes with, and a press that reached it would do nothing. #444.
  const picked = rows.filter((row) => row.inGroup && row.matches && row.fixed === null);
  const matching = picked.length;
  /*
   * Ticked rows that the search does not name, and which are on screen anyway.
   *
   * Counted so the line above can say so. A search for nonsense that leaves
   * three rows standing reads as a filter that does not work - the dashed
   * border was meant to carry that and plainly does not, because it says
   * "this row is different" without saying why or how many.
   */
  const kept = rows.filter((row) => row.inGroup && !row.matches && row.ticked && touched.has(row.value)).length;

  /** Whether the press would grant or clear, which is what its label says. */
  const allPicked = matching > 0 && picked.every((row) => row.ticked);

  /** Grants the origin filter is holding back, which the list has to own up to. */
  const elsewhere = rows.filter((row) => row.ticked && !row.inGroup).length;
  const here = rows.filter((row) => row.ticked).length + orphans.length;

  return (
    <div className={styles.field} data-grants={what}>
      <span className={own.grantHead}>
        <span className={own.labelWithHint}>
          <span className={styles.label}>{label}</span>
          {hint !== undefined && <FieldHint label={label}>{hint}</FieldHint>}
        </span>
        {/*
          Printed rather than put behind a (?), and that is the rule rather than
          an exception to it: this is the state of the thing being looked at, not
          an explanation of it - see UI-DESIGN-RULES.md. It is also the question
          somebody opening this panel came to ask.
        */}
        {items.length > 0 && (
          <span className={own.grantCount} data-grant-count="">
            {here} of {items.length} granted
            {needle !== '' && ` · ${matching} matching`}
            {needle !== '' && kept > 0 && ` · ${kept} kept: already granted`}
          </span>
        )}

        {/*
          Granting what is on screen, in one press.

          Twelve tools from one plugin is twelve presses otherwise, and the
          filter above is exactly the thing that says which twelve - so this
          acts on what the filter and the search name and on nothing else.
          "All" is therefore all of what is named, which the count line beside
          it spells out while a search is running: `N matching`.

          It flips to clearing once they are all granted: the press somebody
          wants after granting a plugin's tools by mistake is the same press
          again, and hunting for a second control to undo the first is what
          makes people untick twelve boxes by hand.
        */}
        {matching > 0 && (
          <button
            type="button"
            className={own.grantAll}
            data-grant-all={allPicked ? 'clear' : 'grant'}
            onClick={() => {
              const names = picked.map((row) => row.value);
              onChange(
                allPicked
                  ? granted.filter((one) => !names.includes(one))
                  : [...granted, ...names.filter((one) => !granted.includes(one))],
              );
            }}
          >
            {allPicked ? t('Deselect all') : t('Select all')}
          </button>
        )}
      </span>

      {/*
        Above the box rather than inside it: a list that could not be fetched
        must not be able to scroll the reason out of sight.
      */}
      <CatalogueNote catalogue={catalogue} className={own.emptyNote} empty={empty} />

      {items.length >= SEARCH_FROM && (
        <div className={own.grantFind}>
          <input
            className={own.grantSearch}
            type="search"
            value={search}
            spellCheck={false}
            placeholder={`Search ${what}…`}
            aria-label={`Search ${what}`}
            onChange={(event) => setSearch(event.target.value)}
          />

          {/*
            Where the list holds more than one origin. Two of them is already
            worth a filter - the workspace's own and one plugin's - because
            "which of these did that plugin bring" is otherwise answered by
            reading every row.
          */}
          {groups.length > 1 && (
            <select
              className={own.grantGroup}
              value={group}
              aria-label={`Which ${what} to list`}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="">{t('All')}</option>
              {groups.map((one) => (
                <option key={one} value={one}>
                  {one === OWN_GROUP ? t("This workspace's own") : one}
                </option>
              ))}
            </select>
          )}

          {/* Narrow to one status - what is pinned, offered, or off. Only on a
              list that has statuses, which is the tools list. Issue #413. */}
          {onMark !== undefined && (
            <select
              className={own.grantGroup}
              value={status}
              aria-label={t('Which tool status to list')}
              data-tool-status-filter=""
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">{t('Any status')}</option>
              <option value="always">{t('Always')}</option>
              <option value="offer">{t('Offer')}</option>
              <option value="hide">{t('Hide')}</option>
            </select>
          )}
        </div>
      )}

      {elsewhere > 0 && (
        /*
          Said out loud, and undoable in one press.

          The filter may hide a grant; it may not hide that it did. Without
          this line an agent reads as having fewer grants than it has, which is
          the very thing the never-hide-a-ticked-row rule exists to prevent.
        */
        <button
          type="button"
          className={own.grantElsewhere}
          onClick={() => setGroup('')}
          data-grants-elsewhere={elsewhere}
        >
          {elsewhere === 1
            ? t('1 more is granted outside this filter - show all')
            : `${thousands(elsewhere)} more are granted outside this filter - show all`}
        </button>
      )}

      {(items.length > 0 || orphans.length > 0) && (
        /*
          Content-high until dragged, then the dragged height. The second class
          takes the stylesheet's cap off, since a max-height would stop the drag
          at the height it began from.
        */
        <div
          className={height.size === null ? own.checkList : `${own.checkList} ${own.checkListSized}`}
          id={boxId}
          ref={watchBox}
          style={height.size === null ? undefined : { height: height.size }}
          data-grant-rows=""
        >
          {visible.map((row) => {
            const meta = metaOf?.(row.item);
            const opens = linkOf?.(row.item) ?? null;
            return (
              /*
                A row rather than one big <label>, now that it carries a way out
                as well as a tick. The label is only the part that toggles: a
                press on a link inside a label is a press the browser can
                forward to the checkbox, and going to read what a grant means
                would grant it - which is the rule the (?) beside Orknux and
                Shells is already written to.
              */
              <div
                key={keyOf(row.item)}
                className={[
                  own.checkRow,
                  row.matches ? '' : own.checkRowKept,
                  // Out of reach: fixed and not held, so pressing it could never
                  // do anything. Drawn as disabled, with the reason on hover.
                  row.fixed !== null && !row.ticked ? own.checkRowOut : '',
                ].filter(Boolean).join(' ')}
                data-grant-name={row.name}
                data-grant-out={row.fixed !== null && !row.ticked ? '' : undefined}
                /* A tool's summary, a skill's description: what the row has no
                   room for and a person reading it wants. #480, #481. Out of
                   reach, the reason instead - that is what somebody hovering
                   a control that does nothing is asking. */
                title={titleOf === undefined ? ((row.fixed !== null && !row.ticked ? row.fixed : null) ?? undefined) : undefined}
                onMouseEnter={titleOf === undefined ? undefined : (event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setPeek({ key: keyOf(row.item), top: box.bottom + 4, left: box.left + 24 });
                }}
                onMouseLeave={titleOf === undefined ? undefined : () => setPeek(null)}
                /*
                  What a check finds a kept row by. CSS modules hash the class
                  names this project writes, so the class cannot be asked for
                  from outside the bundle; `searchMatches` marks its hits with an
                  attribute for the same reason.
                */
                data-kept={row.matches ? undefined : ''}
              >
                {/*
                  The typed part picked out, by the matcher the manual's search
                  already uses - so the two cannot disagree about what matched.
                */}
                {onMark !== undefined ? (
                  /*
                    A tool's grant as one control cycling Hide -> Offer ->
                    Always on each press, rather than a tick and a second tick
                    beside it. Issue #413.
                  */
                  <div className={own.grantToggle}>
                    {/*
                      Disabled rather than absent on a fixed row, so the row
                      still reads its state - Always or Hide, off the grant it
                      comes with - and the title says where the switch is. #444.
                    */}
                    <button
                      type="button"
                      className={`${own.stateToggle} ${STATE_CLASS[toolState(row)]}${row.fixed === null ? '' : ` ${own.stateFixed}`}`}
                      data-tool-state={toolState(row)}
                      data-tool-fixed={row.fixed === null ? undefined : ''}
                      disabled={row.fixed !== null}
                      onClick={() => cycleTool(row)}
                      title={row.fixed ?? STATE_TITLE[toolState(row)]}
                      aria-label={`${row.name}: ${STATE_LABEL[toolState(row)]}${row.fixed === null ? '' : `. ${row.fixed}`}`}
                    >
                      {STATE_LABEL[toolState(row)]}
                    </button>
                    {/*
                      Plain text, not a link: only the icon at the row's end
                      opens the page. A press on the name is a press on the
                      row, so it cycles the state as the button beside it does.
                    */}
                    <span
                      className={row.fixed === null ? `${own.grantName} ${own.grantNamePress}` : own.grantName}
                      onClick={() => cycleTool(row)}
                      data-grant-press=""
                    >
                      {segments(row.name, search).map((part, index) =>
                        part.match ? (
                          <mark key={index} className={own.grantMark}>
                            {part.text}
                          </mark>
                        ) : (
                          <span key={index}>{part.text}</span>
                        ),
                      )}
                    </span>
                  </div>
                ) : (
                  <label className={own.grantToggle} title={row.fixed ?? undefined}>
                    {/* A fixed row is held whatever is ticked: drawn ticked, and not the box's to change. */}
                    <input
                      type="checkbox"
                      checked={row.fixed !== null || row.ticked}
                      disabled={row.fixed !== null}
                      onChange={(event) => {
                        touch(row.value);
                        onChange(
                          event.target.checked
                            ? [...granted, row.value]
                            : granted.filter((one) => one !== row.value),
                        );
                      }}
                    />
                    <span className={own.grantName}>
                      {segments(row.name, search).map((part, index) =>
                        part.match ? (
                          <mark key={index} className={own.grantMark}>
                            {part.text}
                          </mark>
                        ) : (
                          <span key={index}>{part.text}</span>
                        ),
                      )}
                    </span>
                  </label>
                )}
                {meta !== undefined && meta !== null && meta !== false && (
                  <span className={own.checkCount}>{meta}</span>
                )}
                {peek !== null && peek.key === keyOf(row.item) && createPortal(
                  /*
                    What the row is, on hover: its name, where it comes from,
                    and the line the model is told - or, for a row out of
                    reach, why. A native title took a second to appear and
                    showed one line of grey; this is the summary somebody
                    hovered to read.
                  */
                  <div className={own.grantCard} style={{ top: peek.top, left: peek.left }} role="tooltip" data-grant-card="">
                    <strong className={own.grantCardName}>{row.name}</strong>
                    {meta !== undefined && meta !== null && meta !== false && (
                      <span className={own.grantCardMeta}>{meta}</span>
                    )}
                    <span className={own.grantCardText}>
                      {titleOf?.(row.item) ?? t('No description.')}
                    </span>
                    {/* On or off, a locked row says why and where it is switched: the question somebody hovering one is asking. */}
                    {row.fixed !== null && (
                      <span className={own.grantCardReason} data-grant-card-reason="">{row.fixed}</span>
                    )}
                  </div>,
                  document.body,
                )}
                {opens !== null && (
                  <Link
                    className={own.grantJump}
                    to={opens}
                    target="_blank"
                    rel="noreferrer"
                    title={`Opens ${row.name} in a new tab`}
                    data-grant-link=""
                    aria-label={`Open ${row.name}`}
                  >
                    <OpenDefinitionIcon />
                  </Link>
                )}
              </div>
            );
          })}

          {/*
            The grants the workspace has no row for, drawn last so they cannot
            be mistaken for part of the list above, and marked with what is
            wrong: the name is granted and nothing here is called that. The tick
            is on and unticking it is the only thing it does - there is nothing
            to link to and nothing to search.
          */}
          {orphans.map((name) => (
            <div key={`orphan:${name}`} className={`${own.checkRow} ${own.checkRowKept}`} data-grant-name={name} data-grant-unknown="">
              <label className={own.grantToggle}>
                <input
                  type="checkbox"
                  checked
                  onChange={() => onChange(granted.filter((one) => one !== name))}
                />
                <span className={own.grantName}>{name}</span>
              </label>
              <span className={own.checkCount}>{t('not in this workspace')}</span>
            </div>
          ))}
          {visible.length === 0 && <p className={own.emptyNote}>{t('Nothing by that name.')}</p>}
        </div>
      )}

      {/*
        The box's bottom edge, taken hold of. Only under a box: a handle under
        the "none yet" line would be a control that sizes nothing.
      */}
      {(items.length > 0 || orphans.length > 0) && (
        <ResizeHandle
          orientation="horizontal"
          label={`Height of the ${what} list`}
          controls={boxId}
          valueNow={height.size ?? Math.round(drawnHeight)}
          valueMin={LIST_MIN}
          valueMax={ceiling}
          title={t('Drag to change the height; double-click to put it back')}
          dragging={height.dragging}
          handlers={height.handlers}
        />
      )}
    </div>
  );
}

/**
 * Everything an agent is: what it is called, what it is briefed with, the model
 * it answers on, and each grant of what it may read, run and reach.
 *
 * Nothing here resets. The state is read from `agent` as it mounts, and the
 * frames mount it fresh - the page keys it by which agent it is showing, the
 * panel renders it only while open - so following one agent to another starts
 * the form over instead of leaving the previous one's values in it.
 */
export function AgentForm({ workspaceId, agent, styles, heading, onSaved, onCancel, actionsSlot }: AgentFormProps) {
  /** Ties the Save button to this form when a header draws it apart. Issue #386. */
  const formId = useId();
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? '');
  const [mcpServers, setMcpServers] = useState<string[]>(agent.mcpServers);
  /** Whether it may ask orknux about orknux; the built-in server. */
  const [orknuxAccess, setOrknuxAccess] = useState(agent.orknuxAccess);
  const [shellAccess, setShellAccess] = useState(agent.shellAccess);
  const [modelId, setModelId] = useState(agent.modelId ?? '');
  const [memoryCatalogs, setMemoryCatalogs] = useState<string[]>(agent.memoryCatalogs);
  /*
   * Whether this workspace has said its agents may have a built-in hidden.
   * Issue #482: while it has not, those rows are drawn read-only with the
   * reason on hover. Read rather than held in form state - it is the
   * workspace's answer, changed on the workspace's own settings page.
   */
  const [unsafeBuiltIns, setUnsafeBuiltIns] = useState(false);
  useEffect(() => {
    if (workspaceId === '') return;
    let live = true;
    fetchWorkspace(workspaceId)
      .then((held) => {
        if (live) setUnsafeBuiltIns(held?.unsafeBuiltInTools ?? false);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [workspaceId]);

  const [skillCatalogs, setSkillCatalogs] = useState<string[]>(agent.skillCatalogs);
  /** Which skills inside those catalogs are out of reach, and which are always loaded. Issue #480. */
  const [hiddenSkills, setHiddenSkills] = useState<string[]>(agent.hiddenSkills);
  const [requiredSkills, setRequiredSkills] = useState<string[]>(agent.requiredSkills);
  const [tools, setTools] = useState<string[]>(agent.tools);
  /** Which of the workspace's connections it may name, by id - see the grant list below. */
  const [connectionIds, setConnectionIds] = useState<string[]>(agent.connectionIds);
  /** Which other agents this one may ask; see `ask_agent`. Issue #350. */
  const [agentIds, setAgentIds] = useState<string[]>(agent.agentIds);
  /** How many tools it carries at once, as typed; empty is the provider's. #372. */
  const [maxTools, setMaxTools] = useState(agent.maxTools === null ? '' : String(agent.maxTools));
  /** Which granted tools always travel rather than being found. #372. */
  const [requiredTools, setRequiredTools] = useState<string[]>(agent.requiredTools);
  /**
   * The ceiling as a number, or null where none has been typed.
   *
   * Null is what turns the second column off and what the count reads as "not
   * this agent's question": a half-typed box is not a ceiling, so anything that
   * is not a number reads the same as empty.
   */
  const carrying = maxTools.trim() === '' || Number.isNaN(Number(maxTools)) ? null : Number(maxTools);
  const [icon, setIcon] = useState<string | null>(agent.icon ?? null);
  /**
   * The share of the model's window a session may take back, or null to follow
   * the workspace's default - issue #226.
   */
  const [share, setShare] = useState<number | null>(agent.memoryShare);
  /**
   * How many rounds of tool calls this agent gets, or null to follow the
   * installation's number.
   *
   * Blank is null and null is the default, the way the share above works: a
   * number here is for the one agent whose work is longer than the rest, and
   * emptying the box puts it back to whatever Admin has set.
   */
  const [rounds, setRounds] = useState<string>(agent.maxRounds === null ? '' : String(agent.maxRounds));
  /** What that share works out to, as the server works it out. Null until asked. */
  const [budget, setBudget] = useState<SessionMemoryBudget | null>(null);

  const [promptOpen, setPromptOpen] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  /*
   * What this workspace can offer the agent: its models, and its catalogs.
   *
   * Four lists, four grants, and each one used to end `.catch(() => setX([]))` -
   * so a server that had stopped answering drew four boxes saying this
   * workspace has nothing to grant, which is the one thing they could not
   * possibly know. They keep their failure now, and each box says which of the
   * two states it is in.
   */
  const noWorkspace = workspaceId === '';
  const modelCatalogue = useCatalogue('models in this workspace', () => fetchModels(workspaceId), [workspaceId], {
    skip: noWorkspace,
  });
  const memoryCatalogue = useCatalogue('memory catalogs', () => fetchMemoryCatalogs(workspaceId), [workspaceId], {
    skip: noWorkspace,
  });
  /*
   * The workspace's skill catalogs and the ones its plugins bring, as one
   * list - see `GrantableCatalog` for why it is one. A workspace catalog
   * shadows a plugin's of the same name on the server, so the shadowed row is
   * left out here rather than drawn as a tick that grants both.
   */
  const skillCatalogue = useCatalogue<GrantableCatalog>(
    'skill catalogs',
    async () => {
      const [held, brought] = await Promise.all([
        fetchSkillCatalogs(workspaceId),
        fetchPluginSkillCatalogs(),
      ]);
      const rows: GrantableCatalog[] = held.map((catalog) => ({
        id: catalog.id,
        name: catalog.name,
        count: catalog.skillCount,
        plugin: null,
        link: `/workspace/${workspaceId}/skills?catalog=${catalog.id}`,
      }));
      const taken = new Set(rows.map((row) => row.name));
      for (const offer of brought) {
        if (taken.has(offer.name)) continue;
        rows.push({
          // The key is the identity a plugin catalog has; the prefix keeps it
          // from colliding with a workspace catalog's numeric id.
          id: `ps:${offer.name}`,
          name: offer.name,
          count: offer.skills.length,
          plugin: offer.plugin,
          // Nothing to edit, so the way out is the plugin it came with.
          link: '/admin/plugins',
        });
      }
      return rows;
    },
    [workspaceId],
    { skip: noWorkspace },
  );
  /*
   * Every skill inside the catalogs, one row each. Issue #480.
   *
   * The catalog grant above says what is in scope; this list says what happens
   * to each skill in it - Hidden, Offered, or Always in front of the model. It
   * draws every skill the workspace and its plugins have rather than only the
   * granted ones, because a row for a skill whose catalog is not granted still
   * has something true to say: it is out of scope, which is what Hide reads as.
   */
  const skillsCatalogue = useCatalogue<GrantableSkill>(
    'skills',
    async () =>
      (await fetchSkillOffers(workspaceId, SKILL_PAGE_SIZE)).map((skill) =>
        skill.skillId !== null
          ? {
              id: `ws:${skill.skillId}`,
              key: skill.key,
              name: skill.name,
              catalog: skill.catalog,
              plugin: null,
              description: skill.description,
              link: `/workspace/${workspaceId}/skills/${skill.skillId}`,
            }
          : {
              id: `ps:${skill.catalog}:${skill.key}`,
              key: skill.key,
              name: skill.name,
              catalog: skill.catalog,
              /*
               * The server's own catalog reads Built in, as its tools do on the
               * list below: a filter offering "Orknux" beside three plugins says
               * nothing about which of them the release brings.
               */
              plugin: skill.catalog === BUILT_IN_SKILLS ? BUILT_IN : skill.plugin,
              description: skill.description,
              /*
               * A plugin's skill has no page; its catalog on the Skills page,
               * searched for it, is where it is read. A built-in has neither,
               * so it is not a link.
               */
              link:
                skill.catalog === BUILT_IN_SKILLS
                  ? null
                  : `/workspace/${workspaceId}/skills?catalog=${encodeURIComponent(`plugin:${skill.catalog}`)}&q=${encodeURIComponent(skill.name)}`,
            },
      ),
    [workspaceId],
    { skip: noWorkspace },
  );

  /*
   * Which skill ids are in scope, and which of those are offered. Issue #480.
   *
   * In scope is every skill in a granted catalog; offered is those less the
   * hidden ones. Both are worked out here rather than stored, so ticking a
   * catalog above immediately gives its skills rows that read Offer, and
   * unticking it takes them back to Hide without anything having to be written.
   */
  // The server's own catalog is always in scope: every agent holds it, ticked or not.
  const inScopeSkills = (skillsCatalogue.items ?? [])
    .filter((skill) => inSkillScope(skill, skillCatalogs))
    .map((skill) => skill.key);
  const offeredSkills = inScopeSkills.filter((id) => !hiddenSkills.includes(id));

  /*
   * The workspace's tools and the tools its plugins offer, as one list - see
   * `GrantableTool` for why it is one. The plugin rows are the plugins'
   * `tools()` surface, which is the whole of what a plugin exposes to agents:
   * its functions belong to workflows, and one it wants a model to call is
   * fronted by a tool. A workspace tool shadows a plugin tool of the same
   * name on the server, so the shadowed row is left out here rather than
   * drawn as a tick that grants both.
   */
  const toolCatalogue = useCatalogue<GrantableTool>(
    'tools',
    async () => {
      const [builtIn, held, offered] = await Promise.all([
        fetchBuiltInTools(),
        fetchWorkspaceTools(workspaceId, 0, TOOL_PAGE_SIZE),
        fetchPluginTools(),
      ]);
      /*
       * The tools this application brings itself, first. Issue #444.
       *
       * In the list rather than beside it as switches of their own: this list
       * is where somebody looks to see what an agent may do, and a capability
       * that is not in it is a capability nobody finds. Three of them were
       * here - the drawing, the ending, the picture link - and the rest were
       * handed to every agent without a row to say so. The server's inventory
       * is the list now, so a built-in it adds is a row here the same day, and
       * one governed by its name is granted by name like every other row - the
       * server reads the same list. The ones that come with a wider grant are
       * rows too, read-only, saying which grant; see `fixedBecause`.
       */
      const rows: GrantableTool[] = builtIn.map((tool) => ({
        id: `built-in:${tool.name}`,
        name: tool.name,
        plugin: BUILT_IN,
        off: false,
        // No page of its own, so no link: the hover card is where a built-in says what it is.
        link: null,
        governance: tool.governance,
        // A built-in's own line is the first sentence of what the model is told, which the server writes.
        summary: tool.summary,
      }));
      rows.push(...held.content.map((tool) => ({
        id: tool.id,
        name: tool.name,
        plugin: null,
        off: !tool.enabled,
        link: `/workspace/${workspaceId}/tools/${tool.id}`,
        governance: null,
        summary: tool.summary,
      })));
      const taken = new Set(rows.map((row) => row.name));
      for (const offer of offered) {
        if (taken.has(offer.name)) continue;
        rows.push({
          // The name is the identity a plugin tool has; the prefix keeps it
          // from colliding with a workspace tool's numeric id.
          id: `pt:${offer.name}`,
          name: offer.name,
          plugin: offer.plugin,
          off: false,
          // A tool fronting one of the plugin's functions has that function's
          // page to go to; one with a run of its own has no page.
          // A tool with a run of its own has no page, so it opens the Tools list searched for it.
          link:
            offer.functionId === null
              ? `/workspace/${workspaceId}/tools?q=${encodeURIComponent(offer.name)}`
              : `/workspace/${workspaceId}/functions/${offer.functionId}`,
          governance: null,
          summary: offer.description,
        });
      }
      return rows;
    },
    [workspaceId],
    { skip: noWorkspace },
  );

  /*
   * Which built-ins come with a wider grant, and which of those are on now.
   *
   * Read off the catalogue and the form's own state, so a row for `skill_load`
   * reads Always the moment a skill catalog is ticked above it and Hide the
   * moment the last one is unticked - the row is a view of that grant, never a
   * second switch for it. They are folded into the granted names so the count
   * beside the heading and beside the tool limit include them, and folded out
   * again before anything is stored: the server derives them too. Issue #444.
   */
  const comesWithGrant = (governance: BuiltInToolGovernance | null): boolean => {
    switch (governance) {
      case 'SKILL_CATALOGS':
        return skillCatalogs.length > 0;
      case 'MEMORY_CATALOGS':
        return memoryCatalogs.length > 0;
      case 'ORKNUX_ACCESS':
        return orknuxAccess;
      case 'SHELL_ACCESS':
        return shellAccess;
      default:
        return false;
    }
  };
  /*
   * The orknux_* rows are the agent's to switch one by one while Orknux access
   * is on, and are held in `tools` like any other name then. Off, they are
   * fixed at Hide and say where the grant is.
   */
  const orknuxNames = toolCatalogue.items.filter((tool) => tool.governance === 'ORKNUX_ACCESS').map((tool) => tool.name);
  const orknuxOn = orknuxAccess ? tools.filter((name) => orknuxNames.includes(name)) : [];
  const fixedRows = toolCatalogue.items.filter(
    (tool) => fixedBecause(tool.governance) !== null && !(tool.governance === 'ORKNUX_ACCESS' && orknuxAccess),
  );
  const fixedNames = new Set(fixedRows.map((tool) => tool.name));
  const fixedOn = fixedRows.filter((tool) => comesWithGrant(tool.governance)).map((tool) => tool.name);
  /*
   * What is always carried, and what is granted in all - the counter's two
   * numbers. A built-in that comes with a grant is carried whenever that grant
   * is on, not searched for, so it counts towards both. Issues #413, #444.
   */
  const alwaysCarried = requiredTools.length + fixedOn.length + orknuxOn.length;
  const grantedTotal = tools.length + fixedOn.length;
  /*
   * The registered servers, which this form asks for only to know where each
   * chip's own page is - issue #251.
   *
   * A grant is a name somebody typed, not a reference, so a chip may well name
   * nothing this workspace has: `serverPage` answers null for those rather than
   * pointing at a page that would say the server does not exist. Nothing else
   * on the form changes if this list never arrives - the chips are drawn from
   * the agent, and only the way out is missing.
   */
  const serverCatalogue = useCatalogue<McpServer>(t('MCP servers'), () => fetchMcpServers(workspaceId), [workspaceId], {
    skip: noWorkspace,
  });
  /*
   * The workspace's connections, for the grant list below.
   *
   * The grant is stored by id - a connection is referenced by id everywhere
   * else - but nobody grants "9", so the list draws names and this form
   * translates at its edges: ids to names going in, names back to ids in
   * onChange. A granted id whose connection is gone has no name to translate
   * to and is drawn as `#id`, which is also how it translates back, so it can
   * still be revoked.
   */
  const connectionCatalogue = useCatalogue<WorkspaceConnection>(
    t('connections'),
    () => fetchWorkspaceConnections(workspaceId),
    [workspaceId],
    { skip: noWorkspace },
  );
  const connectionName = (id: string) =>
    connectionCatalogue.items.find((held) => held.id === id)?.name ?? `#${id}`;

  /*
   * And the workspace's other agents, for the one grant that points at the same
   * kind of thing this form is editing.
   *
   * Itself left out rather than refused on save: an agent that may ask itself is
   * a round spent asking the question again, and a tick that is always going to
   * come back as an error is a tick that should not have been offered. The
   * server refuses it too, because a form is not a boundary.
   *
   * A page of them rather than all: `fetchWorkspaceAgents` is paged like every
   * other list, and a workspace with more agents than this asks for has more
   * than anybody is choosing between in a picker.
   */
  const agentCatalogue = useCatalogue<Agent>(
    t('agents'),
    () =>
      fetchWorkspaceAgents(workspaceId, 0, AGENT_CHOICES).then((page) =>
        page.content.filter((one) => one.id !== agent.id),
      ),
    [workspaceId, agent.id],
    { skip: noWorkspace },
  );
  const agentName = (id: string) => agentCatalogue.items.find((held) => held.id === id)?.name ?? `#${id}`;

  /*
   * Only the models are unpacked here. The three grant lists are handed the
   * catalogue itself rather than the rows out of it, because each of them draws
   * the failure and the empty state as well as the list, and those are three
   * fields on one value.
   */
  const models: Model[] = modelCatalogue.items;

  /**
   * Whether there is a window to take a share of at all.
   *
   * The model *in the form*, not the one on the agent: this form may have
   * changed it in the same edit, and a share previewed against the stored model
   * would answer for the model this agent used to have.
   */
  const chosenModel = modelId === '' ? null : modelId;

  /**
   * What is actually asked for and saved, which is null while no model is
   * chosen.
   *
   * The typed value is kept rather than cleared, so choosing a model again
   * brings the share back. What it must not do is stay in force: the server
   * refuses a share with no model to take it from - rightly, since a share of
   * nothing is nothing - and a slider disabled at 20% with a refusal under it
   * would be a form that cannot be saved and offers no way out of it.
   */
  const asked = chosenModel === null ? null : share;

  /*
   * What the share works out to, asked of the server and never worked out here.
   *
   * Debounced rather than sent on every step of the drag, and cancelled on the
   * way out so a slow answer to a share nobody is asking for any more cannot
   * land on top of a newer one.
   */
  useEffect(() => {
    if (noWorkspace) return;

    let current = true;
    const timer = setTimeout(() => {
      fetchMemoryBudget(workspaceId, chosenModel, asked)
        .then((found) => {
          if (current) setBudget(found);
        })
        .catch(() => {
          // The preview is not the setting. A failure here leaves the figures
          // off rather than putting a second error on a form that has its own.
          if (current) setBudget(null);
        });
    }, PREVIEW_PAUSE);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [workspaceId, noWorkspace, chosenModel, asked]);

  /**
   * Why this share cannot be saved, in the server's words, or null.
   *
   * Printed as it arrives and never reworded: it names the model and its
   * numbers, and it is the same sentence the mutation would raise.
   *
   * Only where the share is this agent's own. Once an agent that sets nothing
   * falls through to its workspace's default, the preview can come back refused
   * about a share this form never asked for - most ordinarily on an agent with
   * no model yet, where the answer is "choose a model first" - and that is not
   * a reason to refuse the save. `updateAgent` agrees: it judges `memoryShare`
   * only when one was sent, so a form disabling Save here would be refusing
   * what the server would have accepted. What happens to a refused inherited
   * share is written below, where it is drawn.
   */
  const refusal = asked === null ? null : (budget?.refusal ?? null);

  /**
   * The same sentence when it is about the share this agent inherits.
   *
   * Not a refusal of anything on this form, so it neither hides the figures nor
   * stops the save - it is why the figures below are the built-in allowance's
   * rather than the workspace's share, which would otherwise be a silent
   * disagreement between this card and the workspace's settings page.
   */
  const inheritedRefusal = asked === null ? (budget?.refusal ?? null) : null;



  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateAgent(agent.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        // Empty is "none chosen", which the server stores as null.
        modelId: modelId === '' ? null : modelId,
        mcpServers,
        orknuxAccess,
        shellAccess,
        memoryCatalogs,
        skillCatalogs,
        hiddenSkills,
        requiredSkills,
        tools,
        connectionIds,
        agentIds,
        maxTools: maxTools.trim() === '' ? null : Number(maxTools),
        requiredTools,
        icon,
        // Sent every save rather than left out, which is what lets the slider
        // put it back to the default.
        memoryShare: asked,
        // The same rule: blank is null, and null is the installation's number.
        maxRounds: rounds.trim() === '' ? null : Number(rounds),
      });
      setMcpServers(updated.mcpServers);
      setOrknuxAccess(updated.orknuxAccess);
      setShellAccess(updated.shellAccess);
      setMemoryCatalogs(updated.memoryCatalogs);
      setSkillCatalogs(updated.skillCatalogs);
      setHiddenSkills(updated.hiddenSkills);
      setRequiredSkills(updated.requiredSkills);
      setTools(updated.tools);
      setConnectionIds(updated.connectionIds);
      setAgentIds(updated.agentIds);
      setMaxTools(updated.maxTools === null ? '' : String(updated.maxTools));
      setRequiredTools(updated.requiredTools);
      setModelId(updated.modelId ?? '');
      setShare(updated.memoryShare);
      setRounds(updated.maxRounds === null ? '' : String(updated.maxRounds));
      setSaved(true);
      onSaved(updated);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the agent.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} className={styles.body} onSubmit={handleSave}>
      {heading}

      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="agent-name">{t('Agent Name')}</label>
          <div className={styles.inputWrapper}>
            <input
              id="agent-name"
              name="agentName"
              className={styles.input}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="agent-description">{t('Description')}</label>
          <div className={`${styles.inputWrapper} ${styles.inputWrapperTall}`}>
            <textarea
              id="agent-description"
              name="agentDescription"
              className={`${styles.input} ${styles.textarea}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>

        <IconField
          value={icon}
          onChange={setIcon}
          hint={t("Nodes drawn from this agent start with it; each node can change its own.")}
        />

        <div className={styles.field}>
          <button
            type="button"
            className={own.promptToggle}
            onClick={() => setPromptOpen((open) => !open)}
            aria-expanded={promptOpen}
            aria-controls="agent-system-prompt"
          >
            <img
              className={promptOpen ? own.chevron : `${own.chevron} ${own.chevronClosed}`}
              src={chevronDownIcon}
              alt=""
              width={16}
              height={16}
            />
            {t('System Prompt')}
          </button>
          {promptOpen && (
            <div className={`${styles.inputWrapper} ${styles.inputWrapperTall} ${own.promptWrapper}`}>
              <textarea
                id="agent-system-prompt"
                name="systemPrompt"
                className={`${styles.input} ${styles.textarea} ${own.promptInput}`}
                placeholder={t('You are a research agent specialized in web search and data synthesis…')}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className={styles.field}>
          {/*
            The way out to the model this agent answers on - issue #251, and the
            page the refusal under the slider below sends people to when a model
            has no context window recorded.

            Only once one is chosen: "None — this agent cannot run" names
            nothing to open. A tab of its own, like every other jump on these
            forms, because this one is reached in the middle of an edit.
          */}
          <span className={styles.labelRow}>
            <label className={styles.label} htmlFor="agent-model">{t('Model')}</label>
            {chosenModel !== null && (
              <Link
                className={styles.jump}
                to={`/workspace/${workspaceId}/models/${chosenModel}`}
                target="_blank"
                rel="noreferrer"
                title={t('Opens the model\'s settings in a new tab')}
                aria-label={t('Open the model\'s settings')}
              >
                <OpenDefinitionIcon />
              </Link>
            )}
          </span>
          <div className={styles.inputWrapper}>
            <select
              id="agent-model"
              className={`${styles.input} ${styles.select}`}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            >
              <option value="">{t('None — this agent cannot run')}</option>
              {/* An agent talks; these hear and read rather than answer. */}
              {models.filter(answers).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <img src={chevronDown12Icon} alt="" width={12} height={12} />
          </div>
          {/*
            No empty state here on purpose: a workspace with no models says so
            through the one option the select is left with. A workspace whose
            models could not be fetched looks exactly the same from outside,
            which is what this line is for.
          */}
          <CatalogueNote catalogue={modelCatalogue} className={own.emptyNote} />
        </div>

        {/*
          How much of that model's window a session may take back - issue #226.

          Under the model picker because it is a share of what that picker
          chose, and the two are read together: change the model and the figures
          under this change with it.

          One slider and not five boxes. The five numbers that used to be
          constants in the server - how many turns come back, how much of them,
          how much of what the tools returned, how much of any one result - are
          all worked out from this one, because somebody setting it is answering
          "how much conversation should it carry" and not five separate
          questions.

          Nothing is worked out here. The figures, the turn count and the
          refusal all come from `memoryBudget`, which is the same calculation
          the mutation judges a share with; a second copy in the browser would
          eventually disagree with it, and the one that drifted would be this.
        */}
        {/*
          Named so a check can read this card and nothing else.

          What it says - the figures, the refusal, the note under them - used to
          be found by walking up to the enclosing form, which meant every
          paragraph anywhere on the form counted as this card having answered.
          It held while the form was mostly fields; it stopped holding the
          moment a grant list below grew an empty-state sentence of its own, and
          the check then read the figures before they had arrived.
        */}
        <div className={styles.field} data-check="session-memory">
          <span className={own.labelWithHint}>
            <label className={styles.label} htmlFor="agent-memory-share">
              {t('Session Memory')}
            </label>
            <FieldHint label={t('Session Memory')}>
              {t('How much of the chosen model’s context window one of this agent’s sessions may hand back on its next turn: what was said in it, and what its tools last returned. At Default this agent follows whatever its workspace has decided for the agents in it, and where the workspace has decided nothing either, a fixed built-in allowance that knows nothing of the window; the figures below say which of the two it is. A share is worked out from the window, which is why a model has to be chosen before one can be set. Token figures are approximate — they are counted in characters and reported at four characters to the token.')}
            </FieldHint>
          </span>

          <div className={own.shareRow}>
            <input
              id="agent-memory-share"
              className={own.shareSlider}
              type="range"
              min={DEFAULT_SHARE}
              max={MAX_SHARE}
              step={1}
              value={asked ?? DEFAULT_SHARE}
              /*
                A share means nothing without a window to be a share of, so with
                no model chosen there is nothing to drag. It reads Default while
                it is like that, which is also what would be saved.
              */
              disabled={chosenModel === null}
              onChange={(event) => {
                const at = Number(event.target.value);
                setShare(at === DEFAULT_SHARE ? null : at);
              }}
              aria-valuetext={asked === null ? 'Default' : `${asked}%`}
            />
            <output className={own.shareValue} htmlFor="agent-memory-share">
              {asked === null ? 'Default' : `${asked}%`}
            </output>
          </div>

          {/*
            The refusal, or the figures - never both. Where a share is refused
            the server answers with the built-in default's numbers rather than
            with nothing, and printing those under a refusal would show figures
            this agent is not going to get.
          */}
          {refusal !== null ? (
            <p className={own.shareRefusal} role="alert">
              {refusal}
            </p>
          ) : (
            budget !== null && (
              <dl className={own.budget}>
                {/*
                  Where the figures below are coming from, and only at Default.

                  Default used to mean one thing - the built-in allowance - and
                  now means whichever of two things the workspace has decided.
                  An agent sitting at Default in a workspace with a default of
                  25% is being shown that workspace's 25% worked out against
                  this model, not the built-in allowance, and the difference is
                  the only thing on this card a reader cannot get at by looking:
                  it is `inherited` on the budget, and this row is the one place
                  it is said. Where the agent has a share of its own the source
                  is the slider directly above, so the row would be restating
                  the control.
                */}
                {asked === null && (
                  <div className={own.budgetRow}>
                    <dt>{t('Default is')}</dt>
                    <dd>
                      {budget.inherited && budget.share !== null && budget.refusal === null
                        ? `the workspace's ${budget.share}%`
                        : 'the built-in allowance'}
                    </dd>
                  </div>
                )}
                <div className={own.budgetRow}>
                  <dt>{t('Altogether')}</dt>
                  <dd>{thousands(budget.totalTokens)} tokens</dd>
                </div>
                <div className={own.budgetRow}>
                  <dt>{t('Conversation')}</dt>
                  <dd>
                    {thousands(budget.conversationTokens)} tokens, {budget.turns} turns
                  </dd>
                </div>
                <div className={own.budgetRow}>
                  <dt>{t('Tool results')}</dt>
                  <dd>
                    {thousands(budget.toolResultTokens)} tokens, longest{' '}
                    {thousands(budget.longestResultTokens)}
                  </dd>
                </div>
              </dl>
            )
          )}

          {/*
            Why the row above says the built-in allowance in a workspace that
            has a default: this model cannot give that default, so this agent
            does not get it. The server's own sentence, printed plainly rather
            than as an alert - nothing here is refused, and there is nothing on
            this form to put right except the model above it.
          */}
          {refusal === null && inheritedRefusal !== null && (
            <p className={own.inheritedNote}>{inheritedRefusal}</p>
          )}
        </div>

        {/*
          How long it may look things up before it has to say something.

          Beside the memory card because both are about what one turn may cost,
          and empty here means the same as Default there: whatever the
          installation has decided, which is where every agent starts. A number
          is for the agent whose work is genuinely longer - twenty tools spend
          three rounds on listing and loading before the work begins, and what
          came back instead was "kept looking things up without reaching an
          answer" with everything it had gathered thrown away.
        */}
        <div className={styles.field}>
          <span className={own.labelWithHint}>
            <label className={styles.label} htmlFor="agent-max-rounds">
              {t('Tool Rounds')}
            </label>
            <FieldHint label={t('Tool Rounds')}>
              {t('A round is one call to the model: it answers, or it asks for tools and what it asks for is run and handed back. An agent that has not answered by the last one is stopped, because a model talking to itself is billed for every round. Empty follows Tool rounds under Admin → Settings → Chat; set one here for an agent whose work is longer than the rest. Between 2 and 100.')}
            </FieldHint>
          </span>
          <input
            id="agent-max-rounds"
            className={styles.input}
            type="number"
            min={2}
            max={100}
            value={rounds}
            placeholder={t('Follows the installation')}
            onChange={(event) => setRounds(event.target.value)}
          />
        </div>

        {/*
          What this agent may read of what the workspace knows. A grant:
          an agent given none reads none.
        */}
        <GrantList<MemoryCatalog>
          label={t('Memory Catalogs')}
          what="memory catalogs"
          styles={styles}
          catalogue={memoryCatalogue}
          empty={t("No catalogs in this workspace yet.")}
          keyOf={(catalog) => catalog.id}
          nameOf={(catalog) => catalog.name}
          metaOf={(catalog) => catalog.memoryCount}
          linkOf={(catalog) => `/workspace/${workspaceId}/memory?catalog=${catalog.id}`}
          granted={memoryCatalogs}
          onChange={setMemoryCatalogs}
        />

        {/*
          And what it may draw on of how the workspace goes about things.
          Granted per catalog, like memory: what an agent is expected to know
          is decided once rather than once per skill.
        */}
        <GrantList<GrantableCatalog>
          label={t('Skill Catalogs')}
          what="skill catalogs"
          styles={styles}
          catalogue={skillCatalogue}
          empty={t("No skill catalogs in this workspace yet.")}
          hint={t("The workspace's own catalogs, and the ones its plugins bring.")}
          keyOf={(catalog) => catalog.id}
          nameOf={(catalog) => catalog.name}
          metaOf={(catalog) => catalog.plugin ?? catalog.count}
          linkOf={(catalog) => catalog.link}
          granted={skillCatalogs}
          onChange={setSkillCatalogs}
          fixedOf={(catalog) =>
            catalog.name === BUILT_IN_SKILLS ? t('Brought by Orknux, and held by every agent.') : null
          }
        />

        {/*
          And what happens to each skill inside those catalogs. Issue #480.

          The catalog above is the scope; this list is the three states, the
          same control the tools list uses and for the same reason - a workspace
          that grants a folder of nine skills should not have to split the
          folder to keep one page from one agent, and a page that is how this
          agent works should not wait to be loaded.

          Drawn by name, stored by id: the id is what a command writes and what
          the two lists hold.
        */}
        <GrantList<GrantableSkill>
          label={t('Skills')}
          what="skills"
          styles={styles}
          catalogue={skillsCatalogue}
          empty={t('No skills in this workspace yet.')}
          hint={t('Every skill in the catalogs above, and what happens to each. Hide: the agent cannot see or load it, even though its catalog is granted. Offer: it is listed for the agent, which loads it when it applies — this is what every skill does unless you say otherwise. Always: its whole page is in front of the model every turn, for instructions that are how this agent works rather than something to read when it applies. Always costs that page on every turn.')}
          keyOf={(skill) => skill.id}
          nameOf={(skill) => skill.name}
          storedAs={(skill) => skill.key}
          metaOf={(skill) => skill.plugin ?? skill.catalog}
          titleOf={(skill) => skill.description}
          linkOf={(skill) => skill.link}
          groupOf={(skill) => skill.plugin ?? null}
          /*
            Ticked means offered, and the server stores the opposite - the
            skills that are hidden - so what a granted catalog holds is ticked
            unless its id is in the hidden list. A row whose catalog is not
            granted is out of scope and reads as Hide.
          */
          granted={offeredSkills}
          onChange={(ids) => {
            const wanted = new Set(ids);
            setHiddenSkills(inScopeSkills.filter((id) => !wanted.has(id)));
            // A skill nobody can see is not one to put in front of the model.
            setRequiredSkills((held) => held.filter((id) => wanted.has(id)));
          }}
          marked={requiredSkills}
          onMark={setRequiredSkills}
          /*
            A skill whose catalog is not granted is out of scope: it reads Hide
            and no press can change that, so it says so rather than looking like
            a control that does nothing.
          */
          fixedOf={(skill) =>
            inSkillScope(skill, skillCatalogs)
              ? null
              : t('Its catalog, {catalog}, is not granted to this agent. Tick it under Skill Catalogs above to use this skill.').replace(
                  '{catalog}',
                  skill.catalog,
                )
          }
        />

        {/*
          And what it may *do*. The strictest of the grants: a skill is a
          page this agent reads, a tool is code it runs. The rows bearing a
          plugin's name are the tools that plugin offers to agents, granted
          and stored the same way - one name in the same list.
        */}
        <GrantList<GrantableTool>
          label={t('Tools')}
          what="tools"
          styles={styles}
          catalogue={toolCatalogue}
          empty={t("No tools in this workspace yet.")}
          hint={t('The workspace\'s own tools, the tools its plugins offer, and the tools Orknux brings itself, listed under Built in. Each row cycles through its states on a click. Hide: the agent cannot use it. Offer: it is available, and loaded when a job needs it once a tool limit is set below — with no limit every offered tool is simply carried. Always: it is carried in front of the model every turn, which matters once a limit is set. A built-in that comes with a wider grant — the skill and memory tools, the orknux_ and shell_ tools — reads the state of that grant and is switched there.')}
          keyOf={(tool) => tool.id}
          nameOf={(tool) => tool.name}
          metaOf={(tool) => tool.plugin ?? (tool.off ? 'off' : null)}
          linkOf={(tool) => tool.link}
          groupOf={(tool) => tool.plugin ?? null}
          // An orknux_ name held while the grant is off is remembered, not granted: the row reads Hide.
          granted={[...tools.filter((name) => orknuxAccess || !orknuxNames.includes(name)), ...fixedOn]}
          onChange={(names) => {
            // The rows that come with a grant are views of it, not grants of
            // their own, so they are taken out before the rest are stored. #444.
            const kept = names.filter((one) => !fixedNames.has(one));
            setTools(kept);
            // A tool that is no longer granted cannot be one that always
            // travels: the mark is about a grant, and one left behind would be
            // a name nothing resolves. #372.
            setRequiredTools((held) => held.filter((one) => kept.includes(one)));
          }}
          /*
            The Always state, kept whether or not a ceiling is set. It has no
            effect without one - nothing is ever dropped, so every offered tool
            is carried - but the choice is remembered for when a limit is set,
            so the control reads the same three states at all times. #372, #413.
          */
          marked={requiredTools}
          onMark={setRequiredTools}
          /*
            Read-only while the workspace has not allowed it, for every row the
            server brings: the state is still drawn and the reason is on hover.
            The ones that come with a wider grant say that instead, because
            that is the more specific thing to know. Issue #482.
          */
          fixedOf={(tool) =>
            tool.governance === 'ORKNUX_ACCESS' && orknuxAccess
              ? null
              : fixedBecause(tool.governance) ??
                (tool.governance === 'GRANT' && !unsafeBuiltIns ? fixedAsBuiltIn() : null)
          }
          alwaysWhenOn={(tool) => tool.governance === 'ORKNUX_ACCESS'}
          titleOf={(tool) => tool.summary}
        />

        {/*
          How many tools this agent carries at once. Issue #372.

          Beneath the list rather than above it, because it is a statement about
          what is in the list: the count beside it is what somebody reads to know
          whether the number they typed is one this agent can actually work
          under.
        */}
        <div className={styles.field}>
          <span className={own.labelWithHint}>
            <label className={styles.label} htmlFor="agent-max-tools">
              {t('Tools carried at once')}
            </label>
            <FieldHint label={t('Tools carried at once')}>
              {t('How many tools this agent holds in front of the model at a time. Left empty it holds all of them, up to what the model’s provider allows — which is 128 for OpenAI and Azure, and is the number at which a request fails rather than the number at which an agent starts choosing badly. Set one and the agent carries the ones marked "always" plus a tool for searching the rest, finding what a job needs and giving up what it looked up longest ago when the room runs out. Between 5 and 100.')}
            </FieldHint>
          </span>
          <div className={styles.inputWrapper}>
            <input
              id="agent-max-tools"
              name="maxTools"
              className={styles.input}
              type="number"
              min={5}
              max={100}
              value={maxTools}
              placeholder={t('As many as the provider allows')}
              onChange={(event) => setMaxTools(event.target.value)}
            />
            {/*
              Counted as it is typed, which is what makes the number mean
              something: a ceiling under what is already marked as always
              carried is a ceiling the agent cannot work under, and the moment
              to say so is while somebody is choosing it.
            */}
            {carrying !== null && (
              <span
                className={alwaysCarried >= carrying ? own.carryingFull : own.carrying}
                data-always-count=""
              >
                {alwaysCarried} always, {grantedTotal} granted
                {alwaysCarried >= carrying && ` — leaves no room to search`}
              </span>
            )}
          </div>
        </div>

        {/*
          And what it may point those tools at. The one grant that comes with a
          standing instruction rather than an ability: the briefing lists these
          and tells the agent to name one only when explicitly told to, so a
          tick here widens what the agent *may* do without changing what it
          does unprompted.
        */}
        <GrantList<WorkspaceConnection>
          label={t('Connections')}
          what="connections"
          styles={styles}
          catalogue={connectionCatalogue}
          empty={t('No connections in this workspace yet.')}
          hint={t('Connections the agent may name where a tool takes one. It is told to use one only when explicitly asked to, and to leave tools to their configured defaults otherwise.')}
          keyOf={(connection) => connection.id}
          nameOf={(connection) => connection.name}
          metaOf={(connection) => connection.type.toLowerCase()}
          linkOf={(connection) => `/workspace/${workspaceId}/integrations/connections/${connection.id}`}
          granted={connectionIds.map(connectionName)}
          onChange={(names) =>
            setConnectionIds(
              names.map(
                (name) =>
                  connectionCatalogue.items.find((held) => held.name === name)?.id ??
                  name.replace(/^#/, ''),
              ),
            )
          }
        />

        {/*
          And which of the workspace's other agents it may put a question to.

          Issue #350. An agent needing work done in a system it holds no tools
          for could be granted those tools as well - forty descriptions in its
          context and a chain of lookups in its rounds - or hand the job back.
          A specialist asked one question answers in a conversation of its own,
          so what comes back is the answer rather than the working.

          Beside the connections rather than among the tool grants, because what
          is being granted is not a capability but somebody to ask.
        */}
        <GrantList<Agent>
          label={t('Agents')}
          what="agents"
          styles={styles}
          catalogue={agentCatalogue}
          empty={t('No other agents in this workspace yet.')}
          hint={t('Other agents this one may put a question to. The one asked answers in a conversation of its own, with its own tools, so what comes back is the answer rather than the rounds that produced it. It is granted no agents of its own, so a chain cannot go further than one.')}
          keyOf={(one) => one.id}
          nameOf={(one) => one.name}
          metaOf={(one) => one.modelName ?? 'no model'}
          linkOf={(one) => `/workspace/${workspaceId}/agents/${one.id}/settings`}
          granted={agentIds.map(agentName)}
          onChange={(names) =>
            setAgentIds(
              names.map(
                (name) =>
                  agentCatalogue.items.find((held) => held.name === name)?.id ?? name.replace(/^#/, ''),
              ),
            )
          }
        />

        {/*
          Orknux itself, kept apart from the servers below on purpose: those
          are addresses somebody registered, and this is the application the
          agent is already inside. It never appears in that list.
        */}
        <div className={styles.field}>
          <span className={styles.label}>Orknux</span>
          {/*
            The (?) sits on the row and not on the heading above it, because the
            row is the thing being granted - UI-DESIGN-RULES.md says to put it
            beside that where the two differ, and here they do: the heading names
            the application, the row is the permission.

            It is a sibling of the <label> rather than a child of one. A button
            inside a label is a press the browser forwards to the control that
            label is for, so asking what the grant means would grant it.
          */}
          <div className={own.checkRow}>
            <label className={own.grantToggle}>
              <input
                type="checkbox"
                checked={orknuxAccess}
                onChange={(event) => {
                  const on = event.target.checked;
                  setOrknuxAccess(on);
                  // Granted afresh, every orknux_ tool starts on; they are switched one by one below.
                  if (on) setTools((held) => [...held, ...orknuxNames.filter((name) => !held.includes(name))]);
                }}
              />
              <span>{t('Let this agent ask orknux about orknux')}</span>
            </label>
            <FieldHint label="Orknux">
              {t('Its workspace’s workflows, runs and agents — and it can start a workflow, which really runs it. An agent that starts a workflow which asks an agent is a loop nothing here breaks.')}
            </FieldHint>
          </div>
        </div>

        {/*
          Beside Orknux because it is the same kind of switch - a grant of
          something the agent is not otherwise offered - and plural on
          purpose. An agent asks for a shell rather than for a named
          machine; which one it gets is decided when the session opens.
        */}
        <div className={styles.field}>
          <span className={styles.label}>{t('Shells')}</span>
          {/*
            Beside the row for the same reason, and this is the one where it
            matters most: what the note says is what an account on that machine
            can do, which is a sentence about the tick rather than about the
            word "Shells" above it.
          */}
          <div className={own.checkRow}>
            <label className={own.grantToggle}>
              <input
                type="checkbox"
                checked={shellAccess}
                onChange={(event) => setShellAccess(event.target.checked)}
              />
              <span>{t('Let this agent open a shell and run commands on it')}</span>
            </label>
            <FieldHint label={t('Shells')}>
              {t('It opens a session on one of the machines an administrator set up under Admin → Shell, gets a working directory of its own on it, and runs commands there. What contains that is the machine and the account named on it, not anything here: an agent given this can do whatever that account can. Every command is written down in the audit log under this agent\'s name.')}
            </FieldHint>
          </div>
        </div>


        {/*
          The same list as Tools and the catalogs above, and for the reason
          issue #172 gave for those: this was a row of chips with a text box to
          type a name into, so granting a server meant knowing its name by heart
          and spelling it, and nothing on the screen said which ones there were.
          The workspace already knows. Requested 2026-09-06.
        */}
        <GrantList<McpServer>
          label={t('MCP Servers')}
          what="mcp servers"
          styles={styles}
          catalogue={serverCatalogue}
          empty={t('No MCP servers in this workspace yet.')}
          hint={t('External tool servers this agent can connect to.')}
          keyOf={(server) => server.id}
          nameOf={(server) => server.name}
          linkOf={(server) => `/workspace/${workspaceId}/integrations/servers/${server.id}`}
          granted={mcpServers}
          onChange={setMcpServers}
        />
      </div>

      {saveError !== null && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}

      {(() => {
        /*
         * The button, the "Saved." note beside it, and a Cancel where the frame
         * offers one. Drawn at the foot, or portaled into the page's header
         * where one is offered - the button carries its own `form`, so
         * submitting works from either place. Issue #386.
         */
        const buttons = (
          <>
            {saved && saveError === null && styles.savedNote !== undefined && (
              <p className={styles.savedNote}>{t('Saved.')}</p>
            )}
            {onCancel !== undefined && (
              <button type="button" className={styles.ghost} onClick={onCancel} disabled={saving}>
                {t('Cancel')}
              </button>
            )}
            {/*
              A refused share stops the save here as well as at the server. Not
              instead of: the mutation refuses it from the same calculation, and
              this is only the form saying so before the press rather than after.
            */}
            <button
              type="submit"
              form={formId}
              className={styles.filled}
              disabled={name.trim() === '' || saving || refusal !== null}
            >
              {saving ? t('Saving…') : t('Save Changes')}
            </button>
          </>
        );
        return actionsSlot
          ? createPortal(buttons, actionsSlot)
          : <div className={styles.actions}>{buttons}</div>;
      })()}
    </form>
  );
}
