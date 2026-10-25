import type { WireframeElement } from '../../api/wireframes';

/**
 * How a wireframe element looks past where it is: its background (a colour or
 * a linear gradient), the colour of its words, its border and its shadow. Each
 * is an optional prop, so a drawing made before there were any is drawn as it
 * always was.
 *
 * The server checks the same props against the same syntax
 * (`WireframeStyle`) and stores them in one spelling - a colour as lowercase
 * hex, a gradient as `linear-gradient(<angle>deg, <colour> <at>%, ...)` - so
 * what is read here is mostly what this editor wrote. It is parsed rather than
 * trusted all the same: a value is written into an inline style and an
 * exported SVG, and one that does not parse is drawn as if it were not there.
 */

export const STYLE_PROPS = ['fill', 'color', 'borderWidth', 'borderStyle', 'borderColor', 'radius', 'shadow'] as const;
export type StyleProp = (typeof STYLE_PROPS)[number];

export const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'none'] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

export const SHADOWS = ['none', 'small', 'medium', 'large'] as const;
export type Shadow = (typeof SHADOWS)[number];

/** Formats the server holds them to. */
export const BORDER_MOST = 20;
export const RADIUS_MOST = 500;
export const STOPS_LEAST = 2;
export const STOPS_MOST = 8;

/** Each shadow as CSS draws it - the server's `WireframeStyle.Shadow` - and as an SVG filter draws the same. */
export const SHADOW_LOOK: Record<Exclude<Shadow, 'none'>, { dy: number; blur: number; opacity: number }> = {
  small: { dy: 1, blur: 3, opacity: 0.2 },
  medium: { dy: 4, blur: 10, opacity: 0.22 },
  large: { dy: 12, blur: 28, opacity: 0.26 },
};

export interface Stop {
  colour: string;
  at: number;
}

export type Fill = { kind: 'solid'; colour: string } | { kind: 'gradient'; angle: number; stops: Stop[] };

const NAMED: Record<string, string> = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff', maroon: '#800000', red: '#ff0000',
  purple: '#800080', fuchsia: '#ff00ff', green: '#008000', lime: '#00ff00', olive: '#808000', yellow: '#ffff00', navy: '#000080',
  blue: '#0000ff', teal: '#008080', aqua: '#00ffff', orange: '#ffa500', pink: '#ffc0cb', transparent: '#00000000',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const RGB = /^rgba?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+%?)\s*)?\)$/;
const ANGLE = /^(-?\d{1,4}(?:\.\d+)?)\s*deg$/;
const STOP = /^(#[0-9a-f]{3,8}|rgba?\([^()]*\)|[a-z]+)(?:\s+(\d{1,3}(?:\.\d+)?)%)?$/;

const hex2 = (value: number) => Math.round(value).toString(16).padStart(2, '0');

/** A colour as lowercase hex, `#rrggbb` or `#rrggbbaa`, or null where it is not one. */
export function colourOf(said: unknown): string | null {
  if (typeof said !== 'string') return null;
  const text = said.trim().toLowerCase();
  if (text.length > 40) return null;
  if (NAMED[text] !== undefined) return NAMED[text];
  const hex = HEX.exec(text);
  if (hex !== null) {
    const digits = hex[1];
    const long = digits.length <= 4 ? [...digits].map((one) => one + one).join('') : digits;
    return `#${long.length === 8 && long.endsWith('ff') ? long.slice(0, 6) : long}`;
  }
  const rgb = RGB.exec(text);
  if (rgb !== null) {
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (channels.some((one) => !Number.isFinite(one) || one < 0 || one > 255)) return null;
    let alpha = 1;
    if (rgb[4] !== undefined && rgb[4] !== '') {
      alpha = rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
    }
    const a = Math.round(alpha * 255);
    return `#${channels.map(hex2).join('')}${a === 255 ? '' : hex2(a)}`;
  }
  return null;
}

/** Commas at the top level only, so `rgb(1, 2, 3)` stays one part. */
function split(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const c of text) {
    if (c === '(') depth += 1;
    if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) {
      parts.push(part.trim());
      part = '';
    } else part += c;
  }
  parts.push(part.trim());
  return parts;
}

