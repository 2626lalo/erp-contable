// ==================== modules/compras.js ====================
// COMPRAS Y GASTOS - Con tipo de factura (A, B, C, Sin factura) e IVA descontable
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB, crearMovimiento } from './db.js';
import { procesarArchivoFactura } from './ocr-parser.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml, formatDate, formatDateISO, validarDatosEsenciales, mostrarAlertaDatosFaltantes } from './utils.js';
import { guardarDoc, obtenerDocs, escucharColeccion, subirArchivo, firebaseReady, eliminarDoc, comprimirImagen, getEmpresaActual} from './firebase.js';

// ==================== VARIABLES GLOBALES ====================
let comprasCache = [];
let filtroEstado = 'todos';

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
                    <p class="text-xs text-gray-500">💰 Total Neto (mes)</p>
                    <p class="text-xl font-bold text-blue-600" id="totalComprasMes">$0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">🧾 IVA del mes</p>
                    <p class="text-xl font-bold text-orange-600" id="totalIVAMes">$0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">💰 Total a Pagar (con IVA)</p>
                    <p class="text-xl font-bold text-green-600" id="totalPagarMes">$0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">📦 Mercadería</p>
                    <p class="text-xl font-bold text-purple-600" id="totalMercaderia">$0</p>
                </div>
            </div>

            <!-- FILTRO -->
            <div class="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl shadow">
                <label class="text-sm font-medium">📌 Estado:</label>
                <select id="filtroEstadoCompras" class="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="window.cambiarFiltroCompras()">
                    <option value="todos">Todos</option>
                    <option value="pendientes">⏳ Pendientes de pago</option>
                    <option value="pagados">✅ Pagados</option>
                </select>
                <span class="text-xs text-gray-400 ml-auto">Orden: ${filtroEstado === 'pagados' ? 'por fecha de pago (reciente)' : 'por fecha de vencimiento (próximo)'}</span>
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
    let data = comprasCache.length > 0 ? comprasCache : obtenerMovimientosLocal();
    let filtrados = data;
    const filtroEstado = document.getElementById('filtroEstadoCompras')?.value || 'todos';
    if (filtroEstado === 'pendientes') {
        filtrados = filtrados.filter(m => m.estadoPago !== 'PAGADO');
    } else if (filtroEstado === 'pagados') {
        filtrados = filtrados.filter(m => m.estadoPago === 'PAGADO');
    }

    if (filtrados.length === 0) return '<div class="p-8 text-center text-gray-400">No hay movimientos</div>';

    if (filtroEstado === 'pagados') {
        filtrados.sort((a, b) => (b.fechaPago || b.fechaEmision || '').localeCompare(a.fechaPago || a.fechaEmision || ''));
    } else {
        filtrados.sort((a, b) => (a.fechaVencimientoPago || a.fechaEmision || '9999-12-31').localeCompare(b.fechaVencimientoPago || b.fechaEmision || '9999-12-31'));
    }

    return filtrados.map(m => {
        const idStr = String(m.id);
        const esPagado = m.estadoPago === 'PAGADO';
        const tipoFactura = m.tipoFactura || 'A';
        const ivaDescontable = m.ivaDescontable !== undefined ? m.ivaDescontable : (tipoFactura === 'A');
        const facturaLabel = tipoFactura === 'A' ? 'Factura A (IVA desc.)' :
                            tipoFactura === 'B' ? 'Factura B (IVA no desc.)' :
                            tipoFactura === 'C' ? 'Factura C (IVA no desc.)' : 'Sin factura';

        return `
            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center border-b">
                <div class="flex-1">
                    <p class="font-medium">${escapeHtml(m.concepto || 'Sin concepto')}</p>
                    <p class="text-xs text-gray-500">
                        ${m.fechaEmision ? formatDate(m.fechaEmision) : 'Sin fecha'} • 
                        ${m.categoria || 'Sin categoría'} • 
                        ${m.tipo || 'Compra'}
                        <span class="ml-2 ${esPagado ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}">${esPagado ? '✅ Pagado' : '⏳ Pendiente'}</span>
                        <span class="ml-2 text-xs ${ivaDescontable ? 'text-green-600' : 'text-red-400'}">${facturaLabel}</span>
                    </p>
                    ${m.numeroFactura ? `<p class="text-xs text-gray-400">Factura: ${escapeHtml(m.numeroFactura)}</p>` : ''}
                    ${m.metodoPago ? `<p class="text-xs text-gray-400">💳 ${escapeHtml(m.metodoPago)}</p>` : ''}
                    ${!esPagado && m.fechaVencimientoPago ? `<p class="text-xs text-red-400">Vence: ${formatDate(m.fechaVencimientoPago)}</p>` : ''}
                    ${esPagado && m.fechaPago ? `<p class="text-xs text-green-600">Pagado: ${formatDate(m.fechaPago)}</p>` : ''}
                    ${m.archivoUrl ? `<a href="${m.archivoUrl}" target="_blank" class="text-xs text-blue-600 underline">📎 Ver archivo</a>` : ''}
                    <div class="flex gap-3 mt-1 text-xs flex-wrap">
                        <span class="text-gray-500">Neto: $${formatNumber(m.montoNeto || 0)}</span>
                        <span class="text-gray-500">IVA: $${formatNumber(m.ivaMonto || 0)}</span>
                        <span class="font-bold ${esPagado ? 'text-green-600' : 'text-gray-700'}">Total: $${formatNumber(m.totalFactura || 0)}</span>
                    </div>
                    <button onclick="event.stopPropagation();window.verTrazabilidad('compra','${idStr}')" class="text-xs text-purple-600 hover:underline mt-1">🔗 Ver trazabilidad</button>
                </div>
                <div class="flex items-center gap-1">
                    ${!esPagado ? `<button onclick="window.pagarCompra('${idStr}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">✅ Pagar</button>` : ''}
                                        <button onclick="window.verDetalleCompra('${idStr}')" class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-sm" title="Ver detalles">👁️</button>
                    <button onclick="event.stopPropagation();window.editarCompra('${idStr}')" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm" title="Editar">✏️</button>
                    <button onclick="event.stopPropagation();window.eliminarCompra('${idStr}')" class="bg-red-100 text-red-700 px-2 py-1 rounded text-sm" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function obtenerMovimientosLocal() {
    const db = getDB();
    return db.compras || [];
}

function cargarDatos() {
    const movs = obtenerMovimientosLocal();
    const totalNeto = movs.reduce((sum, m) => sum + (m.montoNeto || 0), 0);
    const totalIVA = movs.reduce((sum, m) => sum + (m.ivaMonto || 0), 0);
    const totalPagar = movs.reduce((sum, m) => sum + (m.totalFactura || 0), 0);
    const mercaderia = movs.filter(m => m.categoria === 'MERCADERIA').reduce((s, m) => s + (m.montoNeto || 0), 0);

    setTimeout(() => {
        const el = (id) => document.getElementById(id);
        if (el('totalComprasMes')) el('totalComprasMes').textContent = formatNumber(totalNeto);
        if (el('totalIVAMes')) el('totalIVAMes').textContent = formatNumber(totalIVA);
        if (el('totalPagarMes')) el('totalPagarMes').textContent = formatNumber(totalPagar);
        if (el('totalMercaderia')) el('totalMercaderia').textContent = formatNumber(mercaderia);
        if (el('cantidadMovimientos')) el('cantidadMovimientos').textContent = `${movs.length} registros`;
    }, 100);
}

// ==================== CAMBIAR FILTRO ====================
window.cambiarFiltroCompras = () => {
    const select = document.getElementById('filtroEstadoCompras');
    if (select) {
        filtroEstado = select.value;
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ==================== FUNCIÓN PAGAR COMPRA ====================
window.pagarCompra = (id) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(id));
    if (!compra) {
        mostrarNotificacion('Compra no encontrada', 'error');
        return;
    }
    if (compra.estadoPago === 'PAGADO') {
        mostrarNotificacion('Esta compra ya está pagada', 'info');
        return;
    }

    const fechaActual = new Date().toISOString().split('T')[0];
    const fechaFormateada = formatDate(new Date());

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4 text-center">✅ Registrar Pago</h2>
            <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl mb-4">
                <p><strong>Proveedor:</strong> ${escapeHtml(compra.proveedorNombre)}</p>
                <p><strong>Factura:</strong> ${escapeHtml(compra.numeroFactura)}</p>
                <p><strong>Total:</strong> <span class="font-bold text-green-600">$${formatNumber(compra.totalFactura)}</span></p>
            </div>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium mb-1">📅 Fecha de pago</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="fechaPagoText" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="DD/MM/AAAA" value="${fechaFormateada}">
                        <input type="date" id="fechaPagoHidden" class="hidden" value="${fechaActual}">
                        <button type="button" id="btnCalendarioPago" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">💳 Método de pago</label>
                    <select id="metodoPagoModal" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="Efectivo">💵 Efectivo</option>
                        <option value="Transferencia" selected>🏦 Transferencia (default)</option>
                        <option value="Tarjeta Débito">💳 Tarjeta Débito</option>
                        <option value="Tarjeta Crédito">💳 Tarjeta Crédito</option>
                        <option value="Cheque">📄 Cheque</option>
                        <option value="Otro">🔄 Otro</option>
                    </select>
                </div>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="confirmarPago" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl">✅ Confirmar Pago</button>
                <button id="cancelarPago" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Calendario...
    const fechaText = document.getElementById('fechaPagoText');
    const fechaHidden = document.getElementById('fechaPagoHidden');
    const btnCalendario = document.getElementById('btnCalendarioPago');

    function actualizarFechaTexto() {
        if (fechaHidden.value) {
            const dateObj = new Date(fechaHidden.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaText.value = formatDate(dateObj);
            }
        } else {
            fechaText.value = '';
        }
    }

    btnCalendario.addEventListener('click', function() {
        fechaHidden.showPicker ? fechaHidden.showPicker() : fechaHidden.click();
    });

    fechaHidden.addEventListener('change', actualizarFechaTexto);

    fechaText.addEventListener('blur', function() {
        const val = this.value.trim();
        if (val) {
            const partes = val.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]);
                const mes = parseInt(partes[1]) - 1;
                const anio = parseInt(partes[2]);
                if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
                    const fechaObj = new Date(anio, mes, dia);
                    if (!isNaN(fechaObj) && fechaObj.getFullYear() === anio && fechaObj.getMonth() === mes && fechaObj.getDate() === dia) {
                        const iso = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                        fechaHidden.value = iso;
                        actualizarFechaTexto();
                        return;
                    }
                }
            }
            actualizarFechaTexto();
            mostrarNotificacion('Formato inválido. Usá DD/MM/AAAA', 'warning');
        } else {
            fechaHidden.value = '';
            actualizarFechaTexto();
        }
    });

    actualizarFechaTexto();

    document.getElementById('confirmarPago').addEventListener('click', () => {
        const fechaISO = fechaHidden.value;
        const metodoPago = document.getElementById('metodoPagoModal')?.value;
        if (!fechaISO) {
            mostrarNotificacion('Seleccione fecha de pago', 'error');
            return;
        }
        compra.estadoPago = 'PAGADO';
        compra.fechaPago = fechaISO;
        compra.metodoPago = metodoPago;

        // 🔥 v7.16.4: crear movimiento de tesorería
        const dbActual = getDB();
        if (!dbActual.movimientos) dbActual.movimientos = [];
        const medioKey = mapearMedioAKey(metodoPago);
        const mov = crearMovimiento({
            fecha: fechaISO,
            tipo: 'egreso',
            origen: 'compra_pago',
            origenId: compra.id,
            origenDescripcion: `Pago compra ${compra.proveedorNombre}`,
            monto: compra.totalFactura,
            medio: medioKey,
            observaciones: compra.numeroFactura ? `Factura ${compra.numeroFactura}` : ''
        });
        compra.movimientoPagoId = mov.id;

        guardarDB();
        mostrarNotificacion(`✅ Pago registrado - ${compra.proveedorNombre}`, 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    });

    document.getElementById('cancelarPago').addEventListener('click', () => {
        modal.remove();
    });
};

// ==================== VISTA DETALLE ====================
window.verDetalleCompra = (id) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(id));
    if (!compra) {
        mostrarNotificacion('Compra no encontrada', 'error');
        return;
    }

    const itemsHTML = compra.items.map((item, i) => `
        <tr class="border-b">
            <td class="p-2 text-sm">${i+1}</td>
            <td class="p-2 text-sm">${escapeHtml(item.descripcion)}</td>
            <td class="p-2 text-sm text-center">${item.cantidad}</td>
            <td class="p-2 text-sm text-right">$${formatNumber(item.precioUnitario)}</td>
            <td class="p-2 text-sm text-right">$${formatNumber(item.total)}</td>
        </tr>
    `).join('');

    const esPagado = compra.estadoPago === 'PAGADO';
    const tipoFactura = compra.tipoFactura || 'A';
    const ivaDescontable = compra.ivaDescontable !== undefined ? compra.ivaDescontable : (tipoFactura === 'A');
    const facturaLabel = tipoFactura === 'A' ? 'Factura A (IVA descontable)' :
                        tipoFactura === 'B' ? 'Factura B (IVA no descontable)' :
                        tipoFactura === 'C' ? 'Factura C (IVA no descontable)' : 'Sin factura';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-2">📄 Detalle de Compra</h2>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div><span class="text-gray-500">Proveedor:</span> ${escapeHtml(compra.proveedorNombre || '')}</div>
                <div><span class="text-gray-500">CUIT:</span> ${escapeHtml(compra.proveedorCuit || '-')}</div>
                <div><span class="text-gray-500">Factura:</span> ${escapeHtml(compra.numeroFactura || '-')}</div>
                <div><span class="text-gray-500">Fecha:</span> ${compra.fechaEmision ? formatDate(compra.fechaEmision) : '-'}</div>
                <div><span class="text-gray-500">Tipo:</span> ${compra.tipo || '-'}</div>
                <div><span class="text-gray-500">Categoría:</span> ${compra.categoria || '-'}</div>
                <div><span class="text-gray-500">Estado:</span> <span class="${esPagado ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}">${esPagado ? '✅ Pagado' : '⏳ Pendiente'}</span></div>
                <div><span class="text-gray-500">Tipo de factura:</span> <span class="${ivaDescontable ? 'text-green-600' : 'text-red-400'}">${facturaLabel}</span></div>
                <div><span class="text-gray-500">IVA descontable:</span> ${ivaDescontable ? '✅ Sí' : '❌ No'}</div>
                <div><span class="text-gray-500">Vencimiento:</span> ${compra.fechaVencimientoPago ? formatDate(compra.fechaVencimientoPago) : '-'}</div>
                <div><span class="text-gray-500">Fecha de pago:</span> ${compra.fechaPago ? formatDate(compra.fechaPago) : '-'}</div>
                <div><span class="text-gray-500">Método de pago:</span> ${escapeHtml(compra.metodoPago || '-')}</div>
                <div><span class="text-gray-500">Neto:</span> <span class="font-bold">$${formatNumber(compra.montoNeto)}</span></div>
                <div><span class="text-gray-500">IVA (${compra.ivaPorcentaje || 0}%):</span> <span class="font-bold text-orange-600">$${formatNumber(compra.ivaMonto)}</span></div>
                <div class="col-span-2"><span class="text-gray-500">Total facturado:</span> <span class="font-bold text-green-600 text-lg">$${formatNumber(compra.totalFactura)}</span></div>
                ${compra.facturaProveedorUrl || compra.archivoUrl ? `<div class="col-span-2"><button onclick="event.stopPropagation();window.verArchivoGuardado('${(compra.facturaProveedorUrl || compra.archivoUrl).replace(/'/g, "\\'")}', '${escapeHtml(compra.facturaProveedorNombre || 'factura')}', '📎 Factura del proveedor')" class="text-blue-600 underline">📎 Ver factura del proveedor</button></div>` : ''}
                ${compra.comprobantePagoUrl ? `<div class="col-span-2"><button onclick="event.stopPropagation();window.verArchivoGuardado('${compra.comprobantePagoUrl.replace(/'/g, "\\'")}', 'comprobante', '🧾 Comprobante de pago')" class="text-green-600 underline">🧾 Ver comprobante de pago</button></div>` : ''}
                ${compra.observaciones ? `<div class="col-span-2"><span class="text-gray-500">Observaciones:</span> ${escapeHtml(compra.observaciones)}</div>` : ''}
            </div>
            <div class="mt-4">
                <h3 class="font-bold mb-2">📋 Ítems</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="bg-gray-100"><tr><th class="p-2">#</th><th class="p-2">Descripción</th><th class="p-2 text-center">Cant.</th><th class="p-2 text-right">Precio Unit.</th><th class="p-2 text-right">Total</th></tr></thead>
                        <tbody>${itemsHTML || '<tr><td colspan="5" class="p-2 text-center text-gray-400">Sin ítems</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
            <button onclick="this.closest('.modal').remove()" class="mt-4 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// ==================== MODAL DE CONFIRMACIÓN PERSONALIZADO ====================
function mostrarModalConfirmacion(mensaje, onConfirm, onCancel, textoConfirmar = '✅ Confirmar') {
    const modalAnterior = document.querySelector('.modal-confirmacion');
    if (modalAnterior) modalAnterior.remove();

    const modal = document.createElement('div');
    modal.className = 'modal modal-confirmacion';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4 text-center text-gray-800 dark:text-white">⚠️ Confirmar</h2>
            <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4 text-center">
                <p class="text-sm text-gray-700 dark:text-gray-300">${mensaje}</p>
            </div>
            <div class="flex gap-3">
                <button id="confirmarSi" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl">${textoConfirmar}</button>
                <button id="confirmarNo" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-800 dark:text-white py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#confirmarSi').addEventListener('click', () => {
        modal.remove();
        if (onConfirm) onConfirm();
    });
    modal.querySelector('#confirmarNo').addEventListener('click', () => {
        modal.remove();
        if (onCancel) onCancel();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            if (onCancel) onCancel();
        }
    });
}

