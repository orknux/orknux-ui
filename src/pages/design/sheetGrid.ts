import { cellAt, cellName, columnIndex } from '../../api/sheets';
import type { SheetTab, Workbook } from '../../api/sheets';

/** A cell, by its column and row, both from 0. */
export type Cell = { column: number; row: number };

/** A block of cells, corner to corner, either way round. */
export type Range = { anchor: Cell; focus: Cell };

/** How wide a column is before anybody resizes it, and how narrow it may go. */
export const COLUMN_WIDTH = 100;
export const COLUMN_LEAST = 24;
export const COLUMN_MOST = 1200;
export const ROW_HEIGHT = 24;

/** The block a range covers, top left to bottom right. */
export function boundsOf(range: Range): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(range.anchor.column, range.focus.column),
    right: Math.max(range.anchor.column, range.focus.column),
    top: Math.min(range.anchor.row, range.focus.row),
    bottom: Math.max(range.anchor.row, range.focus.row),
  };
}

/** How far the filled cells of a tab reach: the last column and row anything is in, or -1 where it is empty. */
export function extentOf(tab: SheetTab): { columns: number; rows: number } {
  let columns = -1;
  let rows = -1;
  for (const address of Object.keys(tab.cells)) {
    const at = cellAt(address);
    if (at === null) continue;
    columns = Math.max(columns, at.column);
    rows = Math.max(rows, at.row);
  }
  return { columns, rows };
}

/** A tab with some cells written: an empty text takes a cell away. */
export function withCells(workbook: Workbook, tab: number, written: Record<string, string>): Workbook {
  return {
    tabs: workbook.tabs.map((one, at) => {
      if (at !== tab) return one;
      const cells = { ...one.cells };
      for (const [address, text] of Object.entries(written)) {
        if (text === '') delete cells[address];
        else cells[address] = text;
      }
      return { ...one, cells };
    }),
  };
}

/** Every cell of a block, by address, set to the same text. */
export function blockOf(range: Range, text: string): Record<string, string> {
  const block = boundsOf(range);
  const written: Record<string, string> = {};
  for (let row = block.top; row <= block.bottom; row++) {
    for (let column = block.left; column <= block.right; column++) written[cellName(column, row)] = text;
  }
  return written;
}

/**
 * Text copied from a spreadsheet: rows on lines, cells split by tabs, a cell
 * holding either in double quotes - what Excel, LibreOffice and Google Sheets
 * all put on the clipboard. A last empty line is the end of the last row.
 */
export function readTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let at = 0; at < text.length; at++) {
    const letter = text[at];
    if (quoted) {
      if (letter === '"' && text[at + 1] === '"') {
        cell += '"';
        at++;
      } else if (letter === '"') quoted = false;
      else cell += letter;
      continue;
    }
    if (letter === '"' && cell === '') quoted = true;
    else if (letter === '\t') {
      row.push(cell);
      cell = '';
    } else if (letter === '\n' || letter === '\r') {
      if (letter === '\r' && text[at + 1] === '\n') at++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += letter;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Rows of cells as the clipboard carries them, quoted where a cell holds a tab, a line or a quote. */
export function writeTsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => (/[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join('\t'))
    .join('\n');
}

/**
 * Two people's changes to one workbook, put together: [mine] made from [base]
 * while somebody saved [theirs]. A cell I changed keeps mine and every other
 * cell is theirs, tab by tab, matched by name. Where I added, removed or renamed
 * a tab, my list of tabs stands, carrying their cell changes on the tabs it kept.
 */
export function mergeWorkbooks(base: Workbook, mine: Workbook, theirs: Workbook): Workbook {
  const names = (workbook: Workbook) => workbook.tabs.map((tab) => tab.name).join('\u0000');
  const reshaped = names(mine) !== names(base);
  const frame = reshaped ? mine : theirs;
  return {
    tabs: frame.tabs.map((tab) => {
      const was = base.tabs.find((one) => one.name === tab.name);
      const mineTab = mine.tabs.find((one) => one.name === tab.name);
      const theirTab = theirs.tabs.find((one) => one.name === tab.name);
      if (was === undefined || mineTab === undefined || theirTab === undefined) return mineTab ?? theirTab ?? tab;
      const cells = { ...theirTab.cells };
      const addresses = new Set([...Object.keys(was.cells), ...Object.keys(mineTab.cells)]);
      for (const address of addresses) {
        if (was.cells[address] === mineTab.cells[address]) continue;
        const written = mineTab.cells[address];
        if (written === undefined) delete cells[address];
        else cells[address] = written;
      }
      const widths = { ...(theirTab.widths ?? {}) };
      for (const [column, width] of Object.entries(mineTab.widths ?? {})) {
        if (was.widths?.[column] !== width) widths[column] = width;
      }
      return { name: tab.name, cells, widths };
    }),
  };
}

/** A name for a new tab that no tab has yet: Sheet2, Sheet3, ... */
export function freshTabName(workbook: Workbook): string {
  const taken = new Set(workbook.tabs.map((tab) => tab.name.toLowerCase()));
  for (let at = workbook.tabs.length + 1; ; at++) {
    const name = `Sheet${at}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** Whether what was typed reads as a number, so it is drawn to the right before the server has said. */
export function looksNumeric(text: string): boolean {
  return /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?%?$/.test(text.trim());
}

/** A block of this tab a formula reads, in the order it names them. */
export type FormulaRef = { left: number; top: number; right: number; bottom: number };

const REFERENCE =
  /"[^"]*"|(?<![A-Za-z0-9_.$])((?:'[^']+'|[A-Za-z0-9_.]+)!)?\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?(?![A-Za-z0-9_(.])/g;

/**
 * What a formula being typed reads on this tab. Text in quotes is passed over, a
 * name followed by a bracket is a function (LOG10), and one naming another tab
 * is left out, as it is not on the grid in front of the person.
 */
export function formulaRefs(text: string): FormulaRef[] {
  if (!text.startsWith('=')) return [];
  const found: FormulaRef[] = [];
  for (const match of text.matchAll(REFERENCE)) {
    if (match[2] === undefined || match[1] !== undefined || Number(match[3]) < 1) continue;
    const first = { column: columnIndex(match[2].toUpperCase()), row: Number(match[3]) - 1 };
    const last = match[4] === undefined
      ? first
      : { column: columnIndex(match[4].toUpperCase()), row: Number(match[5]) - 1 };
    found.push(boundsOf({ anchor: first, focus: last }));
  }
  return found;
}

function inQuotes(before: string): boolean {
  return (before.match(/"/g)?.length ?? 0) % 2 === 1;
}

/** The start of a function's name being typed at the caret, and what is typed so far. */
export function functionWordAt(text: string, caret: number): { start: number; word: string } | null {
  if (!text.startsWith('=')) return null;
  const before = text.slice(0, caret);
  if (inQuotes(before)) return null;
  const match = /(?<![A-Za-z0-9_.$!'])[A-Za-z][A-Za-z0-9_.]*$/.exec(before);
  return match === null ? null : { start: match.index, word: match[0] };
}

/** Whether the caret is where a formula expects a value, so an arrow key picks a cell. */
export function expectsReference(text: string, caret: number): boolean {
  if (!text.startsWith('=')) return false;
  const before = text.slice(0, caret);
  return !inQuotes(before) && /[=(,;+\-*/^&<>:]\s*$/.test(before);
}
