# Manual audit: 1.1.0 to Unreleased

Issue #684. Every **Added** and **Changed** entry in `CHANGELOG.md` from `## 1.1.0` up to and including
`## Unreleased`, and how the manual (`src/docs/*.md`) covers it today. **Fixed** entries are left out: they
restore what the manual already says, and the ones that change behaviour are folded into the sections below.

How it was judged: every entry starts as *none*. It is raised to *mention* or *section* only where the
manual was read and the line that covers it is quoted. A *section* is a heading of its own about the
feature; a *mention* is a sentence or a paragraph somewhere else, often out of date (said so where it is).
The term search `audit.py` ran first matched "how long" and "says so" everywhere and is not a verdict.

**301 entries**: 246 none, 47 mention, 8 section.

| Area | Entries | None | Mention | Section |
|---|---:|---:|---:|---:|
| Design - Images and the image editor | 27 | 27 | 0 | 0 |
| Design - Documents | 20 | 19 | 1 | 0 |
| Design - Wireframes | 4 | 3 | 1 | 0 |
| Design - Videos | 4 | 4 | 0 | 0 |
| Explore - Diagrams | 15 | 14 | 1 | 0 |
| Explore - Research | 17 | 16 | 1 | 0 |
| Desktop app | 6 | 6 | 0 | 0 |
| Reports and usage | 10 | 10 | 0 | 0 |
| Templates, sharing and workspaces | 11 | 10 | 1 | 0 |
| Chat | 39 | 28 | 9 | 2 |
| Workflows and runs | 41 | 36 | 4 | 1 |
| Agents, tools and sessions | 52 | 30 | 18 | 4 |
| Models and providers | 16 | 12 | 4 | 0 |
| Administration and security | 39 | 31 | 7 | 1 |

## Pages the manual never names

Read off `src/navigation.ts` against the nine chapters:

- `/design/images`, `/design/images/:id/edit` - the Images page and the image editor (1.1.4 onward)
- `/design/documents`, `/design/documents/:id`, `/design/documents/:id/view` - documents (1.2.0)
- `/design/wireframes`, `/design/wireframes/:id` - the wireframe editor (1.2.0; only its agent tools are named, 04:829)
- `/design/videos`, `/design/videos/:id`, `/design/videos/new` - videos (1.2.0)
- `/explore/diagrams`, `/explore/diagrams/:id`, `/explore/diagrams/:id/settings` - diagrams (1.2.0)
- `/explore/research`, `/explore/research/:id` - research (1.2.0; one line in 01:116)
- `/schedules` - the Schedules page (1.1.5)
- `/admin/reports` - Reports: tokens by person, usage charts, the Errors report (1.1.2, 1.1.6, 1.1.8, 1.1.9)
- `/admin/templates`, `/admin/templates/:id` - templates of models, connections and MCP servers (1.1.8, 1.2.0)
- The desktop app (1.1.3, 1.2.0) - no page of its own, and no word in the manual beyond `orknux-one`

And one that is named wrongly: `01-getting-started.md:110` lists the top bar as AI, Explore, Workflow, Workspace and Chat.
The product draws AI, Chat, Design, Explore, Flow and Workspace (`TOP_SECTIONS`, navigation.ts:82).

## Out of date where it does speak

- `02-workflows.md:407` says *"There are no placeholders and no template syntax"*: 1.1.5 added placeholders in any written node value, 1.1.8 workspace variables inside them.
- `04-models-and-agents.md:675` says every built-in starts *on and Always*: since 1.2.0 a new agent starts most specialised tools at Offer.
- `04-models-and-agents.md:802` says Orknux access is *off for every agent*: since 1.1.3 new agents start with it on.
- `04-models-and-agents.md:148` gives 128/256 tools per request: 1.1.8 made it 200 by default.
- `06-chat.md:96` describes Answer Cost as something you turn on: since 1.2.3 (Unreleased) it is on for everybody.
- `06-chat.md:102` says a chat is named from its first words; 1.1.5 renames it every N exchanges.

## Every entry, by area

