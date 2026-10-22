// ==================== modules/presupuestos/items.js ====================
// ITEMS - Render de la tabla de ítems y comparativas del editor
// ERP Contable Argentina - v7.15.4
// Cambio v7.15.4: columna "Subtotal Venta" muestra Neto arriba, IVA en medio,
//                 e input editable (con IVA) abajo. Cero cambios de lógica.

import { getDB } from '../db.js';
import { formatNumber, escapeHtml } from '../utils.js';
import { ALICUOTA_IVA, OPCIONES_ACCION } from './estado.js';
import { separarIVA } from './helpers.js';

// Helper: calcula el precio unitario a partir del costo y el markup
function calcularPrecioUnitario(costo, markup) {
    return costo * (1 + (markup || 0) / 100);
}

// Helper: calcula el markup a partir del precio unitario y el costo
function calcularMarkup(precioUnitario, costo) {
    if (!costo || costo <= 0) return null;
    return ((precioUnitario / costo) - 1) * 100;
}

// 🔥 Helper: redondeo al entero (0.5 → arriba, 0.4 → abajo)
export function redondearEntero(n) {
    return Math.round(n);
}

// 🔥 Helper: devuelve el subtotal redondeado de un ítem
export function calcularSubtotalRedondeado(item, usarMarkupGlobal, markupGlobal) {
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
        precioVenta = calcularPrecioUnitario(costo, markup);
    }
    return redondearEntero(precioVenta * cant);
}

