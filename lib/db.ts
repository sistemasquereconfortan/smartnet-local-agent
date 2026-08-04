import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '192.168.1.234',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'Sm4rtn3t_2021',
  database: process.env.DB_NAME || 'autoctona',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
});

/**
 * Executes a SELECT query with READ UNCOMMITTED isolation level
 * to prevent locking table rows on the local SmartNet POS database.
 */
export async function executeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const connection = await pool.getConnection();
  try {
    // Zero-locking read isolation level
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED');
    const [rows] = await connection.query(sql, params);
    return rows as T[];
  } finally {
    connection.release();
  }
}

export default pool;
