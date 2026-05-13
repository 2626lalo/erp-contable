// ==================== modules/gastosPersonales.js ====================
// GASTOS PERSONALES - Con fechas DD/MM/YYYY y sistema de cuotas avanzado

import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml } from './utils.js';

// Formatear fecha DD/MM/YYYY
function formatFecha(fecha) {
    if (!fecha) return '';
    if (fecha.includes('/')) return fecha;
    const partes = fecha.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fecha;
}

// Convertir fecha DD/MM/YYYY a YYYY-MM-DD para storage
function fechaToStorage(fecha) {
    if (!fecha) return '';
    if (fecha.includes('-')) return fecha;
    const partes = fecha.split('/');
    if (partes.length === 3) {
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    return fecha;
}

// Obtener fecha actual en DD/MM/YYYY
function getFechaActual() {
    const hoy = new Date();
    return `${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth() + 1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;
}

// Obtener mes en formato YYYY-MM desde fecha DD/MM/YYYY
function getMesFromFecha(fecha) {
    const partes = fecha.split('/');
    if (partes.length === 3) {
        return `${partes[2]}-${partes[1].padStart(2, '0')}`;
    }
    return new Date().toISOString().substring(0, 7);
}

const CATEGORIAS_POR_DEFECTO = [
    "🏠 Vivienda", "🚗 Transporte", "🍕 Alimentación", "🛍️ Compras", "🎮 Entretenimiento",
    "🏥 Salud", "📚 Educación", "👕 Vestimenta", "📱 Servicios", "💰 Ahorros",
    "🏦 Tarjetas", "💳 Cuotas", "🎁 Regalos", "🐾 Mascotas", "✈️ Viajes", "💼 Trabajo"
];

function getEstructuraInicial() {
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    
    return {
        tarjetas: [],
        gastos: [],
        cuotas: [],
        categorias: [...CATEGORIAS_POR_DEFECTO],
        ingresosMensuales: 0,
        ahorroObjetivo: 0,
        presupuestoPorCategoria: {},
        historialMensual: [],
        configuracion: {
            mostrarResumenEnDashboard: true,
            recordatorios: true,
            alertaGastosAlto: 80
        }
    };
}

function cargarGastosPersonales() {
    try {
        const guardado = localStorage.getItem('gastosPersonales');
        if (guardado) {
            const data = JSON.parse(guardado);
            if (!data.categorias) data.categorias = [...CATEGORIAS_POR_DEFECTO];
            if (data.tarjetas) {
                data.tarjetas = data.tarjetas.map(t => ({
                    ...t,
                    cashbackPorcentaje: t.cashbackPorcentaje || 0,
                    saldoDisponible: t.saldoDisponible || 0,
                    movimientos: t.movimientos || []
                }));
            }
            if (data.cuotas) {
                data.cuotas = data.cuotas.map(c => ({
                    ...c,
                    fechasPago: c.fechasPago || [],
                    pagosRealizados: c.pagosRealizados || []
                }));
            }
            return data;
        }
    } catch(e) {}
    return getEstructuraInicial();
}

function guardarGastosPersonales(data) {
    localStorage.setItem('gastosPersonales', JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('gastosActualizados'));
    return true;
}

// Calcular proyección de cuotas mes a mes
function calcularProyeccionCuota(cuota, mesInicio) {
    const proyeccion = [];
    let fecha = new Date(mesInicio + '-01');
    
    for (let i = 0; i < cuota.cuotasRestantes; i++) {
        const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        proyeccion.push({
            mes: mes,
            mesNombre: `${fecha.getMonth() + 1}/${fecha.getFullYear()}`,
            monto: cuota.montoCuota,
            esProximo: i === 0,
            pagada: cuota.pagosRealizados?.some(p => p.mes === mes)
        });
        fecha.setMonth(fecha.getMonth() + 1);
    }
    return proyeccion;
}

export function renderGastosPersonales() {
    const data = cargarGastosPersonales();
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const totalGastosMes = calcularTotalGastosMes(data, mesActual);
    const totalCuotasMes = calcularTotalCuotasMes(data, mesActual);
    const disponible = data.ingresosMensuales - totalGastosMes - totalCuotasMes;
    const ahorro = Math.max(0, disponible);
    const saldoTotalTarjetas = data.tarjetas.reduce((sum, t) => sum + (t.saldoDisponible || 0), 0);
    const deudaTotalCuotas = data.cuotas.filter(c => c.estado === 'pendiente').reduce((sum, c) => sum + (c.montoCuota * c.cuotasRestantes), 0);
    
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">💰 Gastos Personales</h1>
                <div class="flex gap-2">
                    <button onclick="window.mostrarModalGasto()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm">+ Nuevo Gasto</button>
                    <button onclick="window.mostrarModalTarjeta()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm">+ Tarjeta</button>
                    <button onclick="window.mostrarModalCategorias()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm">📋 Categorías</button>
                </div>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-3 text-white">
                    <p class="text-xs opacity-90">💰 Ingresos</p>
                    <p class="text-xl font-bold">${formatNumber(data.ingresosMensuales)}</p>
                    <button onclick="window.mostrarModalIngresos()" class="text-xs underline">Editar</button>
                </div>
                <div class="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-3 text-white">
                    <p class="text-xs opacity-90">💸 Gastos + Cuotas</p>
                    <p class="text-xl font-bold">${formatNumber(totalGastosMes + totalCuotasMes)}</p>
                </div>
                <div class="bg-gradient-to-r from-orange-600 to-orange-700 rounded-2xl p-3 text-white">
                    <p class="text-xs opacity-90">💳 Deuda Total Cuotas</p>
                    <p class="text-xl font-bold">${formatNumber(deudaTotalCuotas)}</p>
                </div>
                <div class="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-3 text-white">
                    <p class="text-xs opacity-90">📊 Disponible</p>
                    <p class="text-xl font-bold ${disponible >= 0 ? 'text-green-300' : 'text-red-300'}">${formatNumber(disponible)}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                    <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2">
                        <h2 class="font-bold text-white">📊 Gastos por Categoría</h2>
                    </div>
                    <div class="p-3 max-h-64 overflow-y-auto">
                        ${renderizarGastosPorCategoria(data, mesActual)}
                    </div>
                </div>
                
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                    <div class="bg-gradient-to-r from-green-500 to-teal-600 px-4 py-2">
                        <h2 class="font-bold text-white">💳 Tarjetas</h2>
                    </div>
                    <div class="p-3 max-h-64 overflow-y-auto">
                        ${renderizarTarjetas(data)}
                    </div>
                </div>
            </div>
            
            <!-- Cuotas activas con proyección -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2">
                    <h2 class="font-bold text-white">📆 Cuotas Activas - Proyección de Pagos</h2>
                </div>
                <div class="p-3">
                    ${renderizarCuotasActivas(data)}
                </div>
            </div>
            
            <!-- Últimos gastos -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-gray-600 to-gray-800 px-4 py-2">
                    <h2 class="font-bold text-white">📋 Últimos Gastos</h2>
                </div>
                <div class="p-3">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50 dark:bg-gray-900">
                                <tr><th class="px-3 py-2 text-left text-xs">Fecha</th><th class="px-3 py-2 text-left text-xs">Concepto</th><th class="px-3 py-2 text-left text-xs">Categoría</th><th class="px-3 py-2 text-right text-xs">Monto</th><th class="px-3 py-2 text-center text-xs"></th></tr>
                            </thead>
                            <tbody>
                                ${renderizarListaGastos(data, mesActual)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <div class="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl p-4 text-white">
                <div class="flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <p class="text-sm opacity-90">💰 AHORRO DEL MES</p>
                        <p class="text-2xl font-bold">${formatNumber(ahorro)}</p>
                        <p class="text-xs">Objetivo: ${formatNumber(data.ahorroObjetivo)}</p>
                    </div>
                    <button onclick="window.mostrarModalAhorro()" class="bg-white/20 px-3 py-1 rounded-xl text-sm">🎯 Editar</button>
                </div>
                <div class="mt-2 h-2 bg-white/30 rounded-full overflow-hidden">
                    <div class="h-full bg-white rounded-full" style="width: ${data.ahorroObjetivo > 0 ? Math.min(100, (ahorro / data.ahorroObjetivo) * 100) : 0}%"></div>
                </div>
            </div>
        </div>
    `;
}

function renderizarGastosPorCategoria(data, mesActual) {
    const gastosMes = data.gastos.filter(g => g.mes === mesActual);
    const gastosPorCategoria = {};
    
    for (const g of gastosMes) {
        if (!gastosPorCategoria[g.categoria]) gastosPorCategoria[g.categoria] = 0;
        gastosPorCategoria[g.categoria] += g.monto;
    }
    
    const categoriasOrdenadas = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1]);
    const totalGastos = gastosMes.reduce((s, g) => s + g.monto, 0);
    
    if (categoriasOrdenadas.length === 0) {
        return '<p class="text-center text-gray-400 py-4">Sin gastos este mes</p>';
    }
    
    return categoriasOrdenadas.map(([cat, monto]) => {
        const porcentaje = totalGastos > 0 ? (monto / totalGastos * 100).toFixed(1) : 0;
        return `
            <div class="mb-2">
                <div class="flex justify-between text-sm">
                    <span>${cat}</span>
                    <span>${formatNumber(monto)} (${porcentaje}%)</span>
                </div>
                <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" style="width: ${porcentaje}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarTarjetas(data) {
    if (data.tarjetas.length === 0) {
        return '<p class="text-center text-gray-400 py-4">No hay tarjetas registradas</p>';
    }
    
    return data.tarjetas.map(tarjeta => {
        const cuotasTarjeta = data.cuotas.filter(c => c.tarjetaId === tarjeta.id && c.estado === 'pendiente');
        const totalDeuda = cuotasTarjeta.reduce((s, c) => s + (c.montoCuota * c.cuotasRestantes), 0);
        const pagoProximo = cuotasTarjeta.reduce((s, c) => s + c.montoCuota, 0);
        
        return `
            <div class="border-b dark:border-gray-700 py-3">
                <div class="flex justify-between items-start flex-wrap gap-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-xl">${tarjeta.icono || '💳'}</span>
                            <span class="font-bold">${escapeHtml(tarjeta.nombre)}</span>
                            ${tarjeta.cashbackPorcentaje > 0 ? `<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Cashback ${tarjeta.cashbackPorcentaje}%</span>` : ''}
                        </div>
                        <div class="grid grid-cols-2 gap-3 mt-1 text-sm">
                            <div><span class="text-gray-500">Saldo:</span> <span class="font-bold ${tarjeta.saldoDisponible >= 0 ? 'text-green-600' : 'text-red-600'}">${formatNumber(tarjeta.saldoDisponible || 0)}</span></div>
                            <div><span class="text-gray-500">Deuda cuotas:</span> <span class="font-bold text-red-600">${formatNumber(totalDeuda)}</span></div>
                            <div><span class="text-gray-500">Próximo pago:</span> <span class="font-bold text-orange-600">${formatNumber(pagoProximo)}</span></div>
                            <div><span class="text-gray-500">Límite:</span> ${formatNumber(tarjeta.limite || 0)}</div>
                        </div>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="window.mostrarMovimientosTarjeta('${tarjeta.id}')" class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg text-xs">📋 Movimientos</button>
                        <button onclick="window.mostrarModalEditarTarjeta('${tarjeta.id}')" class="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-lg text-xs">✏️</button>
                        <button onclick="window.eliminarTarjeta('${tarjeta.id}')" class="text-red-500 px-2 py-1">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarCuotasActivas(data) {
    const cuotasActivas = data.cuotas.filter(c => c.estado === 'pendiente');
    if (cuotasActivas.length === 0) {
        return '<p class="text-center text-gray-400 py-4">No hay cuotas activas</p>';
    }
    
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    
    // Agrupar pagos futuros por mes
    const pagosPorMes = {};
    for (const cuota of cuotasActivas) {
        const proyeccion = calcularProyeccionCuota(cuota, mesActual);
        for (const p of proyeccion) {
            if (!p.pagada) {
                if (!pagosPorMes[p.mes]) pagosPorMes[p.mes] = 0;
                pagosPorMes[p.mes] += p.monto;
            }
        }
    }
    
    const mesesOrdenados = Object.keys(pagosPorMes).sort();
    
    return `
        <div class="space-y-4">
            <!-- Gráfico de proyección de pagos -->
            <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <h3 class="font-semibold text-sm mb-2">📊 Proyección de Pagos Mensuales</h3>
                <div class="space-y-2">
                    ${mesesOrdenados.slice(0, 6).map(mes => {
                        const monto = pagosPorMes[mes];
                        const porcentaje = Math.min(100, (monto / (data.ingresosMensuales || 1)) * 100);
                        const [anio, mesNum] = mes.split('-');
                        return `
                            <div>
                                <div class="flex justify-between text-xs mb-1">
                                    <span>${mesNum}/${anio}</span>
                                    <span class="font-bold">${formatNumber(monto)}</span>
                                </div>
                                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-orange-500 rounded-full" style="width: ${porcentaje}%"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- Lista detallada de cuotas -->
            ${cuotasActivas.map(cuota => {
                const tarjeta = data.tarjetas.find(t => t.id === cuota.tarjetaId);
                const proyeccion = calcularProyeccionCuota(cuota, mesActual);
                const pagosRestantes = proyeccion.filter(p => !p.pagada);
                const totalRestante = pagosRestantes.reduce((s, p) => s + p.monto, 0);
                
                return `
                    <div class="border-b dark:border-gray-700 py-3">
                        <div class="flex justify-between items-start flex-wrap gap-2">
                            <div>
                                <span class="font-bold">${escapeHtml(cuota.concepto)}</span>
                                <p class="text-xs text-gray-500">${tarjeta?.nombre || 'Sin tarjeta'} • ${cuota.montoCuota.toLocaleString('es-AR')} c/u</p>
                                <p class="text-xs">Cuota ${cuota.cuotasPagadas + 1}/${cuota.cuotasTotales} • <span class="text-orange-600 font-bold">${cuota.cuotasRestantes} cuotas restantes</span></p>
                                <p class="text-sm font-bold text-red-600 mt-1">Saldo restante: ${formatNumber(totalRestante)}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window.mostrarProyeccionCuota('${cuota.id}')" class="bg-purple-600 text-white px-2 py-1 rounded-lg text-xs">📅 Ver proyección</button>
                                <button onclick="window.pagarCuota('${cuota.id}')" class="bg-green-600 text-white px-2 py-1 rounded-lg text-xs">Pagar cuota</button>
                                <button onclick="window.eliminarCuota('${cuota.id}')" class="text-red-500 px-2 py-1">🗑️</button>
                            </div>
                        </div>
                        <div class="mt-2">
                            <div class="flex gap-1 flex-wrap">
                                ${pagosRestantes.slice(0, 5).map(p => `
                                    <span class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                        ${p.mesNombre}: ${formatNumber(p.monto)}
                                    </span>
                                `).join('')}
                                ${pagosRestantes.length > 5 ? `<span class="text-xs text-gray-400">+${pagosRestantes.length - 5} más</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderizarListaGastos(data, mesActual) {
    const gastosMes = data.gastos
        .filter(g => g.mes === mesActual)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 10);
    
    if (gastosMes.length === 0) {
        return '<tr><td colspan="5" class="px-3 py-8 text-center text-gray-400">No hay gastos este mes</td></tr>';
    }
    
    return gastosMes.map(g => `
        <tr>
            <td class="px-3 py-2 text-sm">${formatFecha(g.fecha)}</td>
            <td class="px-3 py-2">${escapeHtml(g.concepto)}</td>
            <td class="px-3 py-2"><span class="text-xs px-2 py-0.5 rounded-full bg-gray-100">${g.categoria}</span></td>
            <td class="px-3 py-2 text-right font-medium text-red-600">${formatNumber(g.monto)}</td>
            <td class="px-3 py-2 text-center"><button onclick="window.eliminarGasto('${g.id}')" class="text-red-500">🗑️</button></td>
        </tr>
    `).join('');
}

function calcularTotalGastosMes(data, mesActual) {
    return data.gastos.filter(g => g.mes === mesActual).reduce((s, g) => s + g.monto, 0);
}

function calcularTotalCuotasMes(data, mesActual) {
    let total = 0;
    for (const cuota of data.cuotas) {
        if (cuota.estado === 'pendiente') {
            const proyeccion = calcularProyeccionCuota(cuota, mesActual);
            const pagoEsteMes = proyeccion.find(p => p.mes === mesActual && !p.pagada);
            if (pagoEsteMes) {
                total += pagoEsteMes.monto;
            }
        }
    }
    return total;
}

// ========== MODALES ==========
window.mostrarModalIngresos = () => {
    const data = cargarGastosPersonales();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">💰 Ingresos y Ahorro</h2>
            <div class="space-y-3">
                <label class="block font-medium">Ingreso neto mensual</label>
                <input type="number" id="ingresos" value="${data.ingresosMensuales}" class="w-full p-3 border rounded-xl">
                <label class="block font-medium">Objetivo de ahorro mensual</label>
                <input type="number" id="ahorro" value="${data.ahorroObjetivo}" class="w-full p-3 border rounded-xl">
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        data.ingresosMensuales = parseFloat(modal.querySelector('#ingresos').value) || 0;
        data.ahorroObjetivo = parseFloat(modal.querySelector('#ahorro').value) || 0;
        guardarGastosPersonales(data);
        mostrarNotificacion('Datos guardados', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

window.mostrarModalGasto = () => {
    const data = cargarGastosPersonales();
    const hoy = getFechaActual();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">➕ Nuevo Gasto</h2>
            <div class="space-y-3">
                <input type="text" id="concepto" placeholder="Concepto *" class="w-full p-3 border rounded-xl">
                <input type="number" id="monto" placeholder="Monto *" class="w-full p-3 border rounded-xl">
                <select id="categoria" class="w-full p-3 border rounded-xl">
                    ${data.categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <input type="text" id="fecha" placeholder="Fecha (DD/MM/YYYY)" value="${hoy}" class="w-full p-3 border rounded-xl">
                <select id="tarjetaId" class="w-full p-3 border rounded-xl">
                    <option value="">Efectivo / Sin tarjeta</option>
                    ${data.tarjetas.map(t => `<option value="${t.id}">${t.nombre} (Saldo: $${formatNumber(t.saldoDisponible || 0)})</option>`).join('')}
                </select>
                <label class="flex items-center gap-2"><input type="checkbox" id="esCuota"> Es una compra en cuotas</label>
                <div id="cuotasDiv" style="display:none;" class="space-y-2">
                    <input type="number" id="cuotasTotales" placeholder="Cantidad total de cuotas" class="w-full p-3 border rounded-xl" value="3">
                    <input type="text" id="proximoPago" placeholder="Primer pago (DD/MM/YYYY)" value="${hoy}" class="w-full p-3 border rounded-xl">
                    <div id="montoCuotaDisplay" class="text-sm text-gray-600"></div>
                </div>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const esCuotaCheck = modal.querySelector('#esCuota');
    const cuotasDiv = modal.querySelector('#cuotasDiv');
    const montoInput = modal.querySelector('#monto');
    const cuotasTotalesInput = modal.querySelector('#cuotasTotales');
    const montoCuotaDisplay = modal.querySelector('#montoCuotaDisplay');
    
    const actualizarMontoCuota = () => {
        const total = parseFloat(montoInput.value) || 0;
        const cuotas = parseInt(cuotasTotalesInput.value) || 1;
        const porCuota = total / cuotas;
        montoCuotaDisplay.innerHTML = `💰 Monto por cuota: ${formatNumber(porCuota)}`;
    };
    
    esCuotaCheck.onchange = () => {
        cuotasDiv.style.display = esCuotaCheck.checked ? 'block' : 'none';
        if (esCuotaCheck.checked) actualizarMontoCuota();
    };
    montoInput.oninput = () => { if (esCuotaCheck.checked) actualizarMontoCuota(); };
    cuotasTotalesInput.oninput = () => { if (esCuotaCheck.checked) actualizarMontoCuota(); };
    
    modal.querySelector('#guardarBtn').onclick = () => {
        const concepto = modal.querySelector('#concepto').value;
        const monto = parseFloat(modal.querySelector('#monto').value);
        if (!concepto || isNaN(monto)) {
            mostrarNotificacion('Complete los datos', 'error');
            return;
        }
        const fechaRaw = modal.querySelector('#fecha').value;
        const fecha = fechaToStorage(fechaRaw);
        const mes = getMesFromFecha(fecha);
        const categoria = modal.querySelector('#categoria').value;
        const tarjetaId = modal.querySelector('#tarjetaId').value;
        const esCuota = esCuotaCheck.checked;
        
        if (esCuota) {
            const cuotasTotales = parseInt(modal.querySelector('#cuotasTotales').value);
            const proximoPagoRaw = modal.querySelector('#proximoPago').value;
            const proximoPago = fechaToStorage(proximoPagoRaw);
            const montoCuota = monto / cuotasTotales;
            
            data.cuotas.push({
                id: generarId(),
                tarjetaId: tarjetaId || null,
                concepto: concepto,
                montoTotal: monto,
                montoCuota: montoCuota,
                cuotasTotales: cuotasTotales,
                cuotasPagadas: 0,
                cuotasRestantes: cuotasTotales,
                proximoPago: proximoPago,
                estado: 'pendiente',
                fechaInicio: fecha,
                pagosRealizados: [],
                fechasPago: []
            });
            mostrarNotificacion(`Compra en cuotas registrada - ${cuotasTotales} cuotas de ${formatNumber(montoCuota)}`, 'success');
        } else {
            data.gastos.push({
                id: generarId(),
                concepto,
                monto,
                categoria,
                fecha,
                mes,
                esCuota: false,
                tarjetaId: tarjetaId || null
            });
            
            if (tarjetaId) {
                const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
                if (tarjeta) {
                    tarjeta.saldoDisponible = (tarjeta.saldoDisponible || 0) - monto;
                    tarjeta.movimientos = tarjeta.movimientos || [];
                    tarjeta.movimientos.unshift({
                        id: generarId(),
                        fecha: fecha,
                        tipo: 'gasto',
                        monto: monto,
                        descripcion: concepto,
                        saldoAnterior: tarjeta.saldoDisponible + monto,
                        saldoNuevo: tarjeta.saldoDisponible
                    });
                }
            }
            mostrarNotificacion('Gasto registrado', 'success');
        }
        
        guardarGastosPersonales(data);
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

window.mostrarProyeccionCuota = (cuotaId) => {
    const data = cargarGastosPersonales();
    const cuota = data.cuotas.find(c => c.id === cuotaId);
    if (!cuota) return;
    
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const proyeccion = calcularProyeccionCuota(cuota, mesActual);
    const totalRestante = proyeccion.reduce((s, p) => s + (p.pagada ? 0 : p.monto), 0);
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md max-h-96 overflow-auto">
            <h2 class="text-xl font-bold mb-4">📅 Proyección de Pagos - ${escapeHtml(cuota.concepto)}</h2>
            <p class="text-sm mb-2">Monto total: ${formatNumber(cuota.montoTotal)} | Cuota: ${formatNumber(cuota.montoCuota)}</p>
            <p class="text-sm mb-3">Cuota ${cuota.cuotasPagadas + 1}/${cuota.cuotasTotales} | <span class="font-bold text-red-600">Saldo restante: ${formatNumber(totalRestante)}</span></p>
            <div class="space-y-2">
                ${proyeccion.map(p => `
                    <div class="flex justify-between items-center border-b py-2 ${p.pagada ? 'bg-green-50 dark:bg-green-900/20' : ''}">
                        <span class="${p.pagada ? 'line-through text-gray-400' : 'font-medium'}">${p.mesNombre}</span>
                        <span class="font-bold ${p.pagada ? 'text-gray-400' : 'text-orange-600'}">${formatNumber(p.monto)}</span>
                        ${p.esProximo && !p.pagada ? '<span class="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">Próximo</span>' : ''}
                        ${p.pagada ? '<span class="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Pagado</span>' : ''}
                    </div>
                `).join('')}
            </div>
            <div class="flex gap-3 mt-5">
                <button onclick="window.pagarCuota('${cuota.id}')" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Pagar cuota actual</button>
                <button id="cerrarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cerrarBtn').onclick = () => modal.remove();
};

window.mostrarModalTarjeta = () => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">💳 Nueva Tarjeta</h2>
            <div class="space-y-3">
                <input type="text" id="nombre" placeholder="Nombre (ej: Visa, Mastercard)" class="w-full p-3 border rounded-xl">
                <input type="number" id="limite" placeholder="Límite (opcional)" class="w-full p-3 border rounded-xl">
                <input type="number" id="saldoInicial" placeholder="Saldo inicial" value="0" class="w-full p-3 border rounded-xl">
                <input type="number" id="cashback" placeholder="Cashback (%)" step="0.1" value="0" class="w-full p-3 border rounded-xl">
                <select id="icono" class="w-full p-3 border rounded-xl">
                    <option value="💳">💳 Crédito</option>
                    <option value="💎">💎 Premium</option>
                    <option value="🏦">🏦 Débito</option>
                    <option value="🟠">🟠 Naranja</option>
                </select>
                <input type="color" id="color" value="#3b82f6" class="w-full p-2 border rounded-xl h-12">
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#guardarBtn').onclick = () => {
        const nombre = modal.querySelector('#nombre').value;
        if (!nombre) {
            mostrarNotificacion('Ingrese nombre', 'error');
            return;
        }
        const data = cargarGastosPersonales();
        const saldoInicial = parseFloat(modal.querySelector('#saldoInicial').value) || 0;
        data.tarjetas.push({
            id: generarId(),
            nombre,
            limite: parseFloat(modal.querySelector('#limite').value) || 0,
            saldoDisponible: saldoInicial,
            cashbackPorcentaje: parseFloat(modal.querySelector('#cashback').value) || 0,
            icono: modal.querySelector('#icono').value,
            color: modal.querySelector('#color').value,
            movimientos: saldoInicial !== 0 ? [{
                id: generarId(),
                fecha: getFechaActual(),
                tipo: 'saldo_inicial',
                monto: saldoInicial,
                descripcion: 'Saldo inicial',
                saldoAnterior: 0,
                saldoNuevo: saldoInicial
            }] : []
        });
        guardarGastosPersonales(data);
        mostrarNotificacion('Tarjeta agregada', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

window.mostrarModalEditarTarjeta = (tarjetaId) => {
    const data = cargarGastosPersonales();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">✏️ Editar Tarjeta</h2>
            <div class="space-y-3">
                <input type="text" id="nombre" value="${escapeHtml(tarjeta.nombre)}" class="w-full p-3 border rounded-xl">
                <input type="number" id="limite" value="${tarjeta.limite || 0}" class="w-full p-3 border rounded-xl">
                <input type="number" id="cashback" value="${tarjeta.cashbackPorcentaje || 0}" step="0.1" class="w-full p-3 border rounded-xl">
                <label class="block font-medium">Ajustar saldo</label>
                <input type="number" id="ajusteSaldo" value="0" placeholder="Monto a sumar/restar" class="w-full p-3 border rounded-xl">
                <select id="tipoAjuste" class="w-full p-3 border rounded-xl">
                    <option value="sumar">➕ Sumar al saldo</option>
                    <option value="restar">➖ Restar del saldo</option>
                </select>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#guardarBtn').onclick = () => {
        tarjeta.nombre = modal.querySelector('#nombre').value;
        tarjeta.limite = parseFloat(modal.querySelector('#limite').value) || 0;
        tarjeta.cashbackPorcentaje = parseFloat(modal.querySelector('#cashback').value) || 0;
        
        const ajuste = parseFloat(modal.querySelector('#ajusteSaldo').value);
        if (ajuste !== 0) {
            const tipo = modal.querySelector('#tipoAjuste').value;
            tarjeta.movimientos = tarjeta.movimientos || [];
            tarjeta.movimientos.unshift({
                id: generarId(),
                fecha: getFechaActual(),
                tipo: 'ajuste',
                monto: ajuste,
                descripcion: tipo === 'sumar' ? 'Ajuste manual (+)' : 'Ajuste manual (-)',
                saldoAnterior: tarjeta.saldoDisponible,
                saldoNuevo: tipo === 'sumar' ? tarjeta.saldoDisponible + ajuste : tarjeta.saldoDisponible - ajuste
            });
            if (tipo === 'sumar') {
                tarjeta.saldoDisponible += ajuste;
            } else {
                tarjeta.saldoDisponible -= ajuste;
            }
        }
        
        guardarGastosPersonales(data);
        mostrarNotificacion('Tarjeta actualizada', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

window.mostrarMovimientosTarjeta = (tarjetaId) => {
    const data = cargarGastosPersonales();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md max-h-96 overflow-auto">
            <h2 class="text-xl font-bold mb-4">📋 Movimientos - ${escapeHtml(tarjeta.nombre)}</h2>
            <p class="text-sm mb-3">Saldo actual: <span class="font-bold ${tarjeta.saldoDisponible >= 0 ? 'text-green-600' : 'text-red-600'}">${formatNumber(tarjeta.saldoDisponible || 0)}</span></p>
            <div class="space-y-2">
                ${(tarjeta.movimientos || []).slice(0, 20).map(m => `
                    <div class="border-b py-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-500">${formatFecha(m.fecha)}</span>
                            <span class="font-medium ${m.tipo === 'gasto' || m.tipo === 'transferencia_salida' ? 'text-red-600' : 'text-green-600'}">
                                ${m.tipo === 'gasto' || m.tipo === 'transferencia_salida' ? '-' : '+'}${formatNumber(m.monto)}
                            </span>
                        </div>
                        <p class="text-xs">${m.descripcion}</p>
                        <p class="text-xs text-gray-400">Saldo: ${formatNumber(m.saldoNuevo)}</p>
                    </div>
                `).join('') || '<p class="text-gray-400">Sin movimientos</p>'}
            </div>
            <button id="cerrarBtn" class="mt-4 w-full bg-gray-300 py-2 rounded-xl">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cerrarBtn').onclick = () => modal.remove();
};

window.mostrarModalCategorias = () => {
    const data = cargarGastosPersonales();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md max-h-96 overflow-auto">
            <h2 class="text-xl font-bold mb-4">📋 Categorías de Gastos</h2>
            <div id="lista-categorias" class="space-y-2 mb-4">
                ${data.categorias.map((cat, idx) => `
                    <div class="flex gap-2 items-center">
                        <input type="text" class="categoria-nombre flex-1 p-2 border rounded-lg" value="${escapeHtml(cat)}">
                        <button class="eliminar-categoria text-red-500 px-2 py-1 rounded" data-idx="${idx}">🗑️</button>
                    </div>
                `).join('')}
            </div>
            <div class="flex gap-2 mt-3">
                <input type="text" id="nueva-categoria" placeholder="Nueva categoría" class="flex-1 p-2 border rounded-lg">
                <button id="agregar-categoria" class="bg-green-600 text-white px-4 py-2 rounded-lg">+</button>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-blue-600 text-white py-2 rounded-xl">Guardar cambios</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelectorAll('.eliminar-categoria').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.flex')?.remove();
        });
    });
    
    modal.querySelector('#agregar-categoria').onclick = () => {
        const nueva = modal.querySelector('#nueva-categoria').value;
        if (nueva) {
            const container = modal.querySelector('#lista-categorias');
            const div = document.createElement('div');
            div.className = 'flex gap-2 items-center';
            div.innerHTML = `
                <input type="text" class="categoria-nombre flex-1 p-2 border rounded-lg" value="${escapeHtml(nueva)}">
                <button class="eliminar-categoria text-red-500 px-2 py-1 rounded">🗑️</button>
            `;
            container.appendChild(div);
            modal.querySelector('#nueva-categoria').value = '';
            div.querySelector('.eliminar-categoria').onclick = () => div.remove();
        }
    };
    
    modal.querySelector('#guardarBtn').onclick = () => {
        const nuevasCategorias = [];
        modal.querySelectorAll('.categoria-nombre').forEach(input => {
            if (input.value.trim()) nuevasCategorias.push(input.value.trim());
        });
        data.categorias = nuevasCategorias;
        guardarGastosPersonales(data);
        mostrarNotificacion('Categorías actualizadas', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

window.pagarCuota = (cuotaId) => {
    const data = cargarGastosPersonales();
    const cuota = data.cuotas.find(c => c.id === cuotaId);
    if (!cuota) return;
    
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const proyeccion = calcularProyeccionCuota(cuota, mesActual);
    const pagoActual = proyeccion.find(p => p.mes === mesActual && !p.pagada);
    
    if (!pagoActual) {
        mostrarNotificacion('No hay cuota para pagar este mes', 'warning');
        return;
    }
    
    if (confirm(`¿Pagar cuota de ${cuota.concepto} por ${formatNumber(cuota.montoCuota)}?\nCorresponde al mes: ${pagoActual.mesNombre}`)) {
        cuota.cuotasPagadas++;
        cuota.cuotasRestantes--;
        
        if (!cuota.pagosRealizados) cuota.pagosRealizados = [];
        cuota.pagosRealizados.push({
            fecha: getFechaActual(),
            mes: mesActual,
            monto: cuota.montoCuota
        });
        
        const fecha = getFechaActual();
        const fechaStorage = fechaToStorage(fecha);
        const mes = getMesFromFecha(fechaStorage);
        
        data.gastos.push({
            id: generarId(),
            concepto: `${cuota.concepto} (cuota ${cuota.cuotasPagadas}/${cuota.cuotasTotales})`,
            monto: cuota.montoCuota,
            categoria: "💳 Cuotas",
            fecha: fechaStorage,
            mes,
            esCuota: true,
            cuotaId,
            tarjetaId: cuota.tarjetaId
        });
        
        const tarjeta = data.tarjetas.find(t => t.id === cuota.tarjetaId);
        if (tarjeta) {
            tarjeta.saldoDisponible = (tarjeta.saldoDisponible || 0) - cuota.montoCuota;
            tarjeta.movimientos = tarjeta.movimientos || [];
            tarjeta.movimientos.unshift({
                id: generarId(),
                fecha: fechaStorage,
                tipo: 'gasto',
                monto: cuota.montoCuota,
                descripcion: `Pago cuota ${cuota.cuotasPagadas}/${cuota.cuotasTotales} - ${cuota.concepto}`,
                saldoAnterior: tarjeta.saldoDisponible + cuota.montoCuota,
                saldoNuevo: tarjeta.saldoDisponible
            });
            
            if (tarjeta.cashbackPorcentaje > 0) {
                const cashback = (cuota.montoCuota * tarjeta.cashbackPorcentaje) / 100;
                if (cashback > 0) {
                    tarjeta.saldoDisponible += cashback;
                    tarjeta.movimientos.unshift({
                        id: generarId(),
                        fecha: fechaStorage,
                        tipo: 'cashback',
                        monto: cashback,
                        descripcion: `Cashback ${tarjeta.cashbackPorcentaje}% por pago de cuota`,
                        saldoAnterior: tarjeta.saldoDisponible - cashback,
                        saldoNuevo: tarjeta.saldoDisponible
                    });
                    mostrarNotificacion(`🎉 Cashback generado: $${formatNumber(cashback)}`, 'success');
                }
            }
        }
        
        if (cuota.cuotasRestantes <= 0) {
            cuota.estado = 'pagado';
            mostrarNotificacion(`✅ Cuota pagada. Compra completada.`, 'success');
        } else {
            const fechaProx = new Date();
            fechaProx.setMonth(fechaProx.getMonth() + 1);
            cuota.proximoPago = `${fechaProx.getFullYear()}-${String(fechaProx.getMonth() + 1).padStart(2, '0')}-01`;
            mostrarNotificacion(`Cuota pagada. Restan ${cuota.cuotasRestantes} cuotas.`, 'success');
        }
        
        guardarGastosPersonales(data);
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.eliminarCuota = (cuotaId) => {
    if (confirm('¿Eliminar esta cuota? Se eliminarán todos los pagos asociados.')) {
        const data = cargarGastosPersonales();
        data.cuotas = data.cuotas.filter(c => c.id !== cuotaId);
        guardarGastosPersonales(data);
        mostrarNotificacion('Cuota eliminada', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.eliminarTarjeta = (tarjetaId) => {
    if (confirm('¿Eliminar esta tarjeta y todas sus cuotas?')) {
        const data = cargarGastosPersonales();
        data.tarjetas = data.tarjetas.filter(t => t.id !== tarjetaId);
        data.cuotas = data.cuotas.filter(c => c.tarjetaId !== tarjetaId);
        guardarGastosPersonales(data);
        mostrarNotificacion('Tarjeta eliminada', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.eliminarGasto = (gastoId) => {
    if (confirm('¿Eliminar este gasto?')) {
        const data = cargarGastosPersonales();
        data.gastos = data.gastos.filter(g => g.id !== gastoId);
        guardarGastosPersonales(data);
        mostrarNotificacion('Gasto eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.mostrarModalAhorro = () => {
    const data = cargarGastosPersonales();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">🎯 Objetivo de Ahorro</h2>
            <div class="space-y-3">
                <label class="block font-medium">Objetivo mensual</label>
                <input type="number" id="objetivo" value="${data.ahorroObjetivo}" class="w-full p-3 border rounded-xl">
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        data.ahorroObjetivo = parseFloat(modal.querySelector('#objetivo').value) || 0;
        guardarGastosPersonales(data);
        mostrarNotificacion('Objetivo actualizado', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

export function initGastosPersonalesEvents() {}
// Reemplazar la función mostrarModalTarjeta
window.mostrarModalTarjeta = () => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">💳 Nueva Tarjeta</h2>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium mb-1">Nombre de la tarjeta</label>
                    <input type="text" id="nombre" placeholder="Ej: Visa, Mastercard, Naranja" class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">💰 Límite de crédito (opcional)</label>
                    <input type="number" id="limite" placeholder="Monto máximo de la tarjeta" class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">💵 Saldo inicial disponible</label>
                    <input type="number" id="saldoInicial" placeholder="Dinero que tenés en esta tarjeta" value="0" class="w-full p-3 border rounded-xl">
                    <p class="text-xs text-gray-400 mt-1">Si es crédito, poné 0. Si es débito o prepaga, poné el saldo actual.</p>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">🎁 Cashback (%)</label>
                    <input type="number" id="cashback" placeholder="Porcentaje de reintegro" step="0.1" value="0" class="w-full p-3 border rounded-xl">
                    <p class="text-xs text-gray-400 mt-1">Ej: 2% = te devuelven $2 por cada $100 gastados</p>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">🖼️ Icono</label>
                    <select id="icono" class="w-full p-3 border rounded-xl">
                        <option value="💳">💳 Crédito</option>
                        <option value="💎">💎 Premium</option>
                        <option value="🏦">🏦 Débito</option>
                        <option value="🟠">🟠 Naranja</option>
                        <option value="🔵">🔵 Visa</option>
                        <option value="🟡">🟡 Mastercard</option>
                        <option value="🟢">🟢 Cabal</option>
                        <option value="⚪">⚪ American Express</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">🎨 Color de la tarjeta</label>
                    <input type="color" id="color" value="#3b82f6" class="w-full p-2 border rounded-xl h-12">
                </div>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#guardarBtn').onclick = () => {
        const nombre = modal.querySelector('#nombre').value;
        if (!nombre) {
            mostrarNotificacion('Ingrese el nombre de la tarjeta', 'error');
            return;
        }
        const data = cargarGastosPersonales();
        const saldoInicial = parseFloat(modal.querySelector('#saldoInicial').value) || 0;
        data.tarjetas.push({
            id: generarId(),
            nombre,
            limite: parseFloat(modal.querySelector('#limite').value) || 0,
            saldoDisponible: saldoInicial,
            cashbackPorcentaje: parseFloat(modal.querySelector('#cashback').value) || 0,
            icono: modal.querySelector('#icono').value,
            color: modal.querySelector('#color').value,
            movimientos: saldoInicial !== 0 ? [{
                id: generarId(),
                fecha: getFechaActual(),
                tipo: 'saldo_inicial',
                monto: saldoInicial,
                descripcion: 'Saldo inicial',
                saldoAnterior: 0,
                saldoNuevo: saldoInicial
            }] : []
        });
        guardarGastosPersonales(data);
        mostrarNotificacion(`Tarjeta "${nombre}" agregada`, 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};

// Reemplazar la función mostrarModalEditarTarjeta
window.mostrarModalEditarTarjeta = (tarjetaId) => {
    const data = cargarGastosPersonales();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4">✏️ Editar Tarjeta: ${escapeHtml(tarjeta.nombre)}</h2>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium mb-1">Nombre de la tarjeta</label>
                    <input type="text" id="nombre" value="${escapeHtml(tarjeta.nombre)}" class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">💰 Límite de crédito</label>
                    <input type="number" id="limite" value="${tarjeta.limite || 0}" class="w-full p-3 border rounded-xl">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">🎁 Cashback (%)</label>
                    <input type="number" id="cashback" value="${tarjeta.cashbackPorcentaje || 0}" step="0.1" class="w-full p-3 border rounded-xl">
                </div>
                <div class="border-t pt-3">
                    <label class="block text-sm font-medium mb-2 text-orange-600">💰 Ajustar saldo manualmente</label>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <input type="number" id="ajusteSaldo" value="0" placeholder="Monto" class="w-full p-3 border rounded-xl">
                        </div>
                        <div>
                            <select id="tipoAjuste" class="w-full p-3 border rounded-xl">
                                <option value="sumar">➕ Sumar (ingreso)</option>
                                <option value="restar">➖ Restar (gasto)</option>
                            </select>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">Saldo actual: <span class="font-bold">${formatNumber(tarjeta.saldoDisponible || 0)}</span></p>
                </div>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar cambios</button>
                <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#guardarBtn').onclick = () => {
        tarjeta.nombre = modal.querySelector('#nombre').value;
        tarjeta.limite = parseFloat(modal.querySelector('#limite').value) || 0;
        tarjeta.cashbackPorcentaje = parseFloat(modal.querySelector('#cashback').value) || 0;
        
        const ajuste = parseFloat(modal.querySelector('#ajusteSaldo').value);
        if (ajuste !== 0 && !isNaN(ajuste)) {
            const tipo = modal.querySelector('#tipoAjuste').value;
            tarjeta.movimientos = tarjeta.movimientos || [];
            const nuevoSaldo = tipo === 'sumar' 
                ? (tarjeta.saldoDisponible || 0) + ajuste 
                : (tarjeta.saldoDisponible || 0) - ajuste;
            
            tarjeta.movimientos.unshift({
                id: generarId(),
                fecha: getFechaActual(),
                tipo: 'ajuste',
                monto: ajuste,
                descripcion: tipo === 'sumar' ? 'Ajuste manual de saldo (+)' : 'Ajuste manual de saldo (-)',
                saldoAnterior: tarjeta.saldoDisponible || 0,
                saldoNuevo: nuevoSaldo
            });
            tarjeta.saldoDisponible = nuevoSaldo;
            mostrarNotificacion(`Saldo ajustado: ${formatNumber(ajuste)} ${tipo === 'sumar' ? 'sumado' : 'restado'}`, 'success');
        }
        
        guardarGastosPersonales(data);
        mostrarNotificacion('Tarjeta actualizada', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
};
