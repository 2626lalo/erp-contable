// Generador de Informes IA - Versión con soporte HTML
// Jefatura de Flota - Cookins / JSC Minning S.A.S

export function renderGeneradorInformes() {
    return `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Header -->
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-800 dark:text-white">🤖 Generador de Informes</h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">📄 Pegá texto o código HTML → Vista previa → Descargá PDF</p>
        </div>

        <!-- Tarjeta principal -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            <div class="p-6">
                <div class="mb-6">
                    <div class="flex flex-wrap gap-4 mb-4">
                        <button id="modoOfflineBtn" class="px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 text-white shadow-md">📄 Modo Offline</button>
                        <button id="modoIaBtn" class="px-4 py-2 rounded-lg font-medium transition-all bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">🤖 Modo IA (Gemini)</button>
                    </div>

                    <div id="iaConfigSection" class="hidden bg-gray-50 dark:bg-gray-900 p-4 rounded-lg mb-4">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">🔑 API Key de Gemini</label>
                        <div class="flex gap-2">
                            <input type="password" id="apiKey" class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800" placeholder="Ingresá tu API Key de Google AI Studio">
                            <button id="saveApiKeyBtn" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">💾 Guardar</button>
                        </div>
                    </div>

                    <div class="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-lg text-sm">
                        💡 <strong>Instrucciones:</strong><br>
                        • Si pegás <strong>texto normal</strong> → Se generará un informe automático.<br>
                        • Si pegás <strong>código HTML completo</strong> (con gráficos) → Se renderizará tal cual.
                    </div>
                </div>

                <div class="mb-6">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📌 Título (opcional)</label>
                    <input type="text" id="tituloInforme" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800" placeholder="Ej: Anexo Correctivo - Gestión de Flota">

                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-2">📝 Subtítulo (opcional)</label>
                    <input type="text" id="subtituloInforme" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800" placeholder="Ej: Mayo 2026">

                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-2">📄 Texto o código a procesar</label>
                    <textarea id="contenidoInforme" rows="12" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-mono text-sm" placeholder='Pegá acá:&#10;&#10;- Texto normal con números&#10;- O código HTML completo (el que empieza con &lt;!DOCTYPE html&gt;...)'></textarea>

                    <div class="flex gap-3 mt-4">
                        <button id="generarInformeBtn" class="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-all">📄 Generar Informe</button>
                        <button id="limpiarInformeBtn" class="px-6 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600">🗑️ Limpiar</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="resultadoPanel" class="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden" style="display: none;">
            <div class="bg-gray-800 text-white px-6 py-3 flex justify-between items-center">
                <span class="font-medium">📄 Vista Previa del Informe</span>
                <button id="descargarPdfBtn" class="px-4 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">📥 Descargar PDF</button>
            </div>
            <div id="resultadoContenido" class="p-6 bg-gray-100 dark:bg-gray-900 min-h-[500px] overflow-auto">
                <div class="text-center py-20 text-gray-500">👈 Generá un informe para ver la vista previa</div>
            </div>
        </div>
    </div>
    `;
}

