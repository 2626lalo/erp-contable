import { getDB, guardarDB, getImpuestosActivos } from './db.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml, formatDate } from './utils.js';

let itemsPresupuesto = [];
let markupGlobal = 30;
let usarMarkupGlobal = true;
let incluirIVA = true;
let esTercerizado = true;

// ==================== MODALES REUTILIZABLES ====================
function crearModal(contenido, titulo = '') {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg">
            ${titulo ? `<h2 class="text-xl font-bold mb-4 text-center">${titulo}</h2>` : ''}
            ${contenido}
            <div class="flex gap-3 mt-5">
                <button id="modalGuardar" class="flex-1 bg-green-600 text-white py-2 rounded-xl">✅ Guardar</button>
                <button id="modalCancelar" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function cerrarModal(modal) {
    if (modal) modal.remove();
}

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

function procesarTextoItem(texto) {
    if (!texto) return '';
    return texto.toUpperCase().trim();
}

function getVigenciaTexto() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 7);
    return `Este presupuesto tiene validez hasta el ${fecha.toLocaleDateString('es-AR')}`;
}

// ==================== CÁLCULO CON IMPUESTOS DINÁMICOS ====================
function calcularGananciaReal(montoVentaCliente, costoProveedor) {
    const db = getDB();
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

    if (gananciasImp && gananciasImp.activo) {
        detalleImpuestos.push({ nombre: gananciasImp.nombre, monto: impuestoGanancias, base: utilidadAntes });
    }
    if (reservaImp && reservaImp.activo) {
        detalleImpuestos.push({ nombre: reservaImp.nombre, monto: reservaLegal, base: despuesGanancias });
    }

    return {
        montoVentaCliente,
        costoProveedor,
        gananciaBruta,
        totalImpuestosVenta,
        detalleImpuestos,
        utilidadAntes,
        impuestoGanancias,
        reservaLegal,
        gananciaNeta,
        margenRealSobreDiferencia: gananciaBruta > 0 ? (gananciaNeta / gananciaBruta) * 100 : 0
    };
}

