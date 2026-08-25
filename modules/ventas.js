// ==================== modules/ventas.js ====================
// VENTAS - Con trazabilidad (Presupuesto → OC → Cobro)
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId, escapeHtml, formatDate } from './utils.js';

// ==================== RENDER PRINCIPAL ====================
export function renderVentas() {
    const db = getDB();
    const meses = [...new Set(db.ventas.map(v => v.mes))].sort().reverse();
    const mesSeleccionado = localStorage.getItem('ventasMesFiltro') || meses[0] || new Date().toISOString().substring(0, 7);
    const ventasFiltradas = db.ventas.filter(v => v.mes === mesSeleccionado);
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
                    <button onclick="window.mostrarModalDesdePresupuesto()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                        <span>📄</span> Desde Presupuesto
                    </button>
                </div>
            </div>

            <div class="flex gap-3 items-center bg-white dark:bg-gray-800 p-3 rounded-xl shadow flex-wrap">
                <label class="text-sm font-medium">📅 Mes:</label>
                <select id="mesSelectVentas" class="flex-1 p-2 border rounded-lg bg-white dark:bg-gray-900 min-w-[150px]" onchange="window.filtrarVentas()">
                    ${meses.map(m => `<option value="${m}" ${m === mesSeleccionado ? 'selected' : ''}>${m}</option>`).join('')}
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
                ${ventasFiltradas.map(v => renderVentaCard(v, db)).join('') || '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">📭 No hay ventas en este mes</p></div>'}
            </div>
        </div>`;
}

// ==================== RENDER TARJETA DE VENTA ====================
function renderVentaCard(v, db) {
    const estadoMap = {
        'presupuestado': { label: '📋 Presupuestado', color: 'bg-gray-100 text-gray-700' },
        'aceptado': { label: '✅ Aceptado', color: 'bg-blue-100 text-blue-700' },
        'pendiente_cobro': { label: '⏳ Pendiente de Cobro', color: 'bg-yellow-100 text-yellow-700' },
        'cobrado': { label: '💰 Cobrado', color: 'bg-green-100 text-green-700' }
    };
    const estado = estadoMap[v.estado] || estadoMap['presupuestado'];

    // Calcular días restantes para cobro
    let diasRestantes = null;
    let alerta = '';
    if (v.fechaCobroEsperada && v.estado !== 'cobrado') {
        diasRestantes = calcularDiasRestantes(v.fechaCobroEsperada);
        if (diasRestantes < 0) alerta = '🔴 Vencido hace ' + Math.abs(diasRestantes) + ' días';
        else if (diasRestantes === 0) alerta = '🟠 Vence hoy';
        else if (diasRestantes <= 3) alerta = '🟡 Vence en ' + diasRestantes + ' días';
    }

    // Mostrar OC si existe
    const ocText = v.ordenCompraCliente ? `OC: ${escapeHtml(v.ordenCompraCliente)}` : '';

    return `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all border-l-4 ${v.estado === 'cobrado' ? 'border-green-500' : v.estado === 'pendiente_cobro' ? 'border-yellow-500' : 'border-blue-500'}">
            <div class="flex justify-between items-start flex-wrap gap-2">
                <div class="flex-1 min-w-[200px]">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-bold text-lg">${escapeHtml(v.clienteNombre)}</h3>
                        <span class="text-xs px-3 py-1 rounded-full ${estado.color}">${estado.label}</span>
                        ${v.presupuestoId ? `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">📄 P-${v.presupuestoId}</span>` : ''}
                        ${ocText ? `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">📋 ${ocText}</span>` : ''}
                        ${alerta ? `<span class="text-xs font-bold ${diasRestantes < 0 ? 'text-red-600' : 'text-orange-600'}">${alerta}</span>` : ''}
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                        <div><span class="text-gray-500">Factura:</span> <span class="font-semibold">${escapeHtml(v.tipoComprobante || '')} ${escapeHtml(v.numComprobante || '')}</span></div>
                        <div><span class="text-gray-500">Total:</span> <span class="font-semibold text-green-600">$${formatNumber(v.total)}</span></div>
                        <div><span class="text-gray-500">Fecha:</span> ${v.fechaVenta ? formatDate(v.fechaVenta) : ''}</div>
                        <div><span class="text-gray-500">Cobro esperado:</span> ${v.fechaCobroEsperada ? formatDate(v.fechaCobroEsperada) : ''}</div>
                    </div>
                    ${v.medioPago ? `<div class="text-xs text-gray-500 mt-1">💳 ${escapeHtml(v.medioPago)}${v.comisionTarjeta ? ` (comisión: ${v.comisionTarjeta}%)` : ''}</div>` : ''}
                    ${v.interesMora ? `<div class="text-xs text-red-500 mt-1">⚠️ Interés por mora: $${formatNumber(v.interesMora)}</div>` : ''}
                    ${v.facturaUrl ? `<div class="mt-1"><a href="${v.facturaUrl}" target="_blank" class="text-xs text-blue-600 underline">📎 Ver factura</a></div>` : ''}
                </div>
                <div class="flex flex-col gap-2">
                    ${v.estado === 'pendiente_cobro' ? 
                        `<button onclick="window.mostrarModalCobrarVenta('${v.id}')" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm shadow-md">💵 Cobrar</button>` : 
                        v.estado === 'presupuestado' ?
                        `<button onclick="window.aceptarPresupuestoVenta('${v.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm shadow-md">✅ Aceptar</button>` : ''
                    }
                    ${v.estado !== 'cobrado' ? `<button onclick="window.eliminarVenta('${v.id}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-xl text-sm">🗑️</button>` : ''}
                </div>
            </div>
        </div>`;
}

// ==================== CALCULAR DÍAS RESTANTES ====================
function calcularDiasRestantes(fechaISO) {
    if (!fechaISO) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaISO);
    fecha.setHours(0, 0, 0, 0);
    return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}

// ==================== FILTRAR ====================
window.filtrarVentas = () => {
    const select = document.getElementById('mesSelectVentas');
    if (select) localStorage.setItem('ventasMesFiltro', select.value);
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== INICIALIZAR EVENTOS ====================
export function initVentasEvents() {
    const select = document.getElementById('mesSelectVentas');
    if (select) select.onchange = window.filtrarVentas;
}

// ==================== NUEVA VENTA MANUAL ====================
window.mostrarModalNuevaVenta = () => {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} (${c.diasCobro} días)</option>`).join('');

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">💰 Nueva Venta</h2>

                <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <label class="block font-medium mb-2 text-blue-700 dark:text-blue-300">📄 Subir factura (PDF/Imagen)</label>
                    <input type="file" id="facturaFile" accept=".pdf,image/*" class="w-full p-2 border rounded-lg">
                    <div id="lecturaProgress" class="hidden text-sm text-blue-600 mt-2">🔄 Leyendo datos...</div>
                    <div id="lecturaResultado" class="text-xs text-green-600 mt-1"></div>
                </div>

                <div class="text-center text-gray-400 text-sm my-2">— O ingresa manualmente —</div>

                <div class="space-y-3">
                    <select id="clienteId" class="w-full p-3 border rounded-xl bg-white dark:bg-gray-900">
                        ${clientesOptions}
                    </select>
                    <input type="text" id="tipoFactura" placeholder="Tipo (Factura A/B/C)" value="Factura A" class="w-full p-3 border rounded-xl">
                    <input type="text" id="numFactura" placeholder="Número de Factura" class="w-full p-3 border rounded-xl">
                    <input type="number" id="montoNeto" placeholder="Monto Neto (sin IVA)" class="w-full p-3 border rounded-xl" step="0.01">
                    <select id="ivaSelect" class="w-full p-3 border rounded-xl">
                        <option value="21">IVA 21%</option>
                        <option value="10.5">IVA 10.5%</option>
                        <option value="27">IVA 27%</option>
                        <option value="0">Exento</option>
                    </select>
                    <input type="date" id="fechaVenta" value="${new Date().toISOString().split('T')[0]}" class="w-full p-3 border rounded-xl">
                    <input type="text" id="ordenCompraCliente" placeholder="Orden de Compra del Cliente (opcional)" class="w-full p-3 border rounded-xl">
                </div>

                <div class="flex gap-3 mt-5">
                    <button id="guardarVentaBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">💾 Guardar Venta</button>
                    <button id="cancelarVentaBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    // OCR (igual que antes)
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
                resultadoDiv.innerHTML = '📄 PDF detectado. Ingresá los datos manualmente.';
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
        const oc = document.getElementById('ordenCompraCliente').value;

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

        db.ventas.push({
            id: generarId(),
            clienteId,
            clienteNombre: cliente.nombre,
            tipoComprobante: tipoFactura,
            numComprobante: numFactura,
            montoNeto: monto,
            iva,
            ivaMonto,
            total,
            fechaVenta: fecha,
            fechaCobroEsperada: fechaCobro.toISOString().split('T')[0],
            mes: fecha.substring(0, 7),
            estado: 'pendiente_cobro',
            facturaUrl,
            facturaNombre: facturaFile?.name,
            ordenCompraCliente: oc || null,
            // Campos de trazabilidad (vacíos, porque no viene de presupuesto)
            presupuestoId: null,
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: null,
            medioPago: null,
            comisionTarjeta: null,
            interesMora: null,
            fechaCobro: null,
            comprobanteCobro: null
        });
        guardarDB();
        mostrarNotificacion(`✅ Venta registrada - Factura ${tipoFactura} ${numFactura} por $${formatNumber(total)}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    document.getElementById('cancelarVentaBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== CREAR VENTA DESDE PRESUPUESTO ====================
window.mostrarModalDesdePresupuesto = () => {
    const db = getDB();
    const presupuestosDisponibles = db.presupuestos.filter(p => {
        // Solo presupuestos que no tengan venta asociada (o que no estén cobrados)
        const ventaAsociada = db.ventas.find(v => v.presupuestoId === p.id);
        return !ventaAsociada;
    });

    if (presupuestosDisponibles.length === 0) {
        mostrarNotificacion('No hay presupuestos disponibles para convertir en venta', 'warning');
        return;
    }

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">📄 Seleccionar Presupuesto</h2>
                <div class="space-y-2 max-h-60 overflow-y-auto">
                    ${presupuestosDisponibles.map(p => `
                        <div onclick="window.crearVentaDesdePresupuesto('${p.id}')" class="border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                            <p><strong>${escapeHtml(p.cliente)}</strong></p>
                            <p class="text-sm">${p.numero} - Total: $${formatNumber(p.total)}</p>
                            <p class="text-xs text-gray-500">${p.fechaCreacion ? formatDate(p.fechaCreacion) : ''}</p>
                        </div>
                    `).join('')}
                </div>
                <button onclick="window.dispatchEvent(new Event('refreshView'))" class="mt-4 w-full bg-gray-300 dark:bg-gray-700 py-2 rounded-xl">Cancelar</button>
            </div>
        </div>`;
};

