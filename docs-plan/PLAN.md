# Manual plan: everything since 1.1.0, in sections of its own

Issue #684. The audit beside this file (`AUDIT.md`) found 301 Added and Changed entries since 1.1.0,
of which 246 the manual never names, 47 it mentions in passing (several out of date) and 8 it gives a
section. Whole perspectives are missing: Design (Images, the image editor, Documents, Wireframes,
Videos), Explore (Diagrams, Research), Admin → Reports and Templates, Schedules, the desktop app.

The user's words: *"I WANT dedicated sections with proper screenshots. Don't be lazy, do it properly
and thoroughly."* So the rule for every writer is the same:

- **Every feature gets a section of its own**, a `##` or `###` heading named for what a person does
  with it ("Editing part of a picture", not "Magic edit support"). A mention inside somebody else's
  paragraph does not count.
- **Every section says**: what it is for and when you would reach for it; how to use it, step by step,
  in the order the screen presents it; every setting it has and what each does, with its default; and
  its limits - what it does not do, what is refused and why. The house style is the existing chapters'
  (read `04-models-and-agents.md` § Watchers for the register): plain prose, the reason behind a rule,
  no marketing, `**Bold**` for the words on the screen.
- **Every screen-shaped section gets a picture**, taken by the pipeline below and never by hand, of
  the real product holding real-looking demo content (Northwind Support). A picture shows the state
  the prose describes - the menu open, the hint hovered, the panel filled - not an empty page.
- **Check every claim against the product**, not against the changelog: open the page, read the
  component (`src/pages/...`), read the server's refusals. The changelog line (`CHANGELOG.md:<n>`) is
  where to start, not the source of truth.
- **Fix what is out of date** in the files you own (AUDIT.md § "Out of date where it does speak").

---

## How a writer works

Each group owns whole files, named below; nobody edits a file another group owns. The shared files
are touched only through the hooks made for this:

| What | Your file | Read by |
|---|---|---|
| Chapters | `src/docs/NN-<slug>.md` (the ones your group owns) | `DocsPage.tsx` - a new file appears on its own, ordered by its number, titled by its first `#` heading |
| Demo data | `scripts/seed/<group>.mjs`, exporting `async function seed(ctx)` | `seed-demo.mjs`, after its own seed, in file-name order |
| Pictures | `scripts/screens/<group>.mjs`, exporting `async function shots(ctx)` | `screenshots.mjs`, after its own list, in file-name order |
| Scripted model answers | `../scripts/screens-draw/<group>.mjs` (server repo), exporting `answer(asked, { textOf, parsed })` | `screens-draw.mjs`, the stand-in model, before its drawing script |
| Polish | `src/docs/NN-<slug>.pl.md` only if you write one; untranslated pages say so on their own | `DocsPage.tsx` |

Group file names: `a-design-media`, `b-design-docs`, `c-explore-chat`, `d-flow`, `e-ai-admin`
(the letter orders them).

### Seeding (`scripts/seed/<group>.mjs`)

```js
export async function seed(ctx) {
  const { gql, ws, log } = ctx;
  // ctx also holds: BASE, USER, WORKSPACE_NAME, workspace, signIn, provider, chatModel, imageModel,
  // writerModel, responder, summariser, newsletter, slack, flagship (the Slack workflow), task.
  const { createDocument: doc } = await gql(
    'mutation($input: CreateDocumentInput!) { createDocument(input: $input) { id } }',
    { input: { workspaceId: ws, name: 'Escalation handbook' } },
  );
  log(`document: ${doc.id}`);
}
```

- Make the state **through the API** (GraphQL, or the REST endpoints the page itself calls) wherever
  it can be made directly: a document's content, a diagram's nodes, a research's finished report, a
  wireframe's elements. Only go through a model where the picture is *of* a model working.
- Name everything so it reads as Northwind Support's real work; the capture finds it by name.
- A seed that throws stops the whole run, deliberately. Make it idempotent within a run (the workspace
  is rebuilt from nothing each time, so there is nothing to clean up).

