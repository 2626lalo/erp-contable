// Editor de imagen profesional con mejora de texto (similar a CamScanner)
export function mostrarEditorImagen(imagenUrl, onConfirmar) {
    let fase = 'seleccion';
    let escala = 100;
    let brillo = 0;
    let contraste = 0;
    let nitidez = 0;
    let binarizar = false;
    let rotacion = 0;
    let imgOriginal = null;
    let imagenRecortada = null;
    let canvas = null;
    let ctx = null;
    let inicioSeleccion = { x: 0, y: 0 };
    let finSeleccion = { x: 0, y: 0 };
    let isDrawing = false;
    let areaSeleccionada = null;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black z-50 flex flex-col';
    modal.innerHTML = `
        <div class="bg-gray-900 text-white p-3 flex justify-between items-center flex-wrap gap-2">
            <h2 id="faseTitulo" class="text-lg font-bold">✂️ Seleccionar área a recortar</h2>
            <div class="flex gap-2">
                <button id="rotarIzqBtn" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-lg text-sm">🔄 ←</button>
                <button id="rotarDerBtn" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-lg text-sm">🔄 →</button>
                <button id="closeEditorBtn" class="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg text-sm">✕</button>
            </div>
        </div>
        
        <div class="flex-1 overflow-auto bg-gray-800 flex items-center justify-center p-4" id="canvasContainer">
            <canvas id="editorCanvas" class="max-w-full max-h-full object-contain" style="cursor: crosshair;"></canvas>
        </div>
        
        <div id="controlesSeleccion" class="bg-gray-900 text-white p-4">
            <p class="text-sm text-center mb-3">📐 Arrastrá sobre la imagen para seleccionar el área a recortar</p>
            <div class="flex gap-3">
                <button id="resetSeleccionBtn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg flex-1">🔄 Limpiar</button>
                <button id="recortarBtn" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg flex-1">✂️ Recortar</button>
                <button id="cancelarBtn" class="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg flex-1">❌ Cancelar</button>
            </div>
        </div>
        
        <div id="controlesEdicion" class="bg-gray-900 text-white p-4 hidden">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                    <label class="text-xs block">🔍 Zoom: <span id="zoomValue">100</span>%</label>
                    <input type="range" id="zoomSlider" min="50" max="400" value="100" class="w-full">
                </div>
                <div>
                    <label class="text-xs block">☀️ Brillo: <span id="brilloValue">0</span></label>
                    <input type="range" id="brilloSlider" min="-100" max="100" value="0" class="w-full">
                </div>
                <div>
                    <label class="text-xs block">🎨 Contraste: <span id="contrasteValue">0</span></label>
                    <input type="range" id="contrasteSlider" min="-100" max="100" value="0" class="w-full">
                </div>
                <div>
                    <label class="text-xs block">🔪 Nitidez: <span id="nitidezValue">0</span></label>
                    <input type="range" id="nitidezSlider" min="0" max="100" value="0" class="w-full">
                </div>
            </div>
            <div class="flex gap-3 mb-3">
                <button id="binarizarBtn" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-lg text-sm flex-1">◻️ Blanco y Negro</button>
                <button id="autoFixBtn" class="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded-lg text-sm flex-1">✨ CamScanner</button>
                <button id="resetEdicionBtn" class="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-lg text-sm flex-1">🔄 Reset</button>
            </div>
            <div class="flex gap-3">
                <button id="volverSeleccionBtn" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg flex-1">← Volver</button>
                <button id="confirmarBtn" class="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg flex-1">✅ Procesar para OCR</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    canvas = document.getElementById('editorCanvas');
    ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
        imgOriginal = img;
        canvas.width = img.width;
        canvas.height = img.height;
        dibujarImagen();
        iniciarEventosCanvas();
    };
    img.src = imagenUrl;
    
    function dibujarImagen() {
        if (!ctx || !imgOriginal) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgOriginal, 0, 0, canvas.width, canvas.height);
        
        if (areaSeleccionada && fase === 'seleccion') {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.strokeRect(areaSeleccionada.x, areaSeleccionada.y, areaSeleccionada.w, areaSeleccionada.h);
            ctx.fillStyle = 'rgba(16,185,129,0.2)';
            ctx.fillRect(areaSeleccionada.x, areaSeleccionada.y, areaSeleccionada.w, areaSeleccionada.h);
        }
    }
    
    function aplicarFiltrosEdicion() {
        if (!ctx || !imagenRecortada) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const zoomWidth = imagenRecortada.width * (escala / 100);
        const zoomHeight = imagenRecortada.height * (escala / 100);
        const offsetX = (canvas.width - zoomWidth) / 2;
        const offsetY = (canvas.height - zoomHeight) / 2;
        
        ctx.drawImage(imagenRecortada, offsetX, offsetY, zoomWidth, zoomHeight);
        
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        
        // Aplicar brillo y contraste
        const ajusteContraste = (259 * (contraste + 255)) / (255 * (259 - contraste));
        
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i] + brillo;
            let g = data[i + 1] + brillo;
            let b = data[i + 2] + brillo;
            data[i] = Math.min(255, Math.max(0, ajusteContraste * (r - 128) + 128));
            data[i + 1] = Math.min(255, Math.max(0, ajusteContraste * (g - 128) + 128));
            data[i + 2] = Math.min(255, Math.max(0, ajusteContraste * (b - 128) + 128));
        }
        
        // Aplicar nitidez (filtro de enfoque)
        if (nitidez > 0) {
            const factor = nitidez / 50;
            const width = canvas.width;
            const height = canvas.height;
            const sharpenedData = new Uint8ClampedArray(data.length);
            
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    const center = [data[idx], data[idx+1], data[idx+2]];
                    const neighbors = [
                        data[idx - width*4], data[idx - width*4 + 1], data[idx - width*4 + 2],
                        data[idx + 4], data[idx + 5], data[idx + 6],
                        data[idx + width*4], data[idx + width*4 + 1], data[idx + width*4 + 2],
                        data[idx - 4], data[idx - 3], data[idx - 2]
                    ];
                    
                    for (let c = 0; c < 3; c++) {
                        let neighborAvg = (neighbors[c] + neighbors[c+3] + neighbors[c+6] + neighbors[c+9]) / 4;
                        sharpenedData[idx + c] = Math.min(255, Math.max(0, center[c] + (center[c] - neighborAvg) * factor));
                    }
                    sharpenedData[idx+3] = data[idx+3];
                }
            }
            data = sharpenedData;
        }
        
        // Aplicar binarización (blanco y negro de alto contraste)
        if (binarizar) {
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                const threshold = 180;
                const bw = gray > threshold ? 255 : 0;
                data[i] = bw;
                data[i+1] = bw;
                data[i+2] = bw;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    function rotarImagen(grados) {
        rotacion = (rotacion + grados) % 360;
        
        const canvasTemp = document.createElement('canvas');
        const ctxTemp = canvasTemp.getContext('2d');
        
        if (grados === 90 || grados === -90 || grados === 270) {
            canvasTemp.width = imgOriginal.height;
            canvasTemp.height = imgOriginal.width;
        } else {
            canvasTemp.width = imgOriginal.width;
            canvasTemp.height = imgOriginal.height;
        }
        
        ctxTemp.translate(canvasTemp.width / 2, canvasTemp.height / 2);
        ctxTemp.rotate(grados * Math.PI / 180);
        ctxTemp.drawImage(imgOriginal, -imgOriginal.width / 2, -imgOriginal.height / 2);
        
        const nuevaImagen = new Image();
        nuevaImagen.onload = () => {
            imgOriginal = nuevaImagen;
            canvas.width = imgOriginal.width;
            canvas.height = imgOriginal.height;
            dibujarImagen();
        };
        nuevaImagen.src = canvasTemp.toDataURL();
    }
    
    function iniciarEventosCanvas() {
        canvas.addEventListener('mousedown', (e) => {
            if (fase !== 'seleccion') return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            inicioSeleccion = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
            isDrawing = true;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing || fase !== 'seleccion') return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            finSeleccion = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
            areaSeleccionada = {
                x: Math.min(inicioSeleccion.x, finSeleccion.x),
                y: Math.min(inicioSeleccion.y, finSeleccion.y),
                w: Math.abs(finSeleccion.x - inicioSeleccion.x),
                h: Math.abs(finSeleccion.y - inicioSeleccion.y)
            };
            dibujarImagen();
        });
        
        canvas.addEventListener('mouseup', () => { isDrawing = false; });
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (fase !== 'seleccion') return;
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            inicioSeleccion = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
            isDrawing = true;
        });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isDrawing || fase !== 'seleccion') return;
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            finSeleccion = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
            areaSeleccionada = {
                x: Math.min(inicioSeleccion.x, finSeleccion.x),
                y: Math.min(inicioSeleccion.y, finSeleccion.y),
                w: Math.abs(finSeleccion.x - inicioSeleccion.x),
                h: Math.abs(finSeleccion.y - inicioSeleccion.y)
            };
            dibujarImagen();
        });
        
        canvas.addEventListener('touchend', () => { isDrawing = false; });
    }
    
    function realizarRecorte() {
        if (!areaSeleccionada || areaSeleccionada.w < 10 || areaSeleccionada.h < 10) {
            alert("❌ Seleccioná un área válida arrastrando sobre la imagen");
            return;
        }
        
        const canvasRecorte = document.createElement('canvas');
        canvasRecorte.width = areaSeleccionada.w;
        canvasRecorte.height = areaSeleccionada.h;
        const ctxRecorte = canvasRecorte.getContext('2d');
        ctxRecorte.drawImage(canvas, areaSeleccionada.x, areaSeleccionada.y, areaSeleccionada.w, areaSeleccionada.h, 0, 0, areaSeleccionada.w, areaSeleccionada.h);
        
        const nuevaImagen = new Image();
        nuevaImagen.onload = () => {
            imagenRecortada = nuevaImagen;
            canvas.width = imagenRecortada.width;
            canvas.height = imagenRecortada.height;
            fase = 'edicion';
            document.getElementById('faseTitulo').innerHTML = '🎨 Editar imagen recortada';
            document.getElementById('controlesSeleccion').classList.add('hidden');
            document.getElementById('controlesEdicion').classList.remove('hidden');
            escala = 100;
            brillo = 0;
            contraste = 0;
            nitidez = 0;
            binarizar = false;
            document.getElementById('zoomSlider').value = 100;
            document.getElementById('brilloSlider').value = 0;
            document.getElementById('contrasteSlider').value = 0;
            document.getElementById('nitidezSlider').value = 0;
            document.getElementById('zoomValue').innerText = 100;
            document.getElementById('brilloValue').innerText = 0;
            document.getElementById('contrasteValue').innerText = 0;
            document.getElementById('nitidezValue').innerText = 0;
            document.getElementById('binarizarBtn').classList.remove('bg-green-600');
            document.getElementById('binarizarBtn').classList.add('bg-gray-700');
            binarizar = false;
            aplicarFiltrosEdicion();
        };
        nuevaImagen.src = canvasRecorte.toDataURL('image/jpeg', 0.9);
    }
    
    document.getElementById('recortarBtn').onclick = realizarRecorte;
    document.getElementById('resetSeleccionBtn').onclick = () => { areaSeleccionada = null; dibujarImagen(); };
    document.getElementById('cancelarBtn').onclick = () => modal.remove();
    document.getElementById('volverSeleccionBtn').onclick = () => {
        fase = 'seleccion';
        document.getElementById('faseTitulo').innerHTML = '✂️ Seleccionar área a recortar';
        document.getElementById('controlesEdicion').classList.add('hidden');
        document.getElementById('controlesSeleccion').classList.remove('hidden');
        canvas.width = imgOriginal.width;
        canvas.height = imgOriginal.height;
        dibujarImagen();
    };
    document.getElementById('rotarIzqBtn').onclick = () => rotarImagen(-90);
    document.getElementById('rotarDerBtn').onclick = () => rotarImagen(90);
    
    document.getElementById('zoomSlider').oninput = (e) => {
        escala = parseInt(e.target.value);
        document.getElementById('zoomValue').innerText = escala;
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    document.getElementById('brilloSlider').oninput = (e) => {
        brillo = parseInt(e.target.value);
        document.getElementById('brilloValue').innerText = brillo;
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    document.getElementById('contrasteSlider').oninput = (e) => {
        contraste = parseInt(e.target.value);
        document.getElementById('contrasteValue').innerText = contraste;
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    document.getElementById('nitidezSlider').oninput = (e) => {
        nitidez = parseInt(e.target.value);
        document.getElementById('nitidezValue').innerText = nitidez;
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    
    document.getElementById('binarizarBtn').onclick = () => {
        binarizar = !binarizar;
        if (binarizar) {
            document.getElementById('binarizarBtn').classList.remove('bg-gray-700');
            document.getElementById('binarizarBtn').classList.add('bg-green-600');
        } else {
            document.getElementById('binarizarBtn').classList.remove('bg-green-600');
            document.getElementById('binarizarBtn').classList.add('bg-gray-700');
        }
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    
    document.getElementById('autoFixBtn').onclick = () => {
        brillo = 30;
        contraste = 40;
        escala = 200;
        nitidez = 60;
        binarizar = true;
        document.getElementById('brilloSlider').value = 30;
        document.getElementById('contrasteSlider').value = 40;
        document.getElementById('zoomSlider').value = 200;
        document.getElementById('nitidezSlider').value = 60;
        document.getElementById('brilloValue').innerText = 30;
        document.getElementById('contrasteValue').innerText = 40;
        document.getElementById('zoomValue').innerText = 200;
        document.getElementById('nitidezValue').innerText = 60;
        document.getElementById('binarizarBtn').classList.remove('bg-gray-700');
        document.getElementById('binarizarBtn').classList.add('bg-green-600');
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    
    document.getElementById('resetEdicionBtn').onclick = () => {
        escala = 100;
        brillo = 0;
        contraste = 0;
        nitidez = 0;
        binarizar = false;
        document.getElementById('zoomSlider').value = 100;
        document.getElementById('brilloSlider').value = 0;
        document.getElementById('contrasteSlider').value = 0;
        document.getElementById('nitidezSlider').value = 0;
        document.getElementById('zoomValue').innerText = 100;
        document.getElementById('brilloValue').innerText = 0;
        document.getElementById('contrasteValue').innerText = 0;
        document.getElementById('nitidezValue').innerText = 0;
        document.getElementById('binarizarBtn').classList.remove('bg-green-600');
        document.getElementById('binarizarBtn').classList.add('bg-gray-700');
        if (fase === 'edicion') aplicarFiltrosEdicion();
    };
    
    document.getElementById('confirmarBtn').onclick = () => {
        const canvasFinal = document.createElement('canvas');
        let imgFinal;
        
        if (imagenRecortada) {
            canvasFinal.width = imagenRecortada.width;
            canvasFinal.height = imagenRecortada.height;
            const ctxFinal = canvasFinal.getContext('2d');
            ctxFinal.drawImage(imagenRecortada, 0, 0);
            
            const imageData = ctxFinal.getImageData(0, 0, canvasFinal.width, canvasFinal.height);
            let data = imageData.data;
            
            const ajusteContraste = (259 * (contraste + 255)) / (255 * (259 - contraste));
            for (let i = 0; i < data.length; i += 4) {
                let r = data[i] + brillo;
                let g = data[i + 1] + brillo;
                let b = data[i + 2] + brillo;
                data[i] = Math.min(255, Math.max(0, ajusteContraste * (r - 128) + 128));
                data[i + 1] = Math.min(255, Math.max(0, ajusteContraste * (g - 128) + 128));
                data[i + 2] = Math.min(255, Math.max(0, ajusteContraste * (b - 128) + 128));
            }
            
            if (binarizar) {
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                    const threshold = 180;
                    const bw = gray > threshold ? 255 : 0;
                    data[i] = bw;
                    data[i+1] = bw;
                    data[i+2] = bw;
                }
            }
            
            ctxFinal.putImageData(imageData, 0, 0);
            imgFinal = canvasFinal.toDataURL('image/jpeg', 0.9);
        } else {
            imgFinal = canvas.toDataURL('image/jpeg', 0.9);
        }
        
        modal.remove();
        onConfirmar(imgFinal);
    };
    
    document.getElementById('closeEditorBtn').onclick = () => modal.remove();
}
