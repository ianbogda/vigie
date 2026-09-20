import type { Pool } from 'pg';
/** Returns whether the current user is a global administrator. */
export const isAdmin = (req: any) => req.user?.globalRole === 'ADMIN';
/** Returns establishments visible to the authenticated user. */
export async function allowedEstablishments(pool: Pool, req: any) {
  if (isAdmin(req))
    return (
      await pool.query('select id,uai,name,opale_entity,accounting_agency_id from establishments where is_active')
    ).rows;
  return (
    await pool.query(
      `select distinct e.id,e.uai,e.name,e.opale_entity,e.accounting_agency_id from establishments e join user_agency_roles r on r.accounting_agency_id=e.accounting_agency_id where r.user_id=$1 and e.is_active`,
      [req.user.id]
    )
  ).rows;
}
/** Resolves an establishment in the current user's scope. */
export async function requireEstablishment(pool: Pool, req: any, reply: any, ets: string) {
  const allowed = await allowedEstablishments(pool, req);
  const e = allowed.find(
    (x: any) =>
      String(x.opale_entity || '').toUpperCase() === ets.toUpperCase() ||
      String(x.uai || '').toUpperCase() === ets.toUpperCase()
  );
  if (!e) {
    reply.code(403).send({ error: 'Cet établissement ne fait pas partie de votre périmètre Vigie.' });
    return null;
  }
  return e;
}