### Pictures (`scripts/screens/<group>.mjs`)

```js
export async function shots(ctx) {
  const { ws, gql, find, waitForPicture } = ctx;
  // ctx also holds: BASE, USER, workspace, found (the core query's answer), byName, page, context,
  // browser, flagship, responder, fn, tool, skill, condition, run, task, provider, internal.
  const { documents } = await gql(`{ documents(workspaceId: ${ws}) { id name } }`);
  const handbook = documents.find((d) => d.name === 'Escalation handbook');
  return [
    handbook && {
      name: 'document-editor',                    // -> public/screens/document-editor.png
      path: `/workspace/${ws}/design/documents/${handbook.id}`,
      waitFor: '[data-testid="document-paper"]',  // the content, not the frame
      viewport: { width: 1440, height: 900 },     // optional; 1440x900 at 2x is the default
      prepare: async (page) => { /* open the menu, hover the hint, select the node */ },
    },
  ];
}
```

- A shot is `{ name, path, waitFor?, viewport?, prepare?(page), editor?, select?, redact? }`, the same
  shape as the core list in `screenshots.mjs` (read the loop there for what each does). Return `null`
  for a shot whose data is missing; the run reports it rather than failing silently.
- A shot named like a core one (`chat`, `workflows`, ...) **replaces** it: that is how a chapter retakes
  a picture it rewrote the page around. Say so in your report.
- `prepare` is where the state is set: open the menu, hover the (?), select the node, type into the
  box. End it with a short wait for animations (`page.waitForTimeout(300)`).
- In the chapter: `![What the picture shows, in a sentence](/screens/<name>.png)`, placed beside the
  paragraph it illustrates.

### Scripted answers (`../scripts/screens-draw/<group>.mjs`)

No model on the LAN may be used, and there may be no model on the machine at all, so the installation
being photographed talks to `screens-draw.mjs`, a stand-in. Where a picture needs a model's answer -
a plan in plan mode, an agent changing a diagram, a research report being written - teach the stand-in
that conversation:

```js
export function answer(asked, { textOf, parsed }) {
  const last = textOf(asked.messages.at(-1)?.content ?? '');
  if (!/escalation flowchart/i.test(last)) return null;          // not mine: pass
  const tools = (asked.tools ?? []).map((t) => t.function?.name);
  if (tools.includes('orknux_change_diagram')) {
    return { call: { name: 'orknux_change_diagram', arguments: { /* ... */ } } };
  }
  return { text: 'Done: the escalation path now has a decision for P1 outages.' };
}
```

Match on something only your conversation says, so you never answer another group's.

### Taking only your pictures

From **PowerShell** in your worktree (never Git Bash: MSYS rewrites the paths, see AGENTS.md), on your
group's lane so you never meet another run:

```powershell
.\scripts\screenshots.ps1 -Lane <n> -Only 'document-editor,document-view' `
    -Endpoint "http://localhost:<8299+10n>" -Model writer -ProviderType LLAMA_CPP
```

| Group | Lane | Server | Interface | Stand-in (`-Endpoint`) | Directory | Temporal | Compose project |
|---|---|---|---|---|---|---|---|
| A design media | 1 | 8191 | 5209 | 8309 | 3909 | 7309 | orknux-screens-1 |
| B design docs | 2 | 8201 | 5219 | 8319 | 3919 | 7319 | orknux-screens-2 |
| C explore & chat | 3 | 8211 | 5229 | 8329 | 3929 | 7329 | orknux-screens-3 |
| D flow | 4 | 8221 | 5239 | 8339 | 3939 | 7339 | orknux-screens-4 |
| E AI & admin | 5 | 8231 | 5249 | 8349 | 3949 | 7349 | orknux-screens-5 |

- The first run in a lane builds the jar (unless `-SkipBuild`) and installs the interface's
  dependencies and a browser into that lane's own volumes - a few minutes; later runs reuse them.
- `-Endpoint http://localhost:<stand-in>` with `-Model writer -ProviderType LLAMA_CPP` makes the
  stand-in every agent's chat model. That is the only model a run may use.
