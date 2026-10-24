import { memo, useMemo, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import dos from 'highlight.js/lib/languages/dos';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import styles from './Markdown.module.css';
import { ArtifactMiniature } from './ArtifactMiniature';
import { CopyButton } from './CopyButton';
import { RunnableCode } from './RunnableCode';
import type { CommandRunOffer } from '../api/commands';
import { commandLine } from './shellGrammar';
import { ImageZoom } from './ImageZoom';
import type { Picture } from './ImageZoom';
import { rehypeIssueLinks } from './issueLinks';
import { markTree } from './Highlighted';
import { normaliseMath } from './markdownMath';
import { t } from '../i18n';

/**
 * The languages worth carrying, named one by one.
 *
 * The plugin's default is highlight.js's "common" set — some thirty grammars,
 * most of which nothing here will ever write. These are what the manual uses
 * and what a model answering about this project writes back: the shells and
 * config formats of the documentation, and the languages the product itself is
 * made of.
 *
 * `xml` is what highlight.js calls HTML too. `bash` is highlight.js's own with
 * the command names coloured as well - see `commandLine` - and the three after
 * it are the other ways a model writes a command: `shell` (or `console`) for a
 * session with prompts, `powershell` and `dos` (`cmd`, `bat`) for Windows.
 */
const LANGUAGES = {
  bash: commandLine,
  shell,
  powershell,
  dos,
  java,
  javascript,
  json,
  kotlin,
  python,
  sql,
  typescript,
  xml,
  yaml,
};

export interface MarkdownProps {
  /** What the model wrote, in the markdown it wrote it in. */
  children: string;
  /**
   * Where `#12` in the prose points, when it points anywhere.
   *
   * A tracker's own shorthand only works if it is a link: people write "see
   * #12" because that is how it is said out loud, and then it is a number
   * somebody has to copy into a URL by hand. Given a workspace, those become
   * links; given none - the chat, the manual - they stay as written, because
   * `#1` in an answer about HTTP status codes is not an issue.
   */
  issuesIn?: string;
  /**
   * The words to mark wherever they appear in the prose, as `termsOf` gives
   * them. Left out everywhere nothing is being searched for, which is every use
   * of this but the skills page; a change to them never parses the text again -
   * see `markTree`.
   */
  highlight?: readonly string[];
  /**
   * Whether a picture in the prose opens larger when it is clicked.
   *
   * On for the manual, where a screenshot of a 1440-wide application is drawn
   * into a column half that width and the labels it was taken to show cannot be
   * read (issue #217). On for a task's outcome too, and for the same reason
   * rather than for a new one: since #283 a task can draw, and what it drew is
   * the thing that was asked for, arriving in a card narrower than the picture.
   *
   * Off elsewhere by default. A chat's own drawing does not need it — the
   * answer bubble is the width of the conversation and the composer is right
   * there to ask for another — and an issue's attachments are looked at through
   * the viewer the attachment list opens, which can step between them.
   */
  zoomImages?: boolean;
  /**
   * Whether links to pictures are also shown as pictures, under the prose.
   *
   * A model asked for images answers with links to them - it has no bytes to
   * attach, so `[BMW i4](https://…/i4.jpg)` is the whole of what it can write -
   * and a list of six blue link titles is not what was asked for. The links
   * stay exactly as written, because the title is what says which car it is;
   * a strip of thumbnails is added beneath, so the answer can be looked at
   * rather than clicked through six tabs.
   *
   * Only where a model writes: the chat, a task's outcome. The manual's links
   * point at pages, and an issue's pictures are attachments with a viewer of
   * their own.
   */
  pictureLinks?: boolean;
  /**
   * Whether a single newline is a line break, as in a chat. Off for a document
   * somebody wrapped by hand - a plugin's setup guide - where it is only where
   * their editor ran out of width.
   */
  lineBreaks?: boolean;
  /**
   * The shell blocks that carry Run, by the language they were tagged: what
   * the server offers this person. Passed by the chat and by nothing else - the
   * manual and the tracker never run anything - and left out, or offering no
   * language, every block is drawn with Copy alone.
   */
  runnable?: CommandRunOffer;
}

/**
 * An answer, rendered as the markdown it is.
 *
 * Models write markdown whether or not anything renders it, so showing the
 * source means showing `**like this**` and a wall of backticks around every
 * code block. GFM is on for the tables and fenced code that answers actually
 * use.
 *
 * `remark-breaks` because this is a chat, not a document. Markdown proper joins
 * lines separated by a single newline, so a model asked to count to ten answers
 * on ten lines and reads as one — which is what the plain `white-space:
 * pre-wrap` this replaced got right. A newline the model wrote is a newline it
 * meant.
 *
 * Raw HTML stays off — `react-markdown` ignores it unless `rehype-raw` is
 * added, and it is not. Model output is untrusted text: it arrives from a
 * provider, and a prompt can ask for anything at all, so it renders as markup
 * only for the constructs markdown itself defines.
 */
/**
 * A URL that ends in a picture.
 *
 * By extension rather than by asking the host, because asking means a request
 * per link to somewhere nobody chose to go. A query string is allowed after it
 * - signed URLs and CDNs carry one - and the extension is the last thing before
 * it.
 */
const PICTURE_URL = /https?:\/\/[^\s)<>"']+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?[^\s)<>"']*)?/gi;

/** A markdown link, so the words it was written with can be kept. */
const TITLED_LINK = /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g;

/** A picture a strip shows, and what the prose called it. */
export interface PictureLink {
  url: string;
  /** The link's own words, or empty where it was written as a bare URL. */
  title: string;
}

/** As many as a strip holds before it is a page of its own. */
const MOST_PICTURES = 12;

/**
 * The pictures an answer links to, in the order it links to them.
 *
 * Links only. One the model wrote as an image - `![](…)` - is already drawn by
 * the prose, and drawing it twice reads as a bug rather than as a gallery, so
 * those are left out by looking at the character before the `(`.
 */
export function pictureLinksIn(markdown: string): PictureLink[] {
  // The images the prose already draws, taken out before anything is looked
  // for, so what is left is only what a reader would have to click.
  const linked = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');

  /*
   * What the link was called, by URL.
   *
   * The title is the whole reason a strip beats a row of pictures: six cars
   * look alike at 130 pixels and "Rolls-Royce Spectre" is what says which one
   * this is. Markdown's own link syntax is where it is written; a bare URL in
   * the prose has no title and is shown without one rather than with its file
   * name, which is a hash as often as it is a word.
   */
  const titles = new Map<string, string>();
  for (const hit of linked.matchAll(TITLED_LINK)) {
    const url = hit[2].trim();
    const title = hit[1].replace(/[*_`]/g, '').trim();
    if (title !== '' && !titles.has(url)) titles.set(url, title);
  }

  const found: PictureLink[] = [];
  for (const hit of linked.matchAll(PICTURE_URL)) {
    // Trailing punctuation belongs to the sentence, not to the URL.
    const url = hit[0].replace(/[).,]+$/, '');
    if (found.some((one) => one.url === url)) continue;
    found.push({ url, title: titles.get(url) ?? '' });
    if (found.length === MOST_PICTURES) break;
  }
  return found;
}

/**
 * A link to a file an agent saved: this server's `/api/artifacts/{n}`, with or
 * without the host in front and with or without `/preview` after. The host is
 * dropped, because the address a model was handed names the server's base URL
 * and the bytes are asked of this page's own origin either way.
 */
const ARTIFACT_URL = /(?:https?:\/\/[^\s)<>"'/]+)?\/api\/artifacts\/(\d+)(?:\/preview)?(?![\w/])/g;

/** A saved artifact an answer links to, and what the link called it. */
export interface ArtifactLink {
  id: string;
  title: string;
}

/**
 * The saved artifacts an answer links to, in the order it links to them.
 *
 * Every door, not only the answers that draw picture strips: a task's log is
 * where an agent says "saved it here", and that line is the one somebody reads
 * to find the file.
 */
export function artifactLinksIn(markdown: string): ArtifactLink[] {
  const titles = new Map<string, string>();
  for (const hit of markdown.matchAll(TITLED_LINK)) {
    const id = [...hit[2].matchAll(ARTIFACT_URL)][0]?.[1];
    // Emphasis around the title goes; an underscore inside a filename stays.
    const title = hit[1].replace(/[*`]/g, '').trim().replace(/^_+|_+$/g, '');
    if (id !== undefined && title !== '' && !titles.has(id)) titles.set(id, title);
  }

  const found: ArtifactLink[] = [];
  for (const hit of markdown.matchAll(ARTIFACT_URL)) {
    if (found.some((one) => one.id === hit[1])) continue;
    found.push({ id: hit[1], title: titles.get(hit[1]) ?? '' });
    if (found.length === MOST_PICTURES) break;
  }
  return found;
}

/** The words of a rendered node, highlighting and all taken off: what a fenced block's Copy puts on the clipboard. */
interface TextNode {
  type?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: TextNode[];
}

/** The language a fenced block named, read off its code's `language-…` class; empty where it named none. */
function languageOf(node: TextNode | undefined): string {
  const classes = node?.children?.[0]?.properties?.className;
  const named = Array.isArray(classes) ? classes.find((one): one is string => typeof one === 'string' && one.startsWith('language-')) : undefined;
  return named?.slice('language-'.length) ?? '';
}
function textOf(node: TextNode | undefined): string {
  if (node === undefined) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** The plugin list, exactly as the renderer that takes it declares it. */
type RehypePlugins = ComponentProps<typeof ReactMarkdown>['rehypePlugins'];

/**
 * Kept from one render to the next while its words and options stay the same: a list of skills drew every card's
 * markdown again on each letter typed into its search, and parsing them held the box up for most of a second.
 */
export const Markdown = memo(MarkdownBody, (before, after) => {
  for (const key of Object.keys({ ...before, ...after }) as (keyof MarkdownProps)[]) {
    if (key === 'highlight') continue;
    if (before[key] !== after[key]) return false;
  }
  // The words by what they are, since a page makes a new list of the same words on every render.
  return (before.highlight ?? []).join(' ') === (after.highlight ?? []).join(' ');
});

/** Nothing to mark: one list for every caller that passes none, so the marking below is not redone for it. */
const NO_TERMS: readonly string[] = [];

function MarkdownBody({
  children,
  highlight = NO_TERMS,
  issuesIn,
  zoomImages = false,
  pictureLinks = false,
  lineBreaks = true,
  runnable,
}: MarkdownProps) {
  /** Which picture is open over the page, or null while none is. */
  const [zoomed, setZoomed] = useState<Picture | null>(null);
  /*
   * The pictures whose bytes did not come back.
   *
   * A chat can now hold a picture it drew, and that picture is an attachment
   * like any other: deleted, or on an installation whose attachment directory
   * has been moved out from under it, the link answers 404 and the browser draws
   * its broken-image icon - which says this page is broken rather than that the
   * file is gone. One line saying so is the truth, and it belongs here rather
   * than in the chat, because a manual page whose screenshot is missing has
   * exactly the same problem.
   */
  const [missing, setMissing] = useState<string[]>([]);

  /*
   * The picture links whose bytes did not come back.
   *
   * These point at somebody else's server - a model writes the URL it read
   * somewhere - so a dead one is ordinary rather than a fault here. It leaves
   * the strip without a word: the link is still in the prose above, which is
   * where the explanation belongs.
   */
  const [broken, setBroken] = useState<string[]>([]);

  /** Rebuilt only when the prose changes, not on every open picture. */
  const gallery = useMemo(
    () => (pictureLinks ? pictureLinksIn(children).filter((one) => !broken.includes(one.url)) : []),
    [pictureLinks, children, broken],
  );

  /** Rebuilt only when the prose changes. */
  const artifacts = useMemo(() => artifactLinksIn(children), [children]);

  /** The source with its maths in the one spelling remark-math reads; see normaliseMath. */
  const mathed = useMemo(() => normaliseMath(children), [children]);

  /*
   * Rebuilt only when the workspace changes. The search's words are not in here,
   * because a plugin list that changed with every letter would have
   * react-markdown parse the document again on every keystroke - see `marked`.
   */
  const rehypePlugins = useMemo<RehypePlugins>(
    () => [
      /*
       * Colouring a fenced block, but only one that says what it is.
       *
       * `detect: false` matters more here than it looks. Half the blocks in the
       * manual are not code at all — they are what a command printed, tables of
       * variables and doctor's verdicts — and left to guess, highlight.js finds
       * keywords in prose and paints words in the middle of a sentence. A block
       * that names its language gets coloured; a block that does not is left
       * exactly as it was written, which is what output wants.
       */
      /*
       * LaTeX, set by KaTeX. A model's output is untrusted, so nothing in a
       * formula may reach for a URL or an HTML attribute (trust: false), and a
       * formula KaTeX cannot read shows its own source in the error colour
       * rather than taking the message down with it.
       */
      [rehypeKatex, { throwOnError: false, trust: false, strict: 'ignore' }],
      [rehypeHighlight, { detect: false, languages: LANGUAGES }],
      ...(issuesIn === undefined ? [] : [rehypeIssueLinks(issuesIn)]),
    ],
    [issuesIn],
  );

  /*
   * The text parsed into elements, once per text and per what draws it.
   *
   * `ReactMarkdown` is called here rather than mounted: it is a plain function
   * of its options with no hooks, so its answer is a tree of elements that can
   * be kept. Mounted, it would parse on every render it was given; called in a
   * memo it parses when the prose, the options or the state its components
   * read change, and not when only the search's words do. The components close
   * over `missing`, `zoomImages` and `runnable`, which is why those are among
   * what it is kept by - the setters are the same function on every render.
   */
  const parsed = useMemo(
    () =>
      ReactMarkdown({
        remarkPlugins:
          // Single dollars off: normaliseMath has already turned the ones that are maths into pairs, and left money alone.
          lineBreaks
            ? [remarkGfm, [remarkMath, { singleDollarTextMath: false }], remarkBreaks]
            : [remarkGfm, [remarkMath, { singleDollarTextMath: false }]],
        rehypePlugins,
        components: {
          /*
           * Anything the model links to is somewhere else entirely, so it opens
           * there and cannot reach back into this page.
           *
           * A link into this application is the exception, and there is only
           * one kind: the `#12` an issue's own prose mentions. That one behaves
           * like every other link in the interface - a plain click goes there,
           * and a ctrl-click still opens a tab, because it is a real anchor.
           */
          a: ({ children: text, ...props }) => {
            const here = typeof props.href === 'string' && props.href.startsWith('/');
            return here ? (
              <a {...props}>{text}</a>
            ) : (
              <a {...props} target="_blank" rel="noreferrer noopener">
                {text}
              </a>
            );
          },
          /*
           * A picture in the prose is content, not furniture.
           *
           * `data-keeps-colour` whether or not it can be zoomed: the light
           * theme darkens every `<img>` to 42% brightness, because every one of
           * them is a stroked icon file that would otherwise be invisible on
           * white — and the forty-six screenshots of the manual were being put
           * through that too, which is why the light theme's manual was
           * illustrated with photographs taken at dusk. The rule already has an
           * opt-out for anything carrying colour of its own, and a screenshot
           * is exactly that.
           *
           * Where zooming is on it is a button, not an `onClick` on the image:
           * this is a control, so it belongs in the tab order and answers the
           * space bar like every other one.
           */
          /*
           * A fenced block carries its own Copy, as every chat and every manual does: a command a model hands over is
           * there to be run somewhere else, and selecting it by hand picks up the line numbers' worth of mistakes.
           */
          pre: ({ node, children: block, ...props }) => {
            const language = languageOf(node as TextNode);
            const text = textOf(node as TextNode).replace(/\n$/, '');
            const drawn = (controls?: ReactNode, output?: ReactNode) => (
              <div className={styles.codeBlock} data-testid="code-block">
                {/* A bar of its own above the code, so a line too long for the block scrolls under nothing. */}
                <div className={styles.codeBar}>
                  <span className={styles.codeLanguage}>{language}</span>
                  {controls}
                  <CopyButton text={text} label={t('Copy the code')} testId="code-copy" />
                </div>
                <pre {...props}>{block}</pre>
                {output}
              </div>
            );
            // Run, beside Copy: only where the chat passed what the server offers, and only on a language it runs.
            const runs = runnable !== undefined && runnable.languages.includes(language.toLowerCase());
            if (!runs) return drawn();
            return (
              <RunnableCode language={language.toLowerCase()} code={text} offer={runnable}>
                {drawn}
              </RunnableCode>
            );
          },
          img: ({ node: _node, ...props }) => {
            const picture = { src: String(props.src ?? ''), alt: String(props.alt ?? '') };
            if (missing.includes(picture.src)) {
              return <span className={styles.gone}>{t('This picture is gone.')}</span>;
            }

            const image = (
              <img
                {...props}
                data-keeps-colour=""
                onError={() =>
                  setMissing((known) => (known.includes(picture.src) ? known : [...known, picture.src]))
                }
              />
            );
            if (!zoomImages || picture.src === '') return image;

            return (
              <button
                type="button"
                className={styles.zoom}
                onClick={() => setZoomed(picture)}
                aria-label={picture.alt === '' ? t('Open this picture') : `Open larger: ${picture.alt}`}
                title={t('Click to open this picture larger')}
              >
                {image}
              </button>
            );
          },
        },
        children: mathed,
      }),
    [mathed, lineBreaks, rehypePlugins, missing, zoomImages, runnable],
  );

  /*
   * And the search's words marked in it: a walk over the elements kept above,
   * which costs a letter typed far less than a parse - issue #642's freeze was
   * the parse. Nothing to mark hands back the very same tree.
   */
  const marked = useMemo(() => markTree(parsed, highlight), [parsed, highlight]);

  return (
    <div className={styles.markdown}>
      {marked}

      {gallery.length > 0 && (
        <div className={styles.gallery} aria-label={t('Pictures this answer links to')}>
          {gallery.map((picture) => (
            <figure key={picture.url} className={styles.framed}>
              <button
                type="button"
                className={styles.frame}
                onClick={() => setZoomed({ src: picture.url, alt: picture.title })}
                title={
                  picture.title === ''
                    ? t('Click to open this picture larger')
                    : `${picture.title} - ${t('click to open larger')}`
                }
              >
                <img
                  src={picture.url}
                  alt={picture.title}
                  loading="lazy"
                  data-keeps-colour=""
                  /* Somebody else's server learns that a picture was fetched,
                     not which page of this application was open when it was. */
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setBroken((known) =>
                      known.includes(picture.url) ? known : [...known, picture.url],
                    )
                  }
                />
              </button>
              {picture.title !== '' && (
                <figcaption className={styles.caption}>{picture.title}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {artifacts.length > 0 && (
        <div className={styles.gallery} aria-label={t('Files this answer links to')}>
          {artifacts.map((artifact) => (
            <ArtifactMiniature key={artifact.id} id={artifact.id} title={artifact.title} />
          ))}
        </div>
      )}

      {(zoomImages || gallery.length > 0) && (
        <ImageZoom picture={zoomed} onClose={() => setZoomed(null)} />
      )}
    </div>
  );
}
