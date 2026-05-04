import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';
import { mostrarEditorImagen } from './imageEditor.js';
import { procesarConOpenCVPreview, extraerTextoConOpenCV, initOpenCV } from './opencvProcessor.js';
import { comprimirImagenExtrema, comprimirImagenUrlExtrema, verificarMemoria } from './compress.js';

let itemsPresupuesto = [];
let markupActual = 30;
let imagenOriginal = null;

// Verificar memoria al inicio
verificarMemoria();

// ========== COMPRESIÓN NORMAL (también usa compresión extrema por seguridad) ==========
function comprimirImagen(file, maxWidth = 700, calidad = 0.5) {
    return comprimirImagenExtrema(file, maxWidth, calidad);
}

// ========== OCR SIMPLE ==========
async function extraerPreciosDeImagen(imagenUrl) {
    try {
        // Comprimir la imagen antes del OCR para evitar memoria
        const imagenComprimida = await comprimirImagenUrlExtrema(imagenUrl, 800, 0.5);
        const blob = await (await fetch(imagenComprimida)).blob();
        const { data: { text } } = await Tesseract.recognize(blob, 'spa');
        
        const nums = text.match(/\d{2,6}[.,]?\d{0,2}/g) || [];
        const precios = nums.filter(n => {
            const num = parseFloat(n.replace(',', '.'));
            return num > 100 && num < 10000000;
        }).slice(0, 10);
        
        if (precios.length > 0) {
            return precios.map(p => ({ 
                desc: "Item detectado", 
                cant: 1, 
                costo: parseFloat(p.replace(',', '.')) 
            }));
        }
        return [];
    } catch (error) {
        console.error('OCR Error:', error);
        return [];
    }
}

// ========== SELECTOR DE CÁMARA O GALERÍA ==========
function mostrarSelectorOrigen() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
                <h2 class="text-xl font-bold text-center mb-4">📸 Seleccionar origen</h2>
                <div class="space-y-3">
                    <button id="optCamara" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl">📷 Tomar foto</button>
                    <button id="optGaleria" class="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">🖼️ Elegir de galería</button>
                    <button id="optCancelar" class="w-full bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const cleanup = () => modal.remove();
        
        document.getElementById('optCamara').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.onchange = (e) => {
                cleanup();
                resolve(e.target.files[0]);
            };
            input.click();
        };
        
        document.getElementById('optGaleria').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                cleanup();
                resolve(e.target.files[0]);
            };
            input.click();
        };
        
        document.getElementById('optCancelar').onclick = () => {
            cleanup();
            resolve(null);
        };
    });
}

// ========== MODO NORMAL ==========
async function iniciarCapturaImagen() {
    const file = await mostrarSelectorOrigen();
    if (!file) return;
    
    mostrarNotificacion("📸 Comprimiendo imagen...", 'info');
    
    try {
        // Compresión extrema - 700px, 50% calidad
        const imagenComprimida = await comprimirImagen(file, 700, 0.5);
        
        mostrarEditorImagen(imagenComprimida.url, async (imagenEditada) => {
            mostrarNotificacion("🔍 Extrayendo precios...", 'info');
            const items = await extraerPreciosDeImagen(imagenEditada);
            
            if (items.length > 0) {
                itemsPresupuesto = items;
                imagenOriginal = imagenEditada;
                markupActual = 30;
                mostrarNotificacion(`✅ ${items.length} items detectados`, 'success');
            } else {
                itemsPresupuesto = [{ desc: "Producto/Servicio", cant: 1, costo: 10000 }];
                mostrarNotificacion("⚠️ No se detectaron items", 'warning');
            }
            mostrarEditorPresupuesto();
        });
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion("Error al procesar la imagen", 'error');
    }
}

