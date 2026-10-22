// ==================== modules/auth.js ====================
// AUTH - Autenticación con email/contraseña y gestión de usuarios
// ERP Contable Argentina - v7.0.0

import {
    registrarUsuario,
    iniciarSesion,
    cerrarSesion as cerrarSesionFB,
    escucharAuth,
    getUsuarioActual,
    setUsuarioActual,
    obtenerDoc,
    guardarDoc,
    getEmpresaActual,
    setEmpresaActual
} from './firebase.js';
import { mostrarNotificacion } from './utils.js';

// ==================== ESTADO ====================
let usuarioActual = null;
let perfilUsuario = null; // { email, rol, estado, fechaRegistro }

// ==================== RENDER LOGIN ====================
export function renderLogin() {
    return `
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-800 p-4">
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md">
                <div class="text-center mb-6">
                    <div class="text-5xl mb-2">📊</div>
                    <h1 class="text-2xl font-bold text-gray-800 dark:text-white">ERP Contable Argentina</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Sistema de gestión</p>
                </div>

                <div id="authMsg" class="hidden mb-4 p-3 rounded-lg text-sm"></div>

                <!-- LOGIN -->
                <div id="loginForm">
                    <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-200">Iniciar Sesión</h2>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">Email</label>
                            <input type="email" id="loginEmail" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="usuario@empresa.com" autocomplete="email">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Contraseña</label>
                            <input type="password" id="loginPassword" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="••••••••" autocomplete="current-password">
                        </div>
                        <button id="btnLogin" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium">
                            Iniciar Sesión
                        </button>
                    </div>
                    <p class="text-sm text-center mt-4 text-gray-600 dark:text-gray-400">
                        ¿No tenés cuenta?
                        <a href="#" id="linkRegistro" class="text-blue-600 dark:text-blue-400 font-medium hover:underline">Registrate</a>
                    </p>
                </div>

                <!-- REGISTRO -->
                <div id="registroForm" class="hidden">
                    <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-200">Crear Cuenta</h2>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">Email</label>
                            <input type="email" id="regEmail" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="usuario@empresa.com" autocomplete="email">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Contraseña</label>
                            <input type="password" id="regPassword" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Repetir Contraseña</label>
                            <input type="password" id="regPassword2" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Repetir contraseña" autocomplete="new-password">
                        </div>
                        <button id="btnRegistrar" class="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium">
                            Crear Cuenta
                        </button>
                    </div>
                    <p class="text-sm text-center mt-4 text-gray-600 dark:text-gray-400">
                        ¿Ya tenés cuenta?
                        <a href="#" id="linkLogin" class="text-blue-600 dark:text-blue-400 font-medium hover:underline">Iniciar Sesión</a>
                    </p>
                </div>
            </div>
        </div>
    `;
}

