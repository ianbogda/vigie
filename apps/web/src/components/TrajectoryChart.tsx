import { pct } from '../lib/format';
export function TrajectoryChart({ rate, target }: { rate?: number; target?: number }) {
  const actual = rate == null ? null : Math.max(0, Math.min(1, rate));
  return (
    <div className="chart">
      <svg viewBox="0 0 640 220" role="img" aria-label="Trajectoire budgétaire">
        <g className="gridlines">
          {[20, 60, 100, 140, 180].map((y) => (
            <line key={y} x1="45" y1={y} x2="620" y2={y} />
          ))}
        </g>
        <polyline className="target" points="45,185 150,170 250,135 350,88 450,60 520,42 620,28" />
        <polyline
          className="actual"
          points={actual == null ? '45,185' : `45,185 150,172 250,140 350,100 450,${185 - actual * 150}`}
        />
        {actual != null && (
          <>
            <circle className="point" cx="450" cy={185 - actual * 150} r="6" />
            <text x="462" y={180 - actual * 150}>
              {pct(actual)}
            </text>
          </>
        )}
        <text x="520" y="34">
          cible ≈ {pct(target)}
        </text>
      </svg>
      <div className="axis">
        <span>Jan.</span>
        <span>Mars</span>
        <span>Mai</span>
        <span>Juil.</span>
        <span>Sept.</span>
        <span>Nov.</span>
        <span>Déc.</span>
      </div>
      <div className="chartlegend">
        <i className="dash" /> Trajectoire cible EPLE <i /> Taux d'engagement réel
      </div>
    </div>
  );
}
