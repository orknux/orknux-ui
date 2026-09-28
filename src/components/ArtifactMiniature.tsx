import { useEffect, useRef, useState } from 'react';

import {
  fetchSavedArtifactBytes,
  fetchSavedArtifactType,
  savedArtifactPreviewUrl,
  savedArtifactUrl,
} from '../api/artifacts';
import { t } from '../i18n';
import styles from './Markdown.module.css';

/** What the server shows as a picture, and so what an `<img>` can draw. */
const PICTURES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];

/** What the server will open for reading rather than hand over as a download. */
const READABLE = [...PICTURES, 'application/pdf', 'text/html', 'text/plain', 'text/markdown'];

/** The width a miniature is drawn at, in CSS pixels; the frame in the stylesheet agrees. */
const WIDE = 132;

/** A glyph standing in for a file there is no page of to draw. */
function markFor(type: string): string {
  if (type === 'application/pdf') return '📕';
  if (type === 'text/html') return '🌐';
  if (type.startsWith('text/')) return '📄';
  if (type.startsWith('audio/')) return '🎵';
  if (type.startsWith('video/')) return '🎞️';
  return '📦';
}

/** What to call it in a few characters: the title's extension, or the type's subtype. */
function kindOf(title: string, type: string): string {
  const dot = title.lastIndexOf('.');
  if (dot > 0 && dot < title.length - 1) return title.slice(dot + 1).toUpperCase().slice(0, 5);
  return (type.split('/')[1] ?? 'file').toUpperCase().slice(0, 5);
}

/**
 * The first page of a PDF, drawn into a canvas.
 *
 * pdf.js rather than a frame: a browser's own PDF reader is a plugin, and a
 * plugin does not run in the sandboxed frame the server insists a document is
 * read in. Loaded
 * only when there is a PDF to draw, because it is the size of the rest of the
 * application.
 */
async function drawFirstPage(id: string, canvas: HTMLCanvasElement): Promise<void> {
  const [pdfjs, Worker, bytes] = await Promise.all([
    import('pdfjs-dist'),
    /*
     * Built by Vite as a worker, not handed over by URL: the file pdf.js ships
     * is `.mjs`, which the image's nginx serves as application/octet-stream,
     * and a browser refuses a module worker of that type. Vite's own worker
     * build is a `.js` file like the rest of the bundle.
     */
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker'),
    fetchSavedArtifactBytes(id),
  ]);
  // One worker for every miniature on the page, made by the first to need it.
  if (pdfjs.GlobalWorkerOptions.workerPort === null) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker.default();
  }
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const page = await document.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (WIDE / natural.width) * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
  } finally {
    void document.destroy();
  }
}

export interface ArtifactMiniatureProps {
  /** The saved artifact's number, off the link. */
  id: string;
  /** What the link called it - usually the filename. */
  title: string;
}

/**
 * A saved artifact an answer links to, drawn small under the answer.
 *
 * A task that makes a PDF says so with a link, and a link titled with a
 * filename says nothing about what is inside: the pictures the same task drew
 * are on the page and its document was a line of blue text. A picture is drawn
 * as itself, a PDF as its first page, and anything else as the tile the
 * Artifacts page draws for it - and each opens where that page would open it.
 */
export function ArtifactMiniature({ id, title }: ArtifactMiniatureProps) {
  /** The type the server holds, '' while asking, null for one that is not there. */
  const [type, setType] = useState<string | null>('');
  const [drawn, setDrawn] = useState<'drawing' | 'drawn' | 'failed'>('drawing');
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let abandoned = false;
    setType('');
    fetchSavedArtifactType(id)
      .then((held) => {
        if (!abandoned) setType(held);
      })
      .catch(() => {
        if (!abandoned) setType(null);
      });
    return () => {
      abandoned = true;
    };
  }, [id]);

  useEffect(() => {
    if (type !== 'application/pdf' || canvas.current === null) return;
    let abandoned = false;
    setDrawn('drawing');
    drawFirstPage(id, canvas.current)
      .then(() => {
        if (!abandoned) setDrawn('drawn');
      })
      // A file that is not the PDF it says it is gets the tile instead.
      .catch(() => {
        if (!abandoned) setDrawn('failed');
      });
    return () => {
      abandoned = true;
    };
  }, [id, type]);

  // Gone, or not this reader's: the link in the prose is where that is found out.
  if (type === null || type === '') return null;

  const readable = READABLE.includes(type);
  const href = readable ? savedArtifactPreviewUrl(id) : savedArtifactUrl(id);
  const picture = PICTURES.includes(type);
  const page = type === 'application/pdf' && drawn !== 'failed';

  return (
    <figure className={styles.framed} data-artifact-miniature={id}>
      <a
        className={picture ? styles.frame : styles.page}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title={readable ? `${title} - ${t('open in a new tab')}` : `${title} - ${t('download')}`}
        {...(readable ? {} : { download: title })}
      >
        {picture ? (
          <img src={savedArtifactUrl(id)} alt={title} loading="lazy" data-keeps-colour="" />
        ) : page ? (
          <canvas ref={canvas} className={styles.pageDrawn} aria-label={title} data-state={drawn} />
        ) : (
          <span className={styles.tile}>
            <span className={styles.tileMark} aria-hidden="true">
              {markFor(type)}
            </span>
            <span className={styles.tileKind}>{kindOf(title, type)}</span>
          </span>
        )}
      </a>
      {title !== '' && <figcaption className={styles.caption}>{title}</figcaption>}
    </figure>
  );
}