// ==================== INICIALIZAR EVENTOS DE LOGIN ====================
export function initAuthEvents() {
    // Toggle entre login y registro
    const linkRegistro = document.getElementById('linkRegistro');
    const linkLogin = document.getElementById('linkLogin');
    const loginForm = document.getElementById('loginForm');
    const registroForm = document.getElementById('registroForm');

    if (linkRegistro) {
        linkRegistro.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registroForm.classList.remove('hidden');
        });
    }
    if (linkLogin) {
        linkLogin.addEventListener('click', (e) => {
            e.preventDefault();
            registroForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });
    }

    // Botón de login
    const btnLogin = document.getElementById('btnLogin');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    
    // 🔥 v7.21.2: Login con Enter en los inputs
    const handleEnterLogin = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (btnLogin) btnLogin.click();
        }
    };
    if (loginEmail) loginEmail.addEventListener('keydown', handleEnterLogin);
    if (loginPassword) loginPassword.addEventListener('keydown', handleEnterLogin);

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!email || !password) {
                mostrarAuthMsg('Completá email y contraseña', 'error');
                return;
            }
            btnLogin.disabled = true;
            btnLogin.textContent = 'Iniciando...';
            try {
                await iniciarSesion(email, password);
                // El onAuthStateChanged se encarga de redirigir
            } catch (e) {
                console.error(e);
                let mensaje = 'Error al iniciar sesión';
                if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
                    mensaje = 'Email o contraseña incorrectos';
                } else if (e.code === 'auth/too-many-requests') {
                    mensaje = 'Demasiados intentos. Esperá unos minutos';
                }
                mostrarAuthMsg(mensaje, 'error');
                btnLogin.disabled = false;
                btnLogin.textContent = 'Iniciar Sesión';
            }
        });
    }

    // Botón de registro
    const btnRegistrar = document.getElementById('btnRegistrar');
    if (btnRegistrar) {
        btnRegistrar.addEventListener('click', async () => {
            const email = document.getElementById('regEmail').value.trim();
            const pass1 = document.getElementById('regPassword').value;
            const pass2 = document.getElementById('regPassword2').value;

            if (!email || !pass1 || !pass2) {
                mostrarAuthMsg('Completá todos los campos', 'error');
                return;
            }
            if (pass1.length < 6) {
                mostrarAuthMsg('La contraseña debe tener al menos 6 caracteres', 'error');
                return;
            }
            if (pass1 !== pass2) {
                mostrarAuthMsg('Las contraseñas no coinciden', 'error');
                return;
            }

            btnRegistrar.disabled = true;
            btnRegistrar.textContent = 'Creando cuenta...';
            try {
                const cred = await registrarUsuario(email, pass1);
                const user = cred.user;
                // Determinar rol: primer usuario = admin
                const esPrimerUsuario = await esPrimerUsuarioRegistrado();
                const rol = esPrimerUsuario ? 'admin' : 'pendiente';
                const estado = esPrimerUsuario ? 'activo' : 'pendiente';

                // Guardar perfil en Firestore
                await guardarDoc('usuarios', userId, {
                    email: email,
                    rol: rol,
                    estado: estado,
                    fechaRegistro: new Date().toISOString()
                });

                if (esPrimerUsuario) {
                    mostrarAuthMsg('✅ Cuenta de administrador creada. Redirigiendo...', 'success');
                } else {
                    mostrarAuthMsg('✅ Cuenta creada. Un administrador debe activarla para que puedas ingresar.', 'success');
                }
                // onAuthStateChanged se encarga del resto
            } catch (e) {
                console.error(e);
                let mensaje = 'Error al crear la cuenta';
                if (e.code === 'auth/email-already-in-use') mensaje = 'Ese email ya está registrado';
                else if (e.code === 'auth/invalid-email') mensaje = 'Email inválido';
                else if (e.code === 'auth/weak-password') mensaje = 'Contraseña muy débil';
                mostrarAuthMsg(mensaje, 'error');
                btnRegistrar.disabled = false;
                btnRegistrar.textContent = 'Crear Cuenta';
            }
        });
    }
}

// ==================== HELPERS ====================
function mostrarAuthMsg(mensaje, tipo = 'info') {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent = mensaje;
    el.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
    if (tipo === 'error') {
        el.classList.add('bg-red-100', 'text-red-700');
    } else if (tipo === 'success') {
        el.classList.add('bg-green-100', 'text-green-700');
    } else {
        el.classList.add('bg-blue-100', 'text-blue-700');
    }
}

async function esPrimerUsuarioRegistrado() {
    try {
        // Chequeamos si ya existe el documento de "primer usuario creado"
        const flag = await obtenerDoc('configuracion', 'primerUsuario');
        if (flag && flag.creado) return false;
        // Marcamos que ya se creó el primer usuario
        await guardarDoc('configuracion', 'primerUsuario', { creado: true, fecha: new Date().toISOString() });
        return true;
    } catch (e) {
        console.warn('Error chequeando primer usuario:', e);
        return false;
    }
}

