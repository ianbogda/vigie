import { Database, Landmark, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import type { Eple, TreasuryPoint } from '../types/dashboard';

const eur=(n?:number|null)=>n==null?'—':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const month=(p?:string)=>{if(!p)return '—';const [y,m]=p.split('-');return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(Number(y),Number(m)-1,1))};
const shortMonth=(p:string)=>new Intl.DateTimeFormat('fr-FR',{month:'short'}).format(new Date(Number(p.slice(0,4)),Number(p.slice(5,7))-1,1)).replace('.','');
function TreasuryChart({history}:{history:TreasuryPoint[]}){
 if(!history.length)return <div className="treasury-chart-empty">Historique insuffisant pour tracer la trajectoire.</div>;
 const w=1000,h=300,padX=56,padTop=24,padBottom=46,values=history.map(x=>x.balance),rawMin=Math.min(...values),rawMax=Math.max(...values),range=Math.max(rawMax-rawMin,1),margin=range*.16,min=Math.max(0,rawMin-margin),max=rawMax+margin,span=Math.max(max-min,1);
 const x=(i:number)=>history.length===1?w/2:padX+i*((w-padX*2)/(history.length-1));
 const y=(v:number)=>padTop+(max-v)/span*(h-padTop-padBottom);
 const points=history.map((p,i)=>`${x(i)},${y(p.balance)}`).join(' '),area=`${padX},${h-padBottom} ${points} ${x(history.length-1)},${h-padBottom}`;
 const minIndex=values.indexOf(rawMin),maxIndex=values.indexOf(rawMax);
 return <div className="treasury-chart-wrap"><svg className="treasury-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Évolution mensuelle du solde reconstitué du compte 5151">
  {[0,.25,.5,.75,1].map(t=>{const yy=padTop+t*(h-padTop-padBottom),v=max-t*span;return <g key={t}><line x1={padX} y1={yy} x2={w-padX} y2={yy} className="treasury-grid"/><text x={padX-10} y={yy+4} className="treasury-axis-y">{new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(v)}</text></g>})}
  <polygon points={area} className="treasury-area"/><polyline points={points} className="treasury-line"/>
  {history.map((p,i)=><g key={p.period}><circle cx={x(i)} cy={y(p.balance)} r={i===minIndex||i===maxIndex?5:3.5} className={i===minIndex?'treasury-point low':i===maxIndex?'treasury-point high':'treasury-point'}/><text x={x(i)} y={h-18} className="treasury-axis-x">{shortMonth(p.period)}</text></g>)}
 </svg></div>
}
export function DomainView({title,current}:{title:string;current:Eple|null}){
 if(title==='Trésorerie'&&current){const t=current.treasury,h=t?.history||[],last=h.at(-1),previous=h.at(-2),variation=last&&previous?last.balance-previous.balance:t?.currentMovement??null,minPoint=h.length?h.reduce((a,b)=>a.balance<=b.balance?a:b):null,maxPoint=h.length?h.reduce((a,b)=>a.balance>=b.balance?a:b):null,treasurySignals=current.signals.filter(s=>s.domain==='Trésorerie');
  return <div className="page treasury-page"><div className="treasury-head"><span>TRÉSORERIE</span><h2><Landmark size={24}/>Suivi du compte 5151</h2><p>{t?.warning||'Solde comptable reconstitué à partir des exports Op@le du compte 5151.'}</p></div>
  {!t?<div className="empty-domain"><Database size={34}/><h3>Aucune donnée 5151</h3><p>Utilise « Importer » puis sélectionne l'export CSV Op@le du compte 5151.</p></div>:<>
   <div className="treasury-kpis">
    <div className="treasury-kpi"><WalletCards/><div><span>Solde 5151 estimé</span><b>{eur(t.currentBalance)}</b><small>{last?`au ${month(last.period)}`:''}</small></div></div>
    <div className={`treasury-kpi ${variation!=null&&variation<0?'down':'up'}`}>{variation!=null&&variation<0?<TrendingDown/>:<TrendingUp/>}<div><span>Variation du mois</span><b>{variation!=null&&variation>0?'+':''}{eur(variation)}</b><small>{previous?`par rapport à ${month(previous.period)}`:''}</small></div></div>
    <div className="treasury-kpi low"><TrendingDown/><div><span>Plus bas observé</span><b>{eur(minPoint?.balance??t.minBalance)}</b><small>{minPoint?month(minPoint.period):''}</small></div></div>
    <div className="treasury-kpi high"><TrendingUp/><div><span>Plus haut observé</span><b>{eur(maxPoint?.balance??t.maxBalance)}</b><small>{maxPoint?month(maxPoint.period):''}</small></div></div>
   </div>
   <section className="treasury-panel"><h3>Évolution du 5151</h3><TreasuryChart history={h}/></section>
   <div className="treasury-bottom"><section><h3>Analyse rapide</h3><p>Solde estimé : <b>{eur(t.currentBalance)}</b>.</p><p>{variation==null?'Variation mensuelle indisponible.':`Variation du dernier mois : ${variation>0?'+':''}${eur(variation)}.`}</p><p>Amplitude observée : {eur((maxPoint?.balance??0)-(minPoint?.balance??0))}.</p></section><section><h3>Signaux Vigie</h3>{treasurySignals.length?treasurySignals.map(s=><p key={s.code} className={`treasury-signal ${s.level}`}><b>{s.title}</b><br/><span>{s.detail}</span></p>):<p className="treasury-ok">Aucun signal Trésorerie en cours.</p>}</section><section><h3>Données sources</h3><dl><dt>Compte</dt><dd>{t.account||'5151'}</dd><dt>Dernière période</dt><dd>{last?month(last.period):'—'}</dd><dt>Périodes disponibles</dt><dd>{h.length}</dd><dt>Format</dt><dd>{t.sourceFormat||'Export Op@le 5151'}</dd></dl></section></div>
  </>}</div>
 }
 return <div className="page"><div className="empty-domain"><Database size={34}/><span>VUE MÉTIER</span><h2>{title}</h2><p>{current?`Périmètre : ${current.name}.`:'Vue agence.'} Cette vue utilisera le même moteur explicable que le cockpit, sans dupliquer les données.</p></div></div>
}
