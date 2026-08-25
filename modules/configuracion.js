import { getDB, guardarDB, cargarDB, getImpuestosActivos, actualizarImpuesto, agregarImpuestoPersonalizado, eliminarImpuestoPersonalizado, reordenarImpuestos, restablecerFormulasDefault } from './db.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml } from './utils.js';

// ==================== DATOS EMPRESA ====================
function getDatosEmpresa() {
    const db = cargarDB();
    if (db.datosEmpresa) return db.datosEmpresa;
    return {
        nombre: "SOLUM S.A.S.",
        cuit: "30-12345678-9",
        condicionIVA: "IVA Responsable Inscripto",
        email: "info@solum.com.ar",
        telefono: "11-1234-5678",
        direccion: "Av. Corrientes 123, CABA",
        logo: "🏢",
        camposPersonalizados: []
    };
}

function guardarDatosEmpresa(datos) {
    const db = cargarDB();
    db.datosEmpresa = datos;
    guardarDB();
    return true;
}

// ==================== UTILIDADES PARA MODALES ====================
function crearModal(contenido, titulo = '') {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg">
            ${titulo ? `<h2 class="text-xl font-bold mb-4 text-center">${titulo}</h2>` : ''}
            ${contenido}
            <div class="flex gap-3 mt-5">
                <button id="modalGuardar" class="flex-1 bg-green-600 text-white py-2 rounded-xl">✅ Guardar</button>
                <button id="modalCancelar" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function cerrarModal(modal) {
    if (modal) modal.remove();
}

// ==================== RENDER PRINCIPAL ====================
export function renderConfiguracion() {
    const db = cargarDB();
    const datosEmpresa = getDatosEmpresa();
    const impuestos = getImpuestosActivos();
    
    return `
        <div class="space-y-5 fade-in pb-24">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">⚙️ Configuración</h1>
            
            <div class="border-b border-gray-200 dark:border-gray-700">
                <nav class="flex flex-wrap gap-2">
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-blue-600 text-white" data-tab="empresa">🏢 Datos Empresa</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="clientes">👥 Clientes</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="proveedores">🏭 Proveedores</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="costos">💰 Costos Fijos</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="impuestos">🧮 Impuestos</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="backup">💾 Backup</button>
                </nav>
            </div>
            
            <!-- Empresa -->
            <div id="tab-empresa" class="tab-content bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3"><h2 class="font-bold text-white">🏢 Datos de la Empresa</h2></div>
                <div class="p-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium mb-1">Nombre/Razón Social</label><input type="text" id="empresa-nombre" value="${escapeHtml(datosEmpresa.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                        <div><label class="block text-sm font-medium mb-1">CUIT</label><input type="text" id="empresa-cuit" value="${escapeHtml(datosEmpresa.cuit)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                        <div><label class="block text-sm font-medium mb-1">Condición IVA</label><input type="text" id="empresa-condicionIVA" value="${escapeHtml(datosEmpresa.condicionIVA)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                        <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" id="empresa-email" value="${escapeHtml(datosEmpresa.email)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                        <div><label class="block text-sm font-medium mb-1">Teléfono</label><input type="text" id="empresa-telefono" value="${escapeHtml(datosEmpresa.telefono)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Dirección</label><input type="text" id="empresa-direccion" value="${escapeHtml(datosEmpresa.direccion)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                        <div><label class="block text-sm font-medium mb-1">Logo/Emoji</label><input type="text" id="empresa-logo" value="${escapeHtml(datosEmpresa.logo)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                    </div>
                    <div class="mt-4 flex justify-end"><button id="guardar-empresa" class="bg-blue-600 text-white px-6 py-2 rounded-xl">💾 Guardar</button></div>
                </div>
            </div>
            
            <!-- Clientes -->
            <div id="tab-clientes" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 flex justify-between items-center">
                    <h2 class="font-bold text-white">👥 Clientes</h2>
                    <button onclick="window.mostrarModalAgregarCliente()" class="bg-white text-blue-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
                </div>
                <div class="p-4" id="lista-clientes">
                    ${renderClientes(db)}
                </div>
            </div>
            
            <!-- Proveedores -->
            <div id="tab-proveedores" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-teal-600 px-5 py-3 flex justify-between items-center">
                    <h2 class="font-bold text-white">🏭 Proveedores</h2>
                    <button onclick="window.mostrarModalAgregarProveedor()" class="bg-white text-green-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
                </div>
                <div class="p-4" id="lista-proveedores">
                    ${renderProveedores(db)}
                </div>
            </div>
            
            <!-- Costos Fijos -->
            <div id="tab-costos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3 flex justify-between items-center">
                    <h2 class="font-bold text-white">💰 Costos Fijos</h2>
                    <button onclick="window.mostrarModalAgregarCostoFijo()" class="bg-white text-orange-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
                </div>
                <div class="p-4" id="lista-costos">
                    ${renderCostosFijos(db)}
                </div>
            </div>
            
            <!-- Impuestos -->
            <div id="tab-impuestos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-5 py-3 flex justify-between items-center">
                    <h2 class="font-bold text-white">🧮 Impuestos</h2>
                    <button onclick="window.mostrarModalAgregarImpuesto()" class="bg-white text-purple-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
                </div>
                <div class="p-4">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead><tr><th class="px-3 py-2 text-left">Impuesto</th><th class="px-3 py-2 text-left">Alícuota (%)</th><th class="px-3 py-2 text-center">Activo</th><th class="px-3 py-2 text-center">Acción</th></tr></thead>
                            <tbody id="tabla-impuestos">
                                ${impuestos.map(imp => `
                                    <tr data-id="${imp.id}" data-personalizado="${imp.esPersonalizado}">
                                        <td class="px-3 py-2">${escapeHtml(imp.nombre)}</td>
                                        <td class="px-3 py-2"><input type="number" class="impuesto-alicuota w-24 border rounded px-1 py-1 dark:bg-gray-700 dark:border-gray-600" value="${imp.alicuota}" step="0.1"></td>
                                        <td class="px-3 py-2 text-center"><input type="checkbox" class="impuesto-activo" ${imp.activo ? 'checked' : ''}></td>
                                        <td class="px-3 py-2 text-center">
                                            ${imp.esPersonalizado ? `<button onclick="window.eliminarImpuestoPersonalizado('${imp.id}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-sm">🗑️</button>` : '<span class="text-gray-400 text-xs">(predet.)</span>'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="flex gap-2 mt-4"><button id="btn-guardar-impuestos" class="flex-1 bg-blue-600 text-white px-3 py-2 rounded-xl">💾 Guardar</button><button id="btn-restablecer-impuestos" class="flex-1 bg-yellow-600 text-white px-3 py-2 rounded-xl">🔄 Restablecer</button></div>
                </div>
            </div>
            
            <!-- Backup -->
            <div id="tab-backup" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-gray-500 to-gray-700 px-5 py-3"><h2 class="font-bold text-white">💾 Backup</h2></div>
                <div class="p-4">
                    <div class="flex gap-3"><button onclick="window.exportarBackup()" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1">📦 Exportar</button><button onclick="document.getElementById('importFile').click()" class="bg-green-600 text-white px-4 py-2 rounded-xl flex-1">📁 Importar</button></div>
                    <input type="file" id="importFile" class="hidden" accept=".json" onchange="window.importarBackup(this.files[0])">
                </div>
            </div>
        </div>
    `;
}

// ==================== RENDER DE LISTAS ====================
function renderClientes(db) {
    if (!db.clientes || db.clientes.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay clientes</p>';
    }
    return db.clientes.map(c => `
        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
            <div>
                <span class="font-bold">${escapeHtml(c.nombre)}</span>
                <p class="text-xs text-gray-500">${c.telefono || ''} ${c.email ? '| ' + escapeHtml(c.email) : ''} ${c.cuit ? '| CUIT: ' + escapeHtml(c.cuit) : ''}</p>
            </div>
            <div>
                <button onclick="window.editarCliente(${c.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded mr-1 text-sm">✏️</button>
                <button onclick="window.eliminarCliente(${c.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded text-sm">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderProveedores(db) {
    if (!db.proveedores || db.proveedores.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay proveedores</p>';
    }
    return db.proveedores.map(p => `
        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
            <div>
                <span class="font-bold">${escapeHtml(p.nombre)}</span>
                <p class="text-xs text-gray-500">${p.telefono || ''} ${p.email ? '| ' + escapeHtml(p.email) : ''} ${p.cuit ? '| CUIT: ' + escapeHtml(p.cuit) : ''}</p>
            </div>
            <div>
                <button onclick="window.editarProveedor(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded mr-1 text-sm">✏️</button>
                <button onclick="window.eliminarProveedor(${p.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded text-sm">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderCostosFijos(db) {
    const pendientes = db.costosFijos.filter(c => c.estado === 'pendiente');
    if (pendientes.length === 0) {
        return '<p class="text-gray-400 text-center py-4">No hay costos fijos pendientes</p>';
    }
    return pendientes.map(c => `
        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
            <div>
                <span class="font-bold">${escapeHtml(c.nombre)}</span>
                <p class="text-xs text-gray-500">$${formatNumber(c.monto)} • Vence: ${c.vencimiento} ${c.categoria ? '• ' + escapeHtml(c.categoria) : ''}</p>
            </div>
            <div>
                <button onclick="window.editarCostoFijo(${c.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded mr-1 text-sm">✏️</button>
                <button onclick="window.pagarCostoFijo(${c.id})" class="bg-green-600 text-white px-3 py-1 rounded mr-1 text-sm">Pagar</button>
                <button onclick="window.eliminarCostoFijo(${c.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded text-sm">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ==================== INICIALIZAR EVENTOS ====================
export function initConfiguracionEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('bg-blue-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-300');
            });
            document.getElementById(`tab-${tabId}`)?.classList.remove('hidden');
            btn.classList.remove('bg-gray-200', 'text-gray-700');
            btn.classList.add('bg-blue-600', 'text-white');
        });
    });
    
    // Guardar empresa
    document.getElementById('guardar-empresa')?.addEventListener('click', () => {
        const datos = {
            nombre: document.getElementById('empresa-nombre')?.value || '',
            cuit: document.getElementById('empresa-cuit')?.value || '',
            condicionIVA: document.getElementById('empresa-condicionIVA')?.value || '',
            email: document.getElementById('empresa-email')?.value || '',
            telefono: document.getElementById('empresa-telefono')?.value || '',
            direccion: document.getElementById('empresa-direccion')?.value || '',
            logo: document.getElementById('empresa-logo')?.value || '🏢',
            camposPersonalizados: []
        };
        guardarDatosEmpresa(datos);
        mostrarNotificacion('Datos guardados', 'success');
    });
    
    // Guardar impuestos
    document.getElementById('btn-guardar-impuestos')?.addEventListener('click', () => {
        const rows = document.querySelectorAll('#tabla-impuestos tr');
        for (const row of rows) {
            const id = row.dataset.id;
            const esPersonalizado = row.dataset.personalizado === 'true';
            const alicuota = parseFloat(row.querySelector('.impuesto-alicuota')?.value);
            const activo = row.querySelector('.impuesto-activo')?.checked;
            if (id && !isNaN(alicuota)) {
                actualizarImpuesto(id, { alicuota, activo }, esPersonalizado);
            }
        }
        mostrarNotificacion('Impuestos guardados', 'success');
        window.dispatchEvent(new Event('refreshView'));
    });
    
    document.getElementById('btn-restablecer-impuestos')?.addEventListener('click', () => {
        if (confirm('¿Restablecer impuestos a valores por defecto?')) {
            restablecerFormulasDefault();
            mostrarNotificacion('Impuestos restablecidos', 'success');
            window.dispatchEvent(new Event('refreshView'));
        }
    });
}

