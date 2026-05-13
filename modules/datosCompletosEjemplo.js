// ==================== modules/datosCompletosEjemplo.js ====================
import { getDB, guardarDB } from './db.js';

export async function cargarDatosCompletosEjemplo() {
    const db = await getDB();
    
    db.clientes = [
        { id: 'c1', nombre: 'Tech Solutions SA', telefono: '3874123456', email: 'ventas@techsol.com', direccion: 'Av. Belgrano 123' },
        { id: 'c2', nombre: 'Distribuidora Norte', telefono: '3874987654', email: 'info@distnorte.com', direccion: 'Calle Mitre 456' },
        { id: 'c3', nombre: 'Servicios Generales Salta', telefono: '3874123987', email: 'contacto@sgsalta.com', direccion: 'Av. San Martin 789' }
    ];
    
    db.proveedores = [
        { id: 'p1', nombre: 'Mayorista Center', telefono: '3874223344', email: 'ventas@mayorista.com', direccion: 'Av. Entre Rios 234' },
        { id: 'p2', nombre: 'Distribuidora del Norte', telefono: '3874556677', email: 'pedidos@distnorte.com', direccion: 'Calle Jujuy 567' }
    ];
    
    const hoy = new Date();
    const haceMes = new Date(); haceMes.setMonth(hoy.getMonth() - 1);
    
    db.ventas = [
        { id: 'v1', cliente: { nombre: 'Tech Solutions SA' }, total: 250000, totalSinIVA: 206611, costoTotal: 150000, fecha: hoy.toISOString(), estado: 'COBRADO', saldoPendiente: 0, cobros: [{ monto: 250000, fecha: hoy.toISOString(), comprobante: 'F001-0001' }] },
        { id: 'v2', cliente: { nombre: 'Distribuidora Norte' }, total: 180000, totalSinIVA: 148760, costoTotal: 120000, fecha: haceMes.toISOString(), estado: 'COBRADO_PARCIAL', saldoPendiente: 50000, cobros: [{ monto: 130000, fecha: haceMes.toISOString(), comprobante: 'F001-0002' }] },
        { id: 'v3', cliente: { nombre: 'Servicios Generales Salta' }, total: 95000, totalSinIVA: 78512, costoTotal: 60000, fecha: hoy.toISOString(), estado: 'PENDIENTE', saldoPendiente: 95000, cobros: [] }
    ];
    
    db.compras = [
        { id: 'c1', proveedor: { nombre: 'Mayorista Center' }, total: 120000, fecha: hoy.toISOString(), estado: 'PAGADO', saldoPendiente: 0, pagos: [{ monto: 120000, fecha: hoy.toISOString(), comprobante: 'CP-001' }] },
        { id: 'c2', proveedor: { nombre: 'Distribuidora del Norte' }, total: 80000, fecha: haceMes.toISOString(), estado: 'PAGADO_PARCIAL', saldoPendiente: 30000, pagos: [{ monto: 50000, fecha: haceMes.toISOString(), comprobante: 'CP-002' }] }
    ];
    
    db.gastosFijos = {
        items: [
            { nombre: 'Alquiler', monto: 50000, fechaVencimiento: '2025-01-10', pagado: true, fechaPago: '2025-01-05' },
            { nombre: 'Luz', monto: 15000, fechaVencimiento: '2025-01-15', pagado: false, fechaPago: null },
            { nombre: 'Internet', monto: 8000, fechaVencimiento: '2025-01-20', pagado: false, fechaPago: null },
            { nombre: 'Sueldos', monto: 200000, fechaVencimiento: '2025-01-30', pagado: false, fechaPago: null }
        ],
        total: 273000,
        pagado: 50000
    };
    
    await guardarDB();
}
