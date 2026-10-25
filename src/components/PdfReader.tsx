import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';

import { fetchDocumentBytes } from '../api/artifacts';
import { t, tf } from '../i18n';
import { Loader } from './Loader';
import styles from './PdfReader.module.css';
import { loadPdfjs } from './pdfjs';

/** How far one press of + or − goes. */
const ZOOM_STEP = 1.25;
const LEAST_ZOOM = 0.25;
const MOST_ZOOM = 4;

/**
 * The most a fitted page is enlarged by. A wide panel fits an A4 page at
 * nearly twice its size, which is a page read from too close; past this it is
 * centred instead, and + is there for anybody who wants it larger.
 */
const MOST_FIT = 1.5;

/**
 * The most pixels one page's canvas is given. Zoomed in on a high-density
 * screen a page would ask for a canvas larger than a browser will allocate,
 * and the answer to that is a blank page, not an error.
 */
const MOST_PIXELS = 16_777_216;

/** A page's size at scale 1, in CSS pixels. */
interface Sheet {
  width: number;
  height: number;
}

export interface PdfReaderProps {
  /** Where the bytes are: a preview address, or a file's own. */
  src: string;
  /** What the document is called, for a screen reader. */
  name: string;
  className?: string;
}

/**
 * A PDF, read where it is: every page drawn by pdf.js into a canvas, with its
 * text laid over it so it can be selected and copied.
 *
 * Not a frame of the preview address, which is what this replaced. The server
 * serves every preview under `Content-Security-Policy: sandbox` - an HTML file
 * an agent wrote must not run as us - and a browser's own PDF reader does not
 * run in a sandboxed document: Chrome draws its broken-document icon there and
 * nothing else. Drawing the pages here keeps that lock on every preview, and
 * reads the same in Chrome, Firefox and the desktop app, which each have a
 * different reader of their own or none.
 *
 * Pages are drawn as they come near the screen, so a long report opens at the
 * speed of its first page.
 */
export function PdfReader({ src, name, className }: PdfReaderProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [document_, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  /** 1 is the width that fits; the buttons multiply it. */
  const [zoom, setZoom] = useState(1);
  /** The scale at which the widest page fits the reader. */
  const [fit, setFit] = useState(1);
  const [current, setCurrent] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  /** How far down the document the reader was, as a fraction, so a zoom keeps the place. */
  const place = useRef(0);

  useEffect(() => {
    let abandoned = false;
    let opened: PDFDocumentProxy | null = null;
    setState('loading');
    setDocument(null);
    setSheets([]);
    setZoom(1);
    setCurrent(1);
    place.current = 0;

    Promise.all([loadPdfjs(), fetchDocumentBytes(src)])
      .then(([pdfjs, bytes]) => pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise)
      .then(async (loaded) => {
        opened = loaded;
        if (abandoned) {
          void loaded.destroy();
          return;
        }
        const pages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, at) => loaded.getPage(at + 1)),
        );
        if (abandoned) return;
        setSheets(
          pages.map((page) => {
            const natural = page.getViewport({ scale: 1 });
            return { width: natural.width, height: natural.height };
          }),
        );
        setDocument(loaded);
        setState('ready');
      })
      // Bytes that are not a PDF, or that did not arrive: said, with the way out beside it.
      .catch(() => {
        if (!abandoned) setState('failed');
      });

    return () => {
      abandoned = true;
      void opened?.destroy();
    };
  }, [src]);

  /* The fitted width follows the reader's own, so a window made narrower re-fits. */
  useEffect(() => {
    const box = scroller.current;
    if (box === null || sheets.length === 0) return;
    const widest = Math.max(...sheets.map((sheet) => sheet.width));
    const measure = () => {
      const padding = parseFloat(getComputedStyle(box).paddingLeft) * 2;
      const room = box.clientWidth - padding;
      if (room > 0) setFit(Math.min(MOST_FIT, room / widest));
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(box);
    return () => watching.disconnect();
  }, [sheets]);

  const scale = fit * zoom;

  /* After a zoom, back to the same place in the document rather than to a page somewhere above it. */
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box === null) return;
    box.scrollTop = place.current * box.scrollHeight;
  }, [scale]);

  function scrolled() {
    const box = scroller.current;
    if (box === null) return;
    place.current = box.scrollHeight === 0 ? 0 : box.scrollTop / box.scrollHeight;
    // The page under the middle of the reader is the one being read.
    const middle = box.scrollTop + box.clientHeight / 2;
    const pages = box.querySelectorAll<HTMLElement>('[data-pdf-sheet]');
    let reading = 1;
    pages.forEach((page, at) => {
      if (page.offsetTop <= middle) reading = at + 1;
    });
    setCurrent(reading);
  }

  function goTo(number: number) {
    const box = scroller.current;
    const page = box?.querySelector<HTMLElement>(`[data-pdf-sheet="${number}"]`);
    if (box == null || page == null) return;
    // The reader's own scroll, not scrollIntoView: that scrolls every ancestor
    // too, and on the Research page the page behind would jump with it.
    box.scrollTop = page.offsetTop - parseFloat(getComputedStyle(box).paddingTop);
    setCurrent(number);
  }

  function zoomTo(next: number) {
    setZoom(Math.min(MOST_ZOOM, Math.max(LEAST_ZOOM, next)));
  }

  return (
    <div
      className={className === undefined ? styles.reader : `${styles.reader} ${className}`}
      data-pdf-reader=""
      data-state={state}
      aria-label={name}
    >
      {state === 'ready' && (
        <div className={styles.tools}>
          <div className={styles.group} role="group" aria-label={t('Pages')}>
            <button
              type="button"
              className={styles.tool}
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
              aria-label={t('Previous page')}
              title={t('Previous page')}
            >
              ‹
            </button>
            <span className={styles.where} data-pdf-where="">
              {tf('Page {page} of {pages}', { page: current, pages: sheets.length })}
            </span>
            <button
              type="button"
              className={styles.tool}
              onClick={() => goTo(current + 1)}
              disabled={current >= sheets.length}
              aria-label={t('Next page')}
              title={t('Next page')}
            >
              ›
            </button>
          </div>
          <div className={styles.group} role="group" aria-label={t('Zoom')}>
            <button
              type="button"
              className={styles.tool}
              onClick={() => zoomTo(zoom / ZOOM_STEP)}
              disabled={zoom <= LEAST_ZOOM}
              aria-label={t('Zoom out')}
              title={t('Zoom out')}
              data-pdf-zoom-out=""
            >
              −
            </button>
            <button
              type="button"
              className={styles.level}
              onClick={() => zoomTo(1)}
              title={t('Fit to width')}
              data-pdf-zoom-level=""
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => zoomTo(zoom * ZOOM_STEP)}
              disabled={zoom >= MOST_ZOOM}
              aria-label={t('Zoom in')}
              title={t('Zoom in')}
              data-pdf-zoom-in=""
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className={styles.pages} ref={scroller} onScroll={scrolled}>
        {state === 'loading' && (
          <div className={styles.note}>
            <Loader />
          </div>
        )}
        {state === 'failed' && (
          <p className={styles.note} role="alert">
            {t('This file could not be read as a PDF.')}
          </p>
        )}
        {document_ !== null &&
          sheets.map((sheet, at) => (
            <PdfSheet
              key={at}
              document_={document_}
              number={at + 1}
              sheet={sheet}
              scale={scale}
              root={scroller}
            />
          ))}
      </div>
    </div>
  );
}

