// Capa de datos: Firebase (nube) si hay configuración, o localStorage (modo local) si no.
import { firebaseConfig } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const CLAVE_LOCAL = 'bolsillo:datos';
const CLAVE_DEMO = 'bolsillo:demo';
const COLECCIONES = ['movimientos', 'posiciones'];

// ?demo abre la app con datos de ejemplo, guardados aparte y sin tocar la nube.
export const modoDemo = new URLSearchParams(location.search).has('demo');
export const modoNube = !modoDemo && Boolean(firebaseConfig?.apiKey);

export const AJUSTES_BASE = {
  categoriasGasto: ['Comida', 'Súper', 'Transporte', 'Auto', 'Casa', 'Servicios', 'Salud', 'Gimnasio',
    'Salidas', 'Ropa', 'Suscripciones', 'Estudio', 'Regalos', 'Otros'],
  fuentesIngreso: ['Sueldo', 'Webs / clientes', 'Freelance', 'Inversiones', 'Regalo', 'Otros'],
  medios: ['Débito', 'Crédito', 'Efectivo', 'Transferencia', 'Mercado Pago'],
};

let estado = { listo: false, usuario: null, movimientos: [], posiciones: [], ajustes: AJUSTES_BASE };
const oyentes = new Set();
const oyentesError = new Set();
let backend = null;

export function suscribir(fn) {
  oyentes.add(fn);
  fn(estado);
}

export function alError(fn) {
  oyentesError.add(fn);
}

function emitir(cambios) {
  estado = { ...estado, ...cambios };
  oyentes.forEach(fn => fn(estado));
}

function avisarError(err) {
  console.error(err);
  oyentesError.forEach(fn => fn(err));
}

// Las escrituras en Firestore resuelven cuando llegan al servidor; sin señal quedan pendientes
// pero la caché local ya muestra el cambio, así que no se esperan: solo se atrapan los errores.
function seguro(promesa) {
  Promise.resolve(promesa).catch(avisarError);
}

export const nuevoId = () => crypto.randomUUID();

// Firestore no acepta undefined ni NaN.
function limpiar(obj) {
  const salida = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    salida[k] = typeof v === 'number' && !Number.isFinite(v) ? null : v;
  }
  return salida;
}

function crearLocal(clave, semilla) {
  let datos;
  try {
    datos = JSON.parse(localStorage.getItem(clave)) || null;
  } catch {
    datos = null;
  }
  datos ||= semilla ? semilla() : {};

  function escribir() {
    try {
      localStorage.setItem(clave, JSON.stringify(datos));
    } catch (err) {
      avisarError(err);
    }
  }

  function publicar() {
    emitir({
      listo: true,
      usuario: { email: null, local: true, demo: modoDemo },
      movimientos: datos.movimientos || [],
      posiciones: datos.posiciones || [],
      ajustes: { ...AJUSTES_BASE, ...datos.ajustes },
    });
  }

  function guardarVarios(col, docs) {
    const lista = (datos[col] ||= []);
    for (const doc of docs) {
      const i = lista.findIndex(x => x.id === doc.id);
      if (i >= 0) lista[i] = doc;
      else lista.push(doc);
    }
    escribir();
    publicar();
  }

  if (semilla && !localStorage.getItem(clave)) escribir();
  publicar();
  return {
    guardar: (col, doc) => guardarVarios(col, [doc]),
    guardarVarios,
    borrar(col, id) {
      datos[col] = (datos[col] || []).filter(x => x.id !== id);
      escribir();
      publicar();
    },
    guardarAjustes(ajustes) {
      datos.ajustes = ajustes;
      escribir();
      publicar();
    },
  };
}

