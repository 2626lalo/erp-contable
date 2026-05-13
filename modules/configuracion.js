import { getDB, guardarDB, cargarDB, getImpuestosActivos, actualizarImpuesto, agregarImpuestoPersonalizado, eliminarImpuestoPersonalizado, reordenarImpuestos, restablecerFormulasDefault } from './db.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml } from './utils.js';

// Datos empresa
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

// Exportar funciones de UI
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

// Render principal
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
                        <div><label class="block text-sm font-medium mb-1">Nombre/Razón Social</label><input type="text" id="empresa-nombre" value="${escapeHtml(datosEmpresa.nombre)}" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block text-sm font-medium mb-1">CUIT</label><input type="text" id="empresa-cuit" value="${escapeHtml(datosEmpresa.cuit)}" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block text-sm font-medium mb-1">Condición IVA</label><input type="text" id="empresa-condicionIVA" value="${escapeHtml(datosEmpresa.condicionIVA)}" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" id="empresa-email" value="${escapeHtml(datosEmpresa.email)}" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block text-sm font-medium mb-1">Teléfono</label><input type="text" id="empresa-telefono" value="${escapeHtml(datosEmpresa.telefono)}" class="w-full p-2 border rounded-lg"></div>
                        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Dirección</label><input type="text" id="empresa-direccion" value="${escapeHtml(datosEmpresa.direccion)}" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block text-sm font-medium mb-1">Logo/Emoji</label><input type="text" id="empresa-logo" value="${escapeHtml(datosEmpresa.logo)}" class="w-full p-2 border rounded-lg"></div>
                    </div>
                    <div class="mt-4 flex justify-end"><button id="guardar-empresa" class="bg-blue-600 text-white px-6 py-2 rounded-xl">💾 Guardar</button></div>
                </div>
            </div>
            
            <!-- Clientes -->
            <div id="tab-clientes" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3"><h2 class="font-bold text-white">👥 Clientes</h2></div>
                <div class="p-4">
                    ${db.clientes.map(c => `
                        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                            <div><span class="font-bold">${escapeHtml(c.nombre)}</span><p class="text-xs text-gray-500">${c.telefono || ''} | ${c.email || ''}</p></div>
                            <div><button onclick="window.editarCliente(${c.id})" class="bg-blue-100 px-3 py-1 rounded mr-1">✏️</button><button onclick="window.eliminarCliente(${c.id})" class="bg-red-100 px-3 py-1 rounded">🗑️</button></div>
                        </div>
                    `).join('') || '<p class="text-gray-400 text-center py-4">No hay clientes</p>'}
                    <button onclick="window.mostrarModalAgregarCliente()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-xl w-full">+ Agregar Cliente</button>
                </div>
            </div>
            
            <!-- Proveedores -->
            <div id="tab-proveedores" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-teal-600 px-5 py-3"><h2 class="font-bold text-white">🏭 Proveedores</h2></div>
                <div class="p-4">
                    ${db.proveedores.map(p => `
                        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                            <div><span class="font-bold">${escapeHtml(p.nombre)}</span><p class="text-xs text-gray-500">${p.telefono || ''} | ${p.email || ''}</p></div>
                            <div><button onclick="window.editarProveedor(${p.id})" class="bg-blue-100 px-3 py-1 rounded mr-1">✏️</button><button onclick="window.eliminarProveedor(${p.id})" class="bg-red-100 px-3 py-1 rounded">🗑️</button></div>
                        </div>
                    `).join('') || '<p class="text-gray-400 text-center py-4">No hay proveedores</p>'}
                    <button onclick="window.mostrarModalAgregarProveedor()" class="mt-4 bg-green-600 text-white px-4 py-2 rounded-xl w-full">+ Agregar Proveedor</button>
                </div>
            </div>
            
            <!-- Costos Fijos -->
            <div id="tab-costos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3"><h2 class="font-bold text-white">💰 Costos Fijos</h2></div>
                <div class="p-4">
                    ${db.costosFijos.filter(c => c.estado === 'pendiente').map(c => `
                        <div class="border-b dark:border-gray-700 py-3 flex justify-between items-center">
                            <div><span class="font-bold">${escapeHtml(c.nombre)}</span><p class="text-xs text-gray-500">$${formatNumber(c.monto)} • Vence: ${c.vencimiento}</p></div>
                            <div><button onclick="window.pagarCostoFijo(${c.id})" class="bg-green-600 text-white px-3 py-1 rounded mr-1">Pagar</button><button onclick="window.eliminarCostoFijo(${c.id})" class="bg-red-100 px-3 py-1 rounded">🗑️</button></div>
                        </div>
                    `).join('') || '<p class="text-gray-400 text-center py-4">No hay costos pendientes</p>'}
                    <button onclick="window.mostrarModalAgregarCostoFijo()" class="mt-4 bg-orange-600 text-white px-4 py-2 rounded-xl w-full">+ Agregar Costo Fijo</button>
                </div>
            </div>
            
            <!-- Impuestos -->
            <div id="tab-impuestos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-5 py-3"><h2 class="font-bold text-white">🧮 Impuestos</h2></div>
                <div class="p-4">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead><tr><th class="px-3 py-2 text-left">Impuesto</th><th class="px-3 py-2 text-left">Alícuota (%)</th><th class="px-3 py-2 text-center">Activo</th></tr></thead>
                            <tbody>
                                ${impuestos.map(imp => `
                                    <tr data-id="${imp.id}" data-personalizado="${imp.esPersonalizado}">
                                        <td class="px-3 py-2">${escapeHtml(imp.nombre)}</td>
                                        <td class="px-3 py-2"><input type="number" class="impuesto-alicuota w-24 border rounded px-1 py-1" value="${imp.alicuota}" step="0.1"></td>
                                        <td class="px-3 py-2 text-center"><input type="checkbox" class="impuesto-activo" ${imp.activo ? 'checked' : ''}></td>
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

// Inicializar eventos
export function initConfiguracionEvents() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) document.body.classList.add('dark');
    
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
        const rows = document.querySelectorAll('#tab-impuestos tbody tr');
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

// ========== FUNCIONES GLOBALES ==========
window.editarCliente = (id) => {
    const db = getDB();
    const cliente = db.clientes.find(c => c.id === id);
    if (!cliente) return;
    const nombre = prompt('Nuevo nombre:', cliente.nombre);
    if (nombre) { cliente.nombre = nombre; guardarDB(); mostrarNotificacion('Cliente actualizado', 'success'); window.dispatchEvent(new Event('refreshView')); }
};

window.eliminarCliente = (id) => {
    if (confirm('¿Eliminar cliente?')) {
        const db = getDB();
        db.clientes = db.clientes.filter(c => c.id !== id);
        guardarDB();
        mostrarNotificacion('Cliente eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.editarProveedor = (id) => {
    const db = getDB();
    const proveedor = db.proveedores.find(p => p.id === id);
    if (!proveedor) return;
    const nombre = prompt('Nuevo nombre:', proveedor.nombre);
    if (nombre) { proveedor.nombre = nombre; guardarDB(); mostrarNotificacion('Proveedor actualizado', 'success'); window.dispatchEvent(new Event('refreshView')); }
};

window.eliminarProveedor = (id) => {
    if (confirm('¿Eliminar proveedor?')) {
        const db = getDB();
        db.proveedores = db.proveedores.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion('Proveedor eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.eliminarCostoFijo = (id) => {
    if (confirm('¿Eliminar costo fijo?')) {
        const db = getDB();
        db.costosFijos = db.costosFijos.filter(c => c.id !== id);
        guardarDB();
        mostrarNotificacion('Costo fijo eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
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
        db.costosFijos.push({ id: generarId(), nombre: costo.nombre, monto: costo.monto, vencimiento: nuevaFecha.toISOString().split('T')[0], estado: 'pendiente', categoria: costo.categoria, recurrente: true });
    }
    guardarDB();
    mostrarNotificacion(`Pagado: ${costo.nombre}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

window.mostrarModalAgregarCliente = () => {
    const nombre = prompt('Nombre del cliente:');
    if (nombre) {
        const db = getDB();
        db.clientes.push({ id: generarId(), nombre, telefono: '', email: '' });
        guardarDB();
        mostrarNotificacion(`Cliente ${nombre} agregado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.mostrarModalAgregarProveedor = () => {
    const nombre = prompt('Nombre del proveedor:');
    if (nombre) {
        const db = getDB();
        db.proveedores.push({ id: generarId(), nombre, telefono: '', email: '' });
        guardarDB();
        mostrarNotificacion(`Proveedor ${nombre} agregado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.mostrarModalAgregarCostoFijo = () => {
    const nombre = prompt('Nombre del costo fijo:');
    const monto = parseFloat(prompt('Monto:'));
    if (nombre && !isNaN(monto)) {
        const db = getDB();
        const fecha = new Date().toISOString().split('T')[0];
        db.costosFijos.push({ id: generarId(), nombre, monto, vencimiento: fecha, estado: 'pendiente', categoria: 'Otros', recurrente: false });
        guardarDB();
        mostrarNotificacion(`Costo fijo ${nombre} agregado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
};

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

window.cargarDatosEjemplo = () => {
    if (confirm('¿Cargar datos de ejemplo?')) {
        const db = getDB();
        if (db.clientes.length <= 1) {
            db.clientes.push({ id: generarId(), nombre: 'Tech Solutions SA', telefono: '3874123456', email: 'ventas@techsol.com' });
            db.proveedores.push({ id: generarId(), nombre: 'Mayorista Center', telefono: '3874223344', email: 'ventas@mayorista.com' });
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
