// ==================== modules/presupuestos/helpers.js ====================
// HELPERS - Funciones puras y utilidades del módulo de presupuestos
// ERP Contable Argentina - v7.0.0

import { getDB, getImpuestosActivos, getTodosLosImpuestos } from '../db.js';
import { formatNumber, escapeHtml, formatDate, generarId } from '../utils.js';
import { ALICUOTA_IVA, NUMERO_INICIAL_PRESUPUESTO } from './estado.js';

// ==================== MODALES REUTILIZABLES ====================
export function crearModal(contenido, titulo = '') {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg">
            ${titulo ? `<h2 class="text-xl font-bold mb-4 text-center">${titulo}</h2>` : ''}
            ${contenido}
            <div class="flex gap-3 mt-5">
                <button id="modalGuardar" class="flex-1 bg-green-600 text-white py-2 rounded-xl">✅ Guardar</button>
                <button id="modalCancelar" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

export function cerrarModal(modal) {
    if (modal) modal.remove();
}

// ==================== UTILIDADES ====================
export function getProximoNumeroPresupuesto() {
    const db = getDB();
    const presupuestos = db.presupuestos || [];
    if (presupuestos.length === 0) return NUMERO_INICIAL_PRESUPUESTO;
    const numeros = presupuestos.map(p => {
        const num = parseInt(p.numero.replace('P-', ''));
        return isNaN(num) ? 0 : num;
    });
    const maxNum = Math.max(...numeros, NUMERO_INICIAL_PRESUPUESTO - 1);
    return maxNum + 1;
}

export function procesarTextoItem(texto) {
    if (!texto) return '';
    return texto.toUpperCase().trim();
}

export function getVigenciaTexto(fechaEmision = null, dias = 7) {
    // 🔥 v7.22.13: usar fecha de emisión + días de validez
    const fecha = fechaEmision ? new Date(fechaEmision + 'T12:00:00') : new Date();
    fecha.setDate(fecha.getDate() + dias);
    return `Este presupuesto tiene validez hasta el ${fecha.toLocaleDateString('es-AR')}`;
}

export function getFechaVencimientoISO() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 7);
    return fecha.toISOString().split('T')[0];
}

export function separarIVA(montoConIVA, alicuota = ALICUOTA_IVA) {
    const neto = montoConIVA / (1 + alicuota / 100);
    const iva = montoConIVA - neto;
    return { neto, iva };
}

export function limpiarNombreEmpresa(nombre) {
    if (!nombre) return 'Mi Empresa';
    return nombre.replace(/\s+S\.?A\.?S\.?\s*$/i, '').trim();
}

export function getDatosEmpresa() {
    const db = getDB();
    return db.datosEmpresa || {
        nombre: 'Mi Empresa SRL',
        cuit: '30-12345678-9',
        condicionIVA: 'IVA Responsable Inscripto',
        email: 'info@miempresa.com',
        telefono: '11-1234-5678',
        direccion: 'Av. Corrientes 123',
        logo: '🏢',
        logoUrl: null,
        valorHoraSugerido: 5000,
        markupSugerido: 30
    };
}

// ==================== MAYÚSCULAS AUTOMÁTICAS ====================
export function activarMayusculasAutomaticas(container = document) {
    container.querySelectorAll('input[type="text"], textarea').forEach(el => {
        if (el.dataset.mayusculasActivas) return;
        el.dataset.mayusculasActivas = 'true';
        el.addEventListener('input', (e) => {
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(start, end);
        });
    });
}

