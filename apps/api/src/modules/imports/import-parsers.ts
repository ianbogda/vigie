import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';

const MAX_ROWS = 100_000;
const MAX_SHEETS = 20;

const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(
    String(v ?? '')
      .replace(/\s/g, '')
      .replace(',', '.')
  );
  return Number.isFinite(n) ? n : 0;
};
const norm = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
function pick(row: Record<string, unknown>, names: string[]) {
  const map = Object.fromEntries(Object.keys(row).map((k) => [norm(k), k]));
  for (const n of names) {
    const k = map[norm(n)];
    if (k) return row[k];
  }
  return undefined;
}
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? '';
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((x) => x.text ?? '').join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('error' in v) return String(v.error);
  }
  return String(v);
}
function rowsToObjects(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error('Le fichier ne contient aucune ligne exploitable.');
  const headers = matrix[0].map((v) => String(v ?? '').trim());
  return matrix
    .slice(1)
    .map((values) => Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, values[i] ?? ''])));
}
/** Decodes an Op@le LIS export while tolerating its common legacy encodings. */
export function decodeLis(buf: Buffer) {
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
  const endMarkers = ['priorDebit', 'priorCredit', 'periodDebit', 'periodCredit', 'balanceDebit', 'balanceCredit'];
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
/** Parses an Op@le trial-balance LIS export into normalized balance rows. */
export function parseLis(buf: Buffer) {
  const text = decodeLis(buf);
  // L'extension .lis est utilisée par Op@le pour plusieurs types d'exports.
  // Vigie n'accepte ici que la balance générale native.
  if (!text.includes('entitiesTrialBalance') || !text.includes('accountsTrialBalance')) {
    if (/^DATASHEET=/m.test(text) || /^DATASEPCHAR=/m.test(text)) {
      throw new Error(
        "Fichier .lis Op@le reconnu, mais ce n'est pas une balance générale. Exportez la balance générale (entitiesTrialBalance/accountsTrialBalance)."
      );
    }
    throw new Error('Fichier .lis non reconnu comme balance générale Op@le.');
  }
  const entity = text.match(/"entity"\s*:\s*"([^"]+)"/)?.[1] || '';
  const entityLabel = text.match(/"entityLabel"\s*:\s*"([^"]+)"/)?.[1] || '';
  const objects = text.match(/\{\s*"account"\s*:\s*"[^"]+"[\s\S]*?\}(?=\s*,|\s*\])/g) || [];
  const rows = objects
    .map((o, i) => {
      const account = o.match(/"account"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\s/g, '') || '';
      const label = lisString(o, 'accountTitle');
      const priorDebit = lisNumber(o, 'priorDebit');
      const priorCredit = lisNumber(o, 'priorCredit');
      const periodDebit = lisNumber(o, 'periodDebit');
      const periodCredit = lisNumber(o, 'periodCredit');
      const balanceDebit = lisNumber(o, 'balanceDebit');
      const balanceCredit = lisNumber(o, 'balanceCredit');
      return {
        line: i + 1,
        account,
        label,
        priorDebit,
        priorCredit,
        periodDebit,
        periodCredit,
        debit: balanceDebit,
        credit: balanceCredit,
        net: balanceDebit - balanceCredit
      };
    })
    .filter((x) => /^\d{2,}/.test(x.account));
  if (!rows.length) throw new Error('Export .lis non reconnu : aucune ligne de balance Op@le détectée.');
  return { sheet: 'Op@le .lis', sourceRows: objects.length, rows, entity, entityLabel, format: 'lis' };
}
/** Parses a supported balance input file into normalized balance rows. */
export async function parseInput(buf: Buffer, filename: string) {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'lis') return parseLis(buf);
  if (ext === 'xls')
    throw new Error(
      'Le format .xls n’est pas accepté. Utilisez de préférence l’export Op@le .lis, ou enregistrez le fichier en .xlsx/.csv.'
    );
  if (!['xlsx', 'csv'].includes(ext || ''))
    throw new Error('Format non accepté. Format recommandé : .lis Op@le. Formats compatibles : .xlsx et .csv.');
  let sheet = 'CSV';
  let rawRows: Record<string, unknown>[] = [];
  if (ext === 'csv') {
    rawRows = parseCsv(buf, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true });
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    if (wb.worksheets.length > MAX_SHEETS) throw new Error(`Classeur refusé : plus de ${MAX_SHEETS} feuilles.`);
    const ws = wb.worksheets.find((w) => w.actualRowCount > 1) || wb.worksheets[0];
    if (!ws) throw new Error('Le classeur ne contient aucune feuille exploitable.');
    sheet = ws.name;
    const matrix: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) =>
      matrix.push((row.values as ExcelJS.CellValue[]).slice(1).map(cellValue))
    );
    rawRows = rowsToObjects(matrix);
  }
  if (rawRows.length > MAX_ROWS)
    throw new Error(`Fichier refusé : plus de ${MAX_ROWS.toLocaleString('fr-FR')} lignes.`);
  if (!rawRows.length) throw new Error('Le fichier ne contient aucune ligne exploitable.');
  const parsed = rawRows
    .map((r, i) => {
      const account = String(
        pick(r, ['compte', 'numero compte', 'n° compte', 'num compte', 'compte general']) ?? ''
      ).replace(/\s/g, '');
      const label = String(pick(r, ['libelle', 'libellé', 'libelle compte', 'intitule', 'intitulé']) ?? '');
      let debit = num(pick(r, ['solde debiteur', 'solde débiteur', 'debit', 'débit']));
      let credit = num(pick(r, ['solde crediteur', 'solde créditeur', 'credit', 'crédit']));
      const balance = pick(r, ['solde', 'solde final']);
      if (balance !== undefined && !debit && !credit) {
        const b = num(balance);
        debit = Math.max(b, 0);
        credit = Math.max(-b, 0);
      }
      return {
        line: i + 2,
        account,
        label,
        priorDebit: 0,
        priorCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
        debit,
        credit,
        net: debit - credit
      };
    })
    .filter((x) => /^\d{2,}/.test(x.account));
  if (!parsed.length) throw new Error('Colonnes non reconnues. Utilisez de préférence l’export natif Op@le .lis.');
  return { sheet, sourceRows: rawRows.length, rows: parsed, entity: '', entityLabel: '', format: ext };
}

