import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import type { SessionUser } from '../../api/session';
import {
  askSheet,
  cellName,
  columnName,
  fetchSheet,
  renameSheet,
  saveSheet,
  sheetExportUrl,
  sheetValues,
  valuesOf,
  workbookOf,
  workbookText,
} from '../../api/sheets';
import type { CellValue, SheetExportFormat, SheetTurn, SheetWithValues, Workbook, WorkbookValues } from '../../api/sheets';
import calculatorIcon from '../../assets/calculator.svg';
import chartIcon from '../../assets/chart-column.svg';
import pencilIcon from '../../assets/pencil.svg';
import redoIcon from '../../assets/redo.svg';
import tableIcon from '../../assets/table.svg';
import undoIcon from '../../assets/undo.svg';
import polishIcon from '../../assets/wand-sparkles.svg';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import form from '../../components/Dialog.module.css';
import { LivePointers, Presence, useAutosave, useLiveRoom } from '../../components/LiveRoom';
import { Loader } from '../../components/Loader';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import { t, tf } from '../../i18n';
import { matches, useRedoShortcut, useSaveShortcut, useUndoShortcut } from '../../session/shortcut';
import { shellUser } from '../../session/user';
import { DesignChat, useChatFiles, useChatModels } from './DesignChat';
import type { ChatIdea } from './DesignChat';
import shell from './DesignImageEditorPage.module.css';
import styles from './SheetEditorPage.module.css';
import {
  blockOf,
  boundsOf,
  COLUMN_LEAST,
  COLUMN_MOST,
  COLUMN_WIDTH,
  extentOf,
  freshTabName,
  looksNumeric,
  mergeWorkbooks,
  readTsv,
  ROW_HEIGHT,
  withCells,
  writeTsv,
} from './sheetGrid';
import type { Cell, Range } from './sheetGrid';

export interface SheetEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** The row of column letters, and the column of row numbers, in pixels. */
const HEAD_HEIGHT = 24;
const HEAD_WIDTH = 48;
/** How far past the last filled cell, and past the selection, the grid goes on. */
const ROWS_LEAST = 100;
const COLUMNS_LEAST = 26;
const ROWS_BEYOND = 50;
const COLUMNS_BEYOND = 6;
/** How many cells past the visible edge are drawn, so a scroll does not show a gap before the next frame. */
const OVERSCAN = 3;
/** How long after the last change the values are asked for again. */
const VALUES_MS = 300;
const UNDO_DEPTH = 100;

const IDEAS: ChatIdea[] = [
  {
    icon: tableIcon,
    title: () => t('Monthly budget'),
    line: () => t('Income, costs and what is left'),
    prompt: () => t('Lay out a monthly budget: a column of income and cost lines with amounts, a total for each, and what is left at the bottom as a formula.'),
  },
  {
    icon: calculatorIcon,
    title: () => t('Add totals'),
    line: () => t('A sum under every column of numbers'),
    prompt: () => t('Add a total row under the numbers in this tab: a SUM formula under every column that holds numbers, labelled Total.'),
  },
  {
    icon: chartIcon,
    title: () => t('Sales tracker'),
    line: () => t('Products, months and growth'),
    prompt: () => t('Make a sales tracker: products down the side, the twelve months across the top, a yearly total per product and a growth column as formulas.'),
  },
];

/** Offered first once the tab has something in it. */
const TIDY: ChatIdea = {
  icon: polishIcon,
  title: () => t('Explain this sheet'),
  line: () => t('What it holds and how its formulas work'),
  prompt: () => t('Read this sheet and explain what it holds and how its formulas work, in a few sentences.'),
};

const talkKey = (id: string) => `orknux.sheet.talk.${id}`;
const modelKey = (workspaceId: string) => `orknux.sheet.model.${workspaceId}`;

/** The editor as the routes hold it: one page per sheet, so another one opens afresh. */
export function SheetEditorRoute(props: SheetEditorPageProps) {
  const { sheetId = '' } = useParams();
  return <SheetEditorPage key={sheetId} {...props} />;
}

/**
 * Where a sheet is filled in: its grid, a formula bar over it and its tabs
 * under it, and down the right a conversation with a chat model that works in
 * it.
 *
 * What a cell comes to is the server's to say - the same engine the tools and
 * the .xlsx export use - so after every change the workbook on the screen is
 * sent to be worked out, a moment after the typing stops, and saved as it goes
 * the way the other Design editors save. Only the cells in view are drawn, so a
 * sheet of thousands of rows scrolls as one of ten does.
 */
