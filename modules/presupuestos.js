import { getDB, guardarDB } from './db.js';
import { formatNumber, mostrarNotificacion, generarId } from './utils.js';

const CONSTANTES_FISCALES = {
    IIBB_SALTA: 0.036,
    TISSH: 0.005,
    GANANCIAS: 0.25,
    RESERVA_LEGAL: 0.05
};

let itemsPresupuesto = [];
let markupGlobal = 30;
let usarMarkupGlobal = true;
let incluirIVA = true;
let esTercerizado = true;

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

function calcularGananciaReal(montoVentaCliente, costoProveedor) {
    const gananciaBruta = montoVentaCliente - costoProveedor;
    const iibb = montoVentaCliente * CONSTANTES_FISCALES.IIBB_SALTA;
    const tissh = montoVentaCliente * CONSTANTES_FISCALES.TISSH;
    let utilidadAntes = gananciaBruta - iibb - tissh;
    utilidadAntes = Math.max(0, utilidadAntes);
    const impuestoGanancias = utilidadAntes * CONSTANTES_FISCALES.GANANCIAS;
    const despuesGanancias = utilidadAntes - impuestoGanancias;
    const reservaLegal = despuesGanancias * CONSTANTES_FISCALES.RESERVA_LEGAL;
    const gananciaNeta = Math.max(0, despuesGanancias - reservaLegal);
    
    return {
        montoVentaCliente, costoProveedor, gananciaBruta,
        iibb, tissh, utilidadAntes, impuestoGanancias, reservaLegal, gananciaNeta,
        margenRealSobreDiferencia: gananciaBruta > 0 ? (gananciaNeta / gananciaBruta) * 100 : 0
    };
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
    itemsPresupuesto = [
        { nro: 1, desc: "PRODUCTO/SERVICIO", cant: 1, costo: 500000, markup: 30 }
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

function mostrarEditorPresupuesto() {
    const db = getDB();
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
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
                        <label><input type="radio" name="modoMarkup" id="modoGlobal" ${usarMarkupGlobal ? 'checked' : ''} onchange="window.toggleModoMarkup()"> Margen Global (${markupGlobal}%)</label>
                        <label><input type="radio" name="modoMarkup" id="modoIndividual" ${!usarMarkupGlobal ? 'checked' : ''} onchange="window.toggleModoMarkup()"> Margen Individual</label>
                        <label><input type="checkbox" id="tercerizadoCheckbox" ${esTercerizado ? 'checked' : ''} onchange="window.toggleTercerizado()"> Trabajo Tercerizado</label>
                        <label class="ml-auto"><input type="checkbox" id="incluirIVACheckbox" ${incluirIVA ? 'checked' : ''} onchange="window.toggleIVA()"> Incluir IVA 21%</label>
                    </div>
                    
                    <div id="resumenTercerizado" class="p-3 bg-yellow-50 rounded-lg">
                        <div class="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div class="text-xs text-gray-500">Costo Proveedor</div>
                                <div class="font-bold text-red-600 text-lg" id="resumenCosto">$${formatNumber(costoTotal)}</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-500">Venta al Cliente</div>
                                <div class="font-bold text-green-600 text-lg" id="resumenVenta">$${formatNumber(ventaTotal)}</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-500">Diferencia (Ganancia Bruta)</div>
                                <div class="font-bold text-blue-600 text-lg" id="resumenDiferencia">$${formatNumber(gananciaBruta)}</div>
                            </div>
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
                                <tr><th class="p-2">#</th><th class="p-2">Producto/Servicio</th><th class="p-2 w-20">Cant.</th><th class="p-2 w-28">Costo Proveedor</th><th class="p-2 w-28 markup-col">Markup %</th><th class="p-2 w-28">Precio Venta</th><th class="p-2 w-28">Subtotal Venta</th><th class="p-2 w-10"></th></tr>
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
                                <div class="flex justify-between font-bold">
                                    <span>Total Original:</span>
                                    <span id="totalOriginal" class="text-red-600">$0</span>
                                </div>
                                <div class="flex justify-between font-bold">
                                    <span>Total Venta:</span>
                                    <span id="totalVenta" class="text-green-600">$0</span>
                                </div>
                                <div class="flex justify-between font-bold text-blue-600">
                                    <span>Diferencia Total:</span>
                                    <span id="diferenciaTotal">$0</span>
                                </div>
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
                            <div class="text-sm space-y-1">
                                <div class="flex justify-between"><span>Venta al Cliente:</span><span id="gnVenta" class="font-bold">$0</span></div>
                                <div class="flex justify-between"><span>Costo Proveedor:</span><span id="gnCosto" class="font-bold text-red-600">$0</span></div>
                                <div class="flex justify-between border-t pt-1"><span>Ganancia Bruta:</span><span id="gnGananciaBruta" class="font-bold text-green-600">$0</span></div>
                                <div class="flex justify-between"><span>IIBB Salta (3.6%):</span><span id="gnIIBB">$0</span></div>
                                <div class="flex justify-between"><span>TISSH (0.5%):</span><span id="gnTISSH">$0</span></div>
                                <div class="border-t pt-1 mt-1 flex justify-between"><span>Utilidad Antes Ganancias:</span><span id="gnUtilidadAntes">$0</span></div>
                                <div class="flex justify-between"><span>Impuesto Ganancias (25%):</span><span id="gnImpuestoGanancias" class="text-red-600">$0</span></div>
                                <div class="flex justify-between"><span>Reserva Legal (5%):</span><span id="gnReservaLegal" class="text-orange-600">$0</span></div>
                                <div class="border-t pt-1 mt-1 flex justify-between bg-blue-100 p-1 rounded">
                                    <span class="font-bold text-blue-700">💰 GANANCIA NETA FINAL:</span>
                                    <span class="font-bold text-blue-700 text-lg" id="gnGananciaNeta">$0</span>
                                </div>
                                <div class="text-xs text-gray-500 mt-1">Margen sobre diferencia: <span id="gnMargenSobreDiferencia">0%</span></div>
                            </div>
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
        itemsPresupuesto.splice(idx, 1);
        itemsPresupuesto.forEach((item, i) => item.nro = i + 1);
        renderizarTodo();
    };
    
    document.getElementById('agregarItem').onclick = () => {
        itemsPresupuesto.push({ nro: itemsPresupuesto.length + 1, desc: "NUEVO SERVICIO", cant: 1, costo: 0, markup: markupGlobal });
        renderizarTodo();
    };
    
    const slider = document.getElementById('markupSlider');
    if (slider) slider.oninput = (e) => window.actualizarMarkupGlobal(parseInt(e.target.value));
    
    document.getElementById('vistaPreviaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion('Seleccione un cliente', 'warning');
            return;
        }
        
        const ventaTotal = getVentaTotalCliente();
        const iva = ventaTotal * 0.21;
        const totalConIVA = ventaTotal + iva;
        const gn = calcularGananciaReal(ventaTotal, getCostoTotalProveedor());
        
        let itemsHTML = '';
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const precioVenta = item.costo * (1 + markup/100);
            itemsHTML += `<tr><td style="padding: 8px;">${item.nro}</td><td style="padding: 8px;">${item.desc}</td><td style="text-align:center">${item.cant}</td><td style="text-align:right">$${formatNumber(precioVenta)}</td><td style="text-align:right">$${formatNumber(precioVenta * item.cant)}</td></tr>`;
        });
        
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(`
            <html><head><title>Presupuesto ${numeroPresupuesto}</title>
            <style>
                body { font-family: Arial; padding: 20px; max-width: 900px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; }
                h1 { color: #1e3a8a; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background: #1e3a8a; color: white; }
                .total { text-align: right; margin-top: 20px; }
                .ganancia { background: #dbeafe; padding: 15px; border-radius: 10px; margin-top: 20px; }
                @media print { .no-print { display: none; } }
            </style></head>
            <body>
                <div class="header"><h1>SOLUM S.A.S.</h1><p>Presupuesto Nº ${numeroPresupuesto}</p></div>
                <p><strong>Cliente:</strong> ${cliente.nombre}</p>
                <p><strong>Vigencia:</strong> ${getVigenciaTexto()}</p>
                <table><thead><tr><th>#</th><th>Producto</th><th>Cant.</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead><tbody>${itemsHTML}</tbody></table>
                <div class="total"><p>Subtotal: $${formatNumber(ventaTotal)}</p>${incluirIVA ? `<p>IVA 21%: $${formatNumber(iva)}</p>` : ''}<h3>TOTAL: $${formatNumber(totalConIVA)}</h3></div>
                <div class="ganancia"><h3>GANANCIA NETA ESTIMADA: $${formatNumber(gn.gananciaNeta)}</h3></div>
                <div class="no-print"><button onclick="window.print()">🖨️ Imprimir</button> <button onclick="window.close()">Cerrar</button></div>
            </body></html>
        `);
        ventana.document.close();
    };
    
    document.getElementById('guardarPresupuesto').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        if (!cliente) {
            mostrarNotificacion('Seleccione un cliente', 'error');
            return;
        }
        
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
        
        document.getElementById('gnVenta').innerHTML = `$${formatNumber(gn.montoVentaCliente)}`;
        document.getElementById('gnCosto').innerHTML = `$${formatNumber(gn.costoProveedor)}`;
        document.getElementById('gnGananciaBruta').innerHTML = `$${formatNumber(gn.gananciaBruta)}`;
        document.getElementById('gnIIBB').innerHTML = `$${formatNumber(gn.iibb)}`;
        document.getElementById('gnTISSH').innerHTML = `$${formatNumber(gn.tissh)}`;
        document.getElementById('gnUtilidadAntes').innerHTML = `$${formatNumber(gn.utilidadAntes)}`;
        document.getElementById('gnImpuestoGanancias').innerHTML = `$${formatNumber(gn.impuestoGanancias)}`;
        document.getElementById('gnReservaLegal').innerHTML = `$${formatNumber(gn.reservaLegal)}`;
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
            return `
                <tr class="border-b">
                    <td class="p-2 text-center">${item.nro}</td>
                    <td class="p-2"><input value="${escapeHtml(item.desc)}" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm"></td>
                    <td class="p-2"><input type="number" value="${item.cant}" step="1" onchange="window.actualizarItem(${idx}, 'cant', this.value)" class="w-20 p-1 border rounded text-sm text-center"></td>
                    <td class="p-2"><input type="number" value="${item.costo}" step="1000" onchange="window.actualizarItem(${idx}, 'costo', this.value)" class="w-32 p-1 border rounded text-sm text-right"></td>
                    ${!usarMarkupGlobal ? `<td class="p-2"><input type="number" value="${item.markup}" step="5" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-20 p-1 border rounded text-sm text-center">%</td>` : ''}
                    <td class="p-2 text-right font-medium text-green-600">$${formatNumber(precioVenta)}</td>
                    <td class="p-2 text-right font-medium">$${formatNumber(subtotalVenta)}</td>
                    <td class="p-2 text-center"><button onclick="window.eliminarItem(${idx})" class="text-red-500 text-xl">🗑️</button></td>
                </tr>
            `;
        }).join('');
    }
    
    function renderizarComparativas() {
        let incHTML = '';
        let finalHTML = '';
        itemsPresupuesto.forEach(item => {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            const costoItem = item.costo * item.cant;
            const ventaItem = item.costo * (1 + markup/100) * item.cant;
            incHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${item.desc} x${item.cant}</span><span>$${formatNumber(costoItem)} → $${formatNumber(ventaItem)} <span class="text-green-600">(+$${formatNumber(ventaItem - costoItem)})</span></span></div>`;
            finalHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${item.desc} x${item.cant}</span><span>$${formatNumber(ventaItem)}</span></div>`;
        });
        document.getElementById('vistaIncremento').innerHTML = incHTML || '<p class="text-gray-400">Sin items</p>';
        document.getElementById('vistaFinal').innerHTML = finalHTML || '<p class="text-gray-400">Sin items</p>';
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
            <h2 class="text-xl font-bold mb-2">Presupuesto ${p.numero}</h2>
            <p><strong>Cliente:</strong> ${p.cliente}</p>
            <p><strong>Total:</strong> $${formatNumber(p.total)}</p>
            <p><strong>Ganancia Neta Real:</strong> $${formatNumber(p.gananciaNetaReal || 0)}</p>
            <p><strong>Fecha:</strong> ${new Date(p.fechaCreacion).toLocaleDateString()}</p>
            <button onclick="window.eliminarPresupuesto(${p.id})" class="mt-4 bg-red-600 text-white px-4 py-2 rounded-xl">Eliminar</button>
        </div>`;
};

window.eliminarPresupuesto = (id) => {
    if (confirm('Eliminar este presupuesto?')) {
        const db = getDB();
        db.presupuestos = db.presupuestos.filter(p => p.id !== id);
        guardarDB();
        mostrarNotificacion('Presupuesto eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'); }
export function initPresupuestosEvents() {}
