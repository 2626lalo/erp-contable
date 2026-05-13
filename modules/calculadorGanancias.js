import { mostrarNotificacion } from './utils.js';

const CONSTANTES = {
    IVA: 0.21,
    IIBB_SALTA: 0.036,
    TISSH: 0.005,
    GANANCIAS: 0.25,
    RESERVA_LEGAL: 0.05
};

export function renderCalculadorGanancias() {
    return `
        <div class="space-y-5 fade-in pb-24">
            <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
                <h2 class="text-2xl font-bold">💰 Calculador de Ganancia Neta Real</h2>
                <p class="text-sm">SAS radicada en Salta - Cálculo según normativa vigente</p>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Panel izquierdo -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
                    <h3 class="text-lg font-bold mb-4">📝 Datos de la Operación</h3>
                    
                    <div class="mb-4">
                        <label class="block font-medium mb-1">💰 Monto Neto Facturado (sin IVA)</label>
                        <input type="number" id="montoNeto" class="w-full p-2 border rounded-lg" value="1000000" step="1000">
                    </div>
                    
                    <div class="mb-4">
                        <label class="block font-medium mb-2">🔧 Escenario de Trabajo</label>
                        <div class="flex gap-3">
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer">
                                <input type="radio" name="escenario" value="propio" checked> 👨‍🔧 Trabajo Propio
                            </label>
                            <label class="flex items-center gap-2 p-2 border rounded-lg cursor-pointer">
                                <input type="radio" name="escenario" value="tercerizado"> 🤝 Trabajo Tercerizado
                            </label>
                        </div>
                    </div>
                    
                    <div id="tercerizacionDiv" class="mb-4 hidden">
                        <label class="block font-medium mb-1">🏢 Costo Tercerización (sin IVA)</label>
                        <input type="number" id="costoTercerizacion" class="w-full p-2 border rounded-lg" value="0" step="1000">
                    </div>
                    
                    <div class="border-t pt-3">
                        <h4 class="font-semibold mb-2">📦 Otros Gastos</h4>
                        <div class="space-y-2">
                            <div><label>Insumos:</label><input type="number" id="insumos" class="w-full p-2 border rounded-lg" value="0" step="1000"></div>
                            <div><label>Viáticos:</label><input type="number" id="viaticos" class="w-full p-2 border rounded-lg" value="0" step="1000"></div>
                            <div><label>Servicios:</label><input type="number" id="servicios" class="w-full p-2 border rounded-lg" value="0" step="1000"></div>
                            <div><label>Otros:</label><input type="number" id="otros" class="w-full p-2 border rounded-lg" value="0" step="1000"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Panel derecho - Resultados -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
                    <h3 class="text-lg font-bold mb-4">📊 Resultados</h3>
                    
                    <div class="space-y-3">
                        <div class="bg-blue-50 p-3 rounded">
                            <div class="flex justify-between"><span>Ingreso Bruto:</span><span id="ingresoBruto" class="font-bold">$0</span></div>
                            <div class="flex justify-between text-sm"><span>Monto Neto:</span><span id="montoNetoDisplay">$0</span></div>
                        </div>
                        
                        <div class="border-t pt-2">
                            <h4 class="font-semibold text-red-600">Impuestos</h4>
                            <div class="flex justify-between"><span>IVA Débito (21%):</span><span id="ivaDebito">$0</span></div>
                            <div class="flex justify-between" id="ivaCreditoRow"><span>IVA Crédito (21%):</span><span id="ivaCredito">$0</span></div>
                            <div class="flex justify-between font-bold"><span>IVA a Pagar:</span><span id="ivaPagar">$0</span></div>
                            <div class="flex justify-between"><span>IIBB Salta (3.6%):</span><span id="iibb">$0</span></div>
                            <div class="flex justify-between"><span>TISSH (0.5%):</span><span id="tissh">$0</span></div>
                        </div>
                        
                        <div class="border-t pt-2">
                            <h4 class="font-semibold">Costos Totales</h4>
                            <div class="flex justify-between"><span>Total Gastos:</span><span id="totalGastos">$0</span></div>
                        </div>
                        
                        <div class="border-t pt-2">
                            <h4 class="font-semibold text-green-600">Ganancias</h4>
                            <div class="flex justify-between"><span>Utilidad Antes Ganancias:</span><span id="utilidadAntes">$0</span></div>
                            <div class="flex justify-between"><span>Impuesto Ganancias (25%):</span><span id="impuestoGanancias">$0</span></div>
                            <div class="flex justify-between"><span>Reserva Legal (5%):</span><span id="reservaLegal">$0</span></div>
                            <div class="flex justify-between border-t pt-1 mt-1">
                                <span class="text-xl font-bold text-green-700">GANANCIA NETA:</span>
                                <span class="text-xl font-bold text-green-700" id="gananciaNeta">$0</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="mt-4 p-2 bg-gray-100 text-xs rounded">
                        <p class="font-bold">Nota:</p>
                        <p>IIBB Salta 3.6% | TISSH 0.5% | Ganancias 25% | Reserva Legal 5%</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function calcular() {
    const montoNeto = parseFloat(document.getElementById('montoNeto')?.value) || 0;
    const escenario = document.querySelector('input[name="escenario"]:checked')?.value || 'propio';
    const costoTercerizacion = escenario === 'tercerizado' ? (parseFloat(document.getElementById('costoTercerizacion')?.value) || 0) : 0;
    const insumos = parseFloat(document.getElementById('insumos')?.value) || 0;
    const viaticos = parseFloat(document.getElementById('viaticos')?.value) || 0;
    const servicios = parseFloat(document.getElementById('servicios')?.value) || 0;
    const otros = parseFloat(document.getElementById('otros')?.value) || 0;
    
    const totalGastos = insumos + viaticos + servicios + otros + costoTercerizacion;
    
    const ivaDebito = montoNeto * CONSTANTES.IVA;
    const ivaCredito = costoTercerizacion * CONSTANTES.IVA;
    const ivaPagar = Math.max(0, ivaDebito - ivaCredito);
    
    const iibb = montoNeto * CONSTANTES.IIBB_SALTA;
    const tissh = montoNeto * CONSTANTES.TISSH;
    
    let utilidadAntes = montoNeto - totalGastos - iibb - tissh;
    utilidadAntes = Math.max(0, utilidadAntes);
    
    const impuestoGanancias = utilidadAntes * CONSTANTES.GANANCIAS;
    const despuesGanancias = utilidadAntes - impuestoGanancias;
    const reservaLegal = despuesGanancias * CONSTANTES.RESERVA_LEGAL;
    const gananciaNeta = Math.max(0, despuesGanancias - reservaLegal);
    
    // Actualizar UI
    document.getElementById('ingresoBruto').innerHTML = `$${montoNeto.toLocaleString('es-AR')}`;
    document.getElementById('montoNetoDisplay').innerHTML = `$${montoNeto.toLocaleString('es-AR')}`;
    document.getElementById('ivaDebito').innerHTML = `$${ivaDebito.toLocaleString('es-AR')}`;
    document.getElementById('ivaCredito').innerHTML = `$${ivaCredito.toLocaleString('es-AR')}`;
    document.getElementById('ivaPagar').innerHTML = `$${ivaPagar.toLocaleString('es-AR')}`;
    document.getElementById('iibb').innerHTML = `$${iibb.toLocaleString('es-AR')}`;
    document.getElementById('tissh').innerHTML = `$${tissh.toLocaleString('es-AR')}`;
    document.getElementById('totalGastos').innerHTML = `$${totalGastos.toLocaleString('es-AR')}`;
    document.getElementById('utilidadAntes').innerHTML = `$${utilidadAntes.toLocaleString('es-AR')}`;
    document.getElementById('impuestoGanancias').innerHTML = `$${impuestoGanancias.toLocaleString('es-AR')}`;
    document.getElementById('reservaLegal').innerHTML = `$${reservaLegal.toLocaleString('es-AR')}`;
    document.getElementById('gananciaNeta').innerHTML = `$${gananciaNeta.toLocaleString('es-AR')}`;
}

window.cambiarEscenario = () => {
    const escenario = document.querySelector('input[name="escenario"]:checked')?.value;
    const divTercerizacion = document.getElementById('tercerizacionDiv');
    const ivaCreditoRow = document.getElementById('ivaCreditoRow');
    
    if (escenario === 'tercerizado') {
        divTercerizacion?.classList.remove('hidden');
        if (ivaCreditoRow) ivaCreditoRow.style.display = 'flex';
    } else {
        divTercerizacion?.classList.add('hidden');
        if (ivaCreditoRow) ivaCreditoRow.style.display = 'none';
        const costoInput = document.getElementById('costoTercerizacion');
        if (costoInput) costoInput.value = '0';
    }
    calcular();
};

export function initCalculadorEvents() {
    const inputs = ['montoNeto', 'costoTercerizacion', 'insumos', 'viaticos', 'servicios', 'otros'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => calcular());
    });
    
    const radios = document.querySelectorAll('input[name="escenario"]');
    radios.forEach(radio => radio.addEventListener('change', () => window.cambiarEscenario()));
    
    calcular();
}
