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
                ${!p.ventaGeneradaId && p.estado !== 'aprobado' ? `<button onclick="window.aprobarPresupuesto(${p.id})" class="bg-green-600 text-white px-4 py-2 rounded-xl flex-1">✅ Aprobar y crear Venta</button>` : ''}
                ${p.estado === 'aprobado' && p.ventaGeneradaId ? `<button onclick="window.revertirAprobacion(${p.id})" class="bg-orange-600 text-white px-4 py-2 rounded-xl flex-1">↩️ Revertir aprobación</button>` : ''}
                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-600 text-white px-4 py-2 rounded-xl flex-1">🗑️ Eliminar</button>
                <button onclick="window.verTrazabilidad('presupuesto','${p.id}')" class="bg-purple-600 text-white px-4 py-2 rounded-xl flex-1">🔗 Ver trazabilidad</button>
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
