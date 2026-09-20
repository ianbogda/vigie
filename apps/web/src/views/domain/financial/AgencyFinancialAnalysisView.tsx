import {
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronRight,
  FileText,
  ReceiptText,
  Utensils,
  WalletCards,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { IndicatorInfo } from '../../../components/IndicatorInfo';
import { api } from '../../../lib/api';
import type { BudgetResponse, FdrAnalysisResponse, FinancialIndicator, FinancialResponse } from '../../../types/api';
import type { Eple } from '../../../types/dashboard';
import { dateFr, compact, eur, median } from '../domain-utils';

type AgencyFinRow = {
  eple: Eple;
  data: FinancialResponse;
  current: FinancialIndicator | null;
  previous: FinancialIndicator | null;
  history: FinancialIndicator[];
  fdrDays: number | null;
  fdrDeltaDays: number | null;
  fdrThreeYearDown: boolean;
};
type AgencyFinBubbleRow = AgencyFinRow & {
  current: FinancialIndicator & { fdr: number; caf: number };
};

function hasBubbleIndicators(row: AgencyFinRow): row is AgencyFinBubbleRow {
  return row.current?.fdr != null && row.current.caf != null;
}

export function AgencyFinancialAnalysisView({ all, onSelect }: { all: Eple[]; onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<AgencyFinRow[]>([]),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(
      all
        .filter((e) => e.opaleEntity)
        .map(async (e) => {
          try {
            const data = await api.financial(e.opaleEntity!);
            const h = [...(data.indicatorHistory || [])].sort((a, b) => Number(a.exercise) - Number(b.exercise));
            const current = h.at(-1) || null,
              previous = h.at(-2) || null,
              last3 = h.filter((x) => x.fdr != null).slice(-3);
            return {
              eple: e,
              data,
              current,
              previous,
              history: h,
              fdrDays: current?.fdrDays ?? null,
              fdrDeltaDays:
                current?.fdrDays != null && previous?.fdrDays != null ? current.fdrDays - previous.fdrDays : null,
              fdrThreeYearDown:
                last3.length >= 3 && last3.every((x, i) => i === 0 || Number(x.fdr) < Number(last3[i - 1].fdr))
            } as AgencyFinRow;
          } catch {
            return null;
          }
        })
    ).then((x) => {
      if (live) {
        setRows(x.filter(Boolean) as AgencyFinRow[]);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [all]);
  if (loading)
    return (
      <div className="page">
        <div className="loading">Construction de l’analyse financière de l’agence…</div>
      </div>
    );
  const days = rows.map((r) => r.fdrDays).filter((x): x is number => x != null),
    deltas = rows.map((r) => r.fdrDeltaDays).filter((x): x is number => x != null),
    med = median(days),
    medDelta = median(deltas),
    down3 = rows.filter((r) => r.fdrThreeYearDown).length;
  const vigilant = rows.filter(
    (r) => r.eple.states?.financial === 'alert' || r.eple.states?.financial === 'watch'
  ).length;
  const cafCount = rows.filter((r) => r.current?.caf != null && r.current.caf >= 0).length,
    iafCount = rows.filter((r) => r.current?.caf != null && r.current.caf < 0).length,
    cafKnown = cafCount + iafCount;
  const treasuryLow = rows.filter((r) => r.current?.treasuryDays != null && r.current.treasuryDays < 30).length;
  const bubble = rows.filter(hasBubbleIndicators),
    maxAbs = Math.max(1, ...bubble.map((r) => Math.abs(Number(r.current.caf || 0)))),
    minF = Math.min(0, ...bubble.map((r) => Number(r.current.fdr || 0))),
    maxF = Math.max(1, ...bubble.map((r) => Number(r.current.fdr || 0))),
    spanF = Math.max(1, maxF - minF);
  const trendRows = [...rows].sort((a, b) => (a.fdrDays ?? 9999) - (b.fdrDays ?? 9999));
  return (
    <div className="page agency-financial fade-in">
      <div className="financial-head">
        <div>
          <span>ANALYSE FINANCIÈRE · VUE AGENCE</span>
          <h2>Positionnement et trajectoires des EPLE</h2>
          <p>Lecture comparative des situations financières, sans sommer des masses qui ne sont pas comparables.</p>
        </div>
        <div className="agency-scope">
          <Building2 />
          <b>{all.length}</b>
          <small>établissements suivis</small>
        </div>
      </div>
      <section className="agency-fin-kpis">
        <article className={vigilant ? 'attention' : ''}>
          <span>EPLE en vigilance</span>
          <b>
            {vigilant} / {all.length}
          </b>
          <small>état Analyse financière</small>
        </article>
        <article>
          <span>FDR médian</span>
          <b>{med == null ? '—' : `${med.toFixed(0)} jours`}</b>
          <small>
            {days.length
              ? `${Math.min(...days).toFixed(0)} j ← agence → ${Math.max(...days).toFixed(0)} j`
              : 'Données insuffisantes'}
          </small>
        </article>
        <article>
          <span>Évolution médiane du FDR</span>
          <b>{medDelta == null ? '—' : `${medDelta > 0 ? '+' : ''}${medDelta.toFixed(0)} jours`}</b>
          <small>
            N−1 → N · {deltas.length}/{all.length} EPLE comparables
          </small>
        </article>
        <article>
          <span>CAF / IAF</span>
          <b>{cafKnown ? `${cafCount} / ${iafCount}` : '—'}</b>
          <small>{cafKnown ? `${cafCount} EPLE en CAF · ${iafCount} en IAF` : 'EBLC nécessaire'}</small>
        </article>
        <article>
          <span>FDR en baisse sur 3 exercices</span>
          <b>
            {down3} / {all.length}
          </b>
          <small>constat de trajectoire, pas qualification de risque</small>
        </article>
        <article>
          <span>Trésorerie &lt; 30 jours</span>
          <b>
            {treasuryLow} / {all.length}
          </b>
          <small>sur charges de fonctionnement disponibles</small>
        </article>
      </section>
      <div className="agency-fin-grid">
        <section className="financial-card">
          <h3>
            <BarChart3 size={18} /> Positionnement FDR × CAF/IAF
          </h3>
          <p className="agency-fin-note">
            Une bulle par EPLE. Axe vertical : CAF positive / IAF négative, calculées selon la méthode additive M9.6.
          </p>
          <div className="agency-bubbles">
            {bubble.length ? (
              <svg
                viewBox="0 0 900 360"
                role="img"
                aria-label="Positionnement des établissements selon le fonds de roulement et la CAF ou IAF"
              >
                <line x1="55" y1="180" x2="875" y2="180" />
                <line x1="55" y1="25" x2="55" y2="330" />
                {bubble.map((r, i) => {
                  const x = 55 + ((Number(r.current.fdr) - minF) / spanF) * 800,
                    y = 180 - (Number(r.current.caf) / maxAbs) * 140,
                    rad = Math.max(
                      9,
                      Math.min(
                        20,
                        10 +
                          ((r.current.operatingCharges || 0) /
                            Math.max(1, ...bubble.map((z) => z.current.operatingCharges || 0))) *
                            10
                      )
                    );
                  return (
                    <g key={r.eple.id} onClick={() => onSelect(r.eple.id)} className="agency-bubble">
                      <circle cx={x} cy={y} r={rad} />
                      <text x={x} y={y - rad - 5}>
                        {r.eple.name.slice(0, 18)}
                      </text>
                    </g>
                  );
                })}
                <text x="450" y="352">
                  Fonds de roulement →
                </text>
                <text x="62" y="18">
                  CAF +
                </text>
                <text x="62" y="348">
                  IAF −
                </text>
              </svg>
            ) : (
              <div className="agency-fin-empty">Données insuffisantes pour le positionnement.</div>
            )}
          </div>
        </section>
        <section className="financial-card">
          <h3>
            <AlertTriangle size={18} /> Situations à examiner
          </h3>
          <div className="financial-alerts">
            {trendRows
              .filter(
                (r) =>
                  r.eple.states?.financial === 'alert' || r.eple.states?.financial === 'watch' || r.fdrThreeYearDown
              )
              .slice(0, 8)
              .map((r) => (
                <button className="agency-fin-attention" key={r.eple.id} onClick={() => onSelect(r.eple.id)}>
                  <div>
                    <b>{r.eple.name}</b>
                    <small>
                      {r.fdrThreeYearDown
                        ? 'FDR en baisse sur 3 exercices'
                        : r.eple.states?.financial === 'alert'
                          ? 'Alerte financière'
                          : 'Vigilance financière'}
                      {r.fdrDays != null ? ` · ${r.fdrDays.toFixed(0)} j de FDR` : ''}
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
          </div>
        </section>
      </div>
      <section className="financial-card">
        <h3>
          <BarChart3 size={18} /> Trajectoires pluriannuelles
        </h3>
        <div className="agency-fin-table-scroll">
          <table className="agency-fin-table">
            <thead>
              <tr>
                <th>Établissement</th>
                <th>FDR</th>
                <th>Jours FDR</th>
                <th>BFR</th>
                <th>Trésorerie</th>
                <th>Résultat</th>
                <th>CAF / IAF</th>
                <th>Évolution FDR</th>
                <th>Trajectoire</th>
              </tr>
            </thead>
            <tbody>
              {trendRows.map((r) => {
                const delta =
                  r.current?.fdr != null && r.previous?.fdr != null
                    ? Number(r.current.fdr) - Number(r.previous.fdr)
                    : null;
                return (
                  <tr key={r.eple.id} onClick={() => onSelect(r.eple.id)}>
                    <td>
                      <b>{r.eple.name}</b>
                      <small>{r.eple.uai || ''}</small>
                    </td>
                    <td>{eur(r.current?.fdr)}</td>
                    <td>{r.fdrDays == null ? '—' : `${r.fdrDays.toFixed(0)} j`}</td>
                    <td>{eur(r.current?.bfr)}</td>
                    <td>{eur(r.current?.treasury)}</td>
                    <td>{eur(r.current?.result)}</td>
                    <td className={r.current?.caf != null && r.current.caf < 0 ? 'negative' : 'positive'}>
                      {eur(r.current?.caf)}
                    </td>
                    <td className={delta != null && delta < 0 ? 'negative' : 'positive'}>
                      {delta == null ? '—' : `${delta > 0 ? '+' : ''}${eur(delta)}`}
                    </td>
                    <td>
                      {r.fdrThreeYearDown
                        ? '↘ 3 exercices'
                        : r.fdrDeltaDays == null
                          ? '—'
                          : r.fdrDeltaDays < 0
                            ? '↘'
                            : '↗'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="financial-card">
        <h3>Distribution des jours de FDR</h3>
        <div className="agency-distribution">
          {trendRows
            .filter((r) => r.fdrDays != null)
            .map((r) => (
              <button key={r.eple.id} onClick={() => onSelect(r.eple.id)}>
                <b>{r.fdrDays!.toFixed(0)} j</b>
                <span>{r.eple.name}</span>
              </button>
            ))}
        </div>
      </section>
      <div className="financial-source-note">
        <span>Jours de FDR = (FDR / charges nettes des comptes 60 à 65) × 360, conformément à la M9.6.</span>
        <span>CAF/IAF = résultat + C68 − C78 − C776 + C675 − C775 − C777.</span>
      </div>
    </div>
  );
}
