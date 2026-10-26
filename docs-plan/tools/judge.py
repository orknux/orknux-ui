"""Writes AUDIT.md: every Added and Changed entry since 1.1.0, judged by reading.

Each entry starts as `none`. It is raised only by a rule below, written after
reading the manual, which names the line that covers it - a heading for a
section, body text for a mention. Term hits from audit.py are not trusted on
their own: "how long" and "says so" match everywhere.
"""
import re
import sys
from collections import Counter, defaultdict

rows_path, out_path = sys.argv[1], sys.argv[2]

# (pattern on the headline, verdict, evidence) - first match wins.
RULES = [
    # Chat (06-chat.md)
    (r'^Reasoning effort in the chat composer', 'section', '06-chat.md:38 "How hard it thinks is yours to choose"'),
    (r'^A chat shows what each answer cost', 'mention', '06-chat.md:96 Answer Cost (describes it as off; now on by default)'),
    (r'^Voice mode is always on the chat bar', 'section', '06-chat.md:152 "Talking to it"'),
    (r'^Talking while the model thinks', 'mention', '06-chat.md:211'),
    (r'^Talking over the answer waits', 'mention', '06-chat.md:186 settings table'),
    (r'^Attached files reach the agent', 'mention', '06-chat.md:122 "Attachments"'),
    (r'^A chat being named says so', 'mention', '06-chat.md:102'),
    (r'^A chat is named once at its start', 'mention', '06-chat.md:102 (naming only, not the every-N rule)'),
    (r'^A chat.s thinking is drawn where it happened', 'mention', '06-chat.md:83'),
    (r'^A chat.s header has one link to its session', 'mention', '06-chat.md:89'),
    # Workflows (02-workflows.md)
    (r'^The workflow list is ordered by a press', 'section', '02-workflows.md:8 "The list"'),
    (r'^Every quick-edit panel in the workflow editor links', 'mention', '02-workflows.md:120 "The way out"'),
    (r'^Used by is paged', 'mention', '02-workflows.md:595 Used by panel (paging not described)'),
    (r'^An agent is listed as used by the agents', 'mention', '02-workflows.md:595 Used by panel'),
    (r'^History says what each save changed', 'mention', '02-workflows.md:496 "What a component was" (no word on the change summary)'),
    (r'^A run of an older version says so', 'none', ''),
    # Models and agents (04-models-and-agents.md)
    (r'^Two provider settings decide how an agent reaches the tools', 'section', '04-models-and-agents.md:127 "What a provider is sent"'),
    (r'^An agent holding more tools than its provider takes', 'mention', '04-models-and-agents.md:739 "Finding a tool"'),
    (r'^A conversation sends the same tool array', 'mention', '04-models-and-agents.md:163'),
    (r'^Providers send up to 200 tools', 'mention', '04-models-and-agents.md:148 (states 128/256, out of date)'),
    (r'^A model.s own answer time limit|^Anthropic models follow the Model Answer', 'mention', '04-models-and-agents.md:176'),
    (r'^A price for cached input|^Cached input on the model page|^Cache writes are counted', 'mention', '04-models-and-agents.md:166 (cached input billed less; no prices section)'),
    (r'^Asking an agent again in the same conversation', 'mention', '04-models-and-agents.md:568 "Asking another agent"'),
    (r'^An agent may ask 25 other agents', 'mention', '08-administration.md:285 (Agents section named, number not)'),
    (r'^`agent_wait` no longer holds back', 'mention', '04-models-and-agents.md:577'),
    (r'^Schedules: a reminder an agent sets', 'mention', '04-models-and-agents.md:582 "Reminders" (the Schedules page is not named)'),
    (r'^A reminder an agent sets no longer holds', 'mention', '04-models-and-agents.md:594'),
    (r'^Boxes carry a required label again|^An agent.s Boxes grant is a list of ticks|^A box has a name only', 'section', '04-models-and-agents.md:840 "Letting an agent work in a box"'),
    (r'^The box tools take Offer and Always|^An agent.s orknux_ tools can be set to Offer|^A new agent starts most of the server.s specialised tools at Offer|^The server.s own tools can be set to Offer', 'mention', '04-models-and-agents.md:675 (says all start Always - out of date)'),
    (r'^Basic auth sends a secret that is already base64', 'section', '04-models-and-agents.md:354 Auth table'),
    (r'^An MCP server can be tested in the Add dialog', 'none', ''),
    (r'^Every agent may ask for more tools|^An agent can ask for the tools it lacks', 'mention', '04-models-and-agents.md:739 tool_find/tool_load'),
    (r'^New agents start with Orknux access on', 'mention', '04-models-and-agents.md:802 (says off for every agent - out of date)'),
    (r'^A file out of a box as itself', 'mention', '04-models-and-agents.md:875 orkbox_export'),
    (r'^An agent can draw a picture for its own eyes', 'none', ''),
    (r'^A wireframe an agent draws in a chat is shown', 'none', ''),
    (r'^Wireframes in Design', 'mention', '04-models-and-agents.md:829 (the orknux_ wireframe tools only; the editor is not described)'),
    (r'^Progress messages None is held to', 'none', ''),
    (r'^A connection may be granted to every new agent', 'mention', "04-models-and-agents.md:252 (an administrator's default connection; the grant to new agents is not described)"),
    (r'^Workspace variables inside placeholders', 'mention', '02-workflows.md:417 Workspace variables group (placeholders themselves denied at 02:407)'),
    (r'^A Building workflows skill', 'mention', '04-models-and-agents.md:808 "Building a workflow" (the tools; the skill is not named)'),
    # Administration (08-administration.md)
    (r'^Admin Settings has a Limits heading', 'mention', '08-administration.md:284 lists the old section names'),
    (r'^The Updates page says why a chosen release', 'mention', '08-administration.md (Updating the server, ~line 1000)'),
    (r'^An access token can be read-only', 'none', ''),
    (r'^Access tokens are a table', 'mention', '08-administration.md:186 "Access tokens" (no table, no read-only)'),
    (r'^An access token can no longer make another token', 'none', ''),
    (r'^Setting somebody.s password, or changing your own, ends', 'mention', '08-administration.md:99 (reset only)'),
    (r'^`app_link` and an installation address', 'mention', '08-administration.md:140 base-url (not app_link)'),
    (r'^A workspace.s settings are its admins.', 'none', ''),
    # Getting started
    (r'^Quick actions finds documents|^Quick actions finds a diagram', 'mention', '01-getting-started.md:150 "Finding things" (documents and diagrams not named)'),
    (r'^Analysis is called Explore', 'mention', '01-getting-started.md:116'),
    (r'^Explore > Research', 'mention', '01-getting-started.md:116 (one line)'),
    (r'^The top bar is in the alphabet', 'mention', '01-getting-started.md:110 (order and names out of date: no Design, says Workflow for Flow)'),
    (r'^The top bar shows your display name', 'none', ''),
    (r'^Message times are shown in every chat by default', 'none', ''),
]