// ==================== RENDER PRINCIPAL ====================
export function renderPresupuestos() {
    const db = getDB();
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex gap-3">
                <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl flex-1">+ Nuevo</button>
                <button onclick="window.mostrarModalCargarPDF()" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl flex-1">📷 Cargar PDF</button>
            </div>
            <div id="listaPresupuestos" class="space-y-3">
                ${db.presupuestos.slice().reverse().map(p => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md cursor-pointer" onclick="window.verPresupuestoDetalle(${p.id})">
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 class="font-bold">${escapeHtml(p.cliente)}</h3>
                                <p class="text-sm">Total: $${formatNumber(p.total)} | ${p.numero}</p>
                                <p class="text-xs text-gray-500">${p.fechaCreacion?.split('T')[0]}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="event.stopPropagation();window.descargarPDFPresupuesto(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-sm">📄 PDF</button>
                                <button onclick="event.stopPropagation();window.eliminarPresupuesto(${p.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️</button>
                            </div>
                        </div>
                    </div>
                `).join('') || '<p class="text-center text-gray-500">No hay presupuestos</p>'}
            </div>
        </div>`;
}

// ==================== FUNCIONES GLOBALES ====================
window.mostrarModalNuevoPresupuesto = () => {
    itemsPresupuesto = [
        { nro: 1, desc: "PRODUCTO/SERVICIO", cant: 1, costo: 500000, markup: 30, compraVinculadaId: null, compraItemIndex: null, cantidadAsignada: 0 }
    ];
    markupGlobal = 30;
    usarMarkupGlobal = true;
    incluirIVA = true;
    esTercerizado = true;
    mostrarEditorPresupuesto();
};

window.mostrarModalCargarPDF = () => {
    mostrarNotificacion("Funcionalidad en desarrollo", "info");
    window.mostrarModalNuevoPresupuesto();
};

function getCostoTotalProveedor() {
    return itemsPresupuesto.reduce((sum, item) => sum + (item.costo * item.cant), 0);
}

function getVentaTotalCliente() {
    let total = 0;
    itemsPresupuesto.forEach(item => {
        const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
        total += item.costo * (1 + markup/100) * item.cant;
    });
    return total;
}

// ==================== GENERAR PDF FORMAL ====================
window.descargarPDFPresupuesto = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    const empresa = db.empresas?.[0] || { nombre: 'Mi Empresa SRL', cuit: '30-12345678-9', direccion: 'Av. Corrientes 123', telefono: '11-1234-5678', email: 'info@miempresa.com', logo: '🏢' };
    let itemsHTML = '';
    p.items.forEach(item => {
        const markup = p.usarMarkupGlobal ? p.markupGlobal : (item.markup || 0);
        const precioVenta = item.costo * (1 + markup/100);
        itemsHTML += `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${item.nro}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.desc)}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.cant}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${formatNumber(precioVenta)}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${formatNumber(precioVenta * item.cant)}</td>
        </tr>`;
    });
    const ventaTotal = p.ventaCliente || 0;
    const iva = p.iva || 0;
    const totalConIVA = p.total || ventaTotal + iva;

    const ventana = window.open('', '_blank', 'width=900,height=700');
    ventana.document.write(`
        <html><head><title>Presupuesto ${p.numero}</title>
        <style>
            body { font-family: Arial, sans-serif; padding:40px; max-width:900px; margin:0 auto; color:#333; }
            .header { text-align:center; border-bottom:3px solid #1e3a8a; padding-bottom:20px; margin-bottom:30px; }
            .header h1 { color:#1e3a8a; margin:0; font-size:28px; }
            .header p { margin:5px 0; color:#555; }
            .datos-cliente { background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:20px; }
            table { width:100%; border-collapse:collapse; margin:20px 0; }
            th { background:#1e3a8a; color:white; padding:10px; text-align:left; }
            td { padding:8px; border:1px solid #ddd; }
            .total-section { text-align:right; margin-top:20px; padding:20px; background:#f1f5f9; border-radius:8px; }
            .total-section h2 { color:#1e3a8a; }
            .vigencia { color:#666; font-style:italic; }
            .nota { font-size:12px; color:#888; margin-top:30px; border-top:1px solid #eee; padding-top:20px; }
            @media print { .no-print { display:none; } }
        </style></head>
        <body>
            <div class="header">
                <h1>${empresa.nombre || 'Mi Empresa'}</h1>
                <p>CUIT: ${empresa.cuit || '30-12345678-9'} | ${empresa.direccion || ''}</p>
                <p>Tel: ${empresa.telefono || ''} | Email: ${empresa.email || ''}</p>
                <p style="font-size:18px;font-weight:bold;margin-top:10px;">PRESUPUESTO Nº ${p.numero}</p>
            </div>
            <div class="datos-cliente">
                <p><strong>Cliente:</strong> ${escapeHtml(p.cliente)}</p>
                <p><strong>Vigencia:</strong> ${p.vigencia || getVigenciaTexto()}</p>
                ${p.patente ? `<p><strong>Patente:</strong> ${p.patente}</p>` : ''}
                ${p.centroCosto ? `<p><strong>Centro de Costo:</strong> ${p.centroCosto}</p>` : ''}
            </div>
            <table><thead><tr><th>#</th><th>Producto/Servicio</th><th>Cant.</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead><tbody>${itemsHTML}</tbody></table>
            <div class="total-section">
                <p><strong>Subtotal (sin IVA):</strong> $${formatNumber(ventaTotal)}</p>
                ${p.incluirIVA ? `<p><strong>IVA 21%:</strong> $${formatNumber(iva)}</p>` : ''}
                <h2>TOTAL: $${formatNumber(totalConIVA)}</h2>
            </div>
            <p class="vigencia">${p.vigencia || getVigenciaTexto()}</p>
            ${p.comentarios ? `<div class="nota"><strong>Observaciones:</strong> ${escapeHtml(p.comentarios)}</div>` : ''}
            <div class="no-print" style="margin-top:30px;text-align:center;">
                <button onclick="window.print()" style="padding:12px 30px;background:#1e3a8a;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">🖨️ Imprimir / Guardar PDF</button>
                <button onclick="window.close()" style="padding:12px 30px;background:#6b7280;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-left:10px;">Cerrar</button>
            </div>
        </body></html>
    `);
    ventana.document.close();
};

// ==================== VER DETALLE ====================
window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('root').innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg max-w-4xl mx-auto">
            <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 dark:text-gray-300 mb-4">← Volver</button>
            <h2 class="text-xl font-bold mb-2">Presupuesto ${p.numero}</h2>
            <div class="grid grid-cols-2 gap-2 text-sm mb-4">
                <p><strong>Cliente:</strong> ${escapeHtml(p.cliente)}</p>
                <p><strong>Total con IVA:</strong> $${formatNumber(p.total)}</p>
                <p><strong>Ganancia Neta Real:</strong> $${formatNumber(p.gananciaNetaReal || 0)}</p>
                <p><strong>Fecha:</strong> ${new Date(p.fechaCreacion).toLocaleDateString()}</p>
            </div>
            <div class="flex gap-3">
                <button onclick="window.descargarPDFPresupuesto(${p.id})" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1">📄 Ver / Descargar PDF</button>
                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-600 text-white px-4 py-2 rounded-xl flex-1">🗑️ Eliminar</button>
            </div>
        </div>`;
};

// ==================== ELIMINAR (con liberación de stock) ====================
window.eliminarPresupuesto = (id) => {
    if (!confirm('¿Eliminar este presupuesto?')) return;
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (presupuesto) {
        // Liberar stock de cada ítem vinculado
        if (presupuesto.items) {
            presupuesto.items.forEach(item => {
                if (item.compraVinculadaId && item.compraItemIndex && item.cantidadAsignada) {
                    window.liberarStock(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
                }
            });
        }
        db.presupuestos = db.presupuestos.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion('Presupuesto eliminado y stock liberado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

// ==================== EDITOR DE PRESUPUESTO ====================
function mostrarEditorPresupuesto() {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    const numeroPresupuesto = `P-${getProximoNumeroPresupuesto().toString().padStart(4, '0')}`;
    const costoTotal = getCostoTotalProveedor();
    const ventaTotal = getVentaTotalCliente();
    const gananciaBruta = ventaTotal - costoTotal;
    const gn = calcularGananciaReal(ventaTotal, costoTotal);

    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-6xl mx-auto my-8 bg-white rounded-2xl shadow-2xl">
                <div class="sticky top-0 bg-white p-4 border-b flex justify-between items-center rounded-t-2xl">
                    <h2 class="text-xl font-bold">Editar Presupuesto - ${numeroPresupuesto}</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="p-4 space-y-4 pb-8">
                    <div class="bg-blue-50 p-3 rounded-lg text-sm">
                        <div class="font-bold text-blue-700">${db.empresas?.[0]?.nombre || 'Mi Empresa SRL'}</div>
                        <div class="text-xs text-gray-600">CUIT: ${db.empresas?.[0]?.cuit || '30-12345678-9'} | IVA Responsable Inscripto</div>
                        <div class="text-xs text-gray-600">Email: ${db.empresas?.[0]?.email || 'info@empresa.com'} | Tel: ${db.empresas?.[0]?.telefono || '11-1234-5678'}</div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block font-medium mb-1">Cliente</label><select id="clienteSelect" class="w-full p-2 border rounded-lg"><option value="">Seleccionar...</option>${clientesOptions}</select></div>
                        <div><label class="block font-medium mb-1">Patente</label><input type="text" id="patente" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Centro de Costo</label><input type="text" id="centroCosto" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Vigencia</label><input type="text" id="vigencia" value="${getVigenciaTexto()}" class="w-full p-2 border rounded-lg bg-gray-100" readonly></div>
                    </div>
                    
                    <div class="flex flex-wrap gap-4 p-3 bg-gray-100 rounded-lg">
                        <label><input type="radio" name="modoMarkup" id="modoGlobal" ${usarMarkupGlobal ? 'checked' : ''} onchange="window.toggleModoMarkup()"> Margen Global (${markupGlobal}%)</label>
                        <label><input type="radio" name="modoMarkup" id="modoIndividual" ${!usarMarkupGlobal ? 'checked' : ''} onchange="window.toggleModoMarkup()"> Margen Individual</label>
                        <label><input type="checkbox" id="tercerizadoCheckbox" ${esTercerizado ? 'checked' : ''} onchange="window.toggleTercerizado()"> Trabajo Tercerizado</label>
                        <label class="ml-auto"><input type="checkbox" id="incluirIVACheckbox" ${incluirIVA ? 'checked' : ''} onchange="window.toggleIVA()"> Incluir IVA 21%</label>
                    </div>
                    
                    <div id="resumenTercerizado" class="p-3 bg-yellow-50 rounded-lg">
                        <div class="grid grid-cols-3 gap-4 text-center">
                            <div><div class="text-xs text-gray-500">Costo Proveedor</div><div class="font-bold text-red-600 text-lg" id="resumenCosto">$${formatNumber(costoTotal)}</div></div>
                            <div><div class="text-xs text-gray-500">Venta al Cliente</div><div class="font-bold text-green-600 text-lg" id="resumenVenta">$${formatNumber(ventaTotal)}</div></div>
                            <div><div class="text-xs text-gray-500">Diferencia (Ganancia Bruta)</div><div class="font-bold text-blue-600 text-lg" id="resumenDiferencia">$${formatNumber(gananciaBruta)}</div></div>
                        </div>
                    </div>
                    
                    <div id="controlGlobal" class="p-3 bg-purple-50 rounded-lg">
                        <label>Margen Global: <span id="porcentajeLabel">${markupGlobal}</span>%</label>
                        <input type="range" id="markupSlider" min="0" max="400" value="${markupGlobal}" class="w-full mt-1">
                    </div>
                    
                    <h3 class="font-bold">Items del Presupuesto</h3>
                    <div class="overflow-x-auto border rounded-lg">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="p-2">#</th>
                                    <th class="p-2">Producto/Servicio</th>
                                    <th class="p-2 w-20">Cant.</th>
                                    <th class="p-2 w-28">Costo Proveedor</th>
                                    <th class="p-2 w-28 markup-col">Markup %</th>
                                    <th class="p-2 w-28">Precio Venta</th>
                                    <th class="p-2 w-28">Subtotal Venta</th>
                                    <th class="p-2 w-40">Trazabilidad</th>
                                    <th class="p-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody id="itemsBody"></tbody>
                        </table>
                    </div>
                    
                    <div class="flex gap-3">
                        <button id="agregarItem" class="bg-gray-200 px-3 py-1.5 rounded-lg text-sm">+ Agregar item</button>
                        <button id="vistaPreviaBtn" class="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm ml-auto">👁️ Vista Previa</button>
                    </div>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <h3 class="font-bold text-sm mb-2">Analisis de Incremento</h3>
                            <div id="vistaIncremento" class="text-sm max-h-40 overflow-auto"></div>
                            <div class="border-t pt-2 mt-2">
                                <div class="flex justify-between font-bold"><span>Total Original:</span><span id="totalOriginal" class="text-red-600">$0</span></div>
                                <div class="flex justify-between font-bold"><span>Total Venta:</span><span id="totalVenta" class="text-green-600">$0</span></div>
                                <div class="flex justify-between font-bold text-blue-600"><span>Diferencia Total:</span><span id="diferenciaTotal">$0</span></div>
                            </div>
                        </div>
                        <div class="border border-green-200 rounded-lg p-3 bg-green-50">
                            <h3 class="font-bold text-sm mb-2 text-green-700">Presupuesto al Cliente</h3>
                            <div id="vistaFinal" class="text-sm max-h-40 overflow-auto"></div>
                            <div class="border-t pt-2 mt-2">Subtotal: <span id="subtotalFinal" class="font-bold">$0</span></div>
                            <div id="ivaRow">IVA 21%: <span id="ivaMonto" class="text-orange-600">$0</span></div>
                            <div class="border-t pt-2 mt-1 font-bold text-lg">TOTAL: <span id="totalFinal" class="text-green-700">$0</span></div>
                        </div>
                        <div class="border border-blue-200 rounded-lg p-3 bg-blue-50">
                            <h3 class="font-bold text-sm mb-2 text-blue-700">GANANCIA NETA REAL</h3>
                            <div id="detalleImpuestos" class="text-sm space-y-1"></div>
                            <div class="border-t pt-1 mt-1 flex justify-between bg-blue-100 p-1 rounded">
                                <span class="font-bold text-blue-700">💰 GANANCIA NETA FINAL:</span>
                                <span class="font-bold text-blue-700 text-lg" id="gnGananciaNeta">$0</span>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">Margen sobre diferencia: <span id="gnMargenSobreDiferencia">0%</span></div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-100 rounded-lg p-3">
                        <label class="block font-medium mb-1">Comentarios</label>
                        <textarea id="comentarios" rows="2" class="w-full p-2 border rounded-lg" placeholder="Sin otro particular, quedamos a su disposicion..."></textarea>
                    </div>
                    
                    <div class="flex gap-3">
                        <button id="guardarPresupuesto" class="flex-1 bg-green-600 text-white py-3 rounded-xl">Guardar</button>
                        <button onclick="window.dispatchEvent(new Event('refreshView'))" class="flex-1 bg-gray-300 py-3 rounded-xl">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>`;

    // ==================== EVENTOS DEL EDITOR ====================
    window.toggleModoMarkup = () => {
        usarMarkupGlobal = document.getElementById('modoGlobal').checked;
        document.getElementById('controlGlobal').style.display = usarMarkupGlobal ? 'block' : 'none';
        document.querySelectorAll('.markup-col').forEach(col => col.style.display = usarMarkupGlobal ? 'none' : 'table-cell');
        if (usarMarkupGlobal) itemsPresupuesto.forEach(item => item.markup = markupGlobal);
        renderizarTodo();
    };

    window.toggleIVA = () => {
        incluirIVA = document.getElementById('incluirIVACheckbox').checked;
        renderizarTodo();
    };

    window.toggleTercerizado = () => {
        esTercerizado = document.getElementById('tercerizadoCheckbox').checked;
        renderizarTodo();
    };

    window.actualizarMarkupGlobal = (valor) => {
        markupGlobal = valor;
        document.getElementById('porcentajeLabel').innerText = markupGlobal;
        if (usarMarkupGlobal) {
            itemsPresupuesto.forEach(item => item.markup = markupGlobal);
            renderizarTodo();
        }
    };

    window.actualizarMarkupItem = (idx, valor) => {
        if (itemsPresupuesto[idx]) {
            itemsPresupuesto[idx].markup = parseFloat(valor) || 0;
            renderizarTodo();
        }
    };

    window.actualizarItem = (idx, campo, valor) => {
        if (itemsPresupuesto[idx]) {
            if (campo === 'cant') itemsPresupuesto[idx].cant = parseFloat(valor) || 1;
            else if (campo === 'costo') itemsPresupuesto[idx].costo = parseFloat(valor) || 0;
            else if (campo === 'desc') itemsPresupuesto[idx].desc = procesarTextoItem(valor);
            renderizarTodo();
        }
    };

    window.eliminarItem = (idx) => {
        // Liberar stock si estaba vinculado
        const item = itemsPresupuesto[idx];
        if (item && item.compraVinculadaId && item.compraItemIndex && item.cantidadAsignada) {
            window.liberarStock(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
        }
        itemsPresupuesto.splice(idx, 1);
        itemsPresupuesto.forEach((item, i) => item.nro = i + 1);
        renderizarTodo();
    };

    document.getElementById('agregarItem').onclick = () => {
        itemsPresupuesto.push({ nro: itemsPresupuesto.length + 1, desc: "NUEVO SERVICIO", cant: 1, costo: 0, markup: markupGlobal, compraVinculadaId: null, compraItemIndex: null, cantidadAsignada: 0 });
        renderizarTodo();
    };

    const slider = document.getElementById('markupSlider');
    if (slider) slider.oninput = (e) => window.actualizarMarkupGlobal(parseInt(e.target.value));

    document.getElementById('vistaPreviaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) { mostrarNotificacion('Seleccione un cliente', 'warning'); return; }
        const costoTotal = getCostoTotalProveedor();
        const ventaTotal = getVentaTotalCliente();
        const iva = ventaTotal * 0.21;
        const totalConIVA = ventaTotal + (incluirIVA ? iva : 0);
        const gn = calcularGananciaReal(ventaTotal, costoTotal);
        let itemsHTML = '';
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precioVenta = item.costo * (1 + markup/100);
            itemsHTML += `<tr><td style="padding:8px;border:1px solid #ddd;">${item.nro}</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.desc)}</td><td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.cant}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${formatNumber(precioVenta)}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${formatNumber(precioVenta * item.cant)}</td></tr>`;
        });
        const empresa = db.empresas?.[0] || { nombre: 'Mi Empresa SRL', cuit: '30-12345678-9', direccion: 'Av. Corrientes 123', telefono: '11-1234-5678', email: 'info@miempresa.com' };
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(`
            <html><head><title>Presupuesto ${numeroPresupuesto}</title>
            <style>
                body { font-family: Arial, sans-serif; padding:40px; max-width:900px; margin:0 auto; color:#333; }
                .header { text-align:center; border-bottom:3px solid #1e3a8a; padding-bottom:20px; margin-bottom:30px; }
                .header h1 { color:#1e3a8a; margin:0; font-size:28px; }
                .header p { margin:5px 0; color:#555; }
                .datos-cliente { background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:20px; }
                table { width:100%; border-collapse:collapse; margin:20px 0; }
                th { background:#1e3a8a; color:white; padding:10px; text-align:left; }
                td { padding:8px; border:1px solid #ddd; }
                .total-section { text-align:right; margin-top:20px; padding:20px; background:#f1f5f9; border-radius:8px; }
                .total-section h2 { color:#1e3a8a; }
                .vigencia { color:#666; font-style:italic; }
                @media print { .no-print { display:none; } }
            </style></head>
            <body>
                <div class="header">
                    <h1>${empresa.nombre}</h1>
                    <p>CUIT: ${empresa.cuit} | ${empresa.direccion}</p>
                    <p>Tel: ${empresa.telefono} | Email: ${empresa.email}</p>
                    <p style="font-size:18px;font-weight:bold;margin-top:10px;">PRESUPUESTO Nº ${numeroPresupuesto}</p>
                </div>
                <div class="datos-cliente">
                    <p><strong>Cliente:</strong> ${escapeHtml(cliente.nombre)}</p>
                    <p><strong>Vigencia:</strong> ${getVigenciaTexto()}</p>
                </div>
                <table><thead><tr><th>#</th><th>Producto/Servicio</th><th>Cant.</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead><tbody>${itemsHTML}</tbody></table>
                <div class="total-section">
                    <p><strong>Subtotal (sin IVA):</strong> $${formatNumber(ventaTotal)}</p>
                    ${incluirIVA ? `<p><strong>IVA 21%:</strong> $${formatNumber(iva)}</p>` : ''}
                    <h2>TOTAL: $${formatNumber(totalConIVA)}</h2>
                </div>
                <p class="vigencia">${getVigenciaTexto()}</p>
                <div class="no-print" style="margin-top:30px;text-align:center;"><button onclick="window.print()" style="padding:12px 30px;background:#1e3a8a;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">🖨️ Imprimir / Guardar PDF</button><button onclick="window.close()" style="padding:12px 30px;background:#6b7280;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-left:10px;">Cerrar</button></div>
            </body></html>
        `);
        ventana.document.close();
    };

    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) { mostrarNotificacion('Seleccione un cliente', 'error'); return; }
        const costoTotal = getCostoTotalProveedor();
        const ventaTotal = getVentaTotalCliente();
        const iva = ventaTotal * 0.21;
        const gn = calcularGananciaReal(ventaTotal, costoTotal);
        db.presupuestos.push({
            id: generarId(),
            numero: numeroPresupuesto,
            clienteId: cliente.id,
            cliente: cliente.nombre,
            patente: document.getElementById('patente').value,
            centroCosto: document.getElementById('centroCosto').value,
            vigencia: document.getElementById('vigencia').value,
            comentarios: document.getElementById('comentarios').value,
            items: itemsPresupuesto.map(i => ({ ...i })),
            usarMarkupGlobal, markupGlobal, incluirIVA, esTercerizado,
            costoProveedor: costoTotal,
            ventaCliente: ventaTotal,
            gananciaBruta: ventaTotal - costoTotal,
            gananciaNetaReal: gn.gananciaNeta,
            iva: incluirIVA ? iva : 0,
            total: incluirIVA ? ventaTotal + iva : ventaTotal,
            fechaCreacion: new Date().toISOString()
        });
        guardarDB();
        mostrarNotificacion(`Presupuesto ${numeroPresupuesto} guardado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    // ==================== FUNCIONES DE RENDERIZADO ====================
    function renderizarTodo() {
        renderizarTablaItems();
        renderizarComparativas();
        const costoTotal = getCostoTotalProveedor();
        const ventaTotal = getVentaTotalCliente();
        const gananciaBruta = ventaTotal - costoTotal;
        const gn = calcularGananciaReal(ventaTotal, costoTotal);
        document.getElementById('resumenCosto').innerHTML = `$${formatNumber(costoTotal)}`;
        document.getElementById('resumenVenta').innerHTML = `$${formatNumber(ventaTotal)}`;
        document.getElementById('resumenDiferencia').innerHTML = `$${formatNumber(gananciaBruta)}`;
        let impHTML = '';
        gn.detalleImpuestos.forEach(imp => {
            impHTML += `<div class="flex justify-between"><span>${imp.nombre} (${imp.base > 0 ? (imp.monto/imp.base*100).toFixed(2) : 0}%):</span><span class="text-red-600">-$${formatNumber(imp.monto)}</span></div>`;
        });
        impHTML += `<div class="flex justify-between border-t pt-1 mt-1"><span>Utilidad Antes Impuestos:</span><span>$${formatNumber(gn.utilidadAntes)}</span></div>`;
        document.getElementById('detalleImpuestos').innerHTML = impHTML;
        document.getElementById('gnGananciaNeta').innerHTML = `$${formatNumber(gn.gananciaNeta)}`;
        document.getElementById('gnMargenSobreDiferencia').innerHTML = `${gn.margenRealSobreDiferencia.toFixed(2)}%`;
        const iva = ventaTotal * 0.21;
        document.getElementById('subtotalFinal').innerHTML = `$${formatNumber(ventaTotal)}`;
        document.getElementById('ivaMonto').innerHTML = `$${formatNumber(iva)}`;
        document.getElementById('totalFinal').innerHTML = `$${formatNumber(ventaTotal + (incluirIVA ? iva : 0))}`;
        document.getElementById('totalOriginal').innerHTML = `$${formatNumber(costoTotal)}`;
        document.getElementById('totalVenta').innerHTML = `$${formatNumber(ventaTotal)}`;
        document.getElementById('diferenciaTotal').innerHTML = `$${formatNumber(gananciaBruta)}`;
    }

    function renderizarTablaItems() {
        const tbody = document.getElementById('itemsBody');
        if (!tbody) return;
        tbody.innerHTML = itemsPresupuesto.map((item, idx) => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precioVenta = item.costo * (1 + markup/100);
            const subtotalVenta = precioVenta * item.cant;
            let trazabilidadHTML = '';
            if (item.compraVinculadaId && item.compraItemIndex !== null) {
                const compra = db.compras.find(c => c.id === item.compraVinculadaId);
                const stock = window.getStockDisponible(item.compraVinculadaId, item.compraItemIndex);
                const compraItem = compra ? compra.items[item.compraItemIndex] : null;
                trazabilidadHTML = `<span class="text-xs text-green-600 block">🔗 ${compra ? escapeHtml(compra.proveedorNombre) : 'Compra'}<br>Asign: ${item.cantidadAsignada || 0} | Stock: ${stock}</span>`;
            } else {
                trazabilidadHTML = `<button onclick="window.vincularCompra(${idx})" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">🔗 Vincular compra</button>`;
            }
            return `
                <tr class="border-b">
                    <td class="p-2 text-center">${item.nro}</td>
                    <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600"></td>
                    <td class="p-2"><input type="number" value="${item.cant}" step="1" onchange="window.actualizarItem(${idx}, 'cant', this.value)" class="w-20 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600"></td>
                    <td class="p-2"><input type="number" value="${item.costo}" step="1000" onchange="window.actualizarItem(${idx}, 'costo', this.value)" class="w-32 p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600"></td>
                    ${!usarMarkupGlobal ? `<td class="p-2"><input type="number" value="${item.markup}" step="5" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-20 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600">%</td>` : ''}
                    <td class="p-2 text-right font-medium text-green-600">$${formatNumber(precioVenta)}</td>
                    <td class="p-2 text-right font-medium">$${formatNumber(subtotalVenta)}</td>
                    <td class="p-2 text-center">${trazabilidadHTML}</td>
                    <td class="p-2 text-center"><button onclick="window.eliminarItem(${idx})" class="text-red-500 text-xl">🗑️</button></td>
                </tr>
            `;
        }).join('');
    }

    function renderizarComparativas() {
        let incHTML = '', finalHTML = '';
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const costoItem = item.costo * item.cant;
            const ventaItem = item.costo * (1 + markup/100) * item.cant;
            incHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${escapeHtml(item.desc)} x${item.cant}</span><span>$${formatNumber(costoItem)} → $${formatNumber(ventaItem)} <span class="text-green-600">(+$${formatNumber(ventaItem - costoItem)})</span></span></div>`;
            finalHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${escapeHtml(item.desc)} x${item.cant}</span><span>$${formatNumber(ventaItem)}</span></div>`;
        });
        document.getElementById('vistaIncremento').innerHTML = incHTML || '<p class="text-gray-400">Sin items</p>';
        document.getElementById('vistaFinal').innerHTML = finalHTML || '<p class="text-gray-400">Sin items</p>';
    }

    // ==================== VINCULACIÓN A COMPRAS ====================
    window.vincularCompra = (idx) => {
        const db = getDB();
        const comprasDisponibles = db.compras.filter(c => 
            c.items && c.items.some(i => i.stockDisponible > 0)
        );
        if (comprasDisponibles.length === 0) {
            mostrarNotificacion('No hay compras con stock disponible', 'warning');
            return;
        }
        const modal = crearModal(`
            <h3 class="font-bold mb-3">Seleccioná una compra para vincular</h3>
            ${comprasDisponibles.map(c => `
                <div class="border-b py-2 cursor-pointer hover:bg-gray-50" onclick="window.seleccionarCompraParaItem(${idx}, '${c.id}')">
                    <p><strong>${escapeHtml(c.proveedorNombre)}</strong> - ${formatDate(c.fechaEmision)}</p>
                    <p class="text-xs text-gray-500">Items con stock: ${c.items.filter(i => i.stockDisponible > 0).length}</p>
                </div>
            `).join('')}
        `, '🔗 Vincular a compra');
        modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
        modal.querySelector('#modalGuardar')?.remove();
    };

    window.seleccionarCompraParaItem = (idx, compraId) => {
        const db = getDB();
        const compra = db.compras.find(c => c.id === compraId);
        if (!compra) { mostrarNotificacion('Compra no encontrada', 'error'); return; }
        const modal = crearModal(`
            <h3 class="font-bold mb-3">Ítems disponibles de ${escapeHtml(compra.proveedorNombre)}</h3>
            ${compra.items.map((item, i) => `
                <div class="border-b py-2 flex justify-between items-center">
                    <div>
                        <p><strong>${escapeHtml(item.descripcion)}</strong></p>
                        <p class="text-xs text-gray-500">Stock: ${item.stockDisponible} unidades | Precio: $${formatNumber(item.precioUnitario)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="number" id="cantidad-asignar-${i}" class="w-16 border rounded px-1 dark:bg-gray-700 dark:border-gray-600" value="1" min="1" max="${item.stockDisponible}">
                        <button onclick="window.asignarItemACompra(${idx}, '${compraId}', ${i})" class="bg-green-600 text-white px-2 py-1 rounded text-sm">Asignar</button>
                    </div>
                </div>
            `).join('')}
        `, '📦 Seleccionar ítem');
        modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
        modal.querySelector('#modalGuardar')?.remove();
    };

    window.asignarItemACompra = (idx, compraId, itemIndex) => {
        const cantidadInput = document.getElementById(`cantidad-asignar-${itemIndex}`);
        const cantidad = parseInt(cantidadInput?.value) || 1;
        if (cantidad <= 0) { mostrarNotificacion('Cantidad inválida', 'error'); return; }
        if (!window.reservarStock(compraId, itemIndex, cantidad)) {
            mostrarNotificacion('Stock insuficiente', 'error');
            return;
        }
        const item = itemsPresupuesto[idx];
        if (item) {
            item.compraVinculadaId = compraId;
            item.compraItemIndex = itemIndex;
            item.cantidadAsignada = cantidad;
            const db = getDB();
            const compra = db.compras.find(c => c.id === compraId);
            if (compra) {
                const compraItem = compra.items[itemIndex];
                if (compraItem) {
                    item.costo = compraItem.precioUnitario || item.costo;
                }
            }
            renderizarTodo();
            mostrarNotificacion(`✅ Asignadas ${cantidad} unidades de ${item.desc}`, 'success');
        }
        cerrarModal(document.querySelector('.modal'));
    };

    window.toggleModoMarkup();
    renderizarTodo();
}

export function initPresupuestosEvents() {}
