// ==================== modules/ventas.js ====================
// VENTAS - Con detalle completo, trazabilidad, cobro y venta directa
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB, getImpuestosActivos, crearMovimiento } from './db.js';
import { subirArchivo, comprimirImagen, getEmpresaActual } from './firebase.js';
import { procesarArchivoFactura } from './ocr-parser.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml, formatDate, validarDatosEsenciales, mostrarAlertaDatosFaltantes, inputFechaHTML, initInputFecha, getValorFecha, parseFechaLocal, dateToISO, hoyISO } from './utils.js';

// ==================== RENDER PRINCIPAL ====================
export function renderVentas() {
    const db = getDB();
    const meses = [...new Set(db.ventas.map(v => v.mes))].sort().reverse();
    const mesSeleccionado = localStorage.getItem('ventasMesFiltro') || meses[0] || new Date().toISOString().substring(0, 7);
    const estadoSeleccionado = localStorage.getItem('ventasEstadoFiltro') || 'todos';

    let ventasFiltradas = db.ventas.filter(v => v.mes === mesSeleccionado);
    // Aplicar filtro de estado
    if (estadoSeleccionado === 'pendientes') {
        ventasFiltradas = ventasFiltradas.filter(v => v.estado === 'pendiente_factura' || v.estado === 'pendiente_cobro');
    } else if (estadoSeleccionado === 'cobrados') {
        ventasFiltradas = ventasFiltradas.filter(v => v.estado === 'cobrado');
    }

    const totalMes = ventasFiltradas.reduce((s, v) => s + v.total, 0);
    const cobradoMes = ventasFiltradas.filter(v => v.estado === 'cobrado').reduce((s, v) => s + v.total, 0);
    const pendienteMes = totalMes - cobradoMes;

    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">💰 Ventas</h1>
                <div class="flex gap-2">
                    <button onclick="window.mostrarModalNuevaVenta()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                        <span>➕</span> Nueva Venta
                    </button>
                    <button onclick="window.mostrarModalNuevaVentaDirecta()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                        <span>📝</span> Venta Directa
                    </button>
                </div>
            </div>

            <!-- FILTROS -->
            <div class="flex flex-wrap gap-3 items-center bg-white dark:bg-gray-800 p-3 rounded-xl shadow">
                <label class="text-sm font-medium">📅 Mes:</label>
                <select id="mesSelectVentas" class="flex-1 p-2 border rounded-lg bg-white dark:bg-gray-900 min-w-[100px]" onchange="window.filtrarVentas()">
                    ${meses.map(m => `<option value="${m}" ${m === mesSeleccionado ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <label class="text-sm font-medium ml-2">📌 Estado:</label>
                <select id="estadoSelectVentas" class="p-2 border rounded-lg bg-white dark:bg-gray-900" onchange="window.filtrarVentas()">
                    <option value="todos" ${estadoSeleccionado === 'todos' ? 'selected' : ''}>Todos</option>
                    <option value="pendientes" ${estadoSeleccionado === 'pendientes' ? 'selected' : ''}>⏳ Pendientes</option>
                    <option value="cobrados" ${estadoSeleccionado === 'cobrados' ? 'selected' : ''}>✅ Cobrados</option>
                </select>
                <div class="flex gap-4 text-sm ml-auto">
                    <span class="text-green-600 font-bold">✅ Cobrado: $${formatNumber(cobradoMes)}</span>
                    <span class="text-yellow-600 font-bold">⏳ Pendiente: $${formatNumber(pendienteMes)}</span>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">💰 Total ${mesSeleccionado}</p>
                    <p class="text-xl font-bold text-blue-600">$${formatNumber(totalMes)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">📊 Cobrado</p>
                    <p class="text-xl font-bold text-green-600">$${formatNumber(cobradoMes)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">⏳ Pendiente</p>
                    <p class="text-xl font-bold text-yellow-600">$${formatNumber(pendienteMes)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">📋 Ventas</p>
                    <p class="text-xl font-bold text-purple-600">${ventasFiltradas.length}</p>
                </div>
            </div>

            <div class="space-y-3">
                ${(() => {
                    // 🔥 v7.22.27: sectorizar ventas por estado
                    const grupos = {
                        'cobrado': { titulo: '✅ Cobradas', items: [] },
                        'pendiente_cobro': { titulo: '💰 Pendientes de cobro (factura emitida)', items: [] },
                        'pendiente_factura': { titulo: '📄 Pendientes de factura', items: [] }
                    };
                    
                    ventasFiltradas.forEach(v => {
                        const estado = v.estado || 'pendiente_factura';
                        if (grupos[estado]) {
                            grupos[estado].items.push(v);
                        } else {
                            grupos['pendiente_factura'].items.push(v);
                        }
                    });
                    
                    let html = '';
                    Object.values(grupos).forEach(grupo => {
                        if (grupo.items.length === 0) return;
                        html += `
                            <div class="flex items-center gap-3 my-4">
                                <div class="h-px flex-1 bg-gray-300 dark:bg-gray-600"></div>
                                <span class="text-sm font-bold text-gray-600 dark:text-gray-400">${grupo.titulo} (${grupo.items.length})</span>
                                <div class="h-px flex-1 bg-gray-300 dark:bg-gray-600"></div>
                            </div>
                        `;
                        html += grupo.items.map(v => renderVentaCard(v, db)).join('');
                    });
                    
                    if (html === '') {
                        return '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">📭 No hay ventas en este mes</p></div>';
                    }
                    return html;
                })()}
            </div>
        </div>
    `;
}

function renderVentaCard(v, db) {
    const estadoMap = {
        'pendiente_factura': { label: '📄 Pendiente Factura', color: 'bg-purple-100 text-purple-700' },
        'pendiente_cobro': { label: '⏳ Pendiente de Cobro', color: 'bg-yellow-100 text-yellow-700' },
        'cobrado': { label: '💰 Cobrado', color: 'bg-green-100 text-green-700' }
    };
    const estado = estadoMap[v.estado] || estadoMap['pendiente_factura'];

    let diasPendiente = null;
    let alerta = '';
    let diasRestantes = null;
    
    if (v.estado !== 'cobrado' && v.fechaVenta) {
        // 🔥 v7.22.47: contador "Día N" desde fechaVenta
        const [a, m, d] = v.fechaVenta.split('-').map(Number);
        const fechaVentaLocal = new Date(a, m - 1, d);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        fechaVentaLocal.setHours(0, 0, 0, 0);
        diasPendiente = Math.floor((hoy - fechaVentaLocal) / (1000 * 60 * 60 * 24)) + 1;
        
        // 🔥 Alerta de vencimiento (solo si fechaCobroEsperada existe y ya pasó)
        if (v.fechaCobroEsperada) {
            const [ae, me, de] = v.fechaCobroEsperada.split('-').map(Number);
            const fechaCobroLocal = new Date(ae, me - 1, de);
            fechaCobroLocal.setHours(0, 0, 0, 0);
            diasRestantes = Math.floor((fechaCobroLocal - hoy) / (1000 * 60 * 60 * 24));
            
            if (diasRestantes < 0) {
                alerta = `🔴 Vencido hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) !== 1 ? 's' : ''}`;
            }
        }
    } else if (v.estado === 'cobrado' && v.diasDemoraCobro !== undefined) {
        // Mostrar cuántos días tardó el cobro
        alerta = `✅ Cobrado en ${v.diasDemoraCobro} día${v.diasDemoraCobro !== 1 ? 's' : ''}`;
    }

    const ocText = v.ordenCompraCliente ? `OC: ${escapeHtml(v.ordenCompraCliente)}` : '';
    const facturaEmitida = v.numFacturaEmitida ? `Factura: ${escapeHtml(v.numFacturaEmitida)}` : 'Sin factura';

    return `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all border-l-4 ${v.estado === 'cobrado' ? 'border-green-500' : v.estado === 'pendiente_cobro' ? 'border-yellow-500' : 'border-purple-500'}">
            <div class="flex justify-between items-start flex-wrap gap-2">
                <div class="flex-1 min-w-[200px] cursor-pointer" onclick="window.verDetalleVenta('${v.id}')">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-bold text-lg">${escapeHtml(v.clienteNombre)}</h3>
                        <span class="text-xs px-3 py-1 rounded-full ${estado.color}">${estado.label}</span>
                        ${v.presupuestoId ? `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">📄 P-${v.presupuestoId}</span>` : ''}
                        ${v.patente ? `<span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">🚗 ${escapeHtml(v.patente)}</span>` : ''}
                        ${v.esVentaAgrupada ? `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold">📦 Venta agrupada (${(v.presupuestosOrigenNumeros || []).length})</span>` : ''}
                        ${v.ajusteRedondeo && Math.abs(v.ajusteRedondeo) > 0.001 ? `<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold" title="Ajuste por redondeo OC vs presupuestos">⚖️ Ajuste: ${v.ajusteRedondeo > 0 ? '+' : ''}$${formatNumber(Math.abs(v.ajusteRedondeo))}</span>` : ''}
                        ${ocText ? `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">📋 ${ocText}</span>` : ''}
                        ${diasPendiente !== null ? `<span class="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">📅 Día ${diasPendiente}</span>` : ''}
                        ${alerta ? `<span class="text-xs font-bold ${alerta.includes('Vencido') ? 'text-red-600' : 'text-green-600'}">${alerta}</span>` : ''}
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                        <div><span class="text-gray-500">Factura:</span> <span class="font-semibold">${escapeHtml(v.tipoComprobante || '')} ${escapeHtml(v.numFacturaEmitida || v.numComprobante || '')}</span></div>
                        <div><span class="text-gray-500">Total:</span> <span class="font-semibold text-green-600">$${formatNumber(v.total)}</span></div>
                        <div><span class="text-gray-500">Fecha:</span> ${v.fechaVenta ? formatDate(v.fechaVenta) : ''}</div>
                        <div><span class="text-gray-500">Cobro esperado:</span> ${v.fechaCobroEsperada ? formatDate(v.fechaCobroEsperada) : ''}</div>
                    </div>
                    ${v.numFacturaEmitida ? `<div class="text-xs text-blue-600 mt-1">✅ Factura emitida: ${escapeHtml(v.numFacturaEmitida)}</div>` : ''}
                    ${v.medioPago ? `<div class="text-xs text-gray-500 mt-1">💳 ${escapeHtml(v.medioPago)}${v.comisionTarjeta ? ` (comisión: ${v.comisionTarjeta}%)` : ''}</div>` : ''}
                    ${v.interesMora ? `<div class="text-xs text-red-500 mt-1">⚠️ Interés por mora: $${formatNumber(v.interesMora)}</div>` : ''}
                    ${v.presupuestoMoraGenerado ? `<div class="text-xs text-orange-600 mt-1">📄 Presupuesto de mora generado: P-${v.presupuestoMoraGenerado}</div>` : ''}
                    ${v.ocArchivoUrl ? `<div class="mt-1"><a href="${v.ocArchivoUrl}" target="_blank" class="text-xs text-blue-600 underline">📎 Ver OC</a></div>` : ''}
                    ${v.facturaEmitidaUrl ? `<div class="mt-1"><button onclick="event.stopPropagation();window.verArchivo('${v.id}', 'facturaEmitidaUrl')" class="text-xs text-blue-600 underline">📎 Ver factura</button></div>` : ''}
                    ${v.comprobanteCobroUrl ? `<div class="mt-1"><button onclick="event.stopPropagation();window.verArchivo('${v.id}', 'comprobanteCobroUrl')" class="text-xs text-blue-600 underline">📎 Ver comprobante</button></div>` : ''}
                    <button onclick="event.stopPropagation();window.verTrazabilidad('venta','${v.id}')" class="text-xs text-purple-600 hover:underline mt-1 block">🔗 Ver trazabilidad</button>
                </div>
                <div class="flex flex-col gap-2">
                    ${v.estado === 'pendiente_factura' ? 
                        `<button onclick="window.mostrarModalCargarFactura('${v.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm shadow-md">📄 Cargar Factura</button>` : ''}
                    ${v.estado === 'pendiente_cobro' ? 
                        `<button onclick="window.mostrarModalCobrarVenta('${v.id}')" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm shadow-md">💵 Cobrar</button>` : ''}
                    ${v.estado === 'cobrado' && v.interesMora && !v.presupuestoMoraGenerado ? 
                        `<button onclick="window.generarPresupuestoMora('${v.id}')" class="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm shadow-md">📄 Generar Presupuesto Mora</button>` : ''}
                    <button onclick="window.editarVenta('${v.id}')" class="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1 rounded-xl text-sm">✏️ Editar</button>
                    ${v.interesMora || v.presupuestoMoraGenerado ? `<button onclick="window.quitarInteresMora('${v.id}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️ Quitar mora</button>` : ''}
                    ${v.estado !== 'cobrado' ? 
                        `<button onclick="window.eliminarVenta('${v.id}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️</button>` : ''}
                </div>
            </div>
            ${v.observaciones ? `<div class="text-xs text-gray-500 mt-2 border-t pt-2">📝 ${escapeHtml(v.observaciones)}</div>` : ''}
        </div>
    `;
}

function calcularDiasRestantes(fechaISO) {
    if (!fechaISO) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaISO);
    fecha.setHours(0, 0, 0, 0);
    return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}

// ==================== VER DETALLE VENTA ====================
window.verDetalleVenta = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const presupuesto = venta.presupuestoId ? db.presupuestos.find(p => p.id === venta.presupuestoId) : null;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">📄 Detalle de Venta</h2>
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-2 text-sm">
                <div class="grid grid-cols-2 gap-2 border-b dark:border-gray-700 pb-2">
                    <div><span class="text-gray-500">Cliente:</span> <span class="font-semibold">${escapeHtml(venta.clienteNombre)}</span></div>
                    <div><span class="text-gray-500">Estado:</span> <span class="font-bold ${venta.estado === 'cobrado' ? 'text-green-600' : venta.estado === 'pendiente_cobro' ? 'text-yellow-600' : 'text-purple-600'}">${venta.estado === 'cobrado' ? '💰 Cobrado' : venta.estado === 'pendiente_cobro' ? '⏳ Pendiente de Cobro' : '📄 Pendiente Factura'}</span></div>
                </div>
                <div class="grid grid-cols-2 gap-2 border-b dark:border-gray-700 pb-2">
                    <div><span class="text-gray-500">Tipo:</span> ${escapeHtml(venta.tipoComprobante || 'N/A')}</div>
                    <div><span class="text-gray-500">Nº Factura:</span> <span class="font-semibold">${escapeHtml(venta.numFacturaEmitida || venta.numComprobante || 'Sin número')}</span></div>
                    <div><span class="text-gray-500">Fecha factura:</span> ${venta.fechaFactura ? formatDate(venta.fechaFactura) : 'No emitida'}</div>
                    <div><span class="text-gray-500">Fecha venta:</span> ${venta.fechaVenta ? formatDate(venta.fechaVenta) : '-'}</div>
                    ${venta.esVentaAgrupada ? `
                        <div class="col-span-2 mt-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded">
                            <p class="text-xs font-bold text-indigo-800 dark:text-indigo-200">📦 Venta agrupada (${(venta.presupuestosOrigenNumeros || []).length} presupuestos)</p>
                            <p class="text-xs text-indigo-600 dark:text-indigo-300">${(venta.presupuestosOrigenNumeros || []).join(', ')}</p>
                            ${venta.totalPresupuestos ? `
                                <div class="mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-700 text-xs">
                                    <div class="flex justify-between"><span>Suma de presupuestos:</span><span>$${formatNumber(venta.totalPresupuestos)}</span></div>
                                    <div class="flex justify-between"><span>Total OC del cliente:</span><span>$${formatNumber(venta.ocClienteTotal || venta.total)}</span></div>
                                    ${venta.ajusteRedondeo && Math.abs(venta.ajusteRedondeo) > 0.001 ? `
                                        <div class="flex justify-between font-bold ${venta.ajusteRedondeo > 0 ? 'text-green-600' : 'text-orange-600'}">
                                            <span>Ajuste por redondeo:</span>
                                            <span>${venta.ajusteRedondeo > 0 ? '+' : ''}$${formatNumber(venta.ajusteRedondeo)}</span>
                                        </div>
                                    ` : '<div class="text-green-600 font-bold">✅ Sin diferencia</div>'}
                                </div>
                            ` : ''}
                            <div class="mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-700 flex gap-2 flex-wrap">
                                <button onclick="window.editarOCVentaAgrupada('${venta.id}')" class="bg-blue-600 text-white px-2 py-1 rounded text-xs">
                                    ${venta.ocArchivoUrl ? '✏️ Editar OC' : '📎 Cargar OC'}
                                </button>
                                <button onclick="window.editarPresupuestosVentaAgrupada('${venta.id}')" class="bg-indigo-600 text-white px-2 py-1 rounded text-xs">
                                    ✏️ Editar presupuestos
                                </button>
                                <button onclick="window.generarOCAlTaller('${venta.id}')" class="bg-teal-600 text-white px-2 py-1 rounded text-xs">
                                    📄 Generar OC al Taller
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="grid grid-cols-2 gap-2 border-b dark:border-gray-700 pb-2">
                    <div class="col-span-2"><span class="text-gray-500">OC Cliente:</span> <span class="font-semibold">${escapeHtml(venta.ordenCompraCliente || 'Sin OC')}</span></div>
                    ${venta.patente ? `<div class="col-span-2"><span class="text-gray-500">Vehículo:</span> <span class="font-semibold">${escapeHtml(venta.vehiculoMarca || '')} ${venta.patente ? `(${escapeHtml(venta.patente)})` : ''}</span></div>` : ''}
                    ${venta.fechaRecepcionOC ? `<div><span class="text-gray-500">Fecha recepción OC:</span> ${formatDate(venta.fechaRecepcionOC)}</div>` : ''}
                    ${venta.ocArchivoUrl ? `<div class="col-span-2"><a href="${venta.ocArchivoUrl}" target="_blank" class="text-blue-600 underline">📎 Ver OC adjunta (cliente)</a></div>` : ''}
                    ${venta.ocTallerUrl ? `<div class="col-span-2 flex items-center gap-2">
                        <a href="${venta.ocTallerUrl}" target="_blank" class="text-teal-600 underline font-bold">📎 Ver OC al Taller</a>
                        <button onclick="event.stopPropagation();window.eliminarOCTaller('${venta.id}')" class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs hover:bg-red-200">🗑️</button>
                    </div>` : ''}
                </div>
                <div class="grid grid-cols-2 gap-2 border-b dark:border-gray-700 pb-2">
                    <div><span class="text-gray-500">Monto Neto (sin IVA):</span> <span class="font-bold">$${formatNumber(venta.montoNeto)}</span></div>
                    <div><span class="text-gray-500">IVA (${venta.iva || 0}%):</span> <span class="font-bold text-orange-600">$${formatNumber(venta.ivaMonto)}</span></div>
                    <div class="col-span-2"><span class="text-gray-500">Total:</span> <span class="font-bold text-green-600 text-lg">$${formatNumber(venta.total)}</span></div>
                </div>
                <div class="grid grid-cols-2 gap-2 border-b dark:border-gray-700 pb-2">
                    <div><span class="text-gray-500">Cobro esperado:</span> ${venta.fechaCobroEsperada ? formatDate(venta.fechaCobroEsperada) : '-'}</div>
                    ${venta.fechaCobro ? `<div><span class="text-gray-500">Fecha de cobro:</span> ${formatDate(venta.fechaCobro)}</div>` : ''}
                    ${venta.diasDemoraCobro !== undefined && venta.diasDemoraCobro !== null ? `<div><span class="text-gray-500">Demora de cobro:</span> <strong class="${venta.diasDemoraCobro > 30 ? 'text-red-600' : 'text-green-600'}">${venta.diasDemoraCobro} día${venta.diasDemoraCobro !== 1 ? 's' : ''}</strong></div>` : ''}
                    ${venta.medioPago ? `<div><span class="text-gray-500">Medio de pago:</span> ${escapeHtml(venta.medioPago)}</div>` : ''}
                    ${venta.comprobanteCobro ? `<div><span class="text-gray-500">Comprobante:</span> ${escapeHtml(venta.comprobanteCobro)}</div>` : ''}
                    ${venta.comprobanteCobroUrl ? `<div class="col-span-2"><a href="${venta.comprobanteCobroUrl}" target="_blank" class="text-blue-600 underline">📎 Ver comprobante de pago</a></div>` : ''}
                    ${venta.comisionTarjeta ? `<div><span class="text-gray-500">Comisión tarjeta:</span> ${venta.comisionTarjeta}%</div>` : ''}
                    ${venta.interesMora ? `<div><span class="text-gray-500">Interés por mora:</span> <span class="text-red-600">$${formatNumber(venta.interesMora)}</span></div>` : ''}
                </div>
                ${presupuesto ? `
                    <div class="border-b dark:border-gray-700 pb-2">
                        <div><span class="text-gray-500">Presupuesto asociado:</span> <span class="font-semibold">${presupuesto.numero}</span></div>
                        <div class="text-xs text-gray-400">${formatDate(presupuesto.fechaCreacion)} - $${formatNumber(presupuesto.total)}</div>
                    </div>
                ` : ''}
                ${venta.facturaEmitidaUrl ? `
                    <div class="border-b dark:border-gray-700 pb-2">
                        <a href="${venta.facturaEmitidaUrl}" target="_blank" class="text-blue-600 underline text-sm">📎 Ver factura emitida</a>
                    </div>
                ` : ''}
                ${(() => {
                    // 🔥 v7.24.6: Unificar compras vinculadas (por venta y por ítems) sin duplicar
                    const comprasSet = new Set();
                    const comprasUnicas = [];
                    
                    // 1. Compras vinculadas directamente a la venta
                    (venta.comprasVinculadas || []).forEach(cv => {
                        const compra = db.compras?.find(c => String(c.id) === String(cv.compraId));
                        if (compra && !comprasSet.has(String(compra.id))) {
                            comprasSet.add(String(compra.id));
                            comprasUnicas.push(compra);
                        }
                    });
                    
                    // 2. Compras vinculadas a través de los ítems de los presupuestos
                    const presupuestosIds = venta.presupuestosOrigenIds || [venta.presupuestoId].filter(Boolean);
                    presupuestosIds.forEach(pid => {
                        const p = db.presupuestos?.find(x => String(x.id) === String(pid));
                        if (p && p.items) {
                            p.items.forEach(item => {
                                if (item.compraVinculadaId) {
                                    const compra = db.compras?.find(c => String(c.id) === String(item.compraVinculadaId));
                                    if (compra && !comprasSet.has(String(compra.id))) {
                                        comprasSet.add(String(compra.id));
                                        comprasUnicas.push(compra);
                                    }
                                }
                            });
                        }
                    });
                    
                    if (comprasUnicas.length === 0) return '';
                    
                    return `
                        <div class="border-b dark:border-gray-700 pb-2">
                            <p class="text-sm font-bold mb-1">🔗 Compras vinculadas:</p>
                            ${comprasUnicas.map(compra => `
                                <div class="flex justify-between items-center text-xs p-1 bg-gray-100 dark:bg-gray-700 rounded mb-1">
                                    <span>${escapeHtml(compra.proveedorNombre || compra.concepto || 'Compra')} - $${formatNumber(compra.totalFactura || 0)}</span>
                                    <button onclick="event.stopPropagation(); window.verDetalleCompra('${compra.id}')" class="text-blue-600 underline">👁️ Ver</button>
                                </div>
                            `).join('')}
                        </div>
                    `;
                })()}

                ${venta.observaciones ? `
                    <div class="pt-1">
                        <span class="text-gray-500">Observaciones:</span>
                        <p class="text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded mt-1">${escapeHtml(venta.observaciones)}</p>
                    </div>
                ` : ''}
            </div>
            <div class="flex gap-3 mt-4 flex-wrap">
                ${venta.estado === 'pendiente_cobro' ? `<button onclick="this.closest('.modal').remove(); window.mostrarModalCobrarVenta('${venta.id}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl">💵 Confirmar Pago</button>` : ''}
                <button onclick="window.verTrazabilidad('venta','${venta.id}')" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl">🔗 Ver trazabilidad</button>
                <button onclick="this.closest('.modal').remove()" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 py-2 rounded-xl">Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// ==================== FILTRAR ====================
window.filtrarVentas = () => {
    const mes = document.getElementById('mesSelectVentas');
    const estado = document.getElementById('estadoSelectVentas');
    if (mes) localStorage.setItem('ventasMesFiltro', mes.value);
    if (estado) localStorage.setItem('ventasEstadoFiltro', estado.value);
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== FUNCIÓN GLOBAL PARA INPUTS FILE ====================
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

// ==================== MODAL CARGAR FACTURA ====================
window.mostrarModalCargarFactura = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { 
        mostrarNotificacion('Venta no encontrada', 'error'); 
        return; 
    }

    const hoyISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    const hoyFormateada = formatDate(new Date());

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">📄 Cargar Factura</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(venta.clienteNombre)}</p>
                    <p><strong>OC:</strong> ${escapeHtml(venta.ordenCompraCliente || 'N/A')}</p>
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-medium">🧾 Número de Factura *</label>
                    <input type="text" id="numFacturaEmitida" class="w-full p-3 border rounded-xl" placeholder="Ej: 0001-00123456" required>

                    <label class="block text-sm font-medium">📅 Fecha de Factura</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="fechaFacturaText" class="flex-1 p-3 border rounded-xl" placeholder="DD/MM/AAAA" value="${hoyFormateada}">
                        <input type="date" id="fechaFacturaHidden" class="hidden" value="${hoyISO}">
                        <button type="button" id="btnCalendarioFactura" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                    </div>

                    <label class="block text-sm font-medium">📎 Adjuntar Factura (PDF/Imagen)</label>
                    <div class="flex items-center gap-2">
                        <label class="cursor-pointer bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                            Seleccionar archivo
                            <input type="file" id="facturaFile" accept=".pdf,image/*" class="hidden" onchange="window._onFacturaFileChange(this)">
                        </label>
                        <span id="nombreFacturaFile" class="text-sm text-gray-500">Ningún archivo seleccionado</span>
                    </div>
                    <div id="previewFacturaContainer" class="hidden mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <div class="flex items-center justify-between">
                            <span id="previewFacturaNombre" class="text-xs font-bold truncate"></span>
                            <div class="flex gap-1">
                                <button type="button" id="btnVerFactura" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">👁️ Ver</button>
                                <button type="button" id="btnQuitarFactura" class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">🗑️ Quitar</button>
                            </div>
                        </div>
                    </div>

                    <hr class="border-gray-200 dark:border-gray-700">

                    <div>
                        <label class="flex items-center gap-2 text-sm font-medium">
                            <input type="checkbox" id="cobradoDirecto" onchange="window.toggleCobradoDirecto()">
                            <span>✅ Ya está cobrada</span>
                        </label>
                    </div>

                    <div id="campoCobroDirecto" class="hidden space-y-3 border-t pt-3 mt-1 border-gray-200 dark:border-gray-700">
                        <label class="block text-sm font-medium">📅 Fecha de cobro</label>
                        <div class="flex items-center gap-2">
                            <input type="text" id="fechaCobroText" class="flex-1 p-3 border rounded-xl" placeholder="DD/MM/AAAA" value="${hoyFormateada}">
                            <input type="date" id="fechaCobroHidden" class="hidden" value="${hoyISO}">
                            <button type="button" id="btnCalendarioCobro" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                        </div>

                        <label class="block text-sm font-medium">💳 Método de pago</label>
                        <select id="metodoPagoDirecto" class="w-full p-3 border rounded-xl">
                            <option value="Efectivo">💵 Efectivo</option>
                            <option value="Transferencia">🏦 Transferencia</option>
                            <option value="Tarjeta Débito">💳 Tarjeta Débito</option>
                            <option value="Tarjeta Crédito">💳 Tarjeta Crédito</option>
                            <option value="Cheque">📄 Cheque</option>
                            <option value="Otro">🔄 Otro</option>
                        </select>

                        <label class="block text-sm font-medium">📄 Nº de comprobante (opcional)</label>
                        <input type="text" id="comprobanteDirecto" class="w-full p-3 border rounded-xl" placeholder="Nº de transferencia / cheque / etc">
                    </div>

                    <div id="campoDiasCobro" class="space-y-1">
                        <label class="block text-sm font-medium">💳 Días de cobro (según cliente)</label>
                        <input type="number" id="diasCobroFactura" class="w-full p-3 border rounded-xl" value="${venta.diasCobroCliente || 0}" min="0">
                        <p class="text-xs text-gray-400">Si es 0, no se calcula fecha de cobro automática.</p>
                    </div>
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="guardarFacturaBtn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl">✅ Guardar Factura</button>
                    <button id="cancelarFacturaBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    // Calendario factura
    const fechaFacturaText = document.getElementById('fechaFacturaText');
    const fechaFacturaHidden = document.getElementById('fechaFacturaHidden');
    const btnCalFactura = document.getElementById('btnCalendarioFactura');

    function actualizarFechaFactura() {
        if (fechaFacturaHidden.value) {
            const dateObj = new Date(fechaFacturaHidden.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaFacturaText.value = formatDate(dateObj);
            }
        } else {
            fechaFacturaText.value = '';
        }
    }

    btnCalFactura.addEventListener('click', function() {
        fechaFacturaHidden.showPicker ? fechaFacturaHidden.showPicker() : fechaFacturaHidden.click();
    });

    fechaFacturaHidden.addEventListener('change', actualizarFechaFactura);

    fechaFacturaText.addEventListener('blur', function() {
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
                        fechaFacturaHidden.value = iso;
                        actualizarFechaFactura();
                        return;
                    }
                }
            }
            actualizarFechaFactura();
            mostrarNotificacion('Formato inválido. Usá DD/MM/AAAA', 'warning');
        } else {
            fechaFacturaHidden.value = '';
            actualizarFechaFactura();
        }
    });

    actualizarFechaFactura();

    // Calendario cobro
    const fechaCobroText = document.getElementById('fechaCobroText');
    const fechaCobroHidden = document.getElementById('fechaCobroHidden');
    const btnCalCobro = document.getElementById('btnCalendarioCobro');

    function actualizarFechaCobro() {
        if (fechaCobroHidden.value) {
            const dateObj = new Date(fechaCobroHidden.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                fechaCobroText.value = formatDate(dateObj);
            }
        } else {
            fechaCobroText.value = '';
        }
    }

    if (btnCalCobro) {
        btnCalCobro.addEventListener('click', function() {
            fechaCobroHidden.showPicker ? fechaCobroHidden.showPicker() : fechaCobroHidden.click();
        });

        fechaCobroHidden.addEventListener('change', actualizarFechaCobro);

        fechaCobroText.addEventListener('blur', function() {
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
                            fechaCobroHidden.value = iso;
                            actualizarFechaCobro();
                            return;
                        }
                    }
                }
                actualizarFechaCobro();
                mostrarNotificacion('Formato inválido. Usá DD/MM/AAAA', 'warning');
            } else {
                fechaCobroHidden.value = '';
                actualizarFechaCobro();
            }
        });

        actualizarFechaCobro();
    }

    // Toggle cobrado directo
    window.toggleCobradoDirecto = () => {
        const checked = document.getElementById('cobradoDirecto').checked;
        const campoCobro = document.getElementById('campoCobroDirecto');
        const campoDias = document.getElementById('campoDiasCobro');
        if (checked) {
            campoCobro.classList.remove('hidden');
            campoDias.classList.add('hidden');
        } else {
            campoCobro.classList.add('hidden');
            campoDias.classList.remove('hidden');
        }
    };

    document.getElementById('guardarFacturaBtn').onclick = () => {
        const numFactura = document.getElementById('numFacturaEmitida').value.trim();
        if (!numFactura) { mostrarNotificacion('Número de factura obligatorio', 'error'); return; }

        const fechaFactura = document.getElementById('fechaFacturaHidden').value;
        const file = document.getElementById('facturaFile').files[0];
        const cobradoDirecto = document.getElementById('cobradoDirecto').checked;

        venta.numFacturaEmitida = numFactura;
        venta.fechaFactura = fechaFactura;

        if (cobradoDirecto) {
            const fechaCobro = document.getElementById('fechaCobroHidden').value;
            const metodoPago = document.getElementById('metodoPagoDirecto').value;
            const comprobante = document.getElementById('comprobanteDirecto').value.trim();

            if (!fechaCobro) {
                mostrarNotificacion('Seleccione fecha de cobro', 'error');
                return;
            }

            venta.estado = 'cobrado';
            venta.fechaCobro = fechaCobro;
            venta.medioPago = metodoPago;
            venta.comprobanteCobro = comprobante || null;
            venta.fechaCobroEsperada = fechaCobro;
            venta.diasCobroCliente = 0;
            // 🔥 v7.22.47: calcular días de demora del cobro
            if (venta.fechaVenta && fechaCobro) {
                const [af, mf, df] = venta.fechaVenta.split('-').map(Number);
                const [ac, mc, dc] = fechaCobro.split('-').map(Number);
                const fechaV = new Date(af, mf - 1, df);
                const fechaC = new Date(ac, mc - 1, dc);
                venta.diasDemoraCobro = Math.floor((fechaC - fechaV) / (1000 * 60 * 60 * 24));
            }
        } else {
            const diasCobro = parseInt(document.getElementById('diasCobroFactura').value) || 0;
            venta.diasCobroCliente = diasCobro;

            let fechaCobro = null;
            if (diasCobro > 0 && fechaFactura) {
                // 🔥 v7.16.81: parsear como LOCAL (evita bug UTC-3)
                const fecha = parseFechaLocal(fechaFactura);
                fecha.setDate(fecha.getDate() + diasCobro);
                fechaCobro = dateToISO(fecha);
            }
            venta.fechaCobroEsperada = fechaCobro || venta.fechaCobroEsperada || null;
            venta.estado = fechaCobro ? 'pendiente_cobro' : 'pendiente_factura';
        }

        const guardar = async () => {
            if (file) {
                try {
                    // 🔥 v7.16.83: subir a Storage (NO base64)
                    const fileComprimido = await comprimirImagen(file);
                    const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
                    const empresaId = getEmpresaActual() || 'empresa_principal';
                    const ruta = `${empresaId}/ventas/${venta.id}_factura.${ext}`;
                    venta.facturaEmitidaUrl = await subirArchivo(ruta, fileComprimido);
                    venta.facturaEmitidaNombre = fileComprimido.name;
                    console.log('✅ Factura subida a Storage:', venta.facturaEmitidaUrl.substring(0, 80) + '...');
                } catch (e) {
                    console.error('❌ Error subiendo factura:', e);
                    mostrarNotificacion('Error subiendo factura: ' + e.message, 'error');
                }
            }
            
            // 🔥 v7.22.96: Calcular monto neto e IVA al guardar la factura
            const total = venta.total || 0;
            venta.montoNeto = +(total / 1.21).toFixed(2);
            venta.ivaMonto = +(total - venta.montoNeto).toFixed(2);
            venta.iva = 21;
            
            // 🔥 Asegurar que el estado se guarde correctamente
            // Si ya tiene factura cargada y no está cobrado, pasar a pendiente_cobro
            if (venta.numFacturaEmitida && venta.facturaEmitidaUrl && venta.estado !== 'cobrado') {
                venta.estado = 'pendiente_cobro';
            }
            
            console.log('💾 Guardando factura:');
            console.log('   Estado:', venta.estado);
            console.log('   Monto Neto:', venta.montoNeto);
            console.log('   IVA:', venta.ivaMonto);
            
            guardarDB();
            mostrarNotificacion('✅ Factura cargada exitosamente', 'success');
            window.dispatchEvent(new Event('refreshView'));
        };

        guardar();
    };

    document.getElementById('cancelarFacturaBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== MODAL COBRAR VENTA ====================
window.mostrarModalCobrarVenta = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) {
        mostrarNotificacion('Venta no encontrada', 'error');
        return;
    }

    const vencido = venta.fechaCobroEsperada && calcularDiasRestantes(venta.fechaCobroEsperada) < 0;
    const montoTotal = venta.total || 0;

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">💰 Cobrar Venta</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(venta.clienteNombre)}</p>
                    <p><strong>Factura:</strong> ${escapeHtml(venta.tipoComprobante || '')} ${escapeHtml(venta.numFacturaEmitida || venta.numComprobante || '')}</p>
                    <p><strong>Monto:</strong> <span class="font-bold text-green-600">$${formatNumber(montoTotal)}</span></p>
                    ${venta.fechaCobroEsperada ? `<p><strong>Vencimiento:</strong> ${formatDate(venta.fechaCobroEsperada)} ${vencido ? '🔴 (VENCIDO)' : ''}</p>` : ''}
                    ${venta.ordenCompraCliente ? `<p><strong>OC Cliente:</strong> ${escapeHtml(venta.ordenCompraCliente)}</p>` : ''}
                </div>

                ${vencido ? `
                    <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-3">
                        <p class="text-sm text-red-700 dark:text-red-300">⚠️ Esta venta está vencida.</p>
                        <label class="flex items-center gap-2 mt-2 text-sm">
                            <input type="checkbox" id="aplicarInteres"> Aplicar interés por mora (${db.configuracion?.porcentajeRecargoMora || 5}%)
                        </label>
                        <p class="text-xs text-gray-500 mt-1">El interés se calculará sobre el monto total y se generará automáticamente un presupuesto de mora.</p>
                    </div>
                ` : ''}

                <div class="space-y-3">
                    ${inputFechaHTML('fechaCobro', venta.fechaVenta || venta.fechaCobroEsperada || hoyISO(), { label: '📅 Fecha de cobro' })}

                    <label class="block text-sm font-medium">💳 Medio de pago</label>
                    <select id="medioPago" class="w-full p-3 border rounded-xl">
                        <option value="efectivo">💵 Efectivo</option>
                        <option value="transferencia" selected>🏦 Transferencia (default)</option>
                        <option value="tarjeta_debito">💳 Tarjeta Débito</option>
                        <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
                        <option value="cheque">📄 Cheque</option>
                        <option value="otro">🔄 Otro</option>
                    </select>

                    <div id="comisionContainer" class="hidden">
                        <label class="block text-sm font-medium">📊 Comisión bancaria (%)</label>
                        <input type="number" id="comisionTarjeta" class="w-full p-3 border rounded-xl" value="${db.configuracion?.comisionTarjetaDefault || 3}" step="0.1">
                    </div>

                    <label class="block text-sm font-medium">📄 Nº de comprobante</label>
                    <input type="text" id="comprobante" placeholder="Nº de transferencia / cheque" class="w-full p-3 border rounded-xl">

                    <div class="border-t pt-3">
                        <label class="block text-sm font-medium mb-1">💳 Comprobante de pago (opcional)</label>
                        <p class="text-xs text-gray-500 mb-2">Subí acá la transferencia, cheque o ticket que te dio el cliente.</p>
                        <div class="flex items-center gap-2">
                            <label class="cursor-pointer bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                                📎 Seleccionar comprobante
                                <input type="file" id="comprobanteFile" accept="image/*,.pdf" class="hidden" onchange="window._onComprobanteFileChange(this)">
                            </label>
                            <span id="nombreComprobanteFile" class="text-sm text-gray-500">Ningún archivo seleccionado</span>
                        </div>
                        <div id="previewComprobanteContainer" class="hidden mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <div class="flex items-center justify-between">
                                <span id="previewComprobanteNombre" class="text-xs font-bold truncate"></span>
                                <div class="flex gap-1">
                                    <button type="button" id="btnVerComprobante" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">👁️ Ver</button>
                                    <button type="button" id="btnQuitarComprobante" class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">🗑️ Quitar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="resumenCobro" class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm">
                    <p><strong>Total a cobrar:</strong> <span id="montoACobrar" class="font-bold text-green-600">$${formatNumber(montoTotal)}</span></p>
                    <div id="descuentoComision" class="hidden text-red-600"></div>
                    <div id="interesAplicado" class="hidden text-orange-600"></div>
                    <p><strong>Neto a recibir:</strong> <span id="netoRecibir" class="font-bold text-blue-600">$${formatNumber(montoTotal)}</span></p>
                    <div id="moraGenerada" class="hidden text-purple-600 font-bold"></div>
                </div>

                <div class="flex gap-3 mt-5">
                    <button id="confirmarCobroBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Registrar Cobro</button>
                    <button id="cancelarCobroBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    const medioPagoSelect = document.getElementById('medioPago');
    const comisionContainer = document.getElementById('comisionContainer');
    const interesCheckbox = document.getElementById('aplicarInteres');

    medioPagoSelect.onchange = () => {
        const esTarjeta = medioPagoSelect.value === 'tarjeta_debito' || medioPagoSelect.value === 'tarjeta_credito';
        comisionContainer.classList.toggle('hidden', !esTarjeta);
        actualizarResumen();
    };

    document.getElementById('comisionTarjeta')?.addEventListener('input', actualizarResumen);

    // 🔥 Inicializar input de fecha
    initInputFecha('fechaCobro');

    // 🔥 v7.16.43: recalcular "vencido" según la fecha de cobro ingresada
    // Si la fecha de cobro es HOY o la esperada, no hay mora
    const _actualizarMoraSegunFecha = () => {
        const fechaCobroReal = getValorFecha('fechaCobro');
        const fechaEsperada = venta.fechaCobroEsperada;
        if (!fechaCobroReal || !fechaEsperada) return;

        const diasDiff = Math.ceil((new Date(fechaCobroReal) - new Date(fechaEsperada)) / (1000 * 60 * 60 * 24));
        const estaVencido = diasDiff > 0;

        const chkMora = document.getElementById('aplicarInteres');
        if (chkMora) {
            // Si NO está vencido, destildar y ocultar el bloque de mora
            if (!estaVencido) {
                chkMora.checked = false;
                chkMora.disabled = true;
                chkMora.parentElement.parentElement.style.opacity = '0.5';
            } else {
                chkMora.disabled = false;
                chkMora.parentElement.parentElement.style.opacity = '1';
            }
        }
    };

    // Ejecutar cuando cambia la fecha
    const fechaTextEl = document.getElementById('fechaCobroText');
    const fechaHiddenEl = document.getElementById('fechaCobroHidden');
    if (fechaTextEl) fechaTextEl.addEventListener('blur', _actualizarMoraSegunFecha);
    if (fechaHiddenEl) fechaHiddenEl.addEventListener('change', _actualizarMoraSegunFecha);

    // Ejecutar al inicio
    setTimeout(_actualizarMoraSegunFecha, 100);
    interesCheckbox?.addEventListener('change', actualizarResumen);

    function actualizarResumen() {
        let montoBase = montoTotal;
        let descuento = 0;
        let interes = 0;

        const esTarjeta = medioPagoSelect.value === 'tarjeta_debito' || medioPagoSelect.value === 'tarjeta_credito';
        if (esTarjeta) {
            const comision = parseFloat(document.getElementById('comisionTarjeta')?.value) || 0;
            descuento = montoBase * (comision / 100);
        }

        const aplicarInteres = interesCheckbox?.checked || false;
        if (aplicarInteres && vencido) {
            const porcentaje = db.configuracion?.porcentajeRecargoMora || 5;
            interes = montoBase * (porcentaje / 100);
        }

        const neto = montoBase + interes - descuento;

        document.getElementById('montoACobrar').textContent = `$${formatNumber(montoBase)}`;
        document.getElementById('netoRecibir').textContent = `$${formatNumber(neto)}`;

        const descuentoEl = document.getElementById('descuentoComision');
        if (descuento > 0) {
            descuentoEl.classList.remove('hidden');
            descuentoEl.innerHTML = `💳 Comisión: -$${formatNumber(descuento)}`;
        } else {
            descuentoEl.classList.add('hidden');
        }

        const interesEl = document.getElementById('interesAplicado');
        const moraGeneradaEl = document.getElementById('moraGenerada');
        if (interes > 0) {
            interesEl.classList.remove('hidden');
            interesEl.innerHTML = `⚠️ Interés por mora: +$${formatNumber(interes)}`;
            moraGeneradaEl.classList.remove('hidden');
            moraGeneradaEl.innerHTML = `📄 Se generará automáticamente un presupuesto de mora por $${formatNumber(interes)}`;
        } else {
            interesEl.classList.add('hidden');
            moraGeneradaEl.classList.add('hidden');
        }
    }

    // 🔥 v7.16.4: manejar subida de factura emitida desde el modal de cobro
    document.getElementById('facturaEmitidaFile')?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            window._facturaEmitidaSeleccionada = file;
        }
    });

    document.getElementById('confirmarCobroBtn').onclick = () => {
        const fecha = getValorFecha('fechaCobro');
        const medioPago = document.getElementById('medioPago').value;
        const comprobante = document.getElementById('comprobante').value;
        const file = document.getElementById('comprobanteFile').files[0];

        let comision = 0;
        let interes = 0;
        let aplicarInteres = false;

        if (medioPago === 'tarjeta_debito' || medioPago === 'tarjeta_credito') {
            comision = parseFloat(document.getElementById('comisionTarjeta')?.value) || 0;
        }

        // 🔥 v7.16.43: recalcular mora según la fecha de cobro ingresada
        let estaVencido = vencido;
        if (venta.fechaCobroEsperada && fecha) {
            const diasDiff = Math.ceil((new Date(fecha) - new Date(venta.fechaCobroEsperada)) / (1000 * 60 * 60 * 24));
            estaVencido = diasDiff > 0;
        }

        if (interesCheckbox?.checked && estaVencido) {
            aplicarInteres = true;
            const porcentaje = db.configuracion?.porcentajeRecargoMora || 5;
            interes = montoTotal * (porcentaje / 100);
        }

        // 🔥 v7.16.50: el interés por mora NO se suma al neto recibido (es deuda aparte)
        const netoRecibido = montoTotal - (montoTotal * comision / 100);

        venta.estado = 'cobrado';
        venta.fechaCobro = fecha;
        venta.medioPago = medioPago;
        venta.comisionTarjeta = comision > 0 ? comision : null;
        venta.interesMora = interes > 0 ? interes : null;
        venta.netoRecibido = netoRecibido;
        venta.comprobanteCobro = comprobante || null;
        // 🔥 v7.22.47: calcular días de demora del cobro
        if (venta.fechaVenta && fecha) {
            const [af, mf, df] = venta.fechaVenta.split('-').map(Number);
            const [ac, mc, dc] = fecha.split('-').map(Number);
            const fechaV = new Date(af, mf - 1, df);
            const fechaC = new Date(ac, mc - 1, dc);
            venta.diasDemoraCobro = Math.floor((fechaC - fechaV) / (1000 * 60 * 60 * 24));
        }

        // 🔥 v7.16.4: crear movimiento de tesorería del cobro
        if (!db.movimientos) db.movimientos = [];
        const medioKey = venta.medioPago === 'efectivo' ? 'efectivo' :
                         venta.medioPago === 'transferencia' ? 'transferencia' :
                         venta.medioPago === 'tarjeta_debito' ? 'tarjeta_debito' :
                         venta.medioPago === 'tarjeta_credito' ? 'tarjeta_credito' :
                         venta.medioPago === 'cheque' ? 'cheque' : 'otro';
        const mov = crearMovimiento({
            fecha: fecha,
            tipo: 'ingreso',
            origen: 'venta_cobro',
            origenId: venta.id,
            origenDescripcion: `Cobro venta ${venta.clienteNombre || ''}`.trim(),
            monto: montoTotal,
            medio: medioKey,
            observaciones: comprobante ? `Comprobante: ${comprobante}` : ''
        });
        venta.movimientoCobroId = mov.id;

        // Leer ambos archivos
        const fileFactura = document.getElementById('facturaEmitidaFile')?.files[0] || null;
        const fileComprobante = document.getElementById('comprobanteFile')?.files[0] || null;

        // 🔥 v7.16.83: Guardar comprobante de cobro subiendo a Storage
        if (fileComprobante) {
            (async () => {
                try {
                    const fileComprimido = await comprimirImagen(fileComprobante);
                    const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
                    const empresaId = getEmpresaActual() || 'empresa_principal';
                    const ruta = `${empresaId}/ventas/${venta.id}_comprobante.${ext}`;
                    venta.comprobanteCobroUrl = await subirArchivo(ruta, fileComprimido);
                    venta.comprobanteCobroNombre = fileComprimido.name;
                    console.log('✅ Comprobante subido a Storage:', venta.comprobanteCobroUrl.substring(0, 80) + '...');
                } catch (e) {
                    console.error('❌ Error subiendo comprobante:', e);
                    mostrarNotificacion('Error subiendo comprobante: ' + e.message, 'error');
                }
                guardarYNotificar();
            })();
        } else {
            guardarYNotificar();
        }

        function guardarYNotificar() {
            guardarDB();
            mostrarNotificacion(`💰 Cobro registrado - Neto recibido: $${formatNumber(netoRecibido)}`, 'success');
            if (aplicarInteres && interes > 0) {
                generarPresupuestoMora(venta.id);
            }
            window.dispatchEvent(new Event('refreshView'));
        }
    };

    document.getElementById('cancelarCobroBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== GENERAR PRESUPUESTO POR MORA ====================
window.generarPresupuestoMora = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }
    if (!venta.interesMora || venta.interesMora <= 0) {
        mostrarNotificacion('Esta venta no tiene interés por mora pendiente', 'warning');
        return;
    }
    if (venta.presupuestoMoraGenerado) {
        mostrarNotificacion(`Ya se generó el presupuesto de mora P-${venta.presupuestoMoraGenerado}`, 'info');
        return;
    }

    let diasAtraso = 0;
    if (venta.fechaCobro && venta.fechaCobroEsperada) {
        const fechaLimite = new Date(venta.fechaCobroEsperada);
        const fechaPago = new Date(venta.fechaCobro);
        const diff = Math.ceil((fechaPago - fechaLimite) / (1000 * 60 * 60 * 24));
        diasAtraso = diff > 0 ? diff : 0;
    }

    const cliente = db.clientes.find(c => c.id === venta.clienteId);
    if (!cliente) { mostrarNotificacion('Cliente no encontrado', 'error'); return; }

    const numeroPresupuesto = `P-${getProximoNumeroPresupuesto().toString().padStart(4, '0')}`;
    const descripcionMora = `Mora por atraso en pago - Factura ${venta.numFacturaEmitida || venta.numComprobante || 'N/A'}, ` +
        `límite ${formatDate(venta.fechaCobroEsperada)}, ` +
        `pagado ${formatDate(venta.fechaCobro)}, ` +
        `${diasAtraso} días de atraso, ` +
        `interés ${db.configuracion?.porcentajeRecargoMora || 5}%`;

    const nuevoPresupuesto = {
        id: generarId(),
        numero: numeroPresupuesto,
        clienteId: venta.clienteId,
        cliente: venta.clienteNombre,
        patente: '',
        centroCosto: '',
        vigencia: getVigenciaTexto(),
        comentarios: `Presupuesto generado automáticamente por mora de la venta ID ${venta.id}`,
        items: [
            {
                nro: 1,
                desc: descripcionMora,
                cant: 1,
                costo: venta.interesMora,
                markup: 0,
                compraVinculadaId: null,
                compraItemIndex: null,
                cantidadAsignada: 1,
                tipo: 'producto',
                horas: 0,
                valorHora: 0,
                precioFijo: false,
                precioVentaUnitario: 0
            }
        ],
        usarMarkupGlobal: false,
        markupGlobal: 0,
        incluirIVA: false,
        esTercerizado: false,
        costoProveedor: venta.interesMora,
        ventaCliente: venta.interesMora,
        gananciaBruta: venta.interesMora,
        gananciaNetaReal: venta.interesMora,
        iva: 0,
        total: venta.interesMora,
        fechaCreacion: new Date().toISOString(),
        presupuestoPadreId: venta.presupuestoId || null,
        estado: 'pendiente',
        ventaGeneradaId: null,
        esMora: true,
        ventaOrigenId: venta.id
    };

    db.presupuestos.push(nuevoPresupuesto);
    venta.presupuestoMoraGenerado = nuevoPresupuesto.id;
    guardarDB();

    mostrarNotificacion(`✅ Presupuesto de mora ${numeroPresupuesto} generado por $${formatNumber(venta.interesMora)}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== FUNCIONES AUXILIARES ====================
function getProximoNumeroPresupuesto() {
    const db = getDB();
    const presupuestos = db.presupuestos || [];
    if (presupuestos.length === 0) return 1;
    const numeros = presupuestos.map(p => {
        const num = parseInt(p.numero.replace('P-', ''));
        return isNaN(num) ? 0 : num;
    });
    return Math.max(...numeros, 0) + 1;
}

function getVigenciaTexto() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 7);
    return `Este presupuesto tiene validez hasta el ${fecha.toLocaleDateString('es-AR')}`;
}

// ==================== NUEVA VENTA MANUAL ====================
window.mostrarModalNuevaVenta = () => {
    const faltantes = validarDatosEsenciales();
    if (faltantes.length > 0) {
        mostrarAlertaDatosFaltantes(faltantes);
        return;
    }

    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} (${c.diasCobro} días)</option>`).join('');

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">💰 Nueva Venta</h2>

                <!-- 🔥 v7.16.39: OCR - cargar factura emitida -->
                <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <p class="text-sm font-medium">📄 Cargar factura emitida (opcional)</p>
                    <p class="text-xs text-gray-500 mb-2">Si ya tenés la factura en PDF o foto, subila y se autocompletan los datos.</p>
                    <div id="ventaFacturaActions" class="flex flex-wrap gap-2">
                        <button type="button" onclick="document.getElementById('ventaOcrInput').click()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1">
                            📷 Tomar foto
                        </button>
                        <button type="button" onclick="document.getElementById('ventaOcrInputFile').click()" class="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-4 py-2 rounded-lg text-sm flex items-center gap-1">
                            📁 Seleccionar archivo
                        </button>
                        <input type="file" id="ventaOcrInput" accept="image/*" capture="environment" class="hidden" onchange="window.procesarFacturaVenta(this.files[0])">
                        <input type="file" id="ventaOcrInputFile" accept="image/*,.pdf" class="hidden" onchange="window.procesarFacturaVenta(this.files[0])">
                    </div>
                    <div id="ventaOcrStatus" class="text-xs text-gray-500 mt-2"></div>
                    <div id="ventaFacturaPreview" class="hidden mt-2 p-2 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                        <p class="text-xs mb-2"><strong>📎 Archivo:</strong> <span id="ventaFacturaNombre"></span></p>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="window.verVistaPreviaFacturaVenta()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">
                                👁️ Ver vista previa
                            </button>
                            <button type="button" onclick="window.quitarFacturaVenta()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">
                                🗑️ Quitar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="space-y-3">
                    <div class="space-y-2">
                        <label class="block text-sm font-medium">👤 Cliente *</label>
                        <input type="text" id="clienteIdBuscar" placeholder="🔍 Buscar cliente por nombre o CUIT..." class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" oninput="window.filtrarClientesVenta(this.value, 'clienteId')">
                        <div class="flex gap-2">
                            <select id="clienteId" class="flex-1 p-3 border rounded-xl bg-white dark:bg-gray-900">
                                <option value="">Seleccionar cliente...</option>
                                ${clientesOptions}
                            </select>
                            <button type="button" onclick="window.abrirModalNuevoClienteVenta('clienteId')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm whitespace-nowrap">➕ Nuevo</button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">📄 Tipo de comprobante</label>
                        <select id="tipoFactura" class="w-full p-3 border rounded-xl bg-white dark:bg-gray-900" onchange="window.cambiarTipoFacturaVenta()">
                            <option value="A">Factura A (discrimina IVA)</option>
                            <option value="B">Factura B (IVA incluido)</option>
                            <option value="C">Factura C (sin IVA)</option>
                        </select>
                    </div>
                    <input type="text" id="numFactura" placeholder="Número de Factura" class="w-full p-3 border rounded-xl" required>
                    <div class="grid grid-cols-3 gap-2">
                        <div>
                            <label class="block text-xs font-medium mb-1">💰 Neto</label>
                            <input type="number" id="montoNeto" placeholder="0" class="w-full p-2 border rounded-xl" step="0.01"
                                   onchange="window.calcularDesdeNetoVenta()"
                                   onfocus="this.select()">
                        </div>
                        <div>
                            <label class="block text-xs font-medium mb-1">🧾 IVA</label>
                            <select id="ivaSelect" class="w-full p-2 border rounded-xl mb-1" onchange="window.calcularDesdeNetoVenta()">
                                <option value="21">21%</option>
                                <option value="10.5">10.5%</option>
                                <option value="27">27%</option>
                                <option value="0">0%</option>
                            </select>
                            <input type="number" id="ivaMonto" placeholder="0" class="w-full p-2 border rounded-xl" step="0.01"
                                   onchange="window.calcularDesdeIVAVenta()"
                                   onfocus="this.select()">
                        </div>
                        <div>
                            <label class="block text-xs font-medium mb-1">💰 Total</label>
                            <input type="number" id="totalVenta" placeholder="0" class="w-full p-2 border rounded-xl font-bold" step="0.01"
                                   onchange="window.calcularDesdeTotalVenta()"
                                   onfocus="this.select()">
                        </div>
                    </div>
                    <p class="text-xs text-gray-500">💡 Cargá el Neto, el IVA o el Total, y los otros se calculan solos.</p>
                    ${inputFechaHTML('fechaVenta', new Date().toISOString().split('T')[0], { label: '📅 Fecha de venta' })}
                    <input type="text" id="ordenCompraCliente" placeholder="Orden de Compra del Cliente (opcional)" class="w-full p-3 border rounded-xl">
                </div>

                <!-- 🔥 v7.16.68: ¿Ya cobraste esta venta? -->
                <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="nv-cobradoYa" class="w-4 h-4" onchange="document.getElementById('nv-cobroFields').classList.toggle('hidden', !this.checked)">
                        <span class="font-medium">💰 ¿Ya cobraste esta venta?</span>
                    </label>
                    <p class="text-xs text-gray-500 mt-1">Si tildás, se registra el cobro junto con la venta (genera movimiento en tesorería).</p>
                </div>

                <div id="nv-cobroFields" class="hidden mt-3 space-y-3">
                    <div class="grid grid-cols-2 gap-2">
                        ${inputFechaHTML('nv-fechaCobro', hoyISO(), { label: '📅 Fecha de cobro' })}
                        <div>
                            <label class="block text-sm font-medium mb-1">💳 Medio de pago</label>
                            <select id="nv-medioPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                                <option value="Transferencia" selected>🏦 Transferencia (default)</option>
                                <option value="Efectivo">💵 Efectivo</option>
                                <option value="Tarjeta Débito">💳 Tarjeta Débito</option>
                                <option value="Tarjeta Crédito">💳 Tarjeta Crédito</option>
                                <option value="Cheque">📄 Cheque</option>
                                <option value="Otro">🔄 Otro</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="flex gap-3 mt-5">
                    <button id="guardarVentaBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">💾 Guardar Venta</button>
                    <button id="cancelarVentaBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    document.getElementById('guardarVentaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteId').value);
        const tipoFactura = document.getElementById('tipoFactura').value; // 'A' | 'B' | 'C'
        const numFactura = document.getElementById('numFactura').value.trim();
        const montoNeto = parseFloat(document.getElementById('montoNeto').value) || 0;
        const ivaMonto = parseFloat(document.getElementById('ivaMonto').value) || 0;
        const total = parseFloat(document.getElementById('totalVenta').value) || 0;
        const iva = parseFloat(document.getElementById('ivaSelect').value);
        const fecha = getValorFecha('fechaVenta');
        const oc = document.getElementById('ordenCompraCliente').value.trim();

        if (!clienteId) { mostrarNotificacion('Seleccione un cliente', 'error'); return; }
        if (!numFactura) { mostrarNotificacion('Ingrese número de factura', 'error'); return; }
        if (total <= 0) { mostrarNotificacion('Ingrese un total válido', 'error'); return; }

        // 🔥 v7.16.4: el IVA siempre es débito fiscal (aunque sea B)
        // Factura C no tiene IVA (solo si sos monotributista)
        const monto = montoNeto;
        const ivaMontoFinal = tipoFactura === 'C' ? 0 : ivaMonto;
        const totalFinal = tipoFactura === 'C' ? total : (montoNeto + ivaMontoFinal);

        const cliente = db.clientes.find(c => c.id === clienteId);
        const fechaCobro = new Date(fecha);
        fechaCobro.setDate(fechaCobro.getDate() + cliente.diasCobro);

        // 🔥 v7.16.68: verificar si ya está cobrada
        const cobradoYa = document.getElementById('nv-cobradoYa')?.checked;
        const fechaCobroNV = cobradoYa ? (getValorFecha('nv-fechaCobro') || fecha) : null;
        const medioPagoNV = cobradoYa ? (document.getElementById('nv-medioPago')?.value || 'Transferencia') : null;

        const ventaIdNV = generarId();

        db.ventas.push({
            id: ventaIdNV,
            clienteId,
            clienteNombre: cliente.nombre,
            tipoComprobante: tipoFactura,
            numComprobante: numFactura,
            montoNeto: monto,
            iva,
            ivaMonto: ivaMontoFinal,
            total: totalFinal,
            estado: cobradoYa ? 'cobrado' : 'pendiente_cobro',
            fechaCobro: fechaCobroNV,
            medioPago: medioPagoNV,
            fechaVenta: fecha,
            fechaCobroEsperada: dateToISO(fechaCobro),
            mes: fecha.substring(0, 7),
            facturaUrl: null,
            facturaNombre: null,
            ordenCompraCliente: oc || null,
            presupuestoId: null,
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: null,
            comisionTarjeta: null,
            interesMora: null,
            comprobanteCobro: null,
            comprobanteCobroUrl: null,
            numFacturaEmitida: numFactura,
            fechaFactura: fecha,
            facturaEmitidaUrl: null,
            facturaEmitidaNombre: null,
            observaciones: null,
            ocArchivoUrl: null,
            ocArchivoNombre: null,
            fechaRecepcionOC: null,
            diasCobroCliente: cliente.diasCobro,
            presupuestoMoraGenerado: null,
            moraSaldada: false
        });

        // 🔥 v7.16.83: guardar la factura emitida (subida a Storage)
        if (window._facturaVentaSeleccionada) {
            const fileFactura = window._facturaVentaSeleccionada;
            window._facturaVentaSeleccionada = null;
            (async () => {
                try {
                    const fileComprimido = await comprimirImagen(fileFactura);
                    const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
                    const empresaId = getEmpresaActual() || 'empresa_principal';
                    const ruta = `${empresaId}/ventas/${ventaIdNV}_factura.${ext}`;
                    const url = await subirArchivo(ruta, fileComprimido);
                    const ventaRecien = db.ventas.find(v => String(v.id) === String(ventaIdNV));
                    if (ventaRecien) {
                        ventaRecien.facturaEmitidaUrl = url;
                        ventaRecien.facturaEmitidaNombre = fileComprimido.name;
                        guardarDB();
                        console.log('✅ Factura subida a Storage:', url.substring(0, 80) + '...');
                        window.dispatchEvent(new Event('refreshView'));
                    }
                } catch (err) {
                    console.error('❌ Error subiendo factura:', err);
                }
            })();
        }

        // 🔥 v7.16.68: crear movimiento si ya está cobrada
        if (cobradoYa) {
            if (!db.movimientos) db.movimientos = [];
            const alicuota = db.configuracion?.alicuotaImpuestoCheque ?? 0.6;
            const aplicaImp = medioPagoNV !== 'Efectivo' && medioPagoNV !== 'Otro';
            const impuestoMonto = aplicaImp ? +(totalFinal * (alicuota / 100)).toFixed(2) : 0;
            const medioKey = medioPagoNV === 'Transferencia' ? 'transferencia'
                : medioPagoNV === 'Efectivo' ? 'efectivo'
                : medioPagoNV === 'Tarjeta Débito' ? 'tarjeta_debito'
                : medioPagoNV === 'Tarjeta Crédito' ? 'tarjeta_credito'
                : medioPagoNV === 'Cheque' ? 'cheque' : 'otro';

            const mov = {
                id: 'mov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                fecha: fechaCobroNV,
                mes: fechaCobroNV.substring(0, 7),
                tipo: 'ingreso',
                origen: 'venta_cobro',
                origenId: ventaIdNV,
                origenDescripcion: 'Cobro venta ' + cliente.nombre,
                monto: totalFinal,
                medio: medioKey,
                impuestoDebitoCredito: { aplica: aplicaImp, tasa: alicuota, monto: impuestoMonto },
                montoNeto: +(totalFinal - impuestoMonto).toFixed(2),
                observaciones: '',
                fechaCreacion: new Date().toISOString()
            };
            db.movimientos.push(mov);

            const ventaRecienCreada = db.ventas.find(v => v.id === ventaIdNV);
            if (ventaRecienCreada) ventaRecienCreada.movimientoCobroId = mov.id;
        }

        guardarDB();
        mostrarNotificacion(`✅ Venta registrada${cobradoYa ? ' y cobrada' : ''}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    // 🔥 Inicializar input de fecha
    initInputFecha('fechaVenta');

    document.getElementById('cancelarVentaBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== ELIMINAR VENTA ====================
window.eliminarVenta = async (id) => {
    // 🔥 v7.16.71: modal de confirmación integrado
    const confirmado = await confirmarAccion({
        titulo: '🗑️ Eliminar Venta',
        mensaje: '¿Eliminar esta venta permanentemente?<br><br>Se eliminarán todos los datos asociados (factura, comprobantes, movimientos).<br><br><strong>Esta acción no se puede deshacer.</strong>',
        textoConfirmar: '🗑️ Sí, eliminar',
        icono: '🗑️'
    });
    if (!confirmado) return;

    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(id));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    // Si está cobrada, pedir segunda confirmación
    if (venta.estado === 'cobrado') {
        const confirmadoCobrado = await confirmarAccion({
            titulo: '⚠️ Venta cobrada',
            mensaje: 'Esta venta ya está cobrada. Si la eliminás, se perderá el registro de cobro y el movimiento de tesorería.<br><br><strong>¿Eliminar de todas formas?</strong>',
            textoConfirmar: '🗑️ Sí, eliminar',
            colorConfirmar: 'bg-orange-600 hover:bg-orange-700',
            icono: '⚠️'
        });
        if (!confirmadoCobrado) return;

        // 🔥 v7.16.87: eliminar TODOS los movimientos asociados a esta venta
        if (db.movimientos) {
            const antes = db.movimientos.length;
            db.movimientos = db.movimientos.filter(m => 
                String(m.origenId) !== String(venta.id) && 
                String(m.id) !== String(venta.movimientoCobroId)
            );
            const eliminados = antes - db.movimientos.length;
            if (eliminados > 0) {
                console.log(`🗑️ Eliminados ${eliminados} movimientos asociados a la venta ${venta.id}`);
            }
        }

        // 🔥 v7.16.89: limpiar vínculos en compras
        if (db.compras) {
            db.compras.forEach(c => {
                if (c.ventasVinculadasIds) {
                    c.ventasVinculadasIds = c.ventasVinculadasIds.filter(id => String(id) !== String(venta.id));
                }
            });
        }
    }

    if (venta.presupuestoId) {
        const presupuesto = db.presupuestos.find(p => p.id === venta.presupuestoId);
        if (presupuesto) {
            presupuesto.ventaGeneradaId = null;
            if (presupuesto.estado === 'aprobado') presupuesto.estado = 'pendiente';
            mostrarNotificacion(`✅ Presupuesto ${presupuesto.numero} desvinculado`, 'info');
        }
    }

    if (venta.presupuestoMoraGenerado) {
        const presMora = db.presupuestos.find(p => p.id === venta.presupuestoMoraGenerado);
        if (presMora) {
            const confirmadoMora = await confirmarAccion({
                titulo: '📄 Presupuesto de mora',
                mensaje: `La venta generó un presupuesto de mora (<strong>${presMora.numero}</strong>).<br><br>¿Eliminarlo también?`,
                textoConfirmar: '🗑️ Sí, eliminar',
                colorConfirmar: 'bg-orange-600 hover:bg-orange-700',
                icono: '📄'
            });
            if (confirmadoMora) {
                db.presupuestos = db.presupuestos.filter(p => p.id !== presMora.id);
                mostrarNotificacion(`✅ Presupuesto de mora ${presMora.numero} eliminado`, 'info');
            } else {
                presMora.ventaOrigenId = null;
            }
        }
    }

    db.ventas = db.ventas.filter(v => String(v.id) !== String(id));
    guardarDB();
    mostrarNotificacion('✅ Venta eliminada correctamente', 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== NUEVA VENTA DIRECTA (MODAL COMPLETO) ====================
window.mostrarModalNuevaVentaDirecta = () => {
    const faltantes = validarDatosEsenciales();
    if (faltantes.length > 0) {
        mostrarAlertaDatosFaltantes(faltantes);
        return;
    }

    const db = getDB();
    const datosEmpresa = db.datosEmpresa || {};

    // Valores sugeridos desde configuración
    const valorHoraSugerido = datosEmpresa.valorHoraSugerido || 5000;
    const markupSugerido = datosEmpresa.markupSugerido || 30;

    // Estado local del modal
    let items = [];
    let markupGlobal = markupSugerido;
    let incluyeIVA = true;
    let clienteSeleccionado = null;
    let clienteId = null;
    let fechaVenta = new Date().toISOString().split('T')[0];

    function generarIdItem() {
        return Date.now() + Math.random().toString(36).substr(2, 6);
    }

    function getCostoTotal() {
        let total = 0;
        items.forEach(item => {
            if (item.tipo === 'mano_obra') {
                const costo = (item.horas || 0) * (item.valorHora || 0);
                total += costo * (item.cant || 1);
            } else {
                total += (item.costo || 0) * (item.cant || 1);
            }
        });
        return total;
    }

    function getVentaTotal() {
        let total = 0;
        items.forEach(item => {
            const cant = item.cant || 1;
            if (item.precioFijo) {
                total += (item.precioVentaUnitario || 0) * cant;
            } else {
                let costo = 0;
                if (item.tipo === 'mano_obra') {
                    costo = (item.horas || 0) * (item.valorHora || 0);
                } else {
                    costo = item.costo || 0;
                }
                total += costo * (1 + markupGlobal / 100) * cant;
            }
        });
        return total;
    }

    function getIva(ventaTotal) {
        const ivaPorc = parseFloat(document.getElementById('ivaVD')?.value) || 21;
        return incluyeIVA ? ventaTotal * (ivaPorc / 100) : 0;
    }

    function getTotalConIva(ventaTotal) {
        return ventaTotal + getIva(ventaTotal);
    }

    // Función para renderizar la tabla de ítems
    function renderizarItems() {
        const container = document.getElementById('itemsContainerVD');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `
                <div class="p-4 text-center text-gray-400 italic">
                    🔍 No hay ítems cargados. Agregá uno nuevo.
                </div>
            `;
            return;
        }

        container.innerHTML = items.map((item, idx) => {
            const esManoObra = item.tipo === 'mano_obra';
            let costo = 0;
            if (esManoObra) {
                costo = (item.horas || 0) * (item.valorHora || 0);
            } else {
                costo = item.costo || 0;
            }
            let precioVenta = 0;
            if (item.precioFijo) {
                precioVenta = item.precioVentaUnitario || 0;
            } else {
                precioVenta = costo * (1 + markupGlobal / 100);
            }
            const subtotal = precioVenta * (item.cant || 1);

            let tipoOptions = `
                <select onchange="window.actualizarTipoItemVD(${idx}, this.value)" class="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600">
                    <option value="producto" ${item.tipo === 'producto' ? 'selected' : ''}>Producto</option>
                    <option value="servicio" ${item.tipo === 'servicio' ? 'selected' : ''}>Servicio</option>
                    <option value="mano_obra" ${item.tipo === 'mano_obra' ? 'selected' : ''}>Mano de obra</option>
                </select>
            `;

            let costoHTML = '';
            if (esManoObra) {
                costoHTML = `
                    <div class="flex flex-col gap-1">
                        <div class="flex gap-1">
                            <input type="number" value="${item.horas || 0}" step="0.5" onchange="window.actualizarItemVD(${idx}, 'horas', this.value)" class="w-12 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600" placeholder="h">
                            <span class="text-xs self-center">×</span>
                            <input type="number" value="${item.valorHora || 0}" step="100" onchange="window.actualizarItemVD(${idx}, 'valorHora', this.value)" class="w-20 p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600" placeholder="$">
                        </div>
                        <span class="text-xs text-gray-500">Costo: $${formatNumber(costo)}</span>
                    </div>
                `;
            } else {
                costoHTML = `
                    <input type="number" value="${item.costo || 0}" step="100" onchange="window.actualizarItemVD(${idx}, 'costo', this.value)" class="w-full p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600">
                `;
            }

            let precioFijoHTML = '';
            if (!esManoObra) {
                precioFijoHTML = `
                    <label class="flex items-center gap-1 text-xs mt-1">
                        <input type="checkbox" ${item.precioFijo ? 'checked' : ''} onchange="window.togglePrecioFijoVD(${idx})">
                        Precio fijo
                    </label>
                `;
            }

            let precioVentaHTML = '';
            if (item.precioFijo) {
                precioVentaHTML = `
                    <input type="number" value="${item.precioVentaUnitario || 0}" step="100" onchange="window.actualizarItemVD(${idx}, 'precioVentaUnitario', this.value)" class="w-full p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600">
                `;
            } else {
                precioVentaHTML = `<span class="font-medium text-green-600">$${formatNumber(precioVenta)}</span>`;
            }

            return `
                <tr class="border-b">
                    <td class="p-2 text-center">${idx + 1}</td>
                    <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItemVD(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600"></td>
                    <td class="p-2">${tipoOptions}</td>
                    <td class="p-2"><input type="number" value="${item.cant || 1}" step="1" onchange="window.actualizarItemVD(${idx}, 'cant', this.value)" class="w-16 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600"></td>
                    <td class="p-2">${costoHTML}</td>
                    <td class="p-2 text-center">${precioFijoHTML}</td>
                    <td class="p-2">${precioVentaHTML}</td>
                    <td class="p-2 text-right font-medium">$${formatNumber(subtotal)}</td>
                    <td class="p-2 text-center"><button onclick="window.eliminarItemVD(${idx})" class="text-red-500 text-xl">🗑️</button></td>
                </tr>
            `;
        }).join('');

        // Actualizar resumen
        actualizarResumen();
    }

    function actualizarResumen() {
        const costoTotal = getCostoTotal();
        const ventaTotal = getVentaTotal();
        const iva = getIva(ventaTotal);
        const totalConIva = getTotalConIva(ventaTotal);

        const el = (id) => document.getElementById(id);
        if (el('costoTotalVD')) el('costoTotalVD').textContent = formatNumber(costoTotal);
        if (el('ventaTotalVD')) el('ventaTotalVD').textContent = formatNumber(ventaTotal);
        if (el('ivaVD')) el('ivaVD').textContent = formatNumber(iva);
        if (el('totalConIvaVD')) el('totalConIvaVD').textContent = formatNumber(totalConIva);
        if (el('diferenciaVD')) el('diferenciaVD').textContent = formatNumber(ventaTotal - costoTotal);
        if (el('gananciaNetaVD')) {
            const gn = calcularGananciaReal(ventaTotal, costoTotal);
            el('gananciaNetaVD').textContent = formatNumber(gn.gananciaNeta);
        }
    }

    window.actualizarItemVD = (idx, campo, valor) => {
        if (items[idx]) {
            if (campo === 'desc') items[idx].desc = valor.toUpperCase().trim();
            else if (campo === 'cant') items[idx].cant = parseFloat(valor) || 1;
            else if (campo === 'costo') items[idx].costo = parseFloat(valor) || 0;
            else if (campo === 'horas') {
                items[idx].horas = parseFloat(valor) || 0;
                if (items[idx].tipo === 'mano_obra') {
                    items[idx].costo = items[idx].horas * items[idx].valorHora;
                }
            } else if (campo === 'valorHora') {
                items[idx].valorHora = parseFloat(valor) || 0;
                if (items[idx].tipo === 'mano_obra') {
                    items[idx].costo = items[idx].horas * items[idx].valorHora;
                }
            } else if (campo === 'precioVentaUnitario') {
                items[idx].precioVentaUnitario = parseFloat(valor) || 0;
            }
            renderizarItems();
        }
    };

    window.actualizarTipoItemVD = (idx, tipo) => {
        if (items[idx]) {
            items[idx].tipo = tipo;
            if (tipo === 'mano_obra') {
                items[idx].horas = items[idx].horas || 1;
                items[idx].valorHora = items[idx].valorHora || valorHoraSugerido;
                items[idx].costo = items[idx].horas * items[idx].valorHora;
                items[idx].precioFijo = false;
            } else {
                items[idx].horas = 0;
                items[idx].valorHora = 0;
            }
            renderizarItems();
        }
    };

    window.togglePrecioFijoVD = (idx) => {
        if (items[idx]) {
            items[idx].precioFijo = !items[idx].precioFijo;
            if (items[idx].precioFijo) {
                items[idx].precioVentaUnitario = items[idx].precioVentaUnitario || 0;
            }
            renderizarItems();
        }
    };

    window.eliminarItemVD = (idx) => {
        if (items.length <= 1) {
            mostrarNotificacion('Debe haber al menos un ítem', 'warning');
            return;
        }
        items.splice(idx, 1);
        renderizarItems();
    };

    function agregarItem(tipo = 'producto') {
        const nuevoItem = {
            id: generarIdItem(),
            desc: tipo === 'mano_obra' ? 'MANO DE OBRA' : 'NUEVO PRODUCTO',
            cant: 1,
            costo: tipo === 'mano_obra' ? valorHoraSugerido : 0,
            markup: markupGlobal,
            tipo: tipo,
            horas: tipo === 'mano_obra' ? 1 : 0,
            valorHora: tipo === 'mano_obra' ? valorHoraSugerido : 0,
            precioFijo: false,
            precioVentaUnitario: 0
        };
        if (tipo === 'mano_obra') {
            nuevoItem.costo = nuevoItem.horas * nuevoItem.valorHora;
        }
        items.push(nuevoItem);
        renderizarItems();
    }

    // Función para calcular ganancia real (copiada de presupuestos)
    function calcularGananciaReal(montoVentaCliente, costoProveedor) {
        const impuestosActivos = getImpuestosActivos();
        const gananciaBruta = montoVentaCliente - costoProveedor;
        let totalImpuestosVenta = 0;
        let detalleImpuestos = [];

        impuestosActivos.forEach(imp => {
            if (imp.baseCalculo === 'venta' || imp.baseCalculo === 'utilidadAntesGanancias') {
                if (imp.id === 'ganancias' || imp.id === 'reservaLegal') return;
                let base = imp.baseCalculo === 'venta' ? montoVentaCliente : gananciaBruta - totalImpuestosVenta;
                const monto = base * (imp.alicuota / 100);
                totalImpuestosVenta += monto;
                detalleImpuestos.push({ nombre: imp.nombre, monto, base });
            }
        });

        let utilidadAntes = Math.max(0, gananciaBruta - totalImpuestosVenta);
        let impuestoGanancias = 0;
        const gananciasImp = impuestosActivos.find(i => i.id === 'ganancias');
        if (gananciasImp && gananciasImp.activo) {
            impuestoGanancias = utilidadAntes * (gananciasImp.alicuota / 100);
        }
        const despuesGanancias = utilidadAntes - impuestoGanancias;
        let reservaLegal = 0;
        const reservaImp = impuestosActivos.find(i => i.id === 'reservaLegal');
        if (reservaImp && reservaImp.activo) {
            reservaLegal = despuesGanancias * (reservaImp.alicuota / 100);
        }
        const gananciaNeta = Math.max(0, despuesGanancias - reservaLegal);

        return {
            gananciaBruta,
            totalImpuestosVenta,
            utilidadAntes,
            impuestoGanancias,
            reservaLegal,
            gananciaNeta
        };
    }

    // Construir el HTML del modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalVentaDirecta';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4 text-center">📝 Nueva Venta Directa</h2>
            <form id="formVentaDirecta" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">👤 Cliente *</label>
                        <input type="text" id="clienteVDBuscar" placeholder="🔍 Buscar cliente..." class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 mb-2" oninput="window.filtrarClientesVenta(this.value, 'clienteVD')">
                        <div class="flex gap-2">
                            <select id="clienteVD" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" required>
                                <option value="">Seleccionar cliente...</option>
                                ${db.clientes.map(c => `<option value="${c.id}" ${clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)} (${c.diasCobro} días)</option>`).join('')}
                            </select>
                            <button type="button" onclick="window.abrirModalNuevoClienteVenta('clienteVD')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap">➕</button>
                        </div>
                    </div>
                    <div>
                        ${inputFechaHTML('fechaVentaVD', fechaVenta, { label: '📅 Fecha de venta' })}
                    </div>
                </div>

                <!-- 🔥 v7.16.3: ¿Ya cobraste? -->
                <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="vd-cobradoYa" class="w-4 h-4">
                        <span class="font-medium">💰 ¿Ya cobraste esta venta?</span>
                    </label>
                    <p class="text-xs text-gray-500 mt-1">Si tildás, se registra el cobro junto con la venta (genera movimiento en tesorería).</p>
                </div>

                <div id="vd-cobroFields" class="hidden grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${inputFechaHTML('vd-fechaCobro', fechaVenta, { label: '📅 Fecha de cobro' })}
                    <div>
                        <label class="block text-sm font-medium mb-1">💳 Medio de pago</label>
                        <select id="vd-medioPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                            <option value="Efectivo">💵 Efectivo</option>
                            <option value="Transferencia" selected>🏦 Transferencia (default)</option>
                            <option value="Tarjeta Débito">💳 Tarjeta Débito</option>
                            <option value="Tarjeta Crédito">💳 Tarjeta Crédito</option>
                            <option value="Cheque">📄 Cheque</option>
                            <option value="Otro">🔄 Otro</option>
                        </select>
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium mb-1">📄 Nº de comprobante (opcional)</label>
                        <input type="text" id="vd-numComprobante" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Nro de transferencia / cheque">
                    </div>
                </div>

                <div>
                    <div class="flex justify-between items-center mb-2">
                        <label class="block text-sm font-medium">📋 Ítems</label>
                        <div class="flex gap-2">
                            <button type="button" onclick="agregarItem('producto')" class="bg-gray-200 dark:bg-gray-600 px-3 py-1 rounded-lg text-sm">➕ Producto</button>
                            <button type="button" onclick="agregarItem('servicio')" class="bg-gray-200 dark:bg-gray-600 px-3 py-1 rounded-lg text-sm">➕ Servicio</button>
                            <button type="button" onclick="agregarItem('mano_obra')" class="bg-blue-200 dark:bg-blue-800 px-3 py-1 rounded-lg text-sm">🛠️ Mano de obra</button>
                        </div>
                    </div>
                    <div class="overflow-x-auto border rounded-lg">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th class="p-2">#</th>
                                    <th class="p-2">Descripción</th>
                                    <th class="p-2">Tipo</th>
                                    <th class="p-2 w-16">Cant.</th>
                                    <th class="p-2 w-28">Costo / Mano obra</th>
                                    <th class="p-2 w-16">Precio fijo</th>
                                    <th class="p-2 w-28">Precio Venta</th>
                                    <th class="p-2 w-28">Subtotal</th>
                                    <th class="p-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody id="itemsContainerVD"></tbody>
                        </table>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">📈 Margen de ganancia (%)</label>
                        <input type="number" id="markupVD" value="${markupGlobal}" step="0.1" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="window.actualizarMarkupVD(this.value)">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">🧾 IVA</label>
                        <div class="flex items-center gap-2">
                            <select id="ivaVD" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="window.actualizarIvaVD(this.value)">
                                <option value="21">21%</option>
                                <option value="10.5">10.5%</option>
                                <option value="0">0%</option>
                            </select>
                            <label class="flex items-center gap-1 text-sm">
                                <input type="checkbox" id="incluyeIvaVD" checked onchange="window.actualizarIvaVD(document.getElementById('ivaVD').value)">
                                Incluye IVA en total
                            </label>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div><span class="text-xs text-gray-500">Costo total:</span><span class="font-bold text-red-600 block" id="costoTotalVD">$0</span></div>
                    <div><span class="text-xs text-gray-500">Venta neta:</span><span class="font-bold text-green-600 block" id="ventaTotalVD">$0</span></div>
                    <div><span class="text-xs text-gray-500">IVA:</span><span class="font-bold text-orange-600 block" id="ivaVD">$0</span></div>
                    <div><span class="text-xs text-gray-500">Total con IVA:</span><span class="font-bold text-blue-600 block" id="totalConIvaVD">$0</span></div>
                </div>

                <div class="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div><span class="text-xs text-gray-500">Diferencia (ganancia bruta):</span><span class="font-bold text-blue-600 block" id="diferenciaVD">$0</span></div>
                    <div><span class="text-xs text-gray-500">Ganancia neta (estimada):</span><span class="font-bold text-purple-600 block" id="gananciaNetaVD">$0</span></div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">📝 Observaciones</label>
                    <textarea id="observacionesVD" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Notas sobre esta venta..."></textarea>
                </div>

                <div class="flex gap-3 mt-5">
                    <button type="submit" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Guardar Venta Directa</button>
                    <button type="button" id="cancelarVD" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // ========== EVENTOS ==========

    // Agregar ítems (funciones expuestas globalmente)
    window.agregarItemVD = agregarItem;

    // 🔥 Inicializar input de fecha
    initInputFecha('fechaVentaVD');

    // 🔥 v7.16.3: toggle de campos de cobro + init de fecha de cobro
    initInputFecha('vd-fechaCobro');
    const vdCobradoYa = document.getElementById('vd-cobradoYa');
    const vdCobroFields = document.getElementById('vd-cobroFields');
    vdCobradoYa?.addEventListener('change', () => {
        vdCobroFields.classList.toggle('hidden', !vdCobradoYa.checked);
    });

    // Actualizar markup
    window.actualizarMarkupVD = (valor) => {
        markupGlobal = parseFloat(valor) || 0;
        renderizarItems();
    };

    // Actualizar IVA
    window.actualizarIvaVD = (valor) => {
        const ivaPorc = parseFloat(valor) || 21;
        incluyeIVA = document.getElementById('incluyeIvaVD').checked;
        renderizarItems();
    };

    // Inicializar items con un ítem por defecto
    items = [{
        id: generarIdItem(),
        desc: 'PRODUCTO/SERVICIO',
        cant: 1,
        costo: 0,
        markup: markupGlobal,
        tipo: 'producto',
        horas: 0,
        valorHora: 0,
        precioFijo: false,
        precioVentaUnitario: 0
    }];

    // Renderizar inicial
    renderizarItems();

    // Submit del formulario
    document.getElementById('formVentaDirecta').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarVentaDirecta();
    });

    // Cancelar
    document.getElementById('cancelarVD').addEventListener('click', () => {
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    });

    // ========== FUNCIÓN GUARDAR ==========
    function guardarVentaDirecta() {
        const clienteSelect = document.getElementById('clienteVD');
        const clienteId = parseInt(clienteSelect.value);
        if (!clienteId) {
            mostrarNotificacion('Seleccione un cliente', 'error');
            return;
        }

        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion('Cliente no encontrado', 'error');
            return;
        }

        if (items.length === 0) {
            mostrarNotificacion('Agregue al menos un ítem', 'error');
            return;
        }

        const fechaVenta = getValorFecha('fechaVentaVD');
        const observaciones = document.getElementById('observacionesVD').value.trim();
        const ivaPorc = parseFloat(document.getElementById('ivaVD').value) || 0;
        const incluyeIva = document.getElementById('incluyeIvaVD').checked;

        // Calcular totales
        const costoTotal = getCostoTotal();
        const ventaTotal = getVentaTotal();
        const ivaMonto = incluyeIva ? ventaTotal * (ivaPorc / 100) : 0;
        const totalFactura = ventaTotal + ivaMonto;

        // Fecha de cobro esperada según cliente
        // 🔥 v7.16.81: parsear como LOCAL (evita bug UTC-3)
        const fechaCobro = parseFechaLocal(fechaVenta);
        fechaCobro.setDate(fechaCobro.getDate() + cliente.diasCobro);
        const fechaCobroISO = dateToISO(fechaCobro);

        // ========== CREAR PRESUPUESTO INTERNO ==========
        const presupuestoNumero = `P-${getProximoNumeroPresupuesto().toString().padStart(4, '0')}`;
        const presupuestoId = generarId();

        const itemsPresupuesto = items.map((item, idx) => ({
            nro: idx + 1,
            desc: item.desc,
            cant: item.cant || 1,
            costo: item.tipo === 'mano_obra' ? (item.horas || 0) * (item.valorHora || 0) : (item.costo || 0),
            markup: item.precioFijo ? 0 : markupGlobal,
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: 0,
            tipo: item.tipo,
            horas: item.horas || 0,
            valorHora: item.valorHora || 0,
            precioFijo: item.precioFijo || false,
            precioVentaUnitario: item.precioFijo ? (item.precioVentaUnitario || 0) : 0
        }));

        const nuevoPresupuesto = {
            id: presupuestoId,
            numero: presupuestoNumero,
            clienteId: clienteId,
            cliente: cliente.nombre,
            patente: '',
            centroCosto: '',
            vigencia: getVigenciaTexto(),
            comentarios: `Presupuesto interno generado automáticamente desde Venta Directa.\n${observaciones}`,
            items: itemsPresupuesto,
            usarMarkupGlobal: true,
            markupGlobal: markupGlobal,
            incluirIVA: incluyeIva,
            esTercerizado: false,
            costoProveedor: costoTotal,
            ventaCliente: ventaTotal,
            gananciaBruta: ventaTotal - costoTotal,
            gananciaNetaReal: calcularGananciaReal(ventaTotal, costoTotal).gananciaNeta,
            iva: ivaMonto,
            total: totalFactura,
            fechaCreacion: new Date().toISOString(),
            presupuestoPadreId: null,
            estado: 'aprobado',
            ventaGeneradaId: null, // Se asignará después de crear la venta
            esMora: false,
            ventaOrigenId: null,
            deudasIncluidas: null,
            esVentaDirecta: true
        };

        // ========== CREAR VENTA ==========
        const ventaId = generarId();
        const nuevaVenta = {
            id: ventaId,
            clienteId: clienteId,
            clienteNombre: cliente.nombre,
            tipoComprobante: 'Factura A',
            numComprobante: null, // Se cargará después
            montoNeto: ventaTotal,
            iva: ivaPorc,
            ivaMonto: ivaMonto,
            total: totalFactura,
            fechaVenta: fechaVenta,
            fechaCobroEsperada: fechaCobroISO,
            mes: fechaVenta.substring(0, 7),
            estado: 'pendiente_factura',
            facturaUrl: null,
            facturaNombre: null,
            ordenCompraCliente: null,
            fechaRecepcionOC: null,
            ocArchivoUrl: null,
            ocArchivoNombre: null,
            observaciones: observaciones || null,
            presupuestoId: presupuestoId,
            comprasVinculadas: [],
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: null,
            medioPago: null,
            comisionTarjeta: null,
            interesMora: null,
            fechaCobro: null,
            comprobanteCobro: null,
            comprobanteCobroUrl: null,
            items: itemsPresupuesto.map(i => ({ ...i })),
            fechaFactura: null,
            numFacturaEmitida: null,
            facturaEmitidaUrl: null,
            diasCobroCliente: cliente.diasCobro,
            presupuestoMoraGenerado: null,
            moraSaldada: false,
            ventaDirecta: true // Flag para identificar ventas directas
        };

        // Vincular presupuesto con venta
        nuevoPresupuesto.ventaGeneradaId = ventaId;

        // Guardar en DB
        // 🔥 v7.16.3: si se marcó "cobrado ya", registrar el cobro
        const cobradoYa = document.getElementById('vd-cobradoYa')?.checked || false;
        if (cobradoYa) {
            const fechaCobro = getValorFecha('vd-fechaCobro') || fechaVenta;
            const medioPago = document.getElementById('vd-medioPago')?.value || 'Efectivo';
            const numComprobante = document.getElementById('vd-numComprobante')?.value.trim() || '';

            // Marcar la venta como cobrada
            nuevaVenta.estado = 'cobrado';
            nuevaVenta.fechaCobro = fechaCobro;
            nuevaVenta.medioPago = medioPago;
            nuevaVenta.comprobanteCobro = numComprobante || null;

            // Crear el movimiento de tesorería
            const medioKey = mapearMedioAKey(medioPago);
            const mov = crearMovimiento({
                fecha: fechaCobro,
                tipo: 'ingreso',
                origen: 'venta_cobro',
                origenId: ventaId,
                origenDescripcion: `Cobro venta ${cliente.nombre}`,
                monto: totalFactura,
                medio: medioKey,
                observaciones: numComprobante ? `Comprobante: ${numComprobante}` : ''
            });
            nuevaVenta.movimientoCobroId = mov.id;
        }

        db.ventas.push(nuevaVenta);
        db.presupuestos.push(nuevoPresupuesto);
        guardarDB();

        mostrarNotificacion(`✅ Venta directa creada. Presupuesto interno: ${presupuestoNumero}`, 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ==================== INICIALIZACIÓN ====================
export function initVentasEvents() {
    const select = document.getElementById('mesSelectVentas');
    const estado = document.getElementById('estadoSelectVentas');
    if (select) {
        select.onchange = () => {
            localStorage.setItem('ventasMesFiltro', select.value);
            window.dispatchEvent(new Event('refreshView'));
        };
    }
    if (estado) {
        estado.onchange = () => {
            localStorage.setItem('ventasEstadoFiltro', estado.value);
            window.dispatchEvent(new Event('refreshView'));
        };
    }
}

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

// ==================== AUTOCOMPLETADO DE CLIENTES (v7.16.4) ====================
window.filtrarClientesVenta = (texto, selectId) => {
    const db = getDB();
    const select = document.getElementById(selectId);
    if (!select) return;
    const t = (texto || '').toLowerCase().trim();
    const clientesFiltrados = !t
        ? db.clientes
        : db.clientes.filter(c =>
            (c.nombre || '').toLowerCase().includes(t) ||
            (c.cuit || '').replace(/[-\s]/g, '').includes(t.replace(/[-\s]/g, ''))
        );
    select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
        clientesFiltrados.map(c =>
            `<option value="${c.id}">${escapeHtml(c.nombre)} (${c.diasCobro || 0} días)</option>`
        ).join('');
};

window.abrirModalNuevoClienteVenta = (selectId) => {
    window._selectClienteVentaPendiente = selectId;
    const modalVenta = document.querySelector('.modal');
    if (modalVenta) modalVenta.style.display = 'none';

    if (typeof window.mostrarModalAgregarCliente === 'function') {
        const observer = new MutationObserver(() => {
            let visibleCount = 0;
            document.querySelectorAll('.modal').forEach(m => {
                if (m.style.display !== 'none') visibleCount++;
            });
            if (visibleCount <= 1 && window._selectClienteVentaPendiente) {
                if (modalVenta && document.body.contains(modalVenta)) {
                    modalVenta.style.display = '';
                    const select = document.getElementById(window._selectClienteVentaPendiente);
                    if (select) {
                        const db = getDB();
                        select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
                            db.clientes.map(c =>
                                `<option value="${c.id}">${escapeHtml(c.nombre)} (${c.diasCobro || 0} días)</option>`
                            ).join('');
                        const ultimo = db.clientes[db.clientes.length - 1];
                        if (ultimo) select.value = ultimo.id;
                    }
                    window._selectClienteVentaPendiente = null;
                }
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.mostrarModalAgregarCliente();
    } else {
        mostrarNotificacion('No se pudo abrir el modal de clientes', 'error');
        if (modalVenta) modalVenta.style.display = '';
    }
};

// ==================== CÁLCULO INVERSO VENTA MANUAL (v7.16.4) ====================
window.cambiarTipoFacturaVenta = () => {
    const tipo = document.getElementById('tipoFactura')?.value;
    const ivaSelect = document.getElementById('ivaSelect');
    if (!ivaSelect) return;

    if (tipo === 'C') {
        ivaSelect.value = '0';
        ivaSelect.disabled = true;
    } else {
        ivaSelect.disabled = false;
        if (ivaSelect.value === '0') ivaSelect.value = '21';
    }
    window.calcularDesdeNetoVenta();
};

window.calcularDesdeNetoVenta = () => {
    const netoEl = document.getElementById('montoNeto');
    const ivaSelEl = document.getElementById('ivaSelect');
    const ivaMontoEl = document.getElementById('ivaMonto');
    const totalEl = document.getElementById('totalVenta');
    if (!netoEl || !ivaMontoEl || !totalEl) return;

    const neto = parseFloat(netoEl.value) || 0;
    const ivaPorc = parseFloat(ivaSelEl?.value) || 0;

    const ivaMonto = +(neto * (ivaPorc / 100)).toFixed(2);
    const total = +(neto + ivaMonto).toFixed(2);

    ivaMontoEl.value = ivaMonto.toFixed(2);
    totalEl.value = total.toFixed(2);
};

window.calcularDesdeIVAVenta = () => {
    const netoEl = document.getElementById('montoNeto');
    const ivaSelEl = document.getElementById('ivaSelect');
    const ivaMontoEl = document.getElementById('ivaMonto');
    const totalEl = document.getElementById('totalVenta');
    if (!netoEl || !ivaMontoEl || !totalEl) return;

    const ivaMonto = parseFloat(ivaMontoEl.value) || 0;
    const ivaPorc = parseFloat(ivaSelEl?.value) || 0;

    if (ivaPorc === 0) {
        ivaMontoEl.value = '0.00';
        return;
    }
    const neto = +(ivaMonto / (ivaPorc / 100)).toFixed(2);
    const total = +(neto + ivaMonto).toFixed(2);

    netoEl.value = neto.toFixed(2);
    totalEl.value = total.toFixed(2);
};

window.calcularDesdeTotalVenta = () => {
    const netoEl = document.getElementById('montoNeto');
    const ivaSelEl = document.getElementById('ivaSelect');
    const ivaMontoEl = document.getElementById('ivaMonto');
    const totalEl = document.getElementById('totalVenta');
    if (!netoEl || !ivaMontoEl || !totalEl) return;

    const total = parseFloat(totalEl.value) || 0;
    const ivaPorc = parseFloat(ivaSelEl?.value) || 0;

    if (total <= 0) {
        netoEl.value = '';
        ivaMontoEl.value = '';
        return;
    }
    const neto = +(total / (1 + ivaPorc / 100)).toFixed(2);
    const ivaMonto = +(total - neto).toFixed(2);

    netoEl.value = neto.toFixed(2);
    ivaMontoEl.value = ivaMonto.toFixed(2);
};

// ==================== 🔥 v7.16.40: OCR EN VENTA MANUAL ====================
window.procesarFacturaVenta = async (file) => {
    if (!file) return;

    const status = document.getElementById('ventaOcrStatus');
    if (!status) return;

    status.innerHTML = '⏳ Procesando archivo...';

    window._facturaVentaSeleccionada = file;

    const previewActions = document.getElementById('ventaFacturaPreview');
    const nombreSpan = document.getElementById('ventaFacturaNombre');
    if (previewActions && nombreSpan) {
        nombreSpan.textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' KB)';
        previewActions.classList.remove('hidden');
    }

    try {
        const db = getDB();
        const cuitEmpresa = db && db.datosEmpresa ? db.datosEmpresa.cuit : null;

        const resultado = await procesarArchivoFactura(file, (msg) => {
            status.innerHTML = msg;
        }, cuitEmpresa, 'venta');

        const datos = resultado.datos;
        const fuente = resultado.fuente;

        if (!datos || Object.keys(datos).length === 0) {
            status.innerHTML = '⚠️ No se pudieron leer datos del archivo.';
            return;
        }

        const camposLeidos = [];

        // 1. Tipo de comprobante
        if (datos.tipo) {
            const sel = document.getElementById('tipoFactura');
            if (sel) {
                sel.value = datos.tipo;
                if (typeof window.cambiarTipoFacturaVenta === 'function') {
                    window.cambiarTipoFacturaVenta();
                }
                camposLeidos.push('Tipo: <strong>Factura ' + datos.tipo + '</strong>');
            }
        }

        // 2. Número de factura
        if (datos.numeroFactura) {
            const el = document.getElementById('numFactura');
            if (el && !el.value) {
                el.value = datos.numeroFactura;
                camposLeidos.push('Nº: <strong>' + datos.numeroFactura + '</strong>');
            }
        }

        // 3. Fecha
        if (datos.fecha) {
            const fechaHidden = document.getElementById('fechaVentaHidden');
            const fechaText = document.getElementById('fechaVentaText');
            if (fechaHidden && fechaText) {
                fechaHidden.value = datos.fecha;
                const partes = datos.fecha.split('-');
                const anio = partes[0], mes = partes[1], dia = partes[2];
                fechaText.value = dia + '/' + mes + '/' + anio;
                camposLeidos.push('Fecha: <strong>' + dia + '/' + mes + '/' + anio + '</strong>');
            }
        }

        // 4. Cliente (por CUIT del receptor)
        // 🔥 v7.16.41: si no existe el cliente, ofrecer crearlo automáticamente
        const cuitCliente = datos.cuitCliente || null;
        const razonCliente = datos.razonSocialCliente || datos.razonSocial || '';
        if (cuitCliente && cuitEmpresa) {
            const cuitEmpresaNorm = String(cuitEmpresa).replace(/[-\s]/g, '');
            const cuitClienteNorm = String(cuitCliente).replace(/[-\s]/g, '');

            if (cuitClienteNorm !== cuitEmpresaNorm) {
                const clienteEncontrado = (db.clientes || []).find(c =>
                    String(c.cuit || '').replace(/[-\s]/g, '') === cuitClienteNorm
                );
                if (clienteEncontrado) {
                    // Cliente existe → autoseleccionar
                    const sel = document.getElementById('clienteId');
                    if (sel) {
                        sel.value = clienteEncontrado.id;
                        camposLeidos.push('Cliente: <strong>' + clienteEncontrado.nombre + '</strong>');
                    }
                } else {
                    // Cliente NO existe → ofrecer crearlo automáticamente
                    camposLeidos.push('⚠️ Cliente NO encontrado (CUIT ' + cuitCliente + ')');
                    // Guardar los datos para el botón "crear cliente"
                    window._clienteOCR = {
                        nombre: razonCliente || ('Cliente ' + cuitCliente),
                        cuit: cuitCliente,
                        condicionIVA: datos.tipo === 'A' ? 'IVA Responsable Inscripto' : ''
                    };
                    // Mostrar botón "Crear cliente" en el status
                    setTimeout(() => {
                        const status = document.getElementById('ventaOcrStatus');
                        if (status && !document.getElementById('btnCrearClienteOCR')) {
                            const btnDiv = document.createElement('div');
                            btnDiv.innerHTML = '<button id="btnCrearClienteOCR" type="button" onclick="window.crearClienteDesdeOCR()" class="mt-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs">➕ Crear cliente: ' + (razonCliente || cuitCliente) + '</button>';
                            status.appendChild(btnDiv);
                        }
                    }, 100);
                }
            }
        }

        // 5. Neto, IVA, Total
        if (datos.subtotal !== undefined) {
            const el = document.getElementById('montoNeto');
            if (el) el.value = datos.subtotal.toFixed(2);
            camposLeidos.push('Neto: <strong>$' + formatNumber(datos.subtotal) + '</strong>');
        }
        if (datos.iva !== undefined) {
            const el = document.getElementById('ivaMonto');
            if (el) el.value = datos.iva.toFixed(2);
            if (datos.iva > 0) camposLeidos.push('IVA: <strong>$' + formatNumber(datos.iva) + '</strong>');
        }
        if (datos.total !== undefined) {
            const el = document.getElementById('totalVenta');
            if (el) el.value = datos.total.toFixed(2);
            camposLeidos.push('Total: <strong>$' + formatNumber(datos.total) + '</strong>');
        }

        const fuenteLabel = fuente === 'pdf.js' ? '📄 PDF' : '🔍 OCR';
        let html = '<div class="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg p-3 mt-2">';
        html += '<p class="font-bold text-green-700 dark:text-green-300 mb-1">✅ ' + fuenteLabel + ' — Datos leídos (' + camposLeidos.length + ' campos)</p>';
        html += '<ul class="text-xs text-gray-600 dark:text-gray-400 space-y-0.5 list-disc list-inside">';
        camposLeidos.forEach(c => { html += '<li>' + c + '</li>'; });
        html += '</ul>';
        html += '<p class="text-xs text-blue-600 mt-2">💡 Revisá los datos y corregí si algo está mal antes de guardar.</p>';
        html += '</div>';
        status.innerHTML = html;

        mostrarNotificacion('✅ ' + camposLeidos.length + ' campos leídos', 'success');

    } catch (e) {
        console.error('Error procesando factura venta:', e);
        status.innerHTML = '❌ Error: ' + e.message;
        mostrarNotificacion('Error al leer el archivo', 'error');
    }
};

window.quitarFacturaVenta = () => {
    window._facturaVentaSeleccionada = null;
    const preview = document.getElementById('ventaFacturaPreview');
    if (preview) preview.classList.add('hidden');
    const status = document.getElementById('ventaOcrStatus');
    if (status) status.innerHTML = '';
    const inp1 = document.getElementById('ventaOcrInput');
    const inp2 = document.getElementById('ventaOcrInputFile');
    if (inp1) inp1.value = '';
    if (inp2) inp2.value = '';
    mostrarNotificacion('🗑️ Factura quitada', 'info');
};

window.verVistaPreviaFacturaVenta = () => {
    const file = window._facturaVentaSeleccionada;
    if (!file) { mostrarNotificacion('No hay archivo para ver', 'warning'); return; }

    const url = URL.createObjectURL(file);
    const esImagen = file.type.indexOf('image/') === 0;
    const esPDF = file.type === 'application/pdf' || file.name.toLowerCase().indexOf('.pdf') !== -1;

    let contenidoHtml = '';
    if (esImagen) {
        contenidoHtml = '<img src="' + url + '" style="max-width:100%;max-height:70vh;object-fit:contain;">';
    } else if (esPDF) {
        contenidoHtml = '<iframe src="' + url + '" style="width:100%;height:70vh;border:none;"></iframe>';
    } else {
        contenidoHtml = '<p class="p-8 text-gray-500">Tipo no soportado</p>';
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '200';
    modal.innerHTML = '<div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">' +
        '<h2 class="text-xl font-bold mb-3 text-center">👁️ Vista previa - Factura emitida</h2>' +
        '<div class="bg-gray-100 dark:bg-gray-900 rounded-lg p-2 text-center" style="min-height:60vh;">' + contenidoHtml + '</div>' +
        '<button onclick="this.closest(\'.modal\').remove();" class="mt-3 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">Cerrar</button>' +
        '</div>';
    document.body.appendChild(modal);
};

// ==================== 🔥 v7.16.47: EDITAR VENTA ====================
window.editarVenta = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const clientes = db.clientes || [];
    const opcionesClientes = clientes.map(c =>
        '<option value="' + c.id + '"' + (c.id === venta.clienteId ? ' selected' : '') + '>' + escapeHtml(c.nombre) + '</option>'
    ).join('');

    const tipoActual = venta.tipoComprobante || 'A';
    const opcionesTipo = ['A', 'B', 'C'].map(t =>
        '<option value="' + t + '"' + (t === tipoActual ? ' selected' : '') + '>Factura ' + t + '</option>'
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '200';
    modal.innerHTML =
        '<div class="modal-content w-full max-w-3xl max-h-[90vh] overflow-y-auto">' +
        '<h2 class="text-xl font-bold mb-4 text-center">✏️ Editar Venta</h2>' +
        '<div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl mb-3 text-sm">' +
        '<p><strong>ID:</strong> <code class="text-xs">' + venta.id + '</code></p>' +
        '</div>' +

        // 🔥 v7.22.45: sección especial para ventas agrupadas
        (venta.esVentaAgrupada ? (
            '<div class="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl mb-3 border-l-4 border-indigo-500">' +
            '<p class="font-bold text-indigo-800 dark:text-indigo-200">📦 Venta agrupada (' + (venta.presupuestosOrigenNumeros || []).length + ' presupuestos)</p>' +
            '<p class="text-xs text-indigo-600 dark:text-indigo-300">' + (venta.presupuestosOrigenNumeros || []).join(', ') + '</p>' +
            '<div class="mt-2 text-xs space-y-1">' +
            '<div class="flex justify-between"><span>Suma de presupuestos:</span><strong>$' + formatNumber(venta.totalPresupuestos || 0) + '</strong></div>' +
            '<div class="flex justify-between"><span>Total OC:</span><strong>$' + formatNumber(venta.ocClienteTotal || venta.total) + '</strong></div>' +
            '<div class="flex justify-between"><span>Ajuste por redondeo:</span><strong class="' + ((venta.ajusteRedondeo && Math.abs(venta.ajusteRedondeo) > 0.001) ? (venta.ajusteRedondeo > 0 ? 'text-green-600' : 'text-orange-600') : 'text-green-600') + '">' +
                (venta.ajusteRedondeo && Math.abs(venta.ajusteRedondeo) > 0.001 ? ((venta.ajusteRedondeo > 0 ? '+' : '') + '$' + formatNumber(venta.ajusteRedondeo)) : '✅ Sin diferencia') +
            '</strong></div>' +
            '</div>' +
            '<div class="mt-2 flex gap-2 flex-wrap">' +
            '<button type="button" onclick="document.querySelector(\'.modal\')?.remove(); window.editarOCVentaAgrupada(\'' + venta.id + '\')" class="bg-blue-600 text-white px-2 py-1 rounded text-xs">' +
                (venta.ocArchivoUrl ? '✏️ Editar OC' : '📎 Cargar OC') +
            '</button>' +
            '<button type="button" onclick="document.querySelector(\'.modal\')?.remove(); window.editarPresupuestosVentaAgrupada(\'' + venta.id + '\')" class="bg-indigo-600 text-white px-2 py-1 rounded text-xs">' +
                '✏️ Editar presupuestos' +
            '</button>' +
            '</div>' +
            (venta.ocArchivoUrl ? '<p class="text-xs mt-1"><a href="' + venta.ocArchivoUrl + '" target="_blank" class="text-blue-600 underline">📎 Ver OC adjunta</a></p>' : '') +
            (venta.ocClienteNumero ? '<p class="text-xs mt-1">📋 Nº OC: <strong>' + escapeHtml(venta.ocClienteNumero) + '</strong></p>' : '') +
            (venta.fechaRecepcionOC ? '<p class="text-xs">📅 Fecha recepción OC: ' + formatDate(venta.fechaRecepcionOC) + '</p>' : '') +
            '</div>'
        ) : '') +

        // 🔥 v7.16.68: selector de estado
        '<div class="grid grid-cols-2 gap-3 mb-3">' +
        '<div>' +
        '<label class="block text-sm font-medium mb-1">📌 Estado</label>' +
        '<select id="editV-estado" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" onchange="document.getElementById(\'editV-cobroFields\').classList.toggle(\'hidden\', this.value !== \'cobrado\')">' +
        '<option value="pendiente_cobro"' + (venta.estado === 'pendiente_cobro' ? ' selected' : '') + '>⏳ Pendiente de cobro</option>' +
        '<option value="cobrado"' + (venta.estado === 'cobrado' ? ' selected' : '') + '>✅ Cobrado</option>' +
        '</select>' +
        '</div>' +
        '</div>' +

        // 🔥 v7.16.68: campos de cobro (visibles solo si está cobrado)
        '<div id="editV-cobroFields" class="' + (venta.estado === 'cobrado' ? '' : 'hidden') + ' grid grid-cols-2 gap-3 mb-3">' +
        '<div><label class="block text-sm font-medium mb-1">📅 Fecha de cobro real</label>' +
        inputFechaHTML('editV-fechaCobroNuevo', venta.fechaCobro || '', { label: '' }) + '</div>' +
        '<div><label class="block text-sm font-medium mb-1">💳 Medio de pago</label>' +
        '<select id="editV-medioPagoNuevo" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">' +
        ['Transferencia', 'Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Cheque', 'Otro'].map(m =>
            '<option value="' + m + '"' + (m === (venta.medioPago || 'Transferencia') ? ' selected' : '') + '>' + m + '</option>'
        ).join('') + '</select></div>' +
        '</div>' +
        '<div class="space-y-3">' +
        '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-sm font-medium mb-1">👤 Cliente</label>' +
        '<select id="editV-clienteId" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">' +
        '<option value="">Seleccionar...</option>' + opcionesClientes +
        '</select></div>' +
        '<div><label class="block text-sm font-medium mb-1">📄 Tipo comprobante</label>' +
        '<select id="editV-tipoFactura" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">' +
        opcionesTipo + '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-sm font-medium mb-1">📅 Fecha venta</label>' +
        inputFechaHTML('editV-fechaVenta', venta.fechaVenta || '', { label: '' }) + '</div>' +
        '<div><label class="block text-sm font-medium mb-1">🧾 Nº Factura</label>' +
        '<input type="text" id="editV-numFactura" value="' + escapeHtml(venta.numFacturaEmitida || venta.numComprobante || '') + '" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-3">' +
        '<div><label class="block text-sm font-medium mb-1">💰 Neto</label>' +
        '<input type="number" id="editV-montoNeto" value="' + (venta.montoNeto || 0) + '" step="0.01" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>' +
        '<div><label class="block text-sm font-medium mb-1">🧾 IVA</label>' +
        '<input type="number" id="editV-ivaMonto" value="' + (venta.ivaMonto || 0) + '" step="0.01" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>' +
        '<div><label class="block text-sm font-medium mb-1">💰 Total</label>' +
        '<input type="number" id="editV-total" value="' + (venta.total || 0) + '" step="0.01" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-sm font-medium mb-1">📅 Fecha cobro esperada</label>' +
        inputFechaHTML('editV-fechaCobroEsperada', venta.fechaCobroEsperada || '', { label: '' }) + '</div>' +
        '<div><label class="block text-sm font-medium mb-1">📅 Fecha cobro real</label>' +
        inputFechaHTML('editV-fechaCobro', venta.fechaCobro || '', { label: '' }) + '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-sm font-medium mb-1">💳 Medio de pago</label>' +
        '<select id="editV-medioPago" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">' +
        ['', 'efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'cheque', 'otro'].map(m =>
            '<option value="' + m + '"' + (m === (venta.medioPago || '') ? ' selected' : '') + '>' + (m || 'Sin definir') + '</option>'
        ).join('') + '</select></div>' +
        '<div><label class="block text-sm font-medium mb-1">💰 Interés por mora</label>' +
        '<input type="number" id="editV-interesMora" value="' + (venta.interesMora || 0) + '" step="0.01" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>' +
        '</div>' +
        '<div id="editV-moraFeedback" class="p-2 rounded-lg text-xs bg-gray-50 dark:bg-gray-700"></div>' +
        '<div><label class="block text-sm font-medium mb-1">📝 Observaciones</label>' +
        '<textarea id="editV-observaciones" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">' + escapeHtml(venta.observaciones || '') + '</textarea></div>' +
        '</div>' +

        // 🔥 v7.16.90: Vínculos con compras (template literals para evitar errores de comillas)
        '<div class="border-t pt-3 mt-3 space-y-3">' +
        '<h3 class="text-sm font-bold">🔗 Compras vinculadas</h3>' +
        '<div id="editV-comprasVinculadas">' +
        (venta.comprasVinculadas && venta.comprasVinculadas.length > 0
            ? venta.comprasVinculadas.map(cv =>
                `<div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg mb-1">
                    <div class="flex-1">
                        <div class="text-sm font-semibold">${escapeHtml(cv.proveedorNombre || 'Proveedor')}</div>
                        <div class="text-xs text-gray-500">${cv.fechaEmision ? formatDate(cv.fechaEmision) : '-'} • $${formatNumber(cv.total || 0)}</div>
                    </div>
                    <button type="button" onclick="window.desvincularCompraDeVenta('${venta.id}', '${cv.compraId}')" class="text-red-600 hover:text-red-800 text-sm px-2">✕</button>
                </div>`
            ).join('')
            : '<p class="text-xs text-gray-500">No hay compras vinculadas.</p>'
        ) +
        '</div>' +
        `<button type="button" onclick="window.vincularComprasAVenta('${venta.id}')" class="mt-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs">+ 🔗 Vincular compra</button>` +
        '</div>' +

        // 🔥 v7.16.64: Archivos adjuntos
        '<div class="border-t pt-3 mt-3 space-y-3">' +
        '<h3 class="text-sm font-bold">📎 Archivos adjuntos</h3>' +
        '<div>' +
        '<label class="block text-xs font-medium mb-1">📄 Factura emitida</label>' +
        '<div class="flex gap-2 flex-wrap">' +
        (venta.facturaEmitidaUrl
            ? '<button type="button" onclick="window.verArchivo(\'' + venta.id + '\', \'facturaEmitidaUrl\')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs">👁️ Ver factura</button>' +
              '<button type="button" onclick="window.quitarFacturaVentaEdit()" class="bg-red-600 text-white px-3 py-1 rounded text-xs">🗑️ Quitar</button>'
            : '<button type="button" onclick="document.getElementById(\'editV-facturaInput\').click()" class="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded text-xs">📁 Subir factura</button>'
        ) +
        '</div>' +
        '<input type="file" id="editV-facturaInput" accept="image/*,.pdf" class="hidden" onchange="window.subirFacturaVentaEdit(this.files[0])">' +
        (venta.facturaEmitidaNombre ? '<p class="text-xs text-gray-500 mt-1">📎 ' + escapeHtml(venta.facturaEmitidaNombre) + '</p>' : '') +
        '</div>' +
        '<div>' +
        '<label class="block text-xs font-medium mb-1">💳 Comprobante de cobro</label>' +
        '<div class="flex gap-2 flex-wrap">' +
        (venta.comprobanteCobroUrl
            ? '<button type="button" onclick="window.verArchivo(\'' + venta.id + '\', \'comprobanteCobroUrl\')" class="bg-green-600 text-white px-3 py-1 rounded text-xs">👁️ Ver comprobante</button>' +
              '<button type="button" onclick="window.quitarComprobanteVentaEdit()" class="bg-red-600 text-white px-3 py-1 rounded text-xs">🗑️ Quitar</button>'
            : '<button type="button" onclick="document.getElementById(\'editV-comprobanteInput\').click()" class="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded text-xs">📁 Subir comprobante</button>'
        ) +
        '</div>' +
        '<input type="file" id="editV-comprobanteInput" accept="image/*,.pdf" class="hidden" onchange="window.subirComprobanteVentaEdit(this.files[0])">' +
        (venta.comprobanteCobroNombre ? '<p class="text-xs text-gray-500 mt-1">📎 ' + escapeHtml(venta.comprobanteCobroNombre) + '</p>' : '') +
        '</div>' +
        '</div>' +

        '<div class="flex gap-2 mt-5">' +
        '<button id="editV-guardar" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl">✅ Guardar cambios</button>' +
        '<button id="editV-cancelar" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>' +
        '</div>' +
        '</div>';

    document.body.appendChild(modal);

    // 🔥 v7.16.64: guardar ventaId en el botón
    const btnGuardarEdit = modal.querySelector('#editV-guardar');
    if (btnGuardarEdit) btnGuardarEdit.dataset.ventaId = ventaId;

    // 🔥 v7.16.49: inicializar los 3 inputs de fecha con el helper
    initInputFecha('editV-fechaVenta');
    initInputFecha('editV-fechaCobroEsperada');
    initInputFecha('editV-fechaCobro');

    const _recalcularMora = () => {
        const fechaCobroReal = getValorFecha('editV-fechaCobro');
        const fechaEsperada = getValorFecha('editV-fechaCobroEsperada');
        const total = parseFloat(modal.querySelector('#editV-total').value) || 0;
        const feedback = modal.querySelector('#editV-moraFeedback');
        const inputInteres = modal.querySelector('#editV-interesMora');

        if (!fechaCobroReal || !fechaEsperada || total <= 0) {
            feedback.innerHTML = '<span class="text-gray-500">💡 Completá las fechas y el total para calcular la mora automáticamente.</span>';
            feedback.className = 'p-2 rounded-lg text-xs bg-gray-50 dark:bg-gray-700';
            return;
        }

        const diasDiff = Math.ceil((new Date(fechaCobroReal) - new Date(fechaEsperada)) / (1000 * 60 * 60 * 24));

        if (diasDiff <= 0) {
            if (parseFloat(inputInteres.value) > 0) inputInteres.value = '0.00';
            feedback.innerHTML = '<span class="text-green-700 font-bold">✅ Sin mora — cobro dentro del plazo (' + Math.abs(diasDiff) + ' día/s antes o en fecha).</span>';
            feedback.className = 'p-2 rounded-lg text-xs bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700';
        } else {
            const porcentaje = db.configuracion?.porcentajeRecargoMora || 5;
            const moraCalculada = +(total * (porcentaje / 100)).toFixed(2);
            if (parseFloat(inputInteres.value) !== moraCalculada) inputInteres.value = moraCalculada.toFixed(2);
            feedback.innerHTML = '<span class="text-red-700 font-bold">⚠️ Cobro con ' + diasDiff + ' días de atraso — Mora calculada (' + porcentaje + '%): $' + formatNumber(moraCalculada) + '</span>';
            feedback.className = 'p-2 rounded-lg text-xs bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700';
        }
    };

    // Los listeners van sobre los inputs hidden (que el helper usa)
    modal.querySelector('#editV-fechaCobroHidden')?.addEventListener('change', _recalcularMora);
    modal.querySelector('#editV-fechaCobroEsperadaHidden')?.addEventListener('change', _recalcularMora);
    modal.querySelector('#editV-total').addEventListener('input', _recalcularMora);
    setTimeout(_recalcularMora, 100);

    modal.querySelector('#editV-guardar').onclick = () => {
        const clienteIdNuevo = parseInt(modal.querySelector('#editV-clienteId').value);
        const clienteNuevo = db.clientes.find(c => c.id === clienteIdNuevo);

        if (clienteNuevo) {
            venta.clienteId = clienteNuevo.id;
            venta.clienteNombre = clienteNuevo.nombre;
        }
        venta.tipoComprobante = modal.querySelector('#editV-tipoFactura').value;
        venta.fechaVenta = getValorFecha('editV-fechaVenta') || venta.fechaVenta;
        venta.numFacturaEmitida = modal.querySelector('#editV-numFactura').value.trim();
        venta.numComprobante = venta.numFacturaEmitida;
        venta.montoNeto = parseFloat(modal.querySelector('#editV-montoNeto').value) || 0;
        venta.ivaMonto = parseFloat(modal.querySelector('#editV-ivaMonto').value) || 0;
        venta.total = parseFloat(modal.querySelector('#editV-total').value) || 0;
        venta.fechaCobroEsperada = getValorFecha('editV-fechaCobroEsperada') || null;
        venta.fechaCobro = getValorFecha('editV-fechaCobro') || null;
        venta.medioPago = modal.querySelector('#editV-medioPago').value || null;

        const interesNuevoManual = parseFloat(modal.querySelector('#editV-interesMora').value) || 0;
        const interesAnterior = venta.interesMora || 0;

        let interesFinal = interesNuevoManual;
        if (venta.fechaCobro && venta.fechaCobroEsperada && venta.total > 0) {
            const diasDiff = Math.ceil((new Date(venta.fechaCobro) - new Date(venta.fechaCobroEsperada)) / (1000 * 60 * 60 * 24));
            if (diasDiff <= 0) {
                interesFinal = 0;
            } else if (interesNuevoManual === 0) {
                const porcentaje = db.configuracion?.porcentajeRecargoMora || 5;
                interesFinal = +(venta.total * (porcentaje / 100)).toFixed(2);
            }
        }

        if (interesFinal === 0 && interesAnterior > 0) {
            if (venta.presupuestoMoraGenerado) {
                const presMora = db.presupuestos.find(p => String(p.id) === String(venta.presupuestoMoraGenerado));
                if (presMora) {
                    db.presupuestos = db.presupuestos.filter(p => String(p.id) !== String(presMora.id));
                    mostrarNotificacion('🗑️ Presupuesto ' + presMora.numero + ' eliminado', 'info');
                }
                venta.presupuestoMoraGenerado = null;
            }
            venta.interesMora = null;
            venta.moraSaldada = false;
        } else {
            venta.interesMora = interesFinal > 0 ? interesFinal : null;
        }

        venta.observaciones = modal.querySelector('#editV-observaciones').value.trim() || null;
        venta.mes = venta.fechaVenta ? venta.fechaVenta.substring(0, 7) : venta.mes;

        // 🔥 v7.16.51: actualizar el movimiento de tesorería asociado al cobro
        if (venta.estado === 'cobrado' && venta.movimientoCobroId) {
            const movExistente = (db.movimientos || []).find(m => String(m.id) === String(venta.movimientoCobroId));
            if (movExistente) {
                // Recalcular impuesto al cheque con la nueva alícuota y monto
                const alicuotaImpCheque = db.configuracion?.alicuotaImpuestoCheque ?? 0.6;
                const aplicaImpuesto = movExistente.medio !== 'efectivo' && movExistente.medio !== 'otro';
                const impuestoMonto = aplicaImpuesto ? +(venta.total * (alicuotaImpCheque / 100)).toFixed(2) : 0;

                movExistente.monto = venta.total;
                movExistente.fecha = venta.fechaCobro || movExistente.fecha;
                movExistente.mes = (venta.fechaCobro || movExistente.fecha).substring(0, 7);
                movExistente.impuestoDebitoCredito = {
                    aplica: aplicaImpuesto,
                    tasa: alicuotaImpCheque,
                    monto: impuestoMonto
                };
                movExistente.montoNeto = +(venta.total - impuestoMonto).toFixed(2);
                movExistente.origenDescripcion = `Cobro venta ${venta.clienteNombre || ''}`.trim();
                console.log('✅ Movimiento de cobro actualizado:', movExistente.id);
            }
        }

        guardarDB();
        mostrarNotificacion('✅ Venta actualizada', 'success');
        modal.remove();
        window.dispatchEvent(new Event('refreshView'));
    };

    modal.querySelector('#editV-cancelar').onclick = () => modal.remove();
};

// ==================== 🔥 v7.16.47: QUITAR INTERÉS POR MORA ====================
window.quitarInteresMora = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const tienePresupuesto = !!venta.presupuestoMoraGenerado;
    const mensaje = '¿Quitar el interés por mora de $' + formatNumber(venta.interesMora || 0) + '?' +
        (tienePresupuesto ? ' También se eliminará el presupuesto de mora asociado.' : '');

    if (!confirm(mensaje)) return;

    if (venta.presupuestoMoraGenerado) {
        const presMora = db.presupuestos.find(p => String(p.id) === String(venta.presupuestoMoraGenerado));
        if (presMora) {
            db.presupuestos = db.presupuestos.filter(p => String(p.id) !== String(presMora.id));
            mostrarNotificacion('🗑️ Presupuesto ' + presMora.numero + ' eliminado', 'info');
        }
        venta.presupuestoMoraGenerado = null;
    }

    venta.interesMora = null;
    venta.moraSaldada = false;

    if (venta.estado === 'cobrado' && venta.total) {
        const comision = venta.comisionTarjeta || 0;
        venta.netoRecibido = venta.total - (venta.total * comision / 100);
    }

    guardarDB();
    mostrarNotificacion('✅ Interés por mora eliminado', 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== 🔥 v7.16.64: ARCHIVOS EN EDITAR VENTA ====================
function _getVentaIdFromModalEdit() {
    const modal = document.querySelector('.modal');
    const btn = modal?.querySelector('#editV-guardar');
    return btn?.dataset?.ventaId || null;
}

window.subirFacturaVentaEdit = async (file) => {
    if (!file) return;
    const ventaId = _getVentaIdFromModalEdit();
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }
    try {
        // 🔥 v7.16.83: subir a Storage (NO base64)
        const fileComprimido = await comprimirImagen(file);
        const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
        const empresaId = getEmpresaActual() || 'empresa_principal';
        const ruta = `${empresaId}/ventas/${venta.id}_factura_${Date.now()}.${ext}`;
        venta.facturaEmitidaUrl = await subirArchivo(ruta, fileComprimido);
        venta.facturaEmitidaNombre = fileComprimido.name;
        guardarDB();
        mostrarNotificacion('✅ Factura adjuntada', 'success');
        document.querySelector('.modal')?.remove();
        window.editarVenta(ventaId);
    } catch (e) {
        console.error('❌ Error subiendo factura:', e);
        mostrarNotificacion('Error subiendo factura: ' + e.message, 'error');
    }
};

window.quitarFacturaVentaEdit = async () => {
    const confirmado = await confirmarAccion({
        titulo: '🗑️ Quitar factura',
        mensaje: '¿Quitar la factura adjunta?<br><br>El archivo se eliminará de la venta.',
        textoConfirmar: '🗑️ Sí, quitar',
        icono: '📄'
    });
    if (!confirmado) return;
    const ventaId = _getVentaIdFromModalEdit();
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) return;
    venta.facturaEmitidaUrl = null;
    venta.facturaEmitidaNombre = null;
    guardarDB();
    mostrarNotificacion('🗑️ Factura quitada', 'info');
    document.querySelector('.modal')?.remove();
    window.editarVenta(ventaId);
};

window.subirComprobanteVentaEdit = async (file) => {
    if (!file) return;
    const ventaId = _getVentaIdFromModalEdit();
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }
    try {
        // 🔥 v7.16.83: subir a Storage (NO base64)
        const fileComprimido = await comprimirImagen(file);
        const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
        const empresaId = getEmpresaActual() || 'empresa_principal';
        const ruta = `${empresaId}/ventas/${venta.id}_comprobante_${Date.now()}.${ext}`;
        venta.comprobanteCobroUrl = await subirArchivo(ruta, fileComprimido);
        venta.comprobanteCobroNombre = fileComprimido.name;
        guardarDB();
        mostrarNotificacion('✅ Comprobante adjuntado', 'success');
        document.querySelector('.modal')?.remove();
        window.editarVenta(ventaId);
    } catch (e) {
        console.error('❌ Error subiendo comprobante:', e);
        mostrarNotificacion('Error subiendo comprobante: ' + e.message, 'error');
    }
};

window.quitarComprobanteVentaEdit = async () => {
    const confirmado = await confirmarAccion({
        titulo: '🗑️ Quitar comprobante',
        mensaje: '¿Quitar el comprobante adjunto?<br><br>El archivo se eliminará de la venta.',
        textoConfirmar: '🗑️ Sí, quitar',
        icono: '💳'
    });
    if (!confirmado) return;
    const ventaId = _getVentaIdFromModalEdit();
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) return;
    venta.comprobanteCobroUrl = null;
    venta.comprobanteCobroNombre = null;
    guardarDB();
    mostrarNotificacion('🗑️ Comprobante quitado', 'info');
    document.querySelector('.modal')?.remove();
    window.editarVenta(ventaId);
};

// ==================== 🔥 v7.16.66: VER ARCHIVO (factura/comprobante) ====================
window.verArchivo = (ventaId, campo) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const dataUrl = venta[campo];
    if (!dataUrl) { mostrarNotificacion('No hay archivo para ver', 'warning'); return; }

    // 🔥 v7.24.8: Detectar si es URL de Storage o data URL (base64)
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        // Es una URL de Firebase Storage → abrir directamente
        window.open(dataUrl, '_blank');
        return;
    }

    // Si es data URL (base64), convertir a Blob
    try {
        const partes = dataUrl.split(',');
        if (partes.length !== 2) {
            mostrarNotificacion('Archivo inválido', 'error');
            return;
        }

        const matchMime = partes[0].match(/data:([^;]+);/);
        const mimeType = matchMime ? matchMime[1] : 'application/octet-stream';
        const base64 = partes[1];
        const binario = atob(base64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) {
            bytes[i] = binario.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);

        if (mimeType.startsWith('image/')) {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.zIndex = '9999';
            modal.innerHTML = `
                <div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    <h2 class="text-xl font-bold mb-3 text-center">👁️ ${campo === 'facturaEmitidaUrl' ? 'Factura emitida' : 'Comprobante de cobro'}</h2>
                    <div class="bg-gray-100 dark:bg-gray-900 rounded-lg p-2 text-center">
                        <img src="${url}" style="max-width:100%;max-height:70vh;object-fit:contain;">
                    </div>
                    <button onclick="this.closest('.modal').remove();" class="mt-3 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">Cerrar</button>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            window.open(url, '_blank');
        }
    } catch (err) {
        console.error('Error al abrir archivo:', err);
        mostrarNotificacion('Error al abrir archivo: ' + err.message, 'error');
    }
};

