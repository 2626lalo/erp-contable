import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion } from './utils.js';

export function renderCompras() {
    const db = getDB();
    const meses = [...new Set(db.compras.map(c => c.mes))].sort().reverse();
    const mesSeleccionado = localStorage.getItem('comprasMesFiltro') || meses[0] || new Date().toISOString().substring(0, 7);
    const comprasFiltradas = db.compras.filter(c => c.mes === mesSeleccionado);
    const totalMes = comprasFiltradas.reduce((s, c) => s + c.total, 0);
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center">
                <h1 class="text-2xl font-bold">🛒 Compras</h1>
                <button onclick="window.mostrarModalNuevaCompra()" class="bg-blue-600 text-white px-5 py-2 rounded-xl flex items-center gap-2">+ Nueva Compra</button>
            </div>
            <div class="flex gap-3"><label>📅 Mes:</label><select id="mesSelectCompras" class="flex-1 p-2 border rounded-lg" onchange="window.filtrarCompras()">${meses.map(m => `<option value="${m}" ${m === mesSeleccionado ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
            <div class="gradient-danger rounded-2xl p-5 text-white"><p>Total ${mesSeleccionado}</p><p class="text-3xl font-bold">$${formatNumber(totalMes)}</p></div>
            <div class="space-y-3">${comprasFiltradas.map(c => `<div class="bg-white rounded-2xl p-4 shadow-md"><div class="flex justify-between"><div><h3 class="font-bold">${c.proveedorNombre}</h3><div class="grid grid-cols-2 gap-2 mt-3 text-sm"><div>Total: <span class="font-semibold text-red-600">$${formatNumber(c.total)}</span></div><div>Factura: ${c.tipoComprobante || 'Sin factura'} ${c.numComprobante || ''}</div></div></div>${c.estado === 'pendiente_pago' ? `<button onclick="window.mostrarModalPagarCompra(${c.id})" class="bg-green-600 text-white px-4 py-2 rounded-xl">💸 Pagar</button>` : ''}</div></div>`).join('') || '<p class="text-center">No hay compras</p>'}</div>
        </div>`;
}

export function initComprasEvents() { const s = document.getElementById('mesSelectCompras'); if(s) s.onchange = () => { localStorage.setItem('comprasMesFiltro', s.value); window.dispatchEvent(new Event('refreshView')); }; }

export function mostrarModalNuevaCompra() {
    const db = getDB();
    const proveedoresOptions = db.proveedores.map(p => `<option value="${p.id}">${p.nombre} (${p.diasPago} días)</option>`).join('');
    document.getElementById('root').innerHTML = `
        <div class="modal"><div class="modal-content w-full max-w-md"><h2 class="text-xl font-bold mb-4">🛒 Nueva Compra</h2>
            <div class="mb-4 p-3 bg-yellow-50 rounded-xl"><label class="flex items-center gap-2"><input type="checkbox" id="sinFacturaCheckbox" onchange="window.toggleSinFactura()"> <span>📄 Compra sin factura</span></label></div>
            <div id="uploadSection"><input type="file" id="facturaFile" accept=".pdf,image/*" class="w-full p-2 border rounded-lg"><div id="lecturaProgress" class="hidden text-blue-600">🔄 Leyendo...</div><div id="lecturaResultado" class="text-xs text-green-600"></div></div>
            <div id="sinFacturaSection" class="hidden"><input type="text" id="concepto" placeholder="Concepto" class="w-full p-2 border rounded my-2"><select id="categoriaGasto" class="w-full p-2 border rounded"><option value="">Categoría</option><option>Insumos</option><option>Herramientas</option><option>Servicios</option></select></div>
            <div class="text-center text-gray-400 my-2" id="separadorText">— O ingresa manualmente —</div>
            <div id="manualSection" class="space-y-2"><select id="proveedorId" class="w-full p-2 border rounded"><option value="">Seleccionar proveedor...</option>${proveedoresOptions}</select><input type="text" id="tipoFactura" placeholder="Tipo factura" value="Factura A" class="w-full p-2 border rounded"><input type="text" id="numFactura" placeholder="Número de factura" class="w-full p-2 border rounded"><input type="number" id="montoNeto" placeholder="Monto Neto" class="w-full p-2 border rounded"><select id="ivaSelect" class="w-full p-2 border rounded"><option value="21">IVA 21%</option><option value="10.5">IVA 10.5%</option></select><input type="date" id="fechaCompra" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2 border rounded"></div>
            <div class="flex gap-3 mt-5"><button id="guardarCompraBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Guardar</button><button id="cancelarCompraBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button></div>
        </div></div>`;
    
    window.toggleSinFactura = () => {
        const sin = document.getElementById('sinFacturaCheckbox').checked;
        document.getElementById('uploadSection').style.display = sin ? 'none' : 'block';
        document.getElementById('sinFacturaSection').style.display = sin ? 'block' : 'none';
        document.getElementById('manualSection').style.display = sin ? 'none' : 'block';
        document.getElementById('separadorText').style.display = sin ? 'none' : 'block';
    };
    
    const fileInput = document.getElementById('facturaFile');
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById('lecturaProgress').classList.remove('hidden');
        try {
            const { data: { text } } = await Tesseract.recognize(file, 'spa');
            const numeros = text.match(/\d{1,6}[.,]?\d{0,2}/g) || [];
            const precios = numeros.filter(n => { const num = parseFloat(n.replace(',', '.')); return num > 100; });
            const facturaMatch = text.match(/Factura.*?(\d{4,}-\d{8,})/i);
            if (facturaMatch) document.getElementById('numFactura').value = facturaMatch[1];
            if (precios.length > 0) document.getElementById('montoNeto').value = precios[0];
            document.getElementById('lecturaResultado').innerHTML = '✅ Datos cargados';
        } catch(e) { document.getElementById('lecturaResultado').innerHTML = '❌ Error'; }
        finally { document.getElementById('lecturaProgress').classList.add('hidden'); }
    };
    
    document.getElementById('guardarCompraBtn').onclick = () => {
        const sinFactura = document.getElementById('sinFacturaCheckbox').checked;
        const fecha = document.getElementById('fechaCompra').value;
        if (sinFactura) {
            const concepto = document.getElementById('concepto').value;
            const monto = parseFloat(document.getElementById('montoNeto').value);
            if (!concepto || isNaN(monto)) { mostrarNotificacion("Complete los datos", 'error'); return; }
            db.compras.push({ id: Date.now(), sinFactura: true, concepto, montoNeto: monto, total: monto, fechaCompra: fecha, mes: fecha.substring(0, 7), estado: 'pendiente_pago', proveedorNombre: concepto });
            mostrarNotificacion("✅ Compra sin factura registrada", 'success');
        } else {
            const proveedorId = parseInt(document.getElementById('proveedorId').value);
            const numFactura = document.getElementById('numFactura').value;
            const monto = parseFloat(document.getElementById('montoNeto').value);
            if (!proveedorId || isNaN(monto)) { mostrarNotificacion("Complete los datos", 'error'); return; }
            const proveedor = db.proveedores.find(p => p.id === proveedorId);
            const iva = parseFloat(document.getElementById('ivaSelect').value);
            const ivaMonto = monto * (iva / 100);
            const total = monto + ivaMonto;
            db.compras.push({ id: Date.now(), proveedorId, proveedorNombre: proveedor.nombre, numComprobante: numFactura, montoNeto: monto, iva, ivaMonto, total, fechaCompra: fecha, mes: fecha.substring(0, 7), estado: 'pendiente_pago' });
            mostrarNotificacion(`✅ Compra registrada a ${proveedor.nombre}`, 'success');
        }
        guardarDB();
        window.dispatchEvent(new Event('refreshView'));
    };
    document.getElementById('cancelarCompraBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
}

export function mostrarModalPagarCompra(id) {
    const db = getDB();
    const c = db.compras.find(x => x.id === id);
    document.getElementById('root').innerHTML = `
        <div class="modal"><div class="modal-content"><h2 class="text-xl font-bold mb-4">💰 Pagar Compra</h2><p><strong>${c.proveedorNombre}</strong></p><p>Monto: $${formatNumber(c.total)}</p><input type="date" id="fechaPago" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2 border rounded my-2"><input type="text" id="comprobante" placeholder="Comprobante" class="w-full p-2 border rounded"><div class="flex gap-3 mt-5"><button id="confirmarPagoBtn" class="flex-1 bg-green-600 text-white py-2 rounded-xl">Pagar</button><button id="cancelarPagoBtn" class="flex-1 bg-gray-300 py-2 rounded-xl">Cancelar</button></div></div></div>`;
    document.getElementById('confirmarPagoBtn').onclick = () => { const compra = db.compras.find(x => x.id === id); compra.estado = 'pagado'; compra.fechaPago = document.getElementById('fechaPago').value; compra.comprobantePago = document.getElementById('comprobante').value; guardarDB(); mostrarNotificacion(`💸 Pago registrado a ${compra.proveedorNombre}`); window.dispatchEvent(new Event('refreshView')); };
    document.getElementById('cancelarPagoBtn').onclick = () => window.dispatchEvent(new Event('refreshView'));
}