// ==================== PARSEO DE TABLA PEGADA ====================
// Parsea un texto con formato de tabla (markdown con | o tabulaciones)
// y devuelve un array de ítems listos para meter en itemsPresupuesto.
// Columnas que reconoce (por nombre de encabezado):
//   - "Descripción" (obligatoria)
//   - "Costo proveedor" (obligatoria) → item.costo (CON IVA)
//   - "Precio venta con IVA" (obligatoria) → item.precioVentaUnitario
//   - "% Ganancia sobre costo" (opcional) → item.markup
// La fila "TOTAL" se ignora.
// Si la descripción contiene "mano de obra" o "m.o.", se marca como tipo mano_obra.
export function parsearTablaPegada(texto) {
    if (!texto || !texto.trim()) return [];

    // Detectar separador: si hay pipes, es markdown; si hay tabs, es de Excel/Sheets
    const usaPipes = texto.includes('|');

    // Dividir en líneas y limpiar
    let lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lineas.length === 0) return [];

    // Separar celdas según el formato
    function separarCeldas(linea) {
        if (usaPipes) {
            // Quitar pipes del inicio y fin, y dividir por |
            let l = linea;
            if (l.startsWith('|')) l = l.substring(1);
            if (l.endsWith('|')) l = l.substring(0, l.length - 1);
            return l.split('|').map(c => c.trim());
        } else {
            // Dividir por tabulaciones
            return linea.split('\t').map(c => c.trim());
        }
    }

    // Encontrar la fila de encabezados
    let indiceEncabezado = -1;
    for (let i = 0; i < lineas.length; i++) {
        const celdas = separarCeldas(lineas[i]);
        const tieneDescripcion = celdas.some(c => c.toLowerCase().includes('descripci'));
        if (tieneDescripcion) {
            indiceEncabezado = i;
            break;
        }
    }
    if (indiceEncabezado === -1) return [];

    // Parsear los encabezados y mapear los índices
    const encabezados = separarCeldas(lineas[indiceEncabezado]).map(h => h.toLowerCase());
    const idxDesc = encabezados.findIndex(h => h.includes('descripci'));
    const idxCosto = encabezados.findIndex(h => h.includes('costo proveedor'));
    const idxPrecioVenta = encabezados.findIndex(h => h.includes('precio venta') && h.includes('iva') && !h.includes('sin'));
    const idxMarkup = encabezados.findIndex(h => h.includes('ganancia sobre costo'));

    if (idxDesc === -1 || idxCosto === -1 || idxPrecioVenta === -1) {
        // No están las columnas mínimas
        return [];
    }

    // Función para parsear un valor monetario tipo "$175.000,00 (estimado)"
    function parsearMoneda(str) {
        if (!str) return 0;
        // Quitar todo lo que no sea número, coma, punto o menos
        let limpio = str.replace(/[^\d,.\-]/g, '');
        // Formato argentino: puntos de miles, coma decimal
        // Si hay coma, es decimal. Si hay punto y coma, el punto es miles.
        if (limpio.includes(',')) {
            limpio = limpio.replace(/\./g, '').replace(',', '.');
        } else {
            // Solo puntos: pueden ser miles o decimal. Si hay más de uno, son miles.
            const partes = limpio.split('.');
            if (partes.length > 2) {
                limpio = partes.join('');
            }
            // Si hay un solo punto con 3 dígitos después, es separador de miles
            // ej: "175.000" → 175000
            if (partes.length === 2 && partes[1].length === 3) {
                limpio = partes.join('');
            }
        }
        const num = parseFloat(limpio);
        return isNaN(num) ? 0 : num;
    }

    // Función para parsear un porcentaje tipo "31,14%" o "31.14%"
    function parsearPorcentaje(str) {
        if (!str) return 0;
        let limpio = str.replace(/[^\d,.\-]/g, '');
        if (limpio.includes(',')) {
            limpio = limpio.replace(/\./g, '').replace(',', '.');
        }
        const num = parseFloat(limpio);
        return isNaN(num) ? 0 : num;
    }

    // Procesar las filas de datos (después del encabezado)
    const items = [];
    for (let i = indiceEncabezado + 1; i < lineas.length; i++) {
        const celdas = separarCeldas(lineas[i]);
        if (celdas.length === 0) continue;

        // Detectar fila de separadores markdown (ej: |---|---|)
        const esSeparador = celdas.every(c => /^[-: ]+$/.test(c));
        if (esSeparador) continue;

        // Ignorar fila TOTAL
        const primeraCelda = (celdas[0] || '').toLowerCase();
        const tieneTotal = celdas.some(c => c.toLowerCase() === 'total');
        if (primeraCelda === 'total' || tieneTotal) continue;

        // Extraer valores
        const descripcion = (celdas[idxDesc] || '').trim();
        if (!descripcion) continue;

        const costoStr = celdas[idxCosto] || '';
        const costo = parsearMoneda(costoStr);

        const precioVentaStr = celdas[idxPrecioVenta] || '';
        const precioVenta = parsearMoneda(precioVentaStr);

        const markup = idxMarkup !== -1 ? parsearPorcentaje(celdas[idxMarkup] || '') : 0;

        // Detectar mano de obra
        const descUpper = descripcion.toUpperCase();
        const esManoObra = descUpper.includes('MANO DE OBRA') || descUpper.includes('M.O.') || descUpper === 'MO';

        // Armar el ítem
        const item = {
            nro: items.length + 1,
            desc: descUpper,
            cant: 1,
            costo: esManoObra ? 0 : costo,
            markup: markup,
            compraVinculadaId: null,
            compraItemIndex: null,
            cantidadAsignada: 0,
            tipo: esManoObra ? 'mano_obra' : 'producto',
            horas: esManoObra ? 1 : 0,
            valorHora: esManoObra ? costo : 0,
            precioVentaUnitario: precioVenta,
            esPropio: false,
            accion: ''
        };
        items.push(item);
    }

    return items;
}

