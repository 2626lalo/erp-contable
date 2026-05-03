import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, cerrarModal } from './utils.js';

export function renderVentas() {
    const db = getDB();
    const meses = [...new Set(db.ventas.map(v => v.mes))].sort().reverse();
    const mesSeleccionado = localStorage.getItem('ventasMesFiltro') || meses[0] || new Date().toISOString().substring(0, 7);
    const ventasFiltradas = db.ventas.filter(v => v.mes === mesSeleccionado);
    const totalMes = ventasFiltradas.reduce((s, v) => s + v.total, 0);
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">💰 Ventas</h1>
                <button onclick="window.mostrarModalNuevaVenta()" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl transition-all shadow-md flex items-center gap-2">
                    <span class="text-xl">+</span> Nueva Venta
                </button>
            </div>
            <div class="flex gap-3 items-center bg-white dark:bg-gray-800 p-3 rounded-xl shadow">
                <label class="text-sm font-medium">📅 Mes:</label>
                <select id="mesSelectVentas" class="flex-1 p-2 border rounded-lg bg-white dark:bg-gray-900" onchange="window.filtrarVentas()">
                    ${meses.map(m => `<option value="${m}" ${m === mesSeleccionado ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
            </div>
            <div class="gradient-success rounded-2xl p-5 text-white shadow-xl">
                <p class="text-sm opacity-90">Total ${mesSeleccionado}</p>
                <p class="text-3xl font-bold">$${formatNumber(totalMes)}</p>
            </div>
            <div class="space-y-3">
                ${ventasFiltradas.map(v => `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h3 class="font-bold text-lg">${v.clienteNombre}</h3>
                                    <span class="text-xs px-3 py-1 rounded-full ${v.estado === 'cobrado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                                        ${v.estado === 'cobrado' ? '✓ Cobrado' : '⏳ Pendiente'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
                                    <div><span class="text-gray-500">Factura:</span> <span class="font-semibold">${v.tipoComprobante} ${v.numComprobante}</span></div>
                                    <div><span class="text-gray-500">Total:</span> <span class="font-semibold text-green-600">$${formatNumber(v.total)}</span></div>
                                    <div><span class="text-gray-500">Fecha:</span> ${v.fechaVenta}</div>
                                    <div><span class="text-gray-500">Cobro esperado:</span> ${v.fechaCobroEsperada}</div>
                                </div>
                                ${v.facturaUrl ? `<div class="mt-2"><a href="${v.facturaUrl}" target="_blank" class="text-xs text-blue-600 underline">📎 Ver factura adjunta</a></div>` : ''}
                            </div>
                            ${v.estado === 'pendiente_cobro' ? `<button onclick="window.mostrarModalCobrarVenta(${v.id})" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm shadow-md">💵 Cobrar</button>` : ''}
                        </div>
                    </div>
                `).join('') || '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">📭 No hay ventas en este mes</p></div>'}
            </div>
        </div>`;
}

export function initVentasEvents() {
    const select = document.getElementById('mesSelectVentas');
    if (select) select.onchange = () => { localStorage.setItem('ventasMesFiltro', select.value); window.dispatchEvent(new Event('refreshView')); };
}

export function mostrarModalNuevaVenta() {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.diasCobro} días)</option>`).join('');
    
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">💰 Nueva Venta</h2>
                
                <!-- Opción: Subir factura PDF -->
                <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <label class="block font-medium mb-2 text-blue-700 dark:text-blue-300">📄 Opción 1: Subir factura (PDF/Imagen)</label>
                    <input type="file" id="facturaFile" accept=".pdf,image/*" class="w-full p-2 border rounded-lg">
                    <div id="lecturaProgress" class="hidden text-sm text-blue-600 mt-2">🔄 Leyendo datos de la factura...</div>
                    <div id="lecturaResultado" class="text-xs text-green-600 mt-1"></div>
                </div>
                
                <div class="text-center text-gray-400 text-sm my-2">— O ingresa manualmente —</div>
                
                <!-- Formulario manual -->
                <div class="space-y-3">
                    <select id="clienteId" class="w-full p-3 border rounded-xl bg-white dark:bg-gray-900">
                        ${clientesOptions}
                    </select>
                    <input type="text" id="tipoFactura" placeholder="Tipo (Factura A/B/C)" value="Factura A" class="w-full p-3 border rounded-xl">
                    <input type="text" id="numFactura" placeholder="Número de Factura (ej: 0001-00123456)" class="w-full p-3 border rounded-xl">
                    <input type="number" id="montoNeto" placeholder="Monto Neto (sin IVA)" class="w-full p-3 border rounded-xl">
                    <select id="ivaSelect" class="w-full p-3 border rounded-xl">
                        <option value="21">IVA 21%</option>
                        <option value="10.5">IVA 10.5%</option>
                        <option value="27">IVA 27%</option>
                        <option value="0">Exento</option>
                    </select>
                    <input type="date" id="fechaVenta" value="${new Date().toISOString().split('T')[0]}" class="w-full p-3 border rounded-xl">
                </div>
                
                <div class="flex gap-3 mt-5">
                    <button id="guardarVentaBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl transition-all">💾 Guardar Venta</button>
                    <button id="cancelarVentaBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 text-gray-700 dark:text-white py-3 rounded-xl transition-all">Cancelar</button>
                </div>
            </div>
        </div>`;
    
    // Lectura de factura por OCR
    const fileInput = document.getElementById('facturaFile');
    const progressDiv = document.getElementById('lecturaProgress');
    const resultadoDiv = document.getElementById('lecturaResultado');
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        progressDiv.classList.remove('hidden');
        resultadoDiv.innerHTML = '';
        try {
            if (file.type === 'application/pdf') {
                resultadoDiv.innerHTML = '📄 PDF detectado. Por favor ingresá los datos manualmente.';
                progressDiv.classList.add('hidden');
                return;
            }
            const { data: { text } } = await Tesseract.recognize(file, 'spa');
            const numeros = text.match(/\d{1,6}[.,]?\d{0,2}/g) || [];
            const posiblesPrecios = numeros.filter(n => { const num = parseFloat(n.replace(',', '.')); return num > 100 && num < 10000000; });
            const facturaPattern = /Factura\s*(?:N°|Nro|Numero)?\s*[:]?\s*(\d{4,}-\d{8,})/i;
            const facturaMatch = text.match(facturaPattern);
            const numFactura = facturaMatch ? facturaMatch[1] : '';
            const fechaPattern = /(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/;
            const fechaMatch = text.match(fechaPattern);
            let fechaEncontrada = '';
            if (fechaMatch) {
                let fecha = fechaMatch[1];
                if (fecha.includes('/')) { const partes = fecha.split('/'); fechaEncontrada = `${partes[2]}-${partes[1]}-${partes[0]}`; }
                else { fechaEncontrada = fecha; }
            }
            if (numFactura) { document.getElementById('numFactura').value = numFactura; resultadoDiv.innerHTML += `📋 Factura: ${numFactura}<br>`; }
            if (fechaEncontrada) { document.getElementById('fechaVenta').value = fechaEncontrada; resultadoDiv.innerHTML += `📅 Fecha: ${fechaEncontrada}<br>`; }
            if (posiblesPrecios.length > 0) { document.getElementById('montoNeto').value = posiblesPrecios[0]; resultadoDiv.innerHTML += `💰 Monto: $${posiblesPrecios[0]}<br>`; }
            if (!numFactura && !fechaEncontrada && posiblesPrecios.length === 0) { resultadoDiv.innerHTML = '⚠️ No se extrajeron datos'; }
            else { resultadoDiv.innerHTML += '✅ Datos cargados automáticamente'; }
        } catch (error) { resultadoDiv.innerHTML = '❌ Error al leer la imagen'; }
        finally { progressDiv.classList.add('hidden'); }
    };
    
    document.getElementById('guardarVentaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteId').value);
        const tipoFactura = document.getElementById('tipoFactura').value;
        const numFactura = document.getElementById('numFactura').value;
        const monto = parseFloat(document.getElementById('montoNeto').value);
        const iva = parseFloat(document.getElementById('ivaSelect').value);
        const fecha = document.getElementById('fechaVenta').value;
        if (!clienteId || isNaN(monto)) { mostrarNotificacion("Complete los datos", 'error'); return; }
        if (!numFactura) { mostrarNotificacion("Ingrese número de factura", 'warning'); return; }
        const cliente = db.clientes.find(c => c.id === clienteId);
        const ivaMonto = monto * (iva / 100);
        const total = monto + ivaMonto;
        const fechaCobro = new Date(fecha);
        fechaCobro.setDate(fechaCobro.getDate() + cliente.diasCobro);
        const facturaFile = document.getElementById('facturaFile').files[0];
        let facturaUrl = null;
        if (facturaFile) { facturaUrl = URL.createObjectURL(facturaFile); }
        db.ventas.push({ id: Date.now(), clienteId, clienteNombre: cliente.nombre, tipoComprobante: tipoFactura, numComprobante: numFactura, montoNeto: monto, iva, ivaMonto, total, fechaVenta: fecha, fechaCobroEsperada: fechaCobro.toISOString().split('T')[0], mes: fecha.substring(0, 7), estado: 'pendiente_cobro', facturaUrl, facturaNombre: facturaFile?.name });
        guardarDB();
        mostrarNotificacion(`✅ Venta registrada - Factura ${tipoFactura} ${numFactura} por $${formatNumber(total)}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    
    document.getElementById('cancelarVentaBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
}

export function mostrarModalCobrarVenta(id) {
    const db = getDB();
    const v = db.ventas.find(x => x.id === id);
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">💰 Cobrar Venta</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${v.clienteNombre}</p>
                    <p><strong>Factura:</strong> ${v.tipoComprobante} ${v.numComprobante}</p>
                    <p><strong>Monto:</strong> <span class="font-bold text-green-600">$${formatNumber(v.total)}</span></p>
                    <p><strong>Vencimiento:</strong> ${v.fechaCobroEsperada}</p>
                </div>
                <div class="space-y-3">
                    <label>📅 Fecha de cobro</label>
                    <input type="date" id="fechaCobro" value="${new Date().toISOString().split('T')[0]}" class="w-full p-3 border rounded-xl">
                    <label>📄 Comprobante</label>
                    <input type="text" id="comprobante" placeholder="Transferencia Nº / Cheque" class="w-full p-3 border rounded-xl">
                    <label>📎 Adjuntar comprobante</label>
                    <input type="file" id="comprobanteFile" accept="image/*,.pdf" class="w-full p-2 border rounded-lg">
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarCobroBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Registrar Cobro</button>
                    <button id="cancelarCobroBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;
    document.getElementById('confirmarCobroBtn').onclick = () => {
        const venta = db.ventas.find(x => x.id === id);
        venta.estado = 'cobrado';
        venta.fechaCobro = document.getElementById('fechaCobro').value;
        venta.comprobanteCobro = document.getElementById('comprobante').value;
        const file = document.getElementById('comprobanteFile').files[0];
        if (file) { venta.comprobanteUrl = URL.createObjectURL(file); venta.comprobanteNombre = file.name; }
        guardarDB();
        mostrarNotificacion(`💰 Cobro registrado de ${venta.clienteNombre}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    document.getElementById('cancelarCobroBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
}
