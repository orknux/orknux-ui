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

/** A picture at an address on a canvas of its own: a layer read back from where it was kept. */
export function canvasFrom(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(canvasOf(image));
    image.onerror = () => reject(new Error('A layer could not be read.'));
    image.src = url;
  });
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

/**
 * The brush's tips, as image editors have them: a hard round one, a soft round
 * one whose edge fades, a square flat one, a marker - see-through, its own
 * overlaps flat and darkening what is under it - and an eraser, which paints
 * transparency into a layer.
 */
export type BrushStyle = 'hard' | 'soft' | 'square' | 'marker' | 'eraser';

/**
 * One stroke of the brush: its tip, colour, width, how opaque and - for a soft
 * tip - how hard its edge is, both from 0 to 1, and the points it passed in the
 * picture's own pixels. A pen's pressure at each point, where the pen gave one,
 * makes the stroke thinner where it was pressed lightly.
 */
export type Stroke = {
  colour: string;
  size: number;
  points: Point[];
  style: BrushStyle;
  opacity: number;
  hardness: number;
  pressures: number[] | null;
};

/** A stroke as an SVG path; a single point is a dot, which a path of one point would not draw. */
export function strokePath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return rest.length === 0
    ? `M${first.x} ${first.y}l0.01 0`
    : `M${first.x} ${first.y}` + rest.map((point) => `L${point.x} ${point.y}`).join('');
}

/** The lightest a pen's touch makes a stroke, as a share of its width: a feather-light touch still leaves a line. */
const LIGHTEST_TOUCH = 0.1;

/**
 * How far a soft tip's edge is blurred, in pixels, for a stroke of a width and
 * a hardness: nothing for a hard edge, and a quarter of the width for none at
 * all - the core drawn that much narrower on each side, so the fade runs from
 * the middle of the stroke out to the width it says.
 */
const fadeOf = (stroke: Stroke) => (stroke.style === 'soft' || stroke.style === 'eraser' ? Math.round(((1 - stroke.hardness) * stroke.size) / 4) : 0);

/**
 * One stroke on a canvas of its own, in its colour and wholly opaque: its
 * shape, before it is laid over anything. Drawn as one shape, so where the
 * stroke crosses itself it is no darker - the opacity is given when it is
 * laid down, once. A soft tip's shape is blurred at its edge.
 */
function strokeShape(width: number, height: number, stroke: Stroke): HTMLCanvasElement {
  const { canvas, pen } = blank(width, height);
  const square = stroke.style === 'square';
  pen.lineCap = square ? 'square' : 'round';
  pen.lineJoin = square ? 'miter' : 'round';
  pen.strokeStyle = '#fff';
  const fade = fadeOf(stroke);
  // A soft tip is drawn narrower and blurred out to its width, so it is the width it says.
  const across = Math.max(1, stroke.size - 2 * fade);
  const pressures = stroke.pressures;
  if (pressures === null || stroke.points.length < 2) {
    pen.lineWidth = across * (pressures === null ? 1 : Math.max(LIGHTEST_TOUCH, pressures[0] ?? 1));
    pen.stroke(new Path2D(strokePath(stroke.points)));
  } else {
    // Pressed harder, wider: each piece between two points as wide as the pen was pressed there.
    for (let at = 1; at < stroke.points.length; at += 1) {
      const pressed = Math.max(LIGHTEST_TOUCH, ((pressures[at - 1] ?? 1) + (pressures[at] ?? 1)) / 2);
      pen.lineWidth = across * pressed;
      pen.stroke(new Path2D(strokePath([stroke.points[at - 1], stroke.points[at]])));
    }
  }
  if (fade > 0 && stroke.points.length > 0) {
    const reach = stroke.size + fade;
    const area = boxOf(stroke.points, width, height);
    const x = Math.max(0, area.x - reach);
    const y = Math.max(0, area.y - reach);
    canvasRGBA(canvas, x, y, Math.min(width, area.x + area.width + reach) - x, Math.min(height, area.y + area.height + reach) - y, fade);
  }
  pen.globalCompositeOperation = 'source-in';
  pen.fillStyle = stroke.colour;
  pen.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * The strokes painted over a canvas, as they are drawn over it on the screen:
 * each laid down at its opacity - a marker multiplying with what is under it,
 * an eraser taking away what is there - one after another.
 */
export function painted(source: HTMLCanvasElement, strokes: Stroke[]): HTMLCanvasElement {
  const { canvas, pen } = blank(source.width, source.height);
  pen.drawImage(source, 0, 0);
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    pen.globalAlpha = Math.min(1, Math.max(0, stroke.opacity));
    pen.globalCompositeOperation = stroke.style === 'eraser' ? 'destination-out' : stroke.style === 'marker' ? 'multiply' : 'source-over';
    pen.drawImage(strokeShape(source.width, source.height, stroke), 0, 0);
  }
  return canvas;
}

