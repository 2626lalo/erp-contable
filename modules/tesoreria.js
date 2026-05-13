// ==================== modules/tesoreria.js ====================
// TESORERIA - Seguimiento diario
// ERP Contable Argentina - SAS Salta

import { getDB, getImpuestosActivos } from './db.js';
import { formatNumber, calcularImpuestosDevengados, obtenerNetoDesdeTotalConIVA } from './utils.js';

let db = null;

export async function renderTesoreria() {
    db = await getDB();
    
    const container = document.getElementById('main-container');
    if (!container) return;
    
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    
    // Ventas del mes actual
    const ventasMes = db.ventas.filter(v => {
        const fecha = new Date(v.fecha);
        return fecha.getMonth() + 1 === mesActual && fecha.getFullYear() === anioActual;
    });
    
    // Total recaudado hasta hoy
    let recaudadoHoy = 0;
    for (const venta of ventasMes) {
        const cobros = venta.cobros || [];
        recaudadoHoy += cobros.reduce((sum, c) => sum + c.monto, 0);
    }
    
    // Total ventas del mes (devengado)
    let totalVentasMes = 0;
    for (const venta of ventasMes) {
        totalVentasMes += venta.totalSinIVA || obtenerNetoDesdeTotalConIVA(venta.total);
    }
    
    // Impuestos devengados
    const impuestosActivos = getImpuestosActivos();
    const impuestosDevengados = calcularImpuestosDevengados(ventasMes, impuestosActivos);
    const totalImpuestos = Object.values(impuestosDevengados).reduce((sum, v) => sum + v, 0);
    
    // Gastos fijos
    const gastosFijos = db.gastosFijos || { items: [], total: 0, pagado: 0 };
    const totalGastos = gastosFijos.items.reduce((sum, g) => sum + g.monto, 0);
    const gastosPagados = gastosFijos.pagado || 0;
    const gastosPendientes = totalGastos - gastosPagados;
    
    // Proyeccion
    const proyeccionFacturacion = totalVentasMes;
    const resultadoNetoEstimado = totalVentasMes - totalImpuestos - totalGastos;
    
    container.innerHTML = `
        <div class="p-6 max-w-7xl mx-auto">
            <h2 class="text-2xl font-bold mb-6">💰 Tesoreria - ${hoy.toLocaleDateString('es-AR')}</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <p class="text-gray-500 text-sm">Recaudado hasta hoy</p>
                    <p class="text-2xl font-bold text-green-600">${formatNumber(recaudadoHoy)}</p>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                    <p class="text-gray-500 text-sm">Impuestos a pagar (fin de mes)</p>
                    <p class="text-2xl font-bold text-red-600">${formatNumber(totalImpuestos)}</p>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
                    <p class="text-gray-500 text-sm">Gastos pendientes</p>
                    <p class="text-2xl font-bold text-orange-600">${formatNumber(gastosPendientes)}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-semibold mb-3">📈 Proyeccion Mensual</h3>
                    <div class="space-y-2">
                        <div class="flex justify-between"><span>Facturacion estimada</span><span>${formatNumber(proyeccionFacturacion)}</span></div>
                        <div class="flex justify-between text-red-600"><span>Impuestos estimados</span><span>- ${formatNumber(totalImpuestos)}</span></div>
                        <div class="flex justify-between text-orange-600"><span>Gastos fijos</span><span>- ${formatNumber(totalGastos)}</span></div>
                        <hr>
                        <div class="flex justify-between font-bold ${resultadoNetoEstimado >= 0 ? 'text-green-600' : 'text-red-600'}">
                            <span>Resultado Neto Estimado</span>
                            <span>${formatNumber(resultadoNetoEstimado)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-semibold mb-3">💰 Detalle de Impuestos Devengados</h3>
                    <div class="space-y-2">
                        ${Object.entries(impuestosDevengados).map(([nombre, monto]) => `
                            <div class="flex justify-between text-sm">
                                <span>${nombre}</span>
                                <span>${formatNumber(monto)}</span>
                            </div>
                        `).join('')}
                        ${Object.keys(impuestosDevengados).length === 0 ? '<p class="text-gray-400 text-sm">No hay impuestos activos</p>' : ''}
                    </div>
                </div>
            </div>
            
            <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 class="font-semibold text-blue-800 mb-2">💡 Recomendacion</h3>
                <p class="text-sm text-blue-700">Reserve aproximadamente el ${((totalImpuestos / (totalVentasMes || 1)) * 100).toFixed(1)}% de sus cobros para el pago de impuestos. Los impuestos se calculan segun la configuracion actual.</p>
            </div>
        </div>
    `;
}

export async function initTesoreriaEvents() {
    // Eventos
}