// ==================== 🔥 v7.16.70: MODAL DE CONFIRMACIÓN REUTILIZABLE ====================
window.confirmarAccion = (opciones) => {
    return new Promise((resolve) => {
        const {
            titulo = '⚠️ Confirmar',
            mensaje = '¿Estás seguro?',
            textoConfirmar = '✅ Confirmar',
            colorConfirmar = 'bg-red-600 hover:bg-red-700',
            textoCancelar = '❌ Cancelar',
            icono = '⚠️'
        } = opciones;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-content w-full max-w-md">
                <div class="text-center mb-4">
                    <div class="text-5xl mb-2">${icono}</div>
                    <h2 class="text-xl font-bold text-gray-800 dark:text-white">${titulo}</h2>
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
                    <div class="text-sm text-gray-700 dark:text-gray-300 text-center">${mensaje}</div>
                </div>
                <div class="flex gap-3">
                    <button id="confirmarAccionSi" class="flex-1 ${colorConfirmar} text-white py-3 rounded-xl font-bold">${textoConfirmar}</button>
                    <button id="confirmarAccionNo" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-800 dark:text-white py-3 rounded-xl">${textoCancelar}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const cerrar = (resultado) => {
            modal.remove();
            resolve(resultado);
        };

        modal.querySelector('#confirmarAccionSi').onclick = () => cerrar(true);
        modal.querySelector('#confirmarAccionNo').onclick = () => cerrar(false);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrar(false);
        });
    });
};

