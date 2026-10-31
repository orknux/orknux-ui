# Sheets

A sheet is a spreadsheet kept in the workspace: tabs of cells holding numbers,
words and formulas, filled in by hand, by a model in the chat beside it, or by
an agent anywhere else. What a formula comes to is worked out on the server,
so the editor, the agents and an exported .xlsx all agree on every value.

Sheets live under **Design → Sheets**.

## The sheets list

The list shows every sheet in the workspace, the one worked on last first, with
how many tabs and filled cells each holds. **Search sheets** narrows it by name.
**+ New sheet** makes an empty one and opens it; a row's buttons rename it and
remove it after asking.

**Import** makes a sheet from a file - .xlsx, .xls, .ods or .csv - one sheet per
file, named after it. Every tab comes across with its values and formulas;
formatting - colours, fonts, borders, number formats - does not.

## The sheet editor

The editor is a grid, with a formula bar above it and the tabs below.

- **Click** a cell to select it, **Shift+click** or drag to select a block, and
  click a column letter or a row number to take the whole column or row.
- **Type** on a selected cell to write over it; **Enter**, **F2** or a
  double-click edits what is there. **Enter** puts it down and moves down,
  **Tab** moves right, **Escape** lets it go. The arrow keys move, with
  **Shift** held they stretch the selection, and **Delete** empties it.
- The **formula bar** shows what the selected cell holds as it was typed - the
  formula rather than its result - and can be typed in too.
- A cell starting with `=` is a **formula**: `=A1+A2`, `=SUM(B2:B13)`,
  `=AVERAGE(Costs!C2:C20)`, `=IF(D2>0,"up","down")`, with Excel's function
  names and commas between arguments. Most of Excel's functions are there; one
  that is not shows `#NAME?`. A formula that cannot be worked out shows its
  error - `#DIV/0!`, `#REF!`, `#NAME?` - in red.
- **Copy**, **cut** and **paste** work between sheets and with other
  spreadsheets. What you copy within Orknux is pasted as it was typed, formulas
  and all; what you paste from elsewhere comes in as its text. A formula is
  pasted as written, without its addresses moved.
- **Drag** the corner of the selection to carry on: one number counts up from
  itself, two or more go on by their step, text ending in a number counts on,
  and a formula moves with the drag. Hold **Ctrl** to copy the numbers instead.
- **Drag** the edge of a column's letter to make it wider or narrower;
  double-click the edge for the usual width again.
- The **tabs** along the bottom switch between the sheet's tabs. **+** adds one,
  a double-click renames one, and **×** on the open tab removes it after
  asking. Renaming a tab does not rewrite the formulas that name it.

**Undo** and **Redo** go back over every change, and the sheet saves itself a
moment after you stop typing, as every Design editor does. Somebody else with
the same sheet open is shown at the top, their pointer moves over the grid,
and what they save lands in yours cell by cell.

## Asking a model

The chat down the right works in the sheet: ask it to lay out a budget, add a
total under every column, or explain how the formulas fit together. It reads
the sheet as it is saved, writes cells and tabs, and each change it makes is one
step **Undo** goes back over. Files go into the chat as in every editor - a CSV
or a workbook dropped there is read as its text.

## Export

**Export** saves what is on the screen and downloads it, named after the sheet:

- **XLSX** - every tab, with its formulas, for Excel, LibreOffice or Google
  Sheets.
- **CSV** - the open tab, as its values.

## Agents and sheets

An agent with Orknux access, or a client connected over MCP, works in sheets
with these tools:

- `orknux_sheets` lists the sheets in the workspace.
- `orknux_sheet` reads one: each tab's cells as they were typed and what they
  come to, a whole tab or one range of it.
- `orknux_create_sheet` makes a sheet, empty or with cells.
- `orknux_write_sheet_cells` writes cells in one tab - values and formulas, in
  one call - and answers what they came to.
- `orknux_change_sheet_tabs` adds, renames and removes tabs, and sets column
  widths.

Each answers with the sheet's link, which opens it in the editor.
