import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { budgetSignal, budgetTrajectoryTarget } from './imports/import-parsers.js';
/** Registers the cross-domain analysis endpoint. */
export function registerAnalysisRoutes(app: FastifyInstance, pool: Pool, VERSION: string) {
  app.get('/api/analysis', async () => {
    const latestBalance =
      (await pool.query('select * from balance_snapshots order by snapshot_date desc,created_at desc limit 1'))
        .rows[0] || null;
    const latestBudget =
      (await pool.query('select * from budget_snapshots order by snapshot_date desc,created_at desc limit 1'))
        .rows[0] || null;
    const latestPurchase =
      (await pool.query('select * from purchase_snapshots order by snapshot_date desc,created_at desc limit 1'))
        .rows[0] || null;
    const latestFdr =
      (await pool.query('select * from fdr_snapshots order by snapshot_date desc,created_at desc limit 1')).rows[0] ||
      null;
    const signals: any[] = [];
    const metrics: any = {};
    if (latestBudget) {
      const q = (
        await pool.query(
          'select coalesce(sum(budget),0) budget,coalesce(sum(committed),0) committed,coalesce(sum(accounted),0) accounted,coalesce(sum(in_progress),0) in_progress,coalesce(sum(available),0) available from budget_lines where snapshot_id=$1',
          [latestBudget.id]
        )
      ).rows[0];
      Object.assign(metrics, {
        budget: { ...q, snapshotDate: latestBudget.snapshot_date, establishment: latestBudget.establishment_name }
      });
      const b = Number(q.budget),
        committed = Number(q.committed),
        avail = Number(q.available);
      if (b > 0) {
        metrics.budget.executionRate = committed / b;
        metrics.budget.engagementRate = committed / b;
        metrics.budget.trajectoryTarget = budgetTrajectoryTarget(latestBudget.snapshot_date);
        const sig = budgetSignal(q, latestBudget.snapshot_date);
        if (sig) signals.push(sig);
      }
      metrics.budget.availableRate = b ? avail / b : null;
    }
    if (latestPurchase) {
      const q = (
        await pool.query(
          `select count(*)::int lines,coalesce(sum(abs(invoice_amount)),0) invoiced,coalesce(sum(abs(ordered_price*quantity)),0) ordered,coalesce(sum(case when order_date < current_date-60 and abs(invoice_balance_quantity)>.0001 then 1 else 0 end),0)::int old_uninvoiced,coalesce(sum(case when receipt_date is not null and abs(invoice_balance_quantity)>.0001 then 1 else 0 end),0)::int received_uninvoiced from purchase_lines where snapshot_id=$1`,
          [latestPurchase.id]
        )
      ).rows[0];
      metrics.purchases = {
        ...q,
        snapshotDate: latestPurchase.snapshot_date,
        establishment: latestPurchase.establishment_name
      };
      if (Number(q.old_uninvoiced) > 0)
        signals.push({
          code: 'ACH-OLD',
          level: 'watch',
          domain: 'Achats',
          title: 'Commandes anciennes restant à facturer',
          detail: `${q.old_uninvoiced} ligne(s) de commande de plus de 60 jours présentent encore un solde de facturation.`,
          count: Number(q.old_uninvoiced)
        });
      if (Number(q.received_uninvoiced) > 0)
        signals.push({
          code: 'ACH-REC',
          level: 'watch',
          domain: 'Achats',
          title: 'Réceptions restant à rapprocher de la facturation',
          detail: `${q.received_uninvoiced} ligne(s) réceptionnée(s) présentent encore un solde de facturation.`,
          count: Number(q.received_uninvoiced)
        });
    }
    if (latestBalance) {
      const a = (
        await pool.query(
          "select severity,title,detail,account,amount,rule_code from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end,abs(amount) desc limit 25",
          [latestBalance.id]
        )
      ).rows;
      metrics.accounting = {
        snapshotDate: latestBalance.snapshot_date,
        establishment: latestBalance.establishment_name,
        signalCount: a.length
      };
      for (const x of a)
        signals.push({
          code: x.rule_code,
          level: x.severity,
          domain: 'Comptabilité générale',
          title: x.title,
          detail: x.detail,
          account: x.account,
          amount: Number(x.amount)
        });
    }
    if (latestFdr) {
      const f = (
        await pool.query('select exercise,amount,is_final from fdr_lines where snapshot_id=$1 order by exercise desc', [
          latestFdr.id
        ])
      ).rows.map((x: any) => ({ ...x, amount: Number(x.amount) }));
      metrics.fdr = { history: f, snapshotDate: latestFdr.snapshot_date, establishment: latestFdr.establishment_name };
      if (f.length) {
        const cur = f[0],
          prev = f.find((x: any) => x.exercise === cur.exercise - 1);
        if (prev) {
          const variation = cur.amount - prev.amount,
            rate = prev.amount ? variation / prev.amount : null;
          metrics.fdr.variation = variation;
          metrics.fdr.variationRate = rate;
          metrics.fdr.comparisonNature = cur.is_final ? 'definitive' : 'provisional_vs_definitive';
          if (variation < 0)
            signals.push({
              code: 'FDR-DOWN',
              level: 'watch',
              domain: 'Santé financière',
              title: 'Fonds de roulement en diminution',
              detail: `FDR ${cur.exercise}${cur.is_final ? ' définitif' : ' provisoire'} : ${cur.amount.toFixed(2)} € ; ${prev.exercise} : ${prev.amount.toFixed(2)} €. Comparaison à interpréter selon le caractère définitif des situations.`,
              amount: variation
            });
        }
      }
    }
    const freshness = [
      ['Balance', latestBalance],
      ['Budget', latestBudget],
      ['CLCA', latestPurchase],
      ['FDR', latestFdr]
    ].map(([type, s]: any) => ({
      type,
      available: !!s,
      snapshotDate: s?.snapshot_date || null,
      establishment: s?.establishment_name || null
    }));
    const rank: any = { alert: 0, watch: 1, ok: 2 };
    signals.sort(
      (a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9) || Math.abs(b.amount || 0) - Math.abs(a.amount || 0)
    );
    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      metrics,
      signals,
      freshness,
      method: 'Règles déterministes et traçables ; une absence de donnée n’est jamais assimilée à zéro.'
    };
  });
}
