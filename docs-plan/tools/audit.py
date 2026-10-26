"""Classifies every changelog entry since 1.1.0 by area and by how the manual covers it.

Coverage is looked up, not guessed: an entry's distinctive terms (backticked
names, quoted words, and the noun phrases of its headline) are searched for in
the manual; a hit on a heading is a section, a hit in body text is a mention,
no hit is none. The area verdicts in AUDIT.md are then checked by reading.
"""
import glob
import os
import re
import sys

root = sys.argv[1]
out = sys.argv[2]

docs = {}
for path in sorted(glob.glob(os.path.join(root, 'orknux-ui/src/docs/*.md'))):
    if re.search(r'\.[a-z]{2}\.md$', path):
        continue
    docs[os.path.basename(path)] = open(path, encoding='utf-8').read().split('\n')

lines = open(os.path.join(root, 'CHANGELOG.md'), encoding='utf-8').read().split('\n')
start = next(i for i, l in enumerate(lines) if l.startswith('## Unreleased'))
end = next(i for i, l in enumerate(lines) if l.startswith('## 1.0.9'))

AREAS = [
    ('Design: image editor & pictures', r'image editor|magic edit|harmoni[sz]e|upscal|brush|crop|blur|layers|clean up|feather|negative prompt|stable.diffusion|picture (being )?drawn|picture waiting|design, a new|open in design|longest image|numbers its pictures|draft until saved|rotate and mirror|import a picture'),
    ('Design: documents', r'document'),
    ('Design: wireframes', r'wireframe'),
    ('Design: videos', r'video|gif, mp4'),
    ('Explore: diagrams', r'diagram'),
    ('Explore: research', r'research'),
    ('Chat', r'chat|composer|voice|sound|midi|music|latex|plan and auto|suggested repl|sentence completion|shell block|code block|answer|message time|talking|unread'),
    ('Workflows', r'workflow|node|canvas|run\b|run\'s|condition|placeholder|field picker|trigger|webhook|object|function'),
    ('Agents, tools & sessions', r'agent|tool|skill|box|schedule|reminder|session|memory|mcp|plugin.s skill|svg_read|sheet_read|pdf_|picture_view|note to itself'),
    ('Models & providers', r'model|provider|price|cache|cached|token'),
    ('Workspaces, sharing & templates', r'workspace|sharing|member|template|bulk import|copying a|catalog|variable|secret'),
    ('Desktop app', r'desktop'),
    ('Reports & usage', r'report|usage|errors|rating'),
    ('Administration & security', r'admin|setting|limit|user|password|access token|cookie|cross-site|upload limit|orknux_[a-z_]+ ?=|ORKNUX_|network|update|release|https|registry|package|address|accent|top bar|quick actions|manual'),
    ('Artifacts', r'artifact'),
]

STOP = set('a an the and or of to in on at by for with is are be its it as from into its their your you can no not now than that this what when where who which over under up out one two more most each every own own'.split())


def area_of(text):
    low = text.lower()
    for name, pattern in AREAS:
        if re.search(pattern, low):
            return name
    return 'Other'


def terms_of(head, body):
    found = set(re.findall(r'`([^`]{3,40})`', head + ' ' + body[:400]))
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z\-']+", head) if w.lower() not in STOP]
    for i in range(len(words) - 1):
        found.add(words[i] + ' ' + words[i + 1])
    return [t for t in found if len(t) > 5]


def coverage(terms):
    best = ('none', '')
    for term in terms:
        rx = re.compile(re.escape(term), re.I)
        for name, body in docs.items():
            for n, line in enumerate(body, 1):
                if rx.search(line):
                    kind = 'section' if line.startswith('#') else 'mention'
                    if kind == 'section':
                        return ('section', f'{name}:{n} "{term}"')
                    if best[0] == 'none':
                        best = ('mention', f'{name}:{n} "{term}"')
    return best


rows = []
version = section = ''
for i in range(start, end):
    line = lines[i]
    if line.startswith('## '):
        version = line[3:].strip()
    elif line.startswith('### '):
        section = re.sub(r'[^A-Za-z]', '', line)
    elif line.startswith('- '):
        m = re.match(r'- \*\*(.+?)\*\*(.*)', line)
        head = (m.group(1) if m else line[2:160]).strip().rstrip('.:')
        body = m.group(2) if m else ''
        if section == 'Fixed':
            continue
        cov, where = coverage(terms_of(head, body))
        rows.append((version, section, i + 1, area_of(head + ' ' + body[:200]), head, cov, where))

with open(out, 'w', encoding='utf-8') as f:
    for r in rows:
        f.write('\t'.join(str(x) for x in r) + '\n')

from collections import Counter
print(len(rows), Counter(r[5] for r in rows))
by = Counter(r[3] for r in rows)
for area, n in by.most_common():
    c = Counter(r[5] for r in rows if r[3] == area)
    print(f'{area:40s} {n:4d}  none {c["none"]:3d}  mention {c["mention"]:3d}  section {c["section"]:3d}')
