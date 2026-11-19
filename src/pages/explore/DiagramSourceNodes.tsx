import { useMemo } from 'react';
import core from 'highlight.js/lib/core';
import xmlLanguage from 'highlight.js/lib/languages/xml';
import bashLanguage from 'highlight.js/lib/languages/bash';
import cLanguage from 'highlight.js/lib/languages/c';
import cppLanguage from 'highlight.js/lib/languages/cpp';
import csharpLanguage from 'highlight.js/lib/languages/csharp';
import cssLanguage from 'highlight.js/lib/languages/css';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import diffLanguage from 'highlight.js/lib/languages/diff';
import rubyLanguage from 'highlight.js/lib/languages/ruby';
import goLanguage from 'highlight.js/lib/languages/go';
import graphqlLanguage from 'highlight.js/lib/languages/graphql';
import iniLanguage from 'highlight.js/lib/languages/ini';
import javaLanguage from 'highlight.js/lib/languages/java';
import javascriptLanguage from 'highlight.js/lib/languages/javascript';
import jsonLanguage from 'highlight.js/lib/languages/json';
import kotlinLanguage from 'highlight.js/lib/languages/kotlin';
import lessLanguage from 'highlight.js/lib/languages/less';
import luaLanguage from 'highlight.js/lib/languages/lua';
import makefileLanguage from 'highlight.js/lib/languages/makefile';
import perlLanguage from 'highlight.js/lib/languages/perl';
import objectivecLanguage from 'highlight.js/lib/languages/objectivec';
import phpLanguage from 'highlight.js/lib/languages/php';
import pythonLanguage from 'highlight.js/lib/languages/python';
import rLanguage from 'highlight.js/lib/languages/r';
import rustLanguage from 'highlight.js/lib/languages/rust';
import scssLanguage from 'highlight.js/lib/languages/scss';
import shellLanguage from 'highlight.js/lib/languages/shell';
import sqlLanguage from 'highlight.js/lib/languages/sql';
import swiftLanguage from 'highlight.js/lib/languages/swift';
import yamlLanguage from 'highlight.js/lib/languages/yaml';
import typescriptLanguage from 'highlight.js/lib/languages/typescript';
import { t, tf } from '../../i18n';
import { codeSourceOf, jiraKeyOf } from '../../api/diagrams';
import type { DiagramSource } from '../../api/diagrams';
import styles from './DiagramEditorPage.module.css';

/**
 * Code and Jira shapes: what they read, drawn from the copy the page holds.
 * They never read anything themselves - the editor reads, lazily, after the
 * diagram is drawn, and hands each its copy - so a shape not read yet is
 * drawn quietly as what it will show, never as an error.
 */

/**
 * A highlighter of the code shapes' own, with the languages files are written
 * in. Not highlight.js's shared one: `highlight.js/lib/common` registers its
 * `bash` there as a side effect of being imported, which replaced the command
 * line grammar the MCP dialog registers - and its Claude Code command came out
 * in two colours instead of three.
 */
const hljs = core.newInstance();
for (const [name, language] of Object.entries({
  'xml': xmlLanguage,
  'bash': bashLanguage,
  'c': cLanguage,
  'cpp': cppLanguage,
  'csharp': csharpLanguage,
  'css': cssLanguage,
  'markdown': markdownLanguage,
  'diff': diffLanguage,
  'ruby': rubyLanguage,
  'go': goLanguage,
  'graphql': graphqlLanguage,
  'ini': iniLanguage,
  'java': javaLanguage,
  'javascript': javascriptLanguage,
  'json': jsonLanguage,
  'kotlin': kotlinLanguage,
  'less': lessLanguage,
  'lua': luaLanguage,
  'makefile': makefileLanguage,
  'perl': perlLanguage,
  'objectivec': objectivecLanguage,
  'php': phpLanguage,
  'python': pythonLanguage,
  'r': rLanguage,
  'rust': rustLanguage,
  'scss': scssLanguage,
  'shell': shellLanguage,
  'sql': sqlLanguage,
  'swift': swiftLanguage,
  'yaml': yamlLanguage,
  'typescript': typescriptLanguage,
})) {
  hljs.registerLanguage(name, language);
}

/** A file's extension, as highlight.js knows it; where it knows none, the lines are drawn plain. */
function languageOf(path: string): string | undefined {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  const said = (dot > 0 ? name.slice(dot + 1) : name).toLowerCase();
  const known = { kts: 'kotlin', tsx: 'typescript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', yml: 'yaml', htm: 'xml', html: 'xml', svg: 'xml', sh: 'bash', zsh: 'bash', gradle: 'kotlin', dockerfile: 'bash' } as Record<string, string>;
  const language = known[said] ?? said;
  return hljs.getLanguage(language) === undefined ? undefined : language;
}

/** The lines as highlighted HTML, one string per line, so each can carry its number. Spans that run across a line break are closed and opened again. */
function highlightedLines(text: string, language: string | undefined): string[] {
  const escaped = (said: string) => said.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (language === undefined) return text.split('\n').map(escaped);
  const html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  const lines: string[] = [];
  const open: string[] = [];
  let line = '';
  for (const piece of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (piece === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
    } else if (piece.startsWith('<span')) {
      open.push(piece);
      line += piece;
    } else if (piece === '</span>') {
      open.pop();
      line += piece;
    } else {
      line += piece;
    }
  }
  lines.push(line);
  return lines;
}

/** What a stale or failed copy says on its caption: when it was read, and why the last read did not work. */
function stateOf(read: DiagramSource | undefined): string | null {
  if (read === undefined) return null;
  if (read.failed !== null) return tf('The last read failed: {reason}', { reason: read.failed });
  if (read.stale && read.body !== null) return t('Being read again');
  return null;
}

