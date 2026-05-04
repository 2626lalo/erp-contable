// Editor de imagen interactivo con compresión avanzada
export function mostrarEditorImagen(imagenUrl, onConfirmar) {
    let escala = 1;
    let brillo = 0;
    let contraste = 0;
    let imagenRecortada = null;
    let fase = 'seleccion';
    let inicioSeleccion = { x: 0, y: 0 };
    let finSeleccion = { x: 0, y: 0 };
    let isDrawing = false;
    let imgOriginal = null;
    let canvasEditor = null;
    let ctx = null;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col';
    modal.innerHTML = `
        <div class="bg-gray-900 text-white p-3 flex justify-between items-center">
            <h2 id="faseTitulo" class="text-lg font-bold">✂️ Seleccionar área a recortar</h2>
            <button id="closeEditorBtn" class="text-white text-2xl">&times;</button>
        </div>
        <div class="flex-1 relative overflow-auto bg-gray-800 flex items-center justify-center p-4">
            <canvas id="editorCanvas" class="max-w-full max-h-full object-contain" style="cursor: crosshair;"></canvas>
        </div>
        <div id="controlesSeleccion" class="bg-gray-900 text-white p-4">
            <p class="text-sm text-center mb-3">📐 Arrastrá sobre la imagen para seleccionar el área a recortar</p>
            <div class="flex gap-3">
                <button id="resetSeleccionBtn" class="bg-gray-600 px-4 py-2 rounded-lg flex-1">🔄 Limpiar selección</button>
                <button id="recortarBtn" class="bg-blue-600 px-4 py-2 rounded-lg flex-1">✂️ Recortar selección</button>
                <button id="cancelarBtn" class="bg-red-600 px-4 py-2 rounded-lg flex-1">❌ Cancelar</button>
            </div>
        </div>
        <div id="controlesEdicion" class="bg-gray-900 text-white p-4 hidden">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div><label class="text-xs">🔍 Zoom: <span id="zoomValue">100</span>%</label><input type="range" id="zoomSlider" min="50" max="300" value="100" class="w-full"></div>
                <div><label class="text-xs">☀️ Brillo: <span id="brilloValue">0</span></label><input type="range" id="brilloSlider" min="-100" max="100" value="0" class="w-full"></div>
                <div><label class="text-xs">🎨 Contraste: <span id="contrasteValue">0</span></label><input type="range" id="contrasteSlider" min="-100" max="100" value="0" class="w-full"></div>
                <div><label class="text-xs">🔄 Auto-mejora</label><button id="autoFixBtn" class="bg-purple-600 px-2 py-1 rounded text-xs w-full">✨ Aplicar</button></div>
            </div>
            <div class="flex gap-3">
                <button id="volverSeleccionBtn" class="bg-gray-600 px-4 py-2 rounded-lg flex-1">← Volver a selección</button>
                <button id="confirmarBtn" class="bg-green-600 px-4 py-2 rounded-lg flex-1">✅ Finalizar y procesar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    canvasEditor = document.getElementById('editorCanvas');
    ctx = canvasEditor.getContext('2d');
    
    // Cargar imagen con compresión al cargar
    const img = new Image();
    img.onload = () => {
        // Redimensionar si es muy grande (máx 1200px)
        let width = img.width;
        let height = img.height;
        const maxDimension = 1200;
        
        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = (height * maxDimension) / width;
                width = maxDimension;
            } else {
                width = (width * maxDimension) / height;
                height = maxDimension;
            }
        }
        
        const canvasTemp = document.createElement('canvas');
        canvasTemp.width = width;
        canvasTemp.height = height;
        const ctxTemp = canvasTemp.getContext('2d');
        ctxTemp.drawImage(img, 0, 0, width, height);
        
        imgOriginal = new Image();
        imgOriginal.onload = () => {
            canvasEditor.width = imgOriginal.width;
            canvasEditor.height = imgOriginal.height;
            dibujarImagen();
            iniciarEventosCanvas();
        };
        imgOriginal.src = canvasTemp.toDataURL('image/jpeg', 0.8);
    };
    img.src = imagenUrl;
    
    let areaSeleccionada = null;
    
    function dibujarImagen() {
        if (!ctx || !imgOriginal) return;
        ctx.clearRect(0, 0, canvasEditor.width, canvasEditor.height);
        ctx.drawImage(imgOriginal, 0, 0, canvasEditor.width, canvasEditor.height);
        
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
        
        ctx.clearRect(0, 0, canvasEditor.width, canvasEditor.height);
        
        const zoomWidth = imagenRecortada.width * (escala / 100);
        const zoomHeight = imagenRecortada.height * (escala / 100);
        const offsetX = (canvasEditor.width - zoomWidth) / 2;
        const offsetY = (canvasEditor.height - zoomHeight) / 2;
        
        ctx.drawImage(imagenRecortada, offsetX, offsetY, zoomWidth, zoomHeight);
        
        const imageData = ctx.getImageData(0, 0, canvasEditor.width, canvasEditor.height);
        const data = imageData.data;
        const ajusteContraste = (259 * (contraste + 255)) / (255 * (259 - contraste));
        
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i] + brillo;
            let g = data[i + 1] + brillo;
            let b = data[i + 2] + brillo;
            data[i] = Math.min(255, Math.max(0, ajusteContraste * (r - 128) + 128));
            data[i + 1] = Math.min(255, Math.max(0, ajusteContraste * (g - 128) + 128));
            data[i + 2] = Math.min(255, Math.max(0, ajusteContraste * (b - 128) + 128));
        }
        ctx.putImageData(imageData, 0, 0);
    }
    
    function iniciarEventosCanvas() {
        canvasEditor.addEventListener('mousedown', (e) => {
            if (fase !== 'seleccion') return;
            const rect = canvasEditor.getBoundingClientRect();
            const scaleX = canvasEditor.width / rect.width;
            const scaleY = canvasEditor.height / rect.height;
            inicioSeleccion = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
            isDrawing = true;
        });
        
        canvasEditor.addEventListener('mousemove', (e) => {
            if (!isDrawing || fase !== 'seleccion') return;
            const rect = canvasEditor.getBoundingClientRect();
            const scaleX = canvasEditor.width / rect.width;
            const scaleY = canvasEditor.height / rect.height;
            finSeleccion = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
            areaSeleccionada = {
                x: Math.min(inicioSeleccion.x, finSeleccion.x),
                y: Math.min(inicioSeleccion.y, finSeleccion.y),
                w: Math.abs(finSeleccion.x - inicioSeleccion.x),
                h: Math.abs(finSeleccion.y - inicioSeleccion.y)
            };
            dibujarImagen();
        });
        
        canvasEditor.addEventListener('mouseup', () => { isDrawing = false; });
        
        canvasEditor.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (fase !== 'seleccion') return;
            const rect = canvasEditor.getBoundingClientRect();
            const touch = e.touches[0];
            const scaleX = canvasEditor.width / rect.width;
            const scaleY = canvasEditor.height / rect.height;
            inicioSeleccion = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
            isDrawing = true;
        });
        
        canvasEditor.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isDrawing || fase !== 'seleccion') return;
            const rect = canvasEditor.getBoundingClientRect();
            const touch = e.touches[0];
            const scaleX = canvasEditor.width / rect.width;
            const scaleY = canvasEditor.height / rect.height;
            finSeleccion = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
            areaSeleccionada = {
                x: Math.min(inicioSeleccion.x, finSeleccion.x),
                y: Math.min(inicioSeleccion.y, finSeleccion.y),
                w: Math.abs(finSeleccion.x - inicioSeleccion.x),
                h: Math.abs(finSeleccion.y - inicioSeleccion.y)
            };
            dibujarImagen();
        });
        
        canvasEditor.addEventListener('touchend', () => { isDrawing = false; });
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
        ctxRecorte.drawImage(canvasEditor, areaSeleccionada.x, areaSeleccionada.y, areaSeleccionada.w, areaSeleccionada.h, 0, 0, areaSeleccionada.w, areaSeleccionada.h);
        
        const nuevaImagen = new Image();
        nuevaImagen.onload = () => {
            imagenRecortada = nuevaImagen;
            canvasEditor.width = imagenRecortada.width;
            canvasEditor.height = imagenRecortada.height;
            fase = 'edicion';
            document.getElementById('faseTitulo').innerText = '🎨 Editar imagen recortada';
            document.getElementById('controlesSeleccion').classList.add('hidden');
            document.getElementById('controlesEdicion').classList.remove('hidden');
            escala = 100;
            brillo = 0;
            contraste = 0;
            document.getElementById('zoomSlider').value = 100;
            document.getElementById('brilloSlider').value = 0;
            document.getElementById('contrasteSlider').value = 0;
            document.getElementById('zoomValue').innerText = 100;
            document.getElementById('brilloValue').innerText = 0;
            document.getElementById('contrasteValue').innerText = 0;
            aplicarFiltrosEdicion();
        };
        nuevaImagen.src = canvasRecorte.toDataURL('image/jpeg', 0.85);
    }
    
    document.getElementById('recortarBtn').onclick = realizarRecorte;
    document.getElementById('resetSeleccionBtn').onclick = () => { areaSeleccionada = null; dibujarImagen(); };
    document.getElementById('cancelarBtn').onclick = () => { modal.remove(); };
    document.getElementById('volverSeleccionBtn').onclick = () => {
        fase = 'seleccion';
        document.getElementById('faseTitulo').innerText = '✂️ Seleccionar área a recortar';
        document.getElementById('controlesEdicion').classList.add('hidden');
        document.getElementById('controlesSeleccion').classList.remove('hidden');
        canvasEditor.width = imgOriginal.width;
        canvasEditor.height = imgOriginal.height;
        dibujarImagen();
    };
    document.getElementById('zoomSlider').oninput = (e) => { escala = parseInt(e.target.value); document.getElementById('zoomValue').innerText = escala; if (fase === 'edicion') aplicarFiltrosEdicion(); };
    document.getElementById('brilloSlider').oninput = (e) => { brillo = parseInt(e.target.value); document.getElementById('brilloValue').innerText = brillo; if (fase === 'edicion') aplicarFiltrosEdicion(); };
    document.getElementById('contrasteSlider').oninput = (e) => { contraste = parseInt(e.target.value); document.getElementById('contrasteValue').innerText = contraste; if (fase === 'edicion') aplicarFiltrosEdicion(); };
    document.getElementById('autoFixBtn').onclick = () => { brillo = 20; contraste = 30; escala = 120; document.getElementById('brilloSlider').value = 20; document.getElementById('contrasteSlider').value = 30; document.getElementById('zoomSlider').value = 120; document.getElementById('brilloValue').innerText = 20; document.getElementById('contrasteValue').innerText = 30; document.getElementById('zoomValue').innerText = 120; if (fase === 'edicion') aplicarFiltrosEdicion(); };
    document.getElementById('confirmarBtn').onclick = () => {
        const canvasFinal = document.createElement('canvas');
        let imgFinal;
        
        if (imagenRecortada) {
            canvasFinal.width = imagenRecortada.width;
            canvasFinal.height = imagenRecortada.height;
            const ctxFinal = canvasFinal.getContext('2d');
            ctxFinal.drawImage(imagenRecortada, 0, 0);
            
            const imageData = ctxFinal.getImageData(0, 0, canvasFinal.width, canvasFinal.height);
            const data = imageData.data;
            const ajusteContraste = (259 * (contraste + 255)) / (255 * (259 - contraste));
            for (let i = 0; i < data.length; i += 4) {
                let r = data[i] + brillo;
                let g = data[i + 1] + brillo;
                let b = data[i + 2] + brillo;
                data[i] = Math.min(255, Math.max(0, ajusteContraste * (r - 128) + 128));
                data[i + 1] = Math.min(255, Math.max(0, ajusteContraste * (g - 128) + 128));
                data[i + 2] = Math.min(255, Math.max(0, ajusteContraste * (b - 128) + 128));
            }
            ctxFinal.putImageData(imageData, 0, 0);
            imgFinal = canvasFinal.toDataURL('image/jpeg', 0.8);
        } else {
            imgFinal = canvasEditor.toDataURL('image/jpeg', 0.8);
        }
        
        modal.remove();
        onConfirmar(imgFinal);
    };
    document.getElementById('closeEditorBtn').onclick = () => modal.remove();
}
