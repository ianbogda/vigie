import type { Pool, PoolClient, QueryResultRow } from 'pg';

/** Executes a callback in a PostgreSQL transaction and guarantees rollback on failure. */
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Identifiant SQL invalide : ${identifier}`);
  return `"${identifier}"`;
}

/** Inserts rows in bounded multi-value statements instead of issuing one query per row. */
export async function insertMany<T extends readonly unknown[]>(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly T[],
  options: { chunkSize?: number; suffix?: string } = {}
): Promise<number> {
  if (!rows.length) return 0;
  const chunkSize = Math.max(1, Math.min(options.chunkSize ?? 500, 1000));
  const tableSql = quoteIdentifier(table);
  const columnsSql = columns.map(quoteIdentifier).join(',');
  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const placeholders = chunk.map((row, rowIndex) => {
      if (row.length !== columns.length) throw new Error(`Nombre de valeurs invalide pour ${table}`);
      const base = rowIndex * columns.length;
      values.push(...row);
      return `(${columns.map((_, columnIndex) => `$${base + columnIndex + 1}`).join(',')})`;
    });
    await client.query(
      `insert into ${tableSql}(${columnsSql}) values ${placeholders.join(',')} ${options.suffix ?? ''}`,
      values
    );
    inserted += chunk.length;
  }
  return inserted;
}

/** Returns all rows for a query with a typed result. */
export async function queryRows<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  values: readonly unknown[] = []
): Promise<T[]> {
  return (await client.query<T>(sql, [...values])).rows;
}