export function CodeNode({ source, label, read, size }: { source?: string; label: string; read?: DiagramSource; size?: number }) {
  const file = source === undefined ? null : codeSourceOf(source);
  const language = file === null ? undefined : languageOf(file.path);
  const lines = useMemo(() => (read?.body == null ? null : highlightedLines(read.body, language)), [read?.body, language]);
  const range = file?.fromLine === undefined ? '' : file.toLine !== undefined && file.toLine !== file.fromLine ? `:${file.fromLine}–${file.toLine}` : `:${file.fromLine}`;
  const caption = label !== '' ? label : file === null ? t('Code') : `${file.path.split('/').pop()}${range}`;
  const state = stateOf(read);
  const first = file?.fromLine ?? 1;
  return (
    <div className={styles.codeNode} data-testid="diagram-node-shape" data-kind="code">
      <div className={styles.codeNodeCaption}>
        <span className={styles.codeNodeName} title={file === null ? undefined : `${file.owner}/${file.repo} · ${file.path} · ${file.ref}`}>
          {caption}
        </span>
        {language !== undefined && <span className={styles.codeNodeLanguage}>{language}</span>}
        {state !== null && <span className={`${styles.codeNodeState} ${read?.failed != null ? styles.codeNodeFailed : ''}`} title={state} aria-label={state} data-testid="diagram-code-state" />}
        {source !== undefined && file !== null && (
          <a
            className={`nodrag nopan ${styles.codeNodeOpen}`}
            href={source}
            target="_blank"
            rel="noreferrer noopener"
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={t('Open on GitHub')}
            title={t('Open on GitHub')}
          >
            ↗
          </a>
        )}
      </div>
      {lines === null ? (
        <span className={styles.codeNodeEmpty} data-testid="diagram-code-empty">
          {file === null ? t('Paste a GitHub file’s address in the side panel') : read !== undefined && !read.configured ? t('Needs the GitHub plugin - see Workspace → Settings') : read?.failed != null ? read.failed : t('Not read yet')}
        </span>
      ) : (
        <pre className={`nowheel ${styles.codeNodeLines}`} style={size === undefined ? undefined : { fontSize: size, lineHeight: `${Math.round(size * 1.45)}px` }} data-testid="diagram-code-lines">
          {lines.map((html, at) => (
            <span key={at} className={styles.codeNodeLine}>
              <span className={styles.codeNodeNumber}>{first + at}</span>
              {/* highlight.js escapes the code itself; what it adds is its own spans. */}
              <span dangerouslySetInnerHTML={{ __html: html === '' ? ' ' : html }} />
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

/** One field of an issue as the Jira plugin answers it: a string, or an object with a name. */
function fieldOf(issue: Record<string, unknown> | null, name: string): string | null {
  const value = issue?.[name];
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (value !== null && typeof value === 'object') {
    const named = (value as Record<string, unknown>).name ?? (value as Record<string, unknown>).displayName;
    if (typeof named === 'string' && named.trim() !== '') return named;
  }
  return null;
}

export function JiraNode({ source, label, read, size, fill, ink }: { source?: string; label: string; read?: DiagramSource; size?: number; fill?: string; ink?: string }) {
  const issue = useMemo(() => {
    if (read?.body == null) return null;
    try {
      const parsed = JSON.parse(read.body) as unknown;
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [read?.body]);
  const key = fieldOf(issue, 'key') ?? (source === undefined ? null : jiraKeyOf(source)) ?? t('Jira issue');
  const summary = fieldOf(issue, 'summary') ?? (label !== '' ? label : null);
  const status = fieldOf(issue, 'status');
  const url = fieldOf(issue, 'url') ?? fieldOf(issue, 'issue');
  const foot = [fieldOf(issue, 'type'), fieldOf(issue, 'priority'), fieldOf(issue, 'assignee')].filter((said) => said !== null).join(' · ');
  const state = stateOf(read);
  const words = size === undefined ? undefined : { fontSize: size, lineHeight: `${Math.max(size + 2, Math.round((size * 18) / 14))}px` };
  return (
    <div className={styles.jiraNode} style={fill === undefined ? undefined : { background: fill, color: ink }} data-testid="diagram-node-shape" data-kind="jira">
      <div className={styles.jiraNodeTop}>
        <span className={styles.jiraNodeKey} style={words}>
          {key}
        </span>
        {status !== null && (
          <span className={styles.jiraNodeStatus} data-testid="diagram-jira-status">
            {status}
          </span>
        )}
        {state !== null && <span className={`${styles.codeNodeState} ${read?.failed != null ? styles.codeNodeFailed : ''}`} title={state} aria-label={state} data-testid="diagram-code-state" />}
        {url !== null && /^https?:\/\//i.test(url) && (
          <a
            className={`nodrag nopan ${styles.jiraNodeOpen}`}
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={tf('Open {name}', { name: key })}
            title={tf('Open {name}', { name: key })}
          >
            ↗
          </a>
        )}
      </div>
      <span className={styles.jiraNodeSummary} style={words} data-testid="diagram-jira-summary">
        {summary ??
          (source === undefined
            ? t('Paste an issue key or its address in the side panel')
            : read !== undefined && !read.configured
              ? t('Needs the Jira plugin - see Workspace → Settings')
              : read?.failed ?? t('Not read yet'))}
      </span>
      {foot !== '' && <span className={styles.jiraNodeFoot}>{foot}</span>}
    </div>
  );
}
