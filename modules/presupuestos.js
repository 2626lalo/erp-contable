import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';

// ========== FUNCIONES DE CORRECCIÓN DE TEXTO ==========
function procesarTextoItem(texto) {
    if (!texto) return '';
    let procesado = texto.toUpperCase().trim();
    const correcciones = {
        'SERVICIO': 'SERVICIO', 'PRODUCTO': 'PRODUCTO',
        'MANTENIMIENTO': 'MANTENIMIENTO', 'INSTALACION': 'INSTALACIÓN',
        'REPARACION': 'REPARACIÓN', 'CONSULTORIA': 'CONSULTORÍA',
        'DESARROLLO': 'DESARROLLO', 'SOFTWARE': 'SOFTWARE'
    };
    for (const [mal, bien] of Object.entries(correcciones)) {
        procesado = procesado.replace(new RegExp(mal, 'g'), bien);
    }
    return procesado;
}

let itemsPresupuesto = [];
let markupGlobal = 30;
let usarMarkupGlobal = true;
let incluirIVA = true;

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

export function renderPresupuestos() {
    const db = getDB();
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex gap-3">
                <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl flex-1">+ Nuevo</button>
                <button onclick="window.mostrarModalCargaPresupuesto()" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl flex-1">📷 Cargar</button>
            </div>
            <div id="listaPresupuestos" class="space-y-3">
                ${db.presupuestos.slice().reverse().map(p => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md cursor-pointer" onclick="window.verPresupuestoDetalle(${p.id})">
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 class="font-bold">${p.cliente}</h3>
                                <p class="text-sm">Total: $${formatNumber(p.total)} | ${p.numero}</p>
                                <p class="text-xs text-gray-500">${p.fechaCreacion?.split('T')[0]}</p>
                            </div>
                            <button onclick="event.stopPropagation();window.eliminarPresupuesto(${p.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️</button>
                        </div>
                    </div>
                `).join('') || '<p class="text-center text-gray-500">No hay presupuestos</p>'}
            </div>
        </div>`;
}

function getVigenciaTexto() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 7);
    return `Este presupuesto tiene validez hasta el ${fecha.toLocaleDateString('es-AR')}`;
}

window.mostrarModalNuevoPresupuesto = () => {
    itemsPresupuesto = [
        { nro: 1, desc: "PRODUCTO/SERVICIO", cant: 1, costo: 10000, markup: 30 }
    ];
    markupGlobal = 30;
    usarMarkupGlobal = true;
    incluirIVA = true;
    mostrarEditorPresupuesto();
};

