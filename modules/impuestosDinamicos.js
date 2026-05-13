// ==================== modules/impuestosDinamicos.js ====================
// Sistema de Impuestos Dinámicos para ERP Contable Argentina

const TIPOS_BASE_CALCULO = {
    VENTA: "venta",
    COSTO_PROVEEDOR: "costoProveedor",
    GANANCIA_BRUTA: "gananciaBruta",
    UTILIDAD_ANTES_GANANCIAS: "utilidadAntesGanancias",
    DESPUES_GANANCIAS: "despuesGanancias"
};

const CONFIG_POR_DEFECTO = {
    version: 2,
    orden: ["iibb", "tissh", "impuestoCheque", "ganancias", "reservaLegal"],
    componentes: {
        iibb: {
            id: "iibb",
            nombre: "IIBB Salta",
            alicuota: 3.6,
            baseCalculo: "venta",
            activo: true,
            editable: true,
            esPredeterminado: true,
            descripcion: "Ingresos Brutos - Provincia de Salta"
        },
        tissh: {
            id: "tissh",
            nombre: "TISSH Municipal",
            alicuota: 0.5,
            baseCalculo: "venta",
            activo: true,
            editable: true,
            esPredeterminado: true,
            descripcion: "Tasa de Servicios Salta - Municipalidad"
        },
        impuestoCheque: {
            id: "impuestoCheque",
            nombre: "Impuesto al Cheque",
            alicuota: 1.2,
            baseCalculo: "venta",
            activo: false,
            editable: true,
            esPredeterminado: true,
            descripcion: "Ley 25.413 - Solo si se paga con cheque/debito"
        },
        ganancias: {
            id: "ganancias",
            nombre: "Impuesto a las Ganancias",
            alicuota: 25,
            baseCalculo: "utilidadAntesGanancias",
            activo: true,
            editable: true,
            esPredeterminado: true,
            descripcion: "Sociedades - Ley 27.430"
        },
        reservaLegal: {
            id: "reservaLegal",
            nombre: "Reserva Legal SAS",
            alicuota: 5,
            baseCalculo: "despuesGanancias",
            activo: true,
            editable: true,
            esPredeterminado: true,
            descripcion: "Articulo 70 Ley 27.349 SAS"
        }
    },
    impuestosPersonalizados: []
};

function getConfiguracionImpuestos() {
    try {
        const guardada = localStorage.getItem('configuracionImpuestos');
        if (guardada) {
            const parsed = JSON.parse(guardada);
            if (parsed.version === 2) return parsed;
        }
    } catch(e) {}
    return JSON.parse(JSON.stringify(CONFIG_POR_DEFECTO));
}

function guardarConfiguracionImpuestos(config) {
    localStorage.setItem('configuracionImpuestos', JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('impuestosActualizados'));
    return true;
}

function getImpuestosActivos() {
    const config = getConfiguracionImpuestos();
    const activos = [];
    
    for (const [key, imp] of Object.entries(config.componentes)) {
        if (imp.activo) {
            activos.push({ id: key, ...imp, esPersonalizado: false });
        }
    }
    
    for (const imp of config.impuestosPersonalizados || []) {
        if (imp.activo) {
            activos.push({ ...imp, esPersonalizado: true });
        }
    }
    
    const ordenMap = {};
    config.orden.forEach((id, index) => { ordenMap[id] = index; });
    
    activos.sort((a, b) => {
        const posA = ordenMap[a.id] !== undefined ? ordenMap[a.id] : 999;
        const posB = ordenMap[b.id] !== undefined ? ordenMap[b.id] : 999;
        return posA - posB;
    });
    
    return activos;
}

function calcularGananciaNetaDinamico(venta, costoProveedor, impuestosActivos = null) {
    if (!impuestosActivos) {
        impuestosActivos = getImpuestosActivos();
    }
    
    const gananciaBruta = venta - costoProveedor;
    
    let resultado = {
        gananciaBruta: gananciaBruta,
        venta: venta,
        costoProveedor: costoProveedor,
        pasos: [],
        totalImpuestos: 0,
        gananciaNeta: 0,
        reservaLegalAplicada: 0,
        impuestoGananciasAplicado: 0,
        iibbAplicado: 0,
        tisshAplicado: 0
    };
    
    let estado = {
        acumuladoDeducciones: 0,
        utilidadCorriente: gananciaBruta
    };
    
    for (const impuesto of impuestosActivos) {
        let base = 0;
        switch (impuesto.baseCalculo) {
            case TIPOS_BASE_CALCULO.VENTA:
                base = venta;
                break;
            case TIPOS_BASE_CALCULO.COSTO_PROVEEDOR:
                base = costoProveedor;
                break;
            case TIPOS_BASE_CALCULO.GANANCIA_BRUTA:
                base = gananciaBruta;
                break;
            case TIPOS_BASE_CALCULO.UTILIDAD_ANTES_GANANCIAS:
                base = estado.utilidadCorriente;
                break;
            case TIPOS_BASE_CALCULO.DESPUES_GANANCIAS:
                base = estado.utilidadCorriente;
                break;
            default:
                base = estado.utilidadCorriente;
        }
        
        let monto = (base * impuesto.alicuota) / 100;
        
        resultado.pasos.push({
            id: impuesto.id,
            nombre: impuesto.nombre,
            alicuota: impuesto.alicuota,
            base: base,
            baseTexto: obtenerTextoBaseCalculo(impuesto.baseCalculo),
            monto: monto,
            esPersonalizado: impuesto.esPersonalizado || false
        });
        
        resultado.totalImpuestos += monto;
        estado.acumuladoDeducciones += monto;
        estado.utilidadCorriente = gananciaBruta - estado.acumuladoDeducciones;
        
        if (impuesto.id === 'reservaLegal') resultado.reservaLegalAplicada = monto;
        if (impuesto.id === 'ganancias') resultado.impuestoGananciasAplicado = monto;
        if (impuesto.id === 'iibb') resultado.iibbAplicado = monto;
        if (impuesto.id === 'tissh') resultado.tisshAplicado = monto;
    }
    
    resultado.gananciaNeta = estado.utilidadCorriente;
    resultado.rentabilidadSobreVenta = venta > 0 ? (resultado.gananciaNeta / venta) * 100 : 0;
    
    return resultado;
}

