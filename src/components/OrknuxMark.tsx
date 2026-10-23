import { useId } from 'react';

/**
 * The Orknux mark, drawn inline in the accent colour.
 *
 * It was `orknux-mark.svg` behind an `<img>`, which is a document of its own
 * that no token reaches: an accent chosen on Preferences recoloured the whole
 * interface and left the logo moss. Inline, its fills are the accent's - the
 * nut shaded from a little lighter to a little darker than it, the kernel's
 * triad the accent itself, as the moss file had it.
 */
export function OrknuxMark({ width, height }: { width?: number; height?: number }) {
  const shade = `orknux-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="19 29 162 138" width={width} height={height} aria-hidden="true" focusable="false" data-orknux-mark="">
      <linearGradient id={shade} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent-brand) 92%, white)' }} />
        <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--color-accent-brand) 78%, black)' }} />
      </linearGradient>
      <path
        fill={`url(#${shade})`}
        fillRule="evenodd"
        d="M42 29 L67 50 L133 50 L158 29 L154 64 L181 113 L151 167 L49 167 L19 113 L46 64 Z M147 109 A47 47 0 1 0 53 109 A47 47 0 1 0 147 109 Z"
      />
      <path d="M81 125 L112 129 L121 96 Z" fill="none" style={{ stroke: 'var(--color-accent-brand)' }} strokeWidth={8} strokeLinejoin="round" />
      <circle cx="81" cy="125" r="11" style={{ fill: 'var(--color-accent-brand)' }} />
      <circle cx="112" cy="129" r="11" style={{ fill: 'var(--color-accent-brand)' }} />
      <circle cx="121" cy="96" r="11" style={{ fill: 'var(--color-accent-brand)' }} />
    </svg>
  );
}
