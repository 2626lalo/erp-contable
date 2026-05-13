// ==================== modules/utils.js ====================
// UTILIDADES COMUNES
// ERP Contable Argentina - SAS Salta

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

export function mostrarNotificacion(mensaje, tipo = 'success') {
    const container = document.getElementById('notificationContainer');
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.id = 'notificationContainer';
        newContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(newContainer);
    }
    const notifContainer = document.getElementById('notificationContainer');
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

export function getEstadoColor(dias) { 
    if (dias < 0) return 'text-red-600 bg-red-100 dark:bg-red-900/30'; 
    if (dias === 0) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'; 
    if (dias <= 3) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'; 
    if (dias <= 7) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30'; 
    return 'text-green-600 bg-green-100 dark:bg-green-900/30'; 
}

export function cerrarModal() {
    window.dispatchEvent(new Event('refreshView'));
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

// Funciones de formato adicionales
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

export function formatPercentage(numero, decimales = 2) {
    if (numero === undefined || numero === null) return '0%';
    return `${numero.toFixed(decimales)}%`;
}
