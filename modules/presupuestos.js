import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';
import { procesarImagenOCR, formatearDatosParaEditor } from './ocrProcessor.js';
import { mostrarEditorImagen } from './imageEditor.js';

let itemsPresupuesto = [];
let markupActual = 30;
let imagenOriginal = null;
let datosOCRCompletos = null;

// Función para comprimir imagen antes de usarla
function comprimirImagenPrevia(file, maxWidth = 1024, calidad = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve({
                        blob: blob,
                        url: canvas.toDataURL('image/jpeg', calidad),
                        width: width,
                        height: height
                    });
                }, 'image/jpeg', calidad);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

export function renderPresupuestos() {
    const db = getDB();
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex gap-3">
                <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl transition-all shadow-md flex-1 flex items-center justify-center gap-2">
                    <span class="text-xl">+</span> Nuevo Presupuesto
                </button>
                <button id="btnEscanearDirecto" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl transition-all shadow-md flex-1 flex items-center justify-center gap-2">
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
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window.verPresupuestoDetalle(${p.id})" class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-sm">Ver</button>
                                <button onclick="window.exportarPresupuestoPDF(${p.id})" class="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-xl text-sm">📄 PDF</button>
                                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-xl text-sm">🗑️</button>
                            </div>
                        </div>
                    </div>
                `).join('') || '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">📭 No hay presupuestos</p><button onclick="window.mostrarModalNuevoPresupuesto()" class="mt-4 bg-blue-600 text-white px-5 py-2 rounded-xl">Crear primer presupuesto</button></div>'}
            </div>
        </div>`;
    
    setTimeout(() => {
        const btnEscanear = document.getElementById('btnEscanearDirecto');
        if (btnEscanear) {
            btnEscanear.onclick = () => iniciarCapturaImagen();
        }
    }, 100);
}

async function iniciarCapturaImagen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        mostrarNotificacion("📸 Comprimiendo imagen...", 'info');
        
        try {
            // Comprimir imagen antes de mostrarla
            const imagenComprimida = await comprimirImagenPrevia(file, 1024, 0.7);
            
            // Mostrar editor con la imagen comprimida
            mostrarEditorImagen(imagenComprimida.url, async (imagenEditada) => {
                await procesarOCRConImagenEditada(imagenEditada);
            });
        } catch (error) {
            console.error('Error al comprimir:', error);
            mostrarNotificacion("Error al procesar la imagen", 'error');
        }
    };
    
    input.click();
}

window.mostrarModalNuevoPresupuesto = () => {
    itemsPresupuesto = [{ desc: "Producto/Servicio", cant: 1, costo: 10000 }];
    markupActual = 30;
    imagenOriginal = null;
    datosOCRCompletos = null;
    mostrarEditorPresupuestoDosColumnas();
};

async function procesarOCRConImagenEditada(imagenEditada) {
    mostrarNotificacion("🔄 Procesando OCR...", 'info');
    
    try {
        // Convertir dataURL a blob
        const blob = await (await fetch(imagenEditada)).blob();
        
        const resultado = await procesarImagenOCR(blob, (texto, porcentaje) => {
            console.log(`${texto}: ${porcentaje}%`);
        });
        
        const datosExtraidos = formatearDatosParaEditor(resultado.datos);
        
        if (datosExtraidos.items.length > 0) {
            itemsPresupuesto = datosExtraidos.items;
            imagenOriginal = imagenEditada;
            markupActual = 30;
            mostrarNotificacion(`✅ Se detectaron ${datosExtraidos.items.length} items`, 'success');
            mostrarEditorPresupuestoDosColumnas(datosExtraidos);
        } else {
            mostrarNotificacion("⚠️ No se detectaron items. Podés crearlos manualmente.", 'warning');
            mostrarEditorPresupuestoDosColumnas(null);
        }
        
    } catch (error) {
        console.error('Error OCR:', error);
        mostrarNotificacion("❌ Error al procesar la imagen. Probá de nuevo.", 'error');
        mostrarEditorPresupuestoDosColumnas(null);
    }
}