// ==================== FUNCIONES GLOBALES ====================

// ---------- CLIENTES ----------
window.mostrarModalAgregarCliente = () => {
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="cliente-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="cliente-cuit" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="30-12345678-9"></div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="cliente-telefono" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="cliente-email" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="cliente-direccion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="cliente-contacto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de cobro</label><input type="number" id="cliente-diasCobro" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="30"></div>
        </div>
    `, '👤 Nuevo Cliente');
    
    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#cliente-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        const db = getDB();
        db.clientes.push({
            id: generarId(),
            nombre,
            cuit: modal.querySelector('#cliente-cuit').value || '',
            telefono: modal.querySelector('#cliente-telefono').value || '',
            email: modal.querySelector('#cliente-email').value || '',
            direccion: modal.querySelector('#cliente-direccion').value || '',
            contacto: modal.querySelector('#cliente-contacto').value || '',
            diasCobro: parseInt(modal.querySelector('#cliente-diasCobro').value) || 30,
            saldo: 0
        });
        guardarDB();
        mostrarNotificacion('Cliente agregado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

window.editarCliente = (id) => {
    const db = getDB();
    const c = db.clientes.find(x => x.id === id);
    if (!c) return;
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="cliente-nombre" value="${escapeHtml(c.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="cliente-cuit" value="${escapeHtml(c.cuit || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="cliente-telefono" value="${escapeHtml(c.telefono || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="cliente-email" value="${escapeHtml(c.email || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="cliente-direccion" value="${escapeHtml(c.direccion || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="cliente-contacto" value="${escapeHtml(c.contacto || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de cobro</label><input type="number" id="cliente-diasCobro" value="${c.diasCobro || 30}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
        </div>
    `, '✏️ Editar Cliente');
    
    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#cliente-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        c.nombre = nombre;
        c.cuit = modal.querySelector('#cliente-cuit').value || '';
        c.telefono = modal.querySelector('#cliente-telefono').value || '';
        c.email = modal.querySelector('#cliente-email').value || '';
        c.direccion = modal.querySelector('#cliente-direccion').value || '';
        c.contacto = modal.querySelector('#cliente-contacto').value || '';
        c.diasCobro = parseInt(modal.querySelector('#cliente-diasCobro').value) || 30;
        guardarDB();
        mostrarNotificacion('Cliente actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

window.eliminarCliente = (id) => {
    if (confirm('¿Eliminar este cliente?')) {
        const db = getDB();
        db.clientes = db.clientes.filter(c => c.id !== id);
        guardarDB();
        mostrarNotificacion('Cliente eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ---------- PROVEEDORES ----------
window.mostrarModalAgregarProveedor = () => {
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="prov-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="prov-cuit" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="30-12345678-9"></div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="prov-telefono" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="prov-email" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="prov-direccion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="prov-contacto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de pago</label><input type="number" id="prov-diasPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="15"></div>
        </div>
    `, '🏭 Nuevo Proveedor');
    
    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#prov-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        const db = getDB();
        db.proveedores.push({
            id: generarId(),
            nombre,
            cuit: modal.querySelector('#prov-cuit').value || '',
            telefono: modal.querySelector('#prov-telefono').value || '',
            email: modal.querySelector('#prov-email').value || '',
            direccion: modal.querySelector('#prov-direccion').value || '',
            contacto: modal.querySelector('#prov-contacto').value || '',
            diasPago: parseInt(modal.querySelector('#prov-diasPago').value) || 15,
            saldo: 0
        });
        guardarDB();
        mostrarNotificacion('Proveedor agregado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

window.editarProveedor = (id) => {
    const db = getDB();
    const p = db.proveedores.find(x => x.id === id);
    if (!p) return;
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="prov-nombre" value="${escapeHtml(p.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">CUIT</label><input type="text" id="prov-cuit" value="${escapeHtml(p.cuit || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="prov-telefono" value="${escapeHtml(p.telefono || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Email</label><input type="email" id="prov-email" value="${escapeHtml(p.email || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Dirección</label><input type="text" id="prov-direccion" value="${escapeHtml(p.direccion || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Contacto</label><input type="text" id="prov-contacto" value="${escapeHtml(p.contacto || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Días de pago</label><input type="number" id="prov-diasPago" value="${p.diasPago || 15}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
        </div>
    `, '✏️ Editar Proveedor');
    
    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#prov-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'error'); return; }
        p.nombre = nombre;
        p.cuit = modal.querySelector('#prov-cuit').value || '';
        p.telefono = modal.querySelector('#prov-telefono').value || '';
        p.email = modal.querySelector('#prov-email').value || '';
        p.direccion = modal.querySelector('#prov-direccion').value || '';
        p.contacto = modal.querySelector('#prov-contacto').value || '';
        p.diasPago = parseInt(modal.querySelector('#prov-diasPago').value) || 15;
        guardarDB();
        mostrarNotificacion('Proveedor actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

window.eliminarProveedor = (id) => {
    if (confirm('¿Eliminar este proveedor?')) {
        const db = getDB();
        db.proveedores = db.proveedores.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion('Proveedor eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ---------- COSTOS FIJOS ----------
window.mostrarModalAgregarCostoFijo = () => {
    const fechaActual = new Date().toISOString().split('T')[0];
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="costo-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Monto *</label><input type="number" id="costo-monto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"></div>
            <div><label class="block text-sm font-medium">Categoría</label><input type="text" id="costo-categoria" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Impuestos, Servicios, Alquiler..."></div>
            <div><label class="block text-sm font-medium">Vencimiento</label><input type="date" id="costo-vencimiento" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${fechaActual}"></div>
            <div><label class="flex items-center gap-2"><input type="checkbox" id="costo-recurrente"> Recurrente (mensual)</label></div>
        </div>
    `, '💰 Nuevo Costo Fijo');
    
    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#costo-nombre').value.trim();
        const monto = parseFloat(modal.querySelector('#costo-monto').value);
        if (!nombre || isNaN(monto) || monto <= 0) {
            mostrarNotificacion('Nombre y monto válidos', 'error');
            return;
        }
        const db = getDB();
        db.costosFijos.push({
            id: generarId(),
            nombre,
            monto,
            vencimiento: modal.querySelector('#costo-vencimiento').value || new Date().toISOString().split('T')[0],
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

window.editarCostoFijo = (id) => {
    const db = getDB();
    const c = db.costosFijos.find(x => x.id === id);
    if (!c) return;
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="costo-nombre" value="${escapeHtml(c.nombre)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Monto *</label><input type="number" id="costo-monto" value="${c.monto}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"></div>
            <div><label class="block text-sm font-medium">Categoría</label><input type="text" id="costo-categoria" value="${escapeHtml(c.categoria || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="block text-sm font-medium">Vencimiento</label><input type="date" id="costo-vencimiento" value="${c.vencimiento || ''}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
            <div><label class="flex items-center gap-2"><input type="checkbox" id="costo-recurrente" ${c.recurrente ? 'checked' : ''}> Recurrente (mensual)</label></div>
        </div>
    `, '✏️ Editar Costo Fijo');
    
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
        c.vencimiento = modal.querySelector('#costo-vencimiento').value || new Date().toISOString().split('T')[0];
        c.recurrente = modal.querySelector('#costo-recurrente').checked;
        guardarDB();
        mostrarNotificacion('Costo fijo actualizado', 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

window.pagarCostoFijo = (id) => {
    const db = getDB();
    const costo = db.costosFijos.find(c => c.id === id);
    if (!costo) return;
    costo.estado = 'pagado';
    costo.fechaPago = new Date().toISOString().split('T')[0];
    if (costo.recurrente) {
        const nuevaFecha = new Date(costo.vencimiento);
        nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
        db.costosFijos.push({
            id: generarId(),
            nombre: costo.nombre,
            monto: costo.monto,
            vencimiento: nuevaFecha.toISOString().split('T')[0],
            estado: 'pendiente',
            categoria: costo.categoria,
            recurrente: true
        });
    }
    guardarDB();
    mostrarNotificacion(`Pagado: ${costo.nombre}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

window.eliminarCostoFijo = (id) => {
    if (confirm('¿Eliminar este costo fijo?')) {
        const db = getDB();
        db.costosFijos = db.costosFijos.filter(c => c.id !== id);
        guardarDB();
        mostrarNotificacion('Costo fijo eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ---------- IMPUESTOS ----------
window.mostrarModalAgregarImpuesto = () => {
    const modal = crearModal(`
        <div class="space-y-3">
            <div><label class="block text-sm font-medium">Nombre *</label><input type="text" id="imp-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: IVA 10.5%"></div>
            <div><label class="block text-sm font-medium">Alícuota (%) *</label><input type="number" id="imp-alicuota" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.1" value="5"></div>
            <div><label class="block text-sm font-medium">Base de cálculo</label>
                <select id="imp-base" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="venta">Sobre venta</option>
                    <option value="utilidadAntesGanancias">Sobre utilidad antes de ganancias</option>
                    <option value="despuesGanancias">Sobre después de ganancias</option>
                </select>
            </div>
        </div>
    `, '🧮 Nuevo Impuesto Personalizado');
    
    modal.querySelector('#modalGuardar').onclick = () => {
        const nombre = modal.querySelector('#imp-nombre').value.trim();
        const alicuota = parseFloat(modal.querySelector('#imp-alicuota').value);
        const baseCalculo = modal.querySelector('#imp-base').value;
        if (!nombre || isNaN(alicuota) || alicuota <= 0) {
            mostrarNotificacion('Nombre y alícuota válidos', 'error');
            return;
        }
        const nuevo = agregarImpuestoPersonalizado({ nombre, alicuota, baseCalculo });
        if (nuevo) {
            mostrarNotificacion('Impuesto agregado', 'success');
            cerrarModal(modal);
            window.dispatchEvent(new Event('refreshView'));
        } else {
            mostrarNotificacion('Error al agregar impuesto', 'error');
        }
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

window.eliminarImpuestoPersonalizado = (id) => {
    if (confirm('¿Eliminar este impuesto personalizado?')) {
        eliminarImpuestoPersonalizado(id);
        mostrarNotificacion('Impuesto eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ---------- BACKUP ----------
window.exportarBackup = () => {
    const db = getDB();
    const backup = JSON.stringify(db, null, 2);
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erp_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    mostrarNotificacion('Backup exportado', 'success');
};

window.importarBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.clientes) {
                localStorage.clear();
                Object.keys(data).forEach(k => localStorage.setItem(k, JSON.stringify(data[k])));
                mostrarNotificacion('Backup importado', 'success');
                window.location.reload();
            } else {
                mostrarNotificacion('Archivo inválido', 'error');
            }
        } catch(err) {
            mostrarNotificacion('Error al importar', 'error');
        }
    };
    reader.readAsText(file);
};

// ---------- EJEMPLOS ----------
window.cargarDatosEjemplo = () => {
    if (confirm('¿Cargar datos de ejemplo?')) {
        const db = getDB();
        if (db.clientes.length <= 1) {
            db.clientes.push({ id: generarId(), nombre: 'Tech Solutions SA', telefono: '3874123456', email: 'ventas@techsol.com', cuit: '30-12345678-9', direccion: 'Av. San Martin 123', contacto: 'Juan', diasCobro: 30, saldo: 0 });
            db.proveedores.push({ id: generarId(), nombre: 'Mayorista Center', telefono: '3874223344', email: 'ventas@mayorista.com', cuit: '30-98765432-1', direccion: 'Av. Belgrano 456', contacto: 'Maria', diasPago: 15, saldo: 0 });
            const fecha = new Date().toISOString().split('T')[0];
            const mes = fecha.substring(0, 7);
            db.ventas.push({ id: generarId(), clienteNombre: 'Tech Solutions SA', total: 250000, montoNeto: 206611, ivaMonto: 43389, fechaVenta: fecha, mes, estado: 'pendiente_cobro' });
            db.compras.push({ id: generarId(), proveedorNombre: 'Mayorista Center', total: 150000, montoNeto: 123967, ivaMonto: 26033, fechaCompra: fecha, mes, estado: 'pendiente_pago' });
            guardarDB();
            mostrarNotificacion('Datos de ejemplo cargados', 'success');
            window.dispatchEvent(new Event('refreshView'));
        } else {
            mostrarNotificacion('Ya hay datos', 'info');
        }
    }
};

// ==================== BOTONES ADICIONALES ====================
export function agregarBotonActualizacion() {
    setTimeout(() => {
        const container = document.querySelector('.bg-white.dark\\:bg-gray-800.rounded-2xl.p-5.shadow-lg');
        if (container && !document.getElementById('btnActualizacionManual')) {
            const btnHtml = `
                <div class="mt-4 pt-3 border-t dark:border-gray-700">
                    <button id="btnActualizacionManual" onclick="window.forzarActualizacion()" class="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2">
                        🔄 Buscar actualizaciones
                    </button>
                    <p class="text-xs text-gray-400 text-center mt-2">Versión actual: ${localStorage.getItem('app_version') || '6.0.0'}</p>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', btnHtml);
        }
    }, 500);
}

export function agregarBotonEjemplos() {
    setTimeout(() => {
        const container = document.querySelector('.bg-white.dark\\:bg-gray-800.rounded-2xl.p-5.shadow-lg');
        if (container && !document.getElementById('btnCargarEjemplos')) {
            const btnHtml = `
                <div class="mt-4 pt-3 border-t dark:border-gray-700">
                    <button id="btnCargarEjemplos" onclick="window.cargarDatosEjemplo()" class="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2">
                        📦 Cargar datos de ejemplo
                    </button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', btnHtml);
        }
    }, 500);
}
