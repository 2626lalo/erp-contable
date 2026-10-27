// ==================== modules/configuracion/impuestos.js ====================
// Pestaña Impuestos: tabla editable + agregar personalizado + restablecer
// ERP Contable Argentina - v7.16.1

import { getDB, getTodosLosImpuestos, actualizarImpuesto, eliminarImpuestoPersonalizado, restablecerFormulasDefault } from '../db.js';
import { mostrarNotificacion, escapeHtml, confirmarAccion} from '../utils.js';
import { crearModal, cerrarModal } from './helpers.js';

// ==================== RENDER TAB ====================
export function renderTabImpuestos() {
    const impuestos = getTodosLosImpuestos();
    return `
        <div id="tab-impuestos" class="tab-content hidden bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-5 py-3 flex justify-between items-center">
                <h2 class="font-bold text-white">🧮 Impuestos</h2>
                <button onclick="window.mostrarModalAgregarImpuesto()" class="bg-white text-purple-600 px-3 py-1 rounded-lg text-sm font-bold">+ Agregar</button>
            </div>
            <div class="p-4">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead><tr><th class="px-3 py-2 text-left">Impuesto</th><th class="px-3 py-2 text-left">Alícuota (%)</th><th class="px-3 py-2 text-center">Activo</th><th class="px-3 py-2 text-center">Exento hasta</th><th class="px-3 py-2 text-center">Acción</th></tr></thead>
                        <tbody id="tabla-impuestos">
                            ${impuestos.map(imp => `
                                <tr data-id="${imp.id}" data-personalizado="${imp.esPersonalizado}">
                                    <td class="px-3 py-2">${escapeHtml(imp.nombre)}</td>
                                    <td class="px-3 py-2"><input type="number" class="impuesto-alicuota w-24 border rounded px-1 py-1 dark:bg-gray-700 dark:border-gray-600" value="${imp.alicuota}" step="0.1"></td>
                                    <td class="px-3 py-2 text-center"><input type="checkbox" class="impuesto-activo" ${imp.activo ? 'checked' : ''}></td>
                                    <td class="px-3 py-2 text-center"><input type="date" class="impuesto-exento-hasta w-32 border rounded px-1 py-1 dark:bg-gray-700 dark:border-gray-600" value="${imp.exentoHasta || ''}" title="Dejar vacío = no exento"></td>
                                    <td class="px-3 py-2 text-center">${imp.esPersonalizado ? `<button onclick="window.eliminarImpuestoPersonalizado('${imp.id}')" class="bg-red-100 text-red-600 px-2 py-1 rounded text-sm">🗑️</button>` : '<span class="text-gray-400 text-xs">(predet.)</span>'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="flex gap-2 mt-4">
                    <button id="btn-guardar-impuestos" class="flex-1 bg-blue-600 text-white px-3 py-2 rounded-xl">💾 Guardar</button>
                    <button id="btn-restablecer-impuestos" class="flex-1 bg-yellow-600 text-white px-3 py-2 rounded-xl">🔄 Restablecer</button>
                </div>
            </div>
        </div>
    `;
}

// ==================== INIT EVENTOS ====================
export function initImpuestosEvents() {
    document.getElementById('btn-guardar-impuestos')?.addEventListener('click', () => {
        const rows = document.querySelectorAll('#tabla-impuestos tr');
        for (const row of rows) {
            const id = row.dataset.id;
            const esPersonalizado = row.dataset.personalizado === 'true';
            const alicuota = parseFloat(row.querySelector('.impuesto-alicuota')?.value);
            const activo = row.querySelector('.impuesto-activo')?.checked;
            const exentoHasta = row.querySelector('.impuesto-exento-hasta')?.value || null;
            if (id && !isNaN(alicuota)) {
                actualizarImpuesto(id, { alicuota, activo, exentoHasta }, esPersonalizado);
            }
        }
        mostrarNotificacion('Impuestos guardados', 'success');
        window.dispatchEvent(new Event('refreshView'));
    });

    document.getElementById('btn-restablecer-impuestos')?.addEventListener('click', async () => {
        if (await confirmarAccion({ titulo: '🔄 Restablecer impuestos', mensaje: '¿Restablecer impuestos a valores por defecto?', textoConfirmar: '🔄 Sí, restablecer', icono: '🧮' })) {
            restablecerFormulasDefault();
            mostrarNotificacion('Impuestos restablecidos', 'success');
            window.dispatchEvent(new Event('refreshView'));
        }
    });
}

// ==================== MODAL AGREGAR IMPUESTO PERSONALIZADO ====================
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

    modal.querySelector('#modalGuardar').onclick = async () => {
        const nombre = modal.querySelector('#imp-nombre').value.trim();
        const alicuota = parseFloat(modal.querySelector('#imp-alicuota').value);
        const baseCalculo = modal.querySelector('#imp-base').value;
        if (!nombre || isNaN(alicuota) || alicuota <= 0) {
            mostrarNotificacion('Nombre y alícuota válidos', 'error');
            return;
        }
        const { agregarImpuestoPersonalizado } = await import('../db.js');
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

// ==================== ELIMINAR IMPUESTO ====================
window.eliminarImpuestoPersonalizado = async (id) => {
    if (!(await confirmarAccion({ titulo: '🗑️ Eliminar impuesto', mensaje: '¿Eliminar este impuesto personalizado? No se podrá recuperar.', textoConfirmar: '🗑️ Sí, eliminar', icono: '🧮' }))) return;
    eliminarImpuestoPersonalizado(id);
    mostrarNotificacion('Impuesto eliminado', 'info');
    window.dispatchEvent(new Event('refreshView'));
};
