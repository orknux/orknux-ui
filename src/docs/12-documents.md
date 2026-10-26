# Documents

A document is writing that belongs to the workspace rather than to one chat: a
runbook, a policy, a letter to customers, the notes of a weekly review. It is
written on pages, as it will print, by people in the editor and by agents
through their tools, and it keeps every earlier version of itself.

Documents live under **Design → Documents**, beside Images, Videos and
Wireframes.

## The documents list

![The documents list: the catalogs down the left, and the Runbooks catalog's documents with their words and when they changed](/screens/documents.png)

**Catalogs** down the left are how documents are filed - one for runbooks, one
for letters, one for a team's notes. **All documents** at the top shows every
one whatever its catalog. **New catalog** makes another; the pencil beside a
catalog's name renames it, and its bin deletes it, which is refused while the
catalog still holds a document - empty it first, so nothing is lost by a click.
A document made without a catalog goes into the workspace's first one, which is
made for it if there is none.

The table lists the documents in the catalog chosen: **Name**, **Catalog**,
**Words** and **Updated**, each a column to sort on. **Search documents** finds
a document by its name and by any word written in it. The row's buttons open it
to read (**View**), rename it in place, move it to another catalog, and delete
it - after asking, and naming any other documents that link to it, so a link
does not break unseen (see Links between documents, below).

**+ New document** makes an empty document in the catalog you are in and opens
it. **New documents**, above the table, is the page a new document starts on -
A4, Letter, A5, Legal or A3 - the same for everybody in the workspace; only its
administrators may change it, and it is A4 until they do.

### Bringing documents in

**Import**, beside New document, takes **several files at once**: choose them
together in the file picker and each becomes a document of its own, named after
its file, in the catalog you are in. It reads PDF, Markdown (and the zip
Markdown export makes), ODT, DOCX, HTML and plain text. While it works the
button counts them - "Importing 2 of 5…" - and a file it could not read is named
in the line under the table, with no empty document left behind for it.

What an import keeps:

- **Headings, paragraphs, bold and italic, links and lists** from every format.
- **Tables** from a PDF, where the PDF draws them with ruling lines, or where
  words stand plainly in columns - enough rows and columns, nearly every row
  full, short cells. Prose with a gap in it stays prose. A bold or ruled-off
  first row becomes the table's head, and merged cells stay merged.
- **Bulleted and numbered lists** from a PDF, whether the bullet is a character
  or a painted dot, nested by how far in each item starts. A line of prose that
  merely opens with a dash or a number stays in its paragraph.
- **Pictures**, kept as Design pictures and placed where they were.

How large a file may be, and how many pictures one import may bring, are limits
under **Admin → Settings → Limits**.

## Writing

![The Escalation handbook in the editor: the outline down the left, a table and a code block on the page, and a highlight's note open](/screens/document-editor.png)

A document opens on **sheets of its own paper**. The text flows from one page
to the next as it does in a word processor, and **Page break** in the bar starts
a new page where the caret is. The pages are what a printout or the PDF export
will look like, so what you see is laid out the way it will be read.

The bar above the pages holds what can be done to the words:

- **Text style** - Paragraph, Heading 1, Heading 2 or Heading 3.
- **Bold**, **Italic**, **Underline**, **Strikethrough** and **Inline code**,
  with the usual keys (Ctrl+B, Ctrl+I, Ctrl+U).
- **Text colour** - a row of colours, **Default colour** to take it off, and
  **Another colour** for any other from a picker.
- **Link** to a web address, and **Link a document** for one of the workspace's
  own (below).
- **Bulleted list**, **Numbered list** and **Quote**.
- **Table** - three rows of three cells to begin with, the first row a head;
  Tab moves to the next cell and makes a new row at the end.
- **Code block** - for commands, configuration and code. Its language is picked
  above it, which colours it, and **Copy** puts the code on the clipboard, so a
  command in a runbook is one click from a terminal. Tab indents inside it
  rather than leaving it.
- **Horizontal line** and **Page break**.
- **Pictures** - **Upload a picture** from a file, or **A picture from Orknux**
  from the workspace's Design pictures. A picture can also be pasted or dropped
  onto the page. Drag a picture's corner to make it wider or narrower; a caption
  goes under it.
- **Undo** and **Redo** (Ctrl+Z and Ctrl+Shift+Z; Preferences can change
  either). Everything an agent writes is a step undo goes back over too.

### Importing into a document

![The editor's Import menu open: Replace the document, or Insert at the caret](/screens/document-import.png)

**Import** in the editor's bar reads a file into the document that is open,
where the list's Import makes new documents. **Replace the document…** puts the
file's contents in place of everything on the pages; **Insert at the caret…**
puts them where the caret is. It reads the same formats and keeps the same
things as the list's import (see Bringing documents in, above).
What comes in is an ordinary change: **Undo** takes it back, and it is saved as
any change is - and the history marks the version it made as an **Import**.

**Dark page**, the moon in the bar, draws the sheets dark - dark paper, light
ink, and code, quotes, links and Find's marks in colours of their own. It is
yours alone and remembered in your browser; the document and every export stay
the white page.

### Selecting words

Select some words and a small bar appears over them:

- **Highlight** marks them and opens a note to write on them - a reason, a
  question for whoever wrote it, a source. A highlight is part of the document
  and saved with it; hover it to read its note, and its card offers **Remove
  highlight**. Typing at its edge writes ordinary text, as a word processor's
  comment does.
- **Explain** asks the chat model what the words mean as they are used in this
  document, and answers in the chat.
- **Summarise** asks for a summary of the part selected, in the chat.
- **Translate** puts the selection into English, Polish, German, French,
  Spanish, Italian, Portuguese, Dutch, Czech or Ukrainian. The translation is
  shown beside the words first, and **Replace** puts it in their place. The
  model is shown the text around the selection too, so a word is translated as
  it is meant here.

Explain, Summarise and Translate use the model chosen in the chat on the right,
and write nothing into the document on their own.

### The outline

Down the left of the pages, the **Outline** lists the document's headings; a
click goes to one, and the one you are reading is marked as you scroll.
**Highlights** under it lists every highlight with its note, to go through them
in order. **Mentions** and **Mentioned by** are the document's links in each
direction (below). Each section folds away, and **Hide the outline** folds the
whole column; both are remembered for you.

## A document's page

**Page**, in the bar, holds the document's own page settings:

- **Size** - A4, Letter, A5, Legal or A3. A new document starts on the
  workspace's choice (see the list above).
- **Orientation** - Portrait or Landscape.
- **Margins** - Normal, Narrow or Wide.
- **Language** - the language the document is written in, which is what grammar
  is checked in. **Your language** - the language you read Orknux in - until it
  is set.

The pages are drawn to these in the editor and in the view, and the PDF and ODT
exports are laid out on the same page.

## Suggestions while you type

![A sentence being typed in the handbook, and the model's suggestion for how it goes on drawn in grey after the caret](/screens/document-suggestion.png)

While you type, the editor can suggest how the sentence goes on: when the typing
pauses, the words a model would write next appear **in grey after the caret**.
**Tab** takes them; anything else you type carries on as if they were not there.

The suggestion comes from the workspace's **Completion Model**, chosen under
**Workspace Settings → Chat** - the same model that suggests words in the chat
composer. It is asked on every pause, so a small, fast model is the right
choice, and while the workspace has none chosen nothing is suggested. The model
is shown the document's title, the page you are on and the text around the
caret - how much is a limit under Admin → Settings → Limits.

**Auto-completion**, in the bar, switches the suggestions off and on for you. It
is on until you turn it off, and remembered for you.

## Grammar and spelling

![A misspelled word underlined in the handbook, with its card open: what is wrong, the replacement and Ignore](/screens/document-grammar.png)

A moment after the typing stops, the paragraphs you changed are checked for
grammar and spelling, and what is found is **underlined**. Click an underlined
word for its card: what is wrong, the replacements - a click puts one in - and
**Ignore**, which leaves it alone.

The check is made in the document's **Language** (see A document's
page, above): English or Polish. It is done by LanguageTool,
running inside the Orknux server, so the text goes nowhere else. The first check
in a language loads that language, which can take a few seconds; after that a
paragraph is checked in well under a second. An administrator may point the
installation at a LanguageTool server of their own instead, under Admin →
Settings. How long the typing pauses before a check, and the most text one check
takes, are limits there too.

**Grammar**, in the bar, switches the check off and on for you, and is
remembered.

## Links between documents

![The handbook's link to the P1 outage checklist, hovered: a card with its name, its catalog and how it begins](/screens/document-links.png)

A document can link to another of the workspace's documents - a handbook to its
checklist, a letter to the policy behind it. **Link a document** in the bar (the
**Documents** button) opens a list of the workspace's documents with a search;
pick one and a link to it is put in at the caret.

The link shows the other document's **current name**: rename the checklist and
every link to it says the new name, with nothing to edit. **Rest the pointer on
a link** and a card shows the document it points to - its name, "Document in"
its catalog, and how it begins - so you know where it goes before you follow it.

- **In the editor**, a plain click on a link puts the caret there, so it can be
  edited like any other words, and **Ctrl+click** opens the other document - the
  card says so. With a change not yet saved, it asks before it leaves.
- **In the view**, a single click opens it.

A link to a document that has since been deleted keeps the name it had, struck
through, and goes nowhere.

### Mentions and Mentioned by

![The P1 outage checklist in the editor: Mentioned by down the left names the Escalation handbook](/screens/document-mentioned-by.png)

Down the left of the editor, **Mentions** lists the documents this one links to,
and **Mentioned by** the documents that link to it. A click opens one. Mentioned
by is what tells you, before you change a checklist, which handbooks send their
readers to it.

**Deleting** a document that others mention - from the list, or with **Delete**
in the editor's bar - asks first and names the documents that mention it, each a
link that opens in a tab of its own, so you can look at what will break.

An agent writes a link in Markdown as `[the name](document:12)`, with the
document's number; a document's own address works too.

## View and Find

![The handbook in the view: clean pages with nothing that changes them](/screens/document-view.png)

**View**, in the bar - or the eye on the documents list - shows a document as
clean pages with nothing that changes it: no bar, no chat, no caret. It has an
address of its own, `/design/documents/<number>/view`, to send to anybody in the
workspace who needs to read it rather than edit it. Highlights show there with
their notes on hover; **Edit** goes back to the editor.

**Find** - Ctrl+F, the browser's own find key, which Preferences can change -
opens a bar over the pages in the editor and in the view. Every match is marked
across every page, the bar counts them ("2 of 7"), and Enter and Shift+Enter go
to the next and the previous. **Match case** and **Whole word** narrow it. In
the editor, **Replace** and **Replace all** change what was found.

## History

![The handbook's history down the right, and an earlier version open over the pages with what it changed marked](/screens/document-history.png)

**History** in the bar puts the document's versions down the right, in place of
the chat. Every save keeps the version it replaced, whichever way the save came:
the editor, the chat, an agent's tools, an import. Each version says who saved
it, when, and by which way - **Editor**, **Chat**, **Tools** or **Import** - and
how much it changed.

Click a version to open it over the pages, with what it changed marked: words
added and words taken out. **Restore this version** puts it back as a save of
its own - what is on the screen is saved first, so nothing you typed is lost, and
it asks before it does it. The newest version is marked **Current**; the oldest
the installation keeps is marked as such.

While several people edit at once, a version is kept once per visit rather than
on every automatic save, so the history reads as visits rather than keystrokes.

## Export

![The Export menu open over the handbook: PDF, Markdown, ODT and ODS, with what ODT gives on hover](/screens/document-export.png)

**Export** saves what is on the screen and downloads it in one of four formats.
Each says on hover what it holds:

- **PDF** - its pages, as they print, on the document's page size, orientation
  and margins.
- **Markdown** - its text, with its pictures beside it in a zip. Import reads
  this zip back.
- **ODT** - a text document for LibreOffice, Word or Google Docs, on the same
  page.
- **ODS** - each table in the document on a sheet of a spreadsheet, for when
  the table is the point.

An agent exports a document with `orknux_document_export`, which writes the same
file.

## Writing with an agent

![The chat beside the handbook, with the summary Summarise asked for](/screens/document-chat.png)

Down the right of the editor is a chat with a model of your choosing - the
**Model** picker above its box lists the workspace's chat models. Ask it to
write and it writes **into the document**, through the `orknux_*` document
tools: the page follows as each change is saved, and every change is one step
**Undo** goes back over. An empty chat offers a few starting points - **Draft a
brief**, **Meeting notes**, **Polish the writing**, **A short summary at the
top** - each one a request it fills in for you.

**Summarise**, in the bar, asks for a summary of the whole document **in the
chat**: the model is offered only the tools that read, and nothing is written.

Files go into the chat too: drop one on it, paste a picture, or pick one with
the paperclip. It waits in a chip above the box and goes with your next message
- a picture to the model as a picture, and a text file, a PDF, a CSV or a
workbook as its text. How much of a message's files a model reads is a limit
under Admin → Settings → Limits.

Agents elsewhere write documents too. Any agent with Orknux access holds the
document tools: list them, read one as Markdown with its outline, search them,
find words in one, export one, create one, write all or part of it, insert into
it, add a section, and add a picture. In Markdown a page break is
`<!-- pagebreak -->` and a picture `![alt](artifact:DESIGN-12 "caption")`.

**Quick actions** (Ctrl+Q) finds a document by its name and by any word in it,
with its catalog and the words around the match.

## Working on one together

![The handbook open by two people: Dana's avatar beside the name, and her pointer on the page](/screens/document-together.png)

Several people can have one document open at once. Beside its name the editor
shows **who else is there**, and each of them has a **pointer** on the page with
their name on it, so you can see what they are looking at.

**There is no Save button.** A change is saved a moment after you stop typing -
the pause is **Workflow Autosave** under **Admin → Settings**, the same one the
workflow editor waits - and everybody else's editor takes it in as it lands.
**Unsaved**, beside the name, shows while a change is waiting to go. Ctrl+S
saves at once, and leaving with a change not yet saved asks first.

When two people change the document in the same moment, the second save is not
lost: the editor takes in the first, **merges paragraph by paragraph**, and
sends the result. A paragraph only one of you changed takes that change. A
paragraph you **both** changed keeps both versions, theirs and then yours, so
neither person's words disappear - read it and keep the one you want. The caret
stays where it was when somebody else's save comes in.

An agent writing through the chat or its tools is one more person in this: its
saves arrive as everybody else's do.
