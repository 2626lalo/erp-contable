import { getDB } from './db.js';
import { formatNumber } from './utils.js';

function calcularResultados() {
    const db = getDB();
    const ventasNetas = db.ventas.reduce((s, v) => s + v.montoNeto, 0);
    const comprasNetas = db.compras.reduce((s, c) => s + c.montoNeto, 0);
    const ivaCobrado = db.ventas.reduce((s, v) => s + v.ivaMonto, 0);
    const ivaPagado = db.compras.reduce((s, c) => s + c.ivaMonto, 0);
    const ivaAPagar = ivaCobrado - ivaPagado > 0 ? ivaCobrado - ivaPagado : 0;
    const costosFijos = db.costosFijos.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const resultado = ventasNetas - comprasNetas - costosFijos - ivaAPagar;
    const rentabilidad = ventasNetas > 0 ? (resultado / ventasNetas * 100).toFixed(2) : 0;
    return { ventasNetas, comprasNetas, ivaCobrado, ivaPagado, ivaAPagar, costosFijos, resultado, rentabilidad };
}

export function renderContador() {
    const r = calcularResultados();
    return `<div class="space-y-5 fade-in pb-24"><h1 class="text-2xl font-bold">🧮 Contador</h1><div class="gradient-bg rounded-2xl p-6 text-white"><p class="text-sm">💰 CAPITAL REAL DISPONIBLE</p><p class="text-4xl font-bold mt-2">$${formatNumber(r.resultado)}</p><p class="text-sm mt-2">IVA a pagar AFIP: $${formatNumber(r.ivaAPagar)}</p></div><div class="bg-white p-5 rounded-xl shadow"><h2 class="font-bold mb-3">📊 Estado de Resultados</h2><div class="space-y-2"><div class="flex justify-between"><span>Ventas Netas</span><span class="text-green-600">+ $${formatNumber(r.ventasNetas)}</span></div><div class="flex justify-between"><span>Compras Netas</span><span class="text-red-600">- $${formatNumber(r.comprasNetas)}</span></div><div class="flex justify-between"><span>IVA a Pagar</span><span class="text-orange-600">- $${formatNumber(r.ivaAPagar)}</span></div><div class="flex justify-between"><span>Costos Fijos</span><span class="text-purple-600">- $${formatNumber(r.costosFijos)}</span></div><div class="border-t-2 pt-2 flex justify-between font-bold text-lg"><span>RESULTADO NETO</span><span class="${r.resultado >= 0 ? 'text-green-600' : 'text-red-600'}">$${formatNumber(r.resultado)}</span></div><div class="flex justify-between"><span>Rentabilidad</span><span class="font-bold">${r.rentabilidad}%</span></div></div></div></div>`;
}
