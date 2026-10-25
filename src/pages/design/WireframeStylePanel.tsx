import type { WireframeElement } from '../../api/wireframes';
import { isCheckable } from '../../api/wireframes';
import form from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import styles from './WireframeStylePanel.module.css';
import { BORDER_MOST, BORDER_STYLES, lookOf, opaque, RADIUS_MOST, SHADOWS, STOPS_LEAST, STOPS_MOST, writtenFill } from './wireframeStyle';
import type { BorderStyle, Fill, Shadow, Stop } from './wireframeStyle';

/** What a change says: the props it sets, and undefined for each it takes away. */
export type StylePatch = Record<string, string | number | boolean | undefined>;

/** What a colour field shows while nothing is chosen: the paper and the ink of the pencil drawing. */
const PAPER = '#ffffff';
const INK = '#3f3f46';
const SHADE = '#d4d4d8';

const BORDER_LABELS: Record<BorderStyle, () => string> = {
  solid: () => t('Solid'),
  dashed: () => t('Dashed'),
  dotted: () => t('Dotted'),
  none: () => t('None'),
};

const SHADOW_LABELS: Record<Shadow, () => string> = {
  none: () => t('None'),
  small: () => t('Small'),
  medium: () => t('Medium'),
  large: () => t('Large'),
};

/** A whole number from a field, or undefined for an empty one; held to its range. */
function whole(value: string, most: number): number | undefined {
  if (value.trim() === '') return undefined;
  const read = Number(value);
  return Number.isFinite(read) ? Math.min(most, Math.max(0, Math.round(read))) : undefined;
}

/**
 * How the selected elements look: background, the colour of their words,
 * border, corners and shadow, and whether a checkbox is ticked. What is shown
 * is the first selected element's; a change is made to every one selected.
 */
