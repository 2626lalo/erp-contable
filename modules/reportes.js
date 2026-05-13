import { getDB } from './db.js';
import { formatNumber, mostrarNotificacion } from './utils.js';

function calcularReporteMes(mes) {
    const db = getDB();
    const ventasMes = db.ventas.filter(v => v.mes === mes);
    const comprasMes = db.compras.filter(c => c.mes === mes);
    const ventasNetas = ventasMes.reduce((s, v) => s + (v.montoNeto || 0), 0);
    const comprasNetas = comprasMes.reduce((s, c) => s + (c.montoNeto || 0), 0);
    const ivaCobrado = ventasMes.reduce((s, v) => s + (v.ivaMonto || 0), 0);
    const ivaPagado = comprasMes.reduce((s, c) => s + (c.ivaMonto || 0), 0);
    const ivaAPagar = ivaCobrado - ivaPagado > 0 ? ivaCobrado - ivaPagado : 0;
    const resultado = ventasNetas - comprasNetas - ivaAPagar;
    const rentabilidad = ventasNetas > 0 ? (resultado / ventasNetas * 100).toFixed(2) : 0;
    return { ventasNetas, comprasNetas, ivaCobrado, ivaPagado, ivaAPagar, resultado, rentabilidad, cantidadVentas: ventasMes.length };
}

function calcularAcumulado() {
    const db = getDB();
    const meses = [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])];
    let a = { ventasNetas: 0, comprasNetas: 0, ivaCobrado: 0, ivaPagado: 0, resultado: 0 };
    meses.forEach(m => { const r = calcularReporteMes(m); a.ventasNetas += r.ventasNetas; a.comprasNetas += r.comprasNetas; a.ivaCobrado += r.ivaCobrado; a.ivaPagado += r.ivaPagado; a.resultado += r.resultado; });
    a.ivaAPagar = a.ivaCobrado - a.ivaPagado > 0 ? a.ivaCobrado - a.ivaPagado : 0;
    a.rentabilidad = a.ventasNetas > 0 ? (a.resultado / a.ventasNetas * 100).toFixed(2) : 0;
    return a;
}

export function renderReportes() {
    const db = getDB();
    const meses = [...new Set([...db.ventas.map(v => v.mes), ...db.compras.map(c => c.mes)])].sort().reverse();
    const mesSel = localStorage.getItem('reporteMes') || meses[0] || new Date().toISOString().substring(0, 7);
    const r = calcularReporteMes(mesSel);
    const a = calcularAcumulado();
    return `
        <div class="space-y-5 fade-in pb-24">
            <h1 class="text-2xl font-bold">📅 Reportes</h1>
            <div class="flex gap-3"><select id="mesSelect" class="flex-1 p-3 border rounded-xl" onchange="window.cambiarReporteMes()">${meses.map(m => `<option value="${m}" ${m === mesSel ? 'selected' : ''}>${m}</option>`).join('')}</select><button onclick="window.exportarReportePDF()" class="bg-blue-600 text-white px-5 py-2 rounded-xl">📄 PDF</button></div>
            <div class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-2xl"><p class="text-sm">📊 RESULTADO ${mesSel}</p><p class="text-4xl font-bold mt-2">$${formatNumber(r.resultado)}</p><p class="text-sm">Rentabilidad: ${r.rentabilidad}%</p></div>
            <div class="grid grid-cols-2 gap-4"><div class="bg-white p-4 rounded-xl"><p class="text-xs">💰 Ventas</p><p class="text-xl font-bold text-green-600">$${formatNumber(r.ventasNetas)}</p><p class="text-xs">${r.cantidadVentas} ventas</p></div><div class="bg-white p-4 rounded-xl"><p class="text-xs">🛒 Compras</p><p class="text-xl font-bold text-red-600">$${formatNumber(r.comprasNetas)}</p></div></div>
            <div class="bg-gray-800 text-white p-5 rounded-xl"><h2 class="font-bold">📈 ACUMULADO ANUAL</h2><div class="space-y-2 mt-3"><div>Ventas: $${formatNumber(a.ventasNetas)}</div><div>Compras: $${formatNumber(a.comprasNetas)}</div><div>Ganancia: $${formatNumber(a.resultado)}</div><div>Rentabilidad: ${a.rentabilidad}%</div><div>IVA: $${formatNumber(a.ivaAPagar)}</div></div></div>
        </div>
    `;
}

export function initReportesEvents() {
    const select = document.getElementById('mesSelect');
    if (select) select.onchange = () => { localStorage.setItem('reporteMes', select.value); window.dispatchEvent(new Event('refreshView')); };
}

export function cambiarReporteMes() {
    const select = document.getElementById('mesSelect');
    if (select) { localStorage.setItem('reporteMes', select.value); window.dispatchEvent(new Event('refreshView')); }
}

export function exportarReportePDF() {
    mostrarNotificacion("Exportando PDF...", 'info');
}
