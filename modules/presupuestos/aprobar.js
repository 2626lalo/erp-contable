// ==================== modules/presupuestos/aprobar.js ====================
// APROBAR - Aprobación de presupuestos y creación de ventas
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB } from '../db.js';
import { formatNumber, escapeHtml, formatDate, mostrarNotificacion, generarId, dateToISO, hoyISO } from '../utils.js';
import { ALICUOTA_IVA } from './estado.js';
import { separarIVA } from './helpers.js';
import { buscarUnidadPorPatente, crearOActualizarUnidad } from '../unidades.js';

// ==================== APROBAR PRESUPUESTO ====================
window.aprobarPresupuesto = (id) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    if (presupuesto.estado === 'aprobado') {
        mostrarNotificacion('Este presupuesto ya está aprobado', 'warning');
        return;
    }
    // 🔥 v7.16.81: hoyISO viene de utils.js (helper local, sin bug UTC-3)
    const hoyFormateada = formatDate(new Date());
    const cliente = db.clientes.find(c => c.id === presupuesto.clienteId);
    // 🔥 v7.22.29: forzar diasCobro a mínimo 0 y máximo 365
    let diasCobro = cliente && cliente.diasCobro !== undefined && cliente.diasCobro !== null ? parseInt(cliente.diasCobro) : 30;
    if (isNaN(diasCobro) || diasCobro < 0) diasCobro = 30;
    if (diasCobro > 365) diasCobro = 365;
    const fechaCobroISO = new Date();
    fechaCobroISO.setDate(fechaCobroISO.getDate() + diasCobro);
    const fechaCobroFormateada = formatDate(fechaCobroISO);

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-lg">
                <h2 class="text-xl font-bold mb-4">✅ Aprobar Presupuesto</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(presupuesto.cliente)}</p>
                    <p><strong>Presupuesto:</strong> ${presupuesto.numero}</p>
                    <p><strong>Total:</strong> <span class="font-bold text-green-600">$${formatNumber(presupuesto.total)}</span></p>
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-medium">📋 Número de Orden de Compra (OC) <span class="text-xs text-gray-400 font-normal">(opcional)</span></label>
                    <input type="text" id="ocClienteAprob" class="w-full p-3 border rounded-xl" placeholder="Ej: OC-2026-001 (dejar vacío si es pago directo)">
                    <label class="block text-sm font-medium">📎 Adjuntar OC (PDF/Imagen) <span class="text-xs text-gray-400 font-normal">(opcional)</span></label>
                    <div class="flex items-center gap-2 flex-wrap">
                        <label class="cursor-pointer bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                            Seleccionar archivo
                            <input type="file" id="ocArchivoAprob" accept=".pdf,image/*" class="hidden" onchange="window.seleccionarOCClienteAprob(this.files[0])">
                        </label>
                        <span id="nombreArchivoOC" class="text-sm text-gray-500">Ningún archivo seleccionado</span>
                    </div>
                    <div id="ocClientePreviewActions" class="hidden mt-2 p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="window.verOCClienteAprob()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">👁️ Ver vista previa</button>
                            <button type="button" onclick="window.quitarOCClienteAprob()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">🗑️ Quitar</button>
                        </div>
                    </div>
                    <label class="block text-sm font-medium">📅 Fecha de recepción de OC</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="fechaRecepcionText" class="flex-1 p-3 border rounded-xl" placeholder="DD/MM/AAAA" value="${hoyFormateada}">
                        <input type="date" id="fechaRecepcionHidden" class="hidden" value="${hoyISO}">
                        <button type="button" id="btnCalendarioRecepcion" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                    </div>
                    <label class="block text-sm font-medium">📅 Fecha de cobro esperada</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="fechaCobroText" class="flex-1 p-3 border rounded-xl" placeholder="DD/MM/AAAA" value="${fechaCobroFormateada}">
                        <input type="date" id="fechaCobroHidden" class="hidden" value="${dateToISO(fechaCobroISO)}">
                        <button type="button" id="btnCalendarioCobro" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                    </div>
                    <label class="block text-sm font-medium">🧾 Número de Factura (si ya la tenés)</label>
                    <input type="text" id="numFacturaAprob" class="w-full p-3 border rounded-xl" placeholder="Opcional">
                    <label class="block text-sm font-medium">📝 Observaciones</label>
                    <textarea id="observacionesAprob" rows="2" class="w-full p-2 border rounded-lg" placeholder="Notas sobre esta orden..."></textarea>
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarAprobBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Aprobar y crear Venta</button>
                    <button id="cancelarAprobBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    const fechaRecepcionText = document.getElementById('fechaRecepcionText');
    const fechaRecepcionHidden = document.getElementById('fechaRecepcionHidden');
    const btnCalRecepcion = document.getElementById('btnCalendarioRecepcion');
    function actualizarFechaRecepcion() {
        if (fechaRecepcionHidden.value) {
            const dateObj = new Date(fechaRecepcionHidden.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaRecepcionText.value = formatDate(dateObj);
            }
        }
    }
    btnCalRecepcion.addEventListener('click', function() {
        fechaRecepcionHidden.showPicker ? fechaRecepcionHidden.showPicker() : fechaRecepcionHidden.click();
    });
    fechaRecepcionHidden.addEventListener('change', actualizarFechaRecepcion);

    const fechaCobroText = document.getElementById('fechaCobroText');
    const fechaCobroHidden = document.getElementById('fechaCobroHidden');
    const btnCalCobro = document.getElementById('btnCalendarioCobro');
    function actualizarFechaCobro() {
        if (fechaCobroHidden.value) {
            const dateObj = new Date(fechaCobroHidden.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaCobroText.value = formatDate(dateObj);
            }
        }
    }
    btnCalCobro.addEventListener('click', function() {
        fechaCobroHidden.showPicker ? fechaCobroHidden.showPicker() : fechaCobroHidden.click();
    });
    fechaCobroHidden.addEventListener('change', actualizarFechaCobro);

    document.getElementById('confirmarAprobBtn').onclick = () => {
        const oc = document.getElementById('ocClienteAprob').value.trim();
        const fechaRecepcion = document.getElementById('fechaRecepcionHidden').value;
        const fechaCobro = document.getElementById('fechaCobroHidden').value;
        const numFactura = document.getElementById('numFacturaAprob').value.trim();
        const observaciones = document.getElementById('observacionesAprob').value.trim();
        const archivoOC = document.getElementById('ocArchivoAprob').files[0];

        // 🔥 v7.22.24: el número de OC es opcional (pagos directos sin OC)
        if (!fechaCobro) { mostrarNotificacion('Fecha de cobro esperada requerida', 'warning'); return; }

        const ventaNeta = presupuesto.ventaCliente !== undefined 
            ? (presupuesto.ventaClienteConIVA !== undefined ? presupuesto.ventaCliente : presupuesto.ventaCliente / (1 + ALICUOTA_IVA / 100))
            : (presupuesto.total / (1 + (presupuesto.incluirIVA ? ALICUOTA_IVA / 100 : 0)));
        const ivaMontoVenta = presupuesto.ivaVentas !== undefined 
            ? presupuesto.ivaVentas 
            : (presupuesto.total - ventaNeta);

        const nuevaVenta = {
            id: generarId(),
            clienteId: presupuesto.clienteId,
            clienteNombre: presupuesto.cliente,
            patente: presupuesto.patente || '',
            vehiculoMarca: presupuesto.vehiculoMarca || '',
            vehiculoKm: presupuesto.vehiculoKm || '',
            tipoComprobante: 'Factura A',
            numComprobante: numFactura || null,
            montoNeto: ventaNeta,
            iva: presupuesto.incluirIVA ? ALICUOTA_IVA : 0,
            ivaMonto: ivaMontoVenta,
            total: presupuesto.total,
            fechaVenta: hoyISO(),
            fechaAprobacion: hoyISO(),  // 🔥 v7.22.20: fecha de aprobación
            fechaCobroEsperada: fechaCobro,
            mes: hoyISO().substring(0, 7),
            estado: numFactura ? 'pendiente_cobro' : 'pendiente_factura',
            facturaUrl: null,
            facturaNombre: null,
            ordenCompraCliente: oc,
            fechaRecepcionOC: fechaRecepcion,
            ocArchivoUrl: null,
            ocArchivoNombre: null,
            observaciones: observaciones || null,
            presupuestoId: presupuesto.id,
            patente: presupuesto.patente || null,  // 🔥 NUEVO: guardar patente en la venta
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
            items: presupuesto.items.map(i => ({ ...i })),
            fechaFactura: null,
            numFacturaEmitida: numFactura || null,
            facturaEmitidaUrl: null,
            diasCobroCliente: diasCobro,
            presupuestoMoraGenerado: null,
            moraSaldada: false
        };

        // 🔥 v7.22.16: subir OC del cliente a Storage (no base64)
        if (archivoOC) {
            (async () => {
                try {
                    const { subirArchivo, comprimirImagen, getEmpresaActual } = await import('../firebase.js');
                    const fileComprimido = await comprimirImagen(archivoOC);
                    const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
                    const empresaId = getEmpresaActual() || 'empresa_principal';
                    const ruta = `${empresaId}/presupuestos/oc_cliente_${Date.now()}.${ext}`;
                    const url = await subirArchivo(ruta, fileComprimido);
                    nuevaVenta.ocArchivoUrl = url;
                    nuevaVenta.ocArchivoNombre = fileComprimido.name;
                    console.log('✅ OC del cliente subida a Storage:', url.substring(0, 80) + '...');
                } catch (e) {
                    console.error('❌ Error subiendo OC:', e);
                    mostrarNotificacion('Error subiendo OC: ' + e.message, 'error');
                }
                guardarVentaCompleta(nuevaVenta, presupuesto);
            })();
        } else {
            guardarVentaCompleta(nuevaVenta, presupuesto);
        }
    };

    document.getElementById('cancelarAprobBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== GUARDAR VENTA COMPLETA ====================
function guardarVentaCompleta(nuevaVenta, presupuesto) {
    const db = getDB();
    db.ventas.push(nuevaVenta);

    const presIndex = db.presupuestos.findIndex(p => p.id === presupuesto.id);
    if (presIndex !== -1) {
        db.presupuestos[presIndex].estado = 'aprobado';
        db.presupuestos[presIndex].ventaGeneradaId = nuevaVenta.id;
        db.presupuestos[presIndex].fechaAprobacion = hoyISO();
        // 🔥 v7.22.16: guardar OC del cliente en el presupuesto
        if (nuevaVenta.ocArchivoUrl) {
            db.presupuestos[presIndex].ocClienteUrl = nuevaVenta.ocArchivoUrl;
            db.presupuestos[presIndex].ocClienteNombre = nuevaVenta.ocArchivoNombre;
        }
    }

    if (presupuesto.deudasIncluidas && presupuesto.deudasIncluidas.length > 0) {
        presupuesto.deudasIncluidas.forEach(deudaId => {
            const ventaDeuda = db.ventas.find(v => v.id === deudaId);
            if (ventaDeuda) {
                ventaDeuda.moraSaldada = true;
            }
            const presMora = db.presupuestos.find(p => p.id === deudaId);
            if (presMora && presMora.esMora) {
                presMora.estado = 'aprobado';
            }
        });
    }

    // 🔥 NUEVO: actualizar o crear la unidad asociada
    if (presupuesto.patente && presupuesto.patente.trim()) {
        const unidad = buscarUnidadPorPatente(presupuesto.patente);
        if (unidad) {
            // Actualizar unidad existente
            if (presupuesto.vehiculoKm) unidad.kmActual = presupuesto.vehiculoKm;
            if (presupuesto.vehiculoMarca) unidad.marcaModelo = presupuesto.vehiculoMarca;
            if (presupuesto.vehiculoAnio) unidad.anio = presupuesto.vehiculoAnio;
            if (presupuesto.vehiculoColor) unidad.color = presupuesto.vehiculoColor;
            if (presupuesto.vehiculoChasis) unidad.motor = presupuesto.vehiculoChasis;
            if (presupuesto.clienteId) unidad.clienteId = presupuesto.clienteId;
            if (presupuesto.cliente) unidad.clienteNombre = presupuesto.cliente;
            unidad.fechaUltimoServicio = new Date().toISOString();
        } else {
            // Crear unidad nueva
            crearOActualizarUnidad({
                patente: presupuesto.patente,
                marcaModelo: presupuesto.vehiculoMarca || '',
                anio: presupuesto.vehiculoAnio || '',
                color: presupuesto.vehiculoColor || '',
                motor: presupuesto.vehiculoChasis || '',
                kmActual: presupuesto.vehiculoKm || '',
                clienteId: presupuesto.clienteId || null,
                clienteNombre: presupuesto.cliente || ''
            });
        }
    }

    guardarDB();
    mostrarNotificacion(`✅ Presupuesto ${presupuesto.numero} aprobado y venta creada`, 'success');
    window.dispatchEvent(new Event('refreshView'));
}

// ==================== ACTUALIZAR NOMBRE ARCHIVO ====================
window.actualizarNombreArchivo = (input, spanId) => {
    const span = document.getElementById(spanId);
    if (span) {
        if (input.files && input.files[0]) {
            span.textContent = input.files[0].name;
        } else {
            span.textContent = 'Ningún archivo seleccionado';
        }
    }
};