// ==================== ELIMINAR MOVIMIENTO ====================
window.eliminarMovimiento = (id) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(id));
    if (!compra) {
        mostrarNotificacion('Compra no encontrada', 'error');
        return;
    }

    const presupuestosVinculados = db.presupuestos.filter(p => 
        p.items && p.items.some(item => String(item.compraVinculadaId) === String(id))
    );
    const ventasVinculadas = db.ventas.filter(v => 
        v.comprasVinculadas && v.comprasVinculadas.some(cv => String(cv.compraId) === String(id))
    );

    if (presupuestosVinculados.length > 0 || ventasVinculadas.length > 0) {
        let mensaje = '⚠️ Esta compra está vinculada a otros registros:<br><br>';
        if (presupuestosVinculados.length > 0) {
            mensaje += `📄 Presupuestos: ${presupuestosVinculados.map(p => p.numero).join(', ')}<br>`;
        }
        if (ventasVinculadas.length > 0) {
            mensaje += `💰 Ventas: ${ventasVinculadas.map(v => v.numComprobante || v.id).join(', ')}<br>`;
        }
        mensaje += '<br>No se puede eliminar porque hay dependencias. Primero eliminá los presupuestos o ventas vinculados.';
        mostrarNotificacion(mensaje, 'error');
        return;
    }

    if (compra.items && compra.items.some(item => item.stockDisponible < item.cantidad)) {
        mostrarNotificacion('⚠️ Esta compra tiene stock reservado en presupuestos. No se puede eliminar.', 'error');
        return;
    }

    mostrarModalConfirmacion(
        `¿Eliminar la compra <strong>${escapeHtml(compra.numeroFactura || 'sin número')}</strong> de <strong>${escapeHtml(compra.proveedorNombre || 'proveedor')}</strong>?<br><br>Esta acción no se puede deshacer.`,
        async () => {
            try {
                if (firebaseReady) {
                    await eliminarDoc('movimientos', id);
                    console.log('✅ Movimiento eliminado de Firebase');
                }
                // 🔥 v7.16.4: eliminar movimiento asociado
                const compraEliminar = db.compras.find(c => String(c.id) === String(id));
                if (compraEliminar?.movimientoPagoId && db.movimientos) {
                    db.movimientos = db.movimientos.filter(m => String(m.id) !== String(compraEliminar.movimientoPagoId));
                }
                // 🔥 v7.16.89: limpiar vínculos en ventas
                if (db.ventas) {
                    db.ventas.forEach(v => {
                        if (v.comprasVinculadas) {
                            v.comprasVinculadas = v.comprasVinculadas.filter(cv => String(cv.compraId) !== String(id));
                        }
                    });
                }
                db.compras = db.compras.filter(c => String(c.id) !== String(id));
                guardarDB();
                comprasCache = comprasCache.filter(c => String(c.id) !== String(id));
                mostrarNotificacion('✅ Compra eliminada correctamente', 'success');
                window.dispatchEvent(new Event('refreshView'));
            } catch (error) {
                console.error('Error al eliminar:', error);
                mostrarNotificacion('❌ Error al eliminar: ' + error.message, 'error');
            }
        },
        () => {
            mostrarNotificacion('Eliminación cancelada', 'info');
        }
    );
};

// ==================== FUNCIONES DE STOCK ====================
window.getStockDisponible = (compraId, itemIndex) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(compraId));
    if (!compra) return 0;
    const item = compra.items[itemIndex];
    return item ? item.stockDisponible || 0 : 0;
};

window.reservarStock = (compraId, itemIndex, cantidad) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(compraId));
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
    const compra = db.compras.find(c => String(c.id) === String(compraId));
    if (!compra) return false;
    const item = compra.items[itemIndex];
    if (!item) return false;
    item.stockDisponible = (item.stockDisponible || 0) + cantidad;
    guardarDB();
    return true;
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

