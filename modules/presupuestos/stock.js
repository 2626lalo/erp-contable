// ==================== modules/presupuestos/stock.js ====================
// STOCK - Vincular compras y manejo de stock de presupuestos
// ERP Contable Argentina - v7.0.0

import { getDB } from '../db.js';
import { formatNumber, escapeHtml, formatDate, mostrarNotificacion } from '../utils.js';
import { crearModal, cerrarModal } from './helpers.js';

// ==================== VINCULAR COMPRA ====================
window.vincularCompra = (idx) => {
    const db = getDB();
    const comprasDisponibles = db.compras.filter(c => c.items && c.items.some(i => i.stockDisponible > 0));
    if (comprasDisponibles.length === 0) {
        mostrarNotificacion('No hay compras con stock disponible', 'warning');
        return;
    }
    const modal = crearModal(`
        <h3 class="font-bold mb-3">Seleccioná una compra para vincular</h3>
        ${comprasDisponibles.map(c => `
            <div class="border-b py-2 cursor-pointer hover:bg-gray-50" onclick="window.seleccionarCompraParaItem(${idx}, '${c.id}')">
                <p><strong>${escapeHtml(c.proveedorNombre)}</strong> - ${formatDate(c.fechaEmision)}</p>
                <p class="text-xs text-gray-500">Ítems con stock: ${c.items.filter(i => i.stockDisponible > 0).length}</p>
            </div>
        `).join('')}
    `, '🔗 Vincular a compra');
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
    modal.querySelector('#modalGuardar')?.remove();
};

window.seleccionarCompraParaItem = (idx, compraId) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(compraId));
    if (!compra) { mostrarNotificacion('Compra no encontrada', 'error'); return; }
    const modal = crearModal(`
        <h3 class="font-bold mb-3">Ítems disponibles de ${escapeHtml(compra.proveedorNombre)}</h3>
        ${compra.items.map((item, i) => `
            <div class="border-b py-2 flex justify-between items-center">
                <div>
                    <p><strong>${escapeHtml(item.descripcion)}</strong></p>
                    <p class="text-xs text-gray-500">Stock: ${item.stockDisponible} unidades | Precio: $${formatNumber(item.precioUnitario)}</p>
                </div>
                <div class="flex items-center gap-2">
                    <input type="number" id="cantidad-asignar-${i}" class="w-16 border rounded px-1 dark:bg-gray-700 dark:border-gray-600" value="1" min="1" max="${item.stockDisponible}" onfocus="this.select()">
                    <button onclick="window.asignarItemACompra(${idx}, '${compraId}', ${i})" class="bg-green-600 text-white px-2 py-1 rounded text-sm">Asignar</button>
                </div>
            </div>
        `).join('')}
    `, '📦 Seleccionar ítem');
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
    modal.querySelector('#modalGuardar')?.remove();
};

window.asignarItemACompra = (idx, compraId, itemIndex) => {
    const cantidadInput = document.getElementById(`cantidad-asignar-${itemIndex}`);
    const cantidad = parseInt(cantidadInput?.value) || 1;
    if (cantidad <= 0) { mostrarNotificacion('Cantidad inválida', 'error'); return; }
    if (!window.reservarStock(compraId, itemIndex, cantidad)) {
        mostrarNotificacion('Stock insuficiente', 'error');
        return;
    }
    const item = window.getItemsPresupuestoRef ? window.getItemsPresupuestoRef()[idx] : null;
    if (item) {
        item.compraVinculadaId = compraId;
        item.compraItemIndex = itemIndex;
        item.cantidadAsignada = cantidad;
        const db = getDB();
        const compra = db.compras.find(c => String(c.id) === String(compraId));
        if (compra) {
            const compraItem = compra.items[itemIndex];
            if (compraItem) {
                item.costo = compraItem.precioUnitario || item.costo;
            }
        }
        if (window.renderizarTodoEditor) {
            window.renderizarTodoEditor();
        }
        mostrarNotificacion(`✅ Asignadas ${cantidad} unidades de ${item.desc}`, 'success');
    }
    cerrarModal(document.querySelector('.modal'));
};

// ==================== FUNCIONES DE STOCK (llaman a compras.js) ====================
window.getStockDisponible = (compraId, itemIndex) => {
    return import('../compras.js').then(module => {
        return module.getStockDisponible(compraId, itemIndex);
    }).catch(() => 0);
};

window.reservarStock = (compraId, itemIndex, cantidad) => {
    return import('../compras.js').then(module => {
        return module.reservarStock(compraId, itemIndex, cantidad);
    }).catch(() => false);
};

window.liberarStock = (compraId, itemIndex, cantidad) => {
    return import('../compras.js').then(module => {
        return module.liberarStock(compraId, itemIndex, cantidad);
    }).catch(() => false);
};
