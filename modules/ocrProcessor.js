// Procesador OCR profesional para facturas argentinas
export async function procesarImagenOCR(file, onProgress) {
    return new Promise(async (resolve, reject) => {
        try {
            onProgress?.('comprimiendo', 10);
            // Paso 1: Comprimir y redimensionar
            const imagenProcesada = await comprimirYMejorar(file);
            
            onProgress?.('mejorando', 30);
            // Paso 2: Mejorar calidad para OCR
            const imagenMejorada = await mejorarParaOCR(imagenProcesada.url);
            
            onProgress?.('ocr', 60);
            // Paso 3: Ejecutar OCR
            const { data: { text } } = await Tesseract.recognize(imagenMejorada.url, 'spa', {
                logger: m => console.log(m)
            });
            
            onProgress?.('extrayendo', 80);
            // Paso 4: Extraer datos estructurados
            const datosExtraidos = extraerDatosFactura(text);
            
            onProgress?.('completado', 100);
            resolve({
                textoCompleto: text,
                datos: datosExtraidos,
                imagenProcesada: imagenProcesada.url,
                imagenMejorada: imagenMejorada.url
            });
        } catch (error) {
            reject(error);
        }
    });
}

function comprimirYMejorar(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Calcular zoom para que la factura ocupe todo el encuadre
                let width = img.width;
                let height = img.height;
                
                // Determinar orientación y aplicar zoom si es necesario
                const maxWidth = 1400;
                const maxHeight = 2000;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // Aplicar zoom para centrar el documento
                const zoomFactor = 1.1;
                const zoomWidth = width * zoomFactor;
                const zoomHeight = height * zoomFactor;
                const offsetX = (width - zoomWidth) / 2;
                const offsetY = (height - zoomHeight) / 2;
                
                ctx.drawImage(img, offsetX, offsetY, zoomWidth, zoomHeight);
                
                canvas.toBlob((blob) => {
                    resolve({
                        blob: blob,
                        url: URL.createObjectURL(blob),
                        width: width,
                        height: height
                    });
                }, 'image/jpeg', 0.85);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function mejorarParaOCR(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Mejorar contraste y binarizar
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // Umbral adaptativo
                const threshold = 180;
                const newValue = gray > threshold ? 255 : 0;
                data[i] = newValue;
                data[i + 1] = newValue;
                data[i + 2] = newValue;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve({
                url: canvas.toDataURL('image/jpeg', 0.95),
                width: canvas.width,
                height: canvas.height
            });
        };
        img.src = imageUrl;
    });
}