### Design - Images and the image editor (27)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | A picture being drawn in the image editor says how long it has taken and how long is left, where anything knows (CHANGELOG.md:107) | none |  |
| 1.2.0 | Added | Upscale a finished video (CHANGELOG.md:108) | none |  |
| 1.2.0 | Added | Negative prompts for pictures (CHANGELOG.md:135) | none |  |
| 1.2.0 | Added | Rotate and mirror in the image editor (CHANGELOG.md:136) | none |  |
| 1.2.0 | Added | Import a picture from Orknux in the image editor (CHANGELOG.md:137) | none |  |
| 1.2.0 | Added | Crop in the image editor (CHANGELOG.md:138) | none |  |
| 1.2.0 | Added | A brush in the image editor (CHANGELOG.md:139) | none |  |
| 1.2.0 | Added | Brush tips in the image editor (CHANGELOG.md:140) | none |  |
| 1.2.0 | Added | Shortcuts for the image editor's tools (CHANGELOG.md:141) | none |  |
| 1.2.0 | Added | Selective blur in the image editor (CHANGELOG.md:142) | none |  |
| 1.2.0 | Added | Gradual blur in the image editor (CHANGELOG.md:143) | none |  |
| 1.2.0 | Added | Layers in the image editor (CHANGELOG.md:144) | none |  |
| 1.2.0 | Added | Clean up in the image editor (CHANGELOG.md:145) | none |  |
| 1.2.0 | Added | Feather for the Magic edit (CHANGELOG.md:146) | none |  |
| 1.1.6 | Added | Harmonize in the image editor (CHANGELOG.md:357) | none |  |
| 1.1.6 | Added | A picture waiting or being drawn in Design can be stopped (CHANGELOG.md:358) | none |  |
| 1.1.6 | Added | The image editor numbers its pictures (CHANGELOG.md:369) | none |  |
| 1.1.5 | Added | Upscaling through a Stable Diffusion WebUI (CHANGELOG.md:404) | none |  |
| 1.1.5 | Added | Pictures imported, dropped or pasted into the image editor, and exported (CHANGELOG.md:405) | none |  |
| 1.1.4 | Added | Design, a new section with an Images page (CHANGELOG.md:443) | none |  |
| 1.1.4 | Added | An image editor (CHANGELOG.md:444) | none |  |
| 1.1.4 | Added | Magic edit: select part of a picture and say what to change (CHANGELOG.md:445) | none |  |
| 1.1.4 | Added | Changes are a draft until saved (CHANGELOG.md:446) | none |  |
| 1.1.4 | Added | Open in Design (CHANGELOG.md:447) | none |  |
| 1.1.4 | Added | A stable-diffusion.cpp provider type (CHANGELOG.md:448) | none |  |
| 1.1.4 | Added | Longest image prompt (CHANGELOG.md:449) | none |  |
| 1.1.4 | Changed | An OpenAI provider whose server is stable-diffusion.cpp's is saved as that type (CHANGELOG.md:455) | none |  |

### Design - Documents (20)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | Diagrams, documents and wireframes can be worked on together, as workflows can (CHANGELOG.md:22) | none |  |
| Unreleased | Added | A document can link to another (CHANGELOG.md:26) | none |  |
| Unreleased | Added | The documents list imports several files at once (CHANGELOG.md:27) | none |  |
| 1.2.0 | Added | A dark page in the document editor (CHANGELOG.md:78) | none |  |
| 1.2.0 | Added | Import in the document editor (CHANGELOG.md:79) | none |  |
| 1.2.0 | Added | Documents in Design (CHANGELOG.md:84) | none |  |
| 1.2.0 | Added | The document editor writes in pages (CHANGELOG.md:85) | none |  |
| 1.2.0 | Added | While typing, the document editor suggests how the sentence goes on (CHANGELOG.md:86) | none |  |
| 1.2.0 | Added | A document's view, and Find (CHANGELOG.md:87) | none |  |
| 1.2.0 | Added | Quick actions finds documents (CHANGELOG.md:88) | mention | 01-getting-started.md:150 "Finding things" (documents and diagrams not named) |
| 1.2.0 | Added | Agents write documents (CHANGELOG.md:89) | none |  |
| 1.2.0 | Added | Grammar and spelling in documents, in English and Polish (CHANGELOG.md:90) | none |  |
| 1.2.0 | Added | A document's page is its own (CHANGELOG.md:91) | none |  |
| 1.2.0 | Added | Code blocks in documents (CHANGELOG.md:92) | none |  |
| 1.2.0 | Added | Colour, highlights with notes and an outline in documents (CHANGELOG.md:93) | none |  |
| 1.2.0 | Added | A document exports as PDF, Markdown, ODT or ODS (CHANGELOG.md:94) | none |  |
| 1.2.0 | Added | Files in the document, wireframe and diagram chats (CHANGELOG.md:103) | none |  |
| 1.2.0 | Added | `sheet_read` reads an OpenDocument spreadsheet (.ods) (CHANGELOG.md:150) | none |  |
| 1.2.0 | Added | A document's View shows its highlights' notes (CHANGELOG.md:162) | none |  |
| 1.2.0 | Added | A document has a history (CHANGELOG.md:163) | none |  |

### Design - Wireframes (4)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Import in the wireframe editor (CHANGELOG.md:82) | none |  |
| 1.2.0 | Added | A wireframe exports as HTML, SVG or PNG (CHANGELOG.md:102) | none |  |
| 1.2.0 | Added | Wireframes in Design (CHANGELOG.md:132) | mention | 04-models-and-agents.md:829 (the orknux_ wireframe tools only; the editor is not described) |
| 1.2.0 | Added | A wireframe an agent draws in a chat is shown in the chat (CHANGELOG.md:149) | none |  |

### Design - Videos (4)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Videos in Design (CHANGELOG.md:105) | none |  |
| 1.2.0 | Added | A video being made says how long it has taken and about how long is left (CHANGELOG.md:106) | none |  |
| 1.2.0 | Added | Export a video as GIF, MP4 or MKV (CHANGELOG.md:109) | none |  |
| 1.2.0 | Added | Videos in the chat (CHANGELOG.md:127) | none |  |

### Explore - Diagrams (15)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | Diagrams have flowchart and UML shapes (CHANGELOG.md:28) | none |  |
| Unreleased | Added | The diagram editor's panel can be dragged wider, and the line above its chat up or down (CHANGELOG.md:29) | none |  |
| 1.2.0 | Added | A diagram's PNG at 1×, 2× or 3× (CHANGELOG.md:77) | none |  |
| 1.2.0 | Added | Explore > Diagrams (CHANGELOG.md:153) | none |  |
| 1.2.0 | Added | A diagram's nodes carry notes, 5000 characters each by default (CHANGELOG.md:154) | none |  |
| 1.2.0 | Added | Agents read, search, draw and export diagrams (CHANGELOG.md:155) | none |  |
| 1.2.0 | Added | Each diagram says what agents may do with it: Read only, or Read and change (CHANGELOG.md:156) | none |  |
| 1.2.0 | Added | Agents are sent to the diagrams (CHANGELOG.md:157) | none |  |
| 1.2.0 | Added | Quick actions finds a diagram by its name and a node by its label (CHANGELOG.md:158) | mention | 01-getting-started.md:150 "Finding things" (documents and diagrams not named) |
| 1.2.0 | Added | A diagram has a description (CHANGELOG.md:159) | none |  |
| 1.2.0 | Added | A diagram's labels are typed over where they are drawn (CHANGELOG.md:160) | none |  |
| 1.2.0 | Added | A diagram's details have a page of their own (CHANGELOG.md:161) | none |  |
| 1.2.0 | Changed | Every agent with Orknux access is given the diagram tools at Always, and `orknux_delete_diagram` is hidden on every agent (CHANGELOG.md:177) | none |  |
| 1.1.9 | Changed | Diagrams look better by default (CHANGELOG.md:271) | none |  |
| 1.1.9 | Changed | Diagram decisions are ovals (CHANGELOG.md:275) | none |  |

### Explore - Research (17)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A research's Plan, Write and Review keep sessions you can open (CHANGELOG.md:33) | none |  |
| Unreleased | Changed | A research runs with agents, not a model (CHANGELOG.md:40) | none |  |
| 1.2.0 | Added | A finished research suggests what to research next (CHANGELOG.md:96) | none |  |
| 1.2.0 | Added | A research can be reviewed before it is saved (CHANGELOG.md:97) | none |  |
| 1.2.0 | Added | Explore > Research (CHANGELOG.md:111) | mention | 01-getting-started.md:116 (one line) |
| 1.2.0 | Added | A research always has its model, and may leave the web alone (CHANGELOG.md:112) | none |  |
| 1.2.0 | Added | A research can include images (CHANGELOG.md:113) | none |  |
| 1.2.0 | Added | A research has a page of its own (CHANGELOG.md:114) | none |  |
| 1.2.0 | Added | A research's steps say in the run's log what they did (CHANGELOG.md:115) | none |  |
| 1.2.0 | Added | A research restarts from where it stopped (CHANGELOG.md:151) | none |  |
| 1.2.0 | Added | A running research shows its work as it goes, and about how long is left (CHANGELOG.md:152) | none |  |
| 1.2.0 | Changed | A research looks for images unless told not to (CHANGELOG.md:178) | none |  |
| 1.2.0 | Changed | The research modes' workflows gain two nodes (CHANGELOG.md:179) | none |  |
| 1.2.0 | Changed | The research modes' steps are called Plan research, Gather sources, Deepen findings, Write report and Save report (CHANGELOG.md:207) | none |  |
| 1.2.0 | Changed | A research mode's steps are tried again when they fail in a way that could come out differently (CHANGELOG.md:208) | none |  |
| 1.2.0 | Changed | A research step cut short by a server restart is run again (CHANGELOG.md:209) | none |  |
| 1.2.0 | Changed | Re-running a research's run carries the research with it (CHANGELOG.md:210) | none |  |

### Desktop app (6)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Tabs in the desktop app (CHANGELOG.md:130) | none |  |
| 1.2.0 | Added | New windows and your own tab keys in the desktop app (CHANGELOG.md:131) | none |  |
| 1.2.0 | Changed | The desktop app accepts uploads of up to 500 MB (CHANGELOG.md:172) | none |  |
| 1.2.0 | Changed | The desktop app starts in about half the time (CHANGELOG.md:190) | none |  |
| 1.1.3 | Added | Orknux on the desktop, for Windows and Linux (CHANGELOG.md:463) | none |  |
| 1.1.3 | Added | Network access for the desktop app, in Admin › Settings (CHANGELOG.md:464) | none |  |

### Reports and usage (10)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.1.9 | Added | The Errors report's columns sort (CHANGELOG.md:264) | none |  |
| 1.1.9 | Added | Admin → Reports keeps the report in the address (CHANGELOG.md:265) | none |  |
| 1.1.8 | Added | Session ratings (CHANGELOG.md:294) | none |  |
| 1.1.8 | Added | An Errors report (CHANGELOG.md:295) | none |  |
| 1.1.8 | Added | The usage chart counts sessions and model calls per day (CHANGELOG.md:311) | none |  |
| 1.1.8 | Changed | Ratings and chat reviews are on by default (CHANGELOG.md:316) | none |  |
| 1.1.6 | Added | Charts on the usage report (CHANGELOG.md:363) | none |  |
| 1.1.6 | Changed | An asked agent's calls are booked in the usage report to whoever prompted the conversation that asked it (CHANGELOG.md:375) | none |  |
| 1.1.2 | Added | Admin > Reports: tokens by the person who prompted them (CHANGELOG.md:515) | none |  |
| 1.1.2 | Added | Reports can be searched by person, sorted by any column and exported as CSV (CHANGELOG.md:522) | none |  |