// ==================== PERFIL DE USUARIO ====================
export async function cargarPerfilUsuario(user) {
    if (!user) { perfilUsuario = null; return null; }
    try {
        let perfil = await obtenerDoc('usuarios', user.uid);
        if (!perfil) {
            // Si no existe, lo creamos
            perfil = {
                email: user.email,
                rol: 'pendiente',
                estado: 'pendiente',
                fechaRegistro: new Date().toISOString()
            };
            await guardarDoc('usuarios', user.uid, perfil);
        }
        perfilUsuario = perfil;

        // 🔥 Setear la empresa activa basándose en el perfil
        if (perfil && perfil.empresaId) {
            // Si el usuario es super-admin, restaurar la última empresa seleccionada
            if (perfil.rol === 'super-admin') {
                const empresaGuardada = restaurarEmpresaActual();
                if (empresaGuardada) {
                    console.log('🏢 Super-admin: restaurando empresa', empresaGuardada);
                } else {
                    setEmpresaActual(perfil.empresaId);
                }
            } else {
                setEmpresaActual(perfil.empresaId);
            }
        }

        return perfil;
    } catch (e) {
        console.warn('Error cargando perfil:', e);
        perfilUsuario = null;
        return null;
    }
}

export function getPerfilUsuario() {
    return perfilUsuario;
}

export function getRolUsuario() {
    return perfilUsuario ? perfilUsuario.rol : null;
}

export function getEstadoUsuario() {
    return perfilUsuario ? perfilUsuario.estado : null;
}

// ==================== LOGOUT ====================
export async function logout() {
    try {
        // 🔥 v7.21.6: detener el timer de inactividad ANTES de cerrar sesión
        detenerTimerInactividad();
        await cerrarSesionFB();
        usuarioActual = null;
        perfilUsuario = null;
        // Limpiar localStorage
        localStorage.removeItem('firebase:authUser:' + (window.firebaseConfig?.apiKey || '') + ':[DEFAULT]');
        mostrarNotificacion('Sesión cerrada', 'info');
        window.location.reload();
    } catch (e) {
        console.error('Error cerrando sesión:', e);
        mostrarNotificacion('Error al cerrar sesión', 'error');
    }
}

// ==================== PANTALLA DE ESPERA ====================
export function renderEsperandoAprobacion(email) {
    return `
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-500 to-orange-600 p-4">
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
                <div class="text-5xl mb-4">⏳</div>
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">Cuenta pendiente</h1>
                <p class="text-gray-600 dark:text-gray-400 mb-4">
                    Tu cuenta <strong>${email}</strong> fue creada pero todavía no está activada.
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-500 mb-6">
                    Pedile a un administrador que active tu cuenta para poder ingresar.
                </p>
                <button onclick="window.cerrarSesionYRecargar()" class="bg-gray-600 hover:bg-gray-700 text-white py-2 px-6 rounded-xl text-sm">
                    Cerrar sesión
                </button>
            </div>
        </div>
    `;
}

// ==================== FUNCIONES GLOBALES ====================
window.cerrarSesionYRecargar = () => {
    logout();
};

window.cerrarSesion = logout;


// ==================== IMPERSONACIÓN (Super-admin) ====================
// El super-admin puede "actuar como" cualquier usuario sin cerrar sesión.

let usuarioImpersonado = null; // { uid, email, rol, estado } o null

// 🔥 Devuelve el usuario EFECTIVO (el impersonado si hay, sino el real)
export function getUsuarioEfectivo() {
    if (usuarioImpersonado) return usuarioImpersonado;
    return perfilUsuario;
}

// 🔥 ¿Está impersonando?
export function estaImpersonando() {
    return usuarioImpersonado !== null;
}

// 🔥 Devuelve el usuario impersonado (o null)
export function getUsuarioImpersonado() {
    return usuarioImpersonado;
}

