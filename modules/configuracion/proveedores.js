// ==================== modules/configuracion/proveedores.js ====================
// Pestaña Proveedores: CRUD + ver detalle
// ERP Contable Argentina - v7.16.1

import { getDB, guardarDB } from '../db.js';
import {
    formatNumber, mostrarNotificacion, escapeHtml, formatDate, generarId,
    calcularSaldoProveedor, obtenerComprasPendientesProveedor, obtenerTotalComprasProveedor, confirmarAccion} from '../utils.js';
import {
    crearModal,
    cerrarModal,
    normalizarCuit,
    METODOS_PAGO
} from './helpers.js';

// ==================== RENDER TAB ====================
export function renderTabProveedores(db) {
    return `
        <div id="tab-proveedores" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-green-500 to-teal-600 px-5 py-3 flex justify-between items-center">
                <h2 class="font-bold text-white">🏭 Proveedores</h2>
                <button onclick="window.mostrarModalAgregarProveedor()" class="bg-white text-green-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
            </div>
            <div class="p-4">
                <div class="mb-3"><input type="text" id="buscarProveedores" placeholder="🔍 Buscar por nombre, CUIT o provincia..." class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                <div id="lista-proveedores">${renderProveedores(db, '')}</div>
            </div>
        </div>
    `;
}

