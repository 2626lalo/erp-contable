// ==================== modules/presupuestos/estado.js ====================
// ESTADO COMPARTIDO - Variables globales del módulo de presupuestos
// ERP Contable Argentina - v7.0.0

// Estado del editor actual
export let itemsPresupuesto = [];
export let markupGlobal = 30;
export let usarMarkupGlobal = true;
export let incluirIVA = true;
export let esTercerizado = true;
export let presupuestoEditandoId = null;
export let deudasPendientes = [];

// Constantes
export const ALICUOTA_IVA = 21;
export const NUMERO_INICIAL_PRESUPUESTO = 867;

// Opciones de acción
export const OPCIONES_ACCION = [
    { value: '', label: '-' },
    { value: 'REP - Repuesto', label: 'REP - Repuesto' },
    { value: 'MO - Mano de Obra', label: 'MO - Mano de Obra' },
    { value: 'C - Cambiar', label: 'C - Cambiar' },
    { value: 'R - Reparar', label: 'R - Reparar' },
    { value: 'M - Mecánica y Electricidad', label: 'M - Mecánica y Electricidad' },
    { value: 'S - Servicios Varios', label: 'S - Servicios Varios' },
    { value: 'O - Otros Conceptos', label: 'O - Otros Conceptos' }
];

// Setters (porque las variables exportadas son de solo lectura desde otros módulos)
export function setItemsPresupuesto(nuevos) {
    itemsPresupuesto = nuevos;
}

export function setMarkupGlobal(valor) {
    markupGlobal = valor;
}

export function setUsarMarkupGlobal(valor) {
    usarMarkupGlobal = valor;
}

export function setIncluirIVA(valor) {
    incluirIVA = valor;
}

export function setEsTercerizado(valor) {
    esTercerizado = valor;
}

export function setPresupuestoEditandoId(valor) {
    presupuestoEditandoId = valor;
}

export function setDeudasPendientes(valor) {
    deudasPendientes = valor;
}

// Objeto para facilitar el acceso desde otros módulos
export const estado = {
    get items() { return itemsPresupuesto; },
    get markup() { return markupGlobal; },
    get usarGlobal() { return usarMarkupGlobal; },
    get iva() { return incluirIVA; },
    get tercerizado() { return esTercerizado; },
    get editandoId() { return presupuestoEditandoId; },
    get deudas() { return deudasPendientes; }
};
