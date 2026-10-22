import { useEffect, useRef, useState } from 'react';

import type { ErrorDay } from '../../api/errors';
import { t, tf } from '../../i18n';
import styles from './UsageReportChart.module.css';
import { barPath, dayLabel } from './UsageReportChart';

const HEIGHT = 140;
const AXIS_WIDTH = 40;
const DAYS_HEIGHT = 20;
const HEADROOM = 8;
const TICKS = 3;
const SEGMENT_GAP = 2;
const MAX_DAY_LABELS = 7;

interface Segment {
  key: 'runs' | 'agents' | 'models';
  label: string;
  value: number;
  className: string;
}

/**
 * The errors report day by day: how many runs, agents and quick chats failed,
 * stacked, drawn as the usage report's chart is so the two read alike. A count
 * is whole, so the axis steps in whole numbers.
 */
export function ErrorsChart({ series }: { series: ErrorDay[] }) {
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

  const segmentsOf = (day: ErrorDay): Segment[] => [
    { key: 'runs', label: t('Workflow runs'), value: day.runs, className: styles.fresh },
    { key: 'agents', label: t('Agents'), value: day.agents, className: styles.cached },
    { key: 'models', label: t('Quick chat'), value: day.models, className: styles.output },
  ];

  const totals = series.map((day) => day.runs + day.agents + day.models);
  const peak = Math.max(...totals, 0);
  // Whole steps: a third of the peak, rounded up, and never below one.
  const top = Math.max(1, Math.ceil(peak / TICKS)) * TICKS;
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const slot = series.length === 0 ? 0 : plotWidth / series.length;
  const barWidth = Math.max(1, slot >= 6 ? slot * 0.7 : slot - (slot >= 3 ? 1 : 0));
  const y = (value: number) => HEADROOM + HEIGHT - (value / top) * HEIGHT;
  const every = Math.max(1, Math.ceil(series.length / MAX_DAY_LABELS));
  const active = hovered === null ? null : series[hovered];

  return (
    <div className={styles.chartBlock} data-testid="errors-chart">
      <div className={styles.head}>
        <h3 className={styles.heading}>{t('Errors per day')}</h3>
        <ul className={styles.legend} aria-label={t('Legend')}>
          {segmentsOf(series[0] ?? EMPTY_DAY).map((one) => (
            <li key={one.key} className={styles.legendItem} data-legend={one.key}>
              <span className={`${styles.swatch} ${one.className}`} aria-hidden="true" />
              {one.label}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.plot} ref={box} onMouseLeave={() => setHovered(null)}>
        {width > 0 && (
          <svg
            className={styles.svg}
            width={width}
            height={HEADROOM + HEIGHT + DAYS_HEIGHT}
            role="img"
            aria-label={tf('Errors per day, up to {peak}', { peak })}
          >
            {Array.from({ length: TICKS + 1 }, (_, index) => {
              const value = (top / TICKS) * index;
              const at = Math.round(y(value)) + 0.5;
              return (
                <g key={index}>
                  <line className={index === 0 ? styles.baseline : styles.grid} x1={AXIS_WIDTH} x2={width} y1={at} y2={at} />
                  <text className={styles.axisLabel} x={AXIS_WIDTH - 8} y={at} dominantBaseline="middle" textAnchor="end">
                    {value}
                  </text>
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
                    const gap = at > 0 && height > SEGMENT_GAP * 2 ? SEGMENT_GAP : 0;
                    const path = barPath(x, base - height, barWidth, height - gap, at === drawn.length - 1);
                    base -= height;
                    return <path key={one.key} className={one.className} d={path} data-segment={one.key} />;
                  })}
                  {index % every === 0 && (
                    <text className={styles.axisLabel} x={AXIS_WIDTH + index * slot + slot / 2} y={HEADROOM + HEIGHT + DAYS_HEIGHT - 4} textAnchor="middle">
                      {dayLabel(day.day)}
                    </text>
                  )}
                </g>
              );
            })}

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
            data-testid="errors-chart-tooltip"
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
              <span className={styles.tooltipLabel}>{t('Total')}</span>
              <span className={styles.tooltipValue}>{active.runs + active.agents + active.models}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_DAY: ErrorDay = { day: '', runs: 0, agents: 0, models: 0 };