function parseFrDate(v: unknown) {
  const x = String(v ?? '').trim();
  if (!x) return null;
  const m = x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function cleanOpaleCsv(v: unknown) {
  let x = String(v ?? '').trim();
  const m = x.match(/^=\("([\s\S]*)"\)$/);
  if (m) x = m[1];
  return x;
}
/** Parses a native Op@le budget LIS export. */
export function parseBudgetLis(buf: Buffer) {
  const text = decodeLis(buf);
  if (!/^DATASHEET=Donnees/m.test(text) || !text.includes(';Budget;') || !text.includes(';Engag'))
    throw new Error("Ce .lis n'est pas un export Budget Op@le reconnu.");
  const lines = text.split(/\r?\n/).filter((x) => x && !/^(DATASHEET|DATASEPCHAR|ROWMODEL)=/.test(x));
  const rows: any[] = [];
  let entity = '',
    establishment = '',
    snapshotDate = '';
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].split(';');
    const marker = c.findIndex((x) => x === 'Budget');
    if (marker < 5) continue;
    const meta = c.slice(marker - 5, marker);
    const vals = c.slice(marker - 18, marker - 13).map(num);
    entity ||= String(meta[0] || c[0] || '');
    establishment ||= String(meta[1] || '');
    snapshotDate ||= parseFrDate(meta[4]) || '';
    rows.push({
      line: i + 1,
      dimensions: c.slice(0, Math.max(0, marker - 18)),
      budget: vals[0],
      committed: vals[1],
      accounted: vals[2],
      inProgress: vals[3],
      available: vals[4]
    });
  }
  if (!rows.length) throw new Error('Export Budget Op@le reconnu mais aucune ligne budgétaire exploitable.');
  return { type: 'budget', entity, establishment, snapshotDate, rows };
}

