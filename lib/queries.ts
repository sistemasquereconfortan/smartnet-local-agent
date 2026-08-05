import { executeQuery } from './db';

/**
 * ADMINISTRADOR: Auditoría pura (Ventas, Propinas, Descuentos, Cancelaciones y Formas de Pago)
 */
export async function getAdminAuditSummary() {
  let sales: any = {};
  let cancellations: any = { total_cancelaciones: 0, monto_cancelado: 0 };
  let cortesias: any = {};

  try {
    const [salesRow] = await executeQuery(`
      SELECT 
        COUNT(*) AS total_cuentas,
        COALESCE(SUM(subtotal), 0) AS subtotal,
        COALESCE(SUM(descuento), 0) AS total_descuentos,
        COALESCE(SUM(neto), 0) AS venta_neta,
        COALESCE(SUM(iva), 0) AS total_iva,
        COALESCE(SUM(total), 0) AS venta_total,
        COALESCE(SUM(propina), 0) AS total_propinas,
        COALESCE(SUM(cantidad_pesos), 0) AS pago_efectivo,
        COALESCE(SUM(pago1_cantidad + pago2_cantidad + pago3_cantidad), 0) AS pago_tarjetas,
        COALESCE(SUM(cantidad_dolares), 0) AS pago_dolares
      FROM cuentas
      WHERE fecha_turno = CURRENT_DATE();
    `);
    sales = salesRow || {};
  } catch (e) {
    console.error('Error fetching sales summary:', e);
  }

  try {
    const [cancRow] = await executeQuery(`
      SELECT 
        COUNT(*) AS total_cancelaciones,
        0 AS monto_cancelado
      FROM bitacora_cuenta
      WHERE DATE(fechaHora) = CURRENT_DATE()
        AND (descripcionTipo LIKE '%cancel%' OR descripcionTipo LIKE '%borra%');
    `);
    cancellations = cancRow || { total_cancelaciones: 0, monto_cancelado: 0 };
  } catch (e) {
    console.error('Error fetching cancellations:', e);
  }

  try {
    const [cortRow] = await executeQuery(`
      SELECT 
        COALESCE(SUM(covers_pagados_precio_publico), 0) AS covers_publico,
        COALESCE(SUM(covers_pagados_vip), 0) AS covers_vip,
        COALESCE(SUM(covers_promocion), 0) AS covers_promocion
      FROM covers_cortesias
      WHERE fecha = CURRENT_DATE();
    `);
    cortesias = cortRow || {};
  } catch (e) {
    console.error('Error fetching cortesias:', e);
  }

  return {
    fecha: new Date().toISOString().split('T')[0],
    resumen_ventas: sales,
    auditoria_cancelaciones: cancellations,
    cortesias: cortesias,
  };
}

/**
 * CHEF: Popularidad de Platillos y Familias de Alimentos
 */
export async function getChefDishPopularity() {
  let topDishes: any[] = [];
  let familySummary: any[] = [];

  try {
    topDishes = await executeQuery(`
      SELECT 
        a.codigo,
        a.nombre AS platillo,
        a.familia,
        COALESCE(SUM(ac.cantidad), 1) AS cantidad_vendida,
        COALESCE(SUM(ac.precio * ac.cantidad), 0) AS total_ventas
      FROM auditoria_cuenta ac
      INNER JOIN articulos a ON ac.codigo = a.codigo
      GROUP BY a.codigo, a.nombre, a.familia
      ORDER BY cantidad_vendida DESC
      LIMIT 10;
    `);
  } catch (e) {
    console.error('Error fetching top dishes:', e);
  }

  try {
    familySummary = await executeQuery(`
      SELECT 
        familia,
        COUNT(*) AS total_unidades,
        COALESCE(SUM(precio), 0) AS total_importe
      FROM articulos
      GROUP BY familia
      LIMIT 10;
    `);
  } catch (e) {
    console.error('Error fetching family summary:', e);
  }

  return {
    fecha: new Date().toISOString().split('T')[0],
    top_10_platillos: topDishes,
    ventas_por_familia: familySummary,
  };
}

/**
 * CAPITANA DE PISO: Productividad de Meseros y Mesas Activas en Tiempo Real
 */
export async function getFloorCaptainStatus() {
  let waiterRanking: any[] = [];
  let activeTables: any[] = [];

  try {
    waiterRanking = await executeQuery(`
      SELECT 
        c.mesero AS codigo_mesero,
        COUNT(c.folio) AS mesas_atendidas,
        COALESCE(SUM(c.personas), 0) AS comensales_atendidos,
        COALESCE(SUM(c.total), 0) AS venta_total,
        COALESCE(SUM(c.propina), 0) AS propinas_generadas
      FROM cuentas c
      WHERE c.fecha_turno = CURRENT_DATE()
      GROUP BY c.mesero
      ORDER BY venta_total DESC;
    `);
  } catch (e) {
    console.error('Error fetching waiter ranking:', e);
  }

  try {
    activeTables = await executeQuery(`
      SELECT 
        c.folio,
        c.serie,
        c.caja,
        c.mesa,
        c.mesero,
        c.personas,
        c.subtotal,
        c.total,
        c.fecha_turno,
        CASE 
          WHEN c.fechahora_apertura IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, c.fechahora_apertura, NOW())
          ELSE 0
        END AS minutos_abierta
      FROM cuentas c
      WHERE c.fecha_turno = CURRENT_DATE()
        AND (c.estado IS NULL OR c.estado = '' OR c.estado = 'A' OR c.fechahora_cierre IS NULL)
      ORDER BY c.mesa ASC;
    `);
  } catch (e) {
    console.error('Error fetching active tables:', e);
  }

  return {
    fecha: new Date().toISOString().split('T')[0],
    ranking_meseros: waiterRanking,
    mesas_activas: activeTables,
    total_mesas_activas: activeTables.length,
  };
}
