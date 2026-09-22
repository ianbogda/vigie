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
import { FinancialAnalysisModal } from './FinancialAnalysisModal';
import type { FinancialAnalysisForm } from './FinancialAnalysisModal';

type FinancialIndicatorPoint = FinancialIndicator;
function FinancialIndicatorsChart({ data }: { data: FinancialIndicatorPoint[] }) {
  const currentYear = new Date().getFullYear(),
    windowYears = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i),
    byYear = new Map((data || []).map((x) => [Number(x.exercise), x]));
  const rows: FinancialIndicatorPoint[] = windowYears.map(
    (exercise) =>
      byYear.get(exercise) || {
        exercise,
        isCurrent: exercise === currentYear,
        isFinal: false,
        fdr: null,
        fdrFinal: false,
        treasury: null,
        result: null,
        bfr: null
      }
  );
  if (rows.filter((x) => x.fdr != null || x.treasury != null || x.result != null || x.bfr != null).length < 2)
    return (
      <div className="financial-history">
        <div>
          <b>Historique insuffisant</b>
          <br />
          <span className="muted">Importe YFDR et les EBLC de clôture au 31/12 pour construire les courbes.</span>
        </div>
      </div>
    );
  const series = [
    { key: 'fdr', label: 'Fonds de roulement', cls: 'fdr' },
    { key: 'treasury', label: 'Trésorerie', cls: 'treasury' },
    { key: 'result', label: 'Résultat', cls: 'result' },
    { key: 'bfr', label: 'BFR', cls: 'bfr' }
  ] as const;
  const vals = rows
    .flatMap((r) => series.map((x) => r[x.key]))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return <div className="financial-history">Données insuffisantes.</div>;
  const w = 760,
    h = 285,
    l = 66,
    rp = 18,
    top = 22,
    bottom = 42,
    rawMin = Math.min(...vals, 0),
    rawMax = Math.max(...vals, 0),
    span0 = Math.max(rawMax - rawMin, 1),
    min = rawMin - span0 * 0.08,
    max = rawMax + span0 * 0.08,
    span = Math.max(max - min, 1),
    x = (i: number) => l + i * ((w - l - rp) / Math.max(rows.length - 1, 1)),
    y = (v: number) => top + ((max - v) / span) * (h - top - bottom),
    compact = (v: number) =>
      new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 }).format(v);
  const segments = (key: 'fdr' | 'treasury' | 'result' | 'bfr') => {
    const out: { a: FinancialIndicatorPoint; b: FinancialIndicatorPoint; i: number; current: boolean }[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i],
        b = rows[i + 1];
      if (a[key] != null && b[key] != null) out.push({ a, b, i, current: b.isCurrent || !b.isFinal });
    }
    return out;
  };
  return (
    <div className="financial-evolution-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Évolution annuelle du fonds de roulement, de la trésorerie, du résultat et du besoin en fonds de roulement"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = top + t * (h - top - bottom),
            v = max - t * span;
          return (
            <g key={t}>
              <line x1={l} y1={yy} x2={w - rp} y2={yy} className="fin-grid" />
              <text x={l - 9} y={yy + 4} className="fin-axis-y">
                {compact(v)} €
              </text>
            </g>
          );
        })}
        {series.map((sr) => (
          <g key={sr.key} className={`fin-series ${sr.cls}`}>
            {segments(sr.key).map((seg) => (
              <line
                key={seg.i}
                x1={x(seg.i)}
                y1={y(seg.a[sr.key] as number)}
                x2={x(seg.i + 1)}
                y2={y(seg.b[sr.key] as number)}
                className={seg.current ? 'fin-segment provisional' : 'fin-segment'}
              />
            ))}
            {rows.map((row, i) =>
              row[sr.key] != null ? (
                <circle
                  key={row.exercise}
                  cx={x(i)}
                  cy={y(row[sr.key] as number)}
                  r="4"
                  className={row.isCurrent || !row.isFinal ? 'fin-point provisional' : 'fin-point'}
                >
                  <title>{`${sr.label} · ${row.exercise} · ${eur(row[sr.key] as number)} · ${row.isCurrent || !row.isFinal ? 'situation provisoire' : 'clôture'}`}</title>
                </circle>
              ) : null
            )}
          </g>
        ))}
        {rows.map((row, i) => (
          <text key={row.exercise} x={x(i)} y={h - 16} className={row.isCurrent ? 'fin-axis-x current' : 'fin-axis-x'}>
            {row.exercise}
          </text>
        ))}
      </svg>
      <div className="fin-legend">
        {series.map((sr) => (
          <span key={sr.key} className={sr.cls}>
            <i />
            {sr.label}
          </span>
        ))}
        <span className="provisional-note">Dernier exercice : situation provisoire</span>
      </div>
    </div>
  );
}