/** Parses an Op@le budget workbook for the selected establishment. */
export async function parseBudgetXlsx(buf: Buffer, contextEntity: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.getWorksheet('Donnees');
  if (!ws) throw new Error("Classeur .xlsx non reconnu : feuille 'Donnees' absente.");
  const headerRow = ws.getRow(2);
  const headers = Array.from({ length: ws.actualColumnCount }, (_, i) =>
    String(cellValue(headerRow.getCell(i + 1).value) || '').trim()
  );
  const col = (name: string) => headers.findIndex((h) => h === name) + 1;
  if (col('Etablissement') !== 1 || col('Compte') < 1 || col('Montant colonne 1') < 1)
    throw new Error('Classeur .xlsx non reconnu comme export budgétaire Op@le.');
  const metaEntity = String(cellValue(ws.getRow(3).getCell(77).value) || '').trim();
  const uai = String(cellValue(ws.getRow(3).getCell(78).value) || '').trim();
  const snapshotDate = parseFrDate(cellValue(ws.getRow(3).getCell(81).value)) || new Date().toISOString().slice(0, 10);
  if (metaEntity && contextEntity && metaEntity.toUpperCase() !== contextEntity.toUpperCase())
    throw new Error(
      `ETS incohérent : le fichier contient ${metaEntity}, alors que l’import est contextualisé sur ${contextEntity}.`
    );
  const amountLabels = Array.from({ length: 13 }, (_, i) =>
    String(cellValue(ws.getRow(3).getCell(82 + i).value) || '').trim()
  );
  const rows: any[] = [];
  for (let r = 3; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r),
      entity = String(cellValue(row.getCell(1).value) || '').trim();
    if (!entity) continue;
    const cgr = [] as any[],
      posts = [] as any[];
    for (let level = 1; level <= 10; level++) {
      const base = 2 + (level - 1) * 3,
        code = String(cellValue(row.getCell(base).value) || '').trim(),
        label = String(cellValue(row.getCell(base + 1).value) || '').trim();
      if (code) cgr.push({ level, code, label: label === '_' ? '' : label });
    }
    for (let level = 1; level <= 10; level++) {
      const base = 32 + (level - 1) * 3,
        code = String(cellValue(row.getCell(base).value) || '').trim(),
        label = String(cellValue(row.getCell(base + 1).value) || '').trim();
      if (code) posts.push({ level, code, label: label === '_' ? '' : label });
    }
    const account = String(cellValue(row.getCell(62).value) || '').trim(),
      accountLabel = String(cellValue(row.getCell(63).value) || '').trim();
    const amounts = Array.from({ length: 13 }, (_, i) => num(cellValue(row.getCell(64 + i).value)));
    if (!cgr.length && !posts.length && !account && !amounts.some(Boolean)) continue;
    rows.push({
      line: r,
      dimensions: { source: 'opale-budget-xlsx', uai, cgr, posts, account, accountLabel, amountLabels },
      budget: amounts[0],
      committed: amounts[1],
      accounted: amounts[2],
      inProgress: amounts[3],
      available: amounts[4]
    });
  }
  if (!rows.length) throw new Error('Export Budget Op@le reconnu mais aucune ligne budgétaire exploitable.');
  return {
    type: 'budget',
    entity: metaEntity || contextEntity,
    establishment: uai || metaEntity || contextEntity,
    snapshotDate,
    rows,
    sourceRows: ws.actualRowCount - 2,
    format: 'opale-budget-xlsx'
  };
}

function parseOpaleCsv(buf: Buffer) {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  return parseCsv(text, {
    columns: true,
    delimiter: ';',
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: false,
    group_columns_by_name: true
  }) as any[];
}
/** Parses a CSV export containing fonds de roulement history. */
export function parseFdr(buf: Buffer) {
  const records: any[] = parseOpaleCsv(buf);
  if (!records.length) throw new Error('FDR vide.');
  const keys = Object.keys(records[0]);
  if (!keys.includes('Exercice') || !keys.includes('Montant du FDR') || !keys.includes('Définitif ?'))
    throw new Error('CSV non reconnu comme FDR Op@le.');
  const rows = records
    .map((r: any) => {
      const ex = String(r['Exercice'] ?? '').match(/(20\d{2})/);
      return {
        exercise: ex ? Number(ex[1]) : 0,
        amount: num(r['Montant du FDR']),
        direction: String(r['Sens'] ?? ''),
        isFinal:
          String(r['Définitif ?'] ?? '')
            .trim()
            .toUpperCase() === 'D',
        establishment: String(r['Ets'] ?? '').trim(),
        state: String(r['Etat'] ?? '').trim(),
        sourceModifiedAt: parseFrDate(r['Modifié le'])
      };
    })
    .filter((r: any) => r.exercise > 0);
  if (!rows.length) throw new Error('FDR reconnu mais aucun exercice exploitable.');
  const establishment = rows.find((x: any) => x.establishment)?.establishment || 'Établissement non renseigné';
  return {
    type: 'fdr',
    establishment,
    snapshotDate: new Date().toISOString().slice(0, 10),
    rows,
    sourceRows: records.length
  };
}

