// ========== DATOS DE EJEMPLO PARA DEMOSTRAR EL FLUJO COMPLETO ==========

import { getDB, guardarDB } from './db.js';
import { mostrarNotificacion } from './utils.js';

// 2 EMPRESAS
const empresasEjemplo = [
    {
        id: 1,
        nombre: "Tecnología del Plata SRL",
        cuit: "30-71234567-8",
        direccion: "Av. Libertador 1234, CABA",
        telefono: "11-4123-4567",
        email: "ventas@tecnologiadelplata.com",
        whatsapp: "5491141234567",
        logo: "🏢",
        cbu: "1234567890123456789012"
    },
    {
        id: 2,
        nombre: "Servicios Digitales Argentina SA",
        cuit: "30-89876543-2",
        direccion: "Av. Corrientes 567, CABA",
        telefono: "11-4987-6543",
        email: "info@serviciosdigitales.com",
        whatsapp: "5491149876543",
        logo: "📱",
        cbu: "9876543210987654321098"
    }
];

// 5 CLIENTES
const clientesEjemplo = [
    { id: 101, nombre: "Tech Solutions SA", cuit: "30-12345678-9", telefono: "11-1234-5678", email: "admin@techsolutions.com", direccion: "Av. Santa Fe 1234", contacto: "Juan Pérez", diasCobro: 30, saldo: 0, whatsapp: "5491112345678", cbu: "1234567890123456789012" },
    { id: 102, nombre: "Comercial del Oeste SRL", cuit: "30-87654321-0", telefono: "11-8765-4321", email: "info@comercialoeste.com", direccion: "Rivadavia 567", contacto: "María García", diasCobro: 45, saldo: 0, whatsapp: "5491187654321", cbu: "9876543210987654321098" },
    { id: 103, nombre: "Distribuidora Norte SA", cuit: "30-11223344-5", telefono: "11-1122-3344", email: "ventas@distnorte.com", direccion: "Cabildo 890", contacto: "Carlos López", diasCobro: 15, saldo: 0, whatsapp: "5491111223344", cbu: "1122334455667788990011" },
    { id: 104, nombre: "Soluciones Empresariales", cuit: "30-55667788-9", telefono: "11-5566-7788", email: "contacto@soluciones.com", direccion: "Belgrano 345", contacto: "Ana Martínez", diasCobro: 60, saldo: 0, whatsapp: "5491155667788", cbu: "5566778899001122334455" },
    { id: 105, nombre: "Grupo Inversor Sur", cuit: "30-99887766-5", telefono: "11-9988-7766", email: "gestion@gruposur.com", direccion: "Alsina 789", contacto: "Roberto Fernández", diasCobro: 10, saldo: 0, whatsapp: "5491199887766", cbu: "9988776655443322110099" }
];

// 5 PROVEEDORES
const proveedoresEjemplo = [
    { id: 201, nombre: "Insumos Tecnológicos SA", cuit: "30-11111111-1", telefono: "11-1111-1111", email: "ventas@insumostec.com", direccion: "Av. Rivadavia 100", contacto: "Luis Gómez", diasPago: 30, saldo: 0, cbu: "1111111111111111111111", rubro: "Insumos" },
    { id: 202, nombre: "Distribuidora de Software", cuit: "30-22222222-2", telefono: "11-2222-2222", email: "info@softwaredist.com", direccion: "Callao 200", contacto: "Silvia Rodríguez", diasPago: 45, saldo: 0, cbu: "2222222222222222222222", rubro: "Software" },
    { id: 203, nombre: "Logística Express", cuit: "30-33333333-3", telefono: "11-3333-3333", email: "operaciones@logexpress.com", direccion: "San Martín 300", contacto: "Pablo Torres", diasPago: 15, saldo: 0, cbu: "3333333333333333333333", rubro: "Logística" },
    { id: 204, nombre: "Marketing Digital Pro", cuit: "30-44444444-4", telefono: "11-4444-4444", email: "ventas@marketingpro.com", direccion: "Córdoba 400", contacto: "Laura Sánchez", diasPago: 60, saldo: 0, cbu: "4444444444444444444444", rubro: "Marketing" },
    { id: 205, nombre: "Mantenimiento IT", cuit: "30-55555555-5", telefono: "11-5555-5555", email: "soporte@mit.com", direccion: "Pueyrredón 500", contacto: "Fernando Castro", diasPago: 10, saldo: 0, cbu: "5555555555555555555555", rubro: "Servicios" }
];