function calcularGananciaNetaDinamicoSync(venta, costoProveedor) {
    return calcularGananciaNetaDinamico(venta, costoProveedor, getImpuestosActivos());
}

function obtenerTextoBaseCalculo(baseCalculo) {
    const textos = {
        'venta': 'Venta total',
        'costoProveedor': 'Costo proveedor',
        'gananciaBruta': 'Ganancia bruta',
        'utilidadAntesGanancias': 'Utilidad antes de este impuesto',
        'despuesGanancias': 'Utilidad despues de Ganancias'
    };
    return textos[baseCalculo] || baseCalculo;
}

function obtenerImpuesto(id) {
    const config = getConfiguracionImpuestos();
    if (config.componentes[id]) {
        return { ...config.componentes[id], esPersonalizado: false };
    }
    const personalizado = config.impuestosPersonalizados?.find(i => i.id === id);
    if (personalizado) {
        return { ...personalizado, esPersonalizado: true };
    }
    return null;
}

function actualizarImpuesto(id, updates, esPersonalizado = false) {
    const config = getConfiguracionImpuestos();
    if (esPersonalizado) {
        const index = config.impuestosPersonalizados.findIndex(i => i.id === id);
        if (index !== -1) {
            config.impuestosPersonalizados[index] = { ...config.impuestosPersonalizados[index], ...updates };
            guardarConfiguracionImpuestos(config);
            return true;
        }
    } else {
        if (config.componentes[id]) {
            config.componentes[id] = { ...config.componentes[id], ...updates };
            guardarConfiguracionImpuestos(config);
            return true;
        }
    }
    return false;
}

function agregarImpuestoPersonalizado(impuesto) {
    const config = getConfiguracionImpuestos();
    const nuevoId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const nuevoImpuesto = {
        id: nuevoId,
        nombre: impuesto.nombre,
        alicuota: parseFloat(impuesto.alicuota),
        baseCalculo: impuesto.baseCalculo || 'venta',
        activo: true,
        editable: true,
        esPredeterminado: false,
        descripcion: impuesto.descripcion || "Impuesto personalizado"
    };
    config.impuestosPersonalizados.push(nuevoImpuesto);
    config.orden.push(nuevoId);
    guardarConfiguracionImpuestos(config);
    return nuevoImpuesto;
}

function eliminarImpuestoPersonalizado(id) {
    const config = getConfiguracionImpuestos();
    const index = config.impuestosPersonalizados.findIndex(i => i.id === id);
    if (index !== -1) {
        config.impuestosPersonalizados.splice(index, 1);
        const ordenIndex = config.orden.indexOf(id);
        if (ordenIndex !== -1) config.orden.splice(ordenIndex, 1);
        guardarConfiguracionImpuestos(config);
        return true;
    }
    return false;
}

function reordenarImpuestos(nuevoOrden) {
    const config = getConfiguracionImpuestos();
    config.orden = nuevoOrden;
    guardarConfiguracionImpuestos(config);
    return true;
}

function restablecerValoresDefault() {
    guardarConfiguracionImpuestos(JSON.parse(JSON.stringify(CONFIG_POR_DEFECTO)));
    return true;
}

function exportarConfiguracion() {
    const config = getConfiguracionImpuestos();
    return {
        ...config,
        fechaExportacion: new Date().toISOString()
    };
}

function importarConfiguracion(config) {
    if (config.version === 2 && config.componentes) {
        guardarConfiguracionImpuestos(config);
        return true;
    }
    return false;
}

export {
    TIPOS_BASE_CALCULO,
    getConfiguracionImpuestos,
    guardarConfiguracionImpuestos,
    getImpuestosActivos,
    calcularGananciaNetaDinamico,
    calcularGananciaNetaDinamicoSync,
    obtenerImpuesto,
    actualizarImpuesto,
    agregarImpuestoPersonalizado,
    eliminarImpuestoPersonalizado,
    reordenarImpuestos,
    restablecerValoresDefault,
    exportarConfiguracion,
    importarConfiguracion,
    CONFIG_POR_DEFECTO
};
