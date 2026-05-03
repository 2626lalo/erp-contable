let db = {
    empresas: [], empresaActiva: 1, ventas: [], compras: [], presupuestos: [],
    clientes: [], proveedores: [], costosFijos: [], pagosHistorial: [],
    categoriasGastos: ['Impuestos', 'Servicios', 'Alquiler', 'Sueldos', 'Bancos'],
    notificaciones: [], proximoNumPresupuesto: 1001
};
export function cargarDB() {
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
        proximoNumPresupuesto: JSON.parse(localStorage.getItem('proximoNumPresupuesto') || '1001')
    };
    return db;
}
export function guardarDB() {
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
}
export function getDB() { return db; }
export function setDB(nueva) { db = nueva; guardarDB(); }