// ==================== RENDER LISTA ====================
export function renderProveedores(db, filtro = '') {
    let proveedores = db.proveedores || [];
    if (filtro.trim()) {
        const f = filtro.toLowerCase();
        proveedores = proveedores.filter(p =>
            (p.nombre || '').toLowerCase().includes(f) ||
            (p.provincia || '').toLowerCase().includes(f) ||
            (p.cuit || '').replace(/[-\s]/g, '').includes(f.replace(/[-\s]/g, ''))
        );
    }
    if (proveedores.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay proveedores que coincidan</p>';
    }
    return proveedores.map(p => {
        const saldo = calcularSaldoProveedor(p.id);
        return `
            <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                <div>
                    <span class="font-bold">${escapeHtml(p.nombre)}</span>
                    ${p.rubro ? `<span class="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded ml-1">🏷️ ${escapeHtml(p.rubro)}</span>` : ''}
                    ${p.provincia ? `<span class="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded ml-1">${escapeHtml(p.provincia)}</span>` : ''}
                    <p class="text-xs text-gray-500">${p.telefono || ''} ${p.email ? '| ' + escapeHtml(p.email) : ''} ${p.cuit ? '| CUIT: ' + escapeHtml(p.cuit) : ''}</p>
                    ${saldo.saldo > 0 ? `<p class="text-xs text-orange-600 font-bold">Deuda pendiente: $${formatNumber(saldo.saldo)} (${saldo.cantidadComprasPendientes} compras)</p>` : '<p class="text-xs text-green-600">✅ Sin deuda pendiente</p>'}
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="window.verDetalleProveedor(${p.id})" class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-sm" title="Ver detalles">👁️</button>
                    <button onclick="window.editarProveedor(${p.id})" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">✏️</button>
                    <button onclick="window.eliminarProveedor(${p.id})" class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== INIT EVENTOS ====================
export function initProveedoresEvents() {
    const buscarProveedores = document.getElementById('buscarProveedores');
    if (buscarProveedores) {
        buscarProveedores.addEventListener('input', () => {
            const db = getDB();
            document.getElementById('lista-proveedores').innerHTML = renderProveedores(db, buscarProveedores.value);
        });
    }
}

// ==================== MODAL AGREGAR ====================
window.mostrarModalAgregarProveedor = () => {
    const metodosOptions = METODOS_PAGO.map(m => `
        <label class="inline-flex items-center gap-1 mr-2 text-sm">
            <input type="checkbox" class="metodo-pago-checkbox" value="${escapeHtml(m)}"> ${escapeHtml(m)}
        </label>
    `).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="prov-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="prov-cuit" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="30-12345678-9"></div>
            <div><label class="block text-sm font-medium">🏷️ Rubro / Servicios que brinda</label><input type="text" id="prov-rubro" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Gomería, alineación, balanceo"></div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="prov-telefono" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="prov-email" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="prov-direccion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Provincia</label><input type="text" id="prov-provincia" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Salta"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="prov-contacto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de pago (plazo que te da el proveedor)</label><input type="number" id="prov-diasPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="15" min="0"></div>
            <div>
                <label class="block text-sm font-medium">Métodos de pago aceptados</label>
                <div class="flex flex-wrap gap-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    ${metodosOptions}
                </div>
            </div>
            <div><label class="block text-sm font-medium">Observaciones</label><textarea id="prov-observaciones" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Notas internas..."></textarea></div>
        </div>
    `, '🏭 Nuevo Proveedor');

    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#prov-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        const cuitRaw = modal.querySelector('#prov-cuit').value.trim();
        const cuitNormalizado = normalizarCuit(cuitRaw);
        const db = getDB();
        if (cuitNormalizado) {
            const existe = db.proveedores.some(p => normalizarCuit(p.cuit) === cuitNormalizado);
            if (existe) {
                mostrarNotificacion('⚠️ Ya existe un proveedor con este CUIT', 'error');
                return;
            }
        }
        const metodosPago = [];
        modal.querySelectorAll('.metodo-pago-checkbox:checked').forEach(cb => {
            metodosPago.push(cb.value);
        });
        db.proveedores.push({
            id: generarId(),
            nombre,
            cuit: cuitRaw,
            rubro: modal.querySelector('#prov-rubro').value || '',
            telefono: modal.querySelector('#prov-telefono').value || '',
            email: modal.querySelector('#prov-email').value || '',
            direccion: modal.querySelector('#prov-direccion').value || '',
            provincia: modal.querySelector('#prov-provincia').value || '',
            contacto: modal.querySelector('#prov-contacto').value || '',
            diasPago: parseInt(modal.querySelector('#prov-diasPago').value) || 0,
            metodosPago: metodosPago,
            observaciones: modal.querySelector('#prov-observaciones').value || '',
            saldo: 0
        });
        guardarDB();
        mostrarNotificacion('Proveedor agregado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== MODAL EDITAR ====================
window.editarProveedor = (id) => {
    const db = getDB();
    const p = db.proveedores.find(x => x.id === id);
    if (!p) return;
    const metodosOptions = METODOS_PAGO.map(m => `
        <label class="inline-flex items-center gap-1 mr-2 text-sm">
            <input type="checkbox" class="metodo-pago-checkbox" value="${escapeHtml(m)}" ${(p.metodosPago || []).includes(m) ? 'checked' : ''}> ${escapeHtml(m)}
        </label>
    `).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="prov-nombre" value="${escapeHtml(p.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="prov-cuit" value="${escapeHtml(p.cuit || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">🏷️ Rubro / Servicios que brinda</label><input type="text" id="prov-rubro" value="${escapeHtml(p.rubro || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Gomería, alineación, balanceo"></div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="prov-telefono" value="${escapeHtml(p.telefono || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="prov-email" value="${escapeHtml(p.email || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="prov-direccion" value="${escapeHtml(p.direccion || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Provincia</label><input type="text" id="prov-provincia" value="${escapeHtml(p.provincia || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="prov-contacto" value="${escapeHtml(p.contacto || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de pago</label><input type="number" id="prov-diasPago" value="${p.diasPago || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" min="0"></div>
            <div>
                <label class="block text-sm font-medium">Métodos de pago aceptados</label>
                <div class="flex flex-wrap gap-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    ${metodosOptions}
                </div>
            </div>
            <div><label class="block text-sm font-medium">Observaciones</label><textarea id="prov-observaciones" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">${escapeHtml(p.observaciones || '')}</textarea></div>
        </div>
    `, '✏️ Editar Proveedor');

    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#prov-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        const cuitRaw = modal.querySelector('#prov-cuit').value.trim();
        const cuitNormalizado = normalizarCuit(cuitRaw);
        const db = getDB();
        if (cuitNormalizado) {
            const existe = db.proveedores.some(pr => pr.id !== id && normalizarCuit(pr.cuit) === cuitNormalizado);
            if (existe) {
                mostrarNotificacion('⚠️ Ya existe otro proveedor con este CUIT', 'error');
                return;
            }
        }
        const metodosPago = [];
        modal.querySelectorAll('.metodo-pago-checkbox:checked').forEach(cb => {
            metodosPago.push(cb.value);
        });
        p.nombre = nombre;
        p.cuit = cuitRaw;
        p.rubro = modal.querySelector('#prov-rubro').value || '';
        p.telefono = modal.querySelector('#prov-telefono').value || '';
        p.email = modal.querySelector('#prov-email').value || '';
        p.direccion = modal.querySelector('#prov-direccion').value || '';
        p.provincia = modal.querySelector('#prov-provincia').value || '';
        p.contacto = modal.querySelector('#prov-contacto').value || '';
        p.diasPago = parseInt(modal.querySelector('#prov-diasPago').value) || 0;
        p.metodosPago = metodosPago;
        p.observaciones = modal.querySelector('#prov-observaciones').value || '';
        guardarDB();
        mostrarNotificacion('Proveedor actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== ELIMINAR ====================
window.eliminarProveedor = async (id) => {
    if (!(await confirmarAccion({ titulo: '🗑️ Eliminar proveedor', mensaje: '¿Eliminar este proveedor? No se podrá recuperar.', textoConfirmar: '🗑️ Sí, eliminar', icono: '🏢' }))) return;
    const db = getDB();
    db.proveedores = db.proveedores.filter(p => p.id !== id);
    guardarDB();
    mostrarNotificacion('Proveedor eliminado', 'info');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== VER DETALLE ====================
window.verDetalleProveedor = (id) => {
    const db = getDB();
    const p = db.proveedores.find(x => x.id === id);
    if (!p) return;
    const saldo = calcularSaldoProveedor(id);
    const comprasPendientes = obtenerComprasPendientesProveedor(id);
    const totalCompras = obtenerTotalComprasProveedor(id);

    const comprasHTML = comprasPendientes.map(c => `
        <div class="flex justify-between items-center border-b py-1 text-sm">
            <span>Factura ${c.numeroFactura || 'N/A'} - ${formatDate(c.fechaEmision)}</span>
            <span class="font-bold text-orange-600">$${formatNumber(c.totalFactura)}</span>
        </div>
    `).join('');

    const modal = crearModal(`
        <div class="space-y-2">
            <div class="flex justify-between items-center">
                <h3 class="text-lg font-bold">${escapeHtml(p.nombre)}</h3>
                <span class="text-xs ${p.diasPago > 0 ? 'text-green-600' : 'text-gray-400'}">${p.diasPago > 0 ? `${p.diasPago} días de pago` : 'Sin plazo'}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div><span class="text-gray-500">CUIT:</span> ${escapeHtml(p.cuit || '-')}</div>
                <div class="col-span-2"><span class="text-gray-500">🏷️ Rubro/Servicios:</span> ${escapeHtml(p.rubro || '-')}</div>
                <div><span class="text-gray-500">Teléfono:</span> ${escapeHtml(p.telefono || '-')}</div>
                <div><span class="text-gray-500">Email:</span> ${escapeHtml(p.email || '-')}</div>
                <div><span class="text-gray-500">Provincia:</span> ${escapeHtml(p.provincia || '-')}</div>
                <div class="col-span-2"><span class="text-gray-500">Dirección:</span> ${escapeHtml(p.direccion || '-')}</div>
                <div class="col-span-2"><span class="text-gray-500">Contacto:</span> ${escapeHtml(p.contacto || '-')}</div>
            </div>
            <div class="border-t pt-2 mt-2">
                <div class="flex justify-between font-bold text-sm">
                    <span>Total compras:</span>
                    <span class="text-blue-600">$${formatNumber(totalCompras)}</span>
                </div>
                <div class="flex justify-between font-bold text-sm">
                    <span>Deuda pendiente:</span>
                    <span class="text-red-600">$${formatNumber(saldo.saldo)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Compras pendientes:</span>
                    <span class="text-yellow-600">${comprasPendientes.length}</span>
                </div>
                ${comprasPendientes.length > 0 ? `
                    <div class="mt-2">
                        <p class="font-bold text-sm">📋 Compras pendientes:</p>
                        <div class="max-h-32 overflow-y-auto">${comprasHTML}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `, '🏭 Detalle del Proveedor');
    const guardarBtn = modal.querySelector('#modalGuardar');
    if (guardarBtn) guardarBtn.style.display = 'none';
    const cancelarBtn = modal.querySelector('#modalCancelar');
    if (cancelarBtn) {
        cancelarBtn.textContent = 'Cerrar';
        cancelarBtn.onclick = () => cerrarModal(modal);
    }
};