### Templates, sharing and workspaces (11)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Connections and MCP servers as templates (CHANGELOG.md:125) | none |  |
| 1.1.8 | Added | Workspace sharing (CHANGELOG.md:296) | none |  |
| 1.1.8 | Added | Workspace variables inside placeholders (CHANGELOG.md:300) | mention | 02-workflows.md:417 Workspace variables group (placeholders themselves denied at 02:407) |
| 1.1.8 | Added | Models as templates (CHANGELOG.md:301) | none |  |
| 1.1.8 | Added | Bulk import (CHANGELOG.md:302) | none |  |
| 1.1.8 | Added | Copying a workspace asks what to take (CHANGELOG.md:303) | none |  |
| 1.1.8 | Added | A variable, secret, skill or memory moves to another catalog (CHANGELOG.md:304) | none |  |
| 1.1.8 | Changed | Use a template offers only templates made from that page's kind (CHANGELOG.md:325) | none |  |
| 1.1.6 | Added | Use a template can leave an agent's model out (CHANGELOG.md:368) | none |  |
| 1.1.6 | Changed | Publishing a template closes its dialog (CHANGELOG.md:379) | none |  |
| 1.1.2 | Added | Workspace members (CHANGELOG.md:516) | none |  |

### Chat (39)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A chat draws your avatar beside what you said (CHANGELOG.md:24) | none |  |
| Unreleased | Added | Voice mode reads at the speed you pick (CHANGELOG.md:25) | none |  |
| Unreleased | Added | A tool call in a chat that started a run, filed an issue or named another item links to its page (CHANGELOG.md:30) | none |  |
| Unreleased | Changed | A chat shows what each answer cost, for everybody (CHANGELOG.md:38) | mention | 06-chat.md:96 Answer Cost (describes it as off; now on by default) |
| Unreleased | Changed | A chat message's time carries its date, today's included (CHANGELOG.md:39) | none |  |
| 1.2.0 | Added | Agents compose music (CHANGELOG.md:98) | none |  |
| 1.2.0 | Added | Sound plays in a chat, MIDI included, and an agent can play it to you (CHANGELOG.md:99) | none |  |
| 1.2.0 | Added | Reasoning effort in the chat composer (CHANGELOG.md:100) | section | 06-chat.md:38 "How hard it thinks is yours to choose" |
| 1.2.0 | Added | Plan and Auto modes in a chat (CHANGELOG.md:101) | none |  |
| 1.2.0 | Added | Copy on every code block (CHANGELOG.md:104) | none |  |
| 1.2.0 | Added | Run on a chat answer's shell blocks (CHANGELOG.md:110) | none |  |
| 1.2.0 | Added | Sentence completion in the chat (CHANGELOG.md:122) | none |  |
| 1.2.0 | Added | Suggested replies under a chat's answer (CHANGELOG.md:123) | none |  |
| 1.2.0 | Added | Sound in the chat (CHANGELOG.md:128) | none |  |
| 1.2.0 | Added | MIDI files are read (CHANGELOG.md:129) | none |  |
| 1.2.0 | Changed | The chat list's + New wears the main accent (CHANGELOG.md:170) | none |  |
| 1.2.0 | Changed | `pdf_toPng` puts its picture in the chat only when called with `show: true` (CHANGELOG.md:184) | none |  |
| 1.2.0 | Changed | The chat's mode switch is the application's own list (CHANGELOG.md:186) | none |  |
| 1.2.0 | Changed | A chat's title no longer waits on a busy companion model (CHANGELOG.md:191) | none |  |
| 1.2.0 | Changed | A webhook whose authentication function refuses a caller answers 404, like an unknown path, rather than 401 (CHANGELOG.md:197) | none |  |
| 1.2.0 | Changed | A chat's thinking is drawn where it happened, and as the session draws it (CHANGELOG.md:203) | mention | 06-chat.md:83 |
| 1.1.9 | Added | A model's own answer time limit (CHANGELOG.md:263) | mention | 04-models-and-agents.md:176 |
| 1.1.9 | Changed | Anthropic models follow the Model Answer Time Limit (CHANGELOG.md:273) | mention | 04-models-and-agents.md:176 |
| 1.1.9 | Changed | A review taken back stays in the chat (CHANGELOG.md:274) | none |  |
| 1.1.8 | Changed | Talking while the model thinks no longer stops it (CHANGELOG.md:320) | mention | 06-chat.md:211 |
| 1.1.6 | Changed | A chat model's prices are edited on its own page (CHANGELOG.md:378) | none |  |
| 1.1.5 | Added | Each tool call in a chat shows the time it was made (CHANGELOG.md:409) | none |  |
| 1.1.5 | Changed | Message times are shown in every chat by default (CHANGELOG.md:417) | none |  |
| 1.1.5 | Changed | A chat is named once at its start and again every N exchanges (CHANGELOG.md:418) | mention | 06-chat.md:102 (naming only, not the every-N rule) |
| 1.1.5 | Changed | An agent's model has to be one that chats (CHANGELOG.md:419) | none |  |
| 1.1.4 | Changed | A chat's header has one link to its session (CHANGELOG.md:457) | mention | 06-chat.md:89 |
| 1.1.3 | Added | Unread answers beside each chat (CHANGELOG.md:467) | none |  |
| 1.1.3 | Added | Drop files on a chat to attach them (CHANGELOG.md:469) | none |  |
| 1.1.3 | Added | A chat being named says so (CHANGELOG.md:470) | mention | 06-chat.md:102 |
| 1.1.3 | Added | The chat list can be dragged wider (CHANGELOG.md:471) | none |  |
| 1.1.3 | Added | Chat opens a new chat by itself (CHANGELOG.md:472) | none |  |
| 1.1.3 | Added | Chat answers render LaTeX maths (CHANGELOG.md:473) | none |  |
| 1.1.3 | Changed | Voice mode is always on the chat bar (CHANGELOG.md:493) | section | 06-chat.md:152 "Talking to it" |
| 1.1.2 | Changed | Talking over the answer waits a second by default (CHANGELOG.md:529) | mention | 06-chat.md:186 settings table |

