// ==================== modules/db.js ====================
// BASE DE DATOS - Con soporte para impuestos dinámicos

let dbCache = null;

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
    formulas: {
        version: 2,
        orden: ["iibb", "tissh", "impuestoCheque", "ganancias", "reservaLegal"],
        componentes: {
            iibb: { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true },
            tissh: { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true },
            impuestoCheque: { id: "impuestoCheque", nombre: "Impuesto al Cheque", alicuota: 1.2, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
            ganancias: { id: "ganancias", nombre: "Impuesto a las Ganancias", alicuota: 25, baseCalculo: "utilidadAntesGanancias", activo: true, editable: true, esPredeterminado: true },
            reservaLegal: { id: "reservaLegal", nombre: "Reserva Legal SAS", alicuota: 5, baseCalculo: "despuesGanancias", activo: true, editable: true, esPredeterminado: true }
        }
    },
    impuestosPersonalizados: []
};

export function cargarDB() {
    try {
        db = {
            empresas: JSON.parse(localStorage.getItem('empresas') || '[{"id":1,"nombre":"Mi Empresa SRL","cuit":"30-12345678-9","direccion":"Av. Corrientes 123","telefono":"11-1234-5678","email":"info@miempresa.com","logo":"🏢","whatsapp":"5491112345678"}]'),
            empresaActiva: JSON.parse(localStorage.getItem('empresaActiva') || '1'),
            ventas: JSON.parse(localStorage.getItem('ventas') || '[]'),
            compras: JSON.parse(localStorage.getItem('compras') || '[]'),
            presupuestos: JSON.parse(localStorage.getItem('presupuestos') || '[]'),
            clientes: JSON.parse(localStorage.getItem('clientes') || '[{"id":1,"nombre":"Cliente Ejemplo SA","cuit":"30-12345678-9","telefono":"11-1234-5678","email":"cliente@mail.com","direccion":"Av. Santa Fe 123","contacto":"Juan Pérez","diasCobro":30,"saldo":0,"whatsapp":"5491112345678"}]'),
            proveedores: JSON.parse(localStorage.getItem('proveedores') || '[{"id":1,"nombre":"Proveedor Ejemplo","cuit":"30-11111111-1","telefono":"11-1111-1111","email":"proveedor@mail.com","direccion":"Belgrano 789","contacto":"Carlos Gómez","diasPago":30,"saldo":0}]'),
            costosFijos: JSON.parse(localStorage.getItem('costosFijos') || '[{"id":1,"nombre":"AFIP Monotributo","monto":32000,"vencimiento":"2025-05-20","estado":"pendiente","categoria":"Impuestos","recurrente":true}]'),
            pagosHistorial: JSON.parse(localStorage.getItem('pagosHistorial') || '[]'),
            categoriasGastos: JSON.parse(localStorage.getItem('categoriasGastos') || '["Impuestos","Servicios","Alquiler","Sueldos","Bancos"]'),
            notificaciones: JSON.parse(localStorage.getItem('notificaciones') || '[]'),
            proximoNumPresupuesto: JSON.parse(localStorage.getItem('proximoNumPresupuesto') || '1001'),
            formulas: JSON.parse(localStorage.getItem('formulas') || JSON.stringify({
                version: 2,
                orden: ["iibb", "tissh", "impuestoCheque", "ganancias", "reservaLegal"],
                componentes: {
                    iibb: { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true },
                    tissh: { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true },
                    impuestoCheque: { id: "impuestoCheque", nombre: "Impuesto al Cheque", alicuota: 1.2, baseCalculo: "venta", activo: false, editable: true, esPredeterminado: true },
                    ganancias: { id: "ganancias", nombre: "Impuesto a las Ganancias", alicuota: 25, baseCalculo: "utilidadAntesGanancias", activo: true, editable: true, esPredeterminado: true },
                    reservaLegal: { id: "reservaLegal", nombre: "Reserva Legal SAS", alicuota: 5, baseCalculo: "despuesGanancias", activo: true, editable: true, esPredeterminado: true }
                }
            })),
            impuestosPersonalizados: JSON.parse(localStorage.getItem('impuestosPersonalizados') || '[]')
        };
        dbCache = db;
        return db;
    } catch(e) {
        console.error("Error cargando DB:", e);
        return db;
    }
}

export function guardarDB() {
    try {
        localStorage.setItem('empresas', JSON.stringify(db.empresas));
        localStorage.setItem('empresaActiva', JSON.stringify(db.empresaActiva));
        localStorage.setItem('ventas', JSON.stringify(db.ventas));
        localStorage.setItem('compras', JSON.stringify(db.compras));
        localStorage.setItem('presupuestos', JSON.stringify(db.presupuestos));
        localStorage.setItem('clientes', JSON.stringify(db.clientes));
        localStorage.setItem('proveedores', JSON.stringify(db.proveedores));
        localStorage.setItem('costosFijos', JSON.stringify(db.costosFijos));
        localStorage.setItem('pagosHistorial', JSON.stringify(db.pagosHistorial));
        localStorage.setItem('categoriasGastos', JSON.stringify(db.categoriasGastos));
        localStorage.setItem('notificaciones', JSON.stringify(db.notificaciones));
        localStorage.setItem('proximoNumPresupuesto', JSON.stringify(db.proximoNumPresupuesto));
        localStorage.setItem('formulas', JSON.stringify(db.formulas));
        localStorage.setItem('impuestosPersonalizados', JSON.stringify(db.impuestosPersonalizados));
        return true;
    } catch(e) {
        console.error("Error guardando DB:", e);
        return false;
    }
}

export function getDB() {
    if (!dbCache) dbCache = cargarDB();
    return dbCache;
}

export function setDB(nueva) {
    db = nueva;
    dbCache = db;
    guardarDB();
}

export async function getDBAsync() {
    return getDB();
}

export async function guardarDBAsync() {
    guardarDB();
    window.dispatchEvent(new CustomEvent('refreshView'));
    return true;
}

export function getImpuestosActivos() {
    const dbActual = getDB();
    const activos = [];
    const componentes = dbActual.formulas?.componentes || {};
    for (const [key, imp] of Object.entries(componentes)) {
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
            iibb: { id: "iibb", nombre: "IIBB Salta", alicuota: 3.6, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true },
            tissh: { id: "tissh", nombre: "TISSH Municipal", alicuota: 0.5, baseCalculo: "venta", activo: true, editable: true, esPredeterminado: true },
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
