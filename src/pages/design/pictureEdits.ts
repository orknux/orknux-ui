import { canvasRGBA } from 'stackblur-canvas';

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

/** One stroke of the brush: its colour, its width and the points it passed, in the picture's own pixels. */
export type Stroke = { colour: string; size: number; points: Point[] };

/** A stroke as an SVG path; a single point is a dot, which a path of one point would not draw. */
export function strokePath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return rest.length === 0
    ? `M${first.x} ${first.y}l0.01 0`
    : `M${first.x} ${first.y}` + rest.map((point) => `L${point.x} ${point.y}`).join('');
}

/** The strokes painted over the picture, round-ended, as they were drawn over it on the screen. */
export function painted(source: HTMLCanvasElement, strokes: Stroke[]): HTMLCanvasElement {
  const { canvas, pen } = blank(source.width, source.height);
  pen.drawImage(source, 0, 0);
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    pen.strokeStyle = stroke.colour;
    pen.lineWidth = stroke.size;
    pen.stroke(new Path2D(strokePath(stroke.points)));
  }
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

/**
 * The picture blurred inside an outline only, by a radius in its own pixels;
 * outside it, every pixel is as it was.
 *
 * Stack blur rather than the canvas's own `filter`, which not every browser
 * draws with: the same picture blurs the same everywhere. What is blurred is
 * the box around the outline grown by the radius, so pixels just outside the
 * outline still blend into its edge, as they would in the picture itself.
 */
export function blurredInside(source: HTMLCanvasElement, outline: Point[], radius: number): HTMLCanvasElement {
  const around = boxOf(outline, source.width, source.height);
  const x = Math.max(0, around.x - radius);
  const y = Math.max(0, around.y - radius);
  const width = Math.min(source.width, around.x + around.width + radius) - x;
  const height = Math.min(source.height, around.y + around.height + radius) - y;
  const blurred = blank(source.width, source.height);
  blurred.pen.drawImage(source, 0, 0);
  canvasRGBA(blurred.canvas, x, y, width, height, radius);

  const { canvas, pen } = blank(source.width, source.height);
  pen.drawImage(source, 0, 0);
  pen.save();
  pen.beginPath();
  outline.forEach((point, index) => (index === 0 ? pen.moveTo(point.x, point.y) : pen.lineTo(point.x, point.y)));
  pen.closePath();
  pen.clip();
  pen.drawImage(blurred.canvas, 0, 0);
  pen.restore();
  return canvas;
}

/** Only what is inside the box: the picture becomes the box's size. */
export function cropped(source: HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const { canvas, pen } = blank(box.width, box.height);
  pen.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return canvas;
}
