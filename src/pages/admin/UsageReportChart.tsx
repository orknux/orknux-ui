import { useEffect, useRef, useState } from 'react';

import { costAmount, tokenCount } from '../../api/chat';
import { shortTokens } from '../../api/usage';
import type { UsageDay } from '../../api/usage';
import { t, tf } from '../../i18n';
import styles from './UsageReportChart.module.css';

/** What the chart plots: tokens and money have different units, so they never share an axis. */
export type UsageMeasure = 'TOKENS' | 'COST';

const HEIGHT = 180;
/** Room on the left for the axis labels, and under the plot for the days. */
const AXIS_WIDTH = 52;
const DAYS_HEIGHT = 20;
/** Room above the plot for the top gridline's label, which is centred on its line. */
const HEADROOM = 8;
const TICKS = 3;
/** The surface between two stacked segments, so neighbours read as two things. */
const SEGMENT_GAP = 2;
const MAX_DAY_LABELS = 7;

interface Segment {
  key: 'fresh' | 'cached' | 'output' | 'cost';
  label: string;
  value: number;
  className: string;
}

/**
 * The usage report day by day, over the table: input split into what was
 * served from the provider's cache and what was not, with output stacked on
 * top - or, switched, what each day cost. One measure at a time, because a
 * token count and a price on one axis is two charts pretending to be one.
 */
