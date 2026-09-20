import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { hashPassword } from '../common/security.js';
import { insertMany, withTransaction } from '../common/database.js';

interface AdministrationDependencies {
  pool: Pool;
  isAdmin: (req: any) => boolean;
  audit: (req: any, action: string, establishmentId?: number | null, detail?: any) => Promise<void>;
  allowedEstablishments: (req: any) => Promise<any[]>;
}

/** Registers establishment, agency and user administration endpoints. */
export function registerAdministrationRoutes(app: FastifyInstance, dependencies: AdministrationDependencies) {
  const { pool, isAdmin, audit, allowedEstablishments } = dependencies;
  app.get('/api/establishments', async (req: any) => {
    if (isAdmin(req))
      return {
        establishments: (
          await pool.query(
            `select id,uai,name,opale_entity,is_active,accounting_agency_id,created_at,updated_at,archived_at from establishments order by is_active desc,name`
          )
        ).rows
      };
    return { establishments: await allowedEstablishments(req) };
  });
  app.post('/api/establishments', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const b = req.body || {},
      uai = String(b.uai || '')
        .trim()
        .toUpperCase(),
      name = String(b.name || '').trim(),
      opale =
        String(b.opaleEntity || '')
          .trim()
          .toUpperCase() || null;
    if (!/^[0-9]{7,8}[A-Z]$/.test(uai)) return reply.code(400).send({ error: 'UAI invalide.' });
    if (!name) return reply.code(400).send({ error: 'Le nom est obligatoire.' });
    try {
      const q = await pool.query(`insert into establishments(uai,name,opale_entity) values($1,$2,$3) returning *`, [
        uai,
        name,
        opale
      ]);
      return { ok: true, establishment: q.rows[0] };
    } catch (e: any) {
      return reply.code(409).send({ error: e.code === '23505' ? 'UAI ou code ETS déjà utilisé.' : e.message });
    }
  });
  app.put('/api/establishments/:id', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const b = req.body || {},
      name = String(b.name || '').trim(),
      opale =
        String(b.opaleEntity || '')
          .trim()
          .toUpperCase() || null;
    if (!name) return reply.code(400).send({ error: 'Le nom est obligatoire.' });
    try {
      const q = await pool.query(
        `update establishments set name=$2,opale_entity=$3,is_active=true,archived_at=null,updated_at=now() where id=$1 returning *`,
        [req.params.id, name, opale]
      );
      if (!q.rowCount) return reply.code(404).send({ error: 'Établissement introuvable.' });
      return { ok: true, establishment: q.rows[0] };
    } catch (e: any) {
      return reply.code(409).send({ error: e.code === '23505' ? 'Code ETS déjà utilisé.' : e.message });
    }
  });
  app.post('/api/establishments/:id/restore', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const q = await pool.query(
      `update establishments set is_active=true,archived_at=null,updated_at=now() where id=$1 returning *`,
      [req.params.id]
    );
    return q.rowCount
      ? { ok: true, establishment: q.rows[0] }
      : reply.code(404).send({ error: 'Établissement introuvable.' });
  });
  app.delete('/api/establishments/:id', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const c = await pool.connect();
    try {
      await c.query('begin');
      const e = (await c.query('select * from establishments where id=$1 for update', [req.params.id])).rows[0];
      if (!e) {
        await c.query('rollback');
        return reply.code(404).send({ error: 'Établissement introuvable.' });
      }
      const counts = (
        await c.query(
          `select (select count(*) from accounting_imports where opale_entity=$1)+(select count(*) from balance_snapshots where opale_entity=$1)+(select count(*) from budget_snapshots where opale_entity=$1)+(select count(*) from pcif_context where uai=$2) n`,
          [e.opale_entity || '', e.uai]
        )
      ).rows[0];
      if (Number(counts.n) > 0) {
        const q = await c.query(
          `update establishments set is_active=false,archived_at=now(),updated_at=now() where id=$1 returning *`,
          [e.id]
        );
        await c.query('commit');
        return { ok: true, mode: 'archived', establishment: q.rows[0] };
      }
      await c.query('delete from establishments where id=$1', [e.id]);
      await c.query('commit');
      return { ok: true, mode: 'deleted' };
    } catch (err: any) {
      await c.query('rollback');
      return reply.code(400).send({ error: err.message });
    } finally {
      c.release();
    }
  });

  app.get('/api/admin/users', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const users = (
      await pool.query(
        `select u.id,u.email,u.first_name,u.last_name,u.global_role,u.is_active,u.last_login_at,u.created_at,coalesce(json_agg(json_build_object('agencyId',a.id,'agencyName',a.name,'role',r.role)) filter(where r.user_id is not null),'[]') roles from users u left join user_agency_roles r on r.user_id=u.id left join accounting_agencies a on a.id=r.accounting_agency_id group by u.id order by u.last_name,u.first_name,u.email`
      )
    ).rows;
    return { users };
  });
  app.post('/api/admin/users', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const b = req.body || {},
      email = String(b.email || '')
        .trim()
        .toLowerCase(),
      password = String(b.password || '');
    if (!email.includes('@')) return reply.code(400).send({ error: 'Adresse électronique invalide.' });
    if (password.length < 12)
      return reply.code(400).send({ error: 'Le mot de passe initial doit contenir au moins 12 caractères.' });
    try {
      const q = await pool.query(
        `insert into users(email,first_name,last_name,password_hash,global_role) values($1,$2,$3,$4,$5) returning id,email,first_name,last_name,global_role,is_active`,
        [
          email,
          String(b.firstName || ''),
          String(b.lastName || ''),
          hashPassword(password),
          b.globalRole === 'ADMIN' ? 'ADMIN' : 'USER'
        ]
      );
      await audit(req, 'USER_CREATE', null, { userId: q.rows[0].id, email });
      return { ok: true, user: q.rows[0] };
    } catch (e: any) {
      return reply.code(409).send({ error: e.code === '23505' ? 'Cette adresse est déjà utilisée.' : e.message });
    }
  });
  app.put('/api/admin/users/:id', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const b = req.body || {};
    const q = await pool.query(
      `update users set first_name=$2,last_name=$3,global_role=$4,is_active=$5,updated_at=now() where id=$1 returning id,email,first_name,last_name,global_role,is_active`,
      [
        req.params.id,
        String(b.firstName || ''),
        String(b.lastName || ''),
        b.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
        b.isActive !== false
      ]
    );
    if (!q.rowCount) return reply.code(404).send({ error: 'Utilisateur introuvable.' });
    await audit(req, 'USER_UPDATE', null, { userId: req.params.id });
    return { ok: true, user: q.rows[0] };
  });
  app.post('/api/admin/users/:id/reset-password', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const password = String(req.body?.password || '');
    if (password.length < 12)
      return reply.code(400).send({ error: 'Le nouveau mot de passe doit contenir au moins 12 caractères.' });
    const q = await pool.query('update users set password_hash=$2,updated_at=now() where id=$1 returning id', [
      req.params.id,
      hashPassword(password)
    ]);
    if (!q.rowCount) return reply.code(404).send({ error: 'Utilisateur introuvable.' });
    await pool.query('delete from auth_sessions where user_id=$1', [req.params.id]);
    await audit(req, 'USER_PASSWORD_RESET', null, { userId: req.params.id });
    return { ok: true };
  });
  app.put('/api/admin/users/:id/agencies', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    try {
      await withTransaction(pool, async (client) => {
        await client.query('delete from user_agency_roles where user_id=$1', [req.params.id]);
        await insertMany(
          client,
          'user_agency_roles',
          ['user_id', 'accounting_agency_id', 'role'],
          roles.map((r: any) => [req.params.id, Number(r.agencyId), String(r.role)])
        );
      });
      await audit(req, 'USER_SCOPE_UPDATE', null, { userId: req.params.id, roles });
      return { ok: true };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
  app.get('/api/admin/agencies', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    return {
      agencies: (
        await pool.query(
          `select a.id,a.name,a.is_active,a.created_at,count(e.id)::int establishment_count from accounting_agencies a left join establishments e on e.accounting_agency_id=a.id and e.is_active group by a.id order by a.name`
        )
      ).rows
    };
  });
  app.post('/api/admin/agencies', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const name = String(req.body?.name || '').trim();
    if (!name) return reply.code(400).send({ error: 'Le nom de l’agence est obligatoire.' });
    try {
      const q = await pool.query('insert into accounting_agencies(name) values($1) returning *', [name]);
      await audit(req, 'AGENCY_CREATE', null, { agencyId: q.rows[0].id, name });
      return { ok: true, agency: q.rows[0] };
    } catch (e: any) {
      return reply.code(409).send({ error: e.code === '23505' ? 'Cette agence existe déjà.' : e.message });
    }
  });
  app.put('/api/admin/agencies/:id', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const name = String(req.body?.name || '').trim(),
      active = req.body?.isActive !== false;
    if (!name) return reply.code(400).send({ error: 'Le nom de l’agence est obligatoire.' });
    const q = await pool.query('update accounting_agencies set name=$2,is_active=$3 where id=$1 returning *', [
      req.params.id,
      name,
      active
    ]);
    if (!q.rowCount) return reply.code(404).send({ error: 'Agence introuvable.' });
    await audit(req, 'AGENCY_UPDATE', null, { agencyId: req.params.id });
    return { ok: true, agency: q.rows[0] };
  });
  app.put('/api/admin/establishments/:id/agency', async (req: any, reply: any) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Droit administrateur requis.' });
    const agencyId = req.body?.agencyId == null || req.body?.agencyId === '' ? null : Number(req.body.agencyId);
    if (agencyId !== null && !agencyId) return reply.code(400).send({ error: 'Agence invalide.' });
    const q = await pool.query(
      'update establishments set accounting_agency_id=$2,updated_at=now() where id=$1 returning id,uai,name,accounting_agency_id',
      [req.params.id, agencyId]
    );
    if (!q.rowCount) return reply.code(404).send({ error: 'Établissement introuvable.' });
    await audit(req, 'ESTABLISHMENT_AGENCY_UPDATE', Number(req.params.id), { agencyId });
    return { ok: true, establishment: q.rows[0] };
  });
}
