import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { ImportService, ImportValidationError } from './import.service.js';

interface ImportRouteDependencies {
  pool: Pool;
  requireEstablishment: (req: FastifyRequest, reply: FastifyReply, ets: string) => Promise<any>;
}

/** Registers import discovery and Op@le import endpoints. */
export function registerImportRoutes(app: FastifyInstance, dependencies: ImportRouteDependencies) {
  const service = new ImportService(dependencies.pool);

  app.get('/api/imports', async () => ({
    imports: (await dependencies.pool.query('select * from accounting_imports order by imported_at desc limit 50')).rows
  }));

  app.post('/api/import/opale', async (req: any, reply) => {
    try {
      const requestedEts = String(req.query?.ets || '').trim();
      const requestedExercise = Number(req.query?.exercise || 0);
      if (!requestedEts) return reply.code(400).send({ error: 'Choisissez un établissement cible avant l’import.' });
      const target = await dependencies.requireEstablishment(req, reply, requestedEts);
      if (!target) return;
      const upload = await req.file();
      if (!upload) return reply.code(400).send({ error: 'Fichier manquant' });
      return await service.importOpale(
        { filename: upload.filename, buffer: await upload.toBuffer() },
        target,
        requestedEts,
        requestedExercise
      );
    } catch (error: any) {
      req.log.error(error);
      const status = error instanceof ImportValidationError ? 400 : 500;
      return reply.code(status).send({ error: error.message || 'Import impossible' });
    }
  });
  app.get('/api/snapshots', async () => ({
    snapshots: (
      await dependencies.pool.query(
        'select id, establishment_name, snapshot_date, source_filename, row_count, created_at from balance_snapshots order by snapshot_date desc, created_at desc limit 50'
      )
    ).rows
  }));

  app.get('/api/snapshots/:id', async (req: any, reply) => {
    const snapshot = (await dependencies.pool.query('select * from balance_snapshots where id=$1', [req.params.id]))
      .rows[0];
    if (!snapshot) return reply.code(404).send({ error: 'Snapshot introuvable' });
    const alerts = (
      await dependencies.pool.query(
        "select * from accounting_alerts where snapshot_id=$1 order by case severity when 'alert' then 0 else 1 end, abs(amount) desc",
        [req.params.id]
      )
    ).rows;
    return { snapshot, alerts };
  });

  app.post('/api/import/balance', async (req: any, reply) => {
    try {
      const upload = await req.file();
      if (!upload) return reply.code(400).send({ error: 'Fichier manquant' });
      const fields: any = upload.fields || {};
      const snapshotDate = String(fields.snapshotDate?.value || new Date().toISOString().slice(0, 10));
      const establishment = String(fields.establishment?.value || '').trim() || undefined;
      return await service.importBalance(
        { filename: upload.filename, buffer: await upload.toBuffer() },
        snapshotDate,
        establishment
      );
    } catch (error: any) {
      req.log.error(error);
      return reply.code(400).send({ error: error.message || 'Import impossible' });
    }
  });
}
