import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';
import { extraerTextoPDF, analizarTextoPresupuesto } from './pdf-parser.js';

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

function procesarTextoItem(texto) {
    if (!texto) return '';
    return texto.toUpperCase().trim();
}

function getVigenciaTexto() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 7);
    return `Este presupuesto tiene validez hasta el ${fecha.toLocaleDateString('es-AR')}`;
}

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

window.mostrarModalNuevoPresupuesto = () => {
    itemsPresupuesto = [{ nro: 1, desc: "PRODUCTO/SERVICIO", cant: 1, costo: 10000, markup: 30 }];
    markupGlobal = 30;
    usarMarkupGlobal = true;
    incluirIVA = true;
    mostrarEditorPresupuesto();
};

window.mostrarModalCargarPDF = () => {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    let pdfItems = [];
    
    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-6xl mx-auto my-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
                <div class="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b flex justify-between items-center rounded-t-2xl">
                    <h2 class="text-xl font-bold">📄 Cargar Presupuesto desde PDF</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="p-4">
                    <div class="flex gap-4 mb-4">
                        <div class="flex-1">
                            <label class="block font-medium mb-2">📁 Seleccionar PDF</label>
                            <input type="file" id="pdfFile" accept=".pdf" class="w-full p-2 border rounded-lg">
                        </div>
                        <div class="flex items-end">
                            <label class="flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
                                <input type="checkbox" id="ocrCheckbox">
                                <span>🔍 Usar OCR</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <div id="pdfPreview" class="border rounded-lg min-h-[400px] max-h-[500px] overflow-auto bg-gray-50 flex items-center justify-center">
                                <div class="text-center text-gray-400">👈 Selecciona un PDF</div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between items-center mb-2">
                                <label class="font-medium">📋 Items detectados</label>
                                <button id="limpiarItems" class="text-red-500 text-sm">Limpiar</button>
                            </div>
                            <div id="itemsDetectados" class="border rounded-lg min-h-[400px] max-h-[500px] overflow-auto p-2 bg-gray-50">
                                <div class="text-center text-gray-400 py-20">🔄 Los items aparecerán aquí</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block font-medium mb-1">Cliente</label><select id="clienteSelect" class="w-full p-2 border rounded-lg"><option value="">Seleccionar...</option>${clientesOptions}</select></div>
                        <div><label class="block font-medium mb-1">Patente</label><input type="text" id="patente" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Centro de Costo</label><input type="text" id="centroCosto" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Vigencia</label><input type="text" id="vigencia" value="${getVigenciaTexto()}" class="w-full p-2 border rounded-lg bg-gray-100" readonly></div>
                    </div>
                    
                    <div class="flex gap-3 mt-4">
                        <button id="usarItemsBtn" class="flex-1 bg-blue-600 text-white py-3 rounded-xl">➡️ Usar estos items</button>
                        <button id="reintentarOCR" class="flex-1 bg-purple-600 text-white py-3 rounded-xl">🔄 Reintentar OCR</button>
                        <button onclick="window.dispatchEvent(new Event('refreshView'))" class="flex-1 bg-gray-300 py-3 rounded-xl">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    const fileInput = document.getElementById('pdfFile');
    const pdfPreview = document.getElementById('pdfPreview');
    const itemsDetectadosDiv = document.getElementById('itemsDetectados');
    const ocrCheckbox = document.getElementById('ocrCheckbox');
    
    function actualizarItemsDetectados(items) {
        if (!items || items.length === 0) {
            itemsDetectadosDiv.innerHTML = '<div class="text-center text-gray-400 py-10">📭 No se detectaron items</div>';
            return;
        }
        
        itemsDetectadosDiv.innerHTML = `
            <table class="w-full text-sm">
                <thead class="bg-gray-200 sticky top-0">
                    <tr><th class="p-2">#</th><th>Producto</th><th class="w-20">Cant.</th><th class="w-28">Precio</th><th class="w-10"></th></tr>
                </thead>
                <tbody id="itemsTableBody"></tbody>
            </table>
            <button id="agregarItemManual" class="mt-2 w-full bg-gray-200 p-2 rounded-lg text-sm">+ Agregar item manual</button>
        `;
        
        function renderItems() {
            const tbody = document.getElementById('itemsTableBody');
            tbody.innerHTML = pdfItems.map((item, idx) => `
                <tr class="border-b">
                    <td class="p-2 text-center">${idx + 1}</td>
                    <td class="p-2"><input value="${escapeHtml(item.desc)}" data-idx="${idx}" data-field="desc" class="item-edit w-full p-1 border rounded text-sm"></td>
                    <td class="p-2"><input type="number" value="${item.cant}" data-idx="${idx}" data-field="cant" class="item-edit w-20 p-1 border rounded text-center"></td>
                    <td class="p-2"><input type="number" value="${item.costo}" data-idx="${idx}" data-field="costo" class="item-edit w-28 p-1 border rounded text-right"></td>
                    <td class="p-2"><button data-idx="${idx}" class="eliminar-item text-red-500">🗑️</button></td>
                </tr>
            `).join('');
            
            document.querySelectorAll('.item-edit').forEach(input => {
                input.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const field = e.target.dataset.field;
                    if (pdfItems[idx]) {
                        if (field === 'cant') pdfItems[idx].cant = parseFloat(e.target.value) || 1;
                        else if (field === 'costo') pdfItems[idx].costo = parseFloat(e.target.value) || 0;
                        else if (field === 'desc') pdfItems[idx].desc = procesarTextoItem(e.target.value);
                    }
                });
            });
            
            document.querySelectorAll('.eliminar-item').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    pdfItems.splice(idx, 1);
                    renderItems();
                });
            });
        }
        
        renderItems();
        
        document.getElementById('agregarItemManual').onclick = () => {
            pdfItems.push({ desc: "NUEVO ITEM", cant: 1, costo: 0 });
            renderItems();
        };
    }
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const fileUrl = URL.createObjectURL(file);
        pdfPreview.innerHTML = `<iframe src="${fileUrl}" class="w-full h-[450px] border-0"></iframe>`;
        
        const usarOCR = ocrCheckbox.checked;
        mostrarNotificacion(`📖 Leyendo PDF${usarOCR ? ' con OCR...' : '...'}`, 'info');
        
        try {
            const texto = await extraerTextoPDF(file, usarOCR);
            const items = analizarTextoPresupuesto(texto);
            
            if (items.length === 0) {
                itemsDetectadosDiv.innerHTML = '<div class="text-center text-orange-400 py-10">⚠️ No se detectaron items</div>';
                pdfItems = [];
            } else {
                pdfItems = items.map(item => ({
                    desc: procesarTextoItem(item.desc.substring(0, 45)),
                    cant: item.cantidad || 1,
                    costo: item.precio
                }));
                actualizarItemsDetectados(pdfItems);
                mostrarNotificacion(`✅ Se detectaron ${items.length} items`, 'success');
            }
        } catch (error) {
            console.error(error);
            itemsDetectadosDiv.innerHTML = '<div class="text-center text-red-400 py-10">❌ Error al leer el PDF</div>';
            mostrarNotificacion('Error al leer el PDF', 'error');
        }
    });
    
    document.getElementById('reintentarOCR').onclick = () => {
        ocrCheckbox.checked = true;
        const file = fileInput.files[0];
        if (file) fileInput.dispatchEvent(new Event('change'));
        else mostrarNotificacion('Primero seleccioná un PDF', 'warning');
    };
    
    document.getElementById('usarItemsBtn').onclick = () => {
        if (!pdfItems || pdfItems.length === 0) {
            mostrarNotificacion('No hay items', 'warning');
            return;
        }
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        if (!clienteId) {
            mostrarNotificacion('Seleccioná un cliente', 'warning');
            return;
        }
        
        itemsPresupuesto = pdfItems.map((item, idx) => ({
            nro: idx + 1,
            desc: item.desc,
            cant: item.cant,
            costo: item.costo,
            markup: 30
        }));
        
        window.dispatchEvent(new Event('refreshView'));
        setTimeout(() => mostrarEditorPresupuesto(), 100);
    };
};

