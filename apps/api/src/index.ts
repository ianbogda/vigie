import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import pg from 'pg';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';

const { Pool } = pg;
const app = Fastify({ logger: true });
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_SHEETS = 20;
const VERSION = '0.0.9';

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://vigie:vigie@127.0.0.1:5432/vigie' });

const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function pick(row: Record<string, unknown>, names: string[]) {
  const map = Object.fromEntries(Object.keys(row).map(k => [norm(k), k]));
  for (const n of names) { const k = map[norm(n)]; if (k) return row[k]; }
  return undefined;
}
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? '';
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map(x => x.text ?? '').join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('error' in v) return String(v.error);
  }
  return String(v);
}
function rowsToObjects(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error('Le fichier ne contient aucune ligne exploitable.');
  const headers = matrix[0].map(v => String(v ?? '').trim());
  return matrix.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, values[i] ?? ''])));
}
function decodeLis(buf: Buffer) {
  // Les exports .lis observés sont du JSON-like Op@le encodé Windows-1252.
  // Certains intitulés contiennent des guillemets non échappés : on ne dépend donc
  // volontairement pas de JSON.parse pour extraire les objets de comptes.
  const utf = buf.toString('utf8');
  return utf.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : utf;
}
function lisString(objectText: string, key: string) {
  const marker = `"${key}":`;
  const pos = objectText.indexOf(marker);
  if (pos < 0) return '';
  let i = pos + marker.length;
  while (/\s/.test(objectText[i] || '')) i++;
  if (objectText[i] !== '"') return '';
  i++;
  const endMarkers = ['priorDebit','priorCredit','periodDebit','periodCredit','balanceDebit','balanceCredit'];
  let end = objectText.length;
  for (const next of endMarkers) {
    const p = objectText.indexOf(`, "${next}":`, i);
    if (p >= 0 && p < end) end = p;
  }
  let value = objectText.slice(i, end).trim();
  if (value.endsWith('"')) value = value.slice(0, -1);
  return value.replace(/\\"/g, '"');
}
function lisNumber(objectText: string, key: string) {
  const m = objectText.match(new RegExp(`"${key}"\\s*:\\s*(-?[0-9]+(?:[.,][0-9]+)?)`));
  return m ? num(m[1]) : 0;
}
function parseLis(buf: Buffer) {
  const text = decodeLis(buf);
  // L'extension .lis est utilisée par Op@le pour plusieurs types d'exports.
  // Vigie n'accepte ici que la balance générale native.
  if (!text.includes('entitiesTrialBalance') || !text.includes('accountsTrialBalance')) {
    if (/^DATASHEET=/m.test(text) || /^DATASEPCHAR=/m.test(text)) {
      throw new Error("Fichier .lis Op@le reconnu, mais ce n'est pas une balance générale. Exportez la balance générale (entitiesTrialBalance/accountsTrialBalance).");
    }
    throw new Error("Fichier .lis non reconnu comme balance générale Op@le.");
  }
  const entity = text.match(/"entity"\s*:\s*"([^"]+)"/)?.[1] || '';
  const entityLabel = text.match(/"entityLabel"\s*:\s*"([^"]+)"/)?.[1] || '';
  const objects = text.match(/\{\s*"account"\s*:\s*"[^"]+"[\s\S]*?\}(?=\s*,|\s*\])/g) || [];
  const rows = objects.map((o, i) => {
    const account = o.match(/"account"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\s/g, '') || '';
    const label = lisString(o, 'accountTitle');
    const priorDebit = lisNumber(o, 'priorDebit');
    const priorCredit = lisNumber(o, 'priorCredit');
    const periodDebit = lisNumber(o, 'periodDebit');
    const periodCredit = lisNumber(o, 'periodCredit');
    const balanceDebit = lisNumber(o, 'balanceDebit');
    const balanceCredit = lisNumber(o, 'balanceCredit');
    return {line:i+1, account, label, priorDebit, priorCredit, periodDebit, periodCredit, debit:balanceDebit, credit:balanceCredit, net:balanceDebit-balanceCredit};
  }).filter(x => /^\d{2,}/.test(x.account));
  if (!rows.length) throw new Error('Export .lis non reconnu : aucune ligne de balance Op@le détectée.');
  return {sheet:'Op@le .lis', sourceRows:objects.length, rows, entity, entityLabel, format:'lis'};
}
async function parseInput(buf: Buffer, filename: string) {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'lis') return parseLis(buf);
  if (ext === 'xls') throw new Error('Le format .xls n’est pas accepté. Utilisez de préférence l’export Op@le .lis, ou enregistrez le fichier en .xlsx/.csv.');
  if (!['xlsx', 'csv'].includes(ext || '')) throw new Error('Format non accepté. Format recommandé : .lis Op@le. Formats compatibles : .xlsx et .csv.');
  let sheet = 'CSV'; let rawRows: Record<string, unknown>[] = [];
  if (ext === 'csv') {
    rawRows = parseCsv(buf, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true });
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    if (wb.worksheets.length > MAX_SHEETS) throw new Error(`Classeur refusé : plus de ${MAX_SHEETS} feuilles.`);
    const ws = wb.worksheets.find(w => w.actualRowCount > 1) || wb.worksheets[0];
    if (!ws) throw new Error('Le classeur ne contient aucune feuille exploitable.');
    sheet = ws.name;
    const matrix: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, row => matrix.push((row.values as ExcelJS.CellValue[]).slice(1).map(cellValue)));
    rawRows = rowsToObjects(matrix);
  }
  if (rawRows.length > MAX_ROWS) throw new Error(`Fichier refusé : plus de ${MAX_ROWS.toLocaleString('fr-FR')} lignes.`);
  if (!rawRows.length) throw new Error('Le fichier ne contient aucune ligne exploitable.');
  const parsed = rawRows.map((r, i) => {
    const account = String(pick(r, ['compte','numero compte','n° compte','num compte','compte general']) ?? '').replace(/\s/g, '');
    const label = String(pick(r, ['libelle','libellé','libelle compte','intitule','intitulé']) ?? '');
    let debit = num(pick(r, ['solde debiteur','solde débiteur','debit','débit']));
    let credit = num(pick(r, ['solde crediteur','solde créditeur','credit','crédit']));
    const balance = pick(r, ['solde','solde final']);
    if (balance !== undefined && !debit && !credit) { const b = num(balance); debit = Math.max(b, 0); credit = Math.max(-b, 0); }
    return { line:i+2, account, label, priorDebit:0, priorCredit:0, periodDebit:0, periodCredit:0, debit, credit, net:debit-credit };
  }).filter(x => /^\d{2,}/.test(x.account));
  if (!parsed.length) throw new Error('Colonnes non reconnues. Utilisez de préférence l’export natif Op@le .lis.');
  return {sheet, sourceRows:rawRows.length, rows:parsed, entity:'', entityLabel:'', format:ext};
}