// ==================== 🔥 v7.16.89: VINCULAR COMPRAS A VENTA ====================
window.vincularComprasAVenta = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    // Inicializar array si no existe
    if (!venta.comprasVinculadas) venta.comprasVinculadas = [];

    // IDs ya vinculados (para no duplicar)
    const yaVinculados = new Set(venta.comprasVinculadas.map(cv => String(cv.compraId)));

    // Lista de compras disponibles
    const comprasDisponibles = db.compras.filter(c => !yaVinculados.has(String(c.id)));

    if (comprasDisponibles.length === 0) {
        mostrarNotificacion('No hay compras disponibles para vincular (o ya están todas vinculadas)', 'info');
        return;
    }

    // Modal de selección múltiple
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalVincularCompras';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3 text-center">🔗 Vincular Compras a esta Venta</h2>
            <p class="text-sm text-gray-500 mb-3 text-center">Venta: <strong>${escapeHtml(venta.clienteNombre || '')}</strong> - $${formatNumber(venta.total)}</p>

            <div class="space-y-2 mb-4">
                ${comprasDisponibles.map(c => `
                    <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                        <input type="checkbox" class="vinc-compra-checkbox w-5 h-5" value="${c.id}">
                        <div class="flex-1">
                            <div class="font-semibold">${escapeHtml(c.proveedorNombre || 'Sin proveedor')}</div>
                            <div class="text-xs text-gray-500">
                                ${c.fechaEmision ? formatDate(c.fechaEmision) : '-'} • 
                                ${c.tipoFactura ? 'Factura ' + c.tipoFactura : ''} • 
                                $${formatNumber(c.totalFactura || 0)}
                            </div>
                        </div>
                    </label>
                `).join('')}
            </div>

            <div class="flex gap-3">
                <button onclick="window.confirmarVinculacionCompras('${ventaId}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl font-bold">
                    ✅ Vincular seleccionadas
                </button>
                <button onclick="document.getElementById('modalVincularCompras').remove()" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                    ❌ Cancelar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.confirmarVinculacionCompras = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const checkboxes = document.querySelectorAll('.vinc-compra-checkbox:checked');
    if (checkboxes.length === 0) {
        mostrarNotificacion('No seleccionaste ninguna compra', 'warning');
        return;
    }

    if (!venta.comprasVinculadas) venta.comprasVinculadas = [];

    let vinculadas = 0;
    checkboxes.forEach(cb => {
        const compraId = cb.value;
        const compra = db.compras.find(c => String(c.id) === String(compraId));
        if (!compra) return;

        // Verificar que no esté ya vinculada
        if (venta.comprasVinculadas.some(cv => String(cv.compraId) === String(compraId))) return;

        // Agregar vínculo en la venta
        venta.comprasVinculadas.push({
            compraId: compraId,
            proveedorNombre: compra.proveedorNombre,
            fechaEmision: compra.fechaEmision,
            total: compra.totalFactura,
            tipoFactura: compra.tipoFactura
        });

        // Agregar vínculo inverso en la compra
        if (!compra.ventasVinculadasIds) compra.ventasVinculadasIds = [];
        if (!compra.ventasVinculadasIds.includes(String(ventaId))) {
            compra.ventasVinculadasIds.push(String(ventaId));
        }

        vinculadas++;
    });

    guardarDB();
    document.getElementById('modalVincularCompras').remove();
    mostrarNotificacion(`✅ ${vinculadas} compra(s) vinculada(s)`, 'success');
    window.dispatchEvent(new Event('refreshView'));

    // Reabrir el detalle de la venta con los nuevos vínculos
    setTimeout(() => window.verDetalleVenta(ventaId), 200);
};

