// ==================== modules/firebase.js ====================
// Firebase con sincronización en tiempo real - Usando CDN ESM de gstatic
// ERP Contable Argentina - v7.0.0

// ==================== IMPORTS DESDE CDN ====================
const FIREBASE_VERSION = '10.12.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

// ==================== ESTADO GLOBAL ====================
export let firebaseReady = false;
let db = null;
let storage = null;
let auth = null;
let currentUserId = null;
let currentUser = null;   // 🔥 Usuario logueado (o null si anónimo)
let empresaActualId = 'empresa_principal';  // 🔥 Empresa/tenant activo
let unsubscribe = null;
let firebaseModules = null;

// ==================== CONFIGURACIÓN ====================
const firebaseConfig = {
    apiKey: "AIzaSyDswkdh9P3U_Ucwp4RB3AprMqK-brEdKy8",
    authDomain: "erp-contable-app.firebaseapp.com",
    projectId: "erp-contable-app",
    storageBucket: "erp-contable-app.firebasestorage.app",
    messagingSenderId: "38639121942",
    appId: "1:38639121942:web:fa1a57b271134cebbf6737"
};

// ==================== INICIALIZACIÓN ====================
export async function initFirebase() {
    try {
        console.log('🔥 Iniciando Firebase desde CDN...');

        const [appModule, firestoreModule, storageModule, authModule] = await Promise.all([
            import(`${CDN}/firebase-app.js`),
            import(`${CDN}/firebase-firestore.js`),
            import(`${CDN}/firebase-storage.js`),
            import(`${CDN}/firebase-auth.js`)
        ]);

        firebaseModules = {
            app: appModule,
            firestore: firestoreModule,
            storage: storageModule,
            auth: authModule
        };

        const { initializeApp } = appModule;
        const { getFirestore, enableNetwork } = firestoreModule;
        const { getStorage } = storageModule;
        const { getAuth, onAuthStateChanged } = authModule;

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        storage = getStorage(app);
        auth = getAuth(app);

        // 🔥 Ya NO hacemos signInAnonymously. Ahora esperamos al usuario real.
        // Pero necesitamos un fallback para que la app funcione mientras desarrollamos:
        // esperamos 1 segundo a ver si hay sesión; si no, seguimos como "local"
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log('⏱️ Sin sesión activa. Modo local hasta login.');
                resolve();
            }, 1000);
            onAuthStateChanged(auth, (user) => {
                clearTimeout(timeout);
                if (user) {
                    currentUser = user;
                    currentUserId = 'empresa_principal';  // por ahora todos van acá
                    console.log('✅ Usuario logueado:', user.email);
                } else {
                    console.log('🔓 Sin sesión. Esperando login...');
                }
                resolve();
            });
        });

        // Usar un ID fijo para la empresa (así los datos persisten entre sesiones)
        if (!currentUserId) currentUserId = 'empresa_principal';

        firebaseReady = true;
        console.log('✅ Firebase conectado. ID de empresa:', currentUserId);

        try {
            await enableNetwork(db);
        } catch (e) {
            console.warn('enableNetwork no disponible:', e);
        }

        return currentUserId;
    } catch (e) {
        console.error('❌ Firebase no disponible. Modo local.', e);
        firebaseReady = false;
        return 'local_' + Date.now();
    }
}

// ==================== GETTERS ====================
export function getUserId() {
    return firebaseReady ? (empresaActualId || currentUserId || 'empresa_principal') : 'local';
}

export function getFirestoreInstance() {
    return db;
}

export function getAuthInstance() {
    return auth;
}

export function getFirebaseModules() {
    return firebaseModules;
}

export function isFirebaseReady() {
    return firebaseReady;
}

// 🔥 Usuario actual
export function getUsuarioActual() {
    return currentUser;
}

export function setUsuarioActual(user) {
    currentUser = user;
    if (user) {
        // 🔥 El empresaActualId se setea desde afuera con setEmpresaActual()
        // Si no hay empresa seteada, queda empresa_principal por default
        if (!empresaActualId) empresaActualId = 'empresa_principal';
    }
}

// ==================== FUNCIONES DE AUTH ====================
export async function registrarUsuario(email, password) {
    if (!firebaseReady || !auth || !firebaseModules) {
        throw new Error('Firebase no está listo');
    }
    const { createUserWithEmailAndPassword } = firebaseModules.auth;
    return await createUserWithEmailAndPassword(auth, email, password);
}

export async function iniciarSesion(email, password) {
    if (!firebaseReady || !auth || !firebaseModules) {
        throw new Error('Firebase no está listo');
    }
    const { signInWithEmailAndPassword } = firebaseModules.auth;
    return await signInWithEmailAndPassword(auth, email, password);
}

export async function cerrarSesion() {
    if (!firebaseReady || !auth || !firebaseModules) {
        throw new Error('Firebase no está listo');
    }
    const { signOut } = firebaseModules.auth;
    await signOut(auth);
    currentUser = null;
}

export function escucharAuth(callback) {
    if (!firebaseReady || !auth || !firebaseModules) return () => {};
    const { onAuthStateChanged } = firebaseModules.auth;
    return onAuthStateChanged(auth, callback);
}

// ==================== GUARDAR DOCUMENTO ====================
export async function guardarDoc(coleccion, id, data) {
    if (firebaseReady && db && firebaseModules) {
        try {
            const { doc, setDoc, serverTimestamp } = firebaseModules.firestore;
            const ref = doc(db, coleccion, id);
            await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
            return id;
        } catch (e) {
            console.warn('⚠️ Firebase guardado falló, usando localStorage', e);
        }
    }
    const key = `firebase_fallback_${coleccion}_${id}`;
    localStorage.setItem(key, JSON.stringify({ ...data, id }));
    return id;
}

// ==================== OBTENER DOCUMENTO ====================
export async function obtenerDoc(coleccion, id) {
    if (firebaseReady && db && firebaseModules) {
        try {
            const { doc, getDoc } = firebaseModules.firestore;
            const ref = doc(db, coleccion, id);
            const snap = await getDoc(ref);
            if (snap.exists()) return { id: snap.id, ...snap.data() };
        } catch (e) {
            console.warn('⚠️ Firebase lectura falló, usando localStorage', e);
        }
    }
    const key = `firebase_fallback_${coleccion}_${id}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}

// ==================== OBTENER DOCUMENTOS ====================
export async function obtenerDocs(coleccion, condiciones = []) {
    if (firebaseReady && db && firebaseModules) {
        try {
            const { collection, getDocs, query, where, orderBy } = firebaseModules.firestore;
            let q = collection(db, coleccion);
            if (condiciones.length > 0) {
                const constraints = condiciones.map(c => where(c.campo, c.operador, c.valor));
                q = query(q, ...constraints);
            } else {
                q = query(q, orderBy('fechaEmision', 'desc'));
            }
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('⚠️ Firebase lectura falló, usando localStorage', e);
        }
    }
    const prefix = `firebase_fallback_${coleccion}_`;
    const docs = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            const id = key.replace(prefix, '');
            const data = JSON.parse(localStorage.getItem(key));
            docs.push({ id, ...data });
        }
    }
    return docs;
}

// ==================== ESCUCHAR COLECCIÓN EN TIEMPO REAL ====================
export function escucharColeccion(coleccion, callback, condiciones = []) {
    if (firebaseReady && db && firebaseModules) {
        try {
            const { collection, query, where, orderBy, onSnapshot } = firebaseModules.firestore;
            let q = collection(db, coleccion);
            if (condiciones.length > 0) {
                const constraints = condiciones.map(c => where(c.campo, c.operador, c.valor));
                q = query(q, ...constraints);
            } else {
                q = query(q, orderBy('fechaEmision', 'desc'));
            }
            const unsub = onSnapshot(q, (snapshot) => {
                const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                callback(docs);
            }, (error) => {
                console.warn('⚠️ Error en escucha:', error);
            });
            return unsub;
        } catch (e) {
            console.warn('⚠️ Firebase escucha falló', e);
        }
    }
    console.warn('🔇 Escucha en tiempo real no disponible en modo local');
    return () => {};
}

// ==================== ELIMINAR DOCUMENTO ====================
export async function eliminarDoc(coleccion, id) {
    if (firebaseReady && db && firebaseModules) {
        try {
            const { doc, deleteDoc } = firebaseModules.firestore;
            const ref = doc(db, coleccion, id);
            await deleteDoc(ref);
            return;
        } catch (e) {
            console.warn('⚠️ Firebase eliminación falló', e);
        }
    }
    localStorage.removeItem(`firebase_fallback_${coleccion}_${id}`);
}

// ==================== SUBIR ARCHIVO A STORAGE ====================
export async function subirArchivo(ruta, archivo) {
    if (firebaseReady && storage && firebaseModules) {
        try {
            const { ref, uploadBytes, getDownloadURL } = firebaseModules.storage;
            // 🔥 v7.16.83: usar empresaId (multi-tenant), no currentUserId
            const storageRef = ref(storage, `empresas/${empresaActualId}/${ruta}`);
            await uploadBytes(storageRef, archivo);
            return await getDownloadURL(storageRef);
        } catch (e) {
            console.warn('⚠️ Firebase subida falló', e);
        }
    }
    throw new Error('Subida de archivos solo disponible con Firebase');
}

// ==================== CONFIGURACIÓN DE EMPRESA ====================
export async function obtenerConfigEmpresa() {
    const config = await obtenerDoc('configuracion', 'empresa');
    if (config) return config;
    const defaults = {
        razonSocial: 'Mi Empresa',
        cuit: '',
        direccion: '',
        telefono: '',
        logoUrl: '',
        capitalInicial: 0,
        ivaDefault: 21,
        iibbPorcentaje: 3,
        diasValidezPresupuesto: 7,
        diasAlertaPago: 3,
        porcentajeRecargoMora: 5,
        comisionTarjetaDefault: 3,
        ultimoNumeroPresupuesto: 0,
        ultimoNumeroFacturaVenta: 0
    };
    await guardarDoc('configuracion', 'empresa', defaults);
    return defaults;
}

export async function actualizarConfigEmpresa(data) {
    await guardarDoc('configuracion', 'empresa', data);
}

// ==================== EMPRESA / TENANT ====================
// 🔥 Setea la empresa activa (tenant)
export function setEmpresaActual(empresaId) {
    if (!empresaId) return;
    empresaActualId = empresaId;
    currentUserId = empresaId;  // compatibilidad con código viejo
    console.log('🏢 Empresa actual:', empresaActualId);
}

// 🔥 Devuelve la empresa activa
export function getEmpresaActual() {
    console.log('🔍 getEmpresaActual devolviendo:', empresaActualId);
    return empresaActualId || 'empresa_principal';
}

// 🔥 Devuelve el usuario logueado
export function getCurrentUser() {
    return currentUser;
}

// ==================== 🔥 v7.16.83: COMPRIMIR IMAGEN ====================
// Comprime una imagen a JPEG calidad 70% antes de subirla a Storage.
// Los PDFs NO se comprimen (se suben tal cual).
// Uso: const fileComprimido = await comprimirImagen(file);
export async function comprimirImagen(file, maxAncho = 1600, calidad = 0.7) {
    // Solo comprimir imágenes, PDFs pasan tal cual
    if (!file || !file.type || !file.type.startsWith('image/')) {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let ancho = img.width;
                let alto = img.height;

                if (ancho > maxAncho) {
                    alto = (alto * maxAncho) / ancho;
                    ancho = maxAncho;
                }

                canvas.width = ancho;
                canvas.height = alto;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, ancho, alto);

                canvas.toBlob((blob) => {
                    if (!blob) { resolve(file); return; }
                    const nombreBase = file.name.replace(/\.[^.]+$/, '');
                    const nuevoFile = new File([blob], `${nombreBase}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    const reduccion = ((1 - nuevoFile.size / file.size) * 100).toFixed(0);
                    console.log(`🗜️ Imagen comprimida: ${(file.size/1024).toFixed(0)}KB → ${(nuevoFile.size/1024).toFixed(0)}KB (-${reduccion}%)`);
                    resolve(nuevoFile);
                }, 'image/jpeg', calidad);
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}