// ==================== CÁLCULOS DE COSTOS Y VENTAS ====================
export function getCostoTotalProveedor(items) {
    let total = 0;
    items.forEach(item => {
        if (item.esPropio) return;
        if (item.tipo === 'mano_obra') {
            const costo = (item.horas || 0) * (item.valorHora || 0);
            total += costo * (item.cant || 1);
        } else {
            total += (item.costo || 0) * (item.cant || 1);
        }
    });
    return total;
}

export function getVentaTotalCliente(items, usarMarkupGlobal, markupGlobal) {
    let total = 0;
    items.forEach(item => {
        const cant = item.cant || 1;
        if (item.precioFijo) {
            total += (item.precioVentaUnitario || 0) * cant;
        } else {
            let costo = 0;
            if (item.tipo === 'mano_obra') {
                costo = (item.horas || 0) * (item.valorHora || 0);
            } else {
                costo = item.costo || 0;
            }
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            total += costo * (1 + markup / 100) * cant;
        }
    });
    return total;
}

// ==================== CÁLCULO DE GANANCIA CON IMPUESTOS ====================
export function calcularGananciaReal(items, usarMarkupGlobal, markupGlobal, impuestosActivados = null) {
    const todos = getTodosLosImpuestos();
    let impuestosACalcular;
    if (impuestosActivados === null || impuestosActivados === undefined) {
        impuestosACalcular = todos.filter(i => i.activo);
    } else {
        const setActivados = new Set(impuestosActivados);
        impuestosACalcular = todos.filter(i => setActivados.has(i.id));
    }

    let costoTotalConIVA = 0;
    items.forEach(item => {
        if (item.esPropio) return;
        if (item.tipo === 'mano_obra') {
            costoTotalConIVA += (item.horas || 0) * (item.valorHora || 0) * (item.cant || 1);
        } else {
            costoTotalConIVA += (item.costo || 0) * (item.cant || 1);
        }
    });
    let ventaTotalConIVA = 0;
    items.forEach(item => {
        const cant = item.cant || 1;
        if (item.precioFijo) {
            ventaTotalConIVA += (item.precioVentaUnitario || 0) * cant;
        } else {
            let costo = 0;
            if (item.tipo === 'mano_obra') {
                costo = (item.horas || 0) * (item.valorHora || 0);
            } else {
                costo = item.costo || 0;
            }
            const markup = usarMarkupGlobal ? markupGlobal : (item.markup || 0);
            // 🔥 v7.21.4: aplicar markup sobre el costo CON IVA (no sobre el neto)
            const costoConIVA = costo * (1 + ALICUOTA_IVA / 100);
            ventaTotalConIVA += costoConIVA * (1 + markup / 100) * cant;
        }
    });
    const { neto: ventaNeta, iva: ivaVentas } = separarIVA(ventaTotalConIVA, ALICUOTA_IVA);
    // 🔥 v7.19.8: el costo ya es NETO (no tiene IVA incluido)
    // NO separar IVA del costo. El IVA Compras se calcula sobre el neto.
    const costoNeto = costoTotalConIVA;
    const ivaCompras = costoNeto * (ALICUOTA_IVA / 100);
    const ivaAPagar = ivaVentas - ivaCompras;
    const gananciaBruta = ventaNeta - costoNeto;
    let totalImpuestosVenta = 0;
    let detalleImpuestos = [];

    impuestosACalcular.forEach(imp => {
        // 🔥 v7.20.6: excluir impuestoCheque del forEach (se calcula aparte)
        if (imp.id === 'impuestoCheque') return;
        if (imp.baseCalculo === 'venta' || imp.baseCalculo === 'utilidadAntesGanancias') {
            if (imp.id === 'ganancias' || imp.id === 'reservaLegal') return;
            // IIBB y TISSH se calculan sobre la Diferencia Neta (gananciaBruta),
            // no sobre la Venta Neta completa (porque se puede deducir el costo de la mercadería)
            let base = imp.baseCalculo === 'venta' ? gananciaBruta : gananciaBruta - totalImpuestosVenta;
            const monto = base * (imp.alicuota / 100);
            totalImpuestosVenta += monto;
            detalleImpuestos.push({ id: imp.id, nombre: imp.nombre, monto, base });
        }
    });

    // 🔥 v7.20.7: Impuesto al Cheque en DOS líneas separadas (pago y cobro)
    const costoReal = costoTotalConIVA * (1 + ALICUOTA_IVA / 100);
    const ventaReal = ventaTotalConIVA * (1 + ALICUOTA_IVA / 100);
    const impChequePago = costoReal * 0.006;
    const impChequeCobro = ventaReal * 0.006;
    const impuestoChequeMonto = impChequePago + impChequeCobro;
    const impChequeImp = impuestosACalcular.find(i => i.id === 'impuestoCheque');
    if (impChequeImp) {
        // Agregar las 2 líneas separadas
        detalleImpuestos.push({ 
            id: 'impuestoChequePago', 
            nombre: `Impuesto al Cheque - Pago (0,6% de $${formatNumber(costoReal)})`, 
            monto: impChequePago, 
            base: costoReal 
        });
        detalleImpuestos.push({ 
            id: 'impuestoChequeCobro', 
            nombre: `Impuesto al Cheque - Cobro (0,6% de $${formatNumber(ventaReal)})`, 
            monto: impChequeCobro, 
            base: ventaReal 
        });
        totalImpuestosVenta += impuestoChequeMonto;
    }

    let utilidadAntes = Math.max(0, gananciaBruta - totalImpuestosVenta);
    let impuestoGanancias = 0;
    const gananciasImp = impuestosACalcular.find(i => i.id === 'ganancias');
    if (gananciasImp) {
        impuestoGanancias = utilidadAntes * (gananciasImp.alicuota / 100);
    }
    const despuesGanancias = utilidadAntes - impuestoGanancias;
    let reservaLegal = 0;
    const reservaImp = impuestosACalcular.find(i => i.id === 'reservaLegal');
    if (reservaImp) {
        reservaLegal = despuesGanancias * (reservaImp.alicuota / 100);
    }
    const gananciaNeta = Math.max(0, despuesGanancias - reservaLegal);
    if (gananciasImp) {
        detalleImpuestos.push({ id: gananciasImp.id, nombre: gananciasImp.nombre, monto: impuestoGanancias, base: utilidadAntes });
    }
    if (reservaImp) {
        detalleImpuestos.push({ id: reservaImp.id, nombre: reservaImp.nombre, monto: reservaLegal, base: despuesGanancias });
    }
    const itemsPropios = items.filter(i => i.esPropio).length;
    const itemsTercerizados = items.filter(i => !i.esPropio).length;
    let modo = 'tercerizado';
    if (itemsPropios > 0 && itemsTercerizados === 0) modo = 'propio';
    else if (itemsPropios > 0 && itemsTercerizados > 0) modo = 'mixto';
    return {
        montoVentaCliente: ventaTotalConIVA,
        costoProveedor: costoTotalConIVA,
        costoNeto,
        ivaCompras,
        ventaNeta,
        ivaVentas,
        ivaAPagar,
        gananciaBruta,
        totalImpuestosVenta,
        detalleImpuestos,
        utilidadAntes,
        impuestoGanancia: impuestoGanancias,
        reservaLegal,
        gananciaNeta,
        margenRealSobreDiferencia: gananciaBruta > 0 ? (gananciaNeta / gananciaBruta) * 100 : 0,
        modo,
        itemsPropios,
        itemsTercerizados
    };
}

