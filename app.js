import { cargarDB, initContabilidad } from './modules/contador.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderCostosFijos, initCostosFijosEvents } from './modules/costosFijos.js';
import { renderProveedores, initProveedoresEvents } from './modules/proveedores.js';
import { renderClientes, initClientesEvents } from './modules/clientes.js';
import { renderPresupuestos, initPresupuestosEvents } from './modules/presupuestos.js';
import { renderContador, mostrarFormularioCompra, mostrarFormularioVenta, mostrarListaAsientos, actualizarResumenIVA } from './modules/contador.js';
let currentView = 'dashboard';
async function renderView() { const root = document.getElementById('root'); let html = ''; if(currentView==='dashboard') html=renderDashboard(); else if(currentView==='costos') html=renderCostosFijos(); else if(currentView==='proveedores') html=renderProveedores(); else if(currentView==='clientes') html=renderClientes(); else if(currentView==='presupuestos') html=renderPresupuestos(); else if(currentView==='contador') html=renderContador(); else html=renderDashboard(); if(root) root.innerHTML=html; if(currentView==='costos') initCostosFijosEvents(); if(currentView==='proveedores') initProveedoresEvents(); if(currentView==='clientes') initClientesEvents(); if(currentView==='presupuestos') initPresupuestosEvents(); if(currentView==='contador'){ document.getElementById('btnCompra')?.addEventListener('click',()=>mostrarFormularioCompra()); document.getElementById('btnVenta')?.addEventListener('click',()=>mostrarFormularioVenta()); document.getElementById('btnAsientos')?.addEventListener('click',()=>mostrarListaAsientos()); } }
function initNavigation(){ const views=[{id:'navDashboard',view:'dashboard'},{id:'navCostosFijos',view:'costos'},{id:'navProveedores',view:'proveedores'},{id:'navClientes',view:'clientes'},{id:'navPresupuestos',view:'presupuestos'},{id:'navContador',view:'contador'}]; views.forEach(v=>{ const btn=document.getElementById(v.id); if(btn) btn.addEventListener('click',()=>{ currentView=v.view; renderView(); }); }); }
window.addEventListener('refreshView',()=>{ actualizarResumenIVA(); renderView(); });
initContabilidad(); cargarDB(); initNavigation(); renderView();
