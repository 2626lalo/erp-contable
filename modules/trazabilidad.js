// ==================== modules/trazabilidad.js ====================
// TRAZABILIDAD - Visor de árbol con detalle amigable
// ERP Contable Argentina - v7.0.0

import { getDB } from './db.js';
import { formatNumber, mostrarNotificacion, formatDate } from './utils.js';

window.verTrazabilidad = (tipo, id) => {
    const db = getDB();
    let nodo = null;
    let nodos = [];

    if (tipo === 'compra') {
        nodo = db.compras.find(c => String(c.id) === String(id));
        if (!nodo) { mostrarNotificacion('Compra no encontrada', 'error'); return; }
        nodos = construirArbolDesdeCompra(db, nodo);
    } else if (tipo === 'presupuesto') {
        nodo = db.presupuestos.find(p => String(p.id) === String(id));
        if (!nodo) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
        nodos = construirArbolDesdePresupuesto(db, nodo);
    } else if (tipo === 'venta') {
        nodo = db.ventas.find(v => String(v.id) === String(id));
        if (!nodo) { mostrarNotificacion('Venta no encontrada', 'error'); return; }
        nodos = construirArbolDesdeVenta(db, nodo);
    } else {
        mostrarNotificacion('Tipo no soportado', 'error');
        return;
    }

    mostrarArbol(nodos);
};

// ==================== CONSTRUCCIÓN DESDE COMPRA ====================
function construirArbolDesdeCompra(db, compra) {
    const raiz = {
        id: compra.id,
        tipo: 'compra',
        label: `Compra ${compra.numeroFactura || 'sin número'}`,
        detalle: `${compra.proveedorNombre || 'Proveedor'} - $${formatNumber(compra.totalFactura)}`,
        fecha: compra.fechaEmision,
        children: []
    };

    const presupuestosVinculados = db.presupuestos.filter(p => 
        p.items && p.items.some(item => String(item.compraVinculadaId) === String(compra.id))
    );

    presupuestosVinculados.forEach(p => {
        const nodoPres = {
            id: p.id,
            tipo: 'presupuesto',
            label: `Presupuesto ${p.numero}`,
            detalle: `${p.cliente} - $${formatNumber(p.total)}`,
            fecha: p.fechaCreacion,
            children: []
        };
        if (p.ventaGeneradaId) {
            const venta = db.ventas.find(v => String(v.id) === String(p.ventaGeneradaId));
            if (venta) {
                const nodoVenta = {
                    id: venta.id,
                    tipo: 'venta',
                    label: `Venta ${venta.numFacturaEmitida || venta.numComprobante || 'sin número'}`,
                    detalle: `${venta.clienteNombre} - $${formatNumber(venta.total)}`,
                    fecha: venta.fechaVenta,
                    children: []
                };
                if (venta.estado === 'cobrado') {
                    nodoVenta.children.push({
                        id: venta.id,
                        tipo: 'cobro',
                        label: `Cobro ${venta.comprobanteCobro || 'registrado'}`,
                        detalle: `$${formatNumber(venta.total)} - ${venta.medioPago || 'N/A'}`,
                        fecha: venta.fechaCobro,
                        children: []
                    });
                }
                nodoPres.children.push(nodoVenta);
            }
        }
        raiz.children.push(nodoPres);
    });

    return [raiz];
}

