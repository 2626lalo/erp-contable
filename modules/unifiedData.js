import { getDB, guardarDB } from './db.js';

export const CONSTANTES_FISCALES = {
    IVA: 0.21,
    IIBB_SALTA: 0.036,
    TISSH: 0.005,
    GANANCIAS: 0.25,
    RESERVA_LEGAL: 0.05,
    IMPUESTO_CHEQUE: 0.012
};

export function calcularGananciaReal(ventaSinIVA, costoProveedor, incluirImpuestoCheque = false) {
    const gananciaBruta = ventaSinIVA - costoProveedor;
    const iibb = ventaSinIVA * CONSTANTES_FISCALES.IIBB_SALTA;
    const tissh = ventaSinIVA * CONSTANTES_FISCALES.TISSH;
    const impuestoCheque = incluirImpuestoCheque ? ventaSinIVA * CONSTANTES_FISCALES.IMPUESTO_CHEQUE : 0;
    
    let utilidadAntes = gananciaBruta - iibb - tissh - impuestoCheque;
    utilidadAntes = Math.max(0, utilidadAntes);
    const impuestoGanancias = utilidadAntes * CONSTANTES_FISCALES.GANANCIAS;
    const despuesGanancias = utilidadAntes - impuestoGanancias;
    const reservaLegal = despuesGanancias * CONSTANTES_FISCALES.RESERVA_LEGAL;
    const gananciaNeta = Math.max(0, despuesGanancias - reservaLegal);
    
    return { gananciaBruta, iibb, tissh, impuestoCheque, utilidadAntes, impuestoGanancias, reservaLegal, gananciaNeta };
}

export function getTransaccionesConsolidadas() {
    const db = getDB();
    const ventas = (db.ventas || []).map(v => ({ ...v, tipo: 'venta', fecha: v.fecha }));
    const compras = (db.compras || []).map(c => ({ ...c, tipo: 'compra', fecha: c.fecha }));
    const presupuestos = (db.presupuestos || []).filter(p => p.estado === 'APROBADO').map(p => ({ ...p, tipo: 'presupuesto', fecha: p.fechaCreacion }));
    return [...ventas, ...compras, ...presupuestos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

export function getResumenPeriodo(periodo = 'mes') {
    const db = getDB();
    const incluirImpuestoCheque = db.config?.incluirImpuestoCheque || false;
    const resumen = {};
    
    (db.ventas || []).forEach(venta => {
        const fecha = new Date(venta.fecha);
        const key = periodo === 'mes' ? `${fecha.getFullYear()}-${fecha.getMonth()+1}` : `${fecha.getFullYear()}`;
        if (!resumen[key]) resumen[key] = { ventas: 0, compras: 0, ganancias: 0, impuestos: 0, ventasCount: 0 };
        const gn = calcularGananciaReal(venta.totalSinIVA || venta.total, venta.costoProveedor || 0, incluirImpuestoCheque);
        resumen[key].ventas += venta.totalSinIVA || venta.total;
        resumen[key].ganancias += gn.gananciaNeta;
        resumen[key].impuestos += (gn.iibb + gn.tissh + gn.impuestoCheque + gn.impuestoGanancias);
        resumen[key].ventasCount++;
    });
    
    (db.compras || []).forEach(compra => {
        const fecha = new Date(compra.fecha);
        const key = periodo === 'mes' ? `${fecha.getFullYear()}-${fecha.getMonth()+1}` : `${fecha.getFullYear()}`;
        if (!resumen[key]) resumen[key] = { ventas: 0, compras: 0, ganancias: 0, impuestos: 0, ventasCount: 0 };
        resumen[key].compras += compra.total;
    });
    
    return resumen;
}

export function actualizarAcumulados() {
    const db = getDB();
    const incluirImpuestoCheque = db.config?.incluirImpuestoCheque || false;
    
    if (!db.gastosFijos) db.gastosFijos = { total: 0, items: [], pagado: 0 };
    if (!db.gananciaAcumulada) db.gananciaAcumulada = 0;
    
    let gananciaTotal = 0;
    (db.ventas || []).forEach(venta => {
        const gn = calcularGananciaReal(venta.totalSinIVA || venta.total, venta.costoProveedor || 0, incluirImpuestoCheque);
        gananciaTotal += gn.gananciaNeta;
    });
    
    db.gananciaAcumulada = gananciaTotal;
    const pendiente = db.gastosFijos.total - (db.gastosFijos.pagado || 0);
    
    if (pendiente > 0 && db.gananciaAcumulada > 0) {
        const aplicar = Math.min(db.gananciaAcumulada, pendiente);
        db.gastosFijos.pagado = (db.gastosFijos.pagado || 0) + aplicar;
        db.gananciaAcumulada -= aplicar;
    }
    
    guardarDB();
    return { gananciaAcumulada: db.gananciaAcumulada, gastosPendientes: Math.max(0, db.gastosFijos.total - (db.gastosFijos.pagado || 0)) };
}
