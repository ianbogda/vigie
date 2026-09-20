import { eur } from '../lib/format';
import type { Forecast } from '../types/dashboard';

type Point = { x: number; y: number };

const W = 900;
const H = 310;
const PAD = { left: 72, right: 28, top: 24, bottom: 42 };

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.max(0, Math.min(1, (date.getTime() - start.getTime()) / (new Date(date.getFullYear() + 1, 0, 1).getTime() - start.getTime())));
}

function path(points: Point[]) {
  return points.map((p, index) => `${index ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export function TrajectoryChart({ forecast }: { forecast?: Forecast }) {
  if (!forecast) return <div className="trajectory-empty">Données insuffisantes pour construire la trajectoire.</div>;

  const snapshot = forecast.snapshotDate ? new Date(forecast.snapshotDate) : new Date();
  const observed = (forecast.points || [])
    .map((p) => ({ date: new Date(p.date), result: p.result }))
    .filter((p) => !Number.isNaN(p.date.getTime()));
  if (!observed.length && forecast.current != null) observed.push({ date: snapshot, result: forecast.current });

  const values = [
    ...observed.map((p) => p.result),
    forecast.low,
    forecast.central,
    forecast.high,
    forecast.budget ?? 0,
    0
  ];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const amplitude = Math.max(1, max - min);
  min -= amplitude * 0.14;
  max += amplitude * 0.14;

  const x = (ratio: number) => PAD.left + ratio * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + ((max - value) / (max - min)) * (H - PAD.top - PAD.bottom);
  const todayRatio = dayOfYear(snapshot);
  const todayX = x(todayRatio);
  const current = forecast.current ?? observed.at(-1)?.result ?? 0;
  const observedPath = observed.map((p) => ({ x: x(dayOfYear(p.date)), y: y(p.result) }));
  const start: Point = { x: todayX, y: y(current) };
  const endX = x(1);
  const centralPath = [start, { x: endX, y: y(forecast.central) }];
  const lowPath = [start, { x: endX, y: y(forecast.low) }];
  const highPath = [start, { x: endX, y: y(forecast.high) }];
  const fan = `${start.x},${start.y} ${endX},${y(forecast.high)} ${endX},${y(forecast.low)}`;
  const budgetPath = [{ x: x(0), y: y(0) }, { x: endX, y: y(forecast.budget ?? 0) }];
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4).reverse();
  const months = ['Jan.', 'Mars', 'Mai', 'Juil.', 'Sept.', 'Nov.', 'Déc.'];

  return (
    <div className="financial-trajectory-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Résultat cumulé réalisé et trajectoires projetées au 31 décembre">
        <g className="trajectory-grid">
          {ticks.map((value) => (
            <g key={value}>
              <line x1={PAD.left} y1={y(value)} x2={W - PAD.right} y2={y(value)} />
              <text x={PAD.left - 10} y={y(value) + 4} textAnchor="end">{eur(value)}</text>
            </g>
          ))}
        </g>
        <line className="trajectory-zero" x1={PAD.left} y1={y(0)} x2={W - PAD.right} y2={y(0)} />
        <path className="trajectory-budget" d={path(budgetPath)} />
        <polygon className="trajectory-fan" points={fan} />
        <path className="trajectory-projection secondary" d={path(lowPath)} />
        <path className="trajectory-projection" d={path(centralPath)} />
        <path className="trajectory-projection secondary" d={path(highPath)} />
        {observedPath.length > 1 && <path className="trajectory-observed" d={path(observedPath)} />}
        {observedPath.length === 1 && <circle className="trajectory-observed-point" cx={observedPath[0].x} cy={observedPath[0].y} r="5" />}
        <line className="trajectory-today" x1={todayX} y1={PAD.top} x2={todayX} y2={H - PAD.bottom} />
        <text className="trajectory-today-label" x={todayX + 7} y={PAD.top + 13}>Aujourd'hui</text>
        <circle className="trajectory-current-point" cx={todayX} cy={y(current)} r="6" />
        <text className="trajectory-end-label central" x={endX - 6} y={y(forecast.central) - 8} textAnchor="end">Central {eur(forecast.central)}</text>
        <text className="trajectory-end-label" x={endX - 6} y={y(forecast.high) - 8} textAnchor="end">Haut {eur(forecast.high)}</text>
        <text className="trajectory-end-label" x={endX - 6} y={y(forecast.low) + 16} textAnchor="end">Bas {eur(forecast.low)}</text>
      </svg>
      <div className="trajectory-axis">{months.map((month) => <span key={month}>{month}</span>)}</div>
      <div className="trajectory-legend">
        <span><i className="observed" />Réalisé cumulé</span>
        <span><i className="projected" />Projection centrale</span>
        <span><i className="range" />Fourchette d'atterrissage</span>
        <span><i className="budget" />Référence budgétaire</span>
      </div>
    </div>
  );
}
