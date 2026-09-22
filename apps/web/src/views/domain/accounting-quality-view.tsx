import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  Search,
  ShieldAlert
} from 'lucide-react';
import { api } from '../../lib/api';
/*import './accounting-quality.css';*/
import { dateFr, eur } from '../../lib/format';
import type { Eple, State } from '../../types/dashboard';

type Props = { current: Eple | null; all: Eple[]; onSelect: (id: string) => void };
type DimensionKey = 'apurement' | 'justification' | 'rapprochements' | 'temporalite' | 'cloture';
type Finding = {
  dimension: DimensionKey;
  level: 'alert' | 'watch';
  title: string;
  detail: string;
  source: string;
  amount?: number;
};
type Quality = {
  eple: Eple;
  dimensions: Record<DimensionKey, State>;
  findings: Finding[];
  lastAnalysis: string | null;
};

const DIMENSIONS: { key: DimensionKey; label: string; description: string; icon: typeof Database }[] = [
  { key: 'apurement', label: 'Apurement', description: "Comptes d’attente et transitoires soldés", icon: Database },
  { key: 'justification', label: 'Justification', description: 'Soldes comptables explicables', icon: FileCheck2 },
  { key: 'rapprochements', label: 'Rapprochements', description: 'Concordance des sources et auxiliaires', icon: ArrowLeftRight },
  { key: 'temporalite', label: 'Temporalité', description: 'Opérations traitées dans des délais maîtrisés', icon: Clock3 },
  { key: 'cloture', label: 'Cohérence / clôture', description: 'Comptes sans anomalie majeure pour le COFI', icon: ShieldAlert }
];

const stateRank: Record<State, number> = { missing: -1, ok: 0, watch: 1, alert: 2 };
const worst = (states: State[]): State =>
  states.reduce<State>((a, b) => (stateRank[b] > stateRank[a] ? b : a), 'ok');

function findingState(findings: Finding[], dimension: DimensionKey): State {
  const xs = findings.filter((finding) => finding.dimension === dimension);
  if (xs.some((finding) => finding.level === 'alert')) return 'alert';
  if (xs.some((finding) => finding.level === 'watch')) return 'watch';
  return 'ok';
}