// ==================== CONSTRUCCIÓN DESDE PRESUPUESTO ====================
function construirArbolDesdePresupuesto(db, presupuesto) {
    const raiz = {
        id: presupuesto.id,
        tipo: 'presupuesto',
        label: `Presupuesto ${presupuesto.numero}`,
        detalle: `${presupuesto.cliente} - $${formatNumber(presupuesto.total)}`,
        fecha: presupuesto.fechaCreacion,
        children: []
    };

    const comprasIds = new Set();
    presupuesto.items.forEach(item => {
        if (item.compraVinculadaId) comprasIds.add(item.compraVinculadaId);
    });
    comprasIds.forEach(cid => {
        const compra = db.compras.find(c => String(c.id) === String(cid));
        if (compra) {
            raiz.children.push({
                id: compra.id,
                tipo: 'compra',
                label: `Compra ${compra.numeroFactura || 'sin número'}`,
                detalle: `${compra.proveedorNombre || 'Proveedor'} - $${formatNumber(compra.totalFactura)}`,
                fecha: compra.fechaEmision,
                children: []
            });
        }
    });

    if (presupuesto.ventaGeneradaId) {
        const venta = db.ventas.find(v => String(v.id) === String(presupuesto.ventaGeneradaId));
        if (venta) {
            // 🔥 v7.22.37: si es venta agrupada, mostrar los N presupuestos origen
            const esAgrupada = venta.esVentaAgrupada === true;
            const labelVenta = esAgrupada
                ? `📦 Venta agrupada (${(venta.presupuestosOrigenNumeros || []).length} presupuestos)`
                : `Venta ${venta.numFacturaEmitida || venta.numComprobante || 'sin número'}`;
            const detalleVenta = esAgrupada
                ? `${venta.clienteNombre} - $${formatNumber(venta.total)} (incluye: ${(venta.presupuestosOrigenNumeros || []).join(', ')})`
                : `${venta.clienteNombre} - $${formatNumber(venta.total)}`;
            
            const nodoVenta = {
                id: venta.id,
                tipo: 'venta',
                label: labelVenta,
                detalle: detalleVenta,
                fecha: venta.fechaVenta,
                children: []
            };
            
            // 🔥 Si es agrupada, agregar los otros presupuestos como hijos
            if (esAgrupada && venta.presupuestosOrigenIds) {
                const otrosPresupuestos = db.presupuestos.filter(p => 
                    venta.presupuestosOrigenIds.some(id => String(id) === String(p.id)) &&
                    String(p.id) !== String(presupuesto.id)
                );
                otrosPresupuestos.forEach(otro => {
                    nodoVenta.children.push({
                        id: otro.id,
                        tipo: 'presupuesto',
                        label: `Presupuesto ${otro.numero}`,
                        detalle: `${otro.cliente} - $${formatNumber(otro.total)}`,
                        fecha: otro.fechaCreacion,
                        children: []
                    });
                });
            }
            
            if (venta.estado === 'cobrado') {
                nodoVenta.children.push({
                    id: venta.id,
                    tipo: 'cobro',
                    label: `Cobro ${venta.comprobanteCobro || 'registrado'}`,
                    detalle: `$${formatNumber(venta.total)} - ${venta.medioPago || 'N/A'}`,
                    fecha: venta.fechaCobro,
                    children: []
                });
            }
            raiz.children.push(nodoVenta);
        }
    }

    const hijos = db.presupuestos.filter(p => p.presupuestoPadreId === presupuesto.id);
    hijos.forEach(h => {
        raiz.children.push({
            id: h.id,
            tipo: 'presupuesto_adicional',
            label: `Presupuesto adicional ${h.numero}`,
            detalle: `${h.cliente} - $${formatNumber(h.total)}`,
            fecha: h.fechaCreacion,
            children: []
        });
    });

    return [raiz];
}