// 5 PRESUPUESTOS EN DIFERENTES ESTADOS (para demostrar el flujo)
const presupuestosEjemplo = [
    // Presupuesto 1: PENDIENTE - esperando aprobación
    {
        id: 501,
        clienteId: 101,
        cliente: "Tech Solutions SA",
        items: [
            { desc: "Desarrollo de app mobile", cant: 1, costo: 180000 },
            { desc: "Diseño UX/UI", cant: 1, costo: 50000 }
        ],
        markup: 30,
        totalOriginal: 230000,
        total: 299000,
        numero: "P-1001",
        fechaCreacion: "2025-05-01T10:00:00Z",
        estado: "PENDIENTE",
        tieneOrdenCompra: false,
        ordenCompraNumero: null,
        ordenCompraFecha: null,
        facturado: false,
        facturaNumero: null,
        cobrado: false,
        presupuestoRecibido: "PRES-001-2025"
    },
    // Presupuesto 2: APROBADO - con Orden de Compra, esperando facturación
    {
        id: 502,
        clienteId: 102,
        cliente: "Comercial del Oeste SRL",
        items: [
            { desc: "Actualización de sistema ERP", cant: 1, costo: 95000 },
            { desc: "Capacitación usuarios", cant: 2, costo: 15000 }
        ],
        markup: 25,
        totalOriginal: 125000,
        total: 156250,
        numero: "P-1002",
        fechaCreacion: "2025-05-02T11:00:00Z",
        estado: "APROBADO",
        tieneOrdenCompra: true,
        ordenCompraNumero: "OC-2025-001",
        ordenCompraFecha: "2025-05-03",
        facturado: false,
        facturaNumero: null,
        cobrado: false,
        presupuestoRecibido: "PRES-002-2025"
    },
    // Presupuesto 3: FACTURADO - factura generada, pendiente cobro
    {
        id: 503,
        clienteId: 103,
        cliente: "Distribuidora Norte SA",
        items: [
            { desc: "Infraestructura cloud", cant: 1, costo: 250000 }
        ],
        markup: 40,
        totalOriginal: 250000,
        total: 350000,
        numero: "P-1003",
        fechaCreacion: "2025-05-03T12:00:00Z",
        estado: "FACTURADO",
        tieneOrdenCompra: true,
        ordenCompraNumero: "OC-2025-002",
        ordenCompraFecha: "2025-05-04",
        facturado: true,
        facturaNumero: "F-P-1003",
        facturacionFecha: "2025-05-05",
        cobrado: false,
        presupuestoRecibido: "PRES-003-2025"
    },
    // Presupuesto 4: RECHAZADO
    {
        id: 504,
        clienteId: 104,
        cliente: "Soluciones Empresariales",
        items: [
            { desc: "Auditoría de sistemas", cant: 1, costo: 65000 }
        ],
        markup: 20,
        totalOriginal: 65000,
        total: 78000,
        numero: "P-1004",
        fechaCreacion: "2025-05-04T13:00:00Z",
        estado: "RECHAZADO",
        tieneOrdenCompra: false,
        ordenCompraNumero: null,
        facturado: false,
        cobrado: false,
        presupuestoRecibido: "PRES-004-2025"
    },
    // Presupuesto 5: RECOTIZAR (se generó una nueva versión)
    {
        id: 505,
        clienteId: 105,
        cliente: "Grupo Inversor Sur",
        items: [
            { desc: "Implementación de CRM", cant: 1, costo: 350000 }
        ],
        markup: 35,
        totalOriginal: 350000,
        total: 472500,
        numero: "P-1005",
        fechaCreacion: "2025-05-05T14:00:00Z",
        estado: "RECOTIZAR",
        tieneOrdenCompra: false,
        facturado: false,
        cobrado: false,
        presupuestoRecibido: "PRES-005-2025",
        presupuestoOriginalId: null,
        presupuestoOriginalNumero: null
    },
    // Presupuesto 6: RECOTIZACIÓN (nueva versión del 505)
    {
        id: 506,
        clienteId: 105,
        cliente: "Grupo Inversor Sur",
        items: [
            { desc: "Implementación de CRM", cant: 1, costo: 320000 },
            { desc: "Capacitación adicional", cant: 2, costo: 20000 }
        ],
        markup: 30,
        totalOriginal: 360000,
        total: 468000,
        numero: "P-1006",
        fechaCreacion: "2025-05-06T15:00:00Z",
        estado: "PENDIENTE",
        tieneOrdenCompra: false,
        facturado: false,
        cobrado: false,
        presupuestoRecibido: "PRES-005-2025",
        presupuestoOriginalId: 505,
        presupuestoOriginalNumero: "P-1005"
    }
];

