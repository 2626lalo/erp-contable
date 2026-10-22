// ==================== modules/empresas.js ====================
// EMPRESAS - Panel de gestión de empresas (tenants) - solo super-admin
// ERP Contable Argentina - v7.15.7
// v7.15.7: al crear/eliminar una empresa, se crea/elimina también un cliente espejo
//          en db.clientes de la empresa activa (para que aparezca en presupuestos).
//          Si el CUIT ya existe o es el de la propia empresa activa, no duplica.

import { escapeHtml, formatDate, mostrarNotificacion, generarId } from './utils.js';
import { getDB, guardarDB } from './db.js';
import {
    esSuperAdmin,
    listarEmpresas,
    cambiarEmpresa,
    getEmpresaId
} from './auth.js';
import {
    obtenerDoc,
    guardarDoc,
    getFirebaseModules,
    getFirestoreInstance,
    isFirebaseReady
} from './firebase.js';

// ==================== HELPERS ====================
function normalizarCuit(cuit) {
    if (!cuit) return '';
    return String(cuit).replace(/[-\s]/g, '');
}

// Busca un cliente en db.clientes por CUIT normalizado
function buscarClientePorCuit(cuit) {
    const db = getDB();
    if (!db.clientes || !cuit) return null;
    const cuitNorm = normalizarCuit(cuit);
    if (!cuitNorm) return null;
    return db.clientes.find(c => normalizarCuit(c.cuit) === cuitNorm) || null;
}

// Crea un cliente espejo a partir de los datos de la empresa
// Devuelve { ok: true, cliente } o { ok: false, motivo }
function crearClienteEspejo(datosEmpresa) {
    const db = getDB();
    if (!db.clientes) db.clientes = [];

    // 1. ¿Ya existe cliente con ese CUIT?
    if (datosEmpresa.cuit) {
        const existente = buscarClientePorCuit(datosEmpresa.cuit);
        if (existente) {
            return { ok: false, motivo: 'cuit_duplicado', cliente: existente };
        }
    }

    // 2. ¿Es la propia empresa activa? (mismo CUIT que datosEmpresa)
    const cuitActivo = normalizarCuit(db.datosEmpresa?.cuit || '');
    const cuitNuevo = normalizarCuit(datosEmpresa.cuit || '');
    if (cuitActivo && cuitNuevo && cuitActivo === cuitNuevo) {
        return { ok: false, motivo: 'es_empresa_activa' };
    }

    // 3. Crear cliente espejo
    const nuevoCliente = {
        id: generarId(),
        nombre: datosEmpresa.nombre || '',
        cuit: datosEmpresa.cuit || '',
        condicionIVA: 'IVA Responsable Inscripto',
        telefono: datosEmpresa.telefono || '',
        email: datosEmpresa.email || '',
        direccion: datosEmpresa.direccion || '',
        provincia: '',
        contacto: '',
        diasCobro: 30,
        metodosPago: [],
        observaciones: `Cliente espejo creado automáticamente desde Empresa (ID: ${datosEmpresa.empresaId || 'N/A'})`,
        saldo: 0,
        esEspejoDeEmpresa: true,
        empresaIdOrigen: datosEmpresa.empresaId || null
    };
    db.clientes.push(nuevoCliente);
    guardarDB();
    return { ok: true, cliente: nuevoCliente };
}

// Elimina el cliente espejo asociado a una empresa (si existe)
function eliminarClienteEspejo(empresaId, cuitEmpresa) {
    const db = getDB();
    if (!db.clientes) return { ok: false, motivo: 'sin_clientes' };

    // Buscar por empresaIdOrigen (más confiable) o por CUIT
    let idx = -1;
    if (empresaId) {
        idx = db.clientes.findIndex(c => c.empresaIdOrigen === empresaId);
    }
    if (idx < 0 && cuitEmpresa) {
        idx = db.clientes.findIndex(c => normalizarCuit(c.cuit) === normalizarCuit(cuitEmpresa) && c.esEspejoDeEmpresa);
    }

    if (idx < 0) return { ok: false, motivo: 'no_encontrado' };

    const cliente = db.clientes[idx];

    // Verificar que no tenga movimientos (presupuestos / ventas)
    const tienePresupuestos = (db.presupuestos || []).some(p => p.clienteId === cliente.id);
    const tieneVentas = (db.ventas || []).some(v => v.clienteId === cliente.id);
    if (tienePresupuestos || tieneVentas) {
        return { ok: false, motivo: 'tiene_movimientos', cliente };
    }

    db.clientes.splice(idx, 1);
    guardarDB();
    return { ok: true, cliente };
}

