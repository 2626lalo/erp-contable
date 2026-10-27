// ==================== modules/presupuestos/editor.js ====================
// EDITOR - Modal de edición/creación de presupuestos
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB, getTodosLosImpuestos } from '../db.js';
import { formatNumber, escapeHtml, formatDate, mostrarNotificacion, generarId, validarDatosEsenciales, mostrarAlertaDatosFaltantes, confirmarAccion} from '../utils.js';
import { ALICUOTA_IVA } from './estado.js';
import {
    crearModal, cerrarModal, getProximoNumeroPresupuesto, procesarTextoItem, getVigenciaTexto,
    separarIVA, getDatosEmpresa, getCostoTotalProveedor, getVentaTotalCliente,
    calcularGananciaReal, obtenerDeudasMoraCliente, activarMayusculasAutomaticas,
    parsearTablaPegada,
    parsearPresupuestoCompleto
} from './helpers.js';
import { renderizarTablaItems, renderizarComparativas, redondearEntero } from './items.js';
import { generarHTMLPresupuestoCliente } from './plantilla-cliente.js';
import { generarHTMLPresupuestoCompleto } from './plantilla-completa.js';
import { buscarUnidadPorPatente, autocompletarDesdePatente, crearOActualizarUnidad } from '../unidades.js';

// ==================== 🔥 v7.22.15: ACTUALIZAR VIGENCIA (AL PRINCIPIO) ====================
window.actualizarVigenciaPresupuesto = () => {
    const fechaEmision = document.getElementById('fechaEmisionPresupuesto')?.value;
    const dias = parseInt(document.getElementById('validezDias')?.value) || 20;
    const vigenciaInput = document.getElementById('vigencia');
    if (vigenciaInput && fechaEmision) {
        const fecha = new Date(fechaEmision + 'T12:00:00');
        fecha.setDate(fecha.getDate() + dias);
        vigenciaInput.value = `Este presupuesto tiene validez hasta el ${fecha.toLocaleDateString('es-AR')}`;
    }
};


// Referencias al estado (se sincronizan vía setters)
let itemsPresupuesto = [];
let markupGlobal = 30;
let usarMarkupGlobal = true;
let incluirIVA = true;
let esTercerizado = true;
let presupuestoEditandoId = null;
let deudasPendientes = [];
let impuestosActivados = null; // null = usar los activos de la DB

export function getItemsPresupuesto() { return itemsPresupuesto; }
export function getDeudasPendientes() { return deudasPendientes; }

// 🔥 Suma los subtotales redondeados al entero (para que el total cierre exacto)
function calcularVentaTotalRedondeada(items, usarMarkupGlobal, markupGlobal) {
    let total = 0;
    items.forEach(item => {
        const cant = item.cant || 1;
        let precioVenta = item.precioVentaUnitario;
        if (precioVenta === undefined || precioVenta === null || precioVenta === 0) {
            let costo = 0;
            if (item.tipo === 'mano_obra') {
                costo = (item.horas || 0) * (item.valorHora || 0);
            } else {
                costo = item.costo || 0;
            }
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            precioVenta = costo * (1 + markup / 100);
        }
        total += redondearEntero(precioVenta * cant);
    });
    return total;
}

// ==================== NUEVO PRESUPUESTO ====================
window.mostrarModalNuevoPresupuesto = () => {
    const faltantes = validarDatosEsenciales();
    if (faltantes.length > 0) {
        mostrarAlertaDatosFaltantes(faltantes);
        return;
    }
    presupuestoEditandoId = null;
    deudasPendientes = [];
    itemsPresupuesto = [];
    markupGlobal = 30;
    usarMarkupGlobal = true;
    incluirIVA = true;
    esTercerizado = true;
    impuestosActivados = null;

    // 🔥 Si viene de "Nuevo presupuesto para unidad", precargar la patente
    const patenteInicial = localStorage.getItem('presupuestoPatenteInicial');
    if (patenteInicial) {
        localStorage.removeItem('presupuestoPatenteInicial');
        const unidad = buscarUnidadPorPatente(patenteInicial);
        if (unidad) {
            const datosIniciales = {
                patente: unidad.patente,
                vehiculoMarca: unidad.marcaModelo || '',
                vehiculoKm: unidad.kmActual || '',
                vehiculoAnio: unidad.anio || '',
                vehiculoColor: unidad.color || '',
                vehiculoChasis: unidad.motor || '',
                clienteId: unidad.clienteId || null
            };
            mostrarEditorPresupuesto(null, datosIniciales);
            return;
        }
    }

    mostrarEditorPresupuesto(null);
};

window.mostrarModalCargarPDF = () => {
    mostrarNotificacion("Funcionalidad en desarrollo", "info");
    window.mostrarModalNuevoPresupuesto();
};

// ==================== EDITAR PRESUPUESTO ====================
window.editarPresupuesto = (id) => {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (!presupuesto) { mostrarNotificacion('Presupuesto no encontrado', 'error'); return; }
    if (presupuesto.estado === 'aprobado') {
        mostrarNotificacion('No se puede editar un presupuesto aprobado', 'warning');
        return;
    }
    if (presupuesto.esMora) {
        mostrarNotificacion('No se puede editar un presupuesto de mora', 'warning');
        return;
    }
    presupuestoEditandoId = id;
    deudasPendientes = [];
    itemsPresupuesto = presupuesto.items.map(i => {
        const item = { ...i, esPropio: i.esPropio || false, accion: i.accion || '' };
        if (!item.precioVentaUnitario || item.precioVentaUnitario === 0) {
            let costo = 0;
            if (item.tipo === 'mano_obra') {
                costo = (item.horas || 0) * (item.valorHora || 0);
            } else {
                costo = item.costo || 0;
            }
            const markup = presupuesto.usarMarkupGlobal ? (presupuesto.markupGlobal || 30) : (item.markup || 0);
            // 🔥 v7.21.4: markup sobre costo CON IVA
            item.precioVentaUnitario = costo * (1 + ALICUOTA_IVA / 100) * (1 + markup / 100);
        }
        return item;
    });
    markupGlobal = presupuesto.markupGlobal;
    usarMarkupGlobal = presupuesto.usarMarkupGlobal;
    incluirIVA = presupuesto.incluirIVA;
    esTercerizado = presupuesto.esTercerizado;
    impuestosActivados = presupuesto.impuestosActivados || null;
    mostrarEditorPresupuesto(presupuesto.presupuestoPadreId, presupuesto);
};

