export function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => m==='&'?'&amp;':m==='<'?'&lt;':'&gt;'); }
export function formatNumber(num) { return num?.toLocaleString('es-AR') || '0'; }
export function calcularDiasRestantes(fecha) { if(!fecha) return null; const diff = Math.ceil((new Date(fecha) - new Date())/(1000*60*60*24)); return diff; }
export function getEstadoVencimiento(fecha) { const dias = calcularDiasRestantes(fecha); if(dias===null) return {texto:"Sin fecha",color:"text-gray-600 bg-gray-50",icono:"❓"}; if(dias<0) return {texto:`VENCIDO (hace ${Math.abs(dias)} días)`,color:"text-red-600 bg-red-50",icono:"⚠️"}; if(dias<=3) return {texto:`Vence en ${dias} días`,color:"text-orange-600 bg-orange-50",icono:"🔔"}; if(dias<=7) return {texto:`Vence en ${dias} días`,color:"text-yellow-600 bg-yellow-50",icono:"⏰"}; return {texto:`Vence en ${dias} días`,color:"text-green-600 bg-green-50",icono:"✅"}; }
export function generarId() { return Date.now(); }