// ==================== DEUDAS DE MORA DEL CLIENTE ====================
export function obtenerDeudasMoraCliente(clienteId) {
    const db = getDB();
    const deudas = [];
    const ventasConMora = db.ventas.filter(v =>
        v.clienteId === clienteId &&
        v.interesMora &&
        v.interesMora > 0 &&
        v.estado === 'cobrado' &&
        !v.moraSaldada
    );
    ventasConMora.forEach(v => {
        deudas.push({
            tipo: 'venta',
            id: v.id,
            monto: v.interesMora,
            descripcion: `Mora por atraso en factura ${v.numFacturaEmitida || v.numComprobante || 'N/A'}, límite ${formatDate(v.fechaCobroEsperada)}, pagado ${formatDate(v.fechaCobro)}, interés $${formatNumber(v.interesMora)}`,
            fecha: v.fechaCobro
        });
    });
    const presupuestosMora = db.presupuestos.filter(p =>
        p.clienteId === clienteId &&
        p.esMora === true &&
        p.estado === 'pendiente'
    );
    presupuestosMora.forEach(p => {
        deudas.push({
            tipo: 'presupuestoMora',
            id: p.id,
            monto: p.total,
            descripcion: `Presupuesto de mora ${p.numero} por $${formatNumber(p.total)} (pendiente de aprobación)`,
            fecha: p.fechaCreacion
        });
    });
    return deudas;
}