// ========== CAMSCANNER CON OPENCV ==========
function mostrarProgresoCamScanner(mensaje, porcentaje) {
    let modal = document.getElementById('camScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'camScannerModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
                <h3 class="text-lg font-bold text-center mb-4">🔬 CamScanner</h3>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div id="camScannerProgressBar" class="bg-purple-600 h-2 rounded-full" style="width: 0%"></div>
                </div>
                <p id="camScannerProgressText" class="text-sm text-center">Procesando...</p>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const bar = document.getElementById('camScannerProgressBar');
    const text = document.getElementById('camScannerProgressText');
    if (bar) bar.style.width = `${porcentaje}%`;
    if (text) text.innerText = mensaje;
    
    if (porcentaje >= 100) {
        setTimeout(() => {
            const m = document.getElementById('camScannerModal');
            if (m) m.remove();
        }, 1000);
    }
}

function mostrarVistaPreviaConAjustes(imagenUrl, onConfirmar) {
    let escala = 100;
    let rotacion = 0;
    let canvas = null;
    let ctx = null;
    let imgOriginal = null;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col';
    modal.innerHTML = `
        <div class="bg-gray-900 text-white p-3 flex justify-between items-center">
            <h2 class="text-lg font-bold">🔬 Vista previa - CamScanner</h2>
            <button id="closePreviewBtn" class="text-white text-2xl">&times;</button>
        </div>
        <div class="flex-1 overflow-auto bg-gray-800 flex items-center justify-center p-4">
            <canvas id="previewCanvas" class="max-w-full max-h-full object-contain"></canvas>
        </div>
        <div class="bg-gray-900 text-white p-4">
            <div class="grid grid-cols-3 gap-3 mb-3">
                <div><label class="text-xs">🔍 Zoom: <span id="zoomValue">100</span>%</label><input type="range" id="zoomSlider" min="50" max="200" value="100" class="w-full"></div>
                <div><label class="text-xs">🔄 Rotar</label><div class="flex gap-2"><button id="rotarIzqBtn" class="bg-gray-700 px-2 py-1 rounded text-xs">← 90°</button><button id="rotarDerBtn" class="bg-gray-700 px-2 py-1 rounded text-xs">90° →</button></div></div>
                <div><label class="text-xs">✨ Auto-mejora</label><button id="autoFixBtn" class="bg-purple-600 px-2 py-1 rounded text-xs w-full">Aplicar</button></div>
            </div>
            <div class="flex gap-3">
                <button id="confirmarPreviewBtn" class="bg-green-600 px-4 py-2 rounded-lg flex-1">✅ Aceptar y procesar OCR</button>
                <button id="rehacerBtn" class="bg-red-600 px-4 py-2 rounded-lg flex-1">📷 Rehacer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    canvas = document.getElementById('previewCanvas');
    ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
        imgOriginal = img;
        canvas.width = img.width;
        canvas.height = img.height;
        aplicarZoom();
    };
    img.src = imagenUrl;
    
    function aplicarZoom() {
        if (!ctx || !imgOriginal) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const zoomWidth = imgOriginal.width * (escala / 100);
        const zoomHeight = imgOriginal.height * (escala / 100);
        const offsetX = (canvas.width - zoomWidth) / 2;
        const offsetY = (canvas.height - zoomHeight) / 2;
        
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotacion * Math.PI / 180);
        ctx.drawImage(imgOriginal, -zoomWidth / 2, -zoomHeight / 2, zoomWidth, zoomHeight);
        ctx.restore();
    }
    
    document.getElementById('zoomSlider').oninput = (e) => {
        escala = parseInt(e.target.value);
        document.getElementById('zoomValue').innerText = escala;
        aplicarZoom();
    };
    
    document.getElementById('rotarIzqBtn').onclick = () => {
        rotacion -= 90;
        aplicarZoom();
    };
    
    document.getElementById('rotarDerBtn').onclick = () => {
        rotacion += 90;
        aplicarZoom();
    };
    
    document.getElementById('autoFixBtn').onclick = () => {
        escala = 130;
        document.getElementById('zoomSlider').value = 130;
        document.getElementById('zoomValue').innerText = 130;
        aplicarZoom();
    };
    
    document.getElementById('confirmarPreviewBtn').onclick = () => {
        const imgFinal = canvas.toDataURL('image/jpeg', 0.85);
        modal.remove();
        onConfirmar(imgFinal);
    };
    
    document.getElementById('rehacerBtn').onclick = () => {
        modal.remove();
        iniciarCamScanner();
    };
    
    document.getElementById('closePreviewBtn').onclick = () => modal.remove();
}

async function iniciarCamScanner() {
    const file = await mostrarSelectorOrigen();
    if (!file) return;
    
    mostrarProgresoCamScanner("📸 Comprimiendo imagen (memoria)...", 5);
    
    try {
        // COMPRESIÓN EXTREMA - 600px, 40% calidad para evitar error de memoria
        const imagenComprimida = await comprimirImagen(file, 600, 0.4);
        
        mostrarProgresoCamScanner("🎨 Procesando con OpenCV...", 15);
        
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        const img = new Image();
        
        img.onload = async () => {
            tempCanvas.width = imagenComprimida.width;
            tempCanvas.height = imagenComprimida.height;
            ctx.drawImage(img, 0, 0);
            tempCanvas.id = 'tempOpenCvCanvas';
            document.body.appendChild(tempCanvas);
            tempCanvas.style.display = 'none';
            
            mostrarProgresoCamScanner("📐 Detectando y enderezando...", 30);
            await initOpenCV();
            
            const imagenProcesada = await procesarConOpenCVPreview('tempOpenCvCanvas', (msg, p) => {
                mostrarProgresoCamScanner(msg, 30 + p * 0.4);
            });
            
            tempCanvas.remove();
            
            const modalProgreso = document.getElementById('camScannerModal');
            if (modalProgreso) modalProgreso.remove();
            
            mostrarVistaPreviaConAjustes(imagenProcesada, async (imagenFinal) => {
                mostrarProgresoCamScanner("📖 Extrayendo texto...", 85);
                
                const canvasOCR = document.createElement('canvas');
                const ctxOCR = canvasOCR.getContext('2d');
                const imgOCR = new Image();
                imgOCR.onload = async () => {
                    canvasOCR.width = imgOCR.width;
                    canvasOCR.height = imgOCR.height;
                    ctxOCR.drawImage(imgOCR, 0, 0);
                    canvasOCR.id = 'tempOCRCanvas';
                    document.body.appendChild(canvasOCR);
                    canvasOCR.style.display = 'none';
                    
                    const resultadoOCR = await extraerTextoConOpenCV('tempOCRCanvas', (msg, p) => {
                        mostrarProgresoCamScanner(msg, 85 + p * 0.15);
                    });
                    
                    canvasOCR.remove();
                    
                    const modalFinal = document.getElementById('camScannerModal');
                    if (modalFinal) modalFinal.remove();
                    
                    if (resultadoOCR.items.length > 0) {
                        itemsPresupuesto = resultadoOCR.items;
                        imagenOriginal = imagenFinal;
                        markupActual = 30;
                        mostrarNotificacion(`✅ CamScanner: ${resultadoOCR.items.length} items`, 'success');
                    } else {
                        itemsPresupuesto = [{ desc: "Producto/Servicio", cant: 1, costo: 10000 }];
                        mostrarNotificacion("⚠️ No se detectaron items", 'warning');
                    }
                    mostrarEditorPresupuesto();
                };
                imgOCR.src = imagenFinal;
            });
        };
        img.src = imagenComprimida.url;
        
    } catch (error) {
        console.error('Error en CamScanner:', error);
        mostrarNotificacion("Error: Memoria insuficiente. Intente con una imagen más pequeña.", 'error');
        const modal = document.getElementById('camScannerModal');
        if (modal) modal.remove();
    }
}

// ========== RENDER PRINCIPAL ==========
export function renderPresupuestos() {
    const db = getDB();
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex gap-3">
                <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl flex-1">+ Nuevo</button>
                <button id="btnEscanearDirecto" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl flex-1">📷 Escanear</button>
                <button id="btnCamScanner" class="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl flex-1">🔬 CamScanner</button>
            </div>
            <div class="space-y-3">
                ${db.presupuestos.map(p => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md">
                        <div class="flex justify-between">
                            <div>
                                <h3 class="font-bold">${p.cliente}</h3>
                                <p class="text-sm">Total: $${formatNumber(p.total)}</p>
                                <p class="text-xs">${p.fechaCreacion?.split('T')[0]}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window.verPresupuestoDetalle(${p.id})" class="bg-blue-100 px-2 py-1 rounded text-sm">Ver</button>
                                <button onclick="window.eliminarPresupuesto(${p.id})" class="bg-red-100 px-2 py-1 rounded text-sm">🗑️</button>
                            </div>
                        </div>
                    </div>
                `).join('') || '<p class="text-center text-gray-500">No hay presupuestos</p>'}
            </div>
        </div>`;
}

// ========== EDITOR DE PRESUPUESTO ==========
function mostrarEditorPresupuesto() {
    const db = getDB();
    const empresa = db.empresas.find(e => e.id === db.empresaActiva) || db.empresas[0];
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
                <div class="p-4 border-b flex justify-between">
                    <h2 class="text-xl font-bold">✏️ Editar Presupuesto</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="p-4">
                    ${imagenOriginal ? `<img src="${imagenOriginal}" class="max-h-24 mx-auto mb-4 rounded shadow">` : ''}
                    
                    <div class="bg-blue-50 p-3 rounded-lg mb-4">
                        <div class="font-bold">${empresa?.nombre || 'Mi Empresa'}</div>
                        <div class="text-xs">CUIT: ${empresa?.cuit || '30-12345678-9'}</div>
                    </div>
                    
                    <select id="clienteSelect" class="w-full p-2 border rounded-lg mb-4">
                        <option value="">Seleccionar cliente...</option>
                        ${clientesOptions}
                    </select>
                    
                    <input type="date" id="fechaVencimiento" class="w-full p-2 border rounded-lg mb-4">
                    
                    <div class="mb-4">
                        <label>Margen: <span id="porcentajeLabel">30</span>%</label>
                        <input type="range" id="markupSlider" min="0" max="200" value="30" class="w-full">
                    </div>
                    
                    <div class="overflow-x-auto border rounded-lg">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100">
                                <tr><th class="p-2">Producto</th><th class="p-2 w-16">Cant.</th><th class="p-2 w-24">Costo</th><th class="p-2 w-28">Precio</th><th class="p-2 w-28">Subtotal</th><th class="p-2 w-10"></th></tr>
                            </thead>
                            <tbody id="itemsBody"></tbody>
                        </table>
                    </div>
                    
                    <div class="mt-4 flex gap-2">
                        <button id="agregarItem" class="bg-gray-200 px-3 py-1 rounded">+ Agregar</button>
                        <button id="guardarPresupuesto" class="bg-green-600 text-white px-4 py-1 rounded ml-auto">Guardar</button>
                    </div>
                </div>
            </div>
        </div>`;
    
    renderizarTabla();
    
    window.actualizarItemPresupuesto = (idx, campo, valor) => {
        if (itemsPresupuesto[idx]) itemsPresupuesto[idx][campo] = valor;
        renderizarTabla();
    };
    window.eliminarItemPresupuesto = (idx) => {
        itemsPresupuesto.splice(idx, 1);
        renderizarTabla();
    };
    
    const slider = document.getElementById('markupSlider');
    slider.oninput = () => {
        markupActual = parseInt(slider.value);
        document.getElementById('porcentajeLabel').innerText = markupActual;
        renderizarTabla();
    };
    
    document.getElementById('agregarItem').onclick = () => {
        itemsPresupuesto.push({ desc: "Nuevo servicio", cant: 1, costo: 10000 });
        renderizarTabla();
    };
    
    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion("Seleccioná un cliente", 'error');
            return;
        }
        
        const total = itemsPresupuesto.reduce((s, i) => s + (i.costo * (1 + markupActual/100) * i.cant), 0);
        const numero = `P-${Date.now()}`;
        
        db.presupuestos.push({
            id: generarId(),
            clienteId: cliente.id,
            cliente: cliente.nombre,
            items: [...itemsPresupuesto],
            markup: markupActual,
            total: total,
            numero: numero,
            fechaCreacion: new Date().toISOString(),
            imagenOriginal: imagenOriginal
        });
        
        guardarDB();
        mostrarNotificacion(`✅ Presupuesto guardado`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
}

