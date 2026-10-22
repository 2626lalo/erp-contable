// ==================== modules/configuracion/helpers.js ====================
// HELPERS compartidos de Configuración
// ERP Contable Argentina - v7.16.1

import { formatDate, formatNumber, escapeHtml, mostrarNotificacion } from '../utils.js';

// ==================== CONSTANTES ====================
export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta Débito', 'Tarjeta Crédito', 'Cheque', 'Otro'];
export const CONDICIONES_IVA = [
    'IVA Responsable Inscripto',
    'IVA Responsable No Inscripto',
    'IVA Exento',
    'Consumidor Final',
    'No Responsable',
    'Monotributo'
];
export const LOGO_MAX_ANCHO = 400;
export const LOGO_MAX_ALTO = 200;
export const LOGO_CALIDAD = 0.85;
export const LOGO_MAX_BYTES = 500 * 1024; // 500KB

// ==================== NORMALIZACIÓN ====================
export function normalizarCuit(cuit) {
    if (!cuit) return '';
    return String(cuit).replace(/[-\s]/g, '');
}

// ==================== MODALES REUTILIZABLES ====================
/**
 * Crea un modal con botones Guardar/Cancelar y lo agrega al body.
 * @param {string} contenido - HTML interno
 * @param {string} titulo - Título del modal (opcional)
 * @returns {HTMLElement} el modal
 */
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

/**
 * Cierra (remueve) un modal del DOM.
 * @param {HTMLElement} modal
 */
export function cerrarModal(modal) {
    if (modal) modal.remove();
}

// ==================== IMÁGENES ====================
/**
 * Comprime una imagen a un máximo de ancho/alto y devuelve un dataURL.
 * Soporta SVG (lo deja pasar sin comprimir).
 */
export function comprimirImagen(file, maxWidth = LOGO_MAX_ANCHO, maxHeight = LOGO_MAX_ALTO, calidad = LOGO_CALIDAD) {
    return new Promise((resolve, reject) => {
        if (file.type === 'image/svg+xml') {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (file.type === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                ctx.drawImage(img, 0, 0, width, height);
                const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                const dataUrl = canvas.toDataURL(outputType, calidad);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Calcula el tamaño en bytes de un dataURL base64.
 */
export function calcularTamanoBase64(dataUrl) {
    if (!dataUrl) return 0;
    const base64 = dataUrl.split(',')[1] || '';
    return Math.round(base64.length * 0.75);
}

// ==================== FECHAS ====================
/**
 * Formatea fecha ISO → DD/MM/AAAA
 */
export function formatearFecha(fechaISO) {
    if (!fechaISO) return '-';
    return formatDate(fechaISO);
}

// ==================== NOTIFICACIONES ====================
export { mostrarNotificacion, formatNumber, escapeHtml, formatDate };
