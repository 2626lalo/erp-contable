// ==================== modules/configuracion/productos.js ====================
// Pestaña Productos: CRUD + stock + movimientos + CSV
// ERP Contable Argentina - v7.16.1

import { getDB, guardarDB } from '../db.js';
import { formatNumber, mostrarNotificacion, escapeHtml, formatDate, generarId } from '../utils.js';
import { crearModal, cerrarModal } from './helpers.js';

// ==================== RENDER TAB ====================
export function renderTabProductos(db, productosConStockBajo) {
    return `
        <div id="tab-productos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 flex justify-between items-center flex-wrap gap-2">
                <h2 class="font-bold text-white">📦 Productos</h2>
                <div class="flex gap-2">
                    ${productosConStockBajo.length > 0 ? `<span class="bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-bold">⚠️ ${productosConStockBajo.length} con stock bajo</span>` : ''}
                    <button onclick="window.mostrarModalAgregarProducto()" class="bg-white text-indigo-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
                </div>
            </div>
            <div class="p-4">
                <div class="mb-3 flex gap-2">
                    <input type="text" id="buscarProductos" placeholder="🔍 Buscar por nombre, código o categoría..." class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <button onclick="window.exportarProductosCSV()" class="bg-green-600 text-white px-3 py-2 rounded-lg text-sm">📥 CSV</button>
                </div>
                <div id="lista-productos">
                    ${renderProductos(db, '')}
                </div>
            </div>
        </div>
    `;
}