function mostrarEditorPresupuestoDosColumnas(datosOCR = null) {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}" ${datosOCR?.clienteSugerido === c.nombre ? 'selected' : ''}>${c.nombre}</option>`).join('');
    
    const clienteSugeridoHTML = datosOCR?.clienteSugerido && !db.clientes.find(c => c.nombre === datosOCR.clienteSugerido) 
        ? `<option value="nuevo" selected>🆕 ${datosOCR.clienteSugerido} (sugerido por OCR)</option>` 
        : '';
    
    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
                <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                    <h2 class="text-xl font-bold">✏️ Editar Presupuesto</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="flex flex-col lg:flex-row">
                    <div class="lg:w-1/2 p-4 border-r dark:border-gray-700">
                        <h3 class="font-bold mb-3 text-gray-700 dark:text-gray-300">📸 Documento Original</h3>
                        <div class="bg-gray-100 dark:bg-gray-900 rounded-xl p-4 min-h-[400px] flex items-center justify-center overflow-auto">
                            ${imagenOriginal ? `<img src="${imagenOriginal}" class="max-w-full object-contain rounded shadow">` : '<p class="text-gray-400 text-center">No hay imagen escaneada.</p>'}
                        </div>
                    </div>
                    
                    <div class="lg:w-1/2 p-4">
                        <h3 class="font-bold mb-3 text-gray-700 dark:text-gray-300">📝 Mi Presupuesto</h3>
                        
                        <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mb-4 text-sm">
                            <div class="font-bold text-blue-700 dark:text-blue-300">${empresa?.nombre || 'Mi Empresa'}</div>
                            <div class="text-xs text-gray-600 dark:text-gray-400">CUIT: ${empresa?.cuit || '30-12345678-9'} | Tel: ${empresa?.telefono || '11-1234-5678'}</div>
                            <div class="text-xs text-gray-600 dark:text-gray-400">${empresa?.direccion || 'Av. Corrientes 123, CABA'}</div>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block font-medium mb-1">Cliente</label>
                            <select id="clienteSelect" class="w-full p-2 border rounded-lg">
                                <option value="">Seleccionar cliente...</option>
                                ${clienteSugeridoHTML}
                                ${clientesOptions}
                            </select>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block font-medium mb-1">📅 Fecha de vencimiento</label>
                            <input type="date" id="fechaVencimiento" class="w-full p-2 border rounded-lg" value="${datosOCR?.fechaEmision ? new Date(new Date(datosOCR.fechaEmision).getTime() + 30*86400000).toISOString().split('T')[0] : ''}">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block font-medium mb-1">🎚️ Margen de ganancia: <span id="porcentajeLabel" class="text-blue-600 font-bold">30</span>%</label>
                            <input type="range" id="markupSlider" min="-50" max="200" value="30" class="w-full">
                            <div class="flex justify-between text-xs text-gray-500 mt-1">
                                <span>-50%</span><span>0%</span><span>50%</span><span>100%</span><span>150%</span><span>200%</span>
                            </div>
                        </div>
                        
                        <div class="overflow-x-auto border rounded-lg">
                            <table class="min-w-full text-sm">
                                <thead class="bg-gray-100 dark:bg-gray-700">
                                    <tr><th class="p-2">Producto</th><th class="p-2 w-16">Cant.</th><th class="p-2 w-24">Costo U.</th><th class="p-2 w-28">Precio Venta</th><th class="p-2 w-28">Subtotal</th><th class="p-2 w-10"></th></tr>
                                </thead>
                                <tbody id="itemsBody"></tbody>
                            </table>
                        </div>
                        
                        <div class="mt-4 flex gap-2 flex-wrap">
                            <button id="agregarItem" class="bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg text-sm">+ Agregar item</button>
                            <button id="vistaPreviaBtn" class="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm ml-auto">👁️ Vista Previa PDF</button>
                            <button id="guardarPresupuesto" class="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm">💾 Guardar</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    
    renderizarTablaItemsDosColumnas();
    
    window.actualizarItem = (idx, campo, valor) => {
        if (itemsPresupuesto[idx]) itemsPresupuesto[idx][campo] = valor;
        renderizarTablaItemsDosColumnas();
    };
    window.eliminarItem = (idx) => {
        itemsPresupuesto.splice(idx, 1);
        renderizarTablaItemsDosColumnas();
    };
    window.renderizarTablaItems = renderizarTablaItemsDosColumnas;
    
    const slider = document.getElementById('markupSlider');
    slider.oninput = () => {
        markupActual = parseInt(slider.value);
        document.getElementById('porcentajeLabel').innerText = markupActual;
        renderizarTablaItemsDosColumnas();
    };
    
    document.getElementById('agregarItem').onclick = () => {
        itemsPresupuesto.push({ desc: "Nuevo servicio", cant: 1, costo: 10000 });
        renderizarTablaItemsDosColumnas();
    };
    
    document.getElementById('vistaPreviaBtn').onclick = () => {
        const clienteId = document.getElementById('clienteSelect').value;
        let clienteNombre = '';
        if (clienteId === 'nuevo' && datosOCR?.clienteSugerido) {
            clienteNombre = datosOCR.clienteSugerido;
        } else {
            const cliente = db.clientes.find(c => c.id === parseInt(clienteId));
            clienteNombre = cliente?.nombre || 'Cliente sin especificar';
        }
        const fechaVencimiento = document.getElementById('fechaVencimiento').value;
        const total = itemsPresupuesto.reduce((sum, item) => sum + (item.costo * (1 + markupActual/100) * item.cant), 0);
        const numero = `P-${Date.now().toString().slice(-6)}`;
        mostrarVistaPreviaPDF(clienteNombre, fechaVencimiento, total, numero, empresa, itemsPresupuesto, markupActual);
    };
    
    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = document.getElementById('clienteSelect').value;
        let cliente = null;
        let clienteNombre = '';
        
        if (clienteId === 'nuevo' && datosOCR?.clienteSugerido) {
            clienteNombre = datosOCR.clienteSugerido;
            cliente = { id: null, nombre: clienteNombre };
        } else {
            cliente = db.clientes.find(c => c.id === parseInt(clienteId));
            clienteNombre = cliente?.nombre || '';
        }
        
        if (!clienteNombre) {
            mostrarNotificacion("Seleccioná un cliente", 'error');
            return;
        }
        
        const fechaVencimiento = document.getElementById('fechaVencimiento').value;
        const total = itemsPresupuesto.reduce((sum, item) => sum + (item.costo * (1 + markupActual/100) * item.cant), 0);
        const numero = `P-${(db.presupuestos.length + 1001)}`;
        
        db.presupuestos.push({
            id: generarId(),
            clienteId: cliente?.id || null,
            cliente: clienteNombre,
            items: [...itemsPresupuesto],
            markup: markupActual,
            total: total,
            numero: numero,
            fechaCreacion: new Date().toISOString(),
            fechaVencimiento: fechaVencimiento,
            imagenOriginal: imagenOriginal,
            datosOCR: datosOCR?.datosCompletos || null,
            estado: 'borrador'
        });
        
        guardarDB();
        mostrarNotificacion(`✅ Presupuesto ${numero} guardado para ${clienteNombre} por $${formatNumber(total)}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
}

function renderizarTablaItemsDosColumnas() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    
    const markup = markupActual / 100;
    tbody.innerHTML = itemsPresupuesto.map((item, idx) => {
        const precioVenta = item.costo * (1 + markup);
        const subtotal = precioVenta * item.cant;
        return `
            <tr class="border-b dark:border-gray-700">
                <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded-lg text-sm"></td>
                <td class="p-2"><input type="number" value="${item.cant}" onchange="window.actualizarItem(${idx}, 'cant', parseFloat(this.value) || 0)" class="w-16 p-1 border rounded-lg text-sm"></td>
                <td class="p-2"><input type="number" value="${item.costo}" onchange="window.actualizarItem(${idx}, 'costo', parseFloat(this.value) || 0)" class="w-24 p-1 border rounded-lg text-sm"></td>
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
            <tr><td></td></td>
        </tr>
    `;
}

function mostrarVistaPreviaPDF(clienteNombre, fechaVencimiento, total, numero, empresa, items, markup) {
    const fechaActual = new Date().toLocaleDateString('es-AR');
    const itemsHTML = items.map(item => {
        const precioVenta = item.costo * (1 + markup/100);
        const subtotal = precioVenta * item.cant;
        return `<tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(item.desc)}</td><td style="padding: 8px; text-align: center;">${item.cant}</td><td style="padding: 8px; text-align: right;">$${formatNumber(item.costo)}</td><td style="padding: 8px; text-align: right;">$${formatNumber(precioVenta)}</td><td style="padding: 8px; text-align: right;">$${formatNumber(subtotal)}</td></tr>`;
    }).join('');
    
    const content = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px;">
                <h1 style="color: #1e3a8a;">${empresa?.nombre || 'Mi Empresa'}</h1>
                <p>CUIT: ${empresa?.cuit || '30-12345678-9'} | Tel: ${empresa?.telefono || '11-1234-5678'}</p>
                <p>${empresa?.direccion || 'Av. Corrientes 123, CABA'}</p>
            </div>
            <h2 style="text-align: center;">PRESUPUESTO Nº ${numero}</h2>
            <p><strong>Cliente:</strong> ${clienteNombre}</p>
            <p><strong>Fecha:</strong> ${fechaActual}</p>
            <p><strong>Vencimiento:</strong> ${fechaVencimiento || '30 días'}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead><tr style="background: #1e3a8a; color: white;"><th>Producto</th><th>Cant.</th><th>Costo U.</th><th>Precio Venta</th><th>Subtotal</th></tr></thead>
                <tbody>${itemsHTML}</tbody>
                <tfoot><tr style="background: #f3f4f6;"><td colspan="4" style="padding: 8px; text-align: right;"><strong>Total + ${markup}% markup:</strong></td><td style="padding: 8px;"><strong>$${formatNumber(total)}</strong></td></tr></tfoot>
            </table>
            <div style="margin-top: 30px; font-size: 12px; color: #666;">Presupuesto válido por 30 días.</div>
        </div>
    `;
    
    const previewWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    previewWindow.document.write(`<!DOCTYPE html><html><head><title>Vista Previa - Presupuesto ${numero}</title><style>@media print{.no-print{display:none}}</style></head><body>${content}<div class="no-print" style="text-align:center;padding:20px;"><button onclick="window.print()" style="background:#1e3a8a;color:white;padding:10px 20px;margin-right:10px;">🖨️ Imprimir</button><button onclick="window.close()">✖️ Cerrar</button></div></body></html>`);
    previewWindow.document.close();
}

