import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Sm4rtn3t_2021',
  database: process.env.DB_NAME || 'autoctona',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
});

// Catch pool errors to prevent Node process from crashing on connection resets
if ((pool as any).pool) {
  (pool as any).pool.on('error', (err: any) => {
    console.error('⚠️ MySQL Pool Error Event:', err?.message || err);
  });
}

/**
 * Executes a SELECT query with READ UNCOMMITTED isolation level
 * Safely handles connection release and query errors without crashing Node.
 */
export async function executeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED');
    const [rows] = await connection.query(sql, params);
    return rows as T[];
  } catch (error: any) {
    console.error('❌ Database Query Error:', error?.message || error);
    return [];
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // connection release fallback
      }
    }
  }
}

export default pool;
