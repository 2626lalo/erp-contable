import { cargarDB } from './modules/db.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderVentas, initVentasEvents, mostrarModalNuevaVenta, mostrarModalCobrarVenta } from './modules/ventas.js';
import { renderCompras, initComprasEvents, mostrarModalNuevaCompra, mostrarModalPagarCompra } from './modules/compras.js';
import { renderPresupuestos, initPresupuestosEvents } from './modules/presupuestos.js';
import { renderReportes, initReportesEvents, cambiarReporteMes, exportarReportePDF } from './modules/reportes.js';
import { renderContador } from './modules/contador.js';
import { renderConfiguracion, initConfiguracionEvents, agregarBotonActualizacion } from './modules/configuracion.js';
import { mostrarNotificacion } from './modules/utils.js';

const APP_VERSION = '4.5.4';
const VERSION_KEY = 'app_version';

function checkAndForceUpdate() {
    const savedVersion = localStorage.getItem(VERSION_KEY);
    if (savedVersion && savedVersion !== APP_VERSION) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
        mostrarNotificacion(`🔄 Nueva versión ${APP_VERSION}. Recargando...`, 'info');
        setTimeout(() => window.location.reload(true), 1500);
        return true;
    } else if (!savedVersion) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
    }
    return false;
}

window.forzarActualizacion = async () => {
    mostrarNotificacion("🔍 Buscando actualizaciones...", 'info');
    try {
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        setTimeout(() => window.location.reload(true), 1000);
    } catch (error) {
        mostrarNotificacion("Error al actualizar", 'error');
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

cargarDB();
initNavigation();
initPWA();
checkAndForceUpdate();
renderView();