AREA_OF = [
    ('Design - Images and the image editor', r'image editor|magic edit|harmoni[sz]e|upscal|brush|crop\b|blur|layers|clean up|feather|negative prompt|stable.diffusion|picture being drawn|picture waiting|design, a new|open in design|longest image|numbers its pictures|draft until saved|rotate and mirror|import a picture'),
    ('Design - Documents', r'document'),
    ('Design - Wireframes', r'wireframe'),
    ('Design - Videos', r'video|gif, mp4'),
    ('Explore - Diagrams', r'diagram'),
    ('Explore - Research', r'research'),
    ('Desktop app', r'desktop'),
    ('Reports and usage', r'report|usage chart|errors report|rating|reviews'),
    ('Templates, sharing and workspaces', r'template|sharing|member|bulk import|copying a workspace|another catalog|workspace variables inside'),
    ('Chat', r'chat|composer|voice|sound|midi|music|latex|plan and auto|suggested repl|sentence completion|shell block|code block|message time|talking|unread|drop files|answer'),
    ('Workflows and runs', r'workflow|node|canvas|\brun\b|run.s|condition|placeholder|field picker|trigger|webhook|object|function|cut, copy|rectangle|add menu|type filter'),
    ('Agents, tools and sessions', r'agent|tool|skill|box|schedule|reminder|session|memory|mcp|svg_read|sheet_read|pdf_|picture'),
    ('Models and providers', r'model|provider|price|cache|cached|token'),
    ('Administration and security', r'.'),
]


def area(head):
    low = head.lower()
    for name, pattern in AREA_OF:
        if re.search(pattern, low):
            return name
    return 'Administration and security'


rows = []
for line in open(rows_path, encoding='utf-8'):
    version, section, at, _, head, _, hit = line.rstrip('\n').split('\t')
    verdict, evidence = 'none', ''
    for pattern, v, e in RULES:
        if re.search(pattern, head):
            verdict, evidence = v, e
            break
    rows.append(dict(version=version, section=section, at=at, area=area(head), head=head, verdict=verdict, evidence=evidence, hit=hit))

by_area = defaultdict(list)
for r in rows:
    by_area[r['area']].append(r)

