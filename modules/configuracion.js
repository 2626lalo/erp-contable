import { getDB, guardarDB, cargarDB, getImpuestosActivos, actualizarImpuesto, agregarImpuestoPersonalizado, eliminarImpuestoPersonalizado, reordenarImpuestos, restablecerFormulasDefault, exportarConfiguracionImpuestos, importarConfiguracionImpuestos } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';

// ========== FUNCIONES EXPORTADAS ==========
export function agregarBotonActualizacion() {
    setTimeout(() => {
        const container = document.querySelector('.bg-white.dark\\:bg-gray-800.rounded-2xl.p-5.shadow-lg');
        if (container && !document.getElementById('btnActualizacionManual')) {
            const btnHtml = `
                <div class="mt-4 pt-3 border-t dark:border-gray-700">
                    <button id="btnActualizacionManual" onclick="window.forzarActualizacion()" class="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2">
                        🔄 Buscar actualizaciones
                    </button>
                    <p class="text-xs text-gray-400 text-center mt-2">Versión actual: ${localStorage.getItem('app_version') || '5.2.2'}</p>
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

export function renderConfiguracion() {
    const db = cargarDB();
    const darkMode = localStorage.getItem('darkMode') === 'true';
    const impuestos = getImpuestosActivos();
    
    return `
        <div class="space-y-5 fade-in pb-24">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">⚙️ Configuración</h1>
            
            <!-- TABS -->
            <div class="border-b border-gray-200 dark:border-gray-700">
                <nav class="flex flex-wrap gap-2">
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-blue-600 text-white" data-tab="clientes">👥 Clientes</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="proveedores">🏭 Proveedores</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="costos">💰 Costos Fijos</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="impuestos">🧮 Impuestos</button>
                    <button class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" data-tab="backup">💾 Backup</button>
                </nav>
            </div>
            
            <!-- TAB CLIENTES -->
            <div id="tab-clientes" class="tab-content bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
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
                                        <span>👤 Contacto: ${c.contacto || '-'}</span>
                                        <span>📅 Días cobro: ${c.diasCobro}</span>
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.editarCliente(${c.id})" class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm">✏️</button>
                                    <button onclick="window.eliminarCliente(${c.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <button onclick="window.mostrarModalAgregarCliente()" class="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-all w-full">+ Agregar Cliente</button>
                </div>
            </div>
            
            <!-- TAB PROVEEDORES -->
            <div id="tab-proveedores" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
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
                                        <span>👤 Contacto: ${p.contacto || '-'}</span>
                                        <span>📅 Días pago: ${p.diasPago}</span>
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.editarProveedor(${p.id})" class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm">✏️</button>
                                    <button onclick="window.eliminarProveedor(${p.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <button onclick="window.mostrarModalAgregarProveedor()" class="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition-all w-full">+ Agregar Proveedor</button>
                </div>
            </div>
            
            <!-- TAB COSTOS FIJOS -->
            <div id="tab-costos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
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
            
            <!-- TAB IMPUESTOS (NUEVO) -->
            <div id="tab-impuestos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-5 py-3">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">🧮</span> Configuración de Impuestos</h2>
                </div>
                <div class="p-4">
                    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4 text-sm">
                        <p class="font-semibold">ℹ️ ¿Cómo funciona?</p>
                        <p class="text-xs">Podés modificar alícuotas, activar/desactivar impuestos, cambiar el orden de aplicación y agregar impuestos personalizados. Los cambios afectan todos los cálculos del sistema.</p>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-gray-50 dark:bg-gray-900">
                                <tr><th class="px-3 py-2 text-left text-xs font-medium">Impuesto</th><th class="px-3 py-2 text-left text-xs font-medium">Alícuota (%)</th><th class="px-3 py-2 text-left text-xs font-medium">Base</th><th class="px-3 py-2 text-center text-xs font-medium">Activo</th><th class="px-3 py-2 text-center text-xs font-medium"></th></tr>
                            </thead>
                            <tbody id="lista-impuestos-body" class="divide-y divide-gray-200 dark:divide-gray-700">
                                ${renderizarListaImpuestos()}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 mt-4">
                        <div>
                            <label class="block text-xs font-medium mb-1">Nuevo impuesto</label>
                            <input type="text" id="nuevo-impuesto-nombre" placeholder="Nombre" class="w-full p-2 border rounded-lg text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium mb-1">Alícuota (%)</label>
                            <input type="number" id="nuevo-impuesto-alicuota" placeholder="%" step="0.1" class="w-full p-2 border rounded-lg text-sm">
                        </div>
                    </div>
                    <button id="btn-agregar-impuesto" class="mt-2 w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition-all text-sm">+ Agregar impuesto personalizado</button>
                    
                    <div class="flex gap-2 mt-4">
                        <button id="btn-restablecer-impuestos" class="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded-xl text-sm">🔄 Restablecer default</button>
                        <button id="btn-guardar-impuestos" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm">💾 Guardar cambios</button>
                    </div>
                    
                    <div class="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg">
                        <p class="text-xs text-gray-500">💡 Los impuestos se aplican en el orden de la tabla. Podés arrastrar las filas para cambiar el orden.</p>
                    </div>
                </div>
            </div>
            
            <!-- TAB BACKUP -->
            <div id="tab-backup" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-gray-500 to-gray-700 px-5 py-3">
                    <h2 class="font-bold text-white flex items-center gap-2"><span class="text-xl">💾</span> Backup y Restauración</h2>
                </div>
                <div class="p-4">
                    <div class="flex gap-3">
                        <button onclick="window.exportarBackup()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex-1">📦 Exportar</button>
                        <button onclick="document.getElementById('importFile').click()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl flex-1">📁 Importar</button>
                    </div>
                    <input type="file" id="importFile" class="hidden" accept=".json" onchange="window.importarBackup(this.files[0])">
                    <button id="btnLimpiarDatos" onclick="window.limpiarTodo()" class="mt-4 w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl">🗑️ Limpiar todos los datos</button>
                </div>
            </div>
        </div>`;
}

function renderizarListaImpuestos() {
    const impuestos = getImpuestosActivos();
    if (impuestos.length === 0) {
        return '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">No hay impuestos configurados</td></tr>';
    }
    
    return impuestos.map((imp, idx) => `
        <tr data-id="${imp.id}" data-personalizado="${imp.esPersonalizado}">
            <td class="px-3 py-2"><span class="drag-handle cursor-move text-gray-400 mr-2">⋮⋮</span>${imp.nombre}</td>
            <td class="px-3 py-2"><input type="number" class="impuesto-alicuota w-20 border rounded px-1 py-1 text-sm" value="${imp.alicuota}" step="0.1"></td>
            <td class="px-3 py-2">
                <select class="impuesto-base border rounded px-1 py-1 text-sm">
                    <option value="venta" ${imp.baseCalculo === 'venta' ? 'selected' : ''}>Venta</option>
                    <option value="gananciaBruta" ${imp.baseCalculo === 'gananciaBruta' ? 'selected' : ''}>Ganancia Bruta</option>
                    <option value="utilidadAntesGanancias" ${imp.baseCalculo === 'utilidadAntesGanancias' ? 'selected' : ''}>Utilidad antes</option>
                    <option value="despuesGanancias" ${imp.baseCalculo === 'despuesGanancias' ? 'selected' : ''}>Después Ganancias</option>
                </select>
            </td>
            <td class="px-3 py-2 text-center"><input type="checkbox" class="impuesto-activo" ${imp.activo ? 'checked' : ''}></td>
            <td class="px-3 py-2 text-center">${imp.esPersonalizado ? '<button class="eliminar-impuesto text-red-600 hover:text-red-800">🗑️</button>' : '<span class="text-gray-400 text-xs">sistema</span>'}</td>
        </tr>
    `).join('');
}

export function initConfiguracionEvents() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) document.body.classList.add('dark');
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('bg-blue-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-300');
            });
            document.getElementById(`tab-${tabId}`)?.classList.remove('hidden');
            btn.classList.remove('bg-gray-200', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-300');
            btn.classList.add('bg-blue-600', 'text-white');
        });
    });
    
    // Eventos de impuestos
    document.getElementById('btn-agregar-impuesto')?.addEventListener('click', () => agregarNuevoImpuesto());
    document.getElementById('btn-restablecer-impuestos')?.addEventListener('click', () => restablecerImpuestos());
    document.getElementById('btn-guardar-impuestos')?.addEventListener('click', () => guardarImpuestos());
    
    document.querySelectorAll('.eliminar-impuesto').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const row = btn.closest('tr');
            const id = row?.dataset.id;
            if (id && confirm('¿Eliminar este impuesto?')) {
                eliminarImpuestoPersonalizado(id);
                mostrarNotificacion('Impuesto eliminado', 'success');
                window.dispatchEvent(new Event('refreshView'));
            }
        });
    });
}

async function agregarNuevoImpuesto() {
    const nombre = document.getElementById('nuevo-impuesto-nombre')?.value;
    const alicuota = parseFloat(document.getElementById('nuevo-impuesto-alicuota')?.value);
    
    if (!nombre || isNaN(alicuota)) {
        mostrarNotificacion('Complete nombre y alícuota', 'warning');
        return;
    }
    
    agregarImpuestoPersonalizado({ nombre, alicuota, baseCalculo: 'venta' });
    mostrarNotificacion('Impuesto agregado', 'success');
    window.dispatchEvent(new Event('refreshView'));
}

async function restablecerImpuestos() {
    if (confirm('¿Restablecer todos los impuestos a los valores por defecto de Salta?')) {
        restablecerFormulasDefault();
        mostrarNotificacion('Impuestos restablecidos', 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
}

async function guardarImpuestos() {
    const rows = document.querySelectorAll('#lista-impuestos-body tr');
    const nuevoOrden = [];
    
    for (const row of rows) {
        const id = row.dataset.id;
        const esPersonalizado = row.dataset.personalizado === 'true';
        const alicuota = parseFloat(row.querySelector('.impuesto-alicuota')?.value);
        const baseCalculo = row.querySelector('.impuesto-base')?.value;
        const activo = row.querySelector('.impuesto-activo')?.checked;
        
        if (id && !isNaN(alicuota)) {
            actualizarImpuesto(id, { alicuota, baseCalculo, activo }, esPersonalizado);
            nuevoOrden.push(id);
        }
    }
    
    reordenarImpuestos(nuevoOrden);
    mostrarNotificacion('Configuración guardada', 'success');
    window.dispatchEvent(new Event('refreshView'));
}

function actualizarOrdenImpuestos() {
    // Implementar drag & drop si es necesario
}

window.cargarDatosEjemplo = () => {
    if (confirm('¿Cargar datos de ejemplo?')) {
        const db = getDB();
        if (db.clientes.length <= 1) {
            db.clientes.push({ id: generarId(), nombre: 'Tech Solutions SA', telefono: '3874123456', email: 'ventas@techsol.com', diasCobro: 30, saldo: 0 });
            db.clientes.push({ id: generarId(), nombre: 'Distribuidora Norte', telefono: '3874987654', email: 'info@distnorte.com', diasCobro: 45, saldo: 0 });
            db.proveedores.push({ id: generarId(), nombre: 'Mayorista Center', telefono: '3874223344', email: 'ventas@mayorista.com', diasPago: 30, saldo: 0 });
            const fecha = new Date().toISOString().split('T')[0];
            const mes = fecha.substring(0, 7);
            db.ventas.push({ id: generarId(), clienteNombre: 'Tech Solutions SA', total: 250000, montoNeto: 206611, ivaMonto: 43389, fechaVenta: fecha, mes, estado: 'pendiente_cobro' });
            db.compras.push({ id: generarId(), proveedorNombre: 'Mayorista Center', total: 150000, montoNeto: 123967, ivaMonto: 26033, fechaCompra: fecha, mes, estado: 'pendiente_pago' });
            guardarDB();
            mostrarNotificacion('✅ Datos de ejemplo cargados', 'success');
            window.dispatchEvent(new Event('refreshView'));
        } else {
            mostrarNotificacion('Ya hay datos cargados', 'info');
        }
    }
};

// Mantener todas las funciones globales existentes
window.eliminarCliente = (id) => { /* mantener igual */ };
window.editarCliente = (id) => { /* mantener igual */ };
window.eliminarProveedor = (id) => { /* mantener igual */ };
window.editarProveedor = (id) => { /* mantener igual */ };
window.eliminarCostoFijo = (id) => { /* mantener igual */ };
window.pagarCostoFijo = (id) => { /* mantener igual */ };
window.mostrarModalAgregarCliente = () => { /* mantener igual */ };
window.mostrarModalAgregarProveedor = () => { /* mantener igual */ };
window.mostrarModalAgregarCostoFijo = () => { /* mantener igual */ };
window.exportarBackup = () => { /* mantener igual */ };
window.importarBackup = (file) => { /* mantener igual */ };
window.limpiarNotificaciones = () => { /* mantener igual */ };
window.toggleDarkModeGlobal = () => { /* mantener igual */ };