const cellText = (v: any) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('text' in v) return String(v.text ?? '');
    if (Array.isArray(v.richText)) return v.richText.map((x: any) => x.text || '').join('');
    if ('result' in v) return String(v.result ?? '');
  }
  return String(v).trim();
};
const cellNum = (v: any) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const normHeader = (v: any) =>
  cellText(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
async function xlsxData(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.getWorksheet('Donnees');
  if (!ws) throw new Error('Onglet Donnees absent.');
  const rows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values;
    rows.push(Array.isArray(values) ? values.slice(1) : Object.values(values ?? {}));
  });
  return rows;
}
function headerIndex(headers: any[], name: string) {
  const wanted = normHeader(name);
  return headers.findIndex((x) => normHeader(x) === wanted);
}
function findHeaderRow(rows: any[][], required: string[]) {
  return rows.findIndex((r) => required.every((name) => headerIndex(r, name) >= 0));
}
/** Detects the supported financial workbook type from its headers. */
export async function detectFinancialXlsx(buf: Buffer) {
  const rows = await xlsxData(buf);
  if (findHeaderRow(rows, ['Compte', 'Solde débit', 'Solde crédit', 'Montant débit antérieur']) >= 0) return 'EBLC';
  const cons = findHeaderRow(rows, ['Etablissement', 'CGR de niveau 1', 'Poste de niveau 1', 'Montant colonne 1']);
  if (cons >= 0) {
    const h = rows[cons],
      poste = headerIndex(h, 'Poste de niveau 1');
    const first = rows.slice(cons + 1).find((r) => cellText(r[poste]));
    const dir = cellText(first?.[poste]).toUpperCase();
    if (dir === 'DEP') return 'YECBUD';
    if (dir === 'REC') return 'YECBUR';
  }
  const aged = findHeaderRow(rows, ['Etablissement', 'Pièce', 'Tiers', 'Montant en référence colonne 15']);
  if (aged >= 0) {
    const h = rows[aged],
      accountCol = headerIndex(h, 'Critère de rupture 2');
    const first = rows.slice(aged + 1).find((r) => cellText(r[accountCol]));
    const account = cellText(first?.[accountCol]);
    if (/^40/.test(account)) return 'YBALAF';
    if (/^4[1-9]/.test(account)) return 'YBALAC';
    throw new Error(
      `Balance âgée reconnue, mais le compte ${account || 'non renseigné'} ne permet pas de déterminer clients/fournisseurs.`
    );
  }
  return null;
}
/** Parses a supported financial workbook into normalized rows. */
export async function parseFinancialXlsx(buf: Buffer, type: string, contextEntity: string) {
  const rows = await xlsxData(buf);
  const required =
    type === 'EBLC'
      ? ['Compte', 'Solde débit', 'Solde crédit']
      : ['YCONSDEP', 'YCONSREC', 'YECBUD', 'YECBUR'].includes(type)
        ? ['Etablissement', 'CGR de niveau 1', 'Poste de niveau 1', 'Montant colonne 1']
        : ['Etablissement', 'Pièce', 'Tiers', 'Montant en référence colonne 15'];
  const hi = findHeaderRow(rows, required);
  if (hi < 0) throw new Error(`${type}: en-têtes non reconnus.`);
  const h = rows[hi];
  const idx = (name: string) => headerIndex(h, name);
  const data = rows.slice(hi + 1).filter((r) => r.some((v) => cellText(v)));
  if (!data.length) throw new Error(`${type}: aucune ligne exploitable.`);
  const first = data[0];
  if (type === 'EBLC') {
    const entity = cellText(first[idx('Etablissement')]) || contextEntity;
    const dateText = cellText(first[idx('Date')]);
    const snapshotDate = parseFrDate(dateText) || new Date().toISOString().slice(0, 10);
    // EBLC : le rattachement métier est déterminé par la période demandée dans l'édition,
    // pas par l'exercice technique Op@le depuis lequel l'édition a été lancée.
    const periodStart = cellText(first[idx('Période de début')]) || null;
    const periodEnd = cellText(first[idx('Période de fin')]) || periodStart;
    const periodYear = Number(((periodEnd || '').match(/20\d{2}/) || [])[0]);
    const exerciseText = cellText(first[idx("Fin d'exercice")]) || cellText(first[idx("Début d'exercice")]);
    const technicalExercise = Number((exerciseText.match(/20\d{2}/) || [])[0]) || new Date(snapshotDate).getFullYear();
    const exercise = periodYear || technicalExercise;
    const period = periodEnd || periodStart || null;
    return {
      type,
      entity,
      uai: '',
      snapshotDate,
      exercise,
      period,
      periodStart,
      periodEnd,
      technicalExercise,
      rows: data
        .map((r, i) => ({
          line: i + hi + 2,
          account: cellText(r[idx('Compte')]),
          label: cellText(r[idx('Intitulé réduit du compte')]),
          priorDebit: cellNum(r[idx('Montant débit antérieur')]),
          priorCredit: cellNum(r[idx('Montant crédit antérieur')]),
          periodDebit: cellNum(r[idx('Montant débit')]),
          periodCredit: cellNum(r[idx('Montant crédit')]),
          debit: cellNum(r[idx('Solde débit')]),
          credit: cellNum(r[idx('Solde crédit')])
        }))
        .filter((x) => /^\d{3,}/.test(x.account))
    };
  }
  if (['YCONSDEP', 'YCONSREC', 'YECBUD', 'YECBUR'].includes(type)) {
    const entity =
      cellText(first[idx('Etablissement si un seul sélectionné')]) ||
      cellText(first[idx('Etablissement')]) ||
      contextEntity;
    const uai = cellText(first[idx('Intitulé réduit')]);
    const dateText = cellText(first[idx('Date')]);
    const snapshotDate = parseFrDate(dateText) || new Date().toISOString().slice(0, 10);
    const exercise = new Date(snapshotDate).getFullYear();
    // Les éditions YCONS ne nomment pas toutes la dimension comptable de la même manière.
    // Dans l'export standard Op@le, les dimensions sont organisées par blocs de 3 colonnes :
    // section (4), groupe de service (7), service (10), domaine (13), activité (16), compte (19).
    // On privilégie toutefois un en-tête explicite lorsqu'il existe.
    const accountCandidates = ['Compte', 'Compte budgétaire', 'Compte de niveau 1', 'Compte niveau 1'];
    const explicitAccount = accountCandidates.map(idx).find((i) => i >= 0) ?? -1;
    const account = explicitAccount >= 0 ? explicitAccount : 19;
    const amount = idx('Montant colonne 1');
    return {
      type,
      entity,
      uai,
      snapshotDate,
      exercise,
      period: null,
      rows: data
        .map((r, i) => ({
          line: i + hi + 2,
          direction: ['YCONSDEP', 'YECBUD'].includes(type) ? 'DEP' : 'REC',
          section: cellText(r[4]),
          serviceGroup: cellText(r[7]),
          service: cellText(r[10]),
          domain: cellText(r[13]),
          activity: cellText(r[16]),
          account: cellText(r[account]),
          label: cellText(r[account + 1]),
          budget: cellNum(r[amount]),
          committed: cellNum(r[amount + 1]),
          accounted: cellNum(r[amount + 2]),
          inProgress: cellNum(r[amount + 3]),
          available: cellNum(r[amount + 4])
        }))
        .filter((x) => x.service || x.account)
    };
  }
  const entity = cellText(first[idx('Etablissement')]) || contextEntity;
  const uai = cellText(first[idx('Libellé réduit établissement')]);
  const dateText = cellText(first[idx('Date')]);
  const snapshotDate = parseFrDate(dateText) || new Date().toISOString().slice(0, 10);
  const exercise = new Date(snapshotDate).getFullYear();
  const account = idx('Critère de rupture 2'),
    accountLabel = idx('Libellé critère de rupture 2'),
    party = idx('Tiers'),
    partyLabel = idx('Libellé réduit du tiers'),
    piece = idx('Pièce'),
    pieceType = idx('Type de pièce'),
    amount = idx('Montant en référence colonne 1');
  return {
    type,
    entity,
    uai,
    snapshotDate,
    exercise,
    period: null,
    rows: data
      .map((r, i) => ({
        line: i + hi + 2,
        account: cellText(r[account]),
        accountLabel: cellText(r[accountLabel]),
        partyId: cellText(r[party]),
        partyLabel: cellText(r[partyLabel]),
        piece: cellText(r[piece]),
        pieceType: cellText(r[pieceType]),
        amounts: Array.from({ length: 15 }, (_, j) => cellNum(r[amount + j]))
      }))
      .filter((x) => x.account || x.piece)
  };
}