function qualityFrom(eple: Eple, accounting: any, clients: any, suppliers: any): Quality {
  const findings: Finding[] = [];
  const accounts = accounting?.accounts || [];
  const entries = accounting?.entries || [];
  const pieces = accounting?.ygpie1?.pieces || [];

  for (const account of accounts) {
    const code = String(account.account || '');
    const balance = Number(account.balance ?? account.net ?? account.debitBalance ?? 0) -
      Number(account.creditBalance ?? 0);
    if (/^(47|58)/.test(code) && Math.abs(balance) >= 1000) {
      findings.push({
        dimension: 'apurement',
        level: Math.abs(balance) >= 5000 ? 'alert' : 'watch',
        title: `Compte {code} à apurer`,
        detail: `Solde significatif de {eur(Math.abs(balance))}.`,
        source: 'EBLC',
        amount: Math.abs(balance)
      });
    }
  }

  const now = Date.now();
  const oldPieces = pieces.filter((piece: any) => {
    const raw = piece.dueDate || piece.initialDueDate;
    const date = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(date) && (now - date) / 86400000 > 120;
  });
  if (oldPieces.length) {
    findings.push({
      dimension: 'temporalite',
      level: oldPieces.length >= 5 ? 'alert' : 'watch',
      title: `{oldPieces.length} pièce(s) non soldée(s) depuis plus de 120 jours`,
      detail: 'Ancienneté élevée des pièces restant ouvertes.',
      source: 'YGPIE1'
    });
  }

  const clientOld = Number(clients?.summary?.old || 0);
  if (Math.abs(clientOld) >= 1000) {
    findings.push({
      dimension: 'justification',
      level: Math.abs(clientOld) >= 5000 ? 'alert' : 'watch',
      title: 'Créances anciennes à justifier',
      detail: `{eur(Math.abs(clientOld))} au-delà de 121 jours.`,
      source: 'YBALAC',
      amount: Math.abs(clientOld)
    });
  }
  const supplierOld = Number(suppliers?.summary?.old || 0);
  if (Math.abs(supplierOld) >= 1000) {
    findings.push({
      dimension: 'temporalite',
      level: Math.abs(supplierOld) >= 5000 ? 'alert' : 'watch',
      title: 'Dettes fournisseurs anciennes',
      detail: `{eur(Math.abs(supplierOld))} au-delà de 121 jours.`,
      source: 'YBALAF',
      amount: Math.abs(supplierOld)
    });
  }

  const treasurySignals = (accounting?.signals || []).filter((signal: any) =>
    /5151|trésorerie|tresorerie/i.test(`{signal.code || ''} {signal.title || ''}`)
  );
  if (treasurySignals.length) {
    findings.push({
      dimension: 'rapprochements',
      level: treasurySignals.some((signal: any) => signal.level === 'alert') ? 'alert' : 'watch',
      title: 'Trésorerie à rapprocher',
      detail: treasurySignals[0]?.detail || 'Un signal concerne le compte 5151.',
      source: treasurySignals[0]?.source || 'EBLC / 5151'
    });
  }

  const suspicious = entries.filter((entry: any) => {
    const code = String(entry.account || '');
    const amount = Math.abs(Number(entry.debit || 0) - Number(entry.credit || 0));
    return /^(1|2|4|5)/.test(code) && amount >= 10000;
  });
  if (suspicious.length >= 3) {
    findings.push({
      dimension: 'cloture',
      level: suspicious.length >= 10 ? 'alert' : 'watch',
      title: 'Écritures significatives à revoir avant clôture',
      detail: `{suspicious.length} écriture(s) de bilan dépassent 10 000 €.`,
      source: 'EBLC'
    });
  }

  const dimensions = Object.fromEntries(
    DIMENSIONS.map(({ key }) => [key, findingState(findings, key)])
  ) as Record<DimensionKey, State>;

  const dates = [
    accounting?.snapshotDate,
    accounting?.snapshot?.snapshotDate,
    clients?.snapshot?.snapshotDate,
    suppliers?.snapshot?.snapshotDate,
    eple.freshness
  ].filter(Boolean);
  return { eple, dimensions, findings, lastAnalysis: dates.sort().at(-1) || null };
}

function StatusDot({ state }: { state: State }) {
  return <span className={`qc-dot {state}`} title={state === 'ok' ? 'Satisfaisant' : state === 'watch' ? 'À surveiller' : state === 'alert' ? 'Contrôle requis' : 'Données manquantes'} />;
}