window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    if (!p) return;
    
    document.getElementById('root').innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg pb-24 max-w-4xl mx-auto">
            <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-600 mb-4">← Volver</button>
            ${p.imagenOriginal ? `<div class="mb-4"><h3 class="font-bold">📸 Documento Original</h3><img src="${p.imagenOriginal}" class="max-w-full max-h-64 object-contain rounded shadow"></div>` : ''}
            <h2 class="text-xl font-bold">📄 Presupuesto - ${p.cliente}</h2>
            <p class="text-xs text-gray-500 mb-4">Nº ${p.numero} • ${p.fechaCreacion?.split('T')[0]}</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border rounded-lg p-3"><h3 class="font-bold text-sm">📋 Items originales</h3>${p.items.map(i => `<div class="text-sm py-1">${i.desc}: ${i.cant} x $${formatNumber(i.costo)} = $${formatNumber(i.costo * i.cant)}</div>`).join('')}<div class="font-bold mt-2">Total Original: $${formatNumber(p.items.reduce((s,i)=>s+i.costo*i.cant,0))}</div></div>
                <div class="border border-green-200 bg-green-50 p-3 rounded-lg"><h3 class="font-bold text-sm text-green-700">💰 Con ${p.markup}% markup</h3>${p.items.map(i => `<div class="text-sm py-1">${i.desc}: ${i.cant} x $${formatNumber(i.costo*(1+p.markup/100))} = $${formatNumber(i.costo*(1+p.markup/100)*i.cant)}</div>`).join('')}<div class="font-bold mt-2 text-green-700">Total Final: $${formatNumber(p.total)}</div></div>
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
    const cliente = db.clientes.find(c => c.id === p.clienteId);
    if (!p) return;
    
    const fecha = new Date().toISOString().split('T')[0];
    const totalConIVA = p.total + (p.total * 0.21);
    const fechaCobro = new Date(fecha);
    fechaCobro.setDate(fechaCobro.getDate() + (cliente?.diasCobro || 30));
    
    db.ventas.push({
        id: generarId(), clienteId: p.clienteId, clienteNombre: p.cliente,
        montoNeto: p.total, iva: 21, ivaMonto: p.total * 0.21, total: totalConIVA,
        tipoComprobante: "Presupuesto", numComprobante: p.numero,
        fechaVenta: fecha, fechaCobroEsperada: fechaCobro.toISOString().split('T')[0],
        mes: fecha.substring(0, 7), estado: 'pendiente_cobro', presupuestoOrigen: p.id
    });
    guardarDB();
    mostrarNotificacion(`✅ Presupuesto convertido a venta por $${formatNumber(totalConIVA)}`, 'success');
    window.dispatchEvent(new Event('refreshView'));
    window.showView('ventas');
};

window.exportarPresupuestoPDF = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    if (!p) return;
    
    const content = `<div style="font-family: Arial; padding: 20px;"><h1 style="color:#1e3a8a;">${empresa?.nombre || 'Mi Empresa'}</h1><hr><h2>PRESUPUESTO Nº ${p.numero}</h2><p><strong>Cliente:</strong> ${p.cliente}</p>${p.items.map(i => `<div>${i.desc}: ${i.cant} x $${i.costo} = $${i.costo * i.cant}</div>`).join('')}<hr><p><strong>Total con ${p.markup}% markup: $${formatNumber(p.total)}</strong></p></div>`;
    html2pdf().set({ margin: 1, filename: `presupuesto_${p.numero}.pdf` }).from(content).save();
    mostrarNotificacion(`📄 PDF generado`, 'success');
};

window.eliminarPresupuesto = (id) => {
    if (confirm("¿Eliminar este presupuesto?")) {
        const db = getDB();
        db.presupuestos = db.presupuestos.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion("🗑️ Presupuesto eliminado", 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

export function initPresupuestosEvents() {}
