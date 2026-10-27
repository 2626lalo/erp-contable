// ==================== modules/db.js ====================
// BASE DE DATOS - Sincronización con Firestore en tiempo real
// ERP Contable Argentina - v7.16.1
// v7.16.1: agregado movimientos[] + limpiarTodoParaEmpezar() + helpers de cálculo

import { firebaseReady, getUserId, getEmpresaActual, guardarDoc, obtenerDoc, obtenerDocs, escucharColeccion, eliminarDoc, getFirestoreInstance } from './firebase.js';

let dbCache = null;
let dbUnsubscribe = null;
let guardandoEnFirestore = false;
let ultimoHashFirestore = null;

const FIREBASE_VERSION = '10.12.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

// ==================== HELPERS ====================
function estaVacia(db) {
    if (!db) return true;
    const sinClientes = !db.clientes || db.clientes.length === 0;
    const sinProveedores = !db.proveedores || db.proveedores.length === 0;
    const sinVentas = !db.ventas || db.ventas.length === 0;
    const sinEmpresa = !db.datosEmpresa || !db.datosEmpresa.nombre || db.datosEmpresa.nombre.trim() === '';
    return sinClientes && sinProveedores && sinVentas && sinEmpresa;
}

function contarRegistros(db) {
    if (!db) return 0;
    return (db.clientes?.length || 0) + (db.proveedores?.length || 0) +
           (db.ventas?.length || 0) + (db.compras?.length || 0) +
           (db.presupuestos?.length || 0) + (db.costosFijos?.length || 0) +
           (db.unidades?.length || 0) + (db.movimientos?.length || 0);
}

// 🔥 Hash SIN updatedAt (evita ruido de Firestore)
function hashDatos(data) {
    if (!data) return 'vacio';
    const partes = [
        (data.clientes?.length || 0),
        (data.proveedores?.length || 0),
        (data.ventas?.length || 0),
        (data.compras?.length || 0),
        (data.presupuestos?.length || 0),
        (data.costosFijos?.length || 0),
        (data.aportesCapital?.length || 0),
        (data.productos?.length || 0),
        (data.movimientosStock?.length || 0),
        (data.unidades?.length || 0),
        (data.movimientos?.length || 0),
        data.datosEmpresa?.nombre || '',
        data.datosEmpresa?.cuit || '',
        data.datosEmpresa?.direccion || ''
    ];
    return partes.join('|');
}