function mostrarEditorPresupuesto() {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    const numeroPresupuesto = `P-${getProximoNumeroPresupuesto().toString().padStart(4, '0')}`;
    
    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-6xl mx-auto my-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
                <div class="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b flex justify-between items-center rounded-t-2xl">
                    <h2 class="text-xl font-bold">✏️ Editar Presupuesto - ${numeroPresupuesto}</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="p-4 space-y-4 pb-8">
                    <div class="bg-blue-50 p-3 rounded-lg text-sm">
                        <div class="font-bold text-blue-700">SOLUM S.A.S.</div>
                        <div class="text-xs text-gray-600">CUIT: 30-12345678-9 | IVA Responsable Inscripto</div>
                        <div class="text-xs text-gray-600">Email: info@solum.com.ar | Tel: 11-1234-5678</div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block font-medium mb-1">Cliente</label><select id="clienteSelect" class="w-full p-2 border rounded-lg"><option value="">Seleccionar...</option>${clientesOptions}</select></div>
                        <div><label class="block font-medium mb-1">Patente</label><input type="text" id="patente" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Centro de Costo</label><input type="text" id="centroCosto" class="w-full p-2 border rounded-lg"></div>
                        <div><label class="block font-medium mb-1">Vigencia</label><input type="text" id="vigencia" value="${getVigenciaTexto()}" class="w-full p-2 border rounded-lg bg-gray-100" readonly></div>
                    </div>
                    
                    <div class="flex flex-wrap gap-4 p-3 bg-gray-100 rounded-lg">
                        <label><input type="radio" name="modoMarkup" id="modoGlobal" checked onchange="window.toggleModoMarkup()"> 🎚️ Margen Global (${markupGlobal}%)</label>
                        <label><input type="radio" name="modoMarkup" id="modoIndividual" onchange="window.toggleModoMarkup()"> ✏️ Margen Individual</label>
                        <label class="ml-auto"><input type="checkbox" id="incluirIVACheckbox" checked onchange="window.toggleIVA()"> 💰 Incluir IVA 21%</label>
                    </div>
                    
                    <div id="controlGlobal" class="p-3 bg-purple-50 rounded-lg">
                        <label>Margen Global: <span id="porcentajeLabel">${markupGlobal}</span>%</label>
                        <input type="range" id="markupSlider" min="0" max="200" value="${markupGlobal}" class="w-full mt-1">
                    </div>
                    
                    <div class="overflow-x-auto border rounded-lg">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100">
                                <tr><th class="p-2">#</th><th class="p-2">Producto</th><th class="p-2 w-20">Cant.</th><th class="p-2 w-28">Costo U.</th><th class="p-2 w-28 markup-col">Markup %</th><th class="p-2 w-28">Precio</th><th class="p-2 w-28">Subtotal</th><th class="p-2 w-10"></th></tr>
                            </thead>
                            <tbody id="itemsBody"></tbody>
                        </table>
                    </div>
                    
                    <div class="flex gap-3">
                        <button id="agregarItem" class="bg-gray-200 px-3 py-1.5 rounded-lg text-sm">+ Agregar item</button>
                        <button id="vistaPreviaBtn" class="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm ml-auto">👁️ Vista Previa</button>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <h3 class="font-bold text-sm mb-2">📊 Análisis de Incremento</h3>
                            <div id="vistaIncremento" class="text-sm max-h-60 overflow-auto"></div>
                            <div class="border-t pt-2 mt-2">Total Original: <span id="totalOriginal" class="font-bold">$0</span></div>
                            <div>Incremento: <span id="incrementoTotal" class="text-green-600 font-bold">$0</span></div>
                            <div class="text-orange-600">IVA Original: <span id="ivaOriginalMontos">$0</span></div>
                            <div class="text-purple-600">IVA Incremento: <span id="ivaIncrementoMontos">$0</span></div>
                            <div class="border-t mt-1 pt-1 text-orange-700 font-bold">IVA Total: <span id="ivaTotalMontos">$0</span></div>
                        </div>
                        <div class="border border-green-200 rounded-lg p-3 bg-green-50">
                            <h3 class="font-bold text-sm mb-2 text-green-700">💰 Presupuesto Final</h3>
                            <div id="vistaFinal" class="text-sm max-h-60 overflow-auto"></div>
                            <div class="border-t pt-2 mt-2">Subtotal: <span id="subtotalFinal" class="font-bold">$0</span></div>
                            <div id="ivaRow">IVA 21%: <span id="ivaMonto" class="text-orange-600">$0</span></div>
                            <div class="border-t pt-2 mt-1 font-bold text-lg">TOTAL: <span id="totalFinal" class="text-green-700">$0</span></div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-100 rounded-lg p-3">
                        <label class="block font-medium mb-1">📝 Comentarios</label>
                        <textarea id="comentarios" rows="2" class="w-full p-2 border rounded-lg" placeholder="Sin otro particular, quedamos a su disposición..."></textarea>
                    </div>
                    
                    <div class="flex gap-3 sticky bottom-0 bg-white pt-2 pb-2">
                        <button id="guardarPresupuesto" class="flex-1 bg-green-600 text-white py-3 rounded-xl">💾 Guardar</button>
                        <button onclick="window.dispatchEvent(new Event('refreshView'))" class="flex-1 bg-gray-300 py-3 rounded-xl">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>`;
    
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
            if (campo === 'cant') itemsPresupuesto[idx].cant = parseFloat(valor) || 0;
            else if (campo === 'costo') itemsPresupuesto[idx].costo = parseFloat(valor) || 0;
            else if (campo === 'desc') itemsPresupuesto[idx].desc = procesarTextoItem(valor);
            renderizarTodo();
        }
    };
    
    window.eliminarItem = (idx) => {
        itemsPresupuesto.splice(idx, 1);
        itemsPresupuesto.forEach((item, i) => item.nro = i + 1);
        renderizarTodo();
    };
    
    document.getElementById('agregarItem').onclick = () => {
        itemsPresupuesto.push({ nro: itemsPresupuesto.length + 1, desc: "NUEVO SERVICIO", cant: 1, costo: 10000, markup: markupGlobal });
        renderizarTodo();
    };
    
    document.getElementById('markupSlider').oninput = (e) => window.actualizarMarkupGlobal(parseInt(e.target.value));
    
    document.getElementById('vistaPreviaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion('Seleccioná un cliente', 'warning');
            return;
        }
        mostrarVistaPrevia(numeroPresupuesto, cliente);
    };
    
    function mostrarVistaPrevia(numero, cliente) {
        const patente = document.getElementById('patente').value;
        const centroCosto = document.getElementById('centroCosto').value;
        const comentarios = document.getElementById('comentarios').value || 'Sin otro particular, quedamos a su disposición.';
        const vigencia = document.getElementById('vigencia').value;
        
        let total = 0;
        let itemsHTML = '';
        
        itemsPresupuesto.forEach(item => {
            const markupItem = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precio = item.costo * (1 + markupItem/100);
            const subtotal = precio * item.cant;
            total += subtotal;
            itemsHTML += `<tr><td style="padding: 8px;">${item.nro}</td><td style="padding: 8px;">${item.desc}</td><td style="padding: 8px; text-align: center;">${item.cant}</td><td style="padding: 8px; text-align: right;">$${formatNumber(precio)}</td><td style="padding: 8px; text-align: right;">$${formatNumber(subtotal)}</td></tr>`;
        });
        
        const iva = incluirIVA ? total * 0.21 : 0;
        const totalConIVA = total + iva;
        
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(`
            <html>
            <head>
                <title>Presupuesto ${numero}</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
                    .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 20px; }
                    .header h1 { color: #1e3a8a; margin: 0; }
                    .cliente-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { background: #1e3a8a; color: white; padding: 10px; text-align: left; }
                    td { padding: 8px; border-bottom: 1px solid #ddd; }
                    .totales { text-align: right; margin-top: 20px; padding-top: 10px; border-top: 2px solid #ddd; }
                    .total { font-size: 1.2em; font-weight: bold; color: #059669; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #666; }
                    button { background: #1e3a8a; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px; margin-right: 10px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>SOLUM S.A.S.</h1>
                    <p>CUIT: 30-12345678-9 | IVA Responsable Inscripto</p>
                    <p>Email: info@solum.com.ar | Tel: 11-1234-5678</p>
                </div>
                <div class="cliente-info">
                    <p><strong>Cliente:</strong> ${cliente.nombre}</p>
                    <p><strong>Patente:</strong> ${patente || 'No especificada'}${centroCosto ? ` | Centro Costo: ${centroCosto}` : ''}</p>
                    <p><strong>Vigencia:</strong> ${vigencia}</p>
                </div>
                <h3>📋 Detalle del Presupuesto</h3>
                <table>
                    <thead><tr><th>#</th><th>Producto</th><th>Cant.</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead>
                    <tbody>${itemsHTML}</tbody>
                </table>
                <div class="totales">
                    <p>Subtotal: <strong>$${formatNumber(total)}</strong></p>
                    ${incluirIVA ? `<p>IVA 21%: <strong>$${formatNumber(iva)}</strong></p>` : ''}
                    <p class="total">TOTAL: <strong>$${formatNumber(totalConIVA)}</strong></p>
                </div>
                <div class="footer">
                    <p>${comentarios}</p>
                    <p><br>SOLUM S.A.S. - Saluda atentamente.</p>
                </div>
                <div class="no-print" style="text-align: center;">
                    <button onclick="window.print()">🖨️ Imprimir</button>
                    <button onclick="window.close()">✖️ Cerrar</button>
                </div>
            </body>
            </html>
        `);
    }
    
    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion('Seleccioná un cliente', 'error');
            return;
        }
        
        let totalOriginal = 0, totalFinal = 0;
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            totalOriginal += item.costo * item.cant;
            totalFinal += item.costo * (1 + markup/100) * item.cant;
        });
        
        const iva = totalFinal * 0.21;
        const presupuesto = {
            id: generarId(),
            numero: numeroPresupuesto,
            clienteId: cliente.id,
            cliente: cliente.nombre,
            patente: document.getElementById('patente').value,
            centroCosto: document.getElementById('centroCosto').value,
            vigencia: document.getElementById('vigencia').value,
            comentarios: document.getElementById('comentarios').value,
            items: itemsPresupuesto.map(i => ({ ...i })),
            usarMarkupGlobal,
            markupGlobal,
            incluirIVA,
            totalOriginal,
            totalSinIVA: totalFinal,
            iva: incluirIVA ? iva : 0,
            total: incluirIVA ? totalFinal + iva : totalFinal,
            fechaCreacion: new Date().toISOString()
        };
        
        db.presupuestos.push(presupuesto);
        guardarDB();
        mostrarNotificacion(`✅ Presupuesto ${numeroPresupuesto} guardado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    
    function renderizarTodo() {
        renderizarTablaItems();
        renderizarComparativas();
    }
    
    function renderizarTablaItems() {
        const tbody = document.getElementById('itemsBody');
        if (!tbody) return;
        tbody.innerHTML = itemsPresupuesto.map((item, idx) => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precio = item.costo * (1 + markup/100);
            return `
                <tr class="border-b">
                    <td class="p-2 text-center">${item.nro}</td>
                    <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm"></td>
                    <td class="p-2"><input type="number" value="${item.cant}" step="1" onchange="window.actualizarItem(${idx}, 'cant', this.value)" class="w-20 p-1 border rounded text-sm text-center"></td>
                    <td class="p-2"><input type="number" value="${item.costo}" step="100" onchange="window.actualizarItem(${idx}, 'costo', this.value)" class="w-28 p-1 border rounded text-sm text-right"></td>
                    ${!usarMarkupGlobal ? `<td class="p-2"><input type="number" value="${item.markup}" step="5" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-20 p-1 border rounded text-sm text-center">%<div><input type="range" min="0" max="200" value="${item.markup}" step="5" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-24 mt-1"></div></td>` : ''}
                    <td class="p-2 text-right font-medium text-green-600">$${formatNumber(precio)}</td>
                    <td class="p-2 text-right font-medium">$${formatNumber(precio * item.cant)}</td>
                    <td class="p-2 text-center"><button onclick="window.eliminarItem(${idx})" class="text-red-500 text-xl">🗑️</button></td>
                </tr>
            `;
        }).join('');
    }
    
    function renderizarComparativas() {
        let totalOriginal = 0, totalFinal = 0;
        let incHTML = '', finalHTML = '';
        
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const costoOrig = item.costo * item.cant;
            const precioFinal = item.costo * (1 + markup/100) * item.cant;
            totalOriginal += costoOrig;
            totalFinal += precioFinal;
            incHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${item.desc} x${item.cant}</span><span>$${formatNumber(costoOrig)} → $${formatNumber(precioFinal)} <span class="text-green-600">(+$${formatNumber(precioFinal - costoOrig)})</span></span></div>`;
            finalHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${item.desc} x${item.cant}</span><span>$${formatNumber(precioFinal)}</span></div>`;
        });
        
        const incremento = totalFinal - totalOriginal;
        const ivaOriginal = totalOriginal * 0.21;
        const ivaIncremento = incremento * 0.21;
        const ivaTotal = totalFinal * 0.21;
        
        document.getElementById('vistaIncremento').innerHTML = incHTML;
        document.getElementById('vistaFinal').innerHTML = finalHTML;
        document.getElementById('totalOriginal').innerHTML = `$${formatNumber(totalOriginal)}`;
        document.getElementById('incrementoTotal').innerHTML = `$${formatNumber(incremento)}`;
        document.getElementById('subtotalFinal').innerHTML = `$${formatNumber(totalFinal)}`;
        document.getElementById('ivaMonto').innerHTML = `$${formatNumber(ivaTotal)}`;
        document.getElementById('totalFinal').innerHTML = `$${formatNumber(totalFinal + (incluirIVA ? ivaTotal : 0))}`;
        document.getElementById('ivaOriginalMontos').innerHTML = `$${formatNumber(ivaOriginal)}`;
        document.getElementById('ivaIncrementoMontos').innerHTML = `$${formatNumber(ivaIncremento)}`;
        document.getElementById('ivaTotalMontos').innerHTML = `$${formatNumber(ivaTotal)}`;
        document.getElementById('ivaRow').style.display = incluirIVA ? 'block' : 'none';
    }
    
    window.toggleModoMarkup();
    renderizarTodo();
}

window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) return;
    
    document.getElementById('root').innerHTML = `
        <div class="bg-white p-5 rounded-2xl shadow-lg max-w-4xl mx-auto">
            <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 mb-4">← Volver</button>
            <h2 class="text-xl font-bold mb-2">📄 Presupuesto ${p.numero}</h2>
            <p><strong>Cliente:</strong> ${p.cliente}</p>
            <p><strong>Patente:</strong> ${p.patente || 'N/E'} ${p.centroCosto ? `| Centro Costo: ${p.centroCosto}` : ''}</p>
            <p><strong>Vigencia:</strong> ${p.vigencia}</p>
            <p><strong>Total:</strong> $${formatNumber(p.total)}</p>
            <p><strong>Fecha:</strong> ${new Date(p.fechaCreacion).toLocaleDateString()}</p>
            ${p.comentarios ? `<p><strong>Comentarios:</strong> ${p.comentarios}</p>` : ''}
            <div class="flex gap-3 mt-5">
                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-600 text-white px-4 py-2 rounded-xl">Eliminar</button>
            </div>
        </div>`;
};

window.eliminarPresupuesto = (id) => {
    if (confirm('¿Eliminar este presupuesto?')) {
        const db = getDB();
        db.presupuestos = db.presupuestos.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion('Presupuesto eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

export function initPresupuestosEvents() {}
