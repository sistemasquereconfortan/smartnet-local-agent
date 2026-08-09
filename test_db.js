const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '192.168.1.234',
    user: 'root',
    password: 'Sm4rtn3t_2021',
    database: 'autoctona'
  });

  try {
    const [rows] = await connection.query(`
      SELECT 
        sub.pago_id,
        COALESCE(p.nombre, CASE WHEN sub.pago_id = 0 THEN 'Efectivo M.N.' WHEN sub.pago_id = -1 THEN 'Dólares' WHEN sub.pago_id = -2 THEN 'CXC' ELSE CONCAT('Tipo ', sub.pago_id) END) AS nombre,
        SUM(sub.cantidad) AS total,
        SUM(sub.propina) AS total_propina
      FROM (
        SELECT 0 AS pago_id, COALESCE(cantidad_pesos, 0) AS cantidad, 0 AS propina FROM cuentas WHERE fecha_turno = '2026-08-08' AND cantidad_pesos > 0
        UNION ALL
        SELECT -1 AS pago_id, COALESCE(cantidad_dolares * COALESCE(dolares_tc, 1), 0) AS cantidad, 0 AS propina FROM cuentas WHERE fecha_turno = '2026-08-08' AND cantidad_dolares > 0
        UNION ALL
        SELECT -2 AS pago_id, COALESCE(cargo_cxc, 0) AS cantidad, 0 AS propina FROM cuentas WHERE fecha_turno = '2026-08-08' AND cargo_cxc > 0
        UNION ALL
        SELECT pago1 AS pago_id, COALESCE(pago1_cantidad, 0) AS cantidad, COALESCE(pago1_propina, 0) AS propina FROM cuentas WHERE fecha_turno = '2026-08-08' AND pago1 IS NOT NULL AND pago1 > 0 AND pago1_cantidad > 0
        UNION ALL
        SELECT pago2 AS pago_id, COALESCE(pago2_cantidad, 0) AS cantidad, COALESCE(pago2_propina, 0) AS propina FROM cuentas WHERE fecha_turno = '2026-08-08' AND pago2 IS NOT NULL AND pago2 > 0 AND pago2_cantidad > 0
        UNION ALL
        SELECT pago3 AS pago_id, COALESCE(pago3_cantidad, 0) AS cantidad, COALESCE(pago3_propina, 0) AS propina FROM cuentas WHERE fecha_turno = '2026-08-08' AND pago3 IS NOT NULL AND pago3 > 0 AND pago3_cantidad > 0
      ) sub
      LEFT JOIN pagos p ON sub.pago_id = p.codigo
      GROUP BY sub.pago_id, p.nombre
      ORDER BY total DESC;
    `);
    console.log("PAYMENT DISTRIBUTION WITH TIPS FOR 2026-08-08:");
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.error('Query Error:', error.message);
  } finally {
    await connection.end();
  }
}

main();