// ==================== CONSTRUCCIÓN DESDE VENTA ====================
function construirArbolDesdeVenta(db, venta) {
    const raiz = {
        id: venta.id,
        tipo: 'venta',
        label: `Venta ${venta.numFacturaEmitida || venta.numComprobante || 'sin número'}`,
        detalle: `${venta.clienteNombre} - $${formatNumber(venta.total)}`,
        fecha: venta.fechaVenta,
        children: []
    };

    // 🔥 v7.22.37: si es venta agrupada, mostrar TODOS los presupuestos origen
    if (venta.esVentaAgrupada && venta.presupuestosOrigenIds) {
        const presupuestosAgrupados = db.presupuestos.filter(p => 
            venta.presupuestosOrigenIds.some(id => String(id) === String(p.id))
        );
        presupuestosAgrupados.forEach(p => {
            const nodoPres = {
                id: p.id,
                tipo: 'presupuesto',
                label: `Presupuesto ${p.numero}`,
                detalle: `${p.cliente} - $${formatNumber(p.total)}`,
                fecha: p.fechaCreacion,
                children: []
            };
            
            // 🔥 v7.24.6: No agregar compras a cada presupuesto (se agregan una sola vez a la raíz)
            
            raiz.children.push(nodoPres);
        });
        
        // 🔥 v7.24.6: Agregar compras vinculadas UNA SOLA VEZ a la raíz
        const comprasSet = new Set();
        const comprasUnicas = [];
        
        // 1. Compras vinculadas directamente a la venta
        (venta.comprasVinculadas || []).forEach(cv => {
            const compra = db.compras.find(c => String(c.id) === String(cv.compraId));
            if (compra && !comprasSet.has(String(compra.id))) {
                comprasSet.add(String(compra.id));
                comprasUnicas.push(compra);
            }
        });
        
        // 2. Compras vinculadas a través de los ítems de los presupuestos
        (venta.presupuestosOrigenIds || []).forEach(pid => {
            const p = db.presupuestos.find(x => String(x.id) === String(pid));
            if (p && p.items) {
                p.items.forEach(item => {
                    if (item.compraVinculadaId) {
                        const compra = db.compras.find(c => String(c.id) === String(item.compraVinculadaId));
                        if (compra && !comprasSet.has(String(compra.id))) {
                            comprasSet.add(String(compra.id));
                            comprasUnicas.push(compra);
                        }
                    }
                });
            }
        });
        
        comprasUnicas.forEach(compra => {
            raiz.children.push({
                id: compra.id,
                tipo: 'compra',
                label: `Compra ${compra.numeroFactura || 'sin número'}`,
                detalle: `${compra.proveedorNombre || compra.concepto} - $${formatNumber(compra.totalFactura)}`,
                fecha: compra.fechaEmision,
                children: []
            });
        });
        
        // Si la venta está cobrada, agregar nodo de cobro
        if (venta.estado === 'cobrado') {
            raiz.children.push({
                id: venta.id,
                tipo: 'cobro',
                label: `Cobro ${venta.comprobanteCobro || 'registrado'}`,
                detalle: `$${formatNumber(venta.total)} - ${venta.medioPago || 'N/A'}`,
                fecha: venta.fechaCobro,
                children: []
            });
        }
        
        return [raiz];
    }

    // Flujo individual (como antes)
    let presupuesto = null;
    if (venta.presupuestoId) {
        presupuesto = db.presupuestos.find(p => String(p.id) === String(venta.presupuestoId));
    }
    if (!presupuesto) {
        presupuesto = db.presupuestos.find(p => String(p.ventaGeneradaId) === String(venta.id));
    }

    if (presupuesto) {
        const nodoPres = {
            id: presupuesto.id,
            tipo: 'presupuesto',
            label: `Presupuesto ${presupuesto.numero}`,
            detalle: `${presupuesto.cliente} - $${formatNumber(presupuesto.total)}`,
            fecha: presupuesto.fechaCreacion,
            children: []
        };

        const comprasIds = new Set();
        presupuesto.items.forEach(item => {
            if (item.compraVinculadaId) comprasIds.add(item.compraVinculadaId);
        });
        comprasIds.forEach(cid => {
            const compra = db.compras.find(c => String(c.id) === String(cid));
            if (compra) {
                nodoPres.children.push({
                    id: compra.id,
                    tipo: 'compra',
                    label: `Compra ${compra.numeroFactura || 'sin número'}`,
                    detalle: `${compra.proveedorNombre || 'Proveedor'} - $${formatNumber(compra.totalFactura)}`,
                    fecha: compra.fechaEmision,
                    children: []
                });
            }
        });

        const hijos = db.presupuestos.filter(p => p.presupuestoPadreId === presupuesto.id);
        hijos.forEach(h => {
            nodoPres.children.push({
                id: h.id,
                tipo: 'presupuesto_adicional',
                label: `Presupuesto adicional ${h.numero}`,
                detalle: `${h.cliente} - $${formatNumber(h.total)}`,
                fecha: h.fechaCreacion,
                children: []
            });
        });

        raiz.children.push(nodoPres);
    } else {
        raiz.children.push({
            id: 'no-relacion',
            tipo: 'mensaje',
            label: '⚠️ Esta venta no está vinculada a ningún presupuesto.',
            detalle: 'No se encontraron relaciones hacia atrás.',
            fecha: null,
            children: []
        });
    }

    if (venta.estado === 'cobrado') {
        raiz.children.push({
            id: venta.id,
            tipo: 'cobro',
            label: `Cobro ${venta.comprobanteCobro || 'registrado'}`,
            detalle: `$${formatNumber(venta.total)} - ${venta.medioPago || 'N/A'}`,
            fecha: venta.fechaCobro,
            children: []
        });
    }

    return [raiz];
}