// ==================== RENDER TABLA DE ITEMS ====================
export function renderizarTablaItems(items, usarMarkupGlobal, markupGlobal, db) {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="p-4 text-center text-gray-400 italic">🔍 No hay ítems cargados.</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map((item, idx) => {
        const esManoObra = item.tipo === 'mano_obra';
        let costo = 0;
        if (esManoObra) {
            costo = (item.horas || 0) * (item.valorHora || 0);
        } else {
            costo = item.costo || 0;
        }
        const cant = item.cant || 1;

        // 🔥 Lógica: el precio unitario es la fuente de verdad
        let precioVenta = item.precioVentaUnitario;
        let markupMostrar;
        if (precioVenta !== undefined && precioVenta !== null && precioVenta !== 0) {
            markupMostrar = calcularMarkup(precioVenta, costo);
        } else {
            markupMostrar = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            precioVenta = calcularPrecioUnitario(costo, markupMostrar);
            item.precioVentaUnitario = precioVenta;
        }
        if (precioVenta === null || precioVenta === undefined) precioVenta = 0;
        if (markupMostrar === null || markupMostrar === undefined) markupMostrar = 0;

        // 🔥 Subtotal redondeado al entero
        const subtotalVenta = redondearEntero(precioVenta * cant);
        const costoParaIVA = item.esPropio ? 0 : costo;
        const costoItemConIVA = costoParaIVA * cant;
        const { neto: costoItemNeto, iva: ivaItemCompras } = separarIVA(costoItemConIVA, ALICUOTA_IVA);

        // 🔥 Opción C: IVA redondeado, Neto = Subtotal - IVA
        const ivaItemVentas = redondearEntero(subtotalVenta - (subtotalVenta / (1 + ALICUOTA_IVA / 100)));
        const ventaItemNeta = subtotalVenta - ivaItemVentas;

        let trazabilidadHTML = '';
        if (item.compraVinculadaId && item.compraItemIndex !== null) {
            const compra = db.compras.find(c => String(c.id) === String(item.compraVinculadaId));
            trazabilidadHTML = `<span class="text-xs text-green-600 block">🔗 ${compra ? escapeHtml(compra.proveedorNombre) : 'Compra'}<br>Asign: ${item.cantidadAsignada || 0}</span>`;
        } else if (item.esDeuda) {
            trazabilidadHTML = `<span class="text-xs text-orange-500 block">💰 Deuda incluida</span>`;
        } else if (esManoObra) {
            trazabilidadHTML = `<span class="text-xs text-blue-500 block">🛠️ Mano de obra<br>${item.horas}h × $${formatNumber(item.valorHora)}</span>`;
        } else {
            trazabilidadHTML = `<button onclick="window.vincularCompra(${idx})" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">🔗 Vincular compra</button>`;
        }

        let accionOptions = OPCIONES_ACCION.map(op => 
            `<option value="${escapeHtml(op.value)}" ${item.accion === op.value ? 'selected' : ''}>${escapeHtml(op.label)}</option>`
        ).join('');

        let tipoOptions = `
            <select onchange="window.actualizarTipoItem(${idx}, this.value)" class="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600">
                <option value="producto" ${item.tipo === 'producto' ? 'selected' : ''}>Producto</option>
                <option value="servicio" ${item.tipo === 'servicio' ? 'selected' : ''}>Servicio</option>
                <option value="mano_obra" ${item.tipo === 'mano_obra' ? 'selected' : ''}>Mano de obra</option>
            </select>
        `;

        let costoHTML = '';
        if (item.esPropio) {
            costoHTML = `<div class="flex flex-col gap-1"><input type="number" value="0" disabled class="w-full p-1 border rounded text-sm text-right bg-gray-100 text-gray-400 dark:bg-gray-800 dark:border-gray-700"><span class="text-xs text-green-600 font-bold">🏠 Costo propio</span></div>`;
        } else if (esManoObra) {
            costoHTML = `<div class="flex flex-col gap-1"><div class="flex gap-1"><input type="number" value="${item.horas || 0}" step="0.5" onfocus="this.select()" onchange="window.actualizarItem(${idx}, 'horas', this.value)" class="w-12 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600" placeholder="h"><span class="text-xs self-center">×</span><input type="number" value="${item.valorHora || 0}" step="100" onfocus="this.select()" onchange="window.actualizarItem(${idx}, 'valorHora', this.value)" class="w-20 p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600" placeholder="$"></div><span class="text-xs text-gray-500">Costo: $${formatNumber(costoItemConIVA)}</span></div>`;
        } else {
            costoHTML = `<input type="number" value="${item.costo || 0}" step="100" onfocus="this.select()" onchange="window.actualizarItem(${idx}, 'costo', this.value)" class="w-full p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600"><span class="text-xs text-gray-500">Neto: $${formatNumber(costoItemNeto)} | IVA: $${formatNumber(ivaItemCompras)}</span>`;
        }

        const checkPropio = `<label class="flex items-center gap-1 text-xs mt-1 cursor-pointer"><input type="checkbox" ${item.esPropio ? 'checked' : ''} onchange="window.toggleEsPropio(${idx})"><span class="${item.esPropio ? 'text-green-600 font-bold' : 'text-gray-500'}">🏠 Propio</span></label>`;

        let markupHTML = '';
        if (usarMarkupGlobal) {
            markupHTML = `<span class="text-xs text-gray-400">Global</span>`;
        } else {
            markupHTML = `<input type="number" value="${(item.markup || 0).toFixed(2)}" step="0.01" onfocus="this.select()" onchange="window.actualizarMarkupItem(${idx}, this.value)" class="w-16 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600">%`;
        }

        // 🔥 Precio Venta editable (con 2 decimales)
        const precioVentaHTML = `<input type="number" value="${precioVenta.toFixed(2)}" step="1" onfocus="this.select()" onchange="window.actualizarPrecioUnitarioItem(${idx}, this.value)" class="w-full p-1 border rounded text-sm text-right dark:bg-gray-700 dark:border-gray-600">`;

        // 🔥 v7.15.4: Subtotal Venta — Neto arriba, IVA en medio, input editable (con IVA) abajo
        const subtotalHTML = `
            <div class="text-xs text-gray-700 font-semibold dark:text-gray-300">Neto: $${formatNumber(ventaItemNeta)}</div>
            <div class="text-xs text-orange-600">IVA 21%: $${formatNumber(ivaItemVentas)}</div>
            <input type="text" inputmode="numeric" pattern="[0-9]*" value="${subtotalVenta}" onfocus="this.select()" onchange="window.actualizarSubtotalVentaItem(${idx}, this.value)" class="w-full p-1 border rounded text-sm text-right mt-1 dark:bg-gray-700 dark:border-gray-600">
        `;

        return `
            <tr class="border-b ${item.esPropio ? 'bg-green-50 dark:bg-green-900/10' : ''}">
                <td class="p-2 text-center">${item.nro}</td>
                <td class="p-2"><select onchange="window.actualizarAccionItem(${idx}, this.value)" class="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600">${accionOptions}</select></td>
                <td class="p-2"><input value="${escapeHtml(item.desc)}" onfocus="this.select()" onchange="window.actualizarItem(${idx}, 'desc', this.value)" class="w-full p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600"></td>
                <td class="p-2">${tipoOptions}</td>
                <td class="p-2"><input type="number" value="${item.cant || 1}" step="1" onfocus="this.select()" onchange="window.actualizarItem(${idx}, 'cant', this.value)" class="w-16 p-1 border rounded text-sm text-center dark:bg-gray-700 dark:border-gray-600"></td>
                <td class="p-2">${costoHTML}${checkPropio}</td>
                <td class="p-2 text-center">${markupHTML}</td>
                <td class="p-2">${precioVentaHTML}</td>
                <td class="p-2">${subtotalHTML}</td>
                <td class="p-2 text-center">${trazabilidadHTML}</td>
                <td class="p-2 text-center"><button onclick="window.eliminarItem(${idx})" class="text-red-500 text-xl">🗑️</button></td>
            </tr>
        `;
    }).join('');
}

