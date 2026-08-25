// ==================== app.js ====================
// ERP Contable Argentina - v7.0.0
// Los imports DEBEN estar en el nivel superior

// ========== IMPORTS (nivel superior) ==========
import { cargarDB, getDB } from './modules/db.js';
import { renderDashboard, initDashboardEvents } from './modules/dashboard.js';
import { renderVentas, initVentasEvents } from './modules/ventas.js';
import { renderCompras, initComprasEvents } from './modules/compras.js';
import { renderPresupuestos, initPresupuestosEvents } from './modules/presupuestos.js';
import { renderReportes, initReportesEvents, cambiarReporteMes, exportarReportePDF } from './modules/reportes.js';
import { renderContador } from './modules/contador.js';
import { renderConfiguracion, initConfiguracionEvents, agregarBotonActualizacion, agregarBotonEjemplos } from './modules/configuracion.js';
import { renderCalculadorGanancias, initCalculadorEvents } from './modules/calculadorGanancias.js';
import { renderGastosPersonales, initGastosPersonalesEvents } from './modules/gastosPersonales.js';
import { renderGeneradorInformes, initGeneradorInformesEvents } from './modules/generadorInformes.js';
import { renderTesoreria, initTesoreriaEvents } from './modules/tesoreria.js';
import { mostrarNotificacion } from './modules/utils.js';
import { forzarActualizacionCompleta, verificarVersionRemota } from './modules/updater.js';
import { initFirebase, obtenerConfigEmpresa, firebaseReady } from './modules/firebase.js';

// ========== CONSTANTES ==========
const APP_VERSION = '7.0.0';
const VERSION_KEY = 'app_version';
let currentView = 'dashboard';

// ========== FUNCIONES ==========
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

async function renderView() {
    try {
        const root = document.getElementById('root');
        if (!root) {
            console.error('❌ No se encontró #root');
            return;
        }

        console.log('📄 Renderizando vista:', currentView);

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

function initPWA() {
    try {
        let deferredPrompt;
        const banner = document.getElementById('installBanner');
        const installBtn = document.getElementById('installApp');
        const closeBtn = document.getElementById('closeBanner');
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        
        if (!isStandalone && !localStorage.getItem('hideInstallBanner')) {
            setTimeout(() => banner?.classList.remove('-translate-y-full'), 2000);
        }
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (!localStorage.getItem('hideInstallBanner')) {
                banner?.classList.remove('-translate-y-full');
            }
        });
        
        installBtn?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') banner.classList.add('-translate-y-full');
                deferredPrompt = null;
            }
        });
        
        closeBtn?.addEventListener('click', () => {
            banner.classList.add('-translate-y-full');
            localStorage.setItem('hideInstallBanner', 'true');
        });
    } catch(e) {
        console.error('Error en initPWA:', e);
    }
}

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

// ========== FUNCIONES GLOBALES PARA BOTONES ==========
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

// Las funciones de ventanas modales ya están en el objeto window desde sus módulos
// No necesitamos asignarlas aquí

window.mostrarNotificacion = mostrarNotificacion;
window.cambiarReporteMes = cambiarReporteMes;
window.exportarReportePDF = exportarReportePDF;
window.showView = (view) => { currentView = view; renderView(); };
window.addEventListener('refreshView', () => renderView());

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

// ========== INICIALIZACIÓN ==========
async function initApp() {
    console.log('🚀 Iniciando ERP Contable...');

    try {
        // 1. Cargar DB local
        cargarDB();
        console.log('✅ DB cargada');

        // 2. Inicializar navegación, PWA, dark mode
        initNavigation();
        initPWA();
        initDarkMode();
        await verificarAlCargar();
        console.log('✅ Inicialización básica completada');

        // 3. Firebase (no bloqueante)
        try {
            const userId = await initFirebase();
            if (firebaseReady) {
                console.log('🔗 Firebase activo. Usuario:', userId);
                const config = await obtenerConfigEmpresa();
                window.empresaConfig = config;
                console.log('✅ Configuración empresa cargada desde Firebase');
            } else {
                console.log('📁 Usando modo localStorage (Firebase no configurado)');
            }
        } catch(e) {
            console.warn('⚠️ Firebase no iniciado:', e);
        }

        // 4. Renderizar vista inicial
        await renderView();
        console.log('✅ Vista inicial renderizada');

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

// ========== ARRANQUE ==========
document.addEventListener('DOMContentLoaded', initApp);
