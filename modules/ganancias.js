// ==================== modules/ganancias.js ====================
// INFORME DE GANANCIAS - Version corregida
// ERP Contable Argentina - SAS Salta

import { getDB, getImpuestosActivos } from './db.js';
import { formatNumber, formatPercentage, calcularGananciaNetaDinamicoSync, obtenerNetoDesdeTotalConIVA } from './utils.js';
import { CONSTANTES_FISCALES } from './contabilidad.js';

let db = null;

export async function renderGanancias() {
    db = await getDB();
    
    const container = document.getElementById('main-container');
    if (!container) return;
    
    // Obtener datos del mes actual
    const ahora = new Date();
    const mesActual = ahora.getMonth() + 1;
    const anioActual = ahora.getFullYear();
    
    const ventasMes = db.ventas.filter(v => {
        const fecha = new Date(v.fecha);
        return fecha.getMonth() + 1 === mesActual && fecha.getFullYear() === anioActual;
    });
    
    const comprasMes = db.compras.filter(c => {
        const fecha = new Date(c.fecha);
        return fecha.getMonth() + 1 === mesActual && fecha.getFullYear() === anioActual;
    });
    
    // Calcular totales
    let totalVentas = 0;
    let totalCosto = 0;
    
    for (const venta of ventasMes) {
        const neto = venta.totalSinIVA || obtenerNetoDesdeTotalConIVA(venta.total);
        totalVentas += neto;
        totalCosto += venta.costoTotal || 0;
    }
    
    // Calcular ganancias con sistema dinamico
    const impuestosActivos = getImpuestosActivos();
    const resultado = calcularGananciaNetaDinamicoSync(totalVentas, totalCosto, impuestosActivos);
    
    // Gastos fijos del mes
    const gastosFijos = db.gastosFijos || { items: [], total: 0, pagado: 0 };
    const totalGastosFijos = gastosFijos.items.reduce((sum, g) => sum + g.monto, 0);
    const gastosPendientes = totalGastosFijos - (gastosFijos.pagado || 0);
    
    const gananciaFinal = resultado.gananciaNeta - totalGastosFijos;
    
    container.innerHTML = `
        <div class="p-6 max-w-7xl mx-auto">
            <h2 class="text-2xl font-bold mb-6">📈 Ganancias - ${mesActual}/${anioActual}</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <p class="text-gray-500 text-sm">Ventas del mes</p>
                    <p class="text-2xl font-bold">${formatNumber(totalVentas)}</p>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                    <p class="text-gray-500 text-sm">Costo de ventas</p>
                    <p class="text-2xl font-bold">${formatNumber(totalCosto)}</p>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                    <p class="text-gray-500 text-sm">Ganancia Bruta</p>
                    <p class="text-2xl font-bold">${formatNumber(resultado.gananciaBruta)}</p>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                    <p class="text-gray-500 text-sm">Rentabilidad Bruta</p>
                    <p class="text-2xl font-bold">${formatPercentage(resultado.rentabilidadSobreVenta)}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-semibold mb-4">💰 Detalle de Impuestos</h3>
                    <div class="space-y-2">
                        ${resultado.pasos.map(paso => `
                            <div class="flex justify-between text-sm">
                                <span>${paso.nombre} (${paso.alicuota}%)</span>
                                <span class="font-mono">${formatNumber(paso.monto)}</span>
                            </div>
                        `).join('')}
                        <hr class="my-2">
                        <div class="flex justify-between font-bold">
                            <span>Total Impuestos</span>
                            <span class="font-mono">${formatNumber(resultado.totalImpuestos)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-semibold mb-4">📊 Resultado Final</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span>Ganancia Neta (antes gastos fijos)</span>
                            <span class="font-mono">${formatNumber(resultado.gananciaNeta)}</span>
                        </div>
                        <div class="flex justify-between text-red-600">
                            <span>Gastos Fijos</span>
                            <span class="font-mono">- ${formatNumber(totalGastosFijos)}</span>
                        </div>
                        <hr>
                        <div class="flex justify-between font-bold text-lg">
                            <span>GANANCIA NETA FINAL</span>
                            <span class="text-green-600">${formatNumber(gananciaFinal)}</span>
                        </div>
                        <div class="flex justify-between text-sm text-gray-500">
                            <span>Reserva Legal Aplicada</span>
                            <span>${formatNumber(resultado.reservaLegalAplicada)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 class="font-semibold text-yellow-800 mb-2">⚠️ Nota importante</h3>
                <p class="text-sm text-yellow-700">Estos calculos son estimativos. Consulte con un contador para la presentacion de declaraciones juradas. Los impuestos se calculan segun la configuracion actual de Formulas e Impuestos.</p>
            </div>
        </div>
    `;
}

export async function initGananciasEvents() {
    // Eventos especificos de ganancias si son necesarios
}