let db = {
    empresas: [],
    empresaActiva: 1,
    ventas: [],
    compras: [],
    presupuestos: [],
    clientes: [],
    proveedores: [],
    costosFijos: [],
    pagosHistorial: [],
    categoriasGastos: ['Impuestos', 'Servicios', 'Alquiler', 'Sueldos', 'Bancos'],
    notificaciones: [],
    proximoNumPresupuesto: 1001,
    unidades: [],
    formulas: {
        version: 2,
        orden: ["iibb", "tissh", "impuestoCheque", "ganancias", "reservaLegal"],
        componentes: {
            iibb: { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true, exentoHasta: null },
            tissh: { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
            impuestoCheque: { id: "impuestoCheque", nombre: "Impuesto al Cheque", alicuota: 1.2, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
            ganancias: { id: "ganancias", nombre: "Impuesto a las Ganancias", alicuota: 25, baseCalculo: "utilidadAntesGanancias", activo: true, editable: true, esPredeterminado: true },
            reservaLegal: { id: "reservaLegal", nombre: "Reserva Legal SAS", alicuota: 5, baseCalculo: "despuesGanancias", activo: true, editable: true, esPredeterminado: true }
        }
    },
    impuestosPersonalizados: [],
    historialTesoreria: [],
    aportesCapital: [],
    productos: [],
    movimientosStock: [],
    // 🔥 NUEVO v7.16.1: colección de movimientos de tesorería
    movimientos: [],
    datosEmpresa: {
        nombre: '',
        cuit: '',
        condicionIVA: '',
        direccion: '',
        logo: '🏢',
        capitalInicial: 0,
        email: '',
        emails: [],
        telefono: '',
        telefonos: [],
        valorHoraSugerido: 5000,
        markupSugerido: 30,
        gastosFijosMensuales: {
            alquiler: 0,
            sueldos: 0,
            servicios: 0,
            otros: 0
        }
    },
    cierresMensuales: [],
    // 🔥 v7.22.35: cierres anuales (snapshot del año fiscal)
    cierresAnuales: []
};

// ==================== SINCRONIZACIÓN ====================
function asegurarCamposPresupuestoInterno() {
    if (db.presupuestos) {
        let modificado = false;
        db.presupuestos = db.presupuestos.map(p => {
            if (!p.presupuestoPadreId) { p.presupuestoPadreId = null; modificado = true; }
            if (p.estado === undefined) { p.estado = 'pendiente'; modificado = true; }
            if (p.esMora === undefined) { p.esMora = false; modificado = true; }
            if (p.ventaOrigenId === undefined) { p.ventaOrigenId = null; modificado = true; }
            if (p.deudasIncluidas === undefined) { p.deudasIncluidas = null; modificado = true; }
            if (p.impuestosActivados === undefined) { p.impuestosActivados = null; modificado = true; }
            return p;
        });
        return modificado;
    }
    return false;
}

function asegurarCamposVentasInterno() {
    if (db.ventas) {
        let modificado = false;
        db.ventas = db.ventas.map(v => {
            if (v.moraSaldada === undefined) { v.moraSaldada = false; modificado = true; }
            if (v.presupuestoMoraGenerado === undefined) { v.presupuestoMoraGenerado = null; modificado = true; }
            if (v.ocArchivoUrl === undefined) { v.ocArchivoUrl = null; modificado = true; }
            if (v.facturaEmitidaUrl === undefined) { v.facturaEmitidaUrl = null; modificado = true; }
            if (v.comprobanteCobroUrl === undefined) { v.comprobanteCobroUrl = null; modificado = true; }
            if (v.numFacturaEmitida === undefined) { v.numFacturaEmitida = null; modificado = true; }
            if (v.fechaFactura === undefined) { v.fechaFactura = null; modificado = true; }
            if (v.diasCobroCliente === undefined) { v.diasCobroCliente = 0; modificado = true; }
            return v;
        });
        return modificado;
    }
    return false;
}

function asegurarCamposEmpresa() {
    let modificado = false;
    if (!db.datosEmpresa) {
        db.datosEmpresa = {
            nombre: '', cuit: '', condicionIVA: '', direccion: '', logo: '🏢',
            capitalInicial: 0, email: '', emails: [], telefono: '', telefonos: [],
            valorHoraSugerido: 5000, markupSugerido: 30,
            gastosFijosMensuales: { alquiler: 0, sueldos: 0, servicios: 0, otros: 0 }
        };
        modificado = true;
    } else {
        if (db.datosEmpresa.valorHoraSugerido === undefined) { db.datosEmpresa.valorHoraSugerido = 5000; modificado = true; }
        if (db.datosEmpresa.markupSugerido === undefined) { db.datosEmpresa.markupSugerido = 30; modificado = true; }
        if (!db.datosEmpresa.gastosFijosMensuales) {
            db.datosEmpresa.gastosFijosMensuales = { alquiler: 0, sueldos: 0, servicios: 0, otros: 0 };
            modificado = true;
        }
    }
    return modificado;
}

function asegurarAportesCapital() {
    if (!db.aportesCapital) {
        db.aportesCapital = [];
        if (db.datosEmpresa && db.datosEmpresa.capitalInicial && db.datosEmpresa.capitalInicial > 0) {
            db.aportesCapital.push({
                id: Date.now(),
                fecha: new Date().toISOString().split('T')[0],
                monto: db.datosEmpresa.capitalInicial,
                descripcion: 'Capital inicial',
                esInicial: true
            });
        }
        return true;
    }
    return false;
}

function asegurarProductosMovimientos() {
    let modificado = false;
    if (!db.productos) { db.productos = []; modificado = true; }
    if (!db.movimientosStock) { db.movimientosStock = []; modificado = true; }
    if (!db.movimientos) { db.movimientos = []; modificado = true; }
    return modificado;
}

function asegurarCamposUnidadesInterno() {
    if (!db.unidades) { db.unidades = []; return true; }
    let modificado = false;
    db.unidades = db.unidades.map(u => {
        if (u.patente === undefined) { u.patente = ''; modificado = true; }
        if (u.marcaModelo === undefined) { u.marcaModelo = ''; modificado = true; }
        if (u.anio === undefined) { u.anio = ''; modificado = true; }
        if (u.color === undefined) { u.color = ''; modificado = true; }
        if (u.motor === undefined) { u.motor = ''; modificado = true; }
        if (u.chasis === undefined) { u.chasis = ''; modificado = true; }
        if (u.kmActual === undefined) { u.kmActual = ''; modificado = true; }
        if (u.clienteId === undefined) { u.clienteId = null; modificado = true; }
        if (u.clienteNombre === undefined) { u.clienteNombre = ''; modificado = true; }
        if (u.fechaAlta === undefined) { u.fechaAlta = new Date().toISOString(); modificado = true; }
        if (u.fechaUltimoServicio === undefined) { u.fechaUltimoServicio = null; modificado = true; }
        if (u.observaciones === undefined) { u.observaciones = ''; modificado = true; }
        return u;
    });
    return modificado;
}

// ==================== CARGAR ====================
export async function cargarDB() {
    let datosFirestore = null;
    try {
        if (firebaseReady) {
            const empresaId = getEmpresaActual();
            console.log('🔍 db.js usando empresaId:', empresaId);
            if (empresaId && empresaId !== 'local') {
                const doc = await obtenerDoc('empresas', empresaId);
                if (doc) {
                    const { id, ...data } = doc;
                    datosFirestore = data;
                    ultimoHashFirestore = hashDatos(data);
                    console.log('✅ Datos leídos desde Firestore');
                } else {
                    console.log('📭 Empresa sin datos aún (nueva). Arrancando vacío.');
                    datosFirestore = { __empresaNueva: true };
                }
            }
        }
    } catch(e) {
        console.warn('⚠️ No se pudo leer de Firestore:', e);
    }

    let datosLocal = null;
    try {
        const guardado = localStorage.getItem('db_backup');
        if (guardado) {
            datosLocal = JSON.parse(guardado);
            console.log('✅ Datos leídos desde localStorage');
        }
    } catch(e) {
        console.warn('⚠️ No se pudo leer de localStorage:', e);
    }

    const registrosFirestore = contarRegistros(datosFirestore);
    const registrosLocal = contarRegistros(datosLocal);
    console.log(`📊 Registros → Firestore: ${registrosFirestore}, Local: ${registrosLocal}`);

    let datosFinales;
    if (datosFirestore && datosFirestore.__empresaNueva) {
        datosFinales = {};
        console.log('🆕 Empresa nueva. Arrancando con DB vacía.');
    } else if (registrosFirestore > 0 && registrosFirestore >= registrosLocal) {
        datosFinales = datosFirestore;
        console.log('📥 Usando datos de Firestore');
    } else if (registrosLocal > 0) {
        datosFinales = datosLocal;
        console.log('📥 Usando datos de localStorage');
    } else if (datosFirestore) {
        datosFinales = datosFirestore;
        console.log('📥 Usando datos de Firestore (ambos vacíos)');
    } else {
        datosFinales = {};
        console.log('📥 Sin datos previos');
    }

    db = { ...db, ...datosFinales };
    dbCache = db;

    if (!db.empresas) db.empresas = [];
    if (!db.ventas) db.ventas = [];
    if (!db.compras) db.compras = [];
    if (!db.presupuestos) db.presupuestos = [];
    if (!db.clientes) db.clientes = [];
    if (!db.proveedores) db.proveedores = [];
    if (!db.costosFijos) db.costosFijos = [];
    if (!db.pagosHistorial) db.pagosHistorial = [];
    if (!db.categoriasGastos) db.categoriasGastos = ['Impuestos', 'Servicios', 'Alquiler', 'Sueldos', 'Bancos'];
    if (!db.notificaciones) db.notificaciones = [];
    if (!db.impuestosPersonalizados) db.impuestosPersonalizados = [];
    if (!db.historialTesoreria) db.historialTesoreria = [];
    if (!db.cierresMensuales) db.cierresMensuales = [];
    if (!db.cierresAnuales) db.cierresAnuales = [];
    if (!db.cierresAnuales) db.cierresAnuales = [];
    if (!db.aportesCapital) db.aportesCapital = [];
    if (!db.productos) db.productos = [];
    if (!db.movimientosStock) db.movimientosStock = [];
    if (!db.unidades) db.unidades = [];
    if (!db.movimientos) db.movimientos = [];
    if (!db.formulas) {
        db.formulas = {
            version: 2,
            orden: ["iibb", "tissh", "impuestoCheque", "ganancias", "reservaLegal"],
            componentes: {
                iibb: { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true, exentoHasta: null },
                tissh: { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
                impuestoCheque: { id: "impuestoCheque", nombre: "Impuesto al Cheque", alicuota: 1.2, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
                ganancias: { id: "ganancias", nombre: "Impuesto a las Ganancias", alicuota: 25, baseCalculo: "utilidadAntesGanancias", activo: true, editable: true, esPredeterminado: true },
                reservaLegal: { id: "reservaLegal", nombre: "Reserva Legal SAS", alicuota: 5, baseCalculo: "despuesGanancias", activo: true, editable: true, esPredeterminado: true }
            }
        };
    }

    const presupuestoModificado = asegurarCamposPresupuestoInterno();
    const ventaModificado = asegurarCamposVentasInterno();
    const empresaModificado = asegurarCamposEmpresa();
    const aportesModificado = asegurarAportesCapital();
    const productosModificado = asegurarProductosMovimientos();
    const unidadesModificado = asegurarCamposUnidadesInterno();
    if (presupuestoModificado || ventaModificado || empresaModificado || aportesModificado || productosModificado || unidadesModificado) {
        guardarDB();
    }

    if (registrosLocal > registrosFirestore) {
        console.log('📤 Local tiene más datos, forzando guardado a Firestore...');
        await guardarDB();
    }

    return db;
}

export function getDB() {
    if (!dbCache) {
        const localData = localStorage.getItem('db_backup');
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                db = { ...db, ...parsed };
                dbCache = db;
            } catch(e) {}
        }
    }
    return dbCache || db;
}

// ==================== GUARDAR ====================
export async function guardarDB() {
    try {
        const dbActual = dbCache || db;
        if (estaVacia(dbActual)) {
            console.warn('⚠️ DB vacía, guardando solo en localStorage');
            localStorage.setItem('db_backup', JSON.stringify(dbActual));
            return true;
        }

        localStorage.setItem('db_backup', JSON.stringify(dbActual));

        if (firebaseReady) {
            const empresaId = getEmpresaActual();
            if (empresaId && empresaId !== 'local') {
                guardandoEnFirestore = true;
                try {
                    await guardarDoc('empresas', empresaId, dbActual);
                    ultimoHashFirestore = hashDatos(dbActual);
                    console.log('✅ Datos guardados en Firestore');
                } finally {
                    setTimeout(() => {
                        guardandoEnFirestore = false;
                        console.log('🔓 Candado de guardado liberado');
                    }, 1500);
                }
            }
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshView'));
        }
        return true;
    } catch(e) {
        console.error("Error guardando DB:", e);
        guardandoEnFirestore = false;
        return false;
    }
}

export function guardarDBSync() {
    localStorage.setItem('db_backup', JSON.stringify(db));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshView'));
    }
    return true;
}

// ==================== LIMPIAR DATOS ====================
/**
 * Limpia movimientos y/o datos de la DB de forma consistente (sin huérfanos)
 * @param {Object} opciones - qué borrar
 * @param {boolean} opciones.borrarVentas - default false
 * @param {boolean} opciones.borrarCompras - default false
 * @param {boolean} opciones.borrarMovimientos - default false
 * @param {boolean} opciones.borrarPresupuestos - default false
 * @param {boolean} opciones.borrarClientes - default false
 * @param {boolean} opciones.borrarProveedores - default false
 * @param {boolean} opciones.borrarCostosFijos - default false
 * @param {boolean} opciones.borrarCierres - default false
 * @param {boolean} opciones.borrarAportes - default false
 * @param {boolean} opciones.exportarAntes - default true (descarga backup JSON)
 * @returns {Object} { ok, motivo, conteo }
 */
export function limpiarTodoParaEmpezar(opciones = {}) {
    const {
        borrarVentas = false,
        borrarCompras = false,
        borrarMovimientos = false,
        borrarPresupuestos = false,
        borrarClientes = false,
        borrarProveedores = false,
        borrarCostosFijos = false,
        borrarCierres = false,
        borrarAportes = false,
        exportarAntes = true
    } = opciones;

    const dbActual = getDB();

    // 1. Export de seguridad
    if (exportarAntes) {
        try {
            const backup = JSON.stringify(dbActual, null, 2);
            const blob = new Blob([backup], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_pre_limpieza_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch(e) {
            console.warn('No se pudo exportar backup previo:', e);
        }
    }

    // 2. Conteo previo (para reportar)
    const conteo = {
        ventas: dbActual.ventas?.length || 0,
        compras: dbActual.compras?.length || 0,
        movimientos: dbActual.movimientos?.length || 0,
        presupuestos: dbActual.presupuestos?.length || 0,
        clientes: dbActual.clientes?.length || 0,
        proveedores: dbActual.proveedores?.length || 0,
        costosFijos: dbActual.costosFijos?.length || 0,
        cierres: dbActual.cierresMensuales?.length || 0,
        aportes: dbActual.aportesCapital?.length || 0
    };

    // 3. Validaciones (no borrar si hay dependencias)
    if (borrarClientes && ((dbActual.ventas?.length || 0) > 0 || (dbActual.presupuestos?.length || 0) > 0)) {
        return { ok: false, motivo: 'clientes_con_movimientos', conteo };
    }
    if (borrarProveedores && (dbActual.compras?.length || 0) > 0) {
        return { ok: false, motivo: 'proveedores_con_movimientos', conteo };
    }

    // 4. Borrado en cascada
    // 4.1. Ventas → borrar movimientos de cobro + desvincular presupuestos
    if (borrarVentas) {
        const idsVentas = new Set((dbActual.ventas || []).map(v => String(v.id)));
        if (dbActual.movimientos) {
            dbActual.movimientos = dbActual.movimientos.filter(m =>
                !(m.origen === 'venta_cobro' && idsVentas.has(String(m.origenId)))
            );
        }
        (dbActual.presupuestos || []).forEach(p => {
            if (p.ventaGeneradaId && idsVentas.has(String(p.ventaGeneradaId))) {
                p.ventaGeneradaId = null;
                if (p.estado === 'aprobado') p.estado = 'pendiente';
            }
        });
        dbActual.ventas = [];
    }

    // 4.2. Compras → borrar movimientos de pago
    if (borrarCompras) {
        const idsCompras = new Set((dbActual.compras || []).map(c => String(c.id)));
        if (dbActual.movimientos) {
            dbActual.movimientos = dbActual.movimientos.filter(m =>
                !(m.origen === 'compra_pago' && idsCompras.has(String(m.origenId)))
            );
        }
        dbActual.compras = [];
    }

    // 4.3. Movimientos → borrar todos los que queden
    if (borrarMovimientos) {
        dbActual.movimientos = [];
    }

    // 4.4. Presupuestos → desvincular referencias en ventas antes de borrar
    if (borrarPresupuestos) {
        (dbActual.ventas || []).forEach(v => {
            v.presupuestoId = null;
            v.presupuestoMoraGenerado = null;
        });
        dbActual.presupuestos = [];
    }

    // 4.5. Clientes / Proveedores (ya validado arriba que no tienen movimientos)
    if (borrarClientes) dbActual.clientes = [];
    if (borrarProveedores) dbActual.proveedores = [];

    // 4.6. Costos fijos
    if (borrarCostosFijos) dbActual.costosFijos = [];

    // 4.7. Cierres mensuales + historial
    if (borrarCierres) {
        dbActual.cierresMensuales = [];
        dbActual.historialTesoreria = [];
    }

    // 4.8. Aportes de capital (incluye el inicial)
    if (borrarAportes) dbActual.aportesCapital = [];

    // 5. Guardar (esto sobreescribe Firestore sin huérfanos)
    guardarDB();

    return { ok: true, conteo };
}

/**
 * Atajo: limpiar SOLO movimientos (ventas + compras + movimientos)
 * Mantiene clientes, proveedores, presupuestos, costos fijos, aportes
 */
export function limpiarSoloMovimientos() {
    return limpiarTodoParaEmpezar({
        borrarVentas: true,
        borrarCompras: true,
        borrarMovimientos: true,
        borrarPresupuestos: false,
        borrarClientes: false,
        borrarProveedores: false,
        borrarCostosFijos: false,
        borrarCierres: false,
        borrarAportes: false,
        exportarAntes: true
    });
}

/**
 * Atajo: limpiar TODO menos configuración de empresa e impuestos
 * Borra: ventas, compras, movimientos, presupuestos, costos fijos, cierres, aportes
 * Mantiene: clientes, proveedores, datos de empresa, impuestos, unidades, productos
 */
export function limpiarTodoMenosConfig() {
    return limpiarTodoParaEmpezar({
        borrarVentas: true,
        borrarCompras: true,
        borrarMovimientos: true,
        borrarPresupuestos: true,
        borrarClientes: false,
        borrarProveedores: false,
        borrarCostosFijos: true,
        borrarCierres: true,
        borrarAportes: true,
        exportarAntes: true
    });
}

// ==================== HELPERS DE CÁLCULO (para fases siguientes) ====================

/**
 * Calcula la caja real sumando todos los movimientos netos
 */
export function calcularCajaReal() {
    const dbActual = getDB();
    const movimientos = dbActual.movimientos || [];
    let caja = 0;
    movimientos.forEach(m => {
        caja += m.tipo === 'ingreso' ? m.montoNeto : -m.montoNeto;
    });
    return caja;
}

/**
 * Impuesto al cheque acumulado de un mes
 * @param {string} mes - 'YYYY-MM'
 */
export function calcularImpuestoChequeMes(mes) {
    const dbActual = getDB();
    const movs = (dbActual.movimientos || []).filter(m => m.mes === mes);
    const debitos = movs
        .filter(m => m.tipo === 'egreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    const creditos = movs
        .filter(m => m.tipo === 'ingreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    return { debitos, creditos, total: debitos + creditos };
}

/**
 * IVA del mes (ventas - compras computable)
 * @param {string} mes - 'YYYY-MM'
 */
export function calcularIVAMes(mes) {
    const dbActual = getDB();

    // IVA ventas: todas las ventas del mes (cualquier tipo de factura)
    const ventas = (dbActual.ventas || []).filter(v => v.mes === mes);
    const ivaVentas = ventas.reduce((s, v) => s + (v.ivaMonto || 0), 0);

    // IVA compras: solo facturas A (ivaDescontable = true)
    const compras = (dbActual.compras || []).filter(c =>
        c.fechaEmision && c.fechaEmision.startsWith(mes) && c.ivaDescontable
    );
    const ivaCompras = compras.reduce((s, c) => s + (c.ivaMonto || 0), 0);

    return {
        ivaVentas,
        ivaCompras,
        ivaAPagar: ivaVentas - ivaCompras,
        saldoTecnico: ivaCompras > ivaVentas ? ivaCompras - ivaVentas : 0
    };
}

/**
 * Crea un movimiento de tesorería con impuesto al cheque automático
 * @param {Object} params
 */
export function crearMovimiento({
    fecha,
    tipo,          // 'ingreso' | 'egreso'
    origen,        // 'venta_cobro' | 'compra_pago' | 'costo_fijo' | 'aporte_capital' | 'manual'
    origenId,
    origenDescripcion,
    monto,
    medio,         // 'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito' | 'cheque' | 'otro'
    observaciones = ''
}) {
    const dbActual = getDB();
    if (!dbActual.movimientos) dbActual.movimientos = [];

    // 🔥 v7.16.50: alícuota configurable desde db.configuracion
    // 🔥 v7.16.92: alícuota correcta es 0,6% (Ley 25.413), no 3%
    const alicuotaImpCheque = dbActual.configuracion?.alicuotaImpuestoCheque ?? 0.6;

    // Impuesto al cheque automático (solo si medio ≠ efectivo y ≠ otro)
    const aplicaImpuesto = medio !== 'efectivo' && medio !== 'otro';
    const impuestoMonto = aplicaImpuesto ? +(monto * (alicuotaImpCheque / 100)).toFixed(2) : 0;
    const montoNeto = tipo === 'ingreso'
        ? +(monto - impuestoMonto).toFixed(2)
        : +(monto + impuestoMonto).toFixed(2);

    const mov = {
        id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        fecha,
        mes: fecha.substring(0, 7),
        tipo,
        origen,
        origenId,
        origenDescripcion,
        monto,
        medio,
        impuestoDebitoCredito: {
            aplica: aplicaImpuesto,
            tasa: alicuotaImpCheque,
            monto: impuestoMonto
        },
        montoNeto,
        observaciones,
        fechaCreacion: new Date().toISOString()
    };

    dbActual.movimientos.push(mov);
    return mov;
}

// ==================== ESCUCHA EN TIEMPO REAL ====================
export function escucharCambios(callback) {
    if (!firebaseReady) {
        console.warn('⚠️ Firebase no está listo');
        return;
    }

    const empresaId = getEmpresaActual();
    if (!empresaId || empresaId === 'local') {
        console.warn('⚠️ Empresa local');
        return;
    }

    const firestore = getFirestoreInstance();
    if (!firestore) {
        console.warn('⚠️ No se pudo obtener instancia de Firestore');
        return;
    }

    import(`${CDN}/firebase-firestore.js`)
        .then(({ doc, onSnapshot }) => {
            const ref = doc(firestore, 'empresas', empresaId);
            dbUnsubscribe = onSnapshot(ref, (snap) => {
                if (!snap.exists()) return;

                if (guardandoEnFirestore) {
                    console.log('⏸️ Guardando, ignorando snapshot');
                    return;
                }

                const data = snap.data();

                if (ultimoHashFirestore === null) {
                    ultimoHashFirestore = hashDatos(data);
                    console.log('📌 Hash inicial de Firestore guardado');
                    return;
                }

                const nuevoHash = hashDatos(data);

                if (nuevoHash === ultimoHashFirestore) {
                    console.log('⏸️ Snapshot idéntico al anterior, ignorando');
                    return;
                }

                const hashLocal = hashDatos(db);
                if (nuevoHash === hashLocal) {
                    ultimoHashFirestore = nuevoHash;
                    console.log('⏸️ Firestore igual a local, ignorando');
                    return;
                }

                const registrosRemotos = contarRegistros(data);
                const registrosLocales = contarRegistros(db);

                if (registrosRemotos > registrosLocales) {
                    ultimoHashFirestore = nuevoHash;
                    db = { ...db, ...data };
                    dbCache = db;
                    localStorage.setItem('db_backup', JSON.stringify(db));
                    if (callback) callback(db);
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('refreshView'));
                    }
                    console.log(`🔄 Datos actualizados desde Firestore (${registrosRemotos} > ${registrosLocales})`);
                } else {
                    ultimoHashFirestore = nuevoHash;
                    console.log(`⏸️ Firestore (${registrosRemotos}) no supera a local (${registrosLocales}), ignorando`);
                }
            }, (error) => {
                console.warn('⚠️ Error en escucha:', error);
            });
        })
        .catch((e) => {
            console.warn('⚠️ No se pudo cargar Firestore para escucha:', e);
        });
}

export function detenerEscucha() {
    if (dbUnsubscribe) {
        dbUnsubscribe();
        dbUnsubscribe = null;
    }
}

// ==================== COMPATIBILIDAD ====================
export function setDB(nueva) {
    db = nueva;
    dbCache = db;
    guardarDB();
}

export async function getDBAsync() {
    if (!dbCache) await cargarDB();
    return dbCache;
}

export async function guardarDBAsync() {
    await guardarDB();
    return true;
}

/**
 * 🔥 v7.16.58: Verifica si IIBB está exento según la fecha configurada
 * @returns {boolean}
 */
function estaIIBBExento() {
    const dbActual = getDB();
    const iibb = dbActual.formulas?.componentes?.iibb;
    if (!iibb || !iibb.exentoHasta) return false;
    const hoy = new Date().toISOString().split('T')[0];
    return hoy <= iibb.exentoHasta;
}

export function getImpuestosActivos() {
    const dbActual = getDB();
    const activos = [];
    const componentes = dbActual.formulas?.componentes || {};
    const iibbExento = estaIIBBExento();
    for (const [key, imp] of Object.entries(componentes)) {
        // 🔥 Si IIBB está exento, saltarlo
        if (key === 'iibb' && iibbExento) continue;
        if (imp.activo) {
            activos.push({ id: key, ...imp, esPersonalizado: false });
        }
    }
    for (const imp of dbActual.impuestosPersonalizados || []) {
        if (imp.activo) {
            activos.push({ ...imp, esPersonalizado: true });
        }
    }
    const ordenMap = {};
    dbActual.formulas?.orden?.forEach((id, index) => { ordenMap[id] = index; });
    activos.sort((a, b) => {
        const posA = ordenMap[a.id] !== undefined ? ordenMap[a.id] : 999;
        const posB = ordenMap[b.id] !== undefined ? ordenMap[b.id] : 999;
        return posA - posB;
    });
    return activos;
}

export function getTodosLosImpuestos() {
    const dbActual = getDB();
    const todos = [];
    const componentes = dbActual.formulas?.componentes || {};
    for (const [key, imp] of Object.entries(componentes)) {
        todos.push({ id: key, ...imp, esPersonalizado: false });
    }
    for (const imp of dbActual.impuestosPersonalizados || []) {
        todos.push({ ...imp, esPersonalizado: true });
    }
    const ordenMap = {};
    dbActual.formulas?.orden?.forEach((id, index) => { ordenMap[id] = index; });
    todos.sort((a, b) => {
        const posA = ordenMap[a.id] !== undefined ? ordenMap[a.id] : 999;
        const posB = ordenMap[b.id] !== undefined ? ordenMap[b.id] : 999;
        return posA - posB;
    });
    return todos;
}

export function actualizarImpuesto(id, updates, esPersonalizado = false) {
    const dbActual = getDB();
    if (esPersonalizado) {
        const index = dbActual.impuestosPersonalizados.findIndex(i => i.id === id);
        if (index !== -1) {
            dbActual.impuestosPersonalizados[index] = { ...dbActual.impuestosPersonalizados[index], ...updates };
            guardarDB();
            return true;
        }
    } else {
        if (dbActual.formulas.componentes[id]) {
            dbActual.formulas.componentes[id] = { ...dbActual.formulas.componentes[id], ...updates };
            guardarDB();
            return true;
        }
    }
    return false;
}

export function agregarImpuestoPersonalizado(impuesto) {
    const dbActual = getDB();
    const nuevoId = `custom_${Date.now()}`;
    const nuevo = {
        id: nuevoId,
        nombre: impuesto.nombre,
        alicuota: impuesto.alicuota,
        baseCalculo: impuesto.baseCalculo || 'venta',
        activo: true,
        editable: true,
        esPersonalizado: true
    };
    dbActual.impuestosPersonalizados.push(nuevo);
    dbActual.formulas.orden.push(nuevoId);
    guardarDB();
    return nuevo;
}

export function eliminarImpuestoPersonalizado(id) {
    const dbActual = getDB();
    dbActual.impuestosPersonalizados = dbActual.impuestosPersonalizados.filter(i => i.id !== id);
    const ordenIndex = dbActual.formulas.orden.indexOf(id);
    if (ordenIndex !== -1) dbActual.formulas.orden.splice(ordenIndex, 1);
    guardarDB();
    return true;
}

export function reordenarImpuestos(nuevoOrden) {
    const dbActual = getDB();
    dbActual.formulas.orden = nuevoOrden;
    guardarDB();
    return true;
}

export function restablecerFormulasDefault() {
    const dbActual = getDB();
    dbActual.formulas = {
        version: 2,
        orden: ["iibb", "tissh", "impuestoCheque", "ganancias", "reservaLegal"],
        componentes: {
            iibb: { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true, exentoHasta: null },
            tissh: { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
            impuestoCheque: { id: "impuestoCheque", nombre: "Impuesto al Cheque", alicuota: 1.2, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
            ganancias: { id: "ganancias", nombre: "Impuesto a las Ganancias", alicuota: 25, baseCalculo: "utilidadAntesGanancias", activo: true, editable: true, esPredeterminado: true },
            reservaLegal: { id: "reservaLegal", nombre: "Reserva Legal SAS", alicuota: 5, baseCalculo: "despuesGanancias", activo: true, editable: true, esPredeterminado: true }
        }
    };
    dbActual.impuestosPersonalizados = [];
    guardarDB();
    return true;
}

export function exportarConfiguracionImpuestos() {
    const dbActual = getDB();
    return {
        formulas: dbActual.formulas,
        impuestosPersonalizados: dbActual.impuestosPersonalizados,
        fechaExportacion: new Date().toISOString(),
        version: 2
    };
}

export function importarConfiguracionImpuestos(config) {
    if (config.formulas && config.version === 2) {
        const dbActual = getDB();
        dbActual.formulas = config.formulas;
        dbActual.impuestosPersonalizados = config.impuestosPersonalizados || [];
        guardarDB();
        return true;
    }
    return false;
}

export function guardarSnapshotTesoreria(snapshot) {
    const dbActual = getDB();
    if (!dbActual.historialTesoreria) dbActual.historialTesoreria = [];
    const index = dbActual.historialTesoreria.findIndex(h => h.mes === snapshot.mes);
    if (index !== -1) {
        dbActual.historialTesoreria[index] = snapshot;
    } else {
        dbActual.historialTesoreria.push(snapshot);
    }
    guardarDB();
    return true;
}

export function obtenerHistorialTesoreria() {
    const dbActual = getDB();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    
    // 🔥 v7.24.14: Para el mes actual, calcular en vivo (no usar snapshot)
    const snapshotMesActual = (dbActual.historialTesoreria || []).find(h => h.mes === mesActual);
    
    // Calcular datos en vivo del mes actual
    const movsMes = (dbActual.movimientos || []).filter(m => m.mes === mesActual);
    const ingresos = movsMes.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + (m.monto || 0), 0);
    const egresos = movsMes.filter(m => m.tipo === 'egreso').reduce((s, m) => s + (m.monto || 0), 0);
    const neto = ingresos - egresos;
    
    const ventasMes = (dbActual.ventas || []).filter(v => v.mes === mesActual);
    const totalCobrado = ventasMes.filter(v => v.estado === 'cobrado').reduce((s, v) => s + (v.total || 0), 0);
    
    const comprasMes = (dbActual.compras || []).filter(c => c.fechaEmision && c.fechaEmision.startsWith(mesActual));
    const totalPagado = comprasMes.filter(c => c.estadoPago === 'PAGADO').reduce((s, c) => s + (c.totalFactura || 0), 0);
    
    const ivaMes = calcularIVAMes(mesActual);
    const impChequeMes = calcularImpuestoChequeMes(mesActual);
    
    // Capital acumulado (caja inicial + neto del mes)
    const capitalAcumulado = neto; // Simplificado; si hay cierres anteriores, sumar
    
    const historialVivo = {
        mes: mesActual,
        saldoCaja: neto,
        ivaAPagar: ivaMes.ivaAPagar,
        totalCobrado: totalCobrado,
        totalPagado: totalPagado,
        capitalAcumulado: capitalAcumulado,
        ventasCount: ventasMes.length
    };
    
    // Combinar: snapshots de meses anteriores + datos vivos del mes actual
    const historial = [...(dbActual.historialTesoreria || [])];
    
    // Reemplazar o agregar el mes actual
    const idxMesActual = historial.findIndex(h => h.mes === mesActual);
    if (idxMesActual >= 0) {
        historial[idxMesActual] = historialVivo;
    } else {
        historial.push(historialVivo);
    }
    
    return historial.sort((a, b) => a.mes.localeCompare(b.mes));
}

export function obtenerSnapshotPorMes(mes) {
    const dbActual = getDB();
    return (dbActual.historialTesoreria || []).find(h => h.mes === mes) || null;
}

export function asegurarCamposPresupuesto() { return true; }
export function asegurarCamposVentas() { return true; }

/**
 * 🔥 v7.16.50: Impuesto al cheque acumulado del AÑO (para compensar con Ganancias)
 * @param {string} anio - 'YYYY' (opcional, default año actual)
 */
export function calcularImpuestoChequeAnual(anio = null) {
    const dbActual = getDB();
    const anioActual = anio || new Date().getFullYear().toString();
    const movs = (dbActual.movimientos || []).filter(m => m.fecha && m.fecha.startsWith(anioActual));
    const debitos = movs
        .filter(m => m.tipo === 'egreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    const creditos = movs
        .filter(m => m.tipo === 'ingreso' && m.impuestoDebitoCredito?.aplica)
        .reduce((s, m) => s + (m.impuestoDebitoCredito?.monto || 0), 0);
    return {
        anio: anioActual,
        debitos: +debitos.toFixed(2),
        creditos: +creditos.toFixed(2),
        total: +(debitos + creditos).toFixed(2),
        movimientos: movs.filter(m => m.impuestoDebitoCredito?.aplica).length
    };
}

/**
 * 🔥 v7.16.51: Recalcular el impuesto al cheque de TODOS los movimientos existentes
 * Útil cuando se cambia la alícuota configurada.
 * @param {number} nuevaAlicuota - Alícuota nueva en % (ej: 3)
 */
export function recalcularImpuestoChequeTodos(nuevaAlicuota = 3) {
    const dbActual = getDB();
    if (!dbActual.movimientos) return { actualizados: 0 };

    let actualizados = 0;
    dbActual.movimientos.forEach(mov => {
        const aplica = mov.medio !== 'efectivo' && mov.medio !== 'otro';
        const impuestoMonto = aplica ? +(mov.monto * (nuevaAlicuota / 100)).toFixed(2) : 0;
        const montoNeto = mov.tipo === 'ingreso'
            ? +(mov.monto - impuestoMonto).toFixed(2)
            : +(mov.monto + impuestoMonto).toFixed(2);

        // Solo actualizar si cambió
        if (mov.impuestoDebitoCredito?.tasa !== nuevaAlicuota || mov.impuestoDebitoCredito?.monto !== impuestoMonto) {
            mov.impuestoDebitoCredito = {
                aplica,
                tasa: nuevaAlicuota,
                monto: impuestoMonto
            };
            mov.montoNeto = montoNeto;
            actualizados++;
        }
    });

    if (actualizados > 0) {
        guardarDB();
    }
    return { actualizados };
}

// ==================== 🔥 v7.22.35: HELPERS DE CIERRE ANUAL ====================

/**
 * Devuelve el cierre anual de un año (o null si no existe).
 */
export function getCierreAnual(anio) {
    const db = getDB();
    if (!db.cierresAnuales) return null;
    return db.cierresAnuales.find(c => String(c.anio) === String(anio)) || null;
}

/**
 * Guarda (o sobreescribe) el cierre anual de un año.
 * @param {string|number} anio - Año fiscal (ej: 2026)
 * @param {object} snapshot - Objeto con todos los cálculos del año
 */
export function guardarCierreAnual(anio, snapshot) {
    const db = getDB();
    if (!db.cierresAnuales) db.cierresAnuales = [];
    
    const idx = db.cierresAnuales.findIndex(c => String(c.anio) === String(anio));
    const cierre = {
        anio: String(anio),
        fechaCierre: snapshot.fechaCierre || hoyISO(),
        snapshot: snapshot
    };
    
    if (idx >= 0) {
        db.cierresAnuales[idx] = cierre;
    } else {
        db.cierresAnuales.push(cierre);
    }
    
    guardarDB();
    return cierre;
}

/**
 * Lee el cierre del año anterior y devuelve los saldos a favor a arrastrar.
 * @param {string|number} anio - Año actual (ej: 2027)
 * @returns {object|null} - { ivaAFavor, impuestoChequeAcumulado, anioOrigen } o null
 */
export function obtenerSaldosArrastrados(anio) {
    const anioAnterior = String(Number(anio) - 1);
    const cierreAnterior = getCierreAnual(anioAnterior);
    if (!cierreAnterior) return null;
    
    const snapshot = cierreAnterior.snapshot;
    const ivaAFavor = snapshot.iva?.saldoTecnico > 0 ? snapshot.iva.saldoTecnico : 0;
    const impuestoChequeAcumulado = snapshot.impuestoCheque?.total || 0;
    
    if (ivaAFavor === 0 && impuestoChequeAcumulado === 0) return null;
    
    return {
        anioOrigen: anioAnterior,
        ivaAFavor: ivaAFavor,
        impuestoChequeAcumulado: impuestoChequeAcumulado,
        fechaCierreOrigen: cierreAnterior.fechaCierre
    };
}
