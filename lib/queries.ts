import { executeQuery } from './db';

/**
 * ADMINISTRADOR: Auditoría pura (Ventas, Propinas, Descuentos, Cancelaciones, Formas de Pago, Tendencia y Tabla de Cuentas)
 */
export async function getAdminAuditSummary() {
  let sales: any = {};
  let cancellations: any = { total_cancelaciones: 0, monto_cancelado: 0 };
  let accountDetails: any[] = [];
  let dailyTrend: any[] = [];

  try {
    // 1. Resumen general del turno actual
    const salesRows = await executeQuery(`
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
      WHERE fecha_turno = CURDATE() OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas);
    `);

    const salesRow = salesRows && salesRows.length > 0 ? salesRows[0] : null;

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
    // 2. Tendencia de Venta Neta Diaria de los últimos 14 días (compatible MySQL 5.1)
    const rawTrend = await executeQuery(`
      SELECT 
        CAST(fecha_turno AS CHAR) AS fecha,
        COALESCE(SUM(neto), 0) AS venta_neta,
        COALESCE(SUM(total), 0) AS venta_total,
        COUNT(*) AS total_cuentas
      FROM cuentas
      WHERE fecha_turno IS NOT NULL
      GROUP BY fecha_turno
      ORDER BY fecha_turno DESC
      LIMIT 14;
    `);

    // Invertir para mostrar de más antiguo a más reciente (izquierda a derecha)
    dailyTrend = (rawTrend || []).reverse().map(d => ({
      fecha: String(d.fecha || '').slice(0, 10),
      venta_neta: Number(d.venta_neta || 0),
      venta_total: Number(d.venta_total || 0),
      total_cuentas: Number(d.total_cuentas || 0),
    }));
  } catch (e) {
    console.error('Error fetching daily trend:', e);
  }

  try {
    // 3. Tabla de detalle de cada cuenta del turno (compatible MySQL 5.1)
    const rawAccounts = await executeQuery(`
      SELECT 
        folio,
        mesa,
        mesero,
        COALESCE(subtotal, 0) AS subtotal,
        COALESCE(descuento, 0) AS descuento,
        COALESCE(total, 0) AS total,
        COALESCE(propina, 0) AS propina,
        COALESCE(cantidad_pesos, 0) AS efectivo,
        COALESCE(pago1_cantidad + pago2_cantidad + pago3_cantidad, 0) AS tarjeta,
        COALESCE(cantidad_dolares, 0) AS dolares,
        CAST(fechahora_apertura AS CHAR) AS hora_apertura,
        CAST(fechahora_cierre AS CHAR) AS hora_cierre,
        estado
      FROM cuentas
      WHERE fecha_turno = CURDATE() OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas)
      ORDER BY folio DESC;
    `);

    accountDetails = (rawAccounts || []).map(acc => {
      const apStr = String(acc.hora_apertura || '');
      const ciStr = String(acc.hora_cierre || '');
      return {
        folio: acc.folio,
        mesa: String(acc.mesa || 'Mesa'),
        mesero: String(acc.mesero || '--'),
        subtotal: Number(acc.subtotal || 0),
        descuento: Number(acc.descuento || 0),
        total: Number(acc.total || 0),
        propina: Number(acc.propina || 0),
        efectivo: Number(acc.efectivo || 0),
        tarjeta: Number(acc.tarjeta || 0),
        dolares: Number(acc.dolares || 0),
        hora_apertura: apStr.length >= 16 ? apStr.slice(11, 16) : (apStr || '--:--'),
        hora_cierre: ciStr.length >= 16 ? ciStr.slice(11, 16) : (ciStr || '--:--'),
        estado: acc.estado,
      };
    });
  } catch (e) {
    console.error('Error fetching account details:', e);
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

  return {
    fecha: new Date().toISOString().split('T')[0],
    resumen_ventas: sales,
    auditoria_cancelaciones: cancellations,
    tendencia_diaria: dailyTrend,
    detalle_cuentas: accountDetails,
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
      WHERE c.fecha_turno = CURDATE() OR c.fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas)
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
      WHERE (c.fecha_turno = CURDATE() OR c.fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas))
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