// ==================== CREAR VENTA DESDE PRESUPUESTO (acción) ====================
window.crearVentaDesdePresupuesto = (presupuestoId) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === presupuestoId);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }

    // Verificar si ya existe una venta para este presupuesto
    if (db.ventas.some(v => v.presupuestoId === presupuestoId)) {
        mostrarNotificacion('Este presupuesto ya tiene una venta asociada', 'warning');
        return;
    }

    const cliente = db.clientes.find(c => c.id === presupuesto.clienteId);
    if (!cliente) { mostrarNotificacion('Cliente no encontrado', 'error'); return; }

    // Abrir modal para confirmar y cargar OC
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">📄 Convertir Presupuesto en Venta</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(presupuesto.cliente)}</p>
                    <p><strong>Presupuesto:</strong> ${presupuesto.numero}</p>
                    <p><strong>Total:</strong> <span class="font-bold text-green-600">$${formatNumber(presupuesto.total)}</span></p>
                    <p><strong>Ganancia Neta Estimada:</strong> $${formatNumber(presupuesto.gananciaNetaReal || 0)}</p>
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-medium">📋 Número de Orden de Compra (OC)</label>
                    <input type="text" id="ocCliente" class="w-full p-3 border rounded-xl" placeholder="Ej: OC-2026-001">
                    <label class="block text-sm font-medium">📅 Fecha de cobro esperada</label>
                    <input type="date" id="fechaCobroVenta" class="w-full p-3 border rounded-xl" value="${presupuesto.fechaCobroEsperada || new Date(Date.now() + cliente.diasCobro * 86400000).toISOString().split('T')[0]}">
                    <label class="block text-sm font-medium">🧾 Número de Factura</label>
                    <input type="text" id="numFacturaVenta" class="w-full p-3 border rounded-xl" placeholder="Ej: 0001-00123456">
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarVentaBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Crear Venta</button>
                    <button id="cancelarVentaBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    document.getElementById('confirmarVentaBtn').onclick = () => {
        const oc = document.getElementById('ocCliente').value.trim();
        const fechaCobro = document.getElementById('fechaCobroVenta').value;
        const numFactura = document.getElementById('numFacturaVenta').value.trim();

        if (!numFactura) {
            mostrarNotificacion('Ingrese número de factura', 'warning');
            return;
        }

        // Crear la venta
        const nuevaVenta = {
            id: generarId(),
            clienteId: presupuesto.clienteId,
            clienteNombre: presupuesto.cliente,
            tipoComprobante: 'Factura A',
            numComprobante: numFactura,
            montoNeto: presupuesto.ventaCliente || presupuesto.total / (1 + (presupuesto.incluirIVA ? 0.21 : 0)),
            iva: presupuesto.incluirIVA ? 21 : 0,
            ivaMonto: presupuesto.incluirIVA ? presupuesto.total * 0.21 / 1.21 : 0,
            total: presupuesto.total,
            fechaVenta: new Date().toISOString().split('T')[0],
            fechaCobroEsperada: fechaCobro || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            mes: new Date().toISOString().substring(0, 7),
            estado: 'aceptado',
            facturaUrl: null,
            facturaNombre: null,
            ordenCompraCliente: oc || null,
            // Trazabilidad: heredar del presupuesto
            presupuestoId: presupuesto.id,
            // Heredar compras vinculadas de cada ítem (si existen)
            comprasVinculadas: presupuesto.items
                .filter(i => i.compraVinculadaId)
                .map(i => ({
                    compraId: i.compraVinculadaId,
                    itemIndex: i.compraItemIndex,
                    cantidad: i.cantidadAsignada || i.cant,
                    descripcion: i.desc
                })),
            // Para compatibilidad con el sistema actual
            compraVinculadaId: presupuesto.items.find(i => i.compraVinculadaId)?.compraVinculadaId || null,
            compraItemIndex: presupuesto.items.find(i => i.compraVinculadaId)?.compraItemIndex || null,
            cantidadAsignada: presupuesto.items.find(i => i.compraVinculadaId)?.cantidadAsignada || null,
            // Campos de cobro
            medioPago: null,
            comisionTarjeta: null,
            interesMora: null,
            fechaCobro: null,
            comprobanteCobro: null,
            items: presupuesto.items.map(i => ({ ...i })) // Copiar items del presupuesto
        };

        db.ventas.push(nuevaVenta);

        // Actualizar el presupuesto para que sepa que ya tiene venta
        const presupuestoIndex = db.presupuestos.findIndex(p => p.id === presupuestoId);
        if (presupuestoIndex !== -1) {
            db.presupuestos[presupuestoIndex].ventaGeneradaId = nuevaVenta.id;
        }

        guardarDB();
        mostrarNotificacion(`✅ Venta creada desde presupuesto ${presupuesto.numero}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    document.getElementById('cancelarVentaBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== ACEPTAR PRESUPUESTO (desde la tarjeta) ====================
window.aceptarPresupuestoVenta = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => v.id === ventaId);
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    // Similar a crear desde presupuesto pero con datos ya existentes
    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">✅ Aceptar Presupuesto</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(venta.clienteNombre)}</p>
                    <p><strong>Total:</strong> <span class="font-bold text-green-600">$${formatNumber(venta.total)}</span></p>
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-medium">📋 Número de Orden de Compra (OC)</label>
                    <input type="text" id="ocClienteAceptar" class="w-full p-3 border rounded-xl" value="${venta.ordenCompraCliente || ''}" placeholder="Ej: OC-2026-001">
                    <label class="block text-sm font-medium">📅 Fecha de cobro esperada</label>
                    <input type="date" id="fechaCobroAceptar" class="w-full p-3 border rounded-xl" value="${venta.fechaCobroEsperada || ''}">
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarAceptarBtn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl">✅ Confirmar</button>
                    <button id="cancelarAceptarBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    document.getElementById('confirmarAceptarBtn').onclick = () => {
        const oc = document.getElementById('ocClienteAceptar').value.trim();
        const fechaCobro = document.getElementById('fechaCobroAceptar').value;

        venta.estado = 'pendiente_cobro';
        venta.ordenCompraCliente = oc || venta.ordenCompraCliente || null;
        if (fechaCobro) venta.fechaCobroEsperada = fechaCobro;

        guardarDB();
        mostrarNotificacion('✅ Presupuesto aceptado. Pendiente de cobro.', 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    document.getElementById('cancelarAceptarBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== COBRAR VENTA (mejorado) ====================
window.mostrarModalCobrarVenta = (ventaId) => {
    const db = getDB();
    const venta = db.ventas.find(v => v.id === ventaId);
    if (!venta) { mostrarNotificacion('Venta no encontrada', 'error'); return; }

    const vencido = venta.fechaCobroEsperada && calcularDiasRestantes(venta.fechaCobroEsperada) < 0;
    const montoTotal = venta.total || 0;

    document.getElementById('root').innerHTML = `
        <div class="modal">
            <div class="modal-content w-full max-w-md">
                <h2 class="text-xl font-bold mb-4">💰 Cobrar Venta</h2>
                <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                    <p><strong>Cliente:</strong> ${escapeHtml(venta.clienteNombre)}</p>
                    <p><strong>Factura:</strong> ${escapeHtml(venta.tipoComprobante || '')} ${escapeHtml(venta.numComprobante || '')}</p>
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
                    </div>
                ` : ''}

                <div class="space-y-3">
                    <label class="block text-sm font-medium">📅 Fecha de cobro</label>
                    <input type="date" id="fechaCobro" value="${new Date().toISOString().split('T')[0]}" class="w-full p-3 border rounded-xl">

                    <label class="block text-sm font-medium">💳 Medio de pago</label>
                    <select id="medioPago" class="w-full p-3 border rounded-xl">
                        <option value="efectivo">💵 Efectivo</option>
                        <option value="transferencia">🏦 Transferencia</option>
                        <option value="tarjeta_debito">💳 Tarjeta Débito</option>
                        <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
                        <option value="cheque">📄 Cheque</option>
                        <option value="otro">🔄 Otro</option>
                    </select>

                    <div id="comisionContainer" class="hidden">
                        <label class="block text-sm font-medium">📊 Comisión bancaria (%)</label>
                        <input type="number" id="comisionTarjeta" class="w-full p-3 border rounded-xl" value="${db.configuracion?.comisionTarjetaDefault || 3}" step="0.1">
                    </div>

                    <label class="block text-sm font-medium">📄 Comprobante</label>
                    <input type="text" id="comprobante" placeholder="Nº de transferencia / cheque" class="w-full p-3 border rounded-xl">

                    <label class="block text-sm font-medium">📎 Adjuntar comprobante</label>
                    <input type="file" id="comprobanteFile" accept="image/*,.pdf" class="w-full p-2 border rounded-lg">
                </div>

                <div id="resumenCobro" class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm">
                    <p><strong>Total a cobrar:</strong> <span id="montoACobrar" class="font-bold text-green-600">$${formatNumber(montoTotal)}</span></p>
                    <div id="descuentoComision" class="hidden text-red-600"></div>
                    <div id="interesAplicado" class="hidden text-orange-600"></div>
                    <p><strong>Neto a recibir:</strong> <span id="netoRecibir" class="font-bold text-blue-600">$${formatNumber(montoTotal)}</span></p>
                </div>

                <div class="flex gap-3 mt-5">
                    <button id="confirmarCobroBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl">✅ Registrar Cobro</button>
                    <button id="cancelarCobroBtn" class="flex-1 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 py-3 rounded-xl">Cancelar</button>
                </div>
            </div>
        </div>`;

    // Mostrar/ocultar comisión según medio de pago
    const medioPagoSelect = document.getElementById('medioPago');
    const comisionContainer = document.getElementById('comisionContainer');

    medioPagoSelect.onchange = () => {
        const esTarjeta = medioPagoSelect.value === 'tarjeta_debito' || medioPagoSelect.value === 'tarjeta_credito';
        comisionContainer.classList.toggle('hidden', !esTarjeta);
        actualizarResumen();
    };

    document.getElementById('comisionTarjeta')?.addEventListener('input', actualizarResumen);
    document.getElementById('aplicarInteres')?.addEventListener('change', actualizarResumen);

    function actualizarResumen() {
        let montoBase = montoTotal;
        let descuento = 0;
        let interes = 0;

        // Comisión por tarjeta
        const esTarjeta = medioPagoSelect.value === 'tarjeta_debito' || medioPagoSelect.value === 'tarjeta_credito';
        if (esTarjeta) {
            const comision = parseFloat(document.getElementById('comisionTarjeta')?.value) || 0;
            descuento = montoBase * (comision / 100);
        }

        // Interés por mora
        const aplicarInteres = document.getElementById('aplicarInteres')?.checked || false;
        if (aplicarInteres) {
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
        if (interes > 0) {
            interesEl.classList.remove('hidden');
            interesEl.innerHTML = `⚠️ Interés por mora: +$${formatNumber(interes)}`;
        } else {
            interesEl.classList.add('hidden');
        }
    }

    document.getElementById('confirmarCobroBtn').onclick = () => {
        const fecha = document.getElementById('fechaCobro').value;
        const medioPago = document.getElementById('medioPago').value;
        const comprobante = document.getElementById('comprobante').value;
        const file = document.getElementById('comprobanteFile').files[0];

        let comision = 0;
        let interes = 0;

        // Calcular comisión
        if (medioPago === 'tarjeta_debito' || medioPago === 'tarjeta_credito') {
            comision = parseFloat(document.getElementById('comisionTarjeta')?.value) || 0;
        }

        // Calcular interés
        if (document.getElementById('aplicarInteres')?.checked) {
            const porcentaje = db.configuracion?.porcentajeRecargoMora || 5;
            interes = montoTotal * (porcentaje / 100);
        }

        const netoRecibido = montoTotal + interes - (montoTotal * comision / 100);

        // Actualizar venta
        venta.estado = 'cobrado';
        venta.fechaCobro = fecha;
        venta.medioPago = medioPago;
        venta.comisionTarjeta = comision > 0 ? comision : null;
        venta.interesMora = interes > 0 ? interes : null;
        venta.netoRecibido = netoRecibido;
        venta.comprobanteCobro = comprobante || null;
        if (file) {
            venta.comprobanteUrl = URL.createObjectURL(file);
            venta.comprobanteNombre = file.name;
        }

        // Liberar stock si la venta tiene compras vinculadas
        if (venta.comprasVinculadas && venta.comprasVinculadas.length > 0) {
            venta.comprasVinculadas.forEach(cv => {
                // La liberación ya se hizo en el presupuesto, pero si no, la hacemos aquí
                // En realidad el stock ya está reservado, al cobrar se confirma
                console.log('✅ Stock confirmado para compra:', cv.compraId);
            });
        }

        guardarDB();
        mostrarNotificacion(`💰 Cobro registrado de ${venta.clienteNombre} - Neto recibido: $${formatNumber(netoRecibido)}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };

    document.getElementById('cancelarCobroBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
};

// ==================== ELIMINAR VENTA ====================
window.eliminarVenta = (id) => {
    if (!confirm('¿Eliminar esta venta permanentemente?')) return;
    const db = getDB();
    const venta = db.ventas.find(v => v.id === id);
    if (!venta) return;

    // Si estaba vinculada a un presupuesto, limpiar referencia
    if (venta.presupuestoId) {
        const presupuesto = db.presupuestos.find(p => p.id === venta.presupuestoId);
        if (presupuesto) {
            delete presupuesto.ventaGeneradaId;
        }
    }

    db.ventas = db.ventas.filter(v => v.id !== id);
    guardarDB();
    mostrarNotificacion('Venta eliminada', 'info');
    window.dispatchEvent(new Event('refreshView'));
};