- The seed always runs whole (every group's seed file); `-Only` narrows the capture.
- `-KeepData` leaves the installation's SQLite file and logs, to work out why a picture is wrong.
- Each run starts Temporal on an empty database: the script removes the lane's
  `orknux-screens-<n>_postgres-data` volume before it starts the containers. A kept one held the
  last run's task numbers as workflow ids, and the seed's first task was refused with
  `WorkflowExecutionAlreadyStarted` on every second run in a lane.
- **Do not pipe it through `2>&1`.** Windows PowerShell turns docker's progress lines on stderr into
  error records, and the script stops on the first one. Run it at a prompt, or with
  `Start-Process powershell -ArgumentList '-File','scripts\screenshots.ps1',... -RedirectStandardOutput a.log -RedirectStandardError b.log`.
- **Another session may already hold a port** (a developer's Vite on 5199 stopped lane 0 during the
  proof). The script checks every port before it builds and names the parameter to change; pass that
  one, or take a free lane number above 5.
- In a worktree, `orknux-ui` must be a real checkout (clone the main `orknux-ui` into it): the `ui`
  container mounts `../orknux-ui` and the pictures land there.
- **Look at every picture you take** (open the PNG) before committing it. A picture of a spinner, an
  error, an empty list or another group's half-finished data is not a picture.
- It never touches the development server on 8180, never `./mvnw install`, never a LAN host.

### Committing

Interface first (`git -C orknux-ui add <your paths>`, commit), then the server repository for any
`scripts/screens-draw/<group>.mjs`, with the pin moved. Explicit paths only. Pictures are committed
with the chapter that uses them. No `Co-Authored-By` trailer.

---

## Target structure

Existing files keep their numbers (a page's address is its name without the number, so nothing that
links to `/docs/workflows` moves). New chapters take 10-17, and the command line moves to the end:
`09-cli.md` becomes `19-cli.md` (group D does the rename; its address `/docs/cli` is unchanged).

```
01-getting-started.md      D   (rewritten tour of the top bar)
02-workflows.md            D
03-triggers.md             D
04-models-and-agents.md    E
05-variables.md            D
06-chat.md                 C
07-issues.md               D
08-administration.md       E
10-images.md               A   NEW  Design > Images and the image editor
11-videos.md               A   NEW  Design > Videos
12-documents.md            B   NEW  Design > Documents
13-wireframes.md           B   NEW  Design > Wireframes
14-diagrams.md             B   NEW  Explore > Diagrams
15-research.md             C   NEW  Explore > Research
16-reports.md              E   NEW  Admin > Reports, usage, cost and ratings
17-desktop.md              A   NEW  Orknux on the desktop
19-cli.md                  D   (renamed from 09-cli.md, unchanged)
```

Working together on one item (presence, pointers, autosave, merged saves) is explained once per
editor, in the editor's own chapter - workflows (D), documents, wireframes and diagrams (B) - because
a reader opens the chapter of the editor they are in. Each says the same rule in its own terms.

---

## Group A - Design media (lane 1): `10-images.md`, `11-videos.md`, `17-desktop.md`

39 changelog entries, 22 sections. Files: `scripts/seed/a-design-media.mjs`, `scripts/screens/a-design-media.mjs`,
`../scripts/screens-draw/a-design-media.mjs`.

### 10-images.md - "Images"

| Section | Must explain | CHANGELOG |
|---|---|---|
| Design, and what it holds | The Design perspective in the top bar; Images, Documents, Wireframes, Videos; what each is for; where pictures come from (a chat, a run, a task, drawn here) | 443, 447 |
| The Images page | the list, its filters and search, numbering of pictures, a picture's own page; Open in Design from a chat/run/artifact | 443, 369, 447 |
| Drawing a picture | New picture: the prompt, size, model, **negative prompt**, the longest prompt setting; the progress line (time taken, time left where known); stopping one waiting or being drawn | 135, 107, 358, 449, 456 |
| The image editor | layout (canvas, tools, layers panel), opening a picture into it, import a file / drop / paste, **Import from Orknux**, export | 444, 405, 137 |
| Changes are a draft | draft until Save, what Save writes, discarding | 446 |
| Editing part of a picture: Magic edit | select a region, say what to change, **feather**, what the model receives (mask), the provider setting for masks | 445, 146 |
| Layers | add, order, hide, merge, opacity - whatever the panel offers | 144 |
| Crop, rotate and mirror | each tool, its handles, keyboard | 138, 136 |
| Brush and brush tips | colour, size, hardness, the tips | 139, 140 |
| Blur: selective and gradual | both tools, the difference | 142, 143 |
| Clean up and Harmonize | what each asks the model to do, when to use which | 145, 357 |
| Upscale | through a Stable Diffusion WebUI or stable-diffusion.cpp; 2×/4×; what it costs | 404 |
| Shortcuts | the table of tool keys, and that they are set in Preferences if they are | 141 |
| Image models and providers | the stable-diffusion.cpp provider type, OpenAI-compatible image servers saved as it, the picture's description length, which model draws what | 448, 455 |

Pictures (all at 1440×900 unless said):

| File | Route | State |
|---|---|---|
| `images.png` | `/workspace/:ws/design/images` | 8-12 seeded pictures, numbered, one being drawn (progress line visible) |
| `image-new.png` | `/design/images/new` | prompt and a negative prompt typed, size chosen, model picker open or set |
| `image-editor.png` | `/design/images/:id/edit` | a picture open, layers panel with 2-3 layers, a tool selected |
| `image-magic-edit.png` | `.../edit` | a region selected with a feathered edge, the instruction typed, before Apply |
| `image-layers.png` | `.../edit` | layers panel close up: hidden layer, reordered, opacity |
| `image-crop.png` | `.../edit` | crop handles on, rotate/mirror buttons visible |
| `image-brush.png` | `.../edit` | brush tool with the tips picker open |
| `image-blur.png` | `.../edit` | selective blur region and the gradual blur control |
| `image-upscale.png` | `.../edit` or the picture page | the upscale choice open (2×/4×) |
| `image-shortcuts.png` | `.../edit` | the shortcuts list or tooltip showing tool keys |
| `model-provider-images.png` | `/models/providers/:id` | a stable-diffusion.cpp provider's page |

Seed: a provider of the stable-diffusion.cpp type pointed at the stand-in (it answers
`/images/generations`), 8-12 drawn pictures with real-sounding prompts (Northwind's newsletter
banners, a product photo), one picture with layers saved.

### 11-videos.md - "Videos"

| Section | Must explain | CHANGELOG |
|---|---|---|
| Making a video | the Videos page, New video, prompt, model, length, the progress line and time left | 105, 106 |
| A finished video | its page, playback, **Upscale**, **Export** as GIF, MP4 or MKV | 108, 109 |
| Videos in a chat | a video an agent made, played in the thread | 127 |

Pictures: `videos.png` (list with one in progress), `video-new.png`, `video.png` (a finished video's
page with Upscale and Export visible). If the stand-in cannot answer a video API, add that to
`screens-draw/a-design-media.mjs` (a short generated GIF/MP4 is enough) rather than skipping the
pictures.

### 17-desktop.md - "Orknux on the desktop"

| Section | Must explain | CHANGELOG |
|---|---|---|
| Installing it | Windows and Linux packages, where they come from (the GitHub release), what is inside (orknux-one) | 463 |
| A fresh installation | it starts with a workspace; the administrator; where its data lives | 465 |
| Tabs and windows | tabs, new windows, your own tab keys | 130, 131 |
| Network access | Admin › Settings: whether others on the network may reach it | 464 |
| Uploads and start-up | 500 MB uploads; start-up time; what to do when it will not start | 172, 190 |

Pictures: the desktop app itself cannot be photographed by this pipeline. Photograph what is the
product's: `admin-settings-network.png` (`/admin/settings`, scrolled to the desktop network access
switch). Describe the window chrome in words; do not fake a screenshot of it.