interface PdfSheetProps {
  document_: PDFDocumentProxy;
  number: number;
  sheet: Sheet;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
}

/** One page: its paper at the size it will be, the drawing once it is near, and its text over that. */
function PdfSheet({ document_, number, sheet, scale, root }: PdfSheetProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  /** Kept once true: a page scrolled past stays drawn rather than being drawn again on the way back. */
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (element === null || near) return;
    const watching = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      // A screen ahead, so the next page is drawn before it is scrolled to.
      { root: root.current, rootMargin: '100% 0px' },
    );
    watching.observe(element);
    return () => watching.disconnect();
  }, [near, root]);

  useEffect(() => {
    if (!near) return;
    let abandoned = false;
    let task: RenderTask | null = null;
    let layer: TextLayer | null = null;

    void (async () => {
      const [pdfjs, page] = await Promise.all([loadPdfjs(), document_.getPage(number)]);
      const target = canvas.current;
      const over = text.current;
      if (abandoned || target === null || over === null) return;
      const viewport = page.getViewport({ scale });
      const density = Math.min(
        window.devicePixelRatio || 1,
        Math.sqrt(MOST_PIXELS / (viewport.width * viewport.height)),
      );
      target.width = Math.floor(viewport.width * density);
      target.height = Math.floor(viewport.height * density);
      task = page.render({
        canvas: target,
        viewport,
        transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
      });
      await task.promise;
      if (abandoned) return;
      setDrawn(true);

      over.replaceChildren();
      layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: over, viewport });
      await layer.render();
    })()
      // A render cancelled by a zoom, or a page of a document closed under it.
      .catch(() => undefined);

    return () => {
      abandoned = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [near, scale, document_, number]);

  const sized = {
    width: `${Math.floor(sheet.width * scale)}px`,
    height: `${Math.floor(sheet.height * scale)}px`,
    // What pdf.js sizes the text layer and its glyphs by.
    '--total-scale-factor': scale,
  } as CSSProperties;

  return (
    <div ref={box} className={styles.sheet} style={sized} data-pdf-sheet={number}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        data-pdf-page={number}
        data-drawn={drawn ? 'true' : 'false'}
        aria-hidden="true"
      />
      <div ref={text} className={styles.text} />
    </div>
  );
}
