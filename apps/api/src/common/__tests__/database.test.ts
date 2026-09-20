import { describe, expect, it, vi } from 'vitest';
import { insertMany, withTransaction } from '../database.js';

describe('database helpers', () => {
  it('batches multiple rows in one insert statement', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as any;
    await insertMany(
      client,
      'sample_rows',
      ['id', 'label'],
      [
        [1, 'A'],
        [2, 'B']
      ]
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('values ($1,$2),($3,$4)');
    expect(query.mock.calls[0][1]).toEqual([1, 'A', 2, 'B']);
  });

  it('commits a successful transaction', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as any;
    await expect(withTransaction(pool, async () => 42)).resolves.toBe(42);
    expect(client.query.mock.calls.map((call: any[]) => call[0])).toEqual(['begin', 'commit']);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases a failed transaction', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as any;
    await expect(
      withTransaction(pool, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(client.query.mock.calls.map((call: any[]) => call[0])).toEqual(['begin', 'rollback']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
