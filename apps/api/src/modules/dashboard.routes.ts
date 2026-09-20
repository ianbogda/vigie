import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { budgetSignal, budgetTrajectoryTarget } from './imports/import-parsers.js';
import { treasuryContext } from '../treasury.js';
interface Dependencies {
  pool: Pool;
  version: string;
  allowedEstablishments: (req: any) => Promise<any[]>;
}
/** Registers dashboard and PCIF integration endpoints. */
export function registerDashboardRoutes(app: FastifyInstance, dependencies: Dependencies) {
  const { pool, version: VERSION, allowedEstablishments } = dependencies;
  const PCIF_BASE_URL = String(process.env.PCIF_BASE_URL || '').replace(/\/$/, '');
  const PCIF_API_KEY = String(process.env.PCIF_API_KEY || '');
  const PCIF_CACHE_MINUTES = Math.max(1, Number(process.env.PCIF_CACHE_MINUTES || 10));
  const uaiOf = (...values: unknown[]) => {
    for (const value of values) {
      const match = String(value ?? '')
        .toUpperCase()
        .match(/\b0?([0-9]{7}[A-Z])\b/);
      if (match) return match[0];
    }
    return null;
  };

  const consistencyNorm = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const DOMAIN_ALIASES: Record<string, string[]> = {
    Budget: ['budget', 'execution budgetaire', 'prevision budgetaire'],
    Fournisseurs: ['depenses', 'depense', 'achats', 'achat', 'fournisseurs', 'fournisseur'],
    'Comptabilité générale': ['comptabilite generale', 'comptabilite', 'operations comptables'],
    'Santé financière': ['sante financiere', 'analyse financiere', 'situation financiere', 'fonds de roulement'],
    Trésorerie: ['tresorerie', 'disponibilites', 'banque', 'compte 5151']
  };
  function pcifDomainFor(vigieDomain: string, domains: any[]) {
    const aliases = DOMAIN_ALIASES[vigieDomain] || [vigieDomain];
    const wanted = aliases.map(consistencyNorm);
    return (
      domains.find((d: any) => {
        const label = consistencyNorm(d.label);
        return wanted.some((x) => label === x || label.includes(x) || x.includes(label));
      }) || null
    );
  }
  function masteryConsistency(establishment: any, pcif: any) {
    const domains = Array.isArray(pcif?.raw_payload?.domains) ? pcif.raw_payload.domains : [];
    const vigieDomains = [
      ...new Set((establishment.signals || []).map((s: any) => s.domain).filter(Boolean))
    ] as string[];
    return vigieDomains.map((domain) => {
      const signals = (establishment.signals || []).filter(
        (s: any) => s.domain === domain && ['watch', 'alert'].includes(s.level)
      );
      const p = pcifDomainFor(domain, domains);
      if (!p)
        return {
          vigieDomain: domain,
          pcifDomain: null,
          status: 'NOT_MAPPABLE',
          signals: signals.length,
          alerts: signals.filter((s: any) => s.level === 'alert').length,
          reasons: ['Aucun domaine PCIF rapprochable automatiquement.']
        };
      const completion = Number(p.completion || 0),
        mastery = p.mastery == null ? null : Number(p.mastery);
      let status = 'COHERENT',
        reasons: string[] = [];
      if (completion < 50) {
        status = 'PCIF_INSUFFICIENT';
        reasons = [`Diagnostic PCIF renseigné à ${completion} % sur ce domaine.`];
      } else if (signals.length && mastery != null && mastery >= 75) {
        status = 'REVIEW';
        reasons = [
          `Maîtrise PCIF déclarée à ${mastery} % et ${signals.length} signal${signals.length > 1 ? 'aux' : ' '} Vigie actif${signals.length > 1 ? 's' : ''}.`
        ];
      } else if (signals.length) {
        reasons = [
          'Les observations Vigie sont cohérentes avec un niveau de maîtrise PCIF qui appelle déjà une vigilance.'
        ];
      } else reasons = ['Aucun signal Vigie significatif sur ce domaine.'];
      return {
        vigieDomain: domain,
        pcifDomain: p.label,
        status,
        signals: signals.length,
        alerts: signals.filter((s: any) => s.level === 'alert').length,
        mastery,
        completion,
        reasons
      };
    });
  }

  async function syncPcifSummaries(uais: string[]) {
    const wanted = [...new Set(uais.filter(Boolean))];
    if (!PCIF_BASE_URL || !PCIF_API_KEY || !wanted.length)
      return { configured: false, synced: 0, skipped: wanted.length };
    const response = await fetch(`${PCIF_BASE_URL}/api/integrations/vigie/summaries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PCIF_API_KEY}` },
      body: JSON.stringify({ uais: wanted }),
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error(`PCIF Académie : HTTP ${response.status}`);
    const payload: any = await response.json();
    const summaries: any[] = Array.isArray(payload) ? payload : payload.summaries || payload.establishments || [];
    let synced = 0;
    for (const x of summaries) {
      const uai = uaiOf(x.uai, x.establishment?.uai);
      if (!uai) continue;
      const campaign = x.campaign || {},
        mastery = x.mastery || {},
        risks = x.risks || {},
        actions = x.actions || {};
      await pool.query(
        `insert into pcif_context(establishment_key,uai,campaign_label,campaign_status,mastery_level,mastery_scale,completion,answered,total,open_actions,major_risks,overdue_actions,trend,attention,source_url,raw_payload,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,now())
      on conflict(establishment_key) do update set uai=excluded.uai,campaign_label=excluded.campaign_label,campaign_status=excluded.campaign_status,mastery_level=excluded.mastery_level,mastery_scale=excluded.mastery_scale,completion=excluded.completion,answered=excluded.answered,total=excluded.total,open_actions=excluded.open_actions,major_risks=excluded.major_risks,overdue_actions=excluded.overdue_actions,trend=excluded.trend,attention=excluded.attention,source_url=excluded.source_url,raw_payload=excluded.raw_payload,updated_at=now()`,
        [
          uai,
          uai,
          campaign.label || campaign.id || x.campaign_label || null,
          campaign.status || null,
          mastery.level ?? x.mastery_level ?? null,
          mastery.scale || 'PERCENT',
          mastery.completion ?? 0,
          mastery.answered ?? 0,
          mastery.total ?? 0,
          actions.open ?? x.open_actions ?? 0,
          risks.major ?? x.major_risks ?? 0,
          actions.overdue ?? x.overdue_actions ?? 0,
          mastery.trend ?? x.trend ?? null,
          JSON.stringify(x.attention || []),
          x.sourceUrl || x.source_url || `${PCIF_BASE_URL}/`,
          JSON.stringify(x)
        ]
      );
      synced++;
    }
    return { configured: true, synced, received: summaries.length };
  }

  app.get('/api/integrations/pcif/status', async () => ({
    configured: !!(PCIF_BASE_URL && PCIF_API_KEY),
    baseUrl: PCIF_BASE_URL || null,
    cacheMinutes: PCIF_CACHE_MINUTES,
    cached: (await pool.query('select count(*)::int n,max(updated_at) last_sync from pcif_context')).rows[0]
  }));
  app.post('/api/integrations/pcif/sync', async (req: any, reply: any) => {
    try {
      const uais = Array.isArray(req.body?.uais) ? req.body.uais.map(String) : [];
      return { ok: true, ...(await syncPcifSummaries(uais)) };
    } catch (e: any) {
      req.log.warn(e);
      return reply.code(502).send({ error: e.message || 'Synchronisation PCIF impossible' });
    }
  });

  app.get('/api/dashboard', async (req: any) => {
    const allowed = await allowedEstablishments(req);
    const allowedIds = allowed.map((x: any) => Number(x.id));
    const [registry, balances, budgets, purchases, fdrs, treasuries, financials] = await Promise.all([
      pool.query(
        `select id,uai,name,opale_entity,is_active from establishments where id=any($1::bigint[]) order by name`,
        [allowedIds]
      ),
      pool.query(
        `select distinct on (coalesce(nullif(opale_entity,''),establishment_name)) id,coalesce(nullif(opale_entity,''),establishment_name) source_key,establishment_name,opale_entity,opale_entity_label,snapshot_date,created_at from balance_snapshots order by coalesce(nullif(opale_entity,''),establishment_name),snapshot_date desc,created_at desc`
      ),
      pool.query(
        `select distinct on (coalesce(nullif(opale_entity,''),establishment_name)) id,coalesce(nullif(opale_entity,''),establishment_name) source_key,establishment_name,opale_entity,snapshot_date,created_at from budget_snapshots order by coalesce(nullif(opale_entity,''),establishment_name),snapshot_date desc,created_at desc`
      ),
      pool.query(
        `select distinct on (establishment_name) id,establishment_name source_key,establishment_name,snapshot_date,created_at from purchase_snapshots order by establishment_name,snapshot_date desc,created_at desc`
      ),
      pool.query(
        `select distinct on (establishment_name) id,establishment_name source_key,establishment_name,snapshot_date,created_at from fdr_snapshots order by establishment_name,snapshot_date desc,created_at desc`
      ),
      pool.query(
        `select distinct on (opale_entity) id,opale_entity source_key,opale_entity,opale_entity establishment_name,source_format,period_to snapshot_date,period_to,created_at from accounting_imports order by opale_entity,created_at desc`
      ),
      pool.query(
        `select distinct on (opale_entity) id,opale_entity source_key,opale_entity,opale_entity establishment_name,snapshot_date,created_at from financial_snapshots order by opale_entity,created_at desc`
      )
    ]);
    const map = new Map<string, any>();
    const archived = new Set(
      registry.rows.filter((x: any) => !x.is_active).flatMap((x: any) => [x.opale_entity, x.uai].filter(Boolean))
    );
    const ensure = (key: string, name?: string) => {
      if (archived.has(key)) return null;
      if (!map.has(key))
        map.set(key, {
          key,
          name: name || key,
          uai: null,
          registryId: null,
          opaleEntity: key,
          sources: { balance: null, budget: null, purchases: null, fdr: null, treasury: null, financial: null },
          signals: []
        });
      return map.get(key);
    };
    for (const x of registry.rows.filter((x: any) => x.is_active)) {
      const key = x.opale_entity || x.uai;
      const e = ensure(key, x.name);
      if (e) {
        e.name = x.name;
        e.uai = x.uai;
        e.registryId = x.id;
        e.opaleEntity = x.opale_entity || null;
      }
    }
    for (const x of balances.rows) {
      const e = ensure(x.source_key, x.opale_entity_label || x.establishment_name);
      if (e) {
        e.name = e.registryId ? e.name : x.opale_entity_label || e.name;
        e.sources.balance = x;
      }
    }
    for (const x of budgets.rows) {
      const e = ensure(x.source_key, x.establishment_name);
      if (e) e.sources.budget = x;
    }
    for (const x of purchases.rows) {
      const e = ensure(x.source_key, x.establishment_name);
      if (e) e.sources.purchases = x;
    }
    for (const x of fdrs.rows) {
      const e = ensure(x.source_key, x.establishment_name);
      if (e) e.sources.fdr = x;
    }
    for (const x of treasuries.rows) {
      const e = ensure(x.source_key, x.establishment_name);
      if (e) e.sources.treasury = x;
    }
    for (const x of financials.rows) {
      const e = ensure(x.source_key, x.establishment_name);
      if (e) e.sources.financial = x;
    }
    const severity = (xs: any[]) =>
      xs.some((x) => x.level === 'alert') ? 'alert' : xs.some((x) => x.level === 'watch') ? 'watch' : 'ok';
    const establishments: any[] = [];
    let totalBudget = 0,
      totalAvailable = 0,
      totalAccounted = 0,
      totalCommitted = 0,
      totalInProgress = 0;
    for (const e of map.values()) {
      const states: any = {
        budget: 'missing',
        financial: 'missing',
        recovery: 'missing',
        suppliers: 'missing',
        accounting: 'missing',
        treasury: 'missing'
      };
      if (e.sources.budget) {
        const q = (
          await pool.query(
            `select coalesce(sum(budget),0) budget,coalesce(sum(committed),0) committed,coalesce(sum(accounted),0) accounted,coalesce(sum(in_progress),0) in_progress,coalesce(sum(available),0) available from budget_lines where snapshot_id=$1`,
            [e.sources.budget.id]
          )
        ).rows[0];
        const m = {
          budget: Number(q.budget),
          committed: Number(q.committed),
          accounted: Number(q.accounted),
          inProgress: Number(q.in_progress),
          available: Number(q.available)
        };
        e.budgetMetrics = m;
        totalBudget += m.budget;
        totalAvailable += m.available;
        totalAccounted += m.accounted;
        totalCommitted += m.committed;
        totalInProgress += m.inProgress;
        const rate = m.budget ? m.committed / m.budget : null;
        e.budgetMetrics.engagementRate = rate;
        e.budgetMetrics.trajectoryTarget = budgetTrajectoryTarget(e.sources.budget.snapshot_date);
        const bs = budgetSignal(m, e.sources.budget.snapshot_date);
        if (bs) e.signals.push(bs);

        // Atterrissage : le réalisé et l'engagé sont certains ; le reliquat est projeté
        // autour de la trajectoire théorique. La fourchette évite une fausse précision.
        const executionRows = (
          await pool.query(`select raw_dimensions,budget,committed,accounted from budget_lines where snapshot_id=$1`, [e.sources.budget.id])
        ).rows;
        const side = (row: any) => {
          const dimensions = typeof row.raw_dimensions === 'string' ? JSON.parse(row.raw_dimensions) : row.raw_dimensions;
          return String((dimensions?.posts || []).find((post: any) => post.level === 2)?.code || '').trim().toUpperCase();
        };
        const sumSide = (direction: string, field: string) =>
          executionRows.filter((row: any) => side(row) === direction).reduce((sum: number, row: any) => sum + Math.abs(Number(row[field] || 0)), 0);
        const expenses = { budget: sumSide('DEP', 'budget'), committed: sumSide('DEP', 'committed'), accounted: sumSide('DEP', 'accounted') };
        const revenues = { budget: sumSide('REC', 'budget'), committed: sumSide('REC', 'committed'), accounted: sumSide('REC', 'accounted') };
        const target = Math.max(0.15, Math.min(0.98, e.budgetMetrics.trajectoryTarget || 0.75));
        if (expenses.budget || revenues.budget) {
          const projected = (x: typeof expenses, cautious: number) => {
            const pace = x.accounted / target;
            const known = Math.max(x.accounted, x.committed);
            const central = Math.min(x.budget || Number.POSITIVE_INFINITY, Math.max(known, pace));
            const uncertainty = Math.max(0, central - x.accounted) * cautious;
            return { low: Math.max(known, central - uncertainty), central, high: central + uncertainty };
          };
          const dep = projected(expenses, 0.18), rec = projected(revenues, 0.22);
          const currentResult = revenues.accounted - expenses.accounted;
          const budgetResult = revenues.budget - expenses.budget;
          const trajectorySnapshots = (
            await pool.query(
              `select id,snapshot_date from budget_snapshots
               where coalesce(nullif(opale_entity,''),establishment_name)=$1
                 and extract(year from snapshot_date)=extract(year from $2::date)
               order by snapshot_date asc,created_at asc`,
              [e.sources.budget.source_key, e.sources.budget.snapshot_date]
            )
          ).rows;
          const trajectoryPoints: { date: string; result: number }[] = [];
          for (const snapshot of trajectorySnapshots) {
            const rows = (
              await pool.query(`select raw_dimensions,accounted from budget_lines where snapshot_id=$1`, [snapshot.id])
            ).rows;
            const amount = (direction: string) =>
              rows
                .filter((row: any) => side(row) === direction)
                .reduce((sum: number, row: any) => sum + Math.abs(Number(row.accounted || 0)), 0);
            trajectoryPoints.push({
              date: String(snapshot.snapshot_date),
              result: amount('REC') - amount('DEP')
            });
          }
          e.resultForecast = {
            low: rec.low - dep.high,
            central: rec.central - dep.central,
            high: rec.high - dep.low,
            current: currentResult,
            budget: budgetResult,
            snapshotDate: String(e.sources.budget.snapshot_date),
            points: trajectoryPoints,
            projectedRevenues: rec,
            projectedExpenses: dep,
            method: 'Réalisé + engagé + extrapolation de la trajectoire à date',
            confidence: target >= 0.65 ? 'medium' : 'low'
          };
        }
        states.budget = severity(e.signals.filter((x: any) => x.domain === 'Budget'));
      }
      if (e.sources.purchases) {
        const q = (
          await pool.query(
            `select coalesce(sum(case when order_date < current_date-60 and abs(invoice_balance_quantity)>.0001 then 1 else 0 end),0)::int old_uninvoiced,coalesce(sum(case when receipt_date is not null and abs(invoice_balance_quantity)>.0001 then 1 else 0 end),0)::int received_uninvoiced from purchase_lines where snapshot_id=$1`,
            [e.sources.purchases.id]
          )
        ).rows[0];
        if (Number(q.old_uninvoiced) > 0)
          e.signals.push({
            code: 'ACH-OLD',
            level: 'watch',
            domain: 'Fournisseurs',
            title: 'Commandes anciennes restant à facturer',
            detail: `${q.old_uninvoiced} ligne(s) de plus de 60 jours avec solde de facturation.`,
            count: Number(q.old_uninvoiced)
          });
        if (Number(q.received_uninvoiced) > 0)
          e.signals.push({
            code: 'ACH-REC',
            level: 'watch',
            domain: 'Fournisseurs',
            title: 'Réceptions restant à rapprocher',
            detail: `${q.received_uninvoiced} ligne(s) réceptionnée(s) présentent encore un solde de facturation.`,
            count: Number(q.received_uninvoiced)
          });
        states.suppliers = severity(e.signals.filter((x: any) => x.domain === 'Fournisseurs'));
      }
      if (e.sources.balance) {
        const a = (
          await pool.query(
            `select severity,rule_code,title,detail,account,amount from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end,abs(amount) desc limit 20`,
            [e.sources.balance.id]
          )
        ).rows;
        for (const x of a)
          e.signals.push({
            code: x.rule_code,
            level: x.severity,
            domain: 'Comptabilité générale',
            title: x.title,
            detail: x.detail,
            account: x.account,
            amount: Number(x.amount),
            evidence: [
              { label: 'Compte', value: x.account },
              { label: 'Solde net', value: Number(x.amount) }
            ],
            condition:
              x.rule_code === 'CG-585'
                ? 'Solde du compte 585 différent de zéro'
                : 'Solde non nul sur un compte surveillé',
            interpretation:
              'Signal à examiner et, le cas échéant, à apurer. Il ne préjuge pas à lui seul d’une anomalie.',
            source: 'EBLC / balance Op@le'
          });
        states.accounting = a.length ? severity(a.map((x: any) => ({ level: x.severity }))) : 'ok';
      }
      let trend = 'stable';
      if (e.sources.fdr) {
        const h = (
          await pool.query(
            `select exercise,amount,is_final from fdr_lines where snapshot_id=$1 order by exercise desc`,
            [e.sources.fdr.id]
          )
        ).rows.map((x: any) => ({ ...x, amount: Number(x.amount) }));
        e.fdrHistory = h;
        if (h.length) {
          const cur = h[0],
            prev = h.find((x: any) => x.exercise === cur.exercise - 1);
          if (prev) {
            const d = cur.amount - prev.amount;
            trend = d < 0 ? 'down' : d > 0 ? 'up' : 'stable';
            if (d < 0)
              e.signals.push({
                code: 'FDR-DOWN',
                level: 'watch',
                domain: 'Santé financière',
                title: 'Fonds de roulement en diminution',
                detail: `${cur.exercise}${cur.is_final ? ' définitif' : ' provisoire'} : ${cur.amount.toFixed(2)} € ; ${prev.exercise} : ${prev.amount.toFixed(2)} €.`,
                amount: d
              });
          }
        }
        states.financial = severity(e.signals.filter((x: any) => x.domain === 'Santé financière'));
      }
      if (e.sources.treasury) {
        e.treasury = await treasuryContext(pool, e.sources.treasury);
        e.signals.push(...(e.treasury?.signals || []));
        states.treasury = severity(e.signals.filter((x: any) => x.domain === 'Trésorerie'));
      }
      const uai =
        e.uai ||
        uaiOf(
          e.sources.balance?.opale_entity_label,
          e.sources.balance?.establishment_name,
          e.sources.budget?.establishment_name,
          e.sources.purchases?.establishment_name,
          e.sources.fdr?.establishment_name,
          e.sources.treasury?.establishment_name,
          e.name
        );
      const updateDates = Object.values(e.sources)
        .filter(Boolean)
        .map((x: any) => String(x.created_at || x.snapshot_date || ''))
        .filter(Boolean)
        .sort();
      const freshness = updateDates.length ? updateDates[updateDates.length - 1] : null;
      const staleSources = Object.entries(e.sources)
        .filter(([, x]: any) => x && (Date.now() - new Date(x.snapshot_date).getTime()) / 86400000 > 30)
        .map(([k]) => k);
      e.signals.sort(
        (a: any, b: any) =>
          (a.level === 'alert' ? 0 : 1) - (b.level === 'alert' ? 0 : 1) ||
          Math.abs(b.amount || 0) - Math.abs(a.amount || 0)
      );
      establishments.push({
        id: e.key,
        registryId: e.registryId,
        opaleEntity: e.opaleEntity,
        uai,
        name: e.name,
        states,
        trend,
        freshness,
        sources: e.sources,
        staleSources,
        signals: e.signals,
        budgetMetrics: e.budgetMetrics || null,
        fdrHistory: e.fdrHistory || [],
        treasury: e.treasury || null,
        resultForecast: e.resultForecast || null
      });
    }
    try {
      const uais = establishments.map((e: any) => e.uai).filter(Boolean);
      if (PCIF_BASE_URL && PCIF_API_KEY && uais.length) {
        const stale = (
          await pool.query(
            `select count(*)::int n from pcif_context where uai=any($1::text[]) and updated_at > now()-($2||' minutes')::interval`,
            [uais, String(PCIF_CACHE_MINUTES)]
          )
        ).rows[0].n;
        if (Number(stale) < uais.length) {
          try {
            await syncPcifSummaries(uais);
          } catch (err) {
            app.log.warn({ err }, 'Synchronisation PCIF non bloquante impossible');
          }
        }
      }
      const pcif = (
        await pool.query(
          'select establishment_key,uai,campaign_label,campaign_status,mastery_level,mastery_scale,completion,answered,total,open_actions,major_risks,overdue_actions,trend,attention,source_url,raw_payload,updated_at from pcif_context'
        )
      ).rows;
      for (const e of establishments) {
        e.pcif = pcif.find((p: any) => (e.uai && p.uai === e.uai) || p.establishment_key === e.id) || null;
        if (e.pcif) {
          e.pcif.consistency = masteryConsistency(e, e.pcif);
          e.pcif.domains = Array.isArray(e.pcif.raw_payload?.domains) ? e.pcif.raw_payload.domains : [];
        }
      }
    } catch (err) {
      app.log.warn({ err }, 'Construction du contexte PCIF impossible');
    }
    const signals = establishments
      .flatMap((e) => e.signals.map((s: any) => ({ ...s, establishment: e.name, establishmentId: e.id })))
      .sort(
        (a: any, b: any) =>
          (a.level === 'alert' ? 0 : 1) - (b.level === 'alert' ? 0 : 1) ||
          Math.abs(b.amount || 0) - Math.abs(a.amount || 0)
      );
    const actionRequired = signals.filter((s: any) => s.level === 'alert').length,
      watch = signals.filter((s: any) => s.level === 'watch').length;
    const stale = establishments.reduce((n, e) => n + e.staleSources.length, 0);
    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      kpis: {
        establishments: establishments.length,
        actionRequired,
        watch,
        stale,
        totalBudget,
        totalAvailable,
        totalAccounted,
        totalCommitted,
        totalInProgress
      },
      establishments,
      signals: signals.slice(0, 50)
    };
  });

  app.get('/api/pcif-context/:establishmentId', async (req: any) => {
    try {
      return {
        context:
          (await pool.query('select * from pcif_context where establishment_key=$1', [req.params.establishmentId]))
            .rows[0] || null
      };
    } catch {
      return { context: null };
    }
  });
  app.post('/api/pcif-context/:establishmentId', async (req: any, reply: any) => {
    const b = req.body || {};
    try {
      const q = await pool.query(
        `insert into pcif_context(establishment_key,campaign_label,mastery_level,open_actions,major_risks,source_url,updated_at) values($1,$2,$3,$4,$5,$6,now()) on conflict(establishment_key) do update set campaign_label=excluded.campaign_label,mastery_level=excluded.mastery_level,open_actions=excluded.open_actions,major_risks=excluded.major_risks,source_url=excluded.source_url,updated_at=now() returning *`,
        [
          req.params.establishmentId,
          b.campaignLabel || null,
          b.masteryLevel ?? null,
          b.openActions ?? 0,
          b.majorRisks ?? 0,
          b.sourceUrl || null
        ]
      );
      return { ok: true, context: q.rows[0] };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
