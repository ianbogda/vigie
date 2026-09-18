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
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? '';
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map(x => x.text).join('');
    if ('hyperlink' in v) return v.text;
  }
  return v;
}
function rowsToObjects(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error('Le fichier ne contient aucune ligne exploitable.');
  const headers = matrix[0].map(v => String(v ?? '').trim());
  return matrix.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, values[i] ?? ''])));
}
async function parseInput(buf: Buffer, filename: string) {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'xls') throw new Error('Le format .xls n’est pas accepté. Enregistrez le fichier en .xlsx ou .csv puis réessayez.');
  if (!['xlsx', 'csv'].includes(ext || '')) throw new Error('Format non accepté. Formats autorisés : .xlsx et .csv.');
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
    return { line: i + 2, account, label, debit, credit, net: debit - credit };
  }).filter(x => /^\d{2,}/.test(x.account));
  if (!parsed.length) throw new Error('Colonnes non reconnues. Vigie attend au minimum un compte et un solde (ou débit/crédit).');
  return { sheet, sourceRows: rawRows.length, rows: parsed };
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
app.get('/health',()=>({ok:true,version:'0.0.6'}));
app.get('/api/snapshots',async()=>({snapshots:(await pool.query('select id, establishment_name, snapshot_date, source_filename, row_count, created_at from balance_snapshots order by snapshot_date desc, created_at desc limit 50')).rows}));
app.get('/api/snapshots/:id', async (req:any, reply) => {
  const snapshot=(await pool.query('select * from balance_snapshots where id=$1',[req.params.id])).rows[0];
  if(!snapshot) return reply.code(404).send({error:'Snapshot introuvable'});
  const alerts=(await pool.query("select * from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end, abs(amount) desc",[req.params.id])).rows;
  return {snapshot,alerts};
});
app.post('/api/import/balance',async(req:any,reply:any)=>{try{
  const file=await req.file(); if(!file)return reply.code(400).send({error:'Fichier manquant'});
  const fields:any=file.fields||{}; const establishment=String(fields.establishment?.value||'Établissement non renseigné');
  const date=String(fields.snapshotDate?.value||new Date().toISOString().slice(0,10));
  const buf=await file.toBuffer(); const p=await parseInput(buf,file.filename); const alerts=analyse(p.rows); const client=await pool.connect();
  try{await client.query('begin'); const s=(await client.query('insert into balance_snapshots(establishment_name,snapshot_date,source_filename,sheet_name,row_count) values($1,$2,$3,$4,$5) returning *',[establishment,date,file.filename,p.sheet,p.rows.length])).rows[0];
    for(const r of p.rows)await client.query('insert into balance_lines(snapshot_id,line_no,account,label,debit,credit,net) values($1,$2,$3,$4,$5,$6,$7)',[s.id,r.line,r.account,r.label,r.debit,r.credit,r.net]);
    for(const a of alerts)await client.query('insert into accounting_alerts(snapshot_id,rule_code,severity,title,detail,account,amount) values($1,$2,$3,$4,$5,$6,$7)',[s.id,a.code,a.level,a.title,a.detail,a.account,a.amount]);
    await client.query('commit'); return {ok:true,snapshot:s,control:{sourceRows:p.sourceRows,importedRows:p.rows.length,rejectedRows:p.sourceRows-p.rows.length},alerts};
  }catch(e){await client.query('rollback');throw e}finally{client.release()}
}catch(e:any){req.log.error(e);return reply.code(400).send({error:e.message||'Import impossible'})}});
app.listen({port:Number(process.env.PORT||3211),host:'0.0.0.0'});
