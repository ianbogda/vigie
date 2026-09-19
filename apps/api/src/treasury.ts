import { parse as parseCsv } from 'csv-parse/sync';
import type { Pool } from 'pg';

const clean=(v:unknown)=>{const s=String(v??'').trim();const m=s.match(/^=\("([\s\S]*)"\)$/);return m?m[1]:s};
const money=(v:unknown)=>{const n=Number(clean(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0};
const monthDate=(v:unknown)=>{const m=clean(v).match(/^(\d{2})\/(\d{4})$/);return m?`${m[2]}-${m[1]}-01`:null};
const value=(r:any,k:string)=>clean(Array.isArray(r[k])?r[k].at(-1):r[k]);
// Règle propre à l'adaptateur de l'export mensuel observé. Le modèle stocké reste générique.
const movementKind=(journal:string)=>journal.trim().toUpperCase()==='ZOUVER'?'OPENING':'PERIOD';

export function isTreasury5151Csv(buf:Buffer){
 const h=buf.toString('utf8',0,Math.min(buf.length,16000)).replace(/^\uFEFF/,'');
 return h.includes('Compte;Libellé du compte;Journal;Période;Cumul débit;Cumul crédit');
}
export function parseTreasury5151(buf:Buffer){
 const text=buf.toString('utf8').replace(/^\uFEFF/,'');
 const records:any[]=parseCsv(text,{columns:true,delimiter:';',bom:true,skip_empty_lines:true,relax_column_count:true,relax_quotes:true,trim:false,group_columns_by_name:true});
 const rows=records.slice(0,100000).map((r,i)=>{const account=value(r,'Compte').replace(/\s/g,''),period=value(r,'Période'),periodDate=monthDate(period),journal=value(r,'Journal');return {line:i+2,account,accountLabel:value(r,'Libellé du compte'),journal,period,periodDate,debit:money(value(r,'Cumul débit')),credit:money(value(r,'Cumul crédit')),entity:value(r,'Ets'),movementKind:movementKind(journal),raw:r}}).filter(x=>/^5151\d*$/.test(x.account)&&x.periodDate);
 if(!rows.length)throw new Error('Export 5151 reconnu mais aucune ligne 5151 exploitable.');
 const entities=[...new Set(rows.map(x=>x.entity).filter(Boolean))];if(entities.length>1)throw new Error('Export 5151 multi-établissements non pris en charge dans cette version.');
 const accounts=[...new Set(rows.map(x=>x.account))],dates=rows.map(x=>x.periodDate!).sort();
 return {type:'treasury5151',entity:entities[0]||'',establishment:entities[0]||'Établissement non renseigné',account:accounts.join(', '),snapshotDate:dates.at(-1)!,rows,sourceRows:records.length,sourceFormat:'opale-5151-monthly-summary'};
}
export async function treasuryContext(pool:Pool,snapshot:any){
 if(!snapshot)return null;
 const snapshots=(await pool.query(`select id,account,snapshot_date,source_format from treasury_snapshots where coalesce(nullif(opale_entity,''),establishment_name)=coalesce(nullif($1,''),$2) order by snapshot_date,created_at`,[snapshot.opale_entity,snapshot.establishment_name])).rows;
 const ids=snapshots.map((x:any)=>x.id);if(!ids.length)return null;
 const rows=(await pool.query(`select snapshot_id,line_no,period,period_date,journal,debit,credit,movement,movement_kind from treasury_movements where snapshot_id=any($1::bigint[]) order by period_date,line_no`,[ids])).rows;
 const byExercise=new Map<number,Map<string,any>>();
 for(const r of rows){
  const rawDate=r.period_date instanceof Date?r.period_date.toISOString().slice(0,10):String(r.period_date).slice(0,10),exercise=Number(rawDate.slice(0,4)),monthNo=Number(rawDate.slice(5,7));if(!exercise||!monthNo)continue;
  if(!byExercise.has(exercise))byExercise.set(exercise,new Map());const months=byExercise.get(exercise)!;
  const key=`${exercise}-${String(monthNo).padStart(2,'0')}`;
  const x=months.get(key)||{period:key,exercise,month:monthNo,debit:0,credit:0,movement:0,opening:0};const debit=Number(r.debit),credit=Number(r.credit),movement=debit-credit;
  if(String(r.journal||'').trim().toUpperCase()==='ZOUVER'||r.movement_kind==='OPENING')x.opening+=movement;else{x.debit+=debit;x.credit+=credit;x.movement+=movement}months.set(key,x);
 }
 const series=[...byExercise.entries()].sort(([a],[b])=>a-b).map(([exercise,months])=>{
  const points=[...months.values()].sort((a,b)=>a.month-b.month);const opening=points.reduce((sum,x)=>sum+x.opening,0);let balance=opening;
  for(const x of points){balance+=x.movement;x.balance=balance}
  return {exercise,openingBalance:opening,history:points,currentBalance:points.at(-1)?.balance??opening,minBalance:points.length?Math.min(...points.map(x=>x.balance)):opening,maxBalance:points.length?Math.max(...points.map(x=>x.balance)):opening};
 });
 const currentSeries=series.at(-1)||null,current=currentSeries?.history.at(-1)||null,previous=currentSeries?.history.at(-2)||null,signals:any[]=[];
 if(current&&current.balance<0)signals.push({code:'TRE-NEG',level:'alert',domain:'Trésorerie',processCode:'TRE',title:'Solde comptable 5151 négatif',detail:`Le solde comptable reconstitué ressort à ${current.balance.toFixed(2)} €.`,amount:current.balance,source:'Mouvements 5151 Op@le',condition:'Solde reconstitué < 0 €',interpretation:'Signal comptable à examiner ; il ne constitue pas un solde bancaire temps réel.'});
 if(current&&previous&&previous.balance>0&&current.balance<previous.balance*.7)signals.push({code:'TRE-DOWN',level:'watch',domain:'Trésorerie',processCode:'TRE',title:'Baisse mensuelle marquée de trésorerie',detail:`Le solde reconstitué baisse de ${((current.balance/previous.balance-1)*100).toFixed(1)} % sur un mois.`,amount:current.balance-previous.balance,source:'Mouvements 5151 Op@le',condition:'Baisse mensuelle > 30 %',interpretation:'Variation à contextualiser avec les encaissements et décaissements attendus.'});
 return {account:snapshot.account,sourceFormat:snapshot.source_format,snapshotDate:snapshot.snapshot_date,currentExercise:currentSeries?.exercise??null,openingBalance:currentSeries?.openingBalance??null,currentBalance:currentSeries?.currentBalance??null,currentMovement:current?.movement??null,minBalance:currentSeries?.minBalance??null,maxBalance:currentSeries?.maxBalance??null,history:currentSeries?.history||[],series,signals,warning:'Solde comptable reconstitué par exercice : ZOUVER fixe le solde au 1er janvier ; les autres écritures font varier le 5151 au débit (+) et au crédit (−).'};
}