function parseFrDate(v: unknown) {
  const x=String(v??'').trim(); if(!x)return null;
  const m=x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:null;
}
function cleanOpaleCsv(v: unknown) {
  let x=String(v??'').trim(); const m=x.match(/^=\("([\s\S]*)"\)$/); if(m)x=m[1]; return x;
}
function parseBudgetLis(buf: Buffer) {
  const text=decodeLis(buf);
  if(!/^DATASHEET=Donnees/m.test(text) || !text.includes(';Budget;') || !text.includes(';Engag')) throw new Error("Ce .lis n'est pas un export Budget Op@le reconnu.");
  const lines=text.split(/\r?\n/).filter(x=>x && !/^(DATASHEET|DATASEPCHAR|ROWMODEL)=/.test(x));
  const rows:any[]=[]; let entity='', establishment='', snapshotDate='';
  for(let i=0;i<lines.length;i++){
    const c=lines[i].split(';');
    const marker=c.findIndex(x=>x==='Budget'); if(marker<5)continue;
    const meta=c.slice(marker-5,marker);
    const vals=c.slice(marker-18,marker-13).map(num);
    entity ||= String(meta[0]||c[0]||''); establishment ||= String(meta[1]||''); snapshotDate ||= parseFrDate(meta[4])||'';
    rows.push({line:i+1,dimensions:c.slice(0,Math.max(0,marker-18)),budget:vals[0],committed:vals[1],accounted:vals[2],inProgress:vals[3],available:vals[4]});
  }
  if(!rows.length)throw new Error('Export Budget Op@le reconnu mais aucune ligne budgétaire exploitable.');
  return {type:'budget',entity,establishment,snapshotDate,rows};
}
function parseClca(buf: Buffer) {
  const text=buf.toString('utf8').replace(/^\uFEFF/,'');
  const records:any[]=parseCsv(text,{columns:true,delimiter:';',bom:true,skip_empty_lines:true,relax_column_count:true,relax_quotes:true,trim:false,group_columns_by_name:true});
  if(!records.length)throw new Error('CLCA vide.');
  const keys=Object.keys(records[0]);
  if(!keys.includes('N° commande') || !keys.includes('Fournisseur') || !keys.includes('Prix commandé HT')) throw new Error("CSV non reconnu comme CLCA Op@le.");
  const val=(r:any,k:string)=>{const v=r[k];return cleanOpaleCsv(Array.isArray(v)?v[v.length-1]:v)};
  const rows=records.slice(0,MAX_ROWS).map((r:any,i:number)=>({line:i+2,establishment:val(r,'Etablissement'),orderNumber:val(r,'N° commande'),internalOrderNumber:val(r,'Numéro interne de commande'),subNumber:val(r,'Sous-numéro'),market:val(r,'Marché'),supplier:val(r,'Fournisseur'),orderDate:parseFrDate(val(r,'Date')),currency:val(r,'Devise'),orderLine:val(r,'Ligne'),stage:val(r,'Etape'),article:val(r,'Article'),articleLabel:val(r,'Libellé article'),quantity:num(val(r,'Quantité')),receivedQuantity:num(val(r,'Qté reçue')),receiptDate:parseFrDate(val(r,'Date de réception')),invoicedQuantity:num(val(r,'Qté facturée')),warehouse:val(r,'Dépôt'),expectedDeliveryDate:parseFrDate(val(r,'Date livraison prévue')),purchaseMode:val(r,"Mode d'achat"),receiptBalanceQuantity:num(val(r,'Qté solde réception')),invoiceBalanceQuantity:num(val(r,'Qté solde facture')),orderedPrice:num(val(r,'Prix commandé HT')),receivedPrice:num(val(r,'Prix réceptionné')),invoicePrice:num(val(r,'Prix facture')),invoiceAmount:num(val(r,'Montant facture')),account:val(r,'Compte'),cgrA:val(r,'CGR A'),cgrB:val(r,'CGR B'),creator:val(r,'Créateur'),modifier:val(r,'Modificateur'),raw:r}));
  const establishment=rows.find(x=>x.establishment)?.establishment||'Établissement non renseigné';
  const dates=rows.map(x=>x.orderDate).filter(Boolean).sort();
  return {type:'clca',establishment,snapshotDate:new Date().toISOString().slice(0,10),rows,sourceRows:records.length,rejectedRows:Math.max(0,records.length-rows.length)};
}

