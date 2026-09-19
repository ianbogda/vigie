import { AlertTriangle, Building2, CheckCircle2, ChevronRight, CircleAlert, CircleDashed, Coins, Landmark, ReceiptText, ShieldCheck } from 'lucide-react';
import type { Dashboard, Eple, State } from '../types/dashboard';
import { eur, pct } from '../lib/format';

const LABELS:Record<string,string>={budget:'Budget',financial:'Analyse financière',suppliers:'Fournisseurs',accounting:'Comptabilité générale',treasury:'Trésorerie',clients:'Clients'};
function tone(s:State){return s==='alert'?'alert':s==='watch'?'watch':s==='missing'?'missing':'ok'}
function StateIcon({state}:{state:State}){return state==='alert'?<CircleAlert/>:state==='watch'?<AlertTriangle/>:state==='missing'?<CircleDashed/>:<CheckCircle2/>}
export function AgencyView({dash,onSelect}:{dash:Dashboard;onSelect:(id:string)=>void}){
 const all=dash.establishments||[];
 const domains=Array.from(new Set(all.flatMap(e=>Object.keys(e.states||{}))));
 const signalCount=all.reduce((n,e)=>n+(e.signals?.length||0),0);
 const alerts=all.reduce((n,e)=>n+(e.signals||[]).filter(s=>s.level==='alert').length,0);
 const watches=all.reduce((n,e)=>n+(e.signals||[]).filter(s=>s.level==='watch').length,0);
 const budgeted=all.filter(e=>e.budgetMetrics?.budget!=null);
 const totalBudget=budgeted.reduce((n,e)=>n+Number(e.budgetMetrics?.budget||0),0);
 const totalCommitted=budgeted.reduce((n,e)=>n+Number(e.budgetMetrics?.committed||0),0);
 const treasury=all.filter(e=>e.treasury?.currentBalance!=null);
 const totalTreasury=treasury.reduce((n,e)=>n+Number(e.treasury?.currentBalance||0),0);
 const fdr=all.filter(e=>e.fdrHistory?.[0]?.amount!=null);
 const totalFdr=fdr.reduce((n,e)=>n+Number(e.fdrHistory?.[0]?.amount||0),0);
 const ranked=[...all].sort((a,b)=>score(b)-score(a));
 return <div className="agency-page fade-in">
  <div className="agency-head"><div><span>VUE AGENCE</span><h2>Pilotage du groupement comptable</h2><p>Lecture consolidée, puis accès immédiat aux EPLE qui nécessitent une attention.</p></div><div className="agency-scope"><Building2/><b>{all.length}</b><small>établissements suivis</small></div></div>
  <section className="agency-kpis">
   <article><Coins/><span>Budget suivi</span><b>{eur(totalBudget)}</b><small>{budgeted.length}/{all.length} EPLE alimentés</small></article>
   <article><ReceiptText/><span>Engagement agrégé</span><b>{totalBudget?pct(totalCommitted/totalBudget):'—'}</b><small>{eur(totalCommitted)} engagés</small></article>
   <article><Landmark/><span>Trésorerie connue</span><b>{treasury.length?eur(totalTreasury):'—'}</b><small>{treasury.length}/{all.length} EPLE avec 5151</small></article>
   <article><ShieldCheck/><span>Fonds de roulement</span><b>{fdr.length?eur(totalFdr):'—'}</b><small>{fdr.length}/{all.length} EPLE alimentés</small></article>
   <article className={alerts?'agency-alert-kpi':''}><AlertTriangle/><span>Signaux à examiner</span><b>{alerts+ watches}</b><small>{alerts} alerte(s) · {watches} vigilance(s) · {signalCount} au total</small></article>
  </section>
  <section className="agency-grid">
   <article className="panel agency-matrix"><div className="panel-title"><div><h3>État du portefeuille</h3><p>Une ligne par EPLE, une lecture commune des domaines métier.</p></div></div><div className="agency-table-scroll"><table><thead><tr><th>Établissement</th>{domains.map(d=><th key={d}>{LABELS[d]||d}</th>)}<th>Signaux</th><th/></tr></thead><tbody>{ranked.map(e=><tr key={e.id}><td><b>{e.name}</b><small>{e.uai||'UAI non renseigné'}</small></td>{domains.map(d=>{const s=(e.states?.[d]||'missing') as State;return <td key={d}><span className={`agency-state ${tone(s)}`} title={s}><StateIcon state={s}/></span></td>})}<td><b className={e.signals?.some(s=>s.level==='alert')?'signal-count alert':''}>{e.signals?.length||0}</b></td><td><button onClick={()=>onSelect(e.id)} aria-label={`Ouvrir ${e.name}`}><ChevronRight/></button></td></tr>)}</tbody></table></div></article>
   <article className="panel agency-attention"><div className="panel-title"><div><h3>À regarder en priorité</h3><p>EPLE classés par intensité des signaux, sans créer de score métier.</p></div></div><div className="attention-list">{ranked.filter(e=>score(e)>0).slice(0,7).map(e=><button key={e.id} onClick={()=>onSelect(e.id)}><span className={`attention-dot ${e.signals?.some(s=>s.level==='alert')?'alert':'watch'}`}/><div><b>{e.name}</b><small>{summary(e)}</small></div><ChevronRight/></button>)}{ranked.every(e=>score(e)===0)&&<div className="agency-empty"><CheckCircle2/><b>Aucun signal prioritaire</b><small>Les données disponibles ne font ressortir aucune alerte.</small></div>}</div></article>
  </section>
 </div>
}
function score(e:Eple){return (e.signals||[]).reduce((n,s)=>n+(s.level==='alert'?2:s.level==='watch'?1:0),0)}
function summary(e:Eple){const a=(e.signals||[]).filter(s=>s.level==='alert').length,w=(e.signals||[]).filter(s=>s.level==='watch').length;return `${a} alerte${a>1?'s':''} · ${w} vigilance${w>1?'s':''}`}
