// ==================== modules/presupuestos/lista.js ====================
// LISTA - Render principal de la lista de presupuestos
// ERP Contable Argentina - v7.0.0

import { getDB, asegurarCamposPresupuesto, guardarDB } from '../db.js';
import { formatNumber, escapeHtml, formatDate, generarId, hoyISO, mostrarNotificacion, confirmarAccion, calcularDiasRestantes, dateToISO } from '../utils.js';
import { subirArchivo, eliminarArchivoDeStorage } from '../firebase.js';
import { procesarArchivoFactura } from '../ocr-parser.js';

// ==================== RENDER PRINCIPAL ====================
export function renderPresupuestos() {
    asegurarCamposPresupuesto();
    const db = getDB();
    const filtroEstado = localStorage.getItem('presupuestosFiltroEstado') || 'todos';
    const filtroBusqueda = localStorage.getItem('presupuestosFiltroBusqueda') || '';
    let presupuestosFiltrados = db.presupuestos || [];
    if (filtroEstado !== 'todos') {
        presupuestosFiltrados = presupuestosFiltrados.filter(p => p.estado === filtroEstado);
    }
    if (filtroBusqueda.trim()) {
        const term = filtroBusqueda.toLowerCase();
        presupuestosFiltrados = presupuestosFiltrados.filter(p => 
            p.numero.toLowerCase().includes(term) || 
            (p.cliente || '').toLowerCase().includes(term)
        );
    }
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📄 Presupuestos</h1>
                <div class="flex gap-2">
                    <button onclick="window.mostrarModalNuevoPresupuesto()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                        <span>➕</span> Nuevo
                    </button>
                    <button onclick="window.mostrarModalCargarPDF()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                        📷 Cargar PDF
                    </button>
                </div>
            </div>

            <div class="flex flex-wrap gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl shadow items-center">
                <label class="text-sm font-medium">🔍 Buscar:</label>
                <input type="text" id="filtroBusquedaPresupuestos" value="${escapeHtml(filtroBusqueda)}" 
                       placeholder="Nº o cliente..." class="flex-1 min-w-[150px] p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                <label class="text-sm font-medium ml-2">📌 Estado:</label>
                <select id="filtroEstadoPresupuestos" class="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="todos" ${filtroEstado === 'todos' ? 'selected' : ''}>Todos</option>
                    <option value="pendiente" ${filtroEstado === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                    <option value="aprobado" ${filtroEstado === 'aprobado' ? 'selected' : ''}>✅ Aprobado (pendiente de cobro)</option>
                    <option value="cobrado" ${filtroEstado === 'cobrado' ? 'selected' : ''}>💰 Cobrado (pendiente de pago a proveedor)</option>
                    <option value="pagado_proveedor" ${filtroEstado === 'pagado_proveedor' ? 'selected' : ''}>✅ Pagado al proveedor</option>
                    <option value="rechazado" ${filtroEstado === 'rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                </select>
                <button onclick="window.aplicarFiltrosPresupuestos()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Aplicar</button>
                <button onclick="window.limpiarFiltrosPresupuestos()" class="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white px-4 py-2 rounded-lg text-sm">Limpiar</button>
            </div>

            <div id="listaPresupuestos" class="space-y-3">
                ${(() => {
                    // 🔥 v7.22.26: sectorizar por estado
                    const grupos = {
                        'pagado_proveedor': { titulo: '✅ Pagados al proveedor', items: [] },
                        'cobrado': { titulo: '💰 Cobrados (pendientes de pago a proveedor)', items: [] },
                        'aprobado': { titulo: '✅ Aprobados (pendientes de cobro)', items: [] },
                        'pendiente': { titulo: '⏳ Pendientes', items: [] },
                        'rechazado': { titulo: '❌ Rechazados', items: [] }
                    };
                    
                    presupuestosFiltrados.slice().reverse().forEach(p => {
                        const estado = p.esMora ? 'pendiente' : (p.estado || 'pendiente');
                        if (grupos[estado]) {
                            grupos[estado].items.push(p);
                        } else {
                            grupos['pendiente'].items.push(p);
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
                        html += grupo.items.map(p => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all border-l-4 ${p.estado === 'aprobado' ? 'border-green-500' : p.estado === 'cobrado' ? 'border-blue-500' : p.estado === 'pagado_proveedor' ? 'border-purple-500' : p.estado === 'rechazado' ? 'border-red-500' : p.esMora ? 'border-purple-500' : 'border-yellow-500'}">
                        <div class="flex items-start gap-2">
                            ${p.estado === 'pendiente' && !p.esMora ? `<input type="checkbox" class="presupuesto-checkbox mt-1.5 w-4 h-4 cursor-pointer" data-presupuesto-id="${p.id}" onchange="window.actualizarSeleccionPresupuestos()">` : '<div class="w-4 mt-1.5"></div>'}
                            <div class="flex-1 flex justify-between items-start flex-wrap gap-2">
                            <div class="flex-1 cursor-pointer" onclick="window.verPresupuestoDetalle(${p.id})">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h3 class="font-bold">${escapeHtml(p.cliente)}</h3>
                                    <span class="text-xs px-2 py-0.5 rounded-full ${p.esMora ? 'bg-purple-100 text-purple-700' : ''}">
                                        ${p.esMora ? '💰 Mora' : p.estado === 'aprobado' ? '✅ Aprobado' : p.estado === 'cobrado' ? '💰 Cobrado' : p.estado === 'pagado_proveedor' ? '✅ Pagado' : p.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente'}
                                    </span>
                                    <span class="text-xs text-gray-500">${p.numero}</span>
                                    ${p.ventaOrigenId ? `<span class="text-xs text-orange-500">(Venta origen: ${p.ventaOrigenId})</span>` : ''}
                                </div>
                                ${p.trabajo ? `<p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">🔧 ${escapeHtml(p.trabajo)}</p>` : ''}
                                ${p.patente || p.vehiculoMarca ? `<p class="text-xs text-gray-500 mt-0.5">🚗 ${escapeHtml(p.vehiculoMarca || '')} ${p.patente ? `(${escapeHtml(p.patente)})` : ''}</p>` : ''}
                                <p class="text-sm">Total: <span class="font-bold ${p.esMora ? 'text-purple-600' : 'text-green-600'}">$${formatNumber(p.total)}</span>
                                    ${p.markupGlobal ? `<span class="text-xs text-gray-500 ml-2">(Markup: ${p.markupGlobal}%)</span>` : ''}
                                </p>
                                ${p.gananciaNetaReal ? `<p class="text-xs text-green-600 font-bold">💰 Ganancia neta final: $${formatNumber(p.gananciaNetaReal)}</p>` : (p.gananciaBruta ? `<p class="text-xs text-green-600">💰 Ganancia bruta: $${formatNumber(p.gananciaBruta)}</p>` : '')}
                                ${p.presupuestoReferenciaUrl ? `<p class="text-xs text-blue-600">📎 <a href="${p.presupuestoReferenciaUrl}" target="_blank" class="underline">Ver presupuesto de referencia</a></p>` : ''}
                                <p class="text-xs text-gray-500">${p.fechaCreacion ? formatDate(p.fechaCreacion) : ''} 
                                    ${p.fechaCreacion ? (() => {
                                        const hoy = new Date();
                                        hoy.setHours(0, 0, 0, 0);
                                        const fechaRegistro = new Date(p.fechaCreacion);
                                        fechaRegistro.setHours(0, 0, 0, 0);
                                        const dias = Math.floor((hoy - fechaRegistro) / (1000 * 60 * 60 * 24));
                                        if (dias === 0) return `<span class="text-blue-600 font-medium">• Hoy</span>`;
                                        if (dias === 1) return `<span class="text-orange-600 font-medium">• Hace 1 día</span>`;
                                        if (dias < 7) return `<span class="text-orange-600">• Hace ${dias} días</span>`;
                                        if (dias < 30) return `<span class="text-gray-500">• Hace ${dias} días</span>`;
                                        return `<span class="text-red-600">• Hace ${dias} días</span>`;
                                    })() : ''}
                                    ${p.fechaAprobacion ? (() => {
                                        const hoy = new Date();
                                        hoy.setHours(0, 0, 0, 0);
                                        // 🔥 v7.22.31: usar parseFechaLocal para evitar bug UTC-3
                                        const fechaAprob = (() => {
                                            const [a, m, d] = p.fechaAprobacion.split('-').map(Number);
                                            return new Date(a, m - 1, d);
                                        })();
                                        fechaAprob.setHours(0, 0, 0, 0);
                                        const dias = Math.floor((hoy - fechaAprob) / (1000 * 60 * 60 * 24));
                                        if (dias === 0) return `<span class="text-green-600 font-medium">• Aprobado hoy</span>`;
                                        if (dias === 1) return `<span class="text-orange-600 font-medium">• Aprobado hace 1 día</span>`;
                                        return `<span class="text-orange-600">• Aprobado hace ${dias} días</span>`;
                                    })() : ''}
                                    ${p.presupuestoPadreId ? `• Adicional de: P-${p.presupuestoPadreId}` : ''}
                                </p>
                                <button onclick="event.stopPropagation();window.verTrazabilidad('presupuesto','${p.id}')" class="text-xs text-purple-600 hover:underline mt-1">🔗 Ver trazabilidad</button>
                            </div>
                            <div class="flex gap-2 flex-wrap">
                                ${p.estado === 'pendiente' && !p.esMora ? `<button onclick="event.stopPropagation();window.editarPresupuesto(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-sm">✏️ Editar</button>` : ''}
                                <button onclick="event.stopPropagation();window.descargarPDFPresupuesto(${p.id})" class="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-sm">📄 PDF</button>
                                ${p.estado === 'pendiente' && !p.ventaGeneradaId ? `<button onclick="event.stopPropagation();window.aprobarPresupuesto(${p.id})" class="bg-green-600 text-white px-3 py-1 rounded-xl text-sm">✅ Aprobar</button>` : ''}
                                ${p.estado === 'pendiente' && !p.esMora ? `<button onclick="event.stopPropagation();window.rechazarPresupuesto(${p.id})" class="bg-orange-100 text-orange-700 px-3 py-1 rounded-xl text-sm">❌ Rechazar</button>` : ''}
                                ${p.estado === 'rechazado' ? `<button onclick="event.stopPropagation();window.volverAPendientePresupuesto(${p.id})" class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-xl text-sm">↩️ Volver a pendiente</button>` : ''}
                                <button onclick="event.stopPropagation();window.eliminarPresupuesto(${p.id})" class="bg-red-100 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️</button>
                            </div>
                            </div>
                        </div>
                    </div>
                        `).join('');
                    });
                    
                    if (html === '') {
                        return '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">No hay presupuestos</p></div>';
                    }
                    return html;
                })()}
            </div>
            
            <!-- 🔥 v7.22.37: barra flotante de agrupación -->
            <div id="barraAgruparPresupuestos" class="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl hidden z-50 flex items-center gap-4">
                <span id="contadorSeleccionados" class="font-bold">0 seleccionados</span>
                <button onclick="window.agruparPresupuestosSeleccionados()" class="bg-white text-blue-600 px-4 py-1 rounded-xl font-bold text-sm">📦 Agrupar en una venta</button>
                <button onclick="window.limpiarSeleccionPresupuestos()" class="text-blue-200 hover:text-white text-sm">Cancelar</button>
            </div>
        </div>
    `;
}

// ==================== 🔥 v7.22.37: AGRUPAR PRESUPUESTOS ====================

window.actualizarSeleccionPresupuestos = () => {
    const checkboxes = document.querySelectorAll('.presupuesto-checkbox:checked');
    const barra = document.getElementById('barraAgruparPresupuestos');
    const contador = document.getElementById('contadorSeleccionados');
    if (!barra || !contador) return;
    
    if (checkboxes.length >= 2) {
        barra.classList.remove('hidden');
        contador.textContent = checkboxes.length + ' seleccionados';
    } else {
        barra.classList.add('hidden');
    }
};

window.limpiarSeleccionPresupuestos = () => {
    document.querySelectorAll('.presupuesto-checkbox:checked').forEach(cb => cb.checked = false);
    window.actualizarSeleccionPresupuestos();
};

window.agruparPresupuestosSeleccionados = async () => {
    const checkboxes = document.querySelectorAll('.presupuesto-checkbox:checked');
    if (checkboxes.length < 2) {
        mostrarNotificacion('Seleccioná al menos 2 presupuestos para agrupar', 'warning');
        return;
    }
    
    const db = getDB();
    const ids = Array.from(checkboxes).map(cb => cb.dataset.presupuestoId);
    const presupuestos = ids.map(id => db.presupuestos.find(p => String(p.id) === String(id))).filter(Boolean);
    
    if (presupuestos.length !== ids.length) {
        mostrarNotificacion('Algunos presupuestos no fueron encontrados', 'error');
        return;
    }
    
    const clienteIds = [...new Set(presupuestos.map(p => p.clienteId))];
    if (clienteIds.length > 1) {
        mostrarNotificacion('Todos los presupuestos deben ser del mismo cliente', 'error');
        return;
    }
    
    if (presupuestos.some(p => p.estado !== 'pendiente')) {
        mostrarNotificacion('Solo se pueden agrupar presupuestos pendientes', 'error');
        return;
    }
    
    const sumaPresupuestos = presupuestos.reduce((s, p) => s + (p.total || 0), 0);
    const cliente = presupuestos[0].cliente;
    const numeros = presupuestos.map(p => p.numero);
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-3">📦 Agrupar ${presupuestos.length} presupuestos</h2>
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3 text-sm">
                <div>
                    <p class="font-bold">📄 Presupuestos a agrupar:</p>
                    <p class="text-sm">${numeros.join(', ')}</p>
                    <p class="text-sm text-gray-500">Cliente: <strong>${escapeHtml(cliente)}</strong></p>
                </div>
                <div class="border-t dark:border-gray-700 pt-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Suma de presupuestos:</span>
                        <strong>$${formatNumber(sumaPresupuestos)}</strong>
                    </div>
                </div>
                
                <div class="border-t dark:border-gray-700 pt-2">
                    <p class="font-bold mb-2">📋 Orden de Compra del cliente (opcional):</p>
                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">Número OC:</label>
                            <input type="text" id="inputNumeroOC" placeholder="Ej: 1664" class="w-full border rounded-xl px-3 py-1 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">Fecha recepción OC:</label>
                            <input type="date" id="inputFechaRecepcionOC" value="${hoyISO()}" class="w-full border rounded-xl px-3 py-1 text-sm">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Adjuntar OC (PDF o imagen):</label>
                        <input type="file" id="inputArchivoOC" accept=".pdf,.jpg,.jpeg,.png" class="w-full border rounded-xl px-3 py-1 text-sm">
                        <div id="ocrStatus" class="text-xs text-gray-500 mt-1"></div>
                        <div id="previewOC" class="mt-2 hidden">
                            <div class="flex items-center justify-between bg-white dark:bg-gray-700 p-2 rounded-lg border">
                                <div class="flex items-center gap-2">
                                    <span id="previewOCIcon" class="text-2xl">📄</span>
                                    <div>
                                        <p id="previewOCNombre" class="text-xs font-bold truncate max-w-[200px]"></p>
                                        <p id="previewOCTamanio" class="text-xs text-gray-500"></p>
                                    </div>
                                </div>
                                <div class="flex gap-1">
                                    <button type="button" onclick="window._previewArchivoOC()" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">👁️ Ver</button>
                                    <button type="button" onclick="window._reanalizarOC()" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">🔄 Re-analizar</button>
                                    <button type="button" onclick="window._quitarArchivoOC()" class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">🗑️ Quitar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="border-t dark:border-gray-700 pt-2">
                    <label class="block font-bold mb-1">💰 Total de la Orden de Compra:</label>
                    <input type="number" id="inputTotalOC" value="${sumaPresupuestos}" step="0.01" min="0" class="w-full border rounded-xl px-3 py-2 text-right text-lg font-bold">
                    <p class="text-xs text-gray-500 mt-1">Cargá el total que figura en la OC. Si no hay OC, dejá el valor de los presupuestos.</p>
                </div>
                
                <div class="border-t dark:border-gray-700 pt-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Diferencia (OC - Presupuestos):</span>
                        <strong id="spanDiferencia" class="text-green-600">$0,00</strong>
                    </div>
                    <p id="spanAvisoDiferencia" class="text-xs mt-1"></p>
                </div>
                
                <div class="border-t dark:border-gray-700 pt-2">
                    <label class="block font-bold mb-1">📅 Fecha de cobro esperada:</label>
                    <input type="date" id="inputFechaCobro" value="${(() => { const d = new Date(); d.setDate(d.getDate() + 30); return dateToISO(d); })()}" class="w-full border rounded-xl px-3 py-2 text-sm">
                    <p class="text-xs text-gray-500 mt-1">Por defecto: hoy + 30 días. Podés cambiarla.</p>
                </div>
            </div>
            <div class="flex gap-2 mt-4">
                <button onclick="this.closest('.modal').remove()" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-xl flex-1">Cancelar</button>
                <button id="btnConfirmarAgrupar" onclick="window._confirmarAgruparPresupuestos('${ids.join(',')}')" class="bg-blue-600 text-white px-4 py-2 rounded-xl flex-1 font-bold">📦 Agrupar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const inputTotalOC = document.getElementById('inputTotalOC');
    const spanDiferencia = document.getElementById('spanDiferencia');
    const spanAviso = document.getElementById('spanAvisoDiferencia');
    const btnConfirmar = document.getElementById('btnConfirmarAgrupar');
    const inputArchivoOC = document.getElementById('inputArchivoOC');
    const previewOC = document.getElementById('previewOC');
    const previewOCNombre = document.getElementById('previewOCNombre');
    const previewOCTamanio = document.getElementById('previewOCTamanio');
    const previewOCIcon = document.getElementById('previewOCIcon');
    const ocrStatus = document.getElementById('ocrStatus');
    const inputNumeroOC = document.getElementById('inputNumeroOC');
    
    let archivoOCSeleccionado = null;
    
    const analizarOCConOCR = async (file) => {
        if (!file) return;
        ocrStatus.innerHTML = '⏳ Analizando OC con OCR...';
        ocrStatus.className = 'text-xs text-blue-600 mt-1';
        
        try {
            const db = getDB();
            const cuitEmpresa = db?.datosEmpresa?.cuit || null;
            const resultado = await procesarArchivoFactura(file, (msg, pct) => {
                ocrStatus.innerHTML = `⏳ ${msg}${pct ? ' (' + Math.round(pct * 100) + '%)' : ''}`;
            }, cuitEmpresa, 'compra');
            
            const { datos, fuente } = resultado;
            const fuenteLabel = fuente === 'pdf.js' ? '📄 PDF' : '🔍 OCR';
            
            let detectados = [];
            
            if (datos && datos.total) {
                const totalNum = typeof datos.total === 'number' ? datos.total : parseFloat(String(datos.total).replace(/[^0-9.,]/g, '').replace(',', '.'));
                if (!isNaN(totalNum) && totalNum > 0) {
                    inputTotalOC.value = totalNum.toFixed(2);
                    inputTotalOC.dispatchEvent(new Event('input'));
                    detectados.push(`Total: <strong>$${formatNumber(totalNum)}</strong>`);
                }
            }
            
            if (datos && datos.numeroFactura && !inputNumeroOC.value) {
                inputNumeroOC.value = datos.numeroFactura;
                detectados.push(`Nº: <strong>${datos.numeroFactura}</strong>`);
            }
            
            if (detectados.length > 0) {
                ocrStatus.innerHTML = `🤖 ${fuenteLabel} detectó: ${detectados.join(' · ')}. <strong>Verificá que sea correcto.</strong>`;
                ocrStatus.className = 'text-xs text-green-600 mt-1';
            } else {
                ocrStatus.innerHTML = `⚠️ ${fuenteLabel} no pudo detectar el total. Cargalo manualmente.`;
                ocrStatus.className = 'text-xs text-orange-600 mt-1';
            }
        } catch (err) {
            console.error('Error en OCR:', err);
            ocrStatus.innerHTML = '⚠️ No se pudo analizar el archivo. Cargá el total manualmente.';
            ocrStatus.className = 'text-xs text-orange-600 mt-1';
        }
    };
    
    inputArchivoOC.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            window._quitarArchivoOC();
            return;
        }
        archivoOCSeleccionado = file;
        previewOCNombre.textContent = file.name;
        previewOCTamanio.textContent = (file.size / 1024).toFixed(1) + ' KB';
        previewOCIcon.textContent = file.type === 'application/pdf' ? '📄' : '🖼️';
        previewOC.classList.remove('hidden');
        await analizarOCConOCR(file);
    });
    
    window._previewArchivoOC = () => {
        if (!archivoOCSeleccionado) return;
        const url = URL.createObjectURL(archivoOCSeleccionado);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    
    window._reanalizarOC = async () => {
        if (!archivoOCSeleccionado) return;
        await analizarOCConOCR(archivoOCSeleccionado);
    };
    
    window._quitarArchivoOC = () => {
        archivoOCSeleccionado = null;
        inputArchivoOC.value = '';
        previewOC.classList.add('hidden');
        ocrStatus.innerHTML = '';
        ocrStatus.className = 'text-xs text-gray-500 mt-1';
    };
    
    const actualizarDiferencia = () => {
        const totalOC = parseFloat(inputTotalOC.value) || 0;
        const diferencia = +(totalOC - sumaPresupuestos).toFixed(2);
        const diferenciaAbs = Math.abs(diferencia);
        const signo = diferencia > 0 ? '+' : '';
        spanDiferencia.textContent = signo + '$' + formatNumber(diferencia);
        
        if (diferenciaAbs === 0) {
            spanDiferencia.className = 'text-green-600 font-bold';
            spanAviso.innerHTML = '✅ La OC coincide exactamente con los presupuestos.';
            spanAviso.className = 'text-xs text-green-600 mt-1';
            btnConfirmar.disabled = false;
            btnConfirmar.className = 'bg-blue-600 text-white px-4 py-2 rounded-xl flex-1 font-bold';
        } else if (diferenciaAbs <= 10) {
            spanDiferencia.className = 'text-orange-600 font-bold';
            spanAviso.innerHTML = `⚠️ Diferencia de redondeo aceptable (≤ $10). Se facturará el total de la OC ($${formatNumber(totalOC)}).`;
            spanAviso.className = 'text-xs text-orange-600 mt-1';
            btnConfirmar.disabled = false;
            btnConfirmar.className = 'bg-blue-600 text-white px-4 py-2 rounded-xl flex-1 font-bold';
        } else {
            spanDiferencia.className = 'text-red-600 font-bold';
            spanAviso.innerHTML = `❌ Diferencia mayor a $10. Revisá la OC antes de agrupar.`;
            spanAviso.className = 'text-xs text-red-600 mt-1';
            btnConfirmar.disabled = true;
            btnConfirmar.className = 'bg-gray-400 text-white px-4 py-2 rounded-xl flex-1 font-bold cursor-not-allowed';
        }
    };
    
    inputTotalOC.addEventListener('input', actualizarDiferencia);
    actualizarDiferencia();
};

window._confirmarAgruparPresupuestos = async (idsStr) => {
    const ids = idsStr.split(',');
    const db = getDB();
    const presupuestos = ids.map(id => db.presupuestos.find(p => String(p.id) === String(id))).filter(Boolean);
    
    if (presupuestos.length !== ids.length) {
        mostrarNotificacion('Algunos presupuestos no fueron encontrados', 'error');
        return;
    }
    
    const sumaPresupuestos = presupuestos.reduce((s, p) => s + (p.total || 0), 0);
    const totalOC = parseFloat(document.getElementById('inputTotalOC').value) || sumaPresupuestos;
    const diferencia = +(totalOC - sumaPresupuestos).toFixed(2);
    const cliente = presupuestos[0].cliente;
    const numeros = presupuestos.map(p => p.numero);
    const numeroOC = document.getElementById('inputNumeroOC').value.trim();
    const fechaRecepcionOC = document.getElementById('inputFechaRecepcionOC').value;
    const fechaCobroEsperada = document.getElementById('inputFechaCobro').value;
    const archivoOC = document.getElementById('inputArchivoOC').files[0];
    
    document.querySelector('.modal')?.remove();
    
    try {
        const ventaId = generarId();
        let ocArchivoUrl = null;
        let ocArchivoNombre = null;
        
        if (archivoOC) {
            try {
                const rutaStorage = `presupuestos/oc_${ventaId}_${archivoOC.name}`;
                ocArchivoUrl = await subirArchivo(rutaStorage, archivoOC);
                ocArchivoNombre = archivoOC.name;
            } catch (errSubida) {
                console.error('Error al subir OC:', errSubida);
                mostrarNotificacion('⚠️ No se pudo subir la OC, pero la venta se creará igual', 'warning');
            }
        }
        
        // 🔥 v7.22.96: Calcular monto neto e IVA de la venta agrupada
        const totalOC = parseFloat(document.getElementById('inputTotalOC').value) || sumaPresupuestos;
        const montoNeto = +(totalOC / 1.21).toFixed(2);
        const ivaMonto = +(totalOC - montoNeto).toFixed(2);
        
        const nuevaVenta = {
            id: ventaId,
            clienteId: presupuestos[0].clienteId,
            clienteNombre: cliente,
            clienteCuit: presupuestos[0].clienteCuit,
            montoNeto: montoNeto,
            ivaMonto: ivaMonto,
            iva: 21,
            // 🔥 v7.22.65: copiar patente y vehículo del primer presupuesto (o combinar si hay varias)
            patente: [...new Set(presupuestos.map(p => p.patente).filter(Boolean).map(p => p.trim().toUpperCase()))].join(' / '),
            vehiculoMarca: presupuestos[0].vehiculoMarca || '',
            vehiculoKm: presupuestos[0].vehiculoKm || '',
            fechaVenta: hoyISO(),
            fechaCobroEsperada: fechaCobroEsperada || hoyISO(),
            mes: hoyISO().substring(0, 7),
            estado: 'pendiente_factura',
            esVentaAgrupada: true,
            presupuestosOrigenIds: ids,
            presupuestosOrigenNumeros: numeros,
            totalPresupuestos: sumaPresupuestos,
            ocClienteTotal: totalOC,
            ajusteRedondeo: diferencia,
            ocClienteNumero: numeroOC || null,
            fechaRecepcionOC: fechaRecepcionOC || null,
            ocArchivoUrl: ocArchivoUrl,
            ocArchivoNombre: ocArchivoNombre,
            ventaDirecta: false,
            items: presupuestos.map(p => ({
                descripcion: `Presupuesto ${p.numero} - ${p.trabajo || 'Trabajo'}`,
                cantidad: 1,
                precioUnitario: p.total,
                total: p.total,
                presupuestoOrigenId: p.id
            })),
            total: totalOC,
            totales: {
                totalFactura: totalOC
            }
        };
        
        if (!db.ventas) db.ventas = [];
        db.ventas.push(nuevaVenta);
        
        presupuestos.forEach(p => {
            const idx = db.presupuestos.findIndex(x => String(x.id) === String(p.id));
            if (idx >= 0) {
                db.presupuestos[idx].estado = 'aprobado';
                db.presupuestos[idx].fechaAprobacion = hoyISO();
                db.presupuestos[idx].ventaGeneradaId = ventaId;
            }
        });
        
        guardarDB();
        mostrarNotificacion(`📦 Venta agrupada creada ($${formatNumber(totalOC)})`, 'success');
        window.limpiarSeleccionPresupuestos();
        window.dispatchEvent(new Event('refreshView'));
    } catch (err) {
        console.error('Error al agrupar presupuestos:', err);
        mostrarNotificacion('Error al agrupar: ' + err.message, 'error');
    }
};

// ==================== FILTROS ====================
window.aplicarFiltrosPresupuestos = () => {
    const busqueda = document.getElementById('filtroBusquedaPresupuestos').value;
    const estado = document.getElementById('filtroEstadoPresupuestos').value;
    localStorage.setItem('presupuestosFiltroBusqueda', busqueda);
    localStorage.setItem('presupuestosFiltroEstado', estado);
    window.dispatchEvent(new Event('refreshView'));
};

window.limpiarFiltrosPresupuestos = () => {
    document.getElementById('filtroBusquedaPresupuestos').value = '';
    document.getElementById('filtroEstadoPresupuestos').value = 'todos';
    localStorage.removeItem('presupuestosFiltroBusqueda');
    localStorage.removeItem('presupuestosFiltroEstado');
    window.dispatchEvent(new Event('refreshView'));
};
