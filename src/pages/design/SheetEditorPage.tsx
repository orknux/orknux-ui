import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import type { SessionUser } from '../../api/session';
import {
  cellName,
  fetchSheetFunctions,
  columnName,
  fetchSheet,
  renameSheet,
  cellAt,
  saveSheet,
  sheetExportUrl,
  sheetValues,
  valuesOf,
  workbookOf,
  workbookText,
} from '../../api/sheets';
import type { CellFormat, CellValue, NumberFormat, SheetExportFormat, SheetTurn, SheetWithValues, Workbook, WorkbookValues } from '../../api/sheets';
import alignCenterIcon from '../../assets/align-center.svg';
import alignLeftIcon from '../../assets/align-left.svg';
import alignRightIcon from '../../assets/align-right.svg';
import boldIcon from '../../assets/bold.svg';
import calculatorIcon from '../../assets/calculator.svg';
import chartIcon from '../../assets/chart-column.svg';
import eraserIcon from '../../assets/eraser.svg';
import italicIcon from '../../assets/italic.svg';
import paintBucketIcon from '../../assets/paint-bucket.svg';
import pencilIcon from '../../assets/pencil.svg';
import redoIcon from '../../assets/redo.svg';
import strikeIcon from '../../assets/strikethrough.svg';
import tableIcon from '../../assets/table.svg';
import underlineIcon from '../../assets/underline.svg';
import undoIcon from '../../assets/undo.svg';
import polishIcon from '../../assets/wand-sparkles.svg';
import wrapIcon from '../../assets/wrap-text.svg';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import form from '../../components/Dialog.module.css';
import { LivePointers, Presence, useAutosave, useLiveRoom } from '../../components/LiveRoom';
import { Loader } from '../../components/Loader';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import { t, tf } from '../../i18n';
import { matches, matchesCommand, useRedoShortcut, useSaveShortcut, useSheetEditorShortcuts, useUndoShortcut } from '../../session/shortcut';
import type { SheetEditorShortcut } from '../../session/shortcut';
import { shellUser } from '../../session/user';
import { CLAUDE_CODE_MODEL, DesignChat, askThroughClaudeCode, useChatFiles, useChatModels } from './DesignChat';
import type { ChatIdea } from './DesignChat';
import shell from './DesignImageEditorPage.module.css';
import documentStyles from './DocumentEditorPage.module.css';
import { SHEET_FILL_COLOURS, SHEET_TEXT_COLOURS, SheetColour } from './SheetColour';
import styles from './SheetEditorPage.module.css';
import colourStyles from './DocumentTools.module.css';
import wire from './WireframeEditorPage.module.css';
import {
  blockOf,
  boundsOf,
  borderBlock,
  cellStyleOf,
  numberShown,
  sameNumberFormat,
  expectsReference,
  fillCells,
  fillFormats,
  fillTarget,
  formatBlock,
  withFormats,
  formulaRefs,
  functionWordAt,
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
import type { BorderChoice, Cell, FormatPatch, FormulaRef, Range } from './sheetGrid';
import { askKept, keptAskOf, resumeKept } from '../../api/editorAsks';
import { SheetBorders } from './SheetBorders';

export interface SheetEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** The row of column letters, and the column of row numbers, in pixels. */
const HEAD_HEIGHT = 24;
/** The colours of the blocks a formula reads; the same on either theme, as each is only an outline and a tint. */
const BLOCK_COLOURS = ['#4c9be8', '#e8734c', '#a06be0', '#3fb37f', '#d9a227', '#e05c9a'];
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
/**
 * The most cells one press of a format tool reaches: the server's own default
 * for a sheet, so a whole column dragged over is refused here, in words, and
 * not by a save that fails after it.
 */
const FORMAT_MOST = 50_000;

/** The number formats the bar offers, a currency by its symbol: `currency:zł`. */
const CURRENCIES = ['$', '€', '£', 'zł'];

/** What the number format menu shows for a cell's format. */
function numberChoice(format: CellFormat | undefined): string {
  if (format?.number === undefined) return 'general';
  if (format.number === 'currency') return `currency:${format.currency ?? '$'}`;
  return format.number;
}

/** The places a number is written with: the format's own, else its usual. */
function decimalsOf(format: CellFormat | undefined): number {
  if (format?.decimals !== undefined) return format.decimals;
  return format?.number === 'percent' || format?.number === undefined ? 0 : 2;
}

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
  /** `typed` is an edit begun by typing on a cell, where the arrows mean the next cell rather than the caret. */
  const [editing, setEditing] = useState<{ text: string; inBar: boolean; typed?: boolean } | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [functions, setFunctions] = useState<string[]>([]);
  const [hinted, setHinted] = useState(0);
  const [hintsOff, setHintsOff] = useState(false);
  /** The reference the arrow keys are moving through a formula, and where it sits in the text. */
  const picking = useRef<{ start: number; end: number; cell: Cell } | null>(null);
  const caretAt = caret ?? editing?.text.length ?? 0;
  const word = editing === null || hintsOff ? null : functionWordAt(editing.text, caretAt);
  const hints = word === null
    ? []
    : functions.filter((name) => name.startsWith(word.word.toUpperCase())).slice(0, 8);
  useEffect(() => {
    fetchSheetFunctions(workspaceId).then(setFunctions).catch(() => setFunctions([]));
  }, [workspaceId]);
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
  /** Where the selection's corner is being dragged to, drawn until it is let go. */
  const [fillTo, setFillTo] = useState<FormulaRef | null>(null);
  const fillOn = useRef(false);

  const { models, modelId, choose } = useChatModels(workspaceId, modelKey, true);
  const [talk, setTalk] = useState<SheetTurn[]>([]);
  const [asking, setAsking] = useState('');
  const files = useChatFiles(workspaceId);
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  /** What this page last copied: the text it put on the clipboard, and the cells it came from as typed and as formatted. */
  const copied = useRef<{ text: string; rows: string[][]; formats: (CellFormat | null)[][] } | null>(null);

  const undoKey = useUndoShortcut();
  const redoKey = useRedoShortcut();
  const saveKey = useSaveShortcut();
  const formatKeys = useSheetEditorShortcuts();

  const text = useMemo(() => workbookText(workbook), [workbook]);
  const unsaved = sheet !== null && text !== saved;
  const current = workbook.tabs[tab] ?? workbook.tabs[0] ?? { name: '', cells: {}, widths: {} };
  const shownValues = values.values.tabs.find((one) => one.name === current.name)?.values ?? {};
  const fresh = values.of === text;
  /** The tab the values on hand were worked out for, so a cell unchanged since can go on showing its value. */
  const valuesTab = useMemo(() => {
    try {
      return (JSON.parse(values.of || '{"tabs":[]}') as Workbook).tabs.find((one) => one.name === current.name) ?? null;
    } catch {
      return null;
    }
  }, [values.of, current.name]);

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
  /*
   * The workbook on screen as text, as of the last render. An answer is also
   * dropped once the screen holds another workbook: a save replaces it with
   * the server's copy - the same cells and formatting, in the server's order -
   * and sets that copy's values itself without asking again, so an answer for
   * the text it replaced, landing after, would otherwise put back values that
   * are not the screen's, and every typed cell would be drawn as typed until
   * the next change.
   */
  const textNow = useRef(text);
  textNow.current = text;
  useEffect(() => {
    if (sheet === null || values.of === text) return;
    const number = ++asked.current;
    const timer = window.setTimeout(() => {
      sheetValues(workspaceId, workbook)
        .then((found) => {
          if (number === asked.current && textNow.current === text) setValues({ of: text, values: found });
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

  /** Cells and their formatting written as one change, so one undo takes back a paste or a drag whole. */
  function writeWith(written: Record<string, string>, formats: Record<string, CellFormat | null>) {
    if (workbook.tabs[tab] === undefined) return;
    const next = withFormats(withCells(workbook, tab, written), tab, formats);
    if (workbookText(next) !== text) change(next);
  }

  // -- Formatting -----------------------------------------------------------

  /** The selected cells given [patch] over what they have, or, given null, nothing at all. */
  function format(patch: FormatPatch | null) {
    const tabNow = workbook.tabs[tab];
    if (tabNow === undefined || sheet === null || answering) return;
    const block = boundsOf(range);
    const count = (block.right - block.left + 1) * (block.bottom - block.top + 1);
    if (count > FORMAT_MOST) {
      setError(tf('Format at most {count} cells at once.', { count: FORMAT_MOST.toLocaleString() }));
      return;
    }
    writeWith({}, formatBlock(tabNow, range, patch));
  }

  /** The border picker: drawn over the selected cells, with what they had on their other sides kept. */
  function border(choice: BorderChoice, off = false) {
    const tabNow = workbook.tabs[tab];
    if (tabNow === undefined || sheet === null || answering) return;
    const block = boundsOf(range);
    if ((block.right - block.left + 1) * (block.bottom - block.top + 1) > FORMAT_MOST) {
      setError(tf('Format at most {count} cells at once.', { count: FORMAT_MOST.toLocaleString() }));
      return;
    }
    writeWith({}, borderBlock(tabNow, range, choice, off));
  }

  /** On for every selected cell when the cell in focus does not have it, off when it does - as a spreadsheet's B does. */
  function toggle(key: 'bold' | 'italic' | 'underline' | 'strike' | 'wrap') {
    format({ [key]: focusFormat?.[key] === true ? null : true });
  }

  function chooseNumber(choice: string) {
    // A format chosen here writes the comma between thousands, as the toolbar always has, whatever a file said.
    if (choice === 'general') format({ number: null, decimals: null, currency: null, ungrouped: null });
    else if (choice.startsWith('currency:')) {
      const symbol = choice.slice('currency:'.length);
      format({
        number: 'currency',
        decimals: focusFormat?.number === 'currency' ? focusFormat.decimals ?? null : null,
        currency: symbol === '$' ? null : symbol,
        ungrouped: null,
      });
    } else format({ number: choice as NumberFormat, decimals: null, currency: null, ungrouped: null });
  }

  /** One place more or fewer after the point; a General cell becomes a Number one, as a spreadsheet's buttons do. */
  function stepDecimals(by: number) {
    const now = decimalsOf(focusFormat);
    const next = Math.max(0, Math.min(30, now + by));
    format({ number: focusFormat?.number ?? 'number', decimals: next });
  }

  /** The formatting keys, heard on the grid and in a cell being typed in; true where one was pressed. */
  function formatKey(event: ReactKeyboardEvent): boolean {
    const which = (Object.keys(formatKeys) as SheetEditorShortcut[]).find((name) => matchesCommand(event.nativeEvent, formatKeys[name]));
    if (which === undefined) return false;
    event.preventDefault();
    toggle(which === 'sheetBold' ? 'bold' : which === 'sheetItalic' ? 'italic' : 'underline');
    return true;
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
  const focusFormat = current.formats?.[focusAddress];

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

  function startEditing(text: string, inBar = false, typed = false) {
    if (answering) return;
    picking.current = null;
    setCaret(null);
    setHintsOff(false);
    setHinted(0);
    setEditing({ text, inBar, typed });
  }

  function retype(text: string, inBar: boolean, at: number | null) {
    picking.current = null;
    setCaret(at);
    setHintsOff(false);
    setHinted(0);
    setEditing({ text, inBar, typed: editing?.typed });
  }

  /** Sets the text and puts the caret where it belongs, once the field has been given the text. */
  function placeText(field: HTMLInputElement, text: string, at: number) {
    setEditing({ text, inBar: editing?.inBar ?? false, typed: editing?.typed });
    setCaret(at);
    window.requestAnimationFrame(() => field.setSelectionRange(at, at));
  }

  function takeFunction(field: HTMLInputElement, name: string) {
    if (word === null || editing === null) return;
    const after = editing.text.slice(caretAt);
    const opened = after.startsWith('(') ? name : `${name}(`;
    const at = word.start + name.length + 1;
    placeText(field, editing.text.slice(0, word.start) + opened + after, at);
    picking.current = null;
    setHintsOff(false);
    setHinted(0);
  }

  function clearSelection() {
    write(blockOf(range, ''));
  }

  function copySelection(): string {
    const block = boundsOf(range);
    const shown: string[][] = [];
    const typed: string[][] = [];
    const formats: (CellFormat | null)[][] = [];
    for (let row = block.top; row <= block.bottom; row++) {
      const shownRow: string[] = [];
      const typedRow: string[] = [];
      const formatRow: (CellFormat | null)[] = [];
      for (let column = block.left; column <= block.right; column++) {
        const address = cellName(column, row);
        const raw = current.cells[address] ?? '';
        typedRow.push(raw);
        shownRow.push(shownValues[address]?.f ?? (raw.startsWith('=') ? '' : raw));
        formatRow.push(current.formats?.[address] ?? null);
      }
      shown.push(shownRow);
      typed.push(typedRow);
      formats.push(formatRow);
    }
    const textOut = writeTsv(shown);
    copied.current = { text: textOut, rows: typed, formats };
    return textOut;
  }

  /** A cut takes the cells' formatting with it, as a move does: it goes where they are pasted. */
  function cutSelection() {
    const tabNow = workbook.tabs[tab];
    if (tabNow === undefined) return;
    writeWith(blockOf(range, ''), formatBlock(tabNow, range, null));
  }

  /**
   * Text pasted at the selection's top left. What this page copied itself is
   * pasted as it was typed, formulas, formatting and all; anything else - from
   * another spreadsheet, or another program - is pasted as the text it is, and
   * the cells it lands on keep their formatting.
   */
  function paste(textIn: string) {
    const own = copied.current !== null && copied.current.text === textIn ? copied.current : null;
    const rows = own !== null ? own.rows : readTsv(textIn);
    if (rows.length === 0) return;
    const block = boundsOf(range);
    const written: Record<string, string> = {};
    const formats: Record<string, CellFormat | null> = {};
    rows.forEach((row, down) =>
      row.forEach((cell, across) => {
        const address = cellName(block.left + across, block.top + down);
        written[address] = cell;
        if (own !== null) formats[address] = own.formats[down]?.[across] ?? null;
      }),
    );
    writeWith(written, formats);
    const bottom = block.top + rows.length - 1;
    const right = block.left + Math.max(...rows.map((row) => row.length)) - 1;
    setRange({ anchor: { column: block.left, row: block.top }, focus: { column: right, row: bottom } });
  }

  function gridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing !== null || sheet === null) return;
    if (formatKey(event)) return;
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
      startEditing(event.key, false, true);
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
    // A whole cell is formatted, never a word of it, so the keys format the cell being typed in.
    if (formatKey(event)) return;
    if (hints.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHinted((was) => (was + (event.key === 'ArrowDown' ? 1 : -1) + hints.length) % hints.length);
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        takeFunction(event.currentTarget, hints[Math.min(hinted, hints.length - 1)]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setHintsOff(true);
        return;
      }
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (step !== undefined && editing !== null) {
      const at = event.currentTarget.selectionStart ?? editing.text.length;
      const held = picking.current !== null && picking.current.end === at ? picking.current : null;
      // Where a formula expects a value, an arrow chooses a cell and writes its name, as in every spreadsheet.
      if (held !== null || expectsReference(editing.text, at)) {
        event.preventDefault();
        const from = held?.cell ?? range.focus;
        const cell = {
          column: Math.max(0, Math.min(columnCount - 1, from.column + step[0])),
          row: Math.max(0, Math.min(rowCount - 1, from.row + step[1])),
        };
        const start = held?.start ?? at;
        const name = cellName(cell.column, cell.row);
        placeText(event.currentTarget, editing.text.slice(0, start) + name + editing.text.slice(held?.end ?? at), start + name.length);
        picking.current = { start, end: start + name.length, cell };
        return;
      }
      // Typing on a cell, an arrow goes to the next cell. Up and down have no line to move to anywhere.
      // Left and right stay the caret's in the formula bar and after F2 or a double click, which are for correcting.
      if (step[1] !== 0 || (editing.typed === true && !editing.inBar)) {
        event.preventDefault();
        commit({ columns: step[0], rows: step[1] });
      }
      return;
    }
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

  function fillDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Its own drag: the cells under it would take a press here as a new selection.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    fillOn.current = true;
  }

  function fillMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (fillOn.current) setFillTo(fillTarget(block, cellAtPointer(event)));
  }

  function fillUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!fillOn.current) return;
    fillOn.current = false;
    const target = fillTarget(block, cellAtPointer(event));
    setFillTo(null);
    if (target === null) return;
    const flipped = event.ctrlKey || event.metaKey;
    writeWith(
      fillCells((column, row) => current.cells[cellName(column, row)] ?? '', block, target, flipped),
      fillFormats((column, row) => current.formats?.[cellName(column, row)], block, target),
    );
    setRange({ anchor: { column: target.left, row: target.top }, focus: { column: target.right, row: target.bottom } });
    grid.current?.focus();
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

  /**
   * A double-click on a column's edge: the column made as wide as the widest
   * thing in it, as it is drawn - its format's number, bold or italic, and its
   * padding - and every selected column with it when it is one of several
   * selected. A column with nothing in it goes back to the usual width. One
   * change, so one undo takes it back.
   */
  function fitColumns(column: number) {
    const tabNow = workbook.tabs[tab];
    if (tabNow === undefined) return;
    const chosen = boundsOf(range);
    const whole = column >= chosen.left && column <= chosen.right && chosen.right > chosen.left;
    const fitting = whole ? Array.from({ length: chosen.right - chosen.left + 1 }, (_, at) => chosen.left + at) : [column];
    const pen = document.createElement('canvas').getContext('2d');
    if (pen === null) return;
    const sample = grid.current?.querySelector<HTMLElement>('[data-testid="sheet-cell"]') ?? grid.current;
    const drawn = sample === null || sample === undefined ? null : getComputedStyle(sample);
    const family = drawn?.fontFamily ?? 'sans-serif';
    const size = drawn?.fontSize ?? '13px';
    const padding = drawn === null ? 12 : Number.parseFloat(drawn.paddingLeft) + Number.parseFloat(drawn.paddingRight);
    const widths = { ...(tabNow.widths ?? {}) };
    for (const at of fitting) {
      let widest = 0;
      for (const address of Object.keys(tabNow.cells)) {
        if (cellAt(address)?.column !== at) continue;
        const look = tabNow.formats?.[address];
        pen.font = `${look?.italic === true ? 'italic ' : ''}${look?.bold === true ? '700 ' : ''}${size} ${family}`;
        const lines = shownOf(address).text.split('\n');
        for (const line of lines) widest = Math.max(widest, pen.measureText(line).width);
      }
      const name = columnName(at);
      // A pixel each side for the column's line, and a little air, so the last letter is not against the edge.
      if (widest === 0) delete widths[name];
      else widths[name] = Math.round(Math.max(COLUMN_LEAST, Math.min(COLUMN_MOST, Math.ceil(widest + padding + 4))));
    }
    change({ tabs: workbook.tabs.map((one, at) => (at === tab ? { ...one, widths } : one)) });
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

  /*
   * A question asked before this page was loaded again - a reload in the
   * middle of an answer - is waited for as though it had just been sent: the
   * working row, then the answer under the question and the sheet taken up
   * where the answer changed it.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (sheet === null || resumed.current) return;
    resumed.current = true;
    const askId = keptAskOf('sheet', sheet.id);
    if (askId === null) return;
    const id = sheet.id;
    const revision = sheet.revision;
    setAnswering(true);
    resumeKept('sheet', id, askId)
      .then(async (settled) => {
        setTalk((was) => [...was, { role: 'assistant', content: settled.answer ?? '' }]);
        const found = settled.changed === true ? await fetchSheet(id).catch(() => null) : null;
        if (found !== null && found.revision !== revision) take(found);
      })
      .catch((cause: unknown) => setTalkError(cause instanceof Error ? cause.message : t('The model could not answer.')))
      .finally(() => setAnswering(false));
    // Once, for the sheet this page opened on; `take` and the setters are the page's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

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
      const answered =
        modelId === CLAUDE_CODE_MODEL
          ? await askThroughClaudeCode(workspaceId, `the sheet ${sheet.name}`, sent, sheet.revision, () => fetchSheet(sheet.id)).then(
              (asked) => ({ answer: asked.answer, changed: asked.changed, sheet: asked.item }),
            )
          : await askKept('sheet', sheet.id, modelId, sent).then(async (settled) => {
              const found = settled.changed === true ? await fetchSheet(sheet.id).catch(() => null) : null;
              return { answer: settled.answer ?? '', changed: found !== null, sheet: found };
            });
      setTalk([...sent, { role: 'assistant', content: answered.answer }]);
      if (answered.changed && answered.sheet !== null) {
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
    if (fresh) return raw.startsWith('=') ? { text: value?.f ?? '', value } : { text: value?.f ?? raw, value };
    /*
     * The values are for the workbook as it was a moment ago. A cell whose
     * contents have not changed since still comes to the same - and a format
     * chosen since is written here at once, rather than the bare number being
     * drawn until the server has been asked again.
     */
    const look = current.formats?.[address];
    const same = value !== null && valuesTab !== null && valuesTab.cells[address] === raw;
    if (same && value.t === 'n' && typeof value.v === 'number' && !sameNumberFormat(valuesTab.formats?.[address], look)) {
      return { text: numberShown(value.v, look) ?? (raw.startsWith('=') ? value.f : raw), value };
    }
    if (raw.startsWith('=')) return { text: value?.f ?? '', value };
    return same ? { text: value.f, value } : { text: raw, value: null };
  }

  const block = boundsOf(range);
  const cells: ReactNode[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const address = cellName(column, row);
      const raw = current.cells[address];
      const look = current.formats?.[address];
      // An empty cell is drawn only where it has something to show: a fill, say.
      if (raw === undefined && look === undefined) continue;
      const { text: shown, value } = shownOf(address);
      const numeric = raw !== undefined && (value === null ? looksNumeric(raw) : value.t === 'n');
      const failed = value?.t === 'e';
      cells.push(
        <div
          key={address}
          className={`${styles.cell} ${numeric ? styles.cellNumber : ''} ${failed ? styles.cellError : ''} ${value?.t === 'b' ? styles.cellBoolean : ''}`}
          style={{ left: lefts[column], top: row * ROW_HEIGHT, width: widthOf(column), height: ROW_HEIGHT, ...cellStyleOf(look) }}
          data-cell={address}
          data-testid="sheet-cell"
          title={failed ? shown : undefined}
        >
          {shown}
        </div>,
      );
    }
  }

  // One per column on show rather than an edge of each cell: only a filled cell is drawn, so an empty sheet had none.
  const columnLines: ReactNode[] = [];
  for (let column = firstColumn; column <= lastColumn; column++) {
    columnLines.push(
      <div key={column} className={styles.columnLine} style={{ left: lefts[column + 1] - 1 }} data-testid="sheet-column-line" />,
    );
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
            fitColumns(column);
          }}
          aria-label={tf('Resize column {column}', { column: columnName(column) })}
          title={t('Drag to resize; double-click to fit what is in it')}
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

  // The cells the formula being typed reads, each block in a colour of its own.
  const formulaBlocks = formulaRefs(editing?.text ?? '')
    .filter((one) => one.right < columnCount && one.bottom < rowCount)
    .map((one, index) => (
      <div
        key={index}
        className={styles.formulaBlock}
        style={{
          left: lefts[one.left],
          top: one.top * ROW_HEIGHT,
          width: lefts[one.right + 1] - lefts[one.left],
          height: (one.bottom - one.top + 1) * ROW_HEIGHT,
          '--block': BLOCK_COLOURS[index % BLOCK_COLOURS.length],
        } as CSSProperties}
        aria-hidden="true"
        data-testid="sheet-formula-block"
      />
    ));

  function functionHints(place: { left: number | string; top: number | string }) {
    if (hints.length === 0) return null;
    return (
      <ul className={styles.hints} style={place} data-testid="sheet-function-hints" role="listbox" aria-label={t('Functions')}>
        {hints.map((name, index) => (
          <li
            key={name}
            role="option"
            aria-selected={index === hinted}
            className={index === hinted ? styles.hintOn : undefined}
            data-testid="sheet-function-hint"
            onPointerDown={(event) => {
              // Taken without leaving the field, whose blur would write the cell half typed.
              event.preventDefault();
              event.stopPropagation();
              takeFunction(document.activeElement as HTMLInputElement, name);
            }}
          >
            {name}
          </li>
        ))}
      </ul>
    );
  }

  const formattable = sheet !== null && !answering;

  /** A tool on the format bar, drawn as the document editor's are; the grid keeps the focus while it is pressed. */
  const tool = (label: string, icon: string, on: boolean, act: () => void, testid: string) => (
    <button
      type="button"
      className={`${shell.tool} ${on ? wire.toolOn : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={act}
      disabled={!formattable}
      aria-pressed={on}
      title={label}
      aria-label={label}
      data-testid={testid}
    >
      <img src={icon} alt="" width={16} height={16} />
    </button>
  );

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
          <div className={`${documentStyles.formatBar} ${styles.formatBar}`} role="toolbar" aria-label={t('Formatting')} data-testid="sheet-toolbar">
            {tool(`${t('Bold')} (${formatKeys.sheetBold})`, boldIcon, focusFormat?.bold === true, () => toggle('bold'), 'sheet-bold')}
            {tool(`${t('Italic')} (${formatKeys.sheetItalic})`, italicIcon, focusFormat?.italic === true, () => toggle('italic'), 'sheet-italic')}
            {tool(`${t('Underline')} (${formatKeys.sheetUnderline})`, underlineIcon, focusFormat?.underline === true, () => toggle('underline'), 'sheet-underline')}
            {tool(t('Strikethrough'), strikeIcon, focusFormat?.strike === true, () => toggle('strike'), 'sheet-strike')}
            <SheetColour
              label={t('Text colour')}
              mark={<span className={colourStyles.colourLetter}>A</span>}
              colours={SHEET_TEXT_COLOURS}
              now={focusFormat?.color ?? null}
              disabled={!formattable}
              onPick={(colour) => format({ color: colour })}
              none={t('Default colour')}
              testid="sheet-colour"
            />
            <SheetColour
              label={t('Fill colour')}
              mark={<img src={paintBucketIcon} alt="" width={14} height={14} />}
              colours={SHEET_FILL_COLOURS}
              now={focusFormat?.fill ?? null}
              disabled={!formattable}
              onPick={(colour) => format({ fill: colour })}
              none={t('No fill')}
              testid="sheet-fill"
            />
            <span className={shell.toolbarGap} aria-hidden="true" />
            {tool(t('Align left'), alignLeftIcon, focusFormat?.align === 'left', () => format({ align: focusFormat?.align === 'left' ? null : 'left' }), 'sheet-align-left')}
            {tool(t('Align centre'), alignCenterIcon, focusFormat?.align === 'center', () => format({ align: focusFormat?.align === 'center' ? null : 'center' }), 'sheet-align-center')}
            {tool(t('Align right'), alignRightIcon, focusFormat?.align === 'right', () => format({ align: focusFormat?.align === 'right' ? null : 'right' }), 'sheet-align-right')}
            {tool(t('Wrap text'), wrapIcon, focusFormat?.wrap === true, () => toggle('wrap'), 'sheet-wrap')}
            <SheetBorders sides={focusFormat?.border ?? []} disabled={!formattable} onPick={(choice, off) => border(choice, off)} />
            <span className={shell.toolbarGap} aria-hidden="true" />
            <select
              className={documentStyles.blockStyle}
              value={numberChoice(focusFormat)}
              onChange={(event) => {
                chooseNumber(event.target.value);
                grid.current?.focus();
              }}
              disabled={!formattable}
              aria-label={t('Number format')}
              title={t('Number format')}
              data-testid="sheet-number-format"
            >
              <option value="general">{t('General')}</option>
              <option value="number">{t('Numeric')}</option>
              <option value="percent">{t('Percentage')}</option>
              {[...CURRENCIES, ...(focusFormat?.number === 'currency' && !CURRENCIES.includes(focusFormat.currency ?? '$') ? [focusFormat.currency ?? '$'] : [])].map((symbol) => (
                <option key={symbol} value={`currency:${symbol}`}>
                  {tf('Currency ({symbol})', { symbol })}
                </option>
              ))}
              <option value="date">{t('Date')}</option>
            </select>
            <button
              type="button"
              className={`${shell.tool} ${documentStyles.wordTool}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => stepDecimals(-1)}
              disabled={!formattable || focusFormat?.number === 'date' || (focusFormat?.number !== undefined && decimalsOf(focusFormat) === 0)}
              title={t('Fewer decimal places')}
              aria-label={t('Fewer decimal places')}
              data-testid="sheet-decimals-fewer"
            >
              .0←
            </button>
            <button
              type="button"
              className={`${shell.tool} ${documentStyles.wordTool}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => stepDecimals(1)}
              disabled={!formattable || focusFormat?.number === 'date'}
              title={t('More decimal places')}
              aria-label={t('More decimal places')}
              data-testid="sheet-decimals-more"
            >
              .00→
            </button>
            <span className={shell.toolbarGap} aria-hidden="true" />
            {tool(t('Clear formatting'), eraserIcon, false, () => format(null), 'sheet-clear-format')}
          </div>
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
              onChange={(event) => retype(event.target.value, true, event.target.selectionStart)}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onKeyDown={editorKeyDown}
              onBlur={() => {
                if (editing?.inBar === true) commit();
              }}
              disabled={sheet === null || answering}
              spellCheck={false}
              aria-label={t('What the selected cell holds')}
              data-testid="sheet-formula"
            />
            {editing?.inBar === true && functionHints({ left: 96, top: '100%' })}
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
              cutSelection();
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
                    {columnLines}
                    {cells}
                    <div className={styles.selection} style={selection} aria-hidden="true" data-testid="sheet-selection" />
                    <div className={styles.focus} style={focusBox} aria-hidden="true" />
                    {formulaBlocks}
                    {fillTo !== null && (
                      <div
                        className={styles.fillPreview}
                        style={{
                          left: lefts[fillTo.left],
                          top: fillTo.top * ROW_HEIGHT,
                          width: lefts[fillTo.right + 1] - lefts[fillTo.left],
                          height: (fillTo.bottom - fillTo.top + 1) * ROW_HEIGHT,
                        }}
                        aria-hidden="true"
                        data-testid="sheet-fill-preview"
                      />
                    )}
                    {editing === null && !answering && (
                      <div
                        className={styles.fillHandle}
                        style={{ left: selection.left + selection.width - 5, top: selection.top + selection.height - 5 }}
                        onPointerDown={fillDown}
                        onPointerMove={fillMove}
                        onPointerUp={fillUp}
                        onPointerCancel={() => {
                          fillOn.current = false;
                          setFillTo(null);
                        }}
                        onDoubleClick={(event) => event.stopPropagation()}
                        title={t('Drag to continue or copy; hold Ctrl for the other')}
                        data-testid="sheet-fill-handle"
                      />
                    )}
                    {editing !== null && !editing.inBar && functionHints({ left: focusBox.left, top: focusBox.top + focusBox.height })}
                    {editing !== null && !editing.inBar && (
                      <input
                        className={styles.inPlace}
                        style={{
                          left: focusBox.left,
                          top: focusBox.top,
                          minWidth: focusBox.width,
                          height: focusBox.height,
                          fontWeight: focusFormat?.bold === true ? 700 : undefined,
                          fontStyle: focusFormat?.italic === true ? 'italic' : undefined,
                          textDecoration: cellStyleOf(focusFormat).textDecoration,
                        }}
                        value={editing.text}
                        onChange={(event) => retype(event.target.value, false, event.target.selectionStart)}
                        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
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