function extraerDatosFactura(texto) {
    const datos = {
        // Datos del emisor (vendedor)
        emisor: {
            razonSocial: '',
            cuit: '',
            condicionIVA: '',
            domicilio: '',
            ingresosBrutos: '',
            inicioActividades: '',
            puntoVenta: ''
        },
        // Datos del receptor (cliente)
        receptor: {
            nombre: '',
            cuit: '',
            condicionIVA: '',
            domicilioFiscal: ''
        },
        // Datos de la factura
        factura: {
            tipo: '',
            numero: '',
            fechaEmision: '',
            fechaVencimiento: '',
            cae: '',
            caeVencimiento: ''
        },
        // Items
        items: [],
        // Totales
        totales: {
            netoGravado: 0,
            iva27: 0,
            iva21: 0,
            iva105: 0,
            iva5: 0,
            iva25: 0,
            otrosTributos: 0,
            total: 0
        }
    };
    
    // Expresiones regulares para extraer datos
    
    // CUIT (formato argentino: XX-XXXXXXXX-X)
    const cuitRegex = /(\d{2})-?(\d{8})-?(\d{1})/g;
    const cuitMatch = texto.match(cuitRegex);
    if (cuitMatch) {
        if (!datos.emisor.cuit) datos.emisor.cuit = cuitMatch[0];
        if (cuitMatch[1] && !datos.receptor.cuit) datos.receptor.cuit = cuitMatch[1];
    }
    
    // Fechas
    const fechaRegex = /(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/g;
    const fechas = texto.match(fechaRegex);
    if (fechas) {
        datos.factura.fechaEmision = fechas[0];
        if (fechas[1]) datos.factura.fechaVencimiento = fechas[1];
    }
    
    // Número de factura (formato: 0001-00123456)
    const facturaNumRegex = /Factura\s*(?:N°|Nro|Numero)?\s*[:]?\s*(\d{4}-\d{8,})/i;
    const facturaMatch = texto.match(facturaNumRegex);
    if (facturaMatch) datos.factura.numero = facturaMatch[1];
    
    // Tipo de factura
    if (texto.includes('Factura A')) datos.factura.tipo = 'Factura A';
    else if (texto.includes('Factura B')) datos.factura.tipo = 'Factura B';
    else if (texto.includes('Factura C')) datos.factura.tipo = 'Factura C';
    
    // CAE
    const caeRegex = /CAE\s*[:]?\s*(\d{14})/i;
    const caeMatch = texto.match(caeRegex);
    if (caeMatch) datos.factura.cae = caeMatch[1];
    
    // Razón Social (buscando patrones comunes)
    const razonSocialRegex = /(?:Razón Social|Razon Social|Denominación)[:\s]*([A-Za-zÁÉÍÓÚÑ\s&]+)/i;
    const razonMatch = texto.match(razonSocialRegex);
    if (razonMatch) datos.emisor.razonSocial = razonMatch[1].trim();
    
    // Nombre del cliente
    const clienteRegex = /(?:Cliente|Comprador|Adquiriente)[:\s]*([A-Za-zÁÉÍÓÚÑ\s]+)/i;
    const clienteMatch = texto.match(clienteRegex);
    if (clienteMatch) datos.receptor.nombre = clienteMatch[1].trim();
    
    // Condición frente al IVA
    const ivaCondRegex = /(?:Condición frente al IVA|Condicion IVA|IVA)[:\s]*([A-Za-zÁÉÍÓÚÑ\s]+)/i;
    const ivaCondMatch = texto.match(ivaCondRegex);
    if (ivaCondMatch) {
        if (!datos.emisor.condicionIVA) datos.emisor.condicionIVA = ivaCondMatch[1].trim();
        else datos.receptor.condicionIVA = ivaCondMatch[1].trim();
    }
    
    // Dirección
    const direccionRegex = /(?:Domicilio|Dirección|Dir)[:\s]*([A-Za-zÁÉÍÓÚÑ0-9\s,]+)/i;
    const direccionMatch = texto.match(direccionRegex);
    if (direccionMatch) {
        if (!datos.emisor.domicilio) datos.emisor.domicilio = direccionMatch[1].trim();
        else datos.receptor.domicilioFiscal = direccionMatch[1].trim();
    }
    
    // Extraer items (productos y precios)
    const lines = texto.split('\n');
    let itemsEncontrados = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Buscar líneas que contengan cantidad y precio
        const cantidadMatch = line.match(/(\d+)\s*(?:x|un|u\.medida)/i);
        const precioMatch = line.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);
        
        if (cantidadMatch && precioMatch) {
            // Intentar extraer descripción
            let descripcion = line.replace(cantidadMatch[0], '').replace(precioMatch[0], '').trim();
            if (descripcion.length > 50) descripcion = descripcion.substring(0, 50);
            
            itemsEncontrados.push({
                desc: descripcion || `Item ${itemsEncontrados.length + 1}`,
                cant: parseFloat(cantidadMatch[1]) || 1,
                costo: parseFloat(precioMatch[1].replace(/[.,]/g, m => m === '.' ? '' : '.')) || 0
            });
        }
    }
    
    // Si no se encontraron items con el método anterior, buscar precios simples
    if (itemsEncontrados.length === 0) {
        const precioRegex = /\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;
        const precios = [...texto.matchAll(precioRegex)];
        const preciosValidos = precios
            .map(p => parseFloat(p[1].replace(/[.,]/g, m => m === '.' ? '' : '.')))
            .filter(p => p > 100 && p < 10000000);
        
        itemsEncontrados = preciosValidos.slice(0, 8).map(p => ({
            desc: "Item detectado",
            cant: 1,
            costo: p
        }));
    }
    
    datos.items = itemsEncontrados;
    
    // Extraer totales
    const totalRegex = /(?:Total|Importe total)[:\s]*\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i;
    const totalMatch = texto.match(totalRegex);
    if (totalMatch) {
        datos.totales.total = parseFloat(totalMatch[1].replace(/[.,]/g, m => m === '.' ? '' : '.'));
    }
    
    const netoRegex = /(?:Neto gravado|Importe neto)[:\s]*\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i;
    const netoMatch = texto.match(netoRegex);
    if (netoMatch) {
        datos.totales.netoGravado = parseFloat(netoMatch[1].replace(/[.,]/g, m => m === '.' ? '' : '.'));
    }
    
    const iva21Regex = /IVA\s*21%[:\s]*\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i;
    const iva21Match = texto.match(iva21Regex);
    if (iva21Match) {
        datos.totales.iva21 = parseFloat(iva21Match[1].replace(/[.,]/g, m => m === '.' ? '' : '.'));
    }
    
    return datos;
}

export function formatearDatosParaEditor(datosOCR) {
    // Crear items a partir de los detectados
    const items = datosOCR.items.length > 0 ? datosOCR.items : [
        { desc: "Producto ejemplo", cant: 1, costo: 10000 }
    ];
    
    // Determinar cliente (si se detectó)
    let clienteNombre = datosOCR.receptor.nombre || "";
    let clienteCuit = datosOCR.receptor.cuit || "";
    
    return {
        items: items,
        clienteSugerido: clienteNombre,
        cuitSugerido: clienteCuit,
        facturaNumero: datosOCR.factura.numero,
        facturaTipo: datosOCR.factura.tipo,
        fechaEmision: datosOCR.factura.fechaEmision,
        totalDetectado: datosOCR.totales.total,
        datosCompletos: datosOCR
    };
}
