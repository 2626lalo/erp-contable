// ==================== modules/unidades.js ====================
// UNIDADES - Gestión de unidades (vehículos) y su historial
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB } from './db.js';
import { formatNumber, escapeHtml, formatDate, mostrarNotificacion, generarId, inputFechaHTML, initInputFecha, getValorFecha, parseFechaLocal} from './utils.js';

// ==================== HELPERS DE PATENTE ====================

export function normalizarPatente(patente) {
    if (!patente) return '';
    return patente.toString().replace(/[\s-]/g, '').toUpperCase().trim();
}

export function formatearPatente(patente) {
    const p = normalizarPatente(patente);
    if (/^[A-Z]{3}\d{3}$/.test(p)) {
        return `${p.slice(0, 3)} ${p.slice(3)}`;
    }
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) {
        return `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
    }
    return p;
}

// 🔥 Helper: evalúa el estado de service de una unidad
export function evaluarServiceUnidad(unidad) {
    const kmActual = parseFloat(unidad.kmActual) || 0;
    const kmProx = parseFloat(unidad.kmProximoService) || 0;
    const fechaProx = unidad.fechaProximoService ? parseFechaLocal(unidad.fechaProximoService) : null;

    let peorEstado = 'aldia';
    let mensaje = '';
    let diasRestantes = null;
    let kmRestantes = null;

    if (kmProx > 0) {
        kmRestantes = kmProx - kmActual;
        if (kmRestantes <= 0) {
            peorEstado = 'vencido';
            mensaje = `⚠️ Service vencido por km`;
        } else if (kmRestantes <= 1000) {
            peorEstado = 'proximo';
            mensaje = `⏰ Service próximo (${kmRestantes} km)`;
        }
    }

    if (fechaProx) {
        const hoy = new Date();
        const diff = Math.ceil((fechaProx - hoy) / (1000 * 60 * 60 * 24));
        diasRestantes = diff;
        if (diff < 0) {
            if (peorEstado !== 'vencido') peorEstado = 'vencido';
            mensaje = mensaje || `⚠️ Service vencido por fecha (${Math.abs(diff)} días)`;
        } else if (diff <= 15) {
            if (peorEstado === 'aldia') peorEstado = 'proximo';
            mensaje = mensaje || `⏰ Service próximo en ${diff} días`;
        }
    }

    if (peorEstado === 'aldia' && !kmProx && !fechaProx) {
        peorEstado = 'sin-datos';
    }

    return { estado: peorEstado, mensaje, diasRestantes, kmRestantes };
}

// ==================== BÚSQUEDA Y CREACIÓN ====================

export function buscarUnidadPorPatente(patente) {
    const patenteNorm = normalizarPatente(patente);
    if (!patenteNorm) return null;
    const db = getDB();
    const unidades = db.unidades || [];
    return unidades.find(u => normalizarPatente(u.patente) === patenteNorm) || null;
}

export function crearOActualizarUnidad(datos) {
    const patenteNorm = normalizarPatente(datos.patente);
    if (!patenteNorm) return null;

    const db = getDB();
    if (!db.unidades) db.unidades = [];

    const index = db.unidades.findIndex(u => normalizarPatente(u.patente) === patenteNorm);
    const fecha = new Date().toISOString();

    if (index !== -1) {
        const u = db.unidades[index];
        if (datos.marcaModelo !== undefined && datos.marcaModelo) u.marcaModelo = datos.marcaModelo;
        if (datos.anio !== undefined && datos.anio) u.anio = datos.anio;
        if (datos.color !== undefined && datos.color) u.color = datos.color;
        if (datos.motor !== undefined && datos.motor) u.motor = datos.motor;
        if (datos.chasis !== undefined && datos.chasis) u.chasis = datos.chasis;
        if (datos.kmActual !== undefined && datos.kmActual) u.kmActual = datos.kmActual;
        if (datos.clienteId !== undefined && datos.clienteId !== null) u.clienteId = datos.clienteId;
        if (datos.clienteNombre !== undefined && datos.clienteNombre) u.clienteNombre = datos.clienteNombre;
        if (datos.observaciones !== undefined) u.observaciones = datos.observaciones;
        u.fechaUltimoServicio = fecha;
        guardarDB();
        return u;
    } else {
        const nueva = {
            id: generarId(),
            patente: patenteNorm,
            marcaModelo: datos.marcaModelo || '',
            anio: datos.anio || '',
            color: datos.color || '',
            motor: datos.motor || '',
            chasis: datos.chasis || '',
            kmActual: datos.kmActual || '',
            kmProximoService: datos.kmProximoService || '',
            fechaProximoService: datos.fechaProximoService || '',
            clienteId: datos.clienteId || null,
            clienteNombre: datos.clienteNombre || '',
            fechaAlta: fecha,
            fechaUltimoServicio: fecha,
            observaciones: datos.observaciones || ''
        };
        db.unidades.push(nueva);
        guardarDB();
        return nueva;
    }
}

export function obtenerHistorialUnidad(patente) {
    const patenteNorm = normalizarPatente(patente);
    if (!patenteNorm) return null;

    const db = getDB();
    const unidad = buscarUnidadPorPatente(patenteNorm);
    if (!unidad) return null;

    const presupuestos = (db.presupuestos || []).filter(p => normalizarPatente(p.patente) === patenteNorm)
        .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

    const presupuestoIds = presupuestos.map(p => p.id);
    const ventas = (db.ventas || []).filter(v => presupuestoIds.includes(v.presupuestoId))
        .sort((a, b) => new Date(b.fechaVenta) - new Date(a.fechaVenta));

    const totalPresupuestado = presupuestos
        .filter(p => p.estado === 'aprobado')
        .reduce((s, p) => s + (p.total || 0), 0);
    const totalVendido = ventas
        .filter(v => v.estado === 'cobrado' || v.estado === 'pendiente_cobro')
        .reduce((s, v) => s + (v.total || 0), 0);
    const totalCobrado = ventas
        .filter(v => v.estado === 'cobrado')
        .reduce((s, v) => s + (v.total || 0), 0);
    const totalPendienteCobro = ventas
        .filter(v => v.estado === 'pendiente_cobro')
        .reduce((s, v) => s + (v.total || 0), 0);

    const service = evaluarServiceUnidad(unidad);

    return {
        unidad,
        presupuestos,
        ventas,
        service,
        totales: {
            totalPresupuestado,
            totalVendido,
            totalCobrado,
            totalPendienteCobro,
            cantidadPresupuestos: presupuestos.length,
            cantidadVentas: ventas.length
        }
    };
}

export function migrarUnidadesDesdePresupuestos() {
    const db = getDB();
    if (!db.unidades) db.unidades = [];
    if (!db.presupuestos) return 0;

    let creadas = 0;
    db.presupuestos.forEach(p => {
        const patenteNorm = normalizarPatente(p.patente);
        if (!patenteNorm) return;

        const existe = db.unidades.some(u => normalizarPatente(u.patente) === patenteNorm);
        if (!existe) {
            db.unidades.push({
                id: generarId(),
                patente: patenteNorm,
                marcaModelo: p.vehiculoMarca || '',
                anio: p.vehiculoAnio || '',
                color: p.vehiculoColor || '',
                motor: p.vehiculoChasis || '',
                chasis: '',
                kmActual: p.vehiculoKm || '',
                kmProximoService: '',
                fechaProximoService: '',
                clienteId: p.clienteId || null,
                clienteNombre: p.cliente || '',
                fechaAlta: p.fechaCreacion || new Date().toISOString(),
                fechaUltimoServicio: p.fechaCreacion || new Date().toISOString(),
                observaciones: ''
            });
            creadas++;
        }
    });

    if (creadas > 0) {
        guardarDB();
    }
    return creadas;
}

// ==================== AUTOCOMPLETADO ====================

export function autocompletarDesdePatente(patente) {
    const unidad = buscarUnidadPorPatente(patente);
    if (!unidad) return false;

    const campos = {
        'vehiculoMarca': unidad.marcaModelo,
        'vehiculoKm': unidad.kmActual,
        'vehiculoAnio': unidad.anio,
        'vehiculoColor': unidad.color,
        'vehiculoChasis': unidad.motor,
    };
    Object.entries(campos).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el && valor && !el.value) {
            el.value = valor;
        }
    });

    if (unidad.clienteId) {
        const sel = document.getElementById('clienteSelect');
        if (sel && !sel.value) {
            sel.value = unidad.clienteId;
            if (typeof window.cargarDeudasCliente === 'function') {
                window.cargarDeudasCliente(unidad.clienteId);
            }
        }
    }

    mostrarNotificacion(`✅ Datos de ${formatearPatente(unidad.patente)} cargados`, 'success');
    return true;
}

// ==================== DASHBOARD DE FLOTA ====================

function calcularStatsDashboard(unidades) {
    let totalFacturado = 0;
    let unidadesVencidas = 0;
    let unidadesProximas = 0;
    const porCliente = {};
    const porUnidad = [];

    unidades.forEach(u => {
        const h = obtenerHistorialUnidad(u.patente);
        if (!h) return;
        totalFacturado += h.totales.totalVendido;

        const srv = h.service;
        if (srv.estado === 'vencido') unidadesVencidas++;
        else if (srv.estado === 'proximo') unidadesProximas++;

        const cli = u.clienteNombre || 'Sin cliente';
        if (!porCliente[cli]) porCliente[cli] = { nombre: cli, unidades: 0, totalFacturado: 0 };
        porCliente[cli].unidades++;
        porCliente[cli].totalFacturado += h.totales.totalVendido;

        porUnidad.push({
            patente: u.patente,
            marcaModelo: u.marcaModelo,
            cliente: u.clienteNombre,
            totalFacturado: h.totales.totalVendido
        });
    });

    porUnidad.sort((a, b) => b.totalFacturado - a.totalFacturado);
    const topUnidades = porUnidad.slice(0, 5);
    const topClientes = Object.values(porCliente).sort((a, b) => b.unidades - a.unidades).slice(0, 5);

    return {
        totalUnidades: unidades.length,
        totalFacturado,
        unidadesVencidas,
        unidadesProximas,
        topUnidades,
        topClientes
    };
}

// ==================== VISTA POR CLIENTE ====================

// 🔥 Devuelve estadísticas agrupadas por cliente
export function obtenerStatsPorCliente() {
    const db = getDB();
    const unidades = db.unidades || [];
    const porCliente = {};

    unidades.forEach(u => {
        const cli = u.clienteNombre || 'Sin cliente';
        if (!porCliente[cli]) {
            porCliente[cli] = {
                nombre: cli,
                unidades: [],
                totalFacturado: 0,
                totalPresupuestado: 0,
                pendienteCobro: 0,
                serviciosVencidos: 0,
                serviciosProximos: 0
            };
        }
        const h = obtenerHistorialUnidad(u.patente);
        if (!h) return;
        porCliente[cli].unidades.push(u);
        porCliente[cli].totalFacturado += h.totales.totalVendido;
        porCliente[cli].totalPresupuestado += h.totales.totalPresupuestado;
        porCliente[cli].pendienteCobro += h.totales.totalPendienteCobro;
        if (h.service.estado === 'vencido') porCliente[cli].serviciosVencidos++;
        else if (h.service.estado === 'proximo') porCliente[cli].serviciosProximos++;
    });

    return Object.values(porCliente).sort((a, b) => b.totalFacturado - a.totalFacturado);
}

// ==================== VISTA: LISTA DE UNIDADES ====================

export function renderUnidades() {
    const db = getDB();
    if (!db.unidades) db.unidades = [];

    // Filtros
    const filtroBusqueda = localStorage.getItem('unidadesFiltroBusqueda') || '';
    const filtroService = localStorage.getItem('unidadesFiltroService') || 'todos';
    const filtroCliente = localStorage.getItem('unidadesFiltroCliente') || 'todos';
    const vistaModo = localStorage.getItem('unidadesVistaModo') || 'lista'; // 'lista' o 'clientes'

    let unidades = db.unidades.slice();

    if (filtroBusqueda.trim()) {
        const f = filtroBusqueda.toLowerCase();
        unidades = unidades.filter(u =>
            (u.patente || '').toLowerCase().includes(f) ||
            (u.marcaModelo || '').toLowerCase().includes(f) ||
            (u.clienteNombre || '').toLowerCase().includes(f)
        );
    }
    if (filtroCliente !== 'todos') {
        unidades = unidades.filter(u => (u.clienteNombre || 'Sin cliente') === filtroCliente);
    }
    if (filtroService !== 'todos') {
        unidades = unidades.filter(u => {
            const srv = evaluarServiceUnidad(u);
            return srv.estado === filtroService;
        });
    }

    unidades.sort((a, b) => new Date(b.fechaUltimoServicio || 0) - new Date(a.fechaUltimoServicio || 0));

    const clientesUnicos = Array.from(new Set(db.unidades.map(u => u.clienteNombre || 'Sin cliente'))).sort();
    const stats = calcularStatsDashboard(db.unidades);
    const statsPorCliente = obtenerStatsPorCliente();

    // 🔥 Vista por cliente (si está activada)
    let contenidoPrincipal = '';
    if (vistaModo === 'clientes') {
        contenidoPrincipal = `
            <div class="space-y-3">
                ${statsPorCliente.length === 0
                    ? '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">No hay clientes con unidades</p></div>'
                    : statsPorCliente.map(c => `
                        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md border-l-4 border-purple-500">
                            <div class="flex justify-between items-start flex-wrap gap-2">
                                <div class="flex-1">
                                    <h3 class="font-bold text-lg">${escapeHtml(c.nombre)}</h3>
                                    <p class="text-sm text-gray-600 dark:text-gray-300">
                                        <strong>${c.unidades.length}</strong> unidad(es)
                                        ${c.serviciosVencidos > 0 ? ` • <span class="text-red-600 font-bold">${c.serviciosVencidos} service vencido</span>` : ''}
                                        ${c.serviciosProximos > 0 ? ` • <span class="text-orange-600 font-bold">${c.serviciosProximos} próximo</span>` : ''}
                                    </p>
                                    <p class="text-xs text-gray-500 mt-1">
                                        Facturado: <strong>$${formatNumber(c.totalFacturado)}</strong>
                                        • Pendiente: <strong class="text-red-600">$${formatNumber(c.pendienteCobro)}</strong>
                                    </p>
                                </div>
                                <div class="flex gap-1 flex-wrap">
                                    <button onclick="window.filtrarPorCliente('${escapeHtml(c.nombre)}')" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">Ver unidades</button>
                                    <button onclick="window.imprimirHistorialCliente('${escapeHtml(c.nombre)}')" class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">🖨️ Imprimir</button>
                                </div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;
    } else {
        // Vista lista normal
        contenidoPrincipal = `
            <div id="listaUnidades" class="space-y-3">
                ${unidades.length === 0
                    ? '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">No hay unidades que coincidan</p></div>'
                    : unidades.map(u => {
                        const historial = obtenerHistorialUnidad(u.patente);
                        const tot = historial ? historial.totales : { totalVendido: 0, cantidadPresupuestos: 0 };
                        const srv = historial ? historial.service : { estado: 'sin-datos', mensaje: '' };
                        const colorBorde = srv.estado === 'vencido' ? 'border-red-500' : srv.estado === 'proximo' ? 'border-orange-500' : 'border-blue-500';
                        const badgeService = srv.estado === 'vencido'
                            ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠️ Vencido</span>'
                            : srv.estado === 'proximo'
                                ? '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">⏰ Próximo</span>'
                                : '';
                        return `
                            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all border-l-4 ${colorBorde}">
                                <div class="flex justify-between items-start flex-wrap gap-2">
                                    <div class="flex-1 cursor-pointer" onclick="window.verDetalleUnidad('${escapeHtml(u.patente)}')">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <h3 class="font-bold text-lg">${escapeHtml(formatearPatente(u.patente))}</h3>
                                            <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">${escapeHtml(u.marcaModelo || 'Sin marca')}</span>
                                            ${badgeService}
                                        </div>
                                        <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(u.clienteNombre || 'Sin cliente')} ${u.anio ? '• ' + escapeHtml(u.anio) : ''} ${u.color ? '• ' + escapeHtml(u.color) : ''}</p>
                                        <p class="text-xs text-gray-500 mt-1">
                                            ${tot.cantidadPresupuestos} presupuestos • Facturado: <strong>$${formatNumber(tot.totalVendido)}</strong>
                                            ${u.kmActual ? '• Km: ' + escapeHtml(u.kmActual) : ''}
                                        </p>
                                    </div>
                                    <div class="flex flex-col items-end gap-1">
                                        <p class="text-xs text-gray-400">Último servicio</p>
                                        <p class="text-sm font-medium">${u.fechaUltimoServicio ? formatDate(u.fechaUltimoServicio) : '-'}</p>
                                        <div class="flex gap-1 mt-1">
                                            <button onclick="event.stopPropagation();window.editarUnidadUI('${escapeHtml(u.patente)}')" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs" title="Editar">✏️</button>
                                            <button onclick="event.stopPropagation();window.imprimirHistorialUnidad('${escapeHtml(u.patente)}')" class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs" title="Imprimir">🖨️</button>
                                            <button onclick="event.stopPropagation();window.eliminarUnidadUI('${escapeHtml(u.patente)}')" class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs" title="Eliminar">🗑️</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        `;
    }

    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">🚗 Unidades</h1>
                <div class="flex gap-2 flex-wrap">
                    <button onclick="window.toggleVistaUnidades()" class="bg-purple-600 text-white px-3 py-1 rounded-lg text-sm">
                        ${vistaModo === 'clientes' ? '📋 Ver lista' : '👥 Ver por cliente'}
                    </button>
                    <button onclick="window.exportarUnidadesCSV()" class="bg-green-600 text-white px-3 py-1 rounded-lg text-sm">📤 CSV</button>
                    <button onclick="window.migrarUnidadesDesdePresupuestosUI()" class="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white px-3 py-1 rounded-lg text-sm">🔄 Migrar</button>
                </div>
            </div>

            <!-- 📊 Dashboard de Flota -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Unidades activas</p>
                    <p class="text-2xl font-bold text-blue-600">${stats.totalUnidades}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Total facturado</p>
                    <p class="text-2xl font-bold text-green-600">$${formatNumber(stats.totalFacturado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Service vencido</p>
                    <p class="text-2xl font-bold text-red-600">${stats.unidadesVencidas}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Service próximo</p>
                    <p class="text-2xl font-bold text-orange-600">${stats.unidadesProximas}</p>
                </div>
            </div>

            ${vistaModo === 'lista' && stats.topClientes.length > 0 ? `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow">
                <h2 class="font-bold text-sm mb-2">🏆 Top clientes por unidades</h2>
                <div class="grid grid-cols-1 md:grid-cols-5 gap-2">
                    ${stats.topClientes.map(c => `
                        <div class="border rounded-lg p-2 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onclick="window.filtrarPorCliente('${escapeHtml(c.nombre)}')">
                            <p class="text-xs truncate font-medium">${escapeHtml(c.nombre)}</p>
                            <p class="text-lg font-bold text-blue-600">${c.unidades}</p>
                            <p class="text-xs text-gray-500">$${formatNumber(c.totalFacturado)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${vistaModo === 'lista' ? `
            <div class="bg-white dark:bg-gray-800 p-3 rounded-xl shadow space-y-2">
                <div class="flex flex-wrap gap-2 items-center">
                    <input type="text" id="filtroBusquedaUnidades" value="${escapeHtml(filtroBusqueda)}"
                           placeholder="🔍 Patente, marca o cliente..."
                           class="flex-1 min-w-[200px] p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                           onkeyup="if(event.key==='Enter') window.aplicarFiltroUnidades()">
                    <select id="filtroServiceUnidades" class="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm">
                        <option value="todos" ${filtroService === 'todos' ? 'selected' : ''}>Service: Todos</option>
                        <option value="vencido" ${filtroService === 'vencido' ? 'selected' : ''}>⚠️ Vencido</option>
                        <option value="proximo" ${filtroService === 'proximo' ? 'selected' : ''}>⏰ Próximo</option>
                        <option value="aldia" ${filtroService === 'aldia' ? 'selected' : ''}>✅ Al día</option>
                        <option value="sin-datos" ${filtroService === 'sin-datos' ? 'selected' : ''}>Sin datos</option>
                    </select>
                    <select id="filtroClienteUnidades" class="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm">
                        <option value="todos" ${filtroCliente === 'todos' ? 'selected' : ''}>Cliente: Todos</option>
                        ${clientesUnicos.map(c => `<option value="${escapeHtml(c)}" ${filtroCliente === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                    </select>
                    <button onclick="window.aplicarFiltroUnidades()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Aplicar</button>
                    <button onclick="window.limpiarFiltroUnidades()" class="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white px-4 py-2 rounded-lg text-sm">Limpiar</button>
                </div>
                ${filtroCliente !== 'todos' ? `<p class="text-xs text-blue-600">Filtrando por cliente: <strong>${escapeHtml(filtroCliente)}</strong></p>` : ''}
            </div>
            ` : ''}

            ${contenidoPrincipal}
        </div>
    `;
}

// ==================== VISTA: DETALLE DE UNIDAD ====================

export function renderDetalleUnidad(patente) {
    const historial = obtenerHistorialUnidad(patente);
    if (!historial) {
        return `<div class="p-8 text-center"><p class="text-gray-500">Unidad no encontrada</p><button onclick="window.showView('unidades')" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg">← Volver</button></div>`;
    }
    const { unidad, presupuestos, ventas, totales, service } = historial;

    const presupuestosHTML = presupuestos.length === 0
        ? '<p class="text-sm text-gray-400 text-center py-4">Sin presupuestos</p>'
        : presupuestos.map(p => `
            <div class="flex justify-between items-center border-b dark:border-gray-700 py-2">
                <div>
                    <p class="text-sm font-medium">${escapeHtml(p.numero)} - ${escapeHtml(p.cliente)}</p>
                    <p class="text-xs text-gray-500">${p.fechaCreacion ? formatDate(p.fechaCreacion) : ''} • Estado: ${p.estado}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold ${p.estado === 'aprobado' ? 'text-green-600' : 'text-yellow-600'}">$${formatNumber(p.total)}</p>
                    <button onclick="event.stopPropagation();window.editarPresupuesto(${p.id})" class="text-xs text-blue-600 hover:underline">Ver / Editar</button>
                </div>
            </div>
        `).join('');

    const ventasHTML = ventas.length === 0
        ? '<p class="text-sm text-gray-400 text-center py-4">Sin ventas asociadas</p>'
        : ventas.map(v => `
            <div class="flex justify-between items-center border-b dark:border-gray-700 py-2">
                <div>
                    <p class="text-sm font-medium">Factura ${escapeHtml(v.numFacturaEmitida || v.numComprobante || 'N/A')}</p>
                    <p class="text-xs text-gray-500">${v.fechaVenta ? formatDate(v.fechaVenta) : ''} • Estado: ${v.estado}</p>
                </div>
                <p class="font-bold text-green-600">$${formatNumber(v.total)}</p>
            </div>
        `).join('');

    const alertaColor = service.estado === 'vencido' ? 'bg-red-50 dark:bg-red-900/20 border-red-300 text-red-800 dark:text-red-200'
        : service.estado === 'proximo' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 text-orange-800 dark:text-orange-200'
        : '';

    return `
        <div class="space-y-4 fade-in pb-24">
            <button onclick="window.showView('unidades')" class="text-gray-600 dark:text-gray-300">← Volver a Unidades</button>

            ${service.estado !== 'aldia' && service.estado !== 'sin-datos' ? `<div class="${alertaColor} border rounded-xl p-3">${escapeHtml(service.mensaje)}</div>` : ''}

            <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
                <div class="flex justify-between items-start flex-wrap gap-3 mb-4">
                    <div>
                        <h1 class="text-2xl font-bold">${escapeHtml(formatearPatente(unidad.patente))}</h1>
                        <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(unidad.marcaModelo || 'Sin marca')}</p>
                    </div>
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="window.nuevoPresupuestoParaUnidad('${escapeHtml(unidad.patente)}')" class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm">➕ Nuevo presupuesto</button>
                        <button onclick="window.editarUnidadUI('${escapeHtml(unidad.patente)}')" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">✏️ Editar</button>
                        <button onclick="window.imprimirHistorialUnidad('${escapeHtml(unidad.patente)}')" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">🖨️ Imprimir</button>
                        <button onclick="window.eliminarUnidadUI('${escapeHtml(unidad.patente)}')" class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm">🗑️</button>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span class="text-gray-500">Cliente:</span> <strong>${escapeHtml(unidad.clienteNombre || '-')}</strong></div>
                    <div><span class="text-gray-500">Año:</span> <strong>${escapeHtml(unidad.anio || '-')}</strong></div>
                    <div><span class="text-gray-500">Color:</span> <strong>${escapeHtml(unidad.color || '-')}</strong></div>
                    <div><span class="text-gray-500">Motor:</span> <strong>${escapeHtml(unidad.motor || '-')}</strong></div>
                    <div><span class="text-gray-500">Km actual:</span> <strong>${escapeHtml(unidad.kmActual || '-')}</strong></div>
                    <div><span class="text-gray-500">Próximo service (km):</span> <strong>${escapeHtml(unidad.kmProximoService || '-')}</strong></div>
                    <div><span class="text-gray-500">Próximo service (fecha):</span> <strong>${unidad.fechaProximoService ? formatDate(unidad.fechaProximoService) : '-'}</strong></div>
                    <div><span class="text-gray-500">Alta:</span> <strong>${unidad.fechaAlta ? formatDate(unidad.fechaAlta) : '-'}</strong></div>
                    <div class="col-span-2 md:col-span-4"><span class="text-gray-500">Último servicio:</span> <strong>${unidad.fechaUltimoServicio ? formatDate(unidad.fechaUltimoServicio) : '-'}</strong></div>
                    ${unidad.observaciones ? `<div class="col-span-2 md:col-span-4"><span class="text-gray-500">Observaciones:</span> ${escapeHtml(unidad.observaciones)}</div>` : ''}
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Total presupuestado</p>
                    <p class="text-xl font-bold text-blue-600">$${formatNumber(totales.totalPresupuestado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Total vendido</p>
                    <p class="text-xl font-bold text-green-600">$${formatNumber(totales.totalVendido)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Total cobrado</p>
                    <p class="text-xl font-bold text-green-700">$${formatNumber(totales.totalCobrado)}</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
                    <p class="text-xs text-gray-500">Pendiente cobro</p>
                    <p class="text-xl font-bold text-red-600">$${formatNumber(totales.totalPendienteCobro)}</p>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-lg">
                <h2 class="font-bold mb-2">📄 Presupuestos (${totales.cantidadPresupuestos})</h2>
                <div class="max-h-64 overflow-y-auto">${presupuestosHTML}</div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-lg">
                <h2 class="font-bold mb-2">💰 Ventas (${totales.cantidadVentas})</h2>
                <div class="max-h-64 overflow-y-auto">${ventasHTML}</div>
            </div>
        </div>
    `;
}

// ==================== MODAL EDITAR UNIDAD ====================

window.editarUnidadUI = (patente) => {
    const unidad = buscarUnidadPorPatente(patente);
    if (!unidad) { mostrarNotificacion('Unidad no encontrada', 'error'); return; }

    const db = getDB();
    const clientesOptions = (db.clientes || []).map(c =>
        `<option value="${c.id}" ${unidad.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg">
            <h2 class="text-xl font-bold mb-4 text-center">✏️ Editar Unidad ${escapeHtml(formatearPatente(unidad.patente))}</h2>
            <div class="space-y-3">
                <div><label class="block text-sm font-medium">Patente</label>
                    <input type="text" id="editU-patente" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.patente)}" readonly>
                </div>
                <div><label class="block text-sm font-medium">Marca / Modelo</label>
                    <input type="text" id="editU-marcaModelo" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.marcaModelo || '')}">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-sm font-medium">Año</label>
                        <input type="text" id="editU-anio" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.anio || '')}">
                    </div>
                    <div><label class="block text-sm font-medium">Color</label>
                        <input type="text" id="editU-color" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.color || '')}">
                    </div>
                </div>
                <div><label class="block text-sm font-medium">Motor</label>
                    <input type="text" id="editU-motor" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.motor || '')}">
                </div>
                <div><label class="block text-sm font-medium">Chasis</label>
                    <input type="text" id="editU-chasis" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.chasis || '')}">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-sm font-medium">Km actual</label>
                        <input type="number" id="editU-kmActual" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.kmActual || '')}">
                    </div>
                    <div><label class="block text-sm font-medium">Km próximo service</label>
                        <input type="number" id="editU-kmProximoService" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" value="${escapeHtml(unidad.kmProximoService || '')}">
                    </div>
                </div>
                ${inputFechaHTML('editU-fechaProximoService', unidad.fechaProximoService || '', { label: 'Fecha próximo service' })}
                <div><label class="block text-sm font-medium">Cliente</label>
                    <select id="editU-clienteId" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="">Sin cliente</option>
                        ${clientesOptions}
                    </select>
                </div>
                <div><label class="block text-sm font-medium">Observaciones</label>
                    <textarea id="editU-observaciones" rows="3" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">${escapeHtml(unidad.observaciones || '')}</textarea>
                </div>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="editU-guardar" class="flex-1 bg-green-600 text-white py-2 rounded-xl">💾 Guardar</button>
                <button id="editU-cancelar" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 🔥 Inicializar input de fecha
    initInputFecha('editU-fechaProximoService');

    modal.querySelector('#editU-guardar').onclick = () => {
        const db = getDB();
        const idx = db.unidades.findIndex(u => normalizarPatente(u.patente) === normalizarPatente(patente));
        if (idx === -1) { mostrarNotificacion('Unidad no encontrada', 'error'); return; }

        const u = db.unidades[idx];
        u.marcaModelo = modal.querySelector('#editU-marcaModelo').value;
        u.anio = modal.querySelector('#editU-anio').value;
        u.color = modal.querySelector('#editU-color').value;
        u.motor = modal.querySelector('#editU-motor').value;
        u.chasis = modal.querySelector('#editU-chasis').value;
        u.kmActual = modal.querySelector('#editU-kmActual').value;
        u.kmProximoService = modal.querySelector('#editU-kmProximoService').value;
        u.fechaProximoService = getValorFecha('editU-fechaProximoService');
        const clienteId = modal.querySelector('#editU-clienteId').value;
        u.clienteId = clienteId ? parseInt(clienteId) : null;
        const cliente = (db.clientes || []).find(c => c.id === u.clienteId);
        u.clienteNombre = cliente ? cliente.nombre : '';
        u.observaciones = modal.querySelector('#editU-observaciones').value;

        guardarDB();
        modal.remove();
        mostrarNotificacion('✅ Unidad actualizada', 'success');
        if (document.getElementById('listaUnidades') || document.getElementById('unidadesVistaClientes')) {
            window.showView('unidades');
        } else {
            window.verDetalleUnidad(patente);
        }
    };

    modal.querySelector('#editU-cancelar').onclick = () => modal.remove();
};

// ==================== ELIMINAR UNIDAD ====================

window.eliminarUnidadUI = (patente) => {
    const unidad = buscarUnidadPorPatente(patente);
    if (!unidad) { mostrarNotificacion('Unidad no encontrada', 'error'); return; }

    const historial = obtenerHistorialUnidad(patente);
    const tienePresupuestos = historial && historial.presupuestos.length > 0;

    const mensaje = tienePresupuestos
        ? `⚠️ Esta unidad tiene ${historial.presupuestos.length} presupuesto(s) asociado(s).\n\nSi la eliminás, los presupuestos NO se borran, pero dejás de verlos agrupados en esta unidad.\n\n¿Eliminar de todos modos?`
        : `¿Eliminar la unidad ${formatearPatente(patente)}?`;

    if (!confirm(mensaje)) return;

    const db = getDB();
    db.unidades = (db.unidades || []).filter(u => normalizarPatente(u.patente) !== normalizarPatente(patente));
    guardarDB();
    mostrarNotificacion('Unidad eliminada', 'info');
    window.showView('unidades');
};

// ==================== IMPRIMIR HISTORIAL DE UNIDAD ====================

window.imprimirHistorialUnidad = (patente) => {
    const historial = obtenerHistorialUnidad(patente);
    if (!historial) { mostrarNotificacion('Unidad no encontrada', 'error'); return; }
    const { unidad, presupuestos, ventas, totales } = historial;

    const presupuestosHTML = presupuestos.map(p => `
        <tr>
            <td>${escapeHtml(p.numero)}</td>
            <td>${p.fechaCreacion ? formatDate(p.fechaCreacion) : '-'}</td>
            <td>${escapeHtml(p.cliente)}</td>
            <td>${escapeHtml(p.estado)}</td>
            <td style="text-align:right;">$${formatNumber(p.total)}</td>
        </tr>
    `).join('');

    const ventasHTML = ventas.map(v => `
        <tr>
            <td>${escapeHtml(v.numFacturaEmitida || v.numComprobante || '-')}</td>
            <td>${v.fechaVenta ? formatDate(v.fechaVenta) : '-'}</td>
            <td>${escapeHtml(v.estado)}</td>
            <td style="text-align:right;">$${formatNumber(v.total)}</td>
        </tr>
    `).join('');

    const empresa = getDB().datosEmpresa || {};
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Historial ${escapeHtml(unidad.patente)}</title>
<style>
  @page { size: A4; margin: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 15mm; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #0a2a4a; }
  h2 { font-size: 14px; margin: 16px 0 6px; color: #0a2a4a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; font-size: 11px; text-align: left; }
  th { background: #0a2a4a; color: white; }
  .header { text-align: center; border-bottom: 2px solid #0a2a4a; padding-bottom: 8px; margin-bottom: 12px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; margin-bottom: 12px; }
  .no-print { text-align: center; margin-top: 20px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
  <h1>${escapeHtml(empresa.nombre || 'Mi Empresa')} - Historial de Unidad</h1>
  <p>${escapeHtml(unidad.patente)} - ${escapeHtml(unidad.marcaModelo || '')}</p>
</div>
<div class="info">
  <div><strong>Cliente:</strong> ${escapeHtml(unidad.clienteNombre || '-')}</div>
  <div><strong>Año:</strong> ${escapeHtml(unidad.anio || '-')}</div>
  <div><strong>Color:</strong> ${escapeHtml(unidad.color || '-')}</div>
  <div><strong>Motor:</strong> ${escapeHtml(unidad.motor || '-')}</div>
  <div><strong>Km actual:</strong> ${escapeHtml(unidad.kmActual || '-')}</div>
  <div><strong>Alta:</strong> ${unidad.fechaAlta ? formatDate(unidad.fechaAlta) : '-'}</div>
  ${unidad.observaciones ? `<div style="grid-column: 1 / -1;"><strong>Observaciones:</strong> ${escapeHtml(unidad.observaciones)}</div>` : ''}
</div>
<h2>Presupuestos</h2>
<table>
  <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Total</th></tr></thead>
  <tbody>${presupuestosHTML || '<tr><td colspan="5" style="text-align:center;">Sin datos</td></tr>'}</tbody>
</table>
<h2>Ventas</h2>
<table>
  <thead><tr><th>Factura</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
  <tbody>${ventasHTML || '<tr><td colspan="4" style="text-align:center;">Sin datos</td></tr>'}</tbody>
</table>
<h2>Resumen</h2>
<table>
  <tr><td>Total presupuestado</td><td style="text-align:right;">$${formatNumber(totales.totalPresupuestado)}</td></tr>
  <tr><td>Total vendido</td><td style="text-align:right;">$${formatNumber(totales.totalVendido)}</td></tr>
  <tr><td>Total cobrado</td><td style="text-align:right;">$${formatNumber(totales.totalCobrado)}</td></tr>
  <tr><td>Pendiente cobro</td><td style="text-align:right;">$${formatNumber(totales.totalPendienteCobro)}</td></tr>
</table>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 20px;background:#1e3a8a;color:white;border:none;border-radius:6px;cursor:pointer;">🖨️ Imprimir</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#6b7280;color:white;border:none;border-radius:6px;cursor:pointer;margin-left:8px;">Cerrar</button>
</div>
</body>
</html>`;
    const v = window.open('', '_blank', 'width=900,height=700');
    v.document.write(html);
    v.document.close();
};

// ==================== IMPRIMIR HISTORIAL DE CLIENTE ====================

window.imprimirHistorialCliente = (clienteNombre) => {
    const db = getDB();
    const unidades = (db.unidades || []).filter(u => (u.clienteNombre || 'Sin cliente') === clienteNombre);
    if (unidades.length === 0) { mostrarNotificacion('No hay unidades para este cliente', 'warning'); return; }

    const empresa = db.datosEmpresa || {};

    let totalFacturadoCliente = 0;
    let totalPendienteCliente = 0;

    const unidadesHTML = unidades.map(u => {
        const h = obtenerHistorialUnidad(u.patente);
        const tot = h ? h.totales : { totalVendido: 0, totalPendienteCobro: 0, cantidadPresupuestos: 0 };
        totalFacturadoCliente += tot.totalVendido;
        totalPendienteCliente += tot.totalPendienteCobro;
        return `
            <tr>
                <td>${escapeHtml(formatearPatente(u.patente))}</td>
                <td>${escapeHtml(u.marcaModelo || '-')}</td>
                <td>${escapeHtml(u.anio || '-')}</td>
                <td>${escapeHtml(u.color || '-')}</td>
                <td>${escapeHtml(u.kmActual || '-')}</td>
                <td>${u.fechaUltimoServicio ? formatDate(u.fechaUltimoServicio) : '-'}</td>
                <td style="text-align:center;">${tot.cantidadPresupuestos}</td>
                <td style="text-align:right;">$${formatNumber(tot.totalVendido)}</td>
                <td style="text-align:right;">$${formatNumber(tot.totalPendienteCobro)}</td>
            </tr>
        `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Historial Cliente ${escapeHtml(clienteNombre)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 12mm; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #0a2a4a; }
  h2 { font-size: 14px; margin: 16px 0 6px; color: #0a2a4a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; font-size: 11px; text-align: left; }
  th { background: #0a2a4a; color: white; }
  .header { text-align: center; border-bottom: 2px solid #0a2a4a; padding-bottom: 8px; margin-bottom: 12px; }
  .no-print { text-align: center; margin-top: 20px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
  <h1>${escapeHtml(empresa.nombre || 'Mi Empresa')} - Historial de Cliente</h1>
  <p><strong>${escapeHtml(clienteNombre)}</strong></p>
</div>
<h2>Unidades (${unidades.length})</h2>
<table>
  <thead>
    <tr>
      <th>Patente</th>
      <th>Marca/Modelo</th>
      <th>Año</th>
      <th>Color</th>
      <th>Km</th>
      <th>Último servicio</th>
      <th style="text-align:center;">Presup.</th>
      <th style="text-align:right;">Facturado</th>
      <th style="text-align:right;">Pendiente</th>
    </tr>
  </thead>
  <tbody>${unidadesHTML}</tbody>
</table>
<h2>Resumen General</h2>
<table>
  <tr><td>Total facturado al cliente</td><td style="text-align:right;">$${formatNumber(totalFacturadoCliente)}</td></tr>
  <tr><td>Total pendiente de cobro</td><td style="text-align:right;">$${formatNumber(totalPendienteCliente)}</td></tr>
  <tr><td>Unidades activas</td><td style="text-align:right;">${unidades.length}</td></tr>
</table>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 20px;background:#1e3a8a;color:white;border:none;border-radius:6px;cursor:pointer;">🖨️ Imprimir</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#6b7280;color:white;border:none;border-radius:6px;cursor:pointer;margin-left:8px;">Cerrar</button>
</div>
</body>
</html>`;
    const v = window.open('', '_blank', 'width=1100,height=700');
    v.document.write(html);
    v.document.close();
};

// ==================== NUEVO PRESUPUESTO PARA UNIDAD ====================

window.nuevoPresupuestoParaUnidad = (patente) => {
    const unidad = buscarUnidadPorPatente(patente);
    if (!unidad) { mostrarNotificacion('Unidad no encontrada', 'error'); return; }

    // Guardar la patente para que el editor la levante
    localStorage.setItem('presupuestoPatenteInicial', patente);

    // Llamar al modal de nuevo presupuesto (que abrirá el editor)
    if (typeof window.mostrarModalNuevoPresupuesto === 'function') {
        window.mostrarModalNuevoPresupuesto();
    } else {
        mostrarNotificacion('No se pudo abrir el editor de presupuestos', 'error');
    }
};

// ==================== EXPORTAR CSV ====================

window.exportarUnidadesCSV = () => {
    const db = getDB();
    const unidades = db.unidades || [];
    if (unidades.length === 0) { mostrarNotificacion('No hay unidades para exportar', 'warning'); return; }

    const headers = ['Patente', 'Marca/Modelo', 'Año', 'Color', 'Motor', 'Km Actual', 'Km Próximo Service', 'Fecha Próximo Service', 'Cliente', 'Último Servicio', 'Total Facturado'];

    const filas = unidades.map(u => {
        const h = obtenerHistorialUnidad(u.patente);
        const total = h ? h.totales.totalVendido : 0;
        return [
            formatearPatente(u.patente),
            u.marcaModelo || '',
            u.anio || '',
            u.color || '',
            u.motor || '',
            u.kmActual || '',
            u.kmProximoService || '',
            u.fechaProximoService || '',
            u.clienteNombre || '',
            u.fechaUltimoServicio ? formatDate(u.fechaUltimoServicio) : '',
            total
        ];
    });

    const csv = [headers, ...filas].map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unidades_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarNotificacion(`✅ ${unidades.length} unidades exportadas`, 'success');
};

// ==================== FUNCIONES GLOBALES ====================

window.verDetalleUnidad = (patente) => {
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = renderDetalleUnidad(patente);
};

window.aplicarFiltroUnidades = () => {
    const busqueda = document.getElementById('filtroBusquedaUnidades')?.value || '';
    const service = document.getElementById('filtroServiceUnidades')?.value || 'todos';
    const cliente = document.getElementById('filtroClienteUnidades')?.value || 'todos';
    localStorage.setItem('unidadesFiltroBusqueda', busqueda);
    localStorage.setItem('unidadesFiltroService', service);
    localStorage.setItem('unidadesFiltroCliente', cliente);
    window.showView('unidades');
};

window.limpiarFiltroUnidades = () => {
    localStorage.removeItem('unidadesFiltroBusqueda');
    localStorage.removeItem('unidadesFiltroService');
    localStorage.removeItem('unidadesFiltroCliente');
    window.showView('unidades');
};

window.filtrarPorCliente = (cliente) => {
    localStorage.setItem('unidadesFiltroCliente', cliente);
    localStorage.removeItem('unidadesFiltroBusqueda');
    localStorage.removeItem('unidadesFiltroService');
    localStorage.setItem('unidadesVistaModo', 'lista');
    window.showView('unidades');
};

window.toggleVistaUnidades = () => {
    const actual = localStorage.getItem('unidadesVistaModo') || 'lista';
    const nuevo = actual === 'lista' ? 'clientes' : 'lista';
    localStorage.setItem('unidadesVistaModo', nuevo);
    window.showView('unidades');
};

window.migrarUnidadesDesdePresupuestosUI = () => {
    if (!confirm('¿Crear unidades a partir de los presupuestos existentes?')) return;
    const creadas = migrarUnidadesDesdePresupuestos();
    mostrarNotificacion(`✅ ${creadas} unidad(es) creada(s)`, 'success');
    window.showView('unidades');
};

// ==================== EVENTOS ====================
export function initUnidadesEvents() {
    // No hay eventos específicos por ahora; todo se maneja con onclick inline
}
