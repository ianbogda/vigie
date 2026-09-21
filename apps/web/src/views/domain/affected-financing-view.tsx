import { AlertTriangle, Database, Landmark, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { Eple } from '../../types/dashboard';
import { eur } from './domain-utils';

const n = (v: unknown) => Number(v || 0);
const abs = (v: unknown) => Math.abs(n(v));
const financingAccount = (a: string) => /^(441|442|443|448)/.test(a);

export function AffectedFinancingView({ current }: { current: Eple }) {
  const [accounting, setAccounting] = useState<any>(null);
  const [financial, setFinancial] = useState<any>(null);
  const [fdrDetail, setFdrDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const key = current.opaleEntity || current.uai || current.id;

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.allSettled([api.accounting(key), api.financial(key)])
      .then(async ([a, f]) => {
        if (!live) return;
        const av = a.status === 'fulfilled' ? a.value : null;
        const fv: any = f.status === 'fulfilled' ? f.value : null;
        setAccounting(av);
        setFinancial(fv);
        const exercise = Number(fv?.fdr?.exercise || fv?.balance?.exercise || new Date().getFullYear());
        const detail = await api.financialFdrAnalysis(key, exercise + (fv?.fdr?.exercise ? 1 : 0)).catch(() => null);
        if (live) setFdrDetail(detail);
      })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [key]);

  const rows = useMemo(() => (accounting?.accounts || [])
    .filter((a: any) => financingAccount(String(a.account || '')) && abs(a.balance) > 0.005)
    .map((a: any) => ({ ...a, amount: abs(a.balance) }))
    .sort((a: any, b: any) => b.amount - a.amount), [accounting]);
  const identified = rows.reduce((s: number, r: any) => s + r.amount, 0);
  const fdr = n(financial?.fdr?.amount);
  const parts = fdrDetail?.accounts || {};
  const knownAdjustments = n(parts.provisions) + n(parts.cautions) + n(parts.stocks) + n(parts.doubtful) + n(fdrDetail?.aged?.overOneYear);
  const mobilisable = fdr ? Math.max(0, fdr - knownAdjustments) : null;
  const incomplete = !fdrDetail?.aged?.exactOverOneYear;

  if (loading) return <div className="page"><div className="loading">Construction de la vue Financements affectés…</div></div>;

  return <div className="page fade-in affected-financing">
    <div className="financial-head">
      <div><span>COMPTABILITÉ</span><h2><WalletCards size={24}/> Financements affectés</h2>
        <p>Lecture des soldes comptables liés aux financements affectés et mise en perspective avec le fonds de roulement.</p></div>
    </div>

    <div className="af-kpis">
      <article><span>FINANCEMENTS À QUALIFIER</span><strong>{eur(identified)}</strong><small>{rows.length} compte{rows.length > 1 ? 's' : ''} avec solde</small></article>
      <article><span>FDR COMPTABLE</span><strong>{fdr ? eur(fdr) : '—'}</strong><small>{financial?.fdr?.exercise ? `Exercice ${financial.fdr.exercise}` : 'Donnée COFI requise'}</small></article>
      <article className={incomplete ? 'watch' : ''}><span>RETRAITEMENTS CONNUS</span><strong>{fdr ? eur(knownAdjustments) : '—'}</strong><small>Stocks, provisions, cautions, créances douteuses</small></article>
      <article className="good"><span>FDR MOBILISABLE ESTIMÉ</span><strong>{mobilisable == null ? '—' : eur(mobilisable)}</strong><small>{incomplete ? 'Estimation partielle — données à compléter' : 'Estimation sur données disponibles'}</small></article>
    </div>

    <div className="af-grid">
      <section className="treasury-panel af-main">
        <div className="section-title"><div><h3>Soldes de financements à qualifier</h3><p>Les comptes sont détectés à partir des données comptables importées. VIGIE ne déduit pas automatiquement ces montants du FDR.</p></div></div>
        {rows.length ? <div className="af-table"><div className="af-row head"><span>Compte</span><span>Libellé</span><span>Solde</span><span>Dernier mouvement</span></div>
          {rows.map((r: any) => <div className="af-row" key={r.account}><b>{r.account}</b><span>{r.label || '—'}</span><strong>{eur(r.amount)}</strong><span>{r.lastDate ? new Date(r.lastDate).toLocaleDateString('fr-FR') : '—'}</span></div>)}</div>
          : <div className="flow-empty"><Database size={28}/><b>Aucun solde de financement détecté</b><span>Importer les données comptables Op@le pour alimenter cette analyse.</span></div>}
        <div className="accounting-note"><AlertTriangle size={17}/><span><b>À qualifier.</b> Un solde comptable ne suffit pas à reconstituer une opération de financement, son montant accordé, son emploi et son reliquat. Ces informations feront l’objet d’un rapprochement dédié.</span></div>
      </section>

      <section className="treasury-panel af-fdr">
        <div className="section-title"><div><h3>FDR mobilisable — estimation</h3><p>Décomposition explicable à partir des données actuellement disponibles.</p></div></div>
        <div className="af-calc"><div><span>FDR comptable</span><b>{fdr ? eur(fdr) : '—'}</b></div>
          <h4>Éléments non immédiatement mobilisables connus</h4>
          <div><span>Provisions</span><b>− {eur(n(parts.provisions))}</b></div><div><span>Cautions</span><b>− {eur(n(parts.cautions))}</b></div>
          <div><span>Stocks</span><b>− {eur(n(parts.stocks))}</b></div><div><span>Créances douteuses</span><b>− {eur(n(parts.doubtful))}</b></div>
          <div className="muted"><span>Créances &gt; 1 an non provisionnées</span><b>{fdrDetail?.aged?.exactOverOneYear ? `− ${eur(n(fdrDetail.aged.overOneYear))}` : 'non disponible'}</b></div>
          <div className="muted"><span>Réserve si BFR positif</span><b>à compléter</b></div><div className="muted"><span>Prélèvements FDR déjà votés</span><b>à compléter</b></div>
          <div className="total"><span>FDR mobilisable estimé</span><strong>{mobilisable == null ? '—' : eur(mobilisable)}</strong></div></div>
        {incomplete && <div className="af-warning"><AlertTriangle size={18}/><span>VIGIE ne transforme pas les créances &gt; 120 jours en créances &gt; 1 an. L’estimation reste volontairement partielle tant que cette donnée, le BFR et les prélèvements votés ne sont pas disponibles.</span></div>}
      </section>
    </div>

    <section className="treasury-panel af-coverage"><div className="section-title"><div><h3><Landmark size={20}/> Couverture des financements</h3><p>Préparation du rapprochement entre opérations suivies et soldes comptables.</p></div></div>
      <div className="af-placeholder"><strong>{eur(identified)}</strong><span>de soldes comptables détectés</span><i>Le suivi par opération (accordé / reçu / employé / reste à employer) nécessite une source structurée supplémentaire. Aucun reliquat n’est inventé à partir du seul solde comptable.</i></div>
    </section>
  </div>;
}

export function AgencyAffectedFinancingView({ all, onSelect }: { all: Eple[]; onSelect: (id: string) => void }) {
  return <div className="page fade-in affected-financing"><div className="financial-head"><div><span>COMPTABILITÉ · VUE AGENCE</span><h2><WalletCards size={24}/> Financements affectés</h2><p>Sélectionnez un établissement pour analyser les soldes et le FDR mobilisable estimé.</p></div></div>
    <section className="treasury-panel"><div className="af-agency-list">{all.map(e => <button key={e.id} onClick={() => onSelect(e.id)}><span><b>{e.name}</b><small>{e.uai || e.opaleEntity || 'Établissement'}</small></span><span>Analyser →</span></button>)}</div></section></div>;
}