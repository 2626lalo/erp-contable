// ==================== app.js ====================
// ERP Contable Argentina - v7.0.0
// Punto de entrada principal con navegación y renderizado de vistas

import { cargarDB, getDB, escucharCambios, detenerEscucha } from './modules/db.js';
import { renderDashboard, initDashboardEvents } from './modules/dashboard.js';
import { renderVentas, initVentasEvents } from './modules/ventas.js';
import { renderCompras, initComprasEvents } from './modules/compras.js';
import { renderPresupuestos, initPresupuestosEvents } from './modules/presupuestos.js';
import { renderUnidades, initUnidadesEvents } from './modules/unidades.js';
import { renderReportes, initReportesEvents, cambiarReporteMes, exportarReportePDF } from './modules/reportes.js';
import { renderContador } from './modules/contador.js';
import { renderConfiguracion, initConfiguracionEvents, agregarBotonActualizacion, agregarBotonEjemplos } from './modules/configuracion.js';
import { renderCalculadorGanancias, initCalculadorEvents } from './modules/calculadorGanancias.js';
import { renderGastosPersonales, initGastosPersonalesEvents } from './modules/gastosPersonales.js';
import { renderGeneradorInformes, initGeneradorInformesEvents } from './modules/generadorInformes.js';
import { renderTesoreria, initTesoreriaEvents } from './modules/tesoreria.js';
import { initTrazabilidadEvents } from './modules/trazabilidad.js';
import { initNotificacionesEvents, actualizarContadorNotificaciones } from './modules/notificaciones.js';
import { mostrarNotificacion } from './modules/utils.js';
import { forzarActualizacionCompleta, verificarVersionRemota } from './modules/updater.js';
import {
    initFirebase, obtenerConfigEmpresa, firebaseReady,
    getUsuarioActual, setUsuarioActual, escucharAuth
} from './modules/firebase.js';
import {
    renderLogin, initAuthEvents, cargarPerfilUsuario, getPerfilUsuario,
    renderEsperandoAprobacion, logout, restaurarImpersonacion,
    estaImpersonando, esSuperAdmin, getUsuarioEfectivo,
    iniciarTimerInactividad, detenerTimerInactividad,
    getEmpresaId, restaurarEmpresaActual, cambiarEmpresa
} from './modules/auth.js';
import { renderPanelUsuarios, initUsuariosEvents, renderBarraImpersonacion } from './modules/usuarios.js';
import { renderPanelEmpresas, initEmpresasEvents, asegurarEmpresasMeta } from './modules/empresas.js';
import { getEmpresaMeta } from './modules/auth.js';

// ========== CONSTANTES ==========
const APP_VERSION = '7.0.0';
const VERSION_KEY = 'app_version';
let currentView = 'dashboard';
let escuchaIniciada = false;
let appIniciada = false;

// ========== VERIFICAR VERSIÓN AL CARGAR ==========
async function verificarAlCargar() {
    try {
        const savedVersion = localStorage.getItem(VERSION_KEY);
        if (savedVersion && savedVersion !== APP_VERSION) {
            localStorage.setItem(VERSION_KEY, APP_VERSION);
            mostrarNotificacion(`🔄 Versión ${APP_VERSION} disponible. Actualizando...`, 'info');
            setTimeout(() => window.location.reload(), 1500);
            return true;
        } else if (!savedVersion) {
            localStorage.setItem(VERSION_KEY, APP_VERSION);
        }
        console.log(`📱 ERP Contable - Versión ${APP_VERSION}`);
        return false;
    } catch(e) {
        console.error('Error en verificarAlCargar:', e);
        return false;
    }
}

// ========== PANTALLA DE LOGIN ==========
function mostrarLogin() {
    detenerTimerInactividad();
    const root = document.getElementById('root');
    if (!root) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.fixed.top-0, .fixed.bottom-0').forEach(el => {
        if (!el.classList.contains('modal')) el.style.display = 'none';
    });
    root.style.paddingTop = '0';
    root.style.paddingBottom = '0';
    root.innerHTML = renderLogin();
    initAuthEvents();
}

// ========== PANTALLA DE ESPERA ==========
function mostrarEsperandoAprobacion(email) {
    detenerTimerInactividad();
    const root = document.getElementById('root');
    if (!root) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.fixed.top-0, .fixed.bottom-0').forEach(el => {
        if (!el.classList.contains('modal')) el.style.display = 'none';
    });
    root.style.paddingTop = '0';
    root.style.paddingBottom = '0';
    root.innerHTML = renderEsperandoAprobacion(email);
}