window.mostrarModalCargaPresupuesto = () => {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
                <div class="p-4 border-b flex justify-between">
                    <h2 class="text-xl font-bold">📄 Cargar Presupuesto</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="p-4">
                    <select id="clienteSelect" class="w-full p-2 border rounded-lg mb-4">
                        <option value="">Seleccionar cliente...</option>
                        ${clientesOptions}
                    </select>
                    <div id="itemsContainer" class="space-y-2 mb-4">
                        <div class="flex gap-2">
                            <input type="text" placeholder="Producto" class="itemDesc flex-1 p-2 border rounded-lg">
                            <input type="number" placeholder="Cant." value="1" class="itemCant w-20 p-2 border rounded-lg">
                            <input type="number" placeholder="Precio" class="itemPrecio w-28 p-2 border rounded-lg">
                            <button class="removeItem text-red-500">🗑️</button>
                        </div>
                    </div>
                    <button id="agregarItemCarga" class="bg-gray-200 px-3 py-1 rounded-lg text-sm mb-4">+ Agregar item</button>
                    <button id="procesarCarga" class="w-full bg-green-600 text-white py-3 rounded-xl">➡️ Procesar</button>
                </div>
            </div>
        </div>`;
    
    document.getElementById('agregarItemCarga').onclick = () => {
        const container = document.getElementById('itemsContainer');
        const div = document.createElement('div');
        div.className = 'flex gap-2';
        div.innerHTML = `
            <input type="text" placeholder="Producto" class="itemDesc flex-1 p-2 border rounded-lg">
            <input type="number" placeholder="Cant." value="1" class="itemCant w-20 p-2 border rounded-lg">
            <input type="number" placeholder="Precio" class="itemPrecio w-28 p-2 border rounded-lg">
            <button class="removeItem text-red-500">🗑️</button>
        `;
        div.querySelector('.removeItem').onclick = () => div.remove();
        container.appendChild(div);
    };
    
    document.querySelectorAll('.removeItem').forEach(btn => btn.onclick = function() { this.closest('.flex').remove(); });
    
    document.getElementById('procesarCarga').onclick = () => {
        const items = [];
        let nro = 1;
        document.querySelectorAll('#itemsContainer .itemDesc').forEach((desc, i) => {
            const nombre = desc.value;
            const cant = parseFloat(document.querySelectorAll('.itemCant')[i]?.value) || 1;
            const precio = parseFloat(document.querySelectorAll('.itemPrecio')[i]?.value) || 0;
            if (nombre && precio > 0) {
                items.push({ nro: nro++, desc: procesarTextoItem(nombre), cant, costo: precio, markup: 30 });
            }
        });
        if (items.length === 0) {
            mostrarNotificacion("Agregá al menos un item", 'error');
            return;
        }
        itemsPresupuesto = items;
        markupGlobal = 30;
        usarMarkupGlobal = true;
        incluirIVA = true;
        mostrarEditorPresupuesto();
    };
};

function mostrarEditorPresupuesto() {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    const proximoNumero = getProximoNumeroPresupuesto();
    const numeroPresupuesto = `P-${proximoNumero.toString().padStart(4, '0')}`;
    
    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-6xl mx-auto my-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
                <div class="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b dark:border-gray-700 flex justify-between items-center rounded-t-2xl z-10">
                    <h2 class="text-xl font-bold">✏️ Editar Presupuesto - ${numeroPresupuesto}</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div class="p-4 space-y-4 pb-8">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm">
                        <div class="font-bold text-blue-700 dark:text-blue-300">SOLUM S.A.S.</div>
                        <div class="text-xs text-gray-600 dark:text-gray-400">CUIT: ${empresa?.cuit || '30-12345678-9'} | IVA Responsable Inscripto</div>
                        <div class="text-xs text-gray-600 dark:text-gray-400">Email: ${empresa?.email || 'info@solum.com.ar'} | Tel: ${empresa?.telefono || '11-1234-5678'}</div>
                        <div class="text-xs text-gray-600 dark:text-gray-400">${empresa?.direccion || 'Av. Corrientes 123, CABA'}</div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block font-medium mb-1">Cliente</label><select id="clienteSelect" class="w-full p-2 border rounded-lg"><option value="">Seleccionar cliente...</option>${clientesOptions}</select></div>
                        <div><label class="block font-medium mb-1">Patente / Unidad</label><input type="text" id="patente" placeholder="Ej: ABC-123" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Centro de Costo (opcional)</label><input type="text" id="centroCosto" placeholder="Ej: CC-001" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Vigencia</label><input type="text" id="vigencia" value="${getVigenciaTexto()}" class="w-full p-2 border rounded-lg bg-gray-100" readonly></div>
                    </div>
                    
                    <div class="flex flex-wrap gap-4 p-3 bg-gray-100 rounded-lg">
                        <label class="flex items-center gap-2"><input type="radio" name="modoMarkup" id="modoGlobal" checked onchange="window.toggleModoMarkup()">🎚️ Margen Global (${markupGlobal}%)</label>
                        <label class="flex items-center gap-2"><input type="radio" name="modoMarkup" id="modoIndividual" onchange="window.toggleModoMarkup()">✏️ Margen Individual</label>
                        <label class="flex items-center gap-2 ml-auto"><input type="checkbox" id="incluirIVACheckbox" checked onchange="window.toggleIVA()">💰 Incluir IVA 21%</label>
                    </div>
                    
                    <div id="controlGlobal" class="p-3 bg-purple-50 rounded-lg"><label class="block font-medium mb-1">Margen Global: <span id="porcentajeLabel">${markupGlobal}</span>%</label><input type="range" id="markupSlider" min="0" max="200" value="${markupGlobal}" class="w-full"></div>
                    
                    <h3 class="font-bold">📋 Detalle del Presupuesto</h3>
                    <div class="overflow-x-auto border rounded-lg">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100"><tr><th class="p-2">#</th><th class="p-2">Producto</th><th class="p-2 w-20">Cant.</th><th class="p-2 w-28">Costo U.</th><th class="p-2 w-28 markup-col">Markup %</th><th class="p-2 w-28">Precio</th><th class="p-2 w-28">Subtotal</th><th class="p-2 w-10"></th></tr></thead>
                            <tbody id="itemsBody"></tbody>
                        </table>
                    </div>
                    
                    <div class="flex gap-3"><button id="agregarItem" class="bg-gray-200 px-3 py-1.5 rounded-lg text-sm">+ Agregar item</button><button id="vistaPreviaBtn" class="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm ml-auto">👁️ Vista Previa</button></div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <h3 class="font-bold text-sm mb-2">📊 Análisis de Incremento</h3>
                            <div id="vistaIncremento" class="text-sm max-h-60 overflow-y-auto"></div>
                            <div class="border-t pt-2 mt-2 font-bold">Total Original: <span id="totalOriginal" class="text-blue-600">$0</span></div>
                            <div class="flex justify-between pt-1">Incremento Total: <span id="incrementoTotal" class="text-green-600 font-bold">$0</span></div>
                            <div class="flex justify-between pt-1 text-orange-600">IVA del Original (21%): <span id="ivaOriginalMontos" class="font-bold">$0</span></div>
                            <div class="flex justify-between pt-1 text-purple-600">IVA del Incremento (21%): <span id="ivaIncrementoMontos" class="font-bold">$0</span></div>
                            <div class="flex justify-between pt-1 border-t mt-1 text-orange-700 font-bold">IVA Total a Pagar: <span id="ivaTotalMontos" class="font-bold">$0</span></div>
                        </div>
                        <div class="border border-green-200 rounded-lg p-3 bg-green-50">
                            <h3 class="font-bold text-sm mb-2 text-green-700">💰 Presupuesto Final</h3>
                            <div id="vistaFinal" class="text-sm max-h-60 overflow-y-auto"></div>
                            <div class="border-t pt-2 mt-2 font-bold">Subtotal: <span id="subtotalFinal" class="text-green-600">$0</span></div>
                            <div id="ivaRow" class="flex justify-between pt-1">IVA 21%: <span id="ivaMonto" class="text-orange-600">$0</span></div>
                            <div class="border-t pt-2 mt-1 font-bold text-lg">TOTAL: <span id="totalFinal" class="text-green-700">$0</span></div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-100 rounded-lg p-3"><label class="block font-medium mb-1">📝 Comentarios</label><textarea id="comentarios" rows="2" class="w-full p-2 border rounded-lg" placeholder="Sin otro particular, quedamos a su disposición..."></textarea></div>
                    
                    <div class="flex gap-3 sticky bottom-0 bg-white dark:bg-gray-800 pt-2 pb-2">
                        <button id="guardarPresupuesto" class="flex-1 bg-green-600 text-white py-3 rounded-xl">💾 Guardar</button>
                        <button onclick="window.dispatchEvent(new Event('refreshView'))" class="flex-1 bg-gray-300 py-3 rounded-xl">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    window.toggleModoMarkup = () => {
        usarMarkupGlobal = document.getElementById('modoGlobal').checked;
        const controlGlobal = document.getElementById('controlGlobal');
        const markupCols = document.querySelectorAll('.markup-col');
        if (controlGlobal) controlGlobal.style.display = usarMarkupGlobal ? 'block' : 'none';
        markupCols.forEach(col => col.style.display = usarMarkupGlobal ? 'none' : 'table-cell');
        if (usarMarkupGlobal) itemsPresupuesto.forEach(item => item.markup = markupGlobal);
        renderizarTodo();
    };
    
    window.toggleIVA = () => { incluirIVA = document.getElementById('incluirIVACheckbox').checked; renderizarTodo(); };
    window.actualizarMarkupGlobal = (valor) => { markupGlobal = valor; document.getElementById('porcentajeLabel').innerText = markupGlobal; if (usarMarkupGlobal) { itemsPresupuesto.forEach(item => item.markup = markupGlobal); renderizarTodo(); } };
    window.actualizarMarkupItem = (idx, valor) => { if (itemsPresupuesto[idx]) { itemsPresupuesto[idx].markup = parseFloat(valor) || 0; renderizarTodo(); } };
    window.actualizarItem = (idx, campo, valor) => { if (itemsPresupuesto[idx]) { if (campo === 'cant') itemsPresupuesto[idx].cant = parseFloat(valor) || 0; else if (campo === 'costo') itemsPresupuesto[idx].costo = parseFloat(valor) || 0; else if (campo === 'desc') itemsPresupuesto[idx].desc = procesarTextoItem(valor); } renderizarTodo(); };
    window.eliminarItem = (idx) => { itemsPresupuesto.splice(idx, 1); itemsPresupuesto.forEach((item, i) => item.nro = i + 1); renderizarTodo(); };
    
    document.getElementById('agregarItem').onclick = () => { itemsPresupuesto.push({ nro: itemsPresupuesto.length + 1, desc: "NUEVO SERVICIO", cant: 1, costo: 10000, markup: markupGlobal }); renderizarTodo(); };
    const slider = document.getElementById('markupSlider');
    if (slider) slider.oninput = (e) => window.actualizarMarkupGlobal(parseInt(e.target.value));
    
    document.getElementById('vistaPreviaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) { mostrarNotificacion("Seleccioná un cliente", 'warning'); return; }
        mostrarVistaPreviaCliente(numeroPresupuesto);
    };
    
    function mostrarVistaPreviaCliente(numeroPresupuesto) {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        const patente = document.getElementById('patente').value;
        const centroCosto = document.getElementById('centroCosto').value;
        const comentarios = document.getElementById('comentarios').value || "Sin otro particular, quedamos a su disposición.";
        const vigencia = document.getElementById('vigencia').value;
        
        let totalSinIVA = 0;
        let itemsHTML = '';
        
        itemsPresupuesto.forEach(item => {
            const markupItem = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precioVenta = item.costo * (1 + markupItem/100);
            const subtotal = precioVenta * item.cant;
            totalSinIVA += subtotal;
            itemsHTML += `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px; text-align: center;">${item.nro}</td><td style="padding: 8px;">${item.desc}</td><td style="padding: 8px; text-align: center;">${item.cant}</td><td style="padding: 8px; text-align: right;">$${formatNumber(precioVenta)}</td><td style="padding: 8px; text-align: right;">$${formatNumber(subtotal)}</td></tr>`;
        });
        
        const iva = incluirIVA ? totalSinIVA * 0.21 : 0;
        const totalConIVA = totalSinIVA + iva;
        
        const condiciones = `• Requiere previa autorización del cliente.
• Valores expresados en Pesos Argentinos (ARS).
• Los precios ${incluirIVA ? 'CONTENEN' : 'NO CONTIENEN'} IVA.
• Los tiempos de entrega dependen de la disponibilidad de los repuestos.`;
        
        const previewWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
        previewWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>Presupuesto - ${cliente.nombre}</title><meta charset="UTF-8"><style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 20px; }
                .logo-area { text-align: left; }
                .logo { font-size: 48px; }
                .logo-text { font-size: 18px; font-weight: bold; color: #1e3a8a; margin: 0; }
                .logo-sub { font-size: 10px; color: #6b7280; margin: 0; }
                .presupuesto-numero { text-align: right; }
                .presupuesto-numero h2 { color: #1e3a8a; margin: 0; }
                .empresa-info { text-align: right; font-size: 11px; color: #4b5563; }
                .cliente-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .condiciones { background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 11px; border-left: 4px solid #f59e0b; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th { background: #1e3a8a; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; }
                .totales { text-align: right; margin-top: 20px; padding-top: 10px; border-top: 2px solid #ddd; }
                .iva { color: #f59e0b; }
                .total { font-size: 1.2em; font-weight: bold; color: #059669; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #666; }
                button { background: #1e3a8a; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px; margin-right: 10px; }
                @media print { .no-print { display: none; } }
            </style></head>
            <body>
                <div class="header">
                    <div class="logo-area"><div class="logo">⚡🔧📊</div><p class="logo-text">SOLUM S.A.S.</p><p class="logo-sub">Soluciones Empresariales</p></div>
                    <div class="presupuesto-numero"><h2>PRESUPUESTO Nº ${numeroPresupuesto}</h2></div>
                </div>
                <div class="empresa-info"><p>CUIT: ${empresa?.cuit || '30-12345678-9'} | IVA Responsable Inscripto</p><p>Email: ${empresa?.email || 'info@solum.com.ar'} | Tel: ${empresa?.telefono || '11-1234-5678'}</p><p>${empresa?.direccion || 'Av. Corrientes 123, CABA'}</p></div>
                <div class="cliente-info"><p><strong>Cliente:</strong> ${cliente.nombre}</p><p><strong>Patente/Unidad:</strong> ${patente || 'No especificada'}</p>${centroCosto ? `<p><strong>Centro de Costo:</strong> ${centroCosto}</p>` : ''}<p><strong>Fecha de Emisión:</strong> ${new Date().toLocaleDateString()}</p><p><strong>Vigencia:</strong> ${vigencia}</p></div>
                <div class="condiciones"><strong>📌 Condiciones Generales:</strong><br>${condiciones.replace(/\n/g, '<br>')}</div>
                <h3>📋 Detalle del Presupuesto</h3>
                <table><thead><tr><th>#</th><th>Producto/Servicio</th><th>Cant.</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead><tbody>${itemsHTML}</tbody></table>
                <div class="totales"><p>Subtotal: <strong>$${formatNumber(totalSinIVA)}</strong></p>${incluirIVA ? `<p class="iva">IVA 21%: <strong>$${formatNumber(iva)}</strong></p>` : ''}<p class="total">TOTAL DEL PRESUPUESTO: <strong>$${formatNumber(totalConIVA)}</strong></p></div>
                <div class="footer"><p>${comentarios}</p><p><br>SOLUM S.A.S. - Saluda atentamente.</p></div>
                <div class="no-print" style="text-align: center;"><button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button><button onclick="window.close()">✖️ Cerrar</button></div>
            </body>
            </html>
        `);
        previewWindow.document.close();
    }
    
    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) { mostrarNotificacion("Seleccioná un cliente", 'error'); return; }
        
        let totalOriginal = 0, totalSinIVA = 0;
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            totalOriginal += item.costo * item.cant;
            totalSinIVA += item.costo * (1 + markup/100) * item.cant;
        });
        const ivaOriginal = totalOriginal * 0.21;
        const ivaIncremento = (totalSinIVA - totalOriginal) * 0.21;
        const ivaTotal = totalSinIVA * 0.21;
        
        db.presupuestos.push({
            id: generarId(),
            clienteId: cliente.id,
            cliente: cliente.nombre,
            patente: document.getElementById('patente').value,
            centroCosto: document.getElementById('centroCosto').value,
            vigencia: document.getElementById('vigencia').value,
            comentarios: document.getElementById('comentarios').value,
            incluirIVA: incluirIVA,
            items: itemsPresupuesto.map(i => ({ ...i })),
            usarMarkupGlobal: usarMarkupGlobal,
            markupGlobal: markupGlobal,
            totalOriginal, totalSinIVA, 
            ivaOriginal, ivaIncremento, ivaTotal,
            total: totalSinIVA + (incluirIVA ? ivaTotal : 0),
            numero: numeroPresupuesto,
            fechaCreacion: new Date().toISOString(),
            estado: 'PENDIENTE'
        });
        guardarDB();
        mostrarNotificacion(`✅ Presupuesto ${numeroPresupuesto} guardado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    
    function renderizarTodo() { renderizarTablaItems(); renderizarVistaComparativa(); }
    
    function renderizarTablaItems() {
        const tbody = document.getElementById('itemsBody');
        if (!tbody) return;
        tbody.innerHTML = itemsPresupuesto.map((item, idx) => {
            const markupItem = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precioVenta = item.costo * (1 + markupItem/100);
            return `<tr class="border-b"><td class="p-2 text-center">${item.nro}</td>
                <td class="p-2"><input value="${item.desc}" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm"></td>
                <td class="p-2"><input type="number" value="${item.cant}" step="1" onchange="window.actualizarItem(${idx}, 'cant', this.value)" class="w-20 p-1 border rounded text-sm text-center"></td>
                <td class="p-2"><input type="number" value="${item.costo}" step="100" onchange="window.actualizarItem(${idx}, 'costo', this.value)" class="w-28 p-1 border rounded text-sm text-right"></td>
                ${!usarMarkupGlobal ? `<td class="p-2"><input type="number" value="${item.markup}" step="5" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-20 p-1 border rounded text-sm text-center">%<div><input type="range" min="0" max="200" value="${item.markup}" step="5" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-24 mt-1"></div></td>` : ''}
                <td class="p-2 text-right font-medium text-green-600">$${formatNumber(precioVenta)}</td>
                <td class="p-2 text-right font-medium">$${formatNumber(precioVenta * item.cant)}</td>
                <td class="p-2 text-center"><button onclick="window.eliminarItem(${idx})" class="text-red-500 text-xl">🗑️</button></td>
            </table>`;
        }).join('');
    }
    
    function renderizarVistaComparativa() {
        const vistaIncremento = document.getElementById('vistaIncremento');
        const vistaFinal = document.getElementById('vistaFinal');
        const totalOriginalSpan = document.getElementById('totalOriginal');
        const incrementoTotalSpan = document.getElementById('incrementoTotal');
        const subtotalFinalSpan = document.getElementById('subtotalFinal');
        const ivaMontoSpan = document.getElementById('ivaMonto');
        const totalFinalSpan = document.getElementById('totalFinal');
        const ivaRow = document.getElementById('ivaRow');
        const ivaOriginalMontosSpan = document.getElementById('ivaOriginalMontos');
        const ivaIncrementoMontosSpan = document.getElementById('ivaIncrementoMontos');
        const ivaTotalMontosSpan = document.getElementById('ivaTotalMontos');
        
        if (!vistaIncremento) return;
        
        let totalOriginal = 0, totalSinIVA = 0;
        let incrementoHTML = '', finalHTML = '';
        
        itemsPresupuesto.forEach(item => {
            const markupItem = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const costoOriginalItem = item.costo * item.cant;
            const precioFinalItem = item.costo * (1 + markupItem/100) * item.cant;
            const incrementoItem = precioFinalItem - costoOriginalItem;
            totalOriginal += costoOriginalItem;
            totalSinIVA += precioFinalItem;
            
            incrementoHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${item.desc} x${item.cant}</span><span>$${formatNumber(costoOriginalItem)} → $${formatNumber(precioFinalItem)} <span class="text-green-600">(+$${formatNumber(incrementoItem)})</span></span></div>`;
            finalHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${item.desc} x${item.cant}</span><span>$${formatNumber(precioFinalItem)}</span></div>`;
        });
        
        const incrementoTotal = totalSinIVA - totalOriginal;
        const ivaOriginal = totalOriginal * 0.21;
        const ivaIncremento = incrementoTotal * 0.21;
        const ivaTotal = totalSinIVA * 0.21;
        const iva = incluirIVA ? ivaTotal : 0;
        
        vistaIncremento.innerHTML = incrementoHTML || '<p class="text-gray-400">Sin items</p>';
        vistaFinal.innerHTML = finalHTML || '<p class="text-gray-400">Sin items</p>';
        totalOriginalSpan.innerText = `$${formatNumber(totalOriginal)}`;
        incrementoTotalSpan.innerText = `$${formatNumber(incrementoTotal)}`;
        subtotalFinalSpan.innerText = `$${formatNumber(totalSinIVA)}`;
        if (ivaMontoSpan) ivaMontoSpan.innerText = `$${formatNumber(iva)}`;
        totalFinalSpan.innerText = `$${formatNumber(totalSinIVA + iva)}`;
        if (ivaRow) ivaRow.style.display = incluirIVA ? 'flex' : 'none';
        if (ivaOriginalMontosSpan) ivaOriginalMontosSpan.innerText = `$${formatNumber(ivaOriginal)}`;
        if (ivaIncrementoMontosSpan) ivaIncrementoMontosSpan.innerText = `$${formatNumber(ivaIncremento)}`;
        if (ivaTotalMontosSpan) ivaTotalMontosSpan.innerText = `$${formatNumber(ivaTotal)}`;
    }
    
    window.toggleModoMarkup();
    renderizarTodo();
}

window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    if (!p) return;
    
    document.getElementById('root').innerHTML = `
        <div class="bg-white p-5 rounded-2xl shadow-lg pb-24 max-w-4xl mx-auto">
            <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 mb-4">← Volver</button>
            <div class="bg-blue-50 p-3 rounded-lg mb-4">
                <div class="font-bold">SOLUM S.A.S.</div>
                <div class="text-xs">CUIT: ${empresa?.cuit || '30-12345678-9'} | IVA Responsable Inscripto</div>
                <div class="text-xs">Email: ${empresa?.email || 'info@solum.com.ar'} | Tel: ${empresa?.telefono || '11-1234-5678'}</div>
            </div>
            <h2 class="text-xl font-bold mb-2">📄 Presupuesto Nº ${p.numero}</h2>
            <p class="text-sm text-gray-500 mb-2">Cliente: ${p.cliente}</p>
            <p class="text-sm text-gray-500 mb-2">Patente: ${p.patente || 'N/E'}${p.centroCosto ? ` | Centro Costo: ${p.centroCosto}` : ''}</p>
            <p class="text-sm text-gray-500 mb-4">Vigencia: ${p.vigencia}</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border rounded-lg p-3"><h3 class="font-bold text-sm mb-2">📊 Análisis de Incremento</h3>${p.items.map(i => { const markup = p.usarMarkupGlobal ? p.markupGlobal : (i.markup || 0); const costoOrig = i.costo * i.cant; const precioFinal = i.costo * (1 + markup/100) * i.cant; return `<div class="flex justify-between text-sm py-1"><span>${i.nro}. ${i.desc} x${i.cant}</span><span>$${formatNumber(costoOrig)} → $${formatNumber(precioFinal)} <span class="text-green-600">(+$${formatNumber(precioFinal - costoOrig)})</span></span></div>`; }).join('')}<div class="border-t pt-2 mt-2 font-bold">Total Original: $${formatNumber(p.totalOriginal)}</div><div class="text-green-600">Incremento Total: $${formatNumber(p.totalSinIVA - p.totalOriginal)}</div><div class="text-orange-600 mt-1">IVA del Original (21%): $${formatNumber(p.ivaOriginal || 0)}</div><div class="text-purple-600">IVA del Incremento (21%): $${formatNumber(p.ivaIncremento || 0)}</div><div class="border-t mt-1 pt-1 text-orange-700 font-bold">IVA Total a Pagar: $${formatNumber(p.ivaTotal || 0)}</div></div>
                <div class="border border-green-200 bg-green-50 rounded-lg p-3"><h3 class="font-bold text-sm mb-2 text-green-700">💰 Presupuesto Final</h3>${p.items.map(i => { const markup = p.usarMarkupGlobal ? p.markupGlobal : (i.markup || 0); const precio = i.costo * (1 + markup/100); return `<div class="flex justify-between text-sm py-1"><span>${i.nro}. ${i.desc} x${i.cant}</span><span>$${formatNumber(precio)} = $${formatNumber(precio * i.cant)}</span></div>`; }).join('')}<div class="border-t pt-2 mt-2">Subtotal: <span class="font-bold">$${formatNumber(p.totalSinIVA)}</span></div>${p.incluirIVA ? `<div class="text-orange-600">IVA 21%: $${formatNumber(p.ivaTotal || 0)}</div>` : ''}<div class="border-t pt-2 mt-2 font-bold text-green-700">TOTAL: $${formatNumber(p.total)}</div></div>
            </div>
            ${p.comentarios ? `<div class="mt-4 p-3 bg-gray-100 rounded-lg"><p class="text-sm">${p.comentarios}</p></div>` : ''}
            <div class="flex gap-3 mt-5"><button onclick="window.exportarPresupuestoPDF(${p.id})" class="flex-1 bg-purple-600 text-white py-2 rounded-xl">📄 Exportar PDF</button></div>
        </div>`;
};

window.exportarPresupuestoPDF = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    if (!p) return;
    
    const itemsHTML = p.items.map(i => {
        const markup = p.usarMarkupGlobal ? p.markupGlobal : (i.markup || 0);
        const precio = i.costo * (1 + markup/100);
        return `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px; text-align: center;">${i.nro}侧<td style="padding: 8px;">${i.desc}侧<td style="padding: 8px; text-align: center;">${i.cant}侧<td style="padding: 8px; text-align: right;">$${formatNumber(precio)}侧<td style="padding: 8px; text-align: right;">$${formatNumber(precio * i.cant)}侧</tr>`;
    }).join('');
    
    const condiciones = `• Requiere previa autorización del cliente.
• Valores expresados en Pesos Argentinos (ARS).
• Los precios ${p.incluirIVA ? 'CONTENEN' : 'NO CONTIENEN'} IVA.
• Los tiempos de entrega dependen de la disponibilidad de los repuestos.`;
    
    const content = `<div style="font-family: Arial; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px;">
            <div><div style="font-size: 48px;">⚡🔧📊</div><h2 style="margin:0; color:#1e3a8a;">SOLUM S.A.S.</h2><p style="margin:0; font-size:10px;">Soluciones Empresariales</p></div>
            <div><h2 style="color:#1e3a8a;">PRESUPUESTO Nº ${p.numero}</h2></div>
        </div>
        <div style="text-align: right; font-size: 11px; margin-top: 5px;">
            <p>CUIT: ${empresa?.cuit || '30-12345678-9'} | IVA Responsable Inscripto</p>
            <p>Email: ${empresa?.email || 'info@solum.com.ar'} | Tel: ${empresa?.telefono || '11-1234-5678'}</p>
            <p>${empresa?.direccion || 'Av. Corrientes 123, CABA'}</p>
        </div>
        <div style="background: #f3f4f6; padding: 15px; margin: 15px 0;"><p><strong>Cliente:</strong> ${p.cliente}</p><p><strong>Patente:</strong> ${p.patente || 'N/E'}${p.centroCosto ? ` | Centro Costo: ${p.centroCosto}` : ''}</p><p><strong>Vigencia:</strong> ${p.vigencia}</p></div>
        <div style="background: #fef3c7; padding: 12px; margin: 15px 0; border-left: 4px solid #f59e0b; font-size: 11px;"><strong>📌 Condiciones Generales:</strong><br>${condiciones.replace(/\n/g, '<br>')}</div>
        <table style="width:100%; border-collapse:collapse;"><thead><tr style="background:#1e3a8a;color:white;"><th>#</th><th>Producto</th><th>Cant.</th><th>Precio Unit.</th><th>Subtotal</th></thead><tbody>${itemsHTML}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right;"><strong>Subtotal:</strong></td><td><strong>$${formatNumber(p.totalSinIVA)}</strong></td></tr>${p.incluirIVA ? `<tr><td colspan="4" style="text-align:right;"><strong>IVA 21%:</strong></td><td><strong>$${formatNumber(p.ivaTotal || 0)}</strong></td></tr>` : ''}<tr style="background:#f3f4f6;"><td colspan="4" style="text-align:right;"><strong>TOTAL:</strong></td><td><strong>$${formatNumber(p.total)}</strong></td></tr></tfoot></table>
        <div style="margin-top:30px; font-size:11px; color:#666; text-align:center;"><p>${p.comentarios || "Sin otro particular, quedamos a su disposición."}</p><p><br>SOLUM S.A.S. - Saluda atentamente.</p></div>
    </div>`;
    html2pdf().set({ margin: 1, filename: `presupuesto_${p.numero}.pdf` }).from(content).save();
    mostrarNotificacion(`📄 PDF generado`, 'success');
};

window.eliminarPresupuesto = (id) => {
    if (confirm("¿Eliminar este presupuesto?")) { const db = getDB(); db.presupuestos = db.presupuestos.filter(p => p.id !== id); guardarDB(); mostrarNotificacion("🗑️ Eliminado", 'info'); window.dispatchEvent(new Event('refreshView')); }
};

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'); }
export function initPresupuestosEvents() {}