window.desvincularCompraDeVenta = async (ventaId, compraId) => {
    const confirmado = await confirmarAccion({
        titulo: '🔗 Desvincular compra',
        mensaje: '¿Desvincular esta compra de la venta?<br><br>No se elimina la compra, solo el vínculo.',
        textoConfirmar: '🔗 Sí, desvincular',
        icono: '🔗'
    });
    if (!confirmado) return;

    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    const compra = db.compras.find(c => String(c.id) === String(compraId));

    if (venta && venta.comprasVinculadas) {
        venta.comprasVinculadas = venta.comprasVinculadas.filter(cv => String(cv.compraId) !== String(compraId));
    }
    if (compra && compra.ventasVinculadasIds) {
        compra.ventasVinculadasIds = compra.ventasVinculadasIds.filter(id => String(id) !== String(ventaId));
    }

    guardarDB();
    mostrarNotificacion('🔗 Compra desvinculada', 'info');
    window.dispatchEvent(new Event('refreshView'));

    setTimeout(() => window.verDetalleVenta(ventaId), 200);
};

// ==================== 🔥 v7.22.44: EDITAR OC EN VENTA AGRUPADA ====================
window.editarOCVentaAgrupada = async (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta || !venta.esVentaAgrupada) {
        mostrarNotificacion('Venta agrupada no encontrada', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">📎 Orden de Compra - Venta agrupada</h2>
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3 text-sm">
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Número OC:</label>
                        <input type="text" id="editOcNumero" value="${escapeHtml(venta.ocClienteNumero || venta.ordenCompraCliente || '')}" class="w-full border rounded-xl px-3 py-1 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Fecha recepción OC:</label>
                        ${inputFechaHTML('editOcFechaRecepcion', venta.fechaRecepcionOC || hoyISO(), { label: '' })}
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Adjuntar OC (PDF o imagen):</label>
                    <input type="file" id="editOcArchivo" accept=".pdf,.jpg,.jpeg,.png" class="w-full border rounded-xl px-3 py-1 text-sm">
                    <div id="editOcPreview" class="${venta.ocArchivoUrl ? '' : 'hidden'} mt-2">
                        <div class="flex items-center justify-between bg-white dark:bg-gray-700 p-2 rounded-lg border">
                            <div class="flex items-center gap-2">
                                <span class="text-2xl">📄</span>
                                <div>
                                    <p id="editOcNombre" class="text-xs font-bold truncate max-w-[200px]">${escapeHtml(venta.ocArchivoNombre || 'OC adjunta')}</p>
                                    <p id="editOcTamanio" class="text-xs text-gray-500">${venta.ocArchivoUrl ? 'Archivo actual' : ''}</p>
                                </div>
                            </div>
                            <div class="flex gap-1">
                                ${venta.ocArchivoUrl ? `<a href="${venta.ocArchivoUrl}" target="_blank" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">👁️ Ver</a>` : ''}
                                <button type="button" onclick="window._quitarOCEdicion()" class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">🗑️ Quitar</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Total OC:</label>
                    <input type="number" id="editOcTotal" value="${venta.ocClienteTotal || venta.total || 0}" step="0.01" min="0" class="w-full border rounded-xl px-3 py-2 text-right text-lg font-bold">
                </div>
                <div class="border-t pt-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Suma de presupuestos:</span>
                        <strong>$${formatNumber(venta.totalPresupuestos || 0)}</strong>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Diferencia (OC - Presupuestos):</span>
                        <strong id="editOcDiferencia" class="text-green-600">$0,00</strong>
                    </div>
                    <p id="editOcAviso" class="text-xs mt-1"></p>
                </div>
            </div>
            <div class="flex gap-2 mt-4">
                <button onclick="this.closest('.modal').remove()" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-xl flex-1">Cancelar</button>
                <button onclick="window._guardarEdicionOC('${venta.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1 font-bold">💾 Guardar OC</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 🔥 v7.22.46: inicializar el input de fecha
    initInputFecha('editOcFechaRecepcion');
    
    const inputTotal = document.getElementById('editOcTotal');
    const spanDif = document.getElementById('editOcDiferencia');
    const spanAviso = document.getElementById('editOcAviso');
    const inputArchivo = document.getElementById('editOcArchivo');
    const preview = document.getElementById('editOcPreview');
    const previewNombre = document.getElementById('editOcNombre');
    const previewTamanio = document.getElementById('editOcTamanio');

    let archivoNuevo = null;
    window._eliminarOcGuardada = false;

    const sumaPresupuestos = venta.totalPresupuestos || 0;
    const actualizarDif = () => {
        const total = parseFloat(inputTotal.value) || 0;
        const dif = +(total - sumaPresupuestos).toFixed(2);
        const abs = Math.abs(dif);
        spanDif.textContent = (dif > 0 ? '+' : '') + '$' + formatNumber(dif);
        if (abs === 0) {
            spanDif.className = 'text-green-600 font-bold';
            spanAviso.innerHTML = '✅ La OC coincide con los presupuestos.';
            spanAviso.className = 'text-xs text-green-600 mt-1';
        } else if (abs <= 10) {
            spanDif.className = 'text-orange-600 font-bold';
            spanAviso.innerHTML = '⚠️ Diferencia aceptable (≤ $10). Se guardará con el total de la OC.';
            spanAviso.className = 'text-xs text-orange-600 mt-1';
        } else {
            spanDif.className = 'text-red-600 font-bold';
            spanAviso.innerHTML = '⚠️ Diferencia mayor a $10. Verificá que sea correcto.';
            spanAviso.className = 'text-xs text-red-600 mt-1';
        }
    };

    inputTotal.addEventListener('input', actualizarDif);
    actualizarDif();

    inputArchivo.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        archivoNuevo = f;
        previewNombre.textContent = f.name;
        previewTamanio.textContent = (f.size / 1024).toFixed(1) + ' KB';
        preview.classList.remove('hidden');
        window._eliminarOcGuardada = false;

        // 🔥 v7.22.46: agregar botón "Ver" para el archivo nuevo (sin subir a Storage)
        const previewContainer = preview.querySelector('.flex.gap-1');
        if (previewContainer) {
            // Quitar el botón "Ver" viejo si existía
            const verViejo = previewContainer.querySelector('a[href]');
            if (verViejo) verViejo.remove();
            // Agregar botón "Ver" nuevo (preview local)
            const btnVer = document.createElement('button');
            btnVer.type = 'button';
            btnVer.className = 'bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs';
            btnVer.textContent = '👁️ Ver';
            btnVer.onclick = () => {
                const url = URL.createObjectURL(f);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            };
            previewContainer.insertBefore(btnVer, previewContainer.firstChild);
        }
    });

    window._quitarOCEdicion = () => {
        archivoNuevo = null;
        inputArchivo.value = '';
        preview.classList.add('hidden');
        window._eliminarOcGuardada = true;
    };
};

