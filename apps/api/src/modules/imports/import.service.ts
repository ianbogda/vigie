import type { Pool } from 'pg';
import { withTransaction } from '../../common/database.js';
import { isAccountingCsv, parseAccountingCsv } from '../../accounting.js';
import {
  analyse,
  decodeLis,
  detectCsvType,
  detectFinancialXlsx,
  isYgpie1Csv,
  parseBudgetLis,
  parseBudgetXlsx,
  parseClca,
  parseFdr,
  parseFinancialXlsx,
  parseLis,
  parseInput,
  parseYgpie1
} from './import-parsers.js';
import { ImportRepository } from './import.repository.js';

export interface ImportTarget {
  name: string;
  opale_entity?: string | null;
}

export interface ImportFile {
  filename: string;
  buffer: Buffer;
}

export class ImportValidationError extends Error {}

export class ImportService {
  constructor(
    private readonly pool: Pool,
    private readonly repository = new ImportRepository()
  ) {}

  /** Imports the legacy balance endpoint while using the same transactional repository. */
  async importBalance(file: ImportFile, snapshotDate: string, establishmentOverride?: string) {
    const parsed = await parseInput(file.buffer, file.filename);
    const alerts = analyse(parsed.rows);
    return withTransaction(this.pool, async (client) => {
      const establishment = establishmentOverride || parsed.entityLabel || 'Établissement non renseigné';
      const snapshot = await this.repository.createBalanceSnapshot(client, [
        establishment,
        snapshotDate,
        file.filename,
        parsed.sheet,
        parsed.rows.length,
        parsed.format,
        parsed.entity,
        parsed.entityLabel
      ]);
      await this.repository.insertBalanceLines(client, snapshot.id, parsed.rows);
      await this.repository.insertAccountingAlerts(client, snapshot.id, alerts);
      return {
        ok: true,
        snapshot,
        control: {
          sourceRows: parsed.sourceRows,
          importedRows: parsed.rows.length,
          rejectedRows: parsed.sourceRows - parsed.rows.length
        },
        alerts
      };
    });
  }

  /** Detects, validates, parses and persists one Op@le export. */
  async importOpale(file: ImportFile, target: ImportTarget, requestedEts: string, requestedExercise = 0) {
    const name = file.filename.toLowerCase();
    const contextEntity = String(target.opale_entity || requestedEts).trim();
    const { buffer } = file;

    if (name.endsWith('.lis') && decodeLis(buffer).includes('entitiesTrialBalance')) {
      return this.importBalanceLis(file);
    }
    if (name.endsWith('.lis') && /^DATASHEET=Donnees/m.test(decodeLis(buffer))) {
      return this.importBudgetLis(file);
    }
    if (name.endsWith('.xlsx')) {
      return this.importXlsx(file, target, contextEntity, requestedExercise);
    }
    if (name.endsWith('.csv') && isYgpie1Csv(buffer)) {
      return this.importYgpie1(file, contextEntity);
    }
    if (name.endsWith('.csv') && isAccountingCsv(buffer)) {
      return this.importAccounting(file, contextEntity);
    }
    if (name.endsWith('.csv')) {
      const csvType = detectCsvType(buffer);
      if (csvType === 'fdr') return this.importFdr(file);
      if (csvType === 'clca') return this.importClca(file);
    }
    throw new ImportValidationError(
      'Type Op@le non reconnu. Formats gérés : balance .lis, budget .lis/.xlsx, EBLC .xlsx, YECBUD/YECBUR .xlsx (anciens YCONSDEP/YCONSREC compatibles), YBALAC/YBALAF .xlsx, données comptables Op@le .csv (classes 1 à 8), YGPIE1 .csv, CLCA .csv et FDR .csv.'
    );
  }

  private async importBalanceLis(file: ImportFile) {
    const parsed = parseLis(file.buffer);
    const alerts = analyse(parsed.rows);
    return withTransaction(this.pool, async (client) => {
      const establishment = parsed.entityLabel || parsed.entity || 'Établissement non renseigné';
      const snapshot = await this.repository.createBalanceSnapshot(client, [
        establishment,
        new Date().toISOString().slice(0, 10),
        file.filename,
        parsed.sheet,
        parsed.rows.length,
        parsed.format,
        parsed.entity,
        parsed.entityLabel
      ]);
      await Promise.all([
        this.repository.insertBalanceLines(client, snapshot.id, parsed.rows),
        this.repository.insertAccountingAlerts(client, snapshot.id, alerts)
      ]);
      return {
        ok: true,
        type: 'balance',
        snapshot,
        control: {
          sourceRows: parsed.sourceRows,
          importedRows: parsed.rows.length,
          rejectedRows: parsed.sourceRows - parsed.rows.length
        },
        alerts
      };
    });
  }

  private async importBudgetLis(file: ImportFile) {
    const parsed = parseBudgetLis(file.buffer);
    return withTransaction(this.pool, async (client) => {
      const snapshot = await this.repository.createBudgetSnapshot(client, [
        parsed.establishment || parsed.entity,
        parsed.entity,
        parsed.snapshotDate || new Date().toISOString().slice(0, 10),
        file.filename,
        parsed.rows.length
      ]);
      await this.repository.insertBudgetLines(client, snapshot.id, parsed.rows);
      return { ok: true, type: 'budget', snapshot, control: { importedRows: parsed.rows.length } };
    });
  }

