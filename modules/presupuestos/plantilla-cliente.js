// ==================== modules/presupuestos/plantilla-cliente.js ====================
// PLANTILLA CLIENTE - Vista previa simple con logo y X
// ERP Contable Argentina - v7.15.5
// Cambio v7.15.5: mismo criterio que plantilla-completa (IVA por línea, suma acumulada).
//                 Visualmente no cambia: solo el TOTAL final queda consistente.

import { getDB } from '../db.js';
import { formatNumber, escapeHtml, formatDate } from '../utils.js';
import { getDatosEmpresa, limpiarNombreEmpresa } from './helpers.js';

// 🔥 Helper: redondeo al entero (0.5 → arriba, 0.4 → abajo)
function redondearEntero(n) {
    return Math.round(n);
}

const ALICUOTA_IVA = 21;

export function generarHTMLPresupuestoCliente(p) {
    const db = getDB();
    const empresa = getDatosEmpresa();
    const cliente = db.clientes.find(c => c.id === p.clienteId) || { nombre: p.cliente, cuit: '' };
    const logoHTML = empresa.logoUrl 
        ? `<img src="${empresa.logoUrl}" alt="Logo" style="max-height:60px;max-width:120px;object-fit:contain;">`
        : `<div style="font-size:28px;font-weight:bold;color:#0a2a4a;white-space:nowrap;">SOLUM <span style="color:#c0392b;">360</span></div>`;

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
        // 🔥 v7.15.5: convertir a NETO para acumular
        const precioUnitNeto = redondearEntero(precioUnitConIVA / (1 + ALICUOTA_IVA / 100));
        const subtotalNeto = precioUnitNeto * cant;
        const ivaLinea = redondearEntero(subtotalNeto * (ALICUOTA_IVA / 100));

        acumuladoNeto += subtotalNeto;
        acumuladoIVA += ivaLinea;

        let accion = 'Repuesto';
        if (item.esPropio) { accion = 'Servicio propio'; totalPropios += subtotalNeto; }
        else if (item.tipo === 'mano_obra') { accion = 'Mano de obra'; totalManoObra += subtotalNeto; }
        else if (item.tipo === 'servicio') { accion = 'Mecánica y electricidad'; totalMecanica += subtotalNeto; }
        else if (item.tipo === 'producto') { accion = 'Repuesto'; totalRepuestos += subtotalNeto; }
        else { accion = 'Otros'; totalOtros += subtotalNeto; }
        itemsFilas.push({ cantidad: cant, accion: accion, descripcion: item.desc || '' });
    });
    // 🔥 v7.15.5: total = acumuladoNeto + acumuladoIVA (consistente con plantilla-completa)
    const totalFinal = acumuladoNeto + acumuladoIVA;

    const itemsHTML = itemsFilas.map(f => `<tr><td style="text-align:center;">${f.cantidad}</td><td>${escapeHtml(f.accion)}</td><td>${escapeHtml(f.descripcion)}</td></tr>`).join('');
    const observaciones = p.comentarios ? p.comentarios.split('\n').filter(x => x.trim()) : [];
    const fechaPresupuesto = p.fechaCreacion ? formatDate(p.fechaCreacion) : formatDate(new Date());

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Presupuesto ${p.numero}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; max-width: 800px; margin: 20px auto; padding: 20px; }
  .header { display: flex; align-items: center; border-bottom: 3px solid #0a2a4a; padding-bottom: 12px; margin-bottom: 15px; }
  .header-left { flex: 0 0 auto; display: flex; align-items: center; }
  .header-center { flex: 1; text-align: center; }
  .header-right { flex: 0 0 auto; text-align: right; }
  .logo img { max-height: 60px; max-width: 120px; object-fit: contain; }
  .logo-text { font-size: 28px; font-weight: bold; color: #0a2a4a; white-space: nowrap; }
  .logo-text span { color: #c0392b; }
  .marca-x { font-size: 55px; font-weight: bold; color: #000000; line-height: 1; }
  .empresa { font-size: 11px; line-height: 1.5; }
  .titulo { text-align: center; font-size: 16px; font-weight: bold; margin: 15px 0; color: #0a2a4a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #0a2a4a; color: white; font-size: 11px; }
  .datos { margin-bottom: 15px; }
  .datos td { border: none; padding: 3px 0; }
  .totales { width: 320px; margin-left: auto; }
  .totales td { border: none; padding: 4px 8px; }
  .totales .total { font-weight: bold; font-size: 14px; border-top: 2px solid #0a2a4a; padding-top: 8px; }
  .footer { margin-top: 30px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; text-align: center; }
  .obs { font-size: 11px; color: #555; margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; }
  .no-print { margin-top: 30px; text-align: center; }
  .no-print button { padding: 12px 30px; background: #1e3a8a; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin: 0 5px; }
  .no-print button.gray { background: #6b7280; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-left"><div class="logo">${logoHTML}</div></div>
  <div class="header-center"><div class="marca-x">X</div></div>
  <div class="header-right"><div class="empresa">
      CUIT: ${escapeHtml(empresa.cuit || '')}<br>
      ${escapeHtml(empresa.direccion || '')}<br>
      <strong>Solo mensajes WhatsApp:</strong> ${escapeHtml(empresa.telefono || '')} – Mail: ${escapeHtml(empresa.email || '')}
  </div></div>
</div>
<div class="titulo">PRESUPUESTO DE SERVICIO</div>
<table class="datos">
  <tr><td style="width: 100px;"><strong>Fecha:</strong></td><td>${fechaPresupuesto}</td><td style="width: 130px;"><strong>Presupuesto N°:</strong></td><td>${escapeHtml(p.numero)}</td></tr>
  <tr><td><strong>Cliente:</strong></td><td>${escapeHtml(cliente.nombre || p.cliente)}</td><td><strong>CUIT:</strong></td><td>${escapeHtml(cliente.cuit || '-')}</td></tr>
  <tr><td><strong>Vehículo:</strong></td><td>${escapeHtml(p.vehiculoMarca || '-')}</td><td><strong>Patente:</strong></td><td>${escapeHtml(p.patente || '-')}</td></tr>
  <tr><td><strong>Km:</strong></td><td>${escapeHtml(p.vehiculoKm || '-')}</td><td><strong>Año:</strong></td><td>${escapeHtml(p.vehiculoAnio || '-')}</td></tr>
</table>
<table>
  <thead><tr><th style="width: 80px; text-align: center;">Cantidad</th><th style="width: 180px;">Acción</th><th>Descripción</th></tr></thead>
  <tbody>${itemsHTML || '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px;">Sin ítems cargados</td></tr>'}</tbody>
</table>
<table class="totales">
  ${totalRepuestos > 0 ? `<tr><td>Repuestos</td><td style="text-align:right;">$ ${formatNumber(totalRepuestos)}</td></tr>` : ''}
  ${totalManoObra > 0 ? `<tr><td>Mano de obra</td><td style="text-align:right;">$ ${formatNumber(totalManoObra)}</td></tr>` : ''}
  ${totalMecanica > 0 ? `<tr><td>Mecánica y electricidad</td><td style="text-align:right;">$ ${formatNumber(totalMecanica)}</td></tr>` : ''}
  ${totalPropios > 0 ? `<tr><td>Servicios propios/terceros</td><td style="text-align:right;">$ ${formatNumber(totalPropios)}</td></tr>` : ''}
  ${totalOtros > 0 ? `<tr><td>Otros</td><td style="text-align:right;">$ ${formatNumber(totalOtros)}</td></tr>` : ''}
  <tr><td>Descuento</td><td style="text-align:right;">$ 0</td></tr>
  <tr class="total"><td>TOTAL</td><td style="text-align:right;">$ ${formatNumber(totalFinal)}</td></tr>
</table>
${observaciones.length > 0 ? `<div class="obs"><strong>Observaciones:</strong><br>${observaciones.map(o => `- ${escapeHtml(o)}`).join('<br>')}</div>` : ''}
<div class="footer">${escapeHtml(limpiarNombreEmpresa(empresa.nombre))} – ${escapeHtml(empresa.direccion || '')} – ${escapeHtml(empresa.telefono || '')} – ${escapeHtml(empresa.email || '')}</div>
<div class="no-print"><button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button><button class="gray" onclick="window.close()">Cerrar</button></div>
</body>
</html>`;
}
