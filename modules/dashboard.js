import { getDB } from './db.js';
import { formatNumber, calcularDiasRestantes, getEstadoColor } from './utils.js';

let chartInstance = null;

export function renderDashboard() {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const meses = [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort().reverse();
    const mesActual = meses[0] || new Date().toISOString().substring(0, 7);
    
    // Cálculos del mes actual
    const ventasMes = db.ventas.filter(v => v.mes === mesActual);
    const comprasMes = db.compras.filter(c => c.mes === mesActual);
    const ventasNetas = ventasMes.reduce((s, v) => s + v.montoNeto, 0);
    const comprasNetas = comprasMes.reduce((s, c) => s + c.montoNeto, 0);
    const ivaCobrado = ventasMes.reduce((s, v) => s + v.ivaMonto, 0);
    const ivaPagado = comprasMes.reduce((s, c) => s + c.ivaMonto, 0);
    const ivaAPagar = ivaCobrado - ivaPagado > 0 ? ivaCobrado - ivaPagado : 0;
    const costosFijosMes = db.costosFijos.filter(cf => cf.vencimiento?.substring(0, 7) === mesActual && cf.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const resultado = ventasNetas - comprasNetas - costosFijosMes - ivaAPagar;
    const rentabilidad = ventasNetas > 0 ? (resultado / ventasNetas * 100).toFixed(2) : 0;
    
    // Costos Fijos - Resumen
    const costosPendientes = db.costosFijos.filter(c => c.estado === 'pendiente');
    const costosPagados = db.costosFijos.filter(c => c.estado === 'pagado');
    const totalCostosPendientes = costosPendientes.reduce((s, c) => s + c.monto, 0);
    const totalCostosMensuales = db.costosFijos.reduce((s, c) => s + c.monto, 0);
    
    // Próximos vencimientos de costos fijos (próximos 7 días)
    const hoy = new Date();
    const proximosVencimientos = costosPendientes.filter(c => {
        if (!c.vencimiento) return false;
        const vence = new Date(c.vencimiento);
        const diff = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 7;
    }).sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
    
    // Datos para gráfico de costos por categoría
    const categorias = [...new Set(db.costosFijos.map(c => c.categoria))];
    const costosPorCategoria = categorias.map(cat => ({
        categoria: cat,
        total: db.costosFijos.filter(c => c.categoria === cat).reduce((s, c) => s + c.monto, 0)
    }));
    
    // Datos para gráfico de evolución
    const datosGraficos = {
        meses: [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort(),
        ventasPorMes: [],
        comprasPorMes: []
    };
    datosGraficos.meses.forEach(m => {
        datosGraficos.ventasPorMes.push(db.ventas.filter(v => v.mes === m).reduce((s, v) => s + v.total, 0));
        datosGraficos.comprasPorMes.push(db.compras.filter(c => c.mes === m).reduce((s, c) => s + c.total, 0));
    });
    
    // Inicializar gráficos con delay
    setTimeout(() => {
        const canvas = document.getElementById('graficoCanvas');
        if (canvas && typeof Chart !== 'undefined') {
            if (chartInstance) chartInstance.destroy();
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
        
        // Gráfico de costos por categoría (torta)
        const canvasCostos = document.getElementById('costosCategoriaCanvas');
        if (canvasCostos && typeof Chart !== 'undefined' && costosPorCategoria.length > 0) {
            new Chart(canvasCostos, {
                type: 'doughnut',
                data: {
                    labels: costosPorCategoria.map(c => c.categoria),
                    datasets: [{ data: costosPorCategoria.map(c => c.total), backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4898'] }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
            });
        }
    }, 100);
    
    return `
        <div class="space-y-5 fade-in pb-24">
            <!-- Header -->
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📊 Dashboard</h1>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${empresa?.nombre || ''} • CUIT ${empresa?.cuit || ''}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-400">${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p class="text-xs text-blue-600 dark:text-blue-400 mt-1">Versión ${localStorage.getItem('app_version') || '4.2.0'}</p>
                </div>
            </div>
            
            <!-- Tarjeta principal de resultado (clickeable) -->
            <div onclick="window.showView('contador')" class="gradient-bg rounded-2xl p-5 text-white shadow-xl cursor-pointer hover:opacity-90 transition-all">
                <p class="text-sm opacity-90">📅 Resultado del mes • ${mesActual}</p>
                <p class="text-3xl font-bold mt-2">$${formatNumber(resultado)}</p>
                <div class="flex justify-between items-center mt-3">
                    <span class="text-sm opacity-80">Rentabilidad: ${rentabilidad}%</span>
                    <span class="text-sm opacity-80">→ Ver más</span>
                </div>
            </div>
            
            <!-- Tarjetas de métricas clickeables -->
            <div class="grid grid-cols-2 gap-3">
                <div onclick="window.showView('ventas')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md card-hover cursor-pointer hover:shadow-lg transition-all">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ventas Netas</p>
                            <p class="text-xl font-bold text-green-600 dark:text-green-400 mt-1">$${formatNumber(ventasNetas)}</p>
                        </div>
                        <div class="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-xl">💰</div>
                    </div>
                </div>
                <div onclick="window.showView('compras')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md card-hover cursor-pointer hover:shadow-lg transition-all">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Compras Netas</p>
                            <p class="text-xl font-bold text-red-600 dark:text-red-400 mt-1">$${formatNumber(comprasNetas)}</p>
                        </div>
                        <div class="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-xl">🛒</div>
                    </div>
                </div>
                <div onclick="window.showView('configuracion')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md card-hover cursor-pointer hover:shadow-lg transition-all">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Costos Fijos</p>
                            <p class="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">$${formatNumber(totalCostosMensuales)}</p>
                            <p class="text-xs text-gray-400">${costosPendientes.length} pendientes</p>
                        </div>
                        <div class="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-xl">📋</div>
                    </div>
                </div>
                <div onclick="window.showView('contador')" class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md card-hover cursor-pointer hover:shadow-lg transition-all">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rentabilidad</p>
                            <p class="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">${rentabilidad}%</p>
                        </div>
                        <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-xl">📈</div>
                    </div>
                </div>
            </div>
            
            <!-- Resumen de Costos Fijos (expanded) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2">
                    <h3 class="font-bold text-white flex items-center gap-2 text-sm">
                        <span class="text-lg">💰</span> Resumen de Costos Fijos
                        <span class="text-xs ml-auto opacity-80">${costosPendientes.length} pendientes</span>
                    </h3>
                </div>
                <div class="p-4">
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div class="text-center">
                            <p class="text-xs text-gray-500">Total Mensual</p>
                            <p class="text-lg font-bold text-orange-600">$${formatNumber(totalCostosMensuales)}</p>
                        </div>
                        <div class="text-center">
                            <p class="text-xs text-gray-500">Pendientes de pago</p>
                            <p class="text-lg font-bold text-red-600">$${formatNumber(totalCostosPendientes)}</p>
                        </div>
                    </div>
                    
                    ${proximosVencimientos.length > 0 ? `
                    <div class="mb-3">
                        <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">⏰ Próximos vencimientos (7 días)</p>
                        <div class="space-y-2">
                            ${proximosVencimientos.slice(0, 3).map(c => {
                                const dias = calcularDiasRestantes(c.vencimiento);
                                return `
                                    <div class="flex justify-between items-center text-sm bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
                                        <div><span class="font-medium">${c.nombre}</span><p class="text-xs text-gray-500">${c.vencimiento}</p></div>
                                        <div class="text-right"><span class="font-bold">$${formatNumber(c.monto)}</span><p class="text-xs ${dias <= 3 ? 'text-red-600' : 'text-orange-600'}">${dias === 0 ? 'Vence hoy' : `Vence en ${dias} días`}</p></div>
                                    </div>
                                `;
                            }).join('')}
                            ${proximosVencimientos.length > 3 ? `<p class="text-xs text-center text-gray-400 mt-2">+${proximosVencimientos.length - 3} más</p>` : ''}
                        </div>
                    </div>
                    ` : '<p class="text-xs text-gray-500 text-center py-2">✅ No hay vencimientos próximos</p>'}
                    
                    <button onclick="window.showView('configuracion')" class="w-full mt-2 text-center text-xs text-blue-600 dark:text-blue-400 hover:underline">Ver todos los costos fijos →</button>
                </div>
            </div>
            
            <!-- Gráficos -->
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md">
                <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">📈 Evolución mensual</h3>
                <div class="chart-container"><canvas id="graficoCanvas" style="height: 200px;"></canvas></div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md">
                <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">🥧 Costos por categoría</h3>
                <div class="chart-container"><canvas id="costosCategoriaCanvas" style="height: 200px;"></canvas></div>
            </div>
        </div>
    `;
}