function renderizarTabla() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    
    const markup = markupActual / 100;
    tbody.innerHTML = itemsPresupuesto.map((item, idx) => {
        const precioVenta = item.costo * (1 + markup);
        const subtotal = precioVenta * item.cant;
        return `
            <tr class="border-b">
                <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItemPresupuesto(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm"></td>
                <td class="p-2"><input type="number" value="${item.cant}" onchange="window.actualizarItemPresupuesto(${idx}, 'cant', parseFloat(this.value) || 0); window.renderizarTabla()" class="w-16 p-1 border rounded text-sm"></td>
                <td class="p-2"><input type="number" value="${item.costo}" onchange="window.actualizarItemPresupuesto(${idx}, 'costo', parseFloat(this.value) || 0); window.renderizarTabla()" class="w-24 p-1 border rounded text-sm"></td>
                <td class="p-2 text-green-600">$${formatNumber(precioVenta)}</td>
                <td class="p-2">$${formatNumber(subtotal)}</td>
                <td class="p-2"><button onclick="window.eliminarItemPresupuesto(${idx})" class="text-red-500">🗑️</button></td>
            </tr>
        `;
    }).join('');
    
    const total = itemsPresupuesto.reduce((s, i) => s + (i.costo * (1 + markupActual/100) * i.cant), 0);
    tbody.innerHTML += `
        <tr class="bg-gray-50 font-bold">
            <td colspan="4" class="p-2 text-right">TOTAL:</td>
            <td class="p-2 text-green-700">$${formatNumber(total)}</td>
            <td></td>
        </tr>
    `;
}

window.mostrarModalNuevoPresupuesto = () => {
    itemsPresupuesto = [{ desc: "Producto/Servicio", cant: 1, costo: 10000 }];
    markupActual = 30;
    imagenOriginal = null;
    mostrarEditorPresupuesto();
};

window.verPresupuestoDetalle = (id) => {
    const db = getDB();
    const p = db.presupuestos.find(x => x.id === id);
    if (p) {
        mostrarNotificacion(`Presupuesto #${p.numero} - $${formatNumber(p.total)}`, 'info');
    }
};

window.eliminarPresupuesto = (id) => {
    if (confirm("¿Eliminar?")) {
        const db = getDB();
        db.presupuestos = db.presupuestos.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion("✅ Eliminado", 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

export function initPresupuestosEvents() {
    setTimeout(() => {
        const btn1 = document.getElementById('btnEscanearDirecto');
        if (btn1) btn1.onclick = () => iniciarCapturaImagen();
        const btn2 = document.getElementById('btnCamScanner');
        if (btn2) btn2.onclick = () => iniciarCamScanner();
    }, 100);
}
