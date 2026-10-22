// ==================== modules/presupuestos.js ====================
// PRESUPUESTOS - Orquestador principal
// Importa y re-exporta todos los submódulos de presupuestos/
// ERP Contable Argentina - v7.0.0

// ==================== IMPORTACIONES ====================
// Helpers y estado
export * from './presupuestos/estado.js';
export * from './presupuestos/helpers.js';

// UI principal
export { renderPresupuestos } from './presupuestos/lista.js';

// Plantillas PDF
export { generarHTMLPresupuestoCliente } from './presupuestos/plantilla-cliente.js';
export { generarHTMLPresupuestoCompleto } from './presupuestos/plantilla-completa.js';

// Items
export { renderizarTablaItems, renderizarComparativas } from './presupuestos/items.js';

// Editor (esto registra los window.* al importarse)
import './presupuestos/editor.js';
export { renderizarTodo, getItemsPresupuesto, getDeudasPendientes } from './presupuestos/editor.js';

// Aprobar (registra window.aprobarPresupuesto, etc.)
import './presupuestos/aprobar.js';

// Detalle (registra window.verPresupuestoDetalle, window.eliminarPresupuesto, etc.)
import './presupuestos/detalle.js';

// Stock (registra window.vincularCompra, window.reservarStock, etc.)
import './presupuestos/stock.js';

// ==================== INIT ====================
export function initPresupuestosEvents() {
    // Todos los eventos ya se registraron al importar los módulos
    // Esta función se mantiene por compatibilidad con app.js
}