// ========== RENDERIZAR VISTA ACTUAL ==========
async function renderView() {
    try {
        const root = document.getElementById('root');
        if (!root) {
            console.error('❌ No se encontró #root');
            return;
        }

        // Restaurar padding del root (por si veníamos de login)
        root.style.paddingTop = estaImpersonando() ? '3.5rem' : '';
        root.style.paddingBottom = '';

        // Restaurar visibilidad de barras
        document.querySelectorAll('.nav-btn').forEach(b => b.style.display = '');
        document.querySelectorAll('.fixed.top-0, .fixed.bottom-0').forEach(el => {
            if (!el.classList.contains('modal') && el.id !== 'barraImpersonacion') el.style.display = '';
        });

        // Limpiar modales abiertos antes de renderizar
        document.querySelectorAll('.modal').forEach(m => m.remove());

        console.log('📄 Renderizando vista:', currentView);

        // 🔥 Vista de usuarios (solo super-admin)
        if (currentView === 'usuarios') {
            if (!esSuperAdmin()) {
                mostrarNotificacion('Solo el super-admin puede ver esta sección', 'warning');
                currentView = 'dashboard';
                return renderView();
            }
            root.innerHTML = await renderPanelUsuarios();
            if (initUsuariosEvents) initUsuariosEvents();
            return;
        }

        if (currentView === 'empresas') {
            if (!esSuperAdmin()) {
                currentView = 'dashboard';
                return renderView();
            }
            root.innerHTML = await renderPanelEmpresas();
            if (initEmpresasEvents) initEmpresasEvents();
            return;
        }

        if (currentView === 'dashboard') {
            root.innerHTML = await renderDashboard();
            if (initDashboardEvents) initDashboardEvents();
        }
        else if (currentView === 'ventas') {
            root.innerHTML = renderVentas();
            if (initVentasEvents) initVentasEvents();
        }
        else if (currentView === 'compras') {
            root.innerHTML = renderCompras();
            if (initComprasEvents) initComprasEvents();
        }
        else if (currentView === 'presupuestos') {
            root.innerHTML = renderPresupuestos();
            if (initPresupuestosEvents) initPresupuestosEvents();
        }
        else if (currentView === 'unidades') {
            root.innerHTML = renderUnidades();
            if (initUnidadesEvents) initUnidadesEvents();
        }
        else if (currentView === 'reportes') {
            root.innerHTML = renderReportes();
            if (initReportesEvents) initReportesEvents();
        }
        else if (currentView === 'contador') {
            root.innerHTML = renderContador();
        }
        else if (currentView === 'calculador') {
            root.innerHTML = renderCalculadorGanancias();
            if (initCalculadorEvents) initCalculadorEvents();
        }
        else if (currentView === 'gastosPersonales') {
            root.innerHTML = renderGastosPersonales();
            setTimeout(() => initGastosPersonalesEvents(), 100);
        }
        else if (currentView === 'generadorInformes') {
            root.innerHTML = renderGeneradorInformes();
            setTimeout(() => initGeneradorInformesEvents(), 100);
        }
        else if (currentView === 'tesoreria') {
            root.innerHTML = renderTesoreria();
            setTimeout(() => initTesoreriaEvents(), 300);
        }
        else if (currentView === 'configuracion') {
            root.innerHTML = renderConfiguracion();
            setTimeout(() => {
                if (agregarBotonActualizacion) agregarBotonActualizacion();
                if (agregarBotonEjemplos) agregarBotonEjemplos();
                if (initConfiguracionEvents) initConfiguracionEvents();
            }, 100);
        }
        else {
            root.innerHTML = await renderDashboard();
            if (initDashboardEvents) initDashboardEvents();
        }
    } catch(e) {
        console.error('❌ Error en renderView:', e);
        const root = document.getElementById('root');
        if (root) {
            root.innerHTML = `<div class="p-8 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                <h2 class="text-red-600 font-bold">⚠️ Error al renderizar vista</h2>
                <p class="text-sm mt-2">${e.message}</p>
                <pre class="text-xs mt-2 bg-gray-100 p-2 rounded overflow-auto">${e.stack}</pre>
            </div>`;
        }
    }
}