// ==================== ELIMINAR PRESUPUESTO (en cascada) ====================
export function eliminarPresupuestoEnCascada(id, liberarStockFn) {
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (!presupuesto) { return false; }
    const ventaAsociada = presupuesto.ventaGeneradaId ? db.ventas.find(v => v.id === presupuesto.ventaGeneradaId) : null;
    if (ventaAsociada && ventaAsociada.estado === 'cobrado') {
        if (!confirm(`⚠️ Este presupuesto tiene una venta cobrada por $${formatNumber(ventaAsociada.total)}.\n\n¿Eliminar también la venta?`)) return false;
    } else if (ventaAsociada) {
        if (!confirm(`⚠️ Este presupuesto tiene una venta asociada en estado "${ventaAsociada.estado}".\n\n¿Eliminar también la venta?`)) return false;
    }
    const hijos = db.presupuestos.filter(h => h.presupuestoPadreId === id);
    if (hijos.length > 0) {
        if (!confirm(`Este presupuesto tiene ${hijos.length} adicional(es) vinculados. ¿Eliminarlos también?`)) return false;
        hijos.forEach(h => {
            db.presupuestos = db.presupuestos.filter(p => p.id !== h.id);
            if (h.items && liberarStockFn) {
                h.items.forEach(item => {
                    if (item.compraVinculadaId && item.compraItemIndex && item.cantidadAsignada) {
                        liberarStockFn(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
                    }
                });
            }
        });
    }
    if (ventaAsociada) {
        db.ventas = db.ventas.filter(v => v.id !== ventaAsociada.id);
        if (ventaAsociada.items && liberarStockFn) {
            ventaAsociada.items.forEach(item => {
                if (item.compraVinculadaId && item.compraItemIndex && item.cantidadAsignada) {
                    liberarStockFn(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
                }
            });
        }
        if (ventaAsociada.presupuestoMoraGenerado) {
            db.presupuestos = db.presupuestos.filter(p => p.id !== ventaAsociada.presupuestoMoraGenerado);
        }
    }
    if (presupuesto.items && liberarStockFn) {
        presupuesto.items.forEach(item => {
            if (item.compraVinculadaId && item.compraItemIndex && item.cantidadAsignada) {
                liberarStockFn(item.compraVinculadaId, item.compraItemIndex, item.cantidadAsignada);
            }
        });
    }
    db.presupuestos = db.presupuestos.filter(p => p.id !== id);
    return true;
}

// ==================== 🔥 v7.17.8: PARSEAR PRESUPUESTO COMPLETO ====================
// Detecta: Trabajo, Ítems, y Totales (Repuestos, Subtotal, Neto, IVA, Total)
// Devuelve: { items: [...], trabajo: string, totales: { repuestos, subtotal, neto, iva, ivaPorcentaje, total } }
export function parsearPresupuestoCompleto(texto) {
    if (!texto) return { items: [], trabajo: '', totales: {} };

    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l);
    let trabajo = '';
    const totales = {};

    // 1. Detectar "Trabajo: X" o "Trabajo" + siguiente línea
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        const matchTrabajo = linea.match(/^Trabajo[:\s]+(.+)$/i);
        if (matchTrabajo) {
            trabajo = matchTrabajo[1].trim();
            break;
        }
        if (/^Trabajo$/i.test(linea) && i + 1 < lineas.length) {
            trabajo = lineas[i + 1].trim();
            break;
        }
    }

    // 2. Detectar totales (Repuestos, Subtotal, Neto, IVA, Total)
    for (const linea of lineas) {
        const matchRepuestos = linea.match(/^Repuestos[:\s]*\$?\s*([\d.,]+)/i);
        if (matchRepuestos) {
            totales.repuestos = parseFloat(matchRepuestos[1].replace(/\./g, '').replace(/,/g, '.'));
            continue;
        }
        const matchSubtotal = linea.match(/^Subtotal[:\s]*\$?\s*([\d.,]+)/i);
        if (matchSubtotal) {
            totales.subtotal = parseFloat(matchSubtotal[1].replace(/\./g, '').replace(/,/g, '.'));
            continue;
        }
        const matchNeto = linea.match(/^Neto[:\s]*\$?\s*([\d.,]+)/i);
        if (matchNeto) {
            totales.neto = parseFloat(matchNeto[1].replace(/\./g, '').replace(/,/g, '.'));
            continue;
        }
        const matchIVA = linea.match(/^IVA\s*(\d+(?:\.\d+)?)?%?[:\s]*\$?\s*([\d.,]+)/i);
        if (matchIVA) {
            totales.iva = parseFloat(matchIVA[2].replace(/\./g, '').replace(/,/g, '.'));
            totales.ivaPorcentaje = matchIVA[1] ? parseFloat(matchIVA[1]) : 21;
            continue;
        }
        const matchTotal = linea.match(/^Total[:\s]*\$?\s*([\d.,]+)/i);
        if (matchTotal) {
            totales.total = parseFloat(matchTotal[1].replace(/\./g, '').replace(/,/g, '.'));
            continue;
        }
    }

    // 3. Parsear ítems con formato GF AutoCenter:
    // Descripción | Cant. | Precio unit. | IVA 21% | Importe
    const items = [];
    // Buscar la línea de encabezado "Descripción" o "Descripcion"
    let idxEncabezado = -1;
    for (let i = 0; i < lineas.length; i++) {
        if (/^Descripci[oó]n\b/i.test(lineas[i])) {
            idxEncabezado = i;
            break;
        }
    }

    if (idxEncabezado >= 0) {
        // Las líneas de ítems empiezan después del encabezado
        for (let i = idxEncabezado + 1; i < lineas.length; i++) {
            const linea = lineas[i];
            // Detener si llegamos a "Repuestos", "Subtotal", "Neto", "IVA", "Total"
            if (/^(Repuestos|Subtotal|Neto|IVA|Total)[:\s]/i.test(linea)) break;
            // Separar por tabs (o por 2+ espacios)
            const celdas = linea.split('\t').map(c => c.trim());
            if (celdas.length < 5) continue;
            const [desc, cantStr, precioStr, ivaStr, importeStr] = celdas;
            if (!desc || !cantStr) continue;
            const cant = parseFloat(cantStr.replace(',', '.')) || 1;
            const precioUnit = parseFloat(precioStr.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
            const importe = parseFloat(importeStr.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
            if (precioUnit > 0) {
                // El "precio unit." es el costo NETO (sin IVA)
                // El "importe" es el precio final con IVA (precio unit. × cant × 1.21)
                // Para el editor, el costo es el precio unit. (neto)
                // El precioVentaUnitario se calcula aplicando markup + IVA en el editor
                items.push({
                    desc: desc.toUpperCase(),
                    cant: cant,
                    costo: precioUnit,  // costo neto (sin IVA)
                    markup: 0,  // se aplica el markup global después
                    precioVentaUnitario: precioUnit,  // se recalcula en el editor
                    compraVinculadaId: null,
                    compraItemIndex: null,
                    cantidadAsignada: 0,
                    tipo: 'producto'
                });
            }
        }
    }

    return { items, trabajo, totales };
}
