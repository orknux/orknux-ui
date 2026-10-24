/**
 * Changes the image editor works out itself, on a canvas in the browser: the
 * picture is already here, so turning it over needs no model and no queue.
 * Each takes a canvas the picture's own size and answers a new one; the page
 * keeps the result as a version through keepDesignImageChange.
 */

/** A point on the picture, in its own pixels. */
export type Point = { x: number; y: number };

function blank(width: number, height: number): { canvas: HTMLCanvasElement; pen: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext('2d');
  if (pen === null) throw new Error('This browser cannot draw on a canvas.');
  return { canvas, pen };
}

/** The picture on a canvas of its own, at its own size rather than the size it is shown at. */
export function canvasOf(image: HTMLImageElement): HTMLCanvasElement {
  const { canvas, pen } = blank(image.naturalWidth, image.naturalHeight);
  pen.drawImage(image, 0, 0);
  return canvas;
}

/** A quarter turn, clockwise to the right: the picture's sides swap. */
export function rotated(source: HTMLCanvasElement, way: 'left' | 'right'): HTMLCanvasElement {
  const { canvas, pen } = blank(source.height, source.width);
  if (way === 'right') {
    pen.translate(canvas.width, 0);
    pen.rotate(Math.PI / 2);
  } else {
    pen.translate(0, canvas.height);
    pen.rotate(-Math.PI / 2);
  }
  pen.drawImage(source, 0, 0);
  return canvas;
}

/** Mirrored: left for right across a horizontal flip, top for bottom across a vertical one. */
export function mirrored(source: HTMLCanvasElement, axis: 'horizontal' | 'vertical'): HTMLCanvasElement {
  const { canvas, pen } = blank(source.width, source.height);
  if (axis === 'horizontal') {
    pen.translate(canvas.width, 0);
    pen.scale(-1, 1);
  } else {
    pen.translate(0, canvas.height);
    pen.scale(1, -1);
  }
  pen.drawImage(source, 0, 0);
  return canvas;
}

/** A box on the picture, in whole pixels. */
export type Box = { x: number; y: number; width: number; height: number };

/** The box around a selection's points, in whole pixels and inside the picture. */
export function boxOf(points: Point[], width: number, height: number): Box {
  const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const right = Math.min(width, Math.ceil(Math.max(...points.map((point) => point.x))));
  const bottom = Math.min(height, Math.ceil(Math.max(...points.map((point) => point.y))));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Only what is inside the box: the picture becomes the box's size. */
export function cropped(source: HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const { canvas, pen } = blank(box.width, box.height);
  pen.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return canvas;
}
