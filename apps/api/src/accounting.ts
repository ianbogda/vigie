import { parse as parseCsv } from 'csv-parse/sync';

const clean=(v:unknown)=>{const s=String(v??'').trim();const m=s.match(/^=\("([\s\S]*)"\)$/);return m?m[1]:s};
const money=(v:unknown)=>{const n=Number(clean(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0};
const monthDate=(v:unknown)=>{const m=clean(v).match(/^(\d{2})\/(\d{4})$/);return m?`${m[2]}-${m[1]}-01`:null};
const value=(r:any,k:string)=>clean(Array.isArray(r[k])?r[k].at(-1):r[k]);
const movementKind=(journal:string)=>journal.trim().toUpperCase()==='ZOUVER'?'OPENING':'PERIOD';

export function isAccountingCsv(buf:Buffer){
 const h=buf.toString('utf8',0,Math.min(buf.length,16000)).replace(/^\uFEFF/,'');
 return h.includes('Compte;Libellé du compte;Journal;Période;Cumul débit;Cumul crédit');
}
export function parseAccountingCsv(buf:Buffer,contextEntity:string){
 const records:any[]=parseCsv(buf.toString('utf8').replace(/^\uFEFF/,''),{columns:true,delimiter:';',bom:true,skip_empty_lines:true,relax_column_count:true,relax_quotes:true,trim:false,group_columns_by_name:true});
 const parsed=records.slice(0,100000).map((r,i)=>{const account=value(r,'Compte').replace(/\s/g,''),period=value(r,'Période'),periodDate=monthDate(period),journal=value(r,'Journal'),entity=value(r,'Ets');return {line:i+2,entity,account,accountLabel:value(r,'Libellé du compte'),journal,period,periodDate,debit:money(value(r,'Cumul débit')),credit:money(value(r,'Cumul crédit')),movementKind:movementKind(journal),raw:r}}).filter(x=>/^[1-8]\d*$/.test(x.account)&&x.periodDate);
 if(!parsed.length)throw new Error('Export comptable reconnu mais aucune ligne de classe 1 à 8 exploitable.');
 const entities=[...new Set(parsed.map(x=>x.entity).filter(Boolean))];
 if(entities.length>1)throw new Error(`Le fichier contient plusieurs ETS (${entities.join(', ')}). Un import comptable doit être rattaché à un seul ETS.`);
 if(!contextEntity)throw new Error('Le contexte ETS est obligatoire pour un import comptable.');
 const fileEntity=entities[0]||null;
 if(fileEntity&&fileEntity!==contextEntity)throw new Error(`ETS incohérent : le fichier contient ${fileEntity}, alors que l’import est contextualisé sur ${contextEntity}.`);
 const effectiveEntity=contextEntity;
 const dates=parsed.map(x=>x.periodDate!).sort();
 return {entity:effectiveEntity,fileEntity,entityFromContext:!fileEntity,rows:parsed,sourceRows:records.length,periodFrom:dates[0],periodTo:dates.at(-1)!,sourceFormat:'opale-accounting-monthly-summary'};
}
