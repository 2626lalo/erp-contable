// ==================== modules/presupuestos/lista.js ====================
// LISTA - Render principal de la lista de presupuestos
// ERP Contable Argentina - v7.0.0

import { getDB, asegurarCamposPresupuesto } from '../db.js';
import { formatNumber, escapeHtml, formatDate } from '../utils.js';

// ==================== RENDER PRINCIPAL ====================
export function renderPresupuestos() {
    asegurarCamposPresupuesto();
    const db = getDB();
    const filtroEstado = localStorage.getItem('presupuestosFiltroEstado') || 'todos';
    const filtroBusqueda = localStorage.getItem('presupuestosFiltroBusqueda') || '';
    let presupuestosFiltrados = db.presupuestos || [];
    if (filtroEstado !== 'todos') {
        presupuestosFiltrados = presupuestosFiltrados.filter(p => p.estado === filtroEstado);
    }
    if (filtroBusqueda.trim()) {
        const term = filtroBusqueda.toLowerCase();
        presupuestosFiltrados = presupuestosFiltrados.filter(p => 
            p.numero.toLowerCase().includes(term) || 
            (p.cliente || '').toLowerCase().includes(term)
        );
    }
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📄 Presupuestos</h1>
                <div class="flex gap-2">
                    <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                        <span>➕</span> Nuevo
                    </button>
                    <button onclick="window.mostrarModalCargarPDF()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                        📷 Cargar PDF
                    </button>
                </div>
            </div>

            <div class="flex flex-wrap gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl shadow items-center">
                <label class="text-sm font-medium">🔍 Buscar:</label>
                <input type="text" id="filtroBusquedaPresupuestos" value="${escapeHtml(filtroBusqueda)}" 
                       placeholder="Nº o cliente..." class="flex-1 min-w-[150px] p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                <label class="text-sm font-medium ml-2">📌 Estado:</label>
                <select id="filtroEstadoPresupuestos" class="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="todos" ${filtroEstado === 'todos' ? 'selected' : ''}>Todos</option>
                    <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                    <option value="aprobado" ${filtroEstado === 'aprobado' ? 'selected' : ''}>✅ Aprobado</option>
                    <option value="rechazado" ${filtroEstado === 'rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                </select>
                <button onclick="window.aplicarFiltrosPresupuestos()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Aplicar</button>
                <button onclick="window.limpiarFiltrosPresupuestos()" class="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white px-4 py-2 rounded-lg text-sm">Limpiar</button>
            </div>

            <div id="listaPresupuestos" class="space-y-3">
                ${presupuestosFiltrados.slice().reverse().map(p => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all border-l-4 ${p.estado === 'aprobado' ? 'border-green-500' : p.estado === 'rechazado' ? 'border-red-500' : p.esMora ? 'border-purple-500' : 'border-yellow-500'}">
                        <div class="flex justify-between items-start flex-wrap gap-2">
                            <div class="flex-1 cursor-pointer" onclick="window.verPresupuestoDetalle(${p.id})">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h3 class="font-bold">${escapeHtml(p.cliente)}</h3>
                                    <span class="text-xs px-2 py-0.5 rounded-full ${p.esMora ? 'bg-purple-100 text-purple-700' : ''}">
                                        ${p.esMora ? '💰 Mora' : p.estado === 'aprobado' ? '✅ Aprobado' : p.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente'}
                                    </span>
                                    <span class="text-xs text-gray-500">${p.numero}</span>
                                    ${p.ventaOrigenId ? `<span class="text-xs text-orange-500">(Venta origen: ${p.ventaOrigenId})</span>` : ''}
                                </div>
                                <p class="text-sm">Total: <span class="font-bold ${p.esMora ? 'text-purple-600' : 'text-green-600'}">$${formatNumber(p.total)}</span></p>
                                <p class="text-xs text-gray-500">${p.fechaCreacion ? formatDate(p.fechaCreacion) : ''} ${p.presupuestoPadreId ? `• Adicional de: P-${p.presupuestoPadreId}` : ''}</p>
                                <button onclick="event.stopPropagation();window.verTrazabilidad('presupuesto','${p.id}')" class="text-xs text-purple-600 hover:underline mt-1">🔗 Ver trazabilidad</button>
                            </div>
                            <div class="flex gap-2 flex-wrap">
                                ${p.estado !== 'aprobado' && !p.esMora ? `<button onclick="event.stopPropagation();window.editarPresupuesto(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-sm">✏️ Editar</button>` : ''}
                                <button onclick="event.stopPropagation();window.descargarPDFPresupuesto(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-sm">📄 PDF</button>
                                ${!p.ventaGeneradaId && p.estado !== 'aprobado' ? `<button onclick="event.stopPropagation();window.aprobarPresupuesto(${p.id})" class="bg-green-600 text-white px-3 py-1 rounded-xl text-sm">✅ Aprobar</button>` : ''}
                                <button onclick="event.stopPropagation();window.eliminarPresupuesto(${p.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️</button>
                            </div>
                        </div>
                    </div>
                `).join('') || '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">No hay presupuestos</p></div>'}
            </div>
        </div>
    `;
}

// ==================== FILTROS ====================
window.aplicarFiltrosPresupuestos = () => {
    const busqueda = document.getElementById('filtroBusquedaPresupuestos').value;
    const estado = document.getElementById('filtroEstadoPresupuestos').value;
    localStorage.setItem('presupuestosFiltroBusqueda', busqueda);
    localStorage.setItem('presupuestosFiltroEstado', estado);
    window.dispatchEvent(new Event('refreshView'));
};

window.limpiarFiltrosPresupuestos = () => {
    document.getElementById('filtroBusquedaPresupuestos').value = '';
    document.getElementById('filtroEstadoPresupuestos').value = 'todos';
    localStorage.removeItem('presupuestosFiltroBusqueda');
    localStorage.removeItem('presupuestosFiltroEstado');
    window.dispatchEvent(new Event('refreshView'));
};