// 🔥 Iniciar impersonación
export function impersonarUsuario(perfil) {
    if (!perfil) return false;
    usuarioImpersonado = {
        uid: perfil.uid || perfil.id,
        email: perfil.email,
        rol: perfil.rol,
        estado: perfil.estado
    };
    // Guardar en localStorage para sobrevivir recargas
    localStorage.setItem('impersonandoUid', usuarioImpersonado.uid);
    localStorage.setItem('impersonandoEmail', usuarioImpersonado.email);
    localStorage.setItem('impersonandoRol', usuarioImpersonado.rol);
    console.log('🎭 Impersonando a:', usuarioImpersonado.email);
    return true;
}

// 🔥 Terminar impersonación
export function volverASesionReal() {
    usuarioImpersonado = null;
    localStorage.removeItem('impersonandoUid');
    localStorage.removeItem('impersonandoEmail');
    localStorage.removeItem('impersonandoRol');
    console.log('🔙 Volviendo a sesión real');
}

// 🔥 Restaurar impersonación desde localStorage (al recargar la página)
export function restaurarImpersonacion() {
    const uid = localStorage.getItem('impersonandoUid');
    const email = localStorage.getItem('impersonandoEmail');
    const rol = localStorage.getItem('impersonandoRol');
    if (uid && email && rol) {
        usuarioImpersonado = { uid, email, rol, estado: 'activo' };
        return true;
    }
    return false;
}

// 🔥 ¿Es super-admin?
export function esSuperAdmin() {
    const perfil = perfilUsuario;
    return perfil && perfil.rol === 'super-admin';
}

// 🔥 ¿Es admin o super-admin?
export function esAdminOSuper() {
    const perfil = perfilUsuario;
    return perfil && (perfil.rol === 'admin' || perfil.rol === 'super-admin');
}

// ==================== EMPRESA / TENANT ====================
// 🔥 Devuelve el ID de la empresa del usuario logueado
export function getEmpresaId() {
    if (perfilUsuario && perfilUsuario.empresaId) {
        return perfilUsuario.empresaId;
    }
    return 'empresa_principal';
}

// 🔥 Devuelve el objeto empresa actual (metadatos)
export async function getEmpresaMeta(empresaId) {
    if (!empresaId) empresaId = getEmpresaId();
    try {
        const meta = await obtenerDoc('empresas_meta', empresaId);
        return meta || { id: empresaId, nombre: 'Sin nombre' };
    } catch (e) {
        console.warn('Error leyendo meta empresa:', e);
        return { id: empresaId, nombre: 'Sin nombre' };
    }
}

// 🔥 Cambia la empresa activa (solo super-admin)
export async function cambiarEmpresa(empresaId) {
    if (!esSuperAdmin()) {
        console.warn('⛔ Solo super-admin puede cambiar de empresa');
        return false;
    }
    if (!empresaId) return false;

    // Guardar en localStorage PRIMERO (para que persista al recargar)
    localStorage.setItem('empresaActualId', empresaId);
    // Actualizar en memoria
    setEmpresaActual(empresaId);
    console.log('🏢 Cambiando a empresa:', empresaId);
    return true;
}

// 🔥 Restaura la empresa activa desde localStorage (al recargar)
// Verifica que exista antes de usarla
export async function restaurarEmpresaActual() {
    const empresaId = localStorage.getItem('empresaActualId');
    if (!empresaId) return null;

    // Verificar que la empresa existe en empresas_meta
    try {
        const { obtenerDoc } = await import('./firebase.js');
        const meta = await obtenerDoc('empresas_meta', empresaId);
        if (meta) {
            setEmpresaActual(empresaId);
            console.log('🏢 Empresa restaurada:', empresaId);
            return empresaId;
        } else {
            // La empresa ya no existe (fue eliminada). Volver a empresa_principal.
            console.log('⚠️ Empresa no existe, volviendo a empresa_principal');
            localStorage.removeItem('empresaActualId');
            setEmpresaActual('empresa_principal');
            return null;
        }
    } catch (e) {
        console.warn('Error verificando empresa:', e);
        localStorage.removeItem('empresaActualId');
        setEmpresaActual('empresa_principal');
        return null;
    }
}

