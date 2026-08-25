// ==================== modules/tesoreria.js ====================
// TESORERIA - Con historial mensual automático y gráfico evolutivo
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB, guardarSnapshotTesoreria, obtenerHistorialTesoreria, obtenerSnapshotPorMes } from './db.js';
import { formatNumber, formatDate, mostrarNotificacion } from './utils.js';

// ==================== FUNCIÓN DE CIERRE AUTOMÁTICO ====================
export function cerrarMesAutomatico() {
    const db = getDB();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const historial = obtenerHistorialTesoreria();
    
    // Verificar si ya existe cierre para este mes
    if (historial.some(h => h.mes === mesActual)) return false;

    // Calcular datos del mes
    const fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesAnteriorStr = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;
    
    // Obtener snapshot del mes anterior para continuar el capital
    const snapshotAnterior = obtenerSnapshotPorMes(mesAnteriorStr);
    let capitalInicialMes = snapshotAnterior ? snapshotAnterior.capitalAcumulado : (db.configuracion?.capitalInicial || 0);

    // Ventas del mes
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const totalCobrado = ventasMes.filter(v => v.estado === 'cobrado').reduce((s, v) => s + (v.total || 0), 0);
    const totalPorCobrar = ventasMes.filter(v => v.estado === 'pendiente_cobro' || v.estado === 'aceptado').reduce((s, v) => s + (v.total || 0), 0);

    // Compras del mes
    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));
    const totalPagadoCompras = comprasMes.filter(c => c.estadoPago === 'PAGADO').reduce((s, c) => s + (c.totalFactura || 0), 0);
    const totalPorPagarCompras = comprasMes.filter(c => c.estadoPago === 'PENDIENTE').reduce((s, c) => s + (c.totalFactura || 0), 0);

    // Costos fijos del mes
    const costosMes = db.costosFijos.filter(c => c.vencimiento && c.vencimiento.startsWith(mesActual));
    const totalPagadoCostos = costosMes.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const totalPorPagarCostos = costosMes.filter(c => c.estado === 'pendiente').reduce((s, c) => s + c.monto, 0);

    const totalPagado = totalPagadoCompras + totalPagadoCostos;
    const totalPorPagar = totalPorPagarCompras + totalPorPagarCostos;
    const saldoCaja = capitalInicialMes + totalCobrado - totalPagado;

    const snapshot = {
        mes: mesActual,
        fechaCierre: new Date().toISOString().split('T')[0],
        capitalInicialMes,
        totalCobrado,
        totalPagado,
        saldoCaja,
        totalPorCobrar,
        totalPorPagar,
        capitalAcumulado: saldoCaja,
        ventasCount: ventasMes.length,
        comprasCount: comprasMes.length
    };

    guardarSnapshotTesoreria(snapshot);
    return true;
}