window._guardarEdicionOC = async (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const numero = document.getElementById('editOcNumero').value.trim();
    const fechaRecepcion = getValorFecha('editOcFechaRecepcion');
    const total = parseFloat(document.getElementById('editOcTotal').value) || 0;
    const archivoNuevo = document.getElementById('editOcArchivo').files[0];
    const eliminarOcGuardada = window._eliminarOcGuardada === true;

    const suma = venta.totalPresupuestos || 0;
    const ajuste = +(total - suma).toFixed(2);

    try {
        if (eliminarOcGuardada && venta.ocArchivoUrl) {
            try {
                const { eliminarArchivoDeStorage } = await import('./firebase.js');
                await eliminarArchivoDeStorage(venta.ocArchivoUrl);
            } catch (e) { console.warn('No se pudo eliminar OC de Storage:', e); }
            venta.ocArchivoUrl = null;
            venta.ocArchivoNombre = null;
        }

        if (archivoNuevo) {
            try {
                const { subirArchivo } = await import('./firebase.js');
                const ruta = `presupuestos/oc_${ventaId}_${archivoNuevo.name}`;
                const url = await subirArchivo(ruta, archivoNuevo);
                if (venta.ocArchivoUrl && venta.ocArchivoUrl !== url) {
                    try {
                        const { eliminarArchivoDeStorage } = await import('./firebase.js');
                        await eliminarArchivoDeStorage(venta.ocArchivoUrl);
                    } catch (e) { console.warn('No se pudo eliminar OC vieja:', e); }
                }
                venta.ocArchivoUrl = url;
                venta.ocArchivoNombre = archivoNuevo.name;
            } catch (err) {
                console.error('Error al subir OC:', err);
                mostrarNotificacion('⚠️ No se pudo subir la OC, pero se guardan los demás datos', 'warning');
            }
        }

        venta.ocClienteNumero = numero || null;
        venta.ordenCompraCliente = numero || null;
        venta.fechaRecepcionOC = fechaRecepcion || null;
        venta.ocClienteTotal = total;
        venta.total = total;
        venta.ajusteRedondeo = ajuste;
        if (venta.totales) venta.totales.totalFactura = total;

        guardarDB();
        document.querySelector('.modal')?.remove();
        mostrarNotificacion(`✅ OC actualizada (Total: $${formatNumber(total)})`, 'success');
        window._eliminarOcGuardada = false;
        window.dispatchEvent(new Event('refreshView'));
    } catch (err) {
        console.error('Error al guardar OC:', err);
        mostrarNotificacion('Error al guardar OC: ' + err.message, 'error');
    }
};