// 5 VENTAS (asociadas a presupuestos facturados)
const ventasEjemplo = [
    {
        id: 301,
        clienteId: 103,
        clienteNombre: "Distribuidora Norte SA",
        montoNeto: 350000,
        iva: 21,
        ivaMonto: 73500,
        total: 423500,
        tipoComprobante: "Factura A",
        numComprobante: "F-P-1003",
        fechaVenta: "2025-05-05",
        fechaCobroEsperada: "2025-05-20",
        mes: "2025-05",
        estado: 'pendiente_cobro',
        presupuestoOrigen: 503,
        ordenCompraAsociada: "OC-2025-002",
        descripcion: "Infraestructura cloud - Facturación",
        items: [{ desc: "Infraestructura cloud", cant: 1, costo: 350000 }]
    }
];

// 5 COMPRAS
const comprasEjemplo = [
    {
        id: 401,
        proveedorId: 201,
        proveedorNombre: "Insumos Tecnológicos SA",
        montoNeto: 75000,
        iva: 21,
        ivaMonto: 15750,
        total: 90750,
        tipoComprobante: "Factura A",
        numComprobante: "0001-00987654",
        fechaCompra: "2025-05-01",
        fechaPagoEsperada: "2025-05-31",
        mes: "2025-05",
        estado: 'pendiente_pago',
        facturaUrl: "https://www.afip.gob.ar/fe/ejemplos/facturaA.pdf",
        descripcion: "Compra de servidores"
    },
    {
        id: 402,
        proveedorId: 202,
        proveedorNombre: "Distribuidora de Software",
        montoNeto: 120000,
        iva: 21,
        ivaMonto: 25200,
        total: 145200,
        tipoComprobante: "Factura A",
        numComprobante: "0001-00876543",
        fechaCompra: "2025-05-02",
        fechaPagoEsperada: "2025-06-16",
        mes: "2025-05",
        estado: 'pendiente_pago',
        descripcion: "Licencias de software"
    },
    {
        id: 403,
        proveedorId: 203,
        proveedorNombre: "Logística Express",
        montoNeto: 35000,
        iva: 21,
        ivaMonto: 7350,
        total: 42350,
        tipoComprobante: "Factura B",
        numComprobante: "0003-00123456",
        fechaCompra: "2025-05-03",
        fechaPagoEsperada: "2025-05-18",
        mes: "2025-05",
        estado: 'pagado',
        fechaPago: "2025-05-15",
        comprobantePago: "TR-789012",
        descripcion: "Servicio de logística"
    },
    {
        id: 404,
        proveedorId: 204,
        proveedorNombre: "Marketing Digital Pro",
        montoNeto: 28000,
        iva: 21,
        ivaMonto: 5880,
        total: 33880,
        tipoComprobante: "Factura B",
        numComprobante: "0004-00123456",
        fechaCompra: "2025-05-04",
        fechaPagoEsperada: "2025-07-03",
        mes: "2025-05",
        estado: 'pendiente_pago',
        descripcion: "Campaña publicitaria"
    },
    {
        id: 405,
        proveedorId: 205,
        proveedorNombre: "Mantenimiento IT",
        montoNeto: 42000,
        iva: 21,
        ivaMonto: 8820,
        total: 50820,
        tipoComprobante: "Factura A",
        numComprobante: "0005-00123456",
        fechaCompra: "2025-05-05",
        fechaPagoEsperada: "2025-05-15",
        mes: "2025-05",
        estado: 'pendiente_pago',
        descripcion: "Mantenimiento preventivo"
    }
];