  private async importXlsx(file: ImportFile, target: ImportTarget, contextEntity: string, requestedExercise: number) {
    const financialType = await detectFinancialXlsx(file.buffer);
    if (!financialType) {
      const parsed = await parseBudgetXlsx(file.buffer, contextEntity);
      return withTransaction(this.pool, async (client) => {
        const snapshot = await this.repository.createBudgetSnapshot(client, [
          target.name || parsed.establishment,
          parsed.entity,
          parsed.snapshotDate,
          file.filename,
          parsed.rows.length
        ]);
        await this.repository.insertBudgetLines(client, snapshot.id, parsed.rows);
        return {
          ok: true,
          type: 'budget',
          snapshot,
          control: { sourceRows: parsed.sourceRows, importedRows: parsed.rows.length, format: parsed.format }
        };
      });
    }

    const parsed: any = await parseFinancialXlsx(file.buffer, financialType, contextEntity);
    if (['YCONSDEP', 'YCONSREC', 'YECBUD', 'YECBUR'].includes(financialType)) {
      if (!Number.isInteger(requestedExercise) || requestedExercise < 2000 || requestedExercise > 2100) {
        throw new ImportValidationError(`${financialType} : choisissez l’exercice concerné avant l’import.`);
      }
      parsed.exercise = requestedExercise;
    }
    if (parsed.entity && contextEntity && parsed.entity.toUpperCase() !== contextEntity.toUpperCase()) {
      throw new ImportValidationError(
        `Import refusé : le fichier concerne ${parsed.entity}, établissement sélectionné ${contextEntity}.`
      );
    }
    return withTransaction(this.pool, async (client) => {
      // Un seul export de chaque type par EPLE et exercice : un réimport remplace le précédent.
      if (['YECBUD', 'YECBUR'].includes(parsed.type || financialType)) {
        await this.repository.replaceFinancialSnapshot(client, parsed.entity || contextEntity, parsed.type || financialType, parsed.exercise);
      }
      const snapshot = await this.repository.createFinancialSnapshot(client, [
        target.name,
        parsed.entity || contextEntity,
        parsed.type || financialType,
        parsed.snapshotDate,
        parsed.exercise,
        parsed.period,
        parsed.periodStart || null,
        parsed.periodEnd || parsed.period || null,
        parsed.technicalExercise || null,
        file.filename,
        parsed.rows.length
      ]);
      await this.repository.insertFinancialRows(client, snapshot.id, parsed.type || financialType, parsed.rows);
      return { ok: true, type: String(parsed.type || financialType).toLowerCase(), snapshot, control: { importedRows: parsed.rows.length } };
    });
  }

  private async importYgpie1(file: ImportFile, contextEntity: string) {
    const parsed = parseYgpie1(file.buffer, contextEntity);
    return withTransaction(this.pool, async (client) => {
      const snapshot = await this.repository.createYgpie1Snapshot(client, [
        parsed.entity,
        parsed.snapshotDate,
        file.filename,
        parsed.rows.length
      ]);
      await this.repository.insertYgpie1Rows(client, snapshot.id, parsed.entity, parsed.rows);
      return {
        ok: true,
        type: 'ygpie1',
        snapshot,
        control: { sourceRows: parsed.sourceRows, importedRows: parsed.rows.length, sourceEts: parsed.fileEntity }
      };
    });
  }

  private async importAccounting(file: ImportFile, contextEntity: string) {
    const parsed = parseAccountingCsv(file.buffer, contextEntity);
    return withTransaction(this.pool, async (client) => {
      const imported = await this.repository.createAccountingImport(client, [
        parsed.entity,
        file.filename,
        parsed.sourceFormat,
        parsed.sourceRows,
        parsed.rows.length,
        parsed.periodFrom,
        parsed.periodTo
      ]);
      const counts = await this.repository.upsertAccountingRows(client, imported.id, parsed.entity, parsed.rows);
      return {
        ok: true,
        type: 'accounting',
        import: {
          ...imported,
          added_count: counts.added,
          updated_count: counts.updated,
          unchanged_count: counts.unchanged
        },
        control: {
          sourceRows: parsed.sourceRows,
          importedRows: parsed.rows.length,
          addedRows: counts.added,
          updatedRows: counts.updated,
          unchangedRows: counts.unchanged,
          rejectedRows: parsed.sourceRows - parsed.rows.length,
          sourceEts: parsed.fileEntity,
          etsFromContext: parsed.entityFromContext
        }
      };
    });
  }

  private async importFdr(file: ImportFile) {
    const parsed = parseFdr(file.buffer);
    return withTransaction(this.pool, async (client) => {
      const snapshot = await this.repository.createFdrSnapshot(client, [
        parsed.establishment,
        parsed.snapshotDate,
        file.filename,
        parsed.rows.length
      ]);
      await this.repository.insertFdrRows(client, snapshot.id, parsed.rows);
      return {
        ok: true,
        type: 'fdr',
        snapshot,
        control: { sourceRows: parsed.sourceRows, importedRows: parsed.rows.length }
      };
    });
  }

  private async importClca(file: ImportFile) {
    const parsed = parseClca(file.buffer);
    return withTransaction(this.pool, async (client) => {
      const snapshot = await this.repository.createPurchaseSnapshot(client, [
        parsed.establishment,
        parsed.snapshotDate,
        file.filename,
        parsed.rows.length,
        parsed.rejectedRows
      ]);
      await this.repository.insertPurchaseRows(client, snapshot.id, parsed.rows);
      return {
        ok: true,
        type: 'clca',
        snapshot,
        control: { sourceRows: parsed.sourceRows, importedRows: parsed.rows.length, rejectedRows: parsed.rejectedRows }
      };
    });
  }
}
