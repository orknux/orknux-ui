import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { importDesignImage } from '../../api/artifacts';
import { refuseOversized } from '../../api/uploads';
import { t } from '../../i18n';
import { readPictureFile } from './pictureFiles';

/** What a picture brought in may be: what the server keeps, and .orkx, which brings its project with it. */
export const PICTURE_FILES = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif,.orkx';

/** The pictures in a list of files - the clipboard's, a drop's - and any .orkx archive. */
export function picturesIn(files: Iterable<File>): File[] {
  return Array.from(files).filter((one) => one.type.startsWith('image/') || one.name.toLowerCase().endsWith('.orkx'));
}

/**
 * Pictures brought onto a page from outside - picked, dropped, or pasted - each
 * kept as a Design picture through `importDesignImage`, the door the image
 * editor's own Import and paste go through, so a file is checked and refused
 * in the same words wherever it arrives.
 *
 * One picture opens in the image editor, as one drawn does; several are kept
 * and the page is told, so it can read its gallery again.
 */
export function usePictureImport(workspaceId: string, onKept: () => void) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = useRef({ busy, onKept });
  held.current = { busy, onKept };

  async function bringIn(files: File[], pasted = false) {
    const pictures = picturesIn(files);
    if (held.current.busy) return;
    if (pictures.length === 0) {
      setError(t('That is not a picture: a PNG, JPEG, WebP or GIF.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await refuseOversized(pictures);
      let last: string | null = null;
      for (const file of pictures) {
        const read = await readPictureFile(file);
        const kept =
          'archive' in read
            ? await importDesignImage({ workspaceId, archive: read.archive })
            : // A pasted picture's file is always "image.png", which names nothing.
              await importDesignImage({ workspaceId, image: read.image, name: pasted ? t('Pasted picture') : read.name });
        last = kept.id;
      }
      if (pictures.length === 1 && last !== null) navigate(`/workspace/${workspaceId}/design/images/${last}/edit`);
      else held.current.onKept();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not open that file.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * What is on the clipboard, asked for: the browser asks the person first, and
   * one that cannot read a clipboard at all - Firefox, a page not on https -
   * is answered with the key that does the same.
   */
  async function pasteFromClipboard() {
    if (navigator.clipboard?.read === undefined) {
      setError(t('This browser does not let a page read the clipboard; press Ctrl+V instead.'));
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((one) => one.startsWith('image/'));
        if (type === undefined) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `image.${type.slice('image/'.length)}`, { type }));
      }
      if (files.length === 0) {
        setError(t('There is no picture on the clipboard.'));
        return;
      }
      await bringIn(files, true);
    } catch {
      setError(t('The clipboard could not be read; press Ctrl+V instead.'));
    }
  }

  // A picture pasted anywhere on the page is brought in; text pasted into a box stays text.
  const latest = useRef(bringIn);
  latest.current = bringIn;
  useEffect(() => {
    const pasted = (event: ClipboardEvent) => {
      const files = picturesIn(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void latest.current(files, true);
    };
    window.addEventListener('paste', pasted);
    return () => window.removeEventListener('paste', pasted);
  }, []);

  return { busy, error, setError, bringIn, pasteFromClipboard };
}
