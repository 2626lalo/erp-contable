// ==================== modules/configuracion/index.js ====================
// ORQUESTADOR de la vista Configuración
// Importa y coordina los 7 submódulos (empresa, clientes, proveedores, etc.)
// ERP Contable Argentina - v7.16.1

import { getDB, guardarDB } from '../db.js';
import { formatNumber, mostrarNotificacion, escapeHtml, formatDate, generarId } from '../utils.js';

// Submódulos
import { renderTabEmpresa, initEmpresaEvents, guardarDatosEmpresaDesdeFormulario } from './empresa.js';
import { renderTabClientes, initClientesEvents } from './clientes.js';
import { renderTabProveedores, initProveedoresEvents } from './proveedores.js';
import { renderTabCostosFijos, initCostosFijosEvents } from './costos-fijos.js';
import { renderTabProductos, initProductosEvents } from './productos.js';
import { renderTabImpuestos, initImpuestosEvents } from './impuestos.js';
import { renderTabBackup, initBackupEvents, actualizarContadoresLimpieza } from './backup.js';

// ==================== RENDER PRINCIPAL ====================
export function renderConfiguracion() {
    const db = getDB();

    if (!db.clientes) db.clientes = [];
    if (!db.proveedores) db.proveedores = [];
    if (!db.costosFijos) db.costosFijos = [];
    if (!db.aportesCapital) db.aportesCapital = [];
    if (!db.productos) db.productos = [];
    if (!db.movimientosStock) db.movimientosStock = [];
    if (!db.movimientos) db.movimientos = [];

    const datosEmpresa = db.datosEmpresa || {};

    // Aportes de capital
    const aportes = db.aportesCapital || [];
    const totalAportado = aportes.reduce((s, a) => s + a.monto, 0);
    const aportesHTML = aportes.length > 0 ? aportes.map(a => `
        <div class="flex justify-between items-center border-b dark:border-gray-700 py-2 text-sm">
            <div>
                <span class="font-medium">${escapeHtml(a.descripcion || 'Aporte')}</span>
                <span class="text-xs text-gray-400 ml-2">${a.fecha ? formatDate(a.fecha) : ''}</span>
            </div>
            <div>
                <span class="font-bold text-green-600">+$${formatNumber(a.monto)}</span>
                ${!a.esInicial ? `<button onclick="window.eliminarAporte('${a.id}')" class="text-red-500 ml-2 text-xs hover:underline">🗑️</button>` : ''}
            </div>
        </div>
    `).join('') : '<p class="text-gray-400 text-center py-2">No hay aportes registrados</p>';

    // Saldo de caja actual
    const totalCobrado = db.ventas.filter(v => v.estado === 'cobrado').reduce((s, v) => s + (v.total || 0), 0);
    const totalPagadoCompras = db.compras.filter(c => c.estadoPago === 'PAGADO').reduce((s, c) => s + (c.totalFactura || 0), 0);
    const totalCostosPagados = db.costosFijos.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto, 0);
    const saldoCajaActual = totalAportado + totalCobrado - totalPagadoCompras - totalCostosPagados;

    // Productos con stock bajo
    const productosConStockBajo = (db.productos || []).filter(p => (p.stockActual || 0) <= (p.stockMinimo || 0));

    return `
        <div class="space-y-5 fade-in pb-24">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">⚙️ Configuración</h1>

            <div class="flex flex-wrap gap-2 border-b dark:border-gray-700 pb-2">
                <button class="tab-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm" data-tab="empresa">🏢 Empresa</button>
                <button class="tab-btn bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm" data-tab="clientes">👥 Clientes</button>
                <button class="tab-btn bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm" data-tab="proveedores">🏭 Proveedores</button>
                <button class="tab-btn bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm" data-tab="costos">💰 Costos Fijos</button>
                <button class="tab-btn bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm" data-tab="productos">📦 Productos</button>
                <button class="tab-btn bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm" data-tab="impuestos">🧮 Impuestos</button>
                <button class="tab-btn bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm" data-tab="backup">💾 Backup</button>
            </div>

            ${renderTabEmpresa(datosEmpresa, totalAportado, saldoCajaActual, aportesHTML)}
            ${renderTabClientes(db)}
            ${renderTabProveedores(db)}
            ${renderTabCostosFijos(db)}
            ${renderTabProductos(db, productosConStockBajo)}
            ${renderTabImpuestos()}
            ${renderTabBackup()}
        </div>
    `;
}

// ==================== INIT EVENTOS ====================
export function initConfiguracionEvents() {
    // Tabs: cambiar entre pestañas
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

            // Si abrimos Backup, actualizar contadores
            if (tabId === 'backup') {
                setTimeout(() => actualizarContadoresLimpieza(), 50);
            }
        });
    });

    // Submódulos: cada uno registra sus propios eventos
    initEmpresaEvents();
    initClientesEvents();
    initProveedoresEvents();
    initCostosFijosEvents();
    initProductosEvents();
    initImpuestosEvents();
    initBackupEvents();
}

// ==================== BOTONES ADICIONALES (compat) ====================
export function agregarBotonActualizacion() {
    setTimeout(() => {
        const container = document.querySelector('.bg-white.dark\\:bg-gray-800.rounded-2xl.p-5.shadow-lg');
        if (container && !document.getElementById('btnActualizacionManual')) {
            const btnHtml = `
                <div class="mt-4 pt-3 border-t dark:border-gray-700">
                    <button id="btnActualizacionManual" onclick="window.forzarActualizacion()" class="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2">
                        🔄 Buscar actualizaciones
                    </button>
                    <p class="text-xs text-gray-400 text-center mt-2">Versión actual: ${localStorage.getItem('app_version') || '7.0.0'}</p>
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

// ==================== RE-EXPORTS (compat) ====================
// Mantener exports viejos por si algún módulo los usa
export { guardarDatosEmpresaDesdeFormulario };