// ==================== MODAL NUEVA COMPRA ====================
window.mostrarModalNuevaCompra = () => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalNuevaCompra';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4 text-center">📦 Nueva Compra / Gasto</h2>

            <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 space-y-3">
                <div>
                    <p class="text-sm font-medium">📸 Factura del proveedor</p>
                    <div id="facturaActionsContainer" class="flex flex-wrap gap-2 mt-2">
                        <button onclick="document.getElementById('ocrInput').click()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1">
                            📷 Tomar foto
                        </button>
                        <button onclick="document.getElementById('ocrInputFile').click()" class="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-1">
                            📁 Seleccionar archivo
                        </button>
                        <input type="file" id="ocrInput" accept="image/*" capture="environment" class="hidden" onchange="window.procesarOCR(this.files[0])">
                        <input type="file" id="ocrInputFile" accept="image/*,.pdf" class="hidden" onchange="window.procesarOCR(this.files[0])">
                    </div>
                    <div id="ocrStatus" class="text-xs text-gray-500 mt-2"></div>
                    <div id="archivoInfo" class="text-xs text-blue-600 mt-1 hidden"></div>
                    <div id="facturaPreviewActions" class="hidden mt-2 p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                        <p class="text-xs mb-2"><strong>📎 Archivo:</strong> <span id="facturaNombreArchivo"></span></p>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="window.verVistaPreviaFactura()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">
                                👁️ Ver vista previa
                            </button>
                            <button type="button" onclick="window.quitarFacturaProveedor()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">
                                🗑️ Quitar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 🔥 v7.16.8: comprobante de pago separado -->
                <div class="border-t pt-3 border-blue-200 dark:border-blue-700">
                    <p class="text-sm font-medium">🧾 Comprobante de pago (opcional)</p>
                    <p class="text-xs text-gray-500 mb-2">Subí acá la transferencia, cheque o ticket de pago.</p>
                    <div id="comprobanteActionsContainer" class="flex flex-wrap gap-2">
                        <button onclick="document.getElementById('comprobantePagoInput').click()" class="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-1">
                            📁 Seleccionar comprobante
                        </button>
                        <input type="file" id="comprobantePagoInput" accept="image/*,.pdf" class="hidden" onchange="window.seleccionarComprobantePago(this.files[0])">
                    </div>
                    <div id="comprobantePagoInfo" class="text-xs text-green-600 mt-1 hidden"></div>
                    <div id="comprobantePagoPreviewActions" class="hidden mt-2 p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                        <p class="text-xs mb-2"><strong>📎 Archivo:</strong> <span id="comprobanteNombreArchivo"></span></p>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="window.verVistaPreviaComprobante()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">
                                👁️ Ver vista previa
                            </button>
                            <button type="button" onclick="window.quitarComprobantePago()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">
                                🗑️ Quitar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <form id="formCompraGasto" class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">📂 Tipo</label>
                        <select id="tipoMovimiento" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                            <option value="COMPRA">Compra (para reventa)</option>
                            <option value="GASTO_ADMIN">Gasto Administrativo</option>
                            <option value="COSTO_FIJO">Costo Fijo (Alquiler/Sueldo)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">📅 Fecha</label>
                        <div class="flex items-center gap-2">
                            <input type="text" id="fechaEmisionText" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="DD/MM/AAAA" value="${formatDate(new Date())}">
                            <input type="date" id="fechaEmisionHidden" class="hidden" value="${new Date().toISOString().split('T')[0]}">
                            <button type="button" id="btnCalendario" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">🧾 Nº Factura</label>
                        <input type="text" id="numeroFactura" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: 0012-3456">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">📄 Tipo de factura</label>
                        <select id="tipoFactura" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="window.actualizarTipoFactura()">
                            <option value="A">Factura A (IVA descontable)</option>
                            <option value="B">Factura B (IVA no descontable)</option>
                            <option value="C">Factura C (IVA no descontable)</option>
                            <option value="SIN">Sin factura (IVA no descontable)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">🏢 Proveedor</label>
                    <div class="relative">
                        <input type="text" id="proveedorNombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Nombre o razón social" autocomplete="off">
                        <div id="proveedorLista" class="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-40 overflow-y-auto hidden"></div>
                    </div>
                    <div class="flex gap-2 mt-1">
                        <input type="text" id="proveedorCuit" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="CUIT (opcional)">
                        <span class="text-xs text-gray-400 self-center">(opcional)</span>
                    </div>
                    <div id="proveedorInfoGuardado" class="text-xs text-gray-500 mt-1 hidden"></div>
                </div>

                <!-- 🔥 v7.16.28: Datos de contacto del proveedor (opcional, colapsable) -->
                <details class="border rounded-lg dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                    <summary class="p-2 cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        📇 Datos de contacto del proveedor (opcional)
                    </summary>
                    <div class="p-3 space-y-2 border-t dark:border-gray-600">
                        <p class="text-xs text-gray-500">Si completás estos datos, se van a guardar/actualizar en la sección Proveedores. También podés dejarlos vacíos y cargarlos después desde Configuración.</p>
                        <div>
                            <label class="block text-xs font-medium mb-1">🏷️ Rubro / Servicios que brinda</label>
                            <input type="text" id="proveedorRubro" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="Ej: Gomería, alineación, balanceo">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                                <label class="block text-xs font-medium mb-1">📞 Teléfono</label>
                                <input type="text" id="proveedorTelefono" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="Ej: 387 412-3456">
                            </div>
                            <div>
                                <label class="block text-xs font-medium mb-1">📧 Email</label>
                                <input type="email" id="proveedorEmail" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="proveedor@email.com">
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium mb-1">📍 Dirección</label>
                            <input type="text" id="proveedorDireccion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="Calle, número, ciudad">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                                <label class="block text-xs font-medium mb-1">🗺️ Provincia</label>
                                <input type="text" id="proveedorProvincia" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="Salta">
                            </div>
                            <div>
                                <label class="block text-xs font-medium mb-1">👤 Contacto</label>
                                <input type="text" id="proveedorContacto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="Nombre del vendedor/contacto">
                            </div>
                        </div>
                    </div>
                </details>

                <div>
                    <label class="block text-sm font-medium mb-1">📋 Ítems</label>
                    <div class="mb-1 grid grid-cols-12 gap-2 text-xs text-gray-500 px-1">
                        <span class="col-span-3">Descripción</span>
                        <span class="col-span-1 text-center">Cant.</span>
                        <span class="col-span-2 text-right">Precio Unit.</span>
                        <span class="col-span-2 text-center">¿Sin IVA?</span>
                        <span class="col-span-3 text-right">Subtotal</span>
                    </div>
                    <div id="itemsContainer" class="space-y-2">
                        <div class="item-row grid grid-cols-12 gap-2 items-center">
                            <input type="text" class="item-desc col-span-3 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Descripción">
                            <input type="number" class="item-cantidad col-span-1 p-1 border rounded text-sm dark:bg-gray-700 text-center" placeholder="Cant." value="1" min="1">
                            <input type="number" class="item-precio col-span-2 p-1 border rounded text-sm dark:bg-gray-700 text-right" placeholder="Precio" step="0.01">
                            <label class="col-span-2 flex items-center justify-center gap-1 text-xs cursor-pointer">
                                <input type="checkbox" class="item-sin-iva" onchange="window.recalcularTotales()">
                                <span>Sin IVA</span>
                            </label>
                            <input type="number" class="item-subtotal col-span-3 p-1 border rounded text-sm dark:bg-gray-700 font-bold text-right" placeholder="Subtotal" step="0.01" readonly>
                            <button type="button" class="col-span-1 text-red-500 text-sm" onclick="window.eliminarItem(this)">✕</button>
                        </div>
                    </div>
                    <button type="button" onclick="window.agregarItem()" class="mt-2 text-blue-600 text-sm">+ Agregar ítem</button>
                    <p class="text-xs text-gray-500 mt-1">💡 Marcá "Sin IVA" para aranceles u otros conceptos no gravados.</p>
                </div>

                <!-- 🔥 v7.16.4: Otros conceptos (arancel, flete, seguro) -->
                <div class="border-t pt-3">
                    <div class="flex justify-between items-center mb-2">
                        <label class="block text-sm font-medium">📎 Otros conceptos (arancel, flete, seguro)</label>
                        <button type="button" onclick="window.agregarConcepto()" class="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-3 py-1 rounded text-sm">+ Agregar concepto</button>
                    </div>
                    <div id="conceptosContainer" class="space-y-2">
                        <!-- Se llena dinámicamente -->
                    </div>
                    <p class="text-xs text-gray-500 mt-1">💡 Los conceptos sin IVA (arancel) son costo puro. Los conceptos con IVA suman al crédito fiscal (solo en Factura A).</p>
                </div>

                <div class="border-t pt-3 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">💰 Neto (sin IVA)</label>
                            <input type="number" id="montoNeto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"
                                   onchange="window.calcularDesdeNeto()"
                                   onfocus="this.select()">
                        </div>
                        <div id="ivaSection">
                            <label class="block text-sm font-medium mb-1">🧾 IVA</label>
                            <div class="flex gap-2">
                                <select id="ivaPorcentaje" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="window.calcularDesdeNeto()">
                                    <option value="0">0%</option>
                                    <option value="10.5">10.5%</option>
                                    <option value="21" selected>21%</option>
                                    <option value="27">27%</option>
                                </select>
                                <input type="number" id="ivaMonto" class="w-28 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01"
                                       onchange="window.calcularDesdeIVA()"
                                       onfocus="this.select()">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">💰 Total Factura</label>
                            <input type="number" id="totalFactura" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-bold" step="0.01"
                                   onchange="window.calcularDesdeTotal()"
                                   onfocus="this.select()"
                                   placeholder="Total">
                        </div>
                    </div>
                    <p id="ivaNoAplicaMsg" class="hidden text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                        💡 Factura C/SIN: no discrimina IVA. El Total es igual al Neto.
                    </p>
                    <div class="flex flex-wrap items-center gap-3">
                        <button type="button" id="btnRedondear" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-sm">🔢 Redondear Total</button>
                        <span class="text-xs text-gray-500">💡 Podés cargar cualquiera de los 3 y los otros se calculan solos.</span>
                    </div>
                    <div id="desgloseItems" class="hidden"></div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">📆 Plazo de pago (días)</label>
                        <input type="number" id="plazoPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="15" min="0">
                        <p class="text-xs text-gray-400 mt-1">0 = pago al contado (vencimiento hoy)</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">📅 Vence</label>
                        <input type="text" id="fechaVencimientoText" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" readonly>
                        <input type="hidden" id="fechaVencimientoHidden">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">📌 Estado (seleccioná si ya está pagado)</label>
                    <select id="estadoPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="PENDIENTE">⏳ Pendiente de pago</option>
                        <option value="PAGADO">✅ Pagado</option>
                    </select>
                </div>

                <!-- 🔥 v7.16.86: Método de pago (afecta impuesto al cheque) -->
                <div>
                    <label class="block text-sm font-medium mb-1">💳 Método de pago</label>
                    <select id="metodoPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="Efectivo">💵 Efectivo (sin imp. cheque)</option>
                        <option value="Transferencia">🏦 Transferencia (3% imp. cheque)</option>
                        <option value="Tarjeta Débito">💳 Tarjeta Débito (3% imp. cheque)</option>
                        <option value="Tarjeta Crédito">💳 Tarjeta Crédito (3% imp. cheque)</option>
                        <option value="Cheque">📝 Cheque (3% imp. cheque)</option>
                    </select>
                    <p class="text-xs text-gray-400 mt-1">Solo aplica si está Pagado. Efectivo = sin impuesto al cheque.</p>
                </div>

                <div id="campoFechaPago" class="hidden">
                    <label class="block text-sm font-medium mb-1">📅 Fecha de pago</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="fechaPagoText" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="DD/MM/AAAA" value="${formatDate(new Date())}">
                        <input type="date" id="fechaPagoHidden" class="hidden" value="${new Date().toISOString().split('T')[0]}">
                        <button type="button" id="btnCalendarioPago" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                    </div>
                </div>

                <div class="flex gap-3 mt-5">
                    <button type="submit" class="flex-1 bg-green-600 text-white py-2 rounded-xl">✅ Guardar</button>
                    <button type="button" id="cancelarBtn" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // ========== FUNCIÓN PARA ACTUALIZAR TIPO DE FACTURA ==========
    window.actualizarTipoFactura = () => {
        // 🔥 v7.16.9: Factura C/SIN no discrimina IVA → ocultar sección IVA
        const tipo = document.getElementById('tipoFactura')?.value || 'A';
        const ivaSection = document.getElementById('ivaSection');
        const ivaNoAplicaMsg = document.getElementById('ivaNoAplicaMsg');
        const ivaSelect = document.getElementById('ivaPorcentaje');
        const ivaMonto = document.getElementById('ivaMonto');

        const sinIVA = (tipo === 'C' || tipo === 'SIN');

        if (sinIVA) {
            // Ocultar sección de IVA
            if (ivaSection) ivaSection.classList.add('hidden');
            if (ivaNoAplicaMsg) ivaNoAplicaMsg.classList.remove('hidden');
            if (ivaSelect) ivaSelect.value = '0';
            if (ivaMonto) ivaMonto.value = '0.00';

            // Recalcular: Total = Neto
            const netoInput = document.getElementById('montoNeto');
            const totalInput = document.getElementById('totalFactura');
            const neto = parseFloat(netoInput?.value) || 0;
            if (totalInput) totalInput.value = neto.toFixed(2);
        } else {
            // A o B: mostrar sección de IVA
            if (ivaSection) ivaSection.classList.remove('hidden');
            if (ivaNoAplicaMsg) ivaNoAplicaMsg.classList.add('hidden');
            if (ivaSelect && ivaSelect.value === '0') ivaSelect.value = '21';
            window.calcularDesdeNeto();
        }
    };

    // ========== FECHA EMISIÓN ==========
    const fechaTextEmision = document.getElementById('fechaEmisionText');
    const fechaHiddenEmision = document.getElementById('fechaEmisionHidden');
    const btnCalendarioEmision = document.getElementById('btnCalendario');

    function actualizarFechaEmision() {
        if (fechaHiddenEmision.value) {
            const dateObj = new Date(fechaHiddenEmision.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaTextEmision.value = formatDate(dateObj);
            }
        } else {
            fechaTextEmision.value = '';
        }
    }

    btnCalendarioEmision.addEventListener('click', function() {
        fechaHiddenEmision.showPicker ? fechaHiddenEmision.showPicker() : fechaHiddenEmision.click();
    });

    fechaHiddenEmision.addEventListener('change', function() {
        actualizarFechaEmision();
        actualizarVencimiento();
    });

    fechaTextEmision.addEventListener('blur', function() {
        const val = this.value.trim();
        if (val) {
            const partes = val.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]);
                const mes = parseInt(partes[1]) - 1;
                const anio = parseInt(partes[2]);
                if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
                    const fechaObj = new Date(anio, mes, dia);
                    if (!isNaN(fechaObj) && fechaObj.getFullYear() === anio && fechaObj.getMonth() === mes && fechaObj.getDate() === dia) {
                        const iso = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                        fechaHiddenEmision.value = iso;
                        actualizarFechaEmision();
                        actualizarVencimiento();
                        return;
                    }
                }
            }
            actualizarFechaEmision();
            mostrarNotificacion('Formato inválido. Usá DD/MM/AAAA', 'warning');
        } else {
            fechaHiddenEmision.value = '';
            actualizarFechaEmision();
            actualizarVencimiento();
        }
    });

    actualizarFechaEmision();

    // ========== AUTCOMPLETADO DE PROVEEDORES ==========
    const provInput = document.getElementById('proveedorNombre');
    const provLista = document.getElementById('proveedorLista');
    const provCuitInput = document.getElementById('proveedorCuit');

    provInput.addEventListener('input', function() {
        const texto = this.value.trim().toLowerCase();
        if (texto.length < 1) { provLista.classList.add('hidden'); return; }
        const db = getDB();
        const proveedores = db.proveedores || [];
        const filtrados = proveedores.filter(p => p.nombre.toLowerCase().includes(texto));
        if (filtrados.length === 0) { provLista.classList.add('hidden'); return; }
        provLista.innerHTML = filtrados.map(p => `
            <div class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b last:border-b-0" 
                 onclick="window.seleccionarProveedor('${p.id}')">
                <strong>${escapeHtml(p.nombre)}</strong>
                ${p.cuit ? `<span class="text-xs text-gray-500 ml-2">CUIT: ${escapeHtml(p.cuit)}</span>` : ''}
            </div>
        `).join('');
        provLista.classList.remove('hidden');
    });

    document.addEventListener('click', function(e) {
        if (!provInput.contains(e.target) && !provLista.contains(e.target)) {
            provLista.classList.add('hidden');
        }
    });

    window.seleccionarProveedor = (id) => {
        const db = getDB();
        const prov = db.proveedores.find(p => p.id === id);
        if (!prov) return;
        provInput.value = prov.nombre;
        provCuitInput.value = prov.cuit || '';

        // 🔥 v7.16.28: autocargar datos de contacto del proveedor seleccionado
        const setVal = (elemId, val) => {
            const el = document.getElementById(elemId);
            if (el && val) el.value = val;
        };
        setVal('proveedorRubro', prov.rubro);
        setVal('proveedorTelefono', prov.telefono);
        setVal('proveedorEmail', prov.email);
        setVal('proveedorDireccion', prov.direccion);
        setVal('proveedorProvincia', prov.provincia);
        setVal('proveedorContacto', prov.contacto);

        // Mostrar info del proveedor existente
        const infoDiv = document.getElementById('proveedorInfoGuardado');
        if (infoDiv) {
            infoDiv.classList.remove('hidden');
            const datos = [];
            if (prov.rubro) datos.push(`🏷️ ${prov.rubro}`);
            if (prov.telefono) datos.push(`📞 ${prov.telefono}`);
            if (prov.email) datos.push(`📧 ${prov.email}`);
            if (prov.direccion) datos.push(`📍 ${prov.direccion}`);
            infoDiv.innerHTML = `✅ Proveedor existente${datos.length > 0 ? ' · ' + datos.join(' · ') : ''}`;
        }

        provLista.classList.add('hidden');
        mostrarNotificacion(`✅ Proveedor seleccionado: ${prov.nombre}`, 'success');
    };

    // ========== REDONDEO ==========
    document.getElementById('btnRedondear')?.addEventListener('click', function() {
        const totalInput = document.getElementById('totalFactura');
        if (!totalInput.value) { mostrarNotificacion('Primero ingresá el total', 'warning'); return; }
        const valor = parseFloat(totalInput.value);
        if (isNaN(valor)) return;
        const redondeado = Math.round(valor);
        totalInput.value = redondeado.toFixed(2);
        window.calcularDesdeTotal();
        mostrarNotificacion(`✅ Total redondeado a $${formatNumber(redondeado)}`, 'success');
    });

    // ========== CÁLCULO INVERSO (v7.16.4) ==========
    // Los 3 inputs (Neto, IVA $, Total) son editables.
    // Al cambiar cualquiera, calcula los otros dos.

    window.calcularDesdeNeto = () => {
        const netoInput = document.getElementById('montoNeto');
        const ivaSelect = document.getElementById('ivaPorcentaje');
        const ivaMontoInput = document.getElementById('ivaMonto');
        const totalInput = document.getElementById('totalFactura');
        const tipoFactura = document.getElementById('tipoFactura')?.value || 'A';

        const neto = parseFloat(netoInput?.value) || 0;
        const ivaPorc = parseFloat(ivaSelect?.value) || 0;

        // 🔥 v7.16.9: Factura C/SIN no discrimina IVA → Total = Neto
        if (tipoFactura === 'C' || tipoFactura === 'SIN') {
            if (ivaMontoInput) ivaMontoInput.value = '0.00';
            if (totalInput) totalInput.value = neto.toFixed(2);
            return;
        }

        // Factura A/B: el neto es la base, se agrega IVA
        const ivaMonto = +(neto * (ivaPorc / 100)).toFixed(2);
        const total = +(neto + ivaMonto).toFixed(2);

        if (ivaMontoInput) ivaMontoInput.value = ivaMonto.toFixed(2);
        if (totalInput) totalInput.value = total.toFixed(2);
    };

    window.calcularDesdeIVA = () => {
        const netoInput = document.getElementById('montoNeto');
        const ivaSelect = document.getElementById('ivaPorcentaje');
        const ivaMontoInput = document.getElementById('ivaMonto');
        const totalInput = document.getElementById('totalFactura');
        const tipoFactura = document.getElementById('tipoFactura')?.value || 'A';

        // 🔥 v7.16.9: Factura C/SIN no tiene IVA
        if (tipoFactura === 'C' || tipoFactura === 'SIN') {
            if (ivaMontoInput) ivaMontoInput.value = '0.00';
            return;
        }

        const ivaMonto = parseFloat(ivaMontoInput?.value) || 0;
        const ivaPorc = parseFloat(ivaSelect?.value) || 0;

        if (ivaPorc === 0) {
            if (ivaMontoInput) ivaMontoInput.value = '0.00';
            return;
        }

        const neto = +(ivaMonto / (ivaPorc / 100)).toFixed(2);
        const total = +(neto + ivaMonto).toFixed(2);

        if (netoInput) netoInput.value = neto.toFixed(2);
        if (totalInput) totalInput.value = total.toFixed(2);
    };

    window.calcularDesdeTotal = () => {
        const netoInput = document.getElementById('montoNeto');
        const ivaSelect = document.getElementById('ivaPorcentaje');
        const ivaMontoInput = document.getElementById('ivaMonto');
        const totalInput = document.getElementById('totalFactura');
        const tipoFactura = document.getElementById('tipoFactura')?.value || 'A';

        const total = parseFloat(totalInput?.value) || 0;

        // 🔥 v7.16.9: Factura C/SIN no discrimina IVA → Neto = Total
        if (tipoFactura === 'C' || tipoFactura === 'SIN') {
            if (netoInput) netoInput.value = total.toFixed(2);
            if (ivaMontoInput) ivaMontoInput.value = '0.00';
            return;
        }

        const ivaPorc = parseFloat(ivaSelect?.value) || 0;

        if (total <= 0) {
            if (netoInput) netoInput.value = '';
            if (ivaMontoInput) ivaMontoInput.value = '';
            return;
        }

        // Despejar neto e IVA desde el total (asume que el total incluye IVA)
        const neto = +(total / (1 + ivaPorc / 100)).toFixed(2);
        const ivaMonto = +(total - neto).toFixed(2);

        if (netoInput) netoInput.value = neto.toFixed(2);
        if (ivaMontoInput) ivaMontoInput.value = ivaMonto.toFixed(2);
    };

    // ========== FECHA DE PAGO ==========
    const fechaPagoText = document.getElementById('fechaPagoText');
    const fechaPagoHidden = document.getElementById('fechaPagoHidden');
    const btnCalendarioPago = document.getElementById('btnCalendarioPago');

    function actualizarFechaPagoText() {
        if (fechaPagoHidden.value) {
            const dateObj = new Date(fechaPagoHidden.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaPagoText.value = formatDate(dateObj);
            }
        } else {
            fechaPagoText.value = '';
        }
    }

    btnCalendarioPago?.addEventListener('click', function() {
        fechaPagoHidden.showPicker ? fechaPagoHidden.showPicker() : fechaPagoHidden.click();
    });

    fechaPagoHidden?.addEventListener('change', actualizarFechaPagoText);

    fechaPagoText?.addEventListener('blur', function() {
        const val = this.value.trim();
        if (val) {
            const partes = val.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]);
                const mes = parseInt(partes[1]) - 1;
                const anio = parseInt(partes[2]);
                if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
                    const fechaObj = new Date(anio, mes, dia);
                    if (!isNaN(fechaObj) && fechaObj.getFullYear() === anio && fechaObj.getMonth() === mes && fechaObj.getDate() === dia) {
                        const iso = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                        fechaPagoHidden.value = iso;
                        actualizarFechaPagoText();
                        return;
                    }
                }
            }
            actualizarFechaPagoText();
            mostrarNotificacion('Formato inválido. Usá DD/MM/AAAA', 'warning');
        } else {
            fechaPagoHidden.value = '';
            actualizarFechaPagoText();
        }
    });

    actualizarFechaPagoText();

    window.actualizarFechaPago = (estado) => {
        const campo = document.getElementById('campoFechaPago');
        if (estado === 'PAGADO') {
            campo.classList.remove('hidden');
        } else {
            campo.classList.add('hidden');
        }
    };

    // ========== EVENTOS DEL FORMULARIO ==========
    const form = document.getElementById('formCompraGasto');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        window.guardarCompraGasto();
    });

    document.getElementById('cancelarBtn').addEventListener('click', () => modal.remove());

    // ---------- PLAZO Y VENCIMIENTO ----------
    const fechaVencimientoText = document.getElementById('fechaVencimientoText');
    const fechaVencimientoHidden = document.getElementById('fechaVencimientoHidden');
    const plazoInput = document.getElementById('plazoPago');

    function actualizarVencimiento() {
        if (fechaHiddenEmision.value && plazoInput.value !== undefined && plazoInput.value !== '') {
            const plazo = parseInt(plazoInput.value) || 0;

            // 🔥 v7.16.81: parsear fecha como LOCAL (evita bug UTC-3)
            const [anio, mes, dia] = fechaHiddenEmision.value.split('-').map(Number);
            const fecha = new Date(anio, mes - 1, dia);

            // Sumar los días de plazo (0 = mismo día)
            fecha.setDate(fecha.getDate() + plazo);

            // 🔥 Construir ISO manualmente (sin toISOString que usa UTC)
            const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

            fechaVencimientoHidden.value = iso;
            fechaVencimientoText.value = formatDate(fecha);
        } else {
            fechaVencimientoHidden.value = '';
            fechaVencimientoText.value = '';
        }
    }

    fechaHiddenEmision.addEventListener('change', actualizarVencimiento);
    plazoInput.addEventListener('input', actualizarVencimiento);
    actualizarVencimiento();

    // ---------- ÍTEMS ----------
    const container = document.getElementById('itemsContainer');
    container.addEventListener('input', window.recalcularTotales);

    // ========== GUARDAR ARCHIVO ==========
    let archivoSeleccionado = null;
    const archivoInfo = document.getElementById('archivoInfo');

    function handleFileSelect(file) {
        if (!file) return;
        archivoSeleccionado = file;
        archivoInfo.classList.remove('hidden');
        archivoInfo.innerHTML = `📎 Archivo seleccionado: <strong>${escapeHtml(file.name)}</strong> (${(file.size/1024).toFixed(1)} KB)`;
        window._archivoSeleccionado = file;
    }

    // 🔥 v7.16.4: comprobante de pago separado
    window.seleccionarComprobantePago = (file) => {
        if (!file) return;
        window._comprobantePagoSeleccionado = file;
        const info = document.getElementById('comprobantePagoInfo');
        if (info) {
            info.classList.remove('hidden');
            info.innerHTML = `📎 Comprobante: <strong>${escapeHtml(file.name)}</strong> (${(file.size/1024).toFixed(1)} KB)`;
        }
        // 🔥 v7.16.77: mostrar bloque de acciones (Ver/Quitar)
        const previewActions = document.getElementById('comprobantePagoPreviewActions');
        const nombreSpan = document.getElementById('comprobanteNombreArchivo');
        if (previewActions && nombreSpan) {
            nombreSpan.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
            previewActions.classList.remove('hidden');
        }
    };

    document.getElementById('ocrInput')?.addEventListener('change', function(e) {
        if (this.files[0]) handleFileSelect(this.files[0]);
    });
    document.getElementById('ocrInputFile')?.addEventListener('change', function(e) {
        if (this.files[0]) handleFileSelect(this.files[0]);
    });

    document.getElementById('ivaPorcentaje')?.addEventListener('change', window.calcularDesdeTotal);
    // (checkbox totalIncluyeIVA eliminado en v7.16.4 — cálculo inverso lo reemplaza)
    document.getElementById('totalFactura')?.addEventListener('input', window.calcularDesdeTotal);

    window.actualizarTipoFactura();

    const estadoInicial = document.getElementById('estadoPago')?.value;
    window.actualizarFechaPago(estadoInicial);
};

