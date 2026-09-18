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
const VERSION = '0.0.10';
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://vigie:vigie@127.0.0.1:5432/vigie' });
const num = (v) => {
    if (typeof v === 'number')
        return Number.isFinite(v) ? v : 0;
    const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
const norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function pick(row, names) {
    const map = Object.fromEntries(Object.keys(row).map(k => [norm(k), k]));
    for (const n of names) {
        const k = map[norm(n)];
        if (k)
            return row[k];
    }
    return undefined;
}
function cellValue(v) {
    if (v === null || v === undefined)
        return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date)
        return v;
    if (typeof v === 'object') {
        if ('result' in v)
            return v.result ?? '';
        if ('richText' in v && Array.isArray(v.richText))
            return v.richText.map(x => x.text ?? '').join('');
        if ('text' in v && typeof v.text === 'string')
            return v.text;
        if ('error' in v)
            return String(v.error);
    }
    return String(v);
}
function rowsToObjects(matrix) {
    if (matrix.length < 2)
        throw new Error('Le fichier ne contient aucune ligne exploitable.');
    const headers = matrix[0].map(v => String(v ?? '').trim());
    return matrix.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, values[i] ?? ''])));
}
function decodeLis(buf) {
    // Les exports .lis observés sont du JSON-like Op@le encodé Windows-1252.
    // Certains intitulés contiennent des guillemets non échappés : on ne dépend donc
    // volontairement pas de JSON.parse pour extraire les objets de comptes.
    const utf = buf.toString('utf8');
    return utf.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : utf;
}
function lisString(objectText, key) {
    const marker = `"${key}":`;
    const pos = objectText.indexOf(marker);
    if (pos < 0)
        return '';
    let i = pos + marker.length;
    while (/\s/.test(objectText[i] || ''))
        i++;
    if (objectText[i] !== '"')
        return '';
    i++;
    const endMarkers = ['priorDebit', 'priorCredit', 'periodDebit', 'periodCredit', 'balanceDebit', 'balanceCredit'];
    let end = objectText.length;
    for (const next of endMarkers) {
        const p = objectText.indexOf(`, "${next}":`, i);
        if (p >= 0 && p < end)
            end = p;
    }
    let value = objectText.slice(i, end).trim();
    if (value.endsWith('"'))
        value = value.slice(0, -1);
    return value.replace(/\\"/g, '"');
}
function lisNumber(objectText, key) {
    const m = objectText.match(new RegExp(`"${key}"\\s*:\\s*(-?[0-9]+(?:[.,][0-9]+)?)`));
    return m ? num(m[1]) : 0;
}
function parseLis(buf) {
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
        return { line: i + 1, account, label, priorDebit, priorCredit, periodDebit, periodCredit, debit: balanceDebit, credit: balanceCredit, net: balanceDebit - balanceCredit };
    }).filter(x => /^\d{2,}/.test(x.account));
    if (!rows.length)
        throw new Error('Export .lis non reconnu : aucune ligne de balance Op@le détectée.');
    return { sheet: 'Op@le .lis', sourceRows: objects.length, rows, entity, entityLabel, format: 'lis' };
}
async function parseInput(buf, filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'lis')
        return parseLis(buf);
    if (ext === 'xls')
        throw new Error('Le format .xls n’est pas accepté. Utilisez de préférence l’export Op@le .lis, ou enregistrez le fichier en .xlsx/.csv.');
    if (!['xlsx', 'csv'].includes(ext || ''))
        throw new Error('Format non accepté. Format recommandé : .lis Op@le. Formats compatibles : .xlsx et .csv.');
    let sheet = 'CSV';
    let rawRows = [];
    if (ext === 'csv') {
        rawRows = parseCsv(buf, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true });
    }
    else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        if (wb.worksheets.length > MAX_SHEETS)
            throw new Error(`Classeur refusé : plus de ${MAX_SHEETS} feuilles.`);
        const ws = wb.worksheets.find(w => w.actualRowCount > 1) || wb.worksheets[0];
        if (!ws)
            throw new Error('Le classeur ne contient aucune feuille exploitable.');
        sheet = ws.name;
        const matrix = [];
        ws.eachRow({ includeEmpty: false }, row => matrix.push(row.values.slice(1).map(cellValue)));
        rawRows = rowsToObjects(matrix);
    }
    if (rawRows.length > MAX_ROWS)
        throw new Error(`Fichier refusé : plus de ${MAX_ROWS.toLocaleString('fr-FR')} lignes.`);
    if (!rawRows.length)
        throw new Error('Le fichier ne contient aucune ligne exploitable.');
    const parsed = rawRows.map((r, i) => {
        const account = String(pick(r, ['compte', 'numero compte', 'n° compte', 'num compte', 'compte general']) ?? '').replace(/\s/g, '');
        const label = String(pick(r, ['libelle', 'libellé', 'libelle compte', 'intitule', 'intitulé']) ?? '');
        let debit = num(pick(r, ['solde debiteur', 'solde débiteur', 'debit', 'débit']));
        let credit = num(pick(r, ['solde crediteur', 'solde créditeur', 'credit', 'crédit']));
        const balance = pick(r, ['solde', 'solde final']);
        if (balance !== undefined && !debit && !credit) {
            const b = num(balance);
            debit = Math.max(b, 0);
            credit = Math.max(-b, 0);
        }
        return { line: i + 2, account, label, priorDebit: 0, priorCredit: 0, periodDebit: 0, periodCredit: 0, debit, credit, net: debit - credit };
    }).filter(x => /^\d{2,}/.test(x.account));
    if (!parsed.length)
        throw new Error('Colonnes non reconnues. Utilisez de préférence l’export natif Op@le .lis.');
    return { sheet, sourceRows: rawRows.length, rows: parsed, entity: '', entityLabel: '', format: ext };
}
function parseFrDate(v) {
    const x = String(v ?? '').trim();
    if (!x)
        return null;
    const m = x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function cleanOpaleCsv(v) {
    let x = String(v ?? '').trim();
    const m = x.match(/^=\("([\s\S]*)"\)$/);
    if (m)
        x = m[1];
    return x;
}
function parseBudgetLis(buf) {
    const text = decodeLis(buf);
    if (!/^DATASHEET=Donnees/m.test(text) || !text.includes(';Budget;') || !text.includes(';Engag'))
        throw new Error("Ce .lis n'est pas un export Budget Op@le reconnu.");
    const lines = text.split(/\r?\n/).filter(x => x && !/^(DATASHEET|DATASEPCHAR|ROWMODEL)=/.test(x));
    const rows = [];
    let entity = '', establishment = '', snapshotDate = '';
    for (let i = 0; i < lines.length; i++) {
        const c = lines[i].split(';');
        const marker = c.findIndex(x => x === 'Budget');
        if (marker < 5)
            continue;
        const meta = c.slice(marker - 5, marker);
        const vals = c.slice(marker - 18, marker - 13).map(num);
        entity ||= String(meta[0] || c[0] || '');
        establishment ||= String(meta[1] || '');
        snapshotDate ||= parseFrDate(meta[4]) || '';
        rows.push({ line: i + 1, dimensions: c.slice(0, Math.max(0, marker - 18)), budget: vals[0], committed: vals[1], accounted: vals[2], inProgress: vals[3], available: vals[4] });
    }
    if (!rows.length)
        throw new Error('Export Budget Op@le reconnu mais aucune ligne budgétaire exploitable.');
    return { type: 'budget', entity, establishment, snapshotDate, rows };
}
function parseFdr(buf) {
    const text = buf.toString('utf8').replace(/^\uFEFF/, '');
    const records = parseCsv(text, { columns: true, delimiter: ';', bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
    if (!records.length)
        throw new Error('FDR vide.');
    const keys = Object.keys(records[0]);
    if (!keys.includes('Exercice') || !keys.includes('Montant du FDR') || !keys.includes('Définitif ?'))
        throw new Error('CSV non reconnu comme FDR Op@le.');
    const rows = records.map((r) => {
        const ex = String(r['Exercice'] ?? '').match(/(20\d{2})/);
        return { exercise: ex ? Number(ex[1]) : 0, amount: num(r['Montant du FDR']), direction: String(r['Sens'] ?? ''), isFinal: String(r['Définitif ?'] ?? '').trim().toUpperCase() === 'D', establishment: String(r['Ets'] ?? '').trim(), state: String(r['Etat'] ?? '').trim(), sourceModifiedAt: parseFrDate(r['Modifié le']) };
    }).filter((r) => r.exercise > 0);
    if (!rows.length)
        throw new Error('FDR reconnu mais aucun exercice exploitable.');
    const establishment = rows.find((x) => x.establishment)?.establishment || 'Établissement non renseigné';
    return { type: 'fdr', establishment, snapshotDate: new Date().toISOString().slice(0, 10), rows, sourceRows: records.length };
}
function detectCsvType(buf) {
    const head = buf.toString('utf8', 0, Math.min(buf.length, 12000)).replace(/^\uFEFF/, '');
    if (head.includes('Exercice;Montant du FDR;') && head.includes('Définitif ?'))
        return 'fdr';
    if (head.includes('N° commande') && head.includes('Fournisseur') && head.includes('Prix commandé HT'))
        return 'clca';
    return 'unknown';
}
function parseClca(buf) {
    const text = buf.toString('utf8').replace(/^\uFEFF/, '');
    const records = parseCsv(text, { columns: true, delimiter: ';', bom: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: false, group_columns_by_name: true });
    if (!records.length)
        throw new Error('CLCA vide.');
    const keys = Object.keys(records[0]);
    if (!keys.includes('N° commande') || !keys.includes('Fournisseur') || !keys.includes('Prix commandé HT'))
        throw new Error("CSV non reconnu comme CLCA Op@le.");
    const val = (r, k) => { const v = r[k]; return cleanOpaleCsv(Array.isArray(v) ? v[v.length - 1] : v); };
    const rows = records.slice(0, MAX_ROWS).map((r, i) => ({ line: i + 2, establishment: val(r, 'Etablissement'), orderNumber: val(r, 'N° commande'), internalOrderNumber: val(r, 'Numéro interne de commande'), subNumber: val(r, 'Sous-numéro'), market: val(r, 'Marché'), supplier: val(r, 'Fournisseur'), orderDate: parseFrDate(val(r, 'Date')), currency: val(r, 'Devise'), orderLine: val(r, 'Ligne'), stage: val(r, 'Etape'), article: val(r, 'Article'), articleLabel: val(r, 'Libellé article'), quantity: num(val(r, 'Quantité')), receivedQuantity: num(val(r, 'Qté reçue')), receiptDate: parseFrDate(val(r, 'Date de réception')), invoicedQuantity: num(val(r, 'Qté facturée')), warehouse: val(r, 'Dépôt'), expectedDeliveryDate: parseFrDate(val(r, 'Date livraison prévue')), purchaseMode: val(r, "Mode d'achat"), receiptBalanceQuantity: num(val(r, 'Qté solde réception')), invoiceBalanceQuantity: num(val(r, 'Qté solde facture')), orderedPrice: num(val(r, 'Prix commandé HT')), receivedPrice: num(val(r, 'Prix réceptionné')), invoicePrice: num(val(r, 'Prix facture')), invoiceAmount: num(val(r, 'Montant facture')), account: val(r, 'Compte'), cgrA: val(r, 'CGR A'), cgrB: val(r, 'CGR B'), creator: val(r, 'Créateur'), modifier: val(r, 'Modificateur'), raw: r }));
    const establishment = rows.find(x => x.establishment)?.establishment || 'Établissement non renseigné';
    const dates = rows.map(x => x.orderDate).filter(Boolean).sort();
    return { type: 'clca', establishment, snapshotDate: new Date().toISOString().slice(0, 10), rows, sourceRows: records.length, rejectedRows: Math.max(0, records.length - rows.length) };
}
function analyse(rows) {
    const alerts = [];
    const add = (code, level, title, detail, account, amount) => alerts.push({ code, level, title, detail, account, amount });
    for (const r of rows) {
        const a = r.account, abs = Math.abs(r.net);
        if (abs < 0.005)
            continue;
        if (/^(471|472)/.test(a))
            add('CG-ATTENTE', 'watch', 'Compte d’attente non soldé', `${a} ${r.label} présente un solde de ${r.net.toFixed(2)} € à examiner.`, a, r.net);
        if (/^585/.test(a))
            add('CG-585', 'alert', 'Compte 585 non soldé', `Le compte ${a} présente un solde de ${r.net.toFixed(2)} €.`, a, r.net);
        if (/^(401|404)/.test(a) && r.net > 0)
            add('CG-FOURN-SENS', 'watch', 'Solde fournisseur de sens inhabituel', `Le compte ${a} présente un solde débiteur de ${r.net.toFixed(2)} €.`, a, r.net);
        if (/^(411|416)/.test(a) && r.net < 0)
            add('CG-CLIENT-SENS', 'watch', 'Solde de créance de sens inhabituel', `Le compte ${a} présente un solde créditeur de ${Math.abs(r.net).toFixed(2)} €.`, a, r.net);
    }
    return alerts.sort((a, b) => (a.level === 'alert' ? 0 : 1) - (b.level === 'alert' ? 0 : 1) || Math.abs(b.amount) - Math.abs(a.amount));
}
app.get('/health', () => ({ ok: true, version: VERSION }));
app.get('/api/imports', async () => ({
    balances: (await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,created_at from balance_snapshots order by created_at desc limit 20')).rows,
    budgets: (await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,created_at from budget_snapshots order by created_at desc limit 20')).rows,
    purchases: (await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,rejected_row_count,created_at from purchase_snapshots order by created_at desc limit 20')).rows,
    fdr: (await pool.query('select id,establishment_name,snapshot_date,source_filename,row_count,created_at from fdr_snapshots order by created_at desc limit 20')).rows
}));
app.post('/api/import/opale', async (req, reply) => {
    try {
        const file = await req.file();
        if (!file)
            return reply.code(400).send({ error: 'Fichier manquant' });
        const buf = await file.toBuffer();
        const name = file.filename.toLowerCase();
        const client = await pool.connect();
        try {
            if (name.endsWith('.lis') && decodeLis(buf).includes('entitiesTrialBalance')) {
                const p = parseLis(buf);
                const alerts = analyse(p.rows);
                await client.query('begin');
                const establishment = p.entityLabel || p.entity || 'Établissement non renseigné';
                const s = (await client.query('insert into balance_snapshots(establishment_name,snapshot_date,source_filename,sheet_name,row_count,source_format,opale_entity,opale_entity_label) values($1,$2,$3,$4,$5,$6,$7,$8) returning *', [establishment, new Date().toISOString().slice(0, 10), file.filename, p.sheet, p.rows.length, p.format, p.entity, p.entityLabel])).rows[0];
                for (const r of p.rows)
                    await client.query('insert into balance_lines(snapshot_id,line_no,account,label,prior_debit,prior_credit,period_debit,period_credit,debit,credit,net) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [s.id, r.line, r.account, r.label, r.priorDebit, r.priorCredit, r.periodDebit, r.periodCredit, r.debit, r.credit, r.net]);
                for (const a of alerts)
                    await client.query('insert into accounting_alerts(snapshot_id,rule_code,severity,title,detail,account,amount) values($1,$2,$3,$4,$5,$6,$7)', [s.id, a.code, a.level, a.title, a.detail, a.account, a.amount]);
                await client.query('commit');
                return { ok: true, type: 'balance', snapshot: s, control: { sourceRows: p.sourceRows, importedRows: p.rows.length, rejectedRows: p.sourceRows - p.rows.length }, alerts };
            }
            if (name.endsWith('.lis') && /^DATASHEET=Donnees/m.test(decodeLis(buf))) {
                const p = parseBudgetLis(buf);
                await client.query('begin');
                const s = (await client.query('insert into budget_snapshots(establishment_name,opale_entity,snapshot_date,source_filename,row_count) values($1,$2,$3,$4,$5) returning *', [p.establishment || p.entity, p.entity, p.snapshotDate || new Date().toISOString().slice(0, 10), file.filename, p.rows.length])).rows[0];
                for (const r of p.rows)
                    await client.query('insert into budget_lines(snapshot_id,line_no,raw_dimensions,budget,committed,accounted,in_progress,available) values($1,$2,$3,$4,$5,$6,$7,$8)', [s.id, r.line, JSON.stringify(r.dimensions), r.budget, r.committed, r.accounted, r.inProgress, r.available]);
                await client.query('commit');
                return { ok: true, type: 'budget', snapshot: s, control: { importedRows: p.rows.length } };
            }
            if (name.endsWith('.csv') && detectCsvType(buf) === 'fdr') {
                const p = parseFdr(buf);
                await client.query('begin');
                const s = (await client.query('insert into fdr_snapshots(establishment_name,snapshot_date,source_filename,row_count) values($1,$2,$3,$4) returning *', [p.establishment, p.snapshotDate, file.filename, p.rows.length])).rows[0];
                for (const r of p.rows)
                    await client.query('insert into fdr_lines(snapshot_id,exercise,amount,direction,is_final,establishment,state,source_modified_at) values($1,$2,$3,$4,$5,$6,$7,$8)', [s.id, r.exercise, r.amount, r.direction, r.isFinal, r.establishment, r.state, r.sourceModifiedAt]);
                await client.query('commit');
                return { ok: true, type: 'fdr', snapshot: s, control: { sourceRows: p.sourceRows, importedRows: p.rows.length } };
            }
            if (name.endsWith('.csv') && detectCsvType(buf) === 'clca') {
                const p = parseClca(buf);
                await client.query('begin');
                const s = (await client.query('insert into purchase_snapshots(establishment_name,snapshot_date,source_filename,row_count,rejected_row_count) values($1,$2,$3,$4,$5) returning *', [p.establishment, p.snapshotDate, file.filename, p.rows.length, p.rejectedRows])).rows[0];
                for (const r of p.rows)
                    await client.query('insert into purchase_lines(snapshot_id,line_no,establishment,order_number,internal_order_number,sub_number,market,supplier,order_date,currency,order_line,stage,article,article_label,quantity,received_quantity,receipt_date,invoiced_quantity,warehouse,expected_delivery_date,purchase_mode,receipt_balance_quantity,invoice_balance_quantity,ordered_price,received_price,invoice_price,invoice_amount,account,cgr_a,cgr_b,creator,modifier,raw_data) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)', [s.id, r.line, r.establishment, r.orderNumber, r.internalOrderNumber, r.subNumber, r.market, r.supplier, r.orderDate, r.currency, r.orderLine, r.stage, r.article, r.articleLabel, r.quantity, r.receivedQuantity, r.receiptDate, r.invoicedQuantity, r.warehouse, r.expectedDeliveryDate, r.purchaseMode, r.receiptBalanceQuantity, r.invoiceBalanceQuantity, r.orderedPrice, r.receivedPrice, r.invoicePrice, r.invoiceAmount, r.account, r.cgrA, r.cgrB, r.creator, r.modifier, JSON.stringify(r.raw)]);
                await client.query('commit');
                return { ok: true, type: 'clca', snapshot: s, control: { sourceRows: p.sourceRows, importedRows: p.rows.length, rejectedRows: p.rejectedRows } };
            }
            return reply.code(400).send({ error: 'Type Op@le non reconnu. Formats gérés : balance .lis, budget .lis, CLCA .csv et FDR .csv.' });
        }
        catch (e) {
            try {
                await client.query('rollback');
            }
            catch { }
            ;
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (e) {
        req.log.error(e);
        return reply.code(400).send({ error: e.message || 'Import impossible' });
    }
});
app.get('/api/analysis', async () => {
    const latestBalance = (await pool.query('select * from balance_snapshots order by snapshot_date desc,created_at desc limit 1')).rows[0] || null;
    const latestBudget = (await pool.query('select * from budget_snapshots order by snapshot_date desc,created_at desc limit 1')).rows[0] || null;
    const latestPurchase = (await pool.query('select * from purchase_snapshots order by snapshot_date desc,created_at desc limit 1')).rows[0] || null;
    const latestFdr = (await pool.query('select * from fdr_snapshots order by snapshot_date desc,created_at desc limit 1')).rows[0] || null;
    const signals = [];
    const metrics = {};
    if (latestBudget) {
        const q = (await pool.query('select coalesce(sum(budget),0) budget,coalesce(sum(committed),0) committed,coalesce(sum(accounted),0) accounted,coalesce(sum(in_progress),0) in_progress,coalesce(sum(available),0) available from budget_lines where snapshot_id=$1', [latestBudget.id])).rows[0];
        Object.assign(metrics, { budget: { ...q, snapshotDate: latestBudget.snapshot_date, establishment: latestBudget.establishment_name } });
        const b = Number(q.budget), used = Number(q.accounted) + Number(q.committed) + Number(q.in_progress), avail = Number(q.available);
        if (b > 0) {
            const rate = used / b;
            metrics.budget.executionRate = rate;
            if (rate >= .95)
                signals.push({ code: 'BUD-095', level: 'alert', domain: 'Budget', title: 'Crédits fortement mobilisés', detail: `${(rate * 100).toFixed(1)} % des crédits sont réalisés, engagés ou en cours.`, amount: used });
            else if (rate >= .85)
                signals.push({ code: 'BUD-085', level: 'watch', domain: 'Budget', title: 'Consommation budgétaire à examiner', detail: `${(rate * 100).toFixed(1)} % des crédits sont réalisés, engagés ou en cours.`, amount: used });
        }
        if (avail < 0)
            signals.push({ code: 'BUD-NEG', level: 'alert', domain: 'Budget', title: 'Disponible budgétaire négatif', detail: `Le disponible agrégé ressort à ${avail.toFixed(2)} €.`, amount: avail });
    }
    if (latestPurchase) {
        const q = (await pool.query(`select count(*)::int lines,coalesce(sum(abs(invoice_amount)),0) invoiced,coalesce(sum(abs(ordered_price*quantity)),0) ordered,coalesce(sum(case when order_date < current_date-60 and abs(invoice_balance_quantity)>.0001 then 1 else 0 end),0)::int old_uninvoiced,coalesce(sum(case when receipt_date is not null and abs(invoice_balance_quantity)>.0001 then 1 else 0 end),0)::int received_uninvoiced from purchase_lines where snapshot_id=$1`, [latestPurchase.id])).rows[0];
        metrics.purchases = { ...q, snapshotDate: latestPurchase.snapshot_date, establishment: latestPurchase.establishment_name };
        if (Number(q.old_uninvoiced) > 0)
            signals.push({ code: 'ACH-OLD', level: 'watch', domain: 'Achats', title: 'Commandes anciennes restant à facturer', detail: `${q.old_uninvoiced} ligne(s) de commande de plus de 60 jours présentent encore un solde de facturation.`, count: Number(q.old_uninvoiced) });
        if (Number(q.received_uninvoiced) > 0)
            signals.push({ code: 'ACH-REC', level: 'watch', domain: 'Achats', title: 'Réceptions restant à rapprocher de la facturation', detail: `${q.received_uninvoiced} ligne(s) réceptionnée(s) présentent encore un solde de facturation.`, count: Number(q.received_uninvoiced) });
    }
    if (latestBalance) {
        const a = (await pool.query("select severity,title,detail,account,amount,rule_code from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end,abs(amount) desc limit 25", [latestBalance.id])).rows;
        metrics.accounting = { snapshotDate: latestBalance.snapshot_date, establishment: latestBalance.establishment_name, signalCount: a.length };
        for (const x of a)
            signals.push({ code: x.rule_code, level: x.severity, domain: 'Comptabilité générale', title: x.title, detail: x.detail, account: x.account, amount: Number(x.amount) });
    }
    if (latestFdr) {
        const f = (await pool.query('select exercise,amount,is_final from fdr_lines where snapshot_id=$1 order by exercise desc', [latestFdr.id])).rows.map((x) => ({ ...x, amount: Number(x.amount) }));
        metrics.fdr = { history: f, snapshotDate: latestFdr.snapshot_date, establishment: latestFdr.establishment_name };
        if (f.length) {
            const cur = f[0], prev = f.find((x) => x.exercise === cur.exercise - 1);
            if (prev) {
                const variation = cur.amount - prev.amount, rate = prev.amount ? variation / prev.amount : null;
                metrics.fdr.variation = variation;
                metrics.fdr.variationRate = rate;
                metrics.fdr.comparisonNature = cur.is_final ? 'definitive' : 'provisional_vs_definitive';
                if (variation < 0)
                    signals.push({ code: 'FDR-DOWN', level: 'watch', domain: 'Santé financière', title: 'Fonds de roulement en diminution', detail: `FDR ${cur.exercise}${cur.is_final ? ' définitif' : ' provisoire'} : ${cur.amount.toFixed(2)} € ; ${prev.exercise} : ${prev.amount.toFixed(2)} €. Comparaison à interpréter selon le caractère définitif des situations.`, amount: variation });
            }
        }
    }
    const freshness = [['Balance', latestBalance], ['Budget', latestBudget], ['CLCA', latestPurchase], ['FDR', latestFdr]].map(([type, s]) => ({ type, available: !!s, snapshotDate: s?.snapshot_date || null, establishment: s?.establishment_name || null }));
    const rank = { alert: 0, watch: 1, ok: 2 };
    signals.sort((a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9) || Math.abs(b.amount || 0) - Math.abs(a.amount || 0));
    return { version: VERSION, generatedAt: new Date().toISOString(), metrics, signals, freshness, method: 'Règles déterministes et traçables ; une absence de donnée n’est jamais assimilée à zéro.' };
});
app.get('/api/snapshots', async () => ({ snapshots: (await pool.query('select id, establishment_name, snapshot_date, source_filename, row_count, created_at from balance_snapshots order by snapshot_date desc, created_at desc limit 50')).rows }));
app.get('/api/snapshots/:id', async (req, reply) => {
    const snapshot = (await pool.query('select * from balance_snapshots where id=$1', [req.params.id])).rows[0];
    if (!snapshot)
        return reply.code(404).send({ error: 'Snapshot introuvable' });
    const alerts = (await pool.query("select * from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end, abs(amount) desc", [req.params.id])).rows;
    return { snapshot, alerts };
});
app.post('/api/import/balance', async (req, reply) => {
    try {
        const file = await req.file();
        if (!file)
            return reply.code(400).send({ error: 'Fichier manquant' });
        const fields = file.fields || {};
        const date = String(fields.snapshotDate?.value || new Date().toISOString().slice(0, 10));
        const buf = await file.toBuffer();
        const p = await parseInput(buf, file.filename);
        const establishment = String(fields.establishment?.value || p.entityLabel || 'Établissement non renseigné');
        const alerts = analyse(p.rows);
        const client = await pool.connect();
        try {
            await client.query('begin');
            const s = (await client.query('insert into balance_snapshots(establishment_name,snapshot_date,source_filename,sheet_name,row_count,source_format,opale_entity,opale_entity_label) values($1,$2,$3,$4,$5,$6,$7,$8) returning *', [establishment, date, file.filename, p.sheet, p.rows.length, p.format, p.entity, p.entityLabel])).rows[0];
            for (const r of p.rows)
                await client.query('insert into balance_lines(snapshot_id,line_no,account,label,prior_debit,prior_credit,period_debit,period_credit,debit,credit,net) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [s.id, r.line, r.account, r.label, r.priorDebit, r.priorCredit, r.periodDebit, r.periodCredit, r.debit, r.credit, r.net]);
            for (const a of alerts)
                await client.query('insert into accounting_alerts(snapshot_id,rule_code,severity,title,detail,account,amount) values($1,$2,$3,$4,$5,$6,$7)', [s.id, a.code, a.level, a.title, a.detail, a.account, a.amount]);
            await client.query('commit');
            return { ok: true, snapshot: s, control: { sourceRows: p.sourceRows, importedRows: p.rows.length, rejectedRows: p.sourceRows - p.rows.length }, alerts };
        }
        catch (e) {
            await client.query('rollback');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (e) {
        req.log.error(e);
        return reply.code(400).send({ error: e.message || 'Import impossible' });
    }
});
app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Route API introuvable', method: req.method, path: req.url, version: VERSION }));
app.listen({ port: Number(process.env.PORT || 3211), host: '0.0.0.0' });