export function FinancialAnalysisView({ current, initialTab = 'overview' }: { current: Eple; initialTab?: 'overview' | 'srh' }) {
  const [budget, setBudget] = useState<BudgetResponse | null>(null),
    [financial, setFinancial] = useState<FinancialResponse | null>(null),
    [exercise, setExercise] = useState<number>(new Date().getFullYear());
  const [analysisOpen, setAnalysisOpen] = useState(false),
    [fdrPrep, setFdrPrep] = useState<FdrAnalysisResponse | null>(null),
    [financialTab, setFinancialTab] = useState<'overview' | 'srh'>(initialTab);
  useEffect(() => {
    setBudget(null);
    setFinancial(null);
    setFdrPrep(null);
    if (current?.opaleEntity) {
      api
        .budget(current.opaleEntity)
        .then(setBudget)
        .catch(() => setBudget(null));
      api
        .financial(current.opaleEntity)
        .then(setFinancial)
        .catch(() => setFinancial(null));
    }
  }, [current?.opaleEntity]);
  const dep = financial?.expenses || budget?.summary?.expenses,
    rec = financial?.revenues || budget?.summary?.revenues;
  const depBudget = dep?.budget ?? null,
    depReal = dep?.accounted ?? null,
    recBudget = rec?.budget ?? null,
    recReal = rec?.accounted ?? null;
  const depRate = depBudget != null && depBudget > 0 && depReal != null ? Math.max(0, depReal / depBudget) : null,
    recRate = recBudget != null && recBudget > 0 && recReal != null ? Math.max(0, recReal / recBudget) : null;
  const indicatorHistory: FinancialIndicatorPoint[] = financial?.indicatorHistory || [];
  const currentYear = new Date().getFullYear(),
    years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i),
    indicatorByYear = new Map(indicatorHistory.map((x) => [Number(x.exercise), x])),
    financialExercises = [...new Set(indicatorHistory.map((x) => Number(x.exercise)).filter(Number.isFinite))].sort(
      (a, b) => b - a
    ),
    selectedFinancialExercise = financialExercises.includes(exercise)
      ? exercise
      : (financialExercises[0] ?? currentYear),
    currentIndicators = indicatorByYear.get(selectedFinancialExercise);
  useEffect(() => {
    if (current?.opaleEntity && analysisOpen)
      api
        .financialFdrAnalysis(current.opaleEntity, selectedFinancialExercise)
        .then(setFdrPrep)
        .catch(() => setFdrPrep(null));
  }, [current?.opaleEntity, analysisOpen, selectedFinancialExercise]);
  const fdr = financial?.fdr,
    currentBfr = currentIndicators?.bfr ?? null,
    result = currentIndicators?.result ?? financial?.balance?.result ?? null,
    caf = currentIndicators?.caf ?? financial?.balance?.caf ?? null,
    srh = financial?.srh,
    receivables = financial?.receivables,
    payables = financial?.payables;
  const attention = (current?.signals || []).slice(0, 5);
  const sourceCount = financial?.sources ? Object.values(financial.sources).filter(Boolean).length : 0;
  const kpi = (label: ReactNode, value: number | null | undefined, hint: string) => (
    <div className={'financial-kpi ' + (value == null ? 'placeholder' : '')}>
      <span>{label}</span>
      <b>{value == null ? 'À alimenter' : eur(value)}</b>
      <small>{value == null ? 'Source non importée' : hint}</small>
    </div>
  );
  const valueFor = (year: number, key: 'result' | 'caf' | 'fdr' | 'bfr' | 'treasury') =>
    indicatorByYear.get(year)?.[key] ?? null;
  const currentPeriod = currentIndicators?.periodEnd || currentIndicators?.snapshotDate || null;
  const previous = indicatorByYear.get(selectedFinancialExercise - 1),
    previousFdr = previous?.fdr ?? null,
    previousDays = previous?.fdrDays ?? null,
    previousBfr = previous?.bfr ?? null;
  const analysisDefaults = {
    fdr: Number(previousFdr ?? 0),
    bfr: Number(previousBfr ?? 0),
    days: Number(previousDays ?? 0),
    provisions: 0,
    cautions: 0,
    stocks: 0,
    doubtful: 0,
    oldReceivables: 0,
    reserve: 0,
    voted: 0,
    proposed: 0,
    class6: Number(previous?.operatingCharges ?? 0)
  };
  return (
    <div className="page financial-page">
      <div className="financial-head">
        <div>
          <span>ANALYSE FINANCIÈRE</span>
          <h2>Situation financière</h2>
          <p>
            {current
              ? `${sourceCount}/5 sources financières spécialisées disponibles`
              : 'Sélectionne un établissement pour construire son analyse financière.'}
          </p>
        </div>
        <div className="financial-head-actions">
          {financialExercises.length > 0 && (
            <label className="flow-exercise">
              Exercice
              <select value={selectedFinancialExercise} onChange={(e) => setExercise(Number(e.target.value))}>
                {financialExercises.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="financial-analysis-button" onClick={() => setAnalysisOpen(true)}>
            <FileText size={16} /> Préparer une analyse financière
          </button>
        </div>
      </div>
      <div className="financial-kpis">
        {kpi(
          <>
            Fonds de roulement <IndicatorInfo id="FDR" />
          </>,
          fdr?.amount,
          fdr ? `${fdr.exercise} · ${fdr.isFinal ? 'définitif' : 'provisoire'}` : ''
        )}
        {kpi(
          'Trésorerie (5151)',
          currentIndicators?.treasury ?? null,
          currentIndicators
            ? `EBLC · ${currentIndicators.periodEnd || currentIndicators.snapshotDate || currentYear}`
            : ''
        )}
        {kpi(
          <>
            Besoin en fonds de roulement <IndicatorInfo id="BFDR" />
          </>,
          currentBfr,
          financial?.balance ? `EBLC · ${financial.balance.period || financial.balance.snapshotDate}` : ''
        )}
        {kpi('Résultat comptable', result, financial?.balance ? `EBLC · exercice ${financial.balance.exercise}` : '')}
        {kpi(
          <>
            {caf != null && caf < 0 ? 'IAF' : 'CAF'} <IndicatorInfo id="CAF_IAF" />
          </>,
          caf,
          financial?.balance ? `Méthode additive M9.6 · EBLC ${financial.balance.exercise}` : ''
        )}
      </div>
      <div className={`financial-srh-reminder ${(srh?.result ?? 0) < 0 ? 'deficit' : srh ? 'surplus' : 'empty'}`}>
        <Utensils size={16} />
        <div>
          <span>SRH · résultat réalisé</span>
          <b>{srh ? eur(srh.result) : 'À alimenter'}</b>
        </div>
        <small>
          {srh
            ? `${eur(srh.revenues)} de recettes · ${eur(srh.expenses)} de dépenses`
            : 'YECBUD + YECBUR avec service SRH'}
        </small>
        <button onClick={() => setFinancialTab('srh')}>
          Voir le SRH <ChevronRight size={14} />
        </button>
      </div>
      <nav className="financial-tabs" aria-label="Vues de l’analyse financière">
        <button className={financialTab === 'overview' ? 'active' : ''} onClick={() => setFinancialTab('overview')}>
          Vue d’ensemble
        </button>
        <button className={financialTab === 'srh' ? 'active' : ''} onClick={() => setFinancialTab('srh')}>
          <Utensils size={15} /> Service de restauration et d’hébergement
        </button>
      </nav>
      {analysisOpen && (
        <FinancialAnalysisModal
          establishment={current}
          exercise={selectedFinancialExercise}
          defaults={analysisDefaults}
          prep={fdrPrep}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
      {financialTab === 'overview' && (
        <>
          <div className="financial-grid">
            <section className="financial-card">
              <h3>
                <ReceiptText size={18} /> Exécution budgétaire
              </h3>
              {dep && rec ? (
                <div className="financial-budget-bars">
                  <div className="financial-budget-line">
                    <span>Dépenses réalisées</span>
                    <div className="financial-track">
                      <i style={{ width: `${Math.min(100, (depRate || 0) * 100)}%` }} />
                    </div>
                    <b>{depRate == null ? '—' : `${(depRate * 100).toFixed(1)} %`}</b>
                  </div>
                  <div className="financial-budget-line">
                    <span>Recettes réalisées</span>
                    <div className="financial-track rec">
                      <i style={{ width: `${Math.min(100, (recRate || 0) * 100)}%` }} />
                    </div>
                    <b>{recRate == null ? '—' : `${(recRate * 100).toFixed(1)} %`}</b>
                  </div>
                  <p className="muted">
                    Dépenses : {eur(depReal)} / {eur(depBudget)} · Recettes : {eur(recReal)} / {eur(recBudget)} · source{' '}
                    {financial?.expenses ? 'YECBUD / YECBUR' : 'Budget'}
                  </p>
                </div>
              ) : (
                <p className="muted">Importe YECBUD et YECBUR pour alimenter cette brique.</p>
              )}
            </section>
            <section className="financial-card financial-debt">
              <h3>
                <Utensils size={18} /> SRH
              </h3>
              <p className="muted">
                Le service spécial est analysé séparément : son équilibre ne doit pas être masqué par le résultat global
                de l’établissement.
              </p>
              <button className="financial-inline-link" onClick={() => setFinancialTab('srh')}>
                Ouvrir l’analyse SRH <ChevronRight size={14} />
              </button>
            </section>
          </div>
          <div className="financial-grid">
            <section className="financial-card">
              <h3>
                <BarChart3 size={18} /> Évolution des principaux indicateurs
              </h3>
              <FinancialIndicatorsChart data={financial?.indicatorHistory || []} />
            </section>
            <section className="financial-card financial-debt">
              <h3>
                <WalletCards size={18} /> Créances et dettes
              </h3>
              <div className="debt-group">
                <div className="debt-title">
                  <b>CRÉANCES CLIENTS</b>
                  <small>
                    {receivables?.snapshotDate ? `au ${dateFr(receivables.snapshotDate)}` : 'YBALAC non importé'}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Créances totales</dt>
                    <dd>{receivables ? eur(receivables.total) : 'À alimenter'}</dd>
                  </div>
                  <div>
                    <dt>dont échues</dt>
                    <dd>{receivables ? eur(receivables.due) : '—'}</dd>
                  </div>
                  <div>
                    <dt>dont anciennes (+121 j)</dt>
                    <dd>{receivables ? eur(receivables.old) : '—'}</dd>
                  </div>
                  <div>
                    <dt>dont non échues</dt>
                    <dd>{receivables ? eur(receivables.notDue) : '—'}</dd>
                  </div>
                </dl>
              </div>
              <div className="debt-group">
                <div className="debt-title">
                  <b>DETTES FOURNISSEURS</b>
                  <small>{payables?.snapshotDate ? `au ${dateFr(payables.snapshotDate)}` : 'YBALAF non importé'}</small>
                </div>
                <dl>
                  <div>
                    <dt>Dettes totales</dt>
                    <dd>{payables ? eur(payables.total) : 'À alimenter'}</dd>
                  </div>
                  <div>
                    <dt>dont échues</dt>
                    <dd>{payables ? eur(payables.due) : '—'}</dd>
                  </div>
                  <div>
                    <dt>dont anciennes (+121 j)</dt>
                    <dd>{payables ? eur(payables.old) : '—'}</dd>
                  </div>
                  <div>
                    <dt>dont non échues</dt>
                    <dd>{payables ? eur(payables.notDue) : '—'}</dd>
                  </div>
                </dl>
              </div>
            </section>
          </div>
          <div className="financial-grid">
            <section className="financial-card">
              <h3>
                <BarChart3 size={18} /> Indicateurs clés
              </h3>
              <table className="financial-indicators">
                <thead>
                  <tr>
                    <th>Indicateur</th>
                    {years.map((y) => (
                      <th key={y} className={y === currentYear ? 'current-year' : ''}>
                        {y}
                        {y === currentYear && (
                          <small>{currentPeriod ? `Situation ${currentPeriod}` : 'Situation courante'}</small>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Résultat comptable</td>
                    {years.map((y) => (
                      <td key={y} className={y === currentYear ? 'current-year' : ''}>
                        {eur(valueFor(y, 'result'))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>CAF / IAF</td>
                    {years.map((y) => (
                      <td key={y} className={y === currentYear ? 'current-year' : ''}>
                        {eur(valueFor(y, 'caf'))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Fonds de roulement</td>
                    {years.map((y) => (
                      <td key={y} className={y === currentYear ? 'current-year' : ''}>
                        {eur(valueFor(y, 'fdr'))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Besoin en FDR</td>
                    {years.map((y) => (
                      <td key={y} className={y === currentYear ? 'current-year' : ''}>
                        {eur(valueFor(y, 'bfr'))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Trésorerie (5151)</td>
                    {years.map((y) => (
                      <td key={y} className={y === currentYear ? 'current-year' : ''}>
                        {eur(valueFor(y, 'treasury'))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </section>
            <section className="financial-card">
              <h3>
                <AlertTriangle size={18} /> Points d'attention
              </h3>
              <div className="financial-alerts">
                {attention.length ? (
                  attention.map((s) => (
                    <div className={`financial-alert ${s.level}`} key={s.code}>
                      <i />
                      <div>
                        <b>{s.title}</b>
                        <small>{s.detail || s.domain || 'Signal Vigie'}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="financial-alert">
                    <i />
                    <div>
                      <b>Aucun signal disponible</b>
                      <small>Les alertes apparaîtront au fil des données importées.</small>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
          <div className="financial-source-note">
            <span>Aucune donnée financière n'est simulée : une valeur absente reste explicitement non alimentée.</span>
            <span>Sources : YFDR · EBLC · YECBUD · YECBUR · YBALAC · YBALAF · 5151</span>
          </div>
        </>
      )}
      {financialTab === 'srh' && (
        <div className="financial-srh-view">
          <section className={`srh-balance-card ${(srh?.result ?? 0) < 0 ? 'deficit' : srh ? 'surplus' : 'empty'}`}>
            <div>
              <span>ÉQUILIBRE DU SERVICE</span>
              <h3>
                {srh
                  ? srh.result < 0
                    ? 'Déficit constaté'
                    : srh.result > 0
                      ? 'Excédent constaté'
                      : 'Équilibre constaté'
                  : 'Données SRH à alimenter'}
              </h3>
              <p>
                {srh
                  ? srh.result < 0
                    ? 'À défaut de réserve SRH mobilisable, le déficit devra être financé par le fonds de roulement de l’établissement.'
                    : srh.result > 0
                      ? 'L’excédent peut consolider le fonds de roulement ou être identifié comme réserve SRH pour absorber un exercice futur déficitaire.'
                      : 'Recettes et dépenses réalisées sont à l’équilibre.'
                  : 'Importe YECBUD et YECBUR : Vigie isolera les lignes dont le service est SRH.'}
              </p>
            </div>
            <strong>{srh ? eur(srh.result) : '—'}</strong>
          </section>
          <section className="srh-kpis">
            <article>
              <span>Recettes réalisées</span>
              <b>{srh ? eur(srh.revenues) : '—'}</b>
              <small>YECBUR · service SRH</small>
            </article>
            <article>
              <span>Dépenses réalisées</span>
              <b>{srh ? eur(srh.expenses) : '—'}</b>
              <small>YECBUD · service SRH</small>
            </article>
            <article>
              <span>Achats de denrées</span>
              <b>{srh ? eur(srh.foodExpenses) : '—'}</b>
              <small>YECBUD · compte 601100</small>
            </article>
            <article className={(srh?.result ?? 0) < 0 ? 'attention' : ''}>
              <span>Résultat SRH réalisé</span>
              <b>{srh ? eur(srh.result) : '—'}</b>
              <small>recettes − dépenses</small>
            </article>
          </section>
          <div className="financial-grid srh-grid">
            <section className="financial-card srh-realized-card">
              <h3>
                <BarChart3 size={18} /> Lecture du réalisé
              </h3>
              {srh ? (
                <div className="srh-realized">
                  <div className="srh-realized-row revenue">
                    <div>
                      <span>Recettes réalisées</span>
                      <b>{eur(srh.revenues)}</b>
                    </div>
                    <div className="srh-realized-track">
                      <i style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div className="srh-realized-row expense">
                    <div>
                      <span>Dépenses réalisées</span>
                      <b>{eur(srh.expenses)}</b>
                    </div>
                    <div className="srh-realized-track">
                      <i
                        style={{
                          width: `${Math.min(100, srh.revenues > 0 ? (srh.expenses / srh.revenues) * 100 : 100)}%`
                        }}
                      />
                    </div>
                  </div>
                  <div className={`srh-realized-result ${srh.result < 0 ? 'negative' : 'positive'}`}>
                    <span>{srh.result < 0 ? 'Déficit réalisé' : 'Excédent réalisé'}</span>
                    <strong>{eur(Math.abs(srh.result))}</strong>
                    <small>
                      {srh.revenues > 0
                        ? `${Math.abs((srh.result / srh.revenues) * 100).toFixed(1)} % des recettes`
                        : 'recettes − dépenses'}
                    </small>
                  </div>
                </div>
              ) : (
                <p className="muted">Aucune donnée SRH disponible.</p>
              )}
            </section>
            <section className="financial-card srh-food-card">
              <h3>
                <Utensils size={18} /> Focus crédit nourriture
              </h3>
              {srh && srh.foodCredit > 0 ? (
                <>
                  <div className="srh-food-summary">
                    <div>
                      <span>Crédit nourriture ouvert</span>
                      <b>{eur(srh.foodCredit)}</b>
                    </div>
                    <div>
                      <span>Achats de denrées réalisés</span>
                      <b>{eur(srh.foodExpenses)}</b>
                    </div>
                    <div className={srh.foodOverrun > 0 ? 'overrun' : 'remaining'}>
                      <span>{srh.foodOverrun > 0 ? 'Dépassement' : 'Reste disponible'}</span>
                      <b>{eur(srh.foodOverrun > 0 ? srh.foodOverrun : srh.foodRemaining)}</b>
                    </div>
                  </div>
                  <div className="srh-food-gauge">
                    <div>
                      <i style={{ width: `${Math.min(100, (srh.foodExpenses / srh.foodCredit) * 100)}%` }} />
                    </div>
                    <strong>
                      {((srh.foodExpenses / srh.foodCredit) * 100).toFixed(1)} % <small>consommé</small>
                    </strong>
                  </div>
                </>
              ) : (
                <div className="srh-food-missing">
                  <b>Crédit nourriture non identifié</b>
                  <p>
                    Le réalisé SRH est bien disponible, mais aucune ligne du YECBUD importé n’est actuellement
                    reconnue au compte 601100. Réimporte le YECBUD après cette mise à jour : Vigie lit désormais aussi
                    la colonne compte à sa position Op@le standard.
                  </p>
                </div>
              )}
              <p className="srh-food-note">
                Compte de référence : <b>601100</b>. Les activités 0DENR, 0CRED ou autres restent un niveau de
                ventilation.
              </p>
            </section>
          </div>
          <section className="financial-card srh-reading">
            <h3>Lecture de soutenabilité</h3>
            <div className="srh-path">
              <div>
                <span>1</span>
                <b>Résultat du SRH</b>
                <small>Le service est lu pour lui-même.</small>
              </div>
              <ChevronRight />
              <div>
                <span>2</span>
                <b>Réserve SRH</b>
                <small>À documenter lorsqu’elle est identifiable.</small>
              </div>
              <ChevronRight />
              <div>
                <span>3</span>
                <b>Impact établissement</b>
                <small>Un déficit non couvert pèse sur le FdR général.</small>
              </div>
            </div>
            <p className="muted">
              À ce stade, Vigie ne reconstitue pas une réserve SRH absente des sources importées. Elle distingue donc le
              résultat réalisé du service et son impact potentiel sur l’établissement.
            </p>
          </section>
          <section className="financial-card srh-data-needed">
            <h3>Données nécessaires</h3>
            <div>
              <b>YECBUR</b>
              <span>Recettes réalisées du service SRH</span>
            </div>
            <div>
              <b>YECBUD</b>
              <span>Dépenses SRH ; compte 601100 pour les achats de denrées et le crédit nourriture</span>
            </div>
            <div>
              <b>Réserve SRH</b>
              <span>À intégrer ultérieurement si une source fiable permet de l’identifier</span>
            </div>
            <p>Une donnée absente n’est pas reconstituée par Vigie.</p>
          </section>
        </div>
      )}
    </div>
  );
}
