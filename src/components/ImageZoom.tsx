import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import downloadIcon from '../assets/download.svg';
import paletteIcon from '../assets/palette.svg';
import styles from './ImageZoom.module.css';
import { t } from '../i18n';

/** How far a picture may be enlarged over its fitted size, and the step a press or a notch of the wheel takes. */
const MOST_ZOOM = 8;
const ZOOM_STEP = 1.25;

/**
 * What a saved picture is called: the last part of its address where that is a
 * file name, and "picture" where it is not - a blob or a data URL - which the
 * browser gives an extension from the picture's type.
 */
function fileNameOf(src: string): string {
  try {
    const last = new URL(src, window.location.href).pathname.split('/').pop() ?? '';
    return /\.[a-z0-9]{2,5}$/i.test(last) ? decodeURIComponent(last) : 'picture';
  } catch {
    return 'picture';
  }
}

export interface Picture {
  src: string;
  /** What the picture is, as the prose that carried it said — the caption. */
  alt: string;
}

export interface ImageZoomProps {
  /** The picture being looked at, or null when nothing is open. */
  picture: Picture | null;
  onClose: () => void;
  /** Where the picture is worked on, for a picture that has an editor; no button without one. */
  editHref?: string;
}

/**
 * One picture, opened over the page it was drawn in.
 *
 * The manual is written in a column about seven hundred pixels wide and
 * illustrated with screenshots of a 1440-wide application, so every picture in
 * it arrives at roughly half size and the field names it was taken to show are
 * unreadable. Opening the file in a tab is the only thing that was left, and
 * that loses the sentence the picture belongs to.
 *
 * Not [AttachmentViewer], which is the same gesture over different material: an
 * attachment is a row with an id, a filename and a size, stepped through with
 * the arrow keys and offered as a download. A picture in the prose has none of
 * those — it has an address and a caption — and passing it through that
 * component would mean inventing a filename and a byte count to put in the bar.
 * What they do share is the reason for a native `<dialog>`: Escape closes it,
 * focus stays inside and returns where it was, and it draws in the top layer,
 * so nothing here has to have an opinion about z-index.
 */