// ==================== LISTAR EMPRESAS ====================
async function listarEmpresasMeta() {
    if (!isFirebaseReady()) return [];
    const modulos = getFirebaseModules();
    const db = getFirestoreInstance();
    if (!modulos || !db) return [];

    try {
        const { collection, getDocs } = modulos.firestore;
        const ref = collection(db, 'empresas_meta');
        const snap = await getDocs(ref);
        const empresas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        empresas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        return empresas;
    } catch (e) {
        console.error('Error listando empresas:', e);
        return [];
    }
}

// ==================== CREAR EMPRESA ====================
function slugify(nombre) {
    return nombre
        .toString()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 40);
}

async function crearEmpresa(datos) {
    if (!isFirebaseReady()) throw new Error('Firebase no listo');
    const modulos = getFirebaseModules();
    const db = getFirestoreInstance();
    const { doc, setDoc, getDoc } = modulos.firestore;

    const empresaId = slugify(datos.nombre);
    if (!empresaId) throw new Error('Nombre de empresa inválido');

    const existente = await getDoc(doc(db, 'empresas_meta', empresaId));
    if (existente.exists()) {
        throw new Error('Ya existe una empresa con ese nombre');
    }

    // 1. Crear meta en Firestore
    const metaRef = doc(db, 'empresas_meta', empresaId);
    await setDoc(metaRef, {
        nombre: datos.nombre,
        cuit: datos.cuit || '',
        direccion: datos.direccion || '',
        telefono: datos.telefono || '',
        email: datos.email || '',
        plan: datos.plan || 'free',
        fechaCreacion: new Date().toISOString(),
        creadaPor: (await import('./firebase.js')).getCurrentUser()?.email || 'super-admin'
    });

    // 2. Crear cliente espejo en la empresa activa
    const resultadoEspejo = crearClienteEspejo({
        ...datos,
        empresaId
    });

    return { empresaId, espejo: resultadoEspejo };
}

// ==================== ASEGURAR EMPRESA PRINCIPAL ====================
export async function asegurarEmpresasMeta() {
    if (!isFirebaseReady()) return;
    const modulos = getFirebaseModules();
    const db = getFirestoreInstance();
    if (!modulos || !db) return;

    try {
        const { doc, getDoc, setDoc, collection, getDocs } = modulos.firestore;

        const metaPrincipalRef = doc(db, 'empresas_meta', 'empresa_principal');
        const metaPrincipal = await getDoc(metaPrincipalRef);
        if (!metaPrincipal.exists()) {
            const empresaRef = doc(db, 'empresas', 'empresa_principal');
            const empresa = await getDoc(empresaRef);
            if (empresa.exists()) {
                const datos = empresa.data();
                const nombre = datos?.datosEmpresa?.nombre || 'Empresa Principal';
                await setDoc(metaPrincipalRef, {
                    nombre: nombre,
                    cuit: datos?.datosEmpresa?.cuit || '',
                    direccion: datos?.datosEmpresa?.direccion || '',
                    telefono: datos?.datosEmpresa?.telefono || '',
                    email: datos?.datosEmpresa?.email || '',
                    plan: 'principal',
                    fechaCreacion: new Date().toISOString(),
                    creadaPor: 'sistema (migración automática)'
                });
                console.log('✅ empresas_meta/empresa_principal creada automáticamente');
            }
        }

        const empresasRef = collection(db, 'empresas');
        const empresasSnap = await getDocs(empresasRef);
        for (const empresaDoc of empresasSnap.docs) {
            const id = empresaDoc.id;
            if (id === 'empresa_principal') continue;
            const metaRef = doc(db, 'empresas_meta', id);
            const meta = await getDoc(metaRef);
            if (!meta.exists()) {
                const datos = empresaDoc.data();
                const nombre = datos?.datosEmpresa?.nombre || id;
                await setDoc(metaRef, {
                    nombre: nombre,
                    cuit: datos?.datosEmpresa?.cuit || '',
                    direccion: datos?.datosEmpresa?.direccion || '',
                    telefono: datos?.datosEmpresa?.telefono || '',
                    email: datos?.datosEmpresa?.email || '',
                    plan: 'free',
                    fechaCreacion: new Date().toISOString(),
                    creadaPor: 'sistema (migración automática)'
                });
                console.log(`✅ empresas_meta/${id} creada automáticamente`);
            }
        }
    } catch (e) {
        console.warn('Error asegurando metas de empresas:', e);
    }
}

// ==================== VISTA: PANEL DE EMPRESAS ====================
export async function renderPanelEmpresas() {
    if (!esSuperAdmin()) {
        return `<div class="p-8 text-center"><p class="text-gray-500">Solo el super-admin puede ver esta sección</p></div>`;
    }

    const empresas = await listarEmpresasMeta();
    const empresaActual = getEmpresaId();

    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">🏢 Empresas</h1>
                <div class="flex gap-2">
                    <button onclick="window.mostrarModalCrearEmpresa()" class="bg-green-600 text-white px-3 py-1 rounded-lg text-sm">➕ Nueva empresa</button>
                    <button onclick="window.showView('dashboard')" class="text-gray-600 dark:text-gray-300">← Volver</button>
                </div>
            </div>

            <div class="bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700 rounded-xl p-3 text-sm text-purple-800 dark:text-purple-200">
                🏢 Como <strong>super-admin</strong> podés gestionar todas las empresas del sistema.
                La empresa activa es: <strong>${escapeHtml(empresaActual)}</strong>
                <br>
                <span class="text-xs">💡 Al crear una empresa acá, también se agrega como <strong>cliente</strong> en la empresa activa (si no existe ya por CUIT).</span>
            </div>

            ${empresas.length === 0
                ? '<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow"><p class="text-gray-500">No hay empresas creadas</p><p class="text-xs text-gray-400 mt-2">Hacé click en "Nueva empresa" para empezar</p></div>'
                : empresas.map(e => {
                    const esActual = e.id === empresaActual;
                    return `
                        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md border-l-4 ${esActual ? 'border-purple-500' : 'border-blue-500'}">
                            <div class="flex justify-between items-start flex-wrap gap-2">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h3 class="font-bold">${escapeHtml(e.nombre || 'Sin nombre')}</h3>
                                        ${esActual ? '<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">ACTIVA</span>' : ''}
                                        <span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">${escapeHtml(e.plan || 'free')}</span>
                                    </div>
                                    <p class="text-xs text-gray-500 mt-1">
                                        ID: ${escapeHtml(e.id)}
                                        ${e.cuit ? '• CUIT: ' + escapeHtml(e.cuit) : ''}
                                        ${e.fechaCreacion ? '• Creada: ' + formatDate(e.fechaCreacion) : ''}
                                    </p>
                                </div>
                                <div class="flex gap-1 flex-wrap">
                                    ${!esActual ? `<button onclick="window.cambiarEmpresaActiva('${escapeHtml(e.id)}', '${escapeHtml(e.nombre)}')" class="bg-purple-600 text-white px-3 py-1 rounded text-xs">🔀 Activar</button>` : ''}
                                    <button onclick="window.eliminarEmpresaUI('${escapeHtml(e.id)}', '${escapeHtml(e.nombre)}', '${escapeHtml(e.cuit || '')}')" class="bg-red-100 text-red-700 px-3 py-1 rounded text-xs" ${esActual ? 'disabled title="No podés eliminar la empresa activa"' : ''}>🗑️</button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')
            }
        </div>
    `;
}

// ==================== MODAL: CREAR EMPRESA ====================
window.mostrarModalCrearEmpresa = () => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-lg">
            <h2 class="text-xl font-bold mb-4 text-center">🏢 Nueva Empresa</h2>
            <div class="space-y-3">
                <div><label class="block text-sm font-medium">Nombre *</label>
                    <input type="text" id="emp-nombre" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Taller Los Andes">
                </div>
                <div><label class="block text-sm font-medium">CUIT</label>
                    <input type="text" id="emp-cuit" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="30-12345678-9">
                </div>
                <div><label class="block text-sm font-medium">Dirección</label>
                    <input type="text" id="emp-direccion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-sm font-medium">Teléfono</label>
                        <input type="text" id="emp-telefono" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    </div>
                    <div><label class="block text-sm font-medium">Email</label>
                        <input type="email" id="emp-email" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    </div>
                </div>
                <div><label class="block text-sm font-medium">Plan</label>
                    <select id="emp-plan" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <option value="free">Free</option>
                        <option value="basico">Básico</option>
                        <option value="profesional">Profesional</option>
                        <option value="enterprise">Enterprise</option>
                    </select>
                </div>
                <label class="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-200 dark:border-blue-700">
                    <input type="checkbox" id="emp-crearCliente" checked>
                    <span>➕ Crear también como <strong>cliente</strong> en la empresa activa (para poder facturarle presupuestos)</span>
                </label>
                <p class="text-xs text-gray-500">
                    Se va a crear la empresa con datos vacíos. Después hay que crear un usuario admin para esa empresa.
                </p>
            </div>
            <div class="flex gap-3 mt-5">
                <button id="emp-crear" class="flex-1 bg-green-600 text-white py-2 rounded-xl">💾 Crear</button>
                <button id="emp-cancelar" class="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded-xl">❌ Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#emp-crear').onclick = async () => {
        const nombre = modal.querySelector('#emp-nombre').value.trim();
        if (!nombre) { mostrarNotificacion('El nombre es obligatorio', 'warning'); return; }
        const datos = {
            nombre,
            cuit: modal.querySelector('#emp-cuit').value.trim(),
            direccion: modal.querySelector('#emp-direccion').value.trim(),
            telefono: modal.querySelector('#emp-telefono').value.trim(),
            email: modal.querySelector('#emp-email').value.trim(),
            plan: modal.querySelector('#emp-plan').value
        };
        const crearCliente = modal.querySelector('#emp-crearCliente').checked;
        try {
            const { empresaId, espejo } = await crearEmpresa(datos, crearCliente);

            // Notificar según resultado del espejo
            if (!crearCliente) {
                mostrarNotificacion(`✅ Empresa creada: ${nombre} (sin cliente espejo)`, 'success');
            } else if (espejo.ok) {
                mostrarNotificacion(`✅ Empresa creada + cliente agregado: ${nombre}`, 'success');
            } else if (espejo.motivo === 'cuit_duplicado') {
                mostrarNotificacion(`✅ Empresa creada. Ya existía un cliente con ese CUIT: ${espejo.cliente?.nombre || ''}`, 'info');
            } else if (espejo.motivo === 'es_empresa_activa') {
                mostrarNotificacion(`✅ Empresa creada (es la empresa activa, no se duplicó como cliente)`, 'info');
            } else {
                mostrarNotificacion(`✅ Empresa creada: ${nombre}`, 'success');
            }

            modal.remove();
            window.showView('empresas');
        } catch (e) {
            console.error(e);
            mostrarNotificacion('Error al crear empresa: ' + e.message, 'error');
        }
    };

    modal.querySelector('#emp-cancelar').onclick = () => modal.remove();
};

// ==================== CAMBIAR EMPRESA ACTIVA ====================
window.cambiarEmpresaActiva = async (empresaId, nombre) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <h2 class="text-xl font-bold mb-3 text-center">🏢 Cambiar de Empresa</h2>
            <p class="text-center text-gray-600 dark:text-gray-300 mb-4">
                ¿Cambiar a la empresa <strong>${escapeHtml(nombre)}</strong>?
            </p>
            <p class="text-xs text-center text-gray-500 mb-4">
                Se van a recargar los datos de esa empresa.
            </p>
            <div class="flex gap-3">
                <button id="empCambiarOk" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl">✅ Cambiar</button>
                <button id="empCambiarCancel" class="flex-1 bg-gray-300 dark:bg-gray-700 py-3 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#empCambiarOk').onclick = async () => {
        try {
            modal.remove();
            await cambiarEmpresa(empresaId);
            mostrarNotificacion(`🏢 Cambiando a ${nombre}...`, 'info');
            setTimeout(() => window.location.reload(), 500);
        } catch (e) {
            console.error(e);
            mostrarNotificacion('Error al cambiar de empresa', 'error');
        }
    };

    modal.querySelector('#empCambiarCancel').onclick = () => modal.remove();
};

// ==================== ELIMINAR EMPRESA ====================
window.eliminarEmpresaUI = async (empresaId, nombre, cuit) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-md">
            <div class="text-center mb-4">
                <div class="text-5xl mb-2">⚠️</div>
                <h2 class="text-xl font-bold text-red-600">Eliminar Empresa</h2>
            </div>
            <p class="text-center text-gray-700 dark:text-gray-300 mb-2">
                ¿Eliminar la empresa <strong>${escapeHtml(nombre)}</strong>?
            </p>
            <p class="text-xs text-center text-red-600 mb-4">
                Se va a borrar TODO (datos, usuarios, presupuestos, etc).<br>
                Esta acción NO se puede deshacer.
            </p>
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3 mb-4">
                <label class="block text-sm font-medium mb-1">Escribí <strong>ELIMINAR</strong> para confirmar:</label>
                <input type="text" id="confirmarEliminarInput" class="w-full p-2 border border-red-300 dark:border-red-700 rounded-lg dark:bg-gray-700 dark:text-white" placeholder="ELIMINAR" autocomplete="off">
            </div>
            <div class="flex gap-3">
                <button id="empEliminarOk" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed" disabled>🗑️ Eliminar</button>
                <button id="empEliminarCancel" class="flex-1 bg-gray-300 dark:bg-gray-700 py-3 rounded-xl">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#confirmarEliminarInput');
    const btnOk = modal.querySelector('#empEliminarOk');

    input.addEventListener('input', () => {
        btnOk.disabled = input.value.trim().toUpperCase() !== 'ELIMINAR';
    });
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && !btnOk.disabled) btnOk.click();
    });
    input.focus();

    btnOk.onclick = async () => {
        if (input.value.trim().toUpperCase() !== 'ELIMINAR') return;
        try {
            modal.remove();
            const modulos = getFirebaseModules();
            const db = getFirestoreInstance();
            const { doc, deleteDoc } = modulos.firestore;

            // 1. Eliminar cliente espejo (si existe y no tiene movimientos)
            const resEspejo = eliminarClienteEspejo(empresaId, cuit);
            if (resEspejo.ok) {
                mostrarNotificacion(`🗑️ Cliente espejo también eliminado: ${resEspejo.cliente?.nombre || ''}`, 'info');
            } else if (resEspejo.motivo === 'tiene_movimientos') {
                mostrarNotificacion(`⚠️ El cliente espejo tiene movimientos. Se mantiene: ${resEspejo.cliente?.nombre || ''}`, 'warning');
            }

            // 2. Borrar meta de Firestore
            await deleteDoc(doc(db, 'empresas_meta', empresaId));
            // 3. Borrar datos de la empresa
            try {
                await deleteDoc(doc(db, 'empresas', empresaId));
            } catch (e) {
                console.warn('No se pudo borrar datos de empresa:', e);
            }

            mostrarNotificacion(`✅ Empresa "${nombre}" eliminada`, 'success');
            window.showView('empresas');
        } catch (e) {
            console.error(e);
            mostrarNotificacion('Error al eliminar: ' + e.message, 'error');
        }
    };

    modal.querySelector('#empEliminarCancel').onclick = () => modal.remove();
};

// ==================== FUNCIONES GLOBALES ====================
export function initEmpresasEvents() {
    // Nada por ahora, todo con onclick inline
}
