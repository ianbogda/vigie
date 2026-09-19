import { Database, Landmark, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Eple, TreasuryPoint, TreasurySeries } from '../types/dashboard';

const eur=(n?:number|null)=>n==null?'—':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const periodDate=(p?:string)=>{if(!p)return null;const raw=p.trim();let y:number,m:number;let match=raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);if(match){y=Number(match[1]);m=Number(match[2]);}else{match=raw.match(/^(\d{1,2})\/(\d{4})$/);if(!match)return null;m=Number(match[1]);y=Number(match[2]);}if(!Number.isInteger(y)||!Number.isInteger(m)||y<1900||y>2200||m<1||m>12)return null;const d=new Date(y,m-1,1);return Number.isNaN(d.getTime())?null:d};
const month=(p?:string)=>{const d=periodDate(p);return d?new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d):(p||'—')};
const shortMonth=(m:number)=>new Intl.DateTimeFormat('fr-FR',{month:'short'}).format(new Date(2020,m-1,1)).replace('.','');
const pct=(v:number)=>`${v>0?'+':''}${v.toFixed(1)} %`;

type ChartMode='EUR'|'INDEX';
function TreasuryChart({current,shadows,mode}:{current:TreasurySeries;shadows:TreasurySeries[];mode:ChartMode}){
 const all=[current,...shadows],w=1000,h=310,padX=62,padTop=28,padBottom=50;
 const val=(s:TreasurySeries,p:TreasuryPoint)=>mode==='EUR'?p.balance:(s.openingBalance?p.balance/s.openingBalance*100:100);
 const values=all.flatMap(s=>s.history.map(p=>val(s,p))).filter(Number.isFinite);if(!values.length)return <div className="treasury-chart-empty">Historique insuffisant pour tracer la trajectoire.</div>;
 const rawMin=Math.min(...values),rawMax=Math.max(...values),range=Math.max(rawMax-rawMin,1),margin=range*.14,min=mode==='EUR'?Math.max(0,rawMin-margin):rawMin-margin,max=rawMax+margin,span=Math.max(max-min,1);
 const x=(m:number)=>padX+(m-1)*((w-padX*2)/11),y=(v:number)=>padTop+(max-v)/span*(h-padTop-padBottom),points=(s:TreasurySeries)=>s.history.map(p=>`${x(p.month||1)},${y(val(s,p))}`).join(' ');
 return <div className="treasury-chart-wrap"><svg className="treasury-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Comparaison des trajectoires annuelles du compte 5151">
  {[0,.25,.5,.75,1].map(t=>{const yy=padTop+t*(h-padTop-padBottom),v=max-t*span;return <g key={t}><line x1={padX} y1={yy} x2={w-padX} y2={yy} className="treasury-grid"/><text x={padX-10} y={yy+4} className="treasury-axis-y">{mode==='EUR'?new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(v):`${v.toFixed(0)}`}</text></g>})}
  {shadows.map((s,i)=><polyline key={s.exercise} points={points(s)} className={`treasury-line shadow shadow-${i}`}/>) }
  <polyline points={points(current)} className="treasury-line"/>
  {current.history.map(p=><circle key={p.period} cx={x(p.month||1)} cy={y(val(current,p))} r="4" className="treasury-point"/>)}
  {Array.from({length:12},(_,i)=><text key={i} x={x(i+1)} y={h-18} className="treasury-axis-x">{shortMonth(i+1)}</text>)}
 </svg><div className="treasury-legend"><span><i className="current"/> {current.exercise}</span>{shadows.map((s,i)=><span key={s.exercise}><i className={`shadow-${i}`}/> {s.exercise}</span>)}</div></div>
}