export function ImageZoom({ picture, onClose, editHref }: ImageZoomProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);

  /*
   * Zoom and pan. A diagram fitted to the window is a diagram whose labels are
   * three pixels high, and the only other way in was to save it and open it in
   * something else. Scale 1 is the fitted size; the wheel zooms about the
   * pointer, a drag moves the enlarged picture, and the percentage puts it back.
   */
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragged = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [picture?.src]);

  /** Zooms to [next], keeping the point [at] (relative to the plate's centre) under the pointer. */
  function zoomTo(next: number, at = { x: 0, y: 0 }) {
    const to = Math.min(MOST_ZOOM, Math.max(1, next));
    if (to === 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    setOffset((was) => ({
      x: at.x - ((at.x - was.x) / scale) * to,
      y: at.y - ((at.y - was.y) / scale) * to,
    }));
    setScale(to);
  }

  function pointAt(event: { clientX: number; clientY: number }) {
    const box = plateRef.current?.getBoundingClientRect();
    if (box === undefined) return { x: 0, y: 0 };
    return { x: event.clientX - (box.left + box.width / 2), y: event.clientY - (box.top + box.height / 2) };
  }

  function handleWheel(event: React.WheelEvent) {
    zoomTo(event.deltaY < 0 ? scale * ZOOM_STEP : scale / ZOOM_STEP, pointAt(event));
  }

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === '+' || event.key === '=') zoomTo(scale * ZOOM_STEP);
    else if (event.key === '-') zoomTo(scale / ZOOM_STEP);
    else if (event.key === '0') zoomTo(1);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (picture !== null && !dialog.open) dialog.showModal();
    else if (picture === null && dialog.open) dialog.close();
  }, [picture]);

  /*
   * Clicking away from the picture closes it. Tested against what was clicked
   * rather than against the dialog itself: the frame is stretched over the
   * whole element, so every click lands on a child and the dialog never sees
   * one — the same trap `AttachmentViewer` fell into.
   */
  function handleClick(event: React.MouseEvent<HTMLDialogElement>) {
    if ((event.target as HTMLElement).closest('img, button, a, header, p') === null) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.viewer}
      onCancel={onClose}
      onClose={onClose}
      onClick={handleClick}
      onWheel={picture === null ? undefined : handleWheel}
      onKeyDown={handleKey}
      aria-label={picture?.alt === '' || picture === null ? 'Picture' : picture.alt}
    >
      {picture !== null && (
        <div className={styles.frame}>
          <div className={styles.stage}>
            <div className={styles.plate} ref={plateRef}>
            {/*
              Above the picture's own corner rather than in the window's: on a
              wide screen the window's corner was a long way from the picture.
              Outside it, so it covers nothing of what is being looked at.
            */}
            <header className={styles.bar}>
              <div className={styles.zoom} role="group" aria-label={t('Zoom')}>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => zoomTo(scale / ZOOM_STEP)}
                  disabled={scale <= 1}
                  aria-label={t('Zoom out')}
                  title={t('Zoom out')}
                  data-zoom-out=""
                >
                  −
                </button>
                <button
                  type="button"
                  className={styles.level}
                  onClick={() => zoomTo(1)}
                  title={t('Fit to window')}
                  data-zoom-level=""
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => zoomTo(scale * ZOOM_STEP)}
                  disabled={scale >= MOST_ZOOM}
                  aria-label={t('Zoom in')}
                  title={t('Zoom in')}
                  data-zoom-in=""
                >
                  +
                </button>
              </div>
              {editHref !== undefined && (
                <Link
                  className={styles.tool}
                  to={editHref}
                  aria-label={t('Open in editor')}
                  title={t('Open in editor')}
                  data-picture-edit=""
                >
                  <span className={styles.saveIcon} style={{ maskImage: `url("${paletteIcon}")`, WebkitMaskImage: `url("${paletteIcon}")` }} />
                </Link>
              )}
              <a
                className={styles.tool}
                href={picture.src}
                download={fileNameOf(picture.src)}
                aria-label={t('Save picture')}
                title={t('Save picture')}
                data-picture-save=""
              >
                <span className={styles.saveIcon} style={{ maskImage: `url("${downloadIcon}")`, WebkitMaskImage: `url("${downloadIcon}")` }} />
              </a>
              <button type="button" className={styles.close} onClick={onClose} aria-label={t('Close')} title={t('Close')}>
                ×
              </button>
            </header>
            {/*
              `data-keeps-colour` because this is a screenshot, not an icon: the
              light theme darkens every `<img>` to keep the stroked icon files
              readable on white, and a photograph of the product put through
              that is a photograph of a different product.
            */}
            {/*
              Two of the picture. The one in the window is what is seen, laid
              over the plate and clipped to it, so an enlarged picture covers
              nothing outside the box it was fitted to; the other is never seen
              and only gives the plate that fitted size. Clipping the plate
              itself hid the controls hanging above it.
            */}
            <div className={scale > 1 ? `${styles.window} ${styles.windowZoomed}` : styles.window} data-zoom-window="">
            <img
              className={scale > 1 ? `${styles.shown} ${styles.zoomed}` : styles.shown}
              src={picture.src}
              alt={picture.alt}
              data-keeps-colour=""
              draggable={false}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              onPointerDown={(event) => {
                if (scale <= 1) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragged.current = { x: event.clientX, y: event.clientY, from: offset, moved: false };
              }}
              onPointerMove={(event) => {
                const drag = dragged.current;
                if (drag === null) return;
                drag.moved = true;
                setOffset({ x: drag.from.x + event.clientX - drag.x, y: drag.from.y + event.clientY - drag.y });
              }}
              onPointerUp={() => {
                dragged.current = null;
              }}
              onDoubleClick={(event) => zoomTo(scale > 1 ? 1 : 2.5, pointAt(event))}
            />
            </div>
            <img className={`${styles.picture} ${styles.sizer}`} src={picture.src} alt="" aria-hidden="true" data-keeps-colour="" />
            </div>
          </div>

          {/*
            Under the picture, the way a caption is printed under a plate: it
            says what was just looked at, so it is read after it rather than
            standing between the opening and the picture.
          */}
          {picture.alt !== '' && <p className={styles.caption}>{picture.alt}</p>}
        </div>
      )}
    </dialog>
  );
}