// ==================== RENDER COMPARATIVAS ====================
export function renderizarComparativas(items, usarMarkupGlobal, markupGlobal) {
    if (items.length === 0) {
        document.getElementById('vistaIncremento').innerHTML = '<p class="text-gray-400 text-center py-2">Sin ítems</p>';
        document.getElementById('vistaFinal').innerHTML = '<p class="text-gray-400 text-center py-2">Sin ítems</p>';
        return;
    }
    let incHTML = '', finalHTML = '';
    items.forEach(item => {
        let costo = 0;
        if (item.tipo === 'mano_obra') {
            costo = (item.horas || 0) * (item.valorHora || 0);
        } else {
            costo = item.costo || 0;
        }
        const cant = item.cant || 1;
        let precioVenta = item.precioVentaUnitario;
        if (precioVenta === undefined || precioVenta === null || precioVenta === 0) {
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            precioVenta = calcularPrecioUnitario(costo, markup);
        }
        const costoParaMostrar = item.esPropio ? 0 : costo;
        const costoItem = redondearEntero(costoParaMostrar * cant);
        // 🔥 Subtotal redondeado
        const ventaItem = redondearEntero(precioVenta * cant);
        // 🔥 Opción C: IVA redondeado, Neto = Subtotal - IVA
        const ivaItemVentas = redondearEntero(ventaItem - (ventaItem / (1 + ALICUOTA_IVA / 100)));
        const ventaItemNeta = ventaItem - ivaItemVentas;
        const etiquetaPropio = item.esPropio ? ' 🏠' : '';
        incHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${escapeHtml(item.desc)}${etiquetaPropio} x${item.cant}</span><span>$${formatNumber(costoItem)} → $${formatNumber(ventaItem)} <span class="text-green-600">(+$${formatNumber(ventaItem - costoItem)})</span></span></div>`;
        finalHTML += `<div class="flex justify-between py-1"><span>${item.nro}. ${escapeHtml(item.desc)}${etiquetaPropio} x${item.cant}</span><span>$${formatNumber(ventaItemNeta)} <span class="text-xs text-orange-600">+ IVA $${formatNumber(ivaItemVentas)}</span></span></div>`;
    });
    document.getElementById('vistaIncremento').innerHTML = incHTML || '<p class="text-gray-400">Sin ítems</p>';
    document.getElementById('vistaFinal').innerHTML = finalHTML || '<p class="text-gray-400">Sin ítems</p>';
}
