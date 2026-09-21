import type { Pool } from 'pg';
import { budgetTrajectoryTarget } from './imports/import-parsers.js';

type TrajectoryPoint = { date: string; month: number; value: number };

type ExpenseTrajectoryContext = {
  opaleEntity: string | null;
  uai: string | null;
  name: string;
  budgetSourceKey: string | null;
  purchaseEstablishment: string | null;
};

const isoDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const cumulative = (rows: any[], exercise: number): TrajectoryPoint[] => {
  let total = 0;
  return rows
    .filter((row) => Number(row.exercise) === exercise)
    .sort((a, b) => Number(a.month) - Number(b.month))
    .map((row) => {
      total += Number(row.expenses || 0);
      const month = Number(row.month);
      const day = new Date(exercise, month, 0).getDate();
      return {
        date: `${exercise}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        month,
        value: total
      };
    });
};

/**
 * Builds the DEP trajectory without relying on historical YCONSDEP snapshots.
 * CLCA provides chronology; the latest YCONSDEP anchors the current situation.
 */
export async function buildExpenseTrajectory(pool: Pool, context: ExpenseTrajectoryContext) {
  const entity = context.opaleEntity || context.budgetSourceKey;
  if (!entity) return null;

  const depSnapshot = (
    await pool.query(
      `select id,to_char(snapshot_date,'YYYY-MM-DD') snapshot_date,exercise
       from financial_snapshots
       where upper(opale_entity)=upper($1)
         and source_type='YCONSDEP'
       order by coalesce(exercise,extract(year from snapshot_date)::int) desc,
                snapshot_date desc,created_at desc,id desc
       limit 1`,
      [entity]
    )
  ).rows[0];
  if (!depSnapshot) return null;

  const execution = (
    await pool.query(
      `select coalesce(sum(budget),0) budget,
              coalesce(sum(committed),0) committed,
              coalesce(sum(accounted),0) accounted
       from financial_execution_lines
       where snapshot_id=$1`,
      [depSnapshot.id]
    )
  ).rows[0];

  const snapshotDate = isoDate(depSnapshot.snapshot_date);
  if (!snapshotDate) return null;

  const exercise = Number(depSnapshot.exercise) || Number(snapshotDate.slice(0, 4));
  const budget = Math.abs(Number(execution.budget || 0));
  const committed = Math.abs(Number(execution.committed || 0));
  const accounted = Math.abs(Number(execution.accounted || 0));

  const keys = [
    context.opaleEntity,
    context.uai,
    context.name,
    context.purchaseEstablishment
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase());

  const rows = keys.length
    ? (
        await pool.query(
          `select extract(year from pl.order_date)::int exercise,
                  extract(month from pl.order_date)::int month,
                  coalesce(sum(case
                    when coalesce(pl.invoice_amount,0)>=0
                      then abs(coalesce(pl.invoice_amount,0))
                    else 0
                  end),0) expenses
           from purchase_lines pl
           join purchase_snapshots ps on ps.id=pl.snapshot_id
           where pl.order_date is not null
             and (
               upper(coalesce(pl.establishment,''))=any($1::text[])
               or upper(coalesce(ps.establishment_name,''))=any($1::text[])
             )
             and extract(year from pl.order_date) between $2 and $3
           group by 1,2
           order by 1,2`,
          [keys, exercise - 1, exercise]
        )
      ).rows
    : [];

  const actual = cumulative(rows, exercise).filter((point) => point.date <= snapshotDate);
  const previous = cumulative(rows, exercise - 1);

  const snapshotMonth = Number(snapshotDate.slice(5, 7));
  const anchor = { date: snapshotDate, month: snapshotMonth, value: accounted };
  const sameMonth = actual.findIndex((point) => point.month === snapshotMonth);
  if (sameMonth >= 0) actual[sameMonth] = anchor;
  else actual.push(anchor);
  actual.sort((a, b) => a.month - b.month);

  const target = Math.max(0.15, Math.min(0.98, budgetTrajectoryTarget(snapshotDate)));
  const known = Math.max(accounted, committed);
  const pace = accounted / target;
  const central = Math.min(budget || Number.POSITIVE_INFINITY, Math.max(known, pace));
  const uncertainty = Math.max(0, central - accounted) * 0.18;

  const budgetReference = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const day = new Date(exercise, month, 0).getDate();
    const date = `${exercise}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { date, month, value: budget * budgetTrajectoryTarget(date) };
  });

  return {
    mode: 'DEP' as const,
    source: 'CLCA+YCONSDEP' as const,
    exercise,
    snapshotDate,
    actual,
    previous: previous.length ? { [String(exercise - 1)]: previous } : {},
    budgetReference,
    forecast: {
      low: Math.max(known, central - uncertainty),
      central,
      high: central + uncertainty
    },
    annualBudgetResult: budget
  };
}