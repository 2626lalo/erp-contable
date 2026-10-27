// ==================== modules/configuracion/costos-fijos.js ====================
// Pestaña Costos Fijos: CRUD + pagar (con recurrente)
// ERP Contable Argentina - v7.16.2
// v7.16.2: inputs de fecha usan helper inputFechaHTML/initInputFecha

import { getDB, guardarDB } from '../db.js';
import {
    formatNumber, mostrarNotificacion, escapeHtml, formatDate, generarId,
    inputFechaHTML, initInputFecha, getValorFecha, parseFechaLocal, dateToISO, hoyISO, confirmarAccion} from '../utils.js';
import { crearModal, cerrarModal } from './helpers.js';

// ==================== RENDER TAB ====================
export function renderTabCostosFijos(db) {
    return `
        <div id="tab-costos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3 flex justify-between items-center">
                <h2 class="font-bold text-white">💰 Costos Fijos</h2>
                <button onclick="window.mostrarModalAgregarCostoFijo()" class="bg-white text-orange-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
            </div>
            <div class="p-4" id="lista-costos">${renderCostosFijos(db)}</div>
        </div>
    `;
}

// ==================== RENDER LISTA ====================
export function renderCostosFijos(db) {
    if (!db.costosFijos) db.costosFijos = [];
    const pendientes = db.costosFijos.filter(c => c.estado === 'pendiente');
    if (pendientes.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay costos fijos pendientes</p>';
    }
    return pendientes.map(c => `
        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
            <div>
                <span class="font-bold">${escapeHtml(c.nombre)}</span>
                ${c.recurrente ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-1">🔄 Recurrente</span>' : ''}
                <p class="text-xs text-gray-500">$${formatNumber(c.monto)} • Vence: ${c.vencimiento ? formatDate(c.vencimiento) : '-'} ${c.categoria ? '• ' + escapeHtml(c.categoria) : ''}</p>
            </div>
            <div>
                <button onclick="window.editarCostoFijo(${c.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded mr-1 text-sm">✏️</button>
                <button onclick="window.pagarCostoFijo(${c.id})" class="bg-green-600 text-white px-3 py-1 rounded mr-1 text-sm">Pagar</button>
                <button onclick="window.eliminarCostoFijo(${c.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded text-sm">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ==================== INIT EVENTOS ====================
export function initCostosFijosEvents() {
    // Los eventos se manejan por onclick inline
}

// ==================== MODAL AGREGAR ====================
window.mostrarModalAgregarCostoFijo = () => {
    const fechaActual = hoyISO();
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="costo-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Monto *</label><input type="number" id="costo-monto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"></div>
            <div><label class="block text-sm font-medium">Categoría</label><input type="text" id="costo-categoria" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Impuestos, Servicios, Alquiler..."></div>
            ${inputFechaHTML('costo-vencimiento', fechaActual, { label: '📅 Vencimiento' })}
            <div><label class="flex items-center gap-2"><input type="checkbox" id="costo-recurrente"> Recurrente (mensual)</label></div>
        </div>
    `, '💰 Nuevo Costo Fijo');

    // Inicializar el input de fecha
    initInputFecha('costo-vencimiento');

    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#costo-nombre').value.trim();
        const monto = parseFloat(modal.querySelector('#costo-monto').value);
        if (!nombre || isNaN(monto) || monto <= 0) {
            mostrarNotificacion('Nombre y monto válidos', 'error');
            return;
        }
        const db = getDB();
        if (!db.costosFijos) db.costosFijos = [];
        db.costosFijos.push({
            id: generarId(),
            nombre,
            monto,
            vencimiento: getValorFecha('costo-vencimiento') || hoyISO(),
            categoria: modal.querySelector('#costo-categoria').value || 'Otros',
            estado: 'pendiente',
            recurrente: modal.querySelector('#costo-recurrente').checked
        });
        guardarDB();
        mostrarNotificacion('Costo fijo agregado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== MODAL EDITAR ====================
window.editarCostoFijo = (id) => {
    const db = getDB();
    const c = db.costosFijos.find(x => x.id === id);
    if (!c) return;
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="costo-nombre" value="${escapeHtml(c.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Monto *</label><input type="number" id="costo-monto" value="${c.monto}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"></div>
            <div><label class="block text-sm font-medium">Categoría</label><input type="text" id="costo-categoria" value="${escapeHtml(c.categoria || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            ${inputFechaHTML('costo-vencimiento', c.vencimiento || '', { label: '📅 Vencimiento' })}
            <div><label class="flex items-center gap-2"><input type="checkbox" id="costo-recurrente" ${c.recurrente ? 'checked' : ''}> Recurrente (mensual)</label></div>
        </div>
    `, '✏️ Editar Costo Fijo');

    // Inicializar el input de fecha
    initInputFecha('costo-vencimiento');

    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#costo-nombre').value.trim();
        const monto = parseFloat(modal.querySelector('#costo-monto').value);
        if (!nombre || isNaN(monto) || monto <= 0) {
            mostrarNotificacion('Nombre y monto válidos', 'error');
            return;
        }
        c.nombre = nombre;
        c.monto = monto;
        c.categoria = modal.querySelector('#costo-categoria').value || 'Otros';
        c.vencimiento = getValorFecha('costo-vencimiento') || hoyISO();
        c.recurrente = modal.querySelector('#costo-recurrente').checked;
        guardarDB();
        mostrarNotificacion('Costo fijo actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== PAGAR ====================
window.pagarCostoFijo = (id) => {
    const db = getDB();
    const costo = db.costosFijos.find(c => c.id === id);
    if (!costo) return;
    costo.estado = 'pagado';
    costo.fechaPago = hoyISO();
    if (costo.recurrente) {
        // 🔥 v7.16.81: parsear como LOCAL para evitar bug UTC-3
        const nuevaFecha = parseFechaLocal(costo.vencimiento);
        nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
        db.costosFijos.push({
            id: generarId(),
            nombre: costo.nombre,
            monto: costo.monto,
            vencimiento: dateToISO(nuevaFecha),
            estado: 'pendiente',
            categoria: costo.categoria,
            recurrente: true
        });
    }
    guardarDB();
    mostrarNotificacion(`Pagado: ${costo.nombre}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== ELIMINAR ====================
window.eliminarCostoFijo = async (id) => {
    if (!(await confirmarAccion({ titulo: '🗑️ Eliminar costo fijo', mensaje: '¿Eliminar este costo fijo? No se podrá recuperar.', textoConfirmar: '🗑️ Sí, eliminar', icono: '📅' }))) return;
    const db = getDB();
    db.costosFijos = db.costosFijos.filter(c => c.id !== id);
    guardarDB();
    mostrarNotificacion('Costo fijo eliminado', 'info');
    window.dispatchEvent(new Event('refreshView'));
};
