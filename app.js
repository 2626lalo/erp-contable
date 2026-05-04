import { cargarDB } from './modules/db.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderVentas, initVentasEvents, mostrarModalNuevaVenta, mostrarModalCobrarVenta } from './modules/ventas.js';
import { renderCompras, initComprasEvents, mostrarModalNuevaCompra, mostrarModalPagarCompra } from './modules/compras.js';
import { renderPresupuestos, initPresupuestosEvents } from './modules/presupuestos.js';
import { renderReportes, initReportesEvents, cambiarReporteMes, exportarReportePDF } from './modules/reportes.js';
import { renderContador } from './modules/contador.js';
import { renderConfiguracion, initConfiguracionEvents, agregarBotonActualizacion } from './modules/configuracion.js';
import { mostrarNotificacion } from './modules/utils.js';

// ========== CONTROL DE VERSIONES ==========
const APP_VERSION = '4.3.2';
const VERSION_KEY = 'app_version';

// Forzar recarga si hay nueva versión
function checkAndForceUpdate() {
    const savedVersion = localStorage.getItem(VERSION_KEY);
    if (savedVersion && savedVersion !== APP_VERSION) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
        mostrarNotificacion(`🔄 Nueva versión ${APP_VERSION}. Recargando...`, 'info');
        setTimeout(() => {
            window.location.reload(true);
        }, 1500);
        return true;
    } else if (!savedVersion) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
    }
    return false;
}

// Verificar versión en el servidor (comparar con archivo)
async function verificarVersionServidor() {
    try {
        const response = await fetch('/version.json?t=' + Date.now());
        if (response.ok) {
            const data = await response.json();
            if (data.version && data.version !== APP_VERSION) {
                mostrarNotificacion(`🔄 Nueva versión ${data.version} disponible. Actualizando...`, 'info');
                localStorage.setItem(VERSION_KEY, data.version);
                setTimeout(() => window.location.reload(true), 1500);
            }
        }
    } catch (error) {
        console.log('No se pudo verificar versión en servidor');
    }
}

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=' + APP_VERSION)
            .then(registration => {
                console.log('Service Worker registrado:', registration);
                
                navigator.serviceWorker.addEventListener('message', event => {
                    if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
                        mostrarNotificacion('🔄 Nueva versión disponible. Actualizando...', 'info');
                        setTimeout(() => window.location.reload(true), 1500);
                    }
                });
                
                // Verificar actualizaciones cada 30 segundos
                setInterval(() => {
                    registration.update();
                }, 30000);
            })
            .catch(error => console.log('Service Worker error:', error));
    }
}

window.forzarActualizacion = async () => {
    mostrarNotificacion("🔍 Buscando actualizaciones...", 'info');
    
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.update();
            }
        }
        
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        
        setTimeout(() => {
            window.location.reload(true);
        }, 1000);
        
    } catch (error) {
        console.error('Error al actualizar:', error);
        mostrarNotificacion("Error al actualizar. Recargá manualmente.", 'error');
    }
};

// Exponer funciones globales
window.mostrarModalNuevaVenta = mostrarModalNuevaVenta;
window.mostrarModalCobrarVenta = mostrarModalCobrarVenta;
window.mostrarModalNuevaCompra = mostrarModalNuevaCompra;
window.mostrarModalPagarCompra = mostrarModalPagarCompra;
window.mostrarNotificacion = mostrarNotificacion;
window.cambiarReporteMes = cambiarReporteMes;
window.exportarReportePDF = exportarReportePDF;
window.forzarActualizacion = window.forzarActualizacion;

window.filtrarVentas = () => {
    const select = document.getElementById('mesSelectVentas');
    if (select) localStorage.setItem('ventasMesFiltro', select.value);
    window.dispatchEvent(new Event('refreshView'));
};

window.filtrarCompras = () => {
    const select = document.getElementById('mesSelectCompras');
    if (select) localStorage.setItem('comprasMesFiltro', select.value);
    window.dispatchEvent(new Event('refreshView'));
};

let currentView = 'dashboard';

async function renderView() {
    const root = document.getElementById('root');
    if (!root) return;
    
    if (currentView === 'dashboard') root.innerHTML = renderDashboard();
    else if (currentView === 'ventas') root.innerHTML = renderVentas();
    else if (currentView === 'compras') root.innerHTML = renderCompras();
    else if (currentView === 'presupuestos') root.innerHTML = renderPresupuestos();
    else if (currentView === 'reportes') root.innerHTML = renderReportes();
    else if (currentView === 'contador') root.innerHTML = renderContador();
    else if (currentView === 'configuracion') {
        root.innerHTML = renderConfiguracion();
        setTimeout(() => agregarBotonActualizacion(), 100);
    }
    else root.innerHTML = renderDashboard();
    
    if (currentView === 'ventas') initVentasEvents();
    if (currentView === 'compras') initComprasEvents();
    if (currentView === 'presupuestos') initPresupuestosEvents();
    if (currentView === 'reportes') initReportesEvents();
    if (currentView === 'configuracion') initConfiguracionEvents();
}

function initNavigation() {
    const navButtons = document.querySelectorAll('[data-view]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentView = btn.dataset.view;
            renderView();
        });
    });
}

function initPWA() {
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
        banner?.classList.remove('-translate-y-full');
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
}

window.showView = (view) => { currentView = view; renderView(); };
window.addEventListener('refreshView', () => renderView());

// Inicializar
cargarDB();
initNavigation();
initPWA();
registerSW();

// Verificar actualizaciones
if (!checkAndForceUpdate()) {
    verificarVersionServidor();
}

renderView();
