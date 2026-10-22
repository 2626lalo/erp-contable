// ==================== modules/tesoreria.js ====================
// TESORERIA - Historial mensual, movimientos, ingreso manual
// ERP Contable Argentina - v7.16.3
// v7.16.3: movimientos visibles + modal ingreso manual + caja real
// v7.16.2: cierre mensual automático + proyección

import {
    getDB, guardarDB, guardarSnapshotTesoreria, obtenerHistorialTesoreria,
    obtenerSnapshotPorMes, crearMovimiento, calcularCajaReal, calcularImpuestoChequeMes,
    calcularImpuestoChequeAnual, calcularIVAMes
} from './db.js';
import {
    formatNumber, formatDate, mostrarNotificacion, validarDatosEsenciales,
    escapeHtml, inputFechaHTML, initInputFecha, getValorFecha
} from './utils.js';
import { crearModal, cerrarModal, METODOS_PAGO } from './configuracion/helpers.js';

// ==================== FUNCIÓN DE CIERRE AUTOMÁTICO ====================
export function cerrarMesAutomatico() {
    const db = getDB();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const historial = obtenerHistorialTesoreria();

    if (historial.some(h => h.mes === mesActual)) return false;

    const fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesAnteriorStr = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;

    const snapshotAnterior = obtenerSnapshotPorMes(mesAnteriorStr);
    let capitalInicialMes = snapshotAnterior ? snapshotAnterior.capitalAcumulado : (db.configuracion?.capitalInicial || 0);

    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const totalCobrado = ventasMes.filter(v => v.estado === 'cobrado').reduce((s, v) => s + (v.total || 0), 0);
    const totalPorCobrar = ventasMes.filter(v => v.estado === 'pendiente_cobro' || v.estado === 'aceptado').reduce((s, v) => s + (v.total || 0), 0);

    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));
    const totalPagadoCompras = comprasMes.filter(c => c.estadoPago === 'PAGADO').reduce((s, c) => s + (c.totalFactura || 0), 0);
    const totalPorPagarCompras = comprasMes.filter(c => c.estadoPago === 'PENDIENTE').reduce((s, c) => s + (c.totalFactura || 0), 0);

    const costosMes = db.costosFijos.filter(c => c.vencimiento && c.vencimiento.startsWith(mesActual));
    const totalPagadoCostos = costosMes.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const totalPorPagarCostos = costosMes.filter(c => c.estado === 'pendiente').reduce((s, c) => s + c.monto, 0);

    const totalPagado = totalPagadoCompras + totalPagadoCostos;
    const totalPorPagar = totalPorPagarCompras + totalPorPagarCostos;
    
    // 🔥 v7.16.91: saldoCaja debe usar calcularCajaReal() (netos, con impuesto al cheque descontado)
    // El cálculo viejo (capitalInicialMes + totalCobrado - totalPagado) usaba brutos y 
    // sobreestimaba la caja en el monto del impuesto al cheque del mes.
    const saldoCaja = calcularCajaReal();

    // ==================== 🔥 v7.16.5: DESGLOSE FISCAL ====================

    // IVA del mes (ventas - compras computable)
    const ivaVentas = ventasMes.reduce((s, v) => s + (v.ivaMonto || 0), 0);
    const ivaComprasComputable = comprasMes
        .filter(c => c.ivaDescontable)
        .reduce((s, c) => s + (c.ivaMonto || 0), 0);
    const ivaAPagar = ivaVentas - ivaComprasComputable;
    const saldoTecnicoIVA = ivaComprasComputable > ivaVentas ? ivaComprasComputable - ivaVentas : 0;

    // Impuesto al cheque del mes (de movimientos)
    const movsMes = (db.movimientos || []).filter(m => m.mes === mesActual);
    const impChequeDebitos = movsMes
        .filter(m => m.tipo === 'egreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    const impChequeCreditos = movsMes
        .filter(m => m.tipo === 'ingreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    const impChequeTotal = impChequeDebitos + impChequeCreditos;

    // 🔥 v7.16.95: Costos para Ganancias (CORREGIDO)
    // - Facturas A: solo el neto gravado + no gravado es costo (el IVA va a crédito fiscal)
    // - Facturas B/C/SIN: el total es costo (no hay crédito fiscal)
    // - Aranceles (no gravado): ya están incluidos en costoTotalGanancias, NO sumar aparte
    const ventasNetas = ventasMes.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0);
    let costosNetos = 0;    // de facturas A
    let costosTotales = 0;  // de facturas B/C/SIN
    let aranceles = 0;      // solo para mostrar

    comprasMes.forEach(c => {
        if (c.totales) {
            if (c.ivaComputable) {
                costosNetos += (c.totales.netoGravado || 0) + (c.totales.noGravado || 0);
                aranceles += c.totales.noGravado || 0;
            } else {
                costosTotales += c.totalFactura || 0;
            }
        } else {
            if (c.ivaDescontable) {
                costosNetos += c.montoNeto || 0;
            } else {
                costosTotales += c.totalFactura || 0;
            }
        }
    });

    // Impuestos de la fórmula (IIBB, TISSH)
    const formulas = db.formulas?.componentes || {};
    // 🔥 v7.16.94: respetar exentoHasta (IIBB exento por 12 meses al ser nuevo)
    const hoyStr = new Date().toISOString().split('T')[0];
    const iibbExento = formulas.iibb?.exentoHasta && hoyStr <= formulas.iibb.exentoHasta;
    const tisshExento = formulas.tissh?.exentoHasta && hoyStr <= formulas.tissh.exentoHasta;
    const iibbAlic = (formulas.iibb?.activo && !iibbExento) ? (formulas.iibb.alicuota || 0) : 0;
    const tisshAlic = (formulas.tissh?.activo && !tisshExento) ? (formulas.tissh.alicuota || 0) : 0;

    const iibbMonto = +(ventasNetas * (iibbAlic / 100)).toFixed(2);
    const tisshMonto = +(ventasNetas * (tisshAlic / 100)).toFixed(2);

    // Utilidad antes de Ganancias
    // 🔥 v7.16.98: NO restar aranceles (ya están en costosNetos)
    const utilidadAntes =
        ventasNetas - costosNetos - costosTotales -
        iibbMonto - tisshMonto - impChequeTotal;

    // Ganancias y Reserva Legal
    const gananciasAlic = formulas.ganancias?.activo ? (formulas.ganancias.alicuota || 0) : 0;
    const reservaAlic = formulas.reservaLegal?.activo ? (formulas.reservaLegal.alicuota || 0) : 0;

    const gananciasMonto = utilidadAntes > 0 ? +(utilidadAntes * (gananciasAlic / 100)).toFixed(2) : 0;
    const despuesGanancias = utilidadAntes - gananciasMonto;
    const reservaMonto = despuesGanancias > 0 ? +(despuesGanancias * (reservaAlic / 100)).toFixed(2) : 0;
    const gananciaNetaFinal = +(despuesGanancias - reservaMonto).toFixed(2);

    // Snapshot completo con desglose fiscal
    const snapshot = {
        mes: mesActual,
        fechaCierre: new Date().toISOString().split('T')[0],

        // Caja
        capitalInicialMes,
        totalCobrado,
        totalPagado,
        saldoCaja,
        totalPorCobrar,
        totalPorPagar,
        capitalAcumulado: saldoCaja,

        // 🔥 IVA
        ivaVentas: +ivaVentas.toFixed(2),
        ivaComprasComputable: +ivaComprasComputable.toFixed(2),
        ivaAPagar: +ivaAPagar.toFixed(2),
        saldoTecnicoIVA: +saldoTecnicoIVA.toFixed(2),

        // 🔥 Impuesto al cheque
        impChequeDebitos: +impChequeDebitos.toFixed(2),
        impChequeCreditos: +impChequeCreditos.toFixed(2),
        impChequeTotal: +impChequeTotal.toFixed(2),

        // 🔥 Costos y ventas
        ventasNetas: +ventasNetas.toFixed(2),
        costosNetos: +costosNetos.toFixed(2),
        costosTotales: +costosTotales.toFixed(2),
        aranceles: +aranceles.toFixed(2),

        // 🔥 Otros impuestos
        iibb: iibbMonto,
        tissh: tisshMonto,
        ganancias: gananciasMonto,
        reservaLegal: reservaMonto,

        // 🔥 Resultado
        utilidadAntesGanancias: +utilidadAntes.toFixed(2),
        gananciaNetaFinal,

        // Contadores
        ventasCount: ventasMes.length,
        comprasCount: comprasMes.length,
        movimientosCount: movsMes.length
    };

    guardarSnapshotTesoreria(snapshot);
    return true;
}