// ==================== OCR / PARSER DE FACTURAS (v7.16.11) ====================
window.procesarOCR = async (file) => {
    if (!file) return;

    const status = document.getElementById('ocrStatus');
    if (!status) return;

    status.innerHTML = '⏳ Procesando archivo...';

    // 🔥 Guardar el archivo + mostrar acciones
    window._archivoSeleccionado = file;
    window._facturaProveedorSeleccionada = file;

    const previewActions = document.getElementById('facturaPreviewActions');
    const nombreSpan = document.getElementById('facturaNombreArchivo');
    if (previewActions && nombreSpan) {
        nombreSpan.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
        previewActions.classList.remove('hidden');
    }

    try {
        // 🔥 v7.16.14: usar el parser completo + pasar el CUIT de la empresa
        const db = getDB();
        const cuitEmpresa = db?.datosEmpresa?.cuit || null;
        const resultado = await procesarArchivoFactura(file, (msg, pct) => {
            status.innerHTML = `${msg}`;
        }, cuitEmpresa);

        const { datos, fuente } = resultado;

        if (!datos || Object.keys(datos).length === 0) {
            status.innerHTML = '⚠️ No se pudieron leer datos del archivo. Cargalos manualmente.';
            return;
        }

        // ==================== PRECARGA DE CAMPOS ====================
        let camposLeidos = [];

        // 1. Tipo de factura
        if (datos.tipo) {
            const tipoSelect = document.getElementById('tipoFactura');
            if (tipoSelect) {
                tipoSelect.value = datos.tipo;
                tipoSelect.dispatchEvent(new Event('change'));
                camposLeidos.push(`Tipo: <strong>Factura ${datos.tipo}</strong>`);
            }
        }

        // 2. Número de factura
        if (datos.numeroFactura) {
            const el = document.getElementById('numeroFactura');
            if (el && !el.value) {
                el.value = datos.numeroFactura;
                camposLeidos.push(`Nº: <strong>${datos.numeroFactura}</strong>`);
            }
        }

        // 3. Fecha de emisión
        if (datos.fecha) {
            const fechaHidden = document.getElementById('fechaEmisionHidden');
            const fechaText = document.getElementById('fechaEmisionText');
            if (fechaHidden && fechaText) {
                fechaHidden.value = datos.fecha;
                // Convertir ISO a DD/MM/AAAA
                const [anio, mes, dia] = datos.fecha.split('-');
                fechaText.value = `${dia}/${mes}/${anio}`;
                camposLeidos.push(`Fecha: <strong>${dia}/${mes}/${anio}</strong>`);
                // Actualizar vencimiento
                if (typeof window.actualizarVencimiento === 'function') {
                    try { window.actualizarVencimiento(); } catch(e) {}
                }
            }
        }

        // 4. CUIT del proveedor
        if (datos.cuit) {
            const el = document.getElementById('proveedorCuit');
            if (el && !el.value) {
                el.value = datos.cuitFormateado || datos.cuit;
                camposLeidos.push(`CUIT: <strong>${datos.cuitFormateado || datos.cuit}</strong>`);
            }
        }

        // 5. Razón social (proveedor)
        if (datos.razonSocial) {
            const el = document.getElementById('proveedorNombre');
            if (el && !el.value) {
                el.value = datos.razonSocial;
                camposLeidos.push(`Proveedor: <strong>${datos.razonSocial}</strong>`);
            }
        }

        // 6. Subtotal (Neto)
        if (datos.subtotal) {
            const el = document.getElementById('montoNeto');
            if (el && !el.value) {
                el.value = datos.subtotal.toFixed(2);
                camposLeidos.push(`Neto: <strong>$${formatNumber(datos.subtotal)}</strong>`);
            }
        }

        // 7. IVA
        if (datos.iva !== undefined && datos.iva > 0) {
            const el = document.getElementById('ivaMonto');
            if (el) {
                el.value = datos.iva.toFixed(2);
                camposLeidos.push(`IVA: <strong>$${formatNumber(datos.iva)}</strong>`);
            }
            // Alícuota
            if (datos.alicuotaIVA) {
                const sel = document.getElementById('ivaPorcentaje');
                if (sel) {
                    // Buscar la opción más cercana
                    const opciones = Array.from(sel.options).map(o => parseFloat(o.value));
                    const masCercana = opciones.reduce((prev, curr) =>
                        Math.abs(curr - datos.alicuotaIVA) < Math.abs(prev - datos.alicuotaIVA) ? curr : prev
                    );
                    sel.value = masCercana.toString();
                }
            }
        }

        // 8. Total
        if (datos.total) {
            const el = document.getElementById('totalFactura');
            if (el && !el.value) {
                el.value = datos.total.toFixed(2);
                camposLeidos.push(`Total: <strong>$${formatNumber(datos.total)}</strong>`);
            }
        }

        // 9. 🔥 v7.16.21: Precargar ítems si se detectaron
        if (datos.items && datos.items.length > 0) {
            const container = document.getElementById('itemsContainer');
            if (container) {
                // Limpiar ítems existentes (dejamos solo el primero vacío)
                const filas = container.querySelectorAll('.item-row');
                filas.forEach((fila, i) => {
                    if (i > 0) fila.remove();
                });

                // Prellenar el primer ítem con el primero detectado
                const primerItem = datos.items[0];
                const primeraFila = container.querySelector('.item-row');
                if (primeraFila) {
                    const descInput = primeraFila.querySelector('.item-desc');
                    const cantInput = primeraFila.querySelector('.item-cantidad');
                    const precioInput = primeraFila.querySelector('.item-precio');

                    if (descInput) descInput.value = primerItem.descripcion;
                    if (cantInput) cantInput.value = primerItem.cantidad;
                    if (precioInput) precioInput.value = primerItem.precioUnitario;
                }

                // Si hay más ítems, agregar filas adicionales
                for (let i = 1; i < datos.items.length; i++) {
                    if (typeof window.agregarItem === 'function') {
                        window.agregarItem();
                    }
                    const nuevaFila = container.querySelectorAll('.item-row')[i];
                    if (nuevaFila) {
                        const item = datos.items[i];
                        const descInput = nuevaFila.querySelector('.item-desc');
                        const cantInput = nuevaFila.querySelector('.item-cantidad');
                        const precioInput = nuevaFila.querySelector('.item-precio');

                        if (descInput) descInput.value = item.descripcion;
                        if (cantInput) cantInput.value = item.cantidad;
                        if (precioInput) precioInput.value = item.precioUnitario;
                    }
                }

                camposLeidos.push(`Ítems: <strong>${datos.items.length}</strong>`);

                // Recalcular
                if (typeof window.recalcularTotales === 'function') {
                    window.recalcularTotales();
                }
            }
        }

        // 9. Otros tributos (sumar al total como concepto adicional si aplica)
        if (datos.otrosTributos && datos.otrosTributos > 0) {
            const el = document.getElementById('totalFactura');
            if (el && el.value) {
                const totalActual = parseFloat(el.value) || 0;
                el.value = (totalActual + datos.otrosTributos).toFixed(2);
                camposLeidos.push(`Otros tributos: <strong>$${formatNumber(datos.otrosTributos)}</strong>`);
            }
        }

        // ==================== RECALCULAR ====================
        // Forzar recálculo desde el total (respetando el tipo de factura)
        setTimeout(() => {
            try {
                window.actualizarTipoFactura();
                if (document.getElementById('totalFactura')?.value) {
                    window.calcularDesdeTotal();
                } else if (document.getElementById('montoNeto')?.value) {
                    window.calcularDesdeNeto();
                }
            } catch(e) {
                console.warn('Error recalculando:', e);
            }
        }, 50);

        // ==================== FEEDBACK ====================
        const fuenteLabel = fuente === 'pdf.js' ? '📄 PDF' : '🔍 OCR';
        status.innerHTML = `
            <div class="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg p-3 mt-2">
                <p class="font-bold text-green-700 dark:text-green-300 mb-1">
                    ✅ ${fuenteLabel} — Datos leídos (${camposLeidos.length} campos)
                </p>
                <ul class="text-xs text-gray-600 dark:text-gray-400 space-y-0.5 list-disc list-inside">
                    ${camposLeidos.map(c => `<li>${c}</li>`).join('')}
                </ul>
                <details class="mt-2">
                    <summary class="text-xs text-blue-600 cursor-pointer font-bold">🔍 Ver texto crudo del PDF (debug)</summary>
                    <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">${resultado.texto}</pre>
                </details>
                <details class="mt-2">
                    <summary class="text-xs text-purple-600 cursor-pointer font-bold">📊 Ver datos extraídos (debug)</summary>
                    <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap break-words">${JSON.stringify(resultado.datos, null, 2)}</pre>
                </details>
                <p class="text-xs text-blue-600 mt-2">💡 Revisá los datos y corregí si algo está mal antes de guardar.</p>
            </div>
        `;

        mostrarNotificacion(`✅ ${camposLeidos.length} campos leídos del archivo`, 'success');

    } catch (e) {
        console.error('Error procesando archivo:', e);
        status.innerHTML = `❌ Error al procesar: ${e.message}. Cargá los datos manualmente.`;
        mostrarNotificacion('Error al leer el archivo', 'error');
    } finally {
        // 🔥 v7.16.14: resetear el input para permitir subir el mismo archivo dos veces
        const inputOcr = document.getElementById('ocrInput');
        const inputOcrFile = document.getElementById('ocrInputFile');
        if (inputOcr) inputOcr.value = '';
        if (inputOcrFile) inputOcrFile.value = '';
    }
};

