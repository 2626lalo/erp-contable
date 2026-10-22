// ==================== modules/contador.js ====================
// CONTADOR - Capital, IVA, Resultados, Proyección, Cierre Mensual, Gráfico y PDF
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB, getImpuestosActivos, obtenerHistorialTesoreria } from './db.js';
import { formatNumber, mostrarNotificacion, formatDate, escapeHtml } from './utils.js';

export function renderContador() {
    const db = getDB();

    // ========== 1. CAPITAL INICIAL ==========
    const capitalInicial = db.datosEmpresa?.capitalInicial || 0;

    // ========== 2. VENTAS ==========
    const ventas = db.ventas || [];
    const ventasCobradas = ventas.filter(v => v.estado === 'cobrado');
    const totalCobradoConIVA = ventasCobradas.reduce((sum, v) => sum + (v.total || 0), 0);
    const ventasNetas = ventas.reduce((sum, v) => sum + (v.montoNeto || 0), 0);
    const ivaDebito = ventas.reduce((sum, v) => sum + (v.ivaMonto || 0), 0);

    const ventasPendientes = ventas.filter(v => 
        (v.estado === 'pendiente_cobro' || v.estado === 'pendiente_factura') && 
        v.fechaCobroEsperada
    );
    const totalPorCobrar = ventasPendientes.reduce((sum, v) => sum + (v.total || 0), 0);

    // ========== 3. COMPRAS ==========
    const compras = db.compras || [];
    const comprasPagadas = compras.filter(c => c.estadoPago === 'PAGADO');
    const totalPagadoConIVA = comprasPagadas.reduce((sum, c) => sum + (c.totalFactura || 0), 0);
    const comprasNetas = compras.reduce((sum, c) => sum + (c.montoNeto || 0), 0);
    const ivaCredito = compras
        .filter(c => c.ivaDescontable !== false)
        .reduce((sum, c) => sum + (c.ivaMonto || 0), 0);

    const comprasPendientes = compras.filter(c => 
        c.estadoPago === 'PENDIENTE' && 
        c.fechaVencimientoPago
    );
    const totalPorPagar = comprasPendientes.reduce((sum, c) => sum + (c.totalFactura || 0), 0);

    // ========== 4. COSTOS FIJOS ==========
    const costosFijos = db.costosFijos || [];
    const costosFijosPagados = costosFijos.filter(c => c.estado === 'pagado');
    const totalCostosFijosPagados = costosFijosPagados.reduce((sum, c) => sum + c.monto, 0);
    const totalCostosFijosDevengados = costosFijos.reduce((sum, c) => sum + c.monto, 0);

    // ========== 5. CAJA REAL ==========
    const cajaReal = capitalInicial + totalCobradoConIVA - totalPagadoConIVA - totalCostosFijosPagados;

    // ========== 6. IVA A PAGAR ==========
    const ivaAPagar = ivaDebito - ivaCredito;

    // ========== 7. IMPUESTOS ==========
    const impuestosActivos = getImpuestosActivos();
    let totalIIBB = 0, totalTISSH = 0, totalGanancias = 0, totalReservaLegal = 0;
    const ventasTotalesNeto = ventasNetas;
    const iibbImp = impuestosActivos.find(i => i.id === 'iibb');
    if (iibbImp && iibbImp.activo) totalIIBB = ventasTotalesNeto * (iibbImp.alicuota / 100);
    const tisshImp = impuestosActivos.find(i => i.id === 'tissh');
    if (tisshImp && tisshImp.activo) totalTISSH = ventasTotalesNeto * (tisshImp.alicuota / 100);
    const utilidadAntesGanancias = ventasTotalesNeto - comprasNetas - totalIIBB - totalTISSH - totalCostosFijosDevengados;
    const gananciasImp = impuestosActivos.find(i => i.id === 'ganancias');
    if (gananciasImp && gananciasImp.activo && utilidadAntesGanancias > 0) {
        totalGanancias = utilidadAntesGanancias * (gananciasImp.alicuota / 100);
    }
    const utilidadDespuesGanancias = utilidadAntesGanancias - totalGanancias;
    const reservaLegalImp = impuestosActivos.find(i => i.id === 'reservaLegal');
    if (reservaLegalImp && reservaLegalImp.activo && utilidadDespuesGanancias > 0) {
        totalReservaLegal = utilidadDespuesGanancias * (reservaLegalImp.alicuota / 100);
    }
    const totalImpuestosSobreVentas = totalIIBB + totalTISSH + totalGanancias + totalReservaLegal;
    const resultadoNeto = ventasTotalesNeto - comprasNetas - totalImpuestosSobreVentas - totalCostosFijosDevengados;
    const rentabilidad = ventasTotalesNeto > 0 ? (resultadoNeto / ventasTotalesNeto) * 100 : 0;

    // ========== 8. CAPITAL ACUMULADO ==========
    const historialTesoreria = obtenerHistorialTesoreria();
    const ultimoSnapshot = historialTesoreria.length > 0 ? historialTesoreria[historialTesoreria.length - 1] : null;
    const capitalAcumulado = ultimoSnapshot ? ultimoSnapshot.capitalAcumulado : cajaReal;

    // ========== 9. GASTOS FIJOS ==========
    const gastosFijosMensuales = db.datosEmpresa?.gastosFijosMensuales || {};
    const costosFijosPendientes = db.costosFijos.filter(c => c.estado === 'pendiente');
    const totalCostosFijosPendientes = costosFijosPendientes.reduce((s, c) => s + c.monto, 0);
    const totalGastosFijosMensuales = 
        (gastosFijosMensuales.alquiler || 0) +
        (gastosFijosMensuales.sueldos || 0) +
        (gastosFijosMensuales.servicios || 0) +
        (gastosFijosMensuales.otros || 0) +
        totalCostosFijosPendientes;

    const mesActual = new Date().toISOString().substring(0, 7);
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const ventasNetasMes = ventasMes.reduce((sum, v) => sum + (v.montoNeto || 0), 0);
    const comprasNetasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.substring(0, 7) === mesActual)
        .reduce((sum, c) => sum + (c.montoNeto || 0), 0);
    let manoObraMes = 0;
    ventasMes.forEach(v => {
        if (v.items) {
            v.items.forEach(item => {
                if (item.tipo === 'mano_obra') {
                    manoObraMes += (item.costo || 0) * (item.cant || 1);
                }
            });
        }
    });
    const costoVentasMes = comprasNetasMes + manoObraMes;
    const margenBrutoMes = ventasNetasMes - costoVentasMes;
    const coberturaGastosFijos = totalGastosFijosMensuales > 0 ? (margenBrutoMes / totalGastosFijosMensuales) * 100 : 0;
    const resultadoDespuesGastosFijos = margenBrutoMes - totalGastosFijosMensuales;

    // ========== 10. PROYECCIÓN DE CAJA ==========
    const ventasPendientesOrdenadas = [...ventasPendientes].sort((a, b) => 
        new Date(a.fechaCobroEsperada) - new Date(b.fechaCobroEsperada)
    );
    let saldoProyectado = cajaReal;
    const proyeccionDetalle = ventasPendientesOrdenadas.map(v => {
        saldoProyectado += v.total;
        return {
            cliente: v.clienteNombre,
            monto: v.total,
            fechaCobro: v.fechaCobroEsperada,
            saldoAcumulado: saldoProyectado
        };
    });
    const totalProyectado = cajaReal + totalPorCobrar;

    // ========== 11. CIERRES MENSUALES ==========
    const cierres = db.cierresMensuales || [];
    const cierresOrdenados = [...cierres].sort((a, b) => b.mes.localeCompare(a.mes));
    const mesCerrado = cierres.some(c => c.mes === mesActual);

    // ========== 12. GRÁFICO DE EVOLUCIÓN ==========
    const ultimos6Cierres = cierresOrdenados.slice(0, 6).reverse();
    const labels = ultimos6Cierres.map(c => c.mes);
    const ventasData = ultimos6Cierres.map(c => c.ventasNetas || 0);
    const resultadoData = ultimos6Cierres.map(c => c.resultadoNeto || 0);
    const saldoData = ultimos6Cierres.map(c => c.saldoCaja || 0);
    const maxValor = Math.max(...ventasData, ...resultadoData, ...saldoData, 1);

    // ========== 13. RENDER ==========
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">🧮 Contador</h1>
                <div class="flex gap-2">
                    <button onclick="window.cerrarMes()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2 shadow-md">
                        <span>📅</span> Cerrar mes
                    </button>
                    ${!mesCerrado ? `
                        <span class="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-3 py-2 rounded-xl text-sm flex items-center gap-1">
                            ⚠️ Mes sin cerrar
                        </span>
                    ` : `
                        <span class="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-3 py-2 rounded-xl text-sm flex items-center gap-1">
                            ✅ Mes cerrado
                        </span>
                    `}
                </div>
            </div>

            <!-- Tarjetas de resumen -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-blue-500">
                    <p class="text-xs text-gray-500">💰 Capital Inicial</p>
                    <p class="text-xl font-bold text-blue-600">$${formatNumber(capitalInicial)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-green-500">
                    <p class="text-xs text-gray-500">💰 Caja Real (disponible)</p>
                    <p class="text-xl font-bold ${cajaReal >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cajaReal)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-purple-500">
                    <p class="text-xs text-gray-500">📊 Capital Acumulado</p>
                    <p class="text-xl font-bold ${capitalAcumulado >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(capitalAcumulado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow border-l-4 border-yellow-500">
                    <p class="text-xs text-gray-500">🧾 IVA a Pagar/Compensar</p>
                    <p class="text-xl font-bold ${ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'}">$${formatNumber(ivaAPagar)}</p>
                </div>
            </div>

            <!-- Detalle de IVA -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <h2 class="font-bold text-lg mb-3">🧾 Detalle de IVA</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">IVA Débito (ventas):</span>
                        <span class="font-bold text-orange-600 block">+$${formatNumber(ivaDebito)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">IVA Crédito (compras descontables):</span>
                        <span class="font-bold text-green-600 block">-$${formatNumber(ivaCredito)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">IVA a Pagar/Compensar:</span>
                        <span class="font-bold ${ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'} block">$${formatNumber(ivaAPagar)}</span>
                    </div>
                </div>
                ${ivaAPagar > 0 ? `<p class="text-xs text-red-600 mt-2">⚠️ Deberás pagar $${formatNumber(ivaAPagar)} de IVA a fin de mes.</p>` : ivaAPagar < 0 ? `<p class="text-xs text-green-600 mt-2">✅ Tenés $${formatNumber(Math.abs(ivaAPagar))} de IVA a favor para compensar.</p>` : '<p class="text-xs text-gray-500 mt-2">✅ IVA compensado.</p>'}
            </div>

            <!-- Cuentas por Cobrar -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <h2 class="font-bold text-lg mb-3">📋 Cuentas por Cobrar</h2>
                ${ventasPendientes.length > 0 ? `
                    <div class="space-y-2">
                        ${ventasPendientes.map(v => {
                            const diasRestantes = calcularDiasRestantes(v.fechaCobroEsperada);
                            const estadoColor = diasRestantes < 0 ? 'text-red-600' : diasRestantes <= 3 ? 'text-orange-600' : 'text-gray-600';
                            return `
                                <div class="flex justify-between items-center border-b py-2 text-sm">
                                    <div>
                                        <span class="font-medium">${escapeHtml(v.clienteNombre)}</span>
                                        <span class="text-xs text-gray-400 ml-2">Factura ${v.numFacturaEmitida || v.numComprobante || 'N/A'}</span>
                                        <p class="text-xs text-gray-400">Cobro esperado: ${formatDate(v.fechaCobroEsperada)}</p>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-bold">$${formatNumber(v.total)}</span>
                                        <p class="text-xs ${estadoColor}">${diasRestantes < 0 ? `Vencido hace ${Math.abs(diasRestantes)} días` : diasRestantes === 0 ? 'Vence hoy' : `Vence en ${diasRestantes} días`}</p>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                        <div class="flex justify-between font-bold border-t-2 pt-2">
                            <span>Total por Cobrar:</span>
                            <span class="text-yellow-600">$${formatNumber(totalPorCobrar)}</span>
                        </div>
                    </div>
                ` : '<p class="text-gray-400 text-center py-2">✅ No hay cuentas por cobrar pendientes</p>'}
            </div>

            <!-- Análisis de Gastos Fijos -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <h2 class="font-bold text-lg mb-3">📊 Cobertura de Gastos Fijos (${mesActual})</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Gastos fijos mensuales (incluye costos fijos pendientes):</span>
                        <span class="font-bold text-red-600 block">$${formatNumber(totalGastosFijosMensuales)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Ventas netas del mes:</span>
                        <span class="font-bold text-green-600 block">$${formatNumber(ventasNetasMes)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Costo de ventas (mes):</span>
                        <span class="font-bold text-orange-600 block">$${formatNumber(costoVentasMes)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Margen bruto:</span>
                        <span class="font-bold ${margenBrutoMes >= 0 ? 'text-blue-600' : 'text-red-600'} block">$${formatNumber(margenBrutoMes)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Cobertura de gastos fijos:</span>
                        <span class="font-bold ${coberturaGastosFijos >= 100 ? 'text-green-600' : 'text-red-600'} block">${coberturaGastosFijos.toFixed(1)}%</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Resultado después de gastos fijos:</span>
                        <span class="font-bold ${resultadoDespuesGastosFijos >= 0 ? 'text-green-600' : 'text-red-600'} block">$${formatNumber(resultadoDespuesGastosFijos)}</span>
                    </div>
                </div>
                ${resultadoDespuesGastosFijos < 0 ? `
                    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                        <p class="text-red-700 dark:text-red-300 text-sm">⚠️ El margen bruto no alcanza para cubrir los gastos fijos. Faltan <strong>$${formatNumber(Math.abs(resultadoDespuesGastosFijos))}</strong> para llegar a punto de equilibrio.</p>
                    </div>
                ` : `
                    <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
                        <p class="text-green-700 dark:text-green-300 text-sm">✅ El margen bruto cubre los gastos fijos. Excedente de <strong>$${formatNumber(resultadoDespuesGastosFijos)}</strong></p>
                    </div>
                `}
                <div class="mt-2 text-xs text-gray-400">
                    <p>💡 El margen bruto es: Ventas netas - Costo de ventas (compras + mano de obra).</p>
                    <p>📌 Los gastos fijos incluyen los costos fijos pendientes registrados en Configuración.</p>
                </div>
            </div>

            <!-- Proyección de Caja -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <h2 class="font-bold text-lg mb-3">📈 Proyección de Caja (cobros pendientes)</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Saldo actual en caja:</span>
                        <span class="font-bold ${cajaReal >= 0 ? 'text-blue-600' : 'text-red-600'} block">$${formatNumber(cajaReal)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Total por cobrar:</span>
                        <span class="font-bold text-green-600 block">+$${formatNumber(totalPorCobrar)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Saldo proyectado:</span>
                        <span class="font-bold ${totalProyectado >= 0 ? 'text-green-600' : 'text-red-600'} block">$${formatNumber(totalProyectado)}</span>
                    </div>
                </div>
                ${ventasPendientesOrdenadas.length > 0 ? `
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th class="p-2 text-left">Cliente</th>
                                    <th class="p-2 text-right">Monto</th>
                                    <th class="p-2 text-left">Fecha de cobro</th>
                                    <th class="p-2 text-right">Saldo acumulado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${proyeccionDetalle.map(p => `
                                    <tr class="border-b">
                                        <td class="p-2">${escapeHtml(p.cliente)}</td>
                                        <td class="p-2 text-right font-bold text-green-600">+$${formatNumber(p.monto)}</td>
                                        <td class="p-2">${formatDate(p.fechaCobro)}</td>
                                        <td class="p-2 text-right font-bold ${p.saldoAcumulado >= 0 ? 'text-blue-600' : 'text-red-600'}">$${formatNumber(p.saldoAcumulado)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-2 text-xs text-gray-500">
                        <p>📌 El saldo se vuelve positivo a partir del cobro que acumule el monto necesario.</p>
                        <p>📅 Primer cobro: ${formatDate(ventasPendientesOrdenadas[0].fechaCobroEsperada)} • Último cobro: ${formatDate(ventasPendientesOrdenadas[ventasPendientesOrdenadas.length-1].fechaCobroEsperada)}</p>
                    </div>
                ` : '<p class="text-gray-400 text-center py-2">Sin cobros pendientes para proyectar.</p>'}
            </div>

            <!-- Estado de Resultados -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <h2 class="font-bold text-lg mb-3">📊 Estado de Resultados</h2>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between border-b py-1">
                        <span>Ventas Netas (sin IVA)</span>
                        <span class="font-bold text-green-600">+ $${formatNumber(ventasTotalesNeto)}</span>
                    </div>
                    <div class="flex justify-between border-b py-1">
                        <span>Compras Netas (sin IVA)</span>
                        <span class="font-bold text-red-600">- $${formatNumber(comprasNetas)}</span>
                    </div>
                    <div class="flex justify-between border-b py-1">
                        <span>IIBB (${iibbImp ? iibbImp.alicuota : 0}%)</span>
                        <span class="font-bold text-red-600">- $${formatNumber(totalIIBB)}</span>
                    </div>
                    <div class="flex justify-between border-b py-1">
                        <span>TISSH (${tisshImp ? tisshImp.alicuota : 0}%)</span>
                        <span class="font-bold text-red-600">- $${formatNumber(totalTISSH)}</span>
                    </div>
                    <div class="flex justify-between border-b py-1">
                        <span>Ganancias (${gananciasImp ? gananciasImp.alicuota : 0}%)</span>
                        <span class="font-bold text-red-600">- $${formatNumber(totalGanancias)}</span>
                    </div>
                    <div class="flex justify-between border-b py-1">
                        <span>Reserva Legal (${reservaLegalImp ? reservaLegalImp.alicuota : 0}%)</span>
                        <span class="font-bold text-red-600">- $${formatNumber(totalReservaLegal)}</span>
                    </div>
                    <div class="flex justify-between border-b py-1">
                        <span>Costos Fijos (devengados)</span>
                        <span class="font-bold text-red-600">- $${formatNumber(totalCostosFijosDevengados)}</span>
                    </div>
                    <div class="flex justify-between font-bold text-lg border-t-2 pt-2">
                        <span>RESULTADO NETO</span>
                        <span class="${resultadoNeto >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(resultadoNeto)}</span>
                    </div>
                    <div class="text-xs text-gray-500 text-right">
                        Rentabilidad: <span class="${rentabilidad >= 0 ? 'text-green-600' : 'text-red-600'}">${rentabilidad.toFixed(2)}%</span>
                    </div>
                </div>
            </div>

            <!-- Resumen de Movimientos Reales -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <h2 class="font-bold text-lg mb-3">💳 Movimientos Reales (Caja)</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Capital Inicial:</span>
                        <span class="font-bold text-blue-600 block">+$${formatNumber(capitalInicial)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Cobros de Ventas (con IVA):</span>
                        <span class="font-bold text-green-600 block">+$${formatNumber(totalCobradoConIVA)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Pagos de Compras (con IVA):</span>
                        <span class="font-bold text-red-600 block">-$${formatNumber(totalPagadoConIVA)}</span>
                    </div>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <span class="text-gray-500">Costos Fijos Pagados:</span>
                        <span class="font-bold text-red-600 block">-$${formatNumber(totalCostosFijosPagados)}</span>
                    </div>
                </div>
                <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between font-bold">
                    <span>💰 Saldo Caja Real:</span>
                    <span class="${cajaReal >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cajaReal)}</span>
                </div>
                ${totalPorPagar > 0 ? `<div class="mt-2 text-xs text-gray-500">📌 Tenés $${formatNumber(totalPorPagar)} en cuentas por pagar (compras pendientes).</div>` : ''}
            </div>

            <!-- Gráfico de Evolución -->
            ${cierresOrdenados.length > 0 ? `
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                    <h2 class="font-bold text-lg mb-3">📈 Evolución Mensual (últimos 6 meses)</h2>
                    <div class="flex items-end h-40 gap-2 overflow-x-auto">
                        ${ultimos6Cierres.map((c, i) => {
                            const alturaVentas = (c.ventasNetas || 0) / maxValor * 100;
                            const alturaResultado = (c.resultadoNeto || 0) / maxValor * 100;
                            const alturaSaldo = (c.saldoCaja || 0) / maxValor * 100;
                            return `
                                <div class="flex flex-col items-center flex-1 min-w-[50px]">
                                    <div class="flex flex-col items-center w-full">
                                        <div class="w-full bg-blue-500 rounded-t transition-all" style="height: ${Math.max(alturaVentas, 2)}%; min-height: 4px;"></div>
                                        <div class="w-full bg-purple-500 rounded-t transition-all" style="height: ${Math.max(alturaResultado, 2)}%; min-height: 4px; margin-top: 2px;"></div>
                                        <div class="w-full bg-green-500 rounded-t transition-all" style="height: ${Math.max(alturaSaldo, 2)}%; min-height: 4px; margin-top: 2px;"></div>
                                    </div>
                                    <span class="text-xs text-gray-500 mt-1">${c.mes}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="flex justify-center gap-4 text-xs mt-2">
                        <span><span class="inline-block w-3 h-3 bg-blue-500 rounded"></span> Ventas</span>
                        <span><span class="inline-block w-3 h-3 bg-purple-500 rounded"></span> Resultado</span>
                        <span><span class="inline-block w-3 h-3 bg-green-500 rounded"></span> Saldo caja</span>
                    </div>
                </div>
            ` : ''}

            <!-- Historial de Cierres Mensuales -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-bold text-lg">📅 Historial de Cierres Mensuales</h2>
                    <button onclick="window.cerrarMes()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-xl text-sm flex items-center gap-1 shadow-md">
                        <span>📅</span> Cerrar mes actual
                    </button>
                </div>
                ${cierresOrdenados.length > 0 ? `
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-xs">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th class="p-2 text-left">Mes</th>
                                    <th class="p-2 text-right">Ventas Netas</th>
                                    <th class="p-2 text-right">Compras Netas</th>
                                    <th class="p-2 text-right">Costos Fijos</th>
                                    <th class="p-2 text-right">Resultado Neto</th>
                                    <th class="p-2 text-right">IVA a Pagar</th>
                                    <th class="p-2 text-right">Saldo Caja</th>
                                    <th class="p-2 text-right">Faltantes Cobro</th>
                                    <th class="p-2 text-center">Fecha Cierre</th>
                                    <th class="p-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cierresOrdenados.map(c => `
                                    <tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td class="p-2 font-bold">${c.mes}</td>
                                        <td class="p-2 text-right text-green-600">$${formatNumber(c.ventasNetas || 0)}</td>
                                        <td class="p-2 text-right text-red-600">$${formatNumber(c.comprasNetas || 0)}</td>
                                        <td class="p-2 text-right text-orange-600">$${formatNumber(c.costosFijos || 0)}</td>
                                        <td class="p-2 text-right font-bold ${c.resultadoNeto >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(c.resultadoNeto || 0)}</td>
                                        <td class="p-2 text-right ${c.ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'}">$${formatNumber(c.ivaAPagar || 0)}</td>
                                        <td class="p-2 text-right font-bold ${c.saldoCaja >= 0 ? 'text-blue-600' : 'text-red-600'}">$${formatNumber(c.saldoCaja || 0)}</td>
                                        <td class="p-2 text-right text-yellow-600">$${formatNumber(c.faltantesCobro || 0)}</td>
                                        <td class="p-2 text-center text-gray-400">${c.fechaCierre ? formatDate(c.fechaCierre) : ''}</td>
                                        <td class="p-2 text-center">
                                            <button onclick="window.verDetalleCierre('${c.mes}')" class="text-blue-600 hover:underline text-xs">👁️</button>
                                            <button onclick="window.exportarCierrePDF('${c.mes}')" class="text-purple-600 hover:underline text-xs ml-1">📄</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : '<p class="text-gray-400 text-center py-2">No hay cierres mensuales registrados.</p>'}
            </div>

            <!-- Alertas -->
            ${ivaAPagar > 0 ? `
                <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <p class="text-red-700 dark:text-red-300">⚠️ Recordá separar <strong>$${formatNumber(ivaAPagar)}</strong> para el pago de IVA a fin de mes.</p>
                    <p class="text-xs text-red-600 dark:text-red-400 mt-1">Saldo de caja disponible: $${formatNumber(cajaReal)}</p>
                    ${ventasPendientes.length > 0 ? `<p class="text-xs text-red-600 dark:text-red-400">Con los cobros pendientes, el saldo proyectado será $${formatNumber(totalProyectado)}.</p>` : ''}
                </div>
            ` : ''}

            ${resultadoNeto < 0 ? `
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                    <p class="text-yellow-700 dark:text-yellow-300">⚠️ El negocio está teniendo pérdidas. Revisá tus costos y precios.</p>
                </div>
            ` : ''}

            ${cajaReal < 0 ? `
                <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <p class="text-red-700 dark:text-red-300">🔴 La caja real es negativa. Necesitás inyectar capital o ajustar plazos de cobro/pago.</p>
                    ${ventasPendientes.length > 0 ? `<p class="text-xs text-red-600 dark:text-red-400 mt-1">Se espera que la caja se recupere con los cobros pendientes. El primer cobro es el ${formatDate(ventasPendientesOrdenadas[0]?.fechaCobroEsperada)}.</p>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

function calcularDiasRestantes(fechaISO) {
    if (!fechaISO) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaISO);
    fecha.setHours(0, 0, 0, 0);
    return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}

// ==================== CIERRE MENSUAL ====================
window.cerrarMes = () => {
    const db = getDB();
    const mesActual = new Date().toISOString().substring(0, 7);

    if (!db.cierresMensuales) db.cierresMensuales = [];
    const existe = db.cierresMensuales.some(c => c.mes === mesActual);
    if (existe) {
        if (!confirm(`⚠️ Ya existe un cierre para el mes ${mesActual}. ¿Deseas sobrescribirlo?`)) {
            return;
        }
    }

    // Calcular datos del mes (igual que antes)
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const ventasNetasMes = ventasMes.reduce((sum, v) => sum + (v.montoNeto || 0), 0);
    const ventasTotalesMes = ventasMes.reduce((sum, v) => sum + (v.total || 0), 0);
    const ventasCobradasMes = ventasMes.filter(v => v.estado === 'cobrado');
    const ventasCobradasTotal = ventasCobradasMes.reduce((s, v) => s + (v.total || 0), 0);
    const ventasPendientesMes = ventasMes.filter(v => v.estado === 'pendiente_cobro' || v.estado === 'pendiente_factura');
    const faltantesCobro = ventasPendientesMes.reduce((s, v) => s + (v.total || 0), 0);

    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.substring(0, 7) === mesActual);
    const comprasNetasMes = comprasMes.reduce((sum, c) => sum + (c.montoNeto || 0), 0);
    const comprasTotalesMes = comprasMes.reduce((sum, c) => sum + (c.totalFactura || 0), 0);

    const costosFijosMes = db.costosFijos.filter(c => c.estado === 'pendiente' || c.estado === 'pagado');
    const costosFijosTotal = costosFijosMes.reduce((s, c) => s + c.monto, 0);

    // Impuestos
    const impuestosActivos = getImpuestosActivos();
    let totalIIBB = 0, totalTISSH = 0, totalGanancias = 0, totalReservaLegal = 0;
    const iibbImp = impuestosActivos.find(i => i.id === 'iibb');
    if (iibbImp && iibbImp.activo) totalIIBB = ventasNetasMes * (iibbImp.alicuota / 100);
    const tisshImp = impuestosActivos.find(i => i.id === 'tissh');
    if (tisshImp && tisshImp.activo) totalTISSH = ventasNetasMes * (tisshImp.alicuota / 100);
    const utilidadAntesGanancias = ventasNetasMes - comprasNetasMes - totalIIBB - totalTISSH - costosFijosTotal;
    const gananciasImp = impuestosActivos.find(i => i.id === 'ganancias');
    if (gananciasImp && gananciasImp.activo && utilidadAntesGanancias > 0) {
        totalGanancias = utilidadAntesGanancias * (gananciasImp.alicuota / 100);
    }
    const utilidadDespuesGanancias = utilidadAntesGanancias - totalGanancias;
    const reservaLegalImp = impuestosActivos.find(i => i.id === 'reservaLegal');
    if (reservaLegalImp && reservaLegalImp.activo && utilidadDespuesGanancias > 0) {
        totalReservaLegal = utilidadDespuesGanancias * (reservaLegalImp.alicuota / 100);
    }
    const totalImpuestosSobreVentas = totalIIBB + totalTISSH + totalGanancias + totalReservaLegal;
    const resultadoNeto = ventasNetasMes - comprasNetasMes - totalImpuestosSobreVentas - costosFijosTotal;

    const ivaDebitoMes = ventasMes.reduce((s, v) => s + (v.ivaMonto || 0), 0);
    const ivaCreditoMes = db.compras
        .filter(c => c.ivaDescontable !== false && c.fechaEmision && c.fechaEmision.substring(0, 7) === mesActual)
        .reduce((s, c) => s + (c.ivaMonto || 0), 0);
    const ivaAPagarMes = ivaDebitoMes - ivaCreditoMes;

    const capitalInicial = db.datosEmpresa?.capitalInicial || 0;
    const pagosComprasMes = db.compras.filter(c => c.estadoPago === 'PAGADO' && c.fechaPago && c.fechaPago.substring(0, 7) === mesActual)
        .reduce((s, c) => s + (c.totalFactura || 0), 0);
    const pagosCostosFijosMes = db.costosFijos.filter(c => c.estado === 'pagado' && c.fechaPago && c.fechaPago.substring(0, 7) === mesActual)
        .reduce((s, c) => s + c.monto, 0);
    const saldoCajaMes = capitalInicial + ventasCobradasTotal - pagosComprasMes - pagosCostosFijosMes;

    const cierre = {
        mes: mesActual,
        ventasNetas: ventasNetasMes,
        ventasTotales: ventasTotalesMes,
        comprasNetas: comprasNetasMes,
        comprasTotales: comprasTotalesMes,
        costosFijos: costosFijosTotal,
        resultadoNeto: resultadoNeto,
        ivaAPagar: ivaAPagarMes,
        ivaDebito: ivaDebitoMes,
        ivaCredito: ivaCreditoMes,
        saldoCaja: saldoCajaMes,
        faltantesCobro: faltantesCobro,
        totalVentasCobradas: ventasCobradasTotal,
        fechaCierre: new Date().toISOString()
    };

    db.cierresMensuales = db.cierresMensuales.filter(c => c.mes !== mesActual);
    db.cierresMensuales.push(cierre);
    guardarDB();

    mostrarNotificacion(`✅ Cierre del mes ${mesActual} guardado correctamente`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== DETALLE DE CIERRE ====================
window.verDetalleCierre = (mes) => {
    const db = getDB();
    const cierre = db.cierresMensuales.find(c => c.mes === mes);
    if (!cierre) {
        mostrarNotificacion('Cierre no encontrado', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">📊 Detalle del Cierre - ${cierre.mes}</h2>
            <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-2 text-sm">
                <div class="grid grid-cols-2 gap-2">
                    <div><span class="text-gray-500">Ventas Netas:</span> <span class="font-bold text-green-600">$${formatNumber(cierre.ventasNetas)}</span></div>
                    <div><span class="text-gray-500">Ventas Totales (con IVA):</span> <span class="font-bold">$${formatNumber(cierre.ventasTotales)}</span></div>
                    <div><span class="text-gray-500">Ventas Cobradas:</span> <span class="font-bold text-green-600">$${formatNumber(cierre.totalVentasCobradas)}</span></div>
                    <div><span class="text-gray-500">Faltantes de Cobro:</span> <span class="font-bold text-yellow-600">$${formatNumber(cierre.faltantesCobro)}</span></div>
                    <div><span class="text-gray-500">Compras Netas:</span> <span class="font-bold text-red-600">$${formatNumber(cierre.comprasNetas)}</span></div>
                    <div><span class="text-gray-500">Compras Totales (con IVA):</span> <span class="font-bold">$${formatNumber(cierre.comprasTotales)}</span></div>
                    <div><span class="text-gray-500">Costos Fijos:</span> <span class="font-bold text-orange-600">$${formatNumber(cierre.costosFijos)}</span></div>
                    <div><span class="text-gray-500">Resultado Neto:</span> <span class="font-bold ${cierre.resultadoNeto >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cierre.resultadoNeto)}</span></div>
                    <div><span class="text-gray-500">IVA Débito:</span> <span class="font-bold text-orange-600">$${formatNumber(cierre.ivaDebito)}</span></div>
                    <div><span class="text-gray-500">IVA Crédito:</span> <span class="font-bold text-green-600">$${formatNumber(cierre.ivaCredito)}</span></div>
                    <div><span class="text-gray-500">IVA a Pagar:</span> <span class="font-bold ${cierre.ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'}">$${formatNumber(cierre.ivaAPagar)}</span></div>
                    <div><span class="text-gray-500">Saldo de Caja:</span> <span class="font-bold ${cierre.saldoCaja >= 0 ? 'text-blue-600' : 'text-red-600'}">$${formatNumber(cierre.saldoCaja)}</span></div>
                </div>
                <div class="border-t pt-2 mt-2 text-gray-400 text-xs">
                    Fecha de cierre: ${formatDate(cierre.fechaCierre)}
                </div>
            </div>
            <div class="flex gap-3 mt-4">
                <button onclick="window.exportarCierrePDF('${cierre.mes}')" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl">📄 Exportar PDF</button>
                <button onclick="this.closest('.modal').remove()" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 py-2 rounded-xl">Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// ==================== EXPORTAR CIERRE A PDF ====================
window.exportarCierrePDF = (mes) => {
    const db = getDB();
    const cierre = db.cierresMensuales.find(c => c.mes === mes);
    if (!cierre) {
        mostrarNotificacion('Cierre no encontrado', 'error');
        return;
    }

    const empresa = db.datosEmpresa || { nombre: 'Mi Empresa', cuit: '', direccion: '' };
    const fechaActual = formatDate(new Date());

    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(`
        <html><head><title>Cierre Mensual ${cierre.mes}</title>
        <style>
            body { font-family: Arial, sans-serif; padding:40px; max-width:800px; margin:0 auto; color:#333; }
            .header { text-align:center; border-bottom:2px solid #1e3a8a; padding-bottom:20px; margin-bottom:30px; }
            .header h1 { color:#1e3a8a; margin:0; font-size:24px; }
            .header p { margin:5px 0; color:#555; }
            table { width:100%; border-collapse:collapse; margin:15px 0; }
            th { background:#1e3a8a; color:white; padding:8px; text-align:left; }
            td { padding:8px; border:1px solid #ddd; }
            .total { font-weight:bold; background:#f1f5f9; }
            .text-right { text-align:right; }
            .text-center { text-align:center; }
            .footer { margin-top:30px; text-align:center; font-size:12px; color:#888; border-top:1px solid #eee; padding-top:20px; }
            .green { color:#16a34a; }
            .red { color:#dc2626; }
            .orange { color:#ea580c; }
            .blue { color:#2563eb; }
            .yellow { color:#ca8a04; }
        </style></head>
        <body>
            <div class="header">
                <h1>${escapeHtml(empresa.nombre || 'Mi Empresa')}</h1>
                <p>CUIT: ${escapeHtml(empresa.cuit || '')} | ${escapeHtml(empresa.direccion || '')}</p>
                <h2 style="margin-top:10px;">CIERRE MENSUAL - ${cierre.mes}</h2>
                <p style="font-size:12px;color:#888;">Generado el ${fechaActual}</p>
            </div>

            <table>
                <tr><td><strong>Concepto</strong></td><td class="text-right"><strong>Monto</strong></td></tr>
                <tr><td>Ventas Netas (sin IVA)</td><td class="text-right green">$${formatNumber(cierre.ventasNetas)}</td></tr>
                <tr><td>Ventas Totales (con IVA)</td><td class="text-right">$${formatNumber(cierre.ventasTotales)}</td></tr>
                <tr><td>Ventas Cobradas</td><td class="text-right green">$${formatNumber(cierre.totalVentasCobradas)}</td></tr>
                <tr><td>Faltantes de Cobro</td><td class="text-right yellow">$${formatNumber(cierre.faltantesCobro)}</td></tr>
                <tr><td>Compras Netas (sin IVA)</td><td class="text-right red">-$${formatNumber(cierre.comprasNetas)}</td></tr>
                <tr><td>Compras Totales (con IVA)</td><td class="text-right">$${formatNumber(cierre.comprasTotales)}</td></tr>
                <tr><td>Costos Fijos</td><td class="text-right orange">-$${formatNumber(cierre.costosFijos)}</td></tr>
                <tr><td><strong>Resultado Neto</strong></td><td class="text-right ${cierre.resultadoNeto >= 0 ? 'green' : 'red'}"><strong>$${formatNumber(cierre.resultadoNeto)}</strong></td></tr>
                <tr><td>IVA Débito</td><td class="text-right orange">$${formatNumber(cierre.ivaDebito)}</td></tr>
                <tr><td>IVA Crédito</td><td class="text-right green">-$${formatNumber(cierre.ivaCredito)}</td></tr>
                <tr><td><strong>IVA a Pagar</strong></td><td class="text-right ${cierre.ivaAPagar >= 0 ? 'red' : 'green'}"><strong>$${formatNumber(cierre.ivaAPagar)}</strong></td></tr>
                <tr><td><strong>Saldo de Caja</strong></td><td class="text-right ${cierre.saldoCaja >= 0 ? 'blue' : 'red'}"><strong>$${formatNumber(cierre.saldoCaja)}</strong></td></tr>
            </table>

            <div style="margin-top:20px;font-size:12px;color:#666;">
                <p>📌 Este documento es un resumen contable del mes ${cierre.mes}. No reemplaza los libros contables oficiales.</p>
                <p>📅 Fecha de cierre: ${formatDate(cierre.fechaCierre)}</p>
            </div>

            <div class="footer">
                <p>ERP Contable Argentina - ${new Date().getFullYear()}</p>
            </div>
            <div style="margin-top:20px;text-align:center;">
                <button onclick="window.print()" style="padding:10px 30px;background:#1e3a8a;color:white;border:none;border-radius:5px;font-size:16px;cursor:pointer;">🖨️ Imprimir / Guardar PDF</button>
                <button onclick="window.close()" style="padding:10px 30px;background:#6b7280;color:white;border:none;border-radius:5px;font-size:16px;cursor:pointer;margin-left:10px;">Cerrar</button>
            </div>
        </body></html>
    `);
    ventana.document.close();
};

// ==================== CIERRE AUTOMÁTICO AL CAMBIAR DE MES ====================
export function initContadorEvents() {
    // Verificar si el mes cambió y preguntar si desea cerrar el mes anterior
    const db = getDB();
    const mesActual = new Date().toISOString().substring(0, 7);
    const ultimoCierre = db.cierresMensuales?.length > 0 ? db.cierresMensuales.sort((a, b) => b.mes.localeCompare(a.mes))[0] : null;

    // Si no hay cierres o el último cierre es de un mes anterior al actual, preguntar
    if (ultimoCierre && ultimoCierre.mes < mesActual) {
        if (confirm(`⚠️ El mes ${ultimoCierre.mes} no está cerrado. ¿Deseas cerrarlo ahora?`)) {
            // Cambiar a ese mes y cerrar
            // Forzar el mes del cierre al último mes sin cerrar
            window.cerrarMes();
        }
    } else if (!ultimoCierre && db.ventas && db.ventas.length > 0) {
        // Si no hay cierres pero hay ventas, preguntar si desea cerrar el mes actual
        if (confirm(`⚠️ No hay cierres registrados. ¿Deseas cerrar el mes actual (${mesActual})?`)) {
            window.cerrarMes();
        }
    }
}