export function SheetEditorPage({ session, onSignOut }: SheetEditorPageProps) {
  const firstName = (session.displayName?.trim() || session.username).split(/\s+/)[0];
  const { workspaceId = '', sheetId = '' } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<SheetWithValues | null>(null);
  const [missing, setMissing] = useState(false);
  const [workbook, setWorkbook] = useState<Workbook>({ tabs: [] });
  /** The workbook as last saved, to compare against. */
  const [saved, setSaved] = useState('');
  const [values, setValues] = useState<{ of: string; values: WorkbookValues }>({ of: '', values: { tabs: [] } });
  const [tab, setTab] = useState(0);
  const [range, setRange] = useState<Range>({ anchor: { column: 0, row: 0 }, focus: { column: 0, row: 0 } });
  /** What is being typed into the selected cell, and where: in the cell or in the formula bar. */
  const [editing, setEditing] = useState<{ text: string; inBar: boolean } | null>(null);
  const editingNow = useRef(editing);
  editingNow.current = editing;
  const [naming, setNaming] = useState<string | null>(null);
  const [tabNaming, setTabNaming] = useState<{ at: number; name: string } | null>(null);
  const [removingTab, setRemovingTab] = useState<number | null>(null);
  const [past, setPast] = useState<Workbook[]>([]);
  const [future, setFuture] = useState<Workbook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [area, setArea] = useState({ width: 800, height: 600 });
  const [resizing, setResizing] = useState<{ column: string; from: number; width: number; before: Workbook } | null>(null);
  const [dragging, setDragging] = useState(false);

  const { models, modelId, choose } = useChatModels(workspaceId, modelKey);
  const [talk, setTalk] = useState<SheetTurn[]>([]);
  const [asking, setAsking] = useState('');
  const files = useChatFiles(workspaceId);
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  /** What this page last copied: the text it put on the clipboard, and the cells it came from as typed. */
  const copied = useRef<{ text: string; rows: string[][] } | null>(null);

  const undoKey = useUndoShortcut();
  const redoKey = useRedoShortcut();
  const saveKey = useSaveShortcut();

  const text = useMemo(() => workbookText(workbook), [workbook]);
  const unsaved = sheet !== null && text !== saved;
  const current = workbook.tabs[tab] ?? workbook.tabs[0] ?? { name: '', cells: {}, widths: {} };
  const shownValues = values.values.tabs.find((one) => one.name === current.name)?.values ?? {};
  const fresh = values.of === text;

  // -- Loading ------------------------------------------------------------

  function take(found: SheetWithValues) {
    const read = workbookOf(found);
    const written = workbookText(read);
    setSheet(found);
    setWorkbook(read);
    setSaved(written);
    setValues({ of: written, values: valuesOf(found.values) });
    setTab((held) => Math.min(held, read.tabs.length - 1));
  }

  useEffect(() => {
    if (sheetId === '') return;
    let left = false;
    fetchSheet(sheetId)
      .then((found) => {
        if (left) return;
        if (found === null) setMissing(true);
        else take(found);
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the sheet.'));
      });
    try {
      const kept = sessionStorage.getItem(talkKey(sheetId));
      if (kept !== null) setTalk(JSON.parse(kept) as SheetTurn[]);
    } catch {
      // Nothing kept: the conversation starts empty.
    }
    return () => {
      left = true;
    };
  }, [sheetId]);

  useEffect(() => {
    try {
      if (sheetId !== '') sessionStorage.setItem(talkKey(sheetId), JSON.stringify(talk));
    } catch {
      // A conversation that cannot be kept is still a conversation.
    }
  }, [talk, sheetId]);

  // What the cells come to, asked for a moment after the workbook stops changing; an answer overtaken by a later one is dropped.
  const asked = useRef(0);
  useEffect(() => {
    if (sheet === null || values.of === text) return;
    const number = ++asked.current;
    const timer = window.setTimeout(() => {
      sheetValues(workspaceId, workbook)
        .then((found) => {
          if (number === asked.current) setValues({ of: text, values: found });
        })
        .catch((cause: unknown) => {
          if (number === asked.current) setError(cause instanceof Error ? cause.message : t('Could not work out the sheet.'));
        });
    }, VALUES_MS);
    return () => window.clearTimeout(timer);
  }, [text, sheet === null]);

  // -- Working on it together ----------------------------------------------

  const now = useRef({ sheet, workbook, saved, unsaved });
  now.current = { sheet, workbook, saved, unsaved };
  const saving = useRef(false);
  const live = useLiveRoom('sheet', sheet?.id ?? null, () => void catchUp());

  /** Somebody else saved: theirs taken in, and anything unsaved here merged into it. */
  async function catchUp() {
    const held = now.current.sheet;
    if (held === null || saving.current) return;
    const found = await fetchSheet(held.id).catch(() => null);
    if (found === null || found.revision === now.current.sheet?.revision) return;
    const theirs = workbookOf(found);
    const merged = now.current.unsaved ? mergeWorkbooks(workbookOf({ workbook: now.current.saved }), now.current.workbook, theirs) : theirs;
    setSheet(found);
    setSaved(workbookText(theirs));
    setWorkbook(merged);
    setValues({ of: workbookText(theirs), values: valuesOf(found.values) });
    setTab((was) => Math.min(was, merged.tabs.length - 1));
  }

  // -- Changing it ----------------------------------------------------------

  function change(next: Workbook) {
    setPast((held) => [...held, workbook].slice(-UNDO_DEPTH));
    setFuture([]);
    setWorkbook(next);
  }
  function undo() {
    if (past.length === 0) return;
    const to = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((ahead) => [workbook, ...ahead]);
    setWorkbook(to);
    setTab((was) => Math.min(was, to.tabs.length - 1));
    setEditing(null);
  }
  function redo() {
    if (future.length === 0) return;
    const [to, ...rest] = future;
    setFuture(rest);
    setPast((held) => [...held, workbook]);
    setWorkbook(to);
    setTab((was) => Math.min(was, to.tabs.length - 1));
    setEditing(null);
  }

  function write(written: Record<string, string>) {
    const tabNow = workbook.tabs[tab];
    if (tabNow === undefined) return;
    if (Object.entries(written).every(([address, value]) => (tabNow.cells[address] ?? '') === value)) return;
    change(withCells(workbook, tab, written));
  }

  // -- Saving -------------------------------------------------------------

  async function save(): Promise<boolean> {
    if (sheet === null) return false;
    if (!unsaved) return true;
    if (saving.current) return false;
    saving.current = true;
    setError(null);
    let over: SheetWithValues = sheet;
    let base = workbookOf({ workbook: saved });
    let mine = workbook;
    const sent = text;
    try {
      // Refused because somebody saved first: theirs is read, this merged into it, and sent again.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const written = await saveSheet(over.id, mine, over.revision, live.viewer);
          const read = workbookOf(written);
          const writtenText = workbookText(read);
          setSheet(written);
          setSaved(writtenText);
          // What was typed while the save was on its way stays, for the next one.
          if (workbookText(now.current.workbook) === sent) {
            setWorkbook(read);
            setValues({ of: writtenText, values: valuesOf(written.values) });
          }
          return true;
        } catch (cause) {
          if (!(cause instanceof ApiError && cause.code === 'SheetChanged')) throw cause;
          const found = await fetchSheet(over.id);
          if (found === null) throw cause;
          const theirs = workbookOf(found);
          mine = mergeWorkbooks(base, mine, theirs);
          base = theirs;
          over = found;
        }
      }
      return false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the sheet.'));
      return false;
    } finally {
      saving.current = false;
    }
  }

  useAutosave(unsaved, text, answering || editing !== null || resizing !== null, save);
  const guard = useLeaveGuard({ unsaved, backTo: `/workspace/${workspaceId}/design/sheets`, save });

  async function rename() {
    if (naming === null || sheet === null) return;
    const called = naming.trim();
    setNaming(null);
    if (called === '' || called === sheet.name) return;
    try {
      const renamed = await renameSheet(sheet.id, called);
      setSheet({ ...sheet, name: renamed.name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the sheet.'));
    }
  }

  // -- The grid's geometry ----------------------------------------------------

  const extent = extentOf(current);
  const columnCount = Math.max(COLUMNS_LEAST, extent.columns + 1 + COLUMNS_BEYOND, range.focus.column + 1 + COLUMNS_BEYOND);
  const rowCount = Math.max(ROWS_LEAST, extent.rows + 1 + ROWS_BEYOND, range.focus.row + 1 + ROWS_BEYOND);
  /** Where each column starts, from the grid's left edge, with the total width at the end. */
  const lefts = useMemo(() => {
    const at: number[] = [0];
    for (let column = 0; column < columnCount; column++) at.push(at[column] + (current.widths?.[columnName(column)] ?? COLUMN_WIDTH));
    return at;
  }, [columnCount, current.widths]);
  const widthOf = (column: number) => lefts[column + 1] - lefts[column];
  const totalWidth = lefts[columnCount];
  const totalHeight = rowCount * ROW_HEIGHT;

  /** The column a distance from the grid's left edge falls in. */
  function columnAtX(x: number): number {
    let low = 0;
    let high = columnCount - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lefts[middle] <= x) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  const firstColumn = Math.max(0, columnAtX(scroll.x) - OVERSCAN);
  const lastColumn = Math.min(columnCount - 1, columnAtX(scroll.x + area.width) + OVERSCAN);
  const firstRow = Math.max(0, Math.floor(scroll.y / ROW_HEIGHT) - OVERSCAN);
  const lastRow = Math.min(rowCount - 1, Math.ceil((scroll.y + area.height) / ROW_HEIGHT) + OVERSCAN);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (box === null) return;
    const measure = () => setArea({ width: box.clientWidth, height: box.clientHeight });
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(box);
    return () => watcher.disconnect();
  }, [sheet !== null]);

  /** The selected cell kept in view, as a spreadsheet scrolls to follow the keys. */
  function reveal(cell: Cell) {
    const box = scroller.current;
    if (box === null) return;
    const left = lefts[cell.column];
    const right = lefts[cell.column + 1];
    const top = cell.row * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (left < box.scrollLeft) box.scrollLeft = left;
    else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }

  /** The cell under the pointer. */
  function cellAtPointer(event: { clientX: number; clientY: number }): Cell {
    const box = scroller.current?.getBoundingClientRect();
    const x = (box === undefined ? 0 : event.clientX - box.left) + scroll.x;
    const y = (box === undefined ? 0 : event.clientY - box.top) + scroll.y;
    return { column: Math.max(0, Math.min(columnCount - 1, columnAtX(x))), row: Math.max(0, Math.min(rowCount - 1, Math.floor(y / ROW_HEIGHT))) };
  }

  // -- Selecting and typing ---------------------------------------------------

  const focusAddress = cellName(range.focus.column, range.focus.row);
  const focusRaw = current.cells[focusAddress] ?? '';

  function select(cell: Cell, extend = false) {
    setRange((held) => ({ anchor: extend ? held.anchor : cell, focus: cell }));
    reveal(cell);
  }

  function move(columns: number, rows: number, extend = false) {
    const to = {
      column: Math.max(0, range.focus.column + columns),
      row: Math.max(0, range.focus.row + rows),
    };
    select(to, extend);
  }

  /** What is typed put in the selected cell; then the selection moves the way the key that put it down says. */
  function commit(then?: { columns: number; rows: number }) {
    // Read off the ref and cleared at once: putting the focus back on the grid blurs the input, whose blur commits too.
    const held = editingNow.current;
    if (held === null) return;
    editingNow.current = null;
    write({ [focusAddress]: held.text });
    setEditing(null);
    if (then !== undefined) move(then.columns, then.rows);
    grid.current?.focus();
  }

  function startEditing(text: string, inBar = false) {
    if (answering) return;
    setEditing({ text, inBar });
  }

  function clearSelection() {
    write(blockOf(range, ''));
  }

  function copySelection(): string {
    const block = boundsOf(range);
    const shown: string[][] = [];
    const typed: string[][] = [];
    for (let row = block.top; row <= block.bottom; row++) {
      const shownRow: string[] = [];
      const typedRow: string[] = [];
      for (let column = block.left; column <= block.right; column++) {
        const address = cellName(column, row);
        const raw = current.cells[address] ?? '';
        typedRow.push(raw);
        shownRow.push(shownValues[address]?.f ?? (raw.startsWith('=') ? '' : raw));
      }
      shown.push(shownRow);
      typed.push(typedRow);
    }
    const textOut = writeTsv(shown);
    copied.current = { text: textOut, rows: typed };
    return textOut;
  }

  /**
   * Text pasted at the selection's top left. What this page copied itself is
   * pasted as it was typed, formulas and all; anything else - from another
   * spreadsheet, or another program - is pasted as the text it is.
   */
  function paste(textIn: string) {
    const rows = copied.current !== null && copied.current.text === textIn ? copied.current.rows : readTsv(textIn);
    if (rows.length === 0) return;
    const block = boundsOf(range);
    const written: Record<string, string> = {};
    rows.forEach((row, down) =>
      row.forEach((cell, across) => {
        written[cellName(block.left + across, block.top + down)] = cell;
      }),
    );
    write(written);
    const bottom = block.top + rows.length - 1;
    const right = block.left + Math.max(...rows.map((row) => row.length)) - 1;
    setRange({ anchor: { column: block.left, row: block.top }, focus: { column: right, row: bottom } });
  }

  function gridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing !== null || sheet === null) return;
    const command = event.ctrlKey || event.metaKey;
    const step = (columns: number, rows: number) => {
      event.preventDefault();
      move(columns, rows, event.shiftKey);
    };
    if (event.key === 'ArrowDown') step(0, 1);
    else if (event.key === 'ArrowUp') step(0, -1);
    else if (event.key === 'ArrowLeft') step(-1, 0);
    else if (event.key === 'ArrowRight') step(1, 0);
    else if (event.key === 'Tab') {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) move(0, -1);
      else startEditing(focusRaw);
    } else if (event.key === 'F2') {
      event.preventDefault();
      startEditing(focusRaw);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
    } else if (command && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setRange({ anchor: { column: 0, row: 0 }, focus: { column: Math.max(0, extent.columns), row: Math.max(0, extent.rows) } });
    } else if (!command && !event.altKey && event.key.length === 1) {
      // A letter typed on a selected cell starts writing over it, as in every spreadsheet.
      event.preventDefault();
      startEditing(event.key);
    }
  }

  // Undo, redo and save from anywhere on the page but a field being typed in.
  const keys = useRef({ undo, redo, save });
  keys.current = { undo, redo, save };
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (matches(event, saveKey)) {
        event.preventDefault();
        void keys.current.save();
        return;
      }
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      if (typing) return;
      if (matches(event, undoKey)) {
        event.preventDefault();
        keys.current.undo();
      } else if (matches(event, redoKey) || ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        keys.current.redo();
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [undoKey, redoKey, saveKey]);

  function editorKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit({ columns: 0, rows: event.shiftKey ? -1 : 1 });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commit({ columns: event.shiftKey ? -1 : 1, rows: 0 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
      grid.current?.focus();
    }
  }

  // -- The pointer --------------------------------------------------------------

  function cellsDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || answering) return;
    // A press on a scrollbar scrolls, and selects nothing.
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX - box.left >= event.currentTarget.clientWidth || event.clientY - box.top >= event.currentTarget.clientHeight) return;
    if (editing !== null) commit();
    const cell = cellAtPointer(event);
    select(cell, event.shiftKey);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    grid.current?.focus();
  }

  function cellsMove(event: ReactPointerEvent<HTMLDivElement>) {
    const box = scroller.current?.getBoundingClientRect();
    if (box !== undefined) live.point(event.clientX - box.left + scroll.x, event.clientY - box.top + scroll.y);
    if (!dragging) return;
    const cell = cellAtPointer(event);
    if (cell.column !== range.focus.column || cell.row !== range.focus.row) setRange((held) => ({ anchor: held.anchor, focus: cell }));
  }

  function resizeDown(event: ReactPointerEvent<HTMLSpanElement>, column: number) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing({ column: columnName(column), from: event.clientX, width: widthOf(column), before: workbook });
  }

  function resizeMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (resizing === null) return;
    const width = Math.round(Math.max(COLUMN_LEAST, Math.min(COLUMN_MOST, resizing.width + event.clientX - resizing.from)));
    setWorkbook((held) => ({
      tabs: held.tabs.map((one, at) => (at === tab ? { ...one, widths: { ...(one.widths ?? {}), [resizing.column]: width } } : one)),
    }));
  }

  function resizeUp() {
    if (resizing === null) return;
    if (workbookText(resizing.before) !== workbookText(workbook)) {
      setPast((held) => [...held, resizing.before].slice(-UNDO_DEPTH));
      setFuture([]);
    }
    setResizing(null);
  }

  // -- Tabs -----------------------------------------------------------------------

  function addTab() {
    const next = { tabs: [...workbook.tabs, { name: freshTabName(workbook), cells: {}, widths: {} }] };
    change(next);
    setTab(next.tabs.length - 1);
    setRange({ anchor: { column: 0, row: 0 }, focus: { column: 0, row: 0 } });
  }

  function renameTab() {
    if (tabNaming === null) return;
    const held = tabNaming;
    setTabNaming(null);
    const called = held.name.trim();
    if (called === '' || called === workbook.tabs[held.at]?.name) return;
    if (workbook.tabs.some((one, at) => at !== held.at && one.name.toLowerCase() === called.toLowerCase())) {
      setError(tf('There is already a tab called {name}.', { name: called }));
      return;
    }
    change({ tabs: workbook.tabs.map((one, at) => (at === held.at ? { ...one, name: called } : one)) });
  }

  function switchTab(at: number) {
    if (editing !== null) commit();
    setTab(at);
    setRange({ anchor: { column: 0, row: 0 }, focus: { column: 0, row: 0 } });
    scroller.current?.scrollTo(0, 0);
  }

  // -- Exporting ----------------------------------------------------------------

  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => {
    if (!exportOpen) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="sheet-export-menu"], [data-testid="sheet-export"]') === null) {
        setExportOpen(false);
      }
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [exportOpen]);

  /** The stored sheet downloaded, once what is on the screen has been saved, so the file is what is shown. */
  async function exportAs(format: SheetExportFormat) {
    if (sheet === null) return;
    setExportOpen(false);
    if (!(await save())) {
      setError(t('Could not save the sheet before exporting it.'));
      return;
    }
    const link = window.document.createElement('a');
    link.href = sheetExportUrl(sheet.id, format, tab);
    link.download = sheet.name;
    link.rel = 'noopener';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // -- The conversation ----------------------------------------------------------

  async function ask(event?: FormEvent<HTMLFormElement>, idea?: string) {
    event?.preventDefault();
    const said = (idea ?? asking).trim();
    if ((said === '' && files.attached.length === 0) || modelId === '' || sheet === null || answering || files.attaching) return;
    if (editing !== null) commit();
    setTalkError(null);
    // The model works on what is saved, so what is on screen is saved first.
    if (unsaved && !(await save())) return;
    const attachments = files.take();
    const sent: SheetTurn[] = [...talk, { role: 'user', content: said, ...(attachments.length > 0 ? { attachments } : {}) }];
    setTalk(sent);
    setAsking('');
    setAnswering(true);
    try {
      const answered = await askSheet(sheet.id, modelId, sent);
      setTalk([...sent, { role: 'assistant', content: answered.answer }]);
      if (answered.changed) {
        setPast((held) => [...held, workbook].slice(-UNDO_DEPTH));
        setFuture([]);
        take(answered.sheet);
      }
    } catch (cause) {
      setTalkError(cause instanceof Error ? cause.message : t('The model could not answer.'));
      // What it wrote before failing is saved: take it up.
      const found = await fetchSheet(sheet.id).catch(() => null);
      if (found !== null && found.revision !== sheet.revision) take(found);
    } finally {
      setAnswering(false);
    }
  }

  // -- Drawing -------------------------------------------------------------------

  /** What a cell shows: the server's value, or what was typed while the server has not yet said. */
  function shownOf(address: string): { text: string; value: CellValue | null } {
    const raw = current.cells[address];
    if (raw === undefined) return { text: '', value: null };
    const value = shownValues[address] ?? null;
    if (raw.startsWith('=')) return { text: value?.f ?? '', value };
    return fresh && value !== null ? { text: value.f, value } : { text: raw, value: null };
  }

  const block = boundsOf(range);
  const cells: ReactNode[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const address = cellName(column, row);
      const raw = current.cells[address];
      if (raw === undefined) continue;
      const { text: shown, value } = shownOf(address);
      const numeric = value === null ? looksNumeric(raw) : value.t === 'n';
      const failed = value?.t === 'e';
      cells.push(
        <div
          key={address}
          className={`${styles.cell} ${numeric ? styles.cellNumber : ''} ${failed ? styles.cellError : ''} ${value?.t === 'b' ? styles.cellBoolean : ''}`}
          style={{ left: lefts[column], top: row * ROW_HEIGHT, width: widthOf(column), height: ROW_HEIGHT }}
          data-cell={address}
          data-testid="sheet-cell"
          title={failed ? shown : undefined}
        >
          {shown}
        </div>,
      );
    }
  }

  const columnHeads: ReactNode[] = [];
  for (let column = firstColumn; column <= lastColumn; column++) {
    const chosen = column >= block.left && column <= block.right;
    columnHeads.push(
      <div
        key={column}
        className={`${styles.columnHead} ${chosen ? styles.headOn : ''}`}
        style={{ left: lefts[column], width: widthOf(column) }}
        data-column={columnName(column)}
        data-testid="sheet-column-head"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (editing !== null) commit();
          setRange({ anchor: { column, row: 0 }, focus: { column, row: Math.max(extent.rows, 0) } });
          grid.current?.focus();
        }}
      >
        {columnName(column)}
        <span
          className={styles.resize}
          onPointerDown={(event) => resizeDown(event, column)}
          onPointerMove={resizeMove}
          onPointerUp={resizeUp}
          onDoubleClick={(event) => {
            event.stopPropagation();
            const name = columnName(column);
            change({ tabs: workbook.tabs.map((one, at) => (at === tab ? { ...one, widths: Object.fromEntries(Object.entries(one.widths ?? {}).filter(([key]) => key !== name)) } : one)) });
          }}
          aria-label={tf('Resize column {column}', { column: columnName(column) })}
          title={t('Drag to resize; double-click for the usual width')}
          data-testid={`sheet-resize-${columnName(column)}`}
        />
      </div>,
    );
  }

  const rowHeads: ReactNode[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    const chosen = row >= block.top && row <= block.bottom;
    rowHeads.push(
      <div
        key={row}
        className={`${styles.rowHead} ${chosen ? styles.headOn : ''}`}
        style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (editing !== null) commit();
          setRange({ anchor: { column: 0, row }, focus: { column: Math.max(extent.columns, 0), row } });
          grid.current?.focus();
        }}
      >
        {row + 1}
      </div>,
    );
  }

  const selection = {
    left: lefts[block.left],
    top: block.top * ROW_HEIGHT,
    width: lefts[block.right + 1] - lefts[block.left],
    height: (block.bottom - block.top + 1) * ROW_HEIGHT,
  };
  const focusBox = {
    left: lefts[range.focus.column],
    top: range.focus.row * ROW_HEIGHT,
    width: widthOf(range.focus.column),
    height: ROW_HEIGHT,
  };

  if (missing) {
    return (
      <AppShell title={t('Sheet editor')} user={shellUser(session)} workspacePath={`/workspace/${workspaceId}`} showAdmin={session.admin} onSignOut={onSignOut} sidebar={null} hideSidebar>
        <p className={styles.missing}>
          {t('There is no such sheet here.')}{' '}
          <Link to={`/workspace/${workspaceId}/design/sheets`} data-testid="missing-back">
            {t('Back to sheets')}
          </Link>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('Sheet editor')}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={null}
      hideSidebar
      fills
    >
      <div className={shell.toolbar}>
        <button
          type="button"
          className={shell.back}
          onClick={() => {
            const to = `/workspace/${workspaceId}/design/sheets`;
            if (!askBeforeLeaving(to)) navigate(to);
          }}
          data-testid="sheet-back"
        >
          ← {t('Sheets')}
        </button>
        {naming !== null ? (
          <input
            className={shell.titleInput}
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void rename();
              if (event.key === 'Escape') setNaming(null);
            }}
            aria-label={t('Name')}
            autoFocus
            data-testid="sheet-title-input"
          />
        ) : (
          <button
            type="button"
            className={shell.toolbarTitle}
            onClick={() => setNaming(sheet?.name ?? '')}
            title={`${sheet?.name ?? ''} - ${t('click to rename')}`}
            data-testid="sheet-title"
          >
            {sheet?.name ?? ''}
          </button>
        )}
        {naming === null && (
          <button type="button" className={shell.tool} onClick={() => setNaming(sheet?.name ?? '')} title={t('Rename the sheet')} aria-label={t('Rename the sheet')}>
            <img src={pencilIcon} alt="" width={14} height={14} />
          </button>
        )}
        {unsaved && (
          <span className={shell.unsavedMark} data-testid="sheet-unsaved">
            {t('Unsaved')}
          </span>
        )}
        <Presence others={live.others} />
        <div className={shell.toolbarRight}>
          <button type="button" className={shell.tool} onClick={undo} disabled={past.length === 0} title={`${t('Undo')} (${undoKey})`} aria-label={t('Undo')} data-testid="sheet-undo">
            <img src={undoIcon} alt="" width={16} height={16} />
          </button>
          <button type="button" className={shell.tool} onClick={redo} disabled={future.length === 0} title={`${t('Redo')} (${redoKey})`} aria-label={t('Redo')} data-testid="sheet-redo">
            <img src={redoIcon} alt="" width={16} height={16} />
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <div className={shell.exportMenu}>
            <button
              type="button"
              className={`${form.ghost} ${shell.toolbarButton}`}
              onClick={() => setExportOpen((held) => !held)}
              disabled={sheet === null}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              data-testid="sheet-export"
            >
              {t('Export')} ▾
            </button>
            {exportOpen && (
              <div className={shell.exportItems} role="menu" data-testid="sheet-export-menu">
                <button type="button" role="menuitem" onClick={() => void exportAs('xlsx')} title={t('Every tab, with its formulas')} data-testid="sheet-export-xlsx">
                  XLSX
                </button>
                <button type="button" role="menuitem" onClick={() => void exportAs('csv')} title={t('This tab, as its values')} data-testid="sheet-export-csv">
                  CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={shell.editor}>
        <div className={styles.work}>
          <div className={styles.formulaBar}>
            <span className={styles.address} data-testid="sheet-address">
              {range.anchor.column === range.focus.column && range.anchor.row === range.focus.row
                ? focusAddress
                : `${cellName(block.left, block.top)}:${cellName(block.right, block.bottom)}`}
            </span>
            <input
              className={styles.formula}
              value={editing !== null ? editing.text : focusRaw}
              onFocus={() => {
                if (editing === null) startEditing(focusRaw, true);
              }}
              onChange={(event) => setEditing({ text: event.target.value, inBar: true })}
              onKeyDown={editorKeyDown}
              onBlur={() => {
                if (editing?.inBar === true) commit();
              }}
              disabled={sheet === null || answering}
              spellCheck={false}
              aria-label={t('What the selected cell holds')}
              data-testid="sheet-formula"
            />
          </div>

          <div
            className={styles.grid}
            ref={grid}
            tabIndex={0}
            onKeyDown={gridKeyDown}
            onCopy={(event) => {
              if (editing !== null) return;
              event.preventDefault();
              event.clipboardData.setData('text/plain', copySelection());
            }}
            onCut={(event) => {
              if (editing !== null) return;
              event.preventDefault();
              event.clipboardData.setData('text/plain', copySelection());
              clearSelection();
            }}
            onPaste={(event) => {
              if (editing !== null) return;
              event.preventDefault();
              paste(event.clipboardData.getData('text/plain'));
            }}
            aria-label={t('Cells')}
            data-testid="sheet-grid"
          >
            {sheet === null ? (
              <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
            ) : (
              <>
                <div className={styles.corner} style={{ width: HEAD_WIDTH, height: HEAD_HEIGHT }} />
                <div className={styles.columnHeads} style={{ left: HEAD_WIDTH, height: HEAD_HEIGHT }}>
                  <div style={{ position: 'relative', width: totalWidth, height: HEAD_HEIGHT, transform: `translateX(${-scroll.x}px)` }}>{columnHeads}</div>
                </div>
                <div className={styles.rowHeads} style={{ top: HEAD_HEIGHT, width: HEAD_WIDTH }}>
                  <div style={{ position: 'relative', width: HEAD_WIDTH, height: totalHeight, transform: `translateY(${-scroll.y}px)` }}>{rowHeads}</div>
                </div>
                <div
                  className={styles.cells}
                  style={{ top: HEAD_HEIGHT, left: HEAD_WIDTH }}
                  ref={scroller}
                  onScroll={(event) => setScroll({ x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop })}
                  onPointerDown={cellsDown}
                  onPointerMove={cellsMove}
                  onPointerUp={() => setDragging(false)}
                  onPointerLeave={() => live.point(null, null)}
                  onDoubleClick={(event) => {
                    const cell = cellAtPointer(event);
                    select(cell);
                    startEditing(current.cells[cellName(cell.column, cell.row)] ?? '');
                  }}
                  data-testid="sheet-cells"
                >
                  <div className={styles.paper} style={{ width: totalWidth, height: totalHeight }}>
                    <div className={styles.lines} />
                    {cells}
                    <div className={styles.selection} style={selection} aria-hidden="true" data-testid="sheet-selection" />
                    <div className={styles.focus} style={focusBox} aria-hidden="true" />
                    {editing !== null && !editing.inBar && (
                      <input
                        className={styles.inPlace}
                        style={{ left: focusBox.left, top: focusBox.top, minWidth: focusBox.width, height: focusBox.height }}
                        value={editing.text}
                        onChange={(event) => setEditing({ text: event.target.value, inBar: false })}
                        onKeyDown={editorKeyDown}
                        onBlur={() => commit()}
                        onPointerDown={(event) => event.stopPropagation()}
                        spellCheck={false}
                        ref={(field) => {
                          if (field === null || document.activeElement === field) return;
                          field.focus();
                          field.setSelectionRange(field.value.length, field.value.length);
                        }}
                        aria-label={tf('Cell {address}', { address: focusAddress })}
                        data-testid="sheet-cell-input"
                      />
                    )}
                  </div>
                </div>
                <LivePointers pointers={live.pointers} place={(x, y) => ({ left: x - scroll.x + HEAD_WIDTH, top: y - scroll.y + HEAD_HEIGHT })} />
                {answering && (
                  <div className={styles.working} data-testid="sheet-working">
                    <Loader label={t('Working…')} delay={0} size={20} />
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.tabs} role="tablist" aria-label={t('Tabs')} data-testid="sheet-tabs">
            {workbook.tabs.map((one, at) =>
              tabNaming?.at === at ? (
                <input
                  key={`naming-${at}`}
                  className={styles.tabInput}
                  value={tabNaming.name}
                  onChange={(event) => setTabNaming({ at, name: event.target.value })}
                  onBlur={renameTab}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') renameTab();
                    if (event.key === 'Escape') setTabNaming(null);
                  }}
                  aria-label={t('Tab name')}
                  autoFocus
                  data-testid="sheet-tab-input"
                />
              ) : (
                <span key={`${one.name}-${at}`} className={`${styles.tab} ${at === tab ? styles.tabOn : ''}`}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={at === tab}
                    className={styles.tabName}
                    onClick={() => switchTab(at)}
                    onDoubleClick={() => setTabNaming({ at, name: one.name })}
                    title={t('Double-click to rename')}
                    data-testid="sheet-tab"
                  >
                    {one.name}
                  </button>
                  {at === tab && workbook.tabs.length > 1 && (
                    <button
                      type="button"
                      className={styles.tabRemove}
                      onClick={() => setRemovingTab(at)}
                      aria-label={tf('Remove tab {name}', { name: one.name })}
                      title={t('Remove this tab')}
                      data-testid="sheet-tab-remove"
                    >
                      ×
                    </button>
                  )}
                </span>
              ),
            )}
            <button type="button" className={styles.tabAdd} onClick={addTab} disabled={sheet === null} aria-label={t('Add a tab')} title={t('Add a tab')} data-testid="sheet-tab-add">
              +
            </button>
          </div>
        </div>

        <div className={`${shell.panel} ${styles.panel}`} data-testid="sheet-panel">
          <DesignChat
            prefix="sheet"
            firstName={firstName}
            question={t('What shall we work out?')}
            ideas={Object.keys(current.cells).length > 0 ? [TIDY, ...IDEAS.slice(0, 2)] : IDEAS}
            ready={sheet !== null}
            talk={talk}
            answering={answering}
            talkError={talkError}
            working={t('Working…')}
            asking={asking}
            onAsking={setAsking}
            onAsk={(event, idea) => void ask(event, idea)}
            models={models}
            modelId={modelId}
            onModel={choose}
            placeholder={t('Describe what the sheet should hold')}
            inputLabel={t('What to do in the sheet')}
            files={files}
            footer={
              <>
                {error !== null && sheet !== null && (
                  <p className={form.error} role="alert">
                    {error}
                  </p>
                )}
                <span className={styles.count}>{tf('{count} cells', { count: Object.keys(current.cells).length })}</span>
              </>
            }
          />
        </div>
      </div>
      <ConfirmDialog
        subject={removingTab === null ? null : (workbook.tabs[removingTab]?.name ?? null)}
        kind="removeSheetTab"
        onClose={() => setRemovingTab(null)}
        onConfirm={async () => {
          if (removingTab === null) return;
          const next = { tabs: workbook.tabs.filter((_, at) => at !== removingTab) };
          change(next);
          setTab((was) => Math.max(0, Math.min(was, next.tabs.length - 1)));
          setRemovingTab(null);
        }}
      />
      <UnsavedWorkDialog
        subject={guard.asking ? (sheet?.name ?? t('This sheet')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}