// ==================== FUNCIONES DE ITEMS ====================
window.agregarItem = () => {
    const container = document.getElementById('itemsContainer');
    const row = document.createElement('div');
    row.className = 'item-row grid grid-cols-12 gap-2 items-center';
    row.innerHTML = `
        <input type="text" class="item-desc col-span-3 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Descripción">
        <input type="number" class="item-cantidad col-span-1 p-1 border rounded text-sm dark:bg-gray-700 text-center" placeholder="Cant." value="1" min="1">
        <input type="number" class="item-precio col-span-2 p-1 border rounded text-sm dark:bg-gray-700 text-right" placeholder="Precio" step="0.01">
        <label class="col-span-2 flex items-center justify-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" class="item-sin-iva" onchange="window.recalcularTotales()">
            <span>Sin IVA</span>
        </label>
        <input type="number" class="item-subtotal col-span-3 p-1 border rounded text-sm dark:bg-gray-700 font-bold text-right" placeholder="Subtotal" step="0.01" readonly>
        <button type="button" class="col-span-1 text-red-500 text-sm" onclick="window.eliminarItem(this)">✕</button>
    `;
    container.appendChild(row);
    row.querySelectorAll('input[type="text"], input[type="number"]').forEach(inp => inp.addEventListener('input', window.recalcularTotales));
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

// ==================== OTROS CONCEPTOS (v7.16.4) ====================
window.agregarConcepto = () => {
    const container = document.getElementById('conceptosContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'concepto-row grid grid-cols-12 gap-2 items-center';
    row.innerHTML = `
        <input type="text" class="concepto-desc col-span-5 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Descripción (ej: Arancel)">
        <input type="number" class="concepto-monto col-span-3 p-1 border rounded text-sm dark:bg-gray-700" placeholder="Monto" step="0.01">
        <label class="col-span-3 flex items-center gap-1 text-xs">
            <input type="checkbox" class="concepto-computaIVA">
            <span>Computa IVA</span>
        </label>
        <button type="button" class="col-span-1 text-red-500 text-sm" onclick="window.eliminarConcepto(this)">✕</button>
    `;
    container.appendChild(row);
    row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', window.recalcularTotales));
    row.querySelectorAll('input[type="checkbox"]').forEach(inp => inp.addEventListener('change', window.recalcularTotales));
};

window.eliminarConcepto = (btn) => {
    const row = btn.closest('.concepto-row');
    if (row) {
        row.remove();
        window.recalcularTotales();
    }
};

// Helper: lee los conceptos del DOM
function leerConceptos() {
    const conceptos = [];
    document.querySelectorAll('.concepto-row').forEach(row => {
        const desc = row.querySelector('.concepto-desc')?.value.trim() || '';
        const monto = parseFloat(row.querySelector('.concepto-monto')?.value) || 0;
        const computaIVA = row.querySelector('.concepto-computaIVA')?.checked || false;
        if (desc && monto > 0) {
            conceptos.push({ descripcion: desc, monto, computaIVA });
        }
    });
    return conceptos;
}

window.recalcularTotales = () => {
    const rows = document.querySelectorAll('.item-row');
    let netoGravadoItems = 0;  // ítems con IVA
    let noGravadoItems = 0;    // ítems sin IVA
    rows.forEach(row => {
        const cantidad = parseFloat(row.querySelector('.item-cantidad').value) || 0;
        const precio = parseFloat(row.querySelector('.item-precio').value) || 0;
        const sinIVA = row.querySelector('.item-sin-iva')?.checked || false;
        const total = cantidad * precio;
        const totalInput = row.querySelector('.item-subtotal');
        if (totalInput) totalInput.value = total.toFixed(2);
        if (sinIVA) {
            noGravadoItems += total;
        } else {
            netoGravadoItems += total;
        }
    });

    // 🔥 v7.16.74: sumar otros conceptos
    const conceptos = leerConceptos();
    const conceptosConIVA = conceptos.filter(c => c.computaIVA).reduce((s, c) => s + c.monto, 0);
    const conceptosSinIVA = conceptos.filter(c => !c.computaIVA).reduce((s, c) => s + c.monto, 0);

    // Neto gravado = ítems con IVA + conceptos con IVA
    const netoGravado = netoGravadoItems + conceptosConIVA;
    // No gravado = ítems sin IVA + conceptos sin IVA
    const noGravado = noGravadoItems + conceptosSinIVA;

    const netoInput = document.getElementById('montoNeto');
    if (netoInput) netoInput.value = netoGravado.toFixed(2);

    // Recalcular IVA y total
    const ivaSelect = document.getElementById('ivaPorcentaje');
    const ivaMontoInput = document.getElementById('ivaMonto');
    const totalInput = document.getElementById('totalFactura');
    if (ivaSelect && ivaMontoInput && totalInput && (netoGravado > 0 || noGravado > 0)) {
        const ivaPorc = parseFloat(ivaSelect.value) || 0;
        // IVA solo sobre neto gravado
        const ivaMonto = +(netoGravado * (ivaPorc / 100)).toFixed(2);
        ivaMontoInput.value = ivaMonto.toFixed(2);
        // Total = neto gravado + IVA + no gravado
        totalInput.value = (netoGravado + ivaMonto + noGravado).toFixed(2);
    }

    // 🔥 v7.16.74: mostrar desglose
    const desgloseEl = document.getElementById('desgloseItems');
    if (desgloseEl) {
        if (netoGravado > 0 || noGravado > 0) {
            desgloseEl.innerHTML = `
                <div class="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded space-y-0.5">
                    <div>Neto gravado (con IVA): <strong>$${formatNumber(netoGravado)}</strong></div>
                    ${noGravado > 0 ? `<div>No gravado (sin IVA): <strong class="text-orange-600">$${formatNumber(noGravado)}</strong></div>` : ''}
                    <div>IVA: <strong class="text-orange-600">$${formatNumber(ivaMontoInput.value ? parseFloat(ivaMontoInput.value) : 0)}</strong></div>
                    <div class="border-t pt-1 mt-1 font-bold">Total Factura: <strong>$${formatNumber(totalInput.value ? parseFloat(totalInput.value) : 0)}</strong></div>
                    ${(() => {
                        const ivaNum = ivaMontoInput.value ? parseFloat(ivaMontoInput.value) : 0;
                        const totalNum = totalInput.value ? parseFloat(totalInput.value) : 0;
                        const sumaMatematica = +(netoGravado + ivaNum + noGravado).toFixed(2);
                        const diferencia = +(sumaMatematica - totalNum).toFixed(2);
                        if (Math.abs(diferencia) < 0.01) return '';
                        return `<div class="text-xs text-gray-500 italic">(Suma matemática: $${formatNumber(sumaMatematica)} — ajuste por redondeo: $${formatNumber(diferencia)})</div>`;
                    })()}
                </div>
                </div>
            `;
            desgloseEl.classList.remove('hidden');
        } else {
            desgloseEl.classList.add('hidden');
        }
    }
};

// ==================== GUARDAR NUEVA COMPRA ====================
window.guardarCompraGasto = async () => {
    try {
        const db = getDB();
        const fechaISO = document.getElementById('fechaEmisionHidden')?.value;
        const fechaVencimientoISO = document.getElementById('fechaVencimientoHidden')?.value;
        const tipoFactura = document.getElementById('tipoFactura')?.value;
        const ivaDescontable = tipoFactura === 'A';

        // 🔥 v7.16.31: definir aplicaIVA ANTES de usarlo en data
        const aplicaIVA = (tipoFactura === 'A' || tipoFactura === 'B');

        const data = {
            id: generarId(),
            tipo: document.getElementById('tipoMovimiento')?.value,
            fechaEmision: fechaISO,
            numeroFactura: document.getElementById('numeroFactura')?.value.trim(),
            proveedorNombre: document.getElementById('proveedorNombre')?.value.trim(),
            proveedorCuit: document.getElementById('proveedorCuit')?.value.trim() || null,
            // 🔥 v7.16.28: datos de contacto del proveedor
            proveedorTelefono: document.getElementById('proveedorTelefono')?.value.trim() || null,
            proveedorEmail: document.getElementById('proveedorEmail')?.value.trim() || null,
            proveedorDireccion: document.getElementById('proveedorDireccion')?.value.trim() || null,
            proveedorProvincia: document.getElementById('proveedorProvincia')?.value.trim() || null,
            proveedorContacto: document.getElementById('proveedorContacto')?.value.trim() || null,
            proveedorRubro: document.getElementById('proveedorRubro')?.value.trim() || null,
            // 🔥 v7.16.28: datos de contacto del proveedor
            metodoPago: document.getElementById('metodoPago')?.value,
            concepto: document.getElementById('proveedorNombre')?.value.trim() || 'Sin proveedor',
            categoria: document.getElementById('tipoMovimiento')?.value === 'COMPRA' ? 'MERCADERIA' :
                        document.getElementById('tipoMovimiento')?.value === 'GASTO_ADMIN' ? 'ADMIN' : 'FIJO',
            montoNeto: parseFloat(document.getElementById('montoNeto')?.value) || 0,
            ivaPorcentaje: aplicaIVA ? (parseFloat(document.getElementById('ivaPorcentaje')?.value) || 0) : 0,
            ivaMonto: aplicaIVA ? (parseFloat(document.getElementById('ivaMonto')?.value) || 0) : 0,
            totalFactura: parseFloat(document.getElementById('totalFactura')?.value) || 0,
            plazoPago: parseInt(document.getElementById('plazoPago')?.value) || 0,
            fechaVencimientoPago: fechaVencimientoISO,
            estadoPago: document.getElementById('estadoPago')?.value,
            fechaPago: null,
            items: [],
            archivoNombre: null,
            archivoUrl: null,
            // 🔥 v7.16.4: factura del proveedor separada de comprobante de pago
            facturaProveedorNombre: null,
            facturaProveedorUrl: null,
            comprobantePagoNombre: null,
            comprobantePagoUrl: null,
            observaciones: '',
            proveedorId: null,
            tipoFactura: tipoFactura,
            ivaDescontable: ivaDescontable,
            // 🔥 v7.16.4: campos contables (se completan más abajo)
            ivaComputable: ivaDescontable,
            totales: null
        };

        if (data.estadoPago === 'PAGADO') {
            data.fechaPago = document.getElementById('fechaPagoHidden')?.value || new Date().toISOString().split('T')[0];
        }

        if (!data.numeroFactura) { mostrarNotificacion('Ingrese número de factura', 'error'); return; }
        if (!data.proveedorNombre) { mostrarNotificacion('Ingrese nombre del proveedor', 'error'); return; }
        if (!data.fechaEmision) { mostrarNotificacion('Ingrese fecha', 'error'); return; }

        const rows = document.querySelectorAll('.item-row');
        if (rows.length === 0) { mostrarNotificacion('Agregue al menos un ítem', 'error'); return; }
        let itemValido = true;

        // 🔥 v7.16.33: si el rubro del proveedor está vacío, autocargarlo con la descripción del primer ítem
        const primerDesc = rows[0]?.querySelector('.item-desc')?.value?.trim();
        const rubroInput = document.getElementById('proveedorRubro');
        if (rubroInput && !rubroInput.value && primerDesc) {
            rubroInput.value = primerDesc.toUpperCase();
        }

        // 🔥 v7.16.4: estructura contable
        // 🔥 v7.16.9: Factura C/SIN no tiene IVA
        const alicuotaIVA = aplicaIVA ? (parseFloat(document.getElementById('ivaPorcentaje')?.value) || 0) : 0;
        const ivaComputable = ivaDescontable; // true solo para Factura A

        // Acumuladores para el desglose contable
        let acumNetoGravado = 0;      // suma de netos de items (solo si computa IVA)
        let acumIVACompras = 0;       // IVA computable (crédito fiscal)
        let acumIVANoComputable = 0;  // IVA informativo (facturas B/C)
        let acumNoGravado = 0;        // conceptos sin IVA
        let acumCostoGanancias = 0;   // costo total para Ganancias

        rows.forEach(row => {
            const cantidad = parseFloat(row.querySelector('.item-cantidad').value) || 0;
            const precio = parseFloat(row.querySelector('.item-precio').value) || 0;
            const itemSinIVA = row.querySelector('.item-sin-iva')?.checked || false;
            if (cantidad <= 0 || precio <= 0) {
                mostrarNotificacion('Cantidad y precio deben ser mayores a 0', 'error');
                itemValido = false;
                return;
            }

            // 🔥 v7.16.75: Calcular neto, IVA y total según "Sin IVA" y tipo de factura
            let precioNeto, ivaItemMonto, totalItem, itemComputaIVA;

            if (itemSinIVA) {
                // 🔥 ÍTEM SIN IVA (arancel, oblea, etc.): no computa crédito fiscal
                precioNeto = precio;
                ivaItemMonto = 0;
                totalItem = precio;
                itemComputaIVA = false;
            } else if (ivaComputable) {
                // Factura A: el precio cargado ES el neto
                precioNeto = precio;
                ivaItemMonto = +(precio * (alicuotaIVA / 100)).toFixed(2);
                totalItem = +(precio + ivaItemMonto).toFixed(2);
                itemComputaIVA = true;
            } else {
                // Factura B/C/SIN: el precio cargado YA incluye IVA (o no tiene)
                totalItem = precio;
                if (alicuotaIVA > 0) {
                    precioNeto = +(precio / (1 + alicuotaIVA / 100)).toFixed(2);
                    ivaItemMonto = +(precio - precioNeto).toFixed(2);
                } else {
                    precioNeto = precio;
                    ivaItemMonto = 0;
                }
                itemComputaIVA = false;
            }

            const totalLinea = +(totalItem * cantidad).toFixed(2);
            const netoLinea = +(precioNeto * cantidad).toFixed(2);
            const ivaLinea = +(ivaItemMonto * cantidad).toFixed(2);

            // Costo para Ganancias:
            // - Ítem con IVA computable: solo el neto es costo
            // - Ítem sin IVA o B/C/SIN: el total es costo
            const costoParaGanancias = itemComputaIVA ? netoLinea : totalLinea;

            // 🔥 Acumular según el tipo
            if (itemSinIVA) {
                acumNoGravado += totalLinea;
            } else if (itemComputaIVA) {
                acumNetoGravado += netoLinea;
                acumIVACompras += ivaLinea;
            } else {
                acumNetoGravado += netoLinea;
                acumIVANoComputable += ivaLinea;
            }
            acumCostoGanancias += costoParaGanancias;

            data.items.push({
                descripcion: row.querySelector('.item-desc').value || 'Sin descripción',
                cantidad: cantidad,
                precioUnitarioNeto: precioNeto,
                precioUnitario: totalItem,
                ivaMonto: ivaLinea,
                alicuotaIVA: itemSinIVA ? 0 : alicuotaIVA,
                ivaComputable: itemComputaIVA,
                esSinIVA: itemSinIVA,
                total: totalLinea,
                costoParaGanancias: costoParaGanancias,
                stockDisponible: cantidad,
                ivaDescontable: ivaDescontable,
                tipoFactura: tipoFactura
            });
        });
        if (!itemValido || data.items.length === 0) return;

        // 🔥 v7.16.4: leer otros conceptos del DOM
        const conceptos = leerConceptos();
        data.otrosConceptos = conceptos.map(c => ({
            descripcion: c.descripcion,
            monto: c.monto,
            computaIVA: c.computaIVA,
            alicuotaIVA: c.computaIVA ? alicuotaIVA : 0,
            ivaMonto: c.computaIVA ? +(c.monto * (alicuotaIVA / 100)).toFixed(2) : 0,
            // Costo para Ganancias:
            // - Computa IVA + Factura A → el neto es costo
            // - No computa IVA o no es Factura A → el monto total es costo
            costoParaGanancias: (c.computaIVA && ivaComputable)
                ? c.monto
                : c.monto + (c.computaIVA ? +(c.monto * (alicuotaIVA / 100)).toFixed(2) : 0)
        }));

        // Acumular conceptos a los totales
        let acumConceptosConIVA = 0;
        let acumConceptosSinIVA = 0;
        let acumIVAConceptos = 0;
        let acumCostoConceptos = 0;

        data.otrosConceptos.forEach(c => {
            if (c.computaIVA) {
                acumConceptosConIVA += c.monto;
                acumIVAConceptos += c.ivaMonto;
            } else {
                acumConceptosSinIVA += c.monto;
            }
            acumCostoConceptos += c.costoParaGanancias;
        });

        // 🔥 v7.16.75: guardar los totales desglosados (incluye ítems sin IVA)
        data.totales = {
            netoGravado: +(acumNetoGravado + acumConceptosConIVA).toFixed(2),
            ivaCompras: +(acumIVACompras + (ivaComputable ? acumIVAConceptos : 0)).toFixed(2),
            ivaNoComputable: +(acumIVANoComputable + (ivaComputable ? 0 : acumIVAConceptos)).toFixed(2),
            noGravado: +(acumNoGravado + acumConceptosSinIVA).toFixed(2),
            totalFactura: +data.totalFactura.toFixed(2),
            costoTotalGanancias: +(acumCostoGanancias + acumCostoConceptos).toFixed(2)
        };
        data.ivaComputable = ivaComputable;

        // Validar / crear proveedor
        let proveedorId = null;
        const cuitNormalizado = data.proveedorCuit ? data.proveedorCuit.replace(/[-\s]/g, '') : '';
        let proveedorExistente = null;
        if (cuitNormalizado) {
            proveedorExistente = db.proveedores.find(p => (p.cuit || '').replace(/[-\s]/g, '') === cuitNormalizado);
        }
        if (!proveedorExistente) {
            proveedorExistente = db.proveedores.find(p => p.nombre.toLowerCase() === data.proveedorNombre.toLowerCase());
        }

        if (proveedorExistente) {
            proveedorId = proveedorExistente.id;

            // 🔥 v7.16.28: actualizar campos vacíos del proveedor
            const actualizaciones = [];
            if (data.proveedorCuit && !proveedorExistente.cuit) {
                proveedorExistente.cuit = data.proveedorCuit;
                actualizaciones.push('CUIT');
            }
            if (data.proveedorTelefono && !proveedorExistente.telefono) {
                proveedorExistente.telefono = data.proveedorTelefono;
                actualizaciones.push('Teléfono');
            }
            if (data.proveedorEmail && !proveedorExistente.email) {
                proveedorExistente.email = data.proveedorEmail;
                actualizaciones.push('Email');
            }
            if (data.proveedorDireccion && !proveedorExistente.direccion) {
                proveedorExistente.direccion = data.proveedorDireccion;
                actualizaciones.push('Dirección');
            }
            if (data.proveedorProvincia && !proveedorExistente.provincia) {
                proveedorExistente.provincia = data.proveedorProvincia;
                actualizaciones.push('Provincia');
            }
            if (data.proveedorContacto && !proveedorExistente.contacto) {
                proveedorExistente.contacto = data.proveedorContacto;
                actualizaciones.push('Contacto');
            }
            // 🔥 v7.16.33: si el proveedor no tiene rubro y la compra sí, guardarlo
            if (data.proveedorRubro && !proveedorExistente.rubro) {
                proveedorExistente.rubro = data.proveedorRubro;
                actualizaciones.push('Rubro');
            }

            if (actualizaciones.length > 0) {
                guardarDB();
                mostrarNotificacion(`✅ Proveedor "${proveedorExistente.nombre}" encontrado. Datos agregados: ${actualizaciones.join(', ')}`, 'success');
            } else {
                mostrarNotificacion(`✅ Proveedor "${proveedorExistente.nombre}" encontrado.`, 'success');
            }
        } else {
            mostrarModalConfirmacion(
                `⚠️ El proveedor "<strong>${escapeHtml(data.proveedorNombre)}</strong>" no existe.<br><br>CUIT: ${escapeHtml(data.proveedorCuit || 'No especificado')}<br><br>¿Crearlo automáticamente?`,
                () => {
                    const nuevoProveedor = {
                        id: generarId(),
                        nombre: data.proveedorNombre,
                        cuit: data.proveedorCuit || '',
                        // 🔥 v7.16.28: datos de contacto que el usuario haya cargado
                        rubro: data.proveedorRubro || '',
                        telefono: data.proveedorTelefono || '',
                        email: data.proveedorEmail || '',
                        direccion: data.proveedorDireccion || '',
                        provincia: data.proveedorProvincia || '',
                        contacto: data.proveedorContacto || '',
                        diasPago: 15,
                        metodosPago: [],
                        observaciones: 'Creado automáticamente desde compra',
                        saldo: 0
                    };
                    db.proveedores.push(nuevoProveedor);
                    data.proveedorId = nuevoProveedor.id;
                    guardarDB();
                    mostrarNotificacion(`✅ Proveedor "${nuevoProveedor.nombre}" creado.`, 'success');
                    continuarGuardado(data);
                },
                () => {
                    mostrarNotificacion('ℹ️ Compra guardada sin proveedor vinculado.', 'info');
                    data.proveedorId = null;
                    continuarGuardado(data);
                }
            );
            return;
        }

        continuarGuardado(data);

    } catch (e) {
        mostrarNotificacion('❌ Error al guardar: ' + e.message, 'error');
        console.error(e);
    }
};

// ==================== FUNCIÓN AUXILIAR PARA CONTINUAR GUARDADO ====================
async function continuarGuardado(data) {
    console.log('🔍 [continuarGuardado] Inicio');
    const archivoSeleccionado = window._archivoSeleccionado || null;
    const comprobanteSeleccionado = window._comprobantePagoSeleccionado || null;
    const empresaId = getEmpresaActual() || 'empresa_principal';

    // 🔥 v7.16.83: subir a Firebase Storage (NO más base64 en Firestore)

    if (archivoSeleccionado) {
        console.log('📎 [continuarGuardado] Subiendo factura a Storage:', archivoSeleccionado.name);
        data.facturaProveedorNombre = archivoSeleccionado.name;
        data.archivoNombre = archivoSeleccionado.name;
        try {
            // Comprimir si es imagen
            const fileComprimido = await comprimirImagen(archivoSeleccionado);
            // Determinar extensión
            const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
            // Subir a Storage
            const ruta = `${empresaId}/compras/${data.id}_factura.${ext}`;
            const url = await subirArchivo(ruta, fileComprimido);
            data.facturaProveedorUrl = url;
            data.archivoUrl = url;
            console.log('✅ [continuarGuardado] Factura subida:', url.substring(0, 80) + '...');
        } catch (e) {
            console.error('❌ [continuarGuardado] Error subiendo factura:', e);
            data.facturaProveedorUrl = null;
        }
    }

    if (comprobanteSeleccionado) {
        console.log('📎 [continuarGuardado] Subiendo comprobante a Storage:', comprobanteSeleccionado.name);
        data.comprobantePagoNombre = comprobanteSeleccionado.name;
        try {
            const fileComprimido = await comprimirImagen(comprobanteSeleccionado);
            const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
            const ruta = `${empresaId}/compras/${data.id}_comprobante.${ext}`;
            const url = await subirArchivo(ruta, fileComprimido);
            data.comprobantePagoUrl = url;
            console.log('✅ [continuarGuardado] Comprobante subido:', url.substring(0, 80) + '...');
        } catch (e) {
            console.error('❌ [continuarGuardado] Error subiendo comprobante:', e);
            data.comprobantePagoUrl = null;
        }
    }

    console.log('✅ [continuarGuardado] Pasando a guardarCompleto');
    guardarCompleto(data);
}

// Helper: leer archivo como dataURL (para fallback sin Firebase)
function leerArchivoComoDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

// ==================== FUNCIÓN AUXILIAR FINAL ====================
async function guardarCompleto(data) {
    console.log('🚀 [guardarCompleto] Inicio. data.id:', data.id);
    const db = getDB();
    const editandoId = window._compraEditandoId;

    // 🔥 v7.16.85: si estamos editando, actualizar en vez de crear
    if (editandoId) {
        const idx = db.compras.findIndex(c => String(c.id) === String(editandoId));
        if (idx >= 0) {
            data.id = editandoId;
            db.compras[idx] = data;
            console.log('✅ [guardarCompleto] Compra ACTUALIZADA:', editandoId);
        } else {
            console.warn('⚠️  [guardarCompleto] No se encontró la compra a editar, creando nueva');
            if (!db.compras) db.compras = [];
            db.compras.push(data);
        }
        window._compraEditandoId = null;
    } else {
        // Crear nueva
        if (!db.compras) db.compras = [];
        const yaExiste = db.compras.some(c => String(c.id) === String(data.id));
        if (!yaExiste) {
            db.compras.push(data);
            console.log('✅ [guardarCompleto] Compra pusheada en db.compras. Total:', db.compras.length);
        } else {
            console.log('⚠️  [guardarCompleto] Compra ya existía en db.compras');
        }
    }

    // 🔥 v7.16.87: si la compra es PAGADA, crear/actualizar movimiento
    if (data.estadoPago === 'PAGADO') {
        console.log('💰 [guardarCompleto] Compra PAGADA → crear/actualizar movimiento');

        // 🔥 Si estamos editando, eliminar movimientos viejos de esta compra
        if (editandoId && db.movimientos) {
            const antes = db.movimientos.length;
            db.movimientos = db.movimientos.filter(m => String(m.origenId) !== String(editandoId));
            const eliminados = antes - db.movimientos.length;
            if (eliminados > 0) {
                console.log(`🗑️ [guardarCompleto] Eliminados ${eliminados} movimientos viejos de la compra ${editandoId}`);
            }
        }

        const medioKey = mapearMedioAKey(data.metodoPago || 'Efectivo');
        console.log('💳 [guardarCompleto] Método de pago:', data.metodoPago, '→ medioKey:', medioKey);
        if (!db.movimientos) db.movimientos = [];
        const mov = crearMovimiento({
            fecha: data.fechaPago || data.fechaEmision,
            tipo: 'egreso',
            origen: 'compra_pago',
            origenId: data.id,
            origenDescripcion: `Pago compra ${data.proveedorNombre}`,
            monto: data.totalFactura,
            medio: medioKey,
            observaciones: data.numeroFactura ? `Factura ${data.numeroFactura}` : ''
        });
        data.movimientoPagoId = mov.id;
        console.log('✅ [guardarCompleto] Movimiento creado:', mov.id, '| Impuesto cheque:', mov.impuestoDebitoCredito?.monto || 0);
    } else if (editandoId && db.movimientos) {
        // 🔥 Si la compra pasó de PAGADO a PENDIENTE, eliminar el movimiento
        const antes = db.movimientos.length;
        db.movimientos = db.movimientos.filter(m => String(m.origenId) !== String(editandoId));
        const eliminados = antes - db.movimientos.length;
        if (eliminados > 0) {
            console.log(`🗑️ [guardarCompleto] Compra pasó a PENDIENTE → eliminados ${eliminados} movimientos`);
        }
    }

    // 🔥 GUARDAR EN DB (local + Firestore)
    try {
        await guardarDB();
        console.log('✅ [guardarCompleto] guardarDB() OK');
    } catch(e) {
        console.error('❌ [guardarCompleto] Error en guardarDB():', e);
    }

    // 🔥 v7.16.85: guardarDB() ya persiste todo el db en empresas/empresa_principal.
    // NO hacer guardarDoc('movimientos', ...) — era redundante y rompía con undefined.

    console.log('✅ [guardarCompleto] COMPLETO. Cerrando modal.');

    // Cerrar modal
    const modal = document.getElementById('modalNuevaCompra');
    if (modal) modal.remove();

    // Notificar
    mostrarNotificacion('✅ Compra registrada correctamente', 'success');

    // Refrescar
    window.dispatchEvent(new Event('refreshView'));
}

// ==================== 🔥 v7.16.85: EDITAR COMPRA ====================
window.editarCompra = (id) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(id));
    if (!compra) { mostrarNotificacion('Compra no encontrada', 'error'); return; }

    // Abrir modal
    window.mostrarModalNuevaCompra();

    // Precargar datos con pequeño delay para que el DOM esté listo
    setTimeout(() => {
      try {
        // 1. Título
        const titulo = document.querySelector('#modalNuevaCompra h2');
        if (titulo) titulo.textContent = '✏️ Editar Compra';

        // 2. Tipo
        const tipoMov = document.getElementById('tipoMovimiento');
        if (tipoMov && compra.tipo) tipoMov.value = compra.tipo;

        // 3. Fecha emisión
        const fechaHidden = document.getElementById('fechaEmisionHidden');
        const fechaText = document.getElementById('fechaEmisionText');
        if (fechaHidden && compra.fechaEmision) {
            fechaHidden.value = compra.fechaEmision;
            if (fechaText) {
                const [a, m, d] = compra.fechaEmision.split('-');
                fechaText.value = `${d}/${m}/${a}`;
            }
        }

        // 4. Número factura
        const numFact = document.getElementById('numeroFactura');
        if (numFact) numFact.value = compra.numeroFactura || '';

        // 5. Tipo factura
        const tipoFact = document.getElementById('tipoFactura');
        if (tipoFact && compra.tipoFactura) {
            tipoFact.value = compra.tipoFactura;
            if (window.actualizarTipoFactura) window.actualizarTipoFactura();
        }

        // 6. Proveedor
        const provNombre = document.getElementById('proveedorNombre');
        const provCuit = document.getElementById('proveedorCuit');
        if (provNombre) provNombre.value = compra.proveedorNombre || '';
        if (provCuit) provCuit.value = compra.proveedorCuit || '';

        // 7. Datos de contacto del proveedor
        const campos = {
            proveedorRubro: compra.proveedorRubro,
            proveedorTelefono: compra.proveedorTelefono,
            proveedorEmail: compra.proveedorEmail,
            proveedorDireccion: compra.proveedorDireccion,
            proveedorProvincia: compra.proveedorProvincia,
            proveedorContacto: compra.proveedorContacto
        };
        Object.entries(campos).forEach(([k, v]) => {
            const el = document.getElementById(k);
            if (el && v) el.value = v;
        });

        // 8. Ítems
        const container = document.getElementById('itemsContainer');
        if (container) {
            container.innerHTML = '';
            (compra.items || []).forEach(item => {
                window.agregarItem();
                const lastRow = container.lastElementChild;
                if (!lastRow) return;
                const desc = lastRow.querySelector('.item-desc');
                const cant = lastRow.querySelector('.item-cantidad');
                const precio = lastRow.querySelector('.item-precio');
                const sinIVA = lastRow.querySelector('.item-sin-iva');
                if (desc) desc.value = item.descripcion || '';
                if (cant) cant.value = item.cantidad || 1;
                if (precio) precio.value = item.precioUnitarioNeto || item.precioUnitario || 0;
                if (sinIVA && item.esSinIVA) sinIVA.checked = true;
            });
        }

        // 9. Totales
        const netoEl = document.getElementById('montoNeto');
        const ivaEl = document.getElementById('ivaMonto');
        const totalEl = document.getElementById('totalFactura');
        const ivaPorcEl = document.getElementById('ivaPorcentaje');
        if (netoEl && compra.totales?.netoGravado != null) netoEl.value = compra.totales.netoGravado;
        if (ivaEl && compra.totales?.ivaCompras != null) ivaEl.value = compra.totales.ivaCompras;
        if (totalEl && compra.totalFactura != null) totalEl.value = compra.totalFactura;
        if (ivaPorcEl && compra.ivaPorcentaje) ivaPorcEl.value = compra.ivaPorcentaje;

        // 10. Plazo y vencimiento
        const plazoEl = document.getElementById('plazoPago');
        if (plazoEl && compra.plazoPago != null) plazoEl.value = compra.plazoPago;
        const vencHidden = document.getElementById('fechaVencimientoHidden');
        const vencText = document.getElementById('fechaVencimientoText');
        if (vencHidden && compra.fechaVencimientoPago) {
            vencHidden.value = compra.fechaVencimientoPago;
            if (vencText) {
                const [a, m, d] = compra.fechaVencimientoPago.split('-');
                vencText.value = `${d}/${m}/${a}`;
            }
        }

        // 11. Estado de pago
        const estadoEl = document.getElementById('estadoPago');
        if (estadoEl && compra.estadoPago) estadoEl.value = compra.estadoPago;

        // 11b. Método de pago
        const metodoEl = document.getElementById('metodoPago');
        if (metodoEl && compra.metodoPago) metodoEl.value = compra.metodoPago;

        // 11c. Vínculos con ventas (template literals para evitar errores de comillas)
        const formEl = document.getElementById('formCompraGasto');
        if (formEl) {
            let bloqueVinc = document.getElementById('bloqueVinculosVentas');
            if (!bloqueVinc) {
                bloqueVinc = document.createElement('div');
                bloqueVinc.id = 'bloqueVinculosVentas';
                bloqueVinc.className = 'border-t pt-3 mt-3 space-y-3';
                const botones = formEl.querySelector('.flex.gap-3.mt-5');
                if (botones) formEl.insertBefore(bloqueVinc, botones);
                else formEl.appendChild(bloqueVinc);
            }
            const ventasVinc = compra.ventasVinculadasIds || [];
            const ventas = ventasVinc.map(vid => db.ventas.find(v => String(v.id) === String(vid))).filter(Boolean);
            const botones = formEl.querySelector('.flex.gap-3.mt-5');
            if (botones) formEl.insertBefore(bloqueVinc, botones);
            bloqueVinc.innerHTML =
                '<h3 class="text-sm font-bold">🔗 Ventas vinculadas</h3>' +
                '<div id="editC-ventasVinculadas" class="space-y-1">' +
                (ventas.length > 0
                    ? ventas.map(v =>
                        `<div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg mb-1">
                            <div class="flex-1">
                                <div class="text-sm font-semibold">${escapeHtml(v.clienteNombre || 'Cliente')}</div>
                                <div class="text-xs text-gray-500">${v.fechaVenta ? formatDate(v.fechaVenta) : '-'} • $${formatNumber(v.total || 0)}</div>
                            </div>
                            <button type="button" onclick="window.desvincularVentaDeCompra('${compra.id}', '${v.id}')" class="text-red-600 hover:text-red-800 text-sm px-2">✕</button>
                        </div>`
                    ).join('')
                    : '<p class="text-xs text-gray-500">No hay ventas vinculadas.</p>'
                ) +
                '</div>' +
                `<button type="button" onclick="window.vincularVentasACompra('${compra.id}')" class="mt-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs">+ 🔗 Vincular venta</button>`;
        }
        if (compra.estadoPago === 'PAGADO') {
            const campoFechaPago = document.getElementById('campoFechaPago');
            if (campoFechaPago) campoFechaPago.classList.remove('hidden');
            const fechaPagoHidden = document.getElementById('fechaPagoHidden');
            const fechaPagoText = document.getElementById('fechaPagoText');
            if (fechaPagoHidden && compra.fechaPago) {
                fechaPagoHidden.value = compra.fechaPago;
                if (fechaPagoText) {
                    const [a, m, d] = compra.fechaPago.split('-');
                    fechaPagoText.value = `${d}/${m}/${a}`;
                }
            }
        }

        // 12. Mostrar archivos adjuntos existentes (si hay)
        if (compra.facturaProveedorUrl) {
            window._facturaProveedorGuardada = compra.facturaProveedorUrl;
            const previewActions = document.getElementById('facturaPreviewActions');
            const nombreSpan = document.getElementById('facturaNombreArchivo');
            if (previewActions && nombreSpan) {
                nombreSpan.textContent = compra.facturaProveedorNombre || 'factura';
                previewActions.classList.remove('hidden');
            }
        }
        if (compra.comprobantePagoUrl) {
            window._comprobantePagoGuardado = compra.comprobantePagoUrl;
            const previewActions = document.getElementById('comprobantePagoPreviewActions');
            const nombreSpan = document.getElementById('comprobanteNombreArchivo');
            if (previewActions && nombreSpan) {
                nombreSpan.textContent = compra.comprobantePagoNombre || 'comprobante';
                previewActions.classList.remove('hidden');
            }
        }

        // 13. Marcar ID para que al guardar actualice
        window._compraEditandoId = id;

        // 14. Recalcular totales
        if (window.recalcularTotales) window.recalcularTotales();

        mostrarNotificacion('✏️ Compra cargada para editar', 'info');
        console.log('✅ [editarCompra] Precarga completa OK. ID:', id);
      } catch (e) {
        console.error('❌ [editarCompra] Error precargando:', e);
        mostrarNotificacion('Error precargando compra: ' + e.message, 'error');
      }
    }, 150);
};