function TreasuryView({current}:{current:Eple}){
 const t=current.treasury,series=useMemo(()=>[...(t?.series||[])].sort((a,b)=>b.exercise-a.exercise),[t?.series]);const currentSeries=series[0];
 const [mode,setMode]=useState<ChartMode>('EUR');const [shadowYears,setShadowYears]=useState<number[]>([]);
 if(!t||!currentSeries)return <div className="page treasury-page"><div className="treasury-head"><span>TRÉSORERIE</span><h2><Landmark size={24}/>Suivi du compte 5151</h2></div><div className="empty-domain"><Database size={34}/><h3>Aucune donnée 5151</h3><p>Utilise « Importer » puis sélectionne l'export CSV Op@le du compte 5151.</p></div></div>;
 const h=currentSeries.history,last=h.at(-1),previous=h.at(-2),variation=last?.movement??null,minPoint=h.length?h.reduce((a,b)=>a.balance<=b.balance?a:b):null,maxPoint=h.length?h.reduce((a,b)=>a.balance>=b.balance?a:b):null,treasurySignals=current.signals.filter(s=>s.domain==='Trésorerie');
 const available=series.slice(1,4),shadows=available.filter(s=>shadowYears.includes(s.exercise));const sameMonth=shadows.map(s=>({s,p:s.history.find(p=>p.month===last?.month)})).filter(x=>x.p);
 const toggle=(y:number)=>setShadowYears(v=>v.includes(y)?v.filter(x=>x!==y):[...v,y]);
 return <div className="page treasury-page"><div className="treasury-head"><span>TRÉSORERIE</span><h2><Landmark size={24}/>Suivi du compte 5151</h2><p>{t.warning}</p></div>
  <div className="treasury-kpis"><div className="treasury-kpi"><WalletCards/><div><span>Solde 5151 estimé</span><b>{eur(currentSeries.currentBalance)}</b><small>{last?`au ${month(last.period)}`:''}</small></div></div><div className={`treasury-kpi ${variation!=null&&variation<0?'down':'up'}`}>{variation!=null&&variation<0?<TrendingDown/>:<TrendingUp/>}<div><span>Variation du mois</span><b>{variation!=null&&variation>0?'+':''}{eur(variation)}</b><small>débits − crédits, hors ZOUVER</small></div></div><div className="treasury-kpi low"><TrendingDown/><div><span>Plus bas observé</span><b>{eur(minPoint?.balance)}</b><small>{minPoint?month(minPoint.period):''}</small></div></div><div className="treasury-kpi high"><TrendingUp/><div><span>Plus haut observé</span><b>{eur(maxPoint?.balance)}</b><small>{maxPoint?month(maxPoint.period):''}</small></div></div></div>
  <section className="treasury-panel"><div className="treasury-chart-head"><div><h3>Évolution du 5151</h3><small>Exercice {currentSeries.exercise} · ZOUVER {eur(currentSeries.openingBalance)}</small></div><div className="treasury-controls"><div className="treasury-shadows"><span>Shadow :</span>{available.map(s=><button key={s.exercise} className={shadowYears.includes(s.exercise)?'active':''} onClick={()=>toggle(s.exercise)}>{s.exercise}</button>)}</div><div className="treasury-mode"><button className={mode==='EUR'?'active':''} onClick={()=>setMode('EUR')}>€</button><button className={mode==='INDEX'?'active':''} onClick={()=>setMode('INDEX')}>Base 100</button></div></div></div><TreasuryChart current={currentSeries} shadows={shadows} mode={mode}/>{sameMonth.length>0&&<div className="treasury-comparison">{sameMonth.map(({s,p})=>{const d=currentSeries.currentBalance-(p?.balance||0),r=p?.balance?d/p.balance*100:0;return <span key={s.exercise}>Même mois {s.exercise} : <b>{eur(p?.balance)}</b> · écart <b className={d<0?'negative':'positive'}>{d>0?'+':''}{eur(d)} ({pct(r)})</b></span>})}</div>}</section>
  <div className="treasury-bottom"><section><h3>Analyse rapide</h3><p>Solde d'ouverture ZOUVER : <b>{eur(currentSeries.openingBalance)}</b>.</p><p>Variation du dernier mois : <b>{variation!=null&&variation>0?'+':''}{eur(variation)}</b>.</p><p>Amplitude observée : {eur((maxPoint?.balance??0)-(minPoint?.balance??0))}.</p></section><section><h3>Signaux Vigie</h3>{treasurySignals.length?treasurySignals.map(s=><p key={s.code} className={`treasury-signal ${s.level}`}><b>{s.title}</b><br/><span>{s.detail}</span></p>):<p className="treasury-ok">Aucun signal Trésorerie en cours.</p>}</section><section><h3>Données sources</h3><dl><dt>Compte</dt><dd>{t.account||'5151'}</dd><dt>Exercices disponibles</dt><dd>{series.map(s=>s.exercise).join(', ')}</dd><dt>Dernière période</dt><dd>{last?month(last.period):'—'}</dd><dt>Format</dt><dd>{t.sourceFormat||'Export Op@le 5151'}</dd></dl></section></div>
 </div>
}
export function DomainView({title,current}:{title:string;current:Eple|null}){if(title==='Trésorerie'&&current)return <TreasuryView current={current}/>;return <div className="page"><div className="empty-domain"><Database size={34}/><span>VUE MÉTIER</span><h2>{title}</h2><p>{current?`Périmètre : ${current.name}.`:'Vue agence.'} Cette vue utilisera le même moteur explicable que le cockpit, sans dupliquer les données.</p></div></div>}
