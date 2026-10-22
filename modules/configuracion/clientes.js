// ==================== modules/configuracion/clientes.js ====================
// Pestaña Clientes: CRUD + ver detalle
// ERP Contable Argentina - v7.16.1

import { getDB, guardarDB } from '../db.js';
import {
    formatNumber, mostrarNotificacion, escapeHtml, formatDate, generarId,
    calcularSaldoCliente, obtenerVentasPendientesCliente, obtenerTotalVentasCliente
} from '../utils.js';
import {
    crearModal,
    cerrarModal,
    normalizarCuit,
    METODOS_PAGO,
    CONDICIONES_IVA
} from './helpers.js';

// ==================== RENDER TAB ====================
export function renderTabClientes(db) {
    return `
        <div id="tab-clientes" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 flex justify-between items-center">
                <h2 class="font-bold text-white">👥 Clientes</h2>
                <button onclick="window.mostrarModalAgregarCliente()" class="bg-white text-blue-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
            </div>
            <div class="p-4">
                <div class="mb-3"><input type="text" id="buscarClientes" placeholder="🔍 Buscar por nombre, CUIT o provincia..." class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                <div id="lista-clientes">${renderClientes(db, '')}</div>
            </div>
        </div>
    `;
}

// ==================== RENDER LISTA ====================
export function renderClientes(db, filtro = '') {
    let clientes = db.clientes || [];
    if (filtro.trim()) {
        const f = filtro.toLowerCase();
        clientes = clientes.filter(c =>
            (c.nombre || '').toLowerCase().includes(f) ||
            (c.provincia || '').toLowerCase().includes(f) ||
            (c.cuit || '').replace(/[-\s]/g, '').includes(f.replace(/[-\s]/g, ''))
        );
    }
    if (clientes.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay clientes que coincidan</p>';
    }
    return clientes.map(c => {
        const saldo = calcularSaldoCliente(c.id);
        return `
            <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                <div>
                    <span class="font-bold">${escapeHtml(c.nombre)}</span>
                    ${c.provincia ? `<span class="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded ml-1">${escapeHtml(c.provincia)}</span>` : ''}
                    <p class="text-xs text-gray-500">${c.telefono || ''} ${c.email ? '| ' + escapeHtml(c.email) : ''} ${c.cuit ? '| CUIT: ' + escapeHtml(c.cuit) : ''}</p>
                    ${saldo.saldo > 0 ? `<p class="text-xs text-red-600 font-bold">Saldo pendiente: $${formatNumber(saldo.saldo)} (${saldo.cantidadVentasPendientes} facturas)</p>` : '<p class="text-xs text-green-600">✅ Sin saldo pendiente</p>'}
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="window.verDetalleCliente(${c.id})" class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-sm" title="Ver detalles">👁️</button>
                    <button onclick="window.editarCliente(${c.id})" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">✏️</button>
                    <button onclick="window.eliminarCliente(${c.id})" class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== INIT EVENTOS ====================
export function initClientesEvents() {
    const buscarClientes = document.getElementById('buscarClientes');
    if (buscarClientes) {
        buscarClientes.addEventListener('input', () => {
            const db = getDB();
            document.getElementById('lista-clientes').innerHTML = renderClientes(db, buscarClientes.value);
        });
    }
}

// ==================== MODAL AGREGAR ====================
window.mostrarModalAgregarCliente = () => {
    const metodosOptions = METODOS_PAGO.map(m => `
        <label class="inline-flex items-center gap-1 mr-2 text-sm">
            <input type="checkbox" class="metodo-pago-checkbox" value="${escapeHtml(m)}"> ${escapeHtml(m)}
        </label>
    `).join('');

    const ivaOptions = CONDICIONES_IVA.map(c => `<option value="${c}">${c}</option>`).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="cliente-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="cliente-cuit" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="30-12345678-9"></div>
            <div><label class="block text-sm font-medium">Condición IVA</label>
                <select id="cliente-condicionIVA" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Seleccionar...</option>
                    ${ivaOptions}
                </select>
            </div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="cliente-telefono" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="cliente-email" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="cliente-direccion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Provincia</label><input type="text" id="cliente-provincia" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Salta"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="cliente-contacto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de cobro (plazo para que te paguen)</label><input type="number" id="cliente-diasCobro" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="30" min="0"></div>
            <div>
                <label class="block text-sm font-medium">Métodos de pago aceptados</label>
                <div class="flex flex-wrap gap-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    ${metodosOptions}
                </div>
            </div>
            <div><label class="block text-sm font-medium">Observaciones</label><textarea id="cliente-observaciones" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Notas internas..."></textarea></div>
        </div>
    `, '👤 Nuevo Cliente');

    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#cliente-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        const cuitRaw = modal.querySelector('#cliente-cuit').value.trim();
        const cuitNormalizado = normalizarCuit(cuitRaw);
        const db = getDB();
        if (cuitNormalizado) {
            const existe = db.clientes.some(c => normalizarCuit(c.cuit) === cuitNormalizado);
            if (existe) {
                mostrarNotificacion('⚠️ Ya existe un cliente con este CUIT', 'error');
                return;
            }
        }
        const metodosPago = [];
        modal.querySelectorAll('.metodo-pago-checkbox:checked').forEach(cb => {
            metodosPago.push(cb.value);
        });
        db.clientes.push({
            id: generarId(),
            nombre,
            cuit: cuitRaw,
            condicionIVA: modal.querySelector('#cliente-condicionIVA').value || '',
            telefono: modal.querySelector('#cliente-telefono').value || '',
            email: modal.querySelector('#cliente-email').value || '',
            direccion: modal.querySelector('#cliente-direccion').value || '',
            provincia: modal.querySelector('#cliente-provincia').value || '',
            contacto: modal.querySelector('#cliente-contacto').value || '',
            diasCobro: parseInt(modal.querySelector('#cliente-diasCobro').value) || 0,
            metodosPago: metodosPago,
            observaciones: modal.querySelector('#cliente-observaciones').value || '',
            saldo: 0
        });
        guardarDB();
        mostrarNotificacion('Cliente agregado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== MODAL EDITAR ====================
window.editarCliente = (id) => {
    const db = getDB();
    const c = db.clientes.find(x => x.id === id);
    if (!c) return;
    const metodosOptions = METODOS_PAGO.map(m => `
        <label class="inline-flex items-center gap-1 mr-2 text-sm">
            <input type="checkbox" class="metodo-pago-checkbox" value="${escapeHtml(m)}" ${(c.metodosPago || []).includes(m) ? 'checked' : ''}> ${escapeHtml(m)}
        </label>
    `).join('');

    const ivaOptions = CONDICIONES_IVA.map(cond => `<option value="${cond}" ${c.condicionIVA === cond ? 'selected' : ''}>${cond}</option>`).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="cliente-nombre" value="${escapeHtml(c.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="cliente-cuit" value="${escapeHtml(c.cuit || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Condición IVA</label>
                <select id="cliente-condicionIVA" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Seleccionar...</option>
                    ${ivaOptions}
                </select>
            </div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="cliente-telefono" value="${escapeHtml(c.telefono || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="cliente-email" value="${escapeHtml(c.email || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="cliente-direccion" value="${escapeHtml(c.direccion || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Provincia</label><input type="text" id="cliente-provincia" value="${escapeHtml(c.provincia || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="cliente-contacto" value="${escapeHtml(c.contacto || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de cobro</label><input type="number" id="cliente-diasCobro" value="${c.diasCobro || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" min="0"></div>
            <div>
                <label class="block text-sm font-medium">Métodos de pago aceptados</label>
                <div class="flex flex-wrap gap-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    ${metodosOptions}
                </div>
            </div>
            <div><label class="block text-sm font-medium">Observaciones</label><textarea id="cliente-observaciones" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">${escapeHtml(c.observaciones || '')}</textarea></div>
        </div>
    `, '✏️ Editar Cliente');

    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#cliente-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        const cuitRaw = modal.querySelector('#cliente-cuit').value.trim();
        const cuitNormalizado = normalizarCuit(cuitRaw);
        const db = getDB();
        if (cuitNormalizado) {
            const existe = db.clientes.some(cl => cl.id !== id && normalizarCuit(cl.cuit) === cuitNormalizado);
            if (existe) {
                mostrarNotificacion('⚠️ Ya existe otro cliente con este CUIT', 'error');
                return;
            }
        }
        const metodosPago = [];
        modal.querySelectorAll('.metodo-pago-checkbox:checked').forEach(cb => {
            metodosPago.push(cb.value);
        });
        c.nombre = nombre;
        c.cuit = cuitRaw;
        c.condicionIVA = modal.querySelector('#cliente-condicionIVA').value || '';
        c.telefono = modal.querySelector('#cliente-telefono').value || '';
        c.email = modal.querySelector('#cliente-email').value || '';
        c.direccion = modal.querySelector('#cliente-direccion').value || '';
        c.provincia = modal.querySelector('#cliente-provincia').value || '';
        c.contacto = modal.querySelector('#cliente-contacto').value || '';
        c.diasCobro = parseInt(modal.querySelector('#cliente-diasCobro').value) || 0;
        c.metodosPago = metodosPago;
        c.observaciones = modal.querySelector('#cliente-observaciones').value || '';
        guardarDB();
        mostrarNotificacion('Cliente actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== ELIMINAR ====================
window.eliminarCliente = (id) => {
    if (!confirm('¿Eliminar este cliente? No se podrá recuperar.')) return;
    const db = getDB();
    db.clientes = db.clientes.filter(c => c.id !== id);
    guardarDB();
    mostrarNotificacion('Cliente eliminado', 'info');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== VER DETALLE ====================
window.verDetalleCliente = (id) => {
    const db = getDB();
    const c = db.clientes.find(x => x.id === id);
    if (!c) return;
    const saldo = calcularSaldoCliente(id);
    const ventasPendientes = obtenerVentasPendientesCliente(id);
    const totalVentas = obtenerTotalVentasCliente(id);

    const ventasHTML = ventasPendientes.map(v => `
        <div class="flex justify-between items-center border-b py-1 text-sm">
            <span>Factura ${v.numComprobante || 'N/A'} - ${formatDate(v.fechaVenta)}</span>
            <span class="font-bold text-red-600">$${formatNumber(v.total)}</span>
        </div>
    `).join('');

    const modal = crearModal(`
        <div class="space-y-2">
            <div class="flex justify-between items-center">
                <h3 class="text-lg font-bold">${escapeHtml(c.nombre)}</h3>
                <span class="text-xs ${c.diasCobro > 0 ? 'text-blue-600' : 'text-gray-400'}">${c.diasCobro > 0 ? `${c.diasCobro} días de cobro` : 'Sin plazo'}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div><span class="text-gray-500">CUIT:</span> ${escapeHtml(c.cuit || '-')}</div>
                <div><span class="text-gray-500">Condición IVA:</span> ${escapeHtml(c.condicionIVA || '-')}</div>
                <div><span class="text-gray-500">Teléfono:</span> ${escapeHtml(c.telefono || '-')}</div>
                <div><span class="text-gray-500">Email:</span> ${escapeHtml(c.email || '-')}</div>
                <div><span class="text-gray-500">Provincia:</span> ${escapeHtml(c.provincia || '-')}</div>
                <div class="col-span-2"><span class="text-gray-500">Dirección:</span> ${escapeHtml(c.direccion || '-')}</div>
                <div class="col-span-2"><span class="text-gray-500">Contacto:</span> ${escapeHtml(c.contacto || '-')}</div>
            </div>
            <div class="border-t pt-2 mt-2">
                <div class="flex justify-between font-bold text-sm">
                    <span>Total ventas:</span>
                    <span class="text-blue-600">$${formatNumber(totalVentas)}</span>
                </div>
                <div class="flex justify-between font-bold text-sm">
                    <span>Saldo pendiente:</span>
                    <span class="text-red-600">$${formatNumber(saldo.saldo)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Facturas pendientes:</span>
                    <span class="text-yellow-600">${ventasPendientes.length}</span>
                </div>
                ${ventasPendientes.length > 0 ? `
                    <div class="mt-2">
                        <p class="font-bold text-sm">📋 Ventas pendientes:</p>
                        <div class="max-h-32 overflow-y-auto">${ventasHTML}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `, '👤 Detalle del Cliente');
    const guardarBtn = modal.querySelector('#modalGuardar');
    if (guardarBtn) guardarBtn.style.display = 'none';
    const cancelarBtn = modal.querySelector('#modalCancelar');
    if (cancelarBtn) {
        cancelarBtn.textContent = 'Cerrar';
        cancelarBtn.onclick = () => cerrarModal(modal);
    }
};
