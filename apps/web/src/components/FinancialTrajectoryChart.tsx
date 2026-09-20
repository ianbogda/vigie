import type { FinancialTrajectory } from '../types/dashboard';
import { eur } from '../lib/format';

const monthLabels = ['Jan.', 'Fév.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

/** Displays observed cumulative result and its 31 December landing range. */
export function FinancialTrajectoryChart({ trajectory }: { trajectory?: FinancialTrajectory }) {
  if (!trajectory?.actual?.length) {
    return <div className="financial-trajectory-empty">Données historisées insuffisantes pour tracer la trajectoire financière.</div>;
  }

  const width = 820;
  const height = 300;
  const left = 68;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const previous = Object.entries(trajectory.previous || {}).flatMap(([year, points]) =>
    points.map((point) => ({ ...point, year }))
  );
  const lastActual = trajectory.actual[trajectory.actual.length - 1];
  const values = [
    ...trajectory.actual.map((point) => point.value),
    ...previous.map((point) => point.value),
    ...trajectory.budgetReference.map((point) => point.value),
    trajectory.forecast.low,
    trajectory.forecast.central,
    trajectory.forecast.high,
    0
  ];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(1, rawMax - rawMin);
  const min = rawMin - span * 0.12;
  const max = rawMax + span * 0.12;
  const x = (month: number) => left + ((month - 1) / 11) * plotWidth;
  const y = (value: number) => top + ((max - value) / (max - min)) * plotHeight;
  const points = (items: Array<{ month: number; value: number }>) => items.map((point) => `${x(point.month)},${y(point.value)}`).join(' ');
  const gridValues = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
  const projectionStartX = x(lastActual.month);
  const projectionStartY = y(lastActual.value);
  const decemberX = x(12);
  const previousSeries = Object.entries(trajectory.previous || {}).filter(([, items]) => items.length > 0);

  return (
    <div className="financial-trajectory-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trajectoire financière de l'établissement">
        <g className="financial-grid">
          {gridValues.map((value) => (
            <g key={value}>
              <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">{eur(value)}</text>
            </g>
          ))}
        </g>
        {min < 0 && max > 0 && <line className="financial-zero" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />}
        <polyline className="financial-budget" points={points(trajectory.budgetReference)} />
        {previousSeries.map(([year, items]) => (
          <polyline key={year} className="financial-previous" points={points(items)} />
        ))}
        <polygon
          className="financial-fan"
          points={`${projectionStartX},${projectionStartY} ${decemberX},${y(trajectory.forecast.high)} ${decemberX},${y(trajectory.forecast.low)}`}
        />
        <line className="financial-projection-bound" x1={projectionStartX} y1={projectionStartY} x2={decemberX} y2={y(trajectory.forecast.high)} />
        <line className="financial-projection-bound" x1={projectionStartX} y1={projectionStartY} x2={decemberX} y2={y(trajectory.forecast.low)} />
        <line className="financial-projection" x1={projectionStartX} y1={projectionStartY} x2={decemberX} y2={y(trajectory.forecast.central)} />
        <polyline className="financial-actual" points={points(trajectory.actual)} />
        {trajectory.actual.map((point) => <circle key={point.date} className="financial-actual-point" cx={x(point.month)} cy={y(point.value)} r="4" />)}
        <line className="financial-today" x1={projectionStartX} x2={projectionStartX} y1={top} y2={height - bottom} />
        <text className="financial-today-label" x={projectionStartX + 6} y={top + 13}>Situation au {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${trajectory.snapshotDate}T12:00:00`))}</text>
        {monthLabels.map((label, index) => <text key={label} className="financial-month" x={x(index + 1)} y={height - 14} textAnchor="middle">{label}</text>)}
      </svg>
      <div className="financial-trajectory-legend">
        <span><i className="legend-actual" />Réalisé cumulé {trajectory.exercise}</span>
        <span><i className="legend-projection" />Projection centrale</span>
        <span><i className="legend-fan" />Fourchette d'atterrissage</span>
        <span><i className="legend-budget" />Référence budgétaire</span>
        {previousSeries.length > 0 && <span><i className="legend-previous" />Historique N-1 / N-2</span>}
      </div>
    </div>
  );
}
