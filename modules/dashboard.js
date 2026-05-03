import { getDB } from './db.js';
import { formatNumber } from './utils.js';
let chartInstance = null;
export function renderDashboard() {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const meses = [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort().reverse();
    const mesActual = meses[0] || new Date().toISOString().substring(0, 7);
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
    const datosGraficos = { meses: [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort(), ventasPorMes: [], comprasPorMes: [] };
    datosGraficos.meses.forEach(m => { datosGraficos.ventasPorMes.push(db.ventas.filter(v => v.mes === m).reduce((s, v) => s + v.total, 0)); datosGraficos.comprasPorMes.push(db.compras.filter(c => c.mes === m).reduce((s, c) => s + c.total, 0)); });
    setTimeout(() => {
        const canvas = document.getElementById('graficoCanvas');
        if (canvas && typeof Chart !== 'undefined') {
            if (chartInstance) chartInstance.destroy();
            chartInstance = new Chart(canvas, { type: 'line', data: { labels: datosGraficos.meses, datasets: [{ label: 'Ventas', data: datosGraficos.ventasPorMes, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, borderWidth: 3 }, { label: 'Compras', data: datosGraficos.comprasPorMes, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } } });
        }
    }, 100);
    return `<div class="space-y-6 fade-in pb-24"><div class="flex justify-between items-center"><div><h1 class="text-3xl font-bold text-gray-800 dark:text-white">📊 Dashboard</h1><p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${empresa?.nombre || ''} • CUIT ${empresa?.cuit || ''}</p></div><div class="text-right"><p class="text-xs text-gray-400">${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div></div><div class="gradient-bg rounded-2xl p-6 text-white shadow-xl"><p class="text-sm opacity-90">📅 Resultado del mes • ${mesActual}</p><p class="text-4xl font-bold mt-2">$${formatNumber(resultado)}</p><div class="flex justify-between items-center mt-4"><span class="text-sm opacity-80">Rentabilidad: ${rentabilidad}%</span><span class="text-sm opacity-80">IVA a pagar: $${formatNumber(ivaAPagar)}</span></div></div><div class="grid grid-cols-2 gap-4"><div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg card-hover"><div class="flex items-center justify-between"><div><p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ventas Netas</p><p class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">$${formatNumber(ventasNetas)}</p></div><div class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-2xl">💰</div></div></div><div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg card-hover"><div class="flex items-center justify-between"><div><p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Compras Netas</p><p class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">$${formatNumber(comprasNetas)}</p></div><div class="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-2xl">🛒</div></div></div></div><div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg"><h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-4">📈 Evolución mensual</h3><div class="chart-container"><canvas id="graficoCanvas"></canvas></div></div></div>`;
}