/** Strokes on nothing: what the brush has painted on the picture and not yet kept, to show over it. */
export function strokesAlone(width: number, height: number, strokes: Stroke[]): HTMLCanvasElement {
  return painted(blank(width, height).canvas, strokes);
}

/**
 * A layer over the picture, as any image editor has them: pixels of its own,
 * the picture's size and transparent where nothing is painted, a name and
 * whether it is shown. Its canvas is never drawn on once made - a change makes
 * a new one - so a step undo holds keeps the layer as it was.
 */
export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  pixels: HTMLCanvasElement;
};

/** A new layer: transparent, the picture's size. */
export function emptyLayer(width: number, height: number): HTMLCanvasElement {
  return blank(width, height).canvas;
}

/**
 * The picture and the layers over it as one: the first layer lowest, hidden
 * ones left out, and the picture itself left out where it is hidden too. Each
 * is drawn at the picture's size, so a layer made for it lines up with it.
 */
export function flattened(width: number, height: number, picture: CanvasImageSource | null, layers: Layer[]): HTMLCanvasElement {
  const { canvas, pen } = blank(width, height);
  if (picture !== null) pen.drawImage(picture, 0, 0, width, height);
  for (const layer of layers) if (layer.visible) pen.drawImage(layer.pixels, 0, 0, width, height);
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
 * The picture blurred at a radius over the box given, then laid over itself
 * through a mask: where the mask is opaque the blur is whole, where it is
 * transparent the pixel is exactly as it was, and in between the two are
 * mixed. Every way of blurring here is this, with a different mask - which
 * is what makes a gradual blur as cheap as a hard one.
 *
 * Stack blur rather than the canvas's own `filter`, which not every browser
 * draws with: the same picture blurs the same everywhere.
 */
function blurredThrough(source: HTMLCanvasElement, mask: HTMLCanvasElement, radius: number, around: Box): HTMLCanvasElement {
  const blurred = blank(source.width, source.height);
  blurred.pen.drawImage(source, 0, 0);
  canvasRGBA(blurred.canvas, around.x, around.y, around.width, around.height, radius);
  blurred.pen.globalCompositeOperation = 'destination-in';
  blurred.pen.drawImage(mask, 0, 0);

  const { canvas, pen } = blank(source.width, source.height);
  pen.drawImage(source, 0, 0);
  pen.drawImage(blurred.canvas, 0, 0);
  return canvas;
}

/** Eased rather than straight, so a softened edge has no visible line where the fade starts. */
const eased = (share: number) => share * share * (3 - 2 * share);

/**
 * How far each pixel of a box is from the nearest pixel outside the shape, in
 * pixels - a two-pass chamfer distance, near enough to Euclidean for a fade
 * that nobody measures. Outside the box counts as outside the shape.
 */
function distancesInside(inside: Uint8Array, width: number, height: number): Float32Array {
  const across = width + 2;
  const far = 1e9;
  const grid = new Float32Array(across * (height + 2));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) grid[(y + 1) * across + x + 1] = inside[y * width + x] === 1 ? far : 0;
  }
  const at = (x: number, y: number) => grid[y * across + x];
  for (let y = 1; y <= height; y += 1) {
    for (let x = 1; x <= width; x += 1) {
      const here = y * across + x;
      if (grid[here] === 0) continue;
      grid[here] = Math.min(grid[here], at(x - 1, y) + 3, at(x - 1, y - 1) + 4, at(x, y - 1) + 3, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = height; y >= 1; y -= 1) {
    for (let x = width; x >= 1; x -= 1) {
      const here = y * across + x;
      if (grid[here] === 0) continue;
      grid[here] = Math.min(grid[here], at(x + 1, y) + 3, at(x + 1, y + 1) + 4, at(x, y + 1) + 3, at(x - 1, y + 1) + 4);
    }
  }
  const distances = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) distances[y * width + x] = grid[(y + 1) * across + x + 1] / 3;
  }
  return distances;
}

