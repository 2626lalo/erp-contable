// ============================================================
// MÓDULO GASTOS PERSONALES - VERSIÓN CORREGIDA
// ============================================================

import { mostrarNotificacion } from './utils.js';

const CATEGORIAS = [
    "🍕 Alimentación", "🚗 Transporte", "🛍️ Compras", "🎮 Entretenimiento",
    "🏥 Salud", "📚 Educación", "👕 Vestimenta", "📱 Servicios", "💰 Ahorros",
    "🏦 Tarjetas", "🎁 Regalos", "✈️ Viajes", "💼 Trabajo", "💊 Farmacia", "🐾 Mascotas", "📦 Otros"
];

// --- Funciones Auxiliares ---
function formatMonto(monto) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(monto);
}
function escapeHtml(text) { if (!text) return ''; return text.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
function generarId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 6); }
function getFechaActualISO() { const hoy = new Date(); return `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`; }
function getFechaISO() { return new Date().toISOString(); }
function fechaToStorage(fecha) { if (!fecha) return ''; const partes = fecha.split('/'); if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`; return fecha; }
function fechaToDisplay(fecha) { if (!fecha) return ''; if (fecha.includes('/')) return fecha; const partes = fecha.split('-'); if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`; return fecha; }

// --- Función para obtener resumen de cuotas de una tarjeta ---
function getResumenCuotasTarjeta(data, tarjetaId) {
    const cuotasActivas = data.cuotas.filter(c => c.tarjetaId === tarjetaId && c.estado === 'activa');
    if (cuotasActivas.length === 0) return null;
    const totalDeuda = cuotasActivas.reduce((sum, c) => sum + (c.montoCuota * c.cuotasRestantes), 0);
    const proximasCuotas = [];
    for (const cuota of cuotasActivas) {
        proximasCuotas.push({
            concepto: cuota.concepto.length > 20 ? cuota.concepto.substring(0, 20) + '...' : cuota.concepto,
            monto: cuota.montoCuota,
            vencimiento: cuota.proximoPago,
            cuotaActual: cuota.cuotasPagadas + 1,
            totalCuotas: cuota.cuotasTotales
        });
    }
    proximasCuotas.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
    return { totalDeuda, cantidadCuotas: cuotasActivas.length, proximas: proximasCuotas.slice(0, 3) };
}

function getResumenGastosPendientesTarjeta(data, tarjetaId) {
    const gastos = data.gastosPendientes.filter(g => g.tarjetaId === tarjetaId && g.estado === 'pendiente');
    if (gastos.length === 0) return null;
    const totalPendiente = gastos.reduce((sum, g) => sum + g.montoRestante, 0);
    return { totalPendiente, cantidadGastos: gastos.length };
}

// --- Modal de confirmación ---
function mostrarModalConfirmacion(opciones) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content w-full max-w-md">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">${opciones.titulo || 'Confirmar'}</h2>
                    <button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button>
                </div>
                <div class="p-4 rounded-lg text-center ${opciones.tipo === 'danger' ? 'bg-red-50' : 'bg-blue-50'}">
                    <p class="text-${opciones.tipo === 'danger' ? 'red' : 'blue'}-800">${opciones.mensaje}</p>
                    ${opciones.detalle ? `<p class="text-xs text-gray-500 mt-2">${opciones.detalle}</p>` : ''}
                </div>
                <div class="flex gap-3 mt-5">
                    <button id="confirmarBtn" class="flex-1 ${opciones.tipo === 'danger' ? 'bg-red-600' : 'bg-green-600'} text-white py-2 rounded">Confirmar</button>
                    <button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#confirmarBtn').onclick = () => { modal.remove(); resolve(true); };
        modal.querySelector('#cancelarBtn').onclick = () => { modal.remove(); resolve(false); };
        modal.querySelector('.cerrar-modal').onclick = () => { modal.remove(); resolve(false); };
    });
}

// --- Estado y Persistencia ---
let datosCache = null;
function cargarDatos() {
    try {
        const guardado = localStorage.getItem('gastosPersonales');
        if (guardado) {
            const data = JSON.parse(guardado);
            if (!data.tarjetas) data.tarjetas = [];
            if (!data.movimientos) data.movimientos = [];
            if (!data.gastosPendientes) data.gastosPendientes = [];
            if (!data.cuotas) data.cuotas = [];
            const tieneEfectivo = data.tarjetas.some(t => t.id === 'efectivo');
            if (!tieneEfectivo) {
                data.tarjetas.unshift({ id: 'efectivo', nombre: '💵 Efectivo', saldo: 0, color: '#10b981', esEfectivo: true });
            }
            datosCache = data;
            return data;
        }
    } catch(e) { console.error("Error cargando:", e); }
    datosCache = {
        tarjetas: [{ id: 'efectivo', nombre: '💵 Efectivo', saldo: 0, color: '#10b981', esEfectivo: true }],
        movimientos: [],
        gastosPendientes: [],
        cuotas: [],
        ultimoDebito: null
    };
    return datosCache;
}
function guardarDatos(data) {
    localStorage.setItem('gastosPersonales', JSON.stringify(data));
    datosCache = data;
    window.dispatchEvent(new CustomEvent('gastosActualizados'));
    window.dispatchEvent(new Event('refreshView'));
}

