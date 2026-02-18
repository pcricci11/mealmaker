import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

let pool: Pool;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("render.com")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

/** Run a query and return all rows. */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Run a query and return the first row (or null). */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<T | null> {
  const result = await getPool().query<T>(text, params);
  return result.rows[0] ?? null;
}

/** Run a query and return the raw QueryResult (for rowCount, etc.). */
export async function queryRaw(
  text: string,
  params?: any[],
): Promise<QueryResult> {
  return getPool().query(text, params);
}

/** Execute a callback inside a PostgreSQL transaction. */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export default getPool;