export function WireframeStylePanel({ chosen, onStyle }: { chosen: WireframeElement[]; onStyle: (patch: StylePatch, key: string) => void }) {
  const first = chosen[0];
  if (first === undefined) return null;
  const look = lookOf(first);
  const fill = look.fill;
  const checkable = chosen.some((one) => isCheckable(one.type));

  const setFill = (next: Fill | undefined, key = 'fill') => onStyle({ fill: next === undefined ? undefined : writtenFill(next) }, key);
  const gradient = fill?.kind === 'gradient' ? fill : null;
  const setStops = (stops: Stop[], key: string) => gradient !== null && setFill({ ...gradient, stops }, key);

  return (
    <div className={styles.panel} data-testid="wireframe-style">
      <span className={styles.heading}>{t('Style')}</span>

      {checkable && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={first.props?.checked === true}
            onChange={(event) => onStyle({ checked: event.target.checked ? true : undefined }, 'checked')}
            data-testid="wireframe-style-checked"
          />
          {t('Checked')}
        </label>
      )}

      <div className={styles.row}>
        <label className={styles.field}>
          <span>{t('Fill')}</span>
          <select
            className={`${form.select} ${styles.select}`}
            value={fill?.kind ?? 'default'}
            onChange={(event) => {
              const kind = event.target.value;
              const from = fill?.kind === 'solid' ? fill.colour : gradient?.stops[0]?.colour ?? PAPER;
              if (kind === 'default') setFill(undefined);
              else if (kind === 'solid') setFill({ kind: 'solid', colour: from });
              else setFill({ kind: 'gradient', angle: 180, stops: [{ colour: from, at: 0 }, { colour: SHADE, at: 100 }] });
            }}
            data-testid="wireframe-style-fill"
          >
            <option value="default">{t('Default')}</option>
            <option value="solid">{t('Colour')}</option>
            <option value="gradient">{t('Gradient')}</option>
          </select>
        </label>
        {fill?.kind === 'solid' && (
          <label className={styles.field}>
            <span>{t('Colour')}</span>
            <input
              type="color"
              className={styles.colour}
              value={opaque(fill.colour).hex}
              onChange={(event) => setFill({ kind: 'solid', colour: event.target.value }, 'fill-colour')}
              data-testid="wireframe-style-fill-colour"
            />
          </label>
        )}
        {gradient !== null && (
          <label className={styles.field}>
            <span>{t('Angle')}</span>
            <input
              className={`${form.input} ${form.inputMono} ${styles.number}`}
              type="number"
              min={0}
              max={359}
              value={gradient.angle}
              onChange={(event) => {
                const angle = Number(event.target.value);
                if (Number.isFinite(angle)) setFill({ ...gradient, angle: ((Math.round(angle) % 360) + 360) % 360 }, 'fill-angle');
              }}
              data-testid="wireframe-style-angle"
            />
          </label>
        )}
      </div>

      {gradient !== null && (
        <div className={styles.stops} data-testid="wireframe-style-stops">
          {gradient.stops.map((stop, at) => (
            <div key={at} className={styles.stop}>
              <input
                type="color"
                className={styles.colour}
                value={opaque(stop.colour).hex}
                onChange={(event) => setStops(gradient.stops.map((one, index) => (index === at ? { ...one, colour: event.target.value } : one)), `stop-colour-${at}`)}
                aria-label={t('Colour')}
                data-testid={`wireframe-style-stop-colour-${at}`}
              />
              <input
                className={`${form.input} ${form.inputMono} ${styles.number}`}
                type="number"
                min={0}
                max={100}
                value={Math.round(stop.at)}
                onChange={(event) => {
                  const place = whole(event.target.value, 100);
                  if (place !== undefined) setStops(gradient.stops.map((one, index) => (index === at ? { ...one, at: place } : one)), `stop-at-${at}`);
                }}
                aria-label={t('Position')}
                data-testid={`wireframe-style-stop-at-${at}`}
              />
              <span className={styles.unit}>%</span>
              {gradient.stops.length > STOPS_LEAST && (
                <button
                  type="button"
                  className={`${form.ghost} ${styles.small}`}
                  onClick={() => setStops(gradient.stops.filter((_, index) => index !== at), 'stop-remove')}
                  title={t('Remove stop')}
                  aria-label={t('Remove stop')}
                  data-testid={`wireframe-style-stop-remove-${at}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {gradient.stops.length < STOPS_MOST && (
            <button
              type="button"
              className={`${form.ghost} ${styles.small}`}
              onClick={() => {
                const last = gradient.stops[gradient.stops.length - 1];
                // Placed at the end, the others moved up to keep it in order.
                setStops([...gradient.stops.map((one) => ({ ...one, at: Math.min(one.at, 99) })), { colour: last?.colour ?? SHADE, at: 100 }], 'stop-add');
              }}
              data-testid="wireframe-style-stop-add"
            >
              + {t('Add stop')}
            </button>
          )}
        </div>
      )}

      <div className={styles.row}>
        <label className={styles.field}>
          <span>{t('Text colour')}</span>
          <span className={styles.pair}>
            <input
              type="color"
              className={styles.colour}
              value={opaque(look.color ?? INK).hex}
              onChange={(event) => onStyle({ color: event.target.value }, 'color')}
              data-testid="wireframe-style-color"
            />
            {look.color !== undefined && (
              <button type="button" className={`${form.ghost} ${styles.small}`} onClick={() => onStyle({ color: undefined }, 'color-reset')} title={t('Reset')} aria-label={t('Reset')}>
                ×
              </button>
            )}
          </span>
        </label>
        <label className={styles.field}>
          <span>{t('Shadow')}</span>
          <select
            className={`${form.select} ${styles.select}`}
            value={look.shadow ?? 'none'}
            onChange={(event) => onStyle({ shadow: event.target.value === 'none' ? undefined : event.target.value }, 'shadow')}
            data-testid="wireframe-style-shadow"
          >
            {SHADOWS.map((shadow) => (
              <option key={shadow} value={shadow}>
                {SHADOW_LABELS[shadow]()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <span className={styles.subheading}>{t('Border')}</span>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>{t('Width')}</span>
          <input
            className={`${form.input} ${form.inputMono} ${styles.number}`}
            type="number"
            min={0}
            max={BORDER_MOST}
            value={look.borderWidth ?? ''}
            placeholder="–"
            onChange={(event) => onStyle({ borderWidth: whole(event.target.value, BORDER_MOST) }, 'borderWidth')}
            data-testid="wireframe-style-border-width"
          />
        </label>
        <label className={styles.field}>
          <span>{t('Style')}</span>
          <select
            className={`${form.select} ${styles.select}`}
            value={look.borderStyle ?? 'default'}
            onChange={(event) => onStyle({ borderStyle: event.target.value === 'default' ? undefined : event.target.value }, 'borderStyle')}
            data-testid="wireframe-style-border-style"
          >
            <option value="default">{t('Default')}</option>
            {BORDER_STYLES.map((style) => (
              <option key={style} value={style}>
                {BORDER_LABELS[style]()}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('Colour')}</span>
          <span className={styles.pair}>
            <input
              type="color"
              className={styles.colour}
              value={opaque(look.borderColor ?? INK).hex}
              onChange={(event) => onStyle({ borderColor: event.target.value }, 'borderColor')}
              data-testid="wireframe-style-border-colour"
            />
            {look.borderColor !== undefined && (
              <button type="button" className={`${form.ghost} ${styles.small}`} onClick={() => onStyle({ borderColor: undefined }, 'borderColor-reset')} title={t('Reset')} aria-label={t('Reset')}>
                ×
              </button>
            )}
          </span>
        </label>
        <label className={styles.field}>
          <span>{t('Radius')}</span>
          <input
            className={`${form.input} ${form.inputMono} ${styles.number}`}
            type="number"
            min={0}
            max={RADIUS_MOST}
            value={look.radius ?? ''}
            placeholder="–"
            onChange={(event) => onStyle({ radius: whole(event.target.value, RADIUS_MOST) }, 'radius')}
            data-testid="wireframe-style-radius"
          />
        </label>
      </div>
    </div>
  );
}
