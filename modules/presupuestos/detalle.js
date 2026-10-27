// ==================== modules/presupuestos/detalle.js ====================
// DETALLE - Ver detalle, descargar PDF, eliminar, revertir y crear venta directa
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB, crearMovimiento } from '../db.js';
import { formatNumber, escapeHtml, formatDate, mostrarNotificacion, generarId, inputFechaHTML, initInputFecha, getValorFecha, parseFechaLocal, dateToISO, hoyISO } from '../utils.js';
import { ALICUOTA_IVA } from './estado.js';
import { generarHTMLPresupuestoCompleto } from './plantilla-completa.js';
import { eliminarPresupuestoEnCascada } from './helpers.js';

// ==================== DESCARGAR PDF ====================
window.descargarPDFPresupuesto = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    const html = generarHTMLPresupuestoCompleto(p);
    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(html);
    ventana.document.close();
};

// ==================== VER DETALLE ====================
window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) return;
    const hijos = db.presupuestos.filter(h => h.presupuestoPadreId === id);
    const venta = p.ventaGeneradaId ? db.ventas.find(v => v.id === p.ventaGeneradaId) : null;

    document.getElementById('root').innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg max-w-4xl mx-auto">
            <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 dark:text-gray-300 mb-4">← Volver</button>
            <h2 class="text-xl font-bold mb-2">Presupuesto ${p.numero}</h2>
            <div class="grid grid-cols-2 gap-2 text-sm mb-4">
                <p><strong>Cliente:</strong> ${escapeHtml(p.cliente)}</p>
                <p><strong>Total con IVA:</strong> $${formatNumber(p.total)}</p>
                ${p.patente || p.vehiculoMarca ? `<p class="col-span-2"><strong>Vehículo:</strong> ${escapeHtml(p.vehiculoMarca || '')} ${p.patente ? `(Patente: ${escapeHtml(p.patente)})` : ''}</p>` : ''}
                <p><strong>Ganancia Neta Real:</strong> $${formatNumber(p.gananciaNetaReal || 0)}</p>
                <p><strong>Fecha:</strong> ${p.fechaCreacion ? formatDate(p.fechaCreacion) : ''}</p>
                <p><strong>Estado:</strong> ${p.estado === 'aprobado' ? '✅ Aprobado' : p.estado === 'rechazado' ? '❌ Rechazado' : p.esMora ? '💰 Mora' : '⏳ Pendiente'}</p>
                ${p.modo ? `<p><strong>Modo:</strong> ${p.modo === 'propio' ? '🏠 Propio' : p.modo === 'mixto' ? '🔀 Mixto' : '🔗 Tercerizado'}</p>` : ''}
                ${p.presupuestoPadreId ? `<p><strong>Presupuesto Padre:</strong> <a href="#" onclick="window.verPresupuestoDetalle(${p.presupuestoPadreId}); return false;" class="text-blue-600 underline">P-${p.presupuestoPadreId}</a></p>` : ''}
                ${venta ? `<p><strong>Venta generada:</strong> ${escapeHtml(venta.numFacturaEmitida || venta.numComprobante || 'ID ' + venta.id)} (${venta.estado})</p>` : ''}
                ${p.deudasIncluidas ? `<p><strong>Deudas de mora incluidas:</strong> ${p.deudasIncluidas.length}</p>` : ''}
            </div>
            ${hijos.length > 0 ? `
                <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h3 class="font-bold text-blue-700">📎 Presupuestos adicionales vinculados</h3>
                    ${hijos.map(h => `<div class="flex justify-between items-center border-b py-1"><span><a href="#" onclick="window.verPresupuestoDetalle(${h.id}); return false;" class="text-blue-600 underline">${h.numero}</a></span><span class="text-sm">${escapeHtml(h.cliente)} - $${formatNumber(h.total)}</span></div>`).join('')}
                </div>
            ` : ''}
            <div class="flex gap-3 flex-wrap">
                <button onclick="window.descargarPDFPresupuesto(${p.id})" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1">📄 Ver / Descargar PDF</button>
                ${p.estado !== 'aprobado' && !p.esMora ? `<button onclick="window.editarPresupuesto(${p.id})" class="bg-yellow-600 text-white px-4 py-2 rounded-xl flex-1">✏️ Editar</button>` : ''}
                ${p.estado === 'pendiente' && !p.ventaGeneradaId ? `<button onclick="window.aprobarPresupuesto(${p.id})" class="bg-green-600 text-white px-4 py-2 rounded-xl flex-1">✅ Aprobar y crear Venta</button>` : ''}
                ${p.estado === 'pendiente' && !p.esMora ? `<button onclick="window.rechazarPresupuesto(${p.id})" class="bg-orange-600 text-white px-4 py-2 rounded-xl flex-1">❌ Rechazar</button>` : ''}
                ${p.estado === 'rechazado' ? `<button onclick="window.volverAPendientePresupuesto(${p.id})" class="bg-yellow-600 text-white px-4 py-2 rounded-xl flex-1">↩️ Volver a pendiente</button>` : ''}

                ${p.estado === 'cobrado' && p.items && p.items.some(i => i.compraVinculadaId) ? `<button onclick="window.mostrarModalPagarProveedor(${p.id})" class="bg-purple-600 text-white px-4 py-2 rounded-xl flex-1">💸 Pagar proveedor</button>` : ''}
                ${p.estado === 'aprobado' && p.ventaGeneradaId ? `<button onclick="window.revertirAprobacion(${p.id})" class="bg-orange-600 text-white px-4 py-2 rounded-xl flex-1">↩️ Revertir aprobación</button>` : ''}
                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-600 text-white px-4 py-2 rounded-xl flex-1">🗑️ Eliminar</button>
                ${p.items && p.items.some(i => i.compraVinculadaId) ? `<button onclick="window.generarOCProveedor(${p.id})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl flex-1">📄 Generar OC para proveedor</button>` : ''}
                <button onclick="window.verTrazabilidad('presupuesto','${p.id}')" class="bg-purple-600 text-white px-4 py-2 rounded-xl flex-1">🔗 Ver trazabilidad</button>
                ${p.estado !== 'pendiente' ? `<button onclick="window.deshacerPasoPresupuesto(${p.id})" class="bg-orange-600 text-white px-4 py-2 rounded-xl flex-1" title="Deshacer último paso">↩️ Deshacer último paso</button>` : ''}
                <button onclick="window.eliminarTodoPresupuesto(${p.id})" class="bg-red-700 text-white px-4 py-2 rounded-xl flex-1" title="Eliminar TODO (cadena completa)">🗑️ Eliminar TODO</button>
            </div>
        </div>`;
};

// ==================== REVERTIR APROBACIÓN ====================
window.revertirAprobacion = (id) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    if (presupuesto.estado !== 'aprobado') {
        mostrarNotificacion('Este presupuesto no está aprobado', 'warning');
        return;
    }

    const venta = presupuesto.ventaGeneradaId ? db.ventas.find(v => v.id === presupuesto.ventaGeneradaId) : null;

    // 🔥 Bloqueo: si la venta está cobrada, no se puede revertir
    if (venta && venta.estado === 'cobrado') {
        mostrarNotificacion(
            '⚠️ No se puede revertir: la venta ya está cobrada. Primero reversá el cobro desde Ventas.',
            'error'
        );
        return;
    }

    const mensaje = venta
        ? `⚠️ ¿Revertir la aprobación del presupuesto ${presupuesto.numero}?\n\nSe va a:\n• Eliminar la venta generada (Factura ${venta.numFacturaEmitida || venta.numComprobante || 'N/A'})\n• Devolver el presupuesto al estado pendiente\n• Liberar el stock reservado (si había)\n• Marcar deudas de mora como no saldadas (si había)\n\n¿Continuar?`
        : `⚠️ ¿Revertir la aprobación del presupuesto ${presupuesto.numero}?\n\nVa a volver al estado pendiente.`;

    if (!confirm(mensaje)) return;

    // 🔥 1. Liberar stock de los ítems de la venta
    if (venta && venta.items && typeof window.liberarStock === 'function') {
        venta.items.forEach(item => {
            if (item.compraVinculadaId && item.compraItemIndex !== null && item.cantidadAsignada) {
                try {
                    window.liberarStock(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
                } catch(e) { console.warn('Error liberando stock:', e); }
            }
        });
    }
    // También liberar stock del presupuesto
    if (presupuesto.items && typeof window.liberarStock === 'function') {
        presupuesto.items.forEach(item => {
            if (item.compraVinculadaId && item.compraItemIndex !== null && item.cantidadAsignada) {
                try {
                    window.liberarStock(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
                } catch(e) { console.warn('Error liberando stock:', e); }
            }
        });
    }

    // 🔥 2. Revertir deudas de mora incluidas
    if (presupuesto.deudasIncluidas && presupuesto.deudasIncluidas.length > 0) {
        presupuesto.deudasIncluidas.forEach(deudaId => {
            const ventaDeuda = db.ventas.find(v => v.id === deudaId);
            if (ventaDeuda) {
                ventaDeuda.moraSaldada = false;
            }
            const presMora = db.presupuestos.find(p => p.id === deudaId);
            if (presMora && presMora.esMora) {
                presMora.estado = 'pendiente';
            }
        });
    }

    // 🔥 3. Eliminar la venta generada
    if (venta) {
        db.ventas = db.ventas.filter(v => v.id !== venta.id);
    }

    // 🔥 4. Revertir el presupuesto a pendiente
    const presIndex = db.presupuestos.findIndex(p => p.id === id);
    if (presIndex !== -1) {
        db.presupuestos[presIndex].estado = 'pendiente';
        db.presupuestos[presIndex].ventaGeneradaId = null;
    }

    guardarDB();
    mostrarNotificacion(`✅ Aprobación revertida. Presupuesto ${presupuesto.numero} volvió a pendiente`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== ELIMINAR PRESUPUESTO ====================
window.eliminarPresupuesto = (id) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }

    const ok = eliminarPresupuestoEnCascada(id, window.liberarStock);
    if (!ok) return;

    guardarDB();
    mostrarNotificacion(`Presupuesto ${presupuesto.numero} eliminado`, 'info');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== CREAR VENTA DIRECTA DESDE PRESUPUESTO ====================
window.crearVentaDesdePresupuestoDirecto = (presupuestoId) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === presupuestoId);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    if (db.ventas.some(v => v.presupuestoId === presupuestoId)) {
        mostrarNotificacion('Este presupuesto ya tiene una venta asociada', 'warning');
        return;
    }

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">📄 Convertir Presupuesto en Venta</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(presupuesto.cliente)}</p>
                    <p><strong>Presupuesto:</strong> ${presupuesto.numero}</p>
                    <p><strong>Total:</strong> <span class="font-bold text-green-600">$${formatNumber(presupuesto.total)}</span></p>
                    ${presupuesto.ocClienteUrl ? `<p><strong>📎 OC del cliente:</strong> <button onclick="window.verOCCliente('${presupuesto.ocClienteUrl}', '${escapeHtml(presupuesto.ocClienteNombre || 'OC')}')" class="text-blue-600 underline">Ver archivo adjunto</button></p>` : ''}
                    ${presupuesto.ocClienteNombre ? `<p class="text-xs text-gray-500">Archivo: ${escapeHtml(presupuesto.ocClienteNombre)}</p>` : ''}
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-medium">📋 Número de Orden de Compra (OC)</label>
                    <input type="text" id="ocClienteVenta" class="w-full p-3 border rounded-xl" placeholder="Ej: OC-2026-001">
                    ${inputFechaHTML('fechaCobroVenta', (() => { const d = new Date(); d.setDate(d.getDate() + 30); return dateToISO(d); })(), { label: '📅 Fecha de cobro esperada' })}
                    <label class="block text-sm font-medium">🧾 Número de Factura</label>
                    <input type="text" id="numFacturaVenta" class="w-full p-3 border rounded-xl" placeholder="Ej: 0001-00123456" required>
                </div>

                <!-- 🔥 v7.16.3: ¿Ya cobraste? -->
                <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="cv-cobradoYa" class="w-4 h-4">
                        <span class="font-medium">💰 ¿Ya cobraste esta venta?</span>
                    </label>
                    <p class="text-xs text-gray-500 mt-1">Si tildás, se registra el cobro junto con la venta (genera movimiento en tesorería).</p>
                </div>

                <div id="cv-cobroFields" class="hidden mt-3 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${inputFechaHTML('cv-fechaCobro', hoyISO(), { label: '📅 Fecha de cobro' })}
                        <div>
                            <label class="block text-sm font-medium mb-1">💳 Medio de pago</label>
                            <select id="cv-medioPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                                <option value="Efectivo">💵 Efectivo</option>
                                <option value="Transferencia">🏦 Transferencia</option>
                                <option value="Tarjeta Débito">💳 Tarjeta Débito</option>
                                <option value="Tarjeta Crédito">💳 Tarjeta Crédito</option>
                                <option value="Cheque">📄 Cheque</option>
                                <option value="Otro">🔄 Otro</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">📄 Nº de comprobante (opcional)</label>
                        <input type="text" id="cv-numComprobante" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Nro de transferencia / cheque">
                    </div>
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarVentaBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Crear Venta</button>
                    <button id="cancelarVentaBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    document.getElementById('confirmarVentaBtn').onclick = () => {
        const oc = document.getElementById('ocClienteVenta').value.trim();
        const fechaCobro = getValorFecha('fechaCobroVenta');
        const numFactura = document.getElementById('numFacturaVenta').value.trim();
        if (!numFactura) { mostrarNotificacion('Ingrese número de factura', 'warning'); return; }

        const ventaNeta = presupuesto.ventaClienteConIVA !== undefined
            ? presupuesto.ventaCliente
            : (presupuesto.total / (1 + (presupuesto.incluirIVA ? ALICUOTA_IVA / 100 : 0)));
        const ivaMontoVenta = presupuesto.ivaVentas !== undefined
            ? presupuesto.ivaVentas
            : (presupuesto.total - ventaNeta);

        const nuevaVenta = {
            id: generarId(),
            clienteId: presupuesto.clienteId,
            clienteNombre: presupuesto.cliente,
            tipoComprobante: 'Factura A',
            numComprobante: numFactura,
            montoNeto: ventaNeta,
            iva: presupuesto.incluirIVA ? ALICUOTA_IVA : 0,
            ivaMonto: ivaMontoVenta,
            total: presupuesto.total,
            fechaVenta: hoyISO(),
            fechaCobroEsperada: fechaCobro || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return dateToISO(d); })(),
            mes: hoyISO().substring(0, 7),
            estado: 'aceptado',
            facturaUrl: null,
            facturaNombre: null,
            ordenCompraCliente: oc || null,
            presupuestoId: presupuesto.id,
            patente: presupuesto.patente || null,
            comprasVinculadas: presupuesto.items
                .filter(i => i.compraVinculadaId)
                .map(i => ({
                    compraId: i.compraVinculadaId,
                    itemIndex: i.compraItemIndex,
                    cantidad: i.cantidadAsignada || i.cant,
                    descripcion: i.desc
                })),
            compraVinculadaId: presupuesto.items.find(i => i.compraVinculadaId)?.compraVinculadaId || null,
            compraItemIndex: presupuesto.items.find(i => i.compraVinculadaId)?.compraItemIndex || null,
            cantidadAsignada: presupuesto.items.find(i => i.compraVinculadaId)?.cantidadAsignada || null,
            medioPago: null,
            comisionTarjeta: null,
            interesMora: null,
            fechaCobro: null,
            comprobanteCobro: null,
            comprobanteCobroUrl: null,
            items: presupuesto.items.map(i => ({ ...i }))
        };

        // 🔥 v7.16.3: si se marcó "cobrado ya", registrar el cobro
        const cobradoYa = document.getElementById('cv-cobradoYa')?.checked || false;
        if (cobradoYa) {
            const fechaCobroReal = getValorFecha('cv-fechaCobro') || fechaCobro || hoyISO();
            const medioPago = document.getElementById('cv-medioPago')?.value || 'Efectivo';
            const numComprobante = document.getElementById('cv-numComprobante')?.value.trim() || '';

            nuevaVenta.estado = 'cobrado';
            nuevaVenta.fechaCobro = fechaCobroReal;
            nuevaVenta.medioPago = medioPago;
            nuevaVenta.comprobanteCobro = numComprobante || null;

            const medioKey = mapearMedioAKey(medioPago);
            const mov = crearMovimiento({
                fecha: fechaCobroReal,
                tipo: 'ingreso',
                origen: 'venta_cobro',
                origenId: nuevaVenta.id,
                origenDescripcion: `Cobro venta ${presupuesto.cliente}`,
                monto: nuevaVenta.total,
                medio: medioKey,
                observaciones: numComprobante ? `Comprobante: ${numComprobante}` : ''
            });
            nuevaVenta.movimientoCobroId = mov.id;
        }

        db.ventas.push(nuevaVenta);

        const presupuestoIndex = db.presupuestos.findIndex(p => p.id === presupuestoId);
        if (presupuestoIndex !== -1) {
            db.presupuestos[presupuestoIndex].ventaGeneradaId = nuevaVenta.id;
        }

        guardarDB();
        mostrarNotificacion(`✅ Venta creada desde presupuesto ${presupuesto.numero}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    // 🔥 Inicializar input de fecha
    initInputFecha('fechaCobroVenta');

    // 🔥 v7.16.3: toggle de campos de cobro + init fecha
    initInputFecha('cv-fechaCobro');
    const cvCobradoYa = document.getElementById('cv-cobradoYa');
    const cvCobroFields = document.getElementById('cv-cobroFields');
    cvCobradoYa?.addEventListener('change', () => {
        cvCobroFields.classList.toggle('hidden', !cvCobradoYa.checked);
    });

    document.getElementById('cancelarVentaBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== HELPER: MAPEAR MEDIO A KEY ====================
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

// ==================== 🔥 v7.22.18: GENERAR OC PARA PROVEEDOR ====================
window.generarOCProveedor = (presupuestoId) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === presupuestoId);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    
    // 1. Obtener los ítems vinculados a compras
    const itemsVinculados = (presupuesto.items || []).filter(i => i.compraVinculadaId);
    if (itemsVinculados.length === 0) {
        mostrarNotificacion('Este presupuesto no tiene compras vinculadas. Primero vinculá una compra desde el editor.', 'warning');
        return;
    }
    
    // 2. Agrupar por compra (proveedor)
    const comprasAgrupadas = {};
    itemsVinculados.forEach(item => {
        const compra = db.compras.find(c => String(c.id) === String(item.compraVinculadaId));
        if (!compra) return;
        if (!comprasAgrupadas[compra.id]) {
            comprasAgrupadas[compra.id] = { compra, items: [] };
        }
        comprasAgrupadas[compra.id].items.push(item);
    });
    
    if (Object.keys(comprasAgrupadas).length === 0) {
        mostrarNotificacion('No se encontraron compras asociadas', 'error');
        return;
    }
    
    // 3. Generar un HTML por cada proveedor
    Object.values(comprasAgrupadas).forEach(({ compra, items }) => {
        const html = generarHTMLOCProveedor(presupuesto, compra, items);
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(html);
        ventana.document.close();
    });
    
    mostrarNotificacion(`✅ ${Object.keys(comprasAgrupadas).length} OC generada(s)`, 'success');
};

