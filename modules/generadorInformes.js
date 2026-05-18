// ==================== modules/generadorInformes.js ====================
// GENERADOR DE INFORMES - Renderiza HTML y descarga PDF respetando formato
// ERP Contable Argentina - SAS Salta

import { mostrarNotificacion } from './utils.js';

// ============================================================
// RENDER UI
// ============================================================
export function renderGeneradorInformes() {
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="flex justify-between items-center">
                <h1 class="text-2xl font-bold text-gray-800 dark:text-white">📄 Visualizador HTML a PDF</h1>
            </div>
            
            <div class="bg-gradient-to-r from-blue-600 to-purple-700 rounded-2xl p-5 text-white">
                <p class="text-sm opacity-90">📄 Visualizador HTML a PDF</p>
                <p class="text-lg font-bold mt-1">Pegá tu código HTML y descargalo como PDF</p>
                <p class="text-xs opacity-80 mt-2">El HTML se renderizará exactamente como se vería en un navegador</p>
            </div>
            
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 px-5 py-3">
                    <h2 class="font-bold text-white">📝 Ingresá tu código HTML</h2>
                </div>
                <div class="p-4">
                    <textarea id="html-contenido" rows="12" placeholder='Pegá acá tu código HTML completo...&#10;&#10;Ejemplo:&#10;&lt;!DOCTYPE html&gt;&#10;&lt;html&gt;&#10;&lt;head&gt;&lt;title&gt;Mi Informe&lt;/title&gt;&#10;&lt;style&gt;body { font-family: Arial; padding: 40px; }&lt;/style&gt;&lt;/head&gt;&#10;&lt;body&gt;&#10;  &lt;h1&gt;Título&lt;/h1&gt;&#10;  &lt;p&gt;Contenido&lt;/p&gt;&#10;&lt;/body&gt;&#10;&lt;/html&gt;' class="w-full p-3 border rounded-xl font-mono text-sm"></textarea>
                    
                    <div class="flex gap-3 mt-4">
                        <button id="renderizar-btn" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                            👁️ Renderizar Vista Previa
                        </button>
                        <button id="pdf-btn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                            📄 Descargar PDF
                        </button>
                        <button id="limpiar-btn" class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-xl transition-all">
                            🗑️ Limpiar
                        </button>
                    </div>
                </div>
            </div>
            
            <div id="vista-previa-container" class="hidden">
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                    <div class="bg-gradient-to-r from-green-500 to-teal-600 px-5 py-3 flex justify-between items-center">
                        <h2 class="font-bold text-white">👁️ Vista Previa</h2>
                        <span class="text-xs text-white bg-black/20 px-2 py-1 rounded">El contenido se renderiza exactamente como lo ves</span>
                    </div>
                    <div class="p-0">
                        <iframe id="vista-previa-iframe" class="w-full border-0" style="min-height: 500px; background: white;"></iframe>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// FUNCIÓN PARA DESCARGAR PDF (respeta formato)
// ============================================================
function descargarPDF(html) {
    // Crear una ventana nueva
    const ventana = window.open('', '_blank');
    
    // Escribir el HTML completo en la ventana
    ventana.document.write(html);
    ventana.document.close();
    
    // Agregar estilos adicionales para asegurar que el PDF se vea bien
    const estiloAdicional = `
        <style>
            @media print {
                body {
                    margin: 0;
                    padding: 20px;
                    print-color-adjust: exact;
                    -webkit-print-color-adjust: exact;
                }
                .no-print {
                    display: none !important;
                }
                table {
                    page-break-inside: avoid;
                }
                img {
                    max-width: 100% !important;
                }
            }
        </style>
    `;
    
    // Insertar estilo adicional antes de generar el PDF
    const head = ventana.document.head;
    if (head) {
        const style = ventana.document.createElement('style');
        style.textContent = `
            @media print {
                body { margin: 0; padding: 20px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                .no-print { display: none !important; }
                table { page-break-inside: avoid; }
                img { max-width: 100% !important; }
            }
        `;
        head.appendChild(style);
    }
    
    // Esperar a que cargue todo y luego generar el PDF
    setTimeout(() => {
        try {
            const opt = {
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `informe_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2, 
                    letterRendering: true, 
                    useCORS: true,
                    logging: false
                },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };
            
            // Usar html2pdf en la ventana nueva
            if (ventana.html2pdf) {
                ventana.html2pdf().set(opt).from(ventana.document.body).save();
            } else {
                // Si html2pdf no está disponible, usar print como fallback
                ventana.print();
            }
        } catch (error) {
            console.error('Error:', error);
            ventana.print(); // Fallback a impresión
        }
    }, 1500);
}

// ============================================================
// INICIALIZAR EVENTOS
// ============================================================
export function initGeneradorInformesEvents() {
    const renderizarBtn = document.getElementById('renderizar-btn');
    const pdfBtn = document.getElementById('pdf-btn');
    const limpiarBtn = document.getElementById('limpiar-btn');
    const vistaPreviaContainer = document.getElementById('vista-previa-container');
    const iframe = document.getElementById('vista-previa-iframe');
    const htmlContenido = document.getElementById('html-contenido');
    
    let htmlActual = "";
    
    // Renderizar HTML en el iframe
    renderizarBtn?.addEventListener('click', () => {
        let html = htmlContenido?.value || "";
        
        if (!html.trim()) {
            mostrarNotificacion('Ingresá código HTML para renderizar', 'warning');
            return;
        }
        
        mostrarNotificacion('Renderizando HTML...', 'info');
        
        // Guardar el HTML actual
        htmlActual = html;
        
        // Renderizar en el iframe
        if (iframe) {
            iframe.srcdoc = html;
        }
        
        // Mostrar el contenedor de vista previa
        vistaPreviaContainer?.classList.remove('hidden');
        
        mostrarNotificacion('✅ HTML renderizado correctamente', 'success');
    });
    
    // Descargar PDF
    pdfBtn?.addEventListener('click', async () => {
        if (!htmlActual) {
            mostrarNotificacion('Primero renderizá el HTML', 'warning');
            return;
        }
        
        mostrarNotificacion('📄 Generando PDF... Esto puede tomar unos segundos', 'info');
        
        try {
            descargarPDF(htmlActual);
            // No mostrar éxito inmediatamente porque el PDF se genera en la otra ventana
            setTimeout(() => {
                mostrarNotificacion('✅ PDF generado. Revisá la descarga.', 'success');
            }, 2000);
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error al generar PDF. Probá con Ctrl+P desde la vista previa.', 'error');
        }
    });
    
    // Limpiar todo
    limpiarBtn?.addEventListener('click', () => {
        if (htmlContenido) htmlContenido.value = '';
        if (iframe) iframe.srcdoc = 'about:blank';
        vistaPreviaContainer?.classList.add('hidden');
        htmlActual = '';
        mostrarNotificacion('Todo limpiado', 'info');
    });
}