// --- Verificar y debitar cuotas ---
function verificarYDebitarCuotas(data) {
    const hoyISO = getFechaActualISO();
    let cambios = false;
    if (data.ultimoDebito === hoyISO) return false;
    for (const cuota of data.cuotas) {
        if (cuota.estado !== 'activa') continue;
        if (cuota.proximoPago === hoyISO) {
            const tarjeta = data.tarjetas.find(t => t.id === cuota.tarjetaId);
            if (tarjeta && tarjeta.saldo >= cuota.montoCuota) {
                const saldoAnterior = tarjeta.saldo;
                tarjeta.saldo -= cuota.montoCuota;
                cuota.cuotasPagadas++;
                cuota.cuotasRestantes--;
                cuota.pagos.push({ fecha: getFechaISO(), monto: cuota.montoCuota, numero: cuota.cuotasPagadas });
                data.movimientos.unshift({
                    id: generarId(), tarjetaId: cuota.tarjetaId, tipo: 'gasto', monto: cuota.montoCuota,
                    descripcion: `📆 Débito automático: ${cuota.concepto} (Cuota ${cuota.cuotasPagadas}/${cuota.cuotasTotales})`,
                    fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo
                });
                const fechaObj = new Date(cuota.proximoPago);
                fechaObj.setMonth(fechaObj.getMonth() + 1);
                cuota.proximoPago = `${fechaObj.getFullYear()}-${(fechaObj.getMonth() + 1).toString().padStart(2, '0')}-${fechaObj.getDate().toString().padStart(2, '0')}`;
                cambios = true;
                if (cuota.cuotasRestantes <= 0) cuota.estado = 'completada';
            }
        }
    }
    if (cambios) data.ultimoDebito = hoyISO;
    return cambios;
}

// --- Alertas (NO débito automático) ---
let ultimasNotificaciones = {};
function verificarYMostrarAlertasGastos(data) {
    const hoy = new Date();
    const hoyISO = getFechaActualISO();
    const alertas = [];
    for (const gasto of data.gastosPendientes) {
        if (gasto.estado !== 'pendiente') continue;
        if (!gasto.fechaVencimiento) continue;
        const fechaVencimiento = new Date(gasto.fechaVencimiento);
        const dias = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));
        if (dias === 3 && !ultimasNotificaciones[`${gasto.id}_3dias`]) {
            alertas.push({ tipo: 'warning', gasto, mensaje: `📅 "${gasto.concepto}" vence en 3 días - $${formatMonto(gasto.montoRestante)}` });
            ultimasNotificaciones[`${gasto.id}_3dias`] = hoyISO;
        } else if (dias === 1 && !ultimasNotificaciones[`${gasto.id}_1dia`]) {
            alertas.push({ tipo: 'urgent', gasto, mensaje: `🔴 "${gasto.concepto}" vence MAÑANA - $${formatMonto(gasto.montoRestante)}` });
            ultimasNotificaciones[`${gasto.id}_1dia`] = hoyISO;
        } else if (dias === 0 && !ultimasNotificaciones[`${gasto.id}_hoy`]) {
            alertas.push({ tipo: 'urgent', gasto, mensaje: `🔴 "${gasto.concepto}" VENCE HOY - $${formatMonto(gasto.montoRestante)}` });
            ultimasNotificaciones[`${gasto.id}_hoy`] = hoyISO;
        } else if (dias < 0 && !ultimasNotificaciones[`${gasto.id}_vencido`]) {
            alertas.push({ tipo: 'error', gasto, mensaje: `❌ "${gasto.concepto}" venció - $${formatMonto(gasto.montoRestante)}` });
            ultimasNotificaciones[`${gasto.id}_vencido`] = hoyISO;
        }
    }
    return alertas;
}

function renderizarAlertas(data) {
    const alertas = verificarYMostrarAlertasGastos(data);
    if (alertas.length === 0) return '';
    return `<div class="space-y-2 mb-4">${alertas.map(a => `<div class="bg-orange-100 border-l-4 border-orange-600 rounded-lg p-3"><div class="flex justify-between"><p class="text-orange-800 text-sm">${a.mensaje}</p><button onclick="window.pagarGastoPendiente('${a.gasto.id}')" class="bg-orange-600 text-white px-3 py-1 rounded text-xs">Pagar</button></div></div>`).join('')}</div>`;
}

function verificarYDebitarGastosPendientes(data) { return false; }

// ==================== MODALES ====================