// ==================== EDITOR PRINCIPAL ====================
function mostrarEditorPresupuesto(padreId, datosEditar = null) {
    window._datosEditarActuales = datosEditar;
    const db = getDB();
    const esEdicion = !!datosEditar;
    const clienteIdSeleccionado = datosEditar ? datosEditar.clienteId : null;
    const clientesOptions = db.clientes.map(c => `<option value="${c.id}" ${datosEditar && datosEditar.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const numeroPresupuesto = esEdicion ? datosEditar.numero : `P-${getProximoNumeroPresupuesto().toString().padStart(4, '0')}`;
    const presupuestosOptions = db.presupuestos
        .filter(p => p.id !== (datosEditar ? datosEditar.id : null))
        .map(p => `<option value="${p.id}" ${datosEditar && datosEditar.presupuestoPadreId === p.id ? 'selected' : ''}>${p.numero} - ${escapeHtml(p.cliente)}</option>`)
        .join('');
    const costoTotal = getCostoTotalProveedor(itemsPresupuesto);
    const ventaTotal = calcularVentaTotalRedondeada(itemsPresupuesto, usarMarkupGlobal, markupGlobal);
    const gananciaBruta = ventaTotal - costoTotal;

    document.getElementById('root').innerHTML = `
        <div class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="max-w-6xl mx-auto my-8 bg-white rounded-2xl shadow-2xl">
                <div class="sticky top-0 bg-white p-4 border-b flex justify-between items-center rounded-t-2xl">
                    <h2 class="text-xl font-bold">${esEdicion ? '✏️ Editar' : 'Editar'} Presupuesto - ${numeroPresupuesto}</h2>
                    <button onclick="window.dispatchEvent(new Event('refreshView'))" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="p-4 space-y-4 pb-8">
                    <div class="bg-blue-50 p-3 rounded-lg text-sm">
                        <div class="font-bold text-blue-700">${getDatosEmpresa().nombre || 'Mi Empresa SRL'}</div>
                        <div class="text-xs text-gray-600">CUIT: ${getDatosEmpresa().cuit || '30-12345678-9'} | ${getDatosEmpresa().direccion || ''}</div>
                        <div class="text-xs text-gray-600">Tel: ${getDatosEmpresa().telefono || ''} | Email: ${getDatosEmpresa().email || ''}</div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block font-medium mb-1">Cliente</label>
                            <select id="clienteSelect" class="w-full p-2 border rounded-lg" onchange="window.cargarDeudasCliente(this.value)">
                                <option value="">Seleccionar...</option>
                                ${clientesOptions}
                            </select>
                            <input type="text" id="clienteManual" class="w-full p-2 border rounded-lg mt-2" placeholder="O escribí un cliente nuevo (si no está en la lista)" value="${datosEditar ? escapeHtml(datosEditar.clienteManual || '') : ''}" oninput="this.value = this.value.toUpperCase()">
                        </div>
                        <div>
                            <label class="block font-medium mb-1">Patente <span class="text-xs text-blue-600 font-normal">(se autocompleta si existe)</span></label>
                            <input type="text" id="patente" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.patente || '') : ''}" placeholder="Ej: AF886BF" onblur="window.autocompletarPatente(this.value)" oninput="this.value = this.value.toUpperCase()">
                        </div>
                        <div><label class="block font-medium mb-1">Vehículo (marca/modelo)</label><input type="text" id="vehiculoMarca" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.vehiculoMarca || '') : ''}" placeholder="Ej: Ford Ranger" oninput="this.value = this.value.toUpperCase()"></div>
                        <div><label class="block font-medium mb-1">Kilometraje</label><input type="text" id="vehiculoKm" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.vehiculoKm || '') : ''}" placeholder="Ej: 85000"></div>
                        <div><label class="block font-medium mb-1">Año</label><input type="text" id="vehiculoAnio" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.vehiculoAnio || '') : ''}" placeholder="Ej: 2019"></div>
                        <div><label class="block font-medium mb-1">Color</label><input type="text" id="vehiculoColor" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.vehiculoColor || '') : ''}" placeholder="Ej: BLANCO"></div>
                        <div><label class="block font-medium mb-1">Chasis</label><input type="text" id="vehiculoChasis" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.vehiculoChasis || '') : ''}" placeholder="Ej: 8ANBD33FXPL608015"></div>
                        <div><label class="block font-medium mb-1">Centro de Costo</label><input type="text" id="centroCosto" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.centroCosto || '') : ''}"></div>
                        <div><label class="block font-medium mb-1">Interesado</label><input type="text" id="interesado" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.interesado || '') : ''}" placeholder="Nombre del interesado" oninput="this.value = this.value.toUpperCase()"></div>
                        <div><label class="block font-medium mb-1">Cel/Tel del interesado</label><input type="text" id="interesadoTel" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.interesadoTel || '') : ''}" placeholder="Ej: 1165747374"></div>
                        <div><label class="block font-medium mb-1">Compañía de Seguros</label><input type="text" id="companiaSeguros" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.companiaSeguros || 'NO APLICA') : 'NO APLICA'}"></div>
                        <div><label class="block font-medium mb-1">Nro. Siniestro</label><input type="text" id="nroSiniestro" class="w-full p-2 border rounded-lg" value="${datosEditar ? escapeHtml(datosEditar.nroSiniestro || '') : ''}" placeholder="Opcional"></div>
                        <div><label class="block font-medium mb-1">Vigencia</label><input type="text" id="vigencia" value="${getVigenciaTexto()}" class="w-full p-2 border rounded-lg bg-gray-100" readonly></div>
                        <div>
                            <label class="block font-medium mb-1">📅 Fecha de emisión</label>
                            <div class="flex items-center gap-2">
                                <input type="text" id="fechaEmisionPresupuestoText" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="DD/MM/AAAA" value="${datosEditar && datosEditar.fechaCreacion ? formatDate(datosEditar.fechaCreacion) : formatDate(new Date())}" oninput="const p=this.value.split('/');if(p.length===3){const h=document.getElementById('fechaEmisionPresupuesto');if(h){h.value=p[2]+'-'+p[1]+'-'+p[0];window.actualizarVigenciaPresupuesto();}}">
                                <input type="date" id="fechaEmisionPresupuesto" class="hidden" value="${datosEditar && datosEditar.fechaCreacion ? datosEditar.fechaCreacion.split('T')[0] : new Date().toISOString().split('T')[0]}">
                                <button type="button" id="btnCalendarioEmisionPresupuesto" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
                            </div>
                        </div>
                    </div>

                    <!-- 🔥 v7.18.0: Campos nuevos del presupuesto -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                        <div class="md:col-span-2">
                            <label class="block font-medium mb-1">🔧 Trabajo</label>
                            <input type="text" id="trabajoPresupuesto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${datosEditar ? escapeHtml(datosEditar.trabajo || '') : ''}" placeholder="Ej: Revisión general + service completo" oninput="this.value = this.value.toUpperCase()">
                        </div>
                        <div>
                            <label class="block font-medium mb-1">📅 Válido por (días)</label>
                            <input type="number" id="validezDias" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${datosEditar ? (datosEditar.validezDias || 20) : 20}" min="1" max="365" oninput="window.actualizarVigenciaPresupuesto()">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block font-medium mb-1">📋 Condiciones</label>
                            <textarea id="condicionesPresupuesto" rows="2" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" placeholder="Ej: Precios sujetos a variación. El presupuesto se basa en inspección inicial...">${datosEditar ? escapeHtml(datosEditar.condiciones || '') : 'Precios sujetos a variación. El presupuesto se basa en inspección inicial; al desarmar pueden surgir tareas o repuestos adicionales que requerirán aprobación. No válido para reclamos judiciales.'}</textarea>
                        </div>
                        <div class="md:col-span-3">
                            <label class="block font-medium mb-1">📎 Presupuesto de referencia (opcional)</label>
                            <p class="text-xs text-gray-500 mb-1">Subí el PDF o imagen del presupuesto original del taller/proveedor. Queda guardado junto al registro.</p>
                            <div class="flex gap-2 mb-2">
                                <input type="text" id="presupuestoReferenciaNumero" placeholder="Nº de presupuesto del taller (ej: T2601-0263)" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" value="${datosEditar && datosEditar.presupuestoReferenciaNumero ? escapeHtml(datosEditar.presupuestoReferenciaNumero) : ''}">
                            </div>
                            <input type="file" id="presupuestoReferenciaInput" accept="image/*,.pdf" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" onchange="window.subirPresupuestoReferencia(this.files[0])">
                            <div id="presupuestoReferenciaInfo" class="mt-2 ${datosEditar && datosEditar.presupuestoReferenciaUrl ? '' : 'hidden'}">
                                <div class="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <span class="text-xs text-blue-600 flex-1" id="presupuestoReferenciaNombre">${datosEditar && datosEditar.presupuestoReferenciaNombre ? escapeHtml(datosEditar.presupuestoReferenciaNombre) : 'archivo'}</span>
                                    <button type="button" onclick="window.verPresupuestoReferencia()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">👁️ Ver</button>
                                    <button type="button" onclick="window.quitarPresupuestoReferencia()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">🗑️ Quitar</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="deudasContainer" class="${clienteIdSeleccionado ? '' : 'hidden'}">
                        <div class="border border-orange-300 dark:border-orange-700 rounded-lg p-3 bg-orange-50 dark:bg-orange-900/20">
                            <h4 class="font-bold text-orange-700 dark:text-orange-300">⚠️ Deudas pendientes del cliente</h4>
                            <div id="deudasLista"></div>
                            <div id="incluirDeudasCheckbox" class="mt-2">
                                <label class="flex items-center gap-2 text-sm">
                                    <input type="checkbox" id="incluirDeudasCheck" onchange="window.toggleIncluirDeudas()">
                                    Incluir deudas en el presupuesto como ítems adicionales
                                </label>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="block font-medium mb-1">📎 Presupuesto Padre (si es un adicional)</label>
                        <select id="presupuestoPadre" class="w-full p-2 border rounded-lg">
                            <option value="">Ninguno (presupuesto principal)</option>
                            ${presupuestosOptions}
                        </select>
                        <p class="text-xs text-gray-400 mt-1">Si este presupuesto es un adicional de otro, seleccioná el presupuesto principal.</p>
                    </div>

                    <div class="flex flex-wrap gap-4 p-3 bg-gray-100 rounded-lg">
                        <label><input type="radio" name="modoMarkup" id="modoGlobal" ${usarMarkupGlobal ? 'checked' : ''} onchange="window.toggleModoMarkup()"> Margen Global (${markupGlobal}%)</label>
                        <label><input type="radio" name="modoMarkup" id="modoIndividual" ${!usarMarkupGlobal ? 'checked' : ''} onchange="window.toggleModoMarkup()"> Margen Individual</label>
                        <label><input type="checkbox" id="tercerizadoCheckbox" ${esTercerizado ? 'checked' : ''} onchange="window.toggleTercerizado()"> Trabajo Tercerizado</label>
                        <label class="ml-auto"><input type="checkbox" id="incluirIVACheckbox" ${incluirIVA ? 'checked' : ''} onchange="window.toggleIVA()"> Incluir IVA 21%</label>
                    </div>

                    <div id="resumenTercerizado" class="p-3 bg-yellow-50 rounded-lg">
                        <div class="grid grid-cols-3 gap-4 text-center">
                            <div><div class="text-xs text-gray-500">Costo Proveedor (IVA inc.)</div><div class="font-bold text-red-600 text-lg" id="resumenCosto">$${formatNumber(costoTotal * 1.21)}</div></div>
                            <div><div class="text-xs text-gray-500">Venta al Cliente (IVA inc.)</div><div class="font-bold text-green-600 text-lg" id="resumenVenta">$${formatNumber(ventaTotal)}</div></div>
                            <div><div class="text-xs text-gray-500">Diferencia (Ganancia Bruta)</div><div class="font-bold text-blue-600 text-lg" id="resumenDiferencia">$${formatNumber(ventaTotal - costoTotal * 1.21)}</div></div>
                        </div>
                    </div>

                    <div id="controlGlobal" class="p-3 bg-purple-50 rounded-lg">
                        <label>Margen Global: <span id="porcentajeLabel">${markupGlobal}</span>%</label>
                        <input type="range" id="markupSlider" min="0" max="400" value="${markupGlobal}" class="w-full mt-1">
                    </div>

                    <div class="flex justify-between items-center">
                        <h3 class="font-bold">Ítems del Presupuesto</h3>
                        <div class="flex gap-2">
                            <button onclick="window.mostrarModalPegarTabla()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                                📋 Pegar tabla
                            </button>
                            <button onclick="window.mostrarModalCargarDesdeCompras()" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                                📦 Cargar desde compras
                            </button>
                        </div>
                    </div>

                    <div class="overflow-x-auto border rounded-lg">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="p-2">#</th>
                                    <th class="p-2 w-40">Acción</th>
                                    <th class="p-2">Producto/Servicio</th>
                                    <th class="p-2">Tipo</th>
                                    <th class="p-2 w-16">Cant.</th>
                                    <th class="p-2 w-36">Costo Proveedor</th>
                                    <th class="p-2 w-16 markup-col">Markup %</th>
                                    <th class="p-2 w-28">Precio Venta</th>
                                    <th class="p-2 w-32">Subtotal Venta</th>
                                    <th class="p-2 w-36">Trazabilidad</th>
                                    <th class="p-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody id="itemsBody"></tbody>
                        </table>
                    </div>

                    <div class="flex gap-3 flex-wrap">
                        <button id="agregarItem" class="bg-gray-200 px-3 py-1.5 rounded-lg text-sm">+ Agregar ítem</button>
                        <button id="agregarManoObra" class="bg-blue-200 px-3 py-1.5 rounded-lg text-sm">🛠️ Agregar mano de obra</button>
                        <button id="vistaPreviaBtn" class="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm ml-auto">👁️ Vista Previa Interna</button>
                        <button id="vistaPreviaClienteBtn" class="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm">📄 Vista Previa Cliente</button>
                        <button id="vistaPreviaCompletaBtn" class="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm">📋 Vista Previa Completa</button>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <h3 class="font-bold text-sm mb-2">Análisis de Incremento</h3>
                            <div id="vistaIncremento" class="text-sm max-h-40 overflow-auto"></div>
                            <div class="border-t pt-2 mt-2">
                                <div class="flex justify-between font-bold"><span>Total Original:</span><span id="totalOriginal" class="text-red-600">$0</span></div>
                                <div class="flex justify-between font-bold"><span>Total Venta:</span><span id="totalVenta" class="text-green-600">$0</span></div>
                                <div class="flex justify-between font-bold text-blue-600"><span>Diferencia Total:</span><span id="diferenciaTotal">$0</span></div>
                            </div>
                        </div>
                        <div class="border border-green-200 rounded-lg p-3 bg-green-50">
                            <h3 class="font-bold text-sm mb-2 text-green-700">Presupuesto al Cliente</h3>
                            <div id="vistaFinal" class="text-sm max-h-40 overflow-auto"></div>
                            <div class="border-t pt-2 mt-2">Subtotal (Neto): <span id="subtotalFinal" class="font-bold">$0</span></div>
                            <div id="ivaRow">IVA 21%: <span id="ivaMonto" class="text-orange-600">$0</span></div>
                            <div class="border-t pt-2 mt-1 font-bold text-lg">TOTAL: <span id="totalFinal" class="text-green-700">$0</span></div>
                        </div>
                        <div class="border border-blue-200 rounded-lg p-3 bg-blue-50">
                            <h3 class="font-bold text-sm mb-2 text-blue-700">GANANCIA NETA REAL <span id="modoBadge" class="text-xs font-normal"></span></h3>
                            <div id="detalleImpuestos" class="text-sm space-y-1"></div>
                            <div class="border-t pt-1 mt-1 flex justify-between bg-blue-100 p-1 rounded">
                                <span class="font-bold text-blue-700">💰 GANANCIA NETA FINAL:</span>
                                <span class="font-bold text-blue-700 text-lg" id="gnGananciaNeta">$0</span>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">Margen sobre diferencia: <span id="gnMargenSobreDiferencia">0%</span></div>
                        </div>
                    </div>

                    <div class="bg-gray-100 rounded-lg p-3">
                        <label class="block font-medium mb-1">Comentarios</label>
                        <textarea id="comentarios" rows="2" class="w-full p-2 border rounded-lg" placeholder="Sin otro particular, quedamos a su disposición...">${datosEditar ? escapeHtml(datosEditar.comentarios || '') : ''}</textarea>
                    </div>

                    <div class="flex gap-3">
                        <button id="guardarPresupuesto" class="flex-1 bg-green-600 text-white py-3 rounded-xl">${esEdicion ? '💾 Actualizar' : 'Guardar'}</button>
                        <button onclick="window.dispatchEvent(new Event('refreshView'))" class="flex-1 bg-gray-300 py-3 rounded-xl">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>`;

    window.getItemsPresupuestoRef = () => itemsPresupuesto;
    window.getDeudasPendientesRef = () => deudasPendientes;

    const ctx = {
        get items() { return itemsPresupuesto; },
        set items(v) { itemsPresupuesto = v; },
        get markup() { return markupGlobal; },
        set markup(v) { markupGlobal = v; },
        get usarGlobal() { return usarMarkupGlobal; },
        set usarGlobal(v) { usarMarkupGlobal = v; },
        get iva() { return incluirIVA; },
        set iva(v) { incluirIVA = v; },
        get tercerizado() { return esTercerizado; },
        set tercerizado(v) { esTercerizado = v; },
        get editandoId() { return presupuestoEditandoId; },
        get deudas() { return deudasPendientes; },
        set deudas(v) { deudasPendientes = v; },
        get impuestosOn() { return impuestosActivados; },
        set impuestosOn(v) { impuestosActivados = v; },
        get esEdicion() { return esEdicion; },
        get datosEditar() { return datosEditar; },
        get numeroPresupuesto() { return numeroPresupuesto; }
    };
    window._presupuestosCtx = ctx;

    inicializarEventosEditor(ctx);
    activarMayusculasAutomaticas(document.getElementById('root'));
    window.renderizarTodoEditor = () => renderizarTodo(ctx);
    renderizarTodo(ctx);
    window.toggleModoMarkup();
    if (clienteIdSeleccionado) {
        window.cargarDeudasCliente(clienteIdSeleccionado);
    }
}

// ==================== FUNCIÓN RENDERIZAR TODO ====================
export function renderizarTodo(ctx) {
    const db = getDB();
    renderizarTablaItems(ctx.items, ctx.usarGlobal, ctx.markup, db);
    renderizarComparativas(ctx.items, ctx.usarGlobal, ctx.markup);
    const costoTotal = getCostoTotalProveedor(ctx.items);
    const ventaTotal = calcularVentaTotalRedondeada(ctx.items, ctx.usarGlobal, ctx.markup);
    const gananciaBrutaConIVA = ventaTotal - costoTotal;
    const gn = calcularGananciaReal(ctx.items, ctx.usarGlobal, ctx.markup, ctx.impuestosOn);

    // 🔥 v7.20.9: mostrar costo real CON IVA y diferencia real
    const costoTotalConIVAResumen = costoTotal * 1.21;
    const diferenciaReal = ventaTotal - costoTotalConIVAResumen;
    document.getElementById('resumenCosto').innerHTML = `$${formatNumber(costoTotalConIVAResumen)}`;
    document.getElementById('resumenVenta').innerHTML = `$${formatNumber(ventaTotal)}`;
    document.getElementById('resumenDiferencia').innerHTML = `$${formatNumber(diferenciaReal)}`;

    const modoBadge = document.getElementById('modoBadge');
    if (modoBadge) {
        if (gn.modo === 'propio') modoBadge.innerHTML = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🏠 Propio</span>';
        else if (gn.modo === 'mixto') modoBadge.innerHTML = '<span class="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">🔀 Mixto</span>';
        else modoBadge.innerHTML = '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">🔗 Tercerizado</span>';
    }

    let impHTML = '';
    impHTML += `<div class="flex justify-between text-xs text-gray-600"><span>Costo Neto:</span><span>$${formatNumber(gn.costoNeto)}</span></div>`;
    impHTML += `<div class="flex justify-between text-xs text-gray-600"><span>IVA Compras:</span><span class="text-orange-600">$${formatNumber(gn.ivaCompras)}</span></div>`;
    impHTML += `<div class="flex justify-between text-xs text-gray-600 border-b pb-1"><span>Venta Neta:</span><span>$${formatNumber(gn.ventaNeta)}</span></div>`;
    impHTML += `<div class="flex justify-between text-xs text-gray-600"><span>IVA Ventas:</span><span class="text-orange-600">$${formatNumber(gn.ivaVentas)}</span></div>`;
    impHTML += `<div class="flex justify-between text-xs font-bold text-yellow-700 border-b pb-1"><span>IVA a Pagar:</span><span>$${formatNumber(gn.ivaAPagar)}</span></div>`;
    impHTML += `<div class="flex justify-between font-bold border-b pb-1"><span>Diferencia Neta:</span><span>$${formatNumber(gn.gananciaBruta)}</span></div>`;

    const todosLosImpuestos = getTodosLosImpuestos();
    let tildadosSet;
    if (ctx.impuestosOn === null || ctx.impuestosOn === undefined) {
        tildadosSet = new Set(todosLosImpuestos.filter(i => i.activo).map(i => i.id));
    } else {
        tildadosSet = new Set(ctx.impuestosOn);
    }

    todosLosImpuestos.forEach(imp => {
        const tildado = tildadosSet.has(imp.id);
        const checkId = `chk_imp_${imp.id}`;
        const badgeInactivo = !imp.activo ? ' <span class="text-[10px] text-gray-400">(inactivo)</span>' : '';

        // 🔥 v7.20.8: Impuesto al Cheque se muestra en 2 líneas separadas
        if (imp.id === 'impuestoCheque') {
            const detPago = gn.detalleImpuestos.find(d => d.id === 'impuestoChequePago');
            const detCobro = gn.detalleImpuestos.find(d => d.id === 'impuestoChequeCobro');
            const montoPago = detPago ? detPago.monto : 0;
            const montoCobro = detCobro ? detCobro.monto : 0;
            impHTML += `<div class="flex justify-between items-center ${!tildado ? 'opacity-50' : ''}">
                <label class="flex items-center gap-1 cursor-pointer text-xs" for="${checkId}">
                    <input type="checkbox" id="${checkId}" ${tildado ? 'checked' : ''}
                           onchange="window.toggleImpuestoPresupuesto('${imp.id}', this.checked)">
                    <span>${imp.nombre}${badgeInactivo}:</span>
                </label>
                <span class="${!tildado ? 'text-gray-400 line-through' : 'text-red-600'}">-$${formatNumber(tildado ? (montoPago + montoCobro) : 0)}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-500 pl-5 ${!tildado ? 'opacity-50' : ''}">
                <span>↳ Pago (0,6% de $${formatNumber(detPago?.base || 0)}):</span>
                <span>-$${formatNumber(tildado ? montoPago : 0)}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-500 pl-5 ${!tildado ? 'opacity-50' : ''}">
                <span>↳ Cobro (0,6% de $${formatNumber(detCobro?.base || 0)}):</span>
                <span>-$${formatNumber(tildado ? montoCobro : 0)}</span>
            </div>`;
            return;
        }

        // Resto de los impuestos (IIBB, TISSH, Ganancias, Reserva Legal)
        const detalle = gn.detalleImpuestos.find(d => d.id === imp.id);
        const monto = detalle ? detalle.monto : 0;
        const base = detalle ? detalle.base : 0;
        const pct = base > 0 ? (monto / base * 100).toFixed(2) : 0;
        impHTML += `<div class="flex justify-between items-center ${!tildado ? 'opacity-50' : ''}">
            <label class="flex items-center gap-1 cursor-pointer text-xs" for="${checkId}">
                <input type="checkbox" id="${checkId}" ${tildado ? 'checked' : ''}
                       onchange="window.toggleImpuestoPresupuesto('${imp.id}', this.checked)">
                <span>${imp.nombre}${badgeInactivo} (${pct}%):</span>
            </label>
            <span class="${!tildado ? 'text-gray-400 line-through' : 'text-red-600'}">-$${formatNumber(tildado ? monto : 0)}</span>
        </div>`;
    });

    impHTML += `<div class="flex justify-between border-t pt-1 mt-1"><span>Utilidad Antes Impuestos:</span><span>$${formatNumber(gn.utilidadAntes)}</span></div>`;
    document.getElementById('detalleImpuestos').innerHTML = impHTML;
    document.getElementById('gnGananciaNeta').innerHTML = `$${formatNumber(gn.gananciaNeta)}`;
    document.getElementById('gnMargenSobreDiferencia').innerHTML = `${gn.margenRealSobreDiferencia.toFixed(2)}%`;

    document.getElementById('subtotalFinal').innerHTML = `$${formatNumber(gn.ventaNeta)}`;
    document.getElementById('ivaMonto').innerHTML = `$${formatNumber(gn.ivaVentas)}`;
    document.getElementById('totalFinal').innerHTML = `$${formatNumber(ventaTotal)}`;
    // 🔥 v7.19.4: Total Original = costo CON IVA (para comparar con venta CON IVA)
    const costoTotalConIVA = costoTotal * 1.21;
    document.getElementById('totalOriginal').innerHTML = `$${formatNumber(costoTotalConIVA)}`;
    document.getElementById('totalVenta').innerHTML = `$${formatNumber(ventaTotal)}`;
    document.getElementById('diferenciaTotal').innerHTML = `$${formatNumber(ventaTotal - costoTotalConIVA)}`;
}

// ==================== EVENTOS DEL EDITOR ====================
function inicializarEventosEditor(ctx) {
    const db = getDB();

    // 🔥 Autocompletar cuando el usuario sale del campo patente
    window.autocompletarPatente = (patente) => {
        if (!patente || !patente.trim()) return;
        autocompletarDesdePatente(patente);
    };

    // 🔥 Toggle de impuesto por presupuesto
    window.toggleImpuestoPresupuesto = (impuestoId, tildado) => {
        const todos = getTodosLosImpuestos();
        let setActual;
        if (ctx.impuestosOn === null || ctx.impuestosOn === undefined) {
            setActual = new Set(todos.filter(i => i.activo).map(i => i.id));
        } else {
            setActual = new Set(ctx.impuestosOn);
        }
        if (tildado) {
            setActual.add(impuestoId);
        } else {
            setActual.delete(impuestoId);
        }
        ctx.impuestosOn = Array.from(setActual);
        renderizarTodo(ctx);
    };

    // ==================== MODAL PEGAR TABLA ====================
    window.mostrarModalPegarTabla = () => {
        const modal = crearModal(`
            <div class="space-y-3">
                <p class="text-sm text-gray-600 dark:text-gray-300">
                    Pegá la tabla copiada del chat. Se reconocen las columnas:
                    <strong>Descripción</strong>, <strong>Costo proveedor (con IVA)</strong>,
                    <strong>Precio venta con IVA</strong> y opcionalmente <strong>% Ganancia sobre costo</strong>.
                </p>
                <textarea id="textoTablaPegada" rows="10" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-xs" placeholder="Pegá acá la tabla..."></textarea>
                <p class="text-xs text-gray-400">Las filas con "TOTAL" se ignoran. Los ítems se agregan al final del presupuesto actual.</p>
            </div>
        `, '📋 Pegar tabla');

        modal.querySelector('#modalGuardar').textContent = '✅ Procesar y agregar';
        modal.querySelector('#modalGuardar').onclick = () => {
            const texto = modal.querySelector('#textoTablaPegada').value;
            window.procesarTablaPegada(texto, modal, ctx);
        };
        modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
    };

    window.procesarTablaPegada = (texto, modal, ctx) => {
        if (!texto || !texto.trim()) {
            mostrarNotificacion('Pegá una tabla primero', 'warning');
            return;
        }
        let resultado = { items: [], trabajo: '', totales: {} };
        try {
            resultado = parsearPresupuestoCompleto(texto);
        } catch(e) {
            mostrarNotificacion('Error al parsear: ' + e.message, 'error');
            console.error(e);
            return;
        }
        const { items, trabajo, totales } = resultado;
        // 🔥 v7.17.9: NO cerrar el modal si no detectó ítems (evita perder el presupuesto)
        if (items.length === 0) {
            mostrarNotificacion('No se detectaron ítems. Verificá que el texto tenga el formato correcto (Descripción / Cant. / Precio unit. / IVA / Importe).', 'warning');
            return;  // ← NO cierra el modal, el usuario puede corregir el texto
        }
        // Agregar ítems con recálculo de precio de venta
        const offset = ctx.items.length;
        items.forEach((it, i) => {
            it.nro = offset + i + 1;
            // 🔥 v7.18.2: forzar recálculo de precioVentaUnitario con el markup actual
            if (ctx.usarGlobal) {
                it.markup = ctx.markup;
            } else if (!it.markup) {
                it.markup = 0;
            }
            // Precio de venta = costo × (1 + markup/100) × (1 + IVA/100) si incluirIVA
            const ivaFactor = ctx.incluirIVA ? (1 + 21 / 100) : 1;
            // 🔥 v7.21.4: markup sobre costo CON IVA
            it.precioVentaUnitario = +(it.costo * (1 + ALICUOTA_IVA / 100) * (1 + it.markup / 100) * ivaFactor).toFixed(2);
            ctx.items.push(it);
        });
        // Precargar trabajo (si existe campo en el editor)
        if (trabajo) {
            const campoTrabajo = document.getElementById('trabajoPresupuesto');
            if (campoTrabajo) {
                campoTrabajo.value = trabajo;
                console.log('✅ Trabajo precargado:', trabajo);
            }
        }
        // Precargar totales (si existen campos en el editor)
        if (totales.total) {
            console.log('✅ Total detectado:', totales.total);
        }
        cerrarModal(modal);
        renderizarTodo(ctx);
        const msgs = [];
        if (items.length > 0) msgs.push(`${items.length} ítems`);
        if (trabajo) msgs.push('trabajo');
        if (totales.total) msgs.push('total');
        mostrarNotificacion(`✅ Se detectaron: ${msgs.join(', ')}`, 'success');
    };

    // ==================== FIN MODAL PEGAR TABLA ====================

    // Toggle modo markup
    window.toggleModoMarkup = () => {
        ctx.usarGlobal = document.getElementById('modoGlobal').checked;
        document.getElementById('controlGlobal').style.display = ctx.usarGlobal ? 'block' : 'none';
        document.querySelectorAll('.markup-col').forEach(col => col.style.display = ctx.usarGlobal ? 'none' : 'table-cell');
        if (ctx.usarGlobal) {
            ctx.items.forEach(item => item.markup = ctx.markup);
        }
        renderizarTodo(ctx);
    };

    // Toggle IVA
    window.toggleIVA = () => {
        ctx.iva = document.getElementById('incluirIVACheckbox').checked;
        renderizarTodo(ctx);
    };

    // Toggle tercerizado
    window.toggleTercerizado = () => {
        ctx.tercerizado = document.getElementById('tercerizadoCheckbox').checked;
        renderizarTodo(ctx);
    };

    // Actualizar markup global (slider)
    window.actualizarMarkupGlobal = (valor) => {
        ctx.markup = valor;
        document.getElementById('porcentajeLabel').innerText = ctx.markup;
        if (ctx.usarGlobal) {
            ctx.items.forEach(item => {
                item.markup = ctx.markup;
                let costo = 0;
                if (item.tipo === 'mano_obra') {
                    costo = (item.horas || 0) * (item.valorHora || 0);
                } else {
                    costo = item.costo || 0;
                }
                if (costo > 0) {
                    // 🔥 v7.21.4: markup sobre costo CON IVA
                    item.precioVentaUnitario = costo * (1 + ALICUOTA_IVA / 100) * (1 + ctx.markup / 100);
                }
            });
            renderizarTodo(ctx);
        }
    };

    // 🔥 Actualizar markup de un ítem → recalcula precio unitario
    window.actualizarMarkupItem = (idx, valor) => {
        const item = ctx.items[idx];
        if (!item) return;
        const markup = parseFloat(valor) || 0;
        item.markup = markup;
        let costo = 0;
        if (item.tipo === 'mano_obra') {
            costo = (item.horas || 0) * (item.valorHora || 0);
        } else {
            costo = item.costo || 0;
        }
        if (costo > 0) {
            // 🔥 v7.21.4: markup sobre costo CON IVA
            item.precioVentaUnitario = costo * (1 + ALICUOTA_IVA / 100) * (1 + markup / 100);
        }
        renderizarTodo(ctx);
    };

    // 🔥 Actualizar precio unitario de un ítem → recalcula markup
    window.actualizarPrecioUnitarioItem = (idx, valor) => {
        const item = ctx.items[idx];
        if (!item) return;
        const precioUnit = parseFloat(valor) || 0;
        item.precioVentaUnitario = precioUnit;
        let costo = 0;
        if (item.tipo === 'mano_obra') {
            costo = (item.horas || 0) * (item.valorHora || 0);
        } else {
            costo = item.costo || 0;
        }
        if (costo > 0) {
            item.markup = ((precioUnit / costo) - 1) * 100;
        }
        renderizarTodo(ctx);
    };

    // 🔥 Actualizar subtotal de venta → recalcula precio unitario y markup
    window.actualizarSubtotalVentaItem = (idx, valor) => {
        const item = ctx.items[idx];
        if (!item) return;
        const subtotal = redondearEntero(parseFloat(valor) || 0);
        const cant = item.cant || 1;
        const precioUnit = subtotal / cant;
        item.precioVentaUnitario = precioUnit;
        let costo = 0;
        if (item.tipo === 'mano_obra') {
            costo = (item.horas || 0) * (item.valorHora || 0);
        } else {
            costo = item.costo || 0;
        }
        if (costo > 0) {
            item.markup = ((precioUnit / costo) - 1) * 100;
        }
        renderizarTodo(ctx);
    };

    // Actualizar acción de un ítem
    window.actualizarAccionItem = (idx, valor) => {
        if (ctx.items[idx]) {
            ctx.items[idx].accion = valor;
        }
    };

    // Actualizar tipo de ítem
    window.actualizarTipoItem = (idx, tipo) => {
        const item = ctx.items[idx];
        if (!item) return;
        item.tipo = tipo;
        if (tipo === 'mano_obra') {
            item.horas = item.horas || 1;
            item.valorHora = item.valorHora || getDatosEmpresa().valorHoraSugerido || 5000;
            item.costo = 0;
        } else {
            item.horas = 0;
            item.valorHora = 0;
        }
        window.actualizarCostoManoObra(idx);
        renderizarTodo(ctx);
    };

    // Actualizar costo mano de obra
    window.actualizarCostoManoObra = (idx) => {
        const item = ctx.items[idx];
        if (item && item.tipo === 'mano_obra') {
            const horas = parseFloat(item.horas) || 0;
            const valorHora = parseFloat(item.valorHora) || 0;
            item.costo = horas * valorHora;
            const markup = ctx.usarGlobal ? ctx.markup : (item.markup || 0);
            item.markup = markup;
            if (item.costo > 0) {
                item.precioVentaUnitario = item.costo * (1 + markup / 100);
            }
            renderizarTodo(ctx);
        }
    };

    // Toggle es propio
    window.toggleEsPropio = (idx) => {
        const item = ctx.items[idx];
        if (!item) return;
        item.esPropio = !item.esPropio;
        if (item.esPropio) {
            if (item.costoAntesPropio === undefined) {
                item.costoAntesPropio = item.costo || 0;
            }
        } else {
            if (item.costoAntesPropio !== undefined) {
                item.costo = item.costoAntesPropio;
            }
        }
        renderizarTodo(ctx);
    };

    // Actualizar un campo de un ítem (genérico)
    window.actualizarItem = (idx, campo, valor) => {
        const item = ctx.items[idx];
        if (!item) return;
        if (campo === 'desc') item.desc = procesarTextoItem(valor);
        else if (campo === 'cant') {
            item.cant = parseFloat(valor) || 1;
        }
        else if (campo === 'costo') {
            item.costo = parseFloat(valor) || 0;
            const markup = ctx.usarGlobal ? ctx.markup : (item.markup || 0);
            item.markup = markup;
            if (item.costo > 0) {
                item.precioVentaUnitario = item.costo * (1 + markup / 100);
            }
        } else if (campo === 'horas') {
            item.horas = parseFloat(valor) || 0;
            window.actualizarCostoManoObra(idx);
            return;
        } else if (campo === 'valorHora') {
            item.valorHora = parseFloat(valor) || 0;
            window.actualizarCostoManoObra(idx);
            return;
        } else if (campo === 'precioVentaUnitario') {
            window.actualizarPrecioUnitarioItem(idx, valor);
            return;
        } else if (campo === 'accion') {
            item.accion = valor;
            return;
        }
        renderizarTodo(ctx);
    };

    // Eliminar un ítem
    window.eliminarItem = (idx) => {
        const item = ctx.items[idx];
        if (item && item.compraVinculadaId && item.compraItemIndex && item.cantidadAsignada) {
            window.liberarStock(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
        }
        ctx.items.splice(idx, 1);
        ctx.items.forEach((item, i) => item.nro = i + 1);
        renderizarTodo(ctx);
    };

    // Agregar ítem
    document.getElementById('agregarItem').onclick = () => {
        const nuevoItem = {
            nro: ctx.items.length + 1,
            desc: "NUEVO PRODUCTO",
            cant: 1,
            costo: 0,
            markup: ctx.markup,
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: 0,
            tipo: 'producto',
            horas: 0,
            valorHora: 0,
            precioVentaUnitario: 0,
            esPropio: false,
            accion: 'REP - Repuesto'
        };
        ctx.items.push(nuevoItem);
        renderizarTodo(ctx);
    };

    // Agregar mano de obra
    document.getElementById('agregarManoObra').onclick = () => {
        const valorHoraSugerido = getDatosEmpresa().valorHoraSugerido || 5000;
        const nuevoItem = {
            nro: ctx.items.length + 1,
            desc: "MANO DE OBRA",
            cant: 1,
            costo: 0,
            markup: ctx.markup,
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: 0,
            tipo: 'mano_obra',
            horas: 1,
            valorHora: valorHoraSugerido,
            precioVentaUnitario: 0,
            esPropio: false,
            accion: 'MO - Mano de Obra'
        };
        nuevoItem.costo = nuevoItem.horas * nuevoItem.valorHora;
        nuevoItem.precioVentaUnitario = nuevoItem.costo * (1 + ctx.markup / 100);
        ctx.items.push(nuevoItem);
        renderizarTodo(ctx);
    };

    // Slider de markup global
    const slider = document.getElementById('markupSlider');
    if (slider) slider.oninput = (e) => window.actualizarMarkupGlobal(parseInt(e.target.value));

    // Cargar deudas del cliente
    window.cargarDeudasCliente = (clienteId) => {
        const container = document.getElementById('deudasContainer');
        const lista = document.getElementById('deudasLista');
        if (!clienteId) {
            container.classList.add('hidden');
            ctx.deudas = [];
            return;
        }
        container.classList.remove('hidden');
        const deudas = obtenerDeudasMoraCliente(parseInt(clienteId));
        ctx.deudas = deudas;
        if (deudas.length === 0) {
            lista.innerHTML = '<p class="text-sm text-gray-500">No hay deudas pendientes</p>';
            document.getElementById('incluirDeudasCheck').checked = false;
            document.getElementById('incluirDeudasCheck').disabled = true;
            return;
        }
        document.getElementById('incluirDeudasCheck').disabled = false;
        lista.innerHTML = deudas.map(d => `
            <div class="flex justify-between items-center border-b py-1 text-sm">
                <span>${escapeHtml(d.descripcion)}</span>
                <span class="font-bold text-red-600">$${formatNumber(d.monto)}</span>
            </div>
        `).join('');
    };

    // Toggle incluir deudas
    window.toggleIncluirDeudas = () => {
        const checked = document.getElementById('incluirDeudasCheck').checked;
        if (checked) {
            ctx.deudas.forEach(deuda => {
                const nuevoItem = {
                    nro: ctx.items.length + 1,
                    desc: deuda.descripcion,
                    cant: 1,
                    costo: deuda.monto,
                    markup: 0,
                    compraVinculadaId: null,
                    compraItemIndex: null,
                    cantidadAsignada: 1,
                    esDeuda: true,
                    deudaId: deuda.id,
                    deudaTipo: deuda.tipo,
                    tipo: 'producto',
                    horas: 0,
                    valorHora: 0,
                    precioVentaUnitario: 0,
                    esPropio: false,
                    accion: ''
                };
                ctx.items.push(nuevoItem);
            });
            renderizarTodo(ctx);
            mostrarNotificacion(`✅ Se agregaron ${ctx.deudas.length} ítems por deudas pendientes`, 'success');
        } else {
            const nuevosItems = ctx.items.filter(item => !item.esDeuda);
            ctx.items.length = 0;
            nuevosItems.forEach(i => ctx.items.push(i));
            ctx.items.forEach((item, idx) => item.nro = idx + 1);
            renderizarTodo(ctx);
            mostrarNotificacion('Ítems de deuda eliminados', 'info');
        }
    };

    // Vista previa interna
    document.getElementById('vistaPreviaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        const clienteManual = document.getElementById('clienteManual').value.trim();
        if (!cliente && !clienteManual) { mostrarNotificacion('Seleccione un cliente o cargue uno manual', 'warning'); return; }
        const patente = document.getElementById('patente').value.trim();
        const centroCosto = document.getElementById('centroCosto').value.trim();
        const costoTotal = getCostoTotalProveedor(ctx.items);
        const ventaTotal = calcularVentaTotalRedondeada(ctx.items, ctx.usarGlobal, ctx.markup);
        const gn = calcularGananciaReal(ctx.items, ctx.usarGlobal, ctx.markup, ctx.impuestosOn);
        let itemsHTML = '';
        ctx.items.forEach(item => {
            let precioVenta = item.precioVentaUnitario;
            if (!precioVenta || precioVenta === 0) {
                const markup = ctx.usarGlobal ? ctx.markup : (item.markup || 0);
                let costo = 0;
                if (item.tipo === 'mano_obra') {
                    costo = (item.horas || 0) * (item.valorHora || 0);
                } else {
                    costo = item.costo || 0;
                }
                precioVenta = costo * (1 + markup/100);
            }
            const subtotal = redondearEntero(precioVenta * (item.cant || 1));
            const { neto: precioNeto } = separarIVA(precioVenta, ALICUOTA_IVA);
            itemsHTML += `<tr><td style="padding:8px;border:1px solid #ddd;">${item.nro}</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.desc)}</td><td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.cant}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${formatNumber(precioNeto)}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${formatNumber(subtotal)}</td></tr>`;
        });
        const empresa = getDatosEmpresa();
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(`
            <html><head><title>Presupuesto Interno ${ctx.numeroPresupuesto}</title>
            <style>
                body { font-family: Arial, sans-serif; padding:40px; max-width:900px; margin:0 auto; color:#333; }
                .header { text-align:center; border-bottom:3px solid #1e3a8a; padding-bottom:20px; margin-bottom:30px; }
                .header h1 { color:#1e3a8a; margin:0; font-size:28px; }
                .header p { margin:5px 0; color:#555; }
                .datos-cliente { background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:20px; }
                table { width:100%; border-collapse:collapse; margin:20px 0; }
                th { background:#1e3a8a; color:white; padding:10px; text-align:left; }
                td { padding:8px; border:1px solid #ddd; }
                .total-section { text-align:right; margin-top:20px; padding:20px; background:#f1f5f9; border-radius:8px; }
                .total-section h2 { color:#1e3a8a; }
                @media print { .no-print { display:none; } }
            </style></head>
            <body>
                <div class="header">
                    <h1>${empresa.nombre || 'Mi Empresa'}</h1>
                    <p>CUIT: ${empresa.cuit || '30-12345678-9'} | ${empresa.direccion || ''}</p>
                    <p>Tel: ${empresa.telefono || ''} | Email: ${empresa.email || ''}</p>
                    <p style="font-size:18px;font-weight:bold;margin-top:10px;">PRESUPUESTO INTERNO Nº ${ctx.numeroPresupuesto}</p>
                </div>
                <div class="datos-cliente">
                    <p><strong>Cliente:</strong> ${escapeHtml(clienteManual || (cliente ? cliente.nombre : ''))} ${cliente && cliente.cuit ? ' - CUIT: ' + escapeHtml(cliente.cuit) : ''}</p>
                    ${patente ? `<p><strong>Patente:</strong> ${escapeHtml(patente)}</p>` : ''}
                    ${centroCosto ? `<p><strong>Centro de Costo:</strong> ${escapeHtml(centroCosto)}</p>` : ''}
                    <p><strong>Vigencia:</strong> ${getVigenciaTexto()}</p>
                </div>
                <table><thead><tr><th>#</th><th>Producto/Servicio</th><th>Cant.</th><th>Precio Unit. (Neto)</th><th>Subtotal (IVA inc.)</th></tr></thead><tbody>${itemsHTML}</tbody></table>
                <div class="total-section">
                    <p><strong>Subtotal (sin IVA):</strong> $${formatNumber(gn.ventaNeta)}</p>
                    ${ctx.iva ? `<p><strong>IVA 21%:</strong> $${formatNumber(gn.ivaVentas)}</p>` : ''}
                    <h2>TOTAL: $${formatNumber(ventaTotal)}</h2>
                </div>
                <div class="no-print" style="margin-top:30px;text-align:center;"><button onclick="window.print()" style="padding:12px 30px;background:#1e3a8a;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">🖨️ Imprimir / Guardar PDF</button><button onclick="window.close()" style="padding:12px 30px;background:#6b7280;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-left:10px;">Cerrar</button></div>
            </body></html>
        `);
        ventana.document.close();
    };

    // Vista previa cliente
    document.getElementById('vistaPreviaClienteBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        const clienteManual = document.getElementById('clienteManual').value.trim();
        if (!cliente && !clienteManual) { mostrarNotificacion('Seleccione un cliente o cargue uno manual', 'warning'); return; }
        const snapshot = {
            numero: ctx.numeroPresupuesto,
            fechaCreacion: document.getElementById('fechaEmisionPresupuesto')?.value 
                ? new Date(document.getElementById('fechaEmisionPresupuesto').value + 'T12:00:00').toISOString()
                : (ctx.esEdicion ? ctx.datosEditar.fechaCreacion : new Date().toISOString()),
            clienteId: cliente ? cliente.id : null,
            cliente: clienteManual || (cliente ? cliente.nombre : ''),
            clienteManual: clienteManual,
            patente: document.getElementById('patente').value.trim(),
            vehiculoMarca: document.getElementById('vehiculoMarca').value.trim(),
            vehiculoKm: document.getElementById('vehiculoKm').value.trim(),
            vehiculoAnio: document.getElementById('vehiculoAnio').value.trim(),
            vehiculoColor: document.getElementById('vehiculoColor').value.trim(),
            vehiculoChasis: document.getElementById('vehiculoChasis').value.trim(),
            centroCosto: document.getElementById('centroCosto').value.trim(),
            interesado: document.getElementById('interesado').value.trim(),
            interesadoTel: document.getElementById('interesadoTel').value.trim(),
            companiaSeguros: document.getElementById('companiaSeguros').value.trim(),
            nroSiniestro: document.getElementById('nroSiniestro').value.trim(),
            comentarios: document.getElementById('comentarios').value,
            items: ctx.items.map(i => ({ ...i })),
            usarMarkupGlobal: ctx.usarGlobal,
            markupGlobal: parseInt(document.getElementById('markupSlider')?.value) || ctx.markup,
            incluirIVA: ctx.iva
        };
        const html = generarHTMLPresupuestoCliente(snapshot);
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(html);
        ventana.document.close();
    };

    // Vista previa completa
    document.getElementById('vistaPreviaCompletaBtn').onclick = () => {
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        const clienteManual = document.getElementById('clienteManual').value.trim();
        if (!cliente && !clienteManual) { mostrarNotificacion('Seleccione un cliente o cargue uno manual', 'warning'); return; }
        const snapshot = {
            numero: ctx.numeroPresupuesto,
            fechaCreacion: document.getElementById('fechaEmisionPresupuesto')?.value 
                ? new Date(document.getElementById('fechaEmisionPresupuesto').value + 'T12:00:00').toISOString()
                : (ctx.esEdicion ? ctx.datosEditar.fechaCreacion : new Date().toISOString()),
            clienteId: cliente ? cliente.id : null,
            cliente: clienteManual || (cliente ? cliente.nombre : ''),
            clienteManual: clienteManual,
            cuitCliente: cliente ? cliente.cuit : '',
            patente: document.getElementById('patente').value.trim(),
            vehiculoMarca: document.getElementById('vehiculoMarca').value.trim(),
            vehiculoKm: document.getElementById('vehiculoKm').value.trim(),
            vehiculoAnio: document.getElementById('vehiculoAnio').value.trim(),
            vehiculoColor: document.getElementById('vehiculoColor').value.trim(),
            vehiculoChasis: document.getElementById('vehiculoChasis').value.trim(),
            centroCosto: document.getElementById('centroCosto').value.trim(),
            interesado: document.getElementById('interesado').value.trim(),
            interesadoTel: document.getElementById('interesadoTel').value.trim(),
            companiaSeguros: document.getElementById('companiaSeguros').value.trim() || 'NO APLICA',
            nroSiniestro: document.getElementById('nroSiniestro').value.trim(),
            comentarios: document.getElementById('comentarios').value,
            items: ctx.items.map(i => ({ ...i })),
            usarMarkupGlobal: ctx.usarGlobal,
            markupGlobal: ctx.markup,
            incluirIVA: ctx.iva,
            trabajo: document.getElementById('trabajoPresupuesto')?.value.trim() || '',
            presupuestoReferenciaNumero: document.getElementById('presupuestoReferenciaNumero')?.value.trim() || '',
            validezDias: parseInt(document.getElementById('validezDias')?.value) || 20,
            condiciones: document.getElementById('condicionesPresupuesto')?.value.trim() || ''
        };
        const html = generarHTMLPresupuestoCompleto(snapshot);
        const ventana = window.open('', '_blank', 'width=900,height=700');
        ventana.document.write(html);
        ventana.document.close();
    };

    // Guardar presupuesto
    document.getElementById('guardarPresupuesto').onclick = () => {
        // 🔥 v7.22.8: sincronizar fecha del input de texto al hidden ANTES de guardar
        const fechaTextoGuardar = document.getElementById('fechaEmisionPresupuestoText')?.value;
        const fechaHiddenGuardar = document.getElementById('fechaEmisionPresupuesto');
        if (fechaTextoGuardar && fechaHiddenGuardar) {
            const partes = fechaTextoGuardar.split('/');
            if (partes.length === 3 && partes[0] && partes[1] && partes[2]) {
                fechaHiddenGuardar.value = `${partes[2]}-${partes[1]}-${partes[0]}`;
            }
        }
        
        const clienteId = parseInt(document.getElementById('clienteSelect').value);
        const cliente = db.clientes.find(c => c.id === clienteId);
        const clienteManual = document.getElementById('clienteManual').value.trim();
        if (!cliente && !clienteManual) { mostrarNotificacion('Seleccione un cliente o cargue uno manual', 'error'); return; }
        const padreSelect = document.getElementById('presupuestoPadre');
        const presupuestoPadreId = padreSelect.value ? parseInt(padreSelect.value) : null;
        const deudasIncluidas = ctx.items.filter(item => item.esDeuda).map(item => item.deudaId);
        const costoTotal = getCostoTotalProveedor(ctx.items);
        const ventaTotal = calcularVentaTotalRedondeada(ctx.items, ctx.usarGlobal, ctx.markup);
        const gn = calcularGananciaReal(ctx.items, ctx.usarGlobal, ctx.markup, ctx.impuestosOn);
        const nombreClienteFinal = clienteManual || (cliente ? cliente.nombre : '');
        const nuevoPresupuesto = {
            id: ctx.esEdicion ? ctx.datosEditar.id : generarId(),
            numero: ctx.numeroPresupuesto,
            clienteId: cliente ? cliente.id : null,
            cliente: (nombreClienteFinal || '').toUpperCase(),
            clienteManual: clienteManual ? clienteManual.toUpperCase() : null,
            patente: (document.getElementById('patente').value || '').toUpperCase(),
            vehiculoMarca: (document.getElementById('vehiculoMarca').value || '').toUpperCase(),
            vehiculoKm: document.getElementById('vehiculoKm').value,
            vehiculoAnio: document.getElementById('vehiculoAnio').value,
            vehiculoColor: (document.getElementById('vehiculoColor').value || '').toUpperCase(),
            vehiculoChasis: (document.getElementById('vehiculoChasis').value || '').toUpperCase(),
            centroCosto: (document.getElementById('centroCosto').value || '').toUpperCase(),
            interesado: (document.getElementById('interesado').value || '').toUpperCase(),
            interesadoTel: document.getElementById('interesadoTel').value,
            companiaSeguros: (document.getElementById('companiaSeguros').value || '').toUpperCase(),
            nroSiniestro: document.getElementById('nroSiniestro').value,
            // 🔥 v7.22.11: fechaCreacion usando el hidden sincronizado
            fechaCreacion: document.getElementById('fechaEmisionPresupuesto')?.value 
                ? new Date(document.getElementById('fechaEmisionPresupuesto').value + 'T12:00:00').toISOString()
                : (ctx.esEdicion ? ctx.datosEditar.fechaCreacion : new Date().toISOString()),
            vigencia: document.getElementById('vigencia').value,
            // 🔥 v7.18.6: campos nuevos
            trabajo: (document.getElementById('trabajoPresupuesto')?.value || '').toUpperCase(),
            validezDias: parseInt(document.getElementById('validezDias')?.value) || 20,
            condiciones: document.getElementById('condicionesPresupuesto')?.value || '',
            // 🔥 v7.21.7: presupuesto de referencia
            presupuestoReferenciaUrl: window._presupuestoReferenciaUrl !== undefined ? window._presupuestoReferenciaUrl : (ctx.esEdicion ? ctx.datosEditar.presupuestoReferenciaUrl || null : null),
            presupuestoReferenciaNombre: window._presupuestoReferenciaNombre !== undefined ? window._presupuestoReferenciaNombre : (ctx.esEdicion ? ctx.datosEditar.presupuestoReferenciaNombre || null : null),
            comentarios: document.getElementById('comentarios').value,
            items: ctx.items.map(i => ({ ...i })),
            usarMarkupGlobal: ctx.usarGlobal,
            markupGlobal: ctx.markup,
            incluirIVA: ctx.iva,
            esTercerizado: ctx.tercerizado,
            costoProveedor: gn.costoNeto,
            ventaCliente: gn.ventaNeta,
            gananciaBruta: gn.gananciaBruta,
            gananciaNetaReal: gn.gananciaNeta,
            costoProveedorConIVA: costoTotal,
            ventaClienteConIVA: ventaTotal,
            ivaCompras: gn.ivaCompras,
            ivaVentas: gn.ivaVentas,
            ivaAPagar: gn.ivaAPagar,
            iva: ctx.iva ? gn.ivaVentas : 0,
            total: ctx.iva ? ventaTotal : gn.ventaNeta,
            // 🔥 v7.22.12: usar el hidden sincronizado (no la fecha original)
            fechaCreacion: document.getElementById('fechaEmisionPresupuesto')?.value 
                ? new Date(document.getElementById('fechaEmisionPresupuesto').value + 'T12:00:00').toISOString()
                : (ctx.esEdicion ? ctx.datosEditar.fechaCreacion : new Date().toISOString()),
            presupuestoPadreId: presupuestoPadreId,
            estado: ctx.esEdicion ? (ctx.datosEditar.estado || 'pendiente') : 'pendiente',
            ventaGeneradaId: ctx.esEdicion ? ctx.datosEditar.ventaGeneradaId || null : null,
            esMora: false,
            ventaOrigenId: null,
            deudasIncluidas: deudasIncluidas.length > 0 ? deudasIncluidas : null,
            impuestosActivados: Array.isArray(ctx.impuestosOn) ? [...ctx.impuestosOn] : null,
            modo: gn.modo
        };
        if (ctx.esEdicion) {
            const index = db.presupuestos.findIndex(p => p.id === ctx.datosEditar.id);
            if (index !== -1) db.presupuestos[index] = nuevoPresupuesto;
        } else {
            db.presupuestos.push(nuevoPresupuesto);
        }

        // 🔥 Crear o actualizar la unidad si tiene patente
        if (nuevoPresupuesto.patente && nuevoPresupuesto.patente.trim()) {
            crearOActualizarUnidad({
                patente: nuevoPresupuesto.patente,
                marcaModelo: nuevoPresupuesto.vehiculoMarca,
                anio: nuevoPresupuesto.vehiculoAnio,
                color: nuevoPresupuesto.vehiculoColor,
                motor: nuevoPresupuesto.vehiculoChasis,
                chasis: '',
                kmActual: nuevoPresupuesto.vehiculoKm,
                clienteId: nuevoPresupuesto.clienteId,
                clienteNombre: nuevoPresupuesto.cliente
            });
        }

        guardarDB();
        mostrarNotificacion(`✅ Presupuesto ${ctx.numeroPresupuesto} ${ctx.esEdicion ? 'actualizado' : 'guardado'}`, 'success');
        window.renderizarTodoEditor = null;
        window.dispatchEvent(new Event('refreshView'));
    };
}

// ==================== 🔥 v7.22.1: FUNCIONES DE PRESUPUESTO DE REFERENCIA ====================

// Subir archivo a Storage
window.subirPresupuestoReferencia = async (file) => {
    if (!file) return;
    try {
        const { subirArchivo, comprimirImagen, getEmpresaActual } = await import('../firebase.js');
        const fileComprimido = await comprimirImagen(file);
        const ext = (fileComprimido.name.split('.').pop() || 'bin').toLowerCase();
        const empresaId = getEmpresaActual() || 'empresa_principal';
        const timestamp = Date.now();
        const ruta = `${empresaId}/presupuestos/referencia_${timestamp}.${ext}`;
        const url = await subirArchivo(ruta, fileComprimido);
        window._presupuestoReferenciaUrl = url;
        window._presupuestoReferenciaNombre = fileComprimido.name;
        const info = document.getElementById('presupuestoReferenciaInfo');
        if (info) {
            info.classList.remove('hidden');
            const nombreSpan = document.getElementById('presupuestoReferenciaNombre');
            if (nombreSpan) nombreSpan.textContent = fileComprimido.name;
        }
        mostrarNotificacion('✅ Presupuesto de referencia subido', 'success');
    } catch (e) {
        console.error('Error subiendo presupuesto de referencia:', e);
        mostrarNotificacion('Error subiendo archivo: ' + e.message, 'error');
    }
};

// Ver presupuesto de referencia en modal
window.verPresupuestoReferencia = () => {
    const url = window._presupuestoReferenciaUrl || (window._datosEditarActuales && window._datosEditarActuales.presupuestoReferenciaUrl);
    if (!url) {
        mostrarNotificacion('No hay archivo para ver', 'warning');
        return;
    }
    const mostrarModal = (urlFinal) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <h2 class="text-xl font-bold mb-3 text-center">👁️ Presupuesto de referencia</h2>
                <div class="bg-gray-100 dark:bg-gray-900 rounded-lg p-2 text-center" style="min-height:60vh;">
                    ${urlFinal.includes('.pdf') || urlFinal.startsWith('data:application/pdf')
                        ? `<iframe src="${urlFinal}" style="width:100%;height:70vh;border:none;"></iframe>`
                        : `<img src="${urlFinal}" style="max-width:100%;max-height:70vh;object-fit:contain;">`
                    }
                </div>
                <button onclick="this.closest('.modal').remove();" class="mt-3 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">Cerrar</button>
            </div>
        `;
        document.body.appendChild(modal);
    };
    if (url.startsWith('data:')) {
        try {
            const partes = url.split(',');
            const mime = partes[0].match(/:(.*?);/)[1];
            const binario = atob(partes[1]);
            const bytes = new Uint8Array(binario.length);
            for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            mostrarModal(blobUrl);
        } catch (e) {
            console.error('Error procesando dataURL:', e);
            mostrarModal(url);
        }
    } else {
        mostrarModal(url);
    }
};

// Quitar presupuesto de referencia
window.quitarPresupuestoReferencia = async () => {
    const confirmado = await confirmarAccion({
        titulo: '🗑️ Quitar presupuesto de referencia',
        mensaje: '¿Estás seguro de quitar el presupuesto de referencia adjunto?',
        textoConfirmar: '🗑️ Sí, quitar',
        icono: '📎'
    });
    if (!confirmado) return;
    // 🔥 v7.24.10: Limpiar TODOS los campos relacionados
    window._presupuestoReferenciaUrl = null;
    window._presupuestoReferenciaNombre = null;
    window._presupuestoReferenciaNumero = null;
    const info = document.getElementById('presupuestoReferenciaInfo');
    if (info) info.classList.add('hidden');
    const input = document.getElementById('presupuestoReferenciaInput');
    if (input) input.value = '';
    const inputNumero = document.getElementById('presupuestoReferenciaNumero');
    if (inputNumero) inputNumero.value = '';
    mostrarNotificacion('🗑️ Presupuesto de referencia quitado', 'info');
};

// ==================== 🔥 v7.22.7: EVENTO DEL CALENDARIO DE FECHA DE EMISIÓN ====================
// Este bloque se ejecuta después de que el editor se renderiza
document.addEventListener('DOMContentLoaded', () => {
    const btnCalendarioEmisionPresupuesto = document.getElementById('btnCalendarioEmisionPresupuesto');
    const fechaEmisionPresupuestoText = document.getElementById('fechaEmisionPresupuestoText');
    const fechaEmisionPresupuestoHidden = document.getElementById('fechaEmisionPresupuesto');
    
    if (btnCalendarioEmisionPresupuesto && fechaEmisionPresupuestoHidden) {
        btnCalendarioEmisionPresupuesto.addEventListener('click', () => {
            fechaEmisionPresupuestoHidden.showPicker();
        });
        fechaEmisionPresupuestoHidden.addEventListener('change', () => {
            if (fechaEmisionPresupuestoHidden.value) {
                const [a, m, d] = fechaEmisionPresupuestoHidden.value.split('-');
                if (fechaEmisionPresupuestoText) fechaEmisionPresupuestoText.value = `${d}/${m}/${a}`;
            }
        });
    }
});

// También lo ejecutamos cada vez que se abre el editor (por si el DOMContentLoaded ya pasó)
window.initCalendarioEmisionPresupuesto = () => {
    const btnCalendarioEmisionPresupuesto = document.getElementById('btnCalendarioEmisionPresupuesto');
    const fechaEmisionPresupuestoText = document.getElementById('fechaEmisionPresupuestoText');
    const fechaEmisionPresupuestoHidden = document.getElementById('fechaEmisionPresupuesto');
    
    if (btnCalendarioEmisionPresupuesto && fechaEmisionPresupuestoHidden) {
        btnCalendarioEmisionPresupuesto.addEventListener('click', () => {
            fechaEmisionPresupuestoHidden.showPicker();
        });
        fechaEmisionPresupuestoHidden.addEventListener('change', () => {
            if (fechaEmisionPresupuestoHidden.value) {
                const [a, m, d] = fechaEmisionPresupuestoHidden.value.split('-');
                if (fechaEmisionPresupuestoText) fechaEmisionPresupuestoText.value = `${d}/${m}/${a}`;
            }
        });
    }
};

// ==================== 🔥 v7.22.9: SINCRONIZAR FECHA DE EMISIÓN ====================
window.sincronizarFechaEmisionPresupuesto = (fechaTexto) => {
    if (!fechaTexto) return;
    const partes = fechaTexto.split('/');
    if (partes.length === 3 && partes[0] && partes[1] && partes[2]) {
        const hidden = document.getElementById('fechaEmisionPresupuesto');
        if (hidden) {
            hidden.value = `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
    }
};