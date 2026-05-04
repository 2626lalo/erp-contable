// Procesador de imágenes - Optimizado para móviles
export async function comprimirImagen(file, maxWidth = 1024, maxHeight = 1024, calidad = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Calcular nuevas dimensiones manteniendo proporción
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                // Crear canvas para redimensionar
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // Mejorar contraste para mejor OCR
                ctx.drawImage(img, 0, 0, width, height);
                
                // Aplicar filtro de mejora de contraste
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                
                // Convertir a escala de grises y mejorar contraste
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    // Aumentar contraste
                    const contrast = 1.2;
                    const newGray = Math.min(255, Math.max(0, (gray - 128) * contrast + 128));
                    data[i] = newGray;
                    data[i + 1] = newGray;
                    data[i + 2] = newGray;
                }
                ctx.putImageData(imageData, 0, 0);
                
                // Convertir a blob comprimido
                canvas.toBlob((blob) => {
                    resolve({
                        blob: blob,
                        url: URL.createObjectURL(blob),
                        width: width,
                        height: height,
                        dataUrl: canvas.toDataURL('image/jpeg', calidad)
                    });
                }, 'image/jpeg', calidad);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function autoRecortarImagen(imageDataUrl, umbral = 30) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            
            // Encontrar bordes del contenido (recortar bordes blancos)
            let top = 0, bottom = img.height, left = 0, right = img.width;
            
            // Buscar primer píxel no blanco desde arriba
            for (let y = 0; y < img.height; y++) {
                let hasContent = false;
                for (let x = 0; x < img.width; x++) {
                    const idx = (y * img.width + x) * 4;
                    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                    if (gray < 255 - umbral) {
                        hasContent = true;
                        break;
                    }
                }
                if (hasContent) {
                    top = y;
                    break;
                }
            }
            
            // Buscar desde abajo
            for (let y = img.height - 1; y >= 0; y--) {
                let hasContent = false;
                for (let x = 0; x < img.width; x++) {
                    const idx = (y * img.width + x) * 4;
                    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                    if (gray < 255 - umbral) {
                        hasContent = true;
                        break;
                    }
                }
                if (hasContent) {
                    bottom = y;
                    break;
                }
            }
            
            // Buscar desde izquierda
            for (let x = 0; x < img.width; x++) {
                let hasContent = false;
                for (let y = 0; y < img.height; y++) {
                    const idx = (y * img.width + x) * 4;
                    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                    if (gray < 255 - umbral) {
                        hasContent = true;
                        break;
                    }
                }
                if (hasContent) {
                    left = x;
                    break;
                }
            }
            
            // Buscar desde derecha
            for (let x = img.width - 1; x >= 0; x--) {
                let hasContent = false;
                for (let y = 0; y < img.height; y++) {
                    const idx = (y * img.width + x) * 4;
                    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                    if (gray < 255 - umbral) {
                        hasContent = true;
                        break;
                    }
                }
                if (hasContent) {
                    right = x;
                    break;
                }
            }
            
            // Crear imagen recortada
            const newWidth = right - left;
            const newHeight = bottom - top;
            const newCanvas = document.createElement('canvas');
            newCanvas.width = newWidth;
            newCanvas.height = newHeight;
            const newCtx = newCanvas.getContext('2d');
            newCtx.drawImage(img, left, top, newWidth, newHeight, 0, 0, newWidth, newHeight);
            
            resolve({
                url: newCanvas.toDataURL('image/jpeg', 0.8),
                width: newWidth,
                height: newHeight,
                crop: { top, left, bottom, right }
            });
        };
        img.src = imageDataUrl;
    });
}

export function mejorarLegibilidad(imageDataUrl) {
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
            
            // Aplicar mejora de contraste y nitidez
            for (let i = 0; i < data.length; i += 4) {
                // Convertir a escala de grises
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // Aplicar umbral adaptativo para binarizar
                const threshold = 128;
                const newValue = gray > threshold ? 255 : 0;
                data[i] = newValue;
                data[i + 1] = newValue;
                data[i + 2] = newValue;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve({
                url: canvas.toDataURL('image/jpeg', 0.9),
                width: canvas.width,
                height: canvas.height
            });
        };
        img.src = imageDataUrl;
    });
}