total = Counter(r['verdict'] for r in rows)
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('# Manual audit: 1.1.0 to Unreleased\n\n')
    f.write('Issue #684. Every **Added** and **Changed** entry in `CHANGELOG.md` from `## 1.1.0` up to and including\n')
    f.write('`## Unreleased`, and how the manual (`src/docs/*.md`) covers it today. **Fixed** entries are left out: they\n')
    f.write('restore what the manual already says, and the ones that change behaviour are folded into the sections below.\n\n')
    f.write('How it was judged: every entry starts as *none*. It is raised to *mention* or *section* only where the\n')
    f.write('manual was read and the line that covers it is quoted. A *section* is a heading of its own about the\n')
    f.write('feature; a *mention* is a sentence or a paragraph somewhere else, often out of date (said so where it is).\n')
    f.write('The term search `audit.py` ran first matched "how long" and "says so" everywhere and is not a verdict.\n\n')
    f.write(f'**{len(rows)} entries**: {total["none"]} none, {total["mention"]} mention, {total["section"]} section.\n\n')
    f.write('| Area | Entries | None | Mention | Section |\n|---|---:|---:|---:|---:|\n')
    for name, _ in AREA_OF:
        items = by_area.get(name, [])
        if not items:
            continue
        c = Counter(r['verdict'] for r in items)
        f.write(f'| {name} | {len(items)} | {c["none"]} | {c["mention"]} | {c["section"]} |\n')
    f.write('\n')
    f.write('## Pages the manual never names\n\n')
    f.write('Read off `src/navigation.ts` against the nine chapters:\n\n')
    for page in [
        '`/design/images`, `/design/images/:id/edit` - the Images page and the image editor (1.1.4 onward)',
        '`/design/documents`, `/design/documents/:id`, `/design/documents/:id/view` - documents (1.2.0)',
        '`/design/wireframes`, `/design/wireframes/:id` - the wireframe editor (1.2.0; only its agent tools are named, 04:829)',
        '`/design/videos`, `/design/videos/:id`, `/design/videos/new` - videos (1.2.0)',
        '`/explore/diagrams`, `/explore/diagrams/:id`, `/explore/diagrams/:id/settings` - diagrams (1.2.0)',
        '`/explore/research`, `/explore/research/:id` - research (1.2.0; one line in 01:116)',
        '`/schedules` - the Schedules page (1.1.5)',
        '`/admin/reports` - Reports: tokens by person, usage charts, the Errors report (1.1.2, 1.1.6, 1.1.8, 1.1.9)',
        '`/admin/templates`, `/admin/templates/:id` - templates of models, connections and MCP servers (1.1.8, 1.2.0)',
        'The desktop app (1.1.3, 1.2.0) - no page of its own, and no word in the manual beyond `orknux-one`',
    ]:
        f.write(f'- {page}\n')
    f.write('\nAnd one that is named wrongly: `01-getting-started.md:110` lists the top bar as AI, Explore, Workflow, Workspace and Chat.\n')
    f.write('The product draws AI, Chat, Design, Explore, Flow and Workspace (`TOP_SECTIONS`, navigation.ts:82).\n\n')
    f.write('## Out of date where it does speak\n\n')
    for stale in [
        '`02-workflows.md:407` says *"There are no placeholders and no template syntax"*: 1.1.5 added placeholders in any written node value, 1.1.8 workspace variables inside them.',
        '`04-models-and-agents.md:675` says every built-in starts *on and Always*: since 1.2.0 a new agent starts most specialised tools at Offer.',
        '`04-models-and-agents.md:802` says Orknux access is *off for every agent*: since 1.1.3 new agents start with it on.',
        '`04-models-and-agents.md:148` gives 128/256 tools per request: 1.1.8 made it 200 by default.',
        '`06-chat.md:96` describes Answer Cost as something you turn on: since 1.2.3 (Unreleased) it is on for everybody.',
        '`06-chat.md:102` says a chat is named from its first words; 1.1.5 renames it every N exchanges.',
    ]:
        f.write(f'- {stale}\n')
    f.write('\n## Every entry, by area\n\n')
    for name, _ in AREA_OF:
        items = by_area.get(name, [])
        if not items:
            continue
        f.write(f'### {name} ({len(items)})\n\n| Version | Kind | Entry | Manual | Where |\n|---|---|---|---|---|\n')
        for r in items:
            head = r['head'].replace('|', '\\|')
            kind = 'Added' if r['section'] == 'Added' else 'Changed'
            f.write(f"| {r['version']} | {kind} | {head} (CHANGELOG.md:{r['at']}) | {r['verdict']} | {r['evidence']} |\n")
        f.write('\n')

print(len(rows), total)
for name, _ in AREA_OF:
    items = by_area.get(name, [])
    c = Counter(r['verdict'] for r in items)
    print(f'{name:42s} {len(items):4d} none {c["none"]:3d} mention {c["mention"]:3d} section {c["section"]:3d}')
