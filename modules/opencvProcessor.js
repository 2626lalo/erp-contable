// Módulo profesional de procesamiento de documentos con OpenCV.js
// Ahora con vista previa antes del OCR

let cvReady = false;

export function initOpenCV() {
    return new Promise((resolve) => {
        if (cvReady) {
            resolve();
            return;
        }
        
        if (typeof cv !== 'undefined' && cv && cv.imread) {
            cvReady = true;
            console.log("OpenCV ya estaba cargado");
            resolve();
            return;
        }
        
        const checkInterval = setInterval(() => {
            if (typeof cv !== 'undefined' && cv.imread) {
                clearInterval(checkInterval);
                cvReady = true;
                console.log("OpenCV.js inicializado correctamente");
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            if (!cvReady) {
                console.warn("⚠️ OpenCV.js no disponible");
                resolve();
            }
        }, 10000);
    });
}

function comprimirImagenParaOpenCV(imagenUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            const maxSize = 800;
            if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            }
            if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                resolve({
                    url: canvas.toDataURL('image/jpeg', 0.6),
                    width: width,
                    height: height,
                    canvas: canvas
                });
            }, 'image/jpeg', 0.6);
        };
        img.src = imagenUrl;
    });
}

function ordenarPuntos(puntos) {
    const pts = [];
    for (let i = 0; i < 4; i++) {
        pts.push({ x: puntos.data32S[i * 2], y: puntos.data32S[i * 2 + 1] });
    }
    
    pts.sort((a, b) => a.y - b.y);
    const arriba = pts.slice(0, 2).sort((a, b) => a.x - b.x);
    const abajo = pts.slice(2, 4).sort((a, b) => a.x - b.x);
    
    return [
        arriba[0].x, arriba[0].y,
        arriba[1].x, arriba[1].y,
        abajo[1].x, abajo[1].y,
        abajo[0].x, abajo[0].y
    ];
}

function enderezarDocumento(src, puntos) {
    const ptsOrdenados = ordenarPuntos(puntos);
    const pts1 = cv.matFromArray(4, 1, cv.CV_32FC2, ptsOrdenados);
    
    const ancho = Math.max(
        Math.hypot(ptsOrdenados[2] - ptsOrdenados[0], ptsOrdenados[3] - ptsOrdenados[1]),
        Math.hypot(ptsOrdenados[6] - ptsOrdenados[4], ptsOrdenados[7] - ptsOrdenados[5])
    );
    const alto = Math.max(
        Math.hypot(ptsOrdenados[4] - ptsOrdenados[0], ptsOrdenados[5] - ptsOrdenados[1]),
        Math.hypot(ptsOrdenados[6] - ptsOrdenados[2], ptsOrdenados[7] - ptsOrdenados[3])
    );
    
    const maxSize = 1000;
    let finalAncho = ancho;
    let finalAlto = alto;
    if (finalAncho > maxSize) {
        finalAlto = (finalAlto * maxSize) / finalAncho;
        finalAncho = maxSize;
    }
    
    const pts2 = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, finalAncho, 0, finalAncho, finalAlto, 0, finalAlto]);
    const M = cv.getPerspectiveTransform(pts1, pts2);
    const dsize = new cv.Size(finalAncho, finalAlto);
    const warped = new cv.Mat();
    cv.warpPerspective(src, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    
    M.delete();
    pts1.delete();
    pts2.delete();
    
    return warped;
}

// Función principal que devuelve la imagen procesada para vista previa
export async function procesarConOpenCVPreview(canvasId, onProgress) {
    return new Promise(async (resolve) => {
        await initOpenCV();
        
        if (!cvReady || typeof cv === 'undefined' || !cv.imread) {
            onProgress?.("⚠️ OpenCV no disponible", 100);
            const canvas = document.getElementById(canvasId);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
            return;
        }
        
        onProgress?.("📐 Procesando imagen...", 20);
        
        try {
            let src = cv.imread(canvasId);
            
            if (src.rows > 900 || src.cols > 900) {
                let newWidth = src.cols;
                let newHeight = src.rows;
                if (newWidth > 800) {
                    newHeight = (newHeight * 800) / newWidth;
                    newWidth = 800;
                }
                const dsize = new cv.Size(newWidth, newHeight);
                const resized = new cv.Mat();
                cv.resize(src, resized, dsize, 0, 0, cv.INTER_LINEAR);
                src.delete();
                src = resized;
            }
            
            let gray = new cv.Mat();
            let edges = new cv.Mat();
            let hierarchy = new cv.Mat();
            let contours = new cv.MatVector();
            
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
            cv.Canny(gray, edges, 75, 200);
            cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
            
            let maxArea = 0;
            let mejorContorno = null;
            
            for (let i = 0; i < contours.size(); i++) {
                let cnt = contours.get(i);
                let area = cv.contourArea(cnt);
                if (area > 500 && area > maxArea) {
                    let peri = cv.arcLength(cnt, true);
                    let approx = new cv.Mat();
                    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
                    if (approx.rows === 4) {
                        maxArea = area;
                        mejorContorno = approx.clone();
                    }
                    approx.delete();
                }
            }
            
            onProgress?.("✂️ Enderezando documento...", 50);
            
            let resultado;
            if (mejorContorno && mejorContorno.rows === 4) {
                try {
                    resultado = enderezarDocumento(src, mejorContorno);
                    mejorContorno.delete();
                } catch(e) {
                    resultado = src.clone();
                }
            } else {
                resultado = src.clone();
            }
            
            src.delete();
            gray.delete();
            edges.delete();
            hierarchy.delete();
            contours.delete();
            if (mejorContorno) mejorContorno.delete();
            
            onProgress?.("🔍 Mejorando texto...", 75);
            
            let grayResult = new cv.Mat();
            let dst = new cv.Mat();
            cv.cvtColor(resultado, grayResult, cv.COLOR_RGBA2GRAY, 0);
            cv.adaptiveThreshold(grayResult, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 10);
            cv.imshow(canvasId, dst);
            
            resultado.delete();
            grayResult.delete();
            dst.delete();
            
            onProgress?.("✅ Procesamiento completado", 100);
            
            const canvas = document.getElementById(canvasId);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
            
        } catch (error) {
            console.error("Error:", error);
            onProgress?.("❌ Error", 100);
            const canvas = document.getElementById(canvasId);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        }
    });
}

// OCR separado (se llama después de que el usuario confirma la vista previa)
export async function extraerTextoConOpenCV(canvasId, onProgress) {
    return new Promise(async (resolve) => {
        onProgress?.("📖 Extrayendo texto...", 0);
        
        try {
            const canvas = document.getElementById(canvasId);
            const { data: { text } } = await Tesseract.recognize(canvas, 'spa');
            
            const nums = text.match(/\d{2,6}[.,]?\d{0,2}/g) || [];
            const precios = nums.filter(n => {
                const num = parseFloat(n.replace(',', '.'));
                return num > 50 && num < 10000000;
            }).slice(0, 10);
            
            const items = precios.map(p => ({
                desc: "Item detectado",
                cant: 1,
                costo: parseFloat(p.replace(',', '.'))
            }));
            
            onProgress?.("✅ OCR completado", 100);
            resolve({ items, textoCompleto: text });
            
        } catch (error) {
            console.error("Error en OCR:", error);
            onProgress?.("❌ Error en OCR", 100);
            resolve({ items: [], textoCompleto: "" });
        }
    });
}
