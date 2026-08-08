import { executeQuery } from './db';

/**
 * Helper to fetch the active shift from turno_actual.
 * Returns the shift date, number, and box ID.
 */
async function getActiveShift() {
  try {
    const rows = await executeQuery(`SELECT caja, turno, CAST(fecha AS CHAR) AS fecha FROM turno_actual LIMIT 1;`);
    if (rows && rows.length > 0) {
      return {
        caja: Number(rows[0].caja),
        turno: Number(rows[0].turno),
        fecha: String(rows[0].fecha || '').slice(0, 10), // YYYY-MM-DD
        active: true
      };
    }
  } catch (err) {
    console.warn('Table turno_actual not available or query failed. Using default date filters.');
  }
  return { active: false, caja: 0, turno: 0, fecha: '' };
}

export async function getAdminAuditSummary(range: string = 'hoy', startDate?: string, endDate?: string, shiftNumber?: number) {
  let sales: any = {};
  let cancellations: any = { total_cancelaciones: 0, monto_cancelado: 0 };
  let accountDetails: any[] = [];
  let dailyTrend: any[] = [];

  // Construir la condición de fecha SQL según el rango seleccionado o los inputs de búsqueda
  const shift = await getActiveShift();
  let dateWhere = `WHERE (fecha_turno = CURDATE() OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas))`;
  let dateFilter = `WHERE (fecha = CURDATE() OR fecha = (SELECT MAX(fecha_turno) FROM cuentas))`;
  let bitacoraFilter = `WHERE (DATE(b.fechaHora) = CURDATE() OR DATE(b.fechaHora) = (SELECT MAX(fecha_turno) FROM cuentas))`;
  let trendLimit = 14;

  if (startDate && endDate) {
    dateWhere = `WHERE fecha_turno BETWEEN '${startDate}' AND '${endDate}'`;
    dateFilter = `WHERE fecha BETWEEN '${startDate}' AND '${endDate}'`;
    bitacoraFilter = `WHERE DATE(b.fechaHora) BETWEEN '${startDate}' AND '${endDate}'`;
    if (shiftNumber) {
      dateWhere += ` AND turno = ${shiftNumber}`;
      dateFilter += ` AND turno = ${shiftNumber}`;
    }
    trendLimit = 100;
  } else if (range === 'semana') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    dateFilter = `WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    bitacoraFilter = `WHERE b.fechaHora >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    trendLimit = 7;
  } else if (range === 'mes') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    dateFilter = `WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    bitacoraFilter = `WHERE b.fechaHora >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    trendLimit = 30;
  } else if (range === 'todo') {
    dateWhere = `WHERE fecha_turno IS NOT NULL`;
    dateFilter = `WHERE fecha IS NOT NULL`;
    bitacoraFilter = `WHERE b.fechaHora IS NOT NULL`;
    trendLimit = 60;
  } else if (range === 'hoy' && shift.active) {
    dateWhere = `WHERE fecha_turno = '${shift.fecha}' AND turno = ${shift.turno}`;
    dateFilter = `WHERE fecha = '${shift.fecha}' AND turno = ${shift.turno}`;
    bitacoraFilter = `WHERE DATE(b.fechaHora) = '${shift.fecha}'`;
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
        COALESCE(SUM(propina + pago1_propina + pago2_propina + pago3_propina), 0) AS total_propinas,
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

  let paymentDistribution: any[] = [];
  try {
    const paymentRows = await executeQuery(`
      SELECT 
        sub.pago_id,
        COALESCE(p.nombre, CASE WHEN sub.pago_id = 0 THEN 'Efectivo M.N.' WHEN sub.pago_id = -1 THEN 'Dólares' ELSE CONCAT('Tipo ', sub.pago_id) END) AS nombre,
        SUM(sub.cantidad) AS total
      FROM (
        SELECT 0 AS pago_id, COALESCE(cantidad_pesos, 0) AS cantidad FROM cuentas ${dateWhere} AND cantidad_pesos > 0
        UNION ALL
        SELECT -1 AS pago_id, COALESCE(cantidad_dolares * COALESCE(dolares_tc, 1), 0) AS cantidad FROM cuentas ${dateWhere} AND cantidad_dolares > 0
        UNION ALL
        SELECT pago1 AS pago_id, COALESCE(pago1_cantidad, 0) AS cantidad FROM cuentas ${dateWhere} AND pago1 IS NOT NULL AND pago1 > 0 AND pago1_cantidad > 0
        UNION ALL
        SELECT pago2 AS pago_id, COALESCE(pago2_cantidad, 0) AS cantidad FROM cuentas ${dateWhere} AND pago2 IS NOT NULL AND pago2 > 0 AND pago2_cantidad > 0
        UNION ALL
        SELECT pago3 AS pago_id, COALESCE(pago3_cantidad, 0) AS cantidad FROM cuentas ${dateWhere} AND pago3 IS NOT NULL AND pago3 > 0 AND pago3_cantidad > 0
      ) sub
      LEFT JOIN pagos p ON sub.pago_id = p.codigo
      GROUP BY sub.pago_id, p.nombre
      ORDER BY total DESC;
    `);
    paymentDistribution = (paymentRows || []).map(r => ({
      pago_id: Number(r.pago_id),
      nombre: String(r.nombre),
      total: Number(r.total || 0),
    }));
  } catch (err) {
    console.error('Error fetching payment distribution with join, attempting fallback:', err);
    try {
      const fallbackRows = await executeQuery(`
        SELECT 
          sub.pago_id,
          CASE WHEN sub.pago_id = 0 THEN 'Efectivo M.N.' WHEN sub.pago_id = -1 THEN 'Dólares' ELSE CONCAT('Método ', sub.pago_id) END AS nombre,
          SUM(sub.cantidad) AS total
        FROM (
          SELECT 0 AS pago_id, COALESCE(cantidad_pesos, 0) AS cantidad FROM cuentas ${dateWhere} AND cantidad_pesos > 0
          UNION ALL
          SELECT -1 AS pago_id, COALESCE(cantidad_dolares * COALESCE(dolares_tc, 1), 0) AS cantidad FROM cuentas ${dateWhere} AND cantidad_dolares > 0
          UNION ALL
          SELECT pago1 AS pago_id, COALESCE(pago1_cantidad, 0) AS cantidad FROM cuentas ${dateWhere} AND pago1 IS NOT NULL AND pago1 > 0 AND pago1_cantidad > 0
          UNION ALL
          SELECT pago2 AS pago_id, COALESCE(pago2_cantidad, 0) AS cantidad FROM cuentas ${dateWhere} AND pago2 IS NOT NULL AND pago2 > 0 AND pago2_cantidad > 0
          UNION ALL
          SELECT pago3 AS pago_id, COALESCE(pago3_cantidad, 0) AS cantidad FROM cuentas ${dateWhere} AND pago3 IS NOT NULL AND pago3 > 0 AND pago3_cantidad > 0
        ) sub
        GROUP BY sub.pago_id
        ORDER BY total DESC;
      `);
      paymentDistribution = (fallbackRows || []).map(r => ({
        pago_id: Number(r.pago_id),
        nombre: String(r.nombre),
        total: Number(r.total || 0),
      }));
    } catch (fallbackErr) {
      console.error('Fallback payment query failed:', fallbackErr);
    }
  }

  // 1.5. Obtener gastos de caja chica del turno actual o rango seleccionado
  let totalGastos = 0;
  let listadoGastos: any[] = [];
  try {
    const gastosSum = await executeQuery(`
      SELECT COALESCE(SUM(importe), 0) AS total FROM gastos ${dateFilter};
    `);
    totalGastos = Number(gastosSum[0]?.total || 0);

    const detailRows = await executeQuery(`
      SELECT 
        concepto, 
        importe, 
        CAST(fechahora AS CHAR) AS hora
      FROM gastos
      ${dateFilter}
      ORDER BY id DESC;
    `);
    listadoGastos = (detailRows || []).map(g => ({
      concepto: String(g.concepto || 'Gasto General'),
      importe: Number(g.importe || 0),
      hora: String(g.hora || '').slice(11, 16)
    }));
  } catch (err) {
    console.error('Error fetching gastos:', err);
  }

  // 1.6. Obtener Cuentas por Cobrar (CxC)
  let totalCargosCxC = 0;
  let totalAbonosCxC = 0;
  let topClientesCxC: any[] = [];
  try {
    // Cargos
    const cargosSum = await executeQuery(`
      SELECT COALESCE(SUM(importe), 0) AS total FROM cxc_cargos ${dateFilter};
    `);
    totalCargosCxC = Number(cargosSum[0]?.total || 0);

    // Abonos
    const abonosSum = await executeQuery(`
      SELECT COALESCE(SUM(importe), 0) AS total FROM cxc_abonos ${dateFilter};
    `);
    totalAbonosCxC = Number(abonosSum[0]?.total || 0);

    // Top 5 deudores
    const deudores = await executeQuery(`
      SELECT 
        codigo, 
        nombre, 
        COALESCE(saldo, 0) AS saldo 
      FROM cxc_clients 
      WHERE COALESCE(saldo, 0) > 0 
      ORDER BY saldo DESC 
      LIMIT 5;
    `);
    topClientesCxC = (deudores || []).map(d => ({
      codigo: Number(d.codigo),
      nombre: String(d.nombre),
      saldo: Number(d.saldo)
    }));
  } catch (err) {
    console.error('Error fetching CxC, attempting fallback:', err);
    try {
      const deudores = await executeQuery(`
        SELECT 
          codigo, 
          nombre, 
          COALESCE(saldo, 0) AS saldo 
        FROM clientes 
        WHERE COALESCE(saldo, 0) > 0 
        ORDER BY saldo DESC 
        LIMIT 5;
      `);
      topClientesCxC = (deudores || []).map(d => ({
        codigo: Number(d.codigo),
        nombre: String(d.nombre),
        saldo: Number(d.saldo)
      }));
    } catch (e) {
      console.error('CxC fallback failed:', e);
    }
  }

  // 1.7. Obtener Ventas por Hora (solo si es un reporte diario)
  let hourlySales: any[] = [];
  const isDaily = range === 'hoy' || (startDate && startDate === endDate);
  if (isDaily) {
    try {
      const hourlyRows = await executeQuery(`
        SELECT 
          HOUR(COALESCE(fechahora_apertura, fechahora_cierre)) AS hora,
          COALESCE(SUM(total), 0) AS total,
          COUNT(*) AS total_cuentas
        FROM cuentas
        ${dateWhere}
        GROUP BY HOUR(COALESCE(fechahora_apertura, fechahora_cierre))
        ORDER BY hora ASC;
      `);
      hourlySales = (hourlyRows || []).map(h => ({
        hora: `${String(h.hora).padStart(2, '0')}:00`,
        total: Number(h.total || 0),
        total_cuentas: Number(h.total_cuentas || 0),
      }));
    } catch (e) {
      console.error('Error fetching hourly sales:', e);
    }
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
        CAST(mesero AS CHAR) AS mesero,
        COALESCE(subtotal, 0) AS subtotal,
        COALESCE(descuento, 0) AS descuento,
        COALESCE(total, 0) AS total,
        COALESCE(propina + pago1_propina + pago2_propina + pago3_propina, 0) AS propina,
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
        COALESCE(SUM(c.total), 0) AS monto_cancelado
      FROM bitacora_cuenta b
      LEFT JOIN cuentas c ON b.idCuenta = c.guid
      ${bitacoraFilter} AND (b.descripcionTipo LIKE '%cancel%' OR b.descripcionTipo LIKE '%borra%' OR b.comentario LIKE '%cancel%' OR b.comentario LIKE '%borra%');
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
    resumen_ventas: {
      ...sales,
      total_gastos: totalGastos,
      total_cargos_cxc: totalCargosCxC,
      total_abonos_cxc: totalAbonosCxC,
    },
    auditoria_cancelaciones: cancellations,
    tendencia_diaria: dailyTrend,
    detalle_cuentas: accountDetails,
    distribucion_pagos: paymentDistribution,
    listado_gastos: listadoGastos,
    top_clientes_cxc: topClientesCxC,
    ventas_por_hora: hourlySales,
  };
}

