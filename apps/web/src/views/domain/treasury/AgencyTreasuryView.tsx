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

type AgencyTreasuryRow = {
  eple: Eple;
  balance: number;
  days: number | null;
  delta30: number | null;
  delta90: number | null;
  lastMovement: number | null;
  freshnessDays: number | null;
  signals: number;
  alert: boolean;
  history: TreasuryPoint[];
  fdr: number | null;
  bfr: number | null;
  fdrDays: number | null;
  bfrDays: number | null;
  tnr: number | null;
  tnrExercise: number | null;
  supplierDue: number;
  oldReceivables: number;
  afterDue: number;
  afterDueDays: number | null;
};
export function AgencyTreasuryView({ all, onSelect }: { all: Eple[]; onSelect: (id: string) => void }) {
  const [context, setContext] = useState<
      Record<
        string,
        {
          charges: number | null;
          fdr: number | null;
          bfr: number | null;
          tnr: number | null;
          tnrExercise: number | null;
          supplierDue: number;
          oldReceivables: number;
        }
      >
    >({}),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(
      all
        .filter((e) => e.opaleEntity)
        .map(async (e) => {
          try {
            const [f, clients, suppliers] = await Promise.all([
              api.financial(e.opaleEntity!),
              api.aged(e.opaleEntity!, 'clients').catch(() => null),
              api.aged(e.opaleEntity!, 'suppliers').catch(() => null)
            ]);
            const h = [...(f.indicatorHistory || [])].sort((a, b) => Number(a.exercise) - Number(b.exercise)),
              last = h.at(-1) || null,
              c = last?.operatingCharges ?? f?.balance?.operatingCharges ?? null;
            return [
              e.id,
              {
                charges: c == null ? null : Number(c),
                fdr: last?.fdr == null ? null : Number(last.fdr),
                bfr: last?.bfr == null ? null : Number(last.bfr),
                tnr: f?.balance?.tnr == null ? null : Number(f.balance.tnr),
                tnrExercise: f?.balance?.exercise == null ? null : Number(f.balance.exercise),
                supplierDue: Math.abs(Number(suppliers?.summary?.due || 0)),
                oldReceivables: Math.abs(Number(clients?.summary?.old || 0))
              }
            ] as const;
          } catch {
            return [
              e.id,
              { charges: null, fdr: null, bfr: null, tnr: null, tnrExercise: null, supplierDue: 0, oldReceivables: 0 }
            ] as const;
          }
        })
    ).then((x) => {
      if (live) {
        setContext(Object.fromEntries(x));
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [all]);
  const rows = useMemo<AgencyTreasuryRow[]>(
    () =>
      all
        .filter((e) => e.treasury?.series?.length)
        .map((e) => {
          const series = [...(e.treasury?.series || [])].sort((a, b) => b.exercise - a.exercise)[0],
            h = [...(series?.history || [])].sort((a, b) => (a.month || 0) - (b.month || 0)),
            last = h.at(-1),
            prev = h.at(-2),
            prev3 = h.at(-4),
            balance = Number(series?.currentBalance || 0),
            ctx = context[e.id],
            c = ctx?.charges ?? null,
            days = c && c > 0 ? (balance / c) * 360 : null,
            fresh = e.freshness
              ? Math.max(0, Math.floor((Date.now() - new Date(e.freshness).getTime()) / 86400000))
              : null,
            ts = e.signals.filter((s) => s.domain === 'Trésorerie'),
            d30 = deltaRate(balance, prev?.balance ?? null),
            d90 = deltaRate(balance, prev3?.balance ?? null),
            supplierDue = ctx?.supplierDue || 0,
            oldReceivables = ctx?.oldReceivables || 0,
            afterDue = balance - supplierDue,
            afterDueDays = c && c > 0 ? (afterDue / c) * 360 : null,
            fdr = ctx?.fdr ?? null,
            bfr = ctx?.bfr ?? null,
            tnr = ctx?.tnr ?? null,
            tnrExercise = ctx?.tnrExercise ?? null;
          return {
            eple: e,
            balance,
            days,
            delta30: d30,
            delta90: d90,
            lastMovement: last?.movement ?? null,
            freshnessDays: Number.isFinite(fresh) ? fresh : null,
            signals: ts.length,
            alert: ts.some((s) => s.level === 'alert'),
            history: h,
            fdr,
            bfr,
            tnr,
            tnrExercise,
            fdrDays: c && c > 0 && fdr != null ? (fdr / c) * 360 : null,
            bfrDays: c && c > 0 && bfr != null ? (bfr / c) * 360 : null,
            supplierDue,
            oldReceivables,
            afterDue,
            afterDueDays
          };
        }),
    [all, context]
  );
  if (loading)
    return (
      <div className="page">
        <div className="loading">Construction de la vue Trésorerie de l’agence…</div>
      </div>
    );
  const dayValues = rows.map((r) => r.days).filter((x): x is number => x != null),
    afterDueValues = rows.map((r) => r.afterDueDays).filter((x): x is number => x != null),
    medDays = median(dayValues),
    medAfterDue = median(afterDueValues),
    tension = rows.filter((r) => r.days != null && r.days < 30).length,
    collectionPressure = rows.filter((r) => r.oldReceivables > 0).length,
    paymentPressure = rows.filter((r) => r.supplierDue > 0).length;
  const ranked = [...rows].sort(
    (a, b) =>
      Number(b.alert) - Number(a.alert) ||
      (a.afterDueDays ?? a.days ?? 9999) - (b.afterDueDays ?? b.days ?? 9999) ||
      (a.delta30 ?? 0) - (b.delta30 ?? 0)
  );
  const bubble = rows.filter((r) => r.days != null && r.delta30 != null),
    maxAbs = Math.max(10, ...bubble.map((r) => Math.abs(r.delta30 || 0))),
    maxBalance = Math.max(1, ...bubble.map((r) => Math.abs(r.balance)));
  const plotLeft = 75,
    plotWidth = 780,
    riskWidth = plotWidth * 0.6,
    focusWidth = plotWidth * 0.75,
    comfortLimit = 65,
    tailWidth = plotWidth - focusWidth,
    tailReference = 65,
    tailMax = Math.max(365, ...bubble.map((r) => r.days || 0));
  const xForDays = (days: number) => {
    const d = Math.max(0, days);
    if (d <= 42) return plotLeft + (d / 42) * riskWidth;
    if (d <= comfortLimit) return plotLeft + riskWidth + ((d - 42) / (comfortLimit - 42)) * (focusWidth - riskWidth);
    const ratio = Math.log1p(d - tailReference) / Math.log1p(tailMax - tailReference);
    return plotLeft + focusWidth + ratio * tailWidth;
  };
  const xTicks = [0, 10, 20, 30, 36, 42, 50, 65, 90, 120, 180, 365].filter((t) => t <= tailMax),
    yTicks = [-1, -0.5, 0, 0.5, 1];
  const attention = ranked.filter(
    (r) =>
      r.alert ||
      r.signals ||
      (r.days != null && r.days < 30) ||
      (r.delta30 != null && r.delta30 <= -10) ||
      r.supplierDue > 0 ||
      r.oldReceivables > 0 ||
      (r.freshnessDays != null && r.freshnessDays > 30)
  );
  return (
    <div className="page agency-treasury fade-in">
      <div className="financial-head">
        <div>
          <span>TRÉSORERIE · VUE AGENCE</span>
          <h2>
            <Landmark size={24} /> Vigie des flux du groupement
          </h2>
          <p>
            Lire ensemble liquidité, FdR/BFdR, décaissements exigibles et pression du recouvrement pour éviter une
            lecture isolée du seul solde 5151.
          </p>
        </div>
        <div className="agency-scope">
          <Building2 />
          <b>{all.length}</b>
          <small>établissements suivis</small>
        </div>
      </div>
      <section className="agency-treasury-kpis">
        <article className={tension ? 'attention' : ''}>
          <span>EPLE en vigilance</span>
          <b>
            {tension} / {all.length}
          </b>
          <small>autonomie observée &lt; 30 jours</small>
        </article>
        <article>
          <span>
            Autonomie médiane <IndicatorInfo id="AUTONOMIE_TRESORERIE" />
          </span>
          <b>{medDays == null ? '—' : `${medDays.toFixed(0)} jours`}</b>
          <small>sur le 5151 observé</small>
        </article>
        <article className={medAfterDue != null && medDays != null && medAfterDue < medDays ? 'attention' : ''}>
          <span>
            Après dettes exigibles <IndicatorInfo id="TRESO_APRES_DETTES_EXIGIBLES" />
          </span>
          <b>{medAfterDue == null ? '—' : `${medAfterDue.toFixed(0)} jours`}</b>
          <small>médiane après décaissement YBALAF exigible</small>
        </article>
        <article className={collectionPressure ? 'attention' : ''}>
          <span>Pression recouvrement</span>
          <b>{collectionPressure}</b>
          <small>EPLE avec créances &gt; 121 j dans YBALAC</small>
        </article>
        <article className={paymentPressure ? 'attention' : ''}>
          <span>Paiements exigibles</span>
          <b>{paymentPressure}</b>
          <small>EPLE avec dettes échues dans YBALAF</small>
        </article>
      </section>
      <div className="agency-treasury-grid">
        <section className="treasury-panel">
          <div className="agency-budget-title">
            <div>
              <h3>Positionnement des EPLE</h3>
              <p>
                Autonomie du 5151 × évolution sur 30 jours. FdR/BFdR et balances âgées expliquent les facteurs
                susceptibles d’accélérer ou de masquer la tension.
              </p>
            </div>
          </div>
          <div className="agency-treasury-bubbles">
            {bubble.length ? (
              <svg
                viewBox="0 0 900 390"
                role="img"
                aria-label="Positionnement des EPLE selon leur autonomie et la variation de trésorerie"
              >
                <rect
                  x={xForDays(0)}
                  y="28"
                  width={xForDays(30) - xForDays(0)}
                  height="300"
                  className="treasury-sustainability alert"
                />
                <rect
                  x={xForDays(30)}
                  y="28"
                  width={xForDays(42) - xForDays(30)}
                  height="300"
                  className="treasury-sustainability caution"
                />
                <rect
                  x={xForDays(42)}
                  y="28"
                  width={xForDays(65) - xForDays(42)}
                  height="300"
                  className="treasury-sustainability comfortable"
                />
                <rect
                  x={xForDays(65)}
                  y="28"
                  width={855 - xForDays(65)}
                  height="300"
                  className="treasury-sustainability high"
                />
                <g className="treasury-scatter-grid">
                  {xTicks.map((t) => (
                    <g key={`tx${t}`}>
                      <line x1={xForDays(t)} y1="28" x2={xForDays(t)} y2="328" />
                      <text x={xForDays(t)} y="348" textAnchor="middle">
                        {t} j
                      </text>
                    </g>
                  ))}
                  {yTicks.map((t) => (
                    <g key={`ty${t}`}>
                      <line x1="75" y1={178 - t * 140} x2="855" y2={178 - t * 140} />
                      <text x="67" y={182 - t * 140} textAnchor="end">
                        {t === 0 ? '0 %' : `${t > 0 ? '+' : ''}${(maxAbs * t).toFixed(0)} %`}
                      </text>
                    </g>
                  ))}
                </g>
                <line x1="75" y1="178" x2="855" y2="178" className="treasury-zero" />
                <line
                  x1={xForDays(30)}
                  y1="28"
                  x2={xForDays(30)}
                  y2="328"
                  className="treasury-sustainability-line alert"
                />
                <line
                  x1={xForDays(42)}
                  y1="28"
                  x2={xForDays(42)}
                  y2="328"
                  className="treasury-sustainability-line caution"
                />
                <line
                  x1={xForDays(65)}
                  y1="28"
                  x2={xForDays(65)}
                  y2="328"
                  className="treasury-sustainability-line break"
                />
                <text x={(xForDays(0) + xForDays(30)) / 2} y="45" className="treasury-zone-label alert">
                  ALERTE
                </text>
                <text x={(xForDays(30) + xForDays(42)) / 2} y="45" className="treasury-zone-label caution">
                  PRUDENCE
                </text>
                <text x={(xForDays(42) + xForDays(65)) / 2} y="45" className="treasury-zone-label comfortable">
                  CONFORTABLE
                </text>
                <text x={(xForDays(65) + 855) / 2} y="45" className="treasury-zone-label high">
                  AUTONOMIE ÉLEVÉE
                </text>
                <text x={xForDays(65) + 7} y="319" className="treasury-scale-break">
                  // échelle comprimée
                </text>
                {bubble.map((r) => {
                  const x = xForDays(r.days!),
                    y = 178 - (r.delta30! / maxAbs) * 140,
                    rad = Math.max(9, Math.min(19, 10 + (Math.abs(r.balance) / maxBalance) * 9)),
                    zone = r.days! < 30 ? 'alert' : r.days! < 42 ? 'caution' : r.days! <= 65 ? 'comfortable' : 'high',
                    factor =
                      r.supplierDue > 0 && r.oldReceivables > 0
                        ? 'both'
                        : r.supplierDue > 0
                          ? 'supplier'
                          : r.oldReceivables > 0
                            ? 'client'
                            : 'none';
                  return (
                    <g
                      key={r.eple.id}
                      className={`agency-bubble treasury-bubble ${zone} factor-${factor}`}
                      onClick={() => onSelect(r.eple.id)}
                    >
                      {factor !== 'none' && <circle className="treasury-risk-ring" cx={x} cy={y} r={rad + 4} />}
                      <circle cx={x} cy={y} r={rad} />
                      <text
                        className="bubble-hover-label"
                        x={Math.min(835, x + rad + 6)}
                        y={Math.max(24, y - rad - 4)}
                        textAnchor={x > 760 ? 'end' : 'start'}
                      >
                        {r.eple.name.slice(0, 24)}
                      </text>
                      <title>{`${r.eple.name} · 5151 ${eur(r.balance)} (${r.days!.toFixed(0)} j) · après dettes exigibles ${eur(r.afterDue)}${r.afterDueDays == null ? '' : ` (${r.afterDueDays.toFixed(0)} j)`} · FdR ${r.fdr == null ? '—' : eur(r.fdr)}${r.fdrDays == null ? '' : ` (${r.fdrDays.toFixed(0)} j)`} · BFdR ${r.bfr == null ? '—' : eur(r.bfr)}${r.bfrDays == null ? '' : ` (${r.bfrDays.toFixed(0)} j)`} · TnR ${r.tnr == null ? '—' : `${r.tnr.toFixed(1)} %`} · créances >121 j ${eur(r.oldReceivables)} · dettes exigibles ${eur(r.supplierDue)} · variation ${pct(r.delta30!)}`}</title>
                    </g>
                  );
                })}
                <text x="465" y="378" textAnchor="middle" className="treasury-axis-label">
                  Autonomie de trésorerie observée (jours de charges) →
                </text>
                <text x="17" y="178" transform="rotate(-90 17 178)" textAnchor="middle" className="treasury-axis-label">
                  Variation du 5151 (%)
                </text>
              </svg>
            ) : (
              <div className="agency-fin-empty">
                Données insuffisantes : le 5151 et les charges de fonctionnement sont nécessaires.
              </div>
            )}
          </div>
          <div className="treasury-sustainability-legend">
            <span>
              <i className="alert" />
              <b>&lt; 30 j</b> Alerte
            </span>
            <span>
              <i className="caution" />
              <b>30–42 j</b> Prudence
            </span>
            <span>
              <i className="comfortable" />
              <b>42–65 j</b> Confortable
            </span>
            <span>
              <i className="high" />
              <b>&gt; 65 j</b> Autonomie élevée · situation à apprécier
            </span>
          </div>
          <div className="treasury-factor-legend">
            <b>Facteurs de pression</b>
            <span>
              <i className="client" /> Créances &gt; 121 j
            </span>
            <span>
              <i className="supplier" /> Dettes exigibles
            </span>
            <span>
              <i className="both" /> Cumul des deux
            </span>
            <em>Le cercle extérieur signale un facteur à examiner ; il ne constitue pas une anomalie à lui seul.</em>
          </div>
          <div className="agency-scatter-legend">
            <div>
              <b>Lecture</b>
              <span>Au-dessus de 0 : trésorerie en hausse · en dessous : en baisse</span>
              <span>
                60 % de l’axe est consacré aux 0–42 jours, 15 % aux 42–65 jours ; au-delà, l’échelle est
                logarithmiquement comprimée.
              </span>
            </div>
            <div>
              <b>Taille de la bulle</b>
              <span>Solde du compte 5151 · clic = ouvrir l’EPLE</span>
            </div>
          </div>
        </section>
        <section className="treasury-panel">
          <div className="agency-budget-title">
            <div>
              <h3>
                <AlertTriangle size={18} /> À contrôler
              </h3>
              <p>
                Les constats croisent liquidité, dynamique, FdR/BFdR et balances âgées sans produire de score opaque.
              </p>
            </div>
          </div>
          <div className="agency-attention-list">
            {attention.length ? (
              attention.slice(0, 8).map((r) => (
                <button key={r.eple.id} onClick={() => onSelect(r.eple.id)}>
                  <AlertTriangle size={17} />
                  <span>
                    <strong>{r.eple.name}</strong>
                    <small>
                      {r.days != null && r.days < 30
                        ? `Autonomie ${r.days.toFixed(0)} j`
                        : r.delta30 != null && r.delta30 <= -10
                          ? `Trésorerie ${pct(r.delta30)} sur la dernière période`
                          : r.supplierDue > 0
                            ? `${eur(r.supplierDue)} de dettes exigibles à décaisser`
                            : r.oldReceivables > 0
                              ? `${eur(r.oldReceivables)} de créances > 121 j à recouvrer`
                              : r.alert
                                ? 'Alerte Trésorerie'
                                : `${r.signals} signal${r.signals > 1 ? 'aux' : ''} à examiner`}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <div className="agency-fin-empty">Aucun point d’attention selon les règles disponibles.</div>
            )}
          </div>
        </section>
      </div>
      <section className="treasury-panel">
        <div className="agency-budget-title">
          <div>
            <h3>Tableau de surveillance</h3>
            <p>Le 5151 est mis en regard du FdR/BFdR et des montants exigibles ou anciens issus des balances âgées.</p>
          </div>
        </div>
        <div className="agency-treasury-table">
          <table>
            <thead>
              <tr>
                <th>Établissement</th>
                <th>5151</th>
                <th>Autonomie</th>
                <th>Après dettes exigibles</th>
                <th>
                  FdR <IndicatorInfo id="FDR" />
                </th>
                <th>
                  BFdR <IndicatorInfo id="BFDR" />
                </th>
                <th>
                  TnR <IndicatorInfo id="TNR" />
                </th>
                <th>Créances &gt;121 j</th>
                <th>Dettes exigibles</th>
                <th>Δ 30 j</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.eple.id} onClick={() => onSelect(r.eple.id)}>
                  <td>
                    <b>{r.eple.name}</b>
                    <small>{r.eple.uai || ''}</small>
                  </td>
                  <td>{eur(r.balance)}</td>
                  <td className={r.days != null && r.days < 30 ? 'negative' : ''}>
                    {r.days == null ? '—' : `${r.days.toFixed(0)} j`}
                  </td>
                  <td className={r.afterDueDays != null && r.afterDueDays < 30 ? 'negative' : ''}>
                    {eur(r.afterDue)}
                    {r.afterDueDays == null ? '' : ` · ${r.afterDueDays.toFixed(0)} j`}
                  </td>
                  <td>
                    {r.fdr == null ? '—' : `${eur(r.fdr)}${r.fdrDays == null ? '' : ` · ${r.fdrDays.toFixed(0)} j`}`}
                  </td>
                  <td>
                    {r.bfr == null ? '—' : `${eur(r.bfr)}${r.bfrDays == null ? '' : ` · ${r.bfrDays.toFixed(0)} j`}`}
                  </td>
                  <td
                    title={
                      r.tnrExercise == null
                        ? 'TnR indisponible'
                        : `Taux de non-recouvrement · EBLC exercice ${r.tnrExercise}`
                    }
                  >
                    {r.tnr == null ? '—' : `${r.tnr.toFixed(1)} %`}
                  </td>
                  <td className={r.oldReceivables > 0 ? 'negative' : ''}>
                    {r.oldReceivables ? eur(r.oldReceivables) : '—'}
                  </td>
                  <td className={r.supplierDue > 0 ? 'negative' : ''}>{r.supplierDue ? eur(r.supplierDue) : '—'}</td>
                  <td className={r.delta30 != null && r.delta30 < 0 ? 'negative' : 'positive'}>
                    {r.delta30 == null ? '—' : pct(r.delta30)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="financial-source-note">
        <span>
          Autonomie observée = solde 5151 / charges nettes de fonctionnement × 360. « Après dettes exigibles » retranche
          les montants échus de YBALAF : c’est un indicateur de pilotage, pas une grandeur comptable réglementaire.
        </span>
        <span>
          FdR et BFdR proviennent de l’analyse financière. Le TnR est calculé sur la dernière EBLC disponible : soldes
          débiteurs des comptes 411 à 418 / recettes nettes du compte 70 × 100. Les créances &gt; 121 j de YBALAC
          complètent cette lecture par leur ancienneté. Aucune donnée absente n’est simulée.
        </span>
      </div>
    </div>
  );
}