// ==================== RENDER PRINCIPAL ====================
export function renderTesoreria() {
    cerrarMesAutomatico();

    const db = getDB();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const historial = obtenerHistorialTesoreria();
    const snapshotActual = obtenerSnapshotPorMes(mesActual) || null;

    // Verificar datos faltantes
    const faltantes = validarDatosEsenciales();
    const alertaHTML = faltantes.length > 0 ? `
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-4">
            <p class="text-yellow-700 dark:text-yellow-300 text-sm">
                ⚠️ Faltan datos para una tesorería completa:
                ${faltantes.map(f => f.mensaje).join(', ')}
                <button onclick="window.irAConfiguracion('${faltantes[0]?.seccion || 'empresa'}')" class="text-blue-600 underline ml-2">Completar</button>
            </p>
        </div>
    ` : '';

    // 🔥 NUEVO: caja real basada en movimientos (no en estimaciones)
    const cajaReal = calcularCajaReal();
    const impuestoCheque = calcularImpuestoChequeMes(mesActual);

    // 🔥 v7.16.5: todos los movimientos + filtros
    const todosLosMovs = (db.movimientos || [])
        .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // Meses disponibles (únicos)
    const mesesDisponibles = [...new Set(todosLosMovs.map(m => m.mes))].sort().reverse();
    if (mesesDisponibles.length === 0) mesesDisponibles.push(mesActual);

    // Últimos 20 del mes actual (para la tabla de arriba)
    const movimientosMes = todosLosMovs
        .filter(m => m.mes === mesActual)
        .slice(0, 20);

    // Cálculos estimados (por compatibilidad, aunque ahora preferimos caja real)
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const totalCobrado = ventasMes.filter(v => v.estado === 'cobrado').reduce((s, v) => s + (v.total || 0), 0);

    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));
    const totalPagadoCompras = comprasMes.filter(c => c.estadoPago === 'PAGADO').reduce((s, c) => s + (c.totalFactura || 0), 0);

    const costosMes = db.costosFijos.filter(c => c.vencimiento && c.vencimiento.startsWith(mesActual));
    const totalPagadoCostos = costosMes.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto, 0);

    const totalPagado = totalPagadoCompras + totalPagadoCostos;

    const historialOrdenado = [...historial].sort((a, b) => a.mes.localeCompare(b.mes));

    const proyeccion = calcularProyeccion(db, hoy);

    return `
        <div class="space-y-5 fade-in pb-24">
            ${alertaHTML}

            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">🏦 Tesorería</h1>
                <div class="flex items-center gap-3 flex-wrap">
                    <span class="text-sm text-gray-500">Mes: <strong>${mesActual}</strong></span>
                    <button onclick="window.mostrarModalIngresoManual()" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm">
                        ➕ Ingreso manual
                    </button>
                    <button onclick="window.cerrarMesActual()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">
                        📅 Cerrar mes
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-green-500">
                    <p class="text-xs text-gray-500">💰 Caja Real (movimientos)</p>
                    <p class="text-2xl font-bold ${cajaReal >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cajaReal)}</p>
                    <p class="text-xs text-gray-400 mt-1">Suma de todos los movimientos</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-blue-500">
                    <p class="text-xs text-gray-500">📋 Cobrado este mes</p>
                    <p class="text-2xl font-bold text-green-600">$${formatNumber(totalCobrado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-orange-500">
                    <p class="text-xs text-gray-500">📋 Pagado este mes</p>
                    <p class="text-2xl font-bold text-red-600">$${formatNumber(totalPagado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-purple-500">
                    <p class="text-xs text-gray-500">🏦 Impuesto al cheque (mes)</p>
                    <p class="text-2xl font-bold text-purple-600">$${formatNumber(impuestoCheque.total)}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        Déb: $${formatNumber(impuestoCheque.debitos)} | Créd: $${formatNumber(impuestoCheque.creditos)}
                    </p>
                    ${(() => {
                        try {
                            const impAnual = calcularImpuestoChequeAnual();
                            return `<p class="text-xs text-blue-600 font-bold mt-1 pt-1 border-t dark:border-gray-600">📅 ACUMULADO ${impAnual.anio}: $${formatNumber(impAnual.total)}</p>`;
                        } catch(e) { return ''; }
                    })()}
                </div>
            </div>

            <!-- 🔥 v7.16.5: Desglose fiscal del mes -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 font-bold text-white">
                    📊 Desglose fiscal del mes (${mesActual})
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- IVA -->
                    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <h3 class="font-bold text-sm text-blue-800 dark:text-blue-300 mb-2">🧾 IVA</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>IVA Ventas:</span><strong class="text-green-600">$${formatNumber(calcularIVAMes(mesActual).ivaVentas)}</strong></div>
                            <div class="flex justify-between"><span>IVA Compras:</span><strong class="text-red-600">-$${formatNumber(calcularIVAMes(mesActual).ivaCompras)}</strong></div>
                            <div class="border-t pt-1 mt-1 flex justify-between font-bold">
                                <span>IVA a pagar:</span>
                                <span class="${calcularIVAMes(mesActual).ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'}">
                                    $${formatNumber(Math.abs(calcularIVAMes(mesActual).ivaAPagar))}
                                    ${calcularIVAMes(mesActual).ivaAPagar < 0 ? ' (a favor)' : ''}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Impuesto al cheque -->
                    <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                        <h3 class="font-bold text-sm text-orange-800 dark:text-orange-300 mb-2">🏦 Impuesto al cheque</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>Débitos:</span><strong>$${formatNumber(impuestoCheque.debitos)}</strong></div>
                            <div class="flex justify-between"><span>Créditos:</span><strong>$${formatNumber(impuestoCheque.creditos)}</strong></div>
                            <div class="border-t pt-1 mt-1 flex justify-between font-bold">
                                <span>Total:</span>
                                <span class="text-orange-700">$${formatNumber(impuestoCheque.total)}</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Se compensa con Ganancias</p>
                        </div>
                    </div>

                    <!-- Caja -->
                    <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                        <h3 class="font-bold text-sm text-green-800 dark:text-green-300 mb-2">💰 Caja</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>Ingresos del mes:</span><strong class="text-green-600">$${formatNumber((db.movimientos || []).filter(m => m.mes === mesActual && m.tipo === 'ingreso').reduce((s, m) => s + m.montoNeto, 0))}</strong></div>
                            <div class="flex justify-between"><span>Egresos del mes:</span><strong class="text-red-600">$${formatNumber((db.movimientos || []).filter(m => m.mes === mesActual && m.tipo === 'egreso').reduce((s, m) => s + m.montoNeto, 0))}</strong></div>
                            <div class="border-t pt-1 mt-1 flex justify-between font-bold">
                                <span>Caja real:</span>
                                <span class="${cajaReal >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cajaReal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Resultado -->
                ${(() => {
                    // 🔥 v7.16.86: calcular iibb/tissh dentro del render (antes eran variables de otro scope)
                    const formulas = db.formulasImpuestos || {};
                    // 🔥 v7.16.94: respetar exentoHasta
                    const hoyStr = new Date().toISOString().split('T')[0];
                    const iibbExento = formulas.iibb?.exentoHasta && hoyStr <= formulas.iibb.exentoHasta;
                    const tisshExento = formulas.tissh?.exentoHasta && hoyStr <= formulas.tissh.exentoHasta;
                    const iibbAlic = (formulas.iibb?.activo && !iibbExento) ? (formulas.iibb.alicuota || 0) : 0;
                    const tisshAlic = (formulas.tissh?.activo && !tisshExento) ? (formulas.tissh.alicuota || 0) : 0;
                    return `
                    <div class="border-t dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900">
                        <h3 class="font-bold text-sm mb-2">📈 Resultado estimado del mes</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><span class="text-xs text-gray-500 block">Ventas netas:</span><strong>$${formatNumber(ventasMes.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0))}</strong></div>
                            <div><span class="text-xs text-gray-500 block">Utilidad antes:</span><strong>$${formatNumber(utilidadAntesEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impuestoCheque.total))}</strong></div>
                            <div><span class="text-xs text-gray-500 block">Ganancia neta:</span><strong class="text-green-600">$${formatNumber(gananciaNetaEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impuestoCheque.total))}</strong></div>
                            <div><span class="text-xs text-gray-500 block">Reserva Legal:</span><strong>$${formatNumber(calcularReservaEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impuestoCheque.total))}</strong></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">💡 Los números se consolidan al cerrar el mes.</p>
                    </div>`;
                })()}
            </div>

                        <!-- 🔥 v7.16.54: Resumen completo del Impuesto al Cheque -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2 font-bold text-white flex justify-between items-center">
                    <span>🏦 Impuesto al Cheque (Débito y Crédito)</span>
                    <button onclick="window.exportarImpuestoChequeAnualCSV()" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs">
                        📥 Exportar CSV
                    </button>
                </div>
                <div class="p-4 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                            <p class="text-xs text-gray-500">Débitos del año (${mesActual.substring(0,4)})</p>
                            <p class="text-2xl font-bold text-red-600">$${formatNumber(calcularImpuestoChequeAnual().debitos)}</p>
                            <p class="text-xs text-gray-400">Impuesto pagado en tus egresos</p>
                        </div>
                        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                            <p class="text-xs text-gray-500">Créditos del año (${mesActual.substring(0,4)})</p>
                            <p class="text-2xl font-bold text-green-600">$${formatNumber(calcularImpuestoChequeAnual().creditos)}</p>
                            <p class="text-xs text-gray-400">Impuesto pagado en tus ingresos</p>
                        </div>
                        <div class="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg p-3 text-white">
                            <p class="text-xs opacity-90">💰 Total acumulado para Ganancias</p>
                            <p class="text-2xl font-bold">$${formatNumber(calcularImpuestoChequeAnual().total)}</p>
                            <p class="text-xs opacity-90">${calcularImpuestoChequeAnual().movimientos} movimientos</p>
                        </div>
                    </div>
                    <div class="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                        💡 <strong>¿Cómo funciona?</strong> Cada vez que pagás o cobrás por transferencia/cheque, el banco descuenta un % 
                        (configurable en Config → Empresa, por defecto 0,6%). Ese monto se acumula como <strong>pago a cuenta de Ganancias</strong> y 
                        se te reintegra al cierre del ejercicio fiscal. Los movimientos en efectivo NO pagan este impuesto.
                    </div>
                </div>
            </div>

            <!-- 🔥 v7.16.5: Movimientos con filtros completos -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 font-bold border-b dark:border-gray-600">
                    <div class="flex justify-between items-center flex-wrap gap-2 mb-2">
                        <span>📊 Movimientos</span>
                        <div class="flex gap-2">
                            <button onclick="window.abrirModalDetalleMovimientos()" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs">
                                🔍 Ver todos
                            </button>
                            <button onclick="window.exportarMovimientosCSV()" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs">
                                📥 Exportar CSV
                            </button>
                        </div>
                    </div>
                    <!-- 🔥 Filtros -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                        <div>
                            <label class="text-xs text-gray-500 block">📅 Mes</label>
                            <select id="filtroMesMov" class="w-full p-1.5 border rounded text-sm dark:bg-gray-800 dark:border-gray-600" onchange="window.aplicarFiltrosMovimientos()">
                                ${mesesDisponibles.map(m => `<option value="${m}" ${m === mesActual ? 'selected' : ''}>${m}</option>`).join('')}
                                <option value="todos" ${mesActual === 'todos' ? 'selected' : ''}>Todos los meses</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs text-gray-500 block">📂 Tipo</label>
                            <select id="filtroTipoMov" class="w-full p-1.5 border rounded text-sm dark:bg-gray-800 dark:border-gray-600" onchange="window.aplicarFiltrosMovimientos()">
                                <option value="todos">Todos</option>
                                <option value="ingreso">Solo ingresos</option>
                                <option value="egreso">Solo egresos</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs text-gray-500 block">🔀 Origen</label>
                            <select id="filtroOrigenMov" class="w-full p-1.5 border rounded text-sm dark:bg-gray-800 dark:border-gray-600" onchange="window.aplicarFiltrosMovimientos()">
                                <option value="todos">Todos</option>
                                <option value="aporte_capital">Aportes</option>
                                <option value="venta_cobro">Cobros de ventas</option>
                                <option value="compra_pago">Pagos a proveedores</option>
                                <option value="ingreso_manual">Ingresos manuales</option>
                                <option value="costo_fijo">Costos fijos</option>
                            </select>
                        </div>
                        <div class="flex items-end gap-1">
                            <button onclick="window.limpiarFiltrosMovimientos()" class="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 px-3 py-1.5 rounded text-sm flex-1">
                                🔍 Limpiar
                            </button>
                        </div>
                    </div>
                </div>
                <div class="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-gray-700 text-sm">
                    Mostrando <strong id="cntMovsFiltrados">0</strong> de <strong id="cntMovsTotal">0</strong> movimientos
                    <span class="ml-3 text-xs">
                        Ingresos: <strong id="totIngresosFiltro" class="text-green-600">$0</strong>
                        Egresos: <strong id="totEgresosFiltro" class="text-red-600">$0</strong>
                        Neto: <strong id="totNetoFiltro" class="text-blue-600">$0</strong>
                    </span>
                </div>
                <div class="overflow-x-auto">
                    <div id="tablaMovimientosContainer">
                        ${renderTablaMovimientosFiltrados(movimientosMes, 'mes')}
                    </div>
                </div>
            </div>

            ${historialOrdenado.length > 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-bold text-lg">📈 Evolución del Capital (mes a mes)</h2>
                    <span class="text-xs text-gray-500">${historialOrdenado.length} meses</span>
                </div>
                <div class="h-64">
                    <canvas id="chartHistorico"></canvas>
                </div>
            </div>
            ` : ''}

            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-bold text-lg">📈 Proyección de Caja (30 días)</h2>
                    <span class="text-xs text-gray-500">Días desde hoy</span>
                </div>
                <div class="h-64">
                    <canvas id="chartProyeccion"></canvas>
                </div>
            </div>

            ${historialOrdenado.length > 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 font-bold border-b dark:border-gray-600">
                    <span>📋 Historial de Cierres Mensuales</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mes</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Saldo Caja</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">IVA a Pagar</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase bg-blue-50 dark:bg-blue-900/20">Caja Libre</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cobrado</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Pagado</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Capital</th>
                                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ventas</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            ${historialOrdenado.slice().reverse().map(h => `
                                <tr class="${h.mes === mesActual ? 'bg-blue-50 dark:bg-blue-900/20' : ''}">
                                    <td class="px-4 py-2 text-sm font-medium">${h.mes}</td>
                                    <td class="px-4 py-2 text-sm text-right ${h.saldoCaja >= 0 ? 'text-green-600' : 'text-red-600'}">${formatNumber(h.saldoCaja)}</td>
                                    <td class="px-4 py-2 text-sm text-right text-red-600">${formatNumber(Math.abs(h.ivaAPagar || 0))}</td>
                                    <td class="px-4 py-2 text-sm text-right font-bold bg-blue-50 dark:bg-blue-900/20 ${(h.saldoCaja - (h.ivaAPagar || 0)) >= 0 ? 'text-blue-600' : 'text-red-600'}">${formatNumber(h.saldoCaja - (h.ivaAPagar || 0))}</td>
                                    <td class="px-4 py-2 text-sm text-right text-green-600">${formatNumber(h.totalCobrado || 0)}</td>
                                    <td class="px-4 py-2 text-sm text-right text-red-600">${formatNumber(h.totalPagado || 0)}</td>
                                    <td class="px-4 py-2 text-sm text-right font-bold ${h.capitalAcumulado >= 0 ? 'text-green-600' : 'text-red-600'}">${formatNumber(h.capitalAcumulado)}</td>
                                    <td class="px-4 py-2 text-sm text-center">${h.ventasCount || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            ` : '<div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4 text-center text-gray-400">No hay historial de cierres mensuales. Cerrá el mes para guardar el primer registro.</div>'}

            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 font-bold border-b dark:border-gray-600">
                    <span>📅 Próximos Vencimientos</span>
                </div>
                <div id="listaVencimientos" class="divide-y dark:divide-gray-700">
                    ${renderVencimientos(db, hoy)}
                </div>
            </div>
        </div>
    `;
}

// ==================== CALCULAR PROYECCIÓN ====================
function calcularProyeccion(db, hoy) {
    const dias = 30;
    const proyeccion = [];
    let saldo = 0;

    const historial = obtenerHistorialTesoreria();
    const ultimoSnapshot = historial.length > 0 ? historial[historial.length - 1] : null;
    saldo = ultimoSnapshot ? ultimoSnapshot.capitalAcumulado : (db.configuracion?.capitalInicial || 0);

    for (let i = 0; i <= dias; i++) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() + i);
        const fechaStr = fecha.toISOString().split('T')[0];
        proyeccion.push({ fecha: fechaStr, saldo: saldo, cobros: 0, pagos: 0 });
    }

    const ventasPendientes = db.ventas.filter(v =>
        (v.estado === 'pendiente_cobro' || v.estado === 'aceptado') &&
        v.fechaCobroEsperada
    );
    for (const venta of ventasPendientes) {
        const diasDiff = calcularDiasDiff(hoy, venta.fechaCobroEsperada);
        if (diasDiff >= 0 && diasDiff <= dias) {
            proyeccion[diasDiff].cobros += venta.total || 0;
        }
    }

    const comprasPendientes = db.compras.filter(c =>
        c.estadoPago === 'PENDIENTE' && c.fechaVencimientoPago
    );
    for (const compra of comprasPendientes) {
        const diasDiff = calcularDiasDiff(hoy, compra.fechaVencimientoPago);
        if (diasDiff >= 0 && diasDiff <= dias) {
            proyeccion[diasDiff].pagos += compra.totalFactura || 0;
        }
    }

    const costosPendientes = db.costosFijos.filter(c => c.estado === 'pendiente' && c.vencimiento);
    for (const costo of costosPendientes) {
        const diasDiff = calcularDiasDiff(hoy, costo.vencimiento);
        if (diasDiff >= 0 && diasDiff <= dias) {
            proyeccion[diasDiff].pagos += costo.monto || 0;
        }
    }

    let saldoAcum = saldo;
    for (let i = 0; i <= dias; i++) {
        saldoAcum += proyeccion[i].cobros - proyeccion[i].pagos;
        proyeccion[i].saldo = saldoAcum;
    }

    return proyeccion;
}

function calcularDiasDiff(hoy, fechaStr) {
    const fecha = new Date(fechaStr);
    fecha.setHours(0, 0, 0, 0);
    hoy.setHours(0, 0, 0, 0);
    return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}

// ==================== RENDER VENCIMIENTOS ====================
function renderVencimientos(db, hoy) {
    const items = [];

    const ventasPendientes = db.ventas.filter(v =>
        (v.estado === 'pendiente_cobro' || v.estado === 'aceptado') &&
        v.fechaCobroEsperada
    );
    for (const v of ventasPendientes) {
        const dias = calcularDiasDiff(hoy, v.fechaCobroEsperada);
        items.push({
            tipo: 'Cobro',
            descripcion: `${v.clienteNombre} - Factura ${v.numComprobante || ''}`,
            monto: v.total || 0,
            fecha: v.fechaCobroEsperada,
            dias,
            estado: dias < 0 ? 'Vencido' : dias <= 3 ? 'Pronto' : 'Normal'
        });
    }

    const comprasPendientes = db.compras.filter(c =>
        c.estadoPago === 'PENDIENTE' && c.fechaVencimientoPago
    );
    for (const c of comprasPendientes) {
        const dias = calcularDiasDiff(hoy, c.fechaVencimientoPago);
        items.push({
            tipo: 'Pago',
            descripcion: `${c.proveedorNombre} - Factura ${c.numeroFactura || ''}`,
            monto: c.totalFactura || 0,
            fecha: c.fechaVencimientoPago,
            dias,
            estado: dias < 0 ? 'Vencido' : dias <= 3 ? 'Pronto' : 'Normal'
        });
    }

    const costosPendientes = db.costosFijos.filter(c => c.estado === 'pendiente' && c.vencimiento);
    for (const c of costosPendientes) {
        const dias = calcularDiasDiff(hoy, c.vencimiento);
        items.push({
            tipo: 'Costo Fijo',
            descripcion: c.nombre,
            monto: c.monto,
            fecha: c.vencimiento,
            dias,
            estado: dias < 0 ? 'Vencido' : dias <= 3 ? 'Pronto' : 'Normal'
        });
    }

    if (items.length === 0) {
        return '<div class="p-8 text-center text-gray-400">No hay vencimientos próximos</div>';
    }

    items.sort((a, b) => a.dias - b.dias);
    return items.slice(0, 10).map(item => `
        <div class="p-4 flex justify-between items-center ${item.estado === 'Vencido' ? 'bg-red-50 dark:bg-red-900/20' : item.estado === 'Pronto' ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}">
            <div>
                <p class="font-medium">${item.tipo}: ${escapeHtml(item.descripcion)}</p>
                <p class="text-xs text-gray-500">${item.fecha ? formatDate(item.fecha) : ''}</p>
            </div>
            <div class="text-right">
                <p class="font-bold ${item.tipo === 'Cobro' ? 'text-green-600' : 'text-red-600'}">${item.tipo === 'Cobro' ? '+' : '-'} $${formatNumber(item.monto)}</p>
                <p class="text-xs ${item.dias < 0 ? 'text-red-600' : item.dias <= 3 ? 'text-orange-600' : 'text-gray-500'}">
                    ${item.dias < 0 ? `Vencido hace ${Math.abs(item.dias)} días` : item.dias === 0 ? 'Vence hoy' : `Vence en ${item.dias} días`}
                </p>
            </div>
        </div>
    `).join('');
}

// ==================== CERRAR MES ====================
window.cerrarMesActual = () => {
    if (!confirm('¿Guardar el cierre del mes actual? Esto creará un snapshot del saldo y movimientos del mes.')) return;
    const result = cerrarMesAutomatico();
    if (result) {
        mostrarNotificacion('✅ Cierre de mes guardado correctamente', 'success');
        window.dispatchEvent(new Event('refreshView'));
    } else {
        mostrarNotificacion('ℹ️ El mes actual ya tiene un cierre guardado', 'info');
    }
};

// ==================== MODAL: INGRESO MANUAL ====================
window.mostrarModalIngresoManual = () => {
    const fechaActual = new Date().toISOString().split('T')[0];
    const mediosOptions = METODOS_PAGO.map(m =>
        `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`
    ).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            ${inputFechaHTML('ingreso-fecha', fechaActual, { label: '📅 Fecha' })}
            <div><label class="block text-sm font-medium">💰 Monto *</label><input type="number" id="ingreso-monto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0"></div>
            <div><label class="block text-sm font-medium">💳 Medio</label>
                <select id="ingreso-medio" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    ${mediosOptions}
                </select>
            </div>
            <div><label class="block text-sm font-medium">🔖 Referencia bancaria (opcional)</label><input type="text" id="ingreso-referencia" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Nro de transferencia, cheque, etc."></div>
            <div><label class="block text-sm font-medium">📝 Descripción *</label><input type="text" id="ingreso-descripcion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Préstamo bancario, Reintegro, etc."></div>
            <p class="text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                ℹ️ Los ingresos por <strong>transferencia</strong>, <strong>tarjeta</strong> o <strong>cheque</strong> generan impuesto al cheque (0,6%). Los ingresos en efectivo no.
            </p>
        </div>
    `, '💰 Ingreso manual de dinero');

    initInputFecha('ingreso-fecha');

    modal.querySelector('#modalGuardar').onclick = () => {
        const fecha = getValorFecha('ingreso-fecha');
        const monto = parseFloat(modal.querySelector('#ingreso-monto').value);
        const medio = modal.querySelector('#ingreso-medio').value;
        const referencia = modal.querySelector('#ingreso-referencia').value.trim() || '';
        const descripcion = modal.querySelector('#ingreso-descripcion').value.trim();

        if (!fecha || isNaN(monto) || monto <= 0) {
            mostrarNotificacion('Fecha y monto válidos', 'error');
            return;
        }
        if (!descripcion) {
            mostrarNotificacion('La descripción es obligatoria', 'error');
            return;
        }

        const db = getDB();
        if (!db.movimientos) db.movimientos = [];

        const medioKey = mapearMedioAKey(medio);
        const mov = crearMovimiento({
            fecha: fecha,
            tipo: 'ingreso',
            origen: 'ingreso_manual',
            origenId: null,
            origenDescripcion: descripcion,
            monto: monto,
            medio: medioKey,
            observaciones: referencia ? `Ref: ${referencia}` : ''
        });

        guardarDB();
        mostrarNotificacion(`✅ Ingreso registrado: $${formatNumber(monto)}`, 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// Helper: mapear nombre del medio (español) a clave interna
function mapearMedioAKey(medioEspanol) {
    const mapa = {
        'Efectivo': 'efectivo',
        'Transferencia': 'transferencia',
        'Tarjeta Débito': 'tarjeta_debito',
        'Tarjeta Crédito': 'tarjeta_credito',
        'Cheque': 'cheque',
        'Otro': 'otro'
    };
    return mapa[medioEspanol] || 'otro';
}

// ==================== INICIALIZAR EVENTOS ====================
// ==================== TABLA DE MOVIMIENTOS FILTRADOS ====================
function renderTablaMovimientosFiltrados(movs, modo = 'filtro') {
    if (movs.length === 0) {
        return '<div class="p-6 text-center text-gray-400">No hay movimientos con esos filtros</div>';
    }

    return `
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Origen</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Imp. Cheque</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Neto</th>
                    <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ver</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                ${movs.map(m => `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td class="px-4 py-2 text-sm">${formatDate(m.fecha)}</td>
                        <td class="px-4 py-2 text-sm">
                            <span class="px-2 py-0.5 rounded text-xs ${m.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                ${m.tipo === 'ingreso' ? '⬇️' : '⬆️'} ${m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                            </span>
                        </td>
                        <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">${escapeHtml(m.origenDescripcion || m.origen)}</td>
                        <td class="px-4 py-2 text-sm text-right font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">$${formatNumber(m.monto)}</td>
                        <td class="px-4 py-2 text-sm text-right text-orange-600">
                            ${m.impuestoDebitoCredito?.aplica 
                                ? `<div class="text-xs">${m.impuestoDebitoCredito.tasa}%</div>-$${formatNumber(m.impuestoDebitoCredito.monto)}` 
                                : '<span class="text-gray-400">—</span>'}
                        </td>
                        <td class="px-4 py-2 text-sm text-right font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">
                            $${formatNumber(m.montoNeto)}
                        </td>
                        <td class="px-4 py-2 text-center">
                            <button onclick="window.abrirDetalleMovimiento('${m.id}')" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">👁️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ==================== FILTROS Y VISTA ====================
window.aplicarFiltrosMovimientos = () => {
    const db = getDB();
    const mes = document.getElementById('filtroMesMov')?.value || 'todos';
    const tipo = document.getElementById('filtroTipoMov')?.value || 'todos';
    const origen = document.getElementById('filtroOrigenMov')?.value || 'todos';

    let movs = (db.movimientos || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (mes !== 'todos') movs = movs.filter(m => m.mes === mes);
    if (tipo !== 'todos') movs = movs.filter(m => m.tipo === tipo);
    if (origen !== 'todos') movs = movs.filter(m => m.origen === origen);

    // Actualizar contadores
    const totalMovs = (db.movimientos || []).length;
    const ingresos = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.montoNeto, 0);
    const egresos = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.montoNeto, 0);

    const elCntFiltrados = document.getElementById('cntMovsFiltrados');
    const elCntTotal = document.getElementById('cntMovsTotal');
    const elIngresos = document.getElementById('totIngresosFiltro');
    const elEgresos = document.getElementById('totEgresosFiltro');
    const elNeto = document.getElementById('totNetoFiltro');

    if (elCntFiltrados) elCntFiltrados.textContent = movs.length;
    if (elCntTotal) elCntTotal.textContent = totalMovs;
    if (elIngresos) elIngresos.textContent = '$' + formatNumber(ingresos);
    if (elEgresos) elEgresos.textContent = '$' + formatNumber(egresos);
    if (elNeto) elNeto.textContent = '$' + formatNumber(ingresos - egresos);

    // Actualizar tabla (mostrar últimos 20)
    const el = document.getElementById('tablaMovimientosContainer');
    if (el) el.innerHTML = renderTablaMovimientosFiltrados(movs.slice(0, 20));
};

window.limpiarFiltrosMovimientos = () => {
    const elMes = document.getElementById('filtroMesMov');
    const elTipo = document.getElementById('filtroTipoMov');
    const elOrigen = document.getElementById('filtroOrigenMov');
    if (elMes) elMes.value = 'todos';
    if (elTipo) elTipo.value = 'todos';
    if (elOrigen) elOrigen.value = 'todos';
    window.aplicarFiltrosMovimientos();
};

// ==================== MODAL VER TODOS ====================
window.abrirModalDetalleMovimientos = () => {
    const db = getDB();
    const todos = (db.movimientos || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4 text-center">📊 Todos los movimientos (${todos.length})</h2>
            <div class="mb-3 grid grid-cols-3 gap-2">
                <select id="modalFiltroTipo" class="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" onchange="window.aplicarFiltrosModalMov()">
                    <option value="todos">Todos los tipos</option>
                    <option value="ingreso">Solo ingresos</option>
                    <option value="egreso">Solo egresos</option>
                </select>
                <select id="modalFiltroOrigen" class="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" onchange="window.aplicarFiltrosModalMov()">
                    <option value="todos">Todos los orígenes</option>
                    <option value="aporte_capital">Aportes</option>
                    <option value="venta_cobro">Cobros</option>
                    <option value="compra_pago">Pagos</option>
                    <option value="ingreso_manual">Ingresos manuales</option>
                    <option value="costo_fijo">Costos fijos</option>
                </select>
                <button onclick="window.exportarMovimientosCSV()" class="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm">
                    📥 Exportar
                </button>
            </div>
            <div id="modalTablaMovs" class="overflow-x-auto">
                ${renderTablaMovimientosFiltrados(todos)}
            </div>
            <button onclick="this.closest('.modal').remove()" class="mt-4 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
};

window.aplicarFiltrosModalMov = () => {
    const db = getDB();
    const tipo = document.getElementById('modalFiltroTipo')?.value || 'todos';
    const origen = document.getElementById('modalFiltroOrigen')?.value || 'todos';

    let movs = (db.movimientos || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (tipo !== 'todos') movs = movs.filter(m => m.tipo === tipo);
    if (origen !== 'todos') movs = movs.filter(m => m.origen === origen);

    const el = document.getElementById('modalTablaMovs');
    if (el) el.innerHTML = renderTablaMovimientosFiltrados(movs);
};

// ==================== DETALLE DE MOVIMIENTO ====================
window.abrirDetalleMovimiento = (id) => {
    const db = getDB();
    const mov = (db.movimientos || []).find(m => String(m.id) === String(id));
    if (!mov) { mostrarNotificacion('Movimiento no encontrado', 'error'); return; }

    // Buscar origen
    let origenLink = '';
    let origenDetalle = '';
    if (mov.origen === 'venta_cobro' && mov.origenId) {
        const venta = db.ventas.find(v => String(v.id) === String(mov.origenId));
        if (venta) {
            origenDetalle = `<p class="text-sm"><strong>Factura:</strong> ${escapeHtml(venta.numComprobante || '-')} · <strong>Cliente:</strong> ${escapeHtml(venta.clienteNombre || '-')}</p>`;
            origenLink = `<button onclick="this.closest('.modal').remove(); window.showView('ventas');" class="bg-blue-600 text-white px-3 py-1 rounded text-sm mt-2">Ver venta</button>`;
        }
    } else if (mov.origen === 'compra_pago' && mov.origenId) {
        const compra = db.compras.find(c => String(c.id) === String(mov.origenId));
        if (compra) {
            origenDetalle = `<p class="text-sm"><strong>Factura:</strong> ${escapeHtml(compra.numeroFactura || '-')} · <strong>Proveedor:</strong> ${escapeHtml(compra.proveedorNombre || '-')}</p>`;
            origenLink = `<button onclick="this.closest('.modal').remove(); window.showView('compras');" class="bg-blue-600 text-white px-3 py-1 rounded text-sm mt-2">Ver compra</button>`;
        }
    } else if (mov.origen === 'aporte_capital' && mov.origenId) {
        const aporte = db.aportesCapital.find(a => String(a.id) === String(mov.origenId));
        if (aporte) {
            origenDetalle = `<p class="text-sm"><strong>Descripción:</strong> ${escapeHtml(aporte.descripcion || '-')}</p>`;
        }
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4 text-center">📊 Detalle del Movimiento</h2>
            <div class="space-y-2 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-sm">
                <div class="flex justify-between"><span class="text-gray-500">ID:</span> <code class="text-xs">${mov.id}</code></div>
                <div class="flex justify-between"><span class="text-gray-500">Fecha:</span> <strong>${formatDate(mov.fecha)}</strong></div>
                <div class="flex justify-between"><span class="text-gray-500">Tipo:</span>
                    <span class="px-2 py-0.5 rounded text-xs ${mov.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                        ${mov.tipo === 'ingreso' ? '⬇️ Ingreso' : '⬆️ Egreso'}
                    </span>
                </div>
                <div class="flex justify-between"><span class="text-gray-500">Origen:</span> <strong>${escapeHtml(mov.origen)}</strong></div>
                <div class="flex justify-between"><span class="text-gray-500">Descripción:</span> <strong>${escapeHtml(mov.origenDescripcion || '-')}</strong></div>
                <div class="flex justify-between"><span class="text-gray-500">Medio:</span> <strong>${escapeHtml(mov.medio || '-')}</strong></div>
                <div class="flex justify-between pt-2 mt-2">
                    <span class="text-gray-500">${mov.tipo === 'ingreso' ? 'Monto cobrado al cliente:' : 'Monto pagado al proveedor:'}</span>
                    <strong>$${formatNumber(mov.monto)}</strong>
                </div>
                ${mov.impuestoDebitoCredito?.aplica ? `
                <div class="flex justify-between text-orange-600">
                    <span>Impuesto al cheque (${mov.impuestoDebitoCredito.tasa}%):</span>
                    <strong>${mov.tipo === 'ingreso' ? '-' : '+'}$${formatNumber(mov.impuestoDebitoCredito.monto)}</strong>
                </div>
                <div class="text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                    ${mov.tipo === 'ingreso' 
                        ? `💡 El cliente transfirió $${formatNumber(mov.monto)} pero el banco te descontó $${formatNumber(mov.impuestoDebitoCredito.monto)}. <strong>Recibiste $${formatNumber(mov.montoNeto)}.</strong>`
                        : `💡 Transferiste $${formatNumber(mov.monto)} pero el banco te cobró $${formatNumber(mov.impuestoDebitoCredito.monto)} más. <strong>Salieron $${formatNumber(mov.montoNeto)} de tu cuenta.</strong>`
                    }
                </div>
                ` : `
                <div class="text-xs text-gray-500">💡 Sin impuesto al cheque (${mov.medio === 'efectivo' ? 'efectivo' : 'otro medio'}).</div>
                `}
                <div class="flex justify-between border-t-2 pt-2 mt-2"><span class="font-bold">💰 ${mov.tipo === 'ingreso' ? 'Ingreso real a caja' : 'Egreso real de caja'}:</span> <strong class="${mov.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">$${formatNumber(mov.montoNeto)}</strong></div>
                ${origenDetalle ? `<div class="border-t pt-2 mt-2">${origenDetalle}</div>` : ''}
                ${origenLink}
            </div>
            <button onclick="this.closest('.modal').remove()" class="mt-4 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
};

// ==================== EXPORTAR CSV ====================
window.exportarMovimientosCSV = () => {
    const db = getDB();
    const movs = (db.movimientos || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (movs.length === 0) { mostrarNotificacion('No hay movimientos para exportar', 'warning'); return; }

    let csv = 'Fecha,Tipo,Origen,Descripción,Medio,Monto,Impuesto Cheque,Neto\n';
    movs.forEach(m => {
        csv += `"${m.fecha || ''}","${m.tipo || ''}","${m.origen || ''}","${(m.origenDescripcion || '').replace(/"/g, '""')}","${m.medio || ''}",${m.monto || 0},${m.impuestoDebitoCredito?.monto || 0},${m.montoNeto || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    mostrarNotificacion(`📥 ${movs.length} movimientos exportados`, 'success');
};

// ==================== HELPERS DE CÁLCULO ESTIMADO (vista) ====================
function calcularCostosMes(comprasMes) {
    // 🔥 v7.16.96: corregido para no duplicar aranceles
    let costosNetos = 0, costosTotales = 0, aranceles = 0;
    comprasMes.forEach(c => {
        if (c.totales) {
            if (c.ivaComputable) {
                // Factura A: costo = neto gravado + no gravado (IVA va a crédito fiscal)
                costosNetos += (c.totales.netoGravado || 0) + (c.totales.noGravado || 0);
                aranceles += c.totales.noGravado || 0;
            } else {
                // Factura B/C/SIN: costo = total (no hay crédito fiscal)
                costosTotales += c.totalFactura || 0;
            }
        } else {
            if (c.ivaDescontable) costosNetos += c.montoNeto || 0;
            else costosTotales += c.totalFactura || 0;
        }
    });
    return { costosNetos, costosTotales, aranceles };
}

function utilidadAntesEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impChequeTotal) {
    const ventasNetas = ventasMes.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0);
    const { costosNetos, costosTotales } = calcularCostosMes(comprasMes);
    const iibb = ventasNetas * (iibbAlic / 100);
    const tissh = ventasNetas * (tisshAlic / 100);
    // 🔥 v7.16.97: NO restar aranceles (ya están en costosNetos)
    return +(ventasNetas - costosNetos - costosTotales - iibb - tissh - impChequeTotal).toFixed(2);
}

function gananciaNetaEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impChequeTotal) {
    const db = getDB();
    const utilidad = utilidadAntesEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impChequeTotal);
    if (utilidad <= 0) return 0;
    const gananciasAlic = db.formulas?.componentes?.ganancias?.activo ? (db.formulas.componentes.ganancias.alicuota || 0) : 0;
    const reservaAlic = db.formulas?.componentes?.reservaLegal?.activo ? (db.formulas.componentes.reservaLegal.alicuota || 0) : 0;
    const gcias = utilidad * (gananciasAlic / 100);
    const despues = utilidad - gcias;
    const reserva = despues * (reservaAlic / 100);
    return +(despues - reserva).toFixed(2);
}

function calcularReservaEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impChequeTotal) {
    const db = getDB();
    const utilidad = utilidadAntesEstimada(ventasMes, comprasMes, iibbAlic, tisshAlic, impChequeTotal);
    if (utilidad <= 0) return 0;
    const gananciasAlic = db.formulas?.componentes?.ganancias?.activo ? (db.formulas.componentes.ganancias.alicuota || 0) : 0;
    const reservaAlic = db.formulas?.componentes?.reservaLegal?.activo ? (db.formulas.componentes.reservaLegal.alicuota || 0) : 0;
    const gcias = utilidad * (gananciasAlic / 100);
    const despues = utilidad - gcias;
    return +(despues * (reservaAlic / 100)).toFixed(2);
}

export function initTesoreriaEvents() {
    // 🔥 v7.16.5: aplicar filtros iniciales cuando se renderiza
    setTimeout(() => window.aplicarFiltrosMovimientos(), 100);

    setTimeout(() => {
        const canvasProyeccion = document.getElementById('chartProyeccion');
        const canvasHistorico = document.getElementById('chartHistorico');

        const db = getDB();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        if (canvasProyeccion) {
            const proyeccion = calcularProyeccion(db, hoy);
            const ctx = canvasProyeccion.getContext('2d');
            const labels = proyeccion.map((p, i) => i === 0 ? 'Hoy' : `Día ${i}`);
            const data = proyeccion.map(p => p.saldo);

            if (window._chartProyeccion) window._chartProyeccion.destroy();
            window._chartProyeccion = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Saldo Proyectado',
                        data: data,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: value => '$' + formatNumber(value) }
                        }
                    }
                }
            });
        }

        if (canvasHistorico) {
            const historial = obtenerHistorialTesoreria();
            const historialOrdenado = [...historial].sort((a, b) => a.mes.localeCompare(b.mes));
            const ctx = canvasHistorico.getContext('2d');
            const labels = historialOrdenado.map(h => h.mes);
            const data = historialOrdenado.map(h => h.capitalAcumulado);

            if (window._chartHistorico) window._chartHistorico.destroy();
            window._chartHistorico = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Capital Acumulado',
                        data: data,
                        backgroundColor: data.map(v => v >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
                        borderColor: data.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: context => '$' + formatNumber(context.parsed.y)
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: value => '$' + formatNumber(value) }
                        }
                    }
                }
            });
        }
    }, 400);
}

function escapeHtml2(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ==================== 🔥 v7.16.54: EXPORTAR IMPUESTO AL CHEQUE ANUAL ====================
window.exportarImpuestoChequeAnualCSV = () => {
    const db = getDB();
    const anio = new Date().getFullYear().toString();
    const movs = (db.movimientos || [])
        .filter(m => m.fecha && m.fecha.startsWith(anio) && m.impuestoDebitoCredito?.aplica)
        .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

    if (movs.length === 0) {
        mostrarNotificacion('No hay movimientos con impuesto al cheque este año', 'warning');
        return;
    }

    let csv = 'Fecha,Tipo,Origen,Descripción,Medio,Monto,Impuesto Cheque,Neto,Tasa %\n';
    movs.forEach(m => {
        csv += '"' + (m.fecha || '') + '","' + (m.tipo || '') + '","' + (m.origen || '') + '","' + 
               (m.origenDescripcion || '').replace(/"/g, '""') + '","' + (m.medio || '') + '",' + 
               (m.monto || 0) + ',' + (m.impuestoDebitoCredito?.monto || 0) + ',' + 
               (m.montoNeto || 0) + ',' + (m.impuestoDebitoCredito?.tasa || 0) + '\n';
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'impuesto_cheque_' + anio + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    mostrarNotificacion('📥 ' + movs.length + ' movimientos exportados', 'success');
};
