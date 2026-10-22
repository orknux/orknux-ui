import { useEffect, useRef, useState } from 'react';

import type { RatingDay } from '../../api/ratings';
import { t } from '../../i18n';
import own from './RatingsChart.module.css';
import styles from './UsageReportChart.module.css';
import { barPath, dayLabel } from './UsageReportChart';

/** What the chart plots: how many reviews came in, or how they scored on average. */
type RatingMeasure = 'REVIEWS' | 'AVERAGE';

const MEASURES: readonly RatingMeasure[] = ['REVIEWS', 'AVERAGE'];

const HEIGHT = 140;
const AXIS_WIDTH = 40;
const DAYS_HEIGHT = 20;
const HEADROOM = 8;
const TICKS = 3;
const SEGMENT_GAP = 2;
const MAX_DAY_LABELS = 7;

interface Segment {
  key: 'low' | 'middling' | 'high';
  label: string;
  value: number;
  className: string;
}

function named(measure: RatingMeasure): { option: string; heading: string } {
  return measure === 'REVIEWS'
    ? { option: t('Reviews'), heading: t('Reviews per day') }
    : { option: t('Average'), heading: t('Average score per day') };
}

/**
 * The ratings report day by day, drawn as the usage and errors charts are:
 * how many reviews came in, stacked by how they went - 1 or 2, 3, 4 or 5 - or,
 * switched, the day's mean score on the 1 to 5 scale, a point for each day
 * that had one.
 */
export function RatingsChart({ series }: { series: RatingDay[] }) {
  const [measure, setMeasure] = useState<RatingMeasure>('REVIEWS');
  const [hovered, setHovered] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const segmentsOf = (day: RatingDay): Segment[] => [
    { key: 'low', label: t('1 or 2'), value: day.counts[0] + day.counts[1], className: own.low },
    { key: 'middling', label: '3', value: day.counts[2], className: own.middling },
    { key: 'high', label: t('4 or 5'), value: day.counts[3] + day.counts[4], className: own.high },
  ];

  const totals = series.map((day) => day.counts.reduce((sum, one) => sum + one, 0));
  // Whole steps for a count; the scale itself, 1 to 5, for the mean.
  const top = measure === 'REVIEWS' ? Math.max(1, Math.ceil(Math.max(...totals, 0) / TICKS)) * TICKS : 5;
  const bottom = measure === 'REVIEWS' ? 0 : 1;
  const ticks = measure === 'REVIEWS' ? Array.from({ length: TICKS + 1 }, (_, index) => (top / TICKS) * index) : [1, 2, 3, 4, 5];
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const slot = series.length === 0 ? 0 : plotWidth / series.length;
  const barWidth = Math.max(1, slot >= 6 ? slot * 0.7 : slot - (slot >= 3 ? 1 : 0));
  const y = (value: number) => HEADROOM + HEIGHT - ((value - bottom) / (top - bottom)) * HEIGHT;
  const centre = (index: number) => AXIS_WIDTH + index * slot + slot / 2;
  const every = Math.max(1, Math.ceil(series.length / MAX_DAY_LABELS));
  const active = hovered === null ? null : series[hovered];
  const scored = series.map((day, index) => ({ day, index })).filter((one) => one.day.average !== null);

  return (
    <div className={styles.chartBlock} data-testid="ratings-chart" data-measure={measure}>
      <div className={styles.head}>
        <h3 className={styles.heading}>{named(measure).heading}</h3>
        {measure === 'REVIEWS' && (
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
          {MEASURES.map((one) => (
            <button
              key={one}
              type="button"
              className={measure === one ? styles.switchOn : styles.switchOff}
              aria-pressed={measure === one}
              onClick={() => setMeasure(one)}
              data-measure-option={one}
            >
              {named(one).option}
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
            aria-label={named(measure).heading}
          >
            {ticks.map((value, index) => {
              const at = Math.round(y(value)) + 0.5;
              return (
                <g key={value}>
                  <line className={index === 0 ? styles.baseline : styles.grid} x1={AXIS_WIDTH} x2={width} y1={at} y2={at} />
                  <text className={styles.axisLabel} x={AXIS_WIDTH - 8} y={at} dominantBaseline="middle" textAnchor="end">
                    {value}
                  </text>
                </g>
              );
            })}

            {measure === 'REVIEWS' &&
              series.map((day, index) => {
                const x = AXIS_WIDTH + index * slot + (slot - barWidth) / 2;
                let base = HEADROOM + HEIGHT;
                const drawn = segmentsOf(day).filter((one) => one.value > 0);
                return (
                  <g key={day.day} className={hovered !== null && hovered !== index ? styles.dimmed : undefined} data-bar-day={day.day}>
                    {drawn.map((one, at) => {
                      const height = HEADROOM + HEIGHT - y(one.value);
                      const gap = at > 0 && height > SEGMENT_GAP * 2 ? SEGMENT_GAP : 0;
                      const path = barPath(x, base - height, barWidth, height - gap, at === drawn.length - 1);
                      base -= height;
                      return <path key={one.key} className={one.className} d={path} data-segment={one.key} />;
                    })}
                  </g>
                );
              })}

            {measure === 'AVERAGE' && scored.length > 0 && (
              <g data-average-line="">
                {scored.length > 1 && (
                  <polyline className={own.line} points={scored.map((one) => `${centre(one.index)},${y(one.day.average ?? 0)}`).join(' ')} />
                )}
                {scored.map((one) => (
                  <circle key={one.day.day} className={own.dot} cx={centre(one.index)} cy={y(one.day.average ?? 0)} r={3} data-average-day={one.day.day} />
                ))}
              </g>
            )}

            {series.map((day, index) =>
              index % every === 0 ? (
                <text key={`label-${day.day}`} className={styles.axisLabel} x={centre(index)} y={HEADROOM + HEIGHT + DAYS_HEIGHT - 4} textAnchor="middle">
                  {dayLabel(day.day)}
                </text>
              ) : null,
            )}

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
            data-testid="ratings-chart-tooltip"
            style={
              AXIS_WIDTH + (hovered + 0.5) * slot > width / 2
                ? { right: width - (AXIS_WIDTH + hovered * slot) + 8 }
                : { left: AXIS_WIDTH + (hovered + 1) * slot + 8 }
            }
          >
            <span className={styles.tooltipDay}>{dayLabel(active.day, true)}</span>
            {segmentsOf(active).map((one) => (
              <span key={one.key} className={styles.tooltipRow}>
                <span className={`${styles.swatch} ${one.className}`} aria-hidden="true" />
                <span className={styles.tooltipLabel}>{one.label}</span>
                <span className={styles.tooltipValue}>{one.value}</span>
              </span>
            ))}
            <span className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
              <span className={styles.tooltipLabel}>{t('Average')}</span>
              <span className={styles.tooltipValue}>{active.average === null ? '—' : `${active.average.toFixed(1)} / 5`}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_DAY: RatingDay = { day: '', counts: [0, 0, 0, 0, 0], average: null };
