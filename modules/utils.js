// ==================== modules/utils.js ====================
// UTILIDADES COMUNES - Con validación, modales, funciones de saldo e inputs de fecha
// ERP Contable Argentina - v7.16.2

import { getDB } from './db.js';

// ==================== FORMATEO ====================
export function formatNumber(num) { 
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('es-AR'); 
}

export function generarId() { 
    return Date.now(); 
}

export function calcularDiasRestantes(fecha) { 
    if (!fecha) return null; 
    return Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24)); 
}

export function formatDate(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatDateISO(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

// ==================== 🔥 v7.16.81: HELPERS DE FECHA LOCAL ====================
// Evitan el bug de zona horaria UTC-3 en Argentina:
// new Date('2026-10-05') → 2026-10-04 21:00:00 (retrocede 1 día)

/**
 * Devuelve la fecha de HOY como string 'YYYY-MM-DD' en horario LOCAL.
 * Evita el bug de toISOString() que a las 00:00-03:00 devuelve el día anterior.
 */
export function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parsea un string 'YYYY-MM-DD' como fecha LOCAL (no UTC).
 * Evita el bug de new Date('2026-10-05') que retrocede 1 día en UTC-3.
 */
export function parseFechaLocal(fechaStr) {
    if (!fechaStr) return null;
    const partes = String(fechaStr).split('-').map(Number);
    if (partes.length !== 3 || partes.some(isNaN)) return null;
    return new Date(partes[0], partes[1] - 1, partes[2]);
}

/**
 * Convierte un objeto Date a string 'YYYY-MM-DD' en horario LOCAL.
 * Evita el bug de toISOString() que usa UTC.
 */
export function dateToISO(fecha) {
    if (!fecha || isNaN(fecha)) return '';
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// ==================== FIN HELPERS DE FECHA LOCAL ====================

export function formatPercentage(numero, decimales = 2) {
    if (numero === undefined || numero === null) return '0%';
    return `${numero.toFixed(decimales)}%`;
}

export function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getEstadoColor(dias) { 
    if (dias < 0) return 'text-red-600 bg-red-100 dark:bg-red-900/30'; 
    if (dias === 0) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'; 
    if (dias <= 3) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'; 
    if (dias <= 7) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30'; 
    return 'text-green-600 bg-green-100 dark:bg-green-900/30'; 
}

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

export function cerrarModalPorId(id) {
    const modal = document.getElementById(id);
    if (modal) modal.remove();
}

// ==================== NOTIFICACIONES ====================
export function mostrarNotificacion(mensaje, tipo = 'success') {
    let notifContainer = document.getElementById('notificationContainer');
    if (!notifContainer) {
        notifContainer = document.createElement('div');
        notifContainer.id = 'notificationContainer';
        notifContainer.className = 'fixed top-4 right-4 space-y-2';
        notifContainer.style.zIndex = '99999';
        document.body.appendChild(notifContainer);
    } else {
        notifContainer.style.zIndex = '99999';
    }
    const notif = document.createElement('div');
    const bgColor = tipo === 'success' ? 'bg-green-500' : tipo === 'error' ? 'bg-red-500' : tipo === 'warning' ? 'bg-yellow-500' : 'bg-blue-500';
    const icono = tipo === 'success' ? '✅' : tipo === 'error' ? '❌' : tipo === 'warning' ? '⚠️' : 'ℹ️';
    notif.className = `notification ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg mb-3 flex items-center gap-3 transform transition-all duration-300`;
    notif.innerHTML = `<span class="text-xl">${icono}</span><span class="font-medium">${mensaje}</span>`;
    notifContainer.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// ==================== FUNCIONES DE SALDO ====================
export function calcularSaldoCliente(clienteId) {
    const db = getDB();
    const ventas = db.ventas || [];
    const ventasCliente = ventas.filter(v => v.clienteId === clienteId);
    const totalVentas = ventasCliente.reduce((s, v) => s + (v.total || 0), 0);
    const ventasCobradas = ventasCliente.filter(v => v.estado === 'cobrado');
    const totalCobrado = ventasCobradas.reduce((s, v) => s + (v.total || 0), 0);
    const saldo = totalVentas - totalCobrado;
    const ventasPendientes = ventasCliente.filter(v => v.estado !== 'cobrado');
    return { saldo, totalVentas, totalCobrado, ventasPendientes, cantidadVentasPendientes: ventasPendientes.length };
}

export function calcularSaldoProveedor(proveedorId) {
    const db = getDB();
    const compras = db.compras || [];
    const comprasProveedor = compras.filter(c => c.proveedorId === proveedorId);
    const totalCompras = comprasProveedor.reduce((s, c) => s + (c.totalFactura || 0), 0);
    const comprasPagadas = comprasProveedor.filter(c => c.estadoPago === 'PAGADO');
    const totalPagado = comprasPagadas.reduce((s, c) => s + (c.totalFactura || 0), 0);
    const saldo = totalCompras - totalPagado;
    const comprasPendientes = comprasProveedor.filter(c => c.estadoPago !== 'PAGADO');
    return { saldo, totalCompras, totalPagado, comprasPendientes, cantidadComprasPendientes: comprasPendientes.length };
}

export function obtenerComprasPendientesProveedor(proveedorId) {
    const db = getDB();
    const compras = db.compras || [];
    return compras.filter(c => c.proveedorId === proveedorId && c.estadoPago !== 'PAGADO');
}

export function obtenerVentasPendientesCliente(clienteId) {
    const db = getDB();
    const ventas = db.ventas || [];
    return ventas.filter(v => v.clienteId === clienteId && v.estado !== 'cobrado');
}

export function obtenerTotalVentasCliente(clienteId) {
    const db = getDB();
    const ventas = db.ventas || [];
    return ventas.filter(v => v.clienteId === clienteId).reduce((s, v) => s + (v.total || 0), 0);
}

export function obtenerTotalComprasProveedor(proveedorId) {
    const db = getDB();
    const compras = db.compras || [];
    return compras.filter(c => c.proveedorId === proveedorId).reduce((s, c) => s + (c.totalFactura || 0), 0);
}

// ==================== VALIDACIONES ====================
export function validarDatosEsenciales() {
    const db = getDB();
    const faltantes = [];
    
    const empresa = db.datosEmpresa || {};
    if (!empresa.nombre || !empresa.nombre.trim()) {
        faltantes.push({ seccion: 'empresa', campo: 'nombre', mensaje: 'Nombre de la empresa' });
    }
    if (!empresa.cuit || !empresa.cuit.trim()) {
        faltantes.push({ seccion: 'empresa', campo: 'cuit', mensaje: 'CUIT de la empresa' });
    }
    if (!db.clientes || db.clientes.length === 0) {
        faltantes.push({ seccion: 'clientes', campo: null, mensaje: 'Al menos un Cliente' });
    }
    if (!db.proveedores || db.proveedores.length === 0) {
        faltantes.push({ seccion: 'proveedores', campo: null, mensaje: 'Al menos un Proveedor' });
    }
    return faltantes;
}

export function mostrarAlertaDatosFaltantes(faltantes) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-4 text-red-600">⚠️ Datos incompletos</h2>
            <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">Para continuar, completá los siguientes datos:</p>
            <ul class="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-200 mb-4">
                ${faltantes.map(f => `<li>${f.mensaje}</li>`).join('')}
            </ul>
            <div class="flex gap-3">
                <button onclick="window.irAConfiguracion('${faltantes[0]?.seccion || 'empresa'}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl">
                    ⚙️ Ir a Configuración
                </button>
                <button onclick="this.closest('.modal').remove()" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.irAConfiguracion = (seccion) => {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
    if (typeof window.showView === 'function') {
        window.showView('configuracion');
    }
    setTimeout(() => {
        const tabMap = {
            'empresa': 'empresa',
            'clientes': 'clientes',
            'proveedores': 'proveedores',
            'costos': 'costos',
            'productos': 'productos',
            'impuestos': 'impuestos',
            'backup': 'backup'
        };
        const tabId = tabMap[seccion] || 'empresa';
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (tabBtn) {
            tabBtn.click();
        }
    }, 300);
};

// ==================== INPUT DE FECHA (patrón texto + hidden + calendario) ====================
// 🔥 v7.16.2: Helper unificado para todos los inputs de fecha de la app.
// Uso:
//   1. En el HTML:  ${inputFechaHTML('fechaVenta', '2026-10-06', { label: '📅 Fecha de venta' })}
//   2. Después de insertar en el DOM: initInputFecha('fechaVenta');
//   3. Para leer el valor: getValorFecha('fechaVenta')  →  '2026-10-06' o null
//   4. Para setear: setValorFecha('fechaVenta', '2026-12-31')

/**
 * Devuelve el HTML del input de fecha con el patrón "texto + hidden + calendario".
 * @param {string} id - identificador base (los IDs reales serán `{id}Text`, `{id}Hidden`, `btnCalendario{id}`)
 * @param {string} valorISO - valor inicial en formato ISO (YYYY-MM-DD) o vacío
 * @param {Object} opciones - { label, placeholder, required }
 * @returns {string} HTML
 */
export function inputFechaHTML(id, valorISO = '', opciones = {}) {
    const {
        label = '',
        placeholder = 'DD/MM/AAAA',
        required = false
    } = opciones;

    const valorTexto = valorISO ? formatDate(valorISO) : '';
    const valorHidden = valorISO || '';

    return `
        <div>
            ${label ? `<label class="block text-sm font-medium mb-1">${label}${required ? ' *' : ''}</label>` : ''}
            <div class="flex items-center gap-2">
                <input type="text"
                       id="${id}Text"
                       class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                       placeholder="${placeholder}"
                       value="${valorTexto}"
                       autocomplete="off">
                <input type="date"
                       id="${id}Hidden"
                       class="hidden"
                       value="${valorHidden}">
                <button type="button"
                        id="btnCalendario${id}"
                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">📅</button>
            </div>
        </div>
    `;
}

/**
 * Registra los eventos del input de fecha. Llamar después de insertar el HTML en el DOM.
 * @param {string} id - identificador base
 */
export function initInputFecha(id) {
    const textInput = document.getElementById(`${id}Text`);
    const hiddenInput = document.getElementById(`${id}Hidden`);
    const btnCal = document.getElementById(`btnCalendario${id}`);

    if (!textInput || !hiddenInput) {
        console.warn(`[initInputFecha] No se encontraron los inputs para "${id}"`);
        return;
    }

    // Sincronizar texto desde hidden
    function actualizarTexto() {
        if (hiddenInput.value) {
            const dateObj = new Date(hiddenInput.value + 'T00:00:00');
            if (!isNaN(dateObj)) {
                textInput.value = formatDate(dateObj);
            }
        } else {
            textInput.value = '';
        }
    }

    // Click en 📅 → abrir calendario nativo
    if (btnCal) {
        btnCal.addEventListener('click', function() {
            hiddenInput.showPicker ? hiddenInput.showPicker() : hiddenInput.click();
        });
    }

    // Cambio en el calendario nativo → actualizar texto
    hiddenInput.addEventListener('change', actualizarTexto);

    // Blur del texto → parsear DD/MM/AAAA y guardar en hidden
    textInput.addEventListener('blur', function() {
        const val = this.value.trim();
        if (val) {
            const partes = val.split('/');
            if (partes.length === 3) {
                const dia = parseInt(partes[0]);
                const mes = parseInt(partes[1]) - 1;
                const anio = parseInt(partes[2]);
                if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
                    const fechaObj = new Date(anio, mes, dia);
                    if (!isNaN(fechaObj) &&
                        fechaObj.getFullYear() === anio &&
                        fechaObj.getMonth() === mes &&
                        fechaObj.getDate() === dia) {
                        const iso = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                        hiddenInput.value = iso;
                        actualizarTexto();
                        return;
                    }
                }
            }
            actualizarTexto();
            mostrarNotificacion('Formato inválido. Usá DD/MM/AAAA', 'warning');
        } else {
            hiddenInput.value = '';
            actualizarTexto();
        }
    });

    // Inicializar el texto
    actualizarTexto();
}

/**
 * Devuelve el valor ISO del input de fecha (o null si está vacío).
 * @param {string} id
 * @returns {string|null}
 */
export function getValorFecha(id) {
    const hiddenInput = document.getElementById(`${id}Hidden`);
    return hiddenInput ? (hiddenInput.value || null) : null;
}

/**
 * Setea el valor del input de fecha.
 * @param {string} id
 * @param {string} valorISO - 'YYYY-MM-DD' o '' para vaciar
 */
export function setValorFecha(id, valorISO) {
    const textInput = document.getElementById(`${id}Text`);
    const hiddenInput = document.getElementById(`${id}Hidden`);
    if (!hiddenInput) return;
    if (valorISO) {
        hiddenInput.value = valorISO;
        if (textInput) {
            const dateObj = new Date(valorISO + 'T00:00:00');
            if (!isNaN(dateObj)) textInput.value = formatDate(dateObj);
        }
    } else {
        hiddenInput.value = '';
        if (textInput) textInput.value = '';
    }
}

// ==================== 🔥 v7.16.71: MODAL DE CONFIRMACIÓN REUTILIZABLE ====================
/**
 * Modal de confirmación integrado a la app.
 * Reemplaza a window.confirm() nativo.
 *
 * Uso:
 *   const ok = await confirmarAccion({ titulo, mensaje, textoConfirmar, colorConfirmar, icono });
 *   if (!ok) return;
 *
 * @param {Object} opciones
 * @param {string} opciones.titulo - Título del modal
 * @param {string} opciones.mensaje - Mensaje (acepta HTML)
 * @param {string} opciones.textoConfirmar - Texto del botón confirmar
 * @param {string} opciones.colorConfirmar - Clases Tailwind del botón (default: rojo)
 * @param {string} opciones.textoCancelar - Texto del botón cancelar
 * @param {string} opciones.icono - Emoji del título
 * @returns {Promise<boolean>}
 */
export function confirmarAccion(opciones = {}) {
    return new Promise((resolve) => {
        const {
            titulo = '⚠️ Confirmar',
            mensaje = '¿Estás seguro?',
            textoConfirmar = '✅ Confirmar',
            colorConfirmar = 'bg-red-600 hover:bg-red-700',
            textoCancelar = '❌ Cancelar',
            icono = '⚠️'
        } = opciones;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-content w-full max-w-md">
                <div class="text-center mb-4">
                    <div class="text-5xl mb-2">${icono}</div>
                    <h2 class="text-xl font-bold text-gray-800 dark:text-white">${titulo}</h2>
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
                    <div class="text-sm text-gray-700 dark:text-gray-300 text-center">${mensaje}</div>
                </div>
                <div class="flex gap-3">
                    <button id="confirmarAccionSi" class="flex-1 ${colorConfirmar} text-white py-3 rounded-xl font-bold">${textoConfirmar}</button>
                    <button id="confirmarAccionNo" class="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-800 dark:text-white py-3 rounded-xl">${textoCancelar}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const cerrar = (resultado) => {
            modal.remove();
            resolve(resultado);
        };

        modal.querySelector('#confirmarAccionSi').onclick = () => cerrar(true);
        modal.querySelector('#confirmarAccionNo').onclick = () => cerrar(false);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrar(false);
        });
    });
}

// Exponerlo globalmente para los módulos que no lo importen
if (typeof window !== 'undefined') {
    window.confirmarAccion = confirmarAccion;
}

// ==================== 🔥 v7.17.5: CALCULAR DÍAS DE DIFERENCIA ====================
// Devuelve los días entre hoy y una fecha futura (positivo = futuro, negativo = pasado)
export function calcularDiasDiff(fechaHoy, fechaFutura) {
    const hoy = fechaHoy instanceof Date ? fechaHoy : new Date(fechaHoy);
    const futura = fechaFutura instanceof Date ? fechaFutura : new Date(fechaFutura + 'T00:00:00');
    const diffMs = futura - hoy;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ==================== 🔥 v7.18.7: NÚMERO A LETRAS ====================
// Convierte un número a texto en español (para "Son pesos...")
export function numeroALetras(num) {
    const entero = Math.floor(Math.abs(num));
    const centavos = Math.round((Math.abs(num) - entero) * 100);
    
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    
    function convertirDecenas(n) {
        if (n < 10) return unidades[n];
        if (n >= 10 && n < 20) return especiales[n - 10];
        if (n === 20) return 'VEINTE';
        if (n > 20 && n < 30) return 'VEINTI' + unidades[n - 20];
        const d = Math.floor(n / 10);
        const u = n % 10;
        return decenas[d] + (u > 0 ? ' Y ' + unidades[u] : '');
    }
    
    function convertirCentenas(n) {
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        const c = Math.floor(n / 100);
        const resto = n % 100;
        return centenas[c] + (resto > 0 ? ' ' + convertirDecenas(resto) : '');
    }
    
    function convertirMiles(n) {
        if (n === 0) return '';
        if (n < 1000) return convertirCentenas(n);
        const miles = Math.floor(n / 1000);
        const resto = n % 1000;
        let textoMiles = '';
        if (miles === 1) textoMiles = 'MIL';
        else textoMiles = convertirCentenas(miles) + ' MIL';
        return textoMiles + (resto > 0 ? ' ' + convertirCentenas(resto) : '');
    }
    
    function convertirMillones(n) {
        if (n === 0) return 'CERO';
        if (n < 1000000) return convertirMiles(n);
        const millones = Math.floor(n / 1000000);
        const resto = n % 1000000;
        let textoMillones = '';
        if (millones === 1) textoMillones = 'UN MILLÓN';
        else textoMillones = convertirMiles(millones) + ' MILLONES';
        return textoMillones + (resto > 0 ? ' ' + convertirMiles(resto) : '');
    }
    
    let texto = convertirMillones(entero);
    
    // Agregar centavos
    if (centavos === 0) {
        texto += ' CON CERO CENTAVOS';
    } else {
        texto += ' CON ' + convertirDecenas(centavos) + ' CENTAVOS';
    }
    
    return texto;
}