// ==================== MOSTRAR ÁRBOL ====================
function mostrarArbol(nodos) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4">🔗 Trazabilidad</h2>
            <div class="space-y-4">
                ${nodos.map(nodo => renderNodo(nodo, 0)).join('')}
            </div>
            <button onclick="this.closest('.modal').remove()" class="mt-4 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// ==================== RENDER NODO ====================
function renderNodo(nodo, nivel) {
    const iconos = {
        'compra': '🛒',
        'presupuesto': '📄',
        'presupuesto_adicional': '📎',
        'venta': '💰',
        'cobro': '✅',
        'mensaje': 'ℹ️'
    };
    const colores = {
        'compra': 'border-blue-500 bg-blue-50',
        'presupuesto': 'border-purple-500 bg-purple-50',
        'presupuesto_adicional': 'border-orange-500 bg-orange-50',
        'venta': 'border-green-500 bg-green-50',
        'cobro': 'border-yellow-500 bg-yellow-50',
        'mensaje': 'border-gray-400 bg-gray-100'
    };
    const color = colores[nodo.tipo] || 'border-gray-300 bg-gray-50';
    const icono = iconos[nodo.tipo] || '📌';

    let html = `
        <div class="p-3 border-l-4 ${color} rounded-r-lg ml-${nivel * 4}">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold">${icono} ${escapeHtml(nodo.label)}</p>
                    <p class="text-sm text-gray-600">${escapeHtml(nodo.detalle)}</p>
                    <p class="text-xs text-gray-400">${nodo.fecha ? formatDate(nodo.fecha) : ''}</p>
                </div>
                ${nodo.tipo !== 'mensaje' ? `<button onclick="window.verDetalleNodo('${nodo.tipo}','${nodo.id}')" class="text-xs text-blue-600 underline">Ver detalle</button>` : ''}
            </div>
        </div>
    `;

    if (nodo.children && nodo.children.length > 0) {
        html += nodo.children.map(child => renderNodo(child, nivel + 1)).join('');
    }

    return html;
}