// ========== NAVEGACIÓN ==========
function initNavigation() {
    try {
        const navButtons = document.querySelectorAll('[data-view]');
        console.log(`🔘 Encontrados ${navButtons.length} botones de navegación`);
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                currentView = btn.dataset.view;
                renderView();
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    } catch(e) {
        console.error('Error en initNavigation:', e);
    }
}

// ========== SERVICE WORKER ==========
function initServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('ℹ️ Service Worker no soportado por este navegador');
        return;
    }
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('✅ Service Worker registrado:', registration.scope);
                setInterval(() => registration.update(), 30 * 60 * 1000);
            })
            .catch((error) => {
                console.error('❌ Error al registrar Service Worker:', error);
            });
    });
}

// ========== PWA (INSTALACIÓN) ==========
function initPWA() {
    try {
        let deferredPrompt = null;
        const banner = document.getElementById('installBanner');
        const installBtn = document.getElementById('installApp');
        const closeBtn = document.getElementById('closeBanner');
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        const esMobil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        function mostrarBanner() {
            if (!isStandalone && !localStorage.getItem('hideInstallBanner')) {
                banner?.classList.remove('-translate-y-full');
            }
        }
        function ocultarBanner() {
            banner?.classList.add('-translate-y-full');
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('✅ beforeinstallprompt disparado');
            e.preventDefault();
            deferredPrompt = e;
            mostrarBanner();
        });

        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA instalada');
            ocultarBanner();
            deferredPrompt = null;
            mostrarNotificacion('✅ App instalada correctamente', 'success');
        });

        installBtn?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('Respuesta del usuario:', outcome);
                if (outcome === 'accepted') {
                    ocultarBanner();
                }
                deferredPrompt = null;
            } else if (esMobil) {
                alert('📱 Para instalar en tu celular:\n\n' +
                      '• Android: menú ⋮ → "Instalar aplicación" o "Agregar a pantalla de inicio"\n' +
                      '• iPhone (Safari): botón Compartir ⬆️ → "Agregar a pantalla de inicio"');
            } else {
                alert('💻 Para instalar en PC:\n\n' +
                      '• Chrome / Edge: buscá el ícono de instalar (📥 o ⊕) en la barra de direcciones\n' +
                      '• O menú ⋮ → "Instalar ERP Contable..."\n\n' +
                      'Si no ves la opción, la app ya está instalada o tu navegador no la soporta.');
            }
        });

        closeBtn?.addEventListener('click', () => {
            ocultarBanner();
            localStorage.setItem('hideInstallBanner', 'true');
        });

        console.log(`📱 initPWA listo. Standalone: ${isStandalone}, Móvil: ${esMobil}`);
    } catch(e) {
        console.error('Error en initPWA:', e);
    }
}

// ========== DARK MODE ==========
function initDarkMode() {
    try {
        const darkMode = localStorage.getItem('darkMode') === 'true';
        if (darkMode) document.body.classList.add('dark');
        
        const btn = document.getElementById('darkModeBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                const isDark = document.body.classList.contains('dark');
                if (isDark) document.body.classList.remove('dark');
                else document.body.classList.add('dark');
                localStorage.setItem('darkMode', !isDark);
            });
        }
    } catch(e) {
        console.error('Error en initDarkMode:', e);
    }
}

// ========== BARRA DE IMPERSONACIÓN ==========
function mostrarBarraImpersonacion() {
    // Remover la barra existente (si hay)
    const existente = document.getElementById('barraImpersonacion');
    if (existente) existente.remove();

    if (!estaImpersonando()) return;

    const html = renderBarraImpersonacion();
    if (html) {
        document.getElementById('app').insertAdjacentHTML('afterbegin', html);
        // Ajustar el padding del root para que no tape el contenido
        const root = document.getElementById('root');
        if (root) root.style.paddingTop = '4rem';
    }
}

// ========== FUNCIONES GLOBALES ==========
window.forzarActualizacion = async () => {
    try {
        mostrarNotificacion("🔍 Verificando actualizaciones...", 'info');
        const { versionRemota, hayActualizacion } = await verificarVersionRemota();
        if (hayActualizacion) {
            mostrarNotificacion(`🔄 Nueva versión ${versionRemota} encontrada. Actualizando...`, 'info');
            await forzarActualizacionCompleta();
        } else {
            mostrarNotificacion("✅ Ya estás en la última versión", 'success');
            setTimeout(() => {
                if (confirm("¿Deseas recargar la app?")) window.location.reload(true);
            }, 1000);
        }
    } catch(e) {
        console.error('Error en forzarActualizacion:', e);
        mostrarNotificacion('Error al verificar actualizaciones', 'error');
    }
};