window.mostrarModalTarjeta = () => {
    const modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">💳 Nueva Tarjeta</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><div><label class="block text-sm font-medium mb-1">🏷️ Nombre</label><input type="text" id="nombre" class="w-full p-2 border rounded"></div><div><label class="block text-sm font-medium mb-1">💰 Saldo inicial</label><input type="number" id="saldo" value="0" step="0.01" class="w-full p-2 border rounded"></div><div><label class="block text-sm font-medium mb-1">🎨 Color</label><input type="color" id="color" value="#3b82f6" class="w-full h-10 p-1 border rounded"></div></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Crear</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        const nombre = modal.querySelector('#nombre').value.trim();
        if (!nombre) { mostrarNotificacion('Ingrese nombre', 'error'); return; }
        const data = cargarDatos();
        const saldo = parseFloat(modal.querySelector('#saldo').value) || 0;
        const nuevaTarjeta = { id: generarId(), nombre, saldo, color: modal.querySelector('#color').value, esEfectivo: false, movimientos: [] };
        data.tarjetas.push(nuevaTarjeta);
        if (saldo !== 0) data.movimientos.unshift({ id: generarId(), tarjetaId: nuevaTarjeta.id, tipo: 'ingreso', monto: saldo, descripcion: 'Saldo inicial', fecha: getFechaISO(), saldoPost: saldo });
        guardarDatos(data);
        mostrarNotificacion(`✅ Tarjeta "${nombre}" creada`, 'success');
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.mostrarModalCuota = () => {
    const data = cargarDatos();
    const tarjetas = data.tarjetas.filter(t => !t.esEfectivo);
    if (tarjetas.length === 0) return mostrarNotificacion('Primero crea una tarjeta de crédito', 'warning');
    const modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">📆 Nueva Cuota</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><input type="text" id="descripcion" placeholder="Descripción" class="w-full p-2 border rounded"><select id="tarjetaId" class="w-full p-2 border rounded">${tarjetas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}</select><input type="number" id="totalCuotas" value="3" class="w-full p-2 border rounded" placeholder="Total cuotas"><input type="number" id="montoTotal" step="0.01" class="w-full p-2 border rounded" placeholder="Monto total"><input type="text" id="proximoPago" placeholder="Primer vencimiento DD/MM/YYYY" class="w-full p-2 border rounded"></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Guardar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        const descripcion = modal.querySelector('#descripcion').value.trim();
        const montoTotal = parseFloat(modal.querySelector('#montoTotal').value);
        const totalCuotas = parseInt(modal.querySelector('#totalCuotas').value);
        const proximoPagoRaw = modal.querySelector('#proximoPago').value;
        if (!descripcion || !montoTotal || !totalCuotas || !proximoPagoRaw) { mostrarNotificacion('Complete todos los campos', 'error'); return; }
        const data = cargarDatos();
        const montoCuota = montoTotal / totalCuotas;
        const proximoPago = fechaToStorage(proximoPagoRaw);
        data.cuotas.push({ id: generarId(), tarjetaId: modal.querySelector('#tarjetaId').value, concepto: descripcion, montoTotal, montoCuota, cuotasTotales: totalCuotas, cuotasPagadas: 0, cuotasRestantes: totalCuotas, proximoPago, estado: 'activa', pagos: [] });
        guardarDatos(data);
        mostrarNotificacion(`✅ Compra en ${totalCuotas} cuotas registrada`, 'success');
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.editarTarjeta = async (tarjetaId) => {
    const data = cargarDatos();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">✏️ Editar ${escapeHtml(tarjeta.nombre)}</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><input type="text" id="nombre" value="${escapeHtml(tarjeta.nombre)}" class="w-full p-2 border rounded"><input type="color" id="color" value="${tarjeta.color}" class="w-full h-10 p-1 border rounded"><div class="flex gap-2"><input type="number" id="ajusteSaldo" step="0.01" class="flex-1 p-2 border rounded" placeholder="Ajuste"><select id="tipoAjuste" class="p-2 border rounded"><option value="sumar">➕ Sumar</option><option value="restar">➖ Restar</option></select></div></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Guardar</button><button id="eliminarBtn" class="bg-red-600 text-white py-2 rounded">🗑️ Eliminar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        tarjeta.nombre = modal.querySelector('#nombre').value;
        tarjeta.color = modal.querySelector('#color').value;
        const ajuste = parseFloat(modal.querySelector('#ajusteSaldo').value);
        if (ajuste && ajuste !== 0) {
            const tipo = modal.querySelector('#tipoAjuste').value;
            const saldoAnterior = tarjeta.saldo;
            if (tipo === 'sumar') { tarjeta.saldo += ajuste; data.movimientos.unshift({ id: generarId(), tarjetaId, tipo: 'ingreso', monto: ajuste, descripcion: 'Ajuste manual (+)', fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo }); }
            else { tarjeta.saldo -= ajuste; data.movimientos.unshift({ id: generarId(), tarjetaId, tipo: 'gasto', monto: ajuste, descripcion: 'Ajuste manual (-)', fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo }); }
        }
        guardarDatos(data); modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#eliminarBtn').onclick = async () => { if (await mostrarModalConfirmacion({ titulo: 'Eliminar Tarjeta', mensaje: `¿Eliminar "${tarjeta.nombre}"?`, tipo: 'danger' })) { data.tarjetas = data.tarjetas.filter(t => t.id !== tarjetaId); data.movimientos = data.movimientos.filter(m => m.tarjetaId !== tarjetaId); data.cuotas = data.cuotas.filter(c => c.tarjetaId !== tarjetaId); guardarDatos(data); mostrarNotificacion('Tarjeta eliminada', 'info'); modal.remove(); window.dispatchEvent(new Event('refreshView')); } };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.editarCuota = async (cuotaId) => {
    const data = cargarDatos();
    const cuota = data.cuotas.find(c => c.id === cuotaId);
    if (!cuota) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">✏️ Editar Cuota</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><input type="text" id="concepto" value="${escapeHtml(cuota.concepto)}" class="w-full p-2 border rounded"><input type="number" id="montoTotal" value="${cuota.montoTotal}" step="0.01" class="w-full p-2 border rounded"><input type="number" id="cuotasTotales" value="${cuota.cuotasTotales}" class="w-full p-2 border rounded"><input type="number" id="cuotasPagadas" value="${cuota.cuotasPagadas}" class="w-full p-2 border rounded"><input type="text" id="proximoPago" value="${fechaToDisplay(cuota.proximoPago)}" class="w-full p-2 border rounded"></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Guardar</button><button id="eliminarBtn" class="bg-red-600 text-white py-2 rounded">🗑️ Eliminar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        cuota.concepto = modal.querySelector('#concepto').value;
        cuota.montoTotal = parseFloat(modal.querySelector('#montoTotal').value);
        cuota.cuotasTotales = parseInt(modal.querySelector('#cuotasTotales').value);
        cuota.cuotasPagadas = parseInt(modal.querySelector('#cuotasPagadas').value);
        cuota.cuotasRestantes = cuota.cuotasTotales - cuota.cuotasPagadas;
        cuota.montoCuota = cuota.montoTotal / cuota.cuotasTotales;
        const proximo = modal.querySelector('#proximoPago').value;
        if (proximo) cuota.proximoPago = fechaToStorage(proximo);
        cuota.estado = cuota.cuotasRestantes <= 0 ? 'completada' : 'activa';
        guardarDatos(data); modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#eliminarBtn').onclick = async () => { if (await mostrarModalConfirmacion({ titulo: 'Eliminar Cuota', mensaje: `¿Eliminar "${cuota.concepto}"?`, tipo: 'danger' })) { data.cuotas = data.cuotas.filter(c => c.id !== cuotaId); guardarDatos(data); mostrarNotificacion('Cuota eliminada', 'info'); modal.remove(); window.dispatchEvent(new Event('refreshView')); } };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.pagarCuota = async (cuotaId) => {
    const data = cargarDatos();
    const cuota = data.cuotas.find(c => c.id === cuotaId);
    if (!cuota || cuota.estado !== 'activa') return;
    const tarjeta = data.tarjetas.find(t => t.id === cuota.tarjetaId);
    if (!tarjeta) return;
    if (await mostrarModalConfirmacion({ titulo: 'Pagar Cuota', mensaje: `¿Pagar cuota de ${cuota.concepto} por $${formatMonto(cuota.montoCuota)}?` })) {
        const saldoAnterior = tarjeta.saldo;
        tarjeta.saldo -= cuota.montoCuota;
        cuota.cuotasPagadas++; cuota.cuotasRestantes--;
        cuota.pagos.push({ fecha: getFechaISO(), monto: cuota.montoCuota, numero: cuota.cuotasPagadas });
        data.movimientos.unshift({ id: generarId(), tarjetaId: cuota.tarjetaId, tipo: 'gasto', monto: cuota.montoCuota, descripcion: `Cuota ${cuota.cuotasPagadas}/${cuota.cuotasTotales} - ${cuota.concepto}`, fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo });
        if (cuota.cuotasRestantes <= 0) cuota.estado = 'completada';
        else { const fecha = new Date(cuota.proximoPago); fecha.setMonth(fecha.getMonth() + 1); cuota.proximoPago = `${fecha.getFullYear()}-${(fecha.getMonth()+1).toString().padStart(2,'0')}-${fecha.getDate().toString().padStart(2,'0')}`; }
        guardarDatos(data);
        mostrarNotificacion(`✅ Cuota ${cuota.cuotasPagadas}/${cuota.cuotasTotales} pagada`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.verMovimientos = (tarjetaId) => {
    const data = cargarDatos();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    const movimientos = data.movimientos.filter(m => m.tarjetaId === tarjetaId).slice(0, 30);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md max-h-96 overflow-auto"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">📋 Movimientos - ${escapeHtml(tarjeta.nombre)}</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="mb-3 p-2 bg-gray-100 rounded text-center">Saldo: $${formatMonto(tarjeta.saldo)}</div><div class="space-y-2">${movimientos.length === 0 ? '<p class="text-center text-gray-400">Sin movimientos</p>' : movimientos.map(m => `<div class="border-b py-2"><div class="flex justify-between"><span>${m.tipo === 'ingreso' ? '💰' : '💸'} ${escapeHtml(m.descripcion)}</span><span class="font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">${m.tipo === 'ingreso' ? '+' : '-'}$${formatMonto(m.monto)}</span></div><div class="text-xs text-gray-400">${new Date(m.fecha).toLocaleDateString()} | Saldo: $${formatMonto(m.saldoPost)}</div></div>`).join('')}</div><button id="cerrarBtn" class="mt-4 w-full bg-gray-300 py-2 rounded">Cerrar</button></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cerrarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.verCuotas = (tarjetaId) => {
    const data = cargarDatos();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    const cuotas = data.cuotas.filter(c => c.tarjetaId === tarjetaId);
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md max-h-96 overflow-auto"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">📆 Cuotas - ${escapeHtml(tarjeta.nombre)}</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3">${cuotas.map(c => `<div class="border rounded-lg p-3"><div class="flex justify-between font-bold">${escapeHtml(c.concepto)}<span class="text-orange-600">$${formatMonto(c.montoCuota)}/mes</span></div><div class="text-sm">Cuota ${c.cuotasPagadas+1}/${c.cuotasTotales} • Restan ${c.cuotasRestantes}</div><div class="mt-2 h-2 bg-gray-200 rounded-full"><div class="h-full bg-green-500 rounded-full" style="width: ${(c.cuotasPagadas/c.cuotasTotales)*100}%"></div></div><div class="text-xs text-gray-500">Próximo: ${fechaToDisplay(c.proximoPago)}</div>${c.estado === 'activa' ? `<button onclick="window.pagarCuota('${c.id}')" class="mt-2 w-full bg-green-600 text-white px-3 py-1 rounded text-sm">💰 Pagar</button>` : ''}<button onclick="window.editarCuota('${c.id}')" class="mt-1 w-full bg-blue-100 text-blue-600 px-3 py-1 rounded text-sm">✏️ Editar</button></div>`).join('')}${cuotas.length === 0 ? '<p class="text-center text-gray-400">No hay cuotas</p>' : ''}</div><button id="cerrarBtn" class="mt-4 w-full bg-gray-300 py-2 rounded">Cerrar</button></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#cerrarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.ingresoRapidoTarjeta = (tarjetaId) => {
    const data = cargarDatos();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">💰 Ingreso a ${escapeHtml(tarjeta.nombre)}</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><div class="bg-green-50 p-3 rounded text-center">Saldo actual: $${formatMonto(tarjeta.saldo)}</div><input type="text" id="concepto" class="w-full p-2 border rounded" placeholder="Concepto"><input type="number" id="monto" step="0.01" class="w-full p-2 border rounded" placeholder="Monto"></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Agregar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        const concepto = modal.querySelector('#concepto').value;
        const monto = parseFloat(modal.querySelector('#monto').value);
        if (!concepto || !monto) { mostrarNotificacion('Complete los campos', 'error'); return; }
        const saldoAnterior = tarjeta.saldo;
        tarjeta.saldo += monto;
        data.movimientos.unshift({ id: generarId(), tarjetaId, tipo: 'ingreso', monto, descripcion: concepto, fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo });
        guardarDatos(data);
        mostrarNotificacion(`✅ $${formatMonto(monto)} agregados`, 'success');
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.gastoRapidoTarjeta = (tarjetaId) => {
    const data = cargarDatos();
    const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
    if (!tarjeta) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">💸 Gasto desde ${escapeHtml(tarjeta.nombre)}</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><div class="${tarjeta.saldo >= 0 ? 'bg-green-50' : 'bg-red-50'} p-3 rounded text-center">Saldo: $${formatMonto(tarjeta.saldo)}</div><input type="text" id="concepto" class="w-full p-2 border rounded" placeholder="Concepto"><input type="number" id="monto" step="0.01" class="w-full p-2 border rounded" placeholder="Monto"><select id="categoria" class="w-full p-2 border rounded">${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-red-600 text-white py-2 rounded">✅ Registrar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        const concepto = modal.querySelector('#concepto').value;
        const monto = parseFloat(modal.querySelector('#monto').value);
        const categoria = modal.querySelector('#categoria').value;
        if (!concepto || !monto) { mostrarNotificacion('Complete los campos', 'error'); return; }
        const saldoAnterior = tarjeta.saldo;
        tarjeta.saldo -= monto;
        data.movimientos.unshift({ id: generarId(), tarjetaId, tipo: 'gasto', monto, descripcion: `${concepto} (${categoria})`, fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo });
        guardarDatos(data);
        mostrarNotificacion(`✅ Gasto de $${formatMonto(monto)} registrado`, 'success');
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.mostrarModalIngreso = () => {
    const data = cargarDatos();
    if (data.tarjetas.length === 0) { mostrarNotificacion('Crea una tarjeta primero', 'warning'); return; }
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">💰 Nuevo Ingreso</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><input type="text" id="concepto" class="w-full p-2 border rounded" placeholder="Concepto"><input type="number" id="monto" step="0.01" class="w-full p-2 border rounded" placeholder="Monto"><select id="tarjetaId" class="w-full p-2 border rounded">${data.tarjetas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)} ($${formatMonto(t.saldo)})</option>`).join('')}</select></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Registrar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        const concepto = modal.querySelector('#concepto').value;
        const monto = parseFloat(modal.querySelector('#monto').value);
        const tarjetaId = modal.querySelector('#tarjetaId').value;
        if (!concepto || !monto) { mostrarNotificacion('Complete los campos', 'error'); return; }
        const data = cargarDatos();
        const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
        if (!tarjeta) return;
        const saldoAnterior = tarjeta.saldo;
        tarjeta.saldo += monto;
        data.movimientos.unshift({ id: generarId(), tarjetaId, tipo: 'ingreso', monto, descripcion: concepto, fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo });
        guardarDatos(data);
        mostrarNotificacion(`✅ Ingreso de $${formatMonto(monto)} registrado`, 'success');
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.mostrarModalGasto = () => {
    const data = cargarDatos();
    if (data.tarjetas.length === 0) { mostrarNotificacion('Crea una tarjeta primero', 'warning'); return; }
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">💸 Nuevo Gasto</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><input type="text" id="concepto" class="w-full p-2 border rounded" placeholder="Concepto"><input type="number" id="monto" step="0.01" class="w-full p-2 border rounded" placeholder="Monto"><select id="categoria" class="w-full p-2 border rounded">${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select><div class="flex gap-4"><label><input type="radio" name="estadoPago" value="pagado" checked> Pagado ahora</label><label><input type="radio" name="estadoPago" value="pendiente"> Pendiente</label></div><div id="origenDiv"><select id="tarjetaId" class="w-full p-2 border rounded">${data.tarjetas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)} ($${formatMonto(t.saldo)})</option>`).join('')}</select></div><div id="vencimientoDiv" style="display:none"><input type="text" id="fechaVencimiento" placeholder="Fecha vencimiento DD/MM/YYYY" class="w-full p-2 border rounded"><p class="text-xs text-gray-500">⚠️ Se debitará automáticamente en esta fecha</p></div></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-red-600 text-white py-2 rounded">✅ Registrar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    const radios = modal.querySelectorAll('input[name="estadoPago"]');
    const origenDiv = modal.querySelector('#origenDiv');
    const vencimientoDiv = modal.querySelector('#vencimientoDiv');
    radios.forEach(r => r.addEventListener('change', () => { const esPendiente = document.querySelector('input[name="estadoPago"]:checked').value === 'pendiente'; origenDiv.style.display = esPendiente ? 'none' : 'block'; vencimientoDiv.style.display = esPendiente ? 'block' : 'none'; }));
    modal.querySelector('#guardarBtn').onclick = () => {
        const concepto = modal.querySelector('#concepto').value;
        const monto = parseFloat(modal.querySelector('#monto').value);
        const categoria = modal.querySelector('#categoria').value;
        const esPendiente = document.querySelector('input[name="estadoPago"]:checked').value === 'pendiente';
        if (!concepto || !monto) { mostrarNotificacion('Complete los campos', 'error'); return; }
        const data = cargarDatos();
        if (esPendiente) {
            const fechaVencimientoRaw = modal.querySelector('#fechaVencimiento').value;
            if (!fechaVencimientoRaw) { mostrarNotificacion('Ingrese fecha de vencimiento', 'error'); return; }
            data.gastosPendientes.push({ id: generarId(), concepto, monto, montoRestante: monto, categoria, tarjetaId: data.tarjetas[0]?.id, fechaVencimiento: fechaToStorage(fechaVencimientoRaw), estado: 'pendiente', fechaCreacion: getFechaISO(), pagos: [] });
            guardarDatos(data);
            mostrarNotificacion(`⏳ Gasto pendiente registrado`, 'success');
        } else {
            const tarjetaId = modal.querySelector('#tarjetaId').value;
            const tarjeta = data.tarjetas.find(t => t.id === tarjetaId);
            if (!tarjeta) return;
            const saldoAnterior = tarjeta.saldo;
            tarjeta.saldo -= monto;
            data.movimientos.unshift({ id: generarId(), tarjetaId, tipo: 'gasto', monto, descripcion: `${concepto} (${categoria})`, fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo });
            guardarDatos(data);
            mostrarNotificacion(`✅ Gasto de $${formatMonto(monto)} registrado`, 'success');
        }
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.editarGastoPendiente = async (gastoId) => {
    const data = cargarDatos();
    const gasto = data.gastosPendientes.find(g => g.id === gastoId);
    if (!gasto) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">✏️ Editar Gasto</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><input type="text" id="concepto" value="${escapeHtml(gasto.concepto)}" class="w-full p-2 border rounded"><input type="number" id="monto" value="${gasto.monto}" step="0.01" class="w-full p-2 border rounded"><input type="number" id="montoRestante" value="${gasto.montoRestante}" step="0.01" class="w-full p-2 border rounded"><input type="text" id="fechaVencimiento" value="${fechaToDisplay(gasto.fechaVencimiento)}" class="w-full p-2 border rounded"><select id="tarjetaId" class="w-full p-2 border rounded">${data.tarjetas.map(t => `<option value="${t.id}" ${gasto.tarjetaId === t.id ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('')}</select><select id="estado" class="w-full p-2 border rounded"><option value="pendiente" ${gasto.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option><option value="pagado" ${gasto.estado === 'pagado' ? 'selected' : ''}>Pagado</option></select></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Guardar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        gasto.concepto = modal.querySelector('#concepto').value;
        gasto.monto = parseFloat(modal.querySelector('#monto').value);
        gasto.montoRestante = parseFloat(modal.querySelector('#montoRestante').value);
        const fechaVencimientoRaw = modal.querySelector('#fechaVencimiento').value;
        if (fechaVencimientoRaw) gasto.fechaVencimiento = fechaToStorage(fechaVencimientoRaw);
        gasto.tarjetaId = modal.querySelector('#tarjetaId').value;
        gasto.estado = modal.querySelector('#estado').value;
        if (gasto.montoRestante <= 0) gasto.estado = 'pagado';
        guardarDatos(data); modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.eliminarGastoPendiente = async (gastoId) => {
    const data = cargarDatos();
    const gasto = data.gastosPendientes.find(g => g.id === gastoId);
    if (!gasto) return;
    if (await mostrarModalConfirmacion({ titulo: 'Eliminar Gasto', mensaje: `¿Eliminar "${gasto.concepto}"?`, tipo: 'danger' })) {
        data.gastosPendientes = data.gastosPendientes.filter(g => g.id !== gastoId);
        guardarDatos(data);
        mostrarNotificacion('Gasto eliminado', 'info');
        window.dispatchEvent(new Event('refreshView'));
    }
};

window.pagarGastoPendiente = async (gastoId) => {
    const data = cargarDatos();
    const gasto = data.gastosPendientes.find(g => g.id === gastoId);
    if (!gasto || gasto.estado !== 'pendiente') return;
    const opciones = [{ id: '', nombre: '💵 Efectivo' }, ...data.tarjetas.map(t => ({ id: t.id, nombre: t.nombre, saldo: t.saldo }))];
    const modalPago = document.createElement('div');
    modalPago.className = 'modal';
    modalPago.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">💰 Pagar ${escapeHtml(gasto.concepto)}</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><div class="bg-gray-50 p-3 rounded"><p class="text-sm">Monto: <span class="font-bold text-red-600">$${formatMonto(gasto.montoRestante)}</span></p></div><select id="medioPago" class="w-full p-2 border rounded">${opciones.map(o => `<option value="${o.id}">${o.nombre}${o.saldo !== undefined ? ` (Saldo: $${formatMonto(o.saldo)})` : ''}</option>`).join('')}</select><input type="text" id="comentario" class="w-full p-2 border rounded" placeholder="Comentario (opcional)"></div><div class="flex gap-3 mt-5"><button id="confirmarBtn" class="flex-1 bg-green-600 text-white py-2 rounded">✅ Pagar</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modalPago);
    modalPago.querySelector('#confirmarBtn').onclick = () => {
        const medioId = modalPago.querySelector('#medioPago').value;
        const comentario = modalPago.querySelector('#comentario').value;
        modalPago.remove();
        if (!medioId) {
            gasto.estado = 'pagado';
            gasto.fechaPago = getFechaISO();
            gasto.pagos.push({ fecha: getFechaISO(), monto: gasto.montoRestante, manual: true, comentario });
            guardarDatos(data);
            mostrarNotificacion(`✅ Gasto pagado en EFECTIVO`, 'success');
            window.dispatchEvent(new Event('refreshView'));
            return;
        }
        const tarjeta = data.tarjetas.find(t => t.id === medioId);
        if (!tarjeta) return;
        const saldoAnterior = tarjeta.saldo;
        tarjeta.saldo -= gasto.montoRestante;
        data.movimientos.unshift({ id: generarId(), tarjetaId: medioId, tipo: 'gasto', monto: gasto.montoRestante, descripcion: comentario ? `Pago: ${gasto.concepto} (${comentario})` : `Pago: ${gasto.concepto}`, fecha: getFechaISO(), saldoAnterior, saldoPost: tarjeta.saldo });
        gasto.estado = 'pagado';
        gasto.fechaPago = getFechaISO();
        gasto.pagos.push({ fecha: getFechaISO(), monto: gasto.montoRestante, manual: true, comentario, tarjetaId: medioId });
        guardarDatos(data);
        mostrarNotificacion(`✅ Gasto pagado con ${tarjeta.nombre}`, 'success');
        window.dispatchEvent(new Event('refreshView'));
    };
    modalPago.querySelector('#cancelarBtn').onclick = () => modalPago.remove();
    modalPago.querySelector('.cerrar-modal').onclick = () => modalPago.remove();
};

window.mostrarModalTransferencia = () => {
    const data = cargarDatos();
    if (data.tarjetas.length < 2) return mostrarNotificacion('Necesitas al menos 2 tarjetas', 'warning');
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content w-full max-w-md"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold">🔄 Transferencia</h2><button class="text-gray-400 hover:text-gray-600 text-2xl cerrar-modal">×</button></div><div class="space-y-3"><select id="origenId" class="w-full p-2 border rounded">${data.tarjetas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)} ($${formatMonto(t.saldo)})</option>`).join('')}</select><select id="destinoId" class="w-full p-2 border rounded">${data.tarjetas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)} ($${formatMonto(t.saldo)})</option>`).join('')}</select><input type="number" id="monto" step="0.01" class="w-full p-2 border rounded" placeholder="Monto"><input type="text" id="descripcion" class="w-full p-2 border rounded" placeholder="Descripción"></div><div class="flex gap-3 mt-5"><button id="guardarBtn" class="flex-1 bg-purple-600 text-white py-2 rounded">✅ Transferir</button><button id="cancelarBtn" class="flex-1 bg-gray-300 py-2 rounded">❌ Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guardarBtn').onclick = () => {
        const origenId = modal.querySelector('#origenId').value;
        const destinoId = modal.querySelector('#destinoId').value;
        const monto = parseFloat(modal.querySelector('#monto').value);
        if (origenId === destinoId) { mostrarNotificacion('No puedes transferir a la misma cuenta', 'error'); return; }
        if (!monto || monto <= 0) { mostrarNotificacion('Monto inválido', 'error'); return; }
        const data = cargarDatos();
        const tarjetaOrigen = data.tarjetas.find(t => t.id === origenId);
        const tarjetaDestino = data.tarjetas.find(t => t.id === destinoId);
        if (!tarjetaOrigen || !tarjetaDestino) return;
        const descripcion = modal.querySelector('#descripcion').value || 'Transferencia';
        const saldoOrigen = tarjetaOrigen.saldo;
        tarjetaOrigen.saldo -= monto;
        data.movimientos.unshift({ id: generarId(), tarjetaId: origenId, tipo: 'transferencia_salida', monto, descripcion: `${descripcion} → ${tarjetaDestino.nombre}`, fecha: getFechaISO(), saldoAnterior: saldoOrigen, saldoPost: tarjetaOrigen.saldo });
        const saldoDestino = tarjetaDestino.saldo;
        tarjetaDestino.saldo += monto;
        data.movimientos.unshift({ id: generarId(), tarjetaId: destinoId, tipo: 'transferencia_entrada', monto, descripcion: `${descripcion} ← ${tarjetaOrigen.nombre}`, fecha: getFechaISO(), saldoAnterior: saldoDestino, saldoPost: tarjetaDestino.saldo });
        guardarDatos(data);
        mostrarNotificacion(`✅ Transferencia de $${formatMonto(monto)} realizada`, 'success');
        modal.remove(); window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#cancelarBtn').onclick = () => modal.remove();
    modal.querySelector('.cerrar-modal').onclick = () => modal.remove();
};

window.limpiarTodosLosDatosGastos = async () => {
    if (await mostrarModalConfirmacion({ titulo: '⚠️ LIMPIAR DATOS', mensaje: '¿Eliminar TODOS los datos?', tipo: 'danger' })) {
        localStorage.removeItem('gastosPersonales');
        mostrarNotificacion('✅ Datos eliminados', 'success');
        window.dispatchEvent(new Event('refreshView'));
    }
};

// --- RENDER PRINCIPAL ---
function renderGastosPendientesSeccion(data) {
    const gastos = data.gastosPendientes.filter(g => g.estado === 'pendiente');
    const total = gastos.reduce((s, g) => s + g.montoRestante, 0);
    if (gastos.length === 0) return `<div class="bg-white rounded-2xl shadow overflow-hidden mt-5"><div class="bg-yellow-50 px-4 py-3 font-bold border-b"><span>⏳ Gastos Pendientes</span><span class="ml-2 text-sm text-gray-500">Total: $${formatMonto(total)}</span></div><div class="p-8 text-center text-gray-400">No hay gastos pendientes</div></div>`;
    return `<div class="bg-white rounded-2xl shadow overflow-hidden mt-5"><div class="bg-yellow-50 px-4 py-3 font-bold border-b"><span>⏳ Gastos Pendientes (${gastos.length})</span><span class="ml-2 text-sm text-gray-500">Total: $${formatMonto(total)}</span></div><div class="divide-y">${gastos.map(g => `<div class="p-3 hover:bg-gray-50"><div class="flex justify-between"><div><p class="font-medium">${escapeHtml(g.concepto)}</p><div class="flex gap-2 mt-1 text-xs text-gray-500"><span>📂 ${g.categoria}</span>${g.fechaVencimiento ? `<span>Vence: ${fechaToDisplay(g.fechaVencimiento)}</span>` : '<span>Sin fecha</span>'}</div></div><div class="text-right"><p class="font-bold text-red-600">$${formatMonto(g.montoRestante)}</p><p class="text-xs text-gray-400">Total: $${formatMonto(g.monto)}</p></div></div><div class="mt-2 flex justify-end gap-2"><button onclick="window.pagarGastoPendiente('${g.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-sm">💰 Pagar</button><button onclick="window.editarGastoPendiente('${g.id}')" class="bg-blue-100 text-blue-600 px-3 py-1 rounded text-sm">✏️ Editar</button><button onclick="window.eliminarGastoPendiente('${g.id}')" class="bg-red-100 text-red-600 px-3 py-1 rounded text-sm">🗑️ Eliminar</button></div></div>`).join('')}</div></div>`;
}

function renderTarjetasFinal(data) {
    if (data.tarjetas.length === 0) return `<div class="bg-white rounded-2xl shadow p-8 text-center"><p>No hay tarjetas</p><button onclick="window.mostrarModalTarjeta()" class="mt-3 text-blue-600">+ Agregar</button></div>`;
    return data.tarjetas.map(t => {
        const esEfectivo = t.id === 'efectivo';
        const resumenCuotas = !esEfectivo ? getResumenCuotasTarjeta(data, t.id) : null;
        const resumenGastos = getResumenGastosPendientesTarjeta(data, t.id);
        return `<div class="rounded-2xl p-5 text-white shadow-lg" style="background: ${esEfectivo ? 'linear-gradient(135deg, #059669, #047857)' : `linear-gradient(135deg, ${t.color}, ${t.color}cc)`}">
            <div class="flex justify-between items-start"><div><p class="text-sm opacity-90">${escapeHtml(t.nombre)}</p><p class="text-3xl font-bold mt-1">$${formatMonto(t.saldo)}</p></div><div class="flex gap-1"><button onclick="window.ingresoRapidoTarjeta('${t.id}')" class="bg-white/20 rounded-full p-2">💰</button><button onclick="window.gastoRapidoTarjeta('${t.id}')" class="bg-white/20 rounded-full p-2">💸</button></div></div>
            ${resumenCuotas ? `<div class="mt-3 pt-2 border-t border-white/20"><div class="flex justify-between text-xs"><span>📆 Cuotas (${resumenCuotas.cantidadCuotas})</span><span>$${formatMonto(resumenCuotas.totalDeuda)}</span></div><div class="mt-1">${resumenCuotas.proximas.map(c => `<div class="flex justify-between text-[11px]"><span>${c.concepto}</span><span>$${formatMonto(c.monto)} · ${fechaToDisplay(c.vencimiento).slice(0,5)}</span></div>`).join('')}</div></div>` : (!esEfectivo ? `<div class="mt-3 pt-2 border-t border-white/20 text-xs text-center">✅ Sin cuotas</div>` : '')}
            ${resumenGastos ? `<div class="mt-3 pt-2 border-t border-white/20"><div class="flex justify-between text-xs"><span>⏳ Gastos pendientes (${resumenGastos.cantidadGastos})</span><span>$${formatMonto(resumenGastos.totalPendiente)}</span></div></div>` : ''}
            <div class="flex justify-between mt-3 pt-2 border-t border-white/20"><button onclick="window.verMovimientos('${t.id}')" class="text-xs">📋 Movimientos</button><button onclick="window.verCuotas('${t.id}')" class="text-xs">📆 Cuotas</button><button onclick="window.editarTarjeta('${t.id}')" class="text-xs">✏️ Editar</button></div>
        </div>`;
    }).join('');
}

function renderMovimientos(data) {
    const movs = data.movimientos.slice(0, 10);
    if (movs.length === 0) return '<div class="p-8 text-center text-gray-400">No hay movimientos</div>';
    return movs.map(m => `<div class="flex justify-between items-center p-3 border-b"><div><p class="font-medium">${escapeHtml(m.descripcion)}</p><p class="text-xs text-gray-400">${new Date(m.fecha).toLocaleDateString()}</p></div><p class="font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">${m.tipo === 'ingreso' ? '+' : '-'}$${formatMonto(m.monto)}</p></div>`).join('');
}

export function renderGastosPersonales() {
    try {
        const data = cargarDatos();
        verificarYDebitarCuotas(data);
        const saldoTotal = data.tarjetas.reduce((s, t) => s + t.saldo, 0);
        const gastosPendientesTotal = data.gastosPendientes.filter(g => g.estado === 'pendiente').reduce((s, g) => s + g.montoRestante, 0);
        const deudaCuotas = data.cuotas.filter(c => c.estado === 'activa').reduce((s, c) => s + (c.montoCuota * c.cuotasRestantes), 0);
        const alertasHtml = renderizarAlertas(data);
        return `<div class="space-y-5 pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold">💰 Gastos Personales</h1>
                <div class="flex gap-2 flex-wrap">
                    <button onclick="window.mostrarModalIngreso()" class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm">➕ Ingreso</button>
                    <button onclick="window.mostrarModalGasto()" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">💸 Gasto</button>
                    <button onclick="window.mostrarModalTransferencia()" class="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm">🔄 Transferir</button>
                    <button onclick="window.mostrarModalCuota()" class="bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm">📆 Cuotas</button>
                    <button onclick="window.limpiarTodosLosDatosGastos()" class="bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm">🗑️ Limpiar</button>
                </div>
            </div>
            ${alertasHtml}
            <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
                <p class="text-sm opacity-90">💰 Balance Global</p>
                <p class="text-3xl font-bold">$${formatMonto(saldoTotal)}</p>
                <div class="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div class="bg-white/10 rounded-lg p-2 text-center"><div>💳 Deuda cuotas</div><div class="font-bold">$${formatMonto(deudaCuotas)}</div></div>
                    <div class="bg-white/10 rounded-lg p-2 text-center"><div>📋 Gastos pendientes</div><div class="font-bold">$${formatMonto(gastosPendientesTotal)}</div></div>
                    <div class="bg-white/10 rounded-lg p-2 text-center"><div>📊 Disponible real</div><div class="font-bold">$${formatMonto(saldoTotal - deudaCuotas - gastosPendientesTotal)}</div></div>
                </div>
            </div>
            <div><div class="flex justify-between items-center mb-3"><h2 class="font-bold text-lg">💳 Mis Tarjetas</h2><button onclick="window.mostrarModalTarjeta()" class="text-blue-600 text-sm">+ Agregar</button></div><div class="grid gap-3">${renderTarjetasFinal(data)}</div></div>
            ${renderGastosPendientesSeccion(data)}
            <div class="bg-white rounded-2xl shadow overflow-hidden"><div class="bg-gray-100 px-4 py-3 font-bold border-b">📋 Últimos movimientos</div><div class="divide-y">${renderMovimientos(data)}</div></div>
        </div>`;
    } catch(e) {
        console.error(e);
        return `<div class="p-8 text-center text-red-600">❌ Error: ${e.message}</div>`;
    }
}

export function initGastosPersonalesEvents() { console.log('✅ Gastos Personales inicializado'); }
