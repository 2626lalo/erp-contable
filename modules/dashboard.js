// ==================== modules/dashboard.js ====================
// DASHBOARD - Resumen contable real: Caja, IVA, Imp. Cheque, Ganancia Neta
// ERP Contable Argentina - v7.16.6
// v7.16.6: KPIs contables reales calculados de movimientos + detalle fiscal

import {
    getDB, getImpuestosActivos, guardarDB,
    calcularCajaReal, calcularImpuestoChequeMes, calcularIVAMes,
    calcularImpuestoChequeAnual,
    getCierreAnual, guardarCierreAnual, obtenerSaldosArrastrados
} from './db.js';
import {
    formatNumber, mostrarNotificacion, formatDate, escapeHtml,
    calcularSaldoCliente, calcularSaldoProveedor,
    generarId, dateToISO, confirmarAccion, calcularDiasDiff
} from './utils.js';

// ==================== RENDER PRINCIPAL ====================
export async function renderDashboard() {
    const db = getDB();

    if (!db.ventas) db.ventas = [];
    if (!db.compras) db.compras = [];
    if (!db.costosFijos) db.costosFijos = [];
    if (!db.clientes) db.clientes = [];
    if (!db.productos) db.productos = [];
    if (!db.movimientos) db.movimientos = [];

    // 🔥 v7.16.61: sistema de tabs (Mes actual / Año fiscal)
    const tabActivo = localStorage.getItem('dashboardTab') || 'mes';

    // ==================== MES ACTUAL ====================
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const anioActual = hoy.getFullYear().toString();

    // ==================== KPIs CONTABLES REALES ====================

    // 1. 💰 CAJA REAL (de movimientos)
    const cajaReal = calcularCajaReal();

    // 2. 🧾 IVA DEL MES
    const ivaMes = calcularIVAMes(mesActual);

    // 🔥 v7.17.7: Caja Disponible Futura = Caja Libre - Gastos Fijos Pendientes
    const costosPendientesMes = (db.costosFijos || []).filter(c =>
        c.estado === 'pendiente' && c.vencimiento &&
        c.vencimiento.startsWith(mesActual)
    );
    const totalGastosFijosPendientes = costosPendientesMes.reduce((s, c) => s + (c.monto || 0), 0);
    const cajaDisponibleFutura = +(cajaReal - ivaMes.ivaAPagar - totalGastosFijosPendientes).toFixed(2);

    // 🔥 v7.16.91: Caja Libre = Caja Real - IVA a pagar (plata disponible después de resguardar IVA)
    const cajaLibre = +(cajaReal - ivaMes.ivaAPagar).toFixed(2);

    // 3. 🏦 IMPUESTO AL CHEQUE (acumulado del mes)
    const impChequeMes = calcularImpuestoChequeMes(mesActual);

    // 🔥 v7.16.50: acumulado ANUAL (para compensar con Ganancias)
    const impChequeAnio = calcularImpuestoChequeAnual();

    // 4. 📊 GANANCIA NETA REAL (estimada del mes)
    const gananciaNeta = calcularGananciaNetaMes(mesActual);

    // ==================== DATOS PARA LOS BLOQUES ====================

    // Ventas y compras del mes
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));

    // Totales generales (para mantener los KPIs antiguos como info secundaria)
    const ventasTotales = db.ventas.reduce((sum, v) => sum + (v.total || 0), 0);
    const comprasTotales = db.compras.reduce((sum, c) => sum + (c.totalFactura || 0), 0);

    // Por cobrar / por pagar
    const porCobrar = db.ventas
        .filter(v => v.estado !== 'cobrado')
        .reduce((s, v) => s + (v.total || 0), 0);
    const porPagar = db.compras
        .filter(c => c.estadoPago !== 'PAGADO')
        .reduce((s, c) => s + (c.totalFactura || 0), 0);

    // ==================== GRÁFICO: EVOLUCIÓN ====================
    const meses6 = obtenerUltimosMeses(6);
    const datosGrafico = meses6.map(m => {
        const movsMes = db.movimientos.filter(x => x.mes === m);
        const cajaMov = movsMes.reduce((s, x) => s + (x.tipo === 'ingreso' ? x.montoNeto : -x.montoNeto), 0);
        const ventasM = db.ventas.filter(v => v.mes === m).reduce((s, v) => s + (v.total || 0), 0);
        const ivaM = calcularIVAMes(m);
        return { mes: m, caja: cajaMov, ventas: ventasM, iva: ivaM.ivaAPagar };
    });

    // ==================== PRÓXIMOS VENCIMIENTOS ====================
    const vencimientos = obtenerProximosVencimientos(db);

    // ==================== ÚLTIMOS MOVIMIENTOS ====================
    const ultimosMovs = (db.movimientos || [])
        .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
        .slice(0, 5);

    // ==================== RENDER ====================
    return `
        <div class="space-y-5 fade-in pb-24">
            <!-- Header -->
            <div class="flex justify-between items-center flex-wrap gap-2 mb-3">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📊 Dashboard Contable</h1>
                <span class="text-sm text-gray-500">${tabActivo === 'mes' ? 'Mes: <strong>' + mesActual + '</strong>' : 'Año: <strong>' + anioActual + '</strong>'}</span>
            </div>

            <!-- 🔥 v7.16.61: Tabs Mes actual / Año fiscal -->
            <div class="flex gap-2 border-b dark:border-gray-700 pb-2 mb-3">
                <button onclick="window.cambiarTabDashboard('mes')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tabActivo === 'mes' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}">
                    📅 Mes actual
                </button>
                <button onclick="window.cambiarTabDashboard('anio')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tabActivo === 'anio' ? 'bg-purple-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}">
                    📊 Año fiscal
                </button>
            </div>

            ${tabActivo === 'anio' ? renderAnioFiscal() : `
            <!-- ==================== CONTENIDO MES ==================== -->

            <!-- 🔥 4 KPIs CONTABLES REALES -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <!-- 💰 CAJA REAL -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border-l-4 ${cajaReal >= 0 ? 'border-green-500' : 'border-red-500'}">
                    <p class="text-xs text-gray-500 mb-1">💰 CAJA REAL</p>
                    <p class="text-2xl font-bold ${cajaReal >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cajaReal)}</p>
                    <p class="text-xs text-gray-400 mt-1">Suma de movimientos (neto)</p>
                    <div class="mt-2 flex gap-2 text-xs">
                        <span class="text-green-600">⬇️ +$${formatNumber((db.movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.montoNeto, 0))}</span>
                        <span class="text-red-600">⬆️ -$${formatNumber((db.movimientos || []).filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.montoNeto, 0))}</span>
                    </div>
                </div>

                <!-- 💵 CAJA LIBRE (después de resguardar IVA) -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border-l-4 border-blue-500">
                    <p class="text-xs text-gray-500 mb-1">💵 CAJA LIBRE</p>
                    <p class="text-2xl font-bold ${cajaLibre >= 0 ? 'text-blue-600' : 'text-red-600'}">$${formatNumber(cajaLibre)}</p>
                    <p class="text-xs text-gray-400 mt-1">Después de resguardar IVA</p>
                    <div class="mt-2 flex flex-col gap-0.5 text-xs">
                        <span class="text-gray-500">Caja real: $${formatNumber(cajaReal)}</span>
                        <span class="text-red-500">− IVA a pagar: $${formatNumber(Math.abs(ivaMes.ivaAPagar))}</span>
                    </div>
                </div>

                <!-- 💸 CAJA DISPONIBLE FUTURA (después de IVA + gastos fijos) -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border-l-4 ${cajaDisponibleFutura >= 0 ? 'border-green-500' : 'border-red-500'}">
                    <p class="text-xs text-gray-500 mb-1">💸 CAJA DISPONIBLE FUTURA</p>
                    <p class="text-2xl font-bold ${cajaDisponibleFutura >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(cajaDisponibleFutura)}</p>
                    <p class="text-xs text-gray-400 mt-1">Después de IVA + gastos fijos</p>
                    <div class="mt-2 flex flex-col gap-0.5 text-xs">
                        <span class="text-gray-500">Caja libre: $${formatNumber(cajaLibre)}</span>
                        <span class="text-red-500">− Gastos fijos: $${formatNumber(totalGastosFijosPendientes)}</span>
                    </div>
                </div>

                <!-- 🧾 IVA DEL MES -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border-l-4 border-blue-500">
                    <p class="text-xs text-gray-500 mb-1">🧾 IVA A PAGAR (${mesActual})</p>
                    <p class="text-2xl font-bold ${ivaMes.ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'}">
                        $${formatNumber(Math.abs(ivaMes.ivaAPagar))}
                    </p>
                    <p class="text-xs text-gray-400 mt-1">
                        ${ivaMes.ivaAPagar >= 0 ? 'A pagar' : 'Saldo a favor'}
                    </p>
                    <div class="mt-2 flex flex-col gap-0.5 text-xs">
                        <span class="text-green-600">Ventas: +$${formatNumber(ivaMes.ivaVentas)}</span>
                        <span class="text-red-600">Compras: -$${formatNumber(ivaMes.ivaCompras)}</span>
                    </div>
                </div>

                <!-- 🏦 IMPUESTO AL CHEQUE -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border-l-4 border-orange-500">
                    <p class="text-xs text-gray-500 mb-1">🏦 IMP. AL CHEQUE (${mesActual})</p>
                    <p class="text-2xl font-bold text-orange-600">$${formatNumber(impChequeMes.total)}</p>
                    <p class="text-xs text-gray-400 mt-1">Pago a cuenta Ganancias</p>
                    <div class="mt-2 flex flex-col gap-0.5 text-xs">
                        <span class="text-red-600">Débitos: $${formatNumber(impChequeMes.debitos)}</span>
                        <span class="text-green-600">Créditos: $${formatNumber(impChequeMes.creditos)}</span>
                        <span class="text-blue-600 font-bold mt-1 pt-1 border-t dark:border-gray-600">AÑO ${impChequeAnio.anio}: $${formatNumber(impChequeAnio.total)}</span>
                    </div>
                </div>

                <!-- 📊 GANANCIA REAL DEL MES -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border-l-4 border-purple-500">
                    <p class="text-xs text-gray-500 mb-1">💰 GANANCIA REAL (${mesActual})</p>
                    <p class="text-2xl font-bold ${gananciaNeta.gananciaRealMes >= 0 ? 'text-green-600' : 'text-red-600'}">
                        $${formatNumber(gananciaNeta.gananciaRealMes)}
                    </p>
                    <p class="text-xs text-gray-400 mt-1">Después de IVA e imp. al cheque</p>
                    <div class="mt-2 flex flex-col gap-0.5 text-xs">
                        <span class="text-gray-500">Ventas netas: $${formatNumber(gananciaNeta.ventasNetas)}</span>
                        <span class="text-gray-500">Ganancias anuales: -$${formatNumber(gananciaNeta.ganancias)}</span>
                        <span class="text-gray-500">Reserva Legal: -$${formatNumber(gananciaNeta.reservaLegal)}</span>
                    </div>
                </div>
            </div>

            <!-- 🔥 DETALLE FISCAL DEL MES -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 font-bold text-white flex justify-between items-center">
                    <span>📋 Detalle fiscal del mes</span>
                    <button onclick="window.showView('tesoreria')" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs">Ver Tesorería</button>
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- IVA -->
                    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <h3 class="font-bold text-sm text-blue-800 dark:text-blue-300 mb-2">🧾 IVA del mes</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>IVA Ventas:</span><strong class="text-green-600">$${formatNumber(ivaMes.ivaVentas)}</strong></div>
                            <div class="flex justify-between"><span>IVA Compras:</span><strong class="text-red-600">-$${formatNumber(ivaMes.ivaCompras)}</strong></div>
                            <div class="border-t pt-1 mt-1 flex justify-between font-bold">
                                <span>IVA a pagar:</span>
                                <span class="${ivaMes.ivaAPagar >= 0 ? 'text-red-600' : 'text-green-600'}">
                                    $${formatNumber(Math.abs(ivaMes.ivaAPagar))}
                                </span>
                            </div>
                            ${ivaMes.saldoTecnico > 0 ? `<div class="text-xs text-green-600 mt-1">Saldo a favor para próximo mes: $${formatNumber(ivaMes.saldoTecnico)}</div>` : ''}
                        </div>
                    </div>

                    <!-- Impuesto al cheque -->
                    <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                        <h3 class="font-bold text-sm text-orange-800 dark:text-orange-300 mb-2">🏦 Impuesto al cheque</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>Débitos (mes):</span><strong>$${formatNumber(impChequeMes.debitos)}</strong></div>
                            <div class="flex justify-between"><span>Créditos (mes):</span><strong>$${formatNumber(impChequeMes.creditos)}</strong></div>
                            <div class="border-t pt-1 mt-1 flex justify-between font-bold">
                                <span>Total mes:</span>
                                <span class="text-orange-700">$${formatNumber(impChequeMes.total)}</span>
                            </div>
                            <div class="border-t pt-1 mt-1 flex justify-between font-bold text-base">
                                <span>📅 ACUMULADO ${impChequeAnio.anio}:</span>
                                <span class="text-blue-600">$${formatNumber(impChequeAnio.total)}</span>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">💡 Se reintegra cuando pagás Ganancias al cierre del ejercicio</div>
                        </div>
                    </div>

                    <!-- Resultado del mes -->
                    <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                        <h3 class="font-bold text-sm text-purple-800 dark:text-purple-300 mb-2">📊 Resultado del mes (plata real en tu bolsillo)</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>Ventas netas (sin IVA):</span><strong>$${formatNumber(gananciaNeta.ventasNetas)}</strong></div>
                            <div class="flex justify-between"><span>Costos totales (sin IVA):</span><strong class="text-red-600">-$${formatNumber(gananciaNeta.costosNetos + gananciaNeta.costosTotales)}</strong></div>
                            <div class="flex justify-between"><span>Imp. cheque (0,6% pagado):</span><strong class="text-red-600">-$${formatNumber(impChequeMes.total)}</strong></div>
                            ${gananciaNeta.iibb > 0 || gananciaNeta.tissh > 0 
                                ? `<div class="flex justify-between"><span>IIBB + TISSH:</span><strong class="text-red-600">-$${formatNumber(gananciaNeta.iibb + gananciaNeta.tissh)}</strong></div>`
                                : `<div class="flex justify-between"><span class="text-green-600">IIBB + TISSH:</span><strong class="text-green-600">Exento ✅</strong></div>`}
                            <div class="border-t-2 pt-2 mt-2 flex justify-between font-bold text-base">
                                <span>💰 GANANCIA REAL DEL MES:</span>
                                <span class="${gananciaNeta.gananciaRealMes >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(gananciaNeta.gananciaRealMes)}</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-2 italic">💡 El IVA ($8.330,58) NO se resta de la ganancia — es un impuesto que se traslada al cliente y se le paga a AFIP aparte.</p>
                        </div>
                        <div class="mt-3 pt-3 border-t dark:border-gray-700">
                            <h4 class="font-bold text-xs text-gray-600 dark:text-gray-400 mb-1">📈 PROYECCIÓN ANUAL (si ganás igual todo el año)</h4>
                            <div class="space-y-0.5 text-xs">
                                <div class="flex justify-between"><span>Utilidad antes Gcias:</span><strong>$${formatNumber(gananciaNeta.utilidadAntesGanancias)}</strong></div>
                                <div class="flex justify-between"><span>Ganancias (25%):</span><strong class="text-red-600">-$${formatNumber(gananciaNeta.ganancias)}</strong></div>
                                <div class="flex justify-between"><span>Reserva Legal (5%):</span><strong class="text-red-600">-$${formatNumber(gananciaNeta.reservaLegal)}</strong></div>
                                <div class="flex justify-between font-bold pt-1 border-t mt-1"><span>Ganancia anual estimada:</span><span class="text-green-600">$${formatNumber(gananciaNeta.gananciaNetaAnualProyectada)}</span></div>
                            </div>
                            <p class="text-xs text-gray-500 mt-2 italic">💡 Ganancias y Reserva Legal se pagan al CIERRE del ejercicio (mayo del año siguiente)</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- KPIs secundarios -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 shadow">
                    <p class="text-xs text-gray-500">📋 Por cobrar</p>
                    <p class="text-lg font-bold text-yellow-600">$${formatNumber(porCobrar)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 shadow">
                    <p class="text-xs text-gray-500">📤 Por pagar</p>
                    <p class="text-lg font-bold text-orange-600">$${formatNumber(porPagar)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 shadow">
                    <p class="text-xs text-gray-500">💰 Ventas totales</p>
                    <p class="text-lg font-bold text-blue-600">$${formatNumber(ventasTotales)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-3 shadow">
                    <p class="text-xs text-gray-500">🛒 Compras totales</p>
                    <p class="text-lg font-bold text-purple-600">$${formatNumber(comprasTotales)}</p>
                </div>
            </div>

            <!-- Gráfico evolución -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-bold text-lg">📈 Evolución (últimos 6 meses)</h2>
                    <span class="text-xs text-gray-500">Caja · Ventas · IVA a pagar</span>
                </div>
                <div class="h-72">
                    <canvas id="chartEvolucionContable"></canvas>
                </div>
            </div>

            <!-- Próximos vencimientos (mejorado) -->
            ${(() => {
                const db = getDB();
                const hoy = new Date();
                const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
                const mesAnterior = (() => {
                    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                })();

                // Gastos fijos pendientes del mes actual + mes anterior (vencidos)
                const costosPendientes = (db.costosFijos || []).filter(c =>
                    c.estado === 'pendiente' && c.vencimiento &&
                    (c.vencimiento.startsWith(mesActual) || c.vencimiento.startsWith(mesAnterior))
                ).sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || ''));

                const totalGastosFijos = costosPendientes.reduce((s, c) => s + (c.monto || 0), 0);
                const cajaReal = calcularCajaReal();
                const ivaMes = calcularIVAMes(mesActual);
                const ivaAPagar = ivaMes.ivaVentas - ivaMes.ivaCompras;
                const cajaLibre = cajaReal - ivaAPagar;
                const cubre = cajaLibre >= totalGastosFijos;
                const faltante = cubre ? 0 : totalGastosFijos - cajaLibre;

                return `
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 font-bold border-b dark:border-gray-600 flex justify-between items-center">
                        <span>📅 Próximos vencimientos</span>
                        <button onclick="window.showView('configuracion')" class="text-xs text-blue-600 underline">Gestionar costos fijos</button>
                    </div>

                    <!-- 🔥 v7.17.6: Resumen claro de gastos fijos vs disponible -->
                    <div class="p-4 bg-gradient-to-br ${cubre ? 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20' : 'from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20'} border-b dark:border-gray-700">
                        <!-- Total a pagar -->
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm text-gray-700 dark:text-gray-300">💰 Total a pagar (gastos fijos):</span>
                            <strong class="text-lg text-red-600">$${formatNumber(totalGastosFijos)}</strong>
                        </div>

                        <!-- Disponible en caja -->
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm text-gray-700 dark:text-gray-300">💵 Disponible en caja (después de IVA):</span>
                            <strong class="text-lg text-blue-600">$${formatNumber(cajaLibre)}</strong>
                        </div>

                        <!-- Resultado: faltante o sobrante -->
                        <div class="border-t-2 ${cubre ? 'border-green-300 dark:border-green-700' : 'border-red-300 dark:border-red-700'} pt-2 mt-2">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-bold ${cubre ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}">
                                    ${cubre ? '✅ SOBRANTE:' : '⚠️ FALTANTE:'}
                                </span>
                                <strong class="text-xl ${cubre ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}">
                                    $${formatNumber(Math.abs(cubre ? cajaLibre - totalGastosFijos : faltante))}
                                </strong>
                            </div>
                            <p class="text-xs text-gray-500 mt-1 text-center">
                                ${cubre
                                    ? 'La caja alcanza para pagar todos los gastos fijos'
                                    : 'No alcanza. Necesitás cobrar más o reducir gastos'
                                }
                            </p>
                        </div>

                        <!-- Detalle de IVA a resguardar -->
                        <details class="mt-2">
                            <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                                ℹ️ Ver detalle del cálculo
                            </summary>
                            <div class="mt-2 p-2 bg-white dark:bg-gray-800 rounded text-xs space-y-1">
                                <div class="flex justify-between"><span>Caja Real (movimientos):</span><strong>$${formatNumber(cajaReal)}</strong></div>
                                <div class="flex justify-between"><span>− IVA a resguardar:</span><strong class="text-red-600">−$${formatNumber(Math.abs(ivaAPagar))}</strong></div>
                                <div class="flex justify-between border-t pt-1 mt-1"><span>= Disponible real:</span><strong class="text-blue-600">$${formatNumber(cajaLibre)}</strong></div>
                                <div class="flex justify-between mt-2"><span>− Gastos fijos pendientes:</span><strong class="text-red-600">−$${formatNumber(totalGastosFijos)}</strong></div>
                                <div class="flex justify-between border-t pt-1 mt-1"><span>= ${cubre ? 'Sobrante' : 'Faltante'}:</span><strong class="${cubre ? 'text-green-600' : 'text-red-600'}">$${formatNumber(Math.abs(cubre ? cajaLibre - totalGastosFijos : faltante))}</strong></div>
                                <div class="text-gray-400 italic mt-2">📊 Se actualiza con cada movimiento de caja</div>
                            </div>
                        </details>
                    </div>

                    <!-- Lista de costos fijos -->
                    ${costosPendientes.length === 0
                        ? '<div class="p-4 text-center text-gray-400">No hay costos fijos pendientes</div>'
                        : costosPendientes.map(c => {
                            const dias = calcularDiasDiff(hoy, c.vencimiento);
                            const estado = dias < 0 ? 'vencido' : dias <= 3 ? 'pronto' : 'normal';
                            return `
                                <div class="p-3 flex justify-between items-center border-b dark:border-gray-700 ${estado === 'vencido' ? 'bg-red-50 dark:bg-red-900/20' : estado === 'pronto' ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}">
                                    <div class="flex-1">
                                        <p class="font-medium text-sm">📌 ${escapeHtml(c.nombre)}</p>
                                        <p class="text-xs text-gray-500">${formatDate(c.vencimiento)}</p>
                                        <p class="text-sm font-bold text-red-600 mt-1">-$${formatNumber(c.monto)}</p>
                                        <p class="text-xs ${dias < 0 ? 'text-red-600' : dias <= 3 ? 'text-orange-600' : 'text-gray-500'}">
                                            ${dias < 0 ? `Vencido hace ${Math.abs(dias)} días` : dias === 0 ? 'Vence hoy' : `En ${dias} días`}
                                        </p>
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <button onclick="window.irACostosFijos('${c.id}')" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">✏️ Editar</button>
                                        <button onclick="window.pagarCostoFijoDesdeDashboard('${c.id}')" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">✅ Pagar</button>
                                        ${dias < 0 ? `<button onclick="window.recargarCostoFijo('${c.id}')" class="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs">🔄 Recargar</button>` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')
                    }
                </div>
                `;
            })()}

            <!-- Últimos movimientos -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 font-bold border-b dark:border-gray-600 flex justify-between items-center">
                    <span>💸 Últimos movimientos</span>
                    <button onclick="window.showView('tesoreria')" class="text-xs text-blue-600 underline">Ver todos</button>
                </div>
                <div class="divide-y dark:divide-gray-700">
                    ${ultimosMovs.length === 0 ? '<div class="p-6 text-center text-gray-400">Sin movimientos</div>' :
                      ultimosMovs.map(m => `
                        <div class="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700">
                            <div class="flex-1">
                                <p class="font-medium text-sm">${escapeHtml(m.origenDescripcion || m.origen)}</p>
                                <p class="text-xs text-gray-500">${formatDate(m.fecha)} · ${escapeHtml(m.medio || '')}</p>
                                ${m.impuestoDebitoCredito?.aplica 
                                    ? `<p class="text-xs text-orange-600 mt-0.5">
                                        ${m.tipo === 'ingreso' 
                                            ? 'Cobrado: $' + formatNumber(m.monto) + ' − $' + formatNumber(m.impuestoDebitoCredito.monto) + ' (' + m.impuestoDebitoCredito.tasa + '% imp. cheque)' 
                                            : 'Pagado: $' + formatNumber(m.monto) + ' + $' + formatNumber(m.impuestoDebitoCredito.monto) + ' (' + m.impuestoDebitoCredito.tasa + '% imp. cheque)'}
                                       </p>`
                                    : '<p class="text-xs text-gray-400 mt-0.5">Sin impuesto al cheque (' + (m.medio || '') + ')</p>'
                                }
                            </div>
                            <div class="text-right">
                                <span class="font-bold text-sm ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">
                                    ${m.tipo === 'ingreso' ? '+' : '-'}$${formatNumber(m.montoNeto)}
                                </span>
                                <p class="text-xs text-gray-400">Neto en caja</p>
                            </div>
                        </div>
                      `).join('')
                    }
                </div>
            </div>
        </div>
            `}
        </div>
    `;
}

// ==================== 🔥 v7.16.61: RENDER AÑO FISCAL ====================
function renderAnioFiscal() {
    const db = getDB();
    const anioActual = new Date().getFullYear().toString();

    // ==================== VENTAS DEL AÑO ====================
    const ventasAnio = (db.ventas || []).filter(v => v.mes && v.mes.startsWith(anioActual));
    const ventasBrutas = ventasAnio.reduce((s, v) => s + (v.total || 0), 0);
    const ventasNetas = ventasAnio.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0);

    // ==================== COMPRAS DEL AÑO POR TIPO DE FACTURA ====================
    const comprasAnio = (db.compras || []).filter(c => c.fechaEmision && c.fechaEmision.startsWith(anioActual));
    let comprasA = 0, comprasB = 0, comprasC = 0, comprasSIN = 0;
    let costosTotalAnio = 0;
    let arancelesAnio = 0;

    comprasAnio.forEach(c => {
        const tipo = c.tipoFactura || 'SIN';
        const total = c.totalFactura || 0;
        if (tipo === 'A') comprasA += total;
        else if (tipo === 'B') comprasB += total;
        else if (tipo === 'C') comprasC += total;
        else comprasSIN += total;

        // Costo para Ganancias
        if (c.totales) {
            costosTotalAnio += c.totales.costoTotalGanancias || 0;
            arancelesAnio += c.totales.noGravado || 0;
        } else {
            costosTotalAnio += c.ivaDescontable ? (c.montoNeto || 0) : total;
        }
    });

    // ==================== IVA DEL AÑO ====================
    const ivaVentasAnio = ventasAnio.reduce((s, v) => s + (v.ivaMonto || 0), 0);
    const ivaComprasAnio = comprasAnio
        .filter(c => c.ivaDescontable)
        .reduce((s, c) => s + (c.ivaMonto || 0), 0);
    const ivaAPagarAnio = ivaVentasAnio - ivaComprasAnio;

    // ==================== IMPUESTO AL CHEQUE DEL AÑO ====================
    const impChequeAnio = calcularImpuestoChequeAnual(anioActual);

    // ==================== IIBB + TISSH ====================
    const formulas = db.formulas?.componentes || {};
    const hoy = new Date().toISOString().split('T')[0];
    const iibbConf = formulas.iibb;
    const iibbExento = iibbConf?.exentoHasta && hoy <= iibbConf.exentoHasta;
    const iibbAlic = (iibbConf?.activo && !iibbExento) ? (iibbConf.alicuota || 0) : 0;
    const tisshConf = formulas.tissh;
    const tisshAlic = tisshConf?.activo ? (tisshConf.alicuota || 0) : 0;
    const iibb = +(ventasNetas * (iibbAlic / 100)).toFixed(2);
    const tissh = +(ventasNetas * (tisshAlic / 100)).toFixed(2);

    // ==================== RESULTADO DEL AÑO ====================
    // 🔥 v7.16.97: NO restar arancelesAnio — ya están incluidos en costosTotalAnio
    // (costoTotalGanancias de las Facturas A = netoGravado + noGravado)
    const utilidadAntesGanancias = +(ventasNetas - costosTotalAnio - iibb - tissh - impChequeAnio.total).toFixed(2);

    const gananciasAlic = formulas.ganancias?.activo ? (formulas.ganancias.alicuota || 0) : 0;
    const reservaAlic = formulas.reservaLegal?.activo ? (formulas.reservaLegal.alicuota || 0) : 0;

    const gananciasCalculadas = utilidadAntesGanancias > 0 ? +(utilidadAntesGanancias * (gananciasAlic / 100)).toFixed(2) : 0;
    const despuesGanancias = utilidadAntesGanancias - gananciasCalculadas;
    const reservaLegal = despuesGanancias > 0 ? +(despuesGanancias * (reservaAlic / 100)).toFixed(2) : 0;
    const gananciaNetaFinal = +(despuesGanancias - reservaLegal).toFixed(2);

    // ==================== GANANCIAS A PAGAR (con pago a cuenta) ====================
    const impuestoAPagarMayo = Math.max(0, +(gananciasCalculadas - impChequeAnio.total).toFixed(2));

    return `
        <div class="space-y-4 pb-6">
            <!-- 🔥 v7.22.35: banner de estado del año (cerrado/abierto + saldos arrastrados) -->
            ${window.renderBannerEstadoAnio(anioActual)}
            <!-- VENTAS Y COMPRAS -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-teal-600 px-4 py-2 font-bold text-white">
                    💰 Ventas y Compras del Año ${anioActual}
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h3 class="font-bold text-sm text-green-800 dark:text-green-300 mb-2">💵 Ventas</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>Ventas brutas (con IVA):</span><strong>$${formatNumber(ventasBrutas)}</strong></div>
                            <div class="flex justify-between"><span>Ventas netas (sin IVA):</span><strong class="text-green-600">$${formatNumber(ventasNetas)}</strong></div>
                            <div class="flex justify-between"><span>Cantidad facturas:</span><strong>${ventasAnio.length}</strong></div>
                        </div>
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-orange-800 dark:text-orange-300 mb-2">🛒 Compras por tipo de factura</h3>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between"><span>Factura A:</span><strong>$${formatNumber(comprasA)}</strong></div>
                            <div class="flex justify-between"><span>Factura B:</span><strong>$${formatNumber(comprasB)}</strong></div>
                            <div class="flex justify-between"><span>Factura C (deducible):</span><strong class="text-blue-600">$${formatNumber(comprasC)}</strong></div>
                            ${comprasSIN > 0 ? `<div class="flex justify-between"><span>Sin factura:</span><strong>$${formatNumber(comprasSIN)}</strong></div>` : ''}
                            <div class="border-t pt-1 mt-1 flex justify-between"><span>Costo total Ganancias:</span><strong>$${formatNumber(costosTotalAnio)}</strong></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- IVA DEL AÑO -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 font-bold text-white">
                    🧾 IVA del Año ${anioActual}
                </div>
                <div class="p-4 space-y-1 text-sm">
                    <div class="flex justify-between"><span>IVA Ventas (débito fiscal):</span><strong class="text-green-600">+$${formatNumber(ivaVentasAnio)}</strong></div>
                    <div class="flex justify-between"><span>IVA Compras (crédito fiscal):</span><strong class="text-red-600">-$${formatNumber(ivaComprasAnio)}</strong></div>
                    <div class="border-t pt-2 mt-2 flex justify-between font-bold text-base">
                        <span>IVA a pagar (o saldo técnico):</span>
                        <span class="${ivaAPagarAnio >= 0 ? 'text-red-600' : 'text-green-600'}">$${formatNumber(Math.abs(ivaAPagarAnio))}</span>
                    </div>
                </div>
            </div>

            <!-- IMPUESTO AL CHEQUE DEL AÑO -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-4 py-2 font-bold text-white">
                    🏦 Impuesto al Cheque del Año
                </div>
                <div class="p-4 space-y-1 text-sm">
                    <div class="flex justify-between"><span>Débitos (pagos):</span><strong>$${formatNumber(impChequeAnio.debitos)}</strong></div>
                    <div class="flex justify-between"><span>Créditos (cobros):</span><strong>$${formatNumber(impChequeAnio.creditos)}</strong></div>
                    <div class="border-t pt-2 mt-2 flex justify-between font-bold text-base">
                        <span>💰 Total pagado a cuenta:</span>
                        <span class="text-purple-600">$${formatNumber(impChequeAnio.total)}</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-2">💡 Este monto se descuenta del Impuesto a las Ganancias al cierre</p>
                </div>
            </div>

            <!-- RESULTADO DEL AÑO -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-gray-600 to-gray-800 px-4 py-2 font-bold text-white">
                    📊 Resultado del Año
                </div>
                <div class="p-4 space-y-1 text-sm">
                    <div class="flex justify-between"><span>Ventas netas:</span><strong>$${formatNumber(ventasNetas)}</strong></div>
                    <div class="flex justify-between"><span>− Costos (todas las facturas):</span><strong class="text-red-600">-$${formatNumber(costosTotalAnio)}</strong></div>
                    ${arancelesAnio > 0 ? `<div class="flex justify-between"><span>− Aranceles / no gravados:</span><strong class="text-red-600">-$${formatNumber(arancelesAnio)}</strong></div>` : ''}
                    ${iibb > 0 || tissh > 0 
                        ? `<div class="flex justify-between"><span>− IIBB + TISSH:</span><strong class="text-red-600">-$${formatNumber(iibb + tissh)}</strong></div>`
                        : `<div class="flex justify-between"><span class="text-green-600">IIBB + TISSH:</span><strong class="text-green-600">Exento ✅</strong></div>`}
                    <div class="flex justify-between"><span>− Impuesto al cheque:</span><strong class="text-red-600">-$${formatNumber(impChequeAnio.total)}</strong></div>
                    <div class="border-t-2 pt-2 mt-2 flex justify-between font-bold">
                        <span>= Utilidad antes de Ganancias:</span>
                        <strong>$${formatNumber(utilidadAntesGanancias)}</strong>
                    </div>
                    <div class="flex justify-between"><span>− Ganancias (${gananciasAlic}%):</span><strong class="text-red-600">-$${formatNumber(gananciasCalculadas)}</strong></div>
                    <div class="flex justify-between"><span>− Reserva Legal SAS (${reservaAlic}%):</span><strong class="text-red-600">-$${formatNumber(reservaLegal)}</strong></div>
                    <div class="border-t-2 pt-2 mt-2 flex justify-between font-bold text-base bg-green-50 dark:bg-green-900/20 -mx-4 px-4 py-2 rounded-lg">
                        <span>💰 GANANCIA NETA DEL AÑO:</span>
                        <strong class="text-green-600 text-xl">$${formatNumber(gananciaNetaFinal)}</strong>
                    </div>
                </div>
            </div>

            <!-- 🔥 v7.16.80: Compras a Monotributistas No Recurrentes -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2 font-bold text-white">
                    📋 Compras a Monotributistas (No Recurrentes)
                </div>
                <div class="p-4 space-y-3">
                    ${(() => {
                        const porCuit = {};
                        comprasAnio.forEach(c => {
                            const cuit = (c.proveedorCuit || '').replace(/[-\s]/g, '');
                            if (!cuit) return;
                            if (!porCuit[cuit]) porCuit[cuit] = { cuit, nombre: c.proveedorNombre, facturas: [], total: 0 };
                            porCuit[cuit].facturas.push(c);
                            porCuit[cuit].total += c.totalFactura || 0;
                        });

                        const noRecurrentes = [];
                        Object.values(porCuit).forEach(p => {
                            const facturasC = p.facturas.filter(f => f.tipoFactura === 'C');
                            if (facturasC.length > 0 && facturasC.length <= 23) {
                                const totalC = facturasC.reduce((s, f) => s + (f.totalFactura || 0), 0);
                                noRecurrentes.push({
                                    cuit: p.cuit,
                                    nombre: p.nombre,
                                    cantidadFacturas: facturasC.length,
                                    total: totalC
                                });
                            }
                        });

                        if (noRecurrentes.length === 0) {
                            return '<p class="text-sm text-gray-500 text-center py-3">✅ No hay compras a monotributistas no recurrentes este año.</p>';
                        }

                        const totalComprasAnio = comprasAnio.reduce((s, c) => s + (c.totalFactura || 0), 0);
                        const totalMonotribNoRec = noRecurrentes.reduce((s, p) => s + p.total, 0);
                        const limiteIndividual = totalComprasAnio * 0.02;
                        const limiteGlobal = totalComprasAnio * 0.08;

                        const estadoTope = (valor, limite) => {
                            const pct = limite > 0 ? (valor / limite) * 100 : 0;
                            if (pct >= 100) return { icono: '🔴', texto: 'EXCEDIDO', color: 'text-red-600' };
                            if (pct >= 80) return { icono: '🟡', texto: 'CERCA DEL LÍMITE', color: 'text-yellow-600' };
                            return { icono: '🟢', texto: 'DENTRO DEL LÍMITE', color: 'text-green-600' };
                        };

                        let html = '';
                        noRecurrentes.forEach(p => {
                            const estado = estadoTope(p.total, limiteIndividual);
                            html += `
                                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                                    <div class="flex justify-between items-start flex-wrap gap-2 mb-1">
                                        <div>
                                            <strong class="text-sm">${escapeHtml(p.nombre || 'Sin nombre')}</strong>
                                            <span class="text-xs text-gray-500 block">CUIT: ${escapeHtml(p.cuit)}</span>
                                        </div>
                                        <span class="${estado.color} font-bold text-xs">${estado.icono} ${estado.texto}</span>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2 text-xs mt-2">
                                        <div><span class="text-gray-500">Compras del año:</span> <strong>$${formatNumber(p.total)}</strong></div>
                                        <div><span class="text-gray-500">Facturas C:</span> <strong>${p.cantidadFacturas}</strong></div>
                                        <div><span class="text-gray-500">Límite individual (2%):</span> <strong>$${formatNumber(limiteIndividual)}</strong></div>
                                        <div><span class="text-gray-500">Usado:</span> <strong>${limiteIndividual > 0 ? ((p.total / limiteIndividual) * 100).toFixed(1) : 0}%</strong></div>
                                    </div>
                                </div>
                            `;
                        });

                        const estadoGlobal = estadoTope(totalMonotribNoRec, limiteGlobal);

                        html += `
                            <div class="border-t pt-3 mt-3">
                                <h3 class="font-bold text-sm mb-2">💰 Resumen global</h3>
                                <div class="space-y-1 text-sm">
                                    <div class="flex justify-between"><span>Total compras del año:</span><strong>$${formatNumber(totalComprasAnio)}</strong></div>
                                    <div class="flex justify-between"><span>Tope global (8%):</span><strong>$${formatNumber(limiteGlobal)}</strong></div>
                                    <div class="flex justify-between"><span>Total monotributistas no rec.:</span><strong>$${formatNumber(totalMonotribNoRec)}</strong></div>
                                    <div class="flex justify-between font-bold ${estadoGlobal.color}">
                                        <span>Estado:</span><span>${estadoGlobal.icono} ${estadoGlobal.texto}</span>
                                    </div>
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 mt-3 text-center italic">
                                💡 Consultá con tu contador el ajuste final en la DDJJ de Ganancias.
                            </p>
                        `;

                        return html;
                    })()}
                </div>
            </div>

            <!-- IMPUESTO A LAS GANANCIAS A PAGAR -->
            <div class="bg-gradient-to-r from-yellow-500 to-orange-600 rounded-2xl shadow overflow-hidden text-white">
                <div class="px-4 py-2 font-bold">
                    💰 IMPUESTO A LAS GANANCIAS A PAGAR (Mayo ${parseInt(anioActual) + 1})
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 text-gray-800 dark:text-gray-100 space-y-2">
                    <div class="flex justify-between text-base">
                        <span>Ganancias calculadas (${gananciasAlic}%):</span>
                        <strong>$${formatNumber(gananciasCalculadas)}</strong>
                    </div>
                    <div class="flex justify-between text-base">
                        <span>− Impuesto al cheque pagado a cuenta:</span>
                        <strong class="text-purple-600">-$${formatNumber(impChequeAnio.total)}</strong>
                    </div>
                    <div class="border-t-2 pt-3 mt-3 flex justify-between font-bold text-xl bg-yellow-50 dark:bg-yellow-900/20 -mx-4 px-4 py-3 rounded-lg">
                        <span>💵 A PAGAR EN MAYO:</span>
                        <strong class="text-orange-600">$${formatNumber(impuestoAPagarMayo)}</strong>
                    </div>
                    <p class="text-xs text-gray-500 mt-2 text-center">
                        ⚠️ Estimación basada en los datos cargados. Consultá con tu contador antes de presentar la DDJJ.
                    </p>
                </div>
            </div>

            <!-- BOTÓN EXPORTAR -->
            <div class="text-center">
                <button onclick="window.exportarResumenAnualCSV()" class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold">
                    📥 Exportar resumen anual (CSV)
                </button>
            </div>
        </div>
    `;
}

// ==================== CÁLCULO DE GANANCIA NETA DEL MES ====================
function calcularGananciaNetaMes(mes) {
    const db = getDB();

    const ventasMes = db.ventas.filter(v => v.mes === mes);
    const comprasMes = db.compras.filter(c => c.fechaEmision && c.fechaEmision.startsWith(mes));

    // Ventas netas (sin IVA)
    const ventasNetas = ventasMes.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0);

    // Costos
    let costosNetos = 0;    // de facturas A (solo neto gravado + no gravado)
    let costosTotales = 0;  // de facturas B/C/SIN (total)
    let aranceles = 0;      // solo para mostrar (ya incluidos en costosNetos)

    comprasMes.forEach(c => {
        if (c.totales) {
            if (c.ivaComputable) {
                // Factura A: costo = neto gravado + no gravado (el IVA va a crédito fiscal)
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

    // 🔥 v7.16.59: Impuestos MENSUALES (solo los que se pagan cada mes)
    // IIBB (si NO está exento) + TISSH (si aplica)
    const formulas = db.formulas?.componentes || {};
    const hoy = new Date().toISOString().split('T')[0];

    // Verificar si IIBB está exento
    const iibbConf = formulas.iibb;
    const iibbExento = iibbConf?.exentoHasta && hoy <= iibbConf.exentoHasta;
    const iibbAlic = (iibbConf?.activo && !iibbExento) ? (iibbConf.alicuota || 0) : 0;

    const tisshConf = formulas.tissh;
    const tisshAlic = tisshConf?.activo ? (tisshConf.alicuota || 0) : 0;

    const iibb = +(ventasNetas * (iibbAlic / 100)).toFixed(2);
    const tissh = +(ventasNetas * (tisshAlic / 100)).toFixed(2);

    // Impuesto al cheque del mes
    const impCheque = calcularImpuestoChequeMes(mes);

    // IVA del mes (débito - crédito)
    const ivaMes = calcularIVAMes(mes);
    const ivaAPagar = Math.max(0, ivaMes.ivaAPagar);

    // 🔥 v7.16.60: GANANCIA REAL DEL MES (cálculo correcto)
    // IMPORTANTE:
    // - ventasNetas ($39.669,42) ya tiene el IVA descontado
    // - El IVA NO se resta como gasto (se traslada al cliente)
    // - El impuesto al cheque SÍ se resta (es costo real)
    // - El costo de compra con Factura C es el total (no hay IVA computable)
    //
    // Fórmula: Ventas netas - Costos - IIBB - TISSH - Imp. cheque
    // = plata que te queda después de pagarle a AFIP el IVA
    const gananciaRealMes = +(ventasNetas - costosNetos - costosTotales
        - iibb - tissh - impCheque.total).toFixed(2);

    // 🔥 v7.16.59: Proyección ANUAL (con Ganancias + Reserva Legal)
    const gananciasAlic = formulas.ganancias?.activo ? (formulas.ganancias.alicuota || 0) : 0;
    const reservaAlic = formulas.reservaLegal?.activo ? (formulas.reservaLegal.alicuota || 0) : 0;

    // Utilidad antes de Ganancias (para el cálculo anual)
    const utilidadAntesAnual = +(ventasNetas - costosNetos - costosTotales
        - iibb - tissh - impCheque.total).toFixed(2);

    const ganancias = utilidadAntesAnual > 0 ? +(utilidadAntesAnual * (gananciasAlic / 100)).toFixed(2) : 0;
    const despues = utilidadAntesAnual - ganancias;
    const reservaLegal = despues > 0 ? +(despues * (reservaAlic / 100)).toFixed(2) : 0;
    const gananciaNetaAnualProyectada = +(despues - reservaLegal).toFixed(2);

    return {
        ventasNetas: +ventasNetas.toFixed(2),
        costosNetos: +costosNetos.toFixed(2),
        costosTotales: +costosTotales.toFixed(2),
        aranceles: +aranceles.toFixed(2),
        iibb,
        tissh,
        iibbExento: !!iibbExento,
        impCheque: impCheque.total,
        ivaAPagar: +ivaAPagar.toFixed(2),
        gananciaRealMes,               // 🔥 GANANCIA REAL DEL MES
        utilidadAntesGanancias: utilidadAntesAnual,
        ganancias,
        reservaLegal,
        gananciaNetaAnualProyectada    // 🔥 Proyección anual
    };
}

// ==================== HELPERS ====================
function obtenerUltimosMeses(cantidad) {
    const meses = [];
    const hoy = new Date();
    for (let i = cantidad - 1; i >= 0; i--) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        meses.push(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
    }
    return meses;
}

function obtenerProximosVencimientos(db) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const items = [];

    // Cobros pendientes
    db.ventas
        .filter(v => v.estado !== 'cobrado' && v.fechaCobroEsperada)
        .forEach(v => {
            const dias = Math.ceil((new Date(v.fechaCobroEsperada) - hoy) / (1000 * 60 * 60 * 24));
            if (dias >= -30 && dias <= 30) {
                items.push({
                    tipo: 'Cobro',
                    desc: `${v.clienteNombre} - Fact. ${v.numComprobante || ''}`,
                    monto: v.total,
                    fecha: v.fechaCobroEsperada,
                    dias
                });
            }
        });

    // Pagos pendientes
    db.compras
        .filter(c => c.estadoPago !== 'PAGADO' && c.fechaVencimientoPago)
        .forEach(c => {
            const dias = Math.ceil((new Date(c.fechaVencimientoPago) - hoy) / (1000 * 60 * 60 * 24));
            if (dias >= -30 && dias <= 30) {
                items.push({
                    tipo: 'Pago',
                    desc: `${c.proveedorNombre} - Fact. ${c.numeroFactura || ''}`,
                    monto: c.totalFactura,
                    fecha: c.fechaVencimientoPago,
                    dias
                });
            }
        });

    // Costos fijos
    db.costosFijos
        .filter(c => c.estado === 'pendiente' && c.vencimiento)
        .forEach(c => {
            const dias = Math.ceil((new Date(c.vencimiento) - hoy) / (1000 * 60 * 60 * 24));
            if (dias >= -30 && dias <= 30) {
                items.push({
                    tipo: 'Costo Fijo',
                    desc: c.nombre,
                    monto: c.monto,
                    fecha: c.vencimiento,
                    dias
                });
            }
        });

    if (items.length === 0) {
        return '<div class="p-8 text-center text-gray-400">✅ No hay vencimientos próximos</div>';
    }

    items.sort((a, b) => a.dias - b.dias);
    return items.slice(0, 5).map(item => `
        <div class="p-3 flex justify-between items-center ${item.dias < 0 ? 'bg-red-50 dark:bg-red-900/20' : item.dias <= 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}">
            <div>
                <p class="font-medium text-sm">${item.tipo}: ${escapeHtml(item.desc)}</p>
                <p class="text-xs text-gray-500">${formatDate(item.fecha)}</p>
            </div>
            <div class="text-right">
                <p class="font-bold ${item.tipo === 'Cobro' ? 'text-green-600' : 'text-red-600'}">
                    ${item.tipo === 'Cobro' ? '+' : '-'}$${formatNumber(item.monto)}
                </p>
                <p class="text-xs ${item.dias < 0 ? 'text-red-600' : item.dias <= 3 ? 'text-orange-600' : 'text-gray-500'}">
                    ${item.dias < 0 ? `Vencido hace ${Math.abs(item.dias)}d` : item.dias === 0 ? 'Hoy' : `En ${item.dias}d`}
                </p>
            </div>
        </div>
    `).join('');
}

// ==================== EVENTOS E INICIALIZACIÓN ====================
export function initDashboardEvents() {
    setTimeout(() => {
        const canvas = document.getElementById('chartEvolucionContable');
        if (!canvas) return;

        const db = getDB();
        const meses = obtenerUltimosMeses(6);

        const labels = meses.map(m => {
            const [anio, mes] = m.split('-');
            const nombreMes = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mes) - 1];
            return `${nombreMes} ${anio.substring(2)}`;
        });

        const dataCaja = meses.map(m => {
            const movsMes = (db.movimientos || []).filter(x => x.mes === m);
            return movsMes.reduce((s, x) => s + (x.tipo === 'ingreso' ? x.montoNeto : -x.montoNeto), 0);
        });

        const dataVentas = meses.map(m =>
            db.ventas.filter(v => v.mes === m).reduce((s, v) => s + (v.total || 0), 0)
        );

        const dataIVA = meses.map(m => calcularIVAMes(m).ivaAPagar);

        const ctx = canvas.getContext('2d');
        if (window._chartEvolucionContable) window._chartEvolucionContable.destroy();
        window._chartEvolucionContable = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Caja real',
                        data: dataCaja,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Ventas',
                        data: dataVentas,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        tension: 0.3,
                        fill: false
                    },
                    {
                        label: 'IVA a pagar',
                        data: dataIVA,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        tension: 0.3,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: $${formatNumber(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => '$' + formatNumber(v) }
                    }
                }
            }
        });
    }, 400);
}

// ==================== 🔥 v7.16.61: CAMBIAR TAB DASHBOARD ====================
window.cambiarTabDashboard = (tab) => {
    localStorage.setItem('dashboardTab', tab);
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== 🔥 v7.16.61: EXPORTAR RESUMEN ANUAL CSV ====================
window.exportarResumenAnualCSV = () => {
    const db = getDB();
    const anioActual = new Date().getFullYear().toString();

    const ventasAnio = (db.ventas || []).filter(v => v.mes && v.mes.startsWith(anioActual));
    const comprasAnio = (db.compras || []).filter(c => c.fechaEmision && c.fechaEmision.startsWith(anioActual));
    const ventasBrutas = ventasAnio.reduce((s, v) => s + (v.total || 0), 0);
    const ventasNetas = ventasAnio.reduce((s, v) => s + (v.montoNeto || (v.total / 1.21)) || 0, 0);

    let comprasA = 0, comprasB = 0, comprasC = 0, comprasSIN = 0, costosTotal = 0;
    comprasAnio.forEach(c => {
        const tipo = c.tipoFactura || 'SIN';
        const total = c.totalFactura || 0;
        if (tipo === 'A') comprasA += total;
        else if (tipo === 'B') comprasB += total;
        else if (tipo === 'C') comprasC += total;
        else comprasSIN += total;
        costosTotal += c.totales?.costoTotalGanancias || (c.ivaDescontable ? (c.montoNeto || 0) : total);
    });

    const ivaVentas = ventasAnio.reduce((s, v) => s + (v.ivaMonto || 0), 0);
    const ivaCompras = comprasAnio.filter(c => c.ivaDescontable).reduce((s, c) => s + (c.ivaMonto || 0), 0);
    const impCheque = calcularImpuestoChequeAnual(anioActual);

    const formulas = db.formulas?.componentes || {};
    const utilidadAntes = +(ventasNetas - costosTotal - impCheque.total).toFixed(2);
    const gananciasAlic = formulas.ganancias?.alicuota || 25;
    const reservaAlic = formulas.reservaLegal?.alicuota || 5;
    const ganancias = utilidadAntes > 0 ? +(utilidadAntes * (gananciasAlic / 100)).toFixed(2) : 0;
    const reservaLegal = utilidadAntes > 0 ? +((utilidadAntes - ganancias) * (reservaAlic / 100)).toFixed(2) : 0;
    const impuestoAPagar = Math.max(0, +(ganancias - impCheque.total).toFixed(2));

    let csv = 'RESUMEN FISCAL ANUAL ' + anioActual + '\n\n';
    csv += 'CONCEPTO,MONTO\n';
    csv += '"Ventas brutas (con IVA)",' + ventasBrutas + '\n';
    csv += '"Ventas netas (sin IVA)",' + ventasNetas + '\n';
    csv += '"Compras Factura A",' + comprasA + '\n';
    csv += '"Compras Factura B",' + comprasB + '\n';
    csv += '"Compras Factura C",' + comprasC + '\n';
    csv += '"Compras Sin Factura",' + comprasSIN + '\n';
    csv += '"Costo total para Ganancias",' + costosTotal + '\n\n';
    csv += '"IVA Ventas (débito fiscal)",' + ivaVentas + '\n';
    csv += '"IVA Compras (crédito fiscal)",' + ivaCompras + '\n';
    csv += '"IVA a pagar",' + (ivaVentas - ivaCompras) + '\n\n';
    csv += '"Impuesto al cheque - Débitos",' + impCheque.debitos + '\n';
    csv += '"Impuesto al cheque - Créditos",' + impCheque.creditos + '\n';
    csv += '"Impuesto al cheque - Total pago a cuenta",' + impCheque.total + '\n\n';
    csv += '"Utilidad antes de Ganancias",' + utilidadAntes + '\n';
    csv += '"Ganancias calculadas (' + gananciasAlic + '%)",' + ganancias + '\n';
    csv += '"Reserva Legal (' + reservaAlic + '%)",' + reservaLegal + '\n';
    csv += '"IMPUESTO A LAS GANANCIAS A PAGAR",' + impuestoAPagar + '\n';

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resumen_anual_' + anioActual + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    mostrarNotificacion('📥 Resumen anual exportado', 'success');
};


// ==================== 🔥 v7.22.35: CALCULAR SNAPSHOT ANUAL ====================

/**
 * Calcula todos los valores del año fiscal para guardar en el cierre.
 * @param {string|number} anio - Año fiscal (ej: 2026)
 * @returns {object} - Snapshot con todos los cálculos del año
 */
function calcularSnapshotAnual(anio) {
    const db = getDB();
    const anioStr = String(anio);
    const ventasAnio = (db.ventas || []).filter(v => (v.fechaVenta || v.fecha || '').startsWith(anioStr));
    const comprasAnio = (db.compras || []).filter(c => (c.fechaEmision || c.fecha || '').startsWith(anioStr));
    const movsAnio = (db.movimientos || []).filter(m => (m.fecha || '').startsWith(anioStr));
    
    // Ventas
    const ventasBrutas = ventasAnio.reduce((s, v) => s + (v.total || 0), 0);
    const ventasNetas = +(ventasBrutas / 1.21).toFixed(2);
    
    // Compras por tipo
    const comprasA = comprasAnio.filter(c => c.tipoFactura === 'A');
    const comprasB = comprasAnio.filter(c => c.tipoFactura === 'B');
    const comprasC = comprasAnio.filter(c => c.tipoFactura === 'C' || c.tipoFactura === 'SIN');
    
    const facturaA = comprasA.reduce((s, c) => s + (c.total || 0), 0);
    const facturaB = comprasB.reduce((s, c) => s + (c.total || 0), 0);
    const facturaC = comprasC.reduce((s, c) => s + (c.total || 0), 0);
    
    // IVA
    const ivaVentas = +(ventasBrutas - ventasNetas).toFixed(2);
    const ivaCompras = +(facturaA - (facturaA / 1.21)).toFixed(2);
    const ivaAPagar = +(ivaVentas - ivaCompras).toFixed(2);
    const saldoTecnico = ivaAPagar < 0 ? Math.abs(ivaAPagar) : 0;
    
    // Impuesto al Cheque
    const impDebitos = movsAnio.filter(m => m.tipo === 'egreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    const impCreditos = movsAnio.filter(m => m.tipo === 'ingreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    const impTotal = +(impDebitos + impCreditos).toFixed(2);
    
    // IIBB + TISSH
    const iibb = +(ventasNetas * 0.036).toFixed(2);
    const tissh = +(ventasNetas * 0.005).toFixed(2);
    
    // Ganancias
    const costoGanancias = facturaA - ivaCompras + facturaB + facturaC;
    const aranceles = 0;
    const utilidadAntes = +(ventasNetas - costoGanancias - aranceles - iibb - tissh - impTotal).toFixed(2);
    const ganancias = +(utilidadAntes * 0.25).toFixed(2);
    const reservaLegal = +(utilidadAntes * 0.05).toFixed(2);
    const gananciaNeta = +(utilidadAntes - ganancias - reservaLegal).toFixed(2);
    
    // Impuesto a las Ganancias a pagar (con descuento de impuesto al cheque)
    const impuestoGananciasAPagar = +(ganancias - impTotal).toFixed(2);
    
    return {
        anio: anioStr,
        fechaCierre: hoyISO(),
        ventas: { brutas: ventasBrutas, netas: ventasNetas, cantidad: ventasAnio.length },
        compras: { facturaA, facturaB, facturaC, total: +(facturaA + facturaB + facturaC).toFixed(2), costoGanancias: +costoGanancias.toFixed(2) },
        iva: { ivaVentas, ivaCompras, ivaAPagar, saldoTecnico },
        impuestoCheque: { debitos: +impDebitos.toFixed(2), creditos: +impCreditos.toFixed(2), total: impTotal },
        iibb, tissh,
        ganancias: { utilidadAntes, ganancias, reservaLegal, gananciaNeta },
        impuestoGananciasAPagar
    };
}

// ==================== 🔥 v7.17.3: FUNCIONES DE COSTOS FIJOS DESDE DASHBOARD ====================

// Redirige a Configuración → Costos Fijos y abre el modal de edición
window.irACostosFijos = (costoId) => {
    window.showView('configuracion');
    setTimeout(() => {
        const tab = document.querySelector('[data-tab="costos-fijos"]');
        if (tab) tab.click();
        setTimeout(() => {
            if (window.editarCostoFijo) window.editarCostoFijo(costoId);
        }, 300);
    }, 200);
};

// Marca como pagado y crea movimiento de egreso
window.pagarCostoFijoDesdeDashboard = async (costoId) => {
    const confirmado = await confirmarAccion({
        titulo: '✅ Pagar costo fijo',
        mensaje: '¿Marcar como pagado y crear movimiento de egreso en tesorería?',
        textoConfirmar: '✅ Sí, pagar',
        icono: '💰'
    });
    if (!confirmado) return;
    if (window.pagarCostoFijo) {
        window.pagarCostoFijo(costoId);
        window.dispatchEvent(new Event('refreshView'));
    } else {
        mostrarNotificacion('Función pagarCostoFijo no disponible', 'error');
    }
};

// Recargar costo fijo vencido (marca el viejo como vencido y crea uno nuevo con monto actualizado)
window.recargarCostoFijo = (costoId) => {
    const db = getDB();
    const costo = db.costosFijos.find(c => String(c.id) === String(costoId));
    if (!costo) { mostrarNotificacion('Costo fijo no encontrado', 'error'); return; }

    const nuevoMonto = prompt(`Monto actualizado para "${costo.nombre}" (con recargo por mora):`, costo.monto);
    if (nuevoMonto === null) return;

    const monto = parseFloat(nuevoMonto);
    if (isNaN(monto) || monto <= 0) {
        mostrarNotificacion('Monto inválido', 'error');
        return;
    }

    // Marcar el viejo como vencido
    costo.estado = 'vencido';

    // Crear uno nuevo con el mismo nombre pero monto actualizado
    const hoy = new Date();
    const nuevoVencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, costo.diaVencimiento || 1);

    db.costosFijos.push({
        id: generarId(),
        nombre: costo.nombre,
        monto: monto,
        vencimiento: dateToISO(nuevoVencimiento),
        estado: 'pendiente',
        categoria: costo.categoria || '',
        recurrente: true,
        diaVencimiento: costo.diaVencimiento || 1
    });

    guardarDB();
    mostrarNotificacion(`✅ Costo fijo recargado: ${costo.nombre} - $${formatNumber(monto)}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== 🔥 v7.22.35: CIERRE ANUAL ====================

/**
 * Cierra el año fiscal: toma snapshot, guarda en db.cierresAnuales[] y genera PDF.
 */
window.cerrarAnioFiscal = async (anio) => {
    const db = getDB();
    const anioStr = String(anio);
    const ventasAnio = (db.ventas || []).filter(v => (v.fechaVenta || v.fecha || '').startsWith(anioStr));
    
    if (ventasAnio.length === 0) {
        mostrarNotificacion(`No hay datos del año ${anioStr} para cerrar`, 'warning');
        return;
    }
    
    const confirmado = await confirmarAccion({
        titulo: `🔒 Cerrar Año Fiscal ${anioStr}`,
        mensaje: `Se va a generar un <strong>snapshot</strong> de todos los cálculos del año ${anioStr} y se va a guardar como cierre anual.<br><br>` +
            `<strong>Ventas del año:</strong> ${ventasAnio.length}<br><br>` +
            `Los datos <strong>NO se borran</strong>. Podés seguir consultándolos, pero queda registrado el cierre.`,
        textoConfirmar: `🔒 Sí, cerrar ${anioStr}`,
        icono: '🔒'
    });
    if (!confirmado) return;
    
    try {
        const snapshot = calcularSnapshotAnual(anioStr);
        guardarCierreAnual(anioStr, snapshot);
        mostrarNotificacion(`🔒 Año ${anioStr} cerrado correctamente`, 'success');
        
        // Generar PDF automáticamente
        window.descargarPDFCierreAnual(anioStr);
        
        window.dispatchEvent(new Event('refreshView'));
    } catch (err) {
        console.error('Error al cerrar año:', err);
        mostrarNotificacion('Error al cerrar año: ' + err.message, 'error');
    }
};

/**
 * Reabre el año fiscal: elimina el cierre anual (con confirmación doble).
 */
window.reabrirAnioFiscal = async (anio) => {
    const anioStr = String(anio);
    const cierre = getCierreAnual(anioStr);
    if (!cierre) {
        mostrarNotificacion(`El año ${anioStr} no está cerrado`, 'warning');
        return;
    }
    
    const confirmado1 = await confirmarAccion({
        titulo: `🔓 Reabrir Año Fiscal ${anioStr} - Confirmación 1`,
        mensaje: `El año ${anioStr} fue cerrado el <strong>${formatDate(cierre.fechaCierre)}</strong>.<br><br>` +
            `Al reabrirlo, se <strong>elimina el snapshot</strong> del cierre anual.<br><br>` +
            `¿Continuar?`,
        textoConfirmar: '🔓 Sí, continuar',
        icono: '🔓'
    });
    if (!confirmado1) return;
    
    const confirmado2 = await confirmarAccion({
        titulo: '🚨 CONFIRMACIÓN FINAL',
        mensaje: `Se va a eliminar el cierre del año ${anioStr}.<br><br><strong>¿Estás 100% seguro?</strong>`,
        textoConfirmar: '🚨 SÍ, REABRIR',
        icono: '🚨'
    });
    if (!confirmado2) return;
    
    const db = getDB();
    db.cierresAnuales = (db.cierresAnuales || []).filter(c => String(c.anio) !== anioStr);
    guardarDB();
    mostrarNotificacion(`🔓 Año ${anioStr} reabierto`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

/**
 * Genera y descarga el PDF del cierre anual.
 */
window.descargarPDFCierreAnual = (anio) => {
    const anioStr = String(anio);
    const cierre = getCierreAnual(anioStr);
    if (!cierre) {
        mostrarNotificacion(`El año ${anioStr} no está cerrado`, 'warning');
        return;
    }
    
    const s = cierre.snapshot;
    const empresa = getDB().datosEmpresa || {};
    
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cierre Anual ${anioStr}</title>
<style>
body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
h1 { border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
h2 { color: #2563eb; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
table { width: 100%; border-collapse: collapse; margin: 15px 0; }
th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
th { background: #f3f4f6; font-weight: bold; }
.total { font-weight: bold; background: #f9fafb; }
.destacado { font-size: 1.3em; color: #059669; font-weight: bold; }
.firma { margin-top: 60px; border-top: 1px solid #333; width: 300px; padding-top: 10px; }
.header { display: flex; justify-content: space-between; margin-bottom: 20px; }
</style>
</head>
<body>
<div class="header">
    <div>
        <h1>${empresa.nombre || 'ERP Contable'}</h1>
        <p>CUIT: ${empresa.cuit || '-'}</p>
        <p>Condición IVA: ${empresa.condicionIVA || '-'}</p>
    </div>
    <div style="text-align: right;">
        <p><strong>Cierre Anual ${anioStr}</strong></p>
        <p>Fecha de cierre: ${formatDate(cierre.fechaCierre)}</p>
    </div>
</div>

<h2>📊 Resumen Ejecutivo</h2>
<table>
<tr><th>Concepto</th><th>Monto</th></tr>
<tr><td>Ventas brutas (con IVA)</td><td>$${formatNumber(s.ventas.brutas)}</td></tr>
<tr><td>Ventas netas (sin IVA)</td><td>$${formatNumber(s.ventas.netas)}</td></tr>
<tr><td>Cantidad de facturas</td><td>${s.ventas.cantidad}</td></tr>
<tr class="total"><td>Ganancia neta del año</td><td class="destacado">$${formatNumber(s.ganancias.gananciaNeta)}</td></tr>
</table>

<h2>🛒 Compras por tipo de factura</h2>
<table>
<tr><th>Tipo</th><th>Monto</th></tr>
<tr><td>Factura A</td><td>$${formatNumber(s.compras.facturaA)}</td></tr>
<tr><td>Factura B</td><td>$${formatNumber(s.compras.facturaB)}</td></tr>
<tr><td>Factura C (deducible)</td><td>$${formatNumber(s.compras.facturaC)}</td></tr>
<tr class="total"><td>Costo total Ganancias</td><td>$${formatNumber(s.compras.costoGanancias)}</td></tr>
</table>

<h2>🧾 IVA del Año</h2>
<table>
<tr><th>Concepto</th><th>Monto</th></tr>
<tr><td>IVA Ventas (débito fiscal)</td><td>+$${formatNumber(s.iva.ivaVentas)}</td></tr>
<tr><td>IVA Compras (crédito fiscal)</td><td>-$${formatNumber(s.iva.ivaCompras)}</td></tr>
<tr class="total"><td>IVA a pagar</td><td>$${formatNumber(s.iva.ivaAPagar)}</td></tr>
${s.iva.saldoTecnico > 0 ? `<tr><td>Saldo técnico a favor</td><td class="destacado">$${formatNumber(s.iva.saldoTecnico)}</td></tr>` : ''}
</table>

<h2>🏦 Impuesto al Cheque</h2>
<table>
<tr><th>Concepto</th><th>Monto</th></tr>
<tr><td>Débitos (pagos)</td><td>$${formatNumber(s.impuestoCheque.debitos)}</td></tr>
<tr><td>Créditos (cobros)</td><td>$${formatNumber(s.impuestoCheque.creditos)}</td></tr>
<tr class="total"><td>Total pagado a cuenta</td><td>$${formatNumber(s.impuestoCheque.total)}</td></tr>
</table>

<h2>📊 Resultado del Año</h2>
<table>
<tr><th>Concepto</th><th>Monto</th></tr>
<tr><td>Ventas netas</td><td>$${formatNumber(s.ventas.netas)}</td></tr>
<tr><td>− Costos (todas las facturas)</td><td>-$${formatNumber(s.compras.costoGanancias)}</td></tr>
<tr><td>− IIBB</td><td>-$${formatNumber(s.iibb)}</td></tr>
<tr><td>− TISSH</td><td>-$${formatNumber(s.tissh)}</td></tr>
<tr><td>− Impuesto al cheque</td><td>-$${formatNumber(s.impuestoCheque.total)}</td></tr>
<tr class="total"><td>= Utilidad antes de Ganancias</td><td>$${formatNumber(s.ganancias.utilidadAntes)}</td></tr>
<tr><td>− Ganancias (25%)</td><td>-$${formatNumber(s.ganancias.ganancias)}</td></tr>
<tr><td>− Reserva Legal SAS (5%)</td><td>-$${formatNumber(s.ganancias.reservaLegal)}</td></tr>
<tr class="total"><td>💰 GANANCIA NETA DEL AÑO</td><td class="destacado">$${formatNumber(s.ganancias.gananciaNeta)}</td></tr>
</table>

<h2>💵 Impuesto a las Ganancias a Pagar</h2>
<table>
<tr><th>Concepto</th><th>Monto</th></tr>
<tr><td>Ganancias calculadas (25%)</td><td>$${formatNumber(s.ganancias.ganancias)}</td></tr>
<tr><td>− Impuesto al cheque pagado a cuenta</td><td>-$${formatNumber(s.impuestoCheque.total)}</td></tr>
<tr class="total"><td>A PAGAR</td><td class="destacado">$${formatNumber(s.impuestoGananciasAPagar)}</td></tr>
</table>

<div class="firma">
    <p>Firma del contador</p>
    <p style="font-size: 0.8em; color: #666;">Cierre generado el ${formatDate(hoyISO())}</p>
</div>

</body>
</html>`;
    
    // Abrir en nueva ventana para imprimir/guardar como PDF
    const ventana = window.open('', '_blank');
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
};

// ==================== 🔥 v7.22.35: BANNER DE ESTADO DEL AÑO ====================

/**
 * Genera el HTML del banner de estado del año (cerrado/abierto).
 */
window.renderBannerEstadoAnio = (anio) => {
    const anioStr = String(anio);
    const cierre = getCierreAnual(anioStr);
    
    if (cierre) {
        return `
            <div class="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-2xl p-4 mb-4">
                <div class="flex justify-between items-center flex-wrap gap-3">
                    <div>
                        <p class="font-bold text-blue-800 dark:text-blue-200">🔒 Año ${anioStr} cerrado</p>
                        <p class="text-sm text-blue-600 dark:text-blue-300">Cerrado el ${formatDate(cierre.fechaCierre)}</p>
                    </div>
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="window.descargarPDFCierreAnual(${anioStr})" class="bg-blue-600 text-white px-3 py-1 rounded-xl text-sm">📄 Descargar PDF</button>
                        <button onclick="window.reabrirAnioFiscal(${anioStr})" class="bg-orange-600 text-white px-3 py-1 rounded-xl text-sm">🔓 Reabrir año</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Verificar si hay saldos arrastrados del año anterior
    const saldos = obtenerSaldosArrastrados(anioStr);
    const bannerSaldos = saldos ? `
        <div class="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-2xl p-4 mb-4">
            <p class="font-bold text-green-800 dark:text-green-200">📊 Saldos arrastrados del año ${saldos.anioOrigen}</p>
            <p class="text-sm text-green-600 dark:text-green-300">
                ${saldos.ivaAFavor > 0 ? `• IVA a favor: $${formatNumber(saldos.ivaAFavor)}<br>` : ''}
                ${saldos.impuestoChequeAcumulado > 0 ? `• Impuesto al Cheque acumulado: $${formatNumber(saldos.impuestoChequeAcumulado)}<br>` : ''}
            </p>
        </div>
    ` : '';
    
    return `
        ${bannerSaldos}
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-2xl p-4 mb-4">
            <div class="flex justify-between items-center flex-wrap gap-3">
                <div>
                    <p class="font-bold text-yellow-800 dark:text-yellow-200">🔓 Año ${anioStr} abierto</p>
                    <p class="text-sm text-yellow-600 dark:text-yellow-300">Podés cerrar el año para guardar un snapshot de todos los cálculos.</p>
                </div>
                <button onclick="window.cerrarAnioFiscal(${anioStr})" class="bg-yellow-600 text-white px-3 py-1 rounded-xl text-sm">🔒 Cerrar Año ${anioStr}</button>
            </div>
        </div>
    `;
};
