export function formatNumber(num) { return num?.toLocaleString('es-AR') || '0'; }
export function generarId() { return Date.now(); }
export function calcularDiasRestantes(fecha) { if (!fecha) return null; return Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24)); }
export function mostrarNotificacion(mensaje, tipo = 'success') {
    const container = document.getElementById('notificationContainer');
    const notif = document.createElement('div');
    const bgColor = tipo === 'success' ? 'bg-green-500' : tipo === 'error' ? 'bg-red-500' : tipo === 'warning' ? 'bg-yellow-500' : 'bg-blue-500';
    const icono = tipo === 'success' ? '✅' : tipo === 'error' ? '❌' : tipo === 'warning' ? '⚠️' : 'ℹ️';
    notif.className = `notification ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg mb-3 flex items-center gap-3`;
    notif.innerHTML = `<span class="text-xl">${icono}</span><span class="font-medium">${mensaje}</span>`;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}
export function getEstadoColor(dias) { if (dias < 0) return 'text-red-600 bg-red-100 dark:bg-red-900/30'; if (dias === 0) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'; if (dias <= 3) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'; if (dias <= 7) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30'; return 'text-green-600 bg-green-100 dark:bg-green-900/30'; }
export function cerrarModal() {
    window.dispatchEvent(new Event('refreshView'));
}
