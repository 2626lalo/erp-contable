// ==================== modules/ocr-parser.js ====================
// OCR PARSER - Extrae datos de facturas (PDF con pdf.js, imágenes con Tesseract.js)
// ERP Contable Argentina - v7.16.14
// v7.16.14: parser v3, regex robustos para AFIP + otros sistemas

// ==================== MAPA DE CÓDIGOS AFIP ====================
const COD_AFIP = {
    '001': 'A', '002': 'A', '003': 'NC-A',
    '006': 'B', '007': 'B', '008': 'NC-B',
    '011': 'C', '012': 'C', '013': 'NC-C',
    '019': 'E', '020': 'E', '021': 'NC-E',
    '051': 'M', '052': 'M', '053': 'NC-M'
};

// ==================== PDF: EXTRAER TEXTO ====================
export async function extraerTextoPDF(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('pdf.js no está cargado');
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let textoCompleto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const textoPagina = content.items.map(item => item.str).join(' ');
        textoCompleto += textoPagina + '\n';
    }

    return textoCompleto;
}

// ==================== IMAGEN: OCR CON TESSERACT ====================
export async function extraerTextoImagen(file, onProgress = null) {
    if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js no está cargado');
    }

    const result = await Tesseract.recognize(file, 'spa', {
        logger: (m) => {
            if (m.status === 'recognizing text' && onProgress) {
                onProgress(m.progress);
            }
        }
    });

    return result.data.text;
}

// ==================== PARSER PRINCIPAL v3 ====================
/**
 * Analiza el texto de una factura y extrae los datos
 * @param {string} texto
 * @param {string} cuitEmpresa - CUIT de la empresa activa (para distinguir del proveedor)
 */
