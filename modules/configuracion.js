// ==================== modules/configuracion.js ====================
// PUENTE: re-exporta todo desde modules/configuracion/
// Mantiene compatibilidad con app.js (que importa desde './modules/configuracion.js')
// ERP Contable Argentina - v7.16.1

export {
    renderConfiguracion,
    initConfiguracionEvents,
    agregarBotonActualizacion,
    agregarBotonEjemplos,
    guardarDatosEmpresaDesdeFormulario
} from './configuracion/index.js';