/**
 * CHEF: Popularidad de Platillos y Familias de Alimentos (Detalle Real de Comanda)
 */
export async function getChefDishPopularity(range: string = 'hoy', startDate?: string, endDate?: string) {
  let topDishes: any[] = [];
  let familySummary: any[] = [];

  const shift = await getActiveShift();
  let dateWhere = `WHERE (fecha_turno = CURDATE() OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas))`;

  if (startDate && endDate) {
    dateWhere = `WHERE fecha_turno BETWEEN '${startDate}' AND '${endDate}'`;
  } else if (range === 'semana') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
  } else if (range === 'mes') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
  } else if (range === 'año') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)`;
  } else if (range === 'todo') {
    dateWhere = `WHERE fecha_turno IS NOT NULL`;
  } else if (range === 'hoy' && shift.active) {
    dateWhere = `WHERE fecha_turno = '${shift.fecha}' AND turno = ${shift.turno}`;
  }

  try {
    topDishes = await executeQuery(`
      SELECT 
        d.codigo,
        COALESCE(m.nombre, d.codigo) AS platillo,
        COALESCE(fp.nombre, 'General') AS familia,
        SUM(COALESCE(d.cantidad, 1)) AS cantidad_vendida,
        SUM(COALESCE(d.precio * d.cantidad, d.precio, 0)) AS total_ventas,
        COALESCE(fp.es_alimentos, 0) AS es_alimentos,
        COALESCE(fp.es_bebidas, 0) AS es_bebidas
      FROM cuentas c
      INNER JOIN cuentas_detalle d ON c.caja = d.caja AND c.folio = d.folio AND c.serie = d.serie
      LEFT JOIN menu m ON d.codigo = m.codigo
      LEFT JOIN familias_platillos fp ON m.familia = fp.codigo
      ${dateWhere}
        AND (m.es_adicional = 0 OR m.es_adicional IS NULL)
      GROUP BY d.codigo, platillo, familia, fp.es_alimentos, fp.es_bebidas
      ORDER BY cantidad_vendida DESC
      LIMIT 300;
    `);

    topDishes = (topDishes || []).map(d => ({
      codigo: String(d.codigo || ''),
      platillo: String(d.platillo || 'Platillo'),
      familia: String(d.familia || 'General'),
      cantidad_vendida: Number(d.cantidad_vendida || 0),
      total_ventas: Number(d.total_ventas || 0),
      es_alimentos: Number(d.es_alimentos || 0),
      es_bebidas: Number(d.es_bebidas || 0),
    }));
  } catch (e) {
    console.error('Error fetching top dishes from menu:', e);
  }

  if (!topDishes || topDishes.length === 0) {
    try {
      topDishes = await executeQuery(`
        SELECT 
          m.codigo,
          m.nombre AS platillo,
          COALESCE(fp.nombre, 'General') AS familia,
          1 AS cantidad_vendida,
          0 AS total_ventas,
          COALESCE(fp.es_alimentos, 0) AS es_alimentos,
          COALESCE(fp.es_bebidas, 0) AS es_bebidas
        FROM menu m
        LEFT JOIN familias_platillos fp ON m.familia = fp.codigo
        WHERE m.es_adicional = 0
        LIMIT 30;
      `);
      topDishes = (topDishes || []).map(d => ({
        ...d,
        cantidad_vendida: Number(d.cantidad_vendida || 0),
        total_ventas: Number(d.total_ventas || 0),
        es_alimentos: Number(d.es_alimentos || 0),
        es_bebidas: Number(d.es_bebidas || 0),
      }));
    } catch (err) {
      console.error('Fallback query error:', err);
    }
  }

  try {
    familySummary = await executeQuery(`
      SELECT 
        COALESCE(fp.nombre, 'General') AS familia,
        SUM(COALESCE(d.cantidad, 1)) AS total_unidades,
        SUM(COALESCE(d.precio * d.cantidad, d.precio, 0)) AS total_importe
      FROM cuentas c
      INNER JOIN cuentas_detalle d ON c.caja = d.caja AND c.folio = d.folio AND c.serie = d.serie
      LEFT JOIN menu m ON d.codigo = m.codigo
      LEFT JOIN familias_platillos fp ON m.familia = fp.codigo
      ${dateWhere}
        AND (m.es_adicional = 0 OR m.es_adicional IS NULL)
      GROUP BY familia
      ORDER BY total_unidades DESC
      LIMIT 15;
    `);

    familySummary = (familySummary || []).map(f => ({
      familia: String(f.familia || 'Sin Categoría'),
      total_unidades: Number(f.total_unidades || 0),
      total_importe: Number(f.total_importe || 0),
    }));
  } catch (e) {
    console.error('Error fetching family summary from menu:', e);
  }

  return {
    fecha: new Date().toISOString().split('T')[0],
    top_10_platillos: topDishes,
    ventas_por_familia: familySummary,
  };
}

/**
 * CHEF: Obtiene el desglose detallado de ventas por mesero para un platillo específico
 */
export async function getChefDishDetail(codigo: string, range: string = 'hoy', startDate?: string, endDate?: string) {
  const shift = await getActiveShift();
  let dateWhere = `WHERE (fecha_turno = CURDATE() OR fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas))`;

  if (startDate && endDate) {
    dateWhere = `WHERE fecha_turno BETWEEN '${startDate}' AND '${endDate}'`;
  } else if (range === 'semana') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
  } else if (range === 'mes') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
  } else if (range === 'año') {
    dateWhere = `WHERE fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)`;
  } else if (range === 'todo') {
    dateWhere = `WHERE fecha_turno IS NOT NULL`;
  } else if (range === 'hoy' && shift.active) {
    dateWhere = `WHERE fecha_turno = '${shift.fecha}' AND turno = ${shift.turno}`;
  }

  // 1. Obtener información básica y resumen de ventas del platillo
  let dishInfo: any = null;
  try {
    const rows = await executeQuery(`
      SELECT 
        d.codigo,
        COALESCE(m.nombre, d.codigo) AS platillo,
        COALESCE(fp.nombre, 'General') AS familia,
        SUM(COALESCE(d.cantidad, 1)) AS cantidad_vendida,
        SUM(COALESCE(d.precio * d.cantidad, d.precio, 0)) AS total_ventas
      FROM cuentas c
      INNER JOIN cuentas_detalle d ON c.caja = d.caja AND c.folio = d.folio AND c.serie = d.serie
      LEFT JOIN menu m ON d.codigo = m.codigo
      LEFT JOIN familias_platillos fp ON m.familia = fp.codigo
      ${dateWhere}
        AND d.codigo = ?
      GROUP BY d.codigo, platillo, familia;
    `, [codigo]);

    if (rows && rows.length > 0) {
      dishInfo = {
        codigo: String(rows[0].codigo || ''),
        platillo: String(rows[0].platillo || ''),
        familia: String(rows[0].familia || ''),
        cantidad_vendida: Number(rows[0].cantidad_vendida || 0),
        total_ventas: Number(rows[0].total_ventas || 0),
      };
    } else {
      // Si no hay ventas, buscar datos generales en el catálogo de menú
      const menuRows = await executeQuery(`
        SELECT 
          m.codigo,
          m.nombre AS platillo,
          COALESCE(fp.nombre, 'General') AS familia
        FROM menu m
        LEFT JOIN familias_platillos fp ON m.familia = fp.codigo
        WHERE m.codigo = ?;
      `, [codigo]);
      if (menuRows && menuRows.length > 0) {
        dishInfo = {
          codigo: String(menuRows[0].codigo || ''),
          platillo: String(menuRows[0].platillo || ''),
          familia: String(menuRows[0].familia || ''),
          cantidad_vendida: 0,
          total_ventas: 0,
        };
      }
    }
  } catch (e) {
    console.error('Error fetching dish detail info:', e);
  }

  // 2. Obtener desglose por meseros
  let waiterBreakdown: any[] = [];
  try {
    const rows = await executeQuery(`
      SELECT 
        c.mesero AS id_mesero,
        COALESCE(p.nombre, CONCAT('Mesero ', CAST(c.mesero AS CHAR))) AS nombre_mesero,
        SUM(COALESCE(d.cantidad, 1)) AS cantidad_vendida,
        SUM(COALESCE(d.precio * d.cantidad, d.precio, 0)) AS total_ventas
      FROM cuentas c
      INNER JOIN cuentas_detalle d ON c.caja = d.caja AND c.folio = d.folio AND c.serie = d.serie
      LEFT JOIN personal p ON CAST(c.mesero AS CHAR) = CAST(p.codigo AS CHAR)
      ${dateWhere}
        AND d.codigo = ?
      GROUP BY c.mesero, p.nombre
      ORDER BY cantidad_vendida DESC;
    `, [codigo]);

    waiterBreakdown = (rows || []).map((w: any) => ({
      id_mesero: Number(w.id_mesero || 0),
      nombre_mesero: String(w.nombre_mesero || ''),
      cantidad_vendida: Number(w.cantidad_vendida || 0),
      total_ventas: Number(w.total_ventas || 0),
    }));
  } catch (e) {
    console.error('Error fetching waiter breakdown for dish:', e);
  }

  return {
    dish: dishInfo || { codigo, platillo: 'Platillo', familia: 'General', cantidad_vendida: 0, total_ventas: 0 },
    ventas_por_mesero: waiterBreakdown,
  };
}

/**
 * CAPITANA DE PISO: Productividad Humana y Rendimiento Detallado por Mesero
 * @param range 'hoy' | 'semana' | 'mes' | 'todo'
 */
export async function getFloorCaptainStatus(range: string = 'hoy') {
  let waiterRanking: any[] = [];
  let activeTables: any[] = [];

  const shift = await getActiveShift();
  // Construir la condición de fecha SQL según el rango seleccionado
  let dateWhere = `WHERE (c.fecha_turno = CURDATE() OR c.fecha_turno = (SELECT MAX(fecha_turno) FROM cuentas))`;

  if (range === 'semana') {
    dateWhere = `WHERE c.fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
  } else if (range === 'mes') {
    dateWhere = `WHERE c.fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
  } else if (range === 'todo') {
    dateWhere = `WHERE c.fecha_turno IS NOT NULL`;
  } else if (range === 'hoy' && shift.active) {
    dateWhere = `WHERE c.fecha_turno = '${shift.fecha}' AND c.turno = ${shift.turno}`;
  }

  try {
    // 1. Consulta uniendo cuentas con personal y rangos para obtener Nombre Real y Puesto Real
    waiterRanking = await executeQuery(`
      SELECT 
        CAST(c.mesero AS CHAR) AS id_mesero,
        COALESCE(p.nombre, CONCAT('Mesero ', CAST(c.mesero AS CHAR))) AS nombre_mesero,
        COALESCE(r.nombre, 'Mesero') AS cargo_puesto,
        COUNT(c.mesa) AS mesas_atendidas,
        COALESCE(SUM(c.personas), 0) AS comensales_atendidos,
        COALESCE(SUM(c.total), 0) AS venta_total,
        COALESCE(SUM(c.propina + c.pago1_propina + c.pago2_propina + c.pago3_propina), 0) AS propinas_registradas
      FROM cuentas c
      LEFT JOIN personal p ON CAST(c.mesero AS CHAR) = CAST(p.codigo AS CHAR)
      LEFT JOIN rangos r ON p.rango = r.codigo
      ${dateWhere}
        AND c.mesero IS NOT NULL AND c.mesero != '' AND c.mesero != '0'
      GROUP BY c.mesero, p.nombre, r.nombre
      ORDER BY venta_total DESC
      LIMIT 30;
    `);
  } catch (err: any) {
    console.warn('JOIN with personal/rangos failed, falling back to direct cuentas query:', err?.message || err);
    try {
      waiterRanking = await executeQuery(`
        SELECT 
          CAST(c.mesero AS CHAR) AS id_mesero,
          CONCAT('Mesero ', CAST(c.mesero AS CHAR)) AS nombre_mesero,
          'Mesero' AS cargo_puesto,
          COUNT(c.mesa) AS mesas_atendidas,
          COALESCE(SUM(c.personas), 0) AS comensales_atendidos,
          COALESCE(SUM(c.total), 0) AS venta_total,
          COALESCE(SUM(c.propina + c.pago1_propina + c.pago2_propina + c.pago3_propina), 0) AS propinas_registradas
        FROM cuentas c
        ${dateWhere}
          AND c.mesero IS NOT NULL AND c.mesero != '' AND c.mesero != '0'
        GROUP BY c.mesero
        ORDER BY venta_total DESC
        LIMIT 30;
      `);
    } catch (e) {
      console.error('Error fetching waiter ranking fallback:', e);
    }
  }

  // Mapear métricas detalladas y aplicar la regla de propina (SOLO PUESTO MESERO PAGA TIRA DEL 6%)
  waiterRanking = (waiterRanking || []).map(w => {
    const ventaTotal = Number(w.venta_total || 0);
    const mesasAtendidas = Number(w.mesas_atendidas || 0);
    const paxTotal = Number(w.comensales_atendidos || 0);
    const ticketPromedioMesa = mesasAtendidas > 0 ? ventaTotal / mesasAtendidas : 0;
    const ticketPromedioPax = paxTotal > 0 ? ventaTotal / paxTotal : 0;
    
    // REGLA SOLICITADA: Únicamente el rango/puesto Mesero o mesero paga tira del 6%
    const cargoLower = String(w.cargo_puesto || '').toLowerCase().trim();
    const esMeseroTira = cargoLower === 'mesero' || cargoLower.includes('meser');
    const tiraPropina6 = esMeseroTira ? ventaTotal * 0.06 : 0;
    
    const meseroIdClean = String(w.id_mesero || '').trim();

    return {
      id_mesero: meseroIdClean,
      nombre_mesero: String(w.nombre_mesero || `Mesero ${meseroIdClean}`).trim(),
      cargo_puesto: String(w.cargo_puesto || 'Mesero').trim(),
      mesas_atendidas: mesasAtendidas,
      pax_total: paxTotal,
      venta_total: ventaTotal,
      ticket_promedio_mesa: ticketPromedioMesa,
      ticket_promedio_pax: ticketPromedioPax,
      es_mesero_tira: esMeseroTira,
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
        CAST(c.mesero AS CHAR) AS mesero,
        COALESCE(p.nombre, CONCAT('Mesero ', CAST(c.mesero AS CHAR))) AS nombre_mesero,
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
      LEFT JOIN personal p ON CAST(c.mesero AS CHAR) = CAST(p.codigo AS CHAR)
      ${dateWhere}
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
      mesero: String(t.nombre_mesero || t.mesero || '--'),
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
    rango_seleccionado: range,
    fecha: new Date().toISOString().split('T')[0],
    ranking_meseros: waiterRanking,
    mesas_activas: activeTables,
    total_mesas_activas: activeTables.length,
  };
}