window.limpiarTodo = () => {
    if (confirm("⚠️ ¿ELIMINAR TODOS LOS DATOS y recargar la app?")) forzarActualizacionCompleta();
};

window.mostrarNotificacion = mostrarNotificacion;
window.cambiarReporteMes = cambiarReporteMes;
window.exportarReportePDF = exportarReportePDF;
window.showView = (view) => {
    currentView = view;
    renderView();
    document.querySelectorAll('[data-view]').forEach(b => {
        b.classList.remove('active');
        if (b.dataset.view === view) b.classList.add('active');
    });
};

window.filtrarVentas = () => {
    try {
        const select = document.getElementById('mesSelectVentas');
        if (select) localStorage.setItem('ventasMesFiltro', select.value);
        window.dispatchEvent(new Event('refreshView'));
    } catch(e) {
        console.error('Error en filtrarVentas:', e);
    }
};

window.filtrarCompras = () => {
    try {
        const select = document.getElementById('mesSelectCompras');
        if (select) localStorage.setItem('comprasMesFiltro', select.value);
        window.dispatchEvent(new Event('refreshView'));
    } catch(e) {
        console.error('Error en filtrarCompras:', e);
    }
};

// ========== LISTENER ÚNICO DE refreshView ==========
window.addEventListener('refreshView', () => {
    if (appIniciada) {
        renderView();
        mostrarBarraImpersonacion();
    }
});

// ========== INICIALIZACIÓN ==========
async function initApp() {
    console.log('🚀 Iniciando ERP Contable...');

    try {
        initServiceWorker();

        try {
            await initFirebase();
            if (firebaseReady) {
                console.log('🔗 Firebase activo');
                const config = await obtenerConfigEmpresa();
                window.empresaConfig = config;
                console.log('✅ Configuración empresa cargada desde Firebase');
            } else {
                console.log('📁 Usando modo localStorage (Firebase no configurado)');
            }
        } catch(e) {
            console.warn('⚠️ Firebase no iniciado:', e);
        }

        escucharAuth(async (user) => {
            if (user) {
                setUsuarioActual(user);
                const perfil = await cargarPerfilUsuario(user);

                // 🔥 Restaurar impersonación si había una activa
                restaurarImpersonacion();

                if (perfil && perfil.estado === 'activo') {
                    await iniciarAppCompleta();
                } else {
                    console.log('⏳ Usuario pendiente de aprobación');
                    mostrarEsperandoAprobacion(user.email);
                }
            } else {
                console.log('🔓 Sin sesión');
                appIniciada = false;
                mostrarLogin();
            }
        });

    } catch(e) {
        console.error('❌ Error en initApp:', e);
        const root = document.getElementById('root');
        if (root) {
            root.innerHTML = `<div class="p-8 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                <h2 class="text-red-600 font-bold">⚠️ Error al cargar la aplicación</h2>
                <p class="text-sm mt-2">${e.message}</p>
                <pre class="text-xs mt-2 bg-gray-100 p-2 rounded overflow-auto">${e.stack}</pre>
            </div>`;
        }
    }
}

// ========== ACTUALIZAR BADGE DE EMPRESA ==========
async function actualizarBadgeEmpresa() {
    try {
        const empresaId = getEmpresaId();
        if (!empresaId || empresaId === 'empresa_principal') {
            const badge = document.getElementById('empresaActivaBadge');
            if (badge) badge.classList.add('hidden');
            return;
        }
        const meta = await getEmpresaMeta(empresaId);
        const badge = document.getElementById('empresaActivaBadge');
        if (badge && meta && meta.nombre) {
            badge.textContent = '🏢 ' + meta.nombre;
            badge.classList.remove('hidden');
        }
    } catch (e) {
        console.warn('Error actualizando badge empresa:', e);
    }
}