async function crearNube() {
  const [appMod, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const sesion = auth.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }

  const uid = () => sesion.currentUser?.uid;
  const coleccion = col => fs.collection(db, 'usuarios', uid(), col);
  const docAjustes = () => fs.doc(db, 'usuarios', uid(), 'ajustes', 'general');
  let cortes = [];

  auth.onAuthStateChanged(sesion, usuario => {
    cortes.forEach(cortar => cortar());
    cortes = [];
    if (!usuario) {
      emitir({ listo: true, usuario: null, movimientos: [], posiciones: [], ajustes: AJUSTES_BASE });
      return;
    }
    emitir({ listo: true, usuario: { email: usuario.email, uid: usuario.uid } });
    for (const col of COLECCIONES) {
      cortes.push(fs.onSnapshot(coleccion(col),
        snap => emitir({ [col]: snap.docs.map(d => ({ ...d.data(), id: d.id })) }),
        avisarError));
    }
    cortes.push(fs.onSnapshot(docAjustes(),
      snap => emitir({ ajustes: { ...AJUSTES_BASE, ...(snap.data() || {}) } }),
      avisarError));
  });

  return {
    entrar: (email, clave) => auth.signInWithEmailAndPassword(sesion, email, clave),
    registrarse: (email, clave) => auth.createUserWithEmailAndPassword(sesion, email, clave),
    recuperar: email => auth.sendPasswordResetEmail(sesion, email),
    salir: () => auth.signOut(sesion),
    guardar(col, { id, ...resto }) {
      return fs.setDoc(fs.doc(coleccion(col), id), resto);
    },
    async guardarVarios(col, docs) {
      for (let i = 0; i < docs.length; i += 400) {
        const lote = fs.writeBatch(db);
        for (const { id, ...resto } of docs.slice(i, i + 400)) lote.set(fs.doc(coleccion(col), id), resto);
        await lote.commit();
      }
    },
    borrar: (col, id) => fs.deleteDoc(fs.doc(coleccion(col), id)),
    guardarAjustes: ajustes => fs.setDoc(docAjustes(), ajustes),
  };
}

export async function iniciar() {
  try {
    if (modoNube) backend = await crearNube();
    else if (modoDemo) {
      const { datosDemo } = await import('./demo.js');
      backend = crearLocal(CLAVE_DEMO, datosDemo);
    } else backend = crearLocal(CLAVE_LOCAL);
  } catch (err) {
    avisarError(err);
    emitir({ listo: true, error: 'No se pudo conectar con la nube. Revisá tu conexión y volvé a abrir la app.' });
  }
}

export const entrar = (email, clave) => backend.entrar(email, clave);
export const registrarse = (email, clave) => backend.registrarse(email, clave);
export const recuperar = email => backend.recuperar(email);
export const salir = () => seguro(backend.salir());

export function reiniciarDemo() {
  localStorage.removeItem(CLAVE_DEMO);
  location.reload();
}

export function guardar(col, doc) {
  seguro(backend.guardar(col, limpiar(doc)));
}

export function borrar(col, id) {
  seguro(backend.borrar(col, id));
}

export function guardarAjustes(ajustes) {
  seguro(backend.guardarAjustes(limpiar(ajustes)));
}

export function exportar() {
  return {
    formato: 'bolsillo',
    version: 1,
    exportado: new Date().toISOString(),
    movimientos: estado.movimientos,
    posiciones: estado.posiciones,
    ajustes: estado.ajustes,
  };
}

// Movimientos se combinan por id; posiciones por ticker, así reimportar la cartera
// de la bóveda actualiza precios en vez de duplicar.
export function importar(archivo) {
  if (archivo?.formato !== 'bolsillo') throw new Error('El archivo no es un respaldo de Bolsillo.');
  const movimientos = (archivo.movimientos || [])
    .filter(m => m && ['ingreso', 'gasto', 'transferencia'].includes(m.tipo) && Number.isFinite(m.monto))
    .map(m => limpiar({ ...m, id: m.id || nuevoId() }));
  const porTicker = new Map(estado.posiciones.map(p => [String(p.ticker).toUpperCase(), p]));
  const posiciones = (archivo.posiciones || [])
    .filter(p => p?.ticker)
    .map(p => {
      const existente = porTicker.get(String(p.ticker).toUpperCase());
      return limpiar({ ...existente, ...p, id: existente?.id || p.id || nuevoId() });
    });
  if (movimientos.length) seguro(backend.guardarVarios('movimientos', movimientos));
  if (posiciones.length) seguro(backend.guardarVarios('posiciones', posiciones));
  if (archivo.ajustes) guardarAjustes({ ...estado.ajustes, ...archivo.ajustes });
  return { movimientos: movimientos.length, posiciones: posiciones.length };
}