// ==================== VER DETALLE DE NODO (versión amigable) ====================
window.verDetalleNodo = (tipo, id) => {
    const db = getDB();
    let data = null;
    if (tipo === 'compra') {
        data = db.compras.find(c => String(c.id) === String(id));
    } else if (tipo === 'presupuesto' || tipo === 'presupuesto_adicional') {
        data = db.presupuestos.find(p => String(p.id) === String(id));
    } else if (tipo === 'venta' || tipo === 'cobro') {
        data = db.ventas.find(v => String(v.id) === String(id));
    }
    if (!data) {
        mostrarNotificacion('Registro no encontrado', 'error');
        return;
    }

    // Renderizar detalle amigable
    const html = renderDetalleNodo(tipo, data);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">📋 Detalle de ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}</h2>
            ${html}
            <button onclick="this.closest('.modal').remove()" class="mt-4 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">Cerrar</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// ==================== RENDER DETALLE AMIGABLE ====================
function renderDetalleNodo(tipo, data) {
    if (tipo === 'compra') {
        return `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow space-y-2">
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-gray-500">Proveedor:</span> <span class="font-semibold">${escapeHtml(data.proveedorNombre || '')}</span></div>
                    <div><span class="text-gray-500">CUIT:</span> <span>${escapeHtml(data.proveedorCuit || '-')}</span></div>
                    <div><span class="text-gray-500">Factura:</span> <span class="font-semibold">${escapeHtml(data.numeroFactura || '-')}</span></div>
                    <div><span class="text-gray-500">Fecha:</span> ${data.fechaEmision ? formatDate(data.fechaEmision) : '-'}</div>
                    <div><span class="text-gray-500">Tipo:</span> ${escapeHtml(data.tipo || '-')}</div>
                    <div><span class="text-gray-500">Categoría:</span> ${escapeHtml(data.categoria || '-')}</div>
                    <div><span class="text-gray-500">Estado:</span> <span class="${data.estadoPago === 'PAGADO' ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}">${data.estadoPago === 'PAGADO' ? '✅ Pagado' : '⏳ Pendiente'}</span></div>
                    <div><span class="text-gray-500">Vencimiento:</span> ${data.fechaVencimientoPago ? formatDate(data.fechaVencimientoPago) : '-'}</div>
                    <div class="col-span-2"><span class="text-gray-500">Neto:</span> <span class="font-bold">$${formatNumber(data.montoNeto)}</span></div>
                    <div class="col-span-2"><span class="text-gray-500">IVA (${data.ivaPorcentaje || 0}%):</span> <span class="font-bold text-orange-600">$${formatNumber(data.ivaMonto)}</span></div>
                    <div class="col-span-2"><span class="text-gray-500">Total facturado:</span> <span class="font-bold text-green-600 text-lg">$${formatNumber(data.totalFactura)}</span></div>
                    ${data.archivoUrl ? `<div class="col-span-2"><a href="${data.archivoUrl}" target="_blank" class="text-blue-600 underline">📎 Ver archivo adjunto</a></div>` : ''}
                    ${data.observaciones ? `<div class="col-span-2"><span class="text-gray-500">Observaciones:</span> ${escapeHtml(data.observaciones)}</div>` : ''}
                </div>
                ${data.items && data.items.length ? `
                    <div class="mt-3 border-t pt-2">
                        <p class="font-bold text-sm mb-1">📋 Ítems (${data.items.length})</p>
                        <div class="max-h-40 overflow-auto">
                            <table class="min-w-full text-xs">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th class="p-1 text-left">Descripción</th><th class="p-1 text-center">Cant.</th><th class="p-1 text-right">Precio</th><th class="p-1 text-right">Total</th></tr></thead>
                                <tbody>
                                    ${data.items.map(item => `
                                        <tr class="border-b"><td class="p-1">${escapeHtml(item.descripcion)}</td><td class="p-1 text-center">${item.cantidad}</td><td class="p-1 text-right">$${formatNumber(item.precioUnitario)}</td><td class="p-1 text-right">$${formatNumber(item.total)}</td></tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (tipo === 'presupuesto' || tipo === 'presupuesto_adicional') {
        const estado = data.estado === 'aprobado' ? '✅ Aprobado' : data.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente';
        return `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow space-y-2">
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-gray-500">Número:</span> <span class="font-semibold">${escapeHtml(data.numero)}</span></div>
                    <div><span class="text-gray-500">Cliente:</span> ${escapeHtml(data.cliente)}</div>
                    <div><span class="text-gray-500">Estado:</span> ${estado}</div>
                    <div><span class="text-gray-500">Total:</span> <span class="font-bold text-green-600">$${formatNumber(data.total)}</span></div>
                    <div><span class="text-gray-500">Fecha creación:</span> ${data.fechaCreacion ? formatDate(data.fechaCreacion) : '-'}</div>
                    <div><span class="text-gray-500">Vigencia:</span> ${escapeHtml(data.vigencia || '-')}</div>
                    ${data.presupuestoPadreId ? `<div><span class="text-gray-500">Presupuesto padre:</span> <span class="font-semibold">P-${data.presupuestoPadreId}</span></div>` : ''}
                    ${data.ventaGeneradaId ? `<div><span class="text-gray-500">Venta generada:</span> ID ${data.ventaGeneradaId}</div>` : ''}
                    ${data.comentarios ? `<div class="col-span-2"><span class="text-gray-500">Comentarios:</span> ${escapeHtml(data.comentarios)}</div>` : ''}
                </div>
                ${data.items && data.items.length ? `
                    <div class="mt-3 border-t pt-2">
                        <p class="font-bold text-sm mb-1">📋 Ítems (${data.items.length})</p>
                        <div class="max-h-40 overflow-auto">
                            <table class="min-w-full text-xs">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th class="p-1 text-left">#</th><th class="p-1 text-left">Descripción</th><th class="p-1 text-center">Cant.</th><th class="p-1 text-right">Costo</th></tr></thead>
                                <tbody>
                                    ${data.items.map(item => `
                                        <tr class="border-b"><td class="p-1">${item.nro}</td><td class="p-1">${escapeHtml(item.desc)}</td><td class="p-1 text-center">${item.cant}</td><td class="p-1 text-right">$${formatNumber(item.costo)}</td></tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (tipo === 'venta') {
        const estadoVenta = data.estado === 'cobrado' ? '💰 Cobrado' : data.estado === 'pendiente_cobro' ? '⏳ Pendiente de cobro' : '📄 Pendiente factura';
        return `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow space-y-2">
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-gray-500">Cliente:</span> <span class="font-semibold">${escapeHtml(data.clienteNombre)}</span></div>
                    <div><span class="text-gray-500">Factura:</span> ${escapeHtml(data.numComprobante || 'N/A')}</div>
                    <div><span class="text-gray-500">Total:</span> <span class="font-bold text-green-600">$${formatNumber(data.total)}</span></div>
                    <div><span class="text-gray-500">Estado:</span> ${estadoVenta}</div>
                    <div><span class="text-gray-500">Fecha venta:</span> ${data.fechaVenta ? formatDate(data.fechaVenta) : '-'}</div>
                    <div><span class="text-gray-500">Cobro esperado:</span> ${data.fechaCobroEsperada ? formatDate(data.fechaCobroEsperada) : '-'}</div>
                    ${data.fechaCobro ? `<div><span class="text-gray-500">Fecha de cobro:</span> ${formatDate(data.fechaCobro)}</div>` : ''}
                    ${data.medioPago ? `<div><span class="text-gray-500">Medio de pago:</span> ${escapeHtml(data.medioPago)}</div>` : ''}
                    ${data.comprobanteCobro ? `<div><span class="text-gray-500">Comprobante:</span> ${escapeHtml(data.comprobanteCobro)}</div>` : ''}
                    ${data.observaciones ? `<div class="col-span-2"><span class="text-gray-500">Observaciones:</span> ${escapeHtml(data.observaciones)}</div>` : ''}
                </div>
                ${data.items && data.items.length ? `
                    <div class="mt-3 border-t pt-2">
                        <p class="font-bold text-sm mb-1">📋 Ítems (${data.items.length})</p>
                        <div class="max-h-40 overflow-auto">
                            <table class="min-w-full text-xs">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th class="p-1 text-left">#</th><th class="p-1 text-left">Descripción</th><th class="p-1 text-center">Cant.</th><th class="p-1 text-right">Costo</th></tr></thead>
                                <tbody>
                                    ${data.items.map(item => `
                                        <tr class="border-b"><td class="p-1">${item.nro}</td><td class="p-1">${escapeHtml(item.desc)}</td><td class="p-1 text-center">${item.cant}</td><td class="p-1 text-right">$${formatNumber(item.costo)}</td></tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (tipo === 'cobro') {
        return `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow space-y-2">
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-gray-500">Monto cobrado:</span> <span class="font-bold text-green-600">$${formatNumber(data.total)}</span></div>
                    <div><span class="text-gray-500">Fecha de cobro:</span> ${data.fechaCobro ? formatDate(data.fechaCobro) : '-'}</div>
                    <div><span class="text-gray-500">Medio de pago:</span> ${escapeHtml(data.medioPago || 'N/A')}</div>
                    <div><span class="text-gray-500">Comprobante:</span> ${escapeHtml(data.comprobanteCobro || 'N/A')}</div>
                    ${data.comisionTarjeta ? `<div><span class="text-gray-500">Comisión:</span> ${data.comisionTarjeta}%</div>` : ''}
                    ${data.interesMora ? `<div><span class="text-gray-500">Interés por mora:</span> <span class="text-red-600">$${formatNumber(data.interesMora)}</span></div>` : ''}
                </div>
            </div>
        `;
    }

    // Fallback: mostrar JSON formateado
    return `<pre class="text-sm bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-auto max-h-60">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

export function initTrazabilidadEvents() {
    console.log('✅ Trazabilidad inicializada');
}
