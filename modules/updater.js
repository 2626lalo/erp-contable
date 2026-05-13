// Módulo de actualización forzada
export function forzarActualizacionCompleta() {
    return new Promise(async (resolve) => {
        const versionActual = localStorage.getItem('app_version');
        localStorage.clear();
        if (versionActual) localStorage.setItem('app_version', versionActual);
        
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
        }
        
        const url = new URL(window.location.href);
        url.searchParams.set('_refresh', Date.now());
        window.location.href = url.toString();
        resolve();
    });
}

export async function verificarVersionRemota() {
    try {
        const response = await fetch('/version.json?t=' + Date.now());
        const data = await response.json();
        const versionLocal = localStorage.getItem('app_version') || '0.0.0';
        return { versionRemota: data.version, hayActualizacion: versionLocal !== data.version };
    } catch(e) {
        return { versionRemota: null, hayActualizacion: false };
    }
}