// ==================== 🔥 v7.16.85: ELIMINAR COMPRA ====================
window.eliminarCompra = async (id) => {
    const confirmado = await confirmarAccion({
        titulo: '🗑️ Eliminar compra',
        mensaje: '¿Estás seguro de eliminar esta compra?<br><br>Se eliminará de la base de datos y <strong>no se puede deshacer</strong>.',
        textoConfirmar: '🗑️ Sí, eliminar',
        icono: '📦'
    });
    if (!confirmado) return;

    const db = getDB();
    const idx = db.compras.findIndex(c => String(c.id) === String(id));
    if (idx < 0) { mostrarNotificacion('Compra no encontrada', 'error'); return; }

    // Eliminar movimientos asociados
    if (db.movimientos) {
        db.movimientos = db.movimientos.filter(m => String(m.origenId) !== String(id));
    }

    // Eliminar la compra
    db.compras.splice(idx, 1);
    guardarDB();
    mostrarNotificacion('🗑️ Compra eliminada', 'success');
    window.dispatchEvent(new Event('refreshView'));
};

console.log('✅ Módulo Compras/Gastos cargado');

// ==================== HELPER: MAPEAR MEDIO A KEY ====================

// ==================== 🔥 v7.16.8: QUITAR ARCHIVOS ====================
window.quitarFacturaProveedor = () => {
    window._archivoSeleccionado = null;
    window._facturaProveedorSeleccionada = null;

    const previewActions = document.getElementById('facturaPreviewActions');
    if (previewActions) previewActions.classList.add('hidden');

    const archivoInfo = document.getElementById('archivoInfo');
    if (archivoInfo) {
        archivoInfo.classList.add('hidden');
        archivoInfo.innerHTML = '';
    }

    const ocrStatus = document.getElementById('ocrStatus');
    if (ocrStatus) ocrStatus.textContent = '';

    // Resetear inputs de archivo
    const ocrInput = document.getElementById('ocrInput');
    const ocrInputFile = document.getElementById('ocrInputFile');
    if (ocrInput) ocrInput.value = '';
    if (ocrInputFile) ocrInputFile.value = '';

    mostrarNotificacion('🗑️ Factura quitada', 'info');
};

