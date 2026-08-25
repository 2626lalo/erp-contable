// ==================== modules/compras.js ====================
// COMPRAS Y GASTOS - Con stock para trazabilidad
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml, formatDate, formatDateISO } from './utils.js';
import { guardarDoc, obtenerDocs, escucharColeccion, subirArchivo, firebaseReady } from './firebase.js';

// ==================== VARIABLES GLOBALES ====================
let comprasCache = [];
let productosCache = [];
let proveedoresCache = [];

// ==================== RENDER PRINCIPAL ====================
export function renderCompras() {
    cargarDatos();
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">🛒 Compras y Gastos</h1>
                <button onclick="window.mostrarModalNuevaCompra()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                    <span>➕</span> Nueva Compra/Gasto
                </button>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">💰 Total Compras (mes)</p>
                    <p class="text-xl font-bold text-blue-600" id="totalComprasMes">$0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">📦 Mercadería</p>
                    <p class="text-xl font-bold text-green-600" id="totalMercaderia">$0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">📋 Gastos Admin</p>
                    <p class="text-xl font-bold text-yellow-600" id="totalGastosAdmin">$0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">🏢 Costos Fijos</p>
                    <p class="text-xl font-bold text-purple-600" id="totalCostosFijos">$0</p>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
                <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 font-bold border-b dark:border-gray-600 flex justify-between">
                    <span>📋 Movimientos registrados</span>
                    <span class="text-sm font-normal text-gray-500" id="cantidadMovimientos">0 registros</span>
                </div>
                <div id="listaMovimientos" class="divide-y dark:divide-gray-700">
                    ${renderListaMovimientos()}
                </div>
            </div>
        </div>
    `;
}

function renderListaMovimientos() {
    const data = obtenerMovimientosLocal();
    if (data.length === 0) return '<div class="p-8 text-center text-gray-400">No hay movimientos registrados</div>';
    return data.map(m => `
        <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center">
            <div>
                <p class="font-medium">${escapeHtml(m.concepto || 'Sin concepto')}</p>
                <p class="text-xs text-gray-500">
                    ${m.fechaEmision ? formatDate(m.fechaEmision) : 'Sin fecha'} • 
                    ${m.categoria || 'Sin categoría'} • 
                    ${m.tipo || 'Compra'}
                </p>
                ${m.numeroFactura ? `<p class="text-xs text-gray-400">Factura: ${escapeHtml(m.numeroFactura)}</p>` : ''}
                ${m.fechaVencimientoPago ? `<p class="text-xs text-red-400">Vence: ${formatDate(m.fechaVencimientoPago)}</p>` : ''}
            </div>
            <div class="text-right">
                <p class="font-bold ${m.categoria === 'MERCADERIA' ? 'text-green-600' : m.categoria === 'ADMIN' ? 'text-yellow-600' : 'text-purple-600'}">
                    ${formatNumber(m.montoNeto || 0)}
                </p>
                <p class="text-xs text-gray-400">${m.estadoPago || 'Pendiente'}</p>
                <button onclick="window.editarMovimiento('${m.id}')" class="text-xs text-blue-600 hover:underline">✏️</button>
                <button onclick="window.eliminarMovimiento('${m.id}')" class="text-xs text-red-600 hover:underline ml-1">🗑️</button>
            </div>
        </div>
    `).join('');
}

function obtenerMovimientosLocal() {
    const db = getDB();
    return db.compras || [];
}

function cargarDatos() {
    const movs = obtenerMovimientosLocal();
    const total = movs.reduce((sum, m) => sum + (m.montoNeto || 0), 0);
    const mercaderia = movs.filter(m => m.categoria === 'MERCADERIA').reduce((s, m) => s + (m.montoNeto || 0), 0);
    const admin = movs.filter(m => m.categoria === 'ADMIN').reduce((s, m) => s + (m.montoNeto || 0), 0);
    const fijos = movs.filter(m => m.categoria === 'FIJO').reduce((s, m) => s + (m.montoNeto || 0), 0);

    setTimeout(() => {
        const el = (id) => document.getElementById(id);
        if (el('totalComprasMes')) el('totalComprasMes').textContent = formatNumber(total);
        if (el('totalMercaderia')) el('totalMercaderia').textContent = formatNumber(mercaderia);
        if (el('totalGastosAdmin')) el('totalGastosAdmin').textContent = formatNumber(admin);
        if (el('totalCostosFijos')) el('totalCostosFijos').textContent = formatNumber(fijos);
        if (el('cantidadMovimientos')) el('cantidadMovimientos').textContent = `${movs.length} registros`;
    }, 100);
}

// ==================== MODAL NUEVA COMPRA ====================
window.mostrarModalNuevaCompra = () => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalNuevaCompra';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4 text-center">📦 Nueva Compra / Gasto</h2>

            <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <p class="text-sm font-medium">📸 ¿Tenés la factura?</p>
                <div class="flex gap-2 mt-2">
                    <button onclick="window.activarOCR()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Subir foto / Escanear</button>
                    <button onclick="document.getElementById('ocrInput').click()" class="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg text-sm">📁 Seleccionar imagen</button>
                    <input type="file" id="ocrInput" accept="image/*" class="hidden" onchange="window.procesarOCR(this.files[0])">
                </div>
                <div id="ocrStatus" class="text-xs text-gray-500 mt-2"></div>
            </div>

            <form id="formCompraGasto" class="space-y-3">
                <div>
                    <label class="block text-sm font-medium mb-1">📂 Tipo</label>
                    <select id="tipoMovimiento" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="COMPRA">Compra (para reventa)</option>
                        <option value="GASTO_ADMIN">Gasto Administrativo</option>
                        <option value="COSTO_FIJO">Costo Fijo (Alquiler/Sueldo)</option>
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">📅 Fecha</label>
                        <input type="date" id="fechaEmision" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">🧾 Nº Factura</label>
                        <input type="text" id="numeroFactura" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: 0012-3456">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">🏢 Proveedor</label>
                    <input type="text" id="proveedorNombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Nombre o razón social">
                    <div class="flex gap-2 mt-1">
                        <input type="text" id="proveedorCuit" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="CUIT (opcional)">
                        <span class="text-xs text-gray-400 self-center">(opcional)</span>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">📋 Ítems</label>
                    <div id="itemsContainer" class="space-y-2">
                        <div class="item-row grid grid-cols-12 gap-2">
                            <input type="text" class="item-desc col-span-5 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Descripción">
                            <input type="number" class="item-cantidad col-span-2 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Cant." value="1">
                            <input type="number" class="item-precio col-span-3 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Precio unit." step="0.01">
                            <input type="number" class="item-total col-span-2 p-1 border rounded text-sm dark:bg-gray-700 font-bold" placeholder="Total" step="0.01" readonly>
                            <button type="button" class="col-span-1 text-red-500 text-sm" onclick="window.eliminarItem(this)">✕</button>
                        </div>
                    </div>
                    <button type="button" onclick="window.agregarItem()" class="mt-2 text-blue-600 text-sm">+ Agregar ítem</button>
                </div>

                <div class="border-t pt-3 grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">💰 Neto (sin IVA)</label>
                        <input type="number" id="montoNeto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" readonly>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">🧾 IVA</label>
                        <div class="flex gap-2">
                            <select id="ivaPorcentaje" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                                <option value="0">0%</option>
                                <option value="10.5">10.5%</option>
                                <option value="21" selected>21%</option>
                            </select>
                            <input type="number" id="ivaMonto" class="w-24 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" readonly>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">💰 Total Factura</label>
                    <input type="number" id="totalFactura" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-bold" step="0.01" readonly>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">📆 Plazo de pago (días)</label>
                        <input type="number" id="plazoPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="15" min="0">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">📅 Vence</label>
                        <input type="date" id="fechaVencimientoPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" readonly>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">📌 Estado</label>
                    <select id="estadoPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="PENDIENTE">⏳ Pendiente de pago</option>
                        <option value="PAGADO">✅ Pagado</option>
                    </select>
                </div>

                <div class="flex gap-3 mt-5">
                    <button type="submit" class="flex-1 bg-green-600 text-white py-2 rounded-xl">✅ Guardar</button>
                    <button type="button" id="cancelarBtn" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const form = document.getElementById('formCompraGasto');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        window.guardarCompraGasto();
    });

    document.getElementById('cancelarBtn').addEventListener('click', () => modal.remove());

    const fechaInput = document.getElementById('fechaEmision');
    const plazoInput = document.getElementById('plazoPago');
    const vencimientoInput = document.getElementById('fechaVencimientoPago');

    function actualizarVencimiento() {
        if (fechaInput.value && plazoInput.value) {
            const fecha = new Date(fechaInput.value);
            fecha.setDate(fecha.getDate() + parseInt(plazoInput.value));
            vencimientoInput.value = fecha.toISOString().split('T')[0];
        }
    }
    fechaInput.addEventListener('change', actualizarVencimiento);
    plazoInput.addEventListener('input', actualizarVencimiento);

    const container = document.getElementById('itemsContainer');
    container.addEventListener('input', window.recalcularTotales);

    fechaInput.value = new Date().toISOString().split('T')[0];
    actualizarVencimiento();
};

// ==================== FUNCIONES DE ITEMS ====================
window.agregarItem = () => {
    const container = document.getElementById('itemsContainer');
    const row = document.createElement('div');
    row.className = 'item-row grid grid-cols-12 gap-2';
    row.innerHTML = `
        <input type="text" class="item-desc col-span-5 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Descripción">
        <input type="number" class="item-cantidad col-span-2 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Cant." value="1">
        <input type="number" class="item-precio col-span-3 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Precio unit." step="0.01">
        <input type="number" class="item-total col-span-2 p-1 border rounded text-sm dark:bg-gray-700 font-bold" placeholder="Total" step="0.01" readonly>
        <button type="button" class="col-span-1 text-red-500 text-sm" onclick="window.eliminarItem(this)">✕</button>
    `;
    container.appendChild(row);
    row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', window.recalcularTotales));
    window.recalcularTotales();
};

window.eliminarItem = (btn) => {
    const row = btn.closest('.item-row');
    if (row && document.querySelectorAll('.item-row').length > 1) {
        row.remove();
        window.recalcularTotales();
    } else {
        mostrarNotificacion('Debe haber al menos un ítem', 'warning');
    }
};

window.recalcularTotales = () => {
    const rows = document.querySelectorAll('.item-row');
    let neto = 0;
    rows.forEach(row => {
        const cantidad = parseFloat(row.querySelector('.item-cantidad').value) || 0;
        const precio = parseFloat(row.querySelector('.item-precio').value) || 0;
        const total = cantidad * precio;
        const totalInput = row.querySelector('.item-total');
        if (totalInput) totalInput.value = total.toFixed(2);
        neto += total;
    });

    const netoInput = document.getElementById('montoNeto');
    if (netoInput) netoInput.value = neto.toFixed(2);

    const ivaSelect = document.getElementById('ivaPorcentaje');
    const ivaMontoInput = document.getElementById('ivaMonto');
    const totalInput = document.getElementById('totalFactura');
    if (ivaSelect && ivaMontoInput && totalInput) {
        const ivaPorc = parseFloat(ivaSelect.value) || 0;
        const ivaMonto = neto * (ivaPorc / 100);
        ivaMontoInput.value = ivaMonto.toFixed(2);
        totalInput.value = (neto + ivaMonto).toFixed(2);
    }
};

// ==================== OCR ====================
window.activarOCR = () => {
    document.getElementById('ocrInput').click();
};

window.procesarOCR = async (file) => {
    if (!file) return;
    const status = document.getElementById('ocrStatus');
    status.textContent = '⏳ Procesando imagen...';
    try {
        const result = await Tesseract.recognize(file, 'spa', {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    status.textContent = `⏳ Leyendo... ${Math.round(m.progress * 100)}%`;
                }
            }
        });
        const text = result.data.text;
        status.textContent = '✅ OCR completado. Revisá los campos.';
        const lines = text.split('\n');
        let total = null, fecha = null, cuit = null, proveedor = null;
        for (const line of lines) {
            const totalMatch = line.match(/Total\s*[:$]\s*([\d.,]+)/i);
            if (totalMatch) total = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
            const cuitMatch = line.match(/\b(\d{2}-\d{8}-\d{1})\b/);
            if (cuitMatch) cuit = cuitMatch[1];
            const fechaMatch = line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
            if (fechaMatch) {
                const partes = fechaMatch[1].split('/');
                fecha = `${partes[2]}-${partes[1]}-${partes[0]}`;
            }
            if (line.includes('Razón Social') || line.includes('Proveedor')) {
                const parts = line.split(':');
                if (parts.length > 1) proveedor = parts[1].trim();
            }
        }
        if (fecha) document.getElementById('fechaEmision').value = fecha;
        if (cuit) document.getElementById('proveedorCuit').value = cuit;
        if (proveedor) document.getElementById('proveedorNombre').value = proveedor;
        if (total) {
            document.getElementById('montoNeto').value = total.toFixed(2);
            window.recalcularTotales();
        }
        status.textContent = `✅ OCR completado. ${lines.length} líneas leídas. Revisá los campos.`;
    } catch (e) {
        status.textContent = '❌ Error en OCR: ' + e.message;
        console.error(e);
    }
};

// ==================== GUARDAR (con stock) ====================
window.guardarCompraGasto = async () => {
    try {
        const data = {
            id: generarId(),
            tipo: document.getElementById('tipoMovimiento').value,
            fechaEmision: document.getElementById('fechaEmision').value,
            numeroFactura: document.getElementById('numeroFactura').value,
            proveedorNombre: document.getElementById('proveedorNombre').value,
            proveedorCuit: document.getElementById('proveedorCuit').value || null,
            concepto: document.getElementById('proveedorNombre').value || 'Sin proveedor',
            categoria: document.getElementById('tipoMovimiento').value === 'COMPRA' ? 'MERCADERIA' :
                        document.getElementById('tipoMovimiento').value === 'GASTO_ADMIN' ? 'ADMIN' : 'FIJO',
            montoNeto: parseFloat(document.getElementById('montoNeto').value) || 0,
            ivaPorcentaje: parseFloat(document.getElementById('ivaPorcentaje').value) || 0,
            ivaMonto: parseFloat(document.getElementById('ivaMonto').value) || 0,
            totalFactura: parseFloat(document.getElementById('totalFactura').value) || 0,
            plazoPago: parseInt(document.getElementById('plazoPago').value) || 0,
            fechaVencimientoPago: document.getElementById('fechaVencimientoPago').value,
            estadoPago: document.getElementById('estadoPago').value,
            items: []
        };

        const rows = document.querySelectorAll('.item-row');
        rows.forEach(row => {
            const cantidad = parseFloat(row.querySelector('.item-cantidad').value) || 0;
            data.items.push({
                descripcion: row.querySelector('.item-desc').value,
                cantidad: cantidad,
                precioUnitario: parseFloat(row.querySelector('.item-precio').value) || 0,
                total: parseFloat(row.querySelector('.item-total').value) || 0,
                stockDisponible: cantidad // NUEVO: stock inicial
            });
        });

        if (data.items.length === 0 || data.items.every(i => i.total === 0)) {
            mostrarNotificacion('Agregá al menos un ítem con monto > 0', 'error');
            return;
        }

        if (firebaseReady) {
            await guardarDoc('movimientos', data.id, data);
            mostrarNotificacion('✅ Movimiento guardado en Firebase', 'success');
        } else {
            const db = getDB();
            if (!db.compras) db.compras = [];
            db.compras.push(data);
            guardarDB();
            mostrarNotificacion('✅ Movimiento guardado localmente', 'success');
        }

        const modal = document.getElementById('modalNuevaCompra');
        if (modal) modal.remove();
        window.dispatchEvent(new Event('refreshView'));

    } catch (e) {
        mostrarNotificacion('❌ Error al guardar: ' + e.message, 'error');
        console.error(e);
    }
};

// ==================== FUNCIONES DE STOCK PARA TRAZABILIDAD ====================
window.getStockDisponible = (compraId, itemIndex) => {
    const db = getDB();
    const compra = db.compras.find(c => c.id === compraId);
    if (!compra) return 0;
    const item = compra.items[itemIndex];
    return item ? item.stockDisponible || 0 : 0;
};

window.reservarStock = (compraId, itemIndex, cantidad) => {
    const db = getDB();
    const compra = db.compras.find(c => c.id === compraId);
    if (!compra) return false;
    const item = compra.items[itemIndex];
    if (!item) return false;
    if (item.stockDisponible < cantidad) return false;
    item.stockDisponible -= cantidad;
    guardarDB();
    return true;
};

window.liberarStock = (compraId, itemIndex, cantidad) => {
    const db = getDB();
    const compra = db.compras.find(c => c.id === compraId);
    if (!compra) return false;
    const item = compra.items[itemIndex];
    if (!item) return false;
    item.stockDisponible = (item.stockDisponible || 0) + cantidad;
    guardarDB();
    return true;
};

// ==================== ELIMINAR MOVIMIENTO ====================
window.eliminarMovimiento = (id) => {
    if (!confirm('¿Eliminar este movimiento permanentemente?')) return;
    if (firebaseReady) {
        import('./firebase.js').then(({ eliminarDoc }) => {
            eliminarDoc('movimientos', id);
            mostrarNotificacion('✅ Movimiento eliminado de Firebase', 'success');
            window.dispatchEvent(new Event('refreshView'));
        });
    } else {
        const db = getDB();
        db.compras = db.compras.filter(m => m.id !== id);
        guardarDB();
        mostrarNotificacion('✅ Movimiento eliminado localmente', 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.editarMovimiento = (id) => {
    mostrarNotificacion('Función de edición en desarrollo', 'info');
};

// ==================== INICIALIZACIÓN ====================
export function initComprasEvents() {
    if (firebaseReady) {
        escucharColeccion('movimientos', (docs) => {
            comprasCache = docs;
            const lista = document.getElementById('listaMovimientos');
            if (lista) {
                lista.innerHTML = renderListaMovimientos();
                cargarDatos();
            }
        }, [{ campo: 'tipo', operador: 'in', valor: ['COMPRA', 'GASTO_ADMIN', 'COSTO_FIJO'] }]);
    }
}

console.log('✅ Módulo Compras/Gastos cargado');
