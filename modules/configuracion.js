import { getDB, guardarDB, cargarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';

// ========== EXPORTACIÓN PRINCIPAL ==========
export function agregarBotonActualizacion() {
    setTimeout(() => {
        const container = document.querySelector('.bg-white.dark\\:bg-gray-800.rounded-2xl.p-5.shadow-lg');
        if (container && !document.getElementById('btnActualizacionManual')) {
            const btnHtml = `
                <div class="mt-4 pt-3 border-t dark:border-gray-700">
                    <button id="btnActualizacionManual" onclick="window.forzarActualizacion()" class="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2">
                        🔄 Buscar actualizaciones
                    </button>
                    <p class="text-xs text-gray-400 text-center mt-2">Versión actual: ${localStorage.getItem('app_version') || '4.3.2'}</p>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', btnHtml);
        }
    }, 500);
}

export function renderConfiguracion() {
    const db = cargarDB();
    const darkMode = localStorage.getItem('darkMode') === 'true';
    
    return `
        <div class="space-y-5 fade-in pb-24">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">⚙️ Configuración</h1>
            
            <!-- Clientes -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">👥</span> Clientes</h2>
                </div>
                <div class="p-4">
                    ${db.clientes.map(c => `
                        <div class="border-b dark:border-gray-700 py-3">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="font-bold text-gray-800 dark:text-white">${c.nombre}</span>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        <span>📞 ${c.telefono || '-'}</span>
                                        <span>📧 ${c.email || '-'}</span>
                                        <span>🏠 ${c.direccion || '-'}</span>
                                        <span>📱 WhatsApp: ${c.whatsapp || '-'}</span>
                                        <span>🏦 CBU: ${c.cbu || '-'}</span>
                                        <span>👤 Contacto: ${c.contacto || '-'}</span>
                                        <span>📅 Días cobro: ${c.diasCobro}</span>
                                        <span>💰 Saldo: $${formatNumber(c.saldo)}</span>
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.editarCliente(${c.id})" class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm">✏️ Editar</button>
                                    <button onclick="window.eliminarCliente(${c.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <button onclick="window.mostrarModalAgregarCliente()" class="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-all w-full">+ Agregar Cliente</button>
                </div>
            </div>
            
            <!-- Proveedores -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-teal-600 px-5 py-3">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">🏭</span> Proveedores</h2>
                </div>
                <div class="p-4">
                    ${db.proveedores.map(p => `
                        <div class="border-b dark:border-gray-700 py-3">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="font-bold text-gray-800 dark:text-white">${p.nombre}</span>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        <span>📞 ${p.telefono || '-'}</span>
                                        <span>📧 ${p.email || '-'}</span>
                                        <span>🏠 ${p.direccion || '-'}</span>
                                        <span>🏦 CBU: ${p.cbu || '-'}</span>
                                        <span>👤 Contacto: ${p.contacto || '-'}</span>
                                        <span>📅 Días pago: ${p.diasPago}</span>
                                        <span>💰 Saldo: $${formatNumber(p.saldo)}</span>
                                        <span>🏷️ Rubro: ${p.rubro || '-'}</span>
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.editarProveedor(${p.id})" class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm">✏️ Editar</button>
                                    <button onclick="window.eliminarProveedor(${p.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <button onclick="window.mostrarModalAgregarProveedor()" class="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition-all w-full">+ Agregar Proveedor</button>
                </div>
            </div>
            
            <!-- Costos Fijos -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">💰</span> Costos Fijos</h2>
                </div>
                <div class="p-4">
                    ${db.costosFijos.filter(cf => cf.estado === 'pendiente').map(cf => `
                        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                            <div>
                                <span class="font-medium text-gray-800 dark:text-white">${cf.nombre}</span>
                                <p class="text-xs text-gray-500">$${formatNumber(cf.monto)} • Vence: ${cf.vencimiento}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window.pagarCostoFijo(${cf.id})" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl text-sm">Pagar</button>
                                <button onclick="window.eliminarCostoFijo(${cf.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm">🗑️</button>
                            </div>
                        </div>
                    `).join('') || '<p class="text-gray-500 text-center py-4">No hay costos fijos pendientes</p>'}
                    <button onclick="window.mostrarModalAgregarCostoFijo()" class="mt-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl transition-all w-full">+ Agregar Costo Fijo</button>
                </div>
            </div>
            
            <!-- Backup -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
                <h2 class="font-bold mb-3">💾 Backup</h2>
                <div class="flex gap-3">
                    <button onclick="window.exportarBackup()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex-1">📦 Exportar</button>
                    <button onclick="document.getElementById('importFile').click()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl flex-1">📁 Importar</button>
                </div>
                <input type="file" id="importFile" class="hidden" accept=".json" onchange="window.importarBackup(this.files[0])">
            </div>
            
            <!-- Notificaciones -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
                <h2 class="font-bold mb-3">📋 Notificaciones</h2>
                <div class="max-h-48 overflow-y-auto space-y-2">
                    ${db.notificaciones.slice(0, 10).map(n => `
                        <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-2 text-sm">
                            ${n.mensaje}
                            <span class="text-xs text-gray-400 ml-2">${n.fecha}</span>
                        </div>
                    `).join('') || '<p class="text-gray-500 text-center py-4">Sin notificaciones</p>'}
                </div>
                <button onclick="window.limpiarNotificaciones()" class="mt-3 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-xl w-full">Limpiar notificaciones</button>
            </div>
            
            <!-- Apariencia -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
                <h2 class="font-bold mb-3">🌓 Apariencia</h2>
                <button onclick="window.toggleDarkModeGlobal()" class="w-full bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-4 py-2 rounded-xl transition">
                    ${darkMode ? '☀️ Cambiar a Modo Claro' : '🌙 Cambiar a Modo Oscuro'}
                </button>
            </div>
        </div>`;
}

export function initConfiguracionEvents() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) document.body.classList.add('dark');
}

// ========== FUNCIONES GLOBALES ==========
window.eliminarCliente = (id) => {
    if (confirm("⚠️ ¿Eliminar este cliente?")) {
        const db = getDB();
        db.clientes = db.clientes.filter(c => c.id !== id);
        guardarDB();
        mostrarNotificacion("🗑️ Cliente eliminado", 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.editarCliente = (id) => {
    const db = getDB();
    const cliente = db.clientes.find(c => c.id === id);
    if (!cliente) return;
    
    document.getElementById('root').innerHTML = `
        <div class="modal"><div class="modal-content w-full max-w-md"><h2 class="text-xl font-bold mb-4">✏️ Editar Cliente</h2>
        <div class="space-y-3"><input type="text" id="nombre" value="${cliente.nombre}" class="w-full p-3 border rounded-xl"><input type="text" id="cuit" value="${cliente.cuit || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="telefono" value="${cliente.telefono || ''}" class="w-full p-3 border rounded-xl"><input type="email" id="email" value="${cliente.email || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="direccion" value="${cliente.direccion || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="contacto" value="${cliente.contacto || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="whatsapp" value="${cliente.whatsapp || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="cbu" value="${cliente.cbu || ''}" class="w-full p-3 border rounded-xl"><input type="number" id="diasCobro" value="${cliente.diasCobro}" class="w-full p-3 border rounded-xl"></div>
        <div class="flex gap-3 mt-5"><button id="guardarEditBtn" class="bg-green-600 text-white py-3 rounded-xl flex-1">Guardar</button><button id="cancelarEditBtn" class="bg-gray-300 py-3 rounded-xl flex-1">Cancelar</button></div></div></div>`;
    
    document.getElementById('guardarEditBtn').onclick = () => {
        const dbActual = getDB();
        const index = dbActual.clientes.findIndex(c => c.id === id);
        if (index !== -1) {
            dbActual.clientes[index] = { ...dbActual.clientes[index], nombre: document.getElementById('nombre').value, cuit: document.getElementById('cuit').value, telefono: document.getElementById('telefono').value, email: document.getElementById('email').value, direccion: document.getElementById('direccion').value, contacto: document.getElementById('contacto').value, whatsapp: document.getElementById('whatsapp').value, cbu: document.getElementById('cbu').value, diasCobro: parseInt(document.getElementById('diasCobro').value) || 30 };
            guardarDB();
            mostrarNotificacion("✅ Cliente actualizado", 'success');
            window.dispatchEvent(new Event('refreshView'));
        }
    };
    document.getElementById('cancelarEditBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

window.eliminarProveedor = (id) => {
    if (confirm("⚠️ ¿Eliminar este proveedor?")) {
        const db = getDB();
        db.proveedores = db.proveedores.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion("🗑️ Proveedor eliminado", 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.editarProveedor = (id) => {
    const db = getDB();
    const proveedor = db.proveedores.find(p => p.id === id);
    if (!proveedor) return;
    
    document.getElementById('root').innerHTML = `
        <div class="modal"><div class="modal-content w-full max-w-md"><h2 class="text-xl font-bold mb-4">✏️ Editar Proveedor</h2>
        <div class="space-y-3"><input type="text" id="nombre" value="${proveedor.nombre}" class="w-full p-3 border rounded-xl"><input type="text" id="cuit" value="${proveedor.cuit || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="telefono" value="${proveedor.telefono || ''}" class="w-full p-3 border rounded-xl"><input type="email" id="email" value="${proveedor.email || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="direccion" value="${proveedor.direccion || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="contacto" value="${proveedor.contacto || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="cbu" value="${proveedor.cbu || ''}" class="w-full p-3 border rounded-xl"><input type="text" id="rubro" value="${proveedor.rubro || ''}" class="w-full p-3 border rounded-xl"><input type="number" id="diasPago" value="${proveedor.diasPago}" class="w-full p-3 border rounded-xl"></div>
        <div class="flex gap-3 mt-5"><button id="guardarEditBtn" class="bg-green-600 text-white py-3 rounded-xl flex-1">Guardar</button><button id="cancelarEditBtn" class="bg-gray-300 py-3 rounded-xl flex-1">Cancelar</button></div></div></div>`;
    
    document.getElementById('guardarEditBtn').onclick = () => {
        const dbActual = getDB();
        const index = dbActual.proveedores.findIndex(p => p.id === id);
        if (index !== -1) {
            dbActual.proveedores[index] = { ...dbActual.proveedores[index], nombre: document.getElementById('nombre').value, cuit: document.getElementById('cuit').value, telefono: document.getElementById('telefono').value, email: document.getElementById('email').value, direccion: document.getElementById('direccion').value, contacto: document.getElementById('contacto').value, cbu: document.getElementById('cbu').value, rubro: document.getElementById('rubro').value, diasPago: parseInt(document.getElementById('diasPago').value) || 30 };
            guardarDB();
            mostrarNotificacion("✅ Proveedor actualizado", 'success');
            window.dispatchEvent(new Event('refreshView'));
        }
    };
    document.getElementById('cancelarEditBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

window.eliminarCostoFijo = (id) => {
    if (confirm("⚠️ ¿Eliminar este costo fijo?")) {
        const db = getDB();
        db.costosFijos = db.costosFijos.filter(c => c.id !== id);
        guardarDB();
        mostrarNotificacion("🗑️ Costo fijo eliminado", 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.pagarCostoFijo = (id) => {
    const db = getDB();
    const costo = db.costosFijos.find(c => c.id === id);
    if (!costo) return;
    
    document.getElementById('root').innerHTML = `
        <div class="modal"><div class="modal-content"><h2 class="text-xl font-bold mb-4">💰 Pagar ${costo.nombre}</h2>
        <p>Monto: $${formatNumber(costo.monto)} | Vence: ${costo.vencimiento}</p>
        <input type="date" id="fechaPago" value="${new Date().toISOString().split('T')[0]}" class="w-full p-3 border rounded-xl my-2">
        <input type="text" id="comprobante" placeholder="Comprobante" class="w-full p-3 border rounded-xl">
        <div class="flex gap-3 mt-5"><button id="confirmarPagoBtn" class="bg-green-600 text-white py-3 rounded-xl flex-1">Pagar</button><button id="cancelarPagoBtn" class="bg-gray-300 py-3 rounded-xl flex-1">Cancelar</button></div></div></div>`;
    
    document.getElementById('confirmarPagoBtn').onclick = () => {
        const dbActual = getDB();
        const costoActual = dbActual.costosFijos.find(c => c.id === id);
        if (costoActual) {
            costoActual.estado = 'pagado';
            costoActual.fechaPago = document.getElementById('fechaPago').value;
            costoActual.comprobante = document.getElementById('comprobante').value;
            if (costoActual.recurrente) {
                const nuevaFecha = new Date(costoActual.vencimiento);
                nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
                dbActual.costosFijos.push({ id: generarId(), nombre: costoActual.nombre, monto: costoActual.monto, vencimiento: nuevaFecha.toISOString().split('T')[0], estado: 'pendiente', categoria: costoActual.categoria, recurrente: true });
            }
            guardarDB();
            mostrarNotificacion(`✅ Pagado: ${costoActual.nombre}`, 'success');
            window.dispatchEvent(new Event('refreshView'));
        }
    };
    document.getElementById('cancelarPagoBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

window.mostrarModalAgregarCliente = () => {
    document.getElementById('root').innerHTML = `<div class="modal"><div class="modal-content w-full max-w-md"><h2 class="text-xl font-bold mb-4">👤 Agregar Cliente</h2>
    <div class="space-y-3"><input type="text" id="nombre" placeholder="Nombre *" class="w-full p-3 border rounded-xl"><input type="text" id="cuit" placeholder="CUIT" class="w-full p-3 border rounded-xl"><input type="text" id="telefono" placeholder="Teléfono" class="w-full p-3 border rounded-xl"><input type="email" id="email" placeholder="Email" class="w-full p-3 border rounded-xl"><input type="text" id="direccion" placeholder="Dirección" class="w-full p-3 border rounded-xl"><input type="text" id="contacto" placeholder="Contacto" class="w-full p-3 border rounded-xl"><input type="text" id="whatsapp" placeholder="WhatsApp" class="w-full p-3 border rounded-xl"><input type="text" id="cbu" placeholder="CBU" class="w-full p-3 border rounded-xl"><input type="number" id="diasCobro" placeholder="Días cobro" value="30" class="w-full p-3 border rounded-xl"></div>
    <div class="flex gap-3 mt-5"><button id="guardarClienteBtn" class="bg-green-600 text-white py-3 rounded-xl flex-1">Guardar</button><button id="cancelarBtn" class="bg-gray-300 py-3 rounded-xl flex-1">Cancelar</button></div></div></div>`;
    
    document.getElementById('guardarClienteBtn').onclick = () => {
        const nombre = document.getElementById('nombre').value;
        if (!nombre) { mostrarNotificacion("Nombre requerido", 'error'); return; }
        const db = getDB();
        db.clientes.push({ id: generarId(), nombre, cuit: document.getElementById('cuit').value, telefono: document.getElementById('telefono').value, email: document.getElementById('email').value, direccion: document.getElementById('direccion').value, contacto: document.getElementById('contacto').value, whatsapp: document.getElementById('whatsapp').value, cbu: document.getElementById('cbu').value, diasCobro: parseInt(document.getElementById('diasCobro').value) || 30, saldo: 0 });
        guardarDB();
        mostrarNotificacion(`✅ Cliente ${nombre} agregado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    document.getElementById('cancelarBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

window.mostrarModalAgregarProveedor = () => {
    document.getElementById('root').innerHTML = `<div class="modal"><div class="modal-content w-full max-w-md"><h2 class="text-xl font-bold mb-4">🏭 Agregar Proveedor</h2>
    <div class="space-y-3"><input type="text" id="nombre" placeholder="Nombre *" class="w-full p-3 border rounded-xl"><input type="text" id="cuit" placeholder="CUIT" class="w-full p-3 border rounded-xl"><input type="text" id="telefono" placeholder="Teléfono" class="w-full p-3 border rounded-xl"><input type="email" id="email" placeholder="Email" class="w-full p-3 border rounded-xl"><input type="text" id="direccion" placeholder="Dirección" class="w-full p-3 border rounded-xl"><input type="text" id="contacto" placeholder="Contacto" class="w-full p-3 border rounded-xl"><input type="text" id="cbu" placeholder="CBU" class="w-full p-3 border rounded-xl"><input type="text" id="rubro" placeholder="Rubro" class="w-full p-3 border rounded-xl"><input type="number" id="diasPago" placeholder="Días pago" value="30" class="w-full p-3 border rounded-xl"></div>
    <div class="flex gap-3 mt-5"><button id="guardarProveedorBtn" class="bg-green-600 text-white py-3 rounded-xl flex-1">Guardar</button><button id="cancelarBtn" class="bg-gray-300 py-3 rounded-xl flex-1">Cancelar</button></div></div></div>`;
    
    document.getElementById('guardarProveedorBtn').onclick = () => {
        const nombre = document.getElementById('nombre').value;
        if (!nombre) { mostrarNotificacion("Nombre requerido", 'error'); return; }
        const db = getDB();
        db.proveedores.push({ id: generarId(), nombre, cuit: document.getElementById('cuit').value, telefono: document.getElementById('telefono').value, email: document.getElementById('email').value, direccion: document.getElementById('direccion').value, contacto: document.getElementById('contacto').value, cbu: document.getElementById('cbu').value, rubro: document.getElementById('rubro').value, diasPago: parseInt(document.getElementById('diasPago').value) || 30, saldo: 0 });
        guardarDB();
        mostrarNotificacion(`✅ Proveedor ${nombre} agregado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    document.getElementById('cancelarBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

window.mostrarModalAgregarCostoFijo = () => {
    const db = getDB();
    document.getElementById('root').innerHTML = `<div class="modal"><div class="modal-content w-full max-w-md"><h2 class="text-xl font-bold mb-4">💰 Agregar Costo Fijo</h2>
    <div class="space-y-3"><input type="text" id="nombre" placeholder="Nombre" class="w-full p-3 border rounded-xl"><input type="number" id="monto" placeholder="Monto" class="w-full p-3 border rounded-xl"><input type="date" id="vencimiento" class="w-full p-3 border rounded-xl"><select id="categoria" class="w-full p-3 border rounded-xl">${db.categoriasGastos.map(c => `<option value="${c}">${c}</option>`).join('')}</select><label class="flex items-center gap-2"><input type="checkbox" id="recurrente"> Recurrente (mensual)</label></div>
    <div class="flex gap-3 mt-5"><button id="guardarCostoBtn" class="bg-green-600 text-white py-3 rounded-xl flex-1">Guardar</button><button id="cancelarBtn" class="bg-gray-300 py-3 rounded-xl flex-1">Cancelar</button></div></div></div>`;
    
    document.getElementById('guardarCostoBtn').onclick = () => {
        const nombre = document.getElementById('nombre').value;
        const monto = parseFloat(document.getElementById('monto').value);
        if (!nombre || isNaN(monto)) { mostrarNotificacion("Complete los datos", 'error'); return; }
        const db = getDB();
        db.costosFijos.push({ id: generarId(), nombre, monto, vencimiento: document.getElementById('vencimiento').value, categoria: document.getElementById('categoria').value, recurrente: document.getElementById('recurrente').checked, estado: 'pendiente' });
        guardarDB();
        mostrarNotificacion(`✅ Costo fijo ${nombre} agregado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    document.getElementById('cancelarBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

window.exportarBackup = () => {
    const db = getDB();
    const backup = { ...db, fechaBackup: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erp_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    mostrarNotificacion("📦 Backup exportado", 'success');
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
                mostrarNotificacion("✅ Backup importado", 'success');
                window.location.reload();
            } else {
                mostrarNotificacion("Archivo inválido", 'error');
            }
        } catch(err) {
            mostrarNotificacion("Error al importar", 'error');
        }
    };
    reader.readAsText(file);
};

window.limpiarNotificaciones = () => {
    const db = getDB();
    db.notificaciones = [];
    guardarDB();
    mostrarNotificacion("Notificaciones limpiadas", 'info');
    window.dispatchEvent(new Event('refreshView'));
};

window.toggleDarkModeGlobal = () => {
    const isDark = document.body.classList.contains('dark');
    if (isDark) document.body.classList.remove('dark');
    else document.body.classList.add('dark');
    localStorage.setItem('darkMode', !isDark);
};