export function initGeneradorInformesEvents() {
    console.log('Iniciando Generador de Informes...');
    
    let modoActual = 'offline';
    let currentHTML = '';

    const modoOfflineBtn = document.getElementById('modoOfflineBtn');
    const modoIaBtn = document.getElementById('modoIaBtn');
    const iaConfigSection = document.getElementById('iaConfigSection');
    const generarBtn = document.getElementById('generarInformeBtn');
    const limpiarBtn = document.getElementById('limpiarInformeBtn');
    const descargarPdfBtn = document.getElementById('descargarPdfBtn');
    const resultadoPanel = document.getElementById('resultadoPanel');
    const resultadoContenido = document.getElementById('resultadoContenido');
    const tituloInput = document.getElementById('tituloInforme');
    const subtituloInput = document.getElementById('subtituloInforme');
    const contenidoTextarea = document.getElementById('contenidoInforme');
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');

    function showMessage(msg, isError = false) {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-5 right-5 px-4 py-2 rounded-lg text-white z-50 ${isError ? 'bg-red-600' : 'bg-green-600'}`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    if (modoOfflineBtn) {
        modoOfflineBtn.onclick = () => {
            modoActual = 'offline';
            modoOfflineBtn.className = 'px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 text-white shadow-md';
            modoIaBtn.className = 'px-4 py-2 rounded-lg font-medium transition-all bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
            if (iaConfigSection) iaConfigSection.style.display = 'none';
            showMessage('Modo Offline activado');
        };
    }

    if (modoIaBtn) {
        modoIaBtn.onclick = () => {
            modoActual = 'ia';
            modoIaBtn.className = 'px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 text-white shadow-md';
            modoOfflineBtn.className = 'px-4 py-2 rounded-lg font-medium transition-all bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
            if (iaConfigSection) iaConfigSection.style.display = 'block';
            showMessage('Modo IA activado');
        };
    }

    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey && apiKeyInput) apiKeyInput.value = savedKey;

    if (saveApiKeyBtn) {
        saveApiKeyBtn.onclick = () => {
            const key = apiKeyInput?.value.trim();
            if (key) {
                localStorage.setItem('gemini_api_key', key);
                showMessage('✅ API Key guardada');
            } else {
                showMessage('❌ Ingresá una API Key', true);
            }
        };
    }

    function esHTML(texto) {
        const trimmed = texto.trim();
        return trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html');
    }

    function generarHTMLDesdeTexto(texto, titulo, subtitulo) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px;">
                ${titulo ? `<h1 style="color: #1e3a5f; font-size: 24px;">${titulo}</h1>` : ''}
                ${subtitulo ? `<h3 style="color: #6c757d;">${subtitulo}</h3>` : ''}
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0;">
                    <h3 style="margin-bottom: 10px;">📋 Resumen del contenido</h3>
                    <p style="white-space: pre-wrap;">${texto.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
                </div>
                <p style="font-size: 12px; color: #999;">📌 Informe generado en modo offline - ${new Date().toLocaleDateString()}</p>
            </div>
        `;
    }

    async function generarInforme() {
        const titulo = tituloInput?.value || '';
        const subtitulo = subtituloInput?.value || '';
        const contenido = contenidoTextarea?.value || '';

        if (!contenido.trim()) {
            showMessage('⚠️ Ingresá contenido', true);
            return;
        }

        if (resultadoPanel) resultadoPanel.style.display = 'block';
        if (resultadoContenido) {
            resultadoContenido.innerHTML = '<div class="text-center py-20">⏳ Procesando...</div>';
        }

        if (esHTML(contenido)) {
            currentHTML = contenido;
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.minHeight = '550px';
            iframe.style.border = 'none';
            iframe.style.background = 'white';
            if (resultadoContenido) {
                resultadoContenido.innerHTML = '';
                resultadoContenido.appendChild(iframe);
                iframe.srcdoc = contenido;
            }
            showMessage('✅ HTML renderizado correctamente');
            return;
        }

        if (modoActual === 'offline') {
            const htmlGenerado = generarHTMLDesdeTexto(contenido, titulo, subtitulo);
            currentHTML = htmlGenerado;
            if (resultadoContenido) resultadoContenido.innerHTML = htmlGenerado;
            showMessage('✅ Informe generado');
        } else {
            const apiKey = localStorage.getItem('gemini_api_key');
            if (!apiKey) {
                if (resultadoContenido) {
                    resultadoContenido.innerHTML = '<div class="text-center py-20 text-red-600">❌ No hay API Key configurada</div>';
                }
                showMessage('❌ Configurá API Key', true);
                return;
            }

            try {
                const prompt = `Generá un informe profesional HTML con los siguientes datos. Usá colores #1e3a5f. Datos: ${contenido.substring(0, 2000)}. Título: ${titulo || 'Informe'}.`;
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                if (!response.ok) throw new Error('Error');
                const data = await response.json();
                let htmlGenerado = data.candidates?.[0]?.content?.parts?.[0]?.text || '<p>Error</p>';
                htmlGenerado = htmlGenerado.replace(/```html/g, '').replace(/```/g, '');
                currentHTML = htmlGenerado;
                if (resultadoContenido) resultadoContenido.innerHTML = htmlGenerado;
                showMessage('✅ Informe generado con IA');
            } catch (error) {
                if (resultadoContenido) {
                    resultadoContenido.innerHTML = '<div class="text-center py-20 text-red-600">❌ Error con IA. Usá modo offline.</div>';
                }
                showMessage('❌ Error con IA', true);
            }
        }
    }

    async function descargarPDF() {
        if (!currentHTML) {
            showMessage('⚠️ Generá un informe primero', true);
            return;
        }

        showMessage('⏳ Generando PDF...');

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = currentHTML;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = '1100px';
        tempDiv.style.backgroundColor = 'white';
        document.body.appendChild(tempDiv);

        try {
            if (typeof html2pdf === 'undefined') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }
            const opt = {
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: 'informe_flota.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };
            await html2pdf().set(opt).from(tempDiv).save();
            showMessage('✅ PDF descargado');
        } catch (err) {
            showMessage('❌ Error al generar PDF. Usá Ctrl+P.', true);
        } finally {
            document.body.removeChild(tempDiv);
        }
    }

    function limpiarTodo() {
        if (tituloInput) tituloInput.value = '';
        if (subtituloInput) subtituloInput.value = '';
        if (contenidoTextarea) contenidoTextarea.value = '';
        if (resultadoPanel) resultadoPanel.style.display = 'none';
        currentHTML = '';
        showMessage('✅ Limpiado');
    }

    if (generarBtn) generarBtn.onclick = generarInforme;
    if (limpiarBtn) limpiarBtn.onclick = limpiarTodo;
    if (descargarPdfBtn) descargarPdfBtn.onclick = descargarPDF;

    if (contenidoTextarea) {
        contenidoTextarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                generarInforme();
            }
        });
    }
}
