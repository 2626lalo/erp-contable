// ==================== modules/usuarios.js ====================
// USUARIOS - Panel de gestión de usuarios + impersonación (super-admin)
// ERP Contable Argentina - v7.0.0

import { getDB, guardarDB } from './db.js';
import { formatNumber, escapeHtml, formatDate, mostrarNotificacion } from './utils.js';
import {
    impersonarUsuario,
    volverASesionReal,
    estaImpersonando,
    getUsuarioImpersonado,
    esSuperAdmin,
    getPerfilUsuario
} from './auth.js';
import {
    getFirebaseModules,
    getFirestoreInstance,
    isFirebaseReady
} from './firebase.js';

// ==================== HELPERS DE FIRESTORE ====================

// 🔥 Lista todos los usuarios registrados en Firestore
async function listarUsuarios() {
    if (!isFirebaseReady()) return [];
    const modulos = getFirebaseModules();
    const db = getFirestoreInstance();
    if (!modulos || !db) return [];

    try {
        const { collection, getDocs } = modulos.firestore;
        const ref = collection(db, 'usuarios');
        const snap = await getDocs(ref);
        const usuarios = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        // Ordenar: super-admin primero, después admins, después el resto
        const orden = { 'super-admin': 0, 'admin': 1, 'tecnico': 2, 'cliente': 3, 'pendiente': 4 };
        usuarios.sort((a, b) => (orden[a.rol] ?? 5) - (orden[b.rol] ?? 5));
        return usuarios;
    } catch (e) {
        console.error('Error listando usuarios:', e);
        return [];
    }
}

// 🔥 Actualiza un usuario en Firestore
async function actualizarUsuario(uid, cambios) {
    if (!isFirebaseReady()) throw new Error('Firebase no listo');
    const modulos = getFirebaseModules();
    const db = getFirestoreInstance();
    const { doc, setDoc } = modulos.firestore;
    const ref = doc(db, 'usuarios', uid);
    await setDoc(ref, cambios, { merge: true });
}

// ==================== VISTA: PANEL DE USUARIOS ====================

