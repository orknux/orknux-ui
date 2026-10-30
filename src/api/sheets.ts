import { graphql } from './client';
import { editorTurnsInput } from './attachments';
import type { EditorTurn } from './attachments';

/**
 * One tab of a workbook: what was typed into each cell, by its address (`A1`),
 * and the widths of the columns somebody resized, in pixels. An empty cell is
 * left out, and a column at its usual width has no entry.
 */
export interface SheetTab {
  name: string;
  cells: Record<string, string>;
  widths?: Record<string, number>;
}

export interface Workbook {
  tabs: SheetTab[];
}

/** What a cell comes to: a number, text, a boolean or an error, and how it is shown. */
export interface CellValue {
  t: 'n' | 's' | 'b' | 'e';
  v: number | string | boolean | null;
  f: string;
}

export interface WorkbookValues {
  tabs: { name: string; values: Record<string, CellValue> }[];
}

/** A sheet; `workbook` is the JSON of a [Workbook], and `values` what its cells come to, worked out by the server. */
export interface Sheet {
  id: string;
  workspaceId: string;
  name: string;
  workbook: string;
  tabCount: number;
  cellCount: number;
  /** Counts the saves; a save sent with an older one is refused. */
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** A sheet with what its cells come to, as the editor opens it. */
export interface SheetWithValues extends Sheet {
  values: string;
}

export type SheetTurn = EditorTurn;

export interface SheetAnswer {
  answer: string;
  /** Whether the model saved anything. */
  changed: boolean;
  sheet: SheetWithValues;
}

const FIELDS = 'id workspaceId name workbook tabCount cellCount revision createdBy createdAt updatedBy updatedAt';
const FULL = `${FIELDS} values`;

/** The tab a new sheet, and a tab added to one, is called before anybody names it. */
export const FIRST_TAB = 'Sheet1';

/** A stored workbook; one that cannot be read is a workbook with one empty tab. */
export function workbookOf(sheet: Pick<Sheet, 'workbook'>): Workbook {
  try {
    const read = JSON.parse(sheet.workbook) as Partial<Workbook>;
    if (Array.isArray(read.tabs) && read.tabs.length > 0) {
      return { tabs: read.tabs.map((tab) => ({ name: String(tab.name ?? FIRST_TAB), cells: { ...(tab.cells ?? {}) }, widths: { ...(tab.widths ?? {}) } })) };
    }
  } catch {
    // Read as empty below.
  }
  return { tabs: [{ name: FIRST_TAB, cells: {}, widths: {} }] };
}

/** The workbook as it is sent: tabs without widths say so by leaving the field out. */
export function workbookText(workbook: Workbook): string {
  return JSON.stringify({
    tabs: workbook.tabs.map((tab) => ({
      name: tab.name,
      cells: tab.cells,
      ...(tab.widths !== undefined && Object.keys(tab.widths).length > 0 ? { widths: tab.widths } : {}),
    })),
  });
}

export function valuesOf(text: string | null | undefined): WorkbookValues {
  try {
    const read = JSON.parse(text ?? '') as Partial<WorkbookValues>;
    return Array.isArray(read.tabs) ? { tabs: read.tabs } : { tabs: [] };
  } catch {
    return { tabs: [] };
  }
}

/** A workspace's sheets, the one worked on last first. */
export async function fetchSheets(workspaceId: string): Promise<Sheet[]> {
  const data = await graphql<{ sheets: Sheet[] }>(
    `query ($workspaceId: ID!) { sheets(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.sheets;
}

export async function fetchSheet(id: string): Promise<SheetWithValues | null> {
  const data = await graphql<{ sheet: SheetWithValues | null }>(`query ($id: ID!) { sheet(id: $id) { ${FULL} } }`, { id });
  return data.sheet;
}

/** What the workbook on the screen comes to, saved or not; nothing is written. */
export async function sheetValues(workspaceId: string, workbook: Workbook): Promise<WorkbookValues> {
  const data = await graphql<{ sheetValues: string }>(
    `query ($workspaceId: ID!, $workbook: String!) { sheetValues(workspaceId: $workspaceId, workbook: $workbook) }`,
    { workspaceId, workbook: workbookText(workbook) },
  );
  return valuesOf(data.sheetValues);
}

export async function createSheet(workspaceId: string, name: string, workbook?: Workbook): Promise<Sheet> {
  const data = await graphql<{ createSheet: Sheet }>(
    `mutation ($workspaceId: ID!, $name: String!, $workbook: String) {
       createSheet(workspaceId: $workspaceId, name: $name, workbook: $workbook) { ${FIELDS} }
     }`,
    { workspaceId, name, workbook: workbook === undefined ? null : workbookText(workbook) },
  );
  return data.createSheet;
}

export async function renameSheet(id: string, name: string): Promise<Sheet> {
  const data = await graphql<{ renameSheet: Sheet }>(
    `mutation ($id: ID!, $name: String!) { renameSheet(id: $id, name: $name) { ${FIELDS} } }`,
    { id, name },
  );
  return data.renameSheet;
}

/** Writes the whole workbook; refused when the sheet was saved since `revision`. [viewer] is the open editor saving it. */
export async function saveSheet(id: string, workbook: Workbook, revision: number, viewer?: string): Promise<SheetWithValues> {
  const data = await graphql<{ saveSheet: SheetWithValues }>(
    `mutation ($id: ID!, $workbook: String!, $revision: Int, $viewer: String) {
       saveSheet(id: $id, workbook: $workbook, revision: $revision, viewer: $viewer) { ${FULL} }
     }`,
    { id, workbook: workbookText(workbook), revision, viewer: viewer ?? null },
  );
  return data.saveSheet;
}

export async function deleteSheet(id: string): Promise<boolean> {
  const data = await graphql<{ deleteSheet: boolean }>(`mutation ($id: ID!) { deleteSheet(id: $id) }`, { id });
  return data.deleteSheet;
}

/** Makes a sheet from a file - .xlsx, .xls, .ods or .csv - sent as a data URL. */
export async function importSheet(workspaceId: string, filename: string, file: string, name?: string): Promise<Sheet> {
  const data = await graphql<{ importSheet: Sheet }>(
    `mutation ($workspaceId: ID!, $filename: String!, $file: String!, $name: String) {
       importSheet(workspaceId: $workspaceId, filename: $filename, file: $file, name: $name) { ${FIELDS} }
     }`,
    { workspaceId, filename, file, name: name ?? null },
  );
  return data.importSheet;
}

/** Asks a chat model to work in the sheet; what it writes is saved as it goes. */
export async function askSheet(id: string, modelId: string, messages: SheetTurn[]): Promise<SheetAnswer> {
  const data = await graphql<{ askSheet: SheetAnswer }>(
    `mutation ($id: ID!, $modelId: ID!, $messages: [SheetChatTurnInput!]!) {
       askSheet(id: $id, modelId: $modelId, messages: $messages) { answer changed sheet { ${FULL} } }
     }`,
    { id, modelId, messages: editorTurnsInput(messages) },
  );
  return data.askSheet;
}

export type SheetExportFormat = 'xlsx' | 'csv';

/** Where the stored sheet downloads from: the whole workbook as .xlsx, or one tab as .csv. */
export function sheetExportUrl(id: string, format: SheetExportFormat, tab = 0): string {
  return format === 'csv' ? `/api/sheets/${id}/export/csv?tab=${tab}` : `/api/sheets/${id}/export/xlsx`;
}

/** The file types an import takes. */
export const SHEET_FILES = '.xlsx,.xls,.ods,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.oasis.opendocument.spreadsheet';

// -- Addresses ----------------------------------------------------------------

/** A column's letters from its index from 0: 0 is A, 25 is Z, 26 is AA. */
/** The functions a formula may call, as the server's engine names them. */
export async function fetchSheetFunctions(workspaceId: string): Promise<string[]> {
  const data = await graphql<{ sheetFunctions: string[] }>(
    'query SheetFunctions($workspaceId: ID!) { sheetFunctions(workspaceId: $workspaceId) }',
    { workspaceId },
  );
  return data.sheetFunctions;
}

export function columnName(index: number): string {
  let name = '';
  let at = index + 1;
  while (at > 0) {
    const rest = (at - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    at = Math.floor((at - 1) / 26);
  }
  return name;
}

/** A column's index from 0 from its letters. */
export function columnIndex(name: string): number {
  let at = 0;
  for (const letter of name.toUpperCase()) at = at * 26 + (letter.charCodeAt(0) - 64);
  return at - 1;
}

/** A cell's address from its column and row, both from 0. */
export function cellName(column: number, row: number): string {
  return `${columnName(column)}${row + 1}`;
}

/** A cell's column and row, both from 0, or null where the address is not one. */
export function cellAt(address: string): { column: number; row: number } | null {
  const found = /^([A-Za-z]{1,3})([1-9][0-9]*)$/.exec(address);
  if (found === null) return null;
  return { column: columnIndex(found[1]), row: Number(found[2]) - 1 };
}
