import type { PoolClient } from 'pg';
import { insertMany } from '../../common/database.js';

export class ImportRepository {
  async createBalanceSnapshot(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into balance_snapshots(establishment_name,snapshot_date,source_filename,sheet_name,row_count,source_format,opale_entity,opale_entity_label) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',
        [...values]
      )
    ).rows[0];
  }

  async insertBalanceLines(client: PoolClient, snapshotId: number, rows: any[]) {
    return insertMany(
      client,
      'balance_lines',
      [
        'snapshot_id',
        'line_no',
        'account',
        'label',
        'prior_debit',
        'prior_credit',
        'period_debit',
        'period_credit',
        'debit',
        'credit',
        'net'
      ],
      rows.map((r) => [
        snapshotId,
        r.line,
        r.account,
        r.label,
        r.priorDebit,
        r.priorCredit,
        r.periodDebit,
        r.periodCredit,
        r.debit,
        r.credit,
        r.net
      ])
    );
  }

  async insertAccountingAlerts(client: PoolClient, snapshotId: number, alerts: any[]) {
    return insertMany(
      client,
      'accounting_alerts',
      ['snapshot_id', 'rule_code', 'severity', 'title', 'detail', 'account', 'amount'],
      alerts.map((a) => [snapshotId, a.code, a.level, a.title, a.detail, a.account, a.amount])
    );
  }

  async replaceFinancialSnapshot(client: PoolClient, entity: string, sourceType: string, exercise: number) {
    await client.query(
      'delete from financial_snapshots where upper(opale_entity)=upper($1) and source_type=$2 and exercise=$3',
      [entity, sourceType, exercise]
    );
  }

  async createBudgetSnapshot(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into budget_snapshots(establishment_name,opale_entity,snapshot_date,source_filename,row_count) values($1,$2,$3,$4,$5) returning *',
        [...values]
      )
    ).rows[0];
  }

  async insertBudgetLines(client: PoolClient, snapshotId: number, rows: any[]) {
    return insertMany(
      client,
      'budget_lines',
      ['snapshot_id', 'line_no', 'raw_dimensions', 'budget', 'committed', 'accounted', 'in_progress', 'available'],
      rows.map((r) => [
        snapshotId,
        r.line,
        JSON.stringify(r.dimensions),
        r.budget,
        r.committed,
        r.accounted,
        r.inProgress,
        r.available
      ])
    );
  }

  async createFinancialSnapshot(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into financial_snapshots(establishment_name,opale_entity,source_type,snapshot_date,exercise,period,period_start,period_end,technical_exercise,source_filename,row_count) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *',
        [...values]
      )
    ).rows[0];
  }

  async insertFinancialRows(client: PoolClient, snapshotId: number, type: string, rows: any[]) {
    if (type === 'EBLC') {
      return insertMany(
        client,
        'financial_balance_lines',
        [
          'snapshot_id',
          'line_no',
          'account',
          'label',
          'prior_debit',
          'prior_credit',
          'period_debit',
          'period_credit',
          'debit',
          'credit'
        ],
        rows.map((r) => [
          snapshotId,
          r.line,
          r.account,
          r.label,
          r.priorDebit,
          r.priorCredit,
          r.periodDebit,
          r.periodCredit,
          r.debit,
          r.credit
        ])
      );
    }
    if (['YCONSDEP', 'YCONSREC', 'YECBUD', 'YECBUR'].includes(type)) {
      return insertMany(
        client,
        'financial_execution_lines',
        [
          'snapshot_id',
          'line_no',
          'direction',
          'section',
          'service_group',
          'service',
          'domain',
          'activity',
          'account',
          'label',
          'budget',
          'committed',
          'accounted',
          'in_progress',
          'available',
          'cgr_path',
          'post_path',
          'amount_labels',
          'extra_amounts'
        ],
        rows.map((r) => [
          snapshotId,
          r.line,
          r.direction,
          r.section,
          r.serviceGroup,
          r.service,
          r.domain,
          r.activity,
          r.account,
          r.label,
          r.budget,
          r.committed,
          r.accounted,
          r.inProgress,
          r.available,
          JSON.stringify(r.cgrPath || []),
          JSON.stringify(r.postPath || []),
          JSON.stringify(r.amountLabels || {}),
          JSON.stringify(r.extraAmounts || {})
        ])
      );
    }
    return insertMany(
      client,
      'financial_aged_lines',
      [
        'snapshot_id',
        'line_no',
        'account',
        'account_label',
        'party_id',
        'party_label',
        'piece',
        'piece_type',
        'before_121',
        'm91_120',
        'm61_90',
        'm46_60',
        'm31_45',
        'm1_30',
        'due',
        'p1_30',
        'p31_45',
        'p46_60',
        'p61_90',
        'p91_120',
        'p121_plus',
        'not_due',
        'total'
      ],
      rows.map((r) => [
        snapshotId,
        r.line,
        r.account,
        r.accountLabel,
        r.partyId,
        r.partyLabel,
        r.piece,
        r.pieceType,
        ...r.amounts
      ])
    );
  }

  async createYgpie1Snapshot(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into ygpie1_snapshots(opale_entity,snapshot_date,source_filename,row_count) values($1,$2,$3,$4) returning *',
        [...values]
      )
    ).rows[0];
  }

  async insertYgpie1Rows(client: PoolClient, snapshotId: number, entity: string, rows: any[]) {
    return insertMany(
      client,
      'ygpie1_pieces',
      [
        'snapshot_id',
        'line_no',
        'piece',
        'installment',
        'piece_type',
        'due_date',
        'account',
        'main_party',
        'debit_balance',
        'credit_balance',
        'debit_amount',
        'credit_amount',
        'opale_entity',
        'state',
        'reference',
        'label',
        'movement_type',
        'entry_no',
        'initial_due_date',
        'value_date',
        'party',
        'balance_indicator',
        'settlement_date',
        'created_source_date',
        'modified_source_date',
        'raw_data'
      ],
      rows.map((r) => [
        snapshotId,
        r.line,
        r.piece,
        r.installment,
        r.pieceType,
        r.dueDate,
        r.account,
        r.mainParty,
        r.debitBalance,
        r.creditBalance,
        r.debitAmount,
        r.creditAmount,
        entity,
        r.state,
        r.reference,
        r.label,
        r.movementType,
        r.entryNo,
        r.initialDueDate,
        r.valueDate,
        r.party,
        r.balanceIndicator,
        r.settlementDate,
        r.createdSourceDate,
        r.modifiedSourceDate,
        JSON.stringify(r.raw)
      ]),
      { chunkSize: 250 }
    );
  }

  async createAccountingImport(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into accounting_imports(opale_entity,source_filename,source_format,source_row_count,imported_row_count,period_from,period_to) values($1,$2,$3,$4,$5,$6,$7) returning *',
        [...values]
      )
    ).rows[0];
  }

  async upsertAccountingRows(client: PoolClient, importId: number, entity: string, rows: any[]) {
    const keys = rows.map((r) => ({ periodDate: r.periodDate, account: r.account, journal: r.journal }));
    const existing = keys.length
      ? (
          await client.query(
            `select a.period_date,a.account,a.journal,a.debit,a.credit,a.account_label,a.movement_kind
       from accounting_lines a
       join jsonb_to_recordset($2::jsonb) as k(period_date date,account text,journal text)
         on a.period_date=k.period_date and a.account=k.account and a.journal=k.journal
       where a.opale_entity=$1`,
            [
              entity,
              JSON.stringify(keys.map((k) => ({ period_date: k.periodDate, account: k.account, journal: k.journal })))
            ]
          )
        ).rows
      : [];
    const previous = new Map(
      existing.map((r: any) => [
        `${r.period_date?.toISOString?.().slice(0, 10) ?? r.period_date}|${r.account}|${r.journal}`,
        r
      ])
    );
    let added = 0,
      updated = 0,
      unchanged = 0;
    for (const row of rows) {
      const key = `${row.periodDate}|${row.account}|${row.journal}`;
      const prev = previous.get(key);
      if (!prev) added++;
      else if (
        Number(prev.debit) === row.debit &&
        Number(prev.credit) === row.credit &&
        String(prev.account_label || '') === row.accountLabel &&
        String(prev.movement_kind) === row.movementKind
      )
        unchanged++;
      else updated++;
    }
    await insertMany(
      client,
      'accounting_lines',
      [
        'opale_entity',
        'period',
        'period_date',
        'journal',
        'account',
        'account_label',
        'debit',
        'credit',
        'movement',
        'movement_kind',
        'last_import_id',
        'raw_data'
      ],
      rows.map((r) => [
        entity,
        r.period,
        r.periodDate,
        r.journal,
        r.account,
        r.accountLabel,
        r.debit,
        r.credit,
        r.debit - r.credit,
        r.movementKind,
        importId,
        JSON.stringify(r.raw)
      ]),
      {
        chunkSize: 300,
        suffix:
          'on conflict(opale_entity,period_date,account,journal) do update set period=excluded.period,account_label=excluded.account_label,debit=excluded.debit,credit=excluded.credit,movement=excluded.movement,movement_kind=excluded.movement_kind,last_import_id=excluded.last_import_id,raw_data=excluded.raw_data,updated_at=now()'
      }
    );
    await client.query('update accounting_imports set added_count=$2,updated_count=$3,unchanged_count=$4 where id=$1', [
      importId,
      added,
      updated,
      unchanged
    ]);
    return { added, updated, unchanged };
  }

  async createFdrSnapshot(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into fdr_snapshots(establishment_name,snapshot_date,source_filename,row_count) values($1,$2,$3,$4) returning *',
        [...values]
      )
    ).rows[0];
  }

  async insertFdrRows(client: PoolClient, snapshotId: number, rows: any[]) {
    return insertMany(
      client,
      'fdr_lines',
      ['snapshot_id', 'exercise', 'amount', 'direction', 'is_final', 'establishment', 'state', 'source_modified_at'],
      rows.map((r) => [
        snapshotId,
        r.exercise,
        r.amount,
        r.direction,
        r.isFinal,
        r.establishment,
        r.state,
        r.sourceModifiedAt
      ])
    );
  }

  async createPurchaseSnapshot(client: PoolClient, values: readonly unknown[]) {
    return (
      await client.query(
        'insert into purchase_snapshots(establishment_name,snapshot_date,source_filename,row_count,rejected_row_count) values($1,$2,$3,$4,$5) returning *',
        [...values]
      )
    ).rows[0];
  }

  async insertPurchaseRows(client: PoolClient, snapshotId: number, rows: any[]) {
    return insertMany(
      client,
      'purchase_lines',
      [
        'snapshot_id',
        'line_no',
        'establishment',
        'order_number',
        'internal_order_number',
        'sub_number',
        'market',
        'supplier',
        'order_date',
        'currency',
        'order_line',
        'stage',
        'article',
        'article_label',
        'quantity',
        'received_quantity',
        'receipt_date',
        'invoiced_quantity',
        'warehouse',
        'expected_delivery_date',
        'purchase_mode',
        'receipt_balance_quantity',
        'invoice_balance_quantity',
        'ordered_price',
        'received_price',
        'invoice_price',
        'invoice_amount',
        'account',
        'cgr_a',
        'cgr_b',
        'creator',
        'modifier',
        'raw_data'
      ],
      rows.map((r) => [
        snapshotId,
        r.line,
        r.establishment,
        r.orderNumber,
        r.internalOrderNumber,
        r.subNumber,
        r.market,
        r.supplier,
        r.orderDate,
        r.currency,
        r.orderLine,
        r.stage,
        r.article,
        r.articleLabel,
        r.quantity,
        r.receivedQuantity,
        r.receiptDate,
        r.invoicedQuantity,
        r.warehouse,
        r.expectedDeliveryDate,
        r.purchaseMode,
        r.receiptBalanceQuantity,
        r.invoiceBalanceQuantity,
        r.orderedPrice,
        r.receivedPrice,
        r.invoicePrice,
        r.invoiceAmount,
        r.account,
        r.cgrA,
        r.cgrB,
        r.creator,
        r.modifier,
        JSON.stringify(r.raw)
      ]),
      { chunkSize: 150 }
    );
  }
}
