import * as store from './store.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre'];
const TIPOS_POSICION = ['CEDEAR', 'CEDEAR ETF', 'Acción', 'Cripto', 'Liquidez', 'Otro'];
const COLOR_TIPO = {
  CEDEAR: 'var(--c1)', 'CEDEAR ETF': 'var(--c2)', 'Acción': 'var(--c3)',
  Cripto: 'var(--c4)', Liquidez: 'var(--c5)', Otro: 'var(--c6)',
};
const CLAVE_DOLAR = 'bolsillo:dolar';

const $vista = document.getElementById('vista');
const $tabbar = document.getElementById('tabbar');
const $hoja = document.getElementById('hoja');
const $toast = document.getElementById('toast');

const ui = { mes: hoyISO().slice(0, 7), filtro: 'todo', modoLogin: 'entrar', dolar: leerDolarGuardado() };
// En el demo, a principio de mes se arranca mostrando el mes anterior, que está completo.
if (store.modoDemo && new Date().getDate() < 10) ui.mes = moverMes(ui.mes, -1);
let datos = null;
let ultimoTipo = 'gasto';

/* ---------- utilidades ---------- */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function moverMes(mes, delta) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nombreMes(mes, corto = false) {
  const [a, m] = mes.split('-').map(Number);
  return corto ? MESES[m - 1].slice(0, 3) : `${MESES[m - 1]} ${a}`;
}