// Imagen placeholder
const imagenPlaceholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%239ca3af'%3EFactura%3C/text%3E%3C/svg%3E";

export function cargarDatosEjemplo() {
    const db = getDB();
    
    // Limpiar datos existentes para evitar duplicados
    if (db.empresas.length === 0) {
        db.empresas = empresasEjemplo;
    } else if (db.empresas.length === 1) {
        // Si solo hay la empresa por defecto, agregar la segunda
        db.empresas.push(empresasEjemplo[1]);
    }
    
    if (db.clientes.length === 0) {
        db.clientes = clientesEjemplo;
    }
    
    if (db.proveedores.length === 0) {
        db.proveedores = proveedoresEjemplo;
    }
    
    if (db.presupuestos.length === 0) {
        db.presupuestos = presupuestosEjemplo;
    }
    
    if (db.ventas.length === 0) {
        db.ventas = ventasEjemplo.map(v => ({
            ...v,
            imagenFactura: imagenPlaceholder
        }));
    }
    
    if (db.compras.length === 0) {
        db.compras = comprasEjemplo.map(c => ({
            ...c,
            imagenFactura: imagenPlaceholder
        }));
    }
    
    guardarDB();
    mostrarNotificacion("✅ Datos de ejemplo cargados correctamente. 6 presupuestos en diferentes estados, 1 venta facturada, 5 compras.", 'success');
    window.location.reload();
}

export function eliminarVentaConCascada(id) {
    if (!confirm("⚠️ ¿Eliminar esta venta? Se eliminarán también todos los cobros asociados.")) return;
    
    const db = getDB();
    const venta = db.ventas.find(v => v.id === id);
    if (!venta) return;
    
    db.ventas = db.ventas.filter(v => v.id !== id);
    db.pagosHistorial = db.pagosHistorial.filter(p => p.ventaId !== id);
    
    const cliente = db.clientes.find(c => c.id === venta.clienteId);
    if (cliente) {
        cliente.saldo = (cliente.saldo || 0) - venta.total;
    }
    
    guardarDB();
    mostrarNotificacion(`🗑️ Venta eliminada`, 'info');
    window.dispatchEvent(new Event('refreshView'));
}

export function eliminarCompraConCascada(id) {
    if (!confirm("⚠️ ¿Eliminar esta compra?")) return;
    
    const db = getDB();
    const compra = db.compras.find(c => c.id === id);
    if (!compra) return;
    
    db.compras = db.compras.filter(c => c.id !== id);
    db.pagosHistorial = db.pagosHistorial.filter(p => p.compraId !== id);
    
    const proveedor = db.proveedores.find(p => p.id === compra.proveedorId);
    if (proveedor) {
        proveedor.saldo = (proveedor.saldo || 0) - compra.total;
    }
    
    guardarDB();
    mostrarNotificacion(`🗑️ Compra eliminada`, 'info');
    window.dispatchEvent(new Event('refreshView'));
}

export function eliminarPresupuestoConCascada(id) {
    if (!confirm("⚠️ ¿Eliminar este presupuesto?")) return;
    
    const db = getDB();
    const presupuesto = db.presupuestos.find(p => p.id === id);
    if (!presupuesto) return;
    
    // Si el presupuesto estaba facturado, eliminar también la venta asociada
    if (presupuesto.facturaNumero) {
        db.ventas = db.ventas.filter(v => v.presupuestoOrigen !== id);
    }
    
    db.presupuestos = db.presupuestos.filter(p => p.id !== id);
    
    guardarDB();
    mostrarNotificacion(`🗑️ Presupuesto eliminado`, 'info');
    window.dispatchEvent(new Event('refreshView'));
}

// Exportar funciones globales
window.cargarDatosEjemplo = cargarDatosEjemplo;
window.eliminarVentaConCascada = eliminarVentaConCascada;
window.eliminarCompraConCascada = eliminarCompraConCascada;
window.eliminarPresupuestoConCascada = eliminarPresupuestoConCascada;