### Workflows and runs (41)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A run's agent step says whether Output streaming was on (CHANGELOG.md:23) | none |  |
| Unreleased | Added | An agent node in a workflow chooses how hard its model thinks (CHANGELOG.md:31) | none |  |
| Unreleased | Added | An action or an agent node can run more than once in a run (CHANGELOG.md:32) | none |  |
| 1.2.0 | Added | An agent node can name its model (CHANGELOG.md:116) | none |  |
| 1.2.0 | Added | Plugins and functions can read Slack's Web API and download Slack files through a connection (CHANGELOG.md:124) | none |  |
| 1.2.0 | Changed | A condition's written value may name a field (CHANGELOG.md:180) | none |  |
| 1.2.0 | Changed | A workspace function's `orknux.http`, an agent's HTTP tools and a plugin's requests refuse cloud metadata addresses, including after a redirect, and read an a (CHANGELOG.md:193) | none |  |
| 1.2.0 | Changed | A workflow's own action can no longer name another workspace's connection, function, condition, speech model or workflow, and a run will not send through anot (CHANGELOG.md:194) | none |  |
| 1.2.0 | Changed | What a function or a plugin action says with `orknux.log` is in the run's log (CHANGELOG.md:206) | none |  |
| 1.1.9 | Added | A workflow's Used by (CHANGELOG.md:259) | none |  |
| 1.1.9 | Added | Working on a workflow together (CHANGELOG.md:262) | none |  |
| 1.1.9 | Changed | The workflow editor saves as it goes (CHANGELOG.md:272) | none |  |
| 1.1.9 | Changed | Workflow on and off is a green switch (CHANGELOG.md:276) | none |  |
| 1.1.8 | Added | A Workflow node (CHANGELOG.md:297) | none |  |
| 1.1.8 | Added | Cut, Copy and Paste in the workflow editor (CHANGELOG.md:298) | none |  |
| 1.1.8 | Added | Node shapes (CHANGELOG.md:299) | none |  |
| 1.1.8 | Added | Plugins and functions can put a file on Slack through a connection (CHANGELOG.md:309) | none |  |
| 1.1.6 | Added | Output streaming on an agent node (CHANGELOG.md:360) | none |  |
| 1.1.6 | Changed | `agent_wait` no longer holds back messages in a workflow step's conversation (CHANGELOG.md:374) | mention | 04-models-and-agents.md:577 |
| 1.1.5 | Added | Placeholders in any written node value (CHANGELOG.md:401) | none |  |
| 1.1.5 | Added | A run's step shows its parameters (CHANGELOG.md:402) | none |  |
| 1.1.5 | Added | A run of an older version says so (CHANGELOG.md:403) | none |  |
| 1.1.5 | Added | A Building workflows skill (CHANGELOG.md:408) | mention | 04-models-and-agents.md:808 "Building a workflow" (the tools; the skill is not named) |
| 1.1.5 | Added | Every quick-edit panel in the workflow editor links to the component's own page (CHANGELOG.md:410) | mention | 02-workflows.md:120 "The way out" |
| 1.1.5 | Changed | A run begins only at a trigger (CHANGELOG.md:415) | none |  |
| 1.1.5 | Changed | A reminder an agent sets no longer holds its workflow step (CHANGELOG.md:416) | mention | 04-models-and-agents.md:594 |
| 1.1.5 | Changed | Node text fields are dragged taller (CHANGELOG.md:420) | none |  |
| 1.1.5 | Changed | The workflow list is ordered by a press of its column headings (CHANGELOG.md:421) | section | 02-workflows.md:8 "The list" |
| 1.1.5 | Changed | A trigger's line in a run's log reads "<trigger> fired with: ..." (CHANGELOG.md:422) | none |  |
| 1.1.3 | Added | "+ New function" opens a panel (CHANGELOG.md:478) | none |  |
| 1.1.2 | Added | An object inside a property (CHANGELOG.md:517) | none |  |
| 1.1.2 | Added | Rectangle select on the workflow canvas (CHANGELOG.md:518) | none |  |
| 1.1.2 | Added | The Add menu opens at the pointer and takes the arrow keys (CHANGELOG.md:519) | none |  |
| 1.1.2 | Added | An Object node's fields are drawn as a tree (CHANGELOG.md:520) | none |  |
| 1.1.2 | Added | Type filters (CHANGELOG.md:521) | none |  |
| 1.1.2 | Added | Object Depth (CHANGELOG.md:525) | none |  |
| 1.1.0 | Added | A node's Action and Condition pickers offer what the plugins bring (CHANGELOG.md:559) | none |  |
| 1.1.0 | Added | Shift+click selects several nodes (CHANGELOG.md:560) | none |  |
| 1.1.0 | Added | Quick filters in a node's Action and Condition pickers (CHANGELOG.md:561) | none |  |
| 1.1.0 | Added | The **field picker marks the row that hands on a whole object**, with its fields indented under it, so it is not missed among them (CHANGELOG.md:562) | none |  |
| 1.1.0 | Changed | Creating a workflow opens its editor (CHANGELOG.md:566) | none |  |

