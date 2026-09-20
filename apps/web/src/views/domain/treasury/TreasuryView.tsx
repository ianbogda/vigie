import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Database,
  Landmark,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { IndicatorInfo } from '../../../components/IndicatorInfo';
import { api } from '../../../lib/api';
import type { Eple, TreasuryPoint, TreasurySeries } from '../../../types/dashboard';
import { dateFr, deltaRate, eur, median, month, pct, shortMonth } from '../domain-utils';

type ChartMode = 'EUR' | 'INDEX';
function TreasuryChart({
  current,
  shadows,
  mode
}: {
  current: TreasurySeries;
  shadows: TreasurySeries[];
  mode: ChartMode;
}) {
  const all = [current, ...shadows],
    w = 1000,
    h = 310,
    padX = 62,
    padTop = 28,
    padBottom = 50;
  const val = (s: TreasurySeries, p: TreasuryPoint) =>
    mode === 'EUR' ? p.balance : s.openingBalance ? (p.balance / s.openingBalance) * 100 : 100;
  const values = all.flatMap((s) => s.history.map((p) => val(s, p))).filter(Number.isFinite);
  if (!values.length)
    return <div className="treasury-chart-empty">Historique insuffisant pour tracer la trajectoire.</div>;
  const rawMin = Math.min(...values),
    rawMax = Math.max(...values),
    range = Math.max(rawMax - rawMin, 1),
    margin = range * 0.14,
    min = mode === 'EUR' ? Math.max(0, rawMin - margin) : rawMin - margin,
    max = rawMax + margin,
    span = Math.max(max - min, 1);
  const x = (m: number) => padX + (m - 1) * ((w - padX * 2) / 11),
    y = (v: number) => padTop + ((max - v) / span) * (h - padTop - padBottom),
    points = (s: TreasurySeries) => s.history.map((p) => `${x(p.month || 1)},${y(val(s, p))}`).join(' ');
  return (
    <div className="treasury-chart-wrap">
      <svg
        className="treasury-chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Comparaison des trajectoires annuelles du compte 5151"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = padTop + t * (h - padTop - padBottom),
            v = max - t * span;
          return (
            <g key={t}>
              <line x1={padX} y1={yy} x2={w - padX} y2={yy} className="treasury-grid" />
              <text x={padX - 10} y={yy + 4} className="treasury-axis-y">
                {mode === 'EUR'
                  ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
                  : `${v.toFixed(0)}`}
              </text>
            </g>
          );
        })}
        {shadows.map((s, i) => (
          <polyline key={s.exercise} points={points(s)} className={`treasury-line shadow shadow-${i}`} />
        ))}
        <polyline points={points(current)} className="treasury-line" />
        {current.history.map((p) => (
          <circle key={p.period} cx={x(p.month || 1)} cy={y(val(current, p))} r="4" className="treasury-point" />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <text key={i} x={x(i + 1)} y={h - 18} className="treasury-axis-x">
            {shortMonth(i + 1)}
          </text>
        ))}
      </svg>
      <div className="treasury-legend">
        <span>
          <i className="current" /> {current.exercise}
        </span>
        {shadows.map((s, i) => (
          <span key={s.exercise}>
            <i className={`shadow-${i}`} /> {s.exercise}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TreasuryView({ current }: { current: Eple }) {
  const [mode, setMode] = useState<ChartMode>('EUR');
  const [shadowYears, setShadowYears] = useState<number[]>([]);
  const [exercise, setExercise] = useState<number>(new Date().getFullYear());
  const t = current.treasury,
    series = useMemo(() => [...(t?.series || [])].sort((a, b) => b.exercise - a.exercise), [t?.series]);
  const selectedTreasuryExercise = series.some((s) => s.exercise === exercise)
    ? exercise
    : (series[0]?.exercise ?? new Date().getFullYear());
  const currentSeries = series.find((s) => s.exercise === selectedTreasuryExercise) || series[0];
  if (!t || !currentSeries)
    return (
      <div className="page treasury-page">
        <div className="treasury-head">
          <span>TRÉSORERIE</span>
          <h2>
            <Landmark size={24} />
            Suivi du compte 5151
          </h2>
        </div>
        <div className="empty-domain">
          <Database size={34} />
          <h3>Aucune donnée 5151</h3>
          <p>Utilise « Importer » puis sélectionne l'export CSV Op@le du compte 5151.</p>
        </div>
      </div>
    );
  const h = currentSeries.history,
    last = h.at(-1),
    previous = h.at(-2),
    variation = last?.movement ?? null,
    minPoint = h.length ? h.reduce((a, b) => (a.balance <= b.balance ? a : b)) : null,
    maxPoint = h.length ? h.reduce((a, b) => (a.balance >= b.balance ? a : b)) : null,
    treasurySignals = current.signals.filter((s) => s.domain === 'Trésorerie');
  const available = series.slice(1, 4),
    shadows = available.filter((s) => shadowYears.includes(s.exercise));
  const sameMonth = shadows.map((s) => ({ s, p: s.history.find((p) => p.month === last?.month) })).filter((x) => x.p);
  const toggle = (y: number) => setShadowYears((v) => (v.includes(y) ? v.filter((x) => x !== y) : [...v, y]));
  return (
    <div className="page treasury-page">
      <div className="treasury-head financial-head">
        <div>
          <span>TRÉSORERIE</span>
          <h2>
            <Landmark size={24} />
            Suivi du compte 5151
          </h2>
          <p>{t.warning}</p>
        </div>
        <label className="flow-exercise">
          Exercice
          <select value={selectedTreasuryExercise} onChange={(e) => setExercise(Number(e.target.value))}>
            {series.map((s) => (
              <option key={s.exercise} value={s.exercise}>
                {s.exercise}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="treasury-kpis">
        <div className="treasury-kpi">
          <WalletCards />
          <div>
            <span>Solde 5151 estimé</span>
            <b>{eur(currentSeries.currentBalance)}</b>
            <small>{last ? `au ${month(last.period)}` : ''}</small>
          </div>
        </div>
        <div className={`treasury-kpi ${variation != null && variation < 0 ? 'down' : 'up'}`}>
          {variation != null && variation < 0 ? <TrendingDown /> : <TrendingUp />}
          <div>
            <span>Variation du mois</span>
            <b>
              {variation != null && variation > 0 ? '+' : ''}
              {eur(variation)}
            </b>
            <small>débits − crédits, hors ZOUVER</small>
          </div>
        </div>
        <div className="treasury-kpi low">
          <TrendingDown />
          <div>
            <span>Plus bas observé</span>
            <b>{eur(minPoint?.balance)}</b>
            <small>{minPoint ? month(minPoint.period) : ''}</small>
          </div>
        </div>
        <div className="treasury-kpi high">
          <TrendingUp />
          <div>
            <span>Plus haut observé</span>
            <b>{eur(maxPoint?.balance)}</b>
            <small>{maxPoint ? month(maxPoint.period) : ''}</small>
          </div>
        </div>
      </div>
      <section className="treasury-panel">
        <div className="treasury-chart-head">
          <div>
            <h3>Évolution du 5151</h3>
            <small>
              Exercice {currentSeries.exercise} · ZOUVER {eur(currentSeries.openingBalance)}
            </small>
          </div>
          <div className="treasury-controls">
            <div className="treasury-shadows">
              <span>Shadow :</span>
              {available.map((s) => (
                <button
                  key={s.exercise}
                  className={shadowYears.includes(s.exercise) ? 'active' : ''}
                  onClick={() => toggle(s.exercise)}
                >
                  {s.exercise}
                </button>
              ))}
            </div>
            <div className="treasury-mode">
              <button className={mode === 'EUR' ? 'active' : ''} onClick={() => setMode('EUR')}>
                €
              </button>
              <button className={mode === 'INDEX' ? 'active' : ''} onClick={() => setMode('INDEX')}>
                Base 100
              </button>
            </div>
          </div>
        </div>
        <TreasuryChart current={currentSeries} shadows={shadows} mode={mode} />
        {sameMonth.length > 0 && (
          <div className="treasury-comparison">
            {sameMonth.map(({ s, p }) => {
              const d = currentSeries.currentBalance - (p?.balance || 0),
                r = p?.balance ? (d / p.balance) * 100 : 0;
              return (
                <span key={s.exercise}>
                  Même mois {s.exercise} : <b>{eur(p?.balance)}</b> · écart{' '}
                  <b className={d < 0 ? 'negative' : 'positive'}>
                    {d > 0 ? '+' : ''}
                    {eur(d)} ({pct(r)})
                  </b>
                </span>
              );
            })}
          </div>
        )}
      </section>
      <div className="treasury-bottom">
        <section>
          <h3>Analyse rapide</h3>
          <p>
            Solde d'ouverture ZOUVER : <b>{eur(currentSeries.openingBalance)}</b>.
          </p>
          <p>
            Variation du dernier mois :{' '}
            <b>
              {variation != null && variation > 0 ? '+' : ''}
              {eur(variation)}
            </b>
            .
          </p>
          <p>Amplitude observée : {eur((maxPoint?.balance ?? 0) - (minPoint?.balance ?? 0))}.</p>
        </section>
        <section>
          <h3>Signaux Vigie</h3>
          {treasurySignals.length ? (
            treasurySignals.map((s) => (
              <p key={s.code} className={`treasury-signal ${s.level}`}>
                <b>{s.title}</b>
                <br />
                <span>{s.detail}</span>
              </p>
            ))
          ) : (
            <p className="treasury-ok">Aucun signal Trésorerie en cours.</p>
          )}
        </section>
        <section>
          <h3>Données sources</h3>
          <dl>
            <dt>Compte</dt>
            <dd>{t.account || '5151'}</dd>
            <dt>Exercices disponibles</dt>
            <dd>{series.map((s) => s.exercise).join(', ')}</dd>
            <dt>Dernière période</dt>
            <dd>{last ? month(last.period) : '—'}</dd>
            <dt>Format</dt>
            <dd>{t.sourceFormat || 'Export Op@le 5151'}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