export function AccountingQualityView({ current, all, onSelect }: Props) {
  const [rows, setRows] = useState<Quality[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    const targets = current ? [current] : all;
    Promise.all(
      targets.map(async (eple) => {
        const ets = eple.opaleEntity || eple.uai || eple.id;
        const [accounting, clients, suppliers] = await Promise.all([
          api.accounting(ets).catch(() => null),
          api.aged(ets, 'clients').catch(() => null),
          api.aged(ets, 'suppliers').catch(() => null)
        ]);
        return qualityFrom(eple, accounting, clients, suppliers);
      })
    ).then((result) => {
      if (active) {
        setRows(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [current, all]);

  const visible = useMemo(
    () => rows.filter((row) => row.eple.name.toLowerCase().includes(query.trim().toLowerCase())),
    [rows, query]
  );
  const selected = current ? rows[0] : [...rows].sort((a, b) => b.findings.length - a.findings.length)[0];
  const status = (row: Quality) => worst(Object.values(row.dimensions));
  const okCount = rows.filter((row) => status(row) === 'ok').length;
  const watchCount = rows.filter((row) => status(row) === 'watch').length;
  const alertCount = rows.filter((row) => status(row) === 'alert').length;

  if (loading) return <div className="page loading">Analyse de la qualité comptable…</div>;

  return (
    <div className="page fade-in accounting-quality">
      <div className="qc-head">
        <div>
          <span>CONTRÔLE</span>
          <h2>Qualité comptable</h2>
          <p>Des comptes fiables, justifiés et prêts à être arrêtés.</p>
        </div>
        <div className="qc-info">
          La qualité comptable complète la maîtrise des risques : elle analyse la fiabilité des comptes à partir des
          données Op@le.
        </div>
      </div>

      <section className="qc-summary">
        <article className="ok"><CheckCircle2 /><div><b>{okCount}</b><span>établissement(s) satisfaisant(s)</span></div></article>
        <article className="watch"><AlertTriangle /><div><b>{watchCount}</b><span>à surveiller</span></div></article>
        <article className="alert"><ShieldAlert /><div><b>{alertCount}</b><span>nécessitant un contrôle</span></div></article>
        <article><div><b>{rows.length}</b><span>établissement(s) analysé(s)</span></div></article>
      </section>

      <section className="panel qc-dimensions">
        <div className="panel-title"><div><h3>Les 5 dimensions de la qualité comptable</h3><p>Lecture par exception, sans score moyen masquant une anomalie majeure.</p></div></div>
        <div className="qc-dimension-grid">
          {DIMENSIONS.map(({ key, label, description, icon: Icon }) => {
            const dimensionState = worst(rows.map((row) => row.dimensions[key]));
            return <article key={key} className={dimensionState}>
              <Icon size={22} /><b>{label}</b><p>{description}</p>
              <span><StatusDot state={dimensionState} /> {rows.reduce((n, row) => n + row.findings.filter((f) => f.dimension === key).length, 0)} point(s) à traiter</span>
            </article>;
          })}
        </div>
      </section>

      {!current && <section className="panel qc-overview">
        <div className="panel-title">
          <div><h3>Vue d’ensemble des établissements</h3><p>Cliquer sur une ligne pour ouvrir le contrôle de l’EPLE.</p></div>
          <label className="qc-search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un établissement…" /></label>
        </div>
        <div className="qc-table-wrap"><table className="qc-table">
          <thead><tr><th>Établissement</th>{DIMENSIONS.map((d) => <th key={d.key}>{d.label}</th>)}<th>Points à traiter</th><th>Dernière analyse</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.eple.id} className={status(row)} onClick={() => onSelect(row.eple.id)}>
            <td><b>{row.eple.name}</b></td>{DIMENSIONS.map((d) => <td key={d.key}><StatusDot state={row.dimensions[d.key]} /></td>)}
            <td><b>{row.findings.length}</b></td><td>{dateFr(row.lastAnalysis)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      {selected && <section className="qc-detail-grid">
        <article className="panel">
          <div className="panel-title"><div><h3>{current ? 'Situation de l’établissement' : 'Zoom sur un établissement'}</h3><p>{selected.eple.name}</p></div></div>
          <div className={`qc-verdict {status(selected)}`}>
            {status(selected) === 'alert' ? <ShieldAlert size={28}/> : status(selected) === 'watch' ? <AlertTriangle size={28}/> : <CheckCircle2 size={28}/>}
            <div><b>{status(selected) === 'alert' ? 'Attention requise' : status(selected) === 'watch' ? 'Points à surveiller' : 'Situation satisfaisante'}</b><span>{selected.findings.length} contrôle(s) nécessitent une attention</span></div>
          </div>
          <div className="qc-mini-grid">{DIMENSIONS.map((d) => <div key={d.key} className={selected.dimensions[d.key]}><b>{d.label}</b><StatusDot state={selected.dimensions[d.key]} /><span>{selected.findings.filter((f) => f.dimension === d.key).length} anomalie(s)</span></div>)}</div>
        </article>
        <article className="panel">
          <div className="panel-title"><div><h3>Anomalies détectées</h3><p>Contrôles explicables issus des imports disponibles.</p></div></div>
          <div className="qc-findings">
            {selected.findings.length ? selected.findings.map((finding, index) => <div key={`{finding.title}-{index}`} className={finding.level}>
              <StatusDot state={finding.level} /><div><b>{finding.title}</b><span>{finding.detail}</span><small>Source : {finding.source}</small></div><em>{finding.level === 'alert' ? 'Majeure' : 'À surveiller'}</em>
            </div>) : <div className="qc-empty"><CheckCircle2 size={24}/><b>Aucune anomalie détectée par les contrôles disponibles.</b></div>}
          </div>
        </article>
      </section>}
      <div className="qc-method-note">
        <b>Principe :</b> cette première version ne produit pas de « score de qualité ». Elle remonte des exceptions
        objectivées par EBLC, YGPIE1, YBALAC et YBALAF. Les seuils sont des règles VIGIE de priorisation, pas des seuils
        réglementaires.
      </div>
    </div>
  );
}