# Manual audit: 1.1.0 to Unreleased

Issue #684. Every **Added** and **Changed** entry in `CHANGELOG.md` from `## 1.1.0` up to and including
`## Unreleased`, and how the manual (`src/docs/*.md`) covers it. **Fixed** entries are left out: they
restore what the manual already says.

Judged by reading: *section* where the feature has a heading or a paragraph of its own in the chapter
that owns it, *mention* where it is said only in passing, *none* where the manual is silent, *n/a* for an
entry with nothing to tell a reader (a colour, a spacing, the manual's own upkeep). The verdicts and the
phrase each rests on are in `tools/verdicts.tsv`; `tools/judge.py` finds each phrase in the chapter as it
stands and writes its line here, and a phrase no longer found turns the entry to *none*.

Regenerate: `audit.py <root> rows.tsv`, then `judge.py rows.tsv src/docs tools/verdicts.tsv AUDIT.md`.

**315 entries**: 305 section, 0 mention, 0 none, 10 n/a. Before the rewrite: 301 entries, 8 section, 47 mention, 246 none.

| Area | Entries | Section | Mention | None | n/a |
|---|---:|---:|---:|---:|---:|
| Design - Images and the image editor | 27 | 27 | 0 | 0 | 0 |
| Design - Documents | 23 | 23 | 0 | 0 | 0 |
| Design - Wireframes | 4 | 4 | 0 | 0 | 0 |
| Design - Videos | 4 | 4 | 0 | 0 | 0 |
| Explore - Diagrams | 19 | 19 | 0 | 0 | 0 |
| Explore - Research | 18 | 18 | 0 | 0 | 0 |
| Desktop app | 6 | 6 | 0 | 0 | 0 |
| Reports and usage | 10 | 10 | 0 | 0 | 0 |
| Templates, sharing and workspaces | 11 | 11 | 0 | 0 | 0 |
| Chat | 42 | 40 | 0 | 0 | 2 |
| Workflows and runs | 42 | 41 | 0 | 0 | 1 |
| Agents, tools and sessions | 57 | 54 | 0 | 0 | 3 |
| Models and providers | 16 | 16 | 0 | 0 | 0 |
| Administration and security | 36 | 32 | 0 | 0 | 4 |

## Every entry, by area

### Design - Images and the image editor (27)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | A picture being drawn in the image editor says how long it has taken and how long is left, where anything knows (CHANGELOG.md:124) | section | 10-images.md:87 |
| 1.2.0 | Added | Upscale a finished video (CHANGELOG.md:125) | section | 11-videos.md:117 |
| 1.2.0 | Added | Negative prompts for pictures (CHANGELOG.md:152) | section | 10-images.md:58 |
| 1.2.0 | Added | Rotate and mirror in the image editor (CHANGELOG.md:153) | section | 10-images.md:210 |
| 1.2.0 | Added | Import a picture from Orknux in the image editor (CHANGELOG.md:154) | section | 10-images.md:140 |
| 1.2.0 | Added | Crop in the image editor (CHANGELOG.md:155) | section | 10-images.md:210 |
| 1.2.0 | Added | A brush in the image editor (CHANGELOG.md:156) | section | 10-images.md:224 |
| 1.2.0 | Added | Brush tips in the image editor (CHANGELOG.md:157) | section | 10-images.md:224 |
| 1.2.0 | Added | Shortcuts for the image editor's tools (CHANGELOG.md:158) | section | 10-images.md:306 |
| 1.2.0 | Added | Selective blur in the image editor (CHANGELOG.md:159) | section | 10-images.md:251 |
| 1.2.0 | Added | Gradual blur in the image editor (CHANGELOG.md:160) | section | 10-images.md:251 |
| 1.2.0 | Added | Layers in the image editor (CHANGELOG.md:161) | section | 10-images.md:185 |
| 1.2.0 | Added | Clean up in the image editor (CHANGELOG.md:162) | section | 10-images.md:270 |
| 1.2.0 | Added | Feather for the Magic edit (CHANGELOG.md:163) | section | 10-images.md:152 |
| 1.1.6 | Added | Harmonize in the image editor (CHANGELOG.md:374) | section | 10-images.md:270 |
| 1.1.6 | Added | A picture waiting or being drawn in Design can be stopped (CHANGELOG.md:375) | section | 10-images.md:26 |
| 1.1.6 | Added | The image editor numbers its pictures (CHANGELOG.md:386) | section | 10-images.md:97 |
| 1.1.5 | Added | Upscaling through a Stable Diffusion WebUI (CHANGELOG.md:421) | section | 10-images.md:270 |
| 1.1.5 | Added | Pictures imported, dropped or pasted into the image editor, and exported (CHANGELOG.md:422) | section | 10-images.md:140 |
| 1.1.4 | Added | Design, a new section with an Images page (CHANGELOG.md:460) | section | 10-images.md:16 |
| 1.1.4 | Added | An image editor (CHANGELOG.md:461) | section | 10-images.md:101 |
| 1.1.4 | Added | Magic edit: select part of a picture and say what to change (CHANGELOG.md:462) | section | 10-images.md:152 |
| 1.1.4 | Added | Changes are a draft until saved (CHANGELOG.md:463) | section | 10-images.md:124 |
| 1.1.4 | Added | Open in Design (CHANGELOG.md:464) | section | 10-images.md:44 |
| 1.1.4 | Added | A stable-diffusion.cpp provider type (CHANGELOG.md:465) | section | 10-images.md:330 |
| 1.1.4 | Added | Longest image prompt (CHANGELOG.md:466) | section | 08-administration.md:949 |
| 1.1.4 | Changed | An OpenAI provider whose server is stable-diffusion.cpp's is saved as that type (CHANGELOG.md:472) | section | 10-images.md:340 |

### Design - Documents (23)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A document lists the documents it mentions (CHANGELOG.md:25) | section | 12-documents.md:215 |
| Unreleased | Added | Delete in the document editor (CHANGELOG.md:26) | section | 12-documents.md:224 |
| Unreleased | Added | Diagrams, documents and wireframes can be worked on together, as workflows can (CHANGELOG.md:32) | section | 14-diagrams.md:200 |
| Unreleased | Added | A document can link to another (CHANGELOG.md:36) | section | 12-documents.md:193 |
| Unreleased | Added | The documents list imports several files at once (CHANGELOG.md:37) | section | 12-documents.md:35 |
| Unreleased | Changed | The diagram, document and wireframe editors have no Save button (CHANGELOG.md:48) | section | 12-documents.md:323 |
| 1.2.0 | Added | A dark page in the document editor (CHANGELOG.md:95) | section | 12-documents.md:104 |
| 1.2.0 | Added | Import in the document editor (CHANGELOG.md:96) | section | 12-documents.md:92 |
| 1.2.0 | Added | Documents in Design (CHANGELOG.md:101) | section | 12-documents.md:11 |
| 1.2.0 | Added | The document editor writes in pages (CHANGELOG.md:102) | section | 12-documents.md:59 |
| 1.2.0 | Added | While typing, the document editor suggests how the sentence goes on (CHANGELOG.md:103) | section | 12-documents.md:154 |
| 1.2.0 | Added | A document's view, and Find (CHANGELOG.md:104) | section | 12-documents.md:231 |
| 1.2.0 | Added | Quick actions finds documents (CHANGELOG.md:105) | section | 01-getting-started.md:192 |
| 1.2.0 | Added | Agents write documents (CHANGELOG.md:106) | section | 12-documents.md:285 |
| 1.2.0 | Added | Grammar and spelling in documents, in English and Polish (CHANGELOG.md:107) | section | 12-documents.md:172 |
| 1.2.0 | Added | A document's page is its own (CHANGELOG.md:108) | section | 12-documents.md:139 |
| 1.2.0 | Added | Code blocks in documents (CHANGELOG.md:109) | section | 12-documents.md:80 |
| 1.2.0 | Added | Colour, highlights with notes and an outline in documents (CHANGELOG.md:110) | section | 12-documents.md:109 |
| 1.2.0 | Added | A document exports as PDF, Markdown, ODT or ODS (CHANGELOG.md:111) | section | 12-documents.md:266 |
| 1.2.0 | Added | Files in the document, wireframe and diagram chats (CHANGELOG.md:120) | section | 12-documents.md:301 |
| 1.2.0 | Added | `sheet_read` reads an OpenDocument spreadsheet (.ods) (CHANGELOG.md:167) | section | 04-models-and-agents.md:1132 |
| 1.2.0 | Added | A document's View shows its highlights' notes (CHANGELOG.md:179) | section | 12-documents.md:238 |
| 1.2.0 | Added | A document has a history (CHANGELOG.md:180) | section | 12-documents.md:247 |

### Design - Wireframes (4)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Import in the wireframe editor (CHANGELOG.md:99) | section | 13-wireframes.md:72 |
| 1.2.0 | Added | A wireframe exports as HTML, SVG or PNG (CHANGELOG.md:119) | section | 13-wireframes.md:108 |
| 1.2.0 | Added | Wireframes in Design (CHANGELOG.md:149) | section | 13-wireframes.md:22 |
| 1.2.0 | Added | A wireframe an agent draws in a chat is shown in the chat (CHANGELOG.md:166) | section | 13-wireframes.md:83 |

### Design - Videos (4)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Videos in Design (CHANGELOG.md:122) | section | 11-videos.md:27 |
| 1.2.0 | Added | A video being made says how long it has taken and about how long is left (CHANGELOG.md:123) | section | 11-videos.md:62 |
| 1.2.0 | Added | Export a video as GIF, MP4 or MKV (CHANGELOG.md:126) | section | 11-videos.md:92 |
| 1.2.0 | Added | Videos in the chat (CHANGELOG.md:144) | section | 11-videos.md:131 |

### Explore - Diagrams (19)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A diagram shape's colour from three rows of swatches and a picker (CHANGELOG.md:23) | section | 14-diagrams.md:104 |
| Unreleased | Added | The diagram toolbar offers the common drawn shapes up front (CHANGELOG.md:24) | section | 14-diagrams.md:44 |
| Unreleased | Added | A diagram's line has a style and a mark at each end (CHANGELOG.md:29) | section | 14-diagrams.md:82 |
| Unreleased | Added | Diagrams have flowchart and UML shapes (CHANGELOG.md:38) | section | 14-diagrams.md:40 |
| Unreleased | Added | The diagram editor's panel can be dragged wider, and the line above its chat up or down (CHANGELOG.md:39) | section | 14-diagrams.md:125 |
| Unreleased | Changed | The diagram toolbar's Delete deletes the whole diagram (CHANGELOG.md:49) | section | 14-diagrams.md:119 |
| 1.2.0 | Added | A diagram's PNG at 1×, 2× or 3× (CHANGELOG.md:94) | section | 14-diagrams.md:187 |
| 1.2.0 | Added | Explore > Diagrams (CHANGELOG.md:170) | section | 14-diagrams.md:10 |
| 1.2.0 | Added | A diagram's nodes carry notes, 5000 characters each by default (CHANGELOG.md:171) | section | 14-diagrams.md:101 |
| 1.2.0 | Added | Agents read, search, draw and export diagrams (CHANGELOG.md:172) | section | 14-diagrams.md:155 |
| 1.2.0 | Added | Each diagram says what agents may do with it: Read only, or Read and change (CHANGELOG.md:173) | section | 14-diagrams.md:129 |
| 1.2.0 | Added | Agents are sent to the diagrams (CHANGELOG.md:174) | section | 04-models-and-agents.md:1346 |
| 1.2.0 | Added | Quick actions finds a diagram by its name and a node by its label (CHANGELOG.md:175) | section | 14-diagrams.md:30 |
| 1.2.0 | Added | A diagram has a description (CHANGELOG.md:176) | section | 14-diagrams.md:129 |
| 1.2.0 | Added | A diagram's labels are typed over where they are drawn (CHANGELOG.md:177) | section | 14-diagrams.md:91 |
| 1.2.0 | Added | A diagram's details have a page of their own (CHANGELOG.md:178) | section | 14-diagrams.md:129 |
| 1.2.0 | Changed | Every agent with Orknux access is given the diagram tools at Always, and `orknux_delete_diagram` is hidden on every agent (CHANGELOG.md:194) | section | 14-diagrams.md:155 |
| 1.1.9 | Changed | Diagrams look better by default (CHANGELOG.md:288) | section | 04-models-and-agents.md:1101 |
| 1.1.9 | Changed | Diagram decisions are ovals (CHANGELOG.md:292) | section | 04-models-and-agents.md:1103 |

### Explore - Research (18)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | Every field of New research has a (?) (CHANGELOG.md:28) | section | 15-research.md:32 |
| Unreleased | Added | A research's Plan, Write and Review keep sessions you can open (CHANGELOG.md:43) | section | 15-research.md:114 |
| Unreleased | Changed | A research runs with agents, not a model (CHANGELOG.md:54) | section | 15-research.md:68 |
| 1.2.0 | Added | A finished research suggests what to research next (CHANGELOG.md:113) | section | 15-research.md:195 |
| 1.2.0 | Added | A research can be reviewed before it is saved (CHANGELOG.md:114) | section | 15-research.md:171 |
| 1.2.0 | Added | Explore > Research (CHANGELOG.md:128) | section | 15-research.md:30 |
| 1.2.0 | Added | A research always has its model, and may leave the web alone (CHANGELOG.md:129) | section | 15-research.md:65 |
| 1.2.0 | Added | A research can include images (CHANGELOG.md:130) | section | 15-research.md:45 |
| 1.2.0 | Added | A research has a page of its own (CHANGELOG.md:131) | section | 15-research.md:94 |
| 1.2.0 | Added | A research's steps say in the run's log what they did (CHANGELOG.md:132) | section | 15-research.md:139 |
| 1.2.0 | Added | A research restarts from where it stopped (CHANGELOG.md:168) | section | 15-research.md:212 |
| 1.2.0 | Added | A running research shows its work as it goes, and about how long is left (CHANGELOG.md:169) | section | 15-research.md:94 |
| 1.2.0 | Changed | A research looks for images unless told not to (CHANGELOG.md:195) | section | 15-research.md:45 |
| 1.2.0 | Changed | The research modes' workflows gain two nodes (CHANGELOG.md:196) | section | 15-research.md:244 |
| 1.2.0 | Changed | The research modes' steps are called Plan research, Gather sources, Deepen findings, Write report and Save report (CHANGELOG.md:224) | section | 15-research.md:244 |
| 1.2.0 | Changed | A research mode's steps are tried again when they fail in a way that could come out differently (CHANGELOG.md:225) | section | 15-research.md:217 |
| 1.2.0 | Changed | A research step cut short by a server restart is run again (CHANGELOG.md:226) | section | 15-research.md:212 |
| 1.2.0 | Changed | Re-running a research's run carries the research with it (CHANGELOG.md:227) | section | 15-research.md:240 |

### Desktop app (6)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Tabs in the desktop app (CHANGELOG.md:147) | section | 17-desktop.md:65 |
| 1.2.0 | Added | New windows and your own tab keys in the desktop app (CHANGELOG.md:148) | section | 17-desktop.md:78 |
| 1.2.0 | Changed | The desktop app accepts uploads of up to 500 MB (CHANGELOG.md:189) | section | 17-desktop.md:115 |
| 1.2.0 | Changed | The desktop app starts in about half the time (CHANGELOG.md:207) | section | 17-desktop.md:29 |
| 1.1.3 | Added | Orknux on the desktop, for Windows and Linux (CHANGELOG.md:480) | section | 17-desktop.md:13 |
| 1.1.3 | Added | Network access for the desktop app, in Admin › Settings (CHANGELOG.md:481) | section | 17-desktop.md:96 |

### Reports and usage (10)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.1.9 | Added | The Errors report's columns sort (CHANGELOG.md:281) | section | 16-reports.md:136 |
| 1.1.9 | Added | Admin → Reports keeps the report in the address (CHANGELOG.md:282) | section | 16-reports.md:9 |
| 1.1.8 | Added | Session ratings (CHANGELOG.md:311) | section | 04-models-and-agents.md:930 |
| 1.1.8 | Added | An Errors report (CHANGELOG.md:312) | section | 16-reports.md:115 |
| 1.1.8 | Added | The usage chart counts sessions and model calls per day (CHANGELOG.md:328) | section | 02-workflows.md:1095 |
| 1.1.8 | Changed | Ratings and chat reviews are on by default (CHANGELOG.md:333) | section | 04-models-and-agents.md:947 |
| 1.1.6 | Added | Charts on the usage report (CHANGELOG.md:380) | section | 16-reports.md:18 |
| 1.1.6 | Changed | An asked agent's calls are booked in the usage report to whoever prompted the conversation that asked it (CHANGELOG.md:392) | section | 16-reports.md:28 |
| 1.1.2 | Added | Admin > Reports: tokens by the person who prompted them (CHANGELOG.md:532) | section | 16-reports.md:18 |
| 1.1.2 | Added | Reports can be searched by person, sorted by any column and exported as CSV (CHANGELOG.md:539) | section | 16-reports.md:45 |

### Templates, sharing and workspaces (11)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | Connections and MCP servers as templates (CHANGELOG.md:142) | section | 04-models-and-agents.md:331 |
| 1.1.8 | Added | Workspace sharing (CHANGELOG.md:313) | section | 08-administration.md:63 |
| 1.1.8 | Added | Workspace variables inside placeholders (CHANGELOG.md:317) | section | 02-workflows.md:704 |
| 1.1.8 | Added | Models as templates (CHANGELOG.md:318) | section | 04-models-and-agents.md:331 |
| 1.1.8 | Added | Bulk import (CHANGELOG.md:319) | section | 08-administration.md:80 |
| 1.1.8 | Added | Copying a workspace asks what to take (CHANGELOG.md:320) | section | 08-administration.md:18 |
| 1.1.8 | Added | A variable, secret, skill or memory moves to another catalog (CHANGELOG.md:321) | section | 05-variables.md:50 |
| 1.1.8 | Changed | Use a template offers only templates made from that page's kind (CHANGELOG.md:342) | section | 04-models-and-agents.md:331 |
| 1.1.6 | Added | Use a template can leave an agent's model out (CHANGELOG.md:385) | section | 04-models-and-agents.md:357 |
| 1.1.6 | Changed | Publishing a template closes its dialog (CHANGELOG.md:396) | section | 04-models-and-agents.md:331 |
| 1.1.2 | Added | Workspace members (CHANGELOG.md:533) | section | 08-administration.md:41 |

### Chat (42)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A Magic accent (CHANGELOG.md:22) | section | 01-getting-started.md:262 |
| Unreleased | Added | A chat draws your avatar beside what you said (CHANGELOG.md:34) | section | 01-getting-started.md:248 |
| Unreleased | Added | Voice mode reads at the speed you pick (CHANGELOG.md:35) | section | 06-chat.md:391 |
| Unreleased | Added | A tool call in a chat that started a run, filed an issue or named another item links to its page (CHANGELOG.md:40) | section | 06-chat.md:207 |
| Unreleased | Changed | Your avatar in a chat sits at the top left of your message (CHANGELOG.md:51) | section | 01-getting-started.md:248 |
| Unreleased | Changed | A chat shows what each answer cost, for everybody (CHANGELOG.md:52) | section | 06-chat.md:137 |
| Unreleased | Changed | A chat message's time carries its date, today's included (CHANGELOG.md:53) | section | 06-chat.md:131 |
| 1.2.0 | Added | Agents compose music (CHANGELOG.md:115) | section | 04-models-and-agents.md:1198 |
| 1.2.0 | Added | Sound plays in a chat, MIDI included, and an agent can play it to you (CHANGELOG.md:116) | section | 06-chat.md:197 |
| 1.2.0 | Added | Reasoning effort in the chat composer (CHANGELOG.md:117) | section | 06-chat.md:39 |
| 1.2.0 | Added | Plan and Auto modes in a chat (CHANGELOG.md:118) | section | 06-chat.md:107 |
| 1.2.0 | Added | Copy on every code block (CHANGELOG.md:121) | section | 06-chat.md:186 |
| 1.2.0 | Added | Run on a chat answer's shell blocks (CHANGELOG.md:127) | section | 06-chat.md:188 |
| 1.2.0 | Added | Sentence completion in the chat (CHANGELOG.md:139) | section | 06-chat.md:157 |
| 1.2.0 | Added | Suggested replies under a chat's answer (CHANGELOG.md:140) | section | 06-chat.md:167 |
| 1.2.0 | Added | Sound in the chat (CHANGELOG.md:145) | section | 06-chat.md:282 |
| 1.2.0 | Added | MIDI files are read (CHANGELOG.md:146) | section | 04-models-and-agents.md:1203 |
| 1.2.0 | Changed | The chat list's + New wears the main accent (CHANGELOG.md:187) | n/a | visual: the + New button's colour and the top bar's spacing |
| 1.2.0 | Changed | Blue is the default accent (CHANGELOG.md:193) | section | 01-getting-started.md:261 |
| 1.2.0 | Changed | `pdf_toPng` puts its picture in the chat only when called with `show: true` (CHANGELOG.md:201) | section | 04-models-and-agents.md:1189 |
| 1.2.0 | Changed | The chat's mode switch is the application's own list (CHANGELOG.md:203) | n/a | visual: the chat's mode switch drawn as the application's own list |
| 1.2.0 | Changed | A chat's title no longer waits on a busy companion model (CHANGELOG.md:208) | section | 06-chat.md:494 |
| 1.2.0 | Changed | A webhook whose authentication function refuses a caller answers 404, like an unknown path, rather than 401 (CHANGELOG.md:214) | section | 03-triggers.md:109 |
| 1.2.0 | Changed | A chat's thinking is drawn where it happened, and as the session draws it (CHANGELOG.md:220) | section | 06-chat.md:212 |
| 1.1.9 | Added | A model's own answer time limit (CHANGELOG.md:280) | section | 04-models-and-agents.md:238 |
| 1.1.9 | Changed | Anthropic models follow the Model Answer Time Limit (CHANGELOG.md:290) | section | 04-models-and-agents.md:240 |
| 1.1.9 | Changed | A review taken back stays in the chat (CHANGELOG.md:291) | section | 06-chat.md:242 |
| 1.1.8 | Changed | Talking while the model thinks no longer stops it (CHANGELOG.md:337) | section | 06-chat.md:363 |
| 1.1.6 | Changed | A chat model's prices are edited on its own page (CHANGELOG.md:395) | section | 04-models-and-agents.md:298 |
| 1.1.5 | Added | Each tool call in a chat shows the time it was made (CHANGELOG.md:426) | section | 06-chat.md:135 |
| 1.1.5 | Changed | Message times are shown in every chat by default (CHANGELOG.md:434) | section | 06-chat.md:131 |
| 1.1.5 | Changed | A chat is named once at its start and again every N exchanges (CHANGELOG.md:435) | section | 06-chat.md:491 |
| 1.1.5 | Changed | An agent's model has to be one that chats (CHANGELOG.md:436) | section | 04-models-and-agents.md:422 |
| 1.1.4 | Changed | A chat's header has one link to its session (CHANGELOG.md:474) | section | 06-chat.md:89 |
| 1.1.3 | Added | Unread answers beside each chat (CHANGELOG.md:484) | section | 06-chat.md:485 |
| 1.1.3 | Added | Drop files on a chat to attach them (CHANGELOG.md:486) | section | 06-chat.md:264 |
| 1.1.3 | Added | A chat being named says so (CHANGELOG.md:487) | section | 06-chat.md:492 |
| 1.1.3 | Added | The chat list can be dragged wider (CHANGELOG.md:488) | section | 06-chat.md:500 |
| 1.1.3 | Added | Chat opens a new chat by itself (CHANGELOG.md:489) | section | 06-chat.md:499 |
| 1.1.3 | Added | Chat answers render LaTeX maths (CHANGELOG.md:490) | section | 06-chat.md:183 |
| 1.1.3 | Changed | Voice mode is always on the chat bar (CHANGELOG.md:510) | section | 06-chat.md:397 |
| 1.1.2 | Changed | Talking over the answer waits a second by default (CHANGELOG.md:546) | section | 06-chat.md:338 |

### Workflows and runs (42)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A workflow node can have a timeout (CHANGELOG.md:30) | section | 02-workflows.md:823 |
| Unreleased | Added | A run's agent step says whether Output streaming was on (CHANGELOG.md:33) | section | 02-workflows.md:449 |
| Unreleased | Added | An agent node in a workflow chooses how hard its model thinks (CHANGELOG.md:41) | section | 02-workflows.md:419 |
| Unreleased | Added | An action or an agent node can run more than once in a run (CHANGELOG.md:42) | section | 02-workflows.md:809 |
| 1.2.0 | Added | An agent node can name its model (CHANGELOG.md:133) | section | 02-workflows.md:413 |
| 1.2.0 | Added | Plugins and functions can read Slack's Web API and download Slack files through a connection (CHANGELOG.md:141) | section | 02-workflows.md:641 |
| 1.2.0 | Changed | A condition's written value may name a field (CHANGELOG.md:197) | section | 02-workflows.md:708 |
| 1.2.0 | Changed | A workspace function's `orknux.http`, an agent's HTTP tools and a plugin's requests refuse cloud metadata addresses, including after a redirect, and read an a (CHANGELOG.md:210) | section | 08-administration.md:1060 |
| 1.2.0 | Changed | A workflow's own action can no longer name another workspace's connection, function, condition, speech model or workflow, and a run will not send through anot (CHANGELOG.md:211) | section | 08-administration.md:1071 |
| 1.2.0 | Changed | What a function or a plugin action says with `orknux.log` is in the run's log (CHANGELOG.md:223) | section | 02-workflows.md:1150 |
| 1.1.9 | Added | A workflow's Used by (CHANGELOG.md:276) | section | 02-workflows.md:1004 |
| 1.1.9 | Added | Working on a workflow together (CHANGELOG.md:279) | section | 02-workflows.md:250 |
| 1.1.9 | Changed | The workflow editor saves as it goes (CHANGELOG.md:289) | section | 02-workflows.md:269 |
| 1.1.9 | Changed | Workflow on and off is a green switch (CHANGELOG.md:293) | n/a | visual: the workflow's on and off drawn as a green switch |
| 1.1.8 | Added | A Workflow node (CHANGELOG.md:314) | section | 02-workflows.md:374 |
| 1.1.8 | Added | Cut, Copy and Paste in the workflow editor (CHANGELOG.md:315) | section | 02-workflows.md:178 |
| 1.1.8 | Added | Node shapes (CHANGELOG.md:316) | section | 02-workflows.md:227 |
| 1.1.8 | Added | Plugins and functions can put a file on Slack through a connection (CHANGELOG.md:326) | section | 02-workflows.md:641 |
| 1.1.6 | Added | Output streaming on an agent node (CHANGELOG.md:377) | section | 02-workflows.md:437 |
| 1.1.6 | Changed | `agent_wait` no longer holds back messages in a workflow step's conversation (CHANGELOG.md:391) | section | 02-workflows.md:442 |
| 1.1.5 | Added | Placeholders in any written node value (CHANGELOG.md:418) | section | 02-workflows.md:689 |
| 1.1.5 | Added | A run's step shows its parameters (CHANGELOG.md:419) | section | 02-workflows.md:1135 |
| 1.1.5 | Added | A run of an older version says so (CHANGELOG.md:420) | section | 02-workflows.md:1155 |
| 1.1.5 | Added | A Building workflows skill (CHANGELOG.md:425) | section | 04-models-and-agents.md:1372 |
| 1.1.5 | Added | Every quick-edit panel in the workflow editor links to the component's own page (CHANGELOG.md:427) | section | 02-workflows.md:137 |
| 1.1.5 | Changed | A run begins only at a trigger (CHANGELOG.md:432) | section | 03-triggers.md:144 |
| 1.1.5 | Changed | A reminder an agent sets no longer holds its workflow step (CHANGELOG.md:433) | section | 02-workflows.md:442 |
| 1.1.5 | Changed | Node text fields are dragged taller (CHANGELOG.md:437) | section | 02-workflows.md:134 |
| 1.1.5 | Changed | The workflow list is ordered by a press of its column headings (CHANGELOG.md:438) | section | 02-workflows.md:13 |
| 1.1.5 | Changed | A trigger's line in a run's log reads "<trigger> fired with: ..." (CHANGELOG.md:439) | section | 03-triggers.md:158 |
| 1.1.3 | Added | "+ New function" opens a panel (CHANGELOG.md:495) | section | 02-workflows.md:129 |
| 1.1.2 | Added | An object inside a property (CHANGELOG.md:534) | section | 02-workflows.md:721 |
| 1.1.2 | Added | Rectangle select on the workflow canvas (CHANGELOG.md:535) | section | 02-workflows.md:154 |
| 1.1.2 | Added | The Add menu opens at the pointer and takes the arrow keys (CHANGELOG.md:536) | section | 02-workflows.md:192 |
| 1.1.2 | Added | An Object node's fields are drawn as a tree (CHANGELOG.md:537) | section | 02-workflows.md:735 |
| 1.1.2 | Added | Type filters (CHANGELOG.md:538) | section | 04-models-and-agents.md:26 |
| 1.1.2 | Added | Object Depth (CHANGELOG.md:542) | section | 02-workflows.md:740 |
| 1.1.0 | Added | A node's Action and Condition pickers offer what the plugins bring (CHANGELOG.md:576) | section | 02-workflows.md:209 |
| 1.1.0 | Added | Shift+click selects several nodes (CHANGELOG.md:577) | section | 02-workflows.md:154 |
| 1.1.0 | Added | Quick filters in a node's Action and Condition pickers (CHANGELOG.md:578) | section | 02-workflows.md:214 |
| 1.1.0 | Added | The **field picker marks the row that hands on a whole object**, with its fields indented under it, so it is not missed among them (CHANGELOG.md:579) | section | 02-workflows.md:738 |
| 1.1.0 | Changed | Creating a workflow opens its editor (CHANGELOG.md:583) | section | 02-workflows.md:28 |

### Agents, tools and sessions (57)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | An artifact on its own at `/workspace/…/artifacts/…/content` (CHANGELOG.md:27) | section | 04-models-and-agents.md:1296 |
| Unreleased | Added | `!progress-none`, `!progress-low`, `!progress-medium` and `!progress-high` in a message set how much the agent says while it works (CHANGELOG.md:31) | section | 06-chat.md:98 |
| 1.2.0 | Added | Replacing a saved artifact's file (CHANGELOG.md:92) | section | 04-models-and-agents.md:1288 |
| 1.2.0 | Added | Agents ask about a large file instead of reading it whole (CHANGELOG.md:112) | section | 04-models-and-agents.md:1143 |
| 1.2.0 | Added | An agent can ask for a box (CHANGELOG.md:134) | section | 04-models-and-agents.md:496 |
| 1.2.0 | Added | `svg_read` (CHANGELOG.md:135) | section | 04-models-and-agents.md:1122 |
| 1.2.0 | Added | `sheet_read` reads an attached CSV, .xlsx or .xls (CHANGELOG.md:136) | section | 04-models-and-agents.md:1131 |
| 1.2.0 | Added | A plugin's skill catalogue can be searched (CHANGELOG.md:138) | section | 04-models-and-agents.md:567 |
| 1.2.0 | Added | `ORKNUX_SESSION_COOKIE_SECURE` marks the session cookie Secure (`auto`, the default, follows the request); `ORKNUX_CONTENT_SECURITY_POLICY` replaces the inter (CHANGELOG.md:143) | section | 08-administration.md:1026 |
| 1.2.0 | Added | An agent looks at a picture at an address (CHANGELOG.md:181) | section | 04-models-and-agents.md:1160 |
| 1.2.0 | Added | A file out of a box as itself (CHANGELOG.md:182) | section | 04-models-and-agents.md:1433 |
| 1.2.0 | Changed | An agent can draw a picture for its own eyes only (CHANGELOG.md:188) | section | 04-models-and-agents.md:1177 |
| 1.2.0 | Changed | The basic built-ins travel again, and the skill tools cannot be left behind the tool search (CHANGELOG.md:190) | section | 04-models-and-agents.md:1040 |
| 1.2.0 | Changed | A tool handed an address where it reads a key says how an address becomes a key (CHANGELOG.md:191) | section | 04-models-and-agents.md:1171 |
| 1.2.0 | Changed | Two provider settings decide how an agent reaches the tools it does not carry from the start, and every existing provider is turned to its type's default (CHANGELOG.md:192) | section | 04-models-and-agents.md:156 |
| 1.2.0 | Changed | An agent holding more tools than its provider takes carries as many as fit from its first message (CHANGELOG.md:198) | section | 04-models-and-agents.md:214 |
| 1.2.0 | Changed | A conversation sends the same tool array and system turn from its first request to its last (CHANGELOG.md:199) | section | 04-models-and-agents.md:204 |
| 1.2.0 | Changed | A page `pdf_preview` draws, and a picture `picture_view` shows, go to the agent alone (CHANGELOG.md:200) | section | 04-models-and-agents.md:1185 |
| 1.2.0 | Changed | The search on Skills and Memory is one box above the catalogs and searches every catalog, a plugin's included (CHANGELOG.md:205) | section | 04-models-and-agents.md:567 |
| 1.2.0 | Changed | An agent's note to itself may be 2,000 characters by default (CHANGELOG.md:206) | section | 08-administration.md:865 |
| 1.2.0 | Changed | An access token can no longer make another token; make tokens from a signed-in session (CHANGELOG.md:212) | section | 08-administration.md:261 |
| 1.2.0 | Changed | Setting somebody's password, or changing your own, ends their other sessions (CHANGELOG.md:213) | section | 08-administration.md:138 |
| 1.2.0 | Changed | `ORKNUX_SESSION_COOKIE_SAME_SITE` and `ORKNUX_SESSION_COOKIE_HTTP_ONLY` now take effect; they were ignored (CHANGELOG.md:215) | section | 08-administration.md:1034 |
| 1.2.0 | Changed | An agent's orknux_ tools can be set to Offer (CHANGELOG.md:216) | section | 04-models-and-agents.md:1065 |
| 1.2.0 | Changed | A new agent starts most of the server's specialised tools at Offer rather than Always (CHANGELOG.md:217) | section | 04-models-and-agents.md:1040 |
| 1.2.0 | Changed | The box tools take Offer and Always (CHANGELOG.md:218) | section | 04-models-and-agents.md:1066 |
| 1.2.0 | Changed | The server's own tools can be set to Offer or Always in a workspace that keeps its built-ins fixed (CHANGELOG.md:219) | section | 04-models-and-agents.md:1069 |
| 1.1.9 | Added | Agents ask with options (CHANGELOG.md:277) | section | 04-models-and-agents.md:913 |
| 1.1.9 | Added | An agent can take back a review it sent (CHANGELOG.md:284) | section | 04-models-and-agents.md:945 |
| 1.1.8 | Added | An MCP server can be tested in the Add dialog (CHANGELOG.md:325) | section | 04-models-and-agents.md:630 |
| 1.1.8 | Changed | Boxes carry a required label again, and an agent is granted boxes by label (CHANGELOG.md:334) | section | 04-models-and-agents.md:1398 |
| 1.1.8 | Changed | Providers send up to 200 tools at once by default (CHANGELOG.md:335) | section | 04-models-and-agents.md:173 |
| 1.1.8 | Changed | An agent may ask 25 other agents in a conversation by default (CHANGELOG.md:336) | section | 04-models-and-agents.md:854 |
| 1.1.8 | Changed | Removing a provider, a model, a trusted certificate, a saved file or a picture asks first (CHANGELOG.md:341) | n/a | visual: removing asks first, naming what goes with it (each removal's own page says so) |
| 1.1.7 | Changed | Progress messages None is held to by the server (CHANGELOG.md:364) | section | 02-workflows.md:432 |
| 1.1.6 | Added | Progress messages, None to High (CHANGELOG.md:376) | section | 02-workflows.md:426 |
| 1.1.6 | Added | A workspace's own Tool Rounds (CHANGELOG.md:378) | section | 08-administration.md:365 |
| 1.1.6 | Added | An agent can read the Orknux manual (CHANGELOG.md:381) | section | 04-models-and-agents.md:1193 |
| 1.1.6 | Added | An agent may ask to use one of the workspace's connections (CHANGELOG.md:382) | section | 04-models-and-agents.md:487 |
| 1.1.6 | Added | A Box Code Reading skill (CHANGELOG.md:383) | section | 04-models-and-agents.md:1444 |
| 1.1.6 | Changed | Asking an agent again in the same conversation continues the conversation it had (CHANGELOG.md:390) | section | 04-models-and-agents.md:850 |
| 1.1.6 | Changed | A plugin tool's connection argument offers only connections of its plugin's kind (CHANGELOG.md:393) | section | 04-models-and-agents.md:460 |
| 1.1.6 | Changed | An agent is listed as used by the agents that may ask it (CHANGELOG.md:394) | section | 02-workflows.md:958 |
| 1.1.6 | Changed | Agent settings (CHANGELOG.md:397) | n/a | visual: Tool Rounds and Tools carried at once drawn on one line; Add a model as a plus |
| 1.1.6 | Changed | Session side panels explain themselves behind (?) (CHANGELOG.md:398) | n/a | visual: session side panels' (?) and the Thinking filter's colour |
| 1.1.5 | Added | Schedules: a reminder an agent sets that comes back on its own (CHANGELOG.md:415) | section | 04-models-and-agents.md:875 |
| 1.1.5 | Added | An agent can read, make and configure agents (CHANGELOG.md:416) | section | 04-models-and-agents.md:1322 |
| 1.1.5 | Added | A connection may be granted to every new agent (CHANGELOG.md:424) | section | 04-models-and-agents.md:483 |
| 1.1.4 | Changed | How long a picture's description may be is one setting (CHANGELOG.md:473) | section | 08-administration.md:949 |
| 1.1.3 | Added | An agent can ask for the tools it lacks (CHANGELOG.md:483) | section | 04-models-and-agents.md:487 |
| 1.1.3 | Added | Attached files reach the agent (CHANGELOG.md:485) | section | 06-chat.md:262 |
| 1.1.3 | Added | A menu down the side of an agent's settings (CHANGELOG.md:497) | section | 04-models-and-agents.md:405 |
| 1.1.3 | Added | An "Add a model" link under an agent's Model (CHANGELOG.md:498) | section | 04-models-and-agents.md:419 |
| 1.1.3 | Changed | Every agent may ask for more tools, existing ones included (CHANGELOG.md:505) | section | 04-models-and-agents.md:487 |
| 1.1.3 | Changed | New agents start with Orknux access on (CHANGELOG.md:506) | section | 04-models-and-agents.md:1314 |
| 1.1.3 | Changed | A box has a name only (CHANGELOG.md:507) | section | 04-models-and-agents.md:1398 |
| 1.1.3 | Changed | An agent's Boxes grant is a list of ticks (CHANGELOG.md:508) | section | 04-models-and-agents.md:1398 |

### Models and providers (16)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| 1.2.0 | Added | A model's speed over time (CHANGELOG.md:93) | section | 04-models-and-agents.md:245 |
| 1.2.0 | Added | Model speed (CHANGELOG.md:150) | section | 04-models-and-agents.md:245 |
| 1.2.0 | Added | Export a model provider (CHANGELOG.md:165) | section | 04-models-and-agents.md:309 |
| 1.2.0 | Changed | A reasoning effort for OpenAI, OpenAI-compatible, llama.cpp and Ollama models, not only Azure (CHANGELOG.md:202) | section | 04-models-and-agents.md:143 |
| 1.1.8 | Added | Cache writes are counted and priced (CHANGELOG.md:323) | section | 04-models-and-agents.md:275 |
| 1.1.8 | Added | `orknux_update_model` and `orknux_start_task` (CHANGELOG.md:327) | section | 04-models-and-agents.md:1336 |
| 1.1.8 | Changed | Test on a model provider checks the form without saving it (CHANGELOG.md:340) | section | 04-models-and-agents.md:126 |
| 1.1.8 | Changed | Models are no longer offered as issue assignees (CHANGELOG.md:343) | section | 07-issues.md:424 |
| 1.1.6 | Added | A price for cached input (CHANGELOG.md:379) | section | 04-models-and-agents.md:275 |
| 1.1.5 | Added | Models exported and imported between workspaces (CHANGELOG.md:423) | section | 04-models-and-agents.md:304 |
| 1.1.5 | Added | Cached input on the model page and in Tokens by person (CHANGELOG.md:428) | section | 04-models-and-agents.md:275 |
| 1.1.4 | Changed | OpenAI-compatible, Ollama and llama.cpp providers work without an API key (CHANGELOG.md:471) | section | 04-models-and-agents.md:68 |
| 1.1.3 | Added | A model's page says what uses it (CHANGELOG.md:491) | section | 02-workflows.md:959 |
| 1.1.3 | Added | Picking a model a llama.cpp server offers fills its context window (CHANGELOG.md:494) | section | 04-models-and-agents.md:139 |
| 1.1.1 | Added | An access token can be read-only (CHANGELOG.md:561) | section | 08-administration.md:274 |
| 1.1.1 | Changed | Access tokens are a table (CHANGELOG.md:565) | section | 08-administration.md:261 |

### Administration and security (36)

| Version | Kind | Entry | Manual | Where |
|---|---|---|---|---|
| Unreleased | Added | A Refresh button beside Auto (CHANGELOG.md:44) | section | 15-research.md:28 |
| Unreleased | Changed | A settings page's choices are drawn as its text fields are (CHANGELOG.md:50) | n/a | visual: a settings page's choices drawn as its fields are; nothing to do differently |
| 1.2.0 | Added | Tables in an imported PDF come in as tables (CHANGELOG.md:97) | section | 12-documents.md:47 |
| 1.2.0 | Added | Lists and merged cells in an imported PDF (CHANGELOG.md:98) | section | 12-documents.md:50 |
| 1.2.0 | Added | Admin Settings has a Limits heading (CHANGELOG.md:137) | section | 08-administration.md:599 |
| 1.2.0 | Added | The upload limit is set in Admin Settings (CHANGELOG.md:183) | section | 08-administration.md:783 |
| 1.2.0 | Changed | Analysis is called Explore (CHANGELOG.md:204) | section | 15-research.md:12 |
| 1.2.0 | Changed | Cross-site writes are refused (CHANGELOG.md:209) | section | 08-administration.md:1048 |
| 1.2.0 | Changed | An address typed without a scheme is taken as http (CHANGELOG.md:221) | section | 08-administration.md:1333 |
| 1.2.0 | Changed | A package is installed from a registry only with a SHA-256, -384 or -512 integrity, and its file only over https (CHANGELOG.md:222) | section | 08-administration.md:1079 |
| 1.2.0 | Changed | The web search key is a secret field like every other (CHANGELOG.md:228) | section | 05-variables.md:120 |
| 1.1.9 | Added | A part's dependency graph (CHANGELOG.md:275) | section | 02-workflows.md:986 |
| 1.1.9 | Added | Drawing in SVG (CHANGELOG.md:278) | section | 04-models-and-agents.md:1056 |
| 1.1.9 | Added | A field that reads a variable links to it (CHANGELOG.md:283) | section | 05-variables.md:110 |
| 1.1.8 | Added | A reference to a variable can be cleared (CHANGELOG.md:322) | section | 05-variables.md:70 |
| 1.1.8 | Added | The Users list shows when each person last signed in (CHANGELOG.md:324) | section | 08-administration.md:132 |
| 1.1.8 | Changed | Reading a secret back now takes a role (CHANGELOG.md:332) | section | 05-variables.md:19 |
| 1.1.8 | Changed | Basic auth sends a secret that is already base64-encoded as it is (CHANGELOG.md:338) | section | 04-models-and-agents.md:624 |
| 1.1.8 | Changed | Every choice in the interface opens the application's own list (CHANGELOG.md:339) | n/a | visual: every choice opens the application's own list |
| 1.1.8 | Changed | The import dialog opens wider and can be resized from any edge (CHANGELOG.md:344) | section | 04-models-and-agents.md:364 |
| 1.1.8 | Changed | The manual says what this release added (CHANGELOG.md:345) | n/a | meta: the manual itself was brought up to date for that release |
| 1.1.6 | Added | History says what each save changed (CHANGELOG.md:384) | section | 02-workflows.md:853 |
| 1.1.5 | Added | `app_link` and an installation address in Admin -> Settings (CHANGELOG.md:417) | section | 08-administration.md:795 |
| 1.1.4 | Changed | The top bar is in the alphabet's order (CHANGELOG.md:470) | section | 01-getting-started.md:122 |
| 1.1.3 | Added | A fresh installation starts with a workspace (CHANGELOG.md:482) | section | 01-getting-started.md:103 |
| 1.1.3 | Added | Test a connection before adding it (CHANGELOG.md:492) | section | 04-models-and-agents.md:1651 |
| 1.1.3 | Added | A plugin's connection kind can bring a setup guide, a check and a default address (CHANGELOG.md:493) | section | 04-models-and-agents.md:461 |
| 1.1.3 | Added | Save and Discard along the foot of every page that saves (CHANGELOG.md:496) | section | 01-getting-started.md:109 |
| 1.1.3 | Added | Used by is paged (CHANGELOG.md:499) | section | 02-workflows.md:957 |
| 1.1.3 | Added | The Updates page says why a chosen release was not started (CHANGELOG.md:500) | section | 17-desktop.md:130 |
| 1.1.3 | Added | The top bar shows your display name (CHANGELOG.md:501) | section | 01-getting-started.md:154 |
| 1.1.3 | Changed | Test Connection sits beside the status line under the form (CHANGELOG.md:509) | n/a | visual: Test Connection placed beside the status line |
| 1.1.3 | Changed | The release launcher skips a release built for a newer Java (CHANGELOG.md:511) | section | 17-desktop.md:122 |
| 1.1.2 | Added | A menu down the side of both settings pages (CHANGELOG.md:540) | section | 08-administration.md:374 |
| 1.1.2 | Added | A row of the Users list opens the user (CHANGELOG.md:541) | section | 08-administration.md:132 |
| 1.1.2 | Changed | A workspace's settings are its admins' to change (CHANGELOG.md:547) | section | 08-administration.md:52 |