export async function renderPanelUsuarios() {
    const usuarios = await listarUsuarios();

    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">👥 Usuarios</h1>
                <button onclick="window.showView('dashboard')" class="text-gray-600 dark:text-gray-300">← Volver</button>
            </div>

            <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-xl p-3 text-sm text-blue-800 dark:text-blue-200">
                🔥 Como <strong>super-admin</strong> podés impersonar cualquier usuario para ver y actuar como él.
            </div>

            ${usuarios.length === 0
                ? '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">No hay usuarios registrados</p></div>'
                : usuarios.map(u => {
                    const esActivo = u.estado === 'activo';
                    const esPendiente = u.estado === 'pendiente';
                    const badgeColor = esActivo ? 'bg-green-100 text-green-700'
                        : esPendiente ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700';
                    const badgeTexto = esActivo ? '✅ Activo'
                        : esPendiente ? '⏳ Pendiente'
                        : '⛔ ' + (u.estado || 'inactivo');
                    const rolBadge = u.rol === 'super-admin' ? 'bg-purple-100 text-purple-700'
                        : u.rol === 'admin' ? 'bg-blue-100 text-blue-700'
                        : u.rol === 'tecnico' ? 'bg-cyan-100 text-cyan-700'
                        : u.rol === 'cliente' ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700';
                    return `
                        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md border-l-4 ${esActivo ? 'border-green-500' : esPendiente ? 'border-yellow-500' : 'border-red-500'}">
                            <div class="flex justify-between items-start flex-wrap gap-2">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h3 class="font-bold">${escapeHtml(u.email || 'Sin email')}</h3>
                                        <span class="text-xs ${rolBadge} px-2 py-0.5 rounded-full">${escapeHtml(u.rol || 'sin rol')}</span>
                                        <span class="text-xs ${badgeColor} px-2 py-0.5 rounded-full">${badgeTexto}</span>
                                    </div>
                                    <p class="text-xs text-gray-500 mt-1">
                                        UID: ${escapeHtml(u.uid || '-')}
                                        ${u.fechaRegistro ? '• Registrado: ' + formatDate(u.fechaRegistro) : ''}
                                    </p>
                                </div>
                                <div class="flex gap-1 flex-wrap">
                                    <button onclick="window.impersonarUsuarioUI('${escapeHtml(u.uid)}', '${escapeHtml(u.email)}', '${escapeHtml(u.rol || 'cliente')}')" class="bg-purple-600 text-white px-3 py-1 rounded text-xs">🎭 Impersonar</button>
                                    <select onchange="window.cambiarRolUsuario('${escapeHtml(u.uid)}', this.value)" class="text-xs border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600">
                                        <option value="">Cambiar rol...</option>
                                        <option value="super-admin" ${u.rol === 'super-admin' ? 'disabled' : ''}>super-admin</option>
                                        <option value="admin" ${u.rol === 'admin' ? 'disabled' : ''}>admin</option>
                                        <option value="tecnico" ${u.rol === 'tecnico' ? 'disabled' : ''}>tecnico</option>
                                        <option value="cliente" ${u.rol === 'cliente' ? 'disabled' : ''}>cliente</option>
                                        <option value="pendiente" ${u.rol === 'pendiente' ? 'disabled' : ''}>pendiente</option>
                                    </select>
                                    <select onchange="window.cambiarEstadoUsuario('${escapeHtml(u.uid)}', this.value)" class="text-xs border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600">
                                        <option value="">Estado...</option>
                                        <option value="activo" ${u.estado === 'activo' ? 'disabled' : ''}>✅ Activar</option>
                                        <option value="pendiente" ${u.estado === 'pendiente' ? 'disabled' : ''}>⏳ Pendiente</option>
                                        <option value="suspendido" ${u.estado === 'suspendido' ? 'disabled' : ''}>⛔ Suspender</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')
            }
        </div>
    `;
}

// ==================== BARRA DE IMPERSONACIÓN ====================

export function renderBarraImpersonacion() {
    if (!estaImpersonando()) return '';
    const imp = getUsuarioImpersonado();
    return `
        <div id="barraImpersonacion" class="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black px-4 py-2 flex justify-between items-center shadow-lg">
            <span class="text-sm font-bold">🎭 Impersonando a: ${escapeHtml(imp.email)} (${escapeHtml(imp.rol)})</span>
            <button onclick="window.volverASesionRealUI()" class="bg-black text-white px-3 py-1 rounded-lg text-sm font-bold">🔙 Volver a mi sesión</button>
        </div>
    `;
}

// ==================== FUNCIONES GLOBALES ====================

window.impersonarUsuarioUI = (uid, email, rol) => {
    if (!confirm(`¿Querés impersonar a ${email} (${rol})?\n\nVas a ver y actuar como este usuario sin cerrar tu sesión.`)) return;
    impersonarUsuario({ uid, email, rol, estado: 'activo' });
    mostrarNotificacion(`🎭 Impersonando a ${email}`, 'info');
    // Recargar la app para que se aplique el nuevo usuario efectivo
    window.location.reload();
};

window.volverASesionRealUI = () => {
    volverASesionReal();
    mostrarNotificacion('🔙 Volviendo a tu sesión', 'success');
    window.location.reload();
};

window.cambiarRolUsuario = async (uid, nuevoRol) => {
    if (!nuevoRol) return;
    if (!confirm(`¿Cambiar el rol de este usuario a "${nuevoRol}"?`)) return;
    try {
        await actualizarUsuario(uid, { rol: nuevoRol });
        mostrarNotificacion(`✅ Rol cambiado a ${nuevoRol}`, 'success');
        window.showView('usuarios');
    } catch (e) {
        console.error(e);
        mostrarNotificacion('Error cambiando rol', 'error');
    }
};

window.cambiarEstadoUsuario = async (uid, nuevoEstado) => {
    if (!nuevoEstado) return;
    if (!confirm(`¿Cambiar el estado de este usuario a "${nuevoEstado}"?`)) return;
    try {
        await actualizarUsuario(uid, { estado: nuevoEstado });
        mostrarNotificacion(`✅ Estado cambiado a ${nuevoEstado}`, 'success');
        window.showView('usuarios');
    } catch (e) {
        console.error(e);
        mostrarNotificacion('Error cambiando estado', 'error');
    }
};

// ==================== EVENTOS ====================
export function initUsuariosEvents() {
    // Nada por ahora, todo se maneja con onclick
}
