import { executeQuery } from './db';

/**
 * ADMINISTRADOR: Auditoría pura (Ventas, Propinas, Descuentos, Cancelaciones y Formas de Pago)
 */
export async function getAdminAuditSummary() {
  let sales: any = {};
  let cancellations: any = { total_cancelaciones: 0, monto_cancelado: 0 };
  let cortesias: any = {};

  try {
    // 1. Intentar obtener las cuentas del turno activo o de hoy
    let salesRows = await executeQuery(`
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
      WHERE DATE(fecha_turno) = CURRENT_DATE() 
         OR DATE(fechahora_apertura) = CURRENT_DATE()
         OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas);
    `);

    let salesRow = salesRows && salesRows.length > 0 ? salesRows[0] : null;

    // Fallback: Si no hay cuentas con la fecha de hoy, tomar el último grupo de cuentas registradas
    if (!salesRow || Number(salesRow.total_cuentas || 0) === 0) {
      const fallbackRows = await executeQuery(`
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
        FROM (
          SELECT * FROM cuentas ORDER BY folio DESC LIMIT 100
        ) AS ultimas_cuentas;
      `);
      if (fallbackRows && fallbackRows.length > 0) {
        salesRow = fallbackRows[0];
      }
    }

    if (salesRow) {
      sales = {
        total_cuentas: Number(salesRow.total_cuentas || 0),
        subtotal: Number(salesRow.subtotal || 0),
        total_descuentos: Number(salesRow.total_descuentos || 0),
        venta_neta: Number(salesRow.venta_neta || 0),
        total_iva: Number(salesRow.total_iva || 0),
        venta_total: Number(salesRow.venta_total || 0),
        total_propinas: Number(salesRow.total_propinas || 0),
        pago_efectivo: Number(salesRow.pago_efectivo || 0),
        pago_tarjetas: Number(salesRow.pago_tarjetas || 0),
        pago_dolares: Number(salesRow.pago_dolares || 0),
      };
    }
  } catch (e) {
    console.error('Error fetching sales summary:', e);
  }

  try {
    const cancRows = await executeQuery(`
      SELECT 
        COUNT(*) AS total_cancelaciones,
        0 AS monto_cancelado
      FROM bitacora_cuenta
      WHERE (descripcionTipo LIKE '%cancel%' OR descripcionTipo LIKE '%borra%');
    `);
    const cancRow = cancRows && cancRows.length > 0 ? cancRows[0] : null;
    if (cancRow) {
      cancellations = {
        total_cancelaciones: Number(cancRow.total_cancelaciones || 0),
        monto_cancelado: Number(cancRow.monto_cancelado || 0),
      };
    }
  } catch (e) {
    console.error('Error fetching cancellations:', e);
  }

  try {
    const cortRows = await executeQuery(`
      SELECT 
        COALESCE(SUM(covers_pagados_precio_publico), 0) AS covers_publico,
        COALESCE(SUM(covers_pagados_vip), 0) AS covers_vip,
        COALESCE(SUM(covers_promocion), 0) AS covers_promocion
      FROM covers_cortesias;
    `);
    const cortRow = cortRows && cortRows.length > 0 ? cortRows[0] : null;
    if (cortRow) {
      cortesias = {
        covers_publico: Number(cortRow.covers_publico || 0),
        covers_vip: Number(cortRow.covers_vip || 0),
        covers_promocion: Number(cortRow.covers_promocion || 0),
      };
    }
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
        COUNT(a.codigo) AS cantidad_vendida,
        COALESCE(SUM(a.precio), 0) AS total_ventas
      FROM articulos a
      GROUP BY a.codigo, a.nombre, a.familia
      ORDER BY cantidad_vendida DESC
      LIMIT 10;
    `);

    topDishes = topDishes.map(d => ({
      ...d,
      cantidad_vendida: Number(d.cantidad_vendida || 0),
      total_ventas: Number(d.total_ventas || 0),
    }));
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

    familySummary = familySummary.map(f => ({
      ...f,
      total_unidades: Number(f.total_unidades || 0),
      total_importe: Number(f.total_importe || 0),
    }));
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
      GROUP BY c.mesero
      ORDER BY venta_total DESC
      LIMIT 10;
    `);

    waiterRanking = waiterRanking.map(w => ({
      ...w,
      mesas_atendidas: Number(w.mesas_atendidas || 0),
      comensales_atendidos: Number(w.comensales_atendidos || 0),
      venta_total: Number(w.venta_total || 0),
      propinas_generadas: Number(w.propinas_generadas || 0),
    }));
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
      ORDER BY c.folio DESC
      LIMIT 20;
    `);

    activeTables = activeTables.map(t => ({
      ...t,
      personas: Number(t.personas || 0),
      subtotal: Number(t.subtotal || 0),
      total: Number(t.total || 0),
      minutos_abierta: Number(t.minutos_abierta || 0),
    }));
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
