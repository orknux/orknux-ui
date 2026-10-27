import { useEffect, useRef, useState } from 'react';

import type { SessionFlagDay } from '../../api/flags';
import { t } from '../../i18n';
import own from './FlagsChart.module.css';
import styles from './UsageReportChart.module.css';
import { barPath, dayLabel } from './UsageReportChart';

/** What the bars are split by: the two types, or how severe the flags were. */
type FlagSplit = 'TYPE' | 'SEVERITY';

const SPLITS: readonly FlagSplit[] = ['TYPE', 'SEVERITY'];

const HEIGHT = 140;
const AXIS_WIDTH = 40;
const DAYS_HEIGHT = 20;
const HEADROOM = 8;
const TICKS = 3;
const SEGMENT_GAP = 2;
const MAX_DAY_LABELS = 7;

interface Segment {
  key: string;
  label: string;
  value: number;
  className: string;
}

function segmentsOf(day: SessionFlagDay, split: FlagSplit): Segment[] {
  if (split === 'TYPE') {
    return [
      { key: 'security', label: t('Security'), value: day.security, className: own.security },
      { key: 'technical', label: t('Technical issue'), value: day.technical, className: own.technical },
    ];
  }
  const at = (level: number) => day.severities[level] ?? 0;
  return [
    { key: 'low', label: t('Severity 0 or 1'), value: at(0) + at(1), className: own.low },
    { key: 'middling', label: t('Severity 2 or 3'), value: at(2) + at(3), className: own.middling },
    { key: 'high', label: t('Severity 4 or 5'), value: at(4) + at(5), className: own.high },
  ];
}

function headingOf(split: FlagSplit): { option: string; heading: string } {
  return split === 'TYPE'
    ? { option: t('Type'), heading: t('Flags per day, by type') }
    : { option: t('Severity'), heading: t('Flags per day, by severity') };
}

/**
 * The flags report day by day, drawn as the usage and ratings charts are: how
 * many flags were raised each day, stacked by type, or - switched - by how
 * severe they were.
 */
export function FlagsChart({ series }: { series: SessionFlagDay[] }) {
  const [split, setSplit] = useState<FlagSplit>('TYPE');
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

  const totals = series.map((day) => day.security + day.technical);
  const top = Math.max(1, Math.ceil(Math.max(...totals, 0) / TICKS)) * TICKS;
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => (top / TICKS) * index);
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const slot = series.length === 0 ? 0 : plotWidth / series.length;
  const barWidth = Math.max(1, slot >= 6 ? slot * 0.7 : slot - (slot >= 3 ? 1 : 0));
  const y = (value: number) => HEADROOM + HEIGHT - (value / top) * HEIGHT;
  const centre = (index: number) => AXIS_WIDTH + index * slot + slot / 2;
  const every = Math.max(1, Math.ceil(series.length / MAX_DAY_LABELS));
  const active = hovered === null ? null : series[hovered];

  return (
    <div className={styles.chartBlock} data-testid="flags-chart" data-split={split}>
      <div className={styles.head}>
        <h3 className={styles.heading}>{headingOf(split).heading}</h3>
        <ul className={styles.legend} aria-label={t('Legend')}>
          {segmentsOf(series[0] ?? EMPTY_DAY, split).map((one) => (
            <li key={one.key} className={styles.legendItem} data-legend={one.key}>
              <span className={`${styles.swatch} ${one.className}`} aria-hidden="true" />
              {one.label}
            </li>
          ))}
        </ul>
        <div className={styles.switch} role="group" aria-label={t('Split by')}>
          {SPLITS.map((one) => (
            <button
              key={one}
              type="button"
              className={split === one ? styles.switchOn : styles.switchOff}
              aria-pressed={split === one}
              onClick={() => setSplit(one)}
              data-split-option={one}
            >
              {headingOf(one).option}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.plot} ref={box} onMouseLeave={() => setHovered(null)}>
        {width > 0 && (
          <svg className={styles.svg} width={width} height={HEADROOM + HEIGHT + DAYS_HEIGHT} role="img" aria-label={headingOf(split).heading}>
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

            {series.map((day, index) => {
              const x = AXIS_WIDTH + index * slot + (slot - barWidth) / 2;
              let base = HEADROOM + HEIGHT;
              const drawn = segmentsOf(day, split).filter((one) => one.value > 0);
              return (
                <g key={day.day} className={hovered !== null && hovered !== index ? styles.dimmed : undefined} data-bar-day={day.day}>
                  {drawn.map((one, at) => {
                    const height = HEADROOM + HEIGHT - y(one.value);
                    const gap = at > 0 && height > SEGMENT_GAP * 2 ? SEGMENT_GAP : 0;
                    const path = barPath(x, base - height, barWidth, height - gap, at === drawn.length - 1);
                    base -= height;
                    return <path key={one.key} className={one.className} d={path} data-segment={one.key} data-count={one.value} />;
                  })}
                </g>
              );
            })}

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
            data-testid="flags-chart-tooltip"
            style={
              AXIS_WIDTH + (hovered + 0.5) * slot > width / 2
                ? { right: width - (AXIS_WIDTH + hovered * slot) + 8 }
                : { left: AXIS_WIDTH + (hovered + 1) * slot + 8 }
            }
          >
            <span className={styles.tooltipDay}>{dayLabel(active.day, true)}</span>
            {segmentsOf(active, split).map((one) => (
              <span key={one.key} className={styles.tooltipRow}>
                <span className={`${styles.swatch} ${one.className}`} aria-hidden="true" />
                <span className={styles.tooltipLabel}>{one.label}</span>
                <span className={styles.tooltipValue}>{one.value}</span>
              </span>
            ))}
            <span className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
              <span className={styles.tooltipLabel}>{t('Flags')}</span>
              <span className={styles.tooltipValue}>{active.security + active.technical}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_DAY: SessionFlagDay = { day: '', security: 0, technical: 0, severities: [0, 0, 0, 0, 0, 0] };