/** Returns whether a CSV buffer matches the YGPIE1 export structure. */
export function isYgpie1Csv(buf: Buffer) {
  const h = buf.toString('utf8', 0, Math.min(buf.length, 24000)).replace(/^\uFEFF/, '');
  return (
    h.includes(
      'Pièce;N° éché.;Type;Echéance;Compte;Tiers principal;Solde débit;Solde crédit;Montant débit;Montant crédit;Ets;'
    ) && h.includes('Indicateur du solde')
  );
}
/** Parses a YGPIE1 CSV export in the selected establishment context. */
export function parseYgpie1(buf: Buffer, contextEntity: string) {
  const matrix: any[][] = parseCsv(buf.toString('utf8').replace(/^\uFEFF/, ''), {
    delimiter: ';',
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: false
  });
  if (matrix.length < 2) throw new Error('YGPIE1 vide.');
  const headers = matrix[0].map((x: any) => String(x ?? '').trim());
  const ix = (name: string) => headers.indexOf(name),
    clean = (v: any) => cleanOpaleCsv(v),
    money = (v: any) => num(clean(v));
  const required = ['Pièce', 'Compte', 'Solde débit', 'Solde crédit', 'Ets'];
  for (const k of required) if (ix(k) < 0) throw new Error(`YGPIE1 : colonne ${k} absente.`);
  const rows = matrix
    .slice(1, MAX_ROWS + 1)
    .map((r: any[], i: number) => ({
      line: i + 2,
      piece: clean(r[ix('Pièce')]),
      installment: clean(r[ix('N° éché.')]),
      pieceType: clean(r[ix('Type')]),
      dueDate: parseFrDate(clean(r[ix('Echéance')])),
      account: clean(r[ix('Compte')]).replace(/\s/g, ''),
      mainParty: clean(r[ix('Tiers principal')]),
      debitBalance: money(r[ix('Solde débit')]),
      creditBalance: money(r[ix('Solde crédit')]),
      debitAmount: money(r[ix('Montant débit')]),
      creditAmount: money(r[ix('Montant crédit')]),
      entity: clean(r[ix('Ets')]),
      state: clean(r[ix('Etat')]),
      reference: clean(r[ix('Référence')]),
      label: clean(r[ix('Libellé')]),
      movementType: clean(r[ix('Type de mouvement')]),
      entryNo: clean(r[ix('Ecriture')]),
      initialDueDate: parseFrDate(clean(r[ix("Date d'échéance initiale")])),
      valueDate: parseFrDate(clean(r[ix('Date de valeur')])),
      party: clean(r[ix('Tiers')]),
      balanceIndicator: clean(r[ix('Indicateur du solde')]),
      settlementDate: parseFrDate(clean(r[ix('Date de solde')])),
      createdSourceDate: parseFrDate(clean(r[ix('Créé le')])),
      modifiedSourceDate: parseFrDate(clean(r[ix('Modifié le')])),
      raw: Object.fromEntries(headers.map((h, j) => [`${h || 'col'}_${j}`, r[j] ?? '']))
    }))
    .filter((x: any) => x.piece || x.account);
  if (!rows.length) throw new Error('YGPIE1 reconnu mais aucune pièce exploitable.');
  const entities = [...new Set(rows.map((x: any) => x.entity).filter(Boolean))];
  if (entities.length > 1) throw new Error(`YGPIE1 contient plusieurs ETS (${entities.join(', ')}).`);
  const fileEntity = entities[0] || null;
  if (!contextEntity) throw new Error('Le contexte ETS est obligatoire pour YGPIE1.');
  if (fileEntity && fileEntity !== contextEntity)
    throw new Error(
      `ETS incohérent : YGPIE1 contient ${fileEntity}, alors que l’import est contextualisé sur ${contextEntity}.`
    );
  return {
    type: 'ygpie1',
    entity: contextEntity,
    fileEntity,
    rows,
    sourceRows: matrix.length - 1,
    snapshotDate: new Date().toISOString().slice(0, 10)
  };
}