/** A background as written, or null where it is neither a colour nor a gradient this reads. */
export function fillOf(said: unknown): Fill | null {
  if (typeof said !== 'string') return null;
  const text = said.trim().toLowerCase();
  if (text.length > 400) return null;
  if (!text.startsWith('linear-gradient')) {
    const colour = colourOf(text);
    return colour === null ? null : { kind: 'solid', colour };
  }
  const inside = /^linear-gradient\s*\((.*)\)$/.exec(text)?.[1];
  if (inside === undefined) return null;
  let parts = split(inside);
  let angle = 180;
  const turned = ANGLE.exec(parts[0] ?? '');
  if (turned !== null) {
    angle = Number(turned[1]);
    parts = parts.slice(1);
  }
  if (parts.length < STOPS_LEAST || parts.length > STOPS_MOST) return null;
  const read: { colour: string; at: number | null }[] = [];
  for (const part of parts) {
    const match = STOP.exec(part);
    const colour = match === null ? null : colourOf(match[1]);
    if (match === null || colour === null) return null;
    const at = match[2] === undefined ? null : Number(match[2]);
    if (at !== null && (at < 0 || at > 100)) return null;
    read.push({ colour, at });
  }
  // Stops with no place are spread between their neighbours, as CSS spreads them.
  const places = read.map((one, index) => one.at ?? (index === 0 ? 0 : index === read.length - 1 ? 100 : null));
  for (let index = 0; index < places.length; index += 1) {
    if (places[index] !== null) continue;
    const from = index - 1;
    let to = index;
    while (places[to] === null) to += 1;
    const start = places[from] as number;
    const end = places[to] as number;
    for (let between = index; between < to; between += 1) places[between] = start + ((end - start) * (between - from)) / (to - from);
    index = to;
  }
  let least = 0;
  const stops = read.map((one, index) => {
    least = Math.max(least, places[index] as number);
    return { colour: one.colour, at: least };
  });
  return { kind: 'gradient', angle: ((angle % 360) + 360) % 360, stops };
}

const number = (value: number) => String(Math.round(value * 100) / 100);

/** A background in its one spelling, which is also CSS. */
export function writtenFill(fill: Fill): string {
  if (fill.kind === 'solid') return fill.colour;
  return `linear-gradient(${number(fill.angle)}deg, ${fill.stops.map((stop) => `${stop.colour} ${number(stop.at)}%`).join(', ')})`;
}

/** What the props say about how an element looks, each undefined where nothing is said. */
export interface Look {
  fill?: Fill;
  color?: string;
  borderWidth?: number;
  borderStyle?: BorderStyle;
  borderColor?: string;
  radius?: number;
  shadow?: Exclude<Shadow, 'none'>;
}

export function lookOf(element: Pick<WireframeElement, 'props'>): Look {
  const props = element.props ?? {};
  const look: Look = {};
  const fill = fillOf(props.fill);
  if (fill !== null) look.fill = fill;
  const color = colourOf(props.color);
  if (color !== null) look.color = color;
  if (typeof props.borderWidth === 'number' && Number.isFinite(props.borderWidth)) look.borderWidth = Math.min(BORDER_MOST, Math.max(0, Math.round(props.borderWidth)));
  if (typeof props.borderStyle === 'string' && (BORDER_STYLES as readonly string[]).includes(props.borderStyle)) look.borderStyle = props.borderStyle as BorderStyle;
  const borderColor = colourOf(props.borderColor);
  if (borderColor !== null) look.borderColor = borderColor;
  if (typeof props.radius === 'number' && Number.isFinite(props.radius)) look.radius = Math.min(RADIUS_MOST, Math.max(0, Math.round(props.radius)));
  if (props.shadow === 'small' || props.shadow === 'medium' || props.shadow === 'large') look.shadow = props.shadow;
  return look;
}

/** A border as drawn on the canvas: its colour (null for none), its width and its dashes. */
export interface Stroke {
  colour: string | null;
  width: number;
  dashes: string | null;
}

/**
 * The kind's own outline under what the props say - the same rule as the
 * server's picture: a width or a colour given to a kind with no outline draws
 * a solid one, and `none` or a width of 0 draws none. Null where the props
 * say nothing and the stylesheet's own outline stands.
 */
export function strokeOf(look: Look, kind: { colour: string | null; width: number; dashed?: boolean }, ink: string): Stroke | null {
  if (look.borderWidth === undefined && look.borderStyle === undefined && look.borderColor === undefined) return null;
  const width = look.borderWidth ?? kind.width;
  const style = look.borderStyle ?? (kind.dashed === true && kind.colour !== null ? 'dashed' : 'solid');
  if (style === 'none' || width <= 0) return { colour: null, width: 0, dashes: null };
  const dashes = style === 'dashed' ? `${number(Math.max(4, width * 3))} ${number(Math.max(3, width * 2))}` : style === 'dotted' ? `${number(width)} ${number(width)}` : null;
  return { colour: look.borderColor ?? kind.colour ?? ink, width, dashes };
}

/** Where an SVG gradient runs to draw what CSS draws for a box at that angle (0 up, 90 right). */
export function gradientLine(angle: number, box: { x: number; y: number; w: number; h: number }) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const half = (Math.abs(box.w * dx) + Math.abs(box.h * dy)) / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
}

/** A colour split into six digits and an opacity, as an `<input type="color">` and an SVG stop take it. */
export function opaque(colour: string): { hex: string; opacity: number } {
  return colour.length === 9 ? { hex: colour.slice(0, 7), opacity: parseInt(colour.slice(7), 16) / 255 } : { hex: colour, opacity: 1 };
}

/** The props with the style ones that [patch] names replaced, and those it sets to undefined taken away. */
export function withProps(element: WireframeElement, patch: Record<string, string | number | boolean | undefined>): WireframeElement {
  const props = { ...(element.props ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete props[key];
    else props[key] = value;
  }
  if (Object.keys(props).length > 0) return { ...element, props };
  const { props: _none, ...rest } = element;
  void _none;
  return rest;
}