// ==================== 🔥 v7.22.18: TEMPLATE OC PROVEEDOR ====================
function generarHTMLOCProveedor(presupuesto, compra, items) {
    const empresa = getDB().datosEmpresa || { nombre: 'Mi Empresa', cuit: '', direccion: '', telefono: '', email: '' };
    const proveedor = {
        nombre: compra.proveedorNombre || 'Proveedor',
        cuit: compra.proveedorCuit || '',
        direccion: compra.proveedorDireccion || '',
        telefono: compra.proveedorTelefono || '',
        email: compra.proveedorEmail || ''
    };
    
    // Calcular el monto (costo del proveedor, NO precio de venta)
    const itemsFilas = items.map(item => {
        const cantidad = item.cantidadAsignada || item.cant || 1;
        const costoUnitario = item.costo || 0;
        const total = costoUnitario * cantidad;
        return `
            <tr>
                <td style="text-align:center;">${cantidad}</td>
                <td>${escapeHtml(item.desc || '')}</td>
                <td style="text-align:right;">$ ${formatNumber(costoUnitario)}</td>
                <td style="text-align:right;">$ ${formatNumber(total)}</td>
            </tr>
        `;
    }).join('');
    
    const subtotal = items.reduce((s, i) => s + ((i.costo || 0) * (i.cantidadAsignada || i.cant || 1)), 0);
    const iva = subtotal * 0.21;
    const total = subtotal + iva;
    
    const fechaEmision = formatDate(new Date());
    const fechaEntrega = presupuesto.fechaEntregaOC ? formatDate(presupuesto.fechaEntregaOC) : 'A definir';
    
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>OC Proveedor - ${proveedor.nombre}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0a2a4a; padding-bottom: 15px; margin-bottom: 20px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; }
  .header-left h2 { margin: 0 0 5px 0; color: #0a2a4a; font-size: 18px; }
  .header-left p { margin: 2px 0; font-size: 11px; color: #555; }
  .header-right h1 { margin: 0 0 5px 0; color: #0a2a4a; font-size: 22px; }
  .header-right p { margin: 2px 0; font-size: 11px; color: #555; }
  .destinatario { background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
  .destinatario h3 { margin: 0 0 8px 0; color: #0a2a4a; font-size: 14px; }
  .destinatario p { margin: 3px 0; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th { background: #0a2a4a; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  .totales { width: 300px; margin-left: auto; margin-bottom: 20px; }
  .totales td { border: none; padding: 4px 8px; font-size: 12px; }
  .totales .total-final { font-weight: bold; font-size: 14px; color: #0a2a4a; border-top: 2px solid #0a2a4a; padding-top: 8px; }
  .footer { margin-top: 30px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; text-align: center; }
  .no-print { margin-top: 20px; text-align: center; }
  .no-print button { padding: 10px 25px; background: #0a2a4a; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; margin: 0 5px; }
  .no-print button.gray { background: #6b7280; }
  @media print {
    .no-print { display: none !important; }
    body { max-width: 100% !important; margin: 0 !important; padding: 10mm !important; }
    th { background: #0a2a4a !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <h2>${escapeHtml(empresa.nombre || 'Mi Empresa')}</h2>
    <p>CUIT: ${escapeHtml(empresa.cuit || '-')}</p>
    <p>${escapeHtml(empresa.direccion || '')}</p>
    <p>${escapeHtml(empresa.telefono || '')} · ${escapeHtml(empresa.email || '')}</p>
  </div>
  <div class="header-right">
    <h1>Orden de Compra</h1>
    <p>N°: OC-${presupuesto.numero}</p>
    <p>Emitida: ${fechaEmision}</p>
    <p>Entrega: ${fechaEntrega}</p>
  </div>
</div>

<div class="destinatario">
  <h3>Proveedor:</h3>
  <p><strong>${escapeHtml(proveedor.nombre)}</strong></p>
  ${proveedor.cuit ? `<p>CUIT: ${escapeHtml(proveedor.cuit)}</p>` : ''}
  ${proveedor.direccion ? `<p>${escapeHtml(proveedor.direccion)}</p>` : ''}
  ${proveedor.telefono ? `<p>Tel: ${escapeHtml(proveedor.telefono)}</p>` : ''}
  ${proveedor.email ? `<p>Email: ${escapeHtml(proveedor.email)}</p>` : ''}
</div>

<table>
  <thead>
    <tr>
      <th style="width: 60px; text-align: center;">Cant.</th>
      <th>Descripción</th>
      <th style="width: 120px; text-align: right;">Precio Unit.</th>
      <th style="width: 120px; text-align: right;">Importe</th>
    </tr>
  </thead>
  <tbody>
    ${itemsFilas}
  </tbody>
</table>

<table class="totales">
  <tr><td>Subtotal:</td><td style="text-align:right;">$ ${formatNumber(subtotal)}</td></tr>
  <tr><td>IVA 21%:</td><td style="text-align:right;">$ ${formatNumber(iva)}</td></tr>
  <tr class="total-final"><td>TOTAL:</td><td style="text-align:right;">$ ${formatNumber(total)}</td></tr>
</table>

<div class="footer">
  <p>OC generada desde Presupuesto ${presupuesto.numero} · ${presupuesto.cliente || ''}</p>
  <p>${escapeHtml(empresa.nombre || '')} · ${escapeHtml(empresa.telefono || '')} · ${escapeHtml(empresa.email || '')}</p>
</div>

<div class="no-print">
  <button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button class="gray" onclick="window.close()">Cerrar</button>
</div>
</body>
</html>`;
}

// ==================== 🔥 v7.22.22: PAGAR PROVEEDOR ====================
window.mostrarModalPagarProveedor = (presupuestoId) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === presupuestoId);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    
    const itemsVinculados = (presupuesto.items || []).filter(i => i.compraVinculadaId);
    const comprasAgrupadas = {};
    itemsVinculados.forEach(item => {
        const compra = db.compras.find(c => String(c.id) === String(item.compraVinculadaId));
        if (!compra) return;
        if (!comprasAgrupadas[compra.id]) {
            comprasAgrupadas[compra.id] = { compra, items: [] };
        }
        comprasAgrupadas[compra.id].items.push(item);
    });
    
    if (Object.keys(comprasAgrupadas).length === 0) {
        mostrarNotificacion('Este presupuesto no tiene compras vinculadas', 'warning');
        return;
    }
    
    const hoyISOStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    const hoyFormateada = formatDate(new Date());
    
    let totalPagar = 0;
    Object.values(comprasAgrupadas).forEach(({ compra, items }) => {
        items.forEach(item => {
            totalPagar += (item.costo || 0) * (item.cantidadAsignada || item.cant || 1);
        });
    });
    totalPagar = +(totalPagar * 1.21).toFixed(2);
    
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-lg">
                <h2 class="text-xl font-bold mb-4">💸 Pagar Proveedor</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Presupuesto:</strong> ${presupuesto.numero}</p>
                    <p><strong>Proveedores:</strong> ${Object.values(comprasAgrupadas).map(c => escapeHtml(c.compra.proveedorNombre)).join(', ')}</p>
                    <p><strong>Total a pagar (con IVA):</strong> <span class="font-bold text-purple-600">$${formatNumber(totalPagar)}</span></p>
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-medium">📅 Fecha de pago</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="fechaPagoProvText" class="flex-1 p-3 border rounded-xl" placeholder="DD/MM/AAAA" value="${hoyFormateada}">
                        <input type="date" id="fechaPagoProvHidden" class="hidden" value="${hoyISOStr}">
                        <button type="button" id="btnCalPagoProv" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                    </div>
                    <label class="block text-sm font-medium">💳 Medio de pago</label>
                    <select id="medioPagoProv" class="w-full p-3 border rounded-xl">
                        <option value="efectivo">💵 Efectivo</option>
                        <option value="transferencia" selected>🏦 Transferencia</option>
                        <option value="tarjeta_debito">💳 Tarjeta Débito</option>
                        <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
                        <option value="cheque">📝 Cheque</option>
                    </select>
                    <label class="block text-sm font-medium">📎 Comprobante de pago (opcional)</label>
                    <input type="file" id="comprobantePagoProv" accept=".pdf,image/*" class="w-full p-2 border rounded-lg">
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarPagoProvBtn" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl">✅ Confirmar pago</button>
                    <button id="cancelarPagoProvBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;
    
    document.getElementById('btnCalPagoProv').onclick = () => {
        document.getElementById('fechaPagoProvHidden').showPicker();
    };
    document.getElementById('fechaPagoProvHidden').onchange = function() {
        const [a, m, d] = this.value.split('-');
        document.getElementById('fechaPagoProvText').value = `${d}/${m}/${a}`;
    };
    
    document.getElementById('cancelarPagoProvBtn').onclick = () => window.verPresupuestoDetalle(presupuestoId);
    
    document.getElementById('confirmarPagoProvBtn').onclick = async () => {
        const fechaPago = document.getElementById('fechaPagoProvHidden').value;
        const medioPago = document.getElementById('medioPagoProv').value;
        const archivoComprobante = document.getElementById('comprobantePagoProv').files[0];
        
        if (!fechaPago) { mostrarNotificacion('Ingrese fecha de pago', 'warning'); return; }
        
        let comprobanteUrl = null;
        let comprobanteNombre = null;
        
        if (archivoComprobante) {
            try {
                const { subirArchivo, comprimirImagen, getEmpresaActual } = await import('../firebase.js');
                const fileComprimido = await comprimirImagen(archivoComprobante);
                const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
                const empresaId = getEmpresaActual() || 'empresa_principal';
                const ruta = `${empresaId}/presupuestos/pago_${presupuestoId}_${Date.now()}.${ext}`;
                comprobanteUrl = await subirArchivo(ruta, fileComprimido);
                comprobanteNombre = fileComprimido.name;
            } catch (e) {
                console.error('Error subiendo comprobante:', e);
                mostrarNotificacion('Error subiendo comprobante: ' + e.message, 'error');
                return;
            }
        }
        
        presupuesto.estado = 'pagado_proveedor';
        presupuesto.fechaPagoProveedor = fechaPago;
        presupuesto.medioPagoProveedor = medioPago;
        presupuesto.comprobantePagoProveedorUrl = comprobanteUrl;
        presupuesto.comprobantePagoProveedorNombre = comprobanteNombre;
        
        const { crearMovimiento } = await import('../db.js');
        Object.values(comprasAgrupadas).forEach(({ compra, items }) => {
            const netoGravado = items.reduce((s, i) => s + ((i.costo || 0) * (i.cantidadAsignada || i.cant || 1)), 0);
            const ivaCompras = netoGravado * 0.21;
            const totalFactura = netoGravado + ivaCompras;
            
            const compraExistente = db.compras.find(c => String(c.id) === String(compra.id));
            if (compraExistente) {
                compraExistente.estadoPago = 'PAGADO';
                compraExistente.fechaPago = fechaPago;
                compraExistente.metodoPago = medioPago;
                compraExistente.comprobantePagoUrl = comprobanteUrl;
                compraExistente.comprobantePagoNombre = comprobanteNombre;
                compraExistente.presupuestoOrigenId = presupuesto.id;
            } else {
                const nuevaCompra = {
                    id: generarId(),
                    tipo: 'COMPRA',
                    fechaEmision: fechaPago,
                    numeroFactura: null,
                    proveedorNombre: compra.proveedorNombre,
                    proveedorCuit: compra.proveedorCuit,
                    proveedorId: compra.proveedorId || null,
                    categoria: 'MERCADERIA',
                    tipoFactura: 'A',
                    ivaDescontable: true,
                    ivaComputable: true,
                    items: items.map((item) => ({
                        descripcion: item.desc || 'Sin descripción',
                        cantidad: item.cantidadAsignada || item.cant || 1,
                        precioUnitarioNeto: item.costo || 0,
                        precioUnitario: (item.costo || 0) * 1.21,
                        ivaMonto: (item.costo || 0) * 0.21,
                        alicuotaIVA: 21,
                        ivaComputable: true,
                        total: (item.costo || 0) * 1.21 * (item.cantidadAsignada || item.cant || 1),
                        costoParaGanancias: (item.costo || 0) * (item.cantidadAsignada || item.cant || 1),
                        stockDisponible: item.cantidadAsignada || item.cant || 1,
                        ivaDescontable: true,
                        tipoFactura: 'A'
                    })),
                    totales: {
                        netoGravado: +netoGravado.toFixed(2),
                        ivaCompras: +ivaCompras.toFixed(2),
                        ivaNoComputable: 0,
                        noGravado: 0,
                        totalFactura: +totalFactura.toFixed(2),
                        costoTotalGanancias: +netoGravado.toFixed(2)
                    },
                    totalFactura: +totalFactura.toFixed(2),
                    montoNeto: +netoGravado.toFixed(2),
                    ivaMonto: +ivaCompras.toFixed(2),
                    ivaPorcentaje: 21,
                    plazoPago: 0,
                    fechaVencimientoPago: fechaPago,
                    estadoPago: 'PAGADO',
                    fechaPago: fechaPago,
                    metodoPago: medioPago,
                    comprobantePagoUrl: comprobanteUrl,
                    comprobantePagoNombre: comprobanteNombre,
                    presupuestoOrigenId: presupuesto.id,
                    facturaProveedorUrl: null,
                    facturaProveedorNombre: null
                };
                db.compras.push(nuevaCompra);
                
                try {
                    const mov = crearMovimiento({
                        fecha: fechaPago,
                        tipo: 'egreso',
                        origen: 'compra_pago',
                        origenId: nuevaCompra.id,
                        origenDescripcion: `Pago compra ${compra.proveedorNombre} - Presupuesto ${presupuesto.numero}`,
                        monto: totalFactura,
                        medio: medioPago,
                        observaciones: `Compra generada desde presupuesto ${presupuesto.numero}`
                    });
                    nuevaCompra.movimientoPagoId = mov.id;
                } catch (e) {
                    console.error('Error creando movimiento de compra:', e);
                }
            }
        });
        
        guardarDB();
        mostrarNotificacion('✅ Pago a proveedor registrado', 'success');
        window.dispatchEvent(new Event('refreshView'));
        window.verPresupuestoDetalle(presupuestoId);
    };
};

// ==================== 🔥 v7.22.23: DESHACER PASO A PASO ====================
window.deshacerPasoPresupuesto = async (presupuestoId) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => String(p.id) === String(presupuestoId));
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    
    const estadoActual = presupuesto.estado;
    let titulo = '';
    let mensaje = '';
    let textoConfirmar = '';
    
    if (estadoActual === 'pagado_proveedor') {
        titulo = '↩️ Deshacer pago a proveedor';
        mensaje = 'Se eliminará el movimiento de egreso en tesorería y se revertirá la compra. El presupuesto vuelve a COBRADO.';
        textoConfirmar = '↩️ Sí, deshacer pago';
    } else if (estadoActual === 'cobrado') {
        titulo = '↩️ Deshacer cobro';
        mensaje = 'Se eliminará el movimiento de ingreso en tesorería y el comprobante de cobro. El presupuesto vuelve a APROBADO.';
        textoConfirmar = '↩️ Sí, deshacer cobro';
    } else if (estadoActual === 'aprobado') {
        titulo = '↩️ Deshacer aprobación';
        mensaje = 'Se eliminará la venta generada, el movimiento de ingreso (si lo hay) y la OC del cliente. El presupuesto vuelve a PENDIENTE.';
        textoConfirmar = '↩️ Sí, deshacer aprobación';
    } else {
        titulo = '🗑️ Eliminar presupuesto';
        mensaje = 'El presupuesto está en PENDIENTE. Al deshacer, se eliminará COMPLETAMENTE con toda su cadena (venta, movimientos, archivos).<br><br><strong>Esta acción no se puede deshacer.</strong>';
        textoConfirmar = '🗑️ Sí, eliminar';
    }
    
    const confirmado = await confirmarAccion({
        titulo: titulo,
        mensaje: mensaje,
        textoConfirmar: textoConfirmar,
        icono: '↩️'
    });
    if (!confirmado) return;
    
    const { eliminarArchivoDeStorage } = await import('../firebase.js');
    
    // 🔥 PASO 1: PAGADO_PROVEEDOR → COBRADO
    if (estadoActual === 'pagado_proveedor') {
        // Eliminar movimiento de egreso
        if (presupuesto.movimientoPagoProveedorId && db.movimientos) {
            db.movimientos = db.movimientos.filter(m => String(m.id) !== String(presupuesto.movimientoPagoProveedorId));
        }
        // Revertir compras (las que se crearon desde el presupuesto)
        if (db.compras) {
            const comprasCreadas = db.compras.filter(c => String(c.presupuestoOrigenId) === String(presupuesto.id));
            comprasCreadas.forEach(compra => {
                // Si la compra fue creada por el presupuesto, eliminarla
                // Si fue actualizada, revertir estadoPago a PENDIENTE
                if (compra.id.startsWith('compra_') && compra.fechaEmision === presupuesto.fechaPagoProveedor) {
                    // Es una compra creada por el presupuesto → eliminar
                    db.compras = db.compras.filter(c => String(c.id) !== String(compra.id));
                } else {
                    // Es una compra actualizada → revertir estado
                    compra.estadoPago = 'PENDIENTE';
                    compra.fechaPago = null;
                    compra.comprobantePagoUrl = null;
                }
            });
        }
        // Eliminar comprobante de pago de Storage
        if (presupuesto.comprobantePagoProveedorUrl) {
            await eliminarArchivoDeStorage(presupuesto.comprobantePagoProveedorUrl);
        }
        // Revertir presupuesto
        presupuesto.estado = 'cobrado';
        presupuesto.fechaPagoProveedor = null;
        presupuesto.medioPagoProveedor = null;
        presupuesto.comprobantePagoProveedorUrl = null;
        presupuesto.comprobantePagoProveedorNombre = null;
        presupuesto.movimientoPagoProveedorId = null;
    }
    
    // 🔥 PASO 2: COBRADO → APROBADO
    else if (estadoActual === 'cobrado') {
        // Eliminar movimiento de ingreso
        if (presupuesto.movimientoCobroId && db.movimientos) {
            db.movimientos = db.movimientos.filter(m => String(m.id) !== String(presupuesto.movimientoCobroId));
        }
        // Revertir venta asociada
        if (presupuesto.ventaGeneradaId && db.ventas) {
            const venta = db.ventas.find(v => String(v.id) === String(presupuesto.ventaGeneradaId));
            if (venta) {
                venta.estado = 'pendiente_cobro';
                venta.fechaCobro = null;
                venta.comprobanteCobroUrl = null;
            }
        }
        // Eliminar comprobante de cobro de Storage
        if (presupuesto.comprobanteCobroUrl) {
            await eliminarArchivoDeStorage(presupuesto.comprobanteCobroUrl);
        }
        // Revertir presupuesto
        presupuesto.estado = 'aprobado';
        presupuesto.fechaCobro = null;
        presupuesto.medioPagoCobro = null;
        presupuesto.comprobanteCobroUrl = null;
        presupuesto.comprobanteCobroNombre = null;
        presupuesto.movimientoCobroId = null;
    }
    
    // 🔥 PASO 3: APROBADO → PENDIENTE
    else if (estadoActual === 'aprobado') {
        // Eliminar venta generada
        if (presupuesto.ventaGeneradaId && db.ventas) {
            db.ventas = db.ventas.filter(v => String(v.id) !== String(presupuesto.ventaGeneradaId));
        }
        // Eliminar movimiento de ingreso (si lo hay, por si acaso)
        if (db.movimientos) {
            db.movimientos = db.movimientos.filter(m => !(String(m.origenId) === String(presupuesto.id) && m.tipo === 'ingreso'));
        }
        // Eliminar OC del cliente de Storage
        if (presupuesto.ocClienteUrl) {
            await eliminarArchivoDeStorage(presupuesto.ocClienteUrl);
        }
        // Revertir presupuesto
        presupuesto.estado = 'pendiente';
        presupuesto.ventaGeneradaId = null;
        presupuesto.fechaAprobacion = null;
        presupuesto.ocClienteUrl = null;
        presupuesto.ocClienteNombre = null;
    }
    
    // 🔥 PASO 4: PENDIENTE → ELIMINAR PRESUPUESTO COMPLETO
    else {
        // Eliminar archivos de Storage (todos)
        if (presupuesto.presupuestoReferenciaUrl) {
            await eliminarArchivoDeStorage(presupuesto.presupuestoReferenciaUrl);
        }
        if (presupuesto.ocClienteUrl) {
            await eliminarArchivoDeStorage(presupuesto.ocClienteUrl);
        }
        if (presupuesto.comprobanteCobroUrl) {
            await eliminarArchivoDeStorage(presupuesto.comprobanteCobroUrl);
        }
        if (presupuesto.comprobantePagoProveedorUrl) {
            await eliminarArchivoDeStorage(presupuesto.comprobantePagoProveedorUrl);
        }
        // Eliminar movimientos asociados
        if (db.movimientos) {
            db.movimientos = db.movimientos.filter(m => String(m.origenId) !== String(presupuesto.id));
        }
        // Eliminar venta asociada (si existe)
        if (presupuesto.ventaGeneradaId && db.ventas) {
            db.ventas = db.ventas.filter(v => String(v.id) !== String(presupuesto.ventaGeneradaId));
        }
        // Eliminar compras creadas por el presupuesto
        if (db.compras) {
            db.compras = db.compras.filter(c => String(c.presupuestoOrigenId) !== String(presupuesto.id));
        }
        // Eliminar el presupuesto
        db.presupuestos = db.presupuestos.filter(p => String(p.id) !== String(presupuesto.id));
    }
    
    guardarDB();
    mostrarNotificacion('↩️ Paso deshecho correctamente', 'success');
    window.dispatchEvent(new Event('refreshView'));
    
    // Si el presupuesto sigue existiendo, volver a abrir el detalle
    if (estadoActual !== 'pendiente') {
        window.verPresupuestoDetalle(presupuestoId);
    }
};

// ==================== 🔥 v7.22.28: ELIMINAR TODO (CADENA COMPLETA) ====================
window.eliminarTodoPresupuesto = async (presupuestoId) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => String(p.id) === String(presupuestoId));
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    
    const estadoActual = presupuesto.estado;
    const tieneDependencias = presupuesto.ventaGeneradaId || 
        (presupuesto.items && presupuesto.items.some(i => i.compraVinculadaId)) ||
        presupuesto.ocClienteUrl || 
        presupuesto.comprobanteCobroUrl || 
        presupuesto.comprobantePagoProveedorUrl;
    
    // 🔥 Confirmación doble si tiene dependencias
    if (tieneDependencias) {
        const confirmado1 = await confirmarAccion({
            titulo: '⚠️ Eliminar TODO - Confirmación 1',
            mensaje: `El presupuesto ${presupuesto.numero} está en estado <strong>${estadoActual}</strong> y tiene dependencias:<br><br>` +
                `${presupuesto.ventaGeneradaId ? '• Venta asociada<br>' : ''}` +
                `${presupuesto.ocClienteUrl ? '• OC del cliente adjunta<br>' : ''}` +
                `${presupuesto.comprobanteCobroUrl ? '• Comprobante de cobro<br>' : ''}` +
                `${presupuesto.comprobantePagoProveedorUrl ? '• Comprobante de pago a proveedor<br>' : ''}` +
                `<br>Se eliminará TODO (presupuesto + venta + movimientos + compras + archivos).<br><br><strong>¿Continuar?</strong>`,
            textoConfirmar: '⚠️ Sí, continuar',
            icono: '⚠️'
        });
        if (!confirmado1) return;
        
        const confirmado2 = await confirmarAccion({
            titulo: '🚨 CONFIRMACIÓN FINAL',
            mensaje: `Esta acción es <strong>IRREVERSIBLE</strong>. Se eliminará el presupuesto ${presupuesto.numero} y toda su cadena.<br><br><strong>¿Estás 100% seguro?</strong>`,
            textoConfirmar: '🚨 SÍ, ELIMINAR TODO',
            icono: '🚨'
        });
        if (!confirmado2) return;
    } else {
        const confirmado = await confirmarAccion({
            titulo: '🗑️ Eliminar presupuesto',
            mensaje: `¿Eliminar el presupuesto ${presupuesto.numero}?`,
            textoConfirmar: '🗑️ Sí, eliminar',
            icono: '🗑️'
        });
        if (!confirmado) return;
    }
    
    // 🔥 Eliminar archivos de Storage
    const { eliminarArchivoDeStorage } = await import('../firebase.js');
    if (presupuesto.presupuestoReferenciaUrl) await eliminarArchivoDeStorage(presupuesto.presupuestoReferenciaUrl);
    if (presupuesto.ocClienteUrl) await eliminarArchivoDeStorage(presupuesto.ocClienteUrl);
    if (presupuesto.comprobanteCobroUrl) await eliminarArchivoDeStorage(presupuesto.comprobanteCobroUrl);
    if (presupuesto.comprobantePagoProveedorUrl) await eliminarArchivoDeStorage(presupuesto.comprobantePagoProveedorUrl);
    
    // 🔥 Eliminar movimientos asociados
    if (db.movimientos) {
        db.movimientos = db.movimientos.filter(m => String(m.origenId) !== String(presupuesto.id));
    }
    
    // 🔥 Eliminar venta asociada
    if (presupuesto.ventaGeneradaId && db.ventas) {
        db.ventas = db.ventas.filter(v => String(v.id) !== String(presupuesto.ventaGeneradaId));
    }
    
    // 🔥 Eliminar compras creadas por el presupuesto
    if (db.compras) {
        db.compras = db.compras.filter(c => String(c.presupuestoOrigenId) !== String(presupuesto.id));
    }
    
    // 🔥 Eliminar presupuesto
    db.presupuestos = db.presupuestos.filter(p => String(p.id) !== String(presupuesto.id));
    
    guardarDB();
    mostrarNotificacion(`🗑️ Presupuesto ${presupuesto.numero} y toda su cadena eliminados`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== 🔥 v7.22.34: RECHAZAR / VOLVER A PENDIENTE ====================
window.rechazarPresupuesto = async (presupuestoId) => {
    const db = getDB();
    const idx = db.presupuestos.findIndex(p => String(p.id) === String(presupuestoId));
    if (idx < 0) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    const presupuesto = db.presupuestos[idx];
    
    if (presupuesto.estado !== 'pendiente') {
        mostrarNotificacion('Solo se pueden rechazar presupuestos en estado pendiente', 'error');
        return;
    }
    
    const confirmado = await confirmarAccion({
        titulo: '❌ Rechazar presupuesto',
        mensaje: `¿Rechazar el presupuesto <strong>${presupuesto.numero}</strong>?<br><br>El presupuesto pasará a estado <strong>Rechazado</strong>. No se elimina nada, solo cambia el estado.`,
        textoConfirmar: '❌ Sí, rechazar',
        icono: '❌'
    });
    if (!confirmado) return;
    
    db.presupuestos[idx].estado = 'rechazado';
    db.presupuestos[idx].fechaRechazo = hoyISO();
    
    guardarDB();
    mostrarNotificacion(`❌ Presupuesto ${presupuesto.numero} rechazado`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

window.volverAPendientePresupuesto = async (presupuestoId) => {
    const db = getDB();
    const idx = db.presupuestos.findIndex(p => String(p.id) === String(presupuestoId));
    if (idx < 0) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    const presupuesto = db.presupuestos[idx];
    
    if (presupuesto.estado !== 'rechazado') {
        mostrarNotificacion('Solo se pueden reactivar presupuestos rechazados', 'error');
        return;
    }
    
    const confirmado = await confirmarAccion({
        titulo: '↩️ Volver a pendiente',
        mensaje: `¿Volver el presupuesto <strong>${presupuesto.numero}</strong> a estado <strong>Pendiente</strong>?<br><br>Podrás aprobarlo o rechazarlo nuevamente.`,
        textoConfirmar: '↩️ Sí, volver a pendiente',
        icono: '↩️'
    });
    if (!confirmado) return;
    
    db.presupuestos[idx].estado = 'pendiente';
    db.presupuestos[idx].fechaRechazo = null;
    
    guardarDB();
    mostrarNotificacion(`↩️ Presupuesto ${presupuesto.numero} vuelve a pendiente`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};