/** Detects the supported Op@le CSV export type. */
export function detectCsvType(buf: Buffer) {
  const head = buf.toString('utf8', 0, Math.min(buf.length, 12000)).replace(/^\uFEFF/, '');
  if (head.includes('Exercice;Montant du FDR;') && head.includes('Définitif ?')) return 'fdr';
  if (head.includes('N° commande') && head.includes('Fournisseur') && head.includes('Prix commandé HT')) return 'clca';
  return 'unknown';
}
/** Parses a CLCA CSV export. */
export function parseClca(buf: Buffer) {
  const records: any[] = parseOpaleCsv(buf);
  if (!records.length) throw new Error('CLCA vide.');
  const keys = Object.keys(records[0]);
  if (!keys.includes('N° commande') || !keys.includes('Fournisseur') || !keys.includes('Prix commandé HT'))
    throw new Error('CSV non reconnu comme CLCA Op@le.');
  const val = (r: any, k: string) => {
    const v = r[k];
    return cleanOpaleCsv(Array.isArray(v) ? v[v.length - 1] : v);
  };
  const rows = records.slice(0, MAX_ROWS).map((r: any, i: number) => ({
    line: i + 2,
    establishment: val(r, 'Etablissement'),
    orderNumber: val(r, 'N° commande'),
    internalOrderNumber: val(r, 'Numéro interne de commande'),
    subNumber: val(r, 'Sous-numéro'),
    market: val(r, 'Marché'),
    supplier: val(r, 'Fournisseur'),
    orderDate: parseFrDate(val(r, 'Date')),
    currency: val(r, 'Devise'),
    orderLine: val(r, 'Ligne'),
    stage: val(r, 'Etape'),
    article: val(r, 'Article'),
    articleLabel: val(r, 'Libellé article'),
    quantity: num(val(r, 'Quantité')),
    receivedQuantity: num(val(r, 'Qté reçue')),
    receiptDate: parseFrDate(val(r, 'Date de réception')),
    invoicedQuantity: num(val(r, 'Qté facturée')),
    warehouse: val(r, 'Dépôt'),
    expectedDeliveryDate: parseFrDate(val(r, 'Date livraison prévue')),
    purchaseMode: val(r, "Mode d'achat"),
    receiptBalanceQuantity: num(val(r, 'Qté solde réception')),
    invoiceBalanceQuantity: num(val(r, 'Qté solde facture')),
    orderedPrice: num(val(r, 'Prix commandé HT')),
    receivedPrice: num(val(r, 'Prix réceptionné')),
    invoicePrice: num(val(r, 'Prix facture')),
    invoiceAmount: num(val(r, 'Montant facture')),
    account: val(r, 'Compte'),
    cgrA: val(r, 'CGR A'),
    cgrB: val(r, 'CGR B'),
    creator: val(r, 'Créateur'),
    modifier: val(r, 'Modificateur'),
    raw: r
  }));
  const establishment = rows.find((x) => x.establishment)?.establishment || 'Établissement non renseigné';
  const dates = rows
    .map((x) => x.orderDate)
    .filter(Boolean)
    .sort();
  return {
    type: 'clca',
    establishment,
    snapshotDate: new Date().toISOString().slice(0, 10),
    rows,
    sourceRows: records.length,
    rejectedRows: Math.max(0, records.length - rows.length)
  };
}

