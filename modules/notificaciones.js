// ==================== modules/notificaciones.js ====================
// NOTIFICACIONES - Vencimientos y alertas en tiempo real
// ERP Contable Argentina - v7.0.0

import { getDB } from './db.js';
import { formatNumber, formatDate } from './utils.js';

// ==================== OBTENER ALERTAS ====================
export function obtenerAlertas() {
    const db = getDB();
    const alertas = [];

    // 1. Ventas pendientes de cobro (vencidas o por vencer en 7 días)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ventas = db.ventas || [];

    ventas.forEach(v => {
        if (v.estado === 'cobrado' || !v.fechaCobroEsperada) return;
        const fechaCobro = new Date(v.fechaCobroEsperada);
        fechaCobro.setHours(0, 0, 0, 0);
        const dias = Math.ceil((fechaCobro - hoy) / (1000 * 60 * 60 * 24));

        if (dias <= 7) {
            const gravedad = dias < 0 ? 'danger' : dias <= 3 ? 'warning' : 'info';
            alertas.push({
                id: `venta-${v.id}`,
                tipo: 'venta',
                titulo: dias < 0 ? '🔴 Cobro vencido' : '⏳ Cobro próximo',
                descripcion: `Cliente: ${v.clienteNombre} - $${formatNumber(v.total)}`,
                fecha: v.fechaCobroEsperada,
                diasRestantes: dias,
                gravedad: gravedad,
                link: 'ventas',
                datos: v
            });
        }
    });

    // 2. Costos fijos pendientes (vencidos o por vencer en 7 días)
    const costosFijos = db.costosFijos || [];
    costosFijos.forEach(c => {
        if (c.estado === 'pagado' || !c.vencimiento) return;
        const fechaVenc = new Date(c.vencimiento);
        fechaVenc.setHours(0, 0, 0, 0);
        const dias = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));

        if (dias <= 7) {
            const gravedad = dias < 0 ? 'danger' : dias <= 3 ? 'warning' : 'info';
            alertas.push({
                id: `costo-${c.id}`,
                tipo: 'costo_fijo',
                titulo: dias < 0 ? '🔴 Costo fijo vencido' : '⏳ Costo fijo próximo',
                descripcion: `${c.nombre} - $${formatNumber(c.monto)}`,
                fecha: c.vencimiento,
                diasRestantes: dias,
                gravedad: gravedad,
                link: 'configuracion',
                datos: c
            });
        }
    });

    // 3. Compras pendientes de pago (vencidas o por vencer en 7 días)
    const compras = db.compras || [];
    compras.forEach(c => {
        if (c.estadoPago === 'PAGADO' || !c.fechaVencimientoPago) return;
        const fechaVenc = new Date(c.fechaVencimientoPago);
        fechaVenc.setHours(0, 0, 0, 0);
        const dias = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));

        if (dias <= 7) {
            const gravedad = dias < 0 ? 'danger' : dias <= 3 ? 'warning' : 'info';
            alertas.push({
                id: `compra-${c.id}`,
                tipo: 'compra',
                titulo: dias < 0 ? '🔴 Pago de compra vencido' : '⏳ Pago de compra próximo',
                descripcion: `Proveedor: ${c.proveedorNombre} - $${formatNumber(c.totalFactura)}`,
                fecha: c.fechaVencimientoPago,
                diasRestantes: dias,
                gravedad: gravedad,
                link: 'compras',
                datos: c
            });
        }
    });

    // Ordenar por gravedad (danger primero, luego warning, luego info)
    const orden = { danger: 0, warning: 1, info: 2 };
    alertas.sort((a, b) => (orden[a.gravedad] || 3) - (orden[b.gravedad] || 3));

    return alertas;
}

// ==================== RENDER NOTIFICACIONES ====================
export function renderNotificaciones() {
    const alertas = obtenerAlertas();
    if (alertas.length === 0) {
        return `
            <div class="p-2 text-center text-gray-400 text-sm">
                ✅ No hay notificaciones
            </div>
        `;
    }

    return `
        <div class="max-h-80 overflow-y-auto">
            ${alertas.map(a => `
                <div class="p-2 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" 
                     onclick="window.irA('${a.link}')">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-sm font-medium ${a.gravedad === 'danger' ? 'text-red-600' : a.gravedad === 'warning' ? 'text-orange-600' : 'text-blue-600'}">
                                ${a.titulo}
                            </p>
                            <p class="text-xs text-gray-600 dark:text-gray-300">${a.descripcion}</p>
                            <p class="text-xs text-gray-400">${formatDate(a.fecha)} • ${a.diasRestantes < 0 ? `Vencido hace ${Math.abs(a.diasRestantes)} días` : `Vence en ${a.diasRestantes} días`}</p>
                        </div>
                        <span class="text-xs px-2 py-0.5 rounded-full ${a.gravedad === 'danger' ? 'bg-red-100 text-red-600' : a.gravedad === 'warning' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}">
                            ${a.diasRestantes < 0 ? '🔴' : a.diasRestantes <= 3 ? '🟠' : '🔵'}
                        </span>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="p-2 text-center text-xs text-gray-400 border-t dark:border-gray-700">
            ${alertas.length} alertas pendientes
        </div>
    `;
}

// ==================== NAVEGAR A SECCIÓN ====================
window.irA = (seccion) => {
    window.showView(seccion);
    const popup = document.getElementById('notificacionesPopup');
    if (popup) popup.remove();
};

// ==================== ACTUALIZAR CONTADOR (EXPORTADA) ====================
export function actualizarContadorNotificaciones() {
    const alertas = obtenerAlertas();
    const contador = document.getElementById('notificacionesContador');
    if (contador) {
        if (alertas.length > 0) {
            contador.textContent = alertas.length;
            contador.classList.remove('hidden');
        } else {
            contador.classList.add('hidden');
        }
    }
}

// ==================== INICIALIZAR EVENTOS ====================
export function initNotificacionesEvents() {
    // Actualizar notificaciones cada 60 segundos
    setInterval(() => {
        actualizarContadorNotificaciones();
    }, 60000);

    // Escuchar cambios en la DB para actualizar notificaciones
    document.addEventListener('refreshView', () => {
        setTimeout(actualizarContadorNotificaciones, 500);
    });
}

// ==================== POPUP DE NOTIFICACIONES ====================
window.mostrarNotificacionesPopup = () => {
    const modal = document.createElement('div');
    modal.id = 'notificacionesPopup';
    modal.className = 'fixed top-16 right-4 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl w-80 max-h-96 overflow-hidden border dark:border-gray-700';
    modal.innerHTML = `
        <div class="p-3 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 flex justify-between items-center">
            <h3 class="font-bold text-sm">🔔 Notificaciones</h3>
            <button onclick="this.closest('#notificacionesPopup').remove()" class="text-gray-500 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>
        <div class="p-2">
            ${renderNotificaciones()}
        </div>
    `;
    document.body.appendChild(modal);

    // Cerrar al hacer clic fuera
    document.addEventListener('click', function cerrar(e) {
        if (!modal.contains(e.target) && e.target.id !== 'notificacionesBtn') {
            modal.remove();
            document.removeEventListener('click', cerrar);
        }
    });
};