// ==================== 🔥 v7.22.44: EDITAR PRESUPUESTOS AGRUPADOS ====================
window.editarPresupuestosVentaAgrupada = async (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta || !venta.esVentaAgrupada) {
        mostrarNotificacion('Venta agrupada no encontrada', 'error');
        return;
    }

    const presupuestosActuales = (venta.presupuestosOrigenIds || [])
        .map(id => db.presupuestos.find(p => String(p.id) === String(id)))
        .filter(Boolean);

    const pendientes = (db.presupuestos || []).filter(p =>
        p.estado === 'pendiente' &&
        String(p.clienteId) === String(venta.clienteId) &&
        !(venta.presupuestosOrigenIds || []).some(id => String(id) === String(p.id))
    );

    const renderLista = (lista) => lista.map(p => `
        <div class="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded-lg border mb-1">
            <div>
                <p class="text-xs font-bold">${p.numero} - ${escapeHtml(p.trabajo || 'Trabajo')}</p>
                <p class="text-xs text-gray-500">$${formatNumber(p.total)}</p>
            </div>
            <button onclick="window._togglePresupuestoAgrupado('${p.id}')" class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">🗑️ Quitar</button>
        </div>
    `).join('');

    const renderPendientes = (lista) => lista.map(p => `
        <div class="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded-lg border mb-1">
            <div>
                <p class="text-xs font-bold">${p.numero} - ${escapeHtml(p.trabajo || 'Trabajo')}</p>
                <p class="text-xs text-gray-500">$${formatNumber(p.total)}</p>
            </div>
            <button onclick="window._agregarPresupuestoAgrupado('${p.id}')" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">➕ Agregar</button>
        </div>
    `).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">✏️ Editar presupuestos agrupados</h2>
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3 text-sm">
                <div>
                    <p class="font-bold mb-2">📄 Presupuestos en la venta (${presupuestosActuales.length}):</p>
                    <div id="listaAgrupados">${presupuestosActuales.length ? renderLista(presupuestosActuales) : '<p class="text-xs text-gray-500">No hay presupuestos.</p>'}</div>
                </div>
                <div class="border-t pt-2">
                    <p class="font-bold mb-2">➕ Agregar presupuestos pendientes del mismo cliente (${pendientes.length}):</p>
                    <div id="listaPendientes">${pendientes.length ? renderPendientes(pendientes) : '<p class="text-xs text-gray-500">No hay presupuestos pendientes.</p>'}</div>
                </div>
                <div class="border-t pt-2">
                    <div class="flex justify-between">
                        <span>Suma de presupuestos:</span>
                        <strong id="editPresSuma">$${formatNumber(venta.totalPresupuestos || 0)}</strong>
                    </div>
                    <div class="flex justify-between">
                        <span>Total OC:</span>
                        <strong>$${formatNumber(venta.ocClienteTotal || venta.total)}</strong>
                    </div>
                    <div class="flex justify-between">
                        <span>Ajuste por redondeo:</span>
                        <strong id="editPresAjuste">$${formatNumber(venta.ajusteRedondeo || 0)}</strong>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 mt-4">
                <button onclick="this.closest('.modal').remove()" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-xl flex-1">Cancelar</button>
                <button onclick="window._guardarEdicionPresupuestos('${venta.id}')" class="bg-indigo-600 text-white px-4 py-2 rounded-xl flex-1 font-bold">💾 Guardar cambios</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    window._presupuestosEdicion = presupuestosActuales.map(p => String(p.id));

    window._togglePresupuestoAgrupado = (presId) => {
        const idx = window._presupuestosEdicion.indexOf(String(presId));
        if (idx >= 0) window._presupuestosEdicion.splice(idx, 1);
        window._actualizarListaEdicion(venta);
    };

    window._agregarPresupuestoAgrupado = (presId) => {
        if (!window._presupuestosEdicion.includes(String(presId))) {
            window._presupuestosEdicion.push(String(presId));
        }
        window._actualizarListaEdicion(venta);
    };

    window._actualizarListaEdicion = (v) => {
        const db2 = getDB();
        const actuales = window._presupuestosEdicion.map(id => db2.presupuestos.find(p => String(p.id) === String(id))).filter(Boolean);
        const pendientes2 = (db2.presupuestos || []).filter(p =>
            p.estado === 'pendiente' &&
            String(p.clienteId) === String(v.clienteId) &&
            !window._presupuestosEdicion.includes(String(p.id))
        );
        const suma = actuales.reduce((s, p) => s + (p.total || 0), 0);
        document.getElementById('listaAgrupados').innerHTML = actuales.length ? renderLista(actuales) : '<p class="text-xs text-gray-500">No hay presupuestos.</p>';
        document.getElementById('listaPendientes').innerHTML = pendientes2.length ? renderPendientes(pendientes2) : '<p class="text-xs text-gray-500">No hay presupuestos pendientes.</p>';
        document.getElementById('editPresSuma').textContent = '$' + formatNumber(suma);
        const ajuste = +((v.ocClienteTotal || v.total) - suma).toFixed(2);
        const spanAjuste = document.getElementById('editPresAjuste');
        spanAjuste.textContent = (ajuste > 0 ? '+' : '') + '$' + formatNumber(ajuste);
        spanAjuste.className = Math.abs(ajuste) > 10 ? 'text-red-600 font-bold' : 'text-orange-600 font-bold';
    };
};