window.quitarComprobantePago = () => {
    window._comprobantePagoSeleccionado = null;

    const previewActions = document.getElementById('comprobantePagoPreviewActions');
    if (previewActions) previewActions.classList.add('hidden');

    const comprobanteInfo = document.getElementById('comprobantePagoInfo');
    if (comprobanteInfo) {
        comprobanteInfo.classList.add('hidden');
        comprobanteInfo.innerHTML = '';
    }

    const comprobanteInput = document.getElementById('comprobantePagoInput');
    if (comprobanteInput) comprobanteInput.value = '';

    mostrarNotificacion('🗑️ Comprobante quitado', 'info');
};

// ==================== 🔥 v7.16.8: VISTA PREVIA ====================
function abrirVistaPrevia(file, titulo) {
    if (!file) { mostrarNotificacion('No hay archivo para ver', 'warning'); return; }

    const url = URL.createObjectURL(file);
    const esImagen = file.type.startsWith('image/');
    const esPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '200';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3 text-center">${titulo}</h2>
            <div class="bg-gray-100 dark:bg-gray-900 rounded-lg p-2 text-center" style="min-height:60vh;">
                ${esImagen
                    ? `<img src="${url}" alt="Vista previa" style="max-width:100%;max-height:70vh;object-fit:contain;">`
                    : esPDF
                        ? `<iframe src="${url}" style="width:100%;height:70vh;border:none;"></iframe>`
                        : `<p class="p-8 text-gray-500">Tipo de archivo no soportado para vista previa</p>`
                }
            </div>
            <p class="text-xs text-gray-500 text-center mt-2">${file.name} (${(file.size/1024).toFixed(1)} KB)</p>
            <button onclick="this.closest('.modal').remove();" class="mt-3 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

window.verVistaPreviaFactura = () => {
    const file = window._facturaProveedorSeleccionada;
    abrirVistaPrevia(file, '👁️ Vista previa - Factura del proveedor');
};

window.verVistaPreviaComprobante = () => {
    const file = window._comprobantePagoSeleccionado;
    abrirVistaPrevia(file, '👁️ Vista previa - Comprobante de pago');
};

// ==================== 🔥 v7.16.8: ACTUALIZAR NOMBRE DE COMPROBANTE ====================
// Reemplaza el handler de comprobantePagoInfo para que también muestre acciones
const _seleccionarComprobantePagoOriginal = window.seleccionarComprobantePago;
window.seleccionarComprobantePago = (file) => {
    if (!file) return;
    window._comprobantePagoSeleccionado = file;

    const info = document.getElementById('comprobantePagoInfo');
    if (info) {
        info.classList.remove('hidden');
        info.innerHTML = `📎 Comprobante: <strong>${escapeHtml(file.name)}</strong>`;
    }

    const previewActions = document.getElementById('comprobantePagoPreviewActions');
    const nombreSpan = document.getElementById('comprobanteNombreArchivo');
    if (previewActions && nombreSpan) {
        nombreSpan.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
        previewActions.classList.remove('hidden');
    }
};

function mapearMedioAKey(medioEspanol) {
    const mapa = {
        'Efectivo': 'efectivo',
        'Transferencia': 'transferencia',
        'Tarjeta Débito': 'tarjeta_debito',
        'Tarjeta Crédito': 'tarjeta_credito',
        'Cheque': 'cheque',
        'Otro': 'otro'
    };
    return mapa[medioEspanol] || 'otro';
}

// ==================== 🔥 v7.16.82: VER ARCHIVO GUARDADO (dataURL) ====================
window.verArchivoGuardado = (dataURL, nombre, titulo = '📎 Vista previa') => {
    if (!dataURL) { mostrarNotificacion('No hay archivo para ver', 'warning'); return; }

    // Convertir dataURL a Blob (evita bloqueo de Chrome en data: URLs)
    let blob;
    try {
        const partes = dataURL.split(',');
        const mime = partes[0].match(/:(.*?);/)[1];
        const binario = atob(partes[1]);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
        blob = new Blob([bytes], { type: mime });
    } catch (e) {
        mostrarNotificacion('Error procesando archivo', 'error');
        console.error(e);
        return;
    }

    const url = URL.createObjectURL(blob);
    const esImagen = blob.type.startsWith('image/');
    const esPDF = blob.type === 'application/pdf';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3 text-center">${titulo}</h2>
            <div class="bg-gray-100 dark:bg-gray-900 rounded-lg p-2 text-center" style="min-height:60vh;">
                ${esImagen
                    ? `<img src="${url}" alt="Vista previa" style="max-width:100%;max-height:70vh;object-fit:contain;">`
                    : esPDF
                        ? `<iframe src="${url}" style="width:100%;height:70vh;border:none;"></iframe>`
                        : `<p class="p-8 text-gray-500">Tipo de archivo no soportado</p>`
                }
            </div>
            <p class="text-xs text-gray-500 text-center mt-2">${escapeHtml(nombre || 'archivo')}</p>
            <button onclick="this.closest('.modal').remove(); URL.revokeObjectURL('${url}');" class="mt-3 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
};

// ==================== 🔥 v7.16.89: VINCULAR VENTAS A COMPRA ====================
window.vincularVentasACompra = (compraId) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(compraId));
    if (!compra) { mostrarNotificacion('Compra no encontrada', 'error'); return; }

    if (!compra.ventasVinculadasIds) compra.ventasVinculadasIds = [];
    const yaVinculados = new Set(compra.ventasVinculadasIds.map(id => String(id)));
    const ventasDisponibles = db.ventas.filter(v => !yaVinculados.has(String(v.id)));

    if (ventasDisponibles.length === 0) {
        mostrarNotificacion('No hay ventas disponibles para vincular (o ya están todas vinculadas)', 'info');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalVincularVentas';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3 text-center">🔗 Vincular Ventas a esta Compra</h2>
            <p class="text-sm text-gray-500 mb-3 text-center">Compra: <strong>${escapeHtml(compra.proveedorNombre || '')}</strong> - $${formatNumber(compra.totalFactura || 0)}</p>
            <div class="space-y-2 mb-4">
                ${ventasDisponibles.map(v => `
                    <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                        <input type="checkbox" class="vinc-venta-checkbox w-5 h-5" value="${v.id}">
                        <div class="flex-1">
                            <div class="font-semibold">${escapeHtml(v.clienteNombre || 'Sin cliente')}</div>
                            <div class="text-xs text-gray-500">
                                ${v.fechaVenta ? formatDate(v.fechaVenta) : '-'} • 
                                ${v.numComprobante ? 'Factura ' + v.numComprobante : ''} • 
                                $${formatNumber(v.total || 0)}
                            </div>
                        </div>
                    </label>
                `).join('')}
            </div>
            <div class="flex gap-3">
                <button onclick="window.confirmarVinculacionVentas('${compraId}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl font-bold">✅ Vincular seleccionadas</button>
                <button onclick="document.getElementById('modalVincularVentas').remove()" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.confirmarVinculacionVentas = (compraId) => {
    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(compraId));
    if (!compra) { mostrarNotificacion('Compra no encontrada', 'error'); return; }

    const checkboxes = document.querySelectorAll('.vinc-venta-checkbox:checked');
    if (checkboxes.length === 0) { mostrarNotificacion('No seleccionaste ninguna venta', 'warning'); return; }

    if (!compra.ventasVinculadasIds) compra.ventasVinculadasIds = [];
    let vinculadas = 0;
    checkboxes.forEach(cb => {
        const ventaId = cb.value;
        const venta = db.ventas.find(v => String(v.id) === String(ventaId));
        if (!venta) return;
        if (compra.ventasVinculadasIds.includes(String(ventaId))) return;

        compra.ventasVinculadasIds.push(String(ventaId));

        if (!venta.comprasVinculadas) venta.comprasVinculadas = [];
        if (!venta.comprasVinculadas.some(cv => String(cv.compraId) === String(compraId))) {
            venta.comprasVinculadas.push({
                compraId: compraId,
                proveedorNombre: compra.proveedorNombre,
                fechaEmision: compra.fechaEmision,
                total: compra.totalFactura,
                tipoFactura: compra.tipoFactura
            });
        }
        vinculadas++;
    });

    guardarDB();
    document.getElementById('modalVincularVentas').remove();
    mostrarNotificacion(`✅ ${vinculadas} venta(s) vinculada(s)`, 'success');
    window.dispatchEvent(new Event('refreshView'));
    setTimeout(() => window.verDetalleCompra(compraId), 200);
};

window.desvincularVentaDeCompra = async (compraId, ventaId) => {
    const confirmado = await confirmarAccion({
        titulo: '🔗 Desvincular venta',
        mensaje: '¿Desvincular esta venta de la compra?<br><br>No se elimina la venta, solo el vínculo.',
        textoConfirmar: '🔗 Sí, desvincular',
        icono: '🔗'
    });
    if (!confirmado) return;

    const db = getDB();
    const compra = db.compras.find(c => String(c.id) === String(compraId));
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));

    if (compra && compra.ventasVinculadasIds) {
        compra.ventasVinculadasIds = compra.ventasVinculadasIds.filter(id => String(id) !== String(ventaId));
    }
    if (venta && venta.comprasVinculadas) {
        venta.comprasVinculadas = venta.comprasVinculadas.filter(cv => String(cv.compraId) !== String(compraId));
    }

    guardarDB();
    mostrarNotificacion('🔗 Venta desvinculada', 'info');
    window.dispatchEvent(new Event('refreshView'));
    setTimeout(() => window.verDetalleCompra(compraId), 200);
};
