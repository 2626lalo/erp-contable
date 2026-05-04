import { cargarDB } from './modules/db.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderVentas, initVentasEvents, mostrarModalNuevaVenta, mostrarModalCobrarVenta } from './modules/ventas.js';
import { renderCompras, initComprasEvents, mostrarModalNuevaCompra, mostrarModalPagarCompra } from './modules/compras.js';
import { renderPresupuestos, initPresupuestosEvents } from './modules/presupuestos.js';
import { renderReportes, initReportesEvents, cambiarReporteMes, exportarReportePDF } from './modules/reportes.js';
import { renderContador } from './modules/contador.js';
import { renderConfiguracion, initConfiguracionEvents } from './modules/configuracion.js';
import { mostrarNotificacion } from './modules/utils.js';

// ========== CONTROL DE VERSIONES ==========
// v4.3.1 - 03/05/2025: Editor de imagen mejorado con recorte, zoom, brillo, contraste. Flujo simplificado
const APP_VERSION = '4.3.1';
const VERSION_KEY = 'app_version';

function checkForUpdates() {
    const savedVersion = localStorage.getItem(VERSION_KEY);
    if (savedVersion && savedVersion !== APP_VERSION) {
        mostrarNotificacion(`🔄 Nueva versión ${APP_VERSION} disponible. Actualizando...`, 'info');
        localStorage.setItem(VERSION_KEY, APP_VERSION);
        setTimeout(() => {
            if (confirm('Se ha detectado una nueva versión. ¿Desea recargar la app para actualizar?')) {
                window.location.reload();
            }
        }, 2000);
    } else if (!savedVersion) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
    }
    console.log(`📱 ERP Contable - Versión ${APP_VERSION}`);
}

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registrado:', registration);
                navigator.serviceWorker.addEventListener('message', event => {
                    if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
                        mostrarNotificacion('🔄 Nueva versión disponible. Actualizando...', 'info');
                        setTimeout(() => window.location.reload(), 1500);
                    }
                });
                setInterval(() => registration.update(), 30000);
            })
            .catch(error => console.log('Service Worker error:', error));
    }
}

window.forzarActualizacion = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) {
                registration.update();
                mostrarNotificacion('🔍 Buscando actualizaciones...', 'info');
                setTimeout(() => window.location.reload(), 1000);
            }
        });
    } else {
        window.location.reload();
    }
};

window.mostrarModalNuevaVenta = mostrarModalNuevaVenta;
window.mostrarModalCobrarVenta = mostrarModalCobrarVenta;
window.mostrarModalNuevaCompra = mostrarModalNuevaCompra;
window.mostrarModalPagarCompra = mostrarModalPagarCompra;
window.mostrarNotificacion = mostrarNotificacion;
window.cambiarReporteMes = cambiarReporteMes;
window.exportarReportePDF = exportarReportePDF;

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
    else if (currentView === 'configuracion') root.innerHTML = renderConfiguracion();
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

cargarDB();
initNavigation();
initPWA();
registerSW();
checkForUpdates();
renderView();