export function UsageReportChart({ series }: { series: UsageDay[] }) {
  const [measure, setMeasure] = useState<UsageMeasure>('TOKENS');
  const [hovered, setHovered] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Drawn in pixels rather than stretched, so a rounded end stays round at any width.
  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const segmentsOf = (day: UsageDay): Segment[] =>
    measure === 'TOKENS'
      ? [
          { key: 'fresh', label: t('Input, not cached'), value: Math.max(0, day.inputTokens - day.cachedInputTokens), className: styles.fresh },
          { key: 'cached', label: t('Input, cached'), value: day.cachedInputTokens, className: styles.cached },
          { key: 'output', label: t('Output'), value: day.outputTokens, className: styles.output },
        ]
      : [{ key: 'cost', label: t('Cost'), value: day.cost === null ? 0 : Number(day.cost), className: styles.cost }];

  const totals = series.map((day) => segmentsOf(day).reduce((sum, one) => sum + one.value, 0));
  const top = niceCeiling(Math.max(...totals, 0));
  const say = (value: number) => (value === 0 ? '0' : measure === 'TOKENS' ? shortTokens(value) : costAmount(value));

  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const slot = series.length === 0 ? 0 : plotWidth / series.length;
  // Thin bars with air between them while there is room; a year of days touches.
  const barWidth = Math.max(1, slot >= 6 ? slot * 0.7 : slot - (slot >= 3 ? 1 : 0));
  const y = (value: number) => HEADROOM + HEIGHT - (top === 0 ? 0 : (value / top) * HEIGHT);
  const every = Math.max(1, Math.ceil(series.length / MAX_DAY_LABELS));
  const active = hovered === null ? null : series[hovered];

  return (
    <div className={styles.chartBlock} data-testid="usage-chart" data-measure={measure}>
      <div className={styles.head}>
        <h3 className={styles.heading}>{measure === 'TOKENS' ? t('Tokens per day') : t('Cost per day')}</h3>
        {measure === 'TOKENS' && (
          <ul className={styles.legend} aria-label={t('Legend')}>
            {segmentsOf(series[0] ?? EMPTY_DAY).map((one) => (
              <li key={one.key} className={styles.legendItem} data-legend={one.key}>
                <span className={`${styles.swatch} ${one.className}`} aria-hidden="true" />
                {one.label}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.switch} role="group" aria-label={t('Show')}>
          {(['TOKENS', 'COST'] as const).map((one) => (
            <button
              key={one}
              type="button"
              className={measure === one ? styles.switchOn : styles.switchOff}
              aria-pressed={measure === one}
              onClick={() => setMeasure(one)}
              data-measure-option={one}
            >
              {one === 'TOKENS' ? t('Tokens') : t('Cost')}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.plot} ref={box} onMouseLeave={() => setHovered(null)}>
        {width > 0 && (
          <svg
            className={styles.svg}
            width={width}
            height={HEADROOM + HEIGHT + DAYS_HEIGHT}
            role="img"
            aria-label={tf('{what} per day, up to {peak}', {
              what: measure === 'TOKENS' ? t('Tokens') : t('Cost'),
              peak: say(Math.max(...totals, 0)),
            })}
          >
            {/* Recessive: the grid is for reading against, not for looking at. */}
            {Array.from({ length: TICKS + 1 }, (_, index) => {
              const value = (top / TICKS) * index;
              const at = Math.round(y(value)) + 0.5;
              return (
                <g key={index}>
                  <line className={index === 0 ? styles.baseline : styles.grid} x1={AXIS_WIDTH} x2={width} y1={at} y2={at} />
                  {top > 0 && (
                    <text className={styles.axisLabel} x={AXIS_WIDTH - 8} y={at} dominantBaseline="middle" textAnchor="end">
                      {say(value)}
                    </text>
                  )}
                </g>
              );
            })}

            {series.map((day, index) => {
              const x = AXIS_WIDTH + index * slot + (slot - barWidth) / 2;
              let base = HEADROOM + HEIGHT;
              const drawn = segmentsOf(day).filter((one) => one.value > 0);
              return (
                <g key={day.day} className={hovered !== null && hovered !== index ? styles.dimmed : undefined} data-bar-day={day.day}>
                  {drawn.map((one, at) => {
                    const height = HEADROOM + HEIGHT - y(one.value);
                    // Every segment but the lowest gives up its foot to the gap, while it has one to give.
                    const gap = at > 0 && height > SEGMENT_GAP * 2 ? SEGMENT_GAP : 0;
                    const path = barPath(x, base - height, barWidth, height - gap, at === drawn.length - 1);
                    base -= height;
                    return <path key={one.key} className={one.className} d={path} data-segment={one.key} />;
                  })}
                  {index % every === 0 && (
                    <text
                      className={styles.axisLabel}
                      x={AXIS_WIDTH + index * slot + slot / 2}
                      y={HEADROOM + HEIGHT + DAYS_HEIGHT - 4}
                      textAnchor="middle"
                    >
                      {dayLabel(day.day)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* A target per day the whole height of the plot, so a short bar is as easy to land on as a tall one. */}
            {series.map((day, index) => (
              <rect
                key={`hit-${day.day}`}
                x={AXIS_WIDTH + index * slot}
                y={0}
                width={slot}
                height={HEADROOM + HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
                data-day={day.day}
              />
            ))}
          </svg>
        )}

        {active !== null && hovered !== null && (
          <div
            className={styles.tooltip}
            data-testid="usage-chart-tooltip"
            style={
              AXIS_WIDTH + (hovered + 0.5) * slot > width / 2
                ? { right: width - (AXIS_WIDTH + hovered * slot) + 8 }
                : { left: AXIS_WIDTH + (hovered + 1) * slot + 8 }
            }
          >
            <span className={styles.tooltipDay}>{dayLabel(active.day, true)}</span>
            {segmentsOf(active).map((one) => (
              <span key={one.key} className={styles.tooltipRow}>
                {measure === 'TOKENS' && <span className={`${styles.swatch} ${one.className}`} aria-hidden="true" />}
                <span className={styles.tooltipLabel}>
                  {/* A plus on the amount says some was unpriced; the label says what the amount is of. */}
                  {measure === 'COST' && active.partlyUnpriced ? t('Cost of priced calls') : one.label}
                </span>
                <span className={styles.tooltipValue} title={measure === 'TOKENS' ? tokenCount(one.value) : undefined}>
                  {measure === 'TOKENS'
                    ? shortTokens(one.value)
                    : active.cost === null ? '—' : `${costAmount(one.value)}${active.partlyUnpriced ? '+' : ''}`}
                </span>
              </span>
            ))}
            {measure === 'TOKENS' && (
              <span className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
                <span className={styles.tooltipLabel}>{t('Total')}</span>
                <span className={styles.tooltipValue}>{shortTokens(active.inputTokens + active.outputTokens)}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_DAY: UsageDay = { day: '', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, cost: null, partlyUnpriced: false };

/** A bar from its foot up, rounded only at its free end - the top of the stack. */
function barPath(x: number, top: number, width: number, height: number, roundTop: boolean): string {
  const r = roundTop ? Math.min(2, width / 2, height) : 0;
  const bottom = top + height;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${top + r}`,
    r > 0 ? `Q ${x} ${top} ${x + r} ${top}` : '',
    `L ${x + width - r} ${top}`,
    r > 0 ? `Q ${x + width} ${top} ${x + width} ${top + r}` : '',
    `L ${x + width} ${bottom}`,
    'Z',
  ].join(' ');
}

/** The axis's top: the peak rounded up to a step of 1, 2, 2.5 or 5 at its scale, so the gridlines read as round numbers. */
function niceCeiling(peak: number): number {
  if (peak <= 0) return 0;
  const rough = peak / TICKS;
  const scale = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((one) => one * scale).find((one) => one >= rough) ?? 10 * scale;
  return step * TICKS;
}

/** "2026-10-03" as "Oct 3", or "Sat, Oct 3" in the tooltip; the day is the server's, so no zone moves it. */
function dayLabel(day: string, long = false): string {
  const [year, month, date] = day.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, date));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(long ? { weekday: 'short' } : {}) }).format(at);
}