// ==================== RENDER LISTA ====================
export function renderProductos(db, filtro = '') {
    let productos = db.productos || [];
    if (filtro.trim()) {
        const f = filtro.toLowerCase();
        productos = productos.filter(p =>
            (p.nombre || '').toLowerCase().includes(f) ||
            (p.codigo || '').toLowerCase().includes(f) ||
            (p.categoria || '').toLowerCase().includes(f)
        );
    }
    if (productos.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay productos que coincidan</p>';
    }
    return productos.map(p => {
        const stockBajo = (p.stockActual || 0) <= (p.stockMinimo || 0);
        return `
            <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                <div>
                    <span class="font-bold">${escapeHtml(p.nombre)}</span>
                    <span class="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded ml-1">${escapeHtml(p.codigo || 'Sin código')}</span>
                    ${p.categoria ? `<span class="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded ml-1">${escapeHtml(p.categoria)}</span>` : ''}
                    <p class="text-xs text-gray-500">${p.descripcion || ''}</p>
                    <div class="flex gap-3 text-xs mt-1">
                        <span>💲 Compra: $${formatNumber(p.precioCompra || 0)}</span>
                        <span>💲 Venta: $${formatNumber(p.precioVenta || 0)}</span>
                        <span class="${stockBajo ? 'text-red-600 font-bold' : 'text-green-600'}">📦 Stock: ${p.stockActual || 0} ${p.stockMinimo ? `(min: ${p.stockMinimo})` : ''}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="window.verMovimientosProducto(${p.id})" class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm" title="Ver movimientos">📊</button>
                    <button onclick="window.ajustarStockProducto(${p.id})" class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm" title="Ajustar stock">📦</button>
                    <button onclick="window.editarProducto(${p.id})" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">✏️</button>
                    <button onclick="window.eliminarProducto(${p.id})" class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== INIT EVENTOS ====================
export function initProductosEvents() {
    const buscarProductos = document.getElementById('buscarProductos');
    if (buscarProductos) {
        buscarProductos.addEventListener('input', () => {
            const db = getDB();
            document.getElementById('lista-productos').innerHTML = renderProductos(db, buscarProductos.value);
        });
    }
}

// ==================== HELPER INTERNO: ACTUALIZAR STOCK ====================
function actualizarStock(productoId, cantidad, motivo, referencia = '') {
    const db = getDB();
    const producto = db.productos.find(p => p.id === productoId);
    if (!producto) return false;
    const stockAnterior = producto.stockActual || 0;
    producto.stockActual = Math.max(0, stockAnterior + cantidad);
    if (!db.movimientosStock) db.movimientosStock = [];
    db.movimientosStock.push({
        id: generarId(),
        productoId,
        cantidad,
        stockAnterior,
        stockNuevo: producto.stockActual,
        motivo,
        referencia,
        fecha: new Date().toISOString()
    });
    guardarDB();
    return true;
}

// ==================== MODAL AGREGAR ====================
window.mostrarModalAgregarProducto = () => {
    const db = getDB();
    const proveedoresOptions = (db.proveedores || []).map(p =>
        `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`
    ).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Código *</label><input type="text" id="prod-codigo" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="PROD-001"></div>
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="prod-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Categoría</label><input type="text" id="prod-categoria" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Electrónica, Ropa, etc."></div>
            <div><label class="block text-sm font-medium">Descripción</label><textarea id="prod-descripcion" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Descripción breve..."></textarea></div>
            <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-sm font-medium">Precio de compra ($)</label><input type="number" id="prod-precioCompra" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" value="0"></div>
                <div><label class="block text-sm font-medium">Precio de venta ($)</label><input type="number" id="prod-precioVenta" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" value="0"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-sm font-medium">Stock inicial</label><input type="number" id="prod-stock" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="0" min="0"></div>
                <div><label class="block text-sm font-medium">Stock mínimo</label><input type="number" id="prod-stockMinimo" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="0" min="0"></div>
            </div>
            <div><label class="block text-sm font-medium">Proveedor</label>
                <select id="prod-proveedorId" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Sin proveedor</option>
                    ${proveedoresOptions}
                </select>
            </div>
        </div>
    `, '📦 Nuevo Producto');

    modal.querySelector('#modalGuardar').onclick = () => {
        const codigo = modal.querySelector('#prod-codigo').value.trim();
        const nombre = modal.querySelector('#prod-nombre').value.trim();
        if (!codigo || !nombre) {
            mostrarNotificacion('Código y nombre son obligatorios', 'error');
            return;
        }
        const db = getDB();
        if (!db.productos) db.productos = [];
        if (db.productos.some(p => p.codigo === codigo)) {
            mostrarNotificacion('⚠️ Ya existe un producto con ese código', 'error');
            return;
        }
        const nuevoProducto = {
            id: generarId(),
            codigo,
            nombre,
            categoria: modal.querySelector('#prod-categoria').value.trim() || '',
            descripcion: modal.querySelector('#prod-descripcion').value.trim() || '',
            precioCompra: parseFloat(modal.querySelector('#prod-precioCompra').value) || 0,
            precioVenta: parseFloat(modal.querySelector('#prod-precioVenta').value) || 0,
            stockActual: parseInt(modal.querySelector('#prod-stock').value) || 0,
            stockMinimo: parseInt(modal.querySelector('#prod-stockMinimo').value) || 0,
            proveedorId: modal.querySelector('#prod-proveedorId').value || null,
        };
        db.productos.push(nuevoProducto);
        if (nuevoProducto.stockActual > 0) {
            if (!db.movimientosStock) db.movimientosStock = [];
            db.movimientosStock.push({
                id: generarId(),
                productoId: nuevoProducto.id,
                cantidad: nuevoProducto.stockActual,
                stockAnterior: 0,
                stockNuevo: nuevoProducto.stockActual,
                motivo: 'inicial',
                referencia: 'Creación de producto',
                fecha: new Date().toISOString()
            });
        }
        guardarDB();
        mostrarNotificacion('✅ Producto agregado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== MODAL EDITAR ====================
window.editarProducto = (id) => {
    const db = getDB();
    const p = db.productos.find(x => x.id === id);
    if (!p) return;
    const proveedoresOptions = (db.proveedores || []).map(prov =>
        `<option value="${prov.id}" ${prov.id === p.proveedorId ? 'selected' : ''}>${escapeHtml(prov.nombre)}</option>`
    ).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Código *</label><input type="text" id="prod-codigo" value="${escapeHtml(p.codigo)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="prod-nombre" value="${escapeHtml(p.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Categoría</label><input type="text" id="prod-categoria" value="${escapeHtml(p.categoria || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Descripción</label><textarea id="prod-descripcion" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">${escapeHtml(p.descripcion || '')}</textarea></div>
            <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-sm font-medium">Precio de compra ($)</label><input type="number" id="prod-precioCompra" value="${p.precioCompra || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"></div>
                <div><label class="block text-sm font-medium">Precio de venta ($)</label><input type="number" id="prod-precioVenta" value="${p.precioVenta || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-sm font-medium">Stock actual</label><input type="number" id="prod-stock" value="${p.stockActual || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" min="0"></div>
                <div><label class="block text-sm font-medium">Stock mínimo</label><input type="number" id="prod-stockMinimo" value="${p.stockMinimo || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" min="0"></div>
            </div>
            <div><label class="block text-sm font-medium">Proveedor</label>
                <select id="prod-proveedorId" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Sin proveedor</option>
                    ${proveedoresOptions}
                </select>
            </div>
        </div>
    `, '✏️ Editar Producto');

    modal.querySelector('#modalGuardar').onclick = () => {
        const codigo = modal.querySelector('#prod-codigo').value.trim();
        const nombre = modal.querySelector('#prod-nombre').value.trim();
        if (!codigo || !nombre) {
            mostrarNotificacion('Código y nombre son obligatorios', 'error');
            return;
        }
        const db = getDB();
        const duplicado = db.productos.some(prod => prod.codigo === codigo && prod.id !== id);
        if (duplicado) {
            mostrarNotificacion('⚠️ Ya existe otro producto con ese código', 'error');
            return;
        }
        const stockAnterior = p.stockActual || 0;
        const nuevoStock = parseInt(modal.querySelector('#prod-stock').value) || 0;
        p.codigo = codigo;
        p.nombre = nombre;
        p.categoria = modal.querySelector('#prod-categoria').value.trim() || '';
        p.descripcion = modal.querySelector('#prod-descripcion').value.trim() || '';
        p.precioCompra = parseFloat(modal.querySelector('#prod-precioCompra').value) || 0;
        p.precioVenta = parseFloat(modal.querySelector('#prod-precioVenta').value) || 0;
        p.stockActual = nuevoStock;
        p.stockMinimo = parseInt(modal.querySelector('#prod-stockMinimo').value) || 0;
        p.proveedorId = modal.querySelector('#prod-proveedorId').value || null;
        if (nuevoStock !== stockAnterior) {
            if (!db.movimientosStock) db.movimientosStock = [];
            db.movimientosStock.push({
                id: generarId(),
                productoId: p.id,
                cantidad: nuevoStock - stockAnterior,
                stockAnterior,
                stockNuevo: nuevoStock,
                motivo: 'ajuste',
                referencia: 'Edición de producto',
                fecha: new Date().toISOString()
            });
        }
        guardarDB();
        mostrarNotificacion('✅ Producto actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== ELIMINAR ====================
window.eliminarProducto = (id) => {
    if (!confirm('¿Eliminar este producto? Se eliminarán también sus movimientos de stock.')) return;
    const db = getDB();
    db.productos = db.productos.filter(p => p.id !== id);
    db.movimientosStock = db.movimientosStock.filter(m => m.productoId !== id);
    guardarDB();
    mostrarNotificacion('Producto eliminado', 'info');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== AJUSTAR STOCK ====================
window.ajustarStockProducto = (id) => {
    const db = getDB();
    const p = db.productos.find(x => x.id === id);
    if (!p) return;
    const modal = crearModal(`
        <div class="space-y-3">
            <div class="text-sm"><span class="font-bold">${escapeHtml(p.nombre)}</span> - Stock actual: <span class="font-bold">${p.stockActual || 0}</span></div>
            <div><label class="block text-sm font-medium">Cantidad (positivo para agregar, negativo para quitar)</label><input type="number" id="ajuste-cantidad" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="1" value="0"></div>
            <div><label class="block text-sm font-medium">Motivo</label><input type="text" id="ajuste-motivo" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Inventario físico, devolución, etc."></div>
        </div>
    `, `📦 Ajustar stock`);

    modal.querySelector('#modalGuardar').onclick = () => {
        const cantidad = parseInt(modal.querySelector('#ajuste-cantidad').value);
        const motivo = modal.querySelector('#ajuste-motivo').value.trim() || 'Ajuste manual';
        if (isNaN(cantidad) || cantidad === 0) {
            mostrarNotificacion('Ingrese una cantidad válida (distinta de 0)', 'error');
            return;
        }
        const success = actualizarStock(id, cantidad, motivo, 'Ajuste manual');
        if (success) {
            mostrarNotificacion('✅ Stock ajustado', 'success');
            cerrarModal(modal);
            window.dispatchEvent(new Event('refreshView'));
        } else {
            mostrarNotificacion('Error al ajustar stock', 'error');
        }
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== VER MOVIMIENTOS ====================
window.verMovimientosProducto = (id) => {
    const db = getDB();
    const p = db.productos.find(x => x.id === id);
    if (!p) return;
    const movimientos = (db.movimientosStock || []).filter(m => m.productoId === id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const movimientosHTML = movimientos.length > 0 ? movimientos.map(m => `
        <div class="flex justify-between items-center border-b py-1 text-sm">
            <div>
                <span class="font-medium">${m.motivo}</span>
                <span class="text-xs text-gray-400 ml-2">${m.referencia || ''}</span>
            </div>
            <div>
                <span class="font-bold ${m.cantidad > 0 ? 'text-green-600' : 'text-red-600'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</span>
                <span class="text-xs text-gray-400 ml-2">${m.fecha ? formatDate(m.fecha) : ''}</span>
            </div>
        </div>
    `).join('') : '<p class="text-gray-400 text-center py-2">No hay movimientos</p>';

    const modal = crearModal(`
        <div class="space-y-2">
            <div class="flex justify-between items-center">
                <h3 class="text-lg font-bold">${escapeHtml(p.nombre)}</h3>
                <span class="text-sm font-bold">Stock: ${p.stockActual || 0}</span>
            </div>
            <div class="max-h-60 overflow-y-auto border rounded-lg p-2">
                ${movimientosHTML}
            </div>
        </div>
    `, '📊 Movimientos de stock');
    const guardarBtn = modal.querySelector('#modalGuardar');
    if (guardarBtn) guardarBtn.style.display = 'none';
    const cancelarBtn = modal.querySelector('#modalCancelar');
    if (cancelarBtn) {
        cancelarBtn.textContent = 'Cerrar';
        cancelarBtn.onclick = () => cerrarModal(modal);
    }
};

// ==================== EXPORTAR CSV ====================
window.exportarProductosCSV = () => {
    const db = getDB();
    const productos = db.productos || [];
    if (productos.length === 0) {
        mostrarNotificacion('No hay productos para exportar', 'warning');
        return;
    }
    let csv = 'Código,Nombre,Categoría,Descripción,Precio Compra,Precio Venta,Stock Actual,Stock Mínimo,Proveedor\n';
    productos.forEach(p => {
        const proveedor = p.proveedorId ? db.proveedores.find(pr => pr.id === p.proveedorId) : null;
        csv += `"${p.codigo || ''}","${p.nombre || ''}","${p.categoria || ''}","${p.descripcion || ''}",${p.precioCompra || 0},${p.precioVenta || 0},${p.stockActual || 0},${p.stockMinimo || 0},"${proveedor ? proveedor.nombre : ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    mostrarNotificacion('📥 CSV exportado', 'success');
};
