// ========== SISTEMA DE CÁLCULO DE IVA PROFESIONAL ==========
import { getDB } from './db.js';

const ALICUOTAS_IVA = {
    '21': { nombre: 'IVA 21%', factor: 0.21, descripcion: 'General' },
    '10.5': { nombre: 'IVA 10.5%', factor: 0.105, descripcion: 'Reducido' },
    '27': { nombre: 'IVA 27%', factor: 0.27, descripcion: 'Aumentado' },
    '5': { nombre: 'IVA 5%', factor: 0.05, descripcion: 'Mínimo' },
    '2.5': { nombre: 'IVA 2.5%', factor: 0.025, descripcion: 'Mínimo especial' },
    '0': { nombre: 'Exento', factor: 0, descripcion: 'Sin IVA' }
};

const TIPOS_COMPROBANTE = {
    'Factura A': { nombre: 'Factura A', tieneIVA: true, creditoFiscal: true, debitoFiscal: true },
    'Factura B': { nombre: 'Factura B', tieneIVA: true, creditoFiscal: false, debitoFiscal: true },
    'Factura C': { nombre: 'Factura C', tieneIVA: false, creditoFiscal: false, debitoFiscal: false },
    'Factura M': { nombre: 'Factura M', tieneIVA: true, creditoFiscal: true, debitoFiscal: true },
    'Ticket': { nombre: 'Ticket', tieneIVA: true, creditoFiscal: false, debitoFiscal: false }
};

export function calcularIVA(montoNeto, alicuota = 21) {
    const factor = ALICUOTAS_IVA[alicuota]?.factor || 0.21;
    const iva = montoNeto * factor;
    const total = montoNeto + iva;
    return { neto: montoNeto, iva, total, alicuota, factor };
}

export function calcularIVAventa(venta) {
    if (!venta) return null;
    const tipo = TIPOS_COMPROBANTE[venta.tipoComprobante] || TIPOS_COMPROBANTE['Factura A'];
    const alicuota = venta.iva || 21;
    let neto = venta.montoNeto;
    let iva = venta.ivaMonto || 0;
    let total = venta.total || 0;
    if (!iva && neto) {
        const calculo = calcularIVA(neto, alicuota);
        iva = calculo.iva;
        total = calculo.total;
    }
    return {
        id: venta.id,
        fecha: venta.fechaVenta,
        cliente: venta.clienteNombre,
        tipoComprobante: venta.tipoComprobante,
        neto: neto,
        iva: iva,
        total: total,
        alicuota: alicuota,
        tieneIVA: tipo.tieneIVA,
        creditoFiscal: false,
        debitoFiscal: tipo.tieneIVA && tipo.debitoFiscal
    };
}

export function calcularIVAcompra(compra) {
    if (!compra) return null;
    const tipo = TIPOS_COMPROBANTE[compra.tipoComprobante] || TIPOS_COMPROBANTE['Factura A'];
    const alicuota = compra.iva || 21;
    let neto = compra.montoNeto;
    let iva = compra.ivaMonto || 0;
    let total = compra.total || 0;
    if (!iva && neto) {
        const calculo = calcularIVA(neto, alicuota);
        iva = calculo.iva;
        total = calculo.total;
    }
    return {
        id: compra.id,
        fecha: compra.fechaCompra,
        proveedor: compra.proveedorNombre,
        tipoComprobante: compra.tipoComprobante,
        neto: neto,
        iva: iva,
        total: total,
        alicuota: alicuota,
        tieneIVA: tipo.tieneIVA,
        creditoFiscal: tipo.tieneIVA && tipo.creditoFiscal,
        debitoFiscal: false
    };
}

export function calcularResumenIVA(fechaInicio, fechaFin) {
    const db = getDB();
    const ventasPeriodo = db.ventas.filter(v => v.fechaVenta >= fechaInicio && v.fechaVenta <= fechaFin);
    const comprasPeriodo = db.compras.filter(c => c.fechaCompra >= fechaInicio && c.fechaCompra <= fechaFin);
    
    let debitoIVA = 0;
    let ventasIVA = [];
    ventasPeriodo.forEach(v => {
        const tipo = TIPOS_COMPROBANTE[v.tipoComprobante];
        if (tipo && tipo.debitoFiscal) {
            const iva = v.ivaMonto || (v.montoNeto * (v.iva / 100));
            debitoIVA += iva;
            ventasIVA.push({
                cliente: v.clienteNombre,
                comprobante: `${v.tipoComprobante} ${v.numComprobante}`,
                neto: v.montoNeto,
                iva: iva,
                alicuota: v.iva || 21
            });
        }
    });
    
    let creditoIVA = 0;
    let comprasIVA = [];
    comprasPeriodo.forEach(c => {
        const tipo = TIPOS_COMPROBANTE[c.tipoComprobante];
        if (tipo && tipo.creditoFiscal) {
            const iva = c.ivaMonto || (c.montoNeto * (c.iva / 100));
            creditoIVA += iva;
            comprasIVA.push({
                proveedor: c.proveedorNombre,
                comprobante: `${c.tipoComprobante} ${c.numComprobante}`,
                neto: c.montoNeto,
                iva: iva,
                alicuota: c.iva || 21
            });
        }
    });
    
    const saldoTecnico = debitoIVA - creditoIVA;
    const ivaAPagar = saldoTecnico > 0 ? saldoTecnico : 0;
    const saldoAFavor = saldoTecnico < 0 ? Math.abs(saldoTecnico) : 0;
    
    return {
        periodo: { inicio: fechaInicio, fin: fechaFin },
        debitoIVA,
        creditoIVA,
        saldoTecnico,
        ivaAPagar,
        saldoAFavor,
        ventasIVA,
        comprasIVA,
        cantidadVentas: ventasPeriodo.length,
        cantidadCompras: comprasPeriodo.length
    };
}

export function calcularIVAMensual(mes) {
    const fechaInicio = `${mes}-01`;
    const ultimoDia = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1], 0, 0).getDate());
    const fechaFin = `${mes}-${ultimoDia}`;
    return calcularResumenIVA(fechaInicio, fechaFin);
}

export function calcularIVAPresupuesto(presupuesto) {
    if (!presupuesto) return null;
    const alicuota = 21;
    const neto = presupuesto.total;
    const iva = neto * (alicuota / 100);
    const totalConIVA = neto + iva;
    return {
        presupuestoId: presupuesto.id,
        numero: presupuesto.numero,
        cliente: presupuesto.cliente,
        neto: neto,
        iva: iva,
        total: totalConIVA,
        markup: presupuesto.markup,
        alicuota: alicuota
    };
}