function analyse(rows: any[]) {
  const alerts: any[] = [];
  const add = (code:string, level:string, title:string, detail:string, account:string, amount:number) => alerts.push({code,level,title,detail,account,amount});
  for (const r of rows) {
    const a=r.account, abs=Math.abs(r.net); if(abs<0.005) continue;
    if (/^(471|472)/.test(a)) add('CG-ATTENTE','watch','Compte d’attente non soldé',`${a} ${r.label} présente un solde de ${r.net.toFixed(2)} € à examiner.`,a,r.net);
    if (/^585/.test(a)) add('CG-585','alert','Compte 585 non soldé',`Le compte ${a} présente un solde de ${r.net.toFixed(2)} €.`,a,r.net);
    if (/^(401|404)/.test(a) && r.net>0) add('CG-FOURN-SENS','watch','Solde fournisseur de sens inhabituel',`Le compte ${a} présente un solde débiteur de ${r.net.toFixed(2)} €.`,a,r.net);
    if (/^(411|416)/.test(a) && r.net<0) add('CG-CLIENT-SENS','watch','Solde de créance de sens inhabituel',`Le compte ${a} présente un solde créditeur de ${Math.abs(r.net).toFixed(2)} €.`,a,r.net);
  }
  return alerts.sort((a,b)=>(a.level==='alert'?0:1)-(b.level==='alert'?0:1)||Math.abs(b.amount)-Math.abs(a.amount));
}
app.get('/health',()=>({ok:true,version:VERSION}));

