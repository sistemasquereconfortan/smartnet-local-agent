import { executeQuery } from './db';

/**
 * ADMINISTRADOR: Auditoría pura (Ventas, Propinas, Descuentos, Cancelaciones, Formas de Pago, Tendencia y Tabla de Cuentas)
 * @param range 'hoy' | 'semana' | 'mes'
 */
export async function getAdminAuditSummary(range: string = 'hoy') {
  let sales: any = {};
  let cancellations: any = { total_cancelaciones: 0, monto_cancelado: 0 };
  let accountDetails: any[] = [];
  let dailyTrend: any[] = [];

  // Construir la condición de fecha SQL según el rango seleccionado
  let dateWhere = `WHERE fecha_turno = CURDATE() OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas)`;
  let trendLimit = 14;

  if (range === 'semana') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    trendLimit = 7;
  } else if (range === 'mes') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    trendLimit = 30;
  }

  try {
    // 1. Resumen general del rango seleccionado
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
      ${dateWhere};
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
    // 2. Tendencia de Venta Neta Diaria (compatible MySQL 5.1)
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
      LIMIT ${trendLimit};
    `);

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
    // 3. Tabla de detalle de cuentas según el rango seleccionado
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
      ${dateWhere}
      ORDER BY folio DESC
      LIMIT 100;
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
    rango_seleccionado: range,
    fecha: new Date().toISOString().split('T')[0],
    resumen_ventas: sales,
    auditoria_cancelaciones: cancellations,
    tendencia_diaria: dailyTrend,
    detalle_cuentas: accountDetails,
  };
}

/**
 * CHEF: Popularidad de Platillos y Familias de Alimentos (Detalle Real de Comanda)
 */
export async function getChefDishPopularity() {
  let topDishes: any[] = [];
  let familySummary: any[] = [];

  try {
    topDishes = await executeQuery(`
      SELECT 
        d.codigo,
        COALESCE(a.nombre, d.codigo) AS platillo,
        COALESCE(a.familia, 'General') AS familia,
        SUM(COALESCE(d.cantidad, 1)) AS cantidad_vendida,
        SUM(COALESCE(d.precio * d.cantidad, d.precio, 0)) AS total_ventas
      FROM cuentas_detalle d
      LEFT JOIN articulos a ON d.codigo = a.codigo
      GROUP BY d.codigo, platillo, familia
      ORDER BY cantidad_vendida DESC
      LIMIT 10;
    `);

    topDishes = (topDishes || []).map(d => ({
      codigo: String(d.codigo || ''),
      platillo: String(d.platillo || 'Platillo'),
      familia: String(d.familia || 'General'),
      cantidad_vendida: Number(d.cantidad_vendida || 0),
      total_ventas: Number(d.total_ventas || 0),
    }));
  } catch (e) {
    console.error('Error fetching top dishes from cuentas_detalle:', e);
  }

  if (!topDishes || topDishes.length === 0) {
    try {
      topDishes = await executeQuery(`
        SELECT 
          codigo,
          nombre AS platillo,
          COALESCE(familia, 'General') AS familia,
          1 AS cantidad_vendida,
          0 AS total_ventas
        FROM articulos
        LIMIT 10;
      `);
      topDishes = (topDishes || []).map(d => ({
        ...d,
        cantidad_vendida: Number(d.cantidad_vendida || 0),
        total_ventas: Number(d.total_ventas || 0),
      }));
    } catch (err) {
      console.error('Fallback query error:', err);
    }
  }

  try {
    familySummary = await executeQuery(`
      SELECT 
        COALESCE(a.familia, 'General') AS familia,
        SUM(COALESCE(d.cantidad, 1)) AS total_unidades,
        SUM(COALESCE(d.precio * d.cantidad, d.precio, 0)) AS total_importe
      FROM cuentas_detalle d
      LEFT JOIN articulos a ON d.codigo = a.codigo
      GROUP BY familia
      ORDER BY total_unidades DESC
      LIMIT 10;
    `);

    familySummary = (familySummary || []).map(f => ({
      familia: String(f.familia || 'Sin Categoría'),
      total_unidades: Number(f.total_unidades || 0),
      total_importe: Number(f.total_importe || 0),
    }));
  } catch (e) {
    console.error('Error fetching family summary from cuentas_detalle:', e);
  }

  return {
    fecha: new Date().toISOString().split('T')[0],
    top_10_platillos: topDishes,
    ventas_por_familia: familySummary,
  };
}

/**
 * CAPITANA DE PISO: Productividad Humana y Rendimiento Detallado por Mesero
 */
export async function getFloorCaptainStatus() {
  let waiterRanking: any[] = [];
  let activeTables: any[] = [];

  try {
    // Intenta unir cuentas con el catálogo de personal si existe la tabla
    waiterRanking = await executeQuery(`
      SELECT 
        c.mesero AS id_mesero,
        COALESCE(p.nombre, CONCAT('Mesero ', c.mesero)) AS nombre_mesero,
        COALESCE(p.puesto, 'Mesero') AS cargo_puesto,
        COUNT(c.mesa) AS mesas_atendidas,
        COALESCE(SUM(c.personas), 0) AS comensales_atendidos,
        COALESCE(SUM(c.total), 0) AS venta_total,
        COALESCE(SUM(c.propina), 0) AS propinas_registradas
      FROM cuentas c
      LEFT JOIN personal p ON CAST(c.mesero AS CHAR) = CAST(p.codigo AS CHAR)
      WHERE c.fecha_turno = CURDATE() OR c.fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas)
      GROUP BY c.mesero, p.nombre, p.puesto
      ORDER BY venta_total DESC
      LIMIT 30;
    `);
  } catch (e: any) {
    console.warn('JOIN with personal failed, falling back to direct cuentas query:', e?.message || e);
    try {
      waiterRanking = await executeQuery(`
        SELECT 
          c.mesero AS id_mesero,
          CONCAT('Mesero ', c.mesero) AS nombre_mesero,
          'Mesero' AS cargo_puesto,
          COUNT(c.mesa) AS mesas_atendidas,
          COALESCE(SUM(c.personas), 0) AS comensales_atendidos,
          COALESCE(SUM(c.total), 0) AS venta_total,
          COALESCE(SUM(c.propina), 0) AS propinas_registradas
        FROM cuentas c
        WHERE c.fecha_turno = CURDATE() OR c.fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas)
        GROUP BY c.mesero
        ORDER BY venta_total DESC
        LIMIT 30;
      `);
    } catch (err) {
      console.error('Error fetching waiter ranking:', err);
    }
  }

  // Mapear métricas detalladas requeridas por la capitana (Nombre, Cargo, ID, Total Vendido, Mesas, PAX, Ticket Promedio y Tira Propina 6%)
  waiterRanking = (waiterRanking || []).map(w => {
    const ventaTotal = Number(w.venta_total || 0);
    const mesasAtendidas = Number(w.mesas_atendidas || 0);
    const paxTotal = Number(w.comensales_atendidos || 0);
    const ticketPromedioMesa = mesasAtendidas > 0 ? ventaTotal / mesasAtendidas : 0;
    const ticketPromedioPax = paxTotal > 0 ? ventaTotal / paxTotal : 0;
    const tiraPropina6 = ventaTotal * 0.06;

    return {
      id_mesero: String(w.id_mesero || ''),
      nombre_mesero: String(w.nombre_mesero || `Mesero ${w.id_mesero}`),
      cargo_puesto: String(w.cargo_puesto || 'Mesero'),
      mesas_atendidas: mesasAtendidas,
      pax_total: paxTotal,
      venta_total: ventaTotal,
      ticket_promedio_mesa: ticketPromedioMesa,
      ticket_promedio_pax: ticketPromedioPax,
      tira_propina_6pct: tiraPropina6,
      propinas_registradas: Number(w.propinas_registradas || 0),
    };
  });

  try {
    // Buscar mesas activas (priorizando cuentas sin folio o sin cierre)
    activeTables = await executeQuery(`
      SELECT 
        COALESCE(c.folio, 0) AS folio,
        c.serie,
        c.caja,
        c.mesa,
        c.mesero,
        c.personas,
        c.subtotal,
        c.total,
        c.fecha_turno,
        CAST(c.fechahora_apertura AS CHAR) AS hora_apertura,
        CAST(c.fechahora_cierre AS CHAR) AS hora_cierre,
        c.estado,
        CASE 
          WHEN c.folio IS NULL OR c.folio = 0 OR c.fechahora_cierre IS NULL THEN 'ABIERTA'
          ELSE 'CERRADA'
        END AS estado_mesa,
        CASE 
          WHEN c.fechahora_apertura IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, c.fechahora_apertura, NOW())
          ELSE 0
        END AS minutos_abierta
      FROM cuentas c
      WHERE (c.fecha_turno = CURDATE() OR c.fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas))
      ORDER BY 
        CASE WHEN c.folio IS NULL OR c.folio = 0 OR c.fechahora_cierre IS NULL THEN 0 ELSE 1 END ASC,
        c.fechahora_apertura DESC
      LIMIT 30;
    `);

    activeTables = (activeTables || []).map(t => ({
      folio: Number(t.folio || 0),
      serie: String(t.serie || ''),
      caja: String(t.caja || ''),
      mesa: String(t.mesa || 'Mesa'),
      mesero: String(t.mesero || '--'),
      personas: Number(t.personas || 0),
      subtotal: Number(t.subtotal || 0),
      total: Number(t.total || 0),
      fecha_turno: String(t.fecha_turno || ''),
      minutos_abierta: Number(t.minutos_abierta || 0),
      estado_mesa: String(t.estado_mesa || 'ABIERTA'),
      es_abierta: t.estado_mesa === 'ABIERTA' || !t.folio || t.folio === 0 || !t.hora_cierre,
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
