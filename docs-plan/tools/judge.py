"""Writes AUDIT.md: every Added and Changed entry since 1.1.0, judged by reading.

The verdicts are in `verdicts.tsv`, one row per changelog entry, keyed by the
entry's bold headline, written after reading the manual: *section* where the
feature has a heading or a paragraph of its own in the chapter that owns it,
*mention* where it is only said in passing, *none* where the manual is silent,
and *n/a* for an entry with nothing to tell a reader - a colour, a spacing, the
manual's own upkeep - with the reason. The evidence is a phrase from the
chapter, `file::phrase`, rather than a line number: it is looked up here each
time, so the audit reports the line as the chapter stands, and a phrase that is
no longer found turns its verdict to *none* - a section rewritten away cannot
keep claiming the coverage it had.

Usage: judge.py <rows.tsv from audit.py> <docs dir> <verdicts.tsv> <AUDIT.md out>
"""
import os
import re
import sys
from collections import Counter, defaultdict

rows_path, docs_dir, verdicts_path, out_path = sys.argv[1:5]

docs = {}
for name in sorted(os.listdir(docs_dir)):
    if name.endswith('.md') and not re.search(r'\.[a-z]{2}\.md$', name):
        docs[name] = open(os.path.join(docs_dir, name), encoding='utf-8').read().split('\n')

verdicts = {}
for line in open(verdicts_path, encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    head, verdict, where = line.rstrip('\n').split('\t')
    verdicts[head] = (verdict, where)


def locate(where):
    """`file::phrase` as `file:line`, or None where the phrase is no longer in the file."""
    name, _, phrase = where.partition('::')
    lines = docs.get(name)
    if lines is None:
        return None
    # A phrase may run across a line break in the chapter's wrapping.
    flat = ' '.join(lines)
    at = flat.find(phrase)
    if at < 0:
        return None
    count = 0
    for n, line in enumerate(lines, 1):
        count += len(line) + 1
        if count > at:
            return f'{name}:{n}'
    return None


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
    ('Chat', r'chat|composer|voice|sound|midi|music|latex|plan and auto|suggested repl|sentence completion|shell block|code block|message time|talking|unread|drop files|answer|avatar|accent'),
    ('Workflows and runs', r'workflow|node|canvas|\brun\b|run.s|condition|placeholder|field picker|trigger|webhook|object|function|cut, copy|rectangle|add menu|type filter'),
    ('Agents, tools and sessions', r'agent|tool|skill|box|schedule|reminder|session|memory|mcp|svg_read|sheet_read|pdf_|picture|artifact|progress'),
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
unjudged = []
lost = []
for line in open(rows_path, encoding='utf-8'):
    version, section, at, _, head, _, _ = line.rstrip('\n').split('\t')
    verdict, where = verdicts.get(head, ('none', ''))
    if head not in verdicts:
        unjudged.append(head)
    evidence = where
    if verdict in ('section', 'mention'):
        found = locate(where)
        if found is None:
            lost.append((head, where))
            verdict, evidence = 'none', f'no longer found: {where}'
        else:
            evidence = found
    rows.append(dict(version=version, section=section, at=at, area=area(head), head=head, verdict=verdict, evidence=evidence))

by_area = defaultdict(list)
for r in rows:
    by_area[r['area']].append(r)

total = Counter(r['verdict'] for r in rows)
with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('# Manual audit: 1.1.0 to Unreleased\n\n')
    f.write('Issue #684. Every **Added** and **Changed** entry in `CHANGELOG.md` from `## 1.1.0` up to and including\n')
    f.write('`## Unreleased`, and how the manual (`src/docs/*.md`) covers it. **Fixed** entries are left out: they\n')
    f.write('restore what the manual already says.\n\n')
    f.write('Judged by reading: *section* where the feature has a heading or a paragraph of its own in the chapter\n')
    f.write('that owns it, *mention* where it is said only in passing, *none* where the manual is silent, *n/a* for an\n')
    f.write('entry with nothing to tell a reader (a colour, a spacing, the manual\'s own upkeep). The verdicts and the\n')
    f.write('phrase each rests on are in `tools/verdicts.tsv`; `tools/judge.py` finds each phrase in the chapter as it\n')
    f.write('stands and writes its line here, and a phrase no longer found turns the entry to *none*.\n\n')
    f.write('Regenerate: `audit.py <root> rows.tsv`, then `judge.py rows.tsv src/docs tools/verdicts.tsv AUDIT.md`.\n\n')
    f.write(f'**{len(rows)} entries**: {total["section"]} section, {total["mention"]} mention, {total["none"]} none, '
            f'{total["n/a"]} n/a. Before the rewrite: 301 entries, 8 section, 47 mention, 246 none.\n\n')
    f.write('| Area | Entries | Section | Mention | None | n/a |\n|---|---:|---:|---:|---:|---:|\n')
    for name, _ in AREA_OF:
        items = by_area.get(name, [])
        if not items:
            continue
        c = Counter(r['verdict'] for r in items)
        f.write(f'| {name} | {len(items)} | {c["section"]} | {c["mention"]} | {c["none"]} | {c["n/a"]} |\n')
    f.write('\n## Every entry, by area\n\n')
    for name, _ in AREA_OF:
        items = by_area.get(name, [])
        if not items:
            continue
        f.write(f'### {name} ({len(items)})\n\n| Version | Kind | Entry | Manual | Where |\n|---|---|---|---|---|\n')
        for r in items:
            head = r['head'].replace('|', '\\|')
            kind = 'Added' if r['section'] == 'Added' else 'Changed'
            evidence = r['evidence'].replace('|', '\\|')
            f.write(f"| {r['version']} | {kind} | {head} (CHANGELOG.md:{r['at']}) | {r['verdict']} | {evidence} |\n")
        f.write('\n')

print(len(rows), dict(total))
for head in unjudged:
    print('NOT JUDGED:', head[:100])
for head, where in lost:
    print('LOST:', head[:70], '<-', where)
