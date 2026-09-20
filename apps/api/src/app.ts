import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import pg from 'pg';
import { AppError } from './common/errors.js';
import { registerEpleTools } from './eple-tools.js';
import { registerImportRoutes } from './modules/imports/import.routes.js';
import { registerAdministrationRoutes } from './modules/administration.routes.js';
import { registerAuthRoutes } from './modules/auth.routes.js';
import { registerFinancialRoutes } from './modules/financial.routes.js';
import { registerAnalysisRoutes } from './modules/analysis.routes.js';
import { registerDashboardRoutes } from './modules/dashboard.routes.js';
import { allowedEstablishments, isAdmin, requireEstablishment } from './modules/access.service.js';
import { loadConfig } from './common/config.js';
const { Pool } = pg;
const config = loadConfig();
const VERSION = config.version;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const app = Fastify({ logger: true });
const pool = new Pool({
  connectionString: config.databaseUrl
});
await app.register(cors, { origin: config.corsOrigin });
await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
const { audit } = await registerAuthRoutes(app, pool);
const allowed = (req: any) => allowedEstablishments(pool, req);
const scopedEstablishment = (req: any, reply: any, ets: string) => requireEstablishment(pool, req, reply, ets);
registerEpleTools(app, pool, VERSION);
app.get('/health', async (_req, reply) => {
  try {
    await pool.query('select 1');
    return { ok: true, status: 'ready', version: VERSION };
  } catch (error) {
    app.log.error({ error }, 'PostgreSQL indisponible');
    return reply.code(503).send({ ok: false, status: 'not_ready', version: VERSION });
  }
});
app.get('/health/live', () => ({ ok: true, status: 'alive', version: VERSION }));
app.addHook('onClose', async () => {
  await pool.end();
});
registerImportRoutes(app, { pool, requireEstablishment: scopedEstablishment });
registerFinancialRoutes(app, { pool, requireEstablishment: scopedEstablishment });
registerAnalysisRoutes(app, pool, VERSION);
registerDashboardRoutes(app, { pool, version: VERSION, allowedEstablishments: allowed });
registerAdministrationRoutes(app, { pool, isAdmin, audit, allowedEstablishments: allowed });
app.setErrorHandler((error, req, reply) => {
  if (error instanceof AppError) return reply.code(error.statusCode).send({ error: error.message, code: error.code });
  req.log.error({ error }, 'Erreur API non gérée');
  return reply.code(500).send({ error: 'Erreur interne du serveur.', code: 'INTERNAL_ERROR' });
});
app.setNotFoundHandler((req, reply) =>
  reply.code(404).send({ error: 'Route API introuvable', method: req.method, path: req.url, version: VERSION })
);
export { app };
