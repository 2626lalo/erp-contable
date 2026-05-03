import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';

let itemsPresupuesto = [];
let markupActual = 30;
let clienteSeleccionado = null;

export function renderPresupuestos() {
    const db = getDB();
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex gap-3">
                <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl transition-all shadow-md flex-1 flex items-center justify-center gap-2">
                    <span class="text-xl">+</span> Nuevo Presupuesto
                </button>
                <button onclick="window.mostrarModalEscanearPresupuesto()" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl transition-all shadow-md flex-1 flex items-center justify-center gap-2">
                    <span class="text-xl">📷</span> Escanear
                </button>
            </div>
            <div class="space-y-3">
                ${db.presupuestos.map(p => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all">
                        <div class="flex justify-between items-center">
                            <div>
                                <h3 class="font-bold text-gray-800 dark:text-white text-lg">${p.cliente}</h3>
                                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Total: <span class="font-bold text-blue-600 dark:text-blue-400">$${formatNumber(p.total)}</span></p>
                                <p class="text-xs text-gray-400 mt-1">Nº ${p.numero || 'P-' + p.id} • ${p.fechaCreacion?.split('T')[0]}</p>
                                <div class="flex flex-wrap gap-1 mt-2">
                                    ${p.items?.slice(0, 2).map(i => `<span class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">${i.desc}</span>`).join('')}
                                    ${p.items?.length > 2 ? `<span class="text-xs text-gray-400">+${p.items.length - 2} más</span>` : ''}
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window.verPresupuestoDetalle(${p.id})" class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm hover:bg-blue-200 transition">Ver</button>
                                <button onclick="window.exportarPresupuestoPDF(${p.id})" class="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-xl text-sm hover:bg-green-200 transition">📄 PDF</button>
                                <button onclick="window.convertirPresupuestoAVenta(${p.id})" class="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-3 py-1.5 rounded-xl text-sm hover:bg-purple-200 transition">💰 Convertir</button>
                                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm hover:bg-red-200 transition">🗑️</button>
                            </div>
                        </div>
                    </div>
                `).join('') || '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500 dark:text-gray-400">📭 No hay presupuestos</p><button onclick="window.mostrarModalNuevoPresupuesto()" class="mt-4 bg-blue-600 text-white px-5 py-2 rounded-xl">Crear primer presupuesto</button></div>'}
            </div>
        </div>`;
}

window.eliminarPresupuesto = (id) => {
    if (confirm("¿Eliminar este presupuesto?")) {
        const db = getDB();
        db.presupuestos = db.presupuestos.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion("🗑️ Presupuesto eliminado", 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.mostrarModalNuevoPresupuesto = () => {
    itemsPresupuesto = [{ desc: "Producto/Servicio", cant: 1, costo: 10000 }];
    markupActual = 30;
    mostrarEditorPresupuesto();
};

window.mostrarModalEscanearPresupuesto = () => {
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">📷 Escanear Presupuesto</h2>
                <p class="text-sm text-gray-600 mb-4">Tomá una foto del presupuesto o seleccioná una imagen de la galería</p>
                
                <div class="space-y-3">
                    <label class="block font-medium">📸 Opción 1: Usar cámara</label>
                    <input type="file" id="camaraInput" accept="image/*" capture="environment" class="w-full p-2 border rounded-lg">
                    
                    <div class="text-center text-gray-400">— o —</div>
                    
                    <label class="block font-medium">🖼️ Opción 2: Seleccionar de galería</label>
                    <input type="file" id="galeriaInput" accept="image/*" class="w-full p-2 border rounded-lg">
                </div>
                
                <div id="ocrProgress" class="hidden text-blue-600 text-center mt-3">🔄 Procesando OCR... puede tomar unos segundos</div>
                <div id="ocrResultado" class="mt-3 text-sm"></div>
                <div id="previewImage" class="mt-2 text-center"></div>
                
                <button id="aceptarOCR" class="hidden bg-green-600 text-white p-2 rounded-xl w-full mt-3">✅ Aceptar y editar presupuesto</button>
                <button onclick="window.dispatchEvent(new Event('refreshView'))" class="bg-gray-300 dark:bg-gray-700 p-2 rounded-xl w-full mt-2">Cancelar</button>
            </div>
        </div>`;
    
    let itemsDetectados = [];
    
    const procesarImagen = async (file) => {
        if (!file) return;
        
        // Preview de la imagen
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('previewImage').innerHTML = `<img src="${e.target.result}" class="max-h-40 mx-auto rounded shadow">`;
        };
        reader.readAsDataURL(file);
        
        const progress = document.getElementById('ocrProgress');
        const resultado = document.getElementById('ocrResultado');
        const aceptar = document.getElementById('aceptarOCR');
        
        progress.classList.remove('hidden');
        resultado.innerHTML = '';
        
        try {
            const { data: { text } } = await Tesseract.recognize(file, 'spa');
            const nums = text.match(/\d{2,6}[.,]?\d{0,2}/g) || [];
            const precios = nums.filter(n => {
                const num = parseFloat(n.replace(',', '.'));
                return num > 100 && num < 10000000;
            }).slice(0, 8);
            
            if (precios.length > 0) {
                itemsDetectados = precios.map(p => ({ desc: "Item detectado", cant: 1, costo: parseFloat(p.replace(',', '.')) }));
                resultado.innerHTML = `<div class="bg-green-100 text-green-700 p-2 rounded">✅ Se detectaron ${precios.length} precios:<br>${itemsDetectados.map(i => `$${i.costo}`).join(' • ')}</div>`;
                aceptar.classList.remove('hidden');
            } else {
                resultado.innerHTML = '<div class="bg-red-100 text-red-700 p-2 rounded">⚠️ No se detectaron precios claros. Probá con otra imagen mejor iluminada.</div>';
            }
        } catch(err) {
            resultado.innerHTML = '<div class="bg-red-100 text-red-700 p-2 rounded">❌ Error al procesar la imagen</div>';
        } finally {
            progress.classList.add('hidden');
        }
    };
    
    document.getElementById('camaraInput').onchange = async (e) => procesarImagen(e.target.files[0]);
    document.getElementById('galeriaInput').onchange = async (e) => procesarImagen(e.target.files[0]);
    
    document.getElementById('aceptarOCR').onclick = () => {
        if (itemsDetectados.length > 0) {
            itemsPresupuesto = itemsDetectados;
            mostrarEditorPresupuesto();
        } else {
            mostrarNotificacion("No hay items para editar", 'error');
        }
    };
};

function mostrarEditorPresupuesto() {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-2xl">
                <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 dark:text-gray-400 mb-4 flex items-center gap-1 hover:text-gray-900">← Volver</button>
                <h2 class="text-xl font-bold mb-4">✏️ Editar Presupuesto</h2>
                
                <div class="mb-4">
                    <label class="block font-medium mb-1">Cliente</label>
                    <select id="clienteSelect" class="w-full p-2 border rounded-lg">
                        <option value="">Seleccionar cliente...</option>
                        ${clientesOptions}
                    </select>
                </div>
                
                <div class="mb-4">
                    <label class="block font-medium mb-1">📅 Fecha de vencimiento</label>
                    <input type="date" id="fechaVencimiento" class="w-full p-2 border rounded-lg">
                </div>
                
                <div class="mb-4">
                    <label class="block font-medium mb-1">🎚️ Margen de ganancia: <span id="porcentajeLabel">30</span>%</label>
                    <input type="range" id="markupSlider" min="0" max="200" value="30" class="w-full">
                </div>
                
                <div class="overflow-x-auto border rounded-lg">
                    <table class="min-w-full">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr class="text-left">
                                <th class="p-2">Producto/Servicio</th>
                                <th class="p-2">Cant.</th>
                                <th class="p-2">Costo U.</th>
                                <th class="p-2">Precio Venta</th>
                                <th class="p-2">Subtotal</th>
                                <th class="p-2"></th>
                            <tr>
                        </thead>
                        <tbody id="itemsBody"></tbody>
                    </table>
                </div>
                
                <div class="mt-4 flex gap-2">
                    <button id="agregarItem" class="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-lg">+ Agregar item</button>
                    <button id="guardarPresupuesto" class="bg-green-600 text-white px-4 py-1 rounded-lg ml-auto">💾 Guardar</button>
                </div>
            </div>
        </div>`;
    
    renderizarTablaItems();
    
    window.actualizarItem = (idx, campo, valor) => {
        if (itemsPresupuesto[idx]) itemsPresupuesto[idx][campo] = valor;
        renderizarTablaItems();
    };
    window.eliminarItem = (idx) => {
        itemsPresupuesto.splice(idx, 1);
        renderizarTablaItems();
    };
    
    const slider = document.getElementById('markupSlider');
    slider.oninput = () => {
        markupActual = parseInt(slider.value);
        document.getElementById('porcentajeLabel').innerText = markupActual;
        renderizarTablaItems();
    };
    
    document.getElementById('agregarItem').onclick = () => {
        itemsPresupuesto.push({ desc: "Nuevo servicio", cant: 1, costo: 10000 });
        renderizarTablaItems();
    };
    
    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion("Seleccioná un cliente", 'error');
            return;
        }
        
        const fechaVencimiento = document.getElementById('fechaVencimiento').value;
        const total = itemsPresupuesto.reduce((sum, item) => sum + (item.costo * (1 + markupActual/100) * item.cant), 0);
        
        db.presupuestos.push({
            id: generarId(),
            clienteId: cliente.id,
            cliente: cliente.nombre,
            items: [...itemsPresupuesto],
            markup: markupActual,
            total: total,
            numero: `P-${(db.presupuestos.length + 1001)}`,
            fechaCreacion: new Date().toISOString(),
            fechaVencimiento: fechaVencimiento,
            estado: 'borrador'
        });
        
        guardarDB();
        mostrarNotificacion(`✅ Presupuesto guardado para ${cliente.nombre} por $${formatNumber(total)}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
}

function renderizarTablaItems() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    
    const markup = markupActual / 100;
    tbody.innerHTML = itemsPresupuesto.map((item, idx) => {
        const precioVenta = item.costo * (1 + markup);
        const subtotal = precioVenta * item.cant;
        return `
            <tr class="border-b dark:border-gray-700">
                <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded-lg text-sm"></td>
                <td class="p-2"><input type="number" value="${item.cant}" onchange="window.actualizarItem(${idx}, 'cant', parseFloat(this.value) || 0); window.renderizarTablaItems()" class="w-20 p-1 border rounded-lg text-sm"></td>
                <td class="p-2"><input type="number" value="${item.costo}" onchange="window.actualizarItem(${idx}, 'costo', parseFloat(this.value) || 0); window.renderizarTablaItems()" class="w-28 p-1 border rounded-lg text-sm"></td>
                <td class="p-2 font-medium text-green-600">$${formatNumber(precioVenta)}</td>
                <td class="p-2">$${formatNumber(subtotal)}</td>
                <td class="p-2"><button onclick="window.eliminarItem(${idx})" class="text-red-500 hover:text-red-700 text-xl">🗑️</button></td>
            </tr>
        `;
    }).join('');
    
    const total = itemsPresupuesto.reduce((sum, item) => sum + (item.costo * (1 + markupActual/100) * item.cant), 0);
    tbody.innerHTML += `
        <tr class="bg-gray-50 dark:bg-gray-700 font-bold">
            <td colspan="4" class="p-3 text-right">TOTAL PRESUPUESTO:</td>
            <td class="p-3 text-green-700 dark:text-green-400 text-lg">$${formatNumber(total)}</td>
            <td></td>
        </tr>
    `;
}

window.renderizarTablaItems = renderizarTablaItems;

window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) return;
    
    document.getElementById('root').innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg pb-24 max-w-2xl mx-auto">
            <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 dark:text-gray-400 mb-4 flex items-center gap-1">← Volver</button>
            <h2 class="text-xl font-bold mb-4">📄 Presupuesto - ${p.cliente}</h2>
            <p class="text-sm text-gray-500 mb-4">Nº ${p.numero} • ${p.fechaCreacion?.split('T')[0]}</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border rounded-lg p-3">
                    <h3 class="font-bold text-sm mb-2">📋 Items originales</h3>
                    ${p.items.map(i => `<div class="text-sm py-1">${i.desc}: ${i.cant} x $${formatNumber(i.costo)} = $${formatNumber(i.costo * i.cant)}</div>`).join('')}
                    <div class="font-bold mt-2 pt-2 border-t">Total Original: $${formatNumber(p.items.reduce((s,i)=>s+i.costo*i.cant,0))}</div>
                </div>
                <div class="border border-green-200 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <h3 class="font-bold text-sm mb-2 text-green-700">💰 Con ${p.markup}% markup</h3>
                    ${p.items.map(i => `<div class="text-sm py-1">${i.desc}: ${i.cant} x $${formatNumber(i.costo*(1+p.markup/100))} = $${formatNumber(i.costo*(1+p.markup/100)*i.cant)}</div>`).join('')}
                    <div class="font-bold mt-2 pt-2 border-t text-green-700">Total Final: $${formatNumber(p.total)}</div>
                </div>
            </div>
            
            <div class="flex gap-3 mt-5">
                <button onclick="window.convertirPresupuestoAVenta(${p.id})" class="flex-1 bg-purple-600 text-white py-2 rounded-xl">💰 Convertir en Venta</button>
                <button onclick="window.exportarPresupuestoPDF(${p.id})" class="flex-1 bg-green-600 text-white py-2 rounded-xl">📄 Exportar PDF</button>
            </div>
        </div>`;
};

window.convertirPresupuestoAVenta = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) return;
    
    const fecha = new Date().toISOString().split('T')[0];
    const cliente = db.clientes.find(c => c.id === p.clienteId);
    if (!cliente) {
        mostrarNotificacion("Cliente no encontrado", 'error');
        return;
    }
    
    const ivaMonto = p.total * 0.21;
    const totalConIVA = p.total + ivaMonto;
    const fechaCobro = new Date(fecha);
    fechaCobro.setDate(fechaCobro.getDate() + cliente.diasCobro);
    
    db.ventas.push({
        id: generarId(),
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        montoNeto: p.total,
        iva: 21,
        ivaMonto: ivaMonto,
        total: totalConIVA,
        tipoComprobante: "Presupuesto",
        numComprobante: p.numero,
        fechaVenta: fecha,
        fechaCobroEsperada: fechaCobro.toISOString().split('T')[0],
        mes: fecha.substring(0, 7),
        estado: 'pendiente_cobro',
        presupuestoOrigen: p.id
    });
    
    guardarDB();
    mostrarNotificacion(`✅ Presupuesto ${p.numero} convertido a venta por $${formatNumber(totalConIVA)}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
    window.showView('ventas');
};

window.exportarPresupuestoPDF = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (!p) return;
    
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const content = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="color: #2563eb;">${empresa?.nombre || 'Mi Empresa'}</h1>
            <p>CUIT: ${empresa?.cuit || ''} | Tel: ${empresa?.telefono || ''}</p>
            <hr>
            <h2>PRESUPUESTO Nº ${p.numero}</h2>
            <p><strong>Cliente:</strong> ${p.cliente}</p>
            <p><strong>Fecha:</strong> ${p.fechaCreacion?.split('T')[0]}</p>
            <p><strong>Vencimiento:</strong> ${p.fechaVencimiento || '30 días'}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead><tr style="background: #f3f4f6;"><th style="padding: 8px; border: 1px solid #ddd;">Producto</th><th style="padding: 8px; border: 1px solid #ddd;">Cant.</th><th style="padding: 8px; border: 1px solid #ddd;">Precio Unit.</th><th style="padding: 8px; border: 1px solid #ddd;">Subtotal</th></tr></thead>
                <tbody>${p.items.map(i => `<tr><td style="padding: 8px; border: 1px solid #ddd;">${i.desc}</td><td style="padding: 8px; border: 1px solid #ddd;">${i.cant}</td><td style="padding: 8px; border: 1px solid #ddd;">$${formatNumber(i.costo)}</td><td style="padding: 8px; border: 1px solid #ddd;">$${formatNumber(i.costo * i.cant)}</td></tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="3" style="padding: 8px; text-align: right;"><strong>Total con ${p.markup}% markup:</strong></td><td style="padding: 8px;"><strong>$${formatNumber(p.total)}</strong></td></tr></tfoot>
            </table>
            <hr>
            <p style="font-size: 12px; color: #666;">Presupuesto válido por 30 días. ${empresa?.nombre || ''}</p>
        </div>
    `;
    html2pdf().set({ margin: 1, filename: `presupuesto_${p.numero}.pdf` }).from(content).save();
    mostrarNotificacion(`📄 PDF generado: ${p.numero}`, 'success');
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

export function initPresupuestosEvents() {
    // Event listeners para presupuestos
    document.querySelectorAll('[onclick*="mostrarModalNuevoPresupuesto"]').forEach(el => {
        el.onclick = () => window.mostrarModalNuevoPresupuesto?.();
    });
    document.querySelectorAll('[onclick*="mostrarModalEscanearPresupuesto"]').forEach(el => {
        el.onclick = () => window.mostrarModalEscanearPresupuesto?.();
    });
}
