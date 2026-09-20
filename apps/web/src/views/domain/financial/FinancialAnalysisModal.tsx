import { AlertTriangle, FileText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { FdrAnalysisResponse } from '../../../types/api';
import type { Eple } from '../../../types/dashboard';
import { eur } from '../domain-utils';

export type FinancialAnalysisForm = {
  fdr: number;
  bfr: number;
  days: number;
  provisions: number;
  cautions: number;
  stocks: number;
  doubtful: number;
  oldReceivables: number;
  reserve: number;
  voted: number;
  proposed: number;
  class6: number;
};
export function FinancialAnalysisModal({
  establishment,
  exercise,
  defaults,
  prep,
  onClose
}: {
  establishment: Eple;
  exercise: number;
  defaults: FinancialAnalysisForm;
  prep: FdrAnalysisResponse | null;
  onClose: () => void;
}) {
  const seeded = {
    ...defaults,
    provisions: Number(prep?.accounts?.provisions ?? defaults.provisions),
    cautions: Number(prep?.accounts?.cautions ?? defaults.cautions),
    stocks: Number(prep?.accounts?.stocks ?? defaults.stocks),
    doubtful: Number(prep?.accounts?.doubtful ?? defaults.doubtful),
    class6: Number(prep?.accounts?.class6 ?? defaults.class6)
  };
  const [v, setV] = useState<FinancialAnalysisForm>(seeded),
    [comment, setComment] = useState('');
  const set = (k: keyof FinancialAnalysisForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setV((x) => ({ ...x, [k]: Number(e.target.value) || 0 }));
  useEffect(() => setV(seeded), [prep]);
  const withdrawals = v.voted + v.proposed,
    available = v.fdr - v.provisions - v.cautions - v.stocks - v.doubtful - v.oldReceivables - v.reserve - withdrawals,
    day = v.class6 > 0 ? v.class6 / 174 : 0,
    availableDays = day > 0 ? available / day : null,
    withdrawalRate = v.fdr > 0 ? (withdrawals / v.fdr) * 100 : null;
  const watches: { level: string; title: string; text: string }[] = [];
  if (availableDays != null && availableDays < 0)
    watches.push({
      level: 'alert',
      title: 'FdR disponible négatif',
      text: 'Les prélèvements et engagements nouveaux doivent être réexaminés avant décision.'
    });
  else if (availableDays != null && availableDays < 30)
    watches.push({
      level: 'alert',
      title: 'FdR disponible inférieur à 30 jours',
      text: `${availableDays.toFixed(1).replace('.', ',')} jours après retraitements et prélèvements.`
    });
  else if (availableDays != null && availableDays < 45)
    watches.push({
      level: 'watch',
      title: 'Marge de fonctionnement modérée',
      text: `${availableDays.toFixed(1).replace('.', ',')} jours de FdR disponible.`
    });
  if (v.days > 0 && availableDays != null && availableDays < v.days - 5)
    watches.push({
      level: 'watch',
      title: 'Dégradation depuis le dernier COFI',
      text: `${v.days.toFixed(1).replace('.', ',')} → ${availableDays.toFixed(1).replace('.', ',')} jours.`
    });
  if (withdrawalRate != null && withdrawalRate >= 25)
    watches.push({
      level: 'watch',
      title: 'Mobilisation significative du FdR',
      text: `${withdrawalRate.toFixed(1).replace('.', ',')} % du FdR du dernier COFI.`
    });
  if (v.doubtful + v.oldReceivables > 0)
    watches.push({
      level: 'watch',
      title: 'Créances fragiles',
      text: `${eur(v.doubtful + v.oldReceivables)} à apprécier au regard du recouvrement et du provisionnement.`
    });
  if (v.bfr < 0)
    watches.push({
      level: 'info',
      title: 'BFdR négatif',
      text: 'Le cycle d’exploitation constitue une ressource ; vérifier qu’elle n’est pas liée à un simple décalage de flux.'
    });
  if (!watches.length)
    watches.push({
      level: 'info',
      title: 'Aucun signal automatique majeur',
      text: 'Compléter l’analyse par les besoins connus et l’atterrissage au 31 décembre.'
    });
  const sourceN1 = prep?.eblc ? `EBLC · ${prep.eblc.period || `31/12/${exercise - 1}`}` : 'À compléter';
  const field = (k: keyof FinancialAnalysisForm, label: string, source?: string) => (
    <label>
      <span>
        {label}
        {source && <small>{source}</small>}
      </span>
      <input type="number" step="0.01" value={v[k]} onChange={set(k)} />
    </label>
  );
  const draft = `Au regard des éléments disponibles, le fonds de roulement net comptable du dernier COFI s’établit à ${eur(v.fdr)}. Après retraitements et prélèvements (${eur(withdrawals)}), le fonds de roulement disponible est estimé à ${eur(available)}${availableDays == null ? '' : `, soit ${availableDays.toFixed(1).replace('.', ',')} jours de fonctionnement`}. ${v.days > 0 && availableDays != null ? `Le ratio évolue de ${v.days.toFixed(1).replace('.', ',')} à ${availableDays.toFixed(1).replace('.', ',')} jours. ` : ''}L’analyse doit être complétée au regard des besoins effectivement établis et de l’atterrissage au 31 décembre.`;
  const recommendation = comment || draft,
    fmt2 = (n: number) =>
      new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n),
    dataDate = prep?.eblc?.period
      ? String(prep.eblc.period).replace(/^(\d{2})\/(\d{4})$/, '31/$1/$2')
      : `31/12/${exercise - 1}`;
  return (
    <div className="financial-modal-backdrop">
      <div className="financial-modal">
        <header className="no-print">
          <div>
            <span>ANALYSE FINANCIÈRE DU FONDS DE ROULEMENT</span>
            <h2>{establishment.name}</h2>
            <p>Préparation de l’Annexe III · références au 31/12/{exercise - 1}</p>
          </div>
          <button className="financial-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="financial-modal-body no-print">
          <section className="financial-form-card">
            <h3>Données du dernier COFI · 31/12/{exercise - 1}</h3>
            <div className="financial-form-grid">
              {field('fdr', 'A · Fonds de roulement net comptable', 'Vigie · N−1')}
              {field('bfr', 'BFdR', 'Vigie · N−1')}
              {field('days', 'Nombre de jours de FdR', 'Vigie · N−1')}
              {field('class6', 'Classe 6 décaissable', sourceN1)}
            </div>
          </section>
          <section className="financial-form-card">
            <h3>Éléments à retraiter</h3>
            <div className="financial-form-grid">
              {field('provisions', '1 · Provisions et dépréciations', sourceN1)}
              {field('cautions', '2 · Dépôts et cautions reçus · 165', sourceN1)}
              {field('stocks', '3 · Stocks', sourceN1)}
              {field('doubtful', '4 · Créances douteuses · 416', sourceN1)}
              {field(
                'oldReceivables',
                '5 · Créances > 1 an non provisionnées',
                prep?.aged?.exactOverOneYear
                  ? `YBALAC · ${prep.aged.snapshotDate}`
                  : `À compléter · YBALAC >120 j : ${eur(prep?.aged?.over120 ?? 0)}`
              )}
              {field('reserve', '6 · Réserve de fonctionnement nécessaire')}
            </div>
            {prep?.aged && !prep.aged.exactOverOneYear && (
              <p className="financial-source-warning">
                <AlertTriangle size={14} /> Le YBALAC actuellement stocké dans Vigie isole les créances &gt; 120 jours,
                pas &gt; 365 jours. La ligne 5 reste donc volontairement à valider manuellement ; Vigie n’assimile pas
                les deux seuils.
              </p>
            )}
          </section>
          <section className="financial-form-card">
            <h3>Part du FdR déjà mobilisée</h3>
            <div className="financial-form-grid">
              {field('voted', '7a · Prélèvements déjà votés')}
              {field('proposed', '7b · Prélèvement proposé')}
            </div>
            <div className="financial-analysis-results">
              <div>
                <span>B · FdR disponible</span>
                <b>{eur(available)}</b>
              </div>
              <div>
                <span>C · Journée de fonctionnement</span>
                <b>{day ? eur(day) : '—'}</b>
              </div>
              <div>
                <span>D · FdR disponible</span>
                <b>{availableDays == null ? '—' : `${availableDays.toFixed(1).replace('.', ',')} jours`}</b>
              </div>
            </div>
          </section>
          <section className="financial-watch-card">
            <h3>Points de vigilance pour rédiger l’analyse</h3>
            <div className="financial-watch-list">
              {watches.map((w, i) => (
                <article key={i} className={w.level}>
                  <i />
                  <div>
                    <b>{w.title}</b>
                    <p>{w.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="financial-form-card">
            <h3>Préconisations de l’agent comptable</h3>
            <textarea value={comment || draft} onChange={(e) => setComment(e.target.value)} rows={6} />
            <p className="flow-muted">
              Aide à la rédaction : l’avis et les préconisations restent à valider par l’agent comptable.
            </p>
          </section>
        </div>
        <main className="fdr-print-sheet" aria-label="Annexe III — Analyse financière du Fonds de roulement">
          <div className="fdr-annex">
            <span>Annexe III</span>
          </div>
          <div className="fdr-doc-title">
            <div className="main">Analyse financière du Fonds de roulement</div>
            <div>
              {establishment.uai || '—'} - {establishment.name}
            </div>
            <div className={v.bfr < 0 ? 'bfdr-negative' : ''}>BFdR négatif ou positif : {fmt2(v.bfr)} €</div>
          </div>
          <table className="fdr-regtable">
            <tbody>
              <tr className="group">
                <th colSpan={2}>Éléments à retraiter</th>
                <th>Données au {dataDate}</th>
              </tr>
              <tr>
                <td className="rep">A</td>
                <td>Fonds de roulement net comptable au dernier COFI</td>
                <td className="amount">{fmt2(v.fdr)}</td>
              </tr>
              <tr className="group">
                <th colSpan={3}>Fonds de roulement lié à des dépenses futures, probables ou certaines</th>
              </tr>
              <tr>
                <td className="rep">1</td>
                <td>Provisions et dépréciations (15, 29, 39, 49, 59)</td>
                <td className="amount">{fmt2(v.provisions)}</td>
              </tr>
              <tr>
                <td className="rep">2</td>
                <td>Dépôts et cautions reçus compte 165</td>
                <td className="amount">{fmt2(v.cautions)}</td>
              </tr>
              <tr className="group">
                <th colSpan={3}>Fonds de roulement affecté à des activités particulières</th>
              </tr>
              <tr>
                <td className="rep">3</td>
                <td>Stocks</td>
                <td className="amount">{fmt2(v.stocks)}</td>
              </tr>
              <tr className="group">
                <th colSpan={3}>Éléments de fragilité potentielle du fonds de roulement</th>
              </tr>
              <tr>
                <td className="rep">4</td>
                <td>Créances douteuses : compte 416</td>
                <td className="amount">{fmt2(v.doubtful)}</td>
              </tr>
              <tr>
                <td className="rep">5</td>
                <td>
                  Créances supérieures à un an non provisionnées{' '}
                  <span className="red">(comptes 4111…4121…4631…XXXX…)</span>
                </td>
                <td className="amount">{fmt2(v.oldReceivables)}</td>
              </tr>
              <tr>
                <td className="rep">6</td>
                <td>Réserve de fonctionnement nécessaire à l’activité (si BFdR positif au dernier COFI)</td>
                <td className="amount">{fmt2(v.reserve)}</td>
              </tr>
              <tr className="group">
                <th colSpan={3}>Part du fonds de roulement déjà mobilisée</th>
              </tr>
              <tr>
                <td className="rep">7</td>
                <td>
                  Prélèvements sur FdR de l’exercice
                  <br />
                  <span className="note-inline">
                    Déjà votés : {fmt2(v.voted)} € — Prélèvement proposé : {fmt2(v.proposed)} €
                  </span>
                </td>
                <td className="amount">{fmt2(withdrawals)}</td>
              </tr>
              <tr className="group">
                <th colSpan={3}>Fonds de roulement disponible</th>
              </tr>
              <tr className="result">
                <td className="rep">B</td>
                <td>Fonds de roulement disponible (= A-1-2-3-4-5-6-7)</td>
                <td className="amount">{fmt2(available)}</td>
              </tr>
              <tr className="spacer">
                <td colSpan={3} />
              </tr>
              <tr className="result result-c">
                <td className="rep">C</td>
                <td>
                  Montant d’une journée de fonctionnement (classe 6 décaissable / 174)
                  <br />
                  <span className="note-inline">Classe 6 décaissable retenue : {fmt2(v.class6)} €</span>
                </td>
                <td className="amount">{fmt2(day)}</td>
              </tr>
              <tr className="spacer">
                <td colSpan={3} />
              </tr>
              <tr className="result result-d">
                <td className="rep">D</td>
                <td>Évaluation du FdR disponible en nombre de jours de fonctionnement (= B/C)</td>
                <td className="amount">{availableDays == null ? '—' : fmt2(availableDays)}</td>
              </tr>
              <tr>
                <td className="noborder" />
                <td className="noborder">
                  <span className="red">Rappel dernier COFI : Nombre de jours FdR = {fmt2(v.days)}</span>
                </td>
                <td className="noborder" />
              </tr>
            </tbody>
          </table>
          <div className="fdr-rules">
            Sont ainsi déduits du fonds de roulement net comptable (A) arrêté au 31 décembre :
            <ul>
              <li>les provisions (ligne 1) ;</li>
              <li>les cautions (ligne 2) ;</li>
              <li>les stocks (ligne 3) ;</li>
              <li>les créances douteuses (ligne 4) ;</li>
              <li>les créances non provisionnées de plus d’un an (ligne 5) selon état complémentaire justificatif ;</li>
              <li>
                une réserve de fonctionnement nécessaire à l’activité lorsque le BFdR est positif (ligne 6), charges
                nettes 60 à 65 exprimées en nombre de jours de fonctionnement, de l’ordre de 30 jours (délai global de
                paiement) ;
              </li>
              <li>
                les prélèvements sur FdR déjà votés au budget primitif ou lors de décisions budgétaires modificatives
                (ligne 7) ;
              </li>
              <li>la classe 6 décaissable, montant net des charges 60 à 65 sauf comptes 658.</li>
            </ul>
            <div>Le ratio D est complémentaire des trois indicateurs (FdR, BFdR et Trésorerie).</div>
          </div>
          <div className="fdr-recommendation">
            <strong>Préconisations :</strong>
            <div>{recommendation}</div>
          </div>
          <div className="fdr-footer-ref">
            (1) Préconisations du rapport 2016-071 « Évolution de la carte comptable : de la croisée des chemins à de
            nouveaux défis à relever », Mission IGAENR.
          </div>
        </main>
        <footer className="no-print">
          <button onClick={onClose}>Fermer</button>
          <button className="primary" onClick={() => window.print()}>
            <FileText size={15} /> Générer / imprimer l’Annexe III en PDF
          </button>
        </footer>
      </div>
    </div>
  );
}
