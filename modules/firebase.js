// ==================== modules/firebase.js ====================
// Firebase con fallback a localStorage (sin romper nada)
// ERP Contable Argentina - v7.0.0

// Cambiar a true cuando tengas credenciales de Firebase
const HAS_FIREBASE = false;

let firebaseReady = false;
let db = null;
let storage = null;
let auth = null;
let currentUserId = null;

// Función para iniciar Firebase (se llama una sola vez)
export async function initFirebase() {
    if (!HAS_FIREBASE) {
        console.warn('⚠️ Firebase desactivado. Usando modo local.');
        return 'local_' + Date.now();
    }

    try {
        // Importar dinámicamente los módulos de Firebase
        const { initializeApp } = await import('firebase/app');
        const { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, addDoc } = await import('firebase/firestore');
        const { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } = await import('firebase/storage');
        const { getAuth, signInAnonymously } = await import('firebase/auth');

        // 🔧 REEMPLAZÁ ESTOS VALORES CON LOS TUYOS (desde Firebase Console)
        const firebaseConfig = {
            apiKey: "AIzaSy...",          // <-- CAMBIAR
            authDomain: "tu-proyecto.firebaseapp.com",
            projectId: "tu-proyecto",
            storageBucket: "tu-proyecto.appspot.com",
            messagingSenderId: "123456789",
            appId: "1:123456789:web:abcdef"
        };

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        storage = getStorage(app);
        auth = getAuth(app);

        // Autenticación anónima
        await signInAnonymously(auth);
        currentUserId = auth.currentUser?.uid || 'anon_' + Date.now();
        firebaseReady = true;
        console.log('✅ Firebase conectado. Usuario:', currentUserId);
        return currentUserId;
    } catch (e) {
        console.warn('⚠️ Firebase no disponible. Modo local.', e);
        firebaseReady = false;
        return 'local_' + Date.now();
    }
}

export function getUserId() {
    return firebaseReady ? currentUserId : 'local';
}

// ==================== API UNIFICADA (Firebase o localStorage) ====================

export async function guardarDoc(coleccion, id, data) {
    if (firebaseReady && db) {
        try {
            const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
            const ref = doc(db, 'empresas', currentUserId, coleccion, id);
            await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
            return id;
        } catch (e) {
            console.warn('Firebase guardado falló, usando localStorage', e);
        }
    }
    // Fallback: localStorage
    const key = `firebase_fallback_${coleccion}_${id}`;
    localStorage.setItem(key, JSON.stringify({ ...data, id }));
    return id;
}

export async function obtenerDoc(coleccion, id) {
    if (firebaseReady && db) {
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const ref = doc(db, 'empresas', currentUserId, coleccion, id);
            const snap = await getDoc(ref);
            if (snap.exists()) return { id: snap.id, ...snap.data() };
        } catch (e) {
            console.warn('Firebase lectura falló, usando localStorage', e);
        }
    }
    const key = `firebase_fallback_${coleccion}_${id}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}

export async function obtenerDocs(coleccion, condiciones = []) {
    if (firebaseReady && db) {
        try {
            const { collection, getDocs, query, where, orderBy } = await import('firebase/firestore');
            let q = collection(db, 'empresas', currentUserId, coleccion);
            if (condiciones.length > 0) {
                const constraints = condiciones.map(c => where(c.campo, c.operador, c.valor));
                q = query(q, ...constraints, orderBy('fechaEmision', 'desc'));
            } else {
                q = query(q, orderBy('fechaEmision', 'desc'));
            }
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('Firebase lectura falló, usando localStorage', e);
        }
    }
    // Fallback: leer localStorage
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

export function escucharColeccion(coleccion, callback, condiciones = []) {
    if (firebaseReady && db) {
        try {
            import('firebase/firestore').then(({ collection, query, where, orderBy, onSnapshot }) => {
                let q = collection(db, 'empresas', currentUserId, coleccion);
                if (condiciones.length > 0) {
                    const constraints = condiciones.map(c => where(c.campo, c.operador, c.valor));
                    q = query(q, ...constraints, orderBy('fechaEmision', 'desc'));
                } else {
                    q = query(q, orderBy('fechaEmision', 'desc'));
                }
                return onSnapshot(q, (snapshot) => {
                    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    callback(docs);
                });
            });
        } catch (e) {
            console.warn('Firebase escucha falló', e);
        }
    }
    // Fallback: no hay escucha en tiempo real
    console.warn('Escucha en tiempo real no disponible en modo local');
    return () => {};
}

export async function eliminarDoc(coleccion, id) {
    if (firebaseReady && db) {
        try {
            const { doc, deleteDoc } = await import('firebase/firestore');
            const ref = doc(db, 'empresas', currentUserId, coleccion, id);
            await deleteDoc(ref);
            return;
        } catch (e) {
            console.warn('Firebase eliminación falló', e);
        }
    }
    localStorage.removeItem(`firebase_fallback_${coleccion}_${id}`);
}

export async function subirArchivo(ruta, archivo) {
    if (firebaseReady && storage) {
        try {
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const storageRef = ref(storage, `empresas/${currentUserId}/${ruta}`);
            await uploadBytes(storageRef, archivo);
            return await getDownloadURL(storageRef);
        } catch (e) {
            console.warn('Firebase subida falló', e);
        }
    }
    throw new Error('Subida de archivos solo disponible con Firebase');
}

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

export { firebaseReady };
