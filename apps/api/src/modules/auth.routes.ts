import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { hashPassword, hashToken, verifyPassword } from '../common/security.js';
/** Registers authentication endpoints and API authentication. */
export async function registerAuthRoutes(app: FastifyInstance, pool: Pool) {
  type AuthUser = {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    globalRole: 'ADMIN' | 'USER';
    agencies: { id: number; name: string; role: string }[];
  };
  const SESSION_COOKIE = 'vigie_session';
  const SESSION_DAYS = Math.max(1, Number(process.env.VIGIE_SESSION_DAYS || 1));
  const cookieValue = (header: string | undefined, name: string) => {
    for (const part of String(header || '').split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  };
  async function userPayload(id: number): Promise<AuthUser | null> {
    const u = (
      await pool.query('select id,email,first_name,last_name,global_role,is_active from users where id=$1', [id])
    ).rows[0];
    if (!u || !u.is_active) return null;
    const agencies = (
      await pool.query(
        `select a.id,a.name,r.role from user_agency_roles r join accounting_agencies a on a.id=r.accounting_agency_id where r.user_id=$1 and a.is_active order by a.name`,
        [id]
      )
    ).rows;
    return {
      id: Number(u.id),
      email: u.email,
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      globalRole: u.global_role,
      agencies: agencies.map((a: any) => ({ id: Number(a.id), name: a.name, role: a.role }))
    };
  }
  async function authenticate(req: any) {
    const raw = cookieValue(req.headers.cookie, SESSION_COOKIE);
    if (!raw) return null;
    const row = (
      await pool.query(
        `select s.user_id from auth_sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.is_active`,
        [hashToken(raw)]
      )
    ).rows[0];
    if (!row) return null;
    await pool.query('update auth_sessions set last_seen_at=now() where token_hash=$1', [hashToken(raw)]);
    return userPayload(Number(row.user_id));
  }
  function setSessionCookie(reply: any, token: string, maxAge: number) {
    reply.header(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Secure`
    );
  }
  async function audit(req: any, action: string, establishmentId: number | null = null, detail: any = {}) {
    try {
      await pool.query(
        'insert into audit_log(user_id,action,establishment_id,detail,ip_address) values($1,$2,$3,$4,$5)',
        [req.user?.id || null, action, establishmentId, JSON.stringify(detail), req.ip]
      );
    } catch (e) {
      app.log.warn({ e }, 'Audit non bloquant impossible');
    }
  }
  async function bootstrapAdmin() {
    const n = Number((await pool.query('select count(*) n from users')).rows[0].n);
    if (n) return;
    const email = String(process.env.VIGIE_ADMIN_EMAIL || '')
        .trim()
        .toLowerCase(),
      password = String(process.env.VIGIE_ADMIN_PASSWORD || '');
    if (!email || password.length < 12) {
      app.log.error(
        'Aucun utilisateur Vigie. Définissez VIGIE_ADMIN_EMAIL et VIGIE_ADMIN_PASSWORD (12 caractères minimum), puis redémarrez.'
      );
      return;
    }
    await pool.query(
      `insert into users(email,first_name,last_name,password_hash,global_role) values($1,'Administrateur','Vigie',$2,'ADMIN')`,
      [email, hashPassword(password)]
    );
    app.log.warn(
      { email },
      'Compte administrateur initial créé. Retirez VIGIE_ADMIN_PASSWORD de /etc/vigie.env après la première connexion.'
    );
  }
  await bootstrapAdmin();
  app.post('/api/auth/login', async (req: any, reply: any) => {
    const email = String(req.body?.email || '')
        .trim()
        .toLowerCase(),
      password = String(req.body?.password || '');
    const u = (await pool.query('select id,password_hash,is_active from users where lower(email)=$1', [email])).rows[0];
    if (!u || !u.is_active || !verifyPassword(password, u.password_hash)) {
      await new Promise((r) => setTimeout(r, 250));
      return reply.code(401).send({ error: 'Identifiants incorrects.' });
    }
    const token = randomBytes(32).toString('base64url'),
      maxAge = SESSION_DAYS * 86400;
    await pool.query('delete from auth_sessions where expires_at<=now()');
    await pool.query(
      `insert into auth_sessions(user_id,token_hash,expires_at,user_agent,ip_address) values($1,$2,now()+($3||' seconds')::interval,$4,$5)`,
      [u.id, hashToken(token), String(maxAge), req.headers['user-agent'] || null, req.ip]
    );
    await pool.query('update users set last_login_at=now() where id=$1', [u.id]);
    setSessionCookie(reply, token, maxAge);
    req.user = await userPayload(Number(u.id));
    await audit(req, 'LOGIN');
    return { ok: true, user: req.user };
  });
  app.post('/api/auth/logout', async (req: any, reply: any) => {
    const raw = cookieValue(req.headers.cookie, SESSION_COOKIE);
    if (raw) await pool.query('delete from auth_sessions where token_hash=$1', [hashToken(raw)]);
    setSessionCookie(reply, '', 0);
    return { ok: true };
  });
  app.get('/api/auth/me', async (req: any, reply: any) => {
    const user = await authenticate(req);
    return user ? { user } : reply.code(401).send({ error: 'Authentification requise.' });
  });

  app.addHook('onRequest', async (req: any, reply: any) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth/')) return;
    const user = await authenticate(req);
    if (!user) return reply.code(401).send({ error: 'Authentification requise.' });
    req.user = user;
  });

  return { audit };
}