function nombreDia(fecha) {
  const hoy = hoyISO();
  const ayer = new Date(`${hoy}T12:00`);
  ayer.setDate(ayer.getDate() - 1);
  if (fecha === hoy) return 'Hoy';
  if (fecha === ayer.toISOString().slice(0, 10)) return 'Ayer';
  return new Date(`${fecha}T12:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const formatos = {};
function plata(n, moneda = 'ARS', { signo = false, decimales } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  const max = decimales ?? (moneda === 'USD' ? 2 : Math.abs(n) >= 1000 ? 0 : 2);
  const min = moneda === 'USD' ? Math.min(2, max) : 0;
  const clave = `${moneda}-${min}-${max}`;
  formatos[clave] ||= new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: moneda, minimumFractionDigits: min, maximumFractionDigits: max,
  });
  const prefijo = n < 0 ? '−' : signo && n > 0 ? '+' : '';
  return prefijo + formatos[clave].format(Math.abs(n));
}

function numero(n) {
  return Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 8 }) : '';
}

function porcentaje(x, signo = true) {
  if (!Number.isFinite(x)) return '';
  const texto = Math.abs(x * 100).toFixed(1).replace('.', ',');
  return `${x < 0 ? '−' : signo && x > 0 ? '+' : ''}${texto}%`;
}

// Acepta "1.500", "1500,50", "1.234.567,8" o "0.005": la coma es decimal y el punto,
// separador de miles solo cuando agrupa de a tres cifras.
function leerNumero(texto) {
  let t = String(texto ?? '').trim().replace(/[\s$]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// Para inputs editables: sin separador de miles, para que leerNumero lo lea igual al volver.
const paraInput = n => (Number.isFinite(n) ? String(n).replace('.', ',') : '');
const redondear = n => Math.round(n * 100) / 100;

function toast(texto) {
  $toast.textContent = texto;
  $toast.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $toast.classList.remove('visible'), 2600);
}

const esStandalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;

/* ---------- dólar MEP ---------- */

function leerDolarGuardado() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DOLAR));
  } catch {
    return null;
  }
}

async function actualizarDolar() {
  if (ui.dolar && Date.now() - ui.dolar.leido < 60 * 60 * 1000) return;
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/bolsa');
    const j = await r.json();
    if (!(j.venta > 0)) return;
    ui.dolar = { venta: j.venta, fecha: j.fechaActualizacion, leido: Date.now() };
    try {
      localStorage.setItem(CLAVE_DOLAR, JSON.stringify(ui.dolar));
    } catch { /* sin almacenamiento: se vuelve a pedir la próxima vez */ }
    render();
  } catch { /* sin conexión: se usa el último guardado */ }
}

// Un movimiento en dólares usa el cambio que se cargó con él (el que tomó la tarjeta o el banco);
// si no tiene, el MEP del día.
function enPesos(monto, moneda, cambio) {
  if (moneda !== 'USD') return monto;
  if (cambio > 0) return monto * cambio;
  return ui.dolar ? monto * ui.dolar.venta : null;
}

/* ---------- cálculos ---------- */

function resumenMes(mes) {
  const movs = datos.movimientos.filter(m => m.fecha?.startsWith(mes));
  const r = { movs, ingresos: 0, gastos: 0, porCat: { ingreso: {}, gasto: {} }, usd: { ingreso: 0, gasto: 0 }, sinConvertir: 0 };
  for (const m of movs) {
    if (m.moneda === 'USD') r.usd[m.tipo] += m.monto;
    const v = enPesos(m.monto, m.moneda, m.cambio);
    if (v == null) {
      r.sinConvertir++;
      continue;
    }
    if (m.tipo === 'ingreso') r.ingresos += v;
    else r.gastos += v;
    const cat = m.categoria || 'Otros';
    r.porCat[m.tipo][cat] = (r.porCat[m.tipo][cat] || 0) + v;
  }
  r.balance = r.ingresos - r.gastos;
  return r;
}

// Lo que sobró (o faltó) de todos los meses anteriores a `mes`, más el saldo inicial de Ajustes.
function arrastreHasta(mes) {
  const inicio = `${mes}-01`;
  let total = Number(datos.ajustes.saldoInicial) || 0;
  for (const m of datos.movimientos) {
    if (!m.fecha || m.fecha >= inicio) continue;
    const v = enPesos(m.monto, m.moneda, m.cambio);
    if (v != null) total += m.tipo === 'ingreso' ? v : -v;
  }
  return total;
}

function valorPosicion(p) {
  if (Number.isFinite(p.cantidad) && Number.isFinite(p.precioActual)) return p.cantidad * p.precioActual;
  return Number.isFinite(p.valorManual) ? p.valorManual : 0;
}

function costoPosicion(p) {
  return Number.isFinite(p.cantidad) && Number.isFinite(p.precioCompra) ? p.cantidad * p.precioCompra : null;
}

function resumenCartera() {
  const filas = datos.posiciones.map(p => {
    const valor = enPesos(valorPosicion(p), p.moneda);
    const costoOriginal = costoPosicion(p);
    const costo = costoOriginal == null ? null : enPesos(costoOriginal, p.moneda);
    return { ...p, valor, costo, resultado: costo == null || valor == null ? null : valor - costo };
  });
  const total = filas.reduce((s, f) => s + (f.valor || 0), 0);
  const conCosto = filas.filter(f => f.resultado != null && f.tipo !== 'Liquidez');
  const resultado = conCosto.reduce((s, f) => s + f.resultado, 0);
  const costo = conCosto.reduce((s, f) => s + f.costo, 0);
  const sinCosto = filas.filter(f => f.resultado == null && f.tipo !== 'Liquidez').length;
  const porTipo = {};
  for (const f of filas) porTipo[f.tipo || 'Otro'] = (porTipo[f.tipo || 'Otro'] || 0) + (f.valor || 0);
  const fechas = filas.map(f => f.precioFecha).filter(Boolean).sort();
  return { filas, total, resultado, costo, sinCosto, porTipo, ultimaFecha: fechas.at(-1) };
}

/* ---------- piezas de interfaz ---------- */

function selectorMes() {
  const esActual = ui.mes >= hoyISO().slice(0, 7);
  return `<div class="mes">
    <button type="button" data-accion="mes" data-delta="-1" aria-label="Mes anterior">‹</button>
    <span>${nombreMes(ui.mes)}</span>
    <button type="button" data-accion="mes" data-delta="1" aria-label="Mes siguiente" ${esActual ? 'disabled' : ''}>›</button>
  </div>`;
}

const cabecera = (titulo, extra = '') => `<header class="cab"><h1>${titulo}</h1>${extra}</header>`;

function barras(titulo, mapa, total, clase) {
  const items = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (!items.length) return '';
  return `<section class="tarjeta">
    <h2>${titulo}</h2>
    <ul class="barras">
      ${items.map(([nombre, v]) => `<li>
        <span>${esc(nombre)}</span>
        <span class="num">${plata(v)} <small>${Math.round((v / total) * 100)}%</small></span>
        <div class="barra"><i class="${clase}" style="width:${Math.max(2, (v / items[0][1]) * 100)}%"></i></div>
      </li>`).join('')}
    </ul>
  </section>`;
}

function tendencia() {
  const meses = Array.from({ length: 6 }, (_, i) => moverMes(ui.mes, i - 5));
  const valores = meses.map(m => resumenMes(m));
  const max = Math.max(1, ...valores.flatMap(v => [v.ingresos, v.gastos]));
  if (valores.every(v => !v.movs.length)) return '';
  return `<section class="tarjeta">
    <h2>Últimos 6 meses</h2>
    <div class="tendencia">
      ${valores.map((v, i) => `<button type="button" class="col ${meses[i] === ui.mes ? 'actual' : ''}" data-accion="ir-mes" data-mes="${meses[i]}" aria-label="${nombreMes(meses[i])}: entró ${plata(v.ingresos)}, salió ${plata(v.gastos)}">
        <span class="pares">
          <i class="ing" style="height:${(v.ingresos / max) * 100}%"></i>
          <i class="gas" style="height:${(v.gastos / max) * 100}%"></i>
        </span>
        <small>${nombreMes(meses[i], true)}</small>
      </button>`).join('')}
    </div>
    <p class="leyenda"><span><i class="punto ing"></i>Ingresos</span><span><i class="punto gas"></i>Gastos</span></p>
  </section>`;
}

function filaMovimiento(m) {
  const signo = m.tipo === 'ingreso' ? '+' : '−';
  const detalle = [m.nota, m.tipo === 'gasto' ? m.medio : ''].filter(Boolean).join(' · ');
  const enArs = m.moneda === 'USD' ? enPesos(m.monto, m.moneda, m.cambio) : null;
  const conversion = m.moneda === 'USD'
    ? `<small title="${m.cambio > 0 ? `Cambio: ${plata(m.cambio)}` : 'Al dólar MEP'}">${enArs == null ? 'sin cotización' : `${plata(enArs)}${m.cambio > 0 ? '' : ' (MEP)'}`}</small>`
    : '';
  return `<button type="button" class="mov" data-accion="editar-mov" data-id="${esc(m.id)}">
    <span class="mov-icono ${m.tipo}">${esc((m.categoria || '?').slice(0, 1))}</span>
    <span class="mov-texto"><strong>${esc(m.categoria || 'Sin categoría')}</strong>${detalle ? `<small>${esc(detalle)}</small>` : ''}</span>
    <span class="mov-monto ${m.tipo}">${signo}${plata(m.monto, m.moneda)}${conversion}</span>
  </button>`;
}

const ordenarMovs = movs => [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));

function vacio(texto, boton = '') {
  return `<section class="vacio"><p>${texto}</p>${boton}</section>`;
}

/* ---------- vistas ---------- */

function renderInicio() {
  const r = resumenMes(ui.mes);
  const arrastre = arrastreHasta(ui.mes);
  const disponible = arrastre + r.balance;
  const ahorro = r.ingresos > 0 ? r.balance / r.ingresos : null;
  const sub = ahorro == null
    ? (r.gastos > 0 ? 'Todavía no cargaste ingresos este mes'
      : arrastre ? 'Todavía no hay movimientos este mes' : 'Empezá cargando un ingreso o un gasto')
    : ahorro >= 0 ? `Guardaste el ${Math.round(ahorro * 100)}% de lo que entró` : `Gastaste ${Math.round(-ahorro * 100)}% más de lo que entró`;
  const notaUsd = r.usd.ingreso || r.usd.gasto
    ? `<p class="nota">Incluye ${[r.usd.ingreso && `+${plata(r.usd.ingreso, 'USD')}`, r.usd.gasto && `−${plata(r.usd.gasto, 'USD')}`].filter(Boolean).join(' y ')}
       pasados a pesos con el cambio de cada movimiento${ui.dolar ? ` (o al MEP de ${plata(ui.dolar.venta)} si no tiene)` : ''}.
       ${r.sinConvertir ? `${r.sinConvertir} sin cambio cargado no suman hasta tener cotización.` : ''}</p>`
    : '';
  const c = resumenCartera();
  const ultimos = ordenarMovs(r.movs).slice(0, 5);

  const email = datos.usuario?.email;
  const perfil = email
    ? `<a class="avatar" href="#ajustes" aria-label="Tu cuenta (${esc(email)})">${esc(email[0].toUpperCase())}</a>`
    : '';

  return `${cabecera('Resumen', `<div class="cab-der">${selectorMes()}${perfil}</div>`)}
    <section class="tarjeta hero">
      <p class="etiqueta">${arrastre ? 'Tenés disponible' : 'Te queda este mes'}</p>
      <p class="monto-grande ${disponible < 0 ? 'neg' : ''}">${plata(disponible)}</p>
      ${arrastre ? `<p class="arrastre">
        <span>${arrastre >= 0 ? 'Venías con' : 'Venías debiendo'} <strong>${plata(Math.abs(arrastre))}</strong> de ${nombreMes(moverMes(ui.mes, -1)).split(' ')[0]}</span>
        <span>Este mes <strong class="${r.balance < 0 ? 'gas' : 'ing'}">${plata(r.balance, 'ARS', { signo: true })}</strong></span>
      </p>` : ''}
      <p class="sub">${sub}</p>
      <div class="duo">
        <div><p class="etiqueta"><i class="punto ing"></i>Entró</p><p class="monto-medio">${plata(r.ingresos)}</p></div>
        <div><p class="etiqueta"><i class="punto gas"></i>Salió</p><p class="monto-medio">${plata(r.gastos)}</p></div>
      </div>
      ${notaUsd}
    </section>
    ${r.movs.length ? '' : vacio('No hay movimientos en este mes.', '<button type="button" class="btn btn-primario" data-accion="nuevo-mov">Cargar el primero</button>')}
    ${barras('En qué se fue', r.porCat.gasto, r.gastos, 'gas')}
    ${barras('De dónde vino', r.porCat.ingreso, r.ingresos, 'ing')}
    ${tendencia()}
    ${c.filas.length ? `<a class="tarjeta enlace-cartera" href="#cartera">
      <span><span class="etiqueta">Cartera de inversiones</span><span class="monto-medio">${plata(c.total)}</span></span>
      ${c.costo ? `<span class="pill ${c.resultado >= 0 ? 'ing' : 'gas'}">${porcentaje(c.resultado / c.costo)}</span>` : ''}
    </a>` : ''}
    ${ultimos.length ? `<section class="tarjeta">
      <h2>Últimos movimientos</h2>
      <div class="lista">${ultimos.map(filaMovimiento).join('')}</div>
      <a class="ver-todo" href="#movimientos">Ver todos</a>
    </section>` : ''}`;
}

function renderMovimientos() {
  const r = resumenMes(ui.mes);
  const movs = ordenarMovs(r.movs.filter(m => ui.filtro === 'todo' || m.tipo === ui.filtro));
  const dias = new Map();
  for (const m of movs) {
    if (!dias.has(m.fecha)) dias.set(m.fecha, []);
    dias.get(m.fecha).push(m);
  }
  const filtro = (valor, texto) =>
    `<button type="button" data-accion="filtro" data-valor="${valor}" aria-pressed="${ui.filtro === valor}">${texto}</button>`;

  return `${cabecera('Movimientos', selectorMes())}
    <div class="filtros">${filtro('todo', 'Todo')}${filtro('ingreso', 'Ingresos')}${filtro('gasto', 'Gastos')}</div>
    ${movs.length ? [...dias].map(([fecha, lista]) => {
      const neto = lista.reduce((s, m) => s + (enPesos(m.monto, m.moneda, m.cambio) || 0) * (m.tipo === 'ingreso' ? 1 : -1), 0);
      return `<section class="dia">
        <h3><span>${nombreDia(fecha)}</span><span class="num">${plata(neto, 'ARS', { signo: true })}</span></h3>
        <div class="lista">${lista.map(filaMovimiento).join('')}</div>
      </section>`;
    }).join('') : vacio(ui.filtro === 'todo' ? 'Nada cargado en este mes.' : `No hay ${ui.filtro === 'ingreso' ? 'ingresos' : 'gastos'} en este mes.`)}`;
}

function renderCartera() {
  const c = resumenCartera();
  const chipDolar = ui.dolar ? `<span class="chip-dolar" title="Dólar MEP, venta">MEP ${plata(ui.dolar.venta)}</span>` : '';
  if (!c.filas.length) {
    return `${cabecera('Cartera', chipDolar)}
      ${vacio('Todavía no cargaste posiciones. Podés agregarlas una por una o importar el archivo <code>cartera.json</code> desde Ajustes.',
        '<button type="button" class="btn btn-primario" data-accion="nueva-pos">Agregar posición</button>')}`;
  }
  const sincronizada = c.filas.some(f => f.origen === 'boveda');
  const tipos = Object.entries(c.porTipo).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const grupos = TIPOS_POSICION.concat(Object.keys(c.porTipo).filter(t => !TIPOS_POSICION.includes(t)))
    .map(tipo => [tipo, c.filas.filter(f => (f.tipo || 'Otro') === tipo).sort((a, b) => (b.valor || 0) - (a.valor || 0))])
    .filter(([, filas]) => filas.length);

  return `${cabecera('Cartera', chipDolar)}
    <section class="tarjeta hero">
      <p class="etiqueta">Valor total</p>
      <p class="monto-grande">${plata(c.total)}</p>
      ${ui.dolar ? `<p class="sub">≈ ${plata(c.total / ui.dolar.venta, 'USD', { decimales: 0 })} al MEP</p>` : ''}
      ${c.costo ? `<div class="duo">
        <div><p class="etiqueta">Resultado</p><p class="monto-medio ${c.resultado >= 0 ? 'ing' : 'gas'}">${plata(c.resultado, 'ARS', { signo: true })}</p></div>
        <div><p class="etiqueta">Rendimiento</p><p class="monto-medio ${c.resultado >= 0 ? 'ing' : 'gas'}">${porcentaje(c.resultado / c.costo)}</p></div>
      </div>` : ''}
      ${c.sinCosto ? `<p class="nota">${c.sinCosto} ${c.sinCosto === 1 ? 'posición no tiene' : 'posiciones no tienen'} precio de compra y no entran en el resultado.</p>` : ''}
    </section>
    <section class="tarjeta">
      <h2>Cómo está repartida</h2>
      <div class="distribucion">${tipos.map(([t, v]) => `<i style="flex:${v};background:${COLOR_TIPO[t] || 'var(--c6)'}"></i>`).join('')}</div>
      <ul class="leyenda-tipos">${tipos.map(([t, v]) => `<li><i class="punto" style="background:${COLOR_TIPO[t] || 'var(--c6)'}"></i>${esc(t)}<span class="num">${Math.round((v / c.total) * 100)}%</span></li>`).join('')}</ul>
    </section>
    ${grupos.map(([tipo, filas]) => `<section class="tarjeta">
      <h2 class="h2-total"><span>${esc(tipo)}</span><span class="num">${plata(c.porTipo[tipo])}</span></h2>
      <div class="lista">${filas.map(f => {
        const rend = f.resultado != null && f.costo ? f.resultado / f.costo : null;
        const detalle = Number.isFinite(f.cantidad) && Number.isFinite(f.precioActual)
          ? `${numero(f.cantidad)} × ${plata(f.precioActual, f.moneda)}`
          : (f.valorManual != null ? 'valor cargado a mano' : 'sin datos');
        return `<button type="button" class="pos" data-accion="editar-pos" data-id="${esc(f.id)}">
          <span class="mov-texto"><strong>${esc(f.ticker)}</strong><small>${esc(f.tipo === 'Liquidez' ? 'Disponible' : f.nombre || '')} · ${detalle}</small></span>
          <span class="pos-valor"><span class="num">${plata(f.valor)}</span>${rend != null && f.tipo !== 'Liquidez' ? `<small class="${rend >= 0 ? 'ing' : 'gas'}">${porcentaje(rend)}</small>` : ''}</span>
        </button>`;
      }).join('')}</div>
    </section>`).join('')}
    ${sincronizada ? '' : '<button type="button" class="btn btn-bloque" data-accion="nueva-pos">Agregar posición</button>'}
    ${c.ultimaFecha ? `<p class="nota centro">Precios actualizados al ${new Date(`${c.ultimaFecha}T12:00`).toLocaleDateString('es-AR')}.
      ${sincronizada ? 'La cartera se sincroniza sola desde tu bóveda de Obsidian.' : 'Tocá una posición para cambiar su precio.'}</p>` : ''}`;
}

function listaEditable(titulo, clave) {
  const lista = datos.ajustes[clave] || [];
  return `<section class="tarjeta">
    <h2>${titulo}</h2>
    <div class="chips-edit">${lista.map(v => `<span class="chip-edit">${esc(v)}<button type="button" data-accion="quitar" data-lista="${clave}" data-valor="${esc(v)}" aria-label="Quitar ${esc(v)}">×</button></span>`).join('')}</div>
    <form class="agregar" data-form="lista" data-lista="${clave}">
      <input name="valor" maxlength="30" placeholder="Agregar…" autocomplete="off" aria-label="Agregar a ${titulo}">
      <button class="btn">Agregar</button>
    </form>
  </section>`;
}

function renderAjustes() {
  const u = datos.usuario;
  return `${cabecera('Ajustes')}
    <section class="tarjeta">
      <h2>Cuenta</h2>
      ${u.demo
        ? `<p class="aviso">Modo demo: son datos de ejemplo, guardados aparte de los tuyos. Podés tocar y borrar lo que quieras.</p>`
        : u.local
        ? `<p class="aviso">Modo local: los datos están solo en este dispositivo. Cuando conectes Firebase se guardan en la nube.</p>`
        : `<p>Entraste como <strong>${esc(u.email)}</strong>. Tus datos se guardan en la nube y se sincronizan entre dispositivos.</p>
           <button type="button" class="btn" data-accion="salir">Cerrar sesión</button>`}
    </section>
    <section class="tarjeta">
      <h2>Saldo inicial</h2>
      <p class="nota">La plata que tenías antes de empezar a cargar movimientos. Se suma a lo disponible de todos los meses.</p>
      <form class="agregar" data-form="saldo">
        <input name="saldo" inputmode="decimal" autocomplete="off" placeholder="0" value="${paraInput(datos.ajustes.saldoInicial || null)}" aria-label="Saldo inicial en pesos">
        <button class="btn">Guardar</button>
      </form>
    </section>
    ${listaEditable('Categorías de gastos', 'categoriasGasto')}
    ${listaEditable('Fuentes de ingreso', 'fuentesIngreso')}
    ${listaEditable('Medios de pago', 'medios')}
    <section class="tarjeta">
      <h2>Respaldo</h2>
      <p class="nota">Descargá todo en un archivo, o importá un respaldo o el <code>cartera.json</code> de la bóveda (actualiza las posiciones por ticker, no duplica).</p>
      <div class="botones">
        <button type="button" class="btn" data-accion="exportar">Descargar respaldo</button>
        <button type="button" class="btn" data-accion="importar">Importar archivo</button>
      </div>
      <input type="file" id="archivo" accept="application/json,.json" hidden>
    </section>
    ${esStandalone() ? '' : `<section class="tarjeta">
      <h2>Instalarla en el iPhone</h2>
      <p class="nota">En Safari tocá <strong>Compartir</strong> → <strong>Agregar a inicio</strong>. Queda con su ícono y se abre a pantalla completa.</p>
    </section>`}
    <p class="nota centro">Bolsillo · ${datos.movimientos.length} movimientos · ${datos.posiciones.length} posiciones</p>`;
}

function renderLogin() {
  const crear = ui.modoLogin === 'crear';
  return `<section class="login">
    <div class="marca">
      <img src="icons/icon-192.png" alt="" width="72" height="72">
      <h1>Bolsillo</h1>
      <p>Tus ingresos, gastos e inversiones en un solo lugar.</p>
    </div>
    <form class="tarjeta" data-form="login">
      <label class="campo">Email<input type="email" name="email" autocomplete="email" required></label>
      <label class="campo">Contraseña<input type="password" name="clave" minlength="8" autocomplete="${crear ? 'new-password' : 'current-password'}" required></label>
      <p class="error" id="error-login" hidden></p>
      <button class="btn btn-primario btn-bloque">${crear ? 'Crear cuenta' : 'Entrar'}</button>
      <button type="button" class="btn-texto" data-accion="modo-login">${crear ? 'Ya tengo cuenta' : 'Es la primera vez: crear cuenta'}</button>
      ${crear ? '' : '<button type="button" class="btn-texto" data-accion="recuperar">Me olvidé la contraseña</button>'}
    </form>
  </section>`;
}

const VISTAS = { inicio: renderInicio, movimientos: renderMovimientos, cartera: renderCartera, ajustes: renderAjustes };

function render() {
  if (!datos?.listo) return;
  if (datos.error) {
    $tabbar.hidden = true;
    $vista.innerHTML = vacio(esc(datos.error));
    return;
  }
  if (store.modoNube && !datos.usuario) {
    $tabbar.hidden = true;
    $vista.innerHTML = renderLogin();
    return;
  }
  const vista = VISTAS[location.hash.slice(1)] ? location.hash.slice(1) : 'inicio';
  $tabbar.hidden = false;
  const banner = store.modoDemo
    ? `<div class="banner-demo"><span><strong>Modo demo</strong> · datos de ejemplo</span>
        <button type="button" data-accion="reiniciar-demo">Reiniciar</button><a href="./">Salir</a></div>`
    : '';
  $vista.innerHTML = banner + VISTAS[vista]();
  $tabbar.querySelectorAll('a').forEach(a => {
    if (a.dataset.tab === vista) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ---------- hojas (formularios) ---------- */

function abrirHoja(html, foco) {
  $hoja.innerHTML = `<div class="hoja-cuerpo">${html}</div>`;
  $hoja.showModal();
  if (foco) $hoja.querySelector(foco)?.focus();
}

function chipsCategorias(tipo, elegida) {
  const lista = [...(tipo === 'gasto' ? datos.ajustes.categoriasGasto : datos.ajustes.fuentesIngreso)];
  if (elegida && !lista.includes(elegida)) lista.push(elegida);
  return lista.map(c => `<label class="chip"><input type="radio" name="categoria" value="${esc(c)}" ${c === elegida ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')
    + '<button type="button" class="chip-nueva" data-accion="nueva-cat">+ Nueva</button>';
}

const claveLista = tipo => (tipo === 'gasto' ? 'categoriasGasto' : 'fuentesIngreso');

function abrirMovimiento(m) {
  const tipo = m?.tipo || ultimoTipo;
  const medios = datos.ajustes.medios || [];
  abrirHoja(`<form data-form="movimiento" data-id="${esc(m?.id || '')}" data-tipo="${tipo}" novalidate>
    <div class="hoja-cab">
      <button type="button" class="btn-texto" data-accion="cerrar">Cancelar</button>
      <h2>${m ? 'Editar' : 'Nuevo'} movimiento</h2>
      <button class="btn-texto fuerte">Guardar</button>
    </div>
    <div class="segmento">
      <label><input type="radio" name="tipo" value="gasto" ${tipo === 'gasto' ? 'checked' : ''}><span class="gas">Gasto</span></label>
      <label><input type="radio" name="tipo" value="ingreso" ${tipo === 'ingreso' ? 'checked' : ''}><span class="ing">Ingreso</span></label>
    </div>
    <div class="monto-input">
      <select name="moneda" aria-label="Moneda">
        <option value="ARS" ${m?.moneda !== 'USD' ? 'selected' : ''}>$</option>
        <option value="USD" ${m?.moneda === 'USD' ? 'selected' : ''}>US$</option>
      </select>
      <input name="monto" inputmode="decimal" autocomplete="off" placeholder="0" value="${paraInput(m?.monto)}" aria-label="Monto">
    </div>
    <div id="campo-cambio" ${m?.moneda === 'USD' ? '' : 'hidden'}>
      <div class="fila">
        <label class="campo">Cambio que te tomaron<input name="cambio" inputmode="decimal" autocomplete="off" placeholder="${ui.dolar ? paraInput(ui.dolar.venta) : ''}" value="${paraInput(m?.cambio)}"></label>
        <label class="campo">Total en pesos<input name="totalPesos" inputmode="decimal" autocomplete="off" value="${m?.cambio > 0 ? paraInput(redondear(m.monto * m.cambio)) : ''}"></label>
      </div>
      <p class="nota">Completá uno y el otro se calcula solo. Vacío, usa el MEP del día${ui.dolar ? ` (${plata(ui.dolar.venta)})` : ''}.</p>
    </div>
    <p class="campo-titulo" id="titulo-cat">${tipo === 'gasto' ? 'Categoría' : 'De dónde viene'}</p>
    <div class="chips" id="chips-cat" role="radiogroup" aria-labelledby="titulo-cat">${chipsCategorias(tipo, m?.categoria)}</div>
    <label class="campo" id="campo-cat-nueva" hidden>Nombre de la nueva<input name="categoriaNueva" maxlength="30" autocomplete="off" placeholder="${tipo === 'gasto' ? 'Por ejemplo: Mascota' : 'Por ejemplo: Venta de algo'}"></label>
    <div class="fila">
      <label class="campo">Fecha<input type="date" name="fecha" value="${m?.fecha || hoyISO()}" max="${hoyISO()}"></label>
      <label class="campo" id="campo-medio" ${tipo === 'gasto' ? '' : 'hidden'}>Medio
        <select name="medio"><option value="">—</option>${medios.map(x => `<option ${m?.medio === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </label>
    </div>
    <label class="campo">Nota<input name="nota" maxlength="120" placeholder="Opcional" value="${esc(m?.nota || '')}"></label>
    <p class="error" id="error-form" hidden></p>
    ${m ? '<button type="button" class="btn btn-peligro btn-bloque" data-accion="borrar-mov">Borrar movimiento</button>' : ''}
  </form>`, m ? null : '[name=monto]');
}

// Las posiciones que vienen de la bóveda se ven pero no se editan acá: la bóveda manda.
function verPosicionBoveda(p) {
  const fila = (etiqueta, valor) => `<div class="dato"><span>${etiqueta}</span><strong>${valor}</strong></div>`;
  const costo = costoPosicion(p);
  const valor = valorPosicion(p);
  abrirHoja(`<div class="hoja-cab">
      <span></span>
      <h2>${esc(p.ticker)}</h2>
      <button type="button" class="btn-texto fuerte" data-accion="cerrar">Listo</button>
    </div>
    <p class="sub">${esc(p.nombre || '')} · ${esc(p.tipo || '')}</p>
    <div class="datos">
      ${fila('Cantidad', Number.isFinite(p.cantidad) ? numero(p.cantidad) : '—')}
      ${fila('Precio de compra', plata(p.precioCompra, p.moneda))}
      ${fila('Precio actual', plata(p.precioActual, p.moneda))}
      ${fila('Valor', plata(valor, p.moneda))}
      ${costo ? fila('Resultado', `<span class="${valor >= costo ? 'ing' : 'gas'}">${plata(valor - costo, p.moneda, { signo: true })} · ${porcentaje((valor - costo) / costo)}</span>`) : ''}
      ${p.precioFecha ? fila('Precio al', new Date(`${p.precioFecha}T12:00`).toLocaleDateString('es-AR')) : ''}
    </div>
    <p class="aviso">Esta posición viene de tu bóveda de Obsidian. Para cambiarla, pedíselo a Claude o editá la nota: la app se actualiza sola.</p>`);
}

function abrirPosicion(p) {
  if (p?.origen === 'boveda') return verPosicionBoveda(p);
  const tipo = p?.tipo || 'CEDEAR';
  const campoNum = (nombre, etiqueta, valor, ayuda = '') =>
    `<label class="campo">${etiqueta}<input name="${nombre}" inputmode="decimal" autocomplete="off" value="${paraInput(valor)}">${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
  abrirHoja(`<form data-form="posicion" data-id="${esc(p?.id || '')}" novalidate>
    <div class="hoja-cab">
      <button type="button" class="btn-texto" data-accion="cerrar">Cancelar</button>
      <h2>${p ? esc(p.ticker) : 'Nueva posición'}</h2>
      <button class="btn-texto fuerte">Guardar</button>
    </div>
    <div class="fila">
      <label class="campo">Ticker<input name="ticker" maxlength="12" autocapitalize="characters" autocomplete="off" value="${esc(p?.ticker || '')}"></label>
      <label class="campo">Tipo<select name="tipo">${TIPOS_POSICION.map(t => `<option ${t === tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="fila">
      <label class="campo">Nombre<input name="nombre" maxlength="40" value="${esc(p?.nombre || '')}" placeholder="Apple"></label>
      <label class="campo">Moneda<select name="moneda">
        <option value="ARS" ${p?.moneda !== 'USD' ? 'selected' : ''}>Pesos</option>
        <option value="USD" ${p?.moneda === 'USD' ? 'selected' : ''}>Dólares</option>
      </select></label>
    </div>
    ${campoNum('cantidad', 'Cantidad', p?.cantidad)}
    <div class="fila">
      ${campoNum('precioCompra', 'Precio de compra', p?.precioCompra, 'Promedio, por unidad')}
      ${campoNum('precioActual', 'Precio actual', p?.precioActual, p?.precioFecha ? `Al ${new Date(`${p.precioFecha}T12:00`).toLocaleDateString('es-AR')}` : 'Por unidad')}
    </div>
    ${campoNum('valorManual', 'Valor total a mano', p?.valorManual, 'Solo si no sabés la cantidad o el precio')}
    <p class="error" id="error-form" hidden></p>
    ${p ? '<button type="button" class="btn btn-peligro btn-bloque" data-accion="borrar-pos">Borrar posición</button>' : ''}
  </form>`, p ? null : '[name=ticker]');
}

function errorForm(texto) {
  const $e = $hoja.querySelector('#error-form');
  $e.textContent = texto;
  $e.hidden = false;
  $e.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function guardarMovimiento(form) {
  const f = new FormData(form);
  const tipo = f.get('tipo');
  const monto = leerNumero(f.get('monto'));
  if (!(monto > 0)) return errorForm('Poné un monto mayor a cero.');
  // Una categoría nueva escrita acá se suma a la lista (si ya existía, se usa la que está).
  const nueva = (f.get('categoriaNueva') || '').trim();
  let categoria = f.get('categoria');
  if (nueva) {
    const clave = claveLista(tipo);
    const lista = datos.ajustes[clave] || [];
    categoria = lista.find(c => c.toLowerCase() === nueva.toLowerCase()) || nueva;
    if (!lista.includes(categoria)) store.guardarAjustes({ ...datos.ajustes, [clave]: [...lista, categoria] });
  }
  if (!categoria) return errorForm(tipo === 'gasto' ? 'Elegí una categoría.' : 'Elegí de dónde viene.');
  const moneda = f.get('moneda');
  const cambio = moneda === 'USD' ? leerNumero(f.get('cambio')) : null;
  if (Number.isNaN(cambio) || cambio < 0) return errorForm('El cambio no se entiende. Usá coma para los decimales.');
  const original = datos.movimientos.find(m => m.id === form.dataset.id);
  const fecha = f.get('fecha') || hoyISO();
  store.guardar('movimientos', {
    id: original?.id || store.nuevoId(),
    tipo,
    monto,
    moneda,
    cambio: cambio || null,
    categoria,
    fecha,
    medio: tipo === 'gasto' ? f.get('medio') || '' : '',
    nota: f.get('nota').trim(),
    creado: original?.creado || Date.now(),
  });
  ultimoTipo = tipo;
  ui.mes = fecha.slice(0, 7);
  $hoja.close();
  toast(`${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} ${original ? 'actualizado' : 'guardado'}`);
}

function guardarPosicion(form) {
  const f = new FormData(form);
  const ticker = f.get('ticker').trim().toUpperCase();
  if (!ticker) return errorForm('Poné el ticker (por ejemplo AAPL).');
  const nums = {};
  for (const campo of ['cantidad', 'precioCompra', 'precioActual', 'valorManual']) {
    nums[campo] = leerNumero(f.get(campo));
    if (Number.isNaN(nums[campo])) return errorForm('Hay un número que no se entiende. Usá coma para los decimales.');
  }
  const original = datos.posiciones.find(p => p.id === form.dataset.id);
  const repetida = datos.posiciones.find(p => p.ticker?.toUpperCase() === ticker && p.id !== original?.id);
  if (repetida) return errorForm(`Ya tenés ${ticker}. Editá esa posición.`);
  const cambioPrecio = nums.precioActual !== (original?.precioActual ?? null);
  store.guardar('posiciones', {
    ...original,
    id: original?.id || store.nuevoId(),
    ticker,
    nombre: f.get('nombre').trim(),
    tipo: f.get('tipo'),
    moneda: f.get('moneda'),
    ...nums,
    precioFecha: cambioPrecio ? hoyISO() : original?.precioFecha || null,
  });
  $hoja.close();
  toast(`${ticker} ${original ? 'actualizada' : 'agregada'}`);
}

async function enviarLogin(form) {
  const f = new FormData(form);
  const $e = form.querySelector('#error-login');
  const $b = form.querySelector('.btn-primario');
  $e.hidden = true;
  $b.disabled = true;
  try {
    if (ui.modoLogin === 'crear') await store.registrarse(f.get('email'), f.get('clave'));
    else await store.entrar(f.get('email'), f.get('clave'));
  } catch (err) {
    const mensajes = {
      'auth/invalid-credential': 'Email o contraseña incorrectos.',
      'auth/invalid-email': 'Ese email no es válido.',
      'auth/email-already-in-use': 'Ya hay una cuenta con ese email. Entrá con tu contraseña.',
      'auth/weak-password': 'La contraseña es muy débil: usá al menos 8 caracteres.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
      'auth/network-request-failed': 'Sin conexión. Probá de nuevo.',
      'auth/operation-not-allowed': 'No se pueden crear cuentas nuevas.',
      'auth/admin-restricted-operation': 'No se pueden crear cuentas nuevas.',
    };
    $e.textContent = mensajes[err.code] || 'No se pudo entrar. Probá de nuevo.';
    $e.hidden = false;
    $b.disabled = false;
  }
}

/* ---------- respaldo ---------- */

async function exportar() {
  const nombre = `bolsillo-respaldo-${hoyISO()}.json`;
  const archivo = new File([JSON.stringify(store.exportar(), null, 2)], nombre, { type: 'application/json' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importar(input) {
  const archivo = input.files?.[0];
  input.value = '';
  if (!archivo) return;
  try {
    const r = store.importar(JSON.parse(await archivo.text()));
    toast(`Importado: ${r.movimientos} movimientos y ${r.posiciones} posiciones`);
  } catch (err) {
    toast(err instanceof SyntaxError ? 'El archivo está dañado.' : err.message);
  }
}

/* ---------- eventos ---------- */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const accion = el.dataset.accion;
  const form = el.closest('form');
  switch (accion) {
    case 'mes':
      ui.mes = moverMes(ui.mes, Number(el.dataset.delta));
      render();
      break;
    case 'ir-mes':
      ui.mes = el.dataset.mes;
      render();
      break;
    case 'filtro':
      ui.filtro = el.dataset.valor;
      render();
      break;
    case 'nuevo-mov':
      abrirMovimiento();
      break;
    case 'editar-mov':
      abrirMovimiento(datos.movimientos.find(m => m.id === el.dataset.id));
      break;
    case 'nueva-pos':
      abrirPosicion();
      break;
    case 'editar-pos':
      abrirPosicion(datos.posiciones.find(p => p.id === el.dataset.id));
      break;
    case 'cerrar':
      $hoja.close();
      break;
    case 'nueva-cat': {
      form.querySelectorAll('input[name=categoria]').forEach(r => { r.checked = false; });
      const $campo = form.querySelector('#campo-cat-nueva');
      $campo.hidden = false;
      $campo.querySelector('input').focus();
      break;
    }
    case 'borrar-mov':
      if (confirm('¿Borrar este movimiento?')) {
        store.borrar('movimientos', form.dataset.id);
        $hoja.close();
        toast('Movimiento borrado');
      }
      break;
    case 'borrar-pos':
      if (confirm('¿Borrar esta posición de la cartera?')) {
        store.borrar('posiciones', form.dataset.id);
        $hoja.close();
        toast('Posición borrada');
      }
      break;
    case 'quitar': {
      const clave = el.dataset.lista;
      store.guardarAjustes({ ...datos.ajustes, [clave]: datos.ajustes[clave].filter(v => v !== el.dataset.valor) });
      break;
    }
    case 'exportar':
      exportar();
      break;
    case 'importar':
      document.getElementById('archivo').click();
      break;
    case 'salir':
      if (confirm('¿Cerrar sesión? Tus datos quedan guardados en la nube.')) store.salir();
      break;
    case 'reiniciar-demo':
      if (confirm('¿Volver a los datos de ejemplo originales?')) store.reiniciarDemo();
      break;
    case 'modo-login':
      ui.modoLogin = ui.modoLogin === 'crear' ? 'entrar' : 'crear';
      render();
      break;
    case 'recuperar': {
      const email = $vista.querySelector('[name=email]').value.trim();
      if (!email) {
        toast('Escribí tu email arriba y tocá de nuevo.');
        break;
      }
      store.recuperar(email).then(
        () => toast('Te mandamos un mail para cambiar la contraseña.'),
        () => toast('No se pudo mandar el mail. Revisá el email.'));
      break;
    }
  }
});

document.addEventListener('submit', e => {
  const form = e.target;
  e.preventDefault();
  if (form.dataset.form === 'movimiento') guardarMovimiento(form);
  else if (form.dataset.form === 'posicion') guardarPosicion(form);
  else if (form.dataset.form === 'login') enviarLogin(form);
  else if (form.dataset.form === 'saldo') {
    const saldo = leerNumero(form.saldo.value);
    if (Number.isNaN(saldo)) return toast('El saldo no se entiende. Usá coma para los decimales.');
    store.guardarAjustes({ ...datos.ajustes, saldoInicial: saldo || 0 });
    toast('Saldo inicial guardado');
  }
  else if (form.dataset.form === 'lista') {
    const valor = form.valor.value.trim();
    const clave = form.dataset.lista;
    const lista = datos.ajustes[clave] || [];
    if (valor && !lista.some(v => v.toLowerCase() === valor.toLowerCase())) {
      store.guardarAjustes({ ...datos.ajustes, [clave]: [...lista, valor] });
    }
    form.reset();
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'archivo') importar(e.target);
  const $error = e.target.closest('dialog')?.querySelector('#error-form');
  if ($error) $error.hidden = true;
  if (e.target.name === 'moneda' && e.target.closest('[data-form=movimiento]')) {
    $hoja.querySelector('#campo-cambio').hidden = e.target.value !== 'USD';
  }
  // Elegir una categoría existente (o cambiar de tipo) descarta la nueva que se estaba escribiendo.
  if ((e.target.name === 'categoria' || e.target.name === 'tipo') && e.target.closest('[data-form=movimiento]')) {
    const $campo = $hoja.querySelector('#campo-cat-nueva');
    $campo.hidden = true;
    $campo.querySelector('input').value = '';
  }
  if (e.target.name === 'tipo' && e.target.closest('[data-form=movimiento]')) {
    const tipo = e.target.value;
    $hoja.querySelector('[name=categoriaNueva]').placeholder = tipo === 'gasto' ? 'Por ejemplo: Mascota' : 'Por ejemplo: Venta de algo';
    $hoja.querySelector('#chips-cat').innerHTML = chipsCategorias(tipo);
    $hoja.querySelector('#titulo-cat').textContent = tipo === 'gasto' ? 'Categoría' : 'De dónde viene';
    $hoja.querySelector('#campo-medio').hidden = tipo !== 'gasto';
  }
});

// Cambio y total en pesos se calculan uno a partir del otro (y se actualizan si cambia el monto).
document.addEventListener('input', e => {
  const form = e.target.closest('[data-form=movimiento]');
  if (!form || !['monto', 'cambio', 'totalPesos'].includes(e.target.name)) return;
  const monto = leerNumero(form.monto.value);
  if (!(monto > 0)) return;
  if (e.target.name === 'totalPesos') {
    const total = leerNumero(form.totalPesos.value);
    form.cambio.value = total > 0 ? paraInput(redondear(total / monto)) : '';
  } else {
    const cambio = leerNumero(form.cambio.value);
    form.totalPesos.value = cambio > 0 ? paraInput(redondear(monto * cambio)) : '';
  }
});

// Tocar fuera de la hoja la cierra.
$hoja.addEventListener('click', e => {
  if (e.target === $hoja) $hoja.close();
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

store.alError(err => {
  toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar: revisá las reglas de Firebase.' : 'Algo falló al guardar. Probá de nuevo.');
});

store.suscribir(estado => {
  datos = estado;
  render();
});

store.iniciar();
actualizarDolar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
