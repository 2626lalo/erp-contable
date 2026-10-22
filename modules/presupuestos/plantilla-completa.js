// ==================== modules/presupuestos/plantilla-completa.js ====================
// PLANTILLA COMPLETA - Vista previa con vehículo, interesado, motor, etc.
// ERP Contable Argentina - v7.15.5
// Cambio v7.15.5: Precio Unit. y Total de cada línea ahora en NETO.
//                 IVA calculado por línea y sumado (evita diferencia de $1 con el pie).
//                 La lógica interna del editor NO cambia: precioVentaUnitario sigue con IVA.

import { getDB } from '../db.js';
import { formatNumber, escapeHtml, formatDate, numeroALetras } from '../utils.js';
import { getDatosEmpresa, limpiarNombreEmpresa, getFechaVencimientoISO } from './helpers.js';

// 🔥 Helper: redondeo al entero (0.5 → arriba, 0.4 → abajo)
function redondearEntero(n) {
    return Math.round(n);
}

const ALICUOTA_IVA = 21;

export function generarHTMLPresupuestoCompleto(p) {
    const db = getDB();
    const empresa = getDatosEmpresa();
    const cliente = db.clientes.find(c => c.id === p.clienteId) || { nombre: p.cliente, cuit: p.cuitCliente || '' };
    const logoHTML = empresa.logoUrl 
        ? `<img src="${empresa.logoUrl}" alt="Logo" style="max-height:70px;max-width:140px;object-fit:contain;">`
        : `<div style="font-size:32px;font-weight:bold;color:#0a2a4a;white-space:nowrap;">SOLUM <span style="color:#c0392b;">360</span></div>`;

    let totalRepuestos = 0, totalManoObra = 0, totalMecanica = 0, totalPropios = 0, totalOtros = 0;
    let acumuladoNeto = 0, acumuladoIVA = 0;
    const itemsFilas = [];
    (p.items || []).forEach(item => {
        const cant = item.cant || 1;
        let precioUnitConIVA = 0;
        if (item.precioVentaUnitario !== undefined && item.precioVentaUnitario !== null && item.precioVentaUnitario !== 0) {
            precioUnitConIVA = item.precioVentaUnitario;
        } else if (item.precioFijo) {
            precioUnitConIVA = item.precioVentaUnitario || 0;
        } else {
            let costo = 0;
            if (item.tipo === 'mano_obra') {
                costo = (item.horas || 0) * (item.valorHora || 0);
            } else {
                costo = item.costo || 0;
            }
            const markup = p.usarMarkupGlobal ? (p.markupGlobal || 30) : (item.markup || 0);
            precioUnitConIVA = costo * (1 + markup / 100);
        }
        // 🔥 v7.15.5: convertir a NETO para mostrar en la línea
        const precioUnitNeto = redondearEntero(precioUnitConIVA / (1 + ALICUOTA_IVA / 100));
        const subtotalNeto = precioUnitNeto * cant;
        const ivaLinea = redondearEntero(subtotalNeto * (ALICUOTA_IVA / 100));

        acumuladoNeto += subtotalNeto;
        acumuladoIVA += ivaLinea;

        // Agrupación para el resumen del pie (por categoría, en neto)
        if (item.esPropio) { totalPropios += subtotalNeto; }
        else if (item.tipo === 'mano_obra') { totalManoObra += subtotalNeto; }
        else if (item.tipo === 'servicio') { totalMecanica += subtotalNeto; }
        else if (item.tipo === 'producto') { totalRepuestos += subtotalNeto; }
        else { totalOtros += subtotalNeto; }

        // 🔥 Acción: solo la inicial (ej: "C - Cambiar" → "C")
        const accionCorta = (item.accion || '').split(' - ')[0].trim();
        itemsFilas.push({
            nro: item.nro,
            cantidad: cant,
            accion: accionCorta,
            descripcion: item.desc || '',
            precioUnit: precioUnitNeto,
            subtotal: subtotalNeto
        });
    });
    const subtotalNetoRedondeado = acumuladoNeto;
    const ivaRedondeado = acumuladoIVA;
    const totalFinal = acumuladoNeto + acumuladoIVA;

    const itemsHTML = itemsFilas.map(f => {
        // Calcular IVA de la línea (21% del neto)
        const ivaLinea = redondearEntero(f.subtotal * 0.21);
        const importeConIVA = f.subtotal + ivaLinea;
        return `
        <tr>
            <td style="text-align:center;">${f.nro || ''}</td>
            <td>${escapeHtml(f.descripcion)}</td>
            <td style="text-align:center;">${f.cantidad.toFixed(2).replace('.', ',')}</td>
            <td style="text-align:right;">$ ${formatNumber(f.precioUnit)}</td>
            <td style="text-align:right;">$ ${formatNumber(ivaLinea)}</td>
            <td style="text-align:right;">$ ${formatNumber(importeConIVA)}</td>
        </tr>
        `;
    }).join('');
    const observaciones = p.comentarios ? p.comentarios.split('\n').filter(x => x.trim()) : [];
    const fechaPresupuesto = p.fechaCreacion ? formatDate(p.fechaCreacion) : formatDate(new Date());
    const fechaVencimiento = p.fechaVencimiento ? formatDate(p.fechaVencimiento) : formatDate(getFechaVencimientoISO());
    const nombreCliente = p.clienteManual || (cliente.nombre || p.cliente);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Presupuesto ${p.numero}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { 
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
    font-size: 12px; 
    color: #333; 
    max-width: 850px; 
    margin: 20px auto; 
    padding: 25px; 
    background: #fff;
  }
  /* Header limpio */
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0a2a4a; padding: 15px 20px; margin-bottom: 20px; gap: 20px; background: #f5f5f5; border-radius: 6px; }
  .header-left { display: flex; align-items: center; gap: 15px; flex: 1; }
  .header-right { text-align: right; font-size: 11px; line-height: 1.5; color: #555; flex: 0 0 auto; }
  .empresa-datos { font-size: 11px; line-height: 1.5; color: #555; }
  .empresa-datos strong { color: #0a2a4a; font-size: 14px; display: block; margin-bottom: 2px; }
  .logo { display: flex; align-items: center; }
  .logo img { max-height: 60px; max-width: 120px; object-fit: contain; }
  .logo-text { font-size: 28px; font-weight: bold; color: #0a2a4a; line-height: 1; }
  .logo-text span { color: #c0392b; }
  .titulo-presupuesto { font-size: 22px; font-weight: 700; color: #0a2a4a; margin: 0 0 3px 0; line-height: 1.2; }
  .numero-presupuesto { font-size: 13px; color: #666; margin-bottom: 2px; }
  .fecha-emision { font-size: 11px; color: #666; margin-bottom: 2px; }
  .validez { font-size: 11px; color: #666; font-style: italic; margin-bottom: 2px; }
  .aviso-legal { font-size: 9px; color: #999; }
  .logo img { max-height: 60px; max-width: 120px; object-fit: contain; }
  .logo-text { font-size: 28px; font-weight: bold; color: #0a2a4a; }
  .logo-text span { color: #c0392b; }
  /* Título y número */
  .titulo-presupuesto { font-size: 24px; font-weight: 700; color: #0a2a4a; margin: 15px 0 5px 0; }
  .numero-presupuesto { font-size: 14px; color: #666; margin-bottom: 3px; }
  .fecha-emision { font-size: 12px; color: #666; margin-bottom: 3px; }
  .validez { font-size: 12px; color: #666; font-style: italic; margin-bottom: 3px; }
  .aviso-legal { font-size: 10px; color: #999; margin-bottom: 20px; }
  /* Tarjetas cliente/vehículo */
  .tarjetas { display: flex; gap: 15px; margin-bottom: 20px; }
  .tarjeta { flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; background: #fafafa; }
  .tarjeta-titulo { font-size: 11px; font-weight: 700; color: #0a2a4a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .tarjeta-contenido { font-size: 12px; line-height: 1.5; }
  .tarjeta-contenido strong { color: #333; }
  /* Trabajo */
  .trabajo-linea { margin-bottom: 15px; padding: 8px 12px; background: #f0f4f8; border-left: 3px solid #0a2a4a; font-size: 13px; }
  .trabajo-linea strong { color: #0a2a4a; }
  /* Tabla de ítems */
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th { background: #0a2a4a; color: white; font-size: 11px; padding: 8px 6px; text-align: left; font-weight: 600; }
  td { border-bottom: 1px solid #eee; padding: 7px 6px; font-size: 11.5px; }
  tr:last-child td { border-bottom: 2px solid #0a2a4a; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  /* Totales */
  .totales { width: 350px; margin-left: auto; margin-bottom: 15px; }
  .totales tr td { border: none; padding: 4px 8px; font-size: 12px; }
  .totales .total-final { font-weight: 700; font-size: 15px; color: #0a2a4a; border-top: 2px solid #0a2a4a; padding-top: 8px; }
  /* Total en letras */
  .total-letras { font-size: 11px; font-style: italic; color: #555; margin: 10px 0 15px 0; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  /* Condiciones */
  .condiciones { font-size: 10px; color: #666; margin-top: 15px; padding: 10px; background: #fff8e1; border-left: 3px solid #f9a825; border-radius: 4px; }
  .condiciones strong { color: #0a2a4a; }
  /* Footer */
  .footer { margin-top: 20px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; text-align: center; line-height: 1.6; }
  .footer strong { color: #0a2a4a; }
  /* Botones */
  .no-print { margin-top: 25px; text-align: center; }
  .no-print button { padding: 10px 25px; background: #0a2a4a; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; margin: 0 5px; font-weight: 600; }
  .no-print button.gray { background: #6b7280; }
  .no-print button:hover { opacity: 0.9; }
  /* Impresión */
  @media print {
    body { max-width: 100% !important; margin: 0 !important; padding: 12mm !important; font-size: 12px !important; }
    .no-print { display: none !important; }
    .header, .tarjetas, .totales, .condiciones, .footer { page-break-inside: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    th { background: #0a2a4a !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<!-- Header: logo + datos empresa a la izquierda, presupuesto a la derecha -->
<div class="header">
  <div class="header-left">
    <div class="logo">${logoHTML}</div>
    <div class="empresa-datos">
      <strong>${escapeHtml(limpiarNombreEmpresa(empresa.nombre))}</strong><br>
      CUIT: ${escapeHtml(empresa.cuit || '')}<br>
      ${escapeHtml(empresa.direccion || '')}<br>
      WhatsApp: ${escapeHtml(empresa.telefono || '')}<br>
      ${escapeHtml(empresa.email || '')}
    </div>
  </div>
  <div class="header-right">
    <div class="titulo-presupuesto">Presupuesto</div>
    <div class="numero-presupuesto">${escapeHtml(p.numero)}</div>
    <div class="fecha-emision">Emitido el ${fechaPresupuesto}</div>
    <div class="validez">Válido por ${p.validezDias || 20} días</div>
    <div class="aviso-legal">Documento no válido como factura.</div>
  </div>
</div>

<!-- Tarjetas cliente/vehículo -->
<div class="tarjetas">
  <div class="tarjeta">
    <div class="tarjeta-titulo">Cliente</div>
    <div class="tarjeta-contenido">
      <strong>${escapeHtml(nombreCliente)}</strong><br>
      ${cliente.cuit ? `CUIT: ${escapeHtml(cliente.cuit)}<br>` : ''}
      ${cliente.direccion ? `${escapeHtml(cliente.direccion)}<br>` : ''}
      ${cliente.condicionIVA ? `${escapeHtml(cliente.condicionIVA)}<br>` : ''}
      ${p.interesadoTel ? `Contacto: ${p.interesado ? escapeHtml(p.interesado) + ' - ' : ''}${escapeHtml(p.interesadoTel)}` : ''}
    </div>
  </div>
  <div class="tarjeta">
    <div class="tarjeta-titulo">Vehículo</div>
    <div class="tarjeta-contenido">
      <strong>${escapeHtml(p.vehiculoMarca || '-')}</strong><br>
      ${p.patente ? `Patente: ${escapeHtml(p.patente)}<br>` : ''}
      ${p.vehiculoKm ? `${escapeHtml(p.vehiculoKm)} km<br>` : ''}
      ${p.vehiculoAnio ? `Año: ${escapeHtml(p.vehiculoAnio)}<br>` : ''}
      ${p.vehiculoColor ? `Color: ${escapeHtml(p.vehiculoColor)}` : ''}
    </div>
  </div>
</div>

<!-- Trabajo -->
${p.trabajo ? `<div class="trabajo-linea"><strong>Trabajo:</strong> ${escapeHtml(p.trabajo)}</div>` : ''}

<!-- Tabla de ítems -->
<table>
  <thead>
    <tr>
      <th style="width: 40px; text-align: center;">#</th>
      <th>Descripción</th>
      <th style="width: 60px; text-align: center;">Cant.</th>
      <th style="width: 90px; text-align: right;">Precio Unit.</th>
      <th style="width: 90px; text-align: right;">IVA 21%</th>
      <th style="width: 100px; text-align: right;">Importe</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHTML || '<tr><td colspan="6" style="text-align:center;color:#999;padding:15px;">Sin ítems cargados</td></tr>'}
  </tbody>
</table>

<!-- Totales (formato GF AutoCenter) -->
<table class="totales">
  <tr><td>Repuestos:</td><td class="text-right">$ ${formatNumber(totalFinal)}</td></tr>
  <tr><td>Subtotal:</td><td class="text-right">$ ${formatNumber(totalFinal)}</td></tr>
  <tr><td>Neto:</td><td class="text-right">$ ${formatNumber(subtotalNetoRedondeado)}</td></tr>
  <tr><td>IVA 21%:</td><td class="text-right">$ ${formatNumber(ivaRedondeado)}</td></tr>
  <tr class="total-final"><td>Total:</td><td class="text-right">$ ${formatNumber(totalFinal)}</td></tr>
</table>

<!-- Total en letras -->
<div class="total-letras">
  <strong>Son pesos:</strong> ${numeroALetras(totalFinal)}
</div>

<!-- Condiciones -->
${p.condiciones ? `<div class="condiciones"><strong>Condiciones:</strong> ${escapeHtml(p.condiciones)}</div>` : `
<div class="condiciones">
  <strong>Condiciones:</strong> Precios sujetos a variación. El presupuesto se basa en inspección inicial; al desarmar pueden surgir tareas o repuestos adicionales que requerirán aprobación. No válido para reclamos judiciales.
</div>
`}

<!-- Footer (solo horarios, los datos de la empresa ya están en el header) -->
<div class="footer">
  Lunes a Viernes de 9 a 18 hs.
</div>

<!-- Botones -->
<div class="no-print">
  <button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button class="gray" onclick="window.close()">Cerrar</button>
</div>
</body>
</html>`;
}
