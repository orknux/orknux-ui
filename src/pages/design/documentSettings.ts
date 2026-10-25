import type { DesignDocument, DocumentPage, DocumentSettings, Margins, Orientation, PageSize } from '../../api/documents';

/**
 * A page's size before it is turned, and what each margin setting leaves,
 * in millimetres - the server's `DocumentPageSize` and `DocumentMargins`, so a
 * page changed in the editor is drawn at once as the server will lay it out.
 */
const SIZES: Record<PageSize, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  LETTER: { width: 215.9, height: 279.4 },
  LEGAL: { width: 215.9, height: 355.6 },
};

const MARGINS: Record<Margins, number> = { NORMAL: 25, NARROW: 12.7, WIDE: 38.1 };

export const ORIENTATIONS: Orientation[] = ['PORTRAIT', 'LANDSCAPE'];
export const MARGIN_SETTINGS: Margins[] = ['NORMAL', 'NARROW', 'WIDE'];

/** The page a set of settings makes. */
export function pageOf(settings: Pick<DocumentSettings, 'pageSize' | 'orientation' | 'margins'>): DocumentPage {
  const size = SIZES[settings.pageSize] ?? SIZES.A4;
  const landscape = settings.orientation === 'LANDSCAPE';
  return {
    widthMm: landscape ? size.height : size.width,
    heightMm: landscape ? size.width : size.height,
    marginMm: MARGINS[settings.margins] ?? MARGINS.NORMAL,
  };
}

/** A document's settings as the editor holds them. */
export function settingsOf(document: DesignDocument): DocumentSettings {
  return { pageSize: document.pageSize, orientation: document.orientation, margins: document.margins, language: document.language ?? '' };
}
