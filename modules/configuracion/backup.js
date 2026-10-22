// ==================== modules/configuracion/backup.js ====================
// Pestaña Backup: export/import + limpieza de datos (movimientos / TODO)
// ERP Contable Argentina - v7.16.1

import { getDB, guardarDB, limpiarSoloMovimientos, limpiarTodoMenosConfig } from '../db.js';
import { mostrarNotificacion, escapeHtml } from '../utils.js';
import { crearModal, cerrarModal } from './helpers.js';

// ==================== RENDER TAB ====================
export function renderTabBackup() {
    return `
        <div id="tab-backup" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-gray-500 to-gray-700 px-5 py-3"><h2 class="font-bold text-white">💾 Backup</h2></div>
            <div class="p-4">
                <div class="flex gap-3">
                    <button onclick="window.exportarBackup()" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1">📦 Exportar</button>
                    <button onclick="document.getElementById('importFile').click()" class="bg-green-600 text-white px-4 py-2 rounded-xl flex-1">📁 Importar</button>
                </div>
                <input type="file" id="importFile" class="hidden" accept=".json" onchange="window.importarBackup(this.files[0])">

                <!-- 🔥 NUEVO: Limpieza de datos -->
                <div class="mt-5 pt-4 border-t-2 border-red-200 dark:border-red-800">
                    <h3 class="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                        🧹 Limpieza de datos
                    </h3>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
                        Eliminá movimientos para empezar de cero sin dejar registros huérfanos.<br>
                        Se descarga un backup automático antes de borrar.
                    </p>

                    <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-3">
                        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">📊 Registros actuales:</p>
                        <div class="grid grid-cols-3 gap-2 text-xs">
                            <span>Ventas: <strong id="cntVentas">-</strong></span>
                            <span>Compras: <strong id="cntCompras">-</strong></span>
                            <span>Movimientos: <strong id="cntMovimientos">-</strong></span>
                            <span>Presupuestos: <strong id="cntPresupuestos">-</strong></span>
                            <span>Clientes: <strong id="cntClientes">-</strong></span>
                            <span>Proveedores: <strong id="cntProveedores">-</strong></span>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row gap-2">
                        <button onclick="window.abrirModalLimpiarMovimientos()" class="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm flex-1">
                            🗑️ Limpiar movimientos
                        </button>
                        <button onclick="window.abrirModalLimpiarTodo()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm flex-1">
                            🧹 Limpiar TODO
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==================== INIT EVENTOS ====================
export function initBackupEvents() {
    // Actualizar contadores cuando se abre la pestaña Backup
    actualizarContadoresLimpieza();
}

// ==================== CONTADORES ====================
export function actualizarContadoresLimpieza() {
    const db = getDB();
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('cntVentas', db.ventas?.length || 0);
    set('cntCompras', db.compras?.length || 0);
    set('cntMovimientos', db.movimientos?.length || 0);
    set('cntPresupuestos', db.presupuestos?.length || 0);
    set('cntClientes', db.clientes?.length || 0);
    set('cntProveedores', db.proveedores?.length || 0);
}

// ==================== EXPORT / IMPORT ====================
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
            if (data.clientes || data.ventas || data.compras) {
                const db = getDB();
                Object.keys(data).forEach(k => db[k] = data[k]);
                guardarDB();
                mostrarNotificacion('Backup importado', 'success');
                window.dispatchEvent(new Event('refreshView'));
            } else {
                mostrarNotificacion('Archivo inválido', 'error');
            }
        } catch(err) {
            mostrarNotificacion('Error al importar', 'error');
        }
    };
    reader.readAsText(file);
};

// ==================== LIMPIAR MOVIMIENTOS ====================
window.abrirModalLimpiarMovimientos = () => {
    const db = getDB();
    const ventas = db.ventas?.length || 0;
    const compras = db.compras?.length || 0;
    const movimientos = db.movimientos?.length || 0;

    const modal = crearModal(`
        <div class="space-y-3">
            <div class="text-center">
                <div class="text-5xl mb-2">🗑️</div>
                <h3 class="text-lg font-bold text-orange-600">Limpiar movimientos</h3>
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300">Se van a eliminar:</p>
            <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-sm">
                <div class="flex justify-between"><span>💰 Ventas:</span><strong>${ventas}</strong></div>
                <div class="flex justify-between"><span>🛒 Compras:</span><strong>${compras}</strong></div>
                <div class="flex justify-between"><span>📊 Movimientos:</span><strong>${movimientos}</strong></div>
            </div>
            <p class="text-xs text-gray-500">
                ✅ Se <strong>mantienen</strong>: clientes, proveedores, presupuestos, costos fijos, aportes, empresa.
            </p>
            <p class="text-xs text-green-600">
                💾 Se descarga un backup automático antes de borrar.
            </p>
        </div>
    `, '⚠️ Limpiar movimientos');

    // Personalizar botones del modal
    modal.querySelector('#modalGuardar').textContent = '🗑️ Confirmar';
    modal.querySelector('#modalGuardar').className = 'flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-xl';
    modal.querySelector('#modalGuardar').onclick = () => {
        try {
            const resultado = limpiarSoloMovimientos();
            if (resultado.ok) {
                mostrarNotificacion('✅ Movimientos eliminados correctamente', 'success');
                cerrarModal(modal);
                setTimeout(() => {
                    actualizarContadoresLimpieza();
                    window.dispatchEvent(new Event('refreshView'));
                }, 300);
            } else {
                mostrarNotificacion('❌ Error al limpiar: ' + resultado.motivo, 'error');
            }
        } catch (e) {
            console.error(e);
            mostrarNotificacion('❌ Error: ' + e.message, 'error');
        }
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// ==================== LIMPIAR TODO ====================
window.abrirModalLimpiarTodo = () => {
    const db = getDB();
    const ventas = db.ventas?.length || 0;
    const compras = db.compras?.length || 0;
    const movimientos = db.movimientos?.length || 0;
    const presupuestos = db.presupuestos?.length || 0;
    const clientes = db.clientes?.length || 0;
    const proveedores = db.proveedores?.length || 0;
    const costosFijos = db.costosFijos?.length || 0;
    const aportes = db.aportesCapital?.length || 0;
    const unidades = db.unidades?.length || 0;
    const productos = db.productos?.length || 0;

    const modal = crearModal(`
        <div class="space-y-3">
            <div class="text-center">
                <div class="text-5xl mb-2">🧹</div>
                <h3 class="text-lg font-bold text-red-600">Limpiar TODO</h3>
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300">Se va a eliminar <strong>todo</strong>:</p>
            <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm space-y-1">
                <div class="flex justify-between"><span>💰 Ventas:</span><strong>${ventas}</strong></div>
                <div class="flex justify-between"><span>🛒 Compras:</span><strong>${compras}</strong></div>
                <div class="flex justify-between"><span>📊 Movimientos:</span><strong>${movimientos}</strong></div>
                <div class="flex justify-between"><span>📄 Presupuestos:</span><strong>${presupuestos}</strong></div>
                <div class="flex justify-between"><span>👥 Clientes:</span><strong>${clientes}</strong></div>
                <div class="flex justify-between"><span>🏭 Proveedores:</span><strong>${proveedores}</strong></div>
                <div class="flex justify-between"><span>💸 Costos fijos:</span><strong>${costosFijos}</strong></div>
                <div class="flex justify-between"><span>🏦 Aportes:</span><strong>${aportes}</strong></div>
                <div class="flex justify-between"><span>🚗 Unidades:</span><strong>${unidades}</strong></div>
                <div class="flex justify-between"><span>📦 Productos:</span><strong>${productos}</strong></div>
            </div>
            <p class="text-xs text-red-600 font-bold">
                ⚠️ Esta acción NO se puede deshacer. Se resetean datos de empresa e impuestos.
            </p>
            <div class="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-3">
                <label class="block text-sm font-medium mb-1">Escribí <strong>BORRAR</strong> para confirmar:</label>
                <input type="text" id="confirmarTextoInput" class="w-full p-2 border border-red-300 dark:border-red-700 rounded-lg dark:bg-gray-700 dark:text-white" placeholder="BORRAR" autocomplete="off">
            </div>
            <p class="text-xs text-green-600">
                💾 Se descarga un backup automático antes de borrar.
            </p>
        </div>
    `, '⚠️ Limpiar TODO');

    // Personalizar botones
    const btnGuardar = modal.querySelector('#modalGuardar');
    btnGuardar.textContent = '🧹 Borrar TODO';
    btnGuardar.className = 'flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed';
    btnGuardar.disabled = true;

    const input = modal.querySelector('#confirmarTextoInput');
    input.addEventListener('input', () => {
        btnGuardar.disabled = input.value.trim().toUpperCase() !== 'BORRAR';
    });
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && !btnGuardar.disabled) btnGuardar.click();
    });
    input.focus();

    btnGuardar.onclick = () => {
        if (input.value.trim().toUpperCase() !== 'BORRAR') return;
        try {
            const resultado = limpiarTodoMenosConfig();
            if (resultado.ok) {
                mostrarNotificacion('✅ Todo eliminado. La app está 100% limpia.', 'success');
                cerrarModal(modal);
                setTimeout(() => {
                    actualizarContadoresLimpieza();
                    window.dispatchEvent(new Event('refreshView'));
                }, 300);
            } else {
                mostrarNotificacion('❌ Error: ' + resultado.motivo, 'error');
            }
        } catch (e) {
            console.error(e);
            mostrarNotificacion('❌ Error: ' + e.message, 'error');
        }
    };

    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};
