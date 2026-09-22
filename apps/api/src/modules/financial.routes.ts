import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
interface Dependencies {
  pool: Pool;
  requireEstablishment: (req: any, reply: any, ets: string) => Promise<any | null>;
}
/** Registers financial, accounting, aged-balance and budget read endpoints. */
export function registerFinancialRoutes(app: FastifyInstance, dependencies: Dependencies) {
  const { pool, requireEstablishment } = dependencies;
  app.get('/api/clca/:ets/monthly', async (req: any, reply: any) => {
    try {
      const ets = String(req.params.ets || '').trim();
      const establishment = (
        await pool.query(
          'select * from establishments where upper(opale_entity)=upper($1) or upper(uai)=upper($1) or id::text=$1 limit 1',
          [ets]
        )
      ).rows[0];
      const keys = [ets, establishment?.opale_entity, establishment?.uai, establishment?.name]
        .filter(Boolean)
        .map((x: any) => String(x).trim());
      const q = (
        await pool.query(
          `select extract(year from pl.order_date)::int exercise,extract(month from pl.order_date)::int month,
   coalesce(sum(case when coalesce(pl.invoice_amount,0)>=0 then abs(coalesce(pl.invoice_amount,0)) else 0 end),0) expenses,
   coalesce(sum(case when coalesce(pl.invoice_amount,0)<0 then abs(coalesce(pl.invoice_amount,0)) else 0 end),0) revenues,
   count(*)::int lines
  from purchase_lines pl join purchase_snapshots ps on ps.id=pl.snapshot_id
  where pl.order_date is not null and (upper(coalesce(pl.establishment,''))=any($1::text[]) or upper(coalesce(ps.establishment_name,''))=any($1::text[]))
  group by 1,2 order by 1,2`,
          [keys.map((x) => x.toUpperCase())]
        )
      ).rows;
      const rows = q.map((r: any) => ({
        exercise: Number(r.exercise),
        month: Number(r.month),
        expenses: Number(r.expenses || 0),
        revenues: Number(r.revenues || 0),
        lines: Number(r.lines || 0)
      }));
      const exercises = [...new Set<number>(rows.map((r: any) => r.exercise))].sort((a, b) => b - a);
      return {
        source: 'CLCA',
        establishment: establishment
          ? {
              id: establishment.id,
              name: establishment.name,
              uai: establishment.uai,
              opaleEntity: establishment.opale_entity
            }
          : null,
        exercises,
        rows
      };
    } catch (e: any) {
      reply.code(500).send({ error: e.message });
    }
  });

  app.get('/api/financial/:ets', async (req: any, reply: any) => {
    try {
      const ets = String(req.params.ets || '').trim();
      const establishment = await requireEstablishment(req, reply, ets);
      if (!establishment) return;
      const entity = String(establishment.opale_entity || ets);
      const latest = async (type: string | string[]) => {
        const types = Array.isArray(type) ? type : [type];
        return (
          await pool.query(
            `select * from financial_snapshots where upper(opale_entity)=upper($1) and source_type=$2 order by case when source_type='EBLC' then exercise end desc nulls last, case when source_type='EBLC' and coalesce(period_end,period) ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$' then split_part(coalesce(period_end,period),'/',1)::int end desc nulls last, snapshot_date desc,created_at desc limit 1`,
            [entity, type]
          )
        ).rows[0] || null;
      };
      const [eblc, depSnap, recSnap, clientSnap, supplierSnap] = await Promise.all([
        latest('EBLC'),
        latest(['YECBUD', 'YCONSDEP']),
        latest(['YECBUR', 'YCONSREC']),
        latest('YBALAC'),
        latest('YBALAF')
      ]);
      const execution = async (snap: any) => {
        if (!snap) return null;
        const q = (
          await pool.query(
            `select coalesce(sum(budget),0) budget,coalesce(sum(committed),0) committed,coalesce(sum(accounted),0) accounted,coalesce(sum(in_progress),0) in_progress,coalesce(sum(available),0) available from financial_execution_lines where snapshot_id=$1`,
            [snap.id]
          )
        ).rows[0];
        return Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Number(v || 0)]));
      };
      const aged = async (snap: any) => {
        if (!snap) return null;
        const q = (
          await pool.query(
            `select coalesce(sum(total),0) total,coalesce(sum(due),0) due,coalesce(sum(before_121),0) old,coalesce(sum(not_due),0) not_due from financial_aged_lines where snapshot_id=$1`,
            [snap.id]
          )
        ).rows[0];
        return {
          snapshotDate: snap.snapshot_date,
          sourceFilename: snap.source_filename,
          total: Number(q.total || 0),
          due: Number(q.due || 0),
          old: Number(q.old || 0),
          notDue: Number(q.not_due || 0)
        };
      };
      const [expenses, revenues, receivables, payables] = await Promise.all([
        execution(depSnap),
        execution(recSnap),
        aged(clientSnap),
        aged(supplierSnap)
      ]);
      // SRH : lecture factuelle de l'exécution du service spécial. Le résultat courant est la différence
      // entre recettes et dépenses comptabilisées. Pour les denrées, le compte 601100 est la référence
      // comptable ; les activités (0DENR, 0CRED, etc.) ne sont qu'un niveau de ventilation.
      const srhExecution = async (snap: any) => {
        if (!snap) return null;
        const q = (
          await pool.query(
            `select
  coalesce(sum(budget),0) budget,
  coalesce(sum(accounted),0) accounted,
  coalesce(sum(case when trim(coalesce(account,'')) = '601100' then budget else 0 end),0) food_budget,
  coalesce(sum(case when trim(coalesce(account,'')) = '601100' then accounted else 0 end),0) food_accounted
  from financial_execution_lines where snapshot_id=$1 and upper(trim(coalesce(service,'')))='SRH'`,
            [snap.id]
          )
        ).rows[0];
        return {
          budget: Number(q.budget || 0),
          accounted: Number(q.accounted || 0),
          foodBudget: Number(q.food_budget || 0),
          foodAccounted: Number(q.food_accounted || 0)
        };
      };
      const [srhDep, srhRec] = await Promise.all([srhExecution(depSnap), srhExecution(recSnap)]);
      const srh =
        srhDep || srhRec
          ? {
              exercise: Number(depSnap?.exercise || recSnap?.exercise || new Date().getFullYear()),
              period: depSnap?.period_end || depSnap?.period || recSnap?.period_end || recSnap?.period || null,
              expenses: srhDep?.accounted ?? 0,
              revenues: srhRec?.accounted ?? 0,
              expenseBudget: srhDep?.budget ?? 0,
              revenueBudget: srhRec?.budget ?? 0,
              foodExpenses: srhDep?.foodAccounted ?? 0,
              foodCredit: srhDep?.foodBudget ?? 0,
              foodRemaining: Math.max(0, (srhDep?.foodBudget ?? 0) - (srhDep?.foodAccounted ?? 0)),
              foodOverrun: Math.max(0, (srhDep?.foodAccounted ?? 0) - (srhDep?.foodBudget ?? 0)),
              result: (srhRec?.accounted ?? 0) - (srhDep?.accounted ?? 0),
              coverage: (srhDep?.accounted ?? 0) > 0 ? (srhRec?.accounted ?? 0) / (srhDep?.accounted ?? 0) : null
            }
          : null;
      let balance: any = null;
      if (eblc) {
        const q = (
          await pool.query(
            `select
  coalesce(sum(case when account ~ '^[67]' then credit-debit else 0 end),0) result,
  coalesce(sum(case when account like '68%' then debit-credit else 0 end),0) c68,
  coalesce(sum(case when account like '78%' then credit-debit else 0 end),0) c78,
  coalesce(sum(case when account like '675%' then debit-credit else 0 end),0) c675,
  coalesce(sum(case when account like '775%' then credit-debit else 0 end),0) c775,
  coalesce(sum(case when account like '776%' then credit-debit else 0 end),0) c776,
  coalesce(sum(case when account like '777%' then credit-debit else 0 end),0) c777,
  coalesce(sum(case when account like '4%' then debit-credit else 0 end),0) bfr,
  coalesce(sum(case when account ~ '^41[1-8]' then greatest(debit-credit,0) else 0 end),0) tnr_receivables,
  coalesce(sum(case when account like '70%' then credit-debit else 0 end),0) tnr_revenue
 from financial_balance_lines where snapshot_id=$1`,
            [eblc.id]
          )
        ).rows[0];
        const result = Number(q.result || 0),
          caf =
            result +
            Number(q.c68 || 0) -
            Number(q.c78 || 0) +
            Number(q.c675 || 0) -
            Number(q.c775 || 0) -
            Number(q.c776 || 0) -
            Number(q.c777 || 0);
        balance = {
          snapshotDate: eblc.snapshot_date,
          exercise: eblc.exercise,
          period: eblc.period,
          result,
          caf,
          cafKind: caf >= 0 ? 'CAF' : 'IAF',
          cafBreakdown: {
            result,
            c68: Number(q.c68 || 0),
            c78: Number(q.c78 || 0),
            c675: Number(q.c675 || 0),
            c775: Number(q.c775 || 0),
            c776: Number(q.c776 || 0),
            c777: Number(q.c777 || 0)
          },
          bfr: Number(q.bfr || 0),
          tnrReceivables: Number(q.tnr_receivables || 0),
          tnrRevenue: Number(q.tnr_revenue || 0),
          tnr:
            Number(q.tnr_revenue || 0) > 0 ? (Number(q.tnr_receivables || 0) / Number(q.tnr_revenue || 0)) * 100 : null
        };
      }
      const fdrSnap = (
        await pool.query(
          `select * from fdr_snapshots where establishment_name=$1 or establishment_name=$2 order by snapshot_date desc,created_at desc limit 1`,
          [establishment.name, entity]
        )
      ).rows[0];
      let fdr: any = null,
        fdrHistory: any[] = [];
      if (fdrSnap) {
        fdrHistory = (
          await pool.query('select exercise,amount,is_final from fdr_lines where snapshot_id=$1 order by exercise', [
            fdrSnap.id
          ])
        ).rows.map((x: any) => ({ ...x, amount: Number(x.amount) }));
        const x = fdrHistory.at(-1);
        if (x) fdr = { ...x };
      }
      // Historique annuel : clôtures EBLC au 31/12 pour les exercices clos ; dernière EBLC disponible pour l'exercice courant.
      // Résultat = crédits nets - débits nets des classes 6 et 7. Trésorerie = solde débiteur net du 5151. BFR = FDR - trésorerie.
      const currentYear = new Date().getFullYear();
      const eblcAnnual = (
        await pool.query(
          `select distinct on (exercise) id,exercise,snapshot_date,period,period_start,period_end from financial_snapshots where upper(opale_entity)=upper($1) and source_type='EBLC' and exercise is not null and (exercise=$2 or split_part(coalesce(period_end,period,''),'/',1)='12') order by exercise, case when coalesce(period_end,period) ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$' then split_part(coalesce(period_end,period),'/',1)::int else 0 end desc, snapshot_date desc,created_at desc`,
          [entity, currentYear]
        )
      ).rows;
      const fdrByYear = new Map(fdrHistory.map((x: any) => [Number(x.exercise), x]));
      const indicatorHistory: any[] = [];
      for (const snap of eblcAnnual) {
        const q = (
          await pool.query(
            `select
  coalesce(sum(case when account ~ '^[67]' then credit-debit else 0 end),0) result,
  coalesce(sum(case when account like '68%' then debit-credit else 0 end),0) c68,
  coalesce(sum(case when account like '78%' then credit-debit else 0 end),0) c78,
  coalesce(sum(case when account like '675%' then debit-credit else 0 end),0) c675,
  coalesce(sum(case when account like '775%' then credit-debit else 0 end),0) c775,
  coalesce(sum(case when account like '776%' then credit-debit else 0 end),0) c776,
  coalesce(sum(case when account like '777%' then credit-debit else 0 end),0) c777,
  coalesce(sum(case when account='5151' or account like '5151%' then debit-credit else 0 end),0) treasury,
  coalesce(sum(case when account ~ '^(60|61|62|63|64|65)' then debit-credit else 0 end),0) operating_charges
 from financial_balance_lines where snapshot_id=$1`,
            [snap.id]
          )
        ).rows[0];
        const year = Number(snap.exercise),
          f = fdrByYear.get(year),
          treasury = Number(q.treasury || 0),
          result = Number(q.result || 0),
          caf =
            result +
            Number(q.c68 || 0) -
            Number(q.c78 || 0) +
            Number(q.c675 || 0) -
            Number(q.c775 || 0) -
            Number(q.c776 || 0) -
            Number(q.c777 || 0),
          operatingCharges = Number(q.operating_charges || 0),
          fdrAmount = f ? Number(f.amount) : null,
          fdrDays = fdrAmount != null && operatingCharges > 0 ? (fdrAmount / operatingCharges) * 360 : null,
          treasuryDays = operatingCharges > 0 ? (treasury / operatingCharges) * 360 : null;
        indicatorHistory.push({
          exercise: year,
          snapshotDate: snap.snapshot_date,
          periodStart: snap.period_start || null,
          periodEnd: snap.period_end || snap.period || null,
          isCurrent: year === currentYear,
          isFinal: year < currentYear && String(snap.period_end || snap.period || '').startsWith('12/'),
          fdr: fdrAmount,
          fdrFinal: f ? !!f.is_final : false,
          fdrDays,
          operatingCharges,
          treasury,
          treasuryDays,
          result,
          caf,
          cafKind: caf >= 0 ? 'CAF' : 'IAF',
          cafBreakdown: {
            result,
            c68: Number(q.c68 || 0),
            c78: Number(q.c78 || 0),
            c675: Number(q.c675 || 0),
            c775: Number(q.c775 || 0),
            c776: Number(q.c776 || 0),
            c777: Number(q.c777 || 0)
          },
          bfr: fdrAmount == null ? null : fdrAmount - treasury
        });
      }
      // YFDR peut contenir des exercices pour lesquels aucune EBLC de clôture n'est encore importée : on conserve au moins la courbe FDR.
      for (const x of fdrHistory) {
        const year = Number(x.exercise);
        if (!indicatorHistory.some((r: any) => r.exercise === year))
          indicatorHistory.push({
            exercise: year,
            snapshotDate: null,
            isCurrent: year === currentYear,
            isFinal: !!x.is_final,
            fdr: Number(x.amount),
            fdrFinal: !!x.is_final,
            fdrDays: null,
            operatingCharges: null,
            treasury: null,
            treasuryDays: null,
            result: null,
            caf: null,
            cafKind: null,
            bfr: null
          });
      }
      indicatorHistory.sort((a: any, b: any) => a.exercise - b.exercise);
      const executionHistory: any = { expenses: [], revenues: [] };
      for (const [sourceTypes, key] of [
        [['YECBUD', 'YCONSDEP'], 'expenses'],
        [['YECBUR', 'YCONSREC'], 'revenues']
      ] as const) {
        const snaps = (
          await pool.query(
            `select id,exercise,snapshot_date,period,period_end,created_at from financial_snapshots where upper(opale_entity)=upper($1) and source_type=any($2::text[]) and exercise is not null order by exercise,snapshot_date,created_at`,
            [entity, sourceTypes]
          )
        ).rows;
        for (const snap of snaps) {
          const q = (
            await pool.query(
              `select coalesce(sum(accounted),0) accounted from financial_execution_lines where snapshot_id=$1`,
              [snap.id]
            )
          ).rows[0];
          executionHistory[key].push({
            exercise: Number(snap.exercise),
            snapshotDate: snap.snapshot_date,
            period: snap.period_end || snap.period || null,
            accounted: Number(q.accounted || 0)
          });
        }
      }
      return {
        establishment: { id: establishment.id, name: establishment.name, uai: establishment.uai, opaleEntity: entity },
        sources: {
          EBLC: eblc?.snapshot_date || null,
          YECBUD: depSnap?.snapshot_date || null,
          YECBUR: recSnap?.snapshot_date || null,
          YCONSDEP: depSnap?.snapshot_date || null,
          YCONSREC: recSnap?.snapshot_date || null,
          YBALAC: clientSnap?.snapshot_date || null,
          YBALAF: supplierSnap?.snapshot_date || null
        },
        executionHistory,
        expenses,
        revenues,
        receivables,
        payables,
        balance,
        fdr,
        fdrHistory,
        indicatorHistory,
        srh
      };
    } catch (e: any) {
      req.log.error(e);
      return reply.code(400).send({ error: e.message || 'Analyse financière impossible' });
    }
  });

  app.get('/api/financial/:ets/fdr-analysis', async (req: any, reply: any) => {
    try {
      const ets = String(req.params.ets || '').trim(),
        establishment = await requireEstablishment(req, reply, ets);
      if (!establishment) return;
      const entity = String(establishment.opale_entity || ets),
        exercise = Number(req.query?.exercise || new Date().getFullYear()),
        sourceExercise = exercise - 1;
      const eblc =
        (
          await pool.query(
            `select * from financial_snapshots where upper(opale_entity)=upper($1) and source_type='EBLC' and exercise=$2 and split_part(coalesce(period_end,period,''),'/',1)='12' order by snapshot_date desc,created_at desc limit 1`,
            [entity, sourceExercise]
          )
        ).rows[0] || null;
      let accounts: any = null;
      if (eblc) {
        const q = (
          await pool.query(
            `select
  coalesce(sum(case when account ~ '^(15|29|39|49|59)' then greatest(credit-debit,0) else 0 end),0) provisions,
  coalesce(sum(case when account like '165%' then greatest(credit-debit,0) else 0 end),0) cautions,
  coalesce(sum(case when account like '3%' then greatest(debit-credit,0) else 0 end),0) stocks,
  coalesce(sum(case when account like '416%' then greatest(debit-credit,0) else 0 end),0) doubtful,
  coalesce(sum(case when account ~ '^6[0-5]' and account !~ '^658' then debit-credit else 0 end),0) class6
 from financial_balance_lines where snapshot_id=$1`,
            [eblc.id]
          )
        ).rows[0];
        accounts = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Number(v || 0)]));
      }
      const clientSnap =
        (
          await pool.query(
            `select * from financial_snapshots where upper(opale_entity)=upper($1) and source_type='YBALAC' order by snapshot_date desc,created_at desc limit 1`,
            [entity]
          )
        ).rows[0] || null;
      let aged: any = null;
      if (clientSnap) {
        const q = (
          await pool.query(
            `select coalesce(sum(case when account not like '416%' then before_121 else 0 end),0) over120,coalesce(sum(case when account not like '416%' then total else 0 end),0) total from financial_aged_lines where snapshot_id=$1`,
            [clientSnap.id]
          )
        ).rows[0];
        aged = {
          snapshotDate: clientSnap.snapshot_date,
          sourceFilename: clientSnap.source_filename,
          over120: Number(q.over120 || 0),
          total: Number(q.total || 0),
          overOneYear: null,
          exactOverOneYear: false,
          reason:
            'Le YBALAC importé par Vigie distingue actuellement les créances de plus de 120 jours, mais pas le sous-ensemble de plus de 365 jours.'
        };
      }
      return {
        exercise,
        sourceExercise,
        eblc: eblc
          ? {
              snapshotDate: eblc.snapshot_date,
              period: eblc.period_end || eblc.period,
              sourceFilename: eblc.source_filename
            }
          : null,
        accounts,
        aged
      };
    } catch (e: any) {
      req.log.error(e);
      return reply.code(400).send({ error: e.message || 'Préparation de l’analyse du FdR impossible' });
    }
  });

  app.get('/api/accounting/:ets', async (req: any, reply: any) => {
    try {
      const ets = String(req.params.ets || '').trim(),
        establishment = await requireEstablishment(req, reply, ets);
      if (!establishment) return;
      const entity = String(establishment.opale_entity || ets);
      const imp =
        (
          await pool.query(
            `select * from accounting_imports where upper(opale_entity)=upper($1) order by period_to desc nulls last,created_at desc limit 1`,
            [entity]
          )
        ).rows[0] || null;
      const entries = (
        await pool.query(
          `select period,period_date,journal,account,account_label,debit,credit,movement,movement_kind,raw_data from accounting_lines where upper(opale_entity)=upper($1) order by period_date desc,account,journal limit 20000`,
          [entity]
        )
      ).rows.map((r: any) => ({
        period: r.period,
        periodDate: r.period_date,
        journal: r.journal,
        account: r.account,
        accountLabel: r.account_label,
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        movement: Number(r.movement || 0),
        movementKind: r.movement_kind,
        rawData: r.raw_data
      }));
      const accountMap = new Map<string, any>();
      for (const r of entries) {
        let a = accountMap.get(r.account);
        if (!a) {
          a = {
            account: r.account,
            label: r.accountLabel || '',
            debit: 0,
            credit: 0,
            balance: 0,
            entryCount: 0,
            lastDate: null,
            signalCount: 0
          };
          accountMap.set(r.account, a);
        }
        a.debit += r.debit;
        a.credit += r.credit;
        a.balance += r.movement;
        a.entryCount++;
        if (!a.lastDate || String(r.periodDate) > String(a.lastDate)) a.lastDate = r.periodDate;
      }
      let signals: any[] = [];
      const bal = (
        await pool.query(
          `select id from balance_snapshots where upper(coalesce(opale_entity,''))=upper($1) order by snapshot_date desc,created_at desc limit 1`,
          [entity]
        )
      ).rows[0];
      if (bal) {
        signals = (
          await pool.query(
            `select rule_code code,severity level,title,detail,account,amount from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end,abs(amount) desc`,
            [bal.id]
          )
        ).rows.map((x: any) => ({ ...x, amount: Number(x.amount || 0) }));
        for (const x of signals) {
          const a = accountMap.get(x.account);
          if (a) a.signalCount++;
        }
      }
      const now = Date.now(),
        bucket = { d30: 0, d60: 0, d90: 0, old: 0 };
      for (const r of entries) {
        const d = Math.max(0, Math.floor((now - new Date(r.periodDate).getTime()) / 86400000));
        if (d <= 30) bucket.d30++;
        else if (d <= 60) bucket.d60++;
        else if (d <= 90) bucket.d90++;
        else bucket.old++;
      }
      const accounts = [...accountMap.values()].sort((a, b) => a.account.localeCompare(b.account));
      const ys =
        (
          await pool.query(
            `select * from ygpie1_snapshots where upper(opale_entity)=upper($1) order by created_at desc limit 1`,
            [entity]
          )
        ).rows[0] || null;
      let ygpie1: any = { available: false, pieces: [], accounts: [], summary: null };
      if (ys) {
        const pieces = (
          await pool.query(
            `select line_no,piece,installment,piece_type,due_date,account,main_party,debit_balance,credit_balance,debit_amount,credit_amount,state,reference,label,movement_type,entry_no,initial_due_date,value_date,party,balance_indicator,settlement_date,created_source_date,modified_source_date from ygpie1_pieces where snapshot_id=$1 order by coalesce(due_date,initial_due_date) asc,line_no`,
            [ys.id]
          )
        ).rows.map((r: any) => ({
          ...r,
          debitBalance: Number(r.debit_balance || 0),
          creditBalance: Number(r.credit_balance || 0),
          balance: Number(r.debit_balance || 0) - Number(r.credit_balance || 0),
          dueDate: r.due_date,
          initialDueDate: r.initial_due_date,
          mainParty: r.main_party,
          pieceType: r.piece_type,
          entryNo: r.entry_no,
          movementType: r.movement_type
        }));
        const age = { d30: 0, d60: 0, d90: 0, old: 0 },
          am = { d30: 0, d60: 0, d90: 0, old: 0 };
        const by = new Map<string, any>();
        for (const r of pieces) {
          const dt = r.dueDate || r.initialDueDate;
          const days = dt ? Math.max(0, Math.floor((Date.now() - new Date(dt).getTime()) / 86400000)) : 0;
          const k = days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'old';
          age[k]++;
          am[k] += Math.abs(r.balance);
          let a = by.get(r.account);
          if (!a) {
            a = {
              account: r.account,
              pieceCount: 0,
              debitBalance: 0,
              creditBalance: 0,
              balance: 0,
              oldestDueDate: null,
              oldOver90: 0
            };
            by.set(r.account, a);
          }
          a.pieceCount++;
          a.debitBalance += r.debitBalance;
          a.creditBalance += r.creditBalance;
          a.balance += r.balance;
          if (dt && (!a.oldestDueDate || String(dt) < String(a.oldestDueDate))) a.oldestDueDate = dt;
          if (days > 90) a.oldOver90 += Math.abs(r.balance);
        }
        ygpie1 = {
          available: true,
          source: { snapshotDate: ys.snapshot_date, sourceFilename: ys.source_filename, rowCount: ys.row_count },
          summary: {
            pieceCount: pieces.length,
            netBalance: pieces.reduce((n: number, r: any) => n + r.balance, 0),
            absoluteBalance: pieces.reduce((n: number, r: any) => n + Math.abs(r.balance), 0),
            ageBuckets: age,
            ageAmounts: am,
            accountsCount: by.size
          },
          accounts: [...by.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
          pieces
        };
      }
      return {
        establishment: { name: establishment.name, uai: establishment.uai, opaleEntity: entity },
        source: imp
          ? {
              periodFrom: imp.period_from,
              periodTo: imp.period_to,
              sourceFilename: imp.source_filename,
              sourceFormat: imp.source_format
            }
          : null,
        summary: {
          entryCount: entries.length,
          accountCount: accounts.length,
          accountsToControl: accounts.filter((a) => a.signalCount).length,
          oldEntries: bucket.old,
          ageBuckets: bucket
        },
        accounts,
        entries,
        signals,
        ygpie1
      };
    } catch (e: any) {
      req.log.error(e);
      return reply.code(400).send({ error: e.message || 'Exploration comptable impossible' });
    }
  });

  app.get('/api/aged/:ets/:kind', async (req: any, reply: any) => {
    try {
      const ets = String(req.params.ets || '').trim(),
        kind = String(req.params.kind || '').toLowerCase();
      const establishment = await requireEstablishment(req, reply, ets);
      if (!establishment) return;
      if (!['clients', 'suppliers'].includes(kind))
        return reply.code(400).send({ error: 'Vue de balance âgée inconnue.' });
      const entity = String(establishment.opale_entity || ets),
        sourceType = kind === 'clients' ? 'YBALAC' : 'YBALAF',
        requestedExercise = Number(req.query?.exercise || 0) || null;
      const availableExercises = (
        await pool.query(
          `select distinct coalesce(exercise,extract(year from snapshot_date)::int) exercise from financial_snapshots where upper(opale_entity)=upper($1) and source_type=$2 order by 1 desc`,
          [entity, sourceType]
        )
      ).rows
        .map((r: any) => Number(r.exercise))
        .filter(Number.isInteger);
      const effectiveExercise = requestedExercise ?? availableExercises[0] ?? null;
      const snap = (
        await pool.query(
          `select * from financial_snapshots where upper(opale_entity)=upper($1) and source_type=$2 and ($3::int is null or coalesce(exercise,extract(year from snapshot_date)::int)=$3) order by snapshot_date desc,created_at desc limit 1`,
          [entity, sourceType, effectiveExercise]
        )
      ).rows[0];
      if (!snap)
        return {
          establishment: { name: establishment.name, opaleEntity: entity },
          sourceType,
          availableExercises,
          effectiveExercise,
          snapshot: null,
          summary: null,
          rows: []
        };
      const rows = (
        await pool.query(
          `select line_no,account,account_label,party_id,party_label,piece,piece_type,before_121,m91_120,m61_90,m46_60,m31_45,m1_30,due,p1_30,p31_45,p46_60,p61_90,p91_120,p121_plus,not_due,total from financial_aged_lines where snapshot_id=$1 order by abs(total) desc,line_no`,
          [snap.id]
        )
      ).rows.map((r: any) =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [
            k,
            ['line_no', 'account', 'account_label', 'party_id', 'party_label', 'piece', 'piece_type'].includes(k)
              ? v
              : Number(v || 0)
          ])
        )
      );
      const summary = rows.reduce(
        (a: any, r: any) => ({
          total: a.total + r.total,
          due: a.due + r.due,
          old: a.old + r.before_121,
          notDue: a.notDue + r.not_due
        }),
        { total: 0, due: 0, old: 0, notDue: 0 }
      );
      return {
        establishment: { name: establishment.name, opaleEntity: entity },
        sourceType,
        availableExercises,
        effectiveExercise,
        snapshot: {
          id: snap.id,
          snapshotDate: snap.snapshot_date,
          sourceFilename: snap.source_filename,
          rowCount: snap.row_count
        },
        summary,
        rows
      };
    } catch (e: any) {
      req.log.error(e);
      return reply.code(400).send({ error: e.message || 'Balance âgée impossible' });
    }
  });

  app.get('/api/budget/:ets', async (req: any, reply: any) => {
    try {
      const ets = String(req.params.ets || '').trim();
      const establishment = await requireEstablishment(req, reply, ets);
      if (!establishment) return;
      const entity = String(establishment.opale_entity || ets);
      const requestedExercise = Number(req.query?.exercise || 0) || null;
      const availableExercises = (
        await pool.query(
          `select distinct extract(year from snapshot_date)::int exercise from budget_snapshots where upper(coalesce(opale_entity,''))=upper($1) and snapshot_date is not null order by exercise desc`,
          [entity]
        )
      ).rows.map((r: any) => Number(r.exercise));
      const effectiveExercise =
        requestedExercise && availableExercises.includes(requestedExercise)
          ? requestedExercise
          : (availableExercises[0] ?? null);
      const snap = (
        await pool.query(
          `select * from budget_snapshots where upper(coalesce(opale_entity,''))=upper($1) and ($2::int is null or extract(year from snapshot_date)::int=$2) order by snapshot_date desc,created_at desc limit 1`,
          [entity, effectiveExercise]
        )
      ).rows[0];
      if (!snap)
        return {
          establishment: {
            id: establishment.id,
            uai: establishment.uai,
            name: establishment.name,
            opaleEntity: establishment.opale_entity
          },
          availableExercises,
          snapshot: null,
          summary: null,
          services: [],
          rows: [],
          signals: []
        };
      const lines = (
        await pool.query(
          `select line_no,raw_dimensions,budget,committed,accounted,in_progress,available from budget_lines where snapshot_id=$1 order by line_no`,
          [snap.id]
        )
      ).rows;
      const n = (v: any) => Number(v || 0),
        metric = (xs: any[]) =>
          xs.reduce(
            (a: any, x: any) => ({
              budget: a.budget + n(x.budget),
              committed: a.committed + n(x.committed),
              accounted: a.accounted + n(x.accounted),
              inProgress: a.inProgress + n(x.in_progress),
              available: a.available + n(x.available)
            }),
            { budget: 0, committed: 0, accounted: 0, inProgress: 0, available: 0 }
          );
      const dims = (x: any) => (typeof x.raw_dimensions === 'string' ? JSON.parse(x.raw_dimensions) : x.raw_dimensions);
      const parsed = lines.map((x: any) => {
        const d = dims(x);
        if (!d || Array.isArray(d))
          return { ...x, dimension: { source: 'legacy', cgr: [], posts: [], account: '', accountLabel: '' } };
        return { ...x, dimension: d };
      });
      const direction = (x: any) =>
        String((x.dimension.posts || []).find((p: any) => p.level === 2)?.code || '')
          .trim()
          .toUpperCase();
      const dep = parsed.filter((x: any) => direction(x) === 'DEP'),
        rec = parsed.filter((x: any) => direction(x) === 'REC'),
        other = parsed.filter((x: any) => !['DEP', 'REC'].includes(direction(x)));
      const rawSummary = { expenses: metric(dep), revenues: metric(rec), unclassified: metric(other) };
      const positive = (m: any) => ({
        budget: Math.abs(m.budget),
        committed: Math.abs(m.committed),
        accounted: Math.abs(m.accounted),
        inProgress: Math.abs(m.inProgress),
        available: Math.abs(m.available)
      });
      const summary = {
        expenses: positive(rawSummary.expenses),
        revenues: positive(rawSummary.revenues),
        unclassified: rawSummary.unclassified
      };
      const scopeKey = (x: any) => {
        const path = x.dimension.cgr || [],
          l2 = path.find((p: any) => p.level === 2),
          l3 = path.find((p: any) => p.level === 3);
        return {
          code: String(l3?.code || l2?.code || 'AUTRE').trim(),
          label: String(l3?.label || l2?.label || 'Autre').trim(),
          section: String(l2?.code || '').trim()
        };
      };
      const scopesMap = new Map<string, any>();
      for (const x of parsed) {
        const sk = scopeKey(x),
          dir = direction(x);
        if (!['DEP', 'REC'].includes(dir)) continue;
        if (!scopesMap.has(sk.code)) scopesMap.set(sk.code, { ...sk, dep: [], rec: [] });
        scopesMap.get(sk.code)[dir === 'DEP' ? 'dep' : 'rec'].push(x);
      }
      const scopes = [...scopesMap.values()]
        .map((x: any) => {
          const expenses = positive(metric(x.dep)),
            revenues = positive(metric(x.rec)),
            balance = revenues.budget - expenses.budget;
          return {
            code: x.code,
            label: x.label,
            section: x.section,
            expenses,
            revenues,
            balance,
            financingNeed: Math.max(0, -balance),
            surplus: Math.max(0, balance)
          };
        })
        .sort((a: any, b: any) => {
          const order = (x: string) => (x === 'SG' ? 0 : x === 'SS' ? 1 : x === 'OPECAP' ? 2 : 9);
          return order(a.code) - order(b.code) || a.code.localeCompare(b.code, 'fr');
        });
      const totals = {
        expenses: summary.expenses,
        revenues: summary.revenues,
        balance: summary.revenues.budget - summary.expenses.budget
      };
      const cleanCode = (code: string, parent?: string) => {
        let x = String(code || '')
          .replace(/\s+/g, ' ')
          .trim();
        const p = String(parent || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (p && x.startsWith(p)) x = x.slice(p.length).trim();
        return x || String(code || '').trim();
      };
      const servicesMap = new Map<string, any>();
      for (const x of parsed) {
        const path = x.dimension.cgr || [];
        const service = path.find((p: any) => p.level === 4) || path.at(-1);
        if (!service) continue;
        const key = String(service.code).trim(),
          dir = direction(x) || 'AUTRE';
        if (!servicesMap.has(key))
          servicesMap.set(key, { code: key, label: service.label || key, direction: dir, lines: [] });
        servicesMap.get(key).lines.push(x);
      }
      const services = [...servicesMap.values()]
        .map((s: any) => {
          const totalsRaw = metric(s.lines),
            totals = ['DEP', 'REC'].includes(s.direction) ? positive(totalsRaw) : totalsRaw;
          const childrenMap = new Map<string, any>();
          for (const x of s.lines) {
            const path = x.dimension.cgr || [],
              l5 = path.find((p: any) => p.level === 5),
              l6 = path.find((p: any) => p.level === 6);
            const k5 = l5 ? cleanCode(l5.code, s.code) : 'Sans domaine';
            if (!childrenMap.has(k5))
              childrenMap.set(k5, { code: k5, label: l5?.label || k5, lines: [], activities: new Map() });
            const c = childrenMap.get(k5);
            c.lines.push(x);
            const k6 = l6 ? cleanCode(l6.code, l5?.code) : null;
            if (k6) {
              if (!c.activities.has(k6)) c.activities.set(k6, { code: k6, label: l6?.label || k6, lines: [] });
              c.activities.get(k6).lines.push(x);
            }
          }
          return {
            ...s,
            ...totals,
            rate: totals.budget ? totals.committed / totals.budget : null,
            children: [...childrenMap.values()].map((c: any) => ({
              ...c,
              ...(['DEP', 'REC'].includes(s.direction) ? positive(metric(c.lines)) : metric(c.lines)),
              activities: [...c.activities.values()].map((a: any) => ({
                ...a,
                ...(['DEP', 'REC'].includes(s.direction) ? positive(metric(a.lines)) : metric(a.lines)),
                lines: undefined
              })),
              lines: undefined
            })),
            lines: undefined
          };
        })
        .sort((a: any, b: any) => a.code.localeCompare(b.code, 'fr'));
      const budgetServiceOrder = ['AP', 'VE', 'ALO', 'PAYE', 'SRH', 'OPC'];
      const budgetServices = budgetServiceOrder
        .map((code: string) => {
          const xs = parsed.filter(
            (x: any) =>
              String((x.dimension.cgr || []).find((p: any) => p.level === 4)?.code || '')
                .trim()
                .toUpperCase() === code
          );
          if (!xs.length) return null;
          const first = xs[0],
            path = first.dimension.cgr || [],
            service = path.find((p: any) => p.level === 4),
            l2 = path.find((p: any) => p.level === 2),
            l3 = path.find((p: any) => p.level === 3);
          const depLines = xs.filter((x: any) => direction(x) === 'DEP'),
            recLines = xs.filter((x: any) => direction(x) === 'REC');
          const side = (sideLines: any[]) => {
            const m = positive(metric(sideLines));
            const domains = new Map<string, any>();
            for (const x of sideLines) {
              const p = x.dimension.cgr || [],
                d5 = p.find((q: any) => q.level === 5),
                d6 = p.find((q: any) => q.level === 6);
              const dcode = cleanCode(String(d5?.code || 'Sans domaine'), code);
              if (!domains.has(dcode))
                domains.set(dcode, {
                  code: dcode,
                  label: String(d5?.label || dcode).trim(),
                  lines: [],
                  activities: new Map()
                });
              const d = domains.get(dcode);
              d.lines.push(x);
              if (d6) {
                const acode = cleanCode(String(d6.code || ''), String(d5?.code || ''));
                if (!d.activities.has(acode))
                  d.activities.set(acode, { code: acode, label: String(d6.label || acode).trim(), lines: [] });
                d.activities.get(acode).lines.push(x);
              }
            }
            return {
              ...m,
              rate: m.budget ? m.accounted / m.budget : null,
              domains: [...domains.values()].map((d: any) => {
                const dm = positive(metric(d.lines));
                return {
                  code: d.code,
                  label: d.label,
                  ...dm,
                  rate: dm.budget ? dm.accounted / dm.budget : null,
                  activities: [...d.activities.values()].map((a: any) => {
                    const am = positive(metric(a.lines));
                    return { code: a.code, label: a.label, ...am, rate: am.budget ? am.accounted / am.budget : null };
                  })
                };
              })
            };
          };
          const expenses = side(depLines),
            revenues = side(recLines),
            balance = revenues.budget - expenses.budget;
          return {
            code,
            label: String(service?.label || code).trim(),
            sectionCode: String(l2?.code || '').trim(),
            scopeCode: String(l3?.code || '').trim(),
            section: code === 'OPC' ? 'INVESTMENT' : code === 'SRH' ? 'SPECIAL' : 'OPERATING',
            expenses,
            revenues,
            balance
          };
        })
        .filter(Boolean);
      const signals = services
        .filter((s: any) => s.direction === 'DEP' && s.budget > 0 && s.committed / s.budget >= 0.85)
        .map((s: any) => ({
          level: s.committed / s.budget >= 1 ? 'alert' : 'watch',
          service: s.code,
          title: `${s.code} : ${((s.committed / s.budget) * 100).toFixed(0)} % engagé`,
          detail: `${s.committed.toFixed(2)} € engagés sur ${s.budget.toFixed(2)} €.`
        }));
      const sourceRows = parsed.map((x: any) => ({
        lineNo: x.line_no,
        direction: direction(x) || 'AUTRE',
        cgr: (x.dimension.cgr || []).map((p: any) => ({ level: p.level, code: p.code, label: p.label })),
        posts: (x.dimension.posts || []).map((p: any) => ({ level: p.level, code: p.code, label: p.label })),
        account: x.dimension.account || '',
        accountLabel: x.dimension.accountLabel || '',
        budget: n(x.budget),
        committed: n(x.committed),
        accounted: n(x.accounted),
        inProgress: n(x.in_progress),
        available: n(x.available)
      }));
      return {
        establishment: {
          id: establishment.id,
          uai: establishment.uai,
          name: establishment.name,
          opaleEntity: establishment.opale_entity
        },
        availableExercises,
        snapshot: {
          id: snap.id,
          date: snap.snapshot_date,
          filename: snap.source_filename,
          createdAt: snap.created_at,
          rowCount: snap.row_count
        },
        summary,
        totals,
        scopes,
        services,
        budgetServices,
        signals,
        sourceRows
      };
    } catch (e: any) {
      req.log.error(e);
      return reply.code(400).send({ error: e.message || 'Lecture budgétaire impossible' });
    }
  });
}
