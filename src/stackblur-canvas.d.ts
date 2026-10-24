/**
 * The part of stackblur-canvas the image editor uses. The package ships no
 * types of its own and DefinitelyTyped has none for this version, so the one
 * call is declared here - its signature as `dist/stackblur-es.js` has it.
 */
declare module 'stackblur-canvas' {
  /** Blurs a box of the canvas in place, alpha included; a radius under 1 does nothing. */
  export function canvasRGBA(canvas: HTMLCanvasElement, topX: number, topY: number, width: number, height: number, radius: number): void;
}