// 🔥 Lista todas las empresas (solo super-admin)
export async function listarEmpresas() {
    if (!esSuperAdmin()) return [];
    try {
        const modulos = (await import('./firebase.js')).getFirebaseModules();
        const db = (await import('./firebase.js')).getFirestoreInstance();
        const { collection, getDocs } = modulos.firestore;
        const ref = collection(db, 'empresas_meta');
        const snap = await getDocs(ref);
        const empresas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return empresas;
    } catch (e) {
        console.warn('Error listando empresas:', e);
        return [];
    }
}

// ==================== CIERRE POR INACTIVIDAD ====================
// Cierra la sesión automáticamente después de N minutos sin actividad.
// Al volver a loguearse, la app se recarga con la última versión.

const INACTIVIDAD_MINUTOS = 10;
const INACTIVIDAD_MS = INACTIVIDAD_MINUTOS * 60 * 1000;

let _intervalInactividad = null;
let _eventosInactividadActivos = false;
let _ultimaActividad = Date.now();

// 🔥 Resetea el timestamp de última actividad
function _resetearTimerInactividad() {
    _ultimaActividad = Date.now();
    console.log('🔄 Actividad detectada. Última actividad actualizada.');
}

// 🔥 Verifica cada minuto si pasó el tiempo de inactividad
function _verificarInactividad() {
    if (!_eventosInactividadActivos) {
        console.log('⏸️ Timer inactivo (no activo)');
        return;
    }
    const inactivo = Date.now() - _ultimaActividad;
    const inactivoMin = (inactivo / 60000).toFixed(2);
    console.log(`⏱️ Inactivo por ${inactivoMin} minutos (límite: ${INACTIVIDAD_MINUTOS})`);
    
    if (inactivo >= INACTIVIDAD_MS) {
        console.log('⏰ Sesión cerrada por inactividad');
        if (typeof window.mostrarNotificacion === 'function') {
            window.mostrarNotificacion('⏰ Sesión cerrada por inactividad', 'info');
        }
        setTimeout(() => {
            logout();
        }, 500);
    }
}

// 🔥 Los eventos que cuentan como "actividad"
const _eventosActividad = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

// 🔥 Activa el sistema de inactividad (llamar después del login)
export function iniciarTimerInactividad() {
    console.log('🔧 iniciarTimerInactividad() llamada');
    if (_eventosInactividadActivos) {
        console.log('⚠️ Timer ya estaba activo, ignorando');
        return;
    }
    _eventosInactividadActivos = true;
    _ultimaActividad = Date.now();

    // Suscribirse a todos los eventos
    _eventosActividad.forEach(evt => {
        document.addEventListener(evt, _resetearTimerInactividad, { passive: true });
    });
    console.log(`✅ Suscripto a ${_eventosActividad.length} eventos de actividad`);

    // Verificar cada minuto
    _intervalInactividad = setInterval(_verificarInactividad, 60 * 1000);

    console.log(`⏰ Timer de inactividad activo: ${INACTIVIDAD_MINUTOS} minutos`);
}

// 🔥 Desactiva el sistema de inactividad (llamar al cerrar sesión)
export function detenerTimerInactividad() {
    console.log('🔧 detenerTimerInactividad() llamada');
    if (!_eventosInactividadActivos) {
        console.log('⚠️ Timer no estaba activo');
        return;
    }
    _eventosInactividadActivos = false;

    if (_intervalInactividad) {
        clearInterval(_intervalInactividad);
        _intervalInactividad = null;
    }

    _eventosActividad.forEach(evt => {
        document.removeEventListener(evt, _resetearTimerInactividad);
    });

    console.log('⏰ Timer de inactividad detenido');
}