/**
 * The picture blurred inside an outline only, by a radius in its own pixels;
 * outside it, every pixel is as it was.
 *
 * With a falloff the blur fades out inside the outline: whole from that many
 * pixels in, and nothing at the edge itself, so the blurred part has no rim.
 * The fade is inside rather than across the edge, so what was not selected is
 * still never touched. 0 is a hard edge.
 *
 * What is blurred is the box around the outline grown by the radius, so pixels
 * just outside the outline still blend into its edge, as they would in the
 * picture itself.
 */
export function blurredInside(source: HTMLCanvasElement, outline: Point[], radius: number, falloff = 0): HTMLCanvasElement {
  const shape = boxOf(outline, source.width, source.height);
  const x = Math.max(0, shape.x - radius);
  const y = Math.max(0, shape.y - radius);
  const grown: Box = {
    x,
    y,
    width: Math.min(source.width, shape.x + shape.width + radius) - x,
    height: Math.min(source.height, shape.y + shape.height + radius) - y,
  };

  const drawn = blank(shape.width, shape.height);
  drawn.pen.translate(-shape.x, -shape.y);
  drawn.pen.beginPath();
  outline.forEach((point, index) => (index === 0 ? drawn.pen.moveTo(point.x, point.y) : drawn.pen.lineTo(point.x, point.y)));
  drawn.pen.closePath();
  drawn.pen.fillStyle = '#fff';
  drawn.pen.fill();
  if (falloff > 0) {
    const pixels = drawn.pen.getImageData(0, 0, shape.width, shape.height);
    const inside = new Uint8Array(shape.width * shape.height);
    for (let index = 0; index < inside.length; index += 1) inside[index] = pixels.data[index * 4 + 3] >= 128 ? 1 : 0;
    const distances = distancesInside(inside, shape.width, shape.height);
    for (let index = 0; index < inside.length; index += 1) {
      const strength = eased(Math.min(1, Math.max(0, (distances[index] - 0.5) / falloff)));
      pixels.data[index * 4 + 3] = Math.round(pixels.data[index * 4 + 3] * strength);
    }
    drawn.pen.putImageData(pixels, 0, 0);
  }
  const mask = blank(source.width, source.height);
  mask.pen.drawImage(drawn.canvas, shape.x, shape.y);
  return blurredThrough(source, mask.canvas, radius, grown);
}

/**
 * The picture blurred gradually along a line: sharp at its start, blurred at
 * the whole radius at its end, and mixed evenly between; before the start it
 * stays sharp and past the end it stays whole. Mirrored, the start is a sharp
 * band and the blur grows the same way on both sides of it - a tilt-shift.
 */
export function blurredAlong(source: HTMLCanvasElement, from: Point, to: Point, radius: number, mirroredBlur = false): HTMLCanvasElement {
  const mask = blank(source.width, source.height);
  const start = mirroredBlur ? { x: 2 * from.x - to.x, y: 2 * from.y - to.y } : from;
  const ramp = mask.pen.createLinearGradient(start.x, start.y, to.x, to.y);
  if (mirroredBlur) {
    ramp.addColorStop(0, '#fff');
    ramp.addColorStop(0.5, 'rgba(255,255,255,0)');
  } else {
    ramp.addColorStop(0, 'rgba(255,255,255,0)');
  }
  ramp.addColorStop(1, '#fff');
  mask.pen.fillStyle = ramp;
  mask.pen.fillRect(0, 0, source.width, source.height);
  return blurredThrough(source, mask.canvas, radius, { x: 0, y: 0, width: source.width, height: source.height });
}

/** Only what is inside the box: the picture becomes the box's size. */
export function cropped(source: HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const { canvas, pen } = blank(box.width, box.height);
  pen.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return canvas;
}
