export async function extraerTextoPDF(file, usarOCR = false) {
    return new Promise((resolve, reject) => {
        if (!window.pdfjsLib) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                procesarPDF(file, resolve, reject, usarOCR);
            };
            script.onerror = () => reject(new Error('Error cargando PDF.js'));
            document.head.appendChild(script);
        } else {
            procesarPDF(file, resolve, reject, usarOCR);
        }
    });
}

async function procesarPDF(file, resolve, reject, usarOCR) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const typedarray = new Uint8Array(e.target.result);
            const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
            let textoCompleto = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                textoCompleto += pageText + '\n';
            }
            
            resolve(textoCompleto);
        } catch (error) {
            reject(error);
        }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsArrayBuffer(file);
}

export function analizarTextoPresupuesto(texto) {
    const lines = texto.split(/\n|\. /);
    const items = [];
    const patron = /([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-\.]+?)\s*(?:x\s*(\d+)|(\d+)\s*x|(\d+)\s*unidades?)?\s*[:]?\s*[\$]?\s*([\d\.,]+)/gi;
    
    let match;
    while ((match = patron.exec(texto)) !== null) {
        let desc = match[1]?.trim() || '';
        let cantidad = parseInt(match[2] || match[3] || match[4] || '1');
        let precio = parseFloat((match[5] || '0').replace(/\./g, '').replace(',', '.'));
        if (desc && precio > 0 && precio < 10000000) {
            items.push({ desc: desc.substring(0, 45), cantidad, precio });
        }
    }
    
    return items;
}

export function esPDFEscaneado(texto) {
    return texto.trim().length < 50;
}