window._guardarEdicionPresupuestos = async (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const nuevosIds = window._presupuestosEdicion || [];
    if (nuevosIds.length === 0) {
        mostrarNotificacion('La venta agrupada debe tener al menos 1 presupuesto', 'error');
        return;
    }

    const presupuestosNuevos = nuevosIds.map(id => db.presupuestos.find(p => String(p.id) === String(id))).filter(Boolean);
    const idsAnteriores = (venta.presupuestosOrigenIds || []).map(String);
    const idsNuevos = nuevosIds.map(String);

    const quitados = idsAnteriores.filter(id => !idsNuevos.includes(id));
    const agregados = idsNuevos.filter(id => !idsAnteriores.includes(id));

    quitados.forEach(id => {
        const p = db.presupuestos.find(x => String(x.id) === String(id));
        if (p) {
            p.estado = 'pendiente';
            p.ventaGeneradaId = null;
            p.fechaAprobacion = null;
        }
    });

    agregados.forEach(id => {
        const p = db.presupuestos.find(x => String(x.id) === String(id));
        if (p) {
            p.estado = 'aprobado';
            p.ventaGeneradaId = venta.id;
            p.fechaAprobacion = p.fechaAprobacion || hoyISO();
        }
    });

    const suma = presupuestosNuevos.reduce((s, p) => s + (p.total || 0), 0);
    venta.presupuestosOrigenIds = idsNuevos;
    venta.presupuestosOrigenNumeros = presupuestosNuevos.map(p => p.numero);
    venta.totalPresupuestos = suma;
    venta.ajusteRedondeo = +((venta.ocClienteTotal || venta.total) - suma).toFixed(2);
    venta.items = presupuestosNuevos.map(p => ({
        descripcion: `Presupuesto ${p.numero} - ${p.trabajo || 'Trabajo'}`,
        cantidad: 1,
        precioUnitario: p.total,
        total: p.total,
        presupuestoOrigenId: p.id
    }));

    guardarDB();
    document.querySelector('.modal')?.remove();
    mostrarNotificacion(`✅ Presupuestos actualizados (${nuevosIds.length} en la venta)`, 'success');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== 🔥 v7.22.48: GENERAR OC AL TALLER ====================
window.generarOCAlTaller = async (ventaId) => {
    window._recalcularTotalTaller = () => {
        let total = 0;
        presupuestos.forEach((p, idx) => {
            const netoInput = document.getElementById(`ocTallerNeto_${idx}`);
            const ivaInput = document.getElementById(`ocTallerIva_${idx}`);
            if (netoInput && ivaInput) {
                const neto = parseFloat(netoInput.value) || 0;
                const iva = parseFloat(ivaInput.value) || 0;
                total += (neto + iva);
            }
        });
        const spanTotal = document.getElementById('ocTallerTotal');
        if (spanTotal) {
            spanTotal.textContent = '$' + formatNumber(total);
        } else {
            console.warn('No se encontró el span ocTallerTotal');
        }
    }
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta || !venta.esVentaAgrupada) {
        mostrarNotificacion('Venta agrupada no encontrada', 'error');
        return;
    }

    const presupuestos = (venta.presupuestosOrigenIds || [])
        .map(id => db.presupuestos.find(p => String(p.id) === String(id)))
        .filter(Boolean);
    if (presupuestos.length === 0) {
        mostrarNotificacion('No hay presupuestos en esta venta', 'error');
        return;
    }

    // Buscar talleres en db.proveedores (o db.empresas)
    const proveedores = (db.proveedores || []).filter(p => p.tipo === 'taller' || p.esTaller === true || p.nombre?.toLowerCase().includes('taller') || p.nombre?.toLowerCase().includes('forani'));
    const empresas = (db.empresas || []).filter(e => e.nombre?.toLowerCase().includes('forani') || e.esTaller);
    const talleres = [...proveedores, ...empresas];

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">📄 Generar OC al Taller</h2>
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3 text-sm">
                <div class="bg-teal-50 dark:bg-teal-900/20 p-2 rounded">
                    <p class="text-xs">Se generará una OC para el taller con los ítems de <strong>${presupuestos.length} presupuesto(s)</strong> a <strong>precio de costo</strong> (sin markup).</p>
                    <p class="text-xs mt-1">Referencia: OC cliente <strong>${escapeHtml(venta.ocClienteNumero || 'N/A')}</strong> · Presupuestos: <strong>${(venta.presupuestosOrigenNumeros || []).join(', ')}</strong></p>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Taller / Proveedor:</label>
                    <select id="ocTallerSelect" class="w-full border rounded-xl px-3 py-1 text-sm" onchange="window._onTallerChange()">
                        <option value="">-- Cargar datos manualmente --</option>
                        ${talleres.map(t => `<option value="${t.id}" data-nombre="${escapeHtml(t.nombre || t.razonSocial || '')}" data-cuit="${escapeHtml(t.cuit || '')}" data-direccion="${escapeHtml(t.direccion || '')}" data-telefono="${escapeHtml(t.telefono || '')}" data-email="${escapeHtml(t.email || '')}">${escapeHtml(t.nombre || t.razonSocial || 'Sin nombre')}${t.cuit ? ' - ' + escapeHtml(t.cuit) : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Nombre / Razón social:</label>
                        <input type="text" id="ocTallerNombre" placeholder="Grupo Forani" class="w-full border rounded-xl px-3 py-1 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">CUIT:</label>
                        <input type="text" id="ocTallerCuit" placeholder="30-XXXXXXXX-X" class="w-full border rounded-xl px-3 py-1 text-sm">
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Dirección:</label>
                    <input type="text" id="ocTallerDireccion" class="w-full border rounded-xl px-3 py-1 text-sm">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Teléfono:</label>
                        <input type="text" id="ocTallerTelefono" class="w-full border rounded-xl px-3 py-1 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Email:</label>
                        <input type="text" id="ocTallerEmail" class="w-full border rounded-xl px-3 py-1 text-sm">
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Condición de pago:</label>
                    <input type="text" id="ocTallerCondPago" value="0 DIAS" placeholder="Ej: 0 DIAS, 30 DIAS, TRANSFERENCIA" class="w-full border rounded-xl px-3 py-1 text-sm">
                </div>
                <div class="border-t pt-2">
                    <p class="font-bold mb-2 text-sm">Ajustar valores del taller (Neto + IVA):</p>
                    <div id="ocTallerItemsEdit" class="space-y-2">
                        ${presupuestos.map((p, idx) => {
                            // Valores del taller según los PDFs (hardcodeados temporalmente para este caso)
                            let netoDefault = 0, ivaDefault = 0;
                            if (p.trabajo?.includes('DIALISIS')) { netoDefault = 808980.00; ivaDefault = 169885.80; }
                            else if (p.trabajo?.includes('FULL SERVICE')) { netoDefault = 385717.76; ivaDefault = 81000.73; }
                            else if (p.trabajo?.includes('REVISIÓN')) { netoDefault = 1913000.00; ivaDefault = 401730.00; }
                            else {
                                const totalOriginal = p.totalOriginal || p.costoTotal || p.total || 0;
                                netoDefault = +(totalOriginal / 1.21).toFixed(2);
                                ivaDefault = +(totalOriginal - netoDefault).toFixed(2);
                            }
                            return `
                                <div class="flex items-center gap-2 bg-white dark:bg-gray-700 p-2 rounded-lg border">
                                    <div class="flex-1">
                                        <p class="text-xs font-bold">${escapeHtml(p.trabajo || 'Trabajo')}</p>
                                        <p class="text-[10px] text-gray-500">Ref. Taller: ${(() => {
                                            let ref = p.presupuestoReferenciaNombre || '';
                                            if (ref) {
                                                const match = ref.match(/(T\d{4}[-_]?\d{3,4})/i);
                                                if (match) return match[1].toUpperCase().replace('_', '-');
                                                return ref.replace(/\.pdf$/i, '');
                                            }
                                            if (p.presupuestoReferenciaUrl) {
                                                const match = p.presupuestoReferenciaUrl.match(/(T\d{4}[-_]?\d{3,4})/i);
                                                if (match) return match[1].toUpperCase().replace('_', '-');
                                            }
                                            return 'S/N';
                                        })()}</p>
                                    </div>
                                    <div>
                                        <label class="block text-[10px] text-gray-500">Neto $</label>
                                        <input type="number" step="0.01" id="ocTallerNeto_${idx}" value="${netoDefault}" class="w-24 border rounded px-2 py-1 text-xs text-right" oninput="window._recalcularTotalTaller()">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] text-gray-500">IVA $</label>
                                        <input type="number" step="0.01" id="ocTallerIva_${idx}" value="${ivaDefault}" class="w-24 border rounded px-2 py-1 text-xs text-right" oninput="window._recalcularTotalTaller()">
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="border-t pt-2 mt-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Total a facturar al taller (con IVA):</span>
                        <strong id="ocTallerTotal">
                            $${formatNumber(presupuestos.reduce((sum, p, idx) => {
                                let neto = 0, iva = 0;
                                if (p.trabajo?.includes('DIALISIS')) { neto = 808980.00; iva = 169885.80; }
                                else if (p.trabajo?.includes('FULL SERVICE')) { neto = 385717.76; iva = 81000.73; }
                                else if (p.trabajo?.includes('REVISIÓN')) { neto = 1913000.00; iva = 401730.00; }
                                else {
                                    const totalOriginal = p.totalOriginal || p.costoTotal || p.total || 0;
                                    neto = +(totalOriginal / 1.21).toFixed(2);
                                    iva = +(totalOriginal - neto).toFixed(2);
                                }
                                return sum + neto + iva;
                            }, 0))}
                        </strong>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 mt-4">
                <button onclick="this.closest('.modal').remove()" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-xl flex-1">Cancelar</button>
                <button onclick="window._mostrarPreviewOCAlTaller('${venta.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1 font-bold">👁️ Vista previa</button>
                <button onclick="window._generarPDFOCAlTaller('${venta.id}')" class="bg-teal-600 text-white px-4 py-2 rounded-xl flex-1 font-bold">📄 Generar PDF</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    window._onTallerChange = () => {
        const sel = document.getElementById('ocTallerSelect');
        const opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.value) return;
        document.getElementById('ocTallerNombre').value = opt.dataset.nombre || '';
        document.getElementById('ocTallerCuit').value = opt.dataset.cuit || '';
        document.getElementById('ocTallerDireccion').value = opt.dataset.direccion || '';
        document.getElementById('ocTallerTelefono').value = opt.dataset.telefono || '';
        document.getElementById('ocTallerEmail').value = opt.dataset.email || '';
    ;
    
    // Ejecutar después de que el modal se haya renderizado en el DOM
    setTimeout(() => {
        window._recalcularTotalTaller();
    }, 50);

    };

    // El recálculo se hace con _recalcularTotalTaller() que lee los inputs
    window._recalcularTotalTaller();
};