export function parsearFactura(texto, cuitEmpresa = null, modo = 'compra') {
    if (!texto) return {};

    // Normalizar
    const t = texto.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Si no nos pasaron el CUIT, intentar leerlo del window
    if (!cuitEmpresa && typeof window !== 'undefined' && window.__cuitEmpresa) {
        cuitEmpresa = window.__cuitEmpresa;
    }
    const cuitEmpresaLimpio = cuitEmpresa ? String(cuitEmpresa).replace(/[-\s]/g, '') : null;

    const datos = {};

    // ==================== TIPO ====================
    const matchTipoTexto = t.match(/FACTURA\s+([ABC])\b/i);
    if (matchTipoTexto) {
        datos.tipo = matchTipoTexto[1].toUpperCase();
    } else {
        const matchCodigo = t.match(/COD\.?\s*:?\s*(\d{3})/i);
        if (matchCodigo && COD_AFIP[matchCodigo[1]]) {
            const tipoCod = COD_AFIP[matchCodigo[1]];
            datos.tipo = tipoCod.startsWith('NC-') ? tipoCod.substring(3) : tipoCod;
            datos.esNotaCredito = tipoCod.startsWith('NC-');
        }
    }

    // ==================== Nº FACTURA ====================
    // Formato 1: "Comp. Nro: 00001   00000085"
    let matchNro = t.match(/Comp\.?\s*Nro\s*:?\s*(\d{1,5})\s+(\d{1,10})/i);
    if (!matchNro) {
        // Formato 2: "Punto de Venta: 00001 Comp. Nro: 00000085"
        matchNro = t.match(/Punto\s+de\s+Venta\s*:?\s*(\d+)\s+Comp\.?\s*Nro\s*:?\s*(\d+)/i);
    }
    if (!matchNro) {
        // Formato 3: "Nº 0001-00001234"
        const matchNro2 = t.match(/N[º°]?\s*:?\s*(\d{4,5})-(\d{8})/i);
        if (matchNro2) {
            datos.numeroFactura = `${matchNro2[1].padStart(5, '0')}-${matchNro2[2].padStart(8, '0')}`;
        }
    } else {
        datos.numeroFactura = `${matchNro[1].padStart(5, '0')}-${matchNro[2].padStart(8, '0')}`;
    }

    // ==================== FECHA ====================
    // Buscar "Fecha de Emisión" y tomar la primera fecha después
    const idxFechaEmision = t.search(/Fecha\s+de\s+Emisi[oó]n/i);
    let fechaEncontrada = null;
    if (idxFechaEmision >= 0) {
        const subtexto = t.substring(idxFechaEmision, idxFechaEmision + 300);
        const matchFecha = subtexto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (matchFecha) {
            let [_, dia, mes, anio] = matchFecha;
            if (anio.length === 2) anio = '20' + anio;
            fechaEncontrada = `${anio.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
        }
    }
    if (fechaEncontrada) {
        datos.fecha = fechaEncontrada;
        const [anio, mes, dia] = fechaEncontrada.split('-');
        datos.fechaTexto = `${dia}/${mes}/${anio}`;
    }

    // ==================== CUITs ====================
    // Buscar TODOS los CUITs (con o sin guiones)
    const cuitRegexGuion = /(\d{2})-(\d{8})-(\d{1})/g;
    const cuitRegexSinGuion = /\b(\d{11})\b/g;
    const cuitsVistos = new Set();
    const cuitsEncontrados = [];

    let m;
    while ((m = cuitRegexGuion.exec(t)) !== null) {
        const cuit = `${m[1]}${m[2]}${m[3]}`;
        if (!cuitsVistos.has(cuit)) {
            cuitsVistos.add(cuit);
            cuitsEncontrados.push(cuit);
        }
    }
    while ((m = cuitRegexSinGuion.exec(t)) !== null) {
        const cuit = m[1];
        if (!cuitsVistos.has(cuit)) {
            cuitsVistos.add(cuit);
            cuitsEncontrados.push(cuit);
        }
    }

    // Heurística para separar proveedor vs cliente
    // 🔥 v7.16.42: la lógica depende del modo (compra vs venta)
    // - En COMPRA: el emisor es el proveedor, el receptor es mi empresa
    // - En VENTA: el emisor es mi empresa, el receptor es el cliente
    if (cuitsEncontrados.length >= 1) {
        if (modo === 'venta') {
            // Modo VENTA: el primer CUIT es el emisor (yo), el segundo es el cliente
            const cuitEmisor = cuitsEncontrados[0];
            const cuitReceptor = cuitsEncontrados[1] || null;

            datos.cuit = cuitEmisor;         // el emisor (yo)
            datos.cuitCliente = cuitReceptor; // el cliente

            // Detectar cuál es la empresa por si hay 3+ CUITs
            if (cuitEmpresaLimpio) {
                const cuitEmpresaIdx = cuitsEncontrados.indexOf(cuitEmpresaLimpio);
                if (cuitEmpresaIdx >= 0) {
                    // La empresa es el emisor → el cliente es el otro
                    datos.cuit = cuitEmpresaLimpio;
                    datos.cuitCliente = cuitsEncontrados.find(c => c !== cuitEmpresaLimpio) || null;
                }
            }
        } else {
            // Modo COMPRA (default): el primer CUIT es el proveedor, el segundo es mi empresa
            if (cuitEmpresaLimpio && cuitsEncontrados.includes(cuitEmpresaLimpio)) {
                datos.cuitCliente = cuitEmpresaLimpio;
                datos.cuit = cuitsEncontrados.find(c => c !== cuitEmpresaLimpio) || cuitsEncontrados[0];
            } else {
                datos.cuit = cuitsEncontrados[0];
                if (cuitsEncontrados.length >= 2) {
                    datos.cuitCliente = cuitsEncontrados[1];
                }
            }
        }

        if (datos.cuit && datos.cuit.length === 11) {
            datos.cuitFormateado = `${datos.cuit.substring(0, 2)}-${datos.cuit.substring(2, 10)}-${datos.cuit.substring(10)}`;
        }
    }

    // ==================== RAZÓN SOCIAL DEL PROVEEDOR ====================
    // Buscar "Razón Social:" y cortar en palabras clave
    // Texto típico: "Razón Social:  MARCIAL MERCEDES MILAGRO  Condición frente al IVA:  FACTURA C..."
    const matchRazon = t.match(/Raz[oó]n\s+Social\s*:?\s+([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.&\-]{1,80}?)(?=\s+(?:Condici[oó]n|CUIT|C[oó]digo|Domicilio|Fecha|Punto|Ingresos|Apellido|IVA|Casa|Av\.|Calle|$))/i);
    if (matchRazon) {
        let razon = matchRazon[1].trim().replace(/[.,;:]+$/, '').trim();
        if (razon.length >= 2 && razon.length <= 80) {
            datos.razonSocial = razon;
        }
    }

    // ==================== MONTOS ====================
    // Estrategia mejorada:
    // 1. Buscar montos con formato "24000,00" o "1.234,56" o "24000.00"
    // 2. Priorizar los montos con decimales y de 4+ dígitos (para evitar agarrar "1,00 unidades")
    // 3. Usar "Subtotal:" e "Importe Total:" como anclas si están presentes

    const regexMonto = /(\d{3,}(?:\.\d{3})*,\d{2})|(\d{3,}\.\d{2})/g;
    const montosMatches = [...t.matchAll(regexMonto)];
    const montos = montosMatches
        .map(m => ({
            texto: m[1] || m[2],
            valor: parsearMonto(m[1] || m[2]),
            index: m.index
        }))
        .filter(m => m.valor > 0 && m.valor < 1000000000);

    // ---------- 0. Buscar monto en la línea de items (después de "unidades") ----------
    // Esta es la fuente más confiable: "servicio X 1,00 unidades 24000,00 24000,00 0,00..."
    const matchLineaItems = t.match(/(?:unidades|U\.\s*Medida|Cantidad)\s+([\d.,\s]{10,400})/i);
    let montoDeLineaItems = null;
    if (matchLineaItems) {
        const montosEnLinea = [...matchLineaItems[1].matchAll(/(\d{3,}(?:\.\d{3})*,\d{2})/g)]
            .map(m => parsearMonto(m[1]))
            .filter(n => n > 100);
        if (montosEnLinea.length > 0) {
            montoDeLineaItems = Math.max(...montosEnLinea);
        }
    }
    if (montoDeLineaItems !== null && montoDeLineaItems > 0) {
        datos.total = montoDeLineaItems;
    }

    // ---------- 1. Intentar con anclas explícitas primero ----------
    // Buscar "Importe Total: $ 24000,00" o "Total: 24000,00"
    const matchTotalAncla = t.match(/Importe\s+Total\s*:?\s*\$?\s*(\d{3,}(?:\.\d{3})*,\d{2})/i)
        || t.match(/\bTotal\s*:?\s*\$?\s*(\d{3,}(?:\.\d{3})*,\d{2})/i);
    if (matchTotalAncla) {
        datos.total = parsearMonto(matchTotalAncla[1]);
    }

    // Buscar "Subtotal: $ 24000,00"
    const matchSubtotalAncla = t.match(/Subtotal\s*:?\s*\$?\s*(\d{3,}(?:\.\d{3})*,\d{2})/i);
    if (matchSubtotalAncla) {
        datos.subtotal = parsearMonto(matchSubtotalAncla[1]);
    }

    // Buscar IVA explícito
    const matchIVA = t.match(/IVA\s+(\d+(?:[.,]\d+)?)\s*%\s*:?\s*\$?\s*(\d{3,}(?:\.\d{3})*,\d{2})/i);
    if (matchIVA) {
        datos.alicuotaIVA = parseFloat(matchIVA[1].replace(',', '.'));
        datos.iva = parsearMonto(matchIVA[2]);
    }

    // ---------- 2. Si NO encontramos el total con ancla ni de línea de items, usar heurística ----------
    if (!datos.total && montos.length > 0) {
        // Filtrar montos: ignorar los que sean <= 100 (suelen ser cantidades o alícuotas)
        // y priorizar los que tengan decimales
        const montosCandidatos = montos.filter(m => m.valor > 1000);

        if (montosCandidatos.length > 0) {
            // El más grande suele ser el total
            const totalCandidato = montosCandidatos.reduce((max, m) => m.valor > max.valor ? m : max);
            datos.total = totalCandidato.valor;
        } else {
            // Si todos son chicos, buscar el máximo igual
            datos.total = Math.max(...montos.map(m => m.valor));
        }
    }

    // ==================== ITEMS (descripción + cantidad + precio) ====================
    // Buscar la línea de items: "DESCRIPCION   1,00   unidades   24000,00 ..."
    // Estrategia: buscar todo lo que está entre "Subtotal" (encabezado) y "Subtotal:" (pie)
    // El encabezado es "Código  Producto / Servicio  Cantidad  U. Medida  Precio Unit. ... Subtotal"
    // Los items vienen después.

    // Buscar todos los patrones tipo: "DESCRIPCION  CANT,DD  unidades  PRECIO,DD"
    // Usamos un regex global para capturar todos los ítems
    // Regex: buscar cada ítem con formato "DESCRIPCION  CANT,DD  unidad  PRECIO,DD"
    const regexItem = /([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ\s.\/-]{2,100}?)\s+(\d+(?:[.,]\d+)?)\s+(?:unidades?|u\.?\s*medida|kg|lt?|m2?)\s+(\d{3,}(?:\.\d{3})*,\d{2})/gi;

    // Palabras que son encabezados de columnas y hay que quitar de la descripción
        // PALABRAS_HEADER eliminado (v7.16.25)

    const itemsEncontrados = [];
    let mItem;
    while ((mItem = regexItem.exec(t)) !== null) {
        let descripcionRaw = mItem[1];

        // 🔥 v7.16.27: estrategia del usuario - cortar desde el último "Subtotal" sin dos puntos
        // El header de items termina con "Subtotal" (sin dos puntos).
        // El subtotal del pie termina con "Subtotal:" (con dos puntos), ese NO se corta.

        // Buscar la última ocurrencia de "Subtotal" que NO esté seguido de ":"
        const upperDesc = descripcionRaw.toUpperCase();
        let corteIdx = -1;
        let buscarDesde = 0;
        while (true) {
            const idx = upperDesc.indexOf('SUBTOTAL', buscarDesde);
            if (idx === -1) break;
            // Verificar que NO esté seguido de ":"
            const despues = upperDesc.substring(idx + 8, idx + 12).trim();
            if (!despues.startsWith(':')) {
                // Es el header, guardar la posición (después de "Subtotal")
                corteIdx = idx + 8; // 8 = largo de "SUBTOTAL"
            }
            buscarDesde = idx + 8;
        }

        if (corteIdx > 0) {
            descripcionRaw = descripcionRaw.substring(corteIdx);
        }

        // Limpiar
        let descripcion = descripcionRaw
            .replace(/\s+/g, ' ')
            .replace(/^[.,;:\s\-]+/, '')
            .replace(/[.,;:]+$/, '')
            .trim();


        const cantidad = parsearMonto(mItem[2]);
        const precioUnitario = parsearMonto(mItem[3]);

        // Filtrar basura: descripciones muy cortas o vacías
        if (descripcion.length >= 3 && cantidad > 0 && precioUnitario > 0) {
            itemsEncontrados.push({
                descripcion: descripcion.toUpperCase(),
                cantidad: cantidad,
                precioUnitario: precioUnitario,
                total: +(cantidad * precioUnitario).toFixed(2)
            });
        }
    }

    // 🔥 DEDUPLICAR: si el mismo ítem aparece varias veces (por las 3 páginas del PDF),
    // dejar solo la primera ocurrencia
    const itemsUnicos = [];
    const itemsVistos = new Set();
    itemsEncontrados.forEach(item => {
        const clave = `${item.descripcion}|${item.cantidad}|${item.precioUnitario}`;
        if (!itemsVistos.has(clave)) {
            itemsVistos.add(clave);
            itemsUnicos.push(item);
        }
    });

    if (itemsUnicos.length > 0) {
        datos.items = itemsUnicos;
    }

    // ---------- 3. Derivar subtotal/IVA si no los tenemos ----------
    if (datos.total) {
        if (datos.tipo === 'C' || datos.tipo === 'SIN') {
            // Factura C: sin IVA
            datos.iva = 0;
            if (!datos.subtotal) datos.subtotal = datos.total;
        } else if (datos.iva !== undefined && datos.iva > 0) {
            // Ya tenemos IVA: calcular subtotal
            if (!datos.subtotal) {
                datos.subtotal = +(datos.total - datos.iva).toFixed(2);
            }
        } else {
            // Factura A/B sin IVA explícito: asumir 21%
            const alicuota = 21;
            datos.alicuotaIVA = alicuota;
            const neto = +(datos.total / (1 + alicuota / 100)).toFixed(2);
            datos.subtotal = neto;
            datos.iva = +(datos.total - neto).toFixed(2);
        }
    }

    // ---------- 4. Si aún no hay total pero hay subtotal + IVA ----------
    if (!datos.total && datos.subtotal) {
        datos.total = +(datos.subtotal + (datos.iva || 0)).toFixed(2);
    }

    // ==================== CAE ====================
    const matchCAE = t.match(/CAE\s*N[°º]?\s*:?\s*(\d{14})/i);
    if (matchCAE) {
        datos.cae = matchCAE[1];
    }

    // ==================== OTROS TRIBUTOS ====================
    const matchOtros = t.match(/Importe\s+Otros\s+Tributos\s*:?\s*\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (matchOtros) {
        const valor = parsearMonto(matchOtros[1]);
        if (valor > 0) datos.otrosTributos = valor;
    }

    return datos;
}

// ==================== HELPERS ====================
function parsearMonto(str) {
    if (!str) return 0;
    let s = String(str).trim().replace(/\s/g, '');
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

// ==================== PARSER POR NOMBRE DE ARCHIVO ====================
export function parsearNombreArchivo(nombreArchivo) {
    if (!nombreArchivo) return {};
    const datos = {};

    const match = nombreArchivo.match(/(\d{11})[_-](\d{3})[_-](\d{5})[_-](\d{8})/);
    if (match) {
        const [_, cuit, tipoCod, ptoVenta, nro] = match;
        datos.cuit = cuit;
        datos.cuitFormateado = `${cuit.substring(0, 2)}-${cuit.substring(2, 10)}-${cuit.substring(10)}`;
        if (COD_AFIP[tipoCod]) {
            const tipoBase = COD_AFIP[tipoCod];
            datos.tipo = tipoBase.startsWith('NC-') ? tipoBase.substring(3) : tipoBase;
        }
        datos.numeroFactura = `${ptoVenta}-${nro}`;
    }

    return datos;
}

// ==================== FUNCIÓN PRINCIPAL ====================
export async function procesarArchivoFactura(file, onProgress = null, cuitEmpresa = null, modo = 'compra') {
    const notificar = (msg, pct = null) => {
        if (onProgress) onProgress(msg, pct);
    };

    let texto = '';
    let fuente = '';

    const esPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const esImagen = file.type.startsWith('image/');

    if (esPDF) {
        notificar('📄 Leyendo PDF...', 30);
        try {
            texto = await extraerTextoPDF(file);
            fuente = 'pdf.js';
            notificar('📄 PDF leído', 60);
        } catch (e) {
            console.error('Error leyendo PDF:', e);
            throw new Error('No se pudo leer el PDF: ' + e.message);
        }
    } else if (esImagen) {
        notificar('🔍 Aplicando OCR a la imagen...', 10);
        try {
            texto = await extraerTextoImagen(file, (p) => {
                notificar(`🔍 OCR: ${Math.round(p * 100)}%`, 10 + p * 70);
            });
            fuente = 'tesseract';
            notificar('🔍 Imagen procesada', 80);
        } catch (e) {
            console.error('Error en OCR:', e);
            throw new Error('No se pudo leer la imagen: ' + e.message);
        }
    } else {
        throw new Error('Tipo de archivo no soportado');
    }

    notificar('🧠 Analizando datos...', 85);
    const datosDelTexto = parsearFactura(texto, cuitEmpresa, modo);
    const datosDelNombre = parsearNombreArchivo(file.name);

    const datos = { ...datosDelNombre, ...datosDelTexto };

    notificar('✅ Datos extraídos', 100);

    return {
        datos,
        texto,
        fuente,
        archivo: file.name
    };
}
