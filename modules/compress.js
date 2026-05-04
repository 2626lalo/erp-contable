// Utilidades de compresión para evitar errores de memoria

// Compresión extrema para móviles (evita memoria insuficiente)
export function comprimirImagenExtrema(file, maxWidth = 700, calidad = 0.45) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                // Reducción drástica para evitar errores de memoria
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxWidth) {
                    width = (width * maxWidth) / height;
                    height = maxWidth;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(width);
                canvas.height = Math.floor(height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob((blob) => {
                    resolve({
                        blob: blob,
                        url: canvas.toDataURL('image/jpeg', calidad),
                        width: canvas.width,
                        height: canvas.height
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

// Compresión para URL de imagen (cuando ya está en memoria)
export function comprimirImagenUrlExtrema(imagenUrl, maxWidth = 700, calidad = 0.45) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            if (height > maxWidth) {
                width = (width * maxWidth) / height;
                height = maxWidth;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(width);
            canvas.height = Math.floor(height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            resolve(canvas.toDataURL('image/jpeg', calidad));
        };
        img.src = imagenUrl;
    });
}

// Verificar memoria disponible (aproximada)
export function verificarMemoria() {
    // Esta es una estimación, no es exacta pero ayuda a prevenir
    if ('deviceMemory' in navigator) {
        const memoriaGB = navigator.deviceMemory;
        if (memoriaGB < 2) {
            return { suficiente: false, mensaje: "Memoria limitada, se usará compresión máxima" };
        }
    }
    return { suficiente: true, mensaje: "Memoria suficiente" };
}
