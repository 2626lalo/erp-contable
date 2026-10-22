// ==================== modules/configuracion/empresa.js ====================
// Pestaña Empresa: datos, logo, aportes de capital, emails, teléfonos
// ERP Contable Argentina - v7.16.3
// v7.16.3: aportes de capital generan movimiento de tesorería (con impuesto al cheque si corresponde)
// v7.16.2: input de fecha de aporte usa helper inputFechaHTML/initInputFecha

import { getDB, guardarDB, crearMovimiento } from '../db.js';
import {
    formatNumber, mostrarNotificacion, escapeHtml, formatDate, generarId,
    inputFechaHTML, initInputFecha, getValorFecha
} from '../utils.js';
import {
    crearModal,
    cerrarModal,
    comprimirImagen,
    calcularTamanoBase64,
    LOGO_MAX_BYTES,
    CONDICIONES_IVA,
    METODOS_PAGO
} from './helpers.js';

// ==================== RENDER ====================
export function renderTabEmpresa(datosEmpresa, totalAportado, saldoCajaActual, aportesHTML) {
    const emails = datosEmpresa.emails || [];
    const emailPrincipal = datosEmpresa.email || '';
    const emailsHTML = emails.length > 0 ? emails.map(e => `
        <div class="flex items-center gap-2 mb-1">
            <input type="radio" name="emailPrincipal" value="${escapeHtml(e)}" class="email-radio" ${e === emailPrincipal ? 'checked' : ''}>
            <span class="text-sm">${escapeHtml(e)}</span>
            <button onclick="window.eliminarEmail(this)" class="text-red-500 text-xs hover:underline">[x]</button>
        </div>
    `).join('') : '';

    const telefonos = datosEmpresa.telefonos || [];
    const telefonoPrincipal = datosEmpresa.telefono || '';
    const telefonosHTML = telefonos.length > 0 ? telefonos.map(t => `
        <div class="flex items-center gap-2 mb-1">
            <input type="radio" name="telefonoPrincipal" value="${escapeHtml(t)}" class="telefono-radio" ${t === telefonoPrincipal ? 'checked' : ''}>
            <span class="text-sm">${escapeHtml(t)}</span>
            <button onclick="window.eliminarTelefono(this)" class="text-red-500 text-xs hover:underline">[x]</button>
        </div>
    `).join('') : '';

    const gf = datosEmpresa.gastosFijosMensuales || {};
    const valorHoraSugerido = datosEmpresa.valorHoraSugerido || 5000;
    const markupSugerido = datosEmpresa.markupSugerido || 30;

    const logoUrl = datosEmpresa.logoUrl || null;
    const logoPreviewHTML = logoUrl
        ? `<img src="${logoUrl}" class="max-h-16 max-w-32 object-contain">`
        : '<span class="text-xs text-gray-400">Sin imagen</span>';

    return `
        <div id="tab-empresa" class="tab-content bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3">
                <h2 class="font-bold text-white">🏢 Datos de la Empresa</h2>
            </div>
            <div class="p-4 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="block text-sm font-medium mb-1">Nombre *</label><input type="text" id="empresa-nombre" value="${escapeHtml(datosEmpresa.nombre || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                    <div><label class="block text-sm font-medium mb-1">CUIT *</label><input type="text" id="empresa-cuit" value="${escapeHtml(datosEmpresa.cuit || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="30-12345678-9"></div>
                </div>
                <div><label class="block text-sm font-medium mb-1">Condición IVA</label>
                    <select id="empresa-condicionIVA" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        ${CONDICIONES_IVA.map(c => `<option value="${c}" ${c === datosEmpresa.condicionIVA ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div><label class="block text-sm font-medium mb-1">Dirección</label><input type="text" id="empresa-direccion" value="${escapeHtml(datosEmpresa.direccion || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"></div>
                <div><label class="block text-sm font-medium mb-1">Logo (emoji)</label><input type="text" id="empresa-logo" value="${escapeHtml(datosEmpresa.logo || '🏢')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" maxlength="2"></div>

                <!-- LOGO IMAGEN -->
                <div class="border-t dark:border-gray-700 pt-4 mt-2">
                    <label class="block text-sm font-medium mb-2">🖼️ Logo (imagen para presupuestos)</label>
                    <div class="flex items-center gap-3 flex-wrap">
                        <div id="logoPreviewContainer" class="w-32 h-16 border dark:border-gray-700 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-1">
                            ${logoPreviewHTML}
                        </div>
                        <label class="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm">
                            📁 Subir imagen
                            <input type="file" id="empresa-logoFile" accept="image/*" class="hidden" onchange="window.subirLogoEmpresa(this)">
                        </label>
                        <button id="btnEliminarLogo" onclick="window.eliminarLogoEmpresa()" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-lg text-sm ${logoUrl ? '' : 'hidden'}">
                            🗑️ Eliminar
                        </button>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">Se usará en la Vista Previa Cliente. Máx 400x200px, comprimido automáticamente. Peso máx final: 500KB.</p>
                </div>

                <!-- APORTES DE CAPITAL -->
                <div class="border-t dark:border-gray-700 pt-4 mt-2">
                    <div class="flex justify-between items-center">
                        <h3 class="font-bold text-md text-gray-700 dark:text-gray-300">💰 Aportes de Capital</h3>
                        <button onclick="window.mostrarModalAgregarAporte()" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm flex items-center gap-1">
                            <span>➕</span> Agregar aporte
                        </button>
                    </div>
                    <div class="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div class="flex justify-between font-bold text-sm mb-2">
                            <span>Total aportado:</span>
                            <span class="text-green-600">$${formatNumber(totalAportado)}</span>
                        </div>
                        <div class="flex justify-between text-sm mb-2 border-t pt-2 dark:border-gray-600">
                            <span>Saldo de caja actual:</span>
                            <span class="font-bold ${saldoCajaActual >= 0 ? 'text-blue-600' : 'text-red-600'}">$${formatNumber(saldoCajaActual)}</span>
                        </div>
                        <div id="lista-aportes" class="max-h-40 overflow-y-auto">
                            ${aportesHTML}
                        </div>
                    </div>
                </div>

                <!-- Valores sugeridos -->
                <div class="border-t dark:border-gray-700 pt-4 mt-2">
                    <h3 class="font-bold text-md text-gray-700 dark:text-gray-300 mb-2">📋 Valores sugeridos para Ventas Directas</h3>
                    <p class="text-xs text-gray-400 mb-3">Estos valores se precargarán en el modal de venta directa, pero podrás modificarlos en cada trabajo.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">💰 Valor hora sugerido</label>
                            <input type="number" id="empresa-valorHora" value="${valorHoraSugerido}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="5000">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">📈 Margen sugerido (%)</label>
                            <input type="number" id="empresa-markup" value="${markupSugerido}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.1" placeholder="30">
                        </div>
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm font-medium mb-1">🏦 Alícuota Impuesto al Cheque (%)</label>
                        <input type="number" id="empresa-impChequeAlicuota" value="${(datosEmpresa.alicuotaImpuestoCheque ?? getDB().configuracion?.alicuotaImpuestoCheque ?? 0.6)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0.6">
                        <p class="text-xs text-gray-400 mt-1">Se aplica a cada movimiento bancario (no efectivo). <strong>General: 0,6%</strong> (Ley 25.413). Salta: 0,6%.</p>
                    </div>

                    <div class="mt-3">
                        <label class="block text-sm font-medium mb-1">🏛️ IIBB Exento hasta (fecha)</label>
                        <input type="date" id="empresa-iibbExentoHasta" value="${(getDB().formulas?.componentes?.iibb?.exentoHasta || '')}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                        <p class="text-xs text-gray-400 mt-1">Dejalo vacío si no estás exento. Mientras estés exento, la app no calcula IIBB.</p>
                    </div>

                    <div class="mt-3">
                        <label class="block text-sm font-medium mb-1">📊 Gastos fijos mensuales (para prorratear)</label>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div>
                                <label class="text-xs text-gray-500">Alquiler</label>
                                <input type="number" id="empresa-gf-alquiler" value="${gf.alquiler || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0">
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">Sueldos</label>
                                <input type="number" id="empresa-gf-sueldos" value="${gf.sueldos || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0">
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">Servicios</label>
                                <input type="number" id="empresa-gf-servicios" value="${gf.servicios || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0">
                            </div>
                            <div>
                                <label class="text-xs text-gray-500">Otros</label>
                                <input type="number" id="empresa-gf-otros" value="${gf.otros || 0}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Emails -->
                <div class="mt-4 border-t pt-4">
                    <label class="block text-sm font-medium mb-1">📧 Correos Electrónicos</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="text-xs text-gray-500">Email principal (para facturas)</label>
                            <input type="email" id="empresa-email" value="${escapeHtml(emailPrincipal)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="principal@miempresa.com">
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Agregar email adicional</label>
                            <div class="flex gap-2">
                                <input type="email" id="nuevo-email" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="otro@miempresa.com">
                                <button onclick="window.agregarEmail()" class="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">+</button>
                            </div>
                        </div>
                    </div>
                    <div id="lista-emails" class="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        ${emailsHTML || '<p class="text-xs text-gray-400">No hay emails adicionales</p>'}
                    </div>
                </div>

                <!-- Teléfonos -->
                <div class="mt-4 border-t pt-4">
                    <label class="block text-sm font-medium mb-1">📞 Teléfonos</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="text-xs text-gray-500">Teléfono principal (WhatsApp)</label>
                            <input type="text" id="empresa-telefono" value="${escapeHtml(telefonoPrincipal)}" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="11-1234-5678">
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Agregar teléfono adicional</label>
                            <div class="flex gap-2">
                                <input type="text" id="nuevo-telefono" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="11-8765-4321">
                                <button onclick="window.agregarTelefono()" class="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">+</button>
                            </div>
                        </div>
                    </div>
                    <div id="lista-telefonos" class="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        ${telefonosHTML || '<p class="text-xs text-gray-400">No hay teléfonos adicionales</p>'}
                    </div>
                </div>

                <div class="mt-4 flex justify-end"><button id="guardar-empresa" class="bg-blue-600 text-white px-6 py-2 rounded-xl">💾 Guardar</button></div>
            </div>
        </div>
    `;
}

// ==================== INICIALIZAR EVENTOS ====================
export function initEmpresaEvents() {
    document.getElementById('guardar-empresa')?.addEventListener('click', guardarDatosEmpresaDesdeFormulario);
}

// ==================== GUARDAR EMPRESA DESDE FORMULARIO ====================
export function guardarDatosEmpresaDesdeFormulario() {
    const db = getDB();

    const emails = [];
    document.querySelectorAll('#lista-emails .email-radio').forEach(radio => {
        const val = radio.value;
        if (val && !emails.includes(val)) emails.push(val);
    });
    const emailPrincipal = document.getElementById('empresa-email')?.value.trim() || '';
    if (emailPrincipal && !emails.includes(emailPrincipal)) emails.unshift(emailPrincipal);

    const telefonos = [];
    document.querySelectorAll('#lista-telefonos .telefono-radio').forEach(radio => {
        const val = radio.value;
        if (val && !telefonos.includes(val)) telefonos.push(val);
    });
    const telefonoPrincipal = document.getElementById('empresa-telefono')?.value.trim() || '';
    if (telefonoPrincipal && !telefonos.includes(telefonoPrincipal)) telefonos.unshift(telefonoPrincipal);

    const logoUrlActual = db.datosEmpresa?.logoUrl || null;

    const datos = {
        nombre: document.getElementById('empresa-nombre')?.value || '',
        cuit: document.getElementById('empresa-cuit')?.value || '',
        condicionIVA: document.getElementById('empresa-condicionIVA')?.value || '',
        direccion: document.getElementById('empresa-direccion')?.value || '',
        logo: document.getElementById('empresa-logo')?.value || '🏢',
        logoUrl: logoUrlActual,
        capitalInicial: 0,
        email: emailPrincipal,
        emails: emails,
        telefono: telefonoPrincipal,
        telefonos: telefonos,
        valorHoraSugerido: parseFloat(document.getElementById('empresa-valorHora')?.value) || 5000,
        markupSugerido: parseFloat(document.getElementById('empresa-markup')?.value) || 30,
        alicuotaImpuestoCheque: parseFloat(document.getElementById('empresa-impChequeAlicuota')?.value) || 0.6,
        gastosFijosMensuales: {
            alquiler: parseFloat(document.getElementById('empresa-gf-alquiler')?.value) || 0,
            sueldos: parseFloat(document.getElementById('empresa-gf-sueldos')?.value) || 0,
            servicios: parseFloat(document.getElementById('empresa-gf-servicios')?.value) || 0,
            otros: parseFloat(document.getElementById('empresa-gf-otros')?.value) || 0
        },
        camposPersonalizados: []
    };
    db.datosEmpresa = datos;

    // 🔥 v7.16.58: guardar la fecha de exención de IIBB en las fórmulas
    const exentoHasta = document.getElementById('empresa-iibbExentoHasta')?.value || null;
    if (db.formulas?.componentes?.iibb) {
        db.formulas.componentes.iibb.exentoHasta = exentoHasta;
    }

    guardarDB();
    mostrarNotificacion('✅ Datos guardados', 'success');
    window.dispatchEvent(new Event('refreshView'));
}

// ==================== LOGO: SUBIR ====================
window.subirLogoEmpresa = async (input) => {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        mostrarNotificacion('Solo se aceptan imágenes (PNG, JPG, SVG, WEBP)', 'error');
        return;
    }
    try {
        mostrarNotificacion('🖼️ Procesando imagen...', 'info');
        const base64 = await comprimirImagen(file);
        const tamano = calcularTamanoBase64(base64);
        if (tamano > LOGO_MAX_BYTES) {
            mostrarNotificacion(`⚠️ La imagen pesa ${Math.round(tamano/1024)}KB. Máximo permitido: ${Math.round(LOGO_MAX_BYTES/1024)}KB`, 'error');
            return;
        }
        const db = getDB();
        db.datosEmpresa = db.datosEmpresa || {};
        db.datosEmpresa.logoUrl = base64;
        guardarDB();
        mostrarNotificacion(`✅ Logo guardado (${Math.round(tamano/1024)}KB)`, 'success');
        const preview = document.getElementById('logoPreviewContainer');
        if (preview) {
            preview.innerHTML = `<img src="${base64}" class="max-h-16 max-w-32 object-contain">`;
        }
        const btnEliminar = document.getElementById('btnEliminarLogo');
        if (btnEliminar) btnEliminar.classList.remove('hidden');
        input.value = '';
    } catch(e) {
        console.error(e);
        mostrarNotificacion('Error al procesar la imagen', 'error');
    }
};

// ==================== LOGO: ELIMINAR ====================
window.eliminarLogoEmpresa = () => {
    if (!confirm('¿Eliminar el logo actual?')) return;
    const db = getDB();
    if (db.datosEmpresa) db.datosEmpresa.logoUrl = null;
    guardarDB();
    const preview = document.getElementById('logoPreviewContainer');
    if (preview) preview.innerHTML = '<span class="text-xs text-gray-400">Sin imagen</span>';
    const btnEliminar = document.getElementById('btnEliminarLogo');
    if (btnEliminar) btnEliminar.classList.add('hidden');
    mostrarNotificacion('Logo eliminado', 'info');
};

// ==================== APORTES DE CAPITAL ====================
window.mostrarModalAgregarAporte = () => {
    guardarDatosEmpresaDesdeFormulario();

    const fechaActual = new Date().toISOString().split('T')[0];

    const mediosOptions = METODOS_PAGO.map(m =>
        `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`
    ).join('');

    const modal = crearModal(`
        <div class="space-y-3">
            ${inputFechaHTML('aporte-fecha', fechaActual, { label: '📅 Fecha' })}
            <div><label class="block text-sm font-medium">💰 Monto *</label><input type="number" id="aporte-monto" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.01" placeholder="0"></div>
            <div><label class="block text-sm font-medium">💳 Medio</label>
                <select id="aporte-medio" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    ${mediosOptions}
                </select>
            </div>
            <div><label class="block text-sm font-medium">🔖 Referencia bancaria (opcional)</label><input type="text" id="aporte-referencia" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Nro de transferencia, cheque, etc."></div>
            <div><label class="block text-sm font-medium">📝 Descripción</label><input type="text" id="aporte-descripcion" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Aporte para capital de trabajo"></div>
            <p class="text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                ℹ️ Los aportes en <strong>transferencia</strong>, <strong>tarjeta</strong> o <strong>cheque</strong> generan impuesto al cheque (0,6%). Los aportes en efectivo no.
            </p>
        </div>
    `, '💰 Agregar Aporte de Capital');

    // Inicializar el input de fecha
    initInputFecha('aporte-fecha');

    modal.querySelector('#modalGuardar').onclick = () => {
        const fecha = getValorFecha('aporte-fecha');
        const monto = parseFloat(modal.querySelector('#aporte-monto').value);
        const medio = modal.querySelector('#aporte-medio').value;
        const referenciaBanco = modal.querySelector('#aporte-referencia').value.trim() || '';
        const descripcion = modal.querySelector('#aporte-descripcion').value.trim() || 'Aporte de capital';

        if (!fecha || isNaN(monto) || monto <= 0) {
            mostrarNotificacion('Fecha y monto válidos', 'error');
            return;
        }

        const db = getDB();
        if (!db.aportesCapital) db.aportesCapital = [];
        if (!db.movimientos) db.movimientos = [];

        const aporteId = generarId();

        // 1. Crear el aporte
        db.aportesCapital.push({
            id: aporteId,
            fecha: fecha,
            monto: monto,
            descripcion: descripcion,
            medio: medio,
            referenciaBanco: referenciaBanco,
            esInicial: false
        });

        // 2. Crear el movimiento de tesorería
        // El helper crearMovimiento:
        // - Si el medio NO es 'Efectivo' ni 'Otro' → aplica impuesto al cheque 0.6%
        // - Convierte medio español a clave interna
        const medioKey = mapearMedioAKey(medio);
        const mov = crearMovimiento({
            fecha: fecha,
            tipo: 'ingreso',
            origen: 'aporte_capital',
            origenId: aporteId,
            origenDescripcion: `Aporte: ${descripcion}`,
            monto: monto,
            medio: medioKey,
            observaciones: referenciaBanco ? `Ref: ${referenciaBanco}` : ''
        });

        // Guardar referencia del movimiento en el aporte
        const idxAporte = db.aportesCapital.findIndex(a => a.id === aporteId);
        if (idxAporte !== -1) {
            db.aportesCapital[idxAporte].movimientoId = mov.id;
        }

        guardarDB();
        mostrarNotificacion(`✅ Aporte agregado (con movimiento ${mov.id})`, 'success');
        cerrarModal(modal);
        window.dispatchEvent(new Event('refreshView'));
    };
    modal.querySelector('#modalCancelar').onclick = () => cerrarModal(modal);
};

// Helper: mapear nombre del medio (español) a clave interna
function mapearMedioAKey(medioEspanol) {
    const mapa = {
        'Efectivo': 'efectivo',
        'Transferencia': 'transferencia',
        'Tarjeta Débito': 'tarjeta_debito',
        'Tarjeta Crédito': 'tarjeta_credito',
        'Cheque': 'cheque',
        'Otro': 'otro'
    };
    return mapa[medioEspanol] || 'otro';
}

window.eliminarAporte = (id) => {
    if (!confirm('¿Eliminar este aporte? Se eliminará también el movimiento asociado en tesorería. No se podrá recuperar.')) return;
    const db = getDB();

    // 1. Buscar el aporte
    const aporte = db.aportesCapital?.find(a => String(a.id) === String(id));
    if (!aporte) {
        mostrarNotificacion('Aporte no encontrado', 'error');
        return;
    }

    // 2. Eliminar el movimiento asociado (si existe)
    if (aporte.movimientoId && db.movimientos) {
        db.movimientos = db.movimientos.filter(m => String(m.id) !== String(aporte.movimientoId));
    }

    // 3. Eliminar el aporte
    db.aportesCapital = db.aportesCapital.filter(a => String(a.id) !== String(id));

    guardarDB();
    mostrarNotificacion('Aporte y movimiento eliminados', 'info');
    window.dispatchEvent(new Event('refreshView'));
};

// ==================== EMAILS ====================
window.agregarEmail = () => {
    const input = document.getElementById('nuevo-email');
    const email = input?.value.trim();
    if (!email) { mostrarNotificacion('Ingrese un email válido', 'error'); return; }
    if (!email.includes('@')) { mostrarNotificacion('Email inválido', 'error'); return; }
    const lista = document.getElementById('lista-emails');
    const radio = document.createElement('div');
    radio.className = 'flex items-center gap-2 mb-1';
    radio.innerHTML = `
        <input type="radio" name="emailPrincipal" value="${escapeHtml(email)}" class="email-radio">
        <span class="text-sm">${escapeHtml(email)}</span>
        <button onclick="window.eliminarEmail(this)" class="text-red-500 text-xs hover:underline">[x]</button>
    `;
    lista.appendChild(radio);
    input.value = '';
    const radios = lista.querySelectorAll('.email-radio');
    if (radios.length === 1) radios[0].checked = true;
};

window.eliminarEmail = (btn) => {
    if (!confirm('¿Eliminar este email?')) return;
    const row = btn.closest('.flex') || btn.parentElement;
    if (row) row.remove();
};

// ==================== TELÉFONOS ====================
window.agregarTelefono = () => {
    const input = document.getElementById('nuevo-telefono');
    const telefono = input?.value.trim();
    if (!telefono) { mostrarNotificacion('Ingrese un teléfono', 'error'); return; }
    const lista = document.getElementById('lista-telefonos');
    const radio = document.createElement('div');
    radio.className = 'flex items-center gap-2 mb-1';
    radio.innerHTML = `
        <input type="radio" name="telefonoPrincipal" value="${escapeHtml(telefono)}" class="telefono-radio">
        <span class="text-sm">${escapeHtml(telefono)}</span>
        <button onclick="window.eliminarTelefono(this)" class="text-red-500 text-xs hover:underline">[x]</button>
    `;
    lista.appendChild(radio);
    input.value = '';
    const radios = lista.querySelectorAll('.telefono-radio');
    if (radios.length === 1) radios[0].checked = true;
};

window.eliminarTelefono = (btn) => {
    if (!confirm('¿Eliminar este teléfono?')) return;
    const row = btn.closest('.flex') || btn.parentElement;
    if (row) row.remove();
};
