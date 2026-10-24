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
