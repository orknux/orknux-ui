import { useState } from 'react';

import { formatSpeed } from '../../api/models';
import type { ModelSpeedOverTime, ModelSpeedPoint, SpeedUnit } from '../../api/models';
import { t, tf } from '../../i18n';
import usage from './UsageChart.module.css';
import styles from './SpeedChart.module.css';

export interface SpeedChartProps {
  chart: ModelSpeedOverTime;
}

/** The drawing box, as UsageChart's: the SVG scales to its container. */
const WIDTH = 1000;
const HEIGHT = 110;
const GRID_LINES = 2;

type Series = 'prompt' | 'generated';

/**
 * Where a period sits on the axis, counted in periods.
 *
 * The bucket start is the server's wall-clock time, so it is read as UTC here:
 * only differences between two of them matter, and reading them in the
 * browser's own zone would put a daylight-saving hour into a count of hours.
 */
function slot(at: string, unit: SpeedUnit): number {
  const [date, time = '00:00'] = at.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (unit === 'YEAR') return year;
  if (unit === 'MONTH') return year * 12 + (month - 1);
  const millis = Date.UTC(year, month - 1, day, hour, minute);
  const per = unit === 'MINUTE' ? 60_000 : unit === 'HOUR' ? 3_600_000 : 86_400_000;
  return Math.floor(millis / per);
}

/** The period a point is, said as long as its unit needs: "2026-01-10 10:15", "2026-01", "2026". */
export function periodLabel(at: string, unit: SpeedUnit): string {
  const [date, time = ''] = at.split('T');
  if (unit === 'YEAR') return date.slice(0, 4);
  if (unit === 'MONTH') return date.slice(0, 7);
  if (unit === 'DAY') return date;
  return `${date} ${time}`;
}

/**
 * A model's prompt and generation speed per period, as two panels over one
 * axis: the two are an order of magnitude apart - thousands of tokens read a
 * second against tens written - so on one scale the generation line would lie
 * flat along the bottom.
 *
 * Drawn in UsageChart's marks. The axis is time rather than the points'
 * order, so a period with no timed calls is a gap in the line and never a
 * zero: the line joins only periods that follow one another, and a period on
 * its own between two gaps is a dot.
 */
export function SpeedChart({ chart }: SpeedChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { points, unit } = chart;
  if (points.length === 0) return null;

  const slots = points.map((point) => slot(point.at, unit));
  // Cut, the axis starts at the oldest period answered: the window's opening
  // would otherwise be an empty stretch that reads as no calls.
  const first = chart.truncated ? slots[0] : slot(`${chart.from}T00:00`, unit);
  const last = Math.max(slot(`${chart.to}T23:59`, unit), slots[slots.length - 1]);
  const x = (at: number) => (last === first ? WIDTH / 2 : ((at - first) / (last - first)) * WIDTH);
  const xs = slots.map(x);

  // A hover target per point, reaching halfway to its neighbours, so a sparse
  // chart is as easy to land on as a full one.
  const edges = xs.map((at, index) => [
    index === 0 ? 0 : (xs[index - 1] + at) / 2,
    index === xs.length - 1 ? WIDTH : (at + xs[index + 1]) / 2,
  ]);

  const active = hovered === null ? null : points[hovered];

  return (
    <div className={styles.speedChart} onMouseLeave={() => setHovered(null)}>
      <Panel
        series="prompt"
        label={t('Prompt speed')}
        points={points}
        slots={slots}
        xs={xs}
        edges={edges}
        hovered={hovered}
        onHover={setHovered}
        value={(point) => point.promptTokensPerSecond}
      />
      <Panel
        series="generated"
        label={t('Generation speed')}
        points={points}
        slots={slots}
        xs={xs}
        edges={edges}
        hovered={hovered}
        onHover={setHovered}
        value={(point) => point.generatedTokensPerSecond}
      />
      {active !== null && (
        <div className={usage.tooltip} data-speed-tooltip="">
          <span className={usage.tooltipDay}>{periodLabel(active.at, unit)}</span>
          <span className={usage.tooltipValue}>
            {formatSpeed(active.promptTokensPerSecond)} · {formatSpeed(active.generatedTokensPerSecond)}
          </span>
          <span className={usage.tooltipMeta}>
            {active.calls === 1 ? t('1 call') : tf('{count} calls', { count: active.calls.toLocaleString('en-US') })}
          </span>
        </div>
      )}
    </div>
  );
}

interface PanelProps {
  series: Series;
  label: string;
  points: ModelSpeedPoint[];
  slots: number[];
  xs: number[];
  edges: number[][];
  hovered: number | null;
  onHover: (index: number) => void;
  value: (point: ModelSpeedPoint) => number | null;
}

/** One series: its runs of consecutive periods as lines, a period alone as a dot. */
function Panel({ series, label, points, slots, xs, edges, hovered, onHover, value }: PanelProps) {
  const values = points.map(value);
  const peak = Math.max(...values.map((one) => one ?? 0), 0);
  const y = (perSecond: number) => (peak === 0 ? HEIGHT : HEIGHT - (perSecond / peak) * HEIGHT * 0.9);

  // Runs of points one period apart; a point with no figure for this series breaks a run as a gap does.
  const runs: number[][] = [];
  values.forEach((one, index) => {
    if (one === null) return;
    const run = runs[runs.length - 1];
    const previous = run?.[run.length - 1];
    if (run !== undefined && previous === index - 1 && slots[index] - slots[previous] === 1) run.push(index);
    else runs.push([index]);
  });

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span>{label}</span>
        <span className={styles.panelPeak}>{peak > 0 ? formatSpeed(peak) : ''}</span>
      </div>
      <div className={usage.wrapper}>
        <svg
          className={`${usage.chart} ${styles.panelChart}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          data-speed-chart={series}
        >
          {Array.from({ length: GRID_LINES }, (_, index) => {
            const gridY = (HEIGHT / (GRID_LINES + 1)) * (index + 1);
            return (
              <line key={gridY} className={usage.grid} x1={0} y1={gridY} x2={WIDTH} y2={gridY} vectorEffect="non-scaling-stroke" />
            );
          })}

          {runs.map((run) =>
            run.length === 1 ? (
              <circle
                key={run[0]}
                className={usage.point}
                cx={xs[run[0]]}
                cy={y(values[run[0]] ?? 0)}
                r={3}
                data-speed-dot=""
              />
            ) : (
              <path
                key={run[0]}
                className={usage.line}
                d={`M ${run.map((index) => `${xs[index]},${y(values[index] ?? 0)}`).join(' L ')}`}
                vectorEffect="non-scaling-stroke"
                data-speed-run=""
              />
            ),
          )}

          {hovered !== null && (
            <line
              className={usage.crosshair}
              x1={xs[hovered]}
              y1={0}
              x2={xs[hovered]}
              y2={HEIGHT}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {points.map((point, index) => (
            <rect
              key={point.at}
              x={edges[index][0]}
              y={0}
              width={Math.max(edges[index][1] - edges[index][0], 0)}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => onHover(index)}
              data-speed-point={point.at}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