### Agents, tools and sessions (52)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Agents ask about a large file instead of reading it whole (CHANGELOG.md:95) | none |  |
| 1.2.0 | Added | An agent can ask for a box (CHANGELOG.md:117) | none |  |
| 1.2.0 | Added | `svg_read` (CHANGELOG.md:118) | none |  |
| 1.2.0 | Added | `sheet_read` reads an attached CSV, .xlsx or .xls (CHANGELOG.md:119) | none |  |
| 1.2.0 | Added | A plugin's skill catalogue can be searched (CHANGELOG.md:121) | none |  |
| 1.2.0 | Added | `ORKNUX_SESSION_COOKIE_SECURE` marks the session cookie Secure (`auto`, the default, follows the request); `ORKNUX_CONTENT_SECURITY_POLICY` replaces the inter (CHANGELOG.md:126) | none |  |
| 1.2.0 | Added | An agent looks at a picture at an address (CHANGELOG.md:164) | none |  |
| 1.2.0 | Added | A file out of a box as itself (CHANGELOG.md:165) | mention | 04-models-and-agents.md:875 orkbox_export |
| 1.2.0 | Changed | An agent can draw a picture for its own eyes only (CHANGELOG.md:171) | none |  |
| 1.2.0 | Changed | The basic built-ins travel again, and the skill tools cannot be left behind the tool search (CHANGELOG.md:173) | none |  |
| 1.2.0 | Changed | A tool handed an address where it reads a key says how an address becomes a key (CHANGELOG.md:174) | none |  |
| 1.2.0 | Changed | Two provider settings decide how an agent reaches the tools it does not carry from the start, and every existing provider is turned to its type's default (CHANGELOG.md:175) | section | 04-models-and-agents.md:127 "What a provider is sent" |
| 1.2.0 | Changed | An agent holding more tools than its provider takes carries as many as fit from its first message (CHANGELOG.md:181) | mention | 04-models-and-agents.md:739 "Finding a tool" |
| 1.2.0 | Changed | A conversation sends the same tool array and system turn from its first request to its last (CHANGELOG.md:182) | mention | 04-models-and-agents.md:163 |
| 1.2.0 | Changed | A page `pdf_preview` draws, and a picture `picture_view` shows, go to the agent alone (CHANGELOG.md:183) | none |  |
| 1.2.0 | Changed | The search on Skills and Memory is one box above the catalogs and searches every catalog, a plugin's included (CHANGELOG.md:188) | none |  |
| 1.2.0 | Changed | An agent's note to itself may be 2,000 characters by default (CHANGELOG.md:189) | none |  |
| 1.2.0 | Changed | An access token can no longer make another token; make tokens from a signed-in session (CHANGELOG.md:195) | none |  |
| 1.2.0 | Changed | Setting somebody's password, or changing your own, ends their other sessions (CHANGELOG.md:196) | mention | 08-administration.md:99 (reset only) |
| 1.2.0 | Changed | `ORKNUX_SESSION_COOKIE_SAME_SITE` and `ORKNUX_SESSION_COOKIE_HTTP_ONLY` now take effect; they were ignored (CHANGELOG.md:198) | none |  |
| 1.2.0 | Changed | An agent's orknux_ tools can be set to Offer (CHANGELOG.md:199) | mention | 04-models-and-agents.md:675 (says all start Always - out of date) |
| 1.2.0 | Changed | A new agent starts most of the server's specialised tools at Offer rather than Always (CHANGELOG.md:200) | mention | 04-models-and-agents.md:675 (says all start Always - out of date) |
| 1.2.0 | Changed | The box tools take Offer and Always (CHANGELOG.md:201) | mention | 04-models-and-agents.md:675 (says all start Always - out of date) |
| 1.2.0 | Changed | The server's own tools can be set to Offer or Always in a workspace that keeps its built-ins fixed (CHANGELOG.md:202) | mention | 04-models-and-agents.md:675 (says all start Always - out of date) |
| 1.1.9 | Added | Agents ask with options (CHANGELOG.md:260) | none |  |
| 1.1.9 | Added | An agent can take back a review it sent (CHANGELOG.md:267) | none |  |
| 1.1.8 | Added | An MCP server can be tested in the Add dialog (CHANGELOG.md:308) | none |  |
| 1.1.8 | Changed | Boxes carry a required label again, and an agent is granted boxes by label (CHANGELOG.md:317) | section | 04-models-and-agents.md:840 "Letting an agent work in a box" |
| 1.1.8 | Changed | Providers send up to 200 tools at once by default (CHANGELOG.md:318) | mention | 04-models-and-agents.md:148 (states 128/256, out of date) |
| 1.1.8 | Changed | An agent may ask 25 other agents in a conversation by default (CHANGELOG.md:319) | mention | 08-administration.md:285 (Agents section named, number not) |
| 1.1.8 | Changed | Removing a provider, a model, a trusted certificate, a saved file or a picture asks first (CHANGELOG.md:324) | none |  |
| 1.1.6 | Added | A workspace's own Tool Rounds (CHANGELOG.md:361) | none |  |
| 1.1.6 | Added | An agent can read the Orknux manual (CHANGELOG.md:364) | none |  |
| 1.1.6 | Added | An agent may ask to use one of the workspace's connections (CHANGELOG.md:365) | none |  |
| 1.1.6 | Added | A Box Code Reading skill (CHANGELOG.md:366) | none |  |
| 1.1.6 | Changed | Asking an agent again in the same conversation continues the conversation it had (CHANGELOG.md:373) | mention | 04-models-and-agents.md:568 "Asking another agent" |
| 1.1.6 | Changed | A plugin tool's connection argument offers only connections of its plugin's kind (CHANGELOG.md:376) | none |  |
| 1.1.6 | Changed | An agent is listed as used by the agents that may ask it (CHANGELOG.md:377) | mention | 02-workflows.md:595 Used by panel |
| 1.1.6 | Changed | Agent settings (CHANGELOG.md:380) | none |  |
| 1.1.6 | Changed | Session side panels explain themselves behind (?) (CHANGELOG.md:381) | none |  |
| 1.1.5 | Added | Schedules: a reminder an agent sets that comes back on its own (CHANGELOG.md:398) | mention | 04-models-and-agents.md:582 "Reminders" (the Schedules page is not named) |
| 1.1.5 | Added | An agent can read, make and configure agents (CHANGELOG.md:399) | none |  |
| 1.1.5 | Added | A connection may be granted to every new agent (CHANGELOG.md:407) | mention | 04-models-and-agents.md:252 (an administrator's default connection; the grant to new agents is not described) |
| 1.1.4 | Changed | How long a picture's description may be is one setting (CHANGELOG.md:456) | none |  |
| 1.1.3 | Added | An agent can ask for the tools it lacks (CHANGELOG.md:466) | mention | 04-models-and-agents.md:739 tool_find/tool_load |
| 1.1.3 | Added | Attached files reach the agent (CHANGELOG.md:468) | mention | 06-chat.md:122 "Attachments" |
| 1.1.3 | Added | A menu down the side of an agent's settings (CHANGELOG.md:480) | none |  |
| 1.1.3 | Added | An "Add a model" link under an agent's Model (CHANGELOG.md:481) | none |  |
| 1.1.3 | Changed | Every agent may ask for more tools, existing ones included (CHANGELOG.md:488) | mention | 04-models-and-agents.md:739 tool_find/tool_load |
| 1.1.3 | Changed | New agents start with Orknux access on (CHANGELOG.md:489) | mention | 04-models-and-agents.md:802 (says off for every agent - out of date) |
| 1.1.3 | Changed | A box has a name only (CHANGELOG.md:490) | section | 04-models-and-agents.md:840 "Letting an agent work in a box" |
| 1.1.3 | Changed | An agent's Boxes grant is a list of ticks (CHANGELOG.md:491) | section | 04-models-and-agents.md:840 "Letting an agent work in a box" |

### Models and providers (16)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | A model's speed over time (CHANGELOG.md:76) | none |  |
| 1.2.0 | Added | Model speed (CHANGELOG.md:133) | none |  |
| 1.2.0 | Added | Export a model provider (CHANGELOG.md:148) | none |  |
| 1.2.0 | Changed | A reasoning effort for OpenAI, OpenAI-compatible, llama.cpp and Ollama models, not only Azure (CHANGELOG.md:185) | none |  |
| 1.1.8 | Added | Cache writes are counted and priced (CHANGELOG.md:306) | mention | 04-models-and-agents.md:166 (cached input billed less; no prices section) |
| 1.1.8 | Added | `orknux_update_model` and `orknux_start_task` (CHANGELOG.md:310) | none |  |
| 1.1.8 | Changed | Test on a model provider checks the form without saving it (CHANGELOG.md:323) | none |  |
| 1.1.8 | Changed | Models are no longer offered as issue assignees (CHANGELOG.md:326) | none |  |
| 1.1.6 | Added | A price for cached input (CHANGELOG.md:362) | mention | 04-models-and-agents.md:166 (cached input billed less; no prices section) |
| 1.1.5 | Added | Models exported and imported between workspaces (CHANGELOG.md:406) | none |  |
| 1.1.5 | Added | Cached input on the model page and in Tokens by person (CHANGELOG.md:411) | mention | 04-models-and-agents.md:166 (cached input billed less; no prices section) |
| 1.1.4 | Changed | OpenAI-compatible, Ollama and llama.cpp providers work without an API key (CHANGELOG.md:454) | none |  |
| 1.1.3 | Added | A model's page says what uses it (CHANGELOG.md:474) | none |  |
| 1.1.3 | Added | Picking a model a llama.cpp server offers fills its context window (CHANGELOG.md:477) | none |  |
| 1.1.1 | Added | An access token can be read-only (CHANGELOG.md:544) | none |  |
| 1.1.1 | Changed | Access tokens are a table (CHANGELOG.md:548) | mention | 08-administration.md:186 "Access tokens" (no table, no read-only) |

### Administration and security (39)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A Refresh button beside Auto (CHANGELOG.md:34) | none |  |
| 1.2.0 | Added | Replacing a saved artifact's file (CHANGELOG.md:75) | none |  |
| 1.2.0 | Added | Tables in an imported PDF come in as tables (CHANGELOG.md:80) | none |  |
| 1.2.0 | Added | Lists and merged cells in an imported PDF (CHANGELOG.md:81) | none |  |
| 1.2.0 | Added | Admin Settings has a Limits heading (CHANGELOG.md:120) | mention | 08-administration.md:284 lists the old section names |
| 1.2.0 | Added | The upload limit is set in Admin Settings (CHANGELOG.md:166) | none |  |
| 1.2.0 | Changed | Blue is the default accent (CHANGELOG.md:176) | none |  |
| 1.2.0 | Changed | Analysis is called Explore (CHANGELOG.md:187) | mention | 01-getting-started.md:116 |
| 1.2.0 | Changed | Cross-site writes are refused (CHANGELOG.md:192) | none |  |
| 1.2.0 | Changed | An address typed without a scheme is taken as http (CHANGELOG.md:204) | none |  |
| 1.2.0 | Changed | A package is installed from a registry only with a SHA-256, -384 or -512 integrity, and its file only over https (CHANGELOG.md:205) | none |  |
| 1.2.0 | Changed | The web search key is a secret field like every other (CHANGELOG.md:211) | none |  |
| 1.1.9 | Added | A part's dependency graph (CHANGELOG.md:258) | none |  |
| 1.1.9 | Added | Drawing in SVG (CHANGELOG.md:261) | none |  |
| 1.1.9 | Added | A field that reads a variable links to it (CHANGELOG.md:266) | none |  |
| 1.1.8 | Added | A reference to a variable can be cleared (CHANGELOG.md:305) | none |  |
| 1.1.8 | Added | The Users list shows when each person last signed in (CHANGELOG.md:307) | none |  |
| 1.1.8 | Changed | Reading a secret back now takes a role (CHANGELOG.md:315) | none |  |
| 1.1.8 | Changed | Basic auth sends a secret that is already base64-encoded as it is (CHANGELOG.md:321) | section | 04-models-and-agents.md:354 Auth table |
| 1.1.8 | Changed | Every choice in the interface opens the application's own list (CHANGELOG.md:322) | none |  |
| 1.1.8 | Changed | The import dialog opens wider and can be resized from any edge (CHANGELOG.md:327) | none |  |
| 1.1.8 | Changed | The manual says what this release added (CHANGELOG.md:328) | none |  |
| 1.1.7 | Changed | Progress messages None is held to by the server (CHANGELOG.md:347) | none |  |
| 1.1.6 | Added | Progress messages, None to High (CHANGELOG.md:359) | none |  |
| 1.1.6 | Added | History says what each save changed (CHANGELOG.md:367) | mention | 02-workflows.md:496 "What a component was" (no word on the change summary) |
| 1.1.5 | Added | `app_link` and an installation address in Admin -> Settings (CHANGELOG.md:400) | mention | 08-administration.md:140 base-url (not app_link) |
| 1.1.4 | Changed | The top bar is in the alphabet's order (CHANGELOG.md:453) | mention | 01-getting-started.md:110 (order and names out of date: no Design, says Workflow for Flow) |
| 1.1.3 | Added | A fresh installation starts with a workspace (CHANGELOG.md:465) | none |  |
| 1.1.3 | Added | Test a connection before adding it (CHANGELOG.md:475) | none |  |
| 1.1.3 | Added | A plugin's connection kind can bring a setup guide, a check and a default address (CHANGELOG.md:476) | none |  |
| 1.1.3 | Added | Save and Discard along the foot of every page that saves (CHANGELOG.md:479) | none |  |
| 1.1.3 | Added | Used by is paged (CHANGELOG.md:482) | mention | 02-workflows.md:595 Used by panel (paging not described) |
| 1.1.3 | Added | The Updates page says why a chosen release was not started (CHANGELOG.md:483) | mention | 08-administration.md (Updating the server, ~line 1000) |
| 1.1.3 | Added | The top bar shows your display name (CHANGELOG.md:484) | none |  |
| 1.1.3 | Changed | Test Connection sits beside the status line under the form (CHANGELOG.md:492) | none |  |
| 1.1.3 | Changed | The release launcher skips a release built for a newer Java (CHANGELOG.md:494) | none |  |
| 1.1.2 | Added | A menu down the side of both settings pages (CHANGELOG.md:523) | none |  |
| 1.1.2 | Added | A row of the Users list opens the user (CHANGELOG.md:524) | none |  |
| 1.1.2 | Changed | A workspace's settings are its admins' to change (CHANGELOG.md:530) | none |  |

