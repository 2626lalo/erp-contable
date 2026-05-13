// ==================== modules/contabilidad.js ====================
// CALCULOS FISCALES - Con soporte para impuestos dinámicos
// ERP Contable Argentina - SAS Salta

import { getDB, getImpuestosActivos as getDBImpuestos } from './db.js';
import { 
    calcularGananciaNetaDinamicoSync, 
    calcularIVA, 
    calcularIVACompra, 
    obtenerNetoDesdeTotalConIVA 
} from './utils.js';

export const CONSTANTES_FISCALES = {
    IVA: 0.21,
    IIBB: 0.036,
    TISSH: 0.005,
    GANANCIAS: 0.25,
    RESERVA: 0.05,
    IMPUESTO_CHEQUE: 0.012
};

// ========== FUNCIONES LEGACY (mantener compatibilidad) ==========
export async function registrarCobro(ventaId, monto, fecha, comprobante) {
    const db = await getDB();
    const venta = db.ventas.find(v => v.id === ventaId);
    if (!venta) return false;
    venta.cobros = venta.cobros || [];
    venta.cobros.push({ monto, fecha, comprobante });
    const totalCobrado = venta.cobros.reduce((sum, c) => sum + c.monto, 0);
    venta.saldoPendiente = venta.total - totalCobrado;
    if (venta.saldoPendiente <= 0) {
        venta.estado = 'COBRADO';
        venta.saldoPendiente = 0;
    } else if (totalCobrado > 0) {
        venta.estado = 'COBRADO_PARCIAL';
    }
    await guardarDB();
    return true;
}

export async function registrarPago(compraId, monto, fecha, comprobante) {
    const db = await getDB();
    const compra = db.compras.find(c => c.id === compraId);
    if (!compra) return false;
    compra.pagos = compra.pagos || [];
    compra.pagos.push({ monto, fecha, comprobante });
    const totalPagado = compra.pagos.reduce((sum, p) => sum + p.monto, 0);
    compra.saldoPendiente = compra.total - totalPagado;
    if (compra.saldoPendiente <= 0) {
        compra.estado = 'PAGADO';
        compra.saldoPendiente = 0;
    } else if (totalPagado > 0) {
        compra.estado = 'PAGADO_PARCIAL';
    }
    await guardarDB();
    return true;
}

export async function calcularGananciaVenta(ventaId) {
    const db = await getDB();
    const venta = db.ventas.find(v => v.id === ventaId);
    if (!venta) return null;
    const neto = venta.totalSinIVA || obtenerNetoDesdeTotalConIVA(venta.total);
    const costo = venta.costoTotal || 0;
    const impuestos = getDBImpuestos();
    return await calcularGananciaNetaDinamicoSync(neto, costo, impuestos);
}

export function calcularGananciaVentaLegacy(venta, costo) {
    const gananciaBruta = venta - costo;
    const iibb = venta * CONSTANTES_FISCALES.IIBB;
    const tissh = venta * CONSTANTES_FISCALES.TISSH;
    const utilidadAntesGanancias = gananciaBruta - iibb - tissh;
    const ganancias = utilidadAntesGanancias * CONSTANTES_FISCALES.GANANCIAS;
    const despuesGanancias = utilidadAntesGanancias - ganancias;
    const reservaLegal = despuesGanancias * CONSTANTES_FISCALES.RESERVA;
    const gananciaNeta = despuesGanancias - reservaLegal;
    return { gananciaBruta, iibb, tissh, ganancias, reservaLegal, gananciaNeta };
}

export async function calcularIvaPeriodo(mes, anio) {
    const db = await getDB();
    const ventasPeriodo = db.ventas.filter(v => {
        const fecha = new Date(v.fecha);
        return fecha.getMonth() + 1 === mes && fecha.getFullYear() === anio;
    });
    const comprasPeriodo = db.compras.filter(c => {
        const fecha = new Date(c.fecha);
        return fecha.getMonth() + 1 === mes && fecha.getFullYear() === anio;
    });
    let debitoIVA = 0, creditoIVA = 0;
    for (const venta of ventasPeriodo) {
        const neto = venta.totalSinIVA || obtenerNetoDesdeTotalConIVA(venta.total);
        debitoIVA += calcularIVA(neto);
    }
    for (const compra of comprasPeriodo) {
        const neto = obtenerNetoDesdeTotalConIVA(compra.total);
        creditoIVA += calcularIVACompra(neto);
    }
    return { debitoIVA, creditoIVA, ivaAPagar: debitoIVA - creditoIVA };
}

async function guardarDB() {
    const { guardarDB } = await import('./db.js');
    return guardarDB();
}

// ========== NUEVAS FUNCIONES PARA IMPUESTOS DINÁMICOS ==========
let impuestosDinamicos = null;

async function getImpuestosDinamicos() {
    if (!impuestosDinamicos) {
        try {
            impuestosDinamicos = await import('./impuestosDinamicos.js');
        } catch(e) {
            console.log("Módulo de impuestos dinámicos no disponible");
            return null;
        }
    }
    return impuestosDinamicos;
}

export async function calcularGananciaNetaDinamicoWrapper(venta, costoProveedor) {
    const mod = await getImpuestosDinamicos();
    if (mod) {
        return mod.calcularGananciaNetaDinamicoSync(venta, costoProveedor);
    }
    const legacy = calcularGananciaVentaLegacy(venta, costoProveedor);
    return {
        gananciaBruta: legacy.gananciaBruta,
        venta: venta,
        costoProveedor: costoProveedor,
        pasos: [
            { nombre: "IIBB Salta", alicuota: 3.6, monto: legacy.iibb },
            { nombre: "TISSH Municipal", alicuota: 0.5, monto: legacy.tissh },
            { nombre: "Impuesto Ganancias", alicuota: 25, monto: legacy.ganancias },
            { nombre: "Reserva Legal", alicuota: 5, monto: legacy.reservaLegal }
        ],
        totalImpuestos: legacy.iibb + legacy.tissh + legacy.ganancias + legacy.reservaLegal,
        gananciaNeta: legacy.gananciaNeta,
        reservaLegalAplicada: legacy.reservaLegal,
        impuestoGananciasAplicado: legacy.ganancias,
        iibbAplicado: legacy.iibb,
        tisshAplicado: legacy.tissh,
        rentabilidadSobreVenta: venta > 0 ? (legacy.gananciaNeta / venta) * 100 : 0
    };
}

export async function getImpuestosActivosWrapper() {
    const mod = await getImpuestosDinamicos();
    if (mod) {
        return mod.getImpuestosActivos();
    }
    return [
        { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, activo: true, baseCalculo: "venta" },
        { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, activo: true, baseCalculo: "venta" },
        { id: "ganancias", nombre: "Impuesto Ganancias", alicuota: 25, activo: true, baseCalculo: "utilidadAntesGanancias" },
        { id: "reservaLegal", nombre: "Reserva Legal", alicuota: 5, activo: true, baseCalculo: "despuesGanancias" }
    ];
}
