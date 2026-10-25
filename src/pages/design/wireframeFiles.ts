import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { exportWireframeHtml } from '../../api/wireframes';
import type { WireframeElement } from '../../api/wireframes';
import { t } from '../../i18n';
import { boundsOf, WireframeShapes } from './WireframeDrawing';

/**
 * A wireframe out of the editor as a file. Issue #655's export.
 *
 * HTML is the server's (`WireframeHtml`), so the editor and the
 * `orknux_wireframe_html` tool hand out the same page. SVG and PNG are the
 * drawing as the canvas draws it: the same `WireframeShapes`, drawn once more
 * off screen with the stylesheet's values written onto each shape, because a
 * file taken away has no stylesheet and no tokens to read them from.
 */

export type WireframeExportFormat = 'html' | 'svg' | 'png';

/** Room around the drawing in an SVG or a PNG, in the drawing's pixels. */
const PAD = 24;

/** How many device pixels a PNG gives each pixel of the drawing, so words stay sharp. */
const PNG_SCALE = 2;

/** Saves the wireframe to the computer, named after it. */
export async function exportWireframe(
  id: string,
  name: string,
  elements: WireframeElement[],
  format: WireframeExportFormat,
  workspaceId?: string,
): Promise<void> {
  const base = fileBase(name);
  if (format === 'html') {
    const page = await exportWireframeHtml(id, elements);
    save(new Blob([page], { type: 'text/html;charset=utf-8' }), `${base}.html`);
    return;
  }
  const svg = await drawn(elements, workspaceId);
  if (format === 'svg') {
    save(new Blob([svg.text], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`);
    return;
  }
  save(await png(svg), `${base}.png`);
}

/** CSS properties that decide how a shape looks, written onto each one. */
const SHAPE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight'];

/** And for the words inside a box, which are HTML in a foreignObject. */
const WORDS_PROPS = [
  'display',
  'box-sizing',
  'width',
  'height',
  'overflow',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'align-items',
  'justify-content',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'white-space',
  'overflow-wrap',
];

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The drawing as a standalone SVG document, and its size in the drawing's
 * pixels. A picture on it is carried in the file as a `data:` address: a file
 * taken away has no server to fetch it from, and a PNG is drawn from an SVG
 * that may not fetch anything at all.
 */
async function drawn(elements: WireframeElement[], workspaceId?: string): Promise<{ text: string; width: number; height: number }> {
  const bounds = boundsOf(elements) ?? { x: 0, y: 0, w: 100, h: 60 };
  const width = Math.ceil(bounds.w + PAD * 2);
  const height = Math.ceil(bounds.h + PAD * 2);
  const viewBox = `${bounds.x - PAD} ${bounds.y - PAD} ${width} ${height}`;

  // Drawn where nobody sees it, in this document, so the stylesheet applies and can be read back.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(
        createElement(
          'svg',
          { xmlns: SVG_NS, width, height, viewBox },
          createElement(WireframeShapes, { elements, markerId: 'wireframe-export-arrow', workspaceId }),
        ),
      ),
    );
    const svg = host.querySelector('svg');
    if (svg === null) throw new Error(t('Could not export the wireframe.'));
    const copy = svg.cloneNode(true) as SVGSVGElement;
    inline(svg, copy);
    const desk = getComputedStyle(document.documentElement).getPropertyValue('--wireframe-desk').trim() || '#ffffff';
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('x', String(bounds.x - PAD));
    background.setAttribute('y', String(bounds.y - PAD));
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', desk);
    copy.insertBefore(background, copy.firstChild);
    await carried(copy);
    return { text: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`, width, height };
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Each picture's address replaced by its bytes; one that cannot be had is left out rather than left pointing at this server. */
async function carried(svg: SVGSVGElement) {
  for (const picture of Array.from(svg.querySelectorAll('image'))) {
    const source = picture.getAttribute('href') ?? '';
    try {
      const answer = await fetch(source, { credentials: 'same-origin' });
      if (!answer.ok) throw new Error(String(answer.status));
      const bytes = await answer.blob();
      const address = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
        reader.readAsDataURL(bytes);
      });
      picture.setAttribute('href', address);
    } catch {
      picture.remove();
    }
  }
}

/** Walks the drawn tree and its copy together, writing what the stylesheet gave each element onto the copy. */
function inline(from: Element, to: Element) {
  const computed = getComputedStyle(from);
  const html = from.namespaceURI !== SVG_NS;
  const props = html ? WORDS_PROPS : SHAPE_PROPS;
  const style = props.map((prop) => `${prop}:${computed.getPropertyValue(prop)}`).join(';');
  if (!(from instanceof SVGSVGElement)) to.setAttribute('style', style);
  to.removeAttribute('class');
  for (let at = 0; at < from.children.length; at += 1) inline(from.children[at], to.children[at]);
}

/** The SVG drawn onto a canvas, as a PNG. */
async function png(svg: { text: string; width: number; height: number }): Promise<Blob> {
  const picture = new Image();
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.text)}`;
  await picture.decode().catch(() => {
    throw new Error(t('Could not export the wireframe.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = svg.width * PNG_SCALE;
  canvas.height = svg.height * PNG_SCALE;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error(t('Could not export the wireframe.'));
  context.scale(PNG_SCALE, PNG_SCALE);
  context.drawImage(picture, 0, 0, svg.width, svg.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob === null ? reject(new Error(t('Could not export the wireframe.'))) : resolve(blob)), 'image/png'),
  );
}

/** A name a file system takes, as the server names the HTML download. */
function fileBase(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'wireframe';
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
