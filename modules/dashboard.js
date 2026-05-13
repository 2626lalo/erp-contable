import { getDB } from './db.js';
import { formatNumber, calcularDiasRestantes } from './utils.js';

let chartInstance = null;

export function renderDashboard() {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const meses = [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort().reverse();
    const mesActual = meses[0] || new Date().toISOString().substring(0, 7);
    
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const comprasMes = db.compras.filter(c => c.mes === mesActual);
    const ventasNetas = ventasMes.reduce((s, v) => s + (v.montoNeto || 0), 0);
    const comprasNetas = comprasMes.reduce((s, c) => s + (c.montoNeto || 0), 0);
    const ivaCobrado = ventasMes.reduce((s, v) => s + (v.ivaMonto || 0), 0);
    const ivaPagado = comprasMes.reduce((s, c) => s + (c.ivaMonto || 0), 0);
    const ivaAPagar = ivaCobrado - ivaPagado > 0 ? ivaCobrado - ivaPagado : 0;
    const costosFijosMes = db.costosFijos.filter(cf => cf.vencimiento?.substring(0, 7) === mesActual && cf.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const resultado = ventasNetas - comprasNetas - costosFijosMes - ivaAPagar;
    const rentabilidad = ventasNetas > 0 ? (resultado / ventasNetas * 100).toFixed(2) : 0;
    
    const costosPendientes = db.costosFijos.filter(c => c.estado === 'pendiente');
    const totalCostosMensuales = db.costosFijos.reduce((s, c) => s + c.monto, 0);
    
    const hoy = new Date();
    const proximosVencimientos = costosPendientes.filter(c => {
        if (!c.vencimiento) return false;
        const vence = new Date(c.vencimiento);
        const diff = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 7;
    }).sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
    
    setTimeout(() => {
        const canvas = document.getElementById('graficoCanvas');
        if (canvas && typeof Chart !== 'undefined') {
            if (chartInstance) chartInstance.destroy();
            const datosGraficos = {
                meses: [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort(),
                ventasPorMes: [],
                comprasPorMes: []
            };
            datosGraficos.meses.forEach(m => {
                datosGraficos.ventasPorMes.push(db.ventas.filter(v => v.mes === m).reduce((s, v) => s + (v.total || 0), 0));
                datosGraficos.comprasPorMes.push(db.compras.filter(c => c.mes === m).reduce((s, c) => s + (c.total || 0), 0));
            });
            chartInstance = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: datosGraficos.meses,
                    datasets: [
                        { label: 'Ventas', data: datosGraficos.ventasPorMes, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, borderWidth: 3 },
                        { label: 'Compras', data: datosGraficos.comprasPorMes, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, borderWidth: 3 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
            });
        }
    }, 100);
    
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📊 Dashboard</h1>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${empresa?.nombre || ''} • CUIT ${empresa?.cuit || ''}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-400">${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>
            
            <div onclick="window.showView('contador')" class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-xl cursor-pointer hover:opacity-90 transition-all">
                <p class="text-sm opacity-90">📅 Resultado del mes • ${mesActual}</p>
                <p class="text-3xl font-bold mt-2">$${formatNumber(resultado)}</p>
                <div class="flex justify-between items-center mt-3">
                    <span class="text-sm opacity-80">Rentabilidad: ${rentabilidad}%</span>
                    <span class="text-sm opacity-80">→ Ver más</span>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
                <div onclick="window.showView('ventas')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md cursor-pointer hover:shadow-lg transition-all">
                    <p class="text-xs text-gray-500 uppercase">Ventas Netas</p>
                    <p class="text-xl font-bold text-green-600">$${formatNumber(ventasNetas)}</p>
                </div>
                <div onclick="window.showView('compras')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md cursor-pointer hover:shadow-lg transition-all">
                    <p class="text-xs text-gray-500 uppercase">Compras Netas</p>
                    <p class="text-xl font-bold text-red-600">$${formatNumber(comprasNetas)}</p>
                </div>
                <div onclick="window.showView('configuracion')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md cursor-pointer hover:shadow-lg transition-all">
                    <p class="text-xs text-gray-500 uppercase">Costos Fijos</p>
                    <p class="text-xl font-bold text-orange-600">$${formatNumber(totalCostosMensuales)}</p>
                    <p class="text-xs text-gray-400">${costosPendientes.length} pendientes</p>
                </div>
                <div onclick="window.showView('contador')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md cursor-pointer hover:shadow-lg transition-all">
                    <p class="text-xs text-gray-500 uppercase">Rentabilidad</p>
                    <p class="text-xl font-bold text-purple-600">${rentabilidad}%</p>
                </div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2">
                    <h3 class="font-bold text-white">💰 Próximos Vencimientos</h3>
                </div>
                <div class="p-4">
                    ${proximosVencimientos.slice(0, 3).map(c => {
                        const dias = calcularDiasRestantes(c.vencimiento);
                        return `
                            <div class="flex justify-between items-center text-sm bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg mb-2">
                                <div><span class="font-medium">${c.nombre}</span><p class="text-xs text-gray-500">${c.vencimiento}</p></div>
                                <div class="text-right"><span class="font-bold">$${formatNumber(c.monto)}</span><p class="text-xs ${dias <= 3 ? 'text-red-600' : 'text-orange-600'}">${dias === 0 ? 'Vence hoy' : `Vence en ${dias} días`}</p></div>
                            </div>
                        `;
                    }).join('') || '<p class="text-gray-500 text-center py-4">✅ No hay vencimientos próximos</p>'}
                </div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md">
                <h3 class="font-semibold mb-3">📈 Evolución mensual</h3>
                <canvas id="graficoCanvas" style="height: 200px;"></canvas>
            </div>
        </div>
    `;
}

export function initDashboardEvents() {
    // Eventos del dashboard
    const canvas = document.getElementById('graficoCanvas');
    if (canvas && typeof Chart !== 'undefined' && !chartInstance) {
        const db = getDB();
        const datosGraficos = {
            meses: [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort(),
            ventasPorMes: [],
            comprasPorMes: []
        };
        datosGraficos.meses.forEach(m => {
            datosGraficos.ventasPorMes.push(db.ventas.filter(v => v.mes === m).reduce((s, v) => s + (v.total || 0), 0));
            datosGraficos.comprasPorMes.push(db.compras.filter(c => c.mes === m).reduce((s, c) => s + (c.total || 0), 0));
        });
        chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: datosGraficos.meses,
                datasets: [
                    { label: 'Ventas', data: datosGraficos.ventasPorMes, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, borderWidth: 3 },
                    { label: 'Compras', data: datosGraficos.comprasPorMes, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, borderWidth: 3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
}
