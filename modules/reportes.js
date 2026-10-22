// ==================== modules/reportes.js ====================
// REPORTES CONTABLES - Libro IVA, Impuesto Cheque, Costos para Ganancias
// ERP Contable Argentina - v7.16.7
// v7.16.7: reportes completos con Libro IVA Ventas/Compras, Imp. Cheque, Ganancias

import { getDB, calcularIVAMes, calcularImpuestoChequeMes } from './db.js';
import { formatNumber, formatDate, mostrarNotificacion, escapeHtml } from './utils.js';
import { crearModal, cerrarModal } from './configuracion/helpers.js';

// ==================== HELPERS DE CÁLCULO ====================
function calcularCostosMes(comprasMes) {
    let costosNetos = 0, costosTotales = 0, aranceles = 0;
    comprasMes.forEach(c => {
        if (c.totales) {
            if (c.ivaComputable) costosNetos += c.totales.costoTotalGanancias || 0;
            else costosTotales += c.totales.costoTotalGanancias || 0;
            aranceles += c.totales.noGravado || 0;
        } else {
            if (c.ivaDescontable) costosNetos += c.montoNeto || 0;
            else costosTotales += c.totalFactura || 0;
        }
    });
    return { costosNetos, costosTotales, aranceles };
}

function calcularGananciaNetaMes(mes) {
    const db = getDB();
    const ventasMes = db.ventas.filter(v => v.mes === mes);
    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mes));

    const ventasNetas = ventasMes.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0);
    const { costosNetos, costosTotales, aranceles } = calcularCostosMes(comprasMes);

    const formulas = db.formulas?.componentes || {};
    const iibbAlic = formulas.iibb?.activo ? (formulas.iibb.alicuota || 0) : 0;
    const tisshAlic = formulas.tissh?.activo ? (formulas.tissh.alicuota || 0) : 0;
    const gananciasAlic = formulas.ganancias?.activo ? (formulas.ganancias.alicuota || 0) : 0;
    const reservaAlic = formulas.reservaLegal?.activo ? (formulas.reservaLegal.alicuota || 0) : 0;

    const iibb = +(ventasNetas * (iibbAlic / 100)).toFixed(2);
    const tissh = +(ventasNetas * (tisshAlic / 100)).toFixed(2);
    const impCheque = calcularImpuestoChequeMes(mes);

    const utilidadAntes = +(ventasNetas - costosNetos - costosTotales - aranceles - iibb - tissh - impCheque.total).toFixed(2);
    const ganancias = utilidadAntes > 0 ? +(utilidadAntes * (gananciasAlic / 100)).toFixed(2) : 0;
    const despues = utilidadAntes - ganancias;
    const reservaLegal = despues > 0 ? +(despues * (reservaAlic / 100)).toFixed(2) : 0;
    const gananciaNetaFinal = +(despues - reservaLegal).toFixed(2);

    return {
        ventasNetas: +ventasNetas.toFixed(2),
        costosNetos: +costosNetos.toFixed(2),
        costosTotales: +costosTotales.toFixed(2),
        aranceles: +aranceles.toFixed(2),
        iibb, tissh, impCheque: impCheque.total,
        utilidadAntesGanancias: utilidadAntes,
        ganancias, reservaLegal, gananciaNetaFinal
    };
}