// ========== INICIAR LA APP COMPLETA (después del login) ==========
async function iniciarAppCompleta() {
    if (appIniciada) return;
    appIniciada = true;

    try {
        // 🔥 Restaurar empresa activa ANTES de cargar la DB
        await restaurarEmpresaActual();

        await cargarDB();
        console.log('✅ DB cargada');

        if (firebaseReady && !escuchaIniciada) {
            escuchaIniciada = true;
            escucharCambios(() => {
                setTimeout(actualizarContadorNotificaciones, 500);
            });
            console.log('👂 Escucha en tiempo real iniciada');
        }

        initNavigation();
        initPWA();
        initDarkMode();
        await verificarAlCargar();
        console.log('✅ Inicialización básica completada');

        initTrazabilidadEvents();
        console.log('✅ Trazabilidad inicializada');

        initNotificacionesEvents();
        setTimeout(actualizarContadorNotificaciones, 1000);
        console.log('✅ Notificaciones inicializadas');

        // 🔥 Mostrar barra de impersonación si corresponde
        mostrarBarraImpersonacion();

        // 🔥 Mostrar badge de empresa activa
        actualizarBadgeEmpresa();

        // 🔥 v7.16.14: exponer el CUIT de la empresa para el OCR
        try {
            const db = (await import('./modules/db.js')).getDB();
            window.__cuitEmpresa = db?.datosEmpresa?.cuit || null;
        } catch(e) { /* noop */ }

        // 🔥 v7.16.9: Iniciar fecha/hora en la cabecera
        iniciarFechaHora();

        // 🔥 Asegurar que existan las metas de las empresas
        asegurarEmpresasMeta();
        // 🔥 Mostrar botón de usuarios y empresas solo a super-admin
        const btnUsuarios = document.getElementById('usuariosBtn');
        if (btnUsuarios && esSuperAdmin()) {
            btnUsuarios.classList.remove('hidden');
        }
        const btnEmpresas = document.getElementById('empresasBtn');
        if (btnEmpresas && esSuperAdmin()) {
            btnEmpresas.classList.remove('hidden');
        }




        await renderView();
        console.log('✅ Vista inicial renderizada');

        // 🔥 Activar timer de inactividad (10 min)
        iniciarTimerInactividad();
    } catch(e) {
        console.error('❌ Error en iniciarAppCompleta:', e);
    }
}

// ========== ARRANQUE ==========
document.addEventListener('DOMContentLoaded', initApp);

// ==================== FECHA/HORA EN CABECERA (v7.16.9) ====================
const MESES_COMPLETOS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function actualizarFechaHora() {
    const ahora = new Date();
    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const anio = ahora.getFullYear();
    const hora = String(ahora.getHours()).padStart(2, '0');
    const min = String(ahora.getMinutes()).padStart(2, '0');

    const mesCompleto = MESES_COMPLETOS[ahora.getMonth()];
    const mesAbrev = MESES_ABREV[ahora.getMonth()];

    // Desktop
    const elMes = document.getElementById('fechaHoraMes');
    const elDetalle = document.getElementById('fechaHoraDetalle');
    if (elMes) elMes.textContent = `${mesCompleto} ${anio}`;
    if (elDetalle) elDetalle.textContent = `${dia}/${mes}/${anio} · ${hora}:${min}`;

    // Móvil
    const elMesMobile = document.getElementById('fechaHoraMesMobile');
    if (elMesMobile) elMesMobile.textContent = `${mesAbrev} ${anio}`;
}

window.abrirModalFechaHora = () => {
    const ahora = new Date();
    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const anio = ahora.getFullYear();
    const hora = String(ahora.getHours()).padStart(2, '0');
    const min = String(ahora.getMinutes()).padStart(2, '0');
    const seg = String(ahora.getSeconds()).padStart(2, '0');

    const mesCompleto = MESES_COMPLETOS[ahora.getMonth()];
    const diaSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][ahora.getDay()];

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-sm">
            <h2 class="text-xl font-bold mb-4 text-center">📅 Fecha y hora</h2>
            <div class="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white text-center space-y-2">
                <p class="text-3xl font-bold">${dia}/${mes}/${anio}</p>
                <p class="text-lg">${diaSemana}, ${mesCompleto} ${anio}</p>
                <p class="text-2xl font-mono">${hora}:${min}:${seg}</p>
            </div>
            <button onclick="this.closest('.modal').remove()" class="mt-4 w-full bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
};

export function iniciarFechaHora() {
    actualizarFechaHora();
    setInterval(actualizarFechaHora, 60000); // cada 60 segundos
}


// --- Fix vista previa y eliminar factura ---