// ==================== RENDER PRINCIPAL ====================
export function renderTesoreria() {
    // Ejecutar cierre automático al cargar la vista
    cerrarMesAutomatico();

    const db = getDB();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const historial = obtenerHistorialTesoreria();
    const snapshotActual = obtenerSnapshotPorMes(mesActual) || null;

    // Calcular datos en tiempo real para el mes actual
    const fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesAnteriorStr = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;
    const snapshotAnterior = obtenerSnapshotPorMes(mesAnteriorStr);
    let capitalInicialMes = snapshotAnterior ? snapshotAnterior.capitalAcumulado : (db.configuracion?.capitalInicial || 0);

    // Ventas del mes actual
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const totalCobrado = ventasMes.filter(v => v.estado === 'cobrado').reduce((s, v) => s + (v.total || 0), 0);
    const totalPorCobrar = ventasMes.filter(v => v.estado === 'pendiente_cobro' || v.estado === 'aceptado').reduce((s, v) => s + (v.total || 0), 0);

    // Compras del mes actual
    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));
    const totalPagadoCompras = comprasMes.filter(c => c.estadoPago === 'PAGADO').reduce((s, c) => s + (c.totalFactura || 0), 0);
    const totalPorPagarCompras = comprasMes.filter(c => c.estadoPago === 'PENDIENTE').reduce((s, c) => s + (c.totalFactura || 0), 0);

    // Costos fijos del mes actual
    const costosMes = db.costosFijos.filter(c => c.vencimiento && c.vencimiento.startsWith(mesActual));
    const totalPagadoCostos = costosMes.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const totalPorPagarCostos = costosMes.filter(c => c.estado === 'pendiente').reduce((s, c) => s + c.monto, 0);

    const totalPagado = totalPagadoCompras + totalPagadoCostos;
    const totalPorPagar = totalPorPagarCompras + totalPorPagarCostos;
    const saldoCaja = capitalInicialMes + totalCobrado - totalPagado;

    // Preparar datos para el gráfico histórico
    const historialOrdenado = [...historial].sort((a, b) => a.mes.localeCompare(b.mes));
    const mesesHistoricos = historialOrdenado.map(h => h.mes);
    const capitalHistorico = historialOrdenado.map(h => h.capitalAcumulado);

    // Proyección a 30 días (solo para el mes actual)
    const proyeccion = calcularProyeccion(db, hoy);

    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">🏦 Tesorería</h1>
                <div class="flex items-center gap-3">
                    <span class="text-sm text-gray-500">Mes: <strong>${mesActual}</strong></span>
                    <button onclick="window.cerrarMesActual()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">
                        📅 Cerrar mes
                    </button>
                </div>
            </div>

            <!-- Tarjetas de resumen (mes actual) -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-blue-500">
                    <p class="text-xs text-gray-500">💰 Saldo en Caja</p>
                    <p class="text-2xl font-bold ${saldoCaja >= 0 ? 'text-green-600' : 'text-red-600'}">${formatNumber(saldoCaja)}</p>
                    ${snapshotActual ? `<p class="text-xs text-gray-400">Cierre mes: ${formatNumber(snapshotActual.saldoCaja)}</p>` : ''}
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-yellow-500">
                    <p class="text-xs text-gray-500">📋 Cobrado este mes</p>
                    <p class="text-2xl font-bold text-green-600">${formatNumber(totalCobrado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-orange-500">
                    <p class="text-xs text-gray-500">📋 Pagado este mes</p>
                    <p class="text-2xl font-bold text-red-600">${formatNumber(totalPagado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-purple-500">
                    <p class="text-xs text-gray-500">📊 Capital Acumulado</p>
                    <p class="text-2xl font-bold ${saldoCaja >= 0 ? 'text-green-600' : 'text-red-600'}">${formatNumber(saldoCaja)}</p>
                </div>
            </div>

            <!-- Gráfico histórico -->
            ${mesesHistoricos.length > 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-bold text-lg">📈 Evolución del Capital (mes a mes)</h2>
                    <span class="text-xs text-gray-500">${mesesHistoricos.length} meses</span>
                </div>
                <div class="h-64">
                    <canvas id="chartHistorico"></canvas>
                </div>
            </div>
            ` : ''}

            <!-- Proyección a 30 días (solo para el mes actual) -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-bold text-lg">📈 Proyección de Caja (30 días)</h2>
                    <span class="text-xs text-gray-500">Días desde hoy</span>
                </div>
                <div class="h-64">
                    <canvas id="chartProyeccion"></canvas>
                </div>
            </div>

            <!-- Historial de cierres mensuales -->
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

            <!-- Proyección de vencimientos (siempre visible) -->
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

    // Obtener saldo actual desde el snapshot más reciente o capital inicial
    const historial = obtenerHistorialTesoreria();
    const ultimoSnapshot = historial.length > 0 ? historial[historial.length - 1] : null;
    saldo = ultimoSnapshot ? ultimoSnapshot.capitalAcumulado : (db.configuracion?.capitalInicial || 0);

    for (let i = 0; i <= dias; i++) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() + i);
        const fechaStr = fecha.toISOString().split('T')[0];
        proyeccion.push({ fecha: fechaStr, saldo: saldo, cobros: 0, pagos: 0 });
    }

    // Sumar cobros de ventas pendientes
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

    // Sumar pagos de compras pendientes
    const comprasPendientes = db.compras.filter(c => 
        c.estadoPago === 'PENDIENTE' && c.fechaVencimientoPago
    );
    for (const compra of comprasPendientes) {
        const diasDiff = calcularDiasDiff(hoy, compra.fechaVencimientoPago);
        if (diasDiff >= 0 && diasDiff <= dias) {
            proyeccion[diasDiff].pagos += compra.totalFactura || 0;
        }
    }

    // Sumar pagos de costos fijos pendientes
    const costosPendientes = db.costosFijos.filter(c => c.estado === 'pendiente' && c.vencimiento);
    for (const costo of costosPendientes) {
        const diasDiff = calcularDiasDiff(hoy, costo.vencimiento);
        if (diasDiff >= 0 && diasDiff <= dias) {
            proyeccion[diasDiff].pagos += costo.monto || 0;
        }
    }

    // Calcular saldo acumulado
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

    // Ventas por cobrar
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

    // Compras por pagar
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

    // Costos fijos por pagar
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

// ==================== CERRAR MES (manual) ====================
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

// ==================== INICIALIZAR EVENTOS (gráficos) ====================
export function initTesoreriaEvents() {
    setTimeout(() => {
        const canvasProyeccion = document.getElementById('chartProyeccion');
        const canvasHistorico = document.getElementById('chartHistorico');

        const db = getDB();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Gráfico de proyección
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

        // Gráfico histórico
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

// ==================== ESCAPE HTML ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}