/** Builds accounting alerts from normalized balance rows. */
export function analyse(rows: any[]) {
  const alerts: any[] = [];
  const add = (code: string, level: string, title: string, detail: string, account: string, amount: number) =>
    alerts.push({ code, level, title, detail, account, amount });
  for (const r of rows) {
    const a = r.account,
      abs = Math.abs(r.net);
    if (abs < 0.005) continue;
    if (/^(471|472)/.test(a))
      add(
        'CG-ATTENTE',
        'watch',
        'Compte d’attente non soldé',
        `${a} ${r.label} présente un solde de ${r.net.toFixed(2)} € à examiner.`,
        a,
        r.net
      );
    if (/^585/.test(a))
      add(
        'CG-585',
        'alert',
        'Compte 585 non soldé',
        `Le compte ${a} présente un solde de ${r.net.toFixed(2)} €.`,
        a,
        r.net
      );
    if (/^(401|404)/.test(a) && r.net > 0)
      add(
        'CG-FOURN-SENS',
        'watch',
        'Solde fournisseur de sens inhabituel',
        `Le compte ${a} présente un solde débiteur de ${r.net.toFixed(2)} €.`,
        a,
        r.net
      );
    if (/^(411|416)/.test(a) && r.net < 0)
      add(
        'CG-CLIENT-SENS',
        'watch',
        'Solde de créance de sens inhabituel',
        `Le compte ${a} présente un solde créditeur de ${Math.abs(r.net).toFixed(2)} €.`,
        a,
        r.net
      );
  }
  return alerts.sort(
    (a, b) => (a.level === 'alert' ? 0 : 1) - (b.level === 'alert' ? 0 : 1) || Math.abs(b.amount) - Math.abs(a.amount)
  );
}
/** Computes the reference budget trajectory for a snapshot date. */
export function budgetTrajectoryTarget(dateValue: any) {
  const d = new Date(dateValue || Date.now());
  const y = d.getUTCFullYear();
  const points = [
    [Date.UTC(y, 0, 1), 0.05],
    [Date.UTC(y, 2, 31), 0.25],
    [Date.UTC(y, 5, 30), 0.62],
    [Date.UTC(y, 7, 31), 0.78],
    [Date.UTC(y, 10, 1), 0.95],
    [Date.UTC(y, 11, 31), 1]
  ];
  const t = d.getTime();
  if (t <= points[0][0]) return points[0][1];
  if (t >= points.at(-1)![0]) return 1;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [a, va] = points[i - 1],
        [b, vb] = points[i];
      return va + (vb - va) * ((t - a) / (b - a));
    }
  }
  return 1;
}
/** Builds the budget signal associated with aggregate execution metrics. */
export function budgetSignal(metrics: any, snapshotDate: any) {
  const budget = Number(metrics.budget || 0),
    committed = Number(metrics.committed || 0),
    accounted = Number(metrics.accounted || 0),
    available = Number(metrics.available || 0);
  if (!budget) return null;
  const rate = committed / budget,
    target = budgetTrajectoryTarget(snapshotDate),
    gap = rate - target;
  const evidence = [
    { label: 'Montant évaluatif', value: budget },
    { label: 'Engagé juridiquement', value: committed },
    { label: 'dont réalisé', value: accounted },
    { label: 'Disponible', value: available },
    { label: "Taux d'engagement", value: rate, format: 'percent' },
    { label: 'Trajectoire attendue', value: target, format: 'percent' }
  ];
  if (available < -0.01)
    return {
      code: 'BUD-NEG',
      level: 'alert',
      domain: 'Budget',
      title: 'Disponible budgétaire négatif',
      detail: `Le disponible ressort à ${available.toFixed(2)} €.`,
      evidence,
      condition: 'Disponible < 0 €',
      interpretation: 'Les engagements dépassent le montant évaluatif agrégé ; le périmètre doit être vérifié.',
      source: 'Budget Op@le'
    };
  if (gap < -0.1)
    return {
      code: 'BUD-TRAJECTORY',
      level: 'watch',
      domain: 'Budget',
      title: 'Engagements en retrait sur la trajectoire',
      detail: `${(rate * 100).toFixed(1)} % engagés pour une trajectoire de référence à ${(target * 100).toFixed(1)} %.`,
      evidence,
      condition: 'Écart à la trajectoire < -10 points',
      interpretation:
        "Le niveau d'engagement est inférieur à la trajectoire EPLE de référence. Le contexte et les besoins restant à engager sont à examiner.",
      source: 'Budget Op@le'
    };
  return null;
}
