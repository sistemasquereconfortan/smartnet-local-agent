import { executeQuery } from './db';

/**
 * ADMINISTRADOR: Auditoría pura (Ventas, Propinas, Descuentos, Cancelaciones y Formas de Pago)
 */
export async function getAdminAuditSummary() {
  // 1. Resumen de Ventas y Propinas del Día / Turno Actual
  const salesSummarySql = `
    SELECT 
      COUNT(*) AS total_cuentas,
      COALESCE(SUM(subtotal), 0) AS subtotal,
      COALESCE(SUM(descuento), 0) AS total_descuentos,
      COALESCE(SUM(neto), 0) AS venta_neta,
      COALESCE(SUM(iva), 0) AS total_iva,
      COALESCE(SUM(total), 0) AS venta_total,
      COALESCE(SUM(propina), 0) AS total_propinas,
      COALESCE(SUM(total_efectivo), 0) AS pago_efectivo,
      COALESCE(SUM(total_tarjetas), 0) AS pago_tarjetas,
      COALESCE(SUM(total_dolares), 0) AS pago_dolares
    FROM cuentas
    WHERE fecha_turno = CURRENT_DATE();
  `;

  // 2. Resumen de Cancelaciones
  const cancellationsSql = `
    SELECT 
      COUNT(*) AS total_cancelaciones,
      COALESCE(SUM(cantidad * precio), 0) AS monto_cancelado
    FROM auditoria_cuenta
    WHERE DATE(fecha_creacion) = CURRENT_DATE()
      OR caja_sale IS NOT NULL;
  `;

  // 3. Detalle de Cortesías y Promociones
  const cortesiasSql = `
    SELECT 
      COALESCE(SUM(covers_pagados_precio_publico), 0) AS covers_publico,
      COALESCE(SUM(covers_pagados_vip), 0) AS covers_vip,
      COALESCE(SUM(covers_promocion), 0) AS covers_promocion
    FROM covers_cortesias
    WHERE fecha = CURRENT_DATE();
  `;

  const [sales] = await executeQuery(salesSummarySql);
  const [cancellations] = await executeQuery(cancellationsSql);
  const [cortesias] = await executeQuery(cortesiasSql);

  return {
    fecha: new Date().toISOString().split('T')[0],
    resumen_ventas: sales || {},
    auditoria_cancelaciones: cancellations || { total_cancelaciones: 0, monto_cancelado: 0 },
    cortesias: cortesias || {},
  };
}

/**
 * CHEF: Popularidad de Platillos y Familias de Alimentos
 */
export async function getChefDishPopularity() {
  // Top 10 Platillos más vendidos del día
  const topDishesSql = `
    SELECT 
      a.codigo,
      a.nombre AS platillo,
      a.familia,
      COUNT(ac.codigo) AS cantidad_vendida,
      COALESCE(SUM(ac.precio), 0) AS total_ventas
    FROM auditoria_cuenta ac
    INNER JOIN articulos a ON ac.codigo = a.codigo
    WHERE DATE(ac.fecha_creacion) = CURRENT_DATE()
    GROUP BY a.codigo, a.nombre, a.familia
    ORDER BY cantidad_vendida DESC
    LIMIT 10;
  `;

  // Ventas agrupadas por Familia (Alimentos vs Bebidas, etc.)
  const familySummarySql = `
    SELECT 
      a.familia,
      COUNT(ac.codigo) AS total_unidades,
      COALESCE(SUM(ac.precio), 0) AS total_importe
    FROM auditoria_cuenta ac
    INNER JOIN articulos a ON ac.codigo = a.codigo
    WHERE DATE(ac.fecha_creacion) = CURRENT_DATE()
    GROUP BY a.familia
    ORDER BY total_importe DESC;
  `;

  const topDishes = await executeQuery(topDishesSql);
  const familySummary = await executeQuery(familySummarySql);

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
  // Ranking de Ventas por Mesero en el Día
  const waiterRankingSql = `
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
  `;

  // Lista de Mesas Activas (Abiertas actualmente)
  const activeTablesSql = `
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
      TIMESTAMPDIFF(MINUTE, c.fecha_turno, NOW()) AS minutos_abierta
    FROM cuentas c
    WHERE c.fecha_turno = CURRENT_DATE()
      AND (c.status IS NULL OR c.status = '' OR c.status = 'A')
    ORDER BY c.mesa ASC;
  `;

  const waiterRanking = await executeQuery(waiterRankingSql);
  const activeTables = await executeQuery(activeTablesSql);

  return {
    fecha: new Date().toISOString().split('T')[0],
    ranking_meseros: waiterRanking,
    mesas_activas: activeTables,
    total_mesas_activas: activeTables.length,
  };
}
