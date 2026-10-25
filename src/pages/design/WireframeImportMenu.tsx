import { useEffect, useRef, useState } from 'react';

import type { Artifact } from '../../api/artifacts';
import { importWireframePicture } from '../../api/wireframes';
import type { WireframeElement, WireframePicture } from '../../api/wireframes';
import form from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import { DesignPicturePickerDialog } from './DesignPicturePickerDialog';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeExport.module.css';

/** A box on the drawing, in its own pixels. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the file picker offers: the pictures Design keeps, and an SVG - the wireframe editor's own export among them. */
const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';

/** How many device pixels an SVG is drawn at per pixel of its own, so words in it stay sharp when it is kept as a PNG. */
const SVG_SCALE = 2;

/** The room left round a picture placed in a frame, in the drawing's pixels. */
const ROOM = 16;

function read(file: File, as: 'url' | 'text'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    if (as === 'url') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

/** How big a picture is, in its own pixels, as the browser draws it. */
async function sizeOf(source: string): Promise<{ w: number; h: number }> {
  const picture = new Image();
  picture.src = source;
  await picture.decode();
  return { w: Math.max(1, picture.naturalWidth), h: Math.max(1, picture.naturalHeight) };
}

/**
 * An SVG drawn as a PNG, here, by the browser that will show it: it draws
 * everything the wireframe editor's export holds - the words are HTML inside
 * the SVG - and an SVG is a document rather than a picture to keep. Drawn as
 * an image, so nothing in it runs and nothing it names is fetched.
 */
async function svgAsPng(file: File): Promise<{ image: string; size: { w: number; h: number } }> {
  const text = await read(file, 'text');
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  const size = await sizeOf(source);
  const canvas = document.createElement('canvas');
  canvas.width = size.w * SVG_SCALE;
  canvas.height = size.h * SVG_SCALE;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error(t('Could not import the picture.'));
  const picture = new Image();
  picture.src = source;
  await picture.decode();
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  return { image: canvas.toDataURL('image/png'), size };
}

/**
 * Where a picture goes and how big it is: inside the frame that is selected,
 * or the one frame the drawing has, or else the part of the drawing on the
 * screen - centred, and made smaller to fit it with room round it, never
 * larger than it is.
 */
export function placedPicture(
  elements: WireframeElement[],
  selected: string[],
  visible: Area,
  size: { w: number; h: number },
  picture: WireframePicture,
): WireframeElement {
  const frames = elements.filter((one) => one.type === 'frame');
  const chosen = selected.length === 1 ? frames.find((one) => one.id === selected[0]) : undefined;
  const into: Area = chosen ?? (frames.length === 1 ? frames[0] : visible);
  const room = Math.min(ROOM, Math.max(0, Math.min(into.w, into.h) / 8));
  const scale = Math.min(1, (into.w - room * 2) / size.w, (into.h - room * 2) / size.h);
  const w = Math.max(1, Math.round(size.w * (scale > 0 ? scale : 1)));
  const h = Math.max(1, Math.round(size.h * (scale > 0 ? scale : 1)));
  const taken = new Set(elements.map((one) => one.id));
  let id = '';
  do id = `e${Math.random().toString(36).slice(2, 10)}`;
  while (taken.has(id));
  return {
    id,
    type: 'image',
    x: Math.round(into.x + (into.w - w) / 2),
    y: Math.round(into.y + (into.h - h) / 2),
    w,
    h,
    props: { artifact: picture.artifact },
  };
}

/**
 * The wireframe editor's Import menu, as the image editor's is: a picture from
 * a file, or one already in Orknux chosen off Artifacts. The server keeps a
 * file as one of the workspace's pictures and says the import in the audit
 * log; the page places it, as one step Undo goes back over.
 */
export function WireframeImportMenu({
  workspaceId,
  wireframeId,
  onPicture,
}: {
  workspaceId: string;
  wireframeId: string | null;
  /** The picture brought in, and its size in its own pixels. */
  onPicture: (picture: WireframePicture, size: { w: number; h: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // The page's newest handler, so a picture that took a while places itself on the drawing as it is by then.
  const placing = useRef(onPicture);
  placing.current = onPicture;

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="wireframe-import-menu"], [data-testid="wireframe-import"]') === null) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function bring(asked: () => Promise<{ picture: WireframePicture; size?: { w: number; h: number } }>) {
    setBusy(true);
    setError(null);
    try {
      const { picture, size } = await asked();
      placing.current(picture, size ?? (await sizeOf(picture.src)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not import the picture.'));
    } finally {
      setBusy(false);
    }
  }

  function fromFile(file: File) {
    if (wireframeId === null) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    void bring(async () => {
      if (svg) {
        const drawn = await svgAsPng(file);
        return { picture: await importWireframePicture(wireframeId, { image: drawn.image, name }), size: drawn.size };
      }
      return { picture: await importWireframePicture(wireframeId, { image: await read(file, 'url'), name }) };
    });
  }

  function fromOrknux(chosen: Artifact) {
    if (wireframeId === null) return;
    void bring(async () => ({ picture: await importWireframePicture(wireframeId, { artifact: chosen.id }) }));
  }

  return (
    <div className={shell.exportMenu}>
      <button
        type="button"
        className={`${form.ghost} ${shell.toolbarButton}`}
        onClick={() => {
          setError(null);
          setOpen((held) => !held);
        }}
        disabled={wireframeId === null || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={error ?? t('Put a picture from a file or from Orknux on the wireframe')}
        data-testid="wireframe-import"
      >
        {busy ? t('Importing…') : t('Import')} ▾
      </button>
      {open && (
        <div className={shell.exportItems} role="menu" data-testid="wireframe-import-menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              picker.current?.click();
            }}
            data-testid="wireframe-import-from-file"
          >
            {t('From a file…')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPicking(true);
            }}
            data-testid="wireframe-import-from-orknux"
          >
            {t('From Orknux…')}
          </button>
        </div>
      )}
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) fromFile(file);
        }}
        data-testid="wireframe-import-file"
      />
      {error !== null && (
        <span className={styles.error} role="alert" data-testid="wireframe-import-error">
          {error}
        </span>
      )}
      <DesignPicturePickerDialog
        open={picking}
        workspaceId={workspaceId}
        title={t('Import from Orknux')}
        onClose={() => setPicking(false)}
        onPick={(chosen) => {
          setPicking(false);
          fromOrknux(chosen);
        }}
      />
    </div>
  );
}