// ==================== RENDER PRINCIPAL ====================
export function renderReportes() {
    const db = getDB();
    const movs = db.movimientos || [];
    const ventas = db.ventas || [];
    const compras = db.compras || [];

    // Meses disponibles
    const meses = [...new Set([
        ...ventas.map(v => v.mes),
        ...compras.map(c => c.fechaEmision ? c.fechaEmision.substring(0, 7) : null).filter(Boolean),
        ...movs.map(m => m.mes)
    ])].filter(Boolean).sort().reverse();

    if (meses.length === 0) {
        meses.push(new Date().toISOString().substring(0, 7));
    }

    const mesGuardado = localStorage.getItem('reportesMesFiltro');
    const mesActual = meses.includes(mesGuardado) ? mesGuardado : meses[0];

    const ivaMes = calcularIVAMes(mesActual);
    const impCheque = calcularImpuestoChequeMes(mesActual);
    const ganancia = calcularGananciaNetaMes(mesActual);

    // Libro IVA Ventas
    const ventasMes = ventas.filter(v => v.mes === mesActual);
    const ventasA = ventasMes.filter(v => (v.tipoComprobante || '').includes('A'));
    const ventasB = ventasMes.filter(v => (v.tipoComprobante || '').includes('B'));
    const ventasC = ventasMes.filter(v => (v.tipoComprobante || '').includes('C'));

    // Libro IVA Compras
    const comprasMes = compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));
    const comprasA = comprasMes.filter(c => c.tipoFactura === 'A');
    const comprasB = comprasMes.filter(c => c.tipoFactura === 'B');
    const comprasC = comprasMes.filter(c => c.tipoFactura === 'C' || c.tipoFactura === 'SIN');

    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📄 Reportes Contables</h1>
                <button onclick="window.exportarTodoCSV()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                    📥 Exportar TODO (CSV)
                </button>
            </div>

            <!-- Selector de mes -->
            <div class="bg-white dark:bg-gray-800 rounded-xl p-3 shadow flex items-center gap-3 flex-wrap">
                <label class="text-sm font-medium">📅 Mes:</label>
                <select id="reportesMes" class="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="window.cambiarReporteMes()">
                    ${meses.map(m => `<option value="${m}" ${m === mesActual ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <span class="text-xs text-gray-500">Los reportes se generan para el mes seleccionado</span>
            </div>

            <!-- ==================== RESUMEN IVA ==================== -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 font-bold text-white">
                    🧾 Resumen IVA del mes (${mesActual})
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <p class="text-xs text-gray-500">IVA Ventas (Débito fiscal)</p>
                        <p class="text-xl font-bold text-blue-600">$${formatNumber(ivaMes.ivaVentas)}</p>
                    </div>
                    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <p class="text-xs text-gray-500">IVA Compras (Crédito fiscal)</p>
                        <p class="text-xl font-bold text-blue-600">-$${formatNumber(ivaMes.ivaCompras)}</p>
                    </div>
                    <div class="bg-gradient-to-r ${ivaMes.ivaAPagar >= 0 ? 'from-red-500 to-red-600' : 'from-green-500 to-green-600'} rounded-lg p-3 text-white">
                        <p class="text-xs opacity-90">${ivaMes.ivaAPagar >= 0 ? 'IVA a pagar' : 'Saldo a favor'}</p>
                        <p class="text-2xl font-bold">$${formatNumber(Math.abs(ivaMes.ivaAPagar))}</p>
                    </div>
                </div>
            </div>

            <!-- ==================== LIBRO IVA VENTAS ==================== -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-teal-600 px-4 py-2 font-bold text-white flex justify-between items-center">
                    <span>💰 Libro IVA Ventas</span>
                    <button onclick="window.exportarLibroIVAVentas('${mesActual}')" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs">
                        📥 CSV
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nº Factura</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Neto</th>
                                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">IVA</th>
                                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            ${ventasMes.length === 0 ? '<tr><td colspan="7" class="p-4 text-center text-gray-400">Sin ventas este mes</td></tr>' :
                              ventasMes.sort((a,b) => (a.fechaVenta || '').localeCompare(b.fechaVenta || '')).map(v => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td class="px-3 py-2 text-sm">${formatDate(v.fechaVenta)}</td>
                                    <td class="px-3 py-2 text-sm">${escapeHtml(v.tipoComprobante || '-')}</td>
                                    <td class="px-3 py-2 text-sm">${escapeHtml(v.numComprobante || '-')}</td>
                                    <td class="px-3 py-2 text-sm">${escapeHtml(v.clienteNombre || '-')}</td>
                                    <td class="px-3 py-2 text-sm text-right">$${formatNumber(v.montoNeto || 0)}</td>
                                    <td class="px-3 py-2 text-sm text-right text-orange-600">$${formatNumber(v.ivaMonto || 0)}</td>
                                    <td class="px-3 py-2 text-sm text-right font-bold">$${formatNumber(v.total || 0)}</td>
                                </tr>
                              `).join('')
                            }
                        </tbody>
                        <tfoot class="bg-gray-50 dark:bg-gray-700 font-bold">
                            <tr>
                                <td colspan="4" class="px-3 py-2 text-right">Total Facturas A: ${ventasA.length}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(ventasA.reduce((s,v) => s + (v.montoNeto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right text-orange-600">$${formatNumber(ventasA.reduce((s,v) => s + (v.ivaMonto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(ventasA.reduce((s,v) => s + (v.total || 0), 0))}</td>
                            </tr>
                            <tr>
                                <td colspan="4" class="px-3 py-2 text-right">Total Facturas B: ${ventasB.length}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(ventasB.reduce((s,v) => s + (v.montoNeto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right text-orange-600">$${formatNumber(ventasB.reduce((s,v) => s + (v.ivaMonto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(ventasB.reduce((s,v) => s + (v.total || 0), 0))}</td>
                            </tr>
                            <tr class="border-t-2 dark:border-gray-600">
                                <td colspan="4" class="px-3 py-2 text-right">TOTAL VENTAS</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(ivaMes.ivaVentas > 0 ? ventasMes.reduce((s,v) => s + (v.montoNeto || 0), 0) : 0)}</td>
                                <td class="px-3 py-2 text-right text-orange-600">$${formatNumber(ivaMes.ivaVentas)}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(ventasMes.reduce((s,v) => s + (v.total || 0), 0))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- ==================== LIBRO IVA COMPRAS ==================== -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 font-bold text-white flex justify-between items-center">
                    <span>🛒 Libro IVA Compras</span>
                    <button onclick="window.exportarLibroIVACompras('${mesActual}')" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs">
                        📥 CSV
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nº Factura</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Neto</th>
                                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">IVA</th>
                                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            ${comprasMes.length === 0 ? '<tr><td colspan="7" class="p-4 text-center text-gray-400">Sin compras este mes</td></tr>' :
                              comprasMes.sort((a,b) => (a.fechaEmision || '').localeCompare(b.fechaEmision || '')).map(c => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td class="px-3 py-2 text-sm">${formatDate(c.fechaEmision)}</td>
                                    <td class="px-3 py-2 text-sm">${escapeHtml(c.tipoFactura || '-')}</td>
                                    <td class="px-3 py-2 text-sm">${escapeHtml(c.numeroFactura || '-')}</td>
                                    <td class="px-3 py-2 text-sm">${escapeHtml(c.proveedorNombre || '-')}</td>
                                    <td class="px-3 py-2 text-sm text-right">$${formatNumber(c.montoNeto || 0)}</td>
                                    <td class="px-3 py-2 text-sm text-right text-orange-600">$${formatNumber(c.ivaMonto || 0)}</td>
                                    <td class="px-3 py-2 text-sm text-right font-bold">$${formatNumber(c.totalFactura || 0)}</td>
                                </tr>
                              `).join('')
                            }
                        </tbody>
                        <tfoot class="bg-gray-50 dark:bg-gray-700 font-bold">
                            <tr>
                                <td colspan="4" class="px-3 py-2 text-right">Total Facturas A: ${comprasA.length}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(comprasA.reduce((s,c) => s + (c.montoNeto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right text-orange-600">$${formatNumber(comprasA.reduce((s,c) => s + (c.ivaMonto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(comprasA.reduce((s,c) => s + (c.totalFactura || 0), 0))}</td>
                            </tr>
                            <tr>
                                <td colspan="4" class="px-3 py-2 text-right">Total Facturas B/C: ${comprasB.length + comprasC.length}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber([...comprasB, ...comprasC].reduce((s,c) => s + (c.montoNeto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right text-orange-600">$${formatNumber([...comprasB, ...comprasC].reduce((s,c) => s + (c.ivaMonto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber([...comprasB, ...comprasC].reduce((s,c) => s + (c.totalFactura || 0), 0))}</td>
                            </tr>
                            <tr class="border-t-2 dark:border-gray-600">
                                <td colspan="4" class="px-3 py-2 text-right">TOTAL COMPRAS</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(comprasMes.reduce((s,c) => s + (c.montoNeto || 0), 0))}</td>
                                <td class="px-3 py-2 text-right text-orange-600">$${formatNumber(ivaMes.ivaCompras)}</td>
                                <td class="px-3 py-2 text-right">$${formatNumber(comprasMes.reduce((s,c) => s + (c.totalFactura || 0), 0))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-t dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
                    ⚠️ Solo Facturas A generan crédito fiscal computable. Las B/C/SIN son costo para Ganancias.
                </div>
            </div>

            <!-- ==================== IMPUESTO AL CHEQUE ==================== -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-4 py-2 font-bold text-white flex justify-between items-center">
                    <span>🏦 Impuesto al Cheque del mes</span>
                    <button onclick="window.exportarImpuestoCheque('${mesActual}')" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs">
                        📥 CSV
                    </button>
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                        <p class="text-xs text-gray-500">Débitos (egresos)</p>
                        <p class="text-xl font-bold text-red-600">$${formatNumber(impCheque.debitos)}</p>
                    </div>
                    <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                        <p class="text-xs text-gray-500">Créditos (ingresos)</p>
                        <p class="text-xl font-bold text-green-600">$${formatNumber(impCheque.creditos)}</p>
                    </div>
                    <div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-3 text-white">
                        <p class="text-xs opacity-90">Total pago a cuenta Ganancias</p>
                        <p class="text-2xl font-bold">$${formatNumber(impCheque.total)}</p>
                    </div>
                </div>
                <div class="px-4 pb-3 text-xs text-gray-500">
                    💡 Se descuenta del Impuesto a las Ganancias al cierre del ejercicio.
                </div>
            </div>

            <!-- ==================== COSTOS PARA GANANCIAS ==================== -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-gray-600 to-gray-800 px-4 py-2 font-bold text-white flex justify-between items-center">
                    <span>📈 Costos para Ganancias (${mesActual})</span>
                    <button onclick="window.exportarGananciasCSV('${mesActual}')" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs">
                        📥 CSV
                    </button>
                </div>
                <div class="p-4 space-y-2 text-sm">
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>Ventas netas:</span>
                        <strong class="text-green-600">$${formatNumber(ganancia.ventasNetas)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− Costos (Facturas A, neto):</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.costosNetos)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− Costos (Facturas B/C/SIN):</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.costosTotales)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− Aranceles / no gravados:</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.aranceles)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− IIBB:</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.iibb)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− TISSH:</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.tissh)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− Impuesto al cheque:</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.impCheque)}</strong>
                    </div>
                    <div class="flex justify-between py-2 font-bold border-b-2 dark:border-gray-600">
                        <span>= Utilidad antes de Ganancias:</span>
                        <strong>$${formatNumber(ganancia.utilidadAntesGanancias)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− Impuesto a las Ganancias:</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.ganancias)}</strong>
                    </div>
                    <div class="flex justify-between py-1 border-b dark:border-gray-700">
                        <span>− Reserva Legal SAS:</span>
                        <strong class="text-red-600">-$${formatNumber(ganancia.reservaLegal)}</strong>
                    </div>
                    <div class="flex justify-between py-3 bg-green-50 dark:bg-green-900/20 -mx-4 px-4 rounded-lg mt-2">
                        <span class="font-bold text-lg">💰 GANANCIA NETA FINAL:</span>
                        <strong class="text-2xl text-green-600">$${formatNumber(ganancia.gananciaNetaFinal)}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==================== INICIALIZACIÓN ====================
export function initReportesEvents() {
    const select = document.getElementById('reportesMes');
    if (select) {
        select.onchange = () => {
            localStorage.setItem('reportesMesFiltro', select.value);
            window.dispatchEvent(new Event('refreshView'));
        };
    }
}

export function cambiarReporteMes() {
    const select = document.getElementById('reportesMes');
    if (select) {
        localStorage.setItem('reportesMesFiltro', select.value);
        window.dispatchEvent(new Event('refreshView'));
    }
}

export function exportarReportePDF() {
    mostrarNotificacion('Para PDF usá Imprimir (Ctrl+P)', 'info');
    setTimeout(() => window.print(), 500);
}

// ==================== EXPORTAR A CSV ====================
function descargarCSV(nombre, contenido) {
    const blob = new Blob(['\ufeff' + contenido], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
}

window.exportarLibroIVAVentas = (mes) => {
    const db = getDB();
    const ventas = (db.ventas || []).filter(v => v.mes === mes);
    if (ventas.length === 0) { mostrarNotificacion('No hay ventas este mes', 'warning'); return; }

    let csv = 'Fecha,Tipo,Nº Factura,Cliente,CUIT,Neto,IVA,Total\\n';
    ventas.forEach(v => {
        const cliente = db.clientes.find(c => c.id === v.clienteId);
        csv += `"${v.fechaVenta || ''}","${v.tipoComprobante || ''}","${v.numComprobante || ''}","${(v.clienteNombre || '').replace(/"/g, '""')}","${cliente?.cuit || ''}",${v.montoNeto || 0},${v.ivaMonto || 0},${v.total || 0}\\n`;
    });
    descargarCSV(`libro_iva_ventas_${mes}.csv`, csv);
    mostrarNotificacion(`📥 Libro IVA Ventas exportado (${ventas.length} ventas)`, 'success');
};

window.exportarLibroIVACompras = (mes) => {
    const db = getDB();
    const compras = (db.compras || []).filter(c => c.fechaEmision && c.fechaEmision.startsWith(mes));
    if (compras.length === 0) { mostrarNotificacion('No hay compras este mes', 'warning'); return; }

    let csv = 'Fecha,Tipo,Nº Factura,Proveedor,CUIT,Neto,IVA,Total,Computa IVA\\n';
    compras.forEach(c => {
        csv += `"${c.fechaEmision || ''}","${c.tipoFactura || ''}","${c.numeroFactura || ''}","${(c.proveedorNombre || '').replace(/"/g, '""')}","${c.proveedorCuit || ''}",${c.montoNeto || 0},${c.ivaMonto || 0},${c.totalFactura || 0},"${c.ivaDescontable ? 'SI' : 'NO'}"\\n`;
    });
    descargarCSV(`libro_iva_compras_${mes}.csv`, csv);
    mostrarNotificacion(`📥 Libro IVA Compras exportado (${compras.length} compras)`, 'success');
};

window.exportarImpuestoCheque = (mes) => {
    const db = getDB();
    const movs = (db.movimientos || []).filter(m => m.mes === mes);
    if (movs.length === 0) { mostrarNotificacion('No hay movimientos este mes', 'warning'); return; }

    let csv = 'Fecha,Tipo,Origen,Descripción,Medio,Monto,Impuesto Cheque,Neto\\n';
    movs.forEach(m => {
        csv += `"${m.fecha || ''}","${m.tipo || ''}","${m.origen || ''}","${(m.origenDescripcion || '').replace(/"/g, '""')}","${m.medio || ''}",${m.monto || 0},${m.impuestoDebitoCredito?.monto || 0},${m.montoNeto || 0}\\n`;
    });
    descargarCSV(`impuesto_cheque_${mes}.csv`, csv);
    mostrarNotificacion(`📥 Impuesto al cheque exportado (${movs.length} movimientos)`, 'success');
};

window.exportarGananciasCSV = (mes) => {
    const g = calcularGananciaNetaMes(mes);
    let csv = 'Concepto,Monto\\n';
    csv += `"Ventas netas",${g.ventasNetas}\\n`;
    csv += `"Costos Facturas A",${-g.costosNetos}\\n`;
    csv += `"Costos Facturas B/C/SIN",${-g.costosTotales}\\n`;
    csv += `"Aranceles / no gravados",${-g.aranceles}\\n`;
    csv += `"IIBB",${-g.iibb}\\n`;
    csv += `"TISSH",${-g.tissh}\\n`;
    csv += `"Impuesto al cheque",${-g.impCheque}\\n`;
    csv += `"Utilidad antes de Ganancias",${g.utilidadAntesGanancias}\\n`;
    csv += `"Ganancias",${-g.ganancias}\\n`;
    csv += `"Reserva Legal",${-g.reservaLegal}\\n`;
    csv += `"GANANCIA NETA FINAL",${g.gananciaNetaFinal}\\n`;
    descargarCSV(`ganancias_${mes}.csv`, csv);
    mostrarNotificacion('📥 Reporte de Ganancias exportado', 'success');
};

window.exportarTodoCSV = () => {
    const mes = localStorage.getItem('reportesMesFiltro') || new Date().toISOString().substring(0, 7);
    mostrarNotificacion('📥 Exportando todos los reportes...', 'info');
    setTimeout(() => {
        window.exportarLibroIVAVentas(mes);
        setTimeout(() => window.exportarLibroIVACompras(mes), 300);
        setTimeout(() => window.exportarImpuestoCheque(mes), 600);
        setTimeout(() => window.exportarGananciasCSV(mes), 900);
    }, 100);
};
