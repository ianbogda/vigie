import { Database, Landmark } from 'lucide-react';
import type { Eple } from '../types/dashboard';
const eur=(n?:number|null)=>n==null?'—':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);
export function DomainView({title,current}:{title:string;current:Eple|null}){
 if(title==='Trésorerie'&&current){const t=current.treasury,h=t?.history||[];
  return <div className="page"><div className="treasury-head"><span>TRÉSORERIE · COMPTE 5151</span><h2><Landmark size={24}/>{current.name}</h2><p>{t?.warning||'Importe les mouvements du compte 5151 pour reconstituer la trajectoire comptable.'}</p></div>
  {!t?<div className="empty-domain"><Database size={34}/><h3>Aucune donnée 5151</h3><p>Utilise « Importer » puis sélectionne l'export CSV Op@le du compte 5151.</p></div>:<>
   <div className="treasury-kpis"><div><span>Solde reconstitué</span><b>{eur(t.currentBalance)}</b></div><div><span>Mouvement dernière période</span><b>{eur(t.currentMovement)}</b></div><div><span>Point bas</span><b>{eur(t.minBalance)}</b></div><div><span>Point haut</span><b>{eur(t.maxBalance)}</b></div></div>
   <div className="treasury-table"><div className="treasury-row head"><span>Période</span><span>Débits</span><span>Crédits</span><span>Mouvement</span><span>Solde reconstitué</span></div>{h.map(x=><div className="treasury-row" key={x.period}><span>{x.period}</span><span>{eur(x.debit)}</span><span>{eur(x.credit)}</span><span>{eur(x.movement)}</span><b>{eur(x.balance)}</b></div>)}</div>
  </>}</div>
 }
 return <div className="page"><div className="empty-domain"><Database size={34}/><span>VUE MÉTIER</span><h2>{title}</h2><p>{current?`Périmètre : ${current.name}.`:'Vue agence.'} Cette vue utilisera le même moteur explicable que le cockpit, sans dupliquer les données.</p></div></div>
}