---

## Group B - Design documents and diagrams (lane 2): `12-documents.md`, `13-wireframes.md`, `14-diagrams.md`

39 changelog entries, 21 sections, all three editors. Files: `scripts/seed/b-design-docs.mjs`, `scripts/screens/b-design-docs.mjs`,
`../scripts/screens-draw/b-design-docs.mjs`.

### 12-documents.md - "Documents"

| Section | Must explain | CHANGELOG |
|---|---|---|
| The documents list | catalogs, search, page size for new documents, New document, **Import** (several files: PDF, Markdown, ODT, DOCX, HTML, text), what an import keeps (tables, lists, merged cells) | 84, 79, 80, 81, 27 |
| Writing | the page editor (writes in pages), headings, lists, tables, **code blocks** with copy, colour, highlights with notes, the outline | 85, 92, 93 |
| A document's page | page size, margins, orientation, language; dark page | 91, 78 |
| Suggestions while you type | sentence completion: what it is, accepting, switching off, which model | 86 |
| Grammar and spelling | English and Polish, how it marks, how to accept | 90 |
| Links between documents | the Documents button, current names, Ctrl+click / click in View, **Mentions** and **Mentioned by**, the hover card, deleting a mentioned document | 26 |
| View and Find | View, highlights' notes in View, Find | 87, 162 |
| History | versions, restore | 163 |
| Export | PDF, Markdown, ODT, ODS; what each keeps | 94 |
| Writing with an agent | the chat beside the editor: files in it, what agents may do, an agent writing documents, Quick actions finding a document | 89, 103, 88 |
| Working on one together | presence, pointers, saving as it goes (Workflow Autosave), a paragraph changed on both sides keeps both | 22 |

Pictures: `documents.png` (list with catalogs and several documents), `document-import.png` (Import
with several files chosen), `document-editor.png` (a real document mid-page: headings, a table, a code
block, a highlight with its note), `document-suggestion.png` (completion offered in grey),
`document-grammar.png` (a marked word with its suggestion), `document-links.png` (a document link
hovered: the card; Mentions and Mentioned by in the side panel), `document-view.png`,
`document-history.png`, `document-export.png` (the export menu open), `document-chat.png` (the chat
beside the editor with an agent's answer), `document-together.png` (a second person's pointer and
avatar - sign in a second context as `dana` inside `prepare` and open the same document).

### 13-wireframes.md - "Wireframes"

| Section | Must explain | CHANGELOG |
|---|---|---|
| The wireframe editor | frames as screens, elements (button, input, checkbox, radio, switch, image, text, note, arrow, line), styles, Import | 132, 82 |
| Drawing with an agent | the chat beside it, `orknux_*` wireframe tools, a wireframe drawn in a chat shown in the chat | 149 |
| Export | HTML, SVG, PNG - what each holds; the HTML export's screens | 102 |
| Working on one together | as documents, merged by element | 22 |

Pictures: `wireframes.png`, `wireframe-editor.png` (two frames side by side, an element selected),
`wireframe-chat.png`, `wireframe-export.png`.

### 14-diagrams.md - "Diagrams"

| Section | Must explain | CHANGELOG |
|---|---|---|
| Explore, and Diagrams in it | the list, what a diagram is for (systems, flows, teams) | 153 |
| The diagram editor | shapes on the toolbar and under **More shapes** (flowchart and UML), lines and their styles, labels typed where drawn, notes on nodes (5000 characters), groups, Arrange, drag-sizing the panel and the chat split | 28, 160, 154, 29, 275, 271 |
| A diagram's details | description, the settings page, what agents may do (Read only / Read and change) | 159, 161, 156 |
| Drawing with an agent | the chat beside it, suggestions, agents sent to diagrams, the diagram tools, Quick actions finding a diagram and a node | 155, 157, 158 |
| Export | PNG at 1×, 2×, 3×; SVG; Mermaid; PDF | 77 |
| Working on one together | as documents, merged by shape | 22 |