window._generarHTMLOCAlTaller = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => String(v.id) === String(ventaId));
    if (!venta) return '';

    const presupuestos = (venta.presupuestosOrigenIds || [])
        .map(id => db.presupuestos.find(p => String(p.id) === String(id)))
        .filter(Boolean);

    const taller = window._datosTallerGuardados || {
        nombre: (document.getElementById('ocTallerNombre')?.value || '').trim() || 'Taller',
        cuit: (document.getElementById('ocTallerCuit')?.value || '').trim(),
        direccion: (document.getElementById('ocTallerDireccion')?.value || '').trim(),
        telefono: (document.getElementById('ocTallerTelefono')?.value || '').trim(),
        email: (document.getElementById('ocTallerEmail')?.value || '').trim(),
        condPago: (document.getElementById('ocTallerCondPago')?.value || '').trim() || '0 DIAS'
    };

    const empresa = db.datosEmpresa || { nombre: 'SOLUM 360 S.A.S', cuit: '30719583004', direccion: 'Talavera 145', telefono: '3876299440', email: 'Solum.taller@gmail.com' };

    let itemsFilas = '';
    let totalNeto = 0;
    let totalIVA = 0;

    presupuestos.forEach((p, idx) => {
        const netoInput = document.getElementById(`ocTallerNeto_${idx}`);
        const ivaInput = document.getElementById(`ocTallerIva_${idx}`);
        
        let neto = netoInput ? (parseFloat(netoInput.value) || 0) : 0;
        let iva = ivaInput ? (parseFloat(ivaInput.value) || 0) : 0;
        
        if (!netoInput) {
            const costoTotalConIVA = p.totalOriginal || p.costoTotal || p.total || 0;
            neto = +(costoTotalConIVA / 1.21).toFixed(2);
            iva = +(costoTotalConIVA - neto).toFixed(2);
        }
        
        totalNeto += neto;
        totalIVA += iva;

        let refTaller = p.presupuestoReferenciaNumero || p.presupuestoReferenciaNombre || '';
        if (refTaller) {
            const matchNombre = refTaller.match(/(T\d{4}[-_]?\d{3,4})/i);
            if (matchNombre) {
                refTaller = matchNombre[1].toUpperCase().replace('_', '-');
            } else {
                refTaller = refTaller.replace(/\.pdf$/i, '');
            }
        }
        if (!refTaller && p.presupuestoReferenciaUrl) {
            const matchUrl = p.presupuestoReferenciaUrl.match(/(T\d{4}[-_]?\d{3,4})/i);
            if (matchUrl) refTaller = matchUrl[1].toUpperCase().replace('_', '-');
        }
        if (!refTaller) refTaller = 'S/N';

        itemsFilas += `
            <tr>
                <td style="text-align:center;">1.00</td>
                <td style="text-align:center;">UNIDAD</td>
                <td style="text-align:center;">${escapeHtml(p.trabajo || 'Trabajo')}</td>
                <td style="text-align:center;">${escapeHtml(refTaller)}</td>
                <td style="text-align:center;">MANROD001</td>
                <td style="text-align:right;">$ ${formatNumber(neto)}</td>
                <td style="text-align:right;">$ ${formatNumber(neto)}</td>
            </tr>
        `;
    });

    const total = totalNeto + totalIVA;

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>OC Taller - ${escapeHtml(taller.nombre)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; padding: 10px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .header-left h1 { margin: 0 0 5px 0; font-size: 16px; text-transform: uppercase; }
  .header-left p { margin: 2px 0; font-size: 11px; }
  .header-right { text-align: right; }
  .header-right h2 { margin: 0 0 5px 0; font-size: 18px; text-transform: uppercase; }
  .header-right p { margin: 2px 0; font-size: 11px; }
  .receptor { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 10px 0; margin-bottom: 15px; }
  .receptor p { margin: 2px 0; font-size: 11px; }
  .receptor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  table.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; font-size: 10px; text-transform: uppercase; text-align: left; }
  table.items td { padding: 5px; font-size: 11px; border-bottom: 1px dashed #ccc; }
  
  .obs-box { margin-bottom: 15px; font-size: 11px; }
  .obs-box p { margin: 4px 0; }
  
  .footer-totales { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
  .barcode { display: flex; flex-direction: column; align-items: flex-start; }
  .barcode svg { height: 50px; }
  
  table.totales { width: 300px; border-collapse: collapse; }
  table.totales td { padding: 4px; font-size: 11px; }
  table.totales td.label { text-align: left; }
  table.totales td.amount { text-align: right; }
  table.totales tr.total-final td { font-weight: bold; font-size: 13px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 4px; }
  
  .no-print { margin-top: 30px; text-align: center; }
  .no-print button { padding: 10px 25px; background: #0a2a4a; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; margin: 0 5px; }
  .no-print button.gray { background: #6b7280; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 0; }
  }
</style>
</head>
<body>

<div class="header">
  <!-- IZQUIERDA: Datos de SOLUM (Empresa) -->
  <div class="header-left">
    <h1>${escapeHtml(empresa.nombre || 'Mi Empresa')}</h1>
    <p>${empresa.cuit ? 'C.U.I.T.: ' + escapeHtml(empresa.cuit) : ''}</p>
  </div>
  
  <!-- CENTRO: Recuadro "P" -->
  <div class="header-center" style="display: flex; align-items: center; justify-content: center; padding: 0 20px;">
    <div style="border: 3px solid #000; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold; font-family: Arial, sans-serif;">
      P
    </div>
  </div>

  <!-- DERECHA: Datos de la OC -->
  <div class="header-right">
    <h2>Orden de compra No Productivo</h2>
    <p style="font-size: 16px; font-weight: bold;">OC ${escapeHtml(venta.ocClienteNumero || venta.id)}</p>
    <p>Emisión: ${(() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })()}</p>
  </div>
</div>

<!-- RECUADRO: Datos del Taller -->
<div class="receptor">
  <div class="receptor-grid">
    <div>
      <p><strong>Sr./es:</strong> ${escapeHtml(taller.nombre)}</p>
      <p><strong>Entrega:</strong> ${escapeHtml(taller.direccion || '')}</p>
      <p><strong>Dirección:</strong> ${escapeHtml(taller.direccion || '')}, Argentina</p>
    </div>
    <div>
      <p><strong>C.U.I.T.:</strong> ${escapeHtml(taller.cuit || '')} | <strong>I.V.A.:</strong> Responsable Inscripto</p>
      <p><strong>Cond.:</strong> ${escapeHtml(taller.condPago || '0 DIAS')}</p>
    </div>
  </div>
</div>

<table class="items">
  <thead>
    <tr>
      <th style="width: 50px; text-align: center;">CANT.</th>
      <th style="width: 60px; text-align: center;">PRES.</th>
      <th>DESCRIPCION</th>
      <th style="width: 80px; text-align: center;">CODIGO</th>
      <th style="width: 80px; text-align: center;">COD. PRO.</th>
      <th style="width: 90px; text-align: right;">PRECIO</th>
      <th style="width: 90px; text-align: right;">IMPORTE</th>
    </tr>
  </thead>
  <tbody>
    ${itemsFilas}
  </tbody>
</table>

<div class="obs-box">
  <p><strong>Observaciones:</strong> ${(() => {
      const patentes = [...new Set(presupuestos.map(p => p.patente).filter(Boolean))];
      return patentes.length > 0 ? 'DOMINIO ' + patentes.join(' / ') : 'Sin dominio especificado';
  })()}</p>
  <p style="font-size: 9px; margin-top: 10px;"><strong>IMPORTANTE:</strong> Sr. Proveedor, se solicita verifiquen las presentaciones y precios detallados en las ordenes de compra enviadas. Deberan informar las diferencias via mail dentro de las 24 hs de recibida la orden, con el fin de no tener inconvenientes o retrasos al momento de la entrega y de emision de pagos. Los pagos se emitiran basados en las ordenes de compra confeccionadas. RESPETAR FECHA Y HORARIO DE ENTREGA, CASO CONTRARIO SE RECHAZARA LA MERCADERIA</p>
</div>

<div class="footer-totales">
  <div class="barcode">
    <svg id="barcode-oc"></svg>
  </div>
  
  <table class="totales">
    <tr><td class="label">Descuentos</td><td class="amount">$ 0.00</td></tr>
    <tr><td class="label">SUBTOTAL</td><td class="amount">$ ${formatNumber(totalNeto)}</td></tr>
    <tr><td class="label">IVA 21%</td><td class="amount">$ ${formatNumber(totalIVA)}</td></tr>
    <tr class="total-final"><td class="label">TOTAL</td><td class="amount">$ ${formatNumber(total)}</td></tr>
  </table>
</div>

<div class="no-print">
  <button onclick="window._imprimirOCAlTallerSinEncabezados()" data-num-oc="${escapeHtml(venta.ocClienteNumero || 'sin_numero')}">🖨️ Imprimir / Guardar PDF</button>
  <button class="gray" onclick="window.close()">Cerrar</button>
</div>

<script>
  // 🔥 Función para imprimir sin encabezados usando html2pdf
  window._imprimirOCAlTallerSinEncabezados = async () => {
    try {
      const elemento = document.body;
      // Usar el número de OC del botón
      const btn = document.querySelector('[data-num-oc]');
      const numOC = btn ? btn.dataset.numOc : 'sin_numero';
      
      const opt = {
        margin: 0,
        filename: 'OC_Taller_' + numOC + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      // Ocultar los botones antes de generar el PDF
      const noPrint = document.querySelector('.no-print');
      if (noPrint) noPrint.style.display = 'none';
      
      const pdfBlob = await html3pdf().set(opt).from(elemento).outputPdf('blob');
      
      // Mostrar los botones de nuevo
      if (noPrint) noPrint.style.display = 'block';
      
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error al generar PDF:', err);
      alert('Error al generar PDF: ' + err.message);
    }
  };
</script>

<script>
  if (typeof JsBarcode !== 'undefined') {
    JsBarcode("#barcode-oc", "OC-${venta.id}", {
      format: "CODE128",
      lineColor: "#000",
      width: 1.5,
      height: 40,
      displayValue: true
    });
  }
</script>

</body>
</html>`;
};

window._mostrarPreviewOCAlTaller = (ventaId) => {
    // Guardar los datos actuales del formulario
    window._datosTallerGuardados = {
        nombre: document.getElementById('ocTallerNombre')?.value.trim() || 'Taller',
        cuit: document.getElementById('ocTallerCuit')?.value.trim(),
        direccion: document.getElementById('ocTallerDireccion')?.value.trim(),
        telefono: document.getElementById('ocTallerTelefono')?.value.trim(),
        email: document.getElementById('ocTallerEmail')?.value.trim(),
        condPago: document.getElementById('ocTallerCondPago')?.value.trim() || '0 DIAS',
    };

    const html = window._generarHTMLOCAlTaller(ventaId);
    if (!html) { mostrarNotificacion('Error al generar la vista previa', 'error'); return; }

    // Extraer solo el body y los estilos
    let bodyContent = html;
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) bodyContent = bodyMatch[1];
    
    let estilos = '';
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    if (styleMatch) estilos = styleMatch[1];

    // Crear un NUEVO overlay limpio (sin blur)
    const overlay = document.createElement('div');
    overlay.id = 'previewOverlayOC';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;';
    
    overlay.innerHTML = `
        <div style="background: white; border-radius: 1rem; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; background: #f9fafb;">
                <h2 style="font-size: 1.1rem; font-weight: bold; margin: 0;">👁️ Vista previa - OC al Taller</h2>
                <button onclick="document.getElementById('previewOverlayOC').remove();" style="background: #e5e7eb; color: #374151; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.85rem;">← Volver</button>
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 20px; background: white;">
                <style>${estilos}</style>
                ${bodyContent}
            </div>
            
            <div style="padding: 15px; border-top: 1px solid #eee; background: #f9fafb; display: flex; gap: 10px;">
                <button onclick="document.getElementById('previewOverlayOC').remove();" style="flex: 1; background: #e5e7eb; color: #374151; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: bold;">← Volver</button>
                <button onclick="window._imprimirOCAlTallerDesdeOverlay()" style="flex: 1; background: #0d9488; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: bold;">🖨️ Imprimir / Guardar PDF</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
};

window._imprimirOCAlTallerDesdeOverlay = () => {
    // Generar el HTML de nuevo para imprimir en ventana nueva
    const ventaIdMatch = document.querySelector('button[onclick*="_mostrarPreviewOCAlTaller"]')?.getAttribute('onclick')?.match(/'([^']+)'/);
    const ventaId = ventaIdMatch ? ventaIdMatch[1] : null;
    
    if (!ventaId) { mostrarNotificacion('No se pudo identificar la venta', 'error'); return; }
    
    const html = window._generarHTMLOCAlTaller(ventaId);
    if (!html) return;
    
    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
};

window._volverFormularioOCAlTaller = () => {
    const modalContent = document.querySelector('.modal-content');
    const modalPadre = document.querySelector('.modal');
    if (modalContent && window._modalOcTallerOriginalHTML) {
        modalContent.innerHTML = window._modalOcTallerOriginalHTML;
        window._modalOcTallerOriginalHTML = null;
        
        // Restaurar fondo
        if (modalPadre) {
            modalPadre.style.background = window._modalOcTallerOriginalBg || 'rgba(0,0,0,0.6)';
            modalPadre.style.backdropFilter = window._modalOcTallerOriginalBlur || 'blur(4px)';
            modalPadre.style.webkitBackdropFilter = window._modalOcTallerOriginalBlur || 'blur(4px)';
        }
    }
};

window._imprimirOCAlTaller = () => {
    // Crear una ventana nueva con el HTML de la OC para imprimir
    const html = window._generarHTMLOCAlTaller(
        // Buscar el ventaId desde el modal actual
        (() => {
            const btn = document.querySelector('button[onclick*="_generarPDFOCAlTaller"]');
            if (btn) {
                const match = btn.getAttribute('onclick').match(/'([^']+)'/);
                return match ? match[1] : null;
            }
            return null;
        })()
    );
    if (!html) {
        mostrarNotificacion('Error al generar el PDF para imprimir', 'error');
        return;
    }
    
    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
};

window._volverFormularioOCAlTaller = () => {
    const modalContent = document.querySelector('.modal-content');
    if (modalContent && window._modalOcTallerOriginalHTML) {
        modalContent.innerHTML = window._modalOcTallerOriginalHTML;
        window._modalOcTallerOriginalHTML = null;
    }
};

window._imprimirOCAlTaller = () => {
    const iframe = document.getElementById('iframeOCAlTaller');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.print();
    }
};

window._guardarProveedorDesdeOC = (taller) => {
    if (!taller || !taller.nombre) return;
    const db = getDB();
    if (!db.proveedores) db.proveedores = [];
    
    // Buscar si ya existe (por CUIT o por nombre)
    const existe = db.proveedores.find(p => 
        (taller.cuit && p.cuit && p.cuit.replace(/[^0-9]/g, '') === taller.cuit.replace(/[^0-9]/g, '')) ||
        (p.nombre && p.nombre.toLowerCase() === taller.nombre.toLowerCase())
    );
    
    if (!existe) {
        // Crear nuevo proveedor
        db.proveedores.push({
            id: generarId(),
            nombre: taller.nombre,
            cuit: taller.cuit || '',
            direccion: taller.direccion || '',
            telefono: taller.telefono || '',
            email: taller.email || '',
            tipo: 'taller',
            esTaller: true,
            fechaCreacion: new Date().toISOString()
        });
        guardarDB();
        console.log('✅ Proveedor guardado automáticamente:', taller.nombre);
    } else {
        // Actualizar datos si faltaban
        let modificado = false;
        if (!existe.direccion && taller.direccion) { existe.direccion = taller.direccion; modificado = true; }
        if (!existe.telefono && taller.telefono) { existe.telefono = taller.telefono; modificado = true; }
        if (!existe.email && taller.email) { existe.email = taller.email; modificado = true; }
        if (!existe.cuit && taller.cuit) { existe.cuit = taller.cuit; modificado = true; }
        
        if (modificado) {
            guardarDB();
            console.log('✅ Proveedor actualizado con nuevos datos:', taller.nombre);
        }
    }
};

window._generarPDFOCAlTaller = async (ventaId) => {
    // 1. Guardar los datos del formulario antes de generar
    window._datosTallerGuardados = {
        nombre: document.getElementById('ocTallerNombre')?.value.trim() || 'Taller',
        cuit: document.getElementById('ocTallerCuit')?.value.trim(),
        direccion: document.getElementById('ocTallerDireccion')?.value.trim(),
        telefono: document.getElementById('ocTallerTelefono')?.value.trim(),
        email: document.getElementById('ocTallerEmail')?.value.trim(),
        condPago: document.getElementById('ocTallerCondPago')?.value.trim() || '0 DIAS'
    };
    
    // Guardar en proveedores si no existe
    window._guardarProveedorDesdeOC(window._datosTallerGuardados);

    const html = window._generarHTMLOCAlTaller(ventaId);
    if (!html) { mostrarNotificacion('Error al generar el PDF', 'error'); return; }

    // 2. Abrir el PDF en una nueva ventana (para imprimir/guardar)
    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(html);
    ventana.document.close();

    // 3. Guardar el PDF en Storage y vincularlo a la venta
    try {
        const db = getDB();
        const venta = db.ventas.find(v => String(v.id) === String(ventaId));
        if (venta) {
            // Convertir el HTML a un Blob de tipo PDF (en realidad es HTML, pero lo guardamos como .html)
            // Nota: Para un PDF real habría que usar una librería como jsPDF o html2pdf, pero por ahora guardamos el HTML.
            const blob = new Blob([html], { type: 'text/html' });
            const file = new File([blob], `OC_Taller_${venta.ocClienteNumero || venta.id}.html`, { type: 'text/html' });
            
            // Subir a Storage
            const { subirArchivo } = await import('./firebase.js');
            const rutaStorage = `presupuestos/oc_taller_${ventaId}.html`;
            const url = await subirArchivo(rutaStorage, file);
            
            // Guardar el link en la venta
            venta.ocTallerUrl = url;
            venta.ocTallerNombre = file.name;
            venta.ocTallerFecha = new Date().toISOString();
            guardarDB();
            
            mostrarNotificacion('✅ OC al taller generada y guardada', 'success');
        }
    } catch (err) {
        console.error('Error al guardar la OC en Storage:', err);
        mostrarNotificacion('⚠️ OC generada, pero no se pudo guardar en el registro', 'warning');
    }

    document.querySelector('.modal')?.remove();
};

// ==================== 🔥 v7.23.6: MANEJO DE ARCHIVO FACTURA ====================
window._archivoFacturaSeleccionado = null;

window._onFacturaFileChange = (input) => {
    console.log('📎 _onFacturaFileChange llamado');
    const file = input.files[0];
    if (!file) {
        window._quitarFactura();
        return;
    }
    console.log('📎 Archivo seleccionado:', file.name);
    window._archivoFacturaSeleccionado = file;
    
    const nombreSpan = document.getElementById('nombreFacturaFile');
    const previewDiv = document.getElementById('previewFacturaContainer');
    const previewNombre = document.getElementById('previewFacturaNombre');
    
    if (nombreSpan) nombreSpan.textContent = file.name;
    if (previewDiv) previewDiv.classList.remove('hidden');
    if (previewNombre) previewNombre.textContent = file.name;

    const btnVer = document.getElementById('btnVerFactura');
    const btnQuitar = document.getElementById('btnQuitarFactura');
    
    if (btnVer) {
        btnVer.onclick = () => {
            const url = URL.createObjectURL(file);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        };
    }
    
    if (btnQuitar) {
        btnQuitar.onclick = () => {
            window._quitarFactura();
        };
    }
};

window._quitarFactura = () => {
    window._archivoFacturaSeleccionado = null;
    const input = document.getElementById('facturaFile');
    const nombreSpan = document.getElementById('nombreFacturaFile');
    const previewDiv = document.getElementById('previewFacturaContainer');
    
    if (input) input.value = '';
    if (nombreSpan) nombreSpan.textContent = 'Ningún archivo seleccionado';
    if (previewDiv) previewDiv.classList.add('hidden');
};

// ==================== 🔥 v7.24.4: MANEJO DE COMPROBANTE DE PAGO ====================
window._archivoComprobanteSeleccionado = null;

window._onComprobanteFileChange = function(input) {
    const file = input.files && input.files[0];
    const nombreSpan = document.getElementById('nombreComprobanteFile');
    const previewDiv = document.getElementById('previewComprobanteContainer');
    const previewNombre = document.getElementById('previewComprobanteNombre');
    
    if (!previewDiv) {
        console.warn('⚠️ No se encontró previewComprobanteContainer');
        return;
    }
    
    if (!file) {
        if (nombreSpan) nombreSpan.textContent = 'Ningún archivo seleccionado';
        if (previewDiv) previewDiv.classList.add('hidden');
        return;
    }
    
    if (nombreSpan) nombreSpan.textContent = file.name;
    if (previewNombre) previewNombre.textContent = file.name;
    if (previewDiv) previewDiv.classList.remove('hidden');
    
    const btnVer = document.getElementById('btnVerComprobante');
    if (btnVer) {
        btnVer.onclick = () => {
            const url = URL.createObjectURL(file);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        };
    }
    
    const btnQuitar = document.getElementById('btnQuitarComprobante');
    if (btnQuitar) {
        btnQuitar.onclick = () => {
            input.value = '';
            if (nombreSpan) nombreSpan.textContent = 'Ningún archivo seleccionado';
            if (previewDiv) previewDiv.classList.add('hidden');
        };
    }
};

window._quitarComprobante = () => {
    const input = document.getElementById('comprobanteFile');
    const nombreSpan = document.getElementById('nombreComprobanteFile');
    const previewDiv = document.getElementById('previewComprobanteContainer');
    if (input) input.value = '';
    if (nombreSpan) nombreSpan.textContent = 'Ningún archivo seleccionado';
    if (previewDiv) previewDiv.classList.add('hidden');
};