app.get('/api/imports',async()=>({
 balances:(await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,created_at from balance_snapshots order by created_at desc limit 20')).rows,
 budgets:(await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,created_at from budget_snapshots order by created_at desc limit 20')).rows,
 purchases:(await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,rejected_row_count,created_at from purchase_snapshots order by created_at desc limit 20')).rows
}));
app.post('/api/import/opale',async(req:any,reply:any)=>{try{
 const file=await req.file(); if(!file)return reply.code(400).send({error:'Fichier manquant'}); const buf=await file.toBuffer(); const name=file.filename.toLowerCase(); const client=await pool.connect();
 try{
  if(name.endsWith('.lis') && decodeLis(buf).includes('entitiesTrialBalance')){const p=parseLis(buf); const alerts=analyse(p.rows); await client.query('begin'); const establishment=p.entityLabel||p.entity||'Établissement non renseigné'; const s=(await client.query('insert into balance_snapshots(establishment_name,snapshot_date,source_filename,sheet_name,row_count,source_format,opale_entity,opale_entity_label) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[establishment,new Date().toISOString().slice(0,10),file.filename,p.sheet,p.rows.length,p.format,p.entity,p.entityLabel])).rows[0]; for(const r of p.rows)await client.query('insert into balance_lines(snapshot_id,line_no,account,label,prior_debit,prior_credit,period_debit,period_credit,debit,credit,net) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[s.id,r.line,r.account,r.label,r.priorDebit,r.priorCredit,r.periodDebit,r.periodCredit,r.debit,r.credit,r.net]); for(const a of alerts)await client.query('insert into accounting_alerts(snapshot_id,rule_code,severity,title,detail,account,amount) values($1,$2,$3,$4,$5,$6,$7)',[s.id,a.code,a.level,a.title,a.detail,a.account,a.amount]); await client.query('commit'); return {ok:true,type:'balance',snapshot:s,control:{sourceRows:p.sourceRows,importedRows:p.rows.length,rejectedRows:p.sourceRows-p.rows.length},alerts}}
  if(name.endsWith('.lis') && /^DATASHEET=Donnees/m.test(decodeLis(buf))){const p=parseBudgetLis(buf); await client.query('begin'); const s=(await client.query('insert into budget_snapshots(establishment_name,opale_entity,snapshot_date,source_filename,row_count) values($1,$2,$3,$4,$5) returning *',[p.establishment||p.entity,p.entity,p.snapshotDate||new Date().toISOString().slice(0,10),file.filename,p.rows.length])).rows[0]; for(const r of p.rows)await client.query('insert into budget_lines(snapshot_id,line_no,raw_dimensions,budget,committed,accounted,in_progress,available) values($1,$2,$3,$4,$5,$6,$7,$8)',[s.id,r.line,JSON.stringify(r.dimensions),r.budget,r.committed,r.accounted,r.inProgress,r.available]); await client.query('commit'); return {ok:true,type:'budget',snapshot:s,control:{importedRows:p.rows.length}}}
  if(name.endsWith('.csv')){const p=parseClca(buf); await client.query('begin'); const s=(await client.query('insert into purchase_snapshots(establishment_name,snapshot_date,source_filename,row_count,rejected_row_count) values($1,$2,$3,$4,$5) returning *',[p.establishment,p.snapshotDate,file.filename,p.rows.length,p.rejectedRows])).rows[0]; for(const r of p.rows)await client.query('insert into purchase_lines(snapshot_id,line_no,establishment,order_number,internal_order_number,sub_number,market,supplier,order_date,currency,order_line,stage,article,article_label,quantity,received_quantity,receipt_date,invoiced_quantity,warehouse,expected_delivery_date,purchase_mode,receipt_balance_quantity,invoice_balance_quantity,ordered_price,received_price,invoice_price,invoice_amount,account,cgr_a,cgr_b,creator,modifier,raw_data) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)',[s.id,r.line,r.establishment,r.orderNumber,r.internalOrderNumber,r.subNumber,r.market,r.supplier,r.orderDate,r.currency,r.orderLine,r.stage,r.article,r.articleLabel,r.quantity,r.receivedQuantity,r.receiptDate,r.invoicedQuantity,r.warehouse,r.expectedDeliveryDate,r.purchaseMode,r.receiptBalanceQuantity,r.invoiceBalanceQuantity,r.orderedPrice,r.receivedPrice,r.invoicePrice,r.invoiceAmount,r.account,r.cgrA,r.cgrB,r.creator,r.modifier,JSON.stringify(r.raw)]); await client.query('commit'); return {ok:true,type:'clca',snapshot:s,control:{sourceRows:p.sourceRows,importedRows:p.rows.length,rejectedRows:p.rejectedRows}}}
  return reply.code(400).send({error:'Type non reconnu ici. Pour une balance utilisez Import balance; Budget .lis et CLCA .csv sont détectés automatiquement.'});
 }catch(e){try{await client.query('rollback')}catch{};throw e}finally{client.release()}
}catch(e:any){req.log.error(e);return reply.code(400).send({error:e.message||'Import impossible'})}});

app.get('/api/snapshots',async()=>({snapshots:(await pool.query('select id, establishment_name, snapshot_date, source_filename, row_count, created_at from balance_snapshots order by snapshot_date desc, created_at desc limit 50')).rows}));
app.get('/api/snapshots/:id', async (req:any, reply) => {
  const snapshot=(await pool.query('select * from balance_snapshots where id=$1',[req.params.id])).rows[0];
  if(!snapshot) return reply.code(404).send({error:'Snapshot introuvable'});
  const alerts=(await pool.query("select * from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end, abs(amount) desc",[req.params.id])).rows;
  return {snapshot,alerts};
});
app.post('/api/import/balance',async(req:any,reply:any)=>{try{
  const file=await req.file(); if(!file)return reply.code(400).send({error:'Fichier manquant'});
  const fields:any=file.fields||{};
  const date=String(fields.snapshotDate?.value||new Date().toISOString().slice(0,10));
  const buf=await file.toBuffer(); const p=await parseInput(buf,file.filename);
  const establishment=String(fields.establishment?.value||p.entityLabel||'Établissement non renseigné');
  const alerts=analyse(p.rows); const client=await pool.connect();
  try{await client.query('begin'); const s=(await client.query('insert into balance_snapshots(establishment_name,snapshot_date,source_filename,sheet_name,row_count,source_format,opale_entity,opale_entity_label) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[establishment,date,file.filename,p.sheet,p.rows.length,p.format,p.entity,p.entityLabel])).rows[0];
    for(const r of p.rows)await client.query('insert into balance_lines(snapshot_id,line_no,account,label,prior_debit,prior_credit,period_debit,period_credit,debit,credit,net) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[s.id,r.line,r.account,r.label,r.priorDebit,r.priorCredit,r.periodDebit,r.periodCredit,r.debit,r.credit,r.net]);
    for(const a of alerts)await client.query('insert into accounting_alerts(snapshot_id,rule_code,severity,title,detail,account,amount) values($1,$2,$3,$4,$5,$6,$7)',[s.id,a.code,a.level,a.title,a.detail,a.account,a.amount]);
    await client.query('commit'); return {ok:true,snapshot:s,control:{sourceRows:p.sourceRows,importedRows:p.rows.length,rejectedRows:p.sourceRows-p.rows.length},alerts};
  }catch(e){await client.query('rollback');throw e}finally{client.release()}
}catch(e:any){req.log.error(e);return reply.code(400).send({error:e.message||'Import impossible'})}});
app.setNotFoundHandler((req, reply) => reply.code(404).send({error:'Route API introuvable',method:req.method,path:req.url,version:VERSION}));
app.listen({port:Number(process.env.PORT||3211),host:'0.0.0.0'});