Pictures: `diagrams.png`, `diagram-editor.png` (a Northwind architecture diagram with database, actor,
component shapes and a group, one node selected with its notes), `diagram-more-shapes.png` (the More
shapes menu open), `diagram-settings.png`, `diagram-chat.png` (an agent's answer and the change it made),
`diagram-export.png`.

---

## Group C - Explore research and chat (lane 3): `15-research.md`, `06-chat.md`

42 changelog entries, 16 sections (the chat ones dense). Files: `scripts/seed/c-explore-chat.mjs`, `scripts/screens/c-explore-chat.mjs`,
`../scripts/screens-draw/c-explore-chat.mjs`.

### 15-research.md - "Research"

| Section | Must explain | CHANGELOG |
|---|---|---|
| What a research is | a question researched by the workspace's own workflows; Explore › Research | 111 |
| Starting one | New research: question, **mode** (Shallow and deeper; Add mode), the Planner, Writer and Reviewer **agents**, web search (and the search key it needs), images, Review, follow-up questions, websites to keep to or avoid, documents, language, output - the (?) beside each | 40, 112, 113, 97, 178 |
| Watching it run | its page: the steps strip, the work as it goes, time left, Refresh and Auto, the sessions each step talked in | 114, 152, 34, 33 |
| The report | where it is saved, images in it, reviewing it before it is saved | 97, 113 |
| When it fails, and restarting | retries, a restart picking up where it stopped, re-running its run | 151, 208, 209, 210 |
| Follow-up questions | suggestions after it finishes, starting one | 96 |
| Modes are workflows | the five steps, editing a mode's workflow, retries per step | 179, 207, 208 |
| Asking an agent to research | the start-research tool, Shallow unless asked | 40 |

Pictures: `research.png` (the list with a finished and a running research), `research-new.png` (the
form filled, one (?) open), `research-running.png` (the steps strip mid-way with time left and the
Sessions line), `research-report.png` (a finished report with follow-up questions under it),
`research-mode.png` (a mode's workflow in the editor).
Seed: a finished research with its report saved through the API if it can be; otherwise script the
stand-in (`screens-draw/c-explore-chat.mjs`) to plan, write and review it. Web search needs a search
key: seed a dummy one and keep "Use web search" off for the finished one, or stub it.

### 06-chat.md - additions to the existing chapter

| Section | Must explain | CHANGELOG |
|---|---|---|
| Plan and Auto | the mode switch in the composer: what plan mode offers, presenting a plan for approval, auto mode | 101 |
| Suggestions while you type, and suggested replies | sentence completion in the composer; suggested replies under an answer | 122, 123 |
| What an answer can hold | LaTeX maths, code blocks with Copy, **Run** on shell blocks, sound and MIDI that play, videos, a wireframe or diagram drawn in the chat, links to the run/issue a tool call named | 473, 104, 110, 99, 128, 129, 127, 149, 30 |
| The conversation list | unread answers, drag wider, a new chat opened by itself, naming every N exchanges, search | 467, 471, 472, 418 |
| Times, dates, cost and you | message time with its date by default, answer cost on by default, your avatar (Preferences), tool call times | 39, 38, 24, 409 |
| Attachments | dropping files, what reaches the agent, sheets and SVGs it reads | 469, 468 |
| Voice: speed | the reading speed picker | 25 |
| Reviews | a review the agent sent, taken back | 267, 274 |

Fix: Answer Cost (06:96) and naming (06:102). Retake `chat.png` only if the page changed.
Pictures: `chat-plan.png` (plan mode with a plan awaiting approval), `chat-completion.png`,
`chat-suggested-replies.png`, `chat-rich.png` (maths, a code block with Copy and Run, a sound player),
`chat-item-link.png`, `chat-list.png` (unread markers), `voice-speed.png` (voice panel with the speed
picker open).

---

## Group D - Flow and the tour (lane 4): `01-getting-started.md`, `02-workflows.md`, `03-triggers.md`, `05-variables.md`, `07-issues.md`, rename `09-cli.md` → `19-cli.md`

45 changelog entries, 15 sections plus three chapters' smaller ones. Files: `scripts/seed/d-flow.mjs`, `scripts/screens/d-flow.mjs`,
`../scripts/screens-draw/d-flow.mjs`.

### 01-getting-started.md

| Section | Must explain | CHANGELOG |
|---|---|---|
| The top bar | rewrite: AI, Chat, Design, Explore, Flow, Workspace (`TOP_SECTIONS`, navigation.ts:82) - what each opens; Docs, Admin, bell, your name | 453, 484, 187 |
| Finding things | Quick actions also finds documents, diagrams and a diagram's nodes | 88, 158 |
| Your own preferences | accent (including Magic), Answer Cost, Avatar in Chat, Time Zone, shortcuts | 176, 38, 24 |
| What is where | a short map pointing at each new chapter (10-17) | - |

Pictures: retake `command-palette.png` with a document and a diagram node in the results;
`preferences.png` retaken showing the accent swatches and the chat switches.

### 02-workflows.md

| Section | Must explain | CHANGELOG |
|---|---|---|
| Working on a workflow together | presence, pointers, saving as it goes, refused-and-merged saves | 262, 272 |
| Selecting several nodes | Shift+click, rectangle select | 560, 518 |
| Cut, copy and paste | between workflows too | 298 |
| Adding a node | the Add menu at the pointer, arrow keys, type filters, quick filters in pickers, what plugins bring | 519, 521, 559, 561 |
| Node shapes | the shapes a node can take, decisions as ovals | 299, 275 |
| The Workflow node | running another workflow, what it passes and gets back | 297 |
| Placeholders | **replace** the "no placeholders" paragraph (02:407): placeholders in written values, workspace variables inside them, a field that reads a variable links to it, clearing a reference | 401, 300, 266, 305 |
| Objects in depth | an object inside a property, the tree, Object Depth, the field picker's whole-object row | 517, 520, 525 |
| An agent node's own settings | its model, reasoning effort, Progress messages (None to High), Output streaming, Times it runs | 116, 31, 359, 360, 32 |
| What a component depends on | the dependency graph, Used by on a workflow | 258, 259 |
| A run, read closely | a step's parameters, a run of an older version, `orknux.log` lines, Output streaming shown | 402, 403, 206, 23 |
| Conditions naming a field | a written value that names a field | 180 |

Pictures: `workflow-together.png` (two people's pointers and avatars), `workflow-add-menu.png`,
`workflow-select.png` (a rectangle selection), `workflow-node-shapes.png`, `workflow-node.png` (a
Workflow node selected), `agent-node.png` (an agent node's panel showing model, effort, progress
messages, streaming, Times it runs), `dependency-graph.png`, `execution-parameters.png` (a run step's
Parameters with Output streaming).

### 03-triggers.md, 05-variables.md, 07-issues.md

Triggers: a run begins only at a trigger, the log line "<trigger> fired with", webhook refusals as 404
(CHANGELOG 415, 422, 197). Variables: moving to another catalog, reading a secret back takes a role, the web
search key is a secret field (CHANGELOG 304, 315, 211). Issues: models are no longer assignees (CHANGELOG 326). Sections, not
sentences, where the feature has a screen (`variables-move.png` for the move dialog).

---

## Group E - AI and administration (lane 5): `04-models-and-agents.md`, `08-administration.md`, `16-reports.md`

70 changelog entries, 25 sections, most of them settings and rules that need a precise paragraph
each rather than a new screen. Files: `scripts/seed/e-ai-admin.mjs`, `scripts/screens/e-ai-admin.mjs`,
`../scripts/screens-draw/e-ai-admin.mjs`.

### 04-models-and-agents.md

| Section | Must explain | CHANGELOG |
|---|---|---|
| A model's speed | its speed figures, the chart over time (minute to year) | 76, 133 |
| Prices, and what is cached | input, output, cached input, cache writes; where prices are edited | 362, 306, 378, 411 |
| Templates | models, connections and MCP servers as templates; Use a template; leaving out the model | 301, 125, 368, 325 |
| Moving models between workspaces | export and import models and a provider | 406, 148 |
| An agent's settings page | the side menu, Add a model, a model that chats, Progress messages, Tool Rounds per workspace | 480, 481, 419, 359, 361 |
| Agents that ask with options | a question with options in a chat, answering it | 260 |
| Ratings and reviews | session ratings, chat reviews, taking a review back | 294, 316, 267 |
| An agent managing agents | reading, making and configuring agents; the Building workflows skill; agents sent to diagrams | 399, 408, 157 |
| Connections an agent may ask for | asking for a connection, granted to every new agent | 365, 407 |
| Reading what it cannot read whole | `svg_read`, `sheet_read` (CSV, xlsx, xls, ods), asking about a large file, a picture at an address, drawing for its own eyes, the manual | 118, 119, 150, 95, 164, 171, 364 |
| Music | composing, MIDI, playing it to you | 98 |
| A box on request | an agent asking for a box; Box Code Reading | 117, 366 |
| Schedules | the Schedules page and what is on it | 398 |
| The tools an agent starts with | **fix** 04:675 and 04:802: Offer by default for specialised tools, Orknux access on, box tools Offer/Always | 200, 199, 201, 202, 489 |

Pictures: `model-speed.png` (a model page with the speed chart), `model-prices.png`,
`templates.png` (`/admin/templates`), `use-template.png` (the Use a template dialog),
`agent-settings-menu.png` (an agent's settings with the side menu), `chat-options.png` (an agent's
question with options), `session-rating.png`, `schedules.png`.

### 08-administration.md

| Section | Must explain | CHANGELOG |
|---|---|---|
| Workspace members and sharing | members, sharing a workspace, who changes its settings | 516, 296, 530 |
| Copying a workspace | what it asks, what it takes | 303 |
| Bulk import | importing many components at once | 302 |
| Users | last sign-in, a row opens the user, read-only access tokens, tokens as a table, a token cannot make a token, a password change ends other sessions | 307, 524, 544, 548, 195, 196 |
| Limits | the Limits heading in Admin Settings, the upload limit, every number a behaviour depends on | 120, 166 |
| Security defaults | cookies (`ORKNUX_SESSION_COOKIE_*`), CSP, cross-site writes, cloud metadata addresses, package integrity, a workflow naming another workspace's parts | 126, 192, 193, 194, 198, 205 |
| The installation's address | `app_link`, the address in Admin › Settings | 400 |

Pictures: `workspace-members.png`, `admin-settings-limits.png`, `users.png` retaken if the columns
changed.

### 16-reports.md - "Reports"

| Section | Must explain | CHANGELOG |
|---|---|---|
| Tokens by person | Admin › Reports: who prompted what, search, sort, CSV | 515, 522, 265 |
| Usage over time | sessions and model calls per day, the charts | 311, 363 |
| The Errors report | what it lists, sorting its columns | 295, 264 |
| What a conversation cost | session cost, Answer Cost, ratings | 38, 294 |

Pictures: `reports-tokens.png`, `reports-usage.png`, `reports-errors.png`. Seed enough runs, sessions
and a few failures that the charts and the Errors report have shape (several days: write the rows
through the API where it allows a date, otherwise run things in the seed).

---

## After the five groups (phase 3, the coordinator)

1. Merge the five branches; resolve nothing by hand in a chapter file (no two groups share one).
2. One full run on lane 0, every picture, and look at each.
3. Re-run `docs-plan/tools/audit.py` and `judge.py` with the new rules each group adds to `judge.py`
   for what it covered, and expect `none` to be near zero for Added entries.
4. Read every new chapter against the product once more.
