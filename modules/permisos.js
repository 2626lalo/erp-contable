// ==================== modules/permisos.js ====================
// PERMISOS - Definición de roles y permisos por sección
// ERP Contable Argentina - v7.0.0

import { getUsuarioEfectivo, estaImpersonando } from './auth.js';

// ==================== DEFINICIÓN DE PERMISOS ====================
export const PERMISOS = {
    'super-admin': {
        nombre: 'Super Administrador',
        secciones: ['dashboard', 'ventas', 'compras', 'presupuestos', 'unidades', 'contador', 'tesoreria', 'configuracion', 'usuarios', 'empresas'],
        puedeCrearPresupuesto: true,
        puedeEditarPresupuesto: true,
        puedeAprobarPresupuesto: true,
        puedeRevertirAprobacion: true,
        puedeEliminarPresupuesto: true,
        puedeEditarUnidad: true,
        puedeEliminarUnidad: true,
        puedeVerFinanzas: true,
        puedeVerConfig: true,
        puedeVerUsuarios: true,
        soloSusDatos: false
    },
    'admin': {
        nombre: 'Administrador',
        secciones: ['dashboard', 'ventas', 'compras', 'presupuestos', 'unidades', 'contador', 'tesoreria', 'configuracion'],
        puedeCrearPresupuesto: true,
        puedeEditarPresupuesto: true,
        puedeAprobarPresupuesto: true,
        puedeRevertirAprobacion: true,
        puedeEliminarPresupuesto: true,
        puedeEditarUnidad: true,
        puedeEliminarUnidad: true,
        puedeVerFinanzas: true,
        puedeVerConfig: true,
        puedeVerUsuarios: false,
        soloSusDatos: false
    },
    'tecnico': {
        nombre: 'Técnico',
        secciones: ['dashboard', 'presupuestos', 'unidades'],
        puedeCrearPresupuesto: true,
        puedeEditarPresupuesto: true,
        puedeAprobarPresupuesto: false,
        puedeRevertirAprobacion: false,
        puedeEliminarPresupuesto: false,
        puedeEditarUnidad: true,
        puedeEliminarUnidad: false,
        puedeVerFinanzas: false,
        puedeVerConfig: false,
        puedeVerUsuarios: false,
        soloSusDatos: false
    },
    'cliente': {
        nombre: 'Cliente',
        secciones: ['dashboard', 'presupuestos', 'unidades'],
        puedeCrearPresupuesto: false,
        puedeEditarPresupuesto: false,
        puedeAprobarPresupuesto: false,
        puedeRevertirAprobacion: false,
        puedeEliminarPresupuesto: false,
        puedeEditarUnidad: false,
        puedeEliminarUnidad: false,
        puedeVerFinanzas: false,
        puedeVerConfig: false,
        puedeVerUsuarios: false,
        soloSusDatos: true
    },
    'pendiente': {
        nombre: 'Pendiente',
        secciones: [],
        puedeCrearPresupuesto: false,
        puedeEditarPresupuesto: false,
        puedeAprobarPresupuesto: false,
        puedeRevertirAprobacion: false,
        puedeEliminarPresupuesto: false,
        puedeEditarUnidad: false,
        puedeEliminarUnidad: false,
        puedeVerFinanzas: false,
        puedeVerConfig: false,
        puedeVerUsuarios: false,
        soloSusDatos: true
    }
};

// ==================== HELPERS ====================

// 🔥 Devuelve el rol del usuario efectivo (impersonado o real)
export function getRolActual() {
    const usuario = getUsuarioEfectivo();
    if (!usuario || !usuario.rol) return 'pendiente';
    return usuario.rol;
}

// 🔥 Devuelve los permisos del rol actual
export function getPermisosActuales() {
    const rol = getRolActual();
    return PERMISOS[rol] || PERMISOS['pendiente'];
}

// 🔥 ¿Puede ver esta sección?
export function puedeVer(seccion) {
    const permisos = getPermisosActuales();
    return permisos.secciones.includes(seccion);
}

// 🔥 ¿Puede hacer esta acción?
export function puede(accion) {
    const permisos = getPermisosActuales();
    return permisos[accion] === true;
}

// 🔥 ¿Solo debe ver sus propios datos?
export function soloSusDatos() {
    const permisos = getPermisosActuales();
    return permisos.soloSusDatos === true;
}

// 🔥 Filtra la lista de secciones permitidas
export function getSeccionesPermitidas() {
    const permisos = getPermisosActuales();
    return permisos.secciones;
}

// 🔥 Muestra un mensaje de error si no tiene permiso
export function bloquearAccion(mensaje = 'No tenés permiso para esta acción') {
    if (typeof window.mostrarNotificacion === 'function') {
        window.mostrarNotificacion('⛔ ' + mensaje, 'error');
    } else {
        alert(mensaje);
    }
}
