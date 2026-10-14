/**
 * STORE.JS - Manejo del estado, persistencia y cálculos financieros
 */

const STORAGE_KEY = 'control_gastos_mensuales_db_v1';

// Rango admisible para cualquier monto. Es holgado a propósito: sobra para
// gastos reales y deja afuera los desbordes numéricos, que son los que
// convierten los totales en Infinity o NaN.
const MONTO_MINIMO = 0;
const MONTO_MAXIMO = 1000000000;

// Generador de IDs únicos
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

/**
 * Convierte a número un monto tomado de un formulario.
 *
 * NO es `parseFloat(valor) || 0`: esa forma convierte en cero todo lo que no
 * entiende y se traga el desbordamiento. `"abc"` y `"12abc"` tienen que
 * rechazarse (no terminar guardados como 0 ni como 12) y `"1e309"` tiene que
 * rechazarse en vez de quedar persistido como Infinity.
 *
 * @param {*} valor texto o número entregado por el usuario.
 * @returns {?number} el monto, o null si no es un número finito dentro de rango.
 */
function normalizarMonto(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;

  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  if (numero < MONTO_MINIMO || numero > MONTO_MAXIMO) return null;

  return numero;
}

/**
 * ¿El objeto tiene la forma completa de un estado de la app?
 *
 * Se usa como filtro ANTES de asignar un archivo importado. `sanear()` puede
 * crear los contenedores que falten, pero no puede inventar los datos que no
 * están: dejar pasar un archivo con los meses vacíos deja la pantalla en
 * blanco y ni siquiera avisa de que algo salió mal.
 */
function esEstadoValido(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!data.meses || typeof data.meses !== 'object' || Array.isArray(data.meses)) return false;
  if (!Array.isArray(data.mesesOrden)) return false;

  const secciones = [
    ['servicios', ['fijos', 'variables']],
    ['personales', ['fijos', 'variables']]
  ];

  return Object.keys(data.meses).every(id => {
    const mes = data.meses[id];
    if (!mes || typeof mes !== 'object' || Array.isArray(mes)) return false;
    if (!Array.isArray(mes.extras)) return false;
    if (!Array.isArray(mes.movimientos)) return false;

    return secciones.every(([nombre, subs]) => {
      const seccion = mes[nombre];
      if (!seccion || typeof seccion !== 'object' || Array.isArray(seccion)) return false;
      return subs.every(sub => Array.isArray(seccion[sub]));
    });
  });
}

/**
 * Migra UN ítem de presupuesto del modelo viejo (`monto` + `estado`) al nuevo
 * (`montoEstimado` + `montoReal`).
 *
 * D5 — ningún número cambia de valor:
 *   · `Pagado`    → estimado = real = el `monto` viejo (mismo número: en el
 *     modelo anterior no había diferencia entre lo estimado y lo pagado).
 *   · `Pendiente` → estimado = el `monto` viejo, real = null.
 *
 * D2 — el `estado` desaparece: la cobertura se deduce de `montoReal`, así que
 * el texto no se copia a ninguna parte.
 *
 * IDEMPOTENTE — en la segunda pasada no encuentra ni `monto` ni `estado`, y los
 * dos campos nuevos ya están en su forma final, así que no toca nada. Por eso
 * volver a correr la migración no puede cambiar un solo dígito, y `sanear()`
 * puede seguir usándola como criterio de "hay que volver a guardar".
 *
 * @param {object} item el ítem, que se muta en el sitio.
 * @param {function} marca se llama solo si hubo un cambio real.
 */
function migrarItemPresupuesto(item, marca) {
  if (item.monto !== undefined) {
    const viejo = normalizarMonto(item.monto);
    const estimadoActual = normalizarMonto(item.montoEstimado);
    if (estimadoActual === null || (estimadoActual === 0 && viejo !== null && viejo > 0)) {
      item.montoEstimado = viejo === null ? 0 : viejo;
    }
    delete item.monto;
    marca();
  }

  if (item.estado !== undefined) {
    // El `estado` viejo era lo único que decía que un gasto ya se había pagado.
    // Pasa a ser un monto real con el valor del estimado. Si el ítem ya
    // tuviera un `montoReal` propio, ese manda: no se pisa un dato nuevo con
    // uno viejo.
    if (item.montoReal === undefined) {
      item.montoReal = item.estado === 'Pagado' ? item.montoEstimado : null;
    }
    delete item.estado;
    marca();
  }

  if (item.montoEstimado === undefined || item.montoEstimado === null) {
    item.montoEstimado = 0;
    marca();
  }

  // Un `montoReal` que no se puede leer como número cuenta como `null`, o sea
  // como pendiente. La alternativa —dejarlo tal cual o coercionarlo a 0— mete
  // un NaN en un total o finge un pago que nadie registró.
  const real = normalizarMonto(item.montoReal);
  if (real === null) {
    if (item.montoReal !== null) { item.montoReal = null; marca(); }
  } else if (item.montoReal !== real) {
    item.montoReal = real;
    marca();
  }
}

/**
 * Copia un ítem de presupuesto para un mes nuevo (D4).
 *
 * Se copian `concepto`, `montoEstimado`, `tipo` y `rango`. `montoReal` arranca
 * en `null`: lo que se pagó el mes pasado no puede heredarse al siguiente, o
 * un mes recién creado aparecería con todo cubierto.
 *
 * Los movimientos NO pasan por acá: son montos reales y no tienen estimado (D8).
 *
 * @returns {object} el ítem del clon, con id nuevo.
 */
function clonarItemPresupuesto(item) {
  return {
    id: generateId(),
    concepto: item.concepto,
    montoEstimado: Number(item.montoEstimado) || 0,
    montoReal: null,
    tipo: item.tipo,
    rango: item.rango || ''
  };
}

// Datos iniciales idénticos a los del Excel del usuario
function getDefaultData() {
  const baseServiciosFijos = [
    { id: generateId(), concepto: 'Internet de casa', montoEstimado: 89.90, montoReal: null, tipo: 'Fijo' },
    { id: generateId(), concepto: 'Celular', montoEstimado: 39.90, montoReal: null, tipo: 'Fijo' },
    { id: generateId(), concepto: 'CIUNAC (Inglés)', montoEstimado: 83.00, montoReal: null, tipo: 'Fijo' },
    { id: generateId(), concepto: 'Pasajes', montoEstimado: 150.00, montoReal: null, tipo: 'Fijo' },
    { id: generateId(), concepto: 'Corte de cabello', montoEstimado: 25.00, montoReal: null, tipo: 'Fijo' }
  ];

  const baseServiciosVariables = [
    { id: generateId(), concepto: 'Productos de casa: Jabón, shampoo, papel...', montoEstimado: 30.00, montoReal: null, tipo: 'Variable', rango: '20-40' }
  ];

  const basePersonalesFijos = [
    { id: generateId(), concepto: 'Gimnasio', montoEstimado: 103.54, montoReal: null, tipo: 'Fijo' },
    { id: generateId(), concepto: 'Consulta dermatólogo', montoEstimado: 50.00, montoReal: null, tipo: 'Fijo' }
  ];

  const basePersonalesVariables = [
    { id: generateId(), concepto: 'Productos dermatológicos: Jabón cerave...', montoEstimado: 45.00, montoReal: null, tipo: 'Variable', rango: '10-80' }
  ];

  const mesesTemplate = [
    { id: 'agosto-2026', nombre: 'Agosto 2026', corto: 'Agosto' },
    { id: 'septiembre-2026', nombre: 'Septiembre 2026', corto: 'Septiembre' },
    { id: 'octubre-2026', nombre: 'Octubre 2026', corto: 'Octubre' },
    { id: 'noviembre-2026', nombre: 'Noviembre 2026', corto: 'Noviembre' },
    { id: 'diciembre-2026', nombre: 'Diciembre 2026', corto: 'Diciembre' },
    { id: 'enero-2027', nombre: 'Enero 2027', corto: 'Enero' }
  ];

  const meses = {};

  mesesTemplate.forEach((m, index) => {
    // Clonar listas base para cada mes
    const servFijos = baseServiciosFijos.map(item => ({ ...item, id: generateId() }));
    const servVar = baseServiciosVariables.map(item => ({ ...item, id: generateId() }));
    const persFijos = basePersonalesFijos.map(item => ({ ...item, id: generateId() }));
    const persVar = basePersonalesVariables.map(item => ({ ...item, id: generateId() }));
    
    let extras = [];
    let notas = '';
    let notasLista = [];
    let movimientos = [];

    if (m.id === 'agosto-2026') {
      extras = [
        { id: generateId(), concepto: 'Matrícula 2026-B de la universidad', montoEstimado: 83.00, montoReal: 83.00, tipo: 'Extra' }
      ];
      notas = 'Nota de prueba en agosto: acuerdos y pagos pendientes familiares.';
      notasLista = [
        {
          id: generateId(),
          texto: 'Nota de prueba en agosto: acuerdos y pagos pendientes familiares.',
          creadoEn: new Date().toISOString(),
          editadoEn: null,
          editado: false
        }
      ];
      movimientos = [];
    }

    meses[m.id] = {
      id: m.id,
      nombre: m.nombre,
      corto: m.corto,
      servicios: {
        fijos: servFijos,
        variables: servVar
      },
      personales: {
        fijos: persFijos,
        variables: persVar
      },
      extras: extras,
      notas: notas,
      notasLista: notasLista,
      movimientos: movimientos
    };
  });

  return {
    version: 1,
    activeMonthId: 'agosto-2026',
    currentView: 'mes', // 'panel' o 'mes'
    mesesOrden: mesesTemplate.map(m => m.id),
    meses: meses
  };
}

class FinancialStore {
  constructor() {
    // this.data tiene que ser SIEMPRE un objeto válido de forma síncrona: el
    // resto de la app (y los getters) lo leen apenas se instancia el store.
    // Por eso la copia local se lee de inmediato y la nube se resuelve después,
    // sin bloquear el arranque.
    this.oyentes = [];
    this.remotoListo = false; // evita subir a la nube antes de leer lo que hay arriba
    this.guardandoEnCurso = 0;
    this.ultimoGuardadoTs = 0;
    this.sincronizandoEnCurso = false;
    this.sincronizandoDesdeNube = false;
    this.data = this.leerLocal() || getDefaultData();
    // Fotografía del estado en el momento del arranque. Sirve para que load()
    // distinga "no pasó nada" de "el usuario ya escribió algo mientras
    // esperábamos a la nube".
    this.snapshotArranque = JSON.stringify(this.data);
    this.pendienteCarga = this.load();
    this.iniciarSincronizacionEnVivo();
  }

  /**
   * Lee SOLO la copia local. Es sincrónico y es el que garantiza que la app
   * abra al instante, aunque no haya red.
   *
   * No borra ni filtra datos del usuario: si el archivo está estructuralmente
   * roto, sanear() lo repara y recién ahí se vuelve a persistir.
   *
   * Cuando lo que hay guardado NO SE PUEDE NI INTERPRETAR (JSON inválido, o
   * un objeto sin la forma mínima de un estado) los datos de fábrica se
   * inicializan igual para que la app abra, pero ANTES se aparta la cadena
   * original, sin tocarla, bajo una clave aparte. Sin ese paso, recargar una
   * sola vez alcanzaba para perder la única copia local del usuario.
   */
  leerLocal() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Error al cargar datos de LocalStorage:', e);
    }

    if (stored) {
      let parsed = null;
      try {
        parsed = JSON.parse(stored);
      } catch (e) {
        console.warn('El contenido guardado no es JSON válido:', e);
        parsed = null;
      }

      if (parsed && parsed.meses && parsed.mesesOrden) {
        if (this.sanear(parsed)) {
          this.save(parsed);
        }
        return parsed;
      }

      this.apartarComoCorrupto(stored);
    }

    const initial = getDefaultData();
    this.save(initial);
    return initial;
  }

  /**
   * Aparta, bajo una clave propia, el contenido que no se pudo interpretar.
   *
   * La clave lleva un sello de tiempo para no pisar un respaldo anterior. Si el
   * navegador no deja escribir (cuota llena, almacenamiento bloqueado) solo se
   * avisa por consola: es preferible quedarse sin respaldo a quedarse sin
   * arranque.
   */
  apartarComoCorrupto(contenido) {
    try {
      localStorage.setItem(STORAGE_KEY + '_corrupto_' + Date.now(), contenido);
    } catch (e) {
      console.error('No se pudo apartar el contenido ilegible de LocalStorage:', e);
    }
  }

  /**
   * Carga el estado. Ahora es asíncrono porque la fuente de verdad puede ser
   * Supabase, pero el resultado nunca rompe a quien lo llama: si la nube no está
   * configurada o no responde, sigue con la copia local.
   *
   * Orden de resolución:
   *   1) Si hay datos en la nube, esos mandan.
   *   2) Si no hay fila en la nube, se sube la copia local (migración) y se usa.
   *   3) Si no hay nube configurada, es el comportamiento local de siempre.
   *
   * @returns {Promise<object>} el estado ya cargado
   */
  async load() {
    let remoto = null;
    let hayFilaRemota = false;

    if (window.gastosRemoto && window.gastosRemoto.estaConfigurado()) {
      try {
        remoto = await window.gastosRemoto.cargar();
        hayFilaRemota = !!remoto;
      } catch (e) {
        console.warn('No se pudo leer de Supabase, se usa la copia local:', e);
      }
    }

    // Recién ahora se permite escribir en la nube. Antes de este punto está
    // prohibido: si se subiera la copia local antes de leer la nube, se
    // pisarían los datos que ya estaban guardados en el servidor.
    this.remotoListo = true;

    let estado;
    // Si mientras se esperaba a la nube el usuario ya escribió algo, la copia
    // remota quedó desactualizada: imponerla perdería justo lo que él acaba
    // de escribir. En ese caso manda lo que está en memoria y se sube a la
    // nube, que es la única forma de que la edición llegue a existir.
    const huboEdicionesLocales =
      this.snapshotArranque !== JSON.stringify(this.data);

    if (hayFilaRemota && huboEdicionesLocales) {
      console.warn('Hay cambios locales sin subir: se conservan y se envían a la nube.');
      estado = this.data;
      if (window.gastosRemoto && window.gastosRemoto.estaConfigurado()) {
        try {
          await window.gastosRemoto.guardar(JSON.parse(JSON.stringify(estado)));
        } catch (e) {
          console.warn('No se pudo subir el estado local a Supabase:', e);
        }
      }
    } else if (hayFilaRemota) {
      let migroNotasLocales = false;
      if (
        typeof window !== 'undefined' &&
        !window.__sandbox &&
        this.data &&
        this.data.meses &&
        remoto.meses
      ) {
        Object.keys(this.data.meses).forEach(id => {
          const mLocal = this.data.meses[id];
          const mRemoto = remoto.meses[id];
          if (
            mLocal &&
            mRemoto &&
            Array.isArray(mLocal.notasLista) &&
            mLocal.notasLista.length > 0 &&
            mRemoto.notasLista === undefined
          ) {
            mRemoto.notasLista = JSON.parse(JSON.stringify(mLocal.notasLista));
            mRemoto.notas = typeof mLocal.notas === 'string' ? mLocal.notas : mRemoto.notas;
            migroNotasLocales = true;
          }
        });
      }
      if (this.sanear(remoto) || migroNotasLocales) {
        this.save(remoto);
      }
      estado = remoto;
    } else {
      // Sin fila en la nube: la copia local pasa a ser la fuente y se sube.
      estado = this.leerLocal();
      if (estado && window.gastosRemoto && window.gastosRemoto.estaConfigurado()) {
        try {
          await window.gastosRemoto.guardar(estado);
        } catch (e) {
          console.warn('No se pudo subir la copia local a Supabase:', e);
        }
      }
    }

    // Solo se avisa a la interfaz si el contenido cambió de verdad.
    const cambio = JSON.stringify(estado) !== JSON.stringify(this.data);
    this.data = estado;
    // La fotografía corre junto al estado: a partir de acá, "sin cambios
    // locales" vuelve a significar "nadie escribió nada desde esto".
    this.snapshotArranque = JSON.stringify(estado);
    if (cambio) this.notificar();

    return estado;
  }

  /** Suscribe un callback que se dispara cuando el estado cambia de origen. */
  alCambiarEstado(cb) {
    if (typeof cb === 'function') this.oyentes.push(cb);
  }

  notificar() {
    this.oyentes.forEach(cb => {
      try { cb(this.data); } catch (e) { console.error('Error al notificar cambio de estado:', e); }
    });
  }

  /**
   * Aplica un estado proveniente de la nube o de otra pestaña sin pisar la
   * vista o el período que el lector está mirando actualmente.
   */
  aplicarEstadoRemoto(remoto) {
    if (!remoto || !esEstadoValido(remoto)) return false;
    if (this.guardandoEnCurso > 0) return false;
    if (Date.now() - (this.ultimoGuardadoTs || 0) < 1500) return false;

    const copia = JSON.parse(JSON.stringify(remoto));
    this.sanear(copia);

    if (this.data) {
      if (this.data.activeMonthId && copia.meses[this.data.activeMonthId]) {
        copia.activeMonthId = this.data.activeMonthId;
      }
      if (this.data.currentView) {
        copia.currentView = this.data.currentView;
      }
    }

    const huellaActual = JSON.stringify({
      meses: this.data ? this.data.meses : null,
      mesesOrden: this.data ? this.data.mesesOrden : null
    });
    const huellaNueva = JSON.stringify({
      meses: copia.meses,
      mesesOrden: copia.mesesOrden
    });

    if (huellaActual === huellaNueva) return false;

    this.data = copia;
    this.snapshotArranque = JSON.stringify(copia);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {}

    this.sincronizandoDesdeNube = true;
    try {
      this.notificar();
    } finally {
      this.sincronizandoDesdeNube = false;
    }
    return true;
  }

  /**
   * Consulta la nube para traer cambios hechos desde el Administrador en otro
   * navegador o pestaña y actualizar en vivo la vista de Solo Lectura.
   */
  async syncFromRemote() {
    if (typeof window === 'undefined' || window.__sandbox) return false;
    if (!this.remotoListo || this.guardandoEnCurso > 0 || this.sincronizandoEnCurso) return false;
    if (Date.now() - (this.ultimoGuardadoTs || 0) < 1500) return false;
    if (
      !window.gastosRemoto ||
      !window.gastosRemoto.estaConfigurado() ||
      typeof window.gastosRemoto.suscribirCambios !== 'function'
    ) {
      return false;
    }

    this.sincronizandoEnCurso = true;
    try {
      const remoto = await window.gastosRemoto.cargar();
      if (!remoto) return false;
      return this.aplicarEstadoRemoto(remoto);
    } catch (e) {
      return false;
    } finally {
      this.sincronizandoEnCurso = false;
    }
  }

  /**
   * Activa la sincronización en tiempo real (Realtime + polling cada 3s +
   * eventos storage/focus) únicamente en sesiones reales de navegador.
   */
  iniciarSincronizacionEnVivo() {
    if (typeof window === 'undefined' || window.__sandbox) return;
    const remoto = window.gastosRemoto;
    if (!remoto || typeof remoto.suscribirCambios !== 'function' || !remoto.estaConfigurado()) return;

    remoto.suscribirCambios(nuevoEstado => {
      if (nuevoEstado) {
        this.aplicarEstadoRemoto(nuevoEstado);
      } else {
        this.syncFromRemote();
      }
    });

    this._intervaloSync = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.syncFromRemote();
    }, 3000);

    window.addEventListener('storage', (e) => {
      if (e && e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          this.aplicarEstadoRemoto(parsed);
        } catch (err) {}
      }
    });

    window.addEventListener('focus', () => {
      this.syncFromRemote();
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.syncFromRemote();
      });
    }
  }

  /**
   * Corrige SOLO la estructura: crea los contenedores que falten para que la app
   * no reviente al calcular, y normaliza los tipos que los cálculos asumen.
   *
   * POR QUÉ SE QUITÓ EL FILTRADO POR TEXTO DE CONCEPTO (estaba aquí antes):
   * load() borraba en cada carga todo concepto que contuviera 'spotify', reinyectaba
   * 'Productos de casa' y revolvía a 'Pendiente' cualquier gasto que el usuario acababa
   * de marcar como pagado. Consecuencias: un gasto de Spotify se perdía para siempre
   * y marcar un ítem como pagado se revertía al recargar. El archivo de datos no tiene
   * autoridad para decidir qué contiene: los datos del usuario son intocables.
   *
   * Este método es idempotente: solo vuelve a persistir si de verdad faltaba algo,
   * así que en la práctica escribe una sola vez por sesión.
   *
   * @returns {boolean} true si corrigió algo (para decidir si hay que guardar)
   */
  sanear(data) {
    let cambios = false;

    if (!data.meses) data.meses = {};
    if (!Array.isArray(data.mesesOrden)) {
      data.mesesOrden = Object.keys(data.meses);
      cambios = true;
    }
    if (typeof data.activeMonthId !== 'string' || !data.meses[data.activeMonthId]) {
      data.activeMonthId = data.mesesOrden.find(id => data.meses[id]) || null;
      cambios = true;
    }

    Object.keys(data.meses).forEach(id => {
      const m = data.meses[id];
      if (!m || typeof m !== 'object') return;

      // Las listas que faltan se crean VACÍAS. Antes se rellenaban con un gasto
      // inventado, lo que además de falsear totales metía datos que el usuario
      // nunca registró.
      if (!Array.isArray(m.movimientos)) { m.movimientos = []; cambios = true; }
      if (!Array.isArray(m.extras)) { m.extras = []; cambios = true; }
      if (typeof m.notas !== 'string') { m.notas = ''; cambios = true; }

      ['servicios', 'personales'].forEach(seccion => {
        if (!m[seccion] || typeof m[seccion] !== 'object') { m[seccion] = {}; cambios = true; }
        ['fijos', 'variables'].forEach(sub => {
          if (!Array.isArray(m[seccion][sub])) { m[seccion][sub] = []; cambios = true; }
        });
      });

      // Tipos mínimos que asertan los cálculos: sin esto un import corrupto
      // rompe el .reduce() de montos y deja la pantalla en blanco.
      //
      // Presupuesto y movimientos se sanean con reglas DISTINTAS y por eso van
      // en listas separadas. El presupuesto usa `montoEstimado`/`montoReal` y
      // se migra con `migrarItemPresupuesto()` (D1/D5). Los movimientos siguen
      // con `monto`/`estado`: son montos reales, nunca tuvieron un estimado que
      // confundir, y tocarlos acá los rompería (D8).
      const listasPresupuesto = [
        ...Object.values(m.servicios),
        ...Object.values(m.personales),
        m.extras
      ].filter(Array.isArray);

      const preciosBaseRecuperacion = {
        'Internet de casa': 89.90,
        'Celular': 39.90,
        'CIUNAC (Inglés)': 83.00,
        'Pasajes': 150.00,
        'Corte de cabello': 25.00,
        'Productos de casa: Jabón, shampoo, papel...': 30.00,
        'Gimnasio': 103.54,
        'Consulta dermatólogo': 50.00,
        'Productos dermatológicos: Jabón cerave...': 45.00,
        'Matrícula 2026-B de la universidad': 83.00
      };
      const enNavegadorReal =
        typeof window !== 'undefined' &&
        !window.__sandbox &&
        typeof window.gastosRemoto?.suscribirCambios === 'function';

      listasPresupuesto.forEach(lista => {
        lista.forEach(item => {
          if (!item || typeof item !== 'object') return;
          if (typeof item.concepto !== 'string') { item.concepto = ''; cambios = true; }
          migrarItemPresupuesto(item, () => { cambios = true; });
          if (
            enNavegadorReal &&
            item.montoEstimado === 0 &&
            preciosBaseRecuperacion[item.concepto] !== undefined
          ) {
            item.montoEstimado = preciosBaseRecuperacion[item.concepto];
            cambios = true;
          }
        });
      });

      const listasMovimientos = [m.movimientos].filter(Array.isArray);

      listasMovimientos.forEach(lista => {
        lista.forEach(item => {
          if (!item || typeof item !== 'object') return;
          if (typeof item.concepto !== 'string') { item.concepto = ''; cambios = true; }
          if (item.monto === undefined || item.monto === null || item.monto === '') {
            item.monto = 0;
            cambios = true;
          }
          if (typeof item.estado !== 'string' || !item.estado) {
            item.estado = 'Pendiente';
            cambios = true;
          }
        });
      });
    });

    return cambios;
  }

  /**
   * Guarda el estado.
   *
   * localStorage se escribe SIEMPRE y de forma sincrónica: es la caché offline y,
   * cuando Supabase no está configurado, es la única copia que existe. Por eso
   * la función no espera a nada antes de escribir y los mutadores siguen
   * llamándola sin esperarla, exactamente como antes.
   *
   * La nube se actualiza en segundo plano y con un instantánea (copia profunda)
   * del estado: si se pasara la referencia, un cambio posterior del usuario
   * llegaría al servidor en un guardado más viejo.
   */
  async save(dataToSave = null) {
    if (dataToSave) {
      this.data = dataToSave;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Error al guardar datos en LocalStorage:', e);
    }

    const enModoLecturaReal =
      typeof window !== 'undefined' &&
      !window.__sandbox &&
      typeof document !== 'undefined' &&
      document.body &&
      document.body.classList.contains('read-only-mode') &&
      typeof window.gastosRemoto?.suscribirCambios === 'function';

    if (
      this.remotoListo &&
      !enModoLecturaReal &&
      window.gastosRemoto &&
      window.gastosRemoto.estaConfigurado()
    ) {
      this.guardandoEnCurso++;
      this.ultimoGuardadoTs = Date.now();
      try {
        await window.gastosRemoto.guardar(JSON.parse(JSON.stringify(this.data)));
      } catch (e) {
        console.warn('No se pudo sincronizar con Supabase:', e);
      } finally {
        this.guardandoEnCurso = Math.max(0, this.guardandoEnCurso - 1);
        this.ultimoGuardadoTs = Date.now();
      }
    }
  }

  resetToDefault() {
    this.data = getDefaultData();
    this.save();
    return this.data;
  }

  // --- GETTERS ---
  getActiveMonth() {
    const month = this.data.meses[this.data.activeMonthId];
    if (!month) {
      // Fallback al primer mes existente
      const firstId = this.data.mesesOrden[0];
      if (firstId) {
        this.data.activeMonthId = firstId;
        return this.data.meses[firstId];
      }
    }
    return month;
  }

  getMonth(monthId) {
    return this.data.meses[monthId];
  }

  getAllMonthsList() {
    return this.data.mesesOrden.map(id => this.data.meses[id]).filter(Boolean);
  }

/**
   * ¿Está cubierto este gasto? (D2)
   *
   * La respuesta es exactamente `montoReal !== null`, y vive en un solo
   * método a propósito: la regla de cobertura se lee y se corrige en una línea
   * en vez de estar repetida en diez shedios distintos.
   *
   * @param {object} item un ítem de presupuesto.
   * @returns {boolean} true si ya tiene un monto real registrado.
   */
  estaCubierto(item) {
    return !!item && item.montoReal !== null && item.montoReal !== undefined;
  }

  // --- CÁLCULOS POR MES ---
  calculateMonthTotals(monthId) {
    const m = this.getMonth(monthId);
    if (!m) return null;

    // Suma de estimados. Es la UNICA base de los subtotales por sección: la
    // cobertura se mide contra lo que se planeó, no contra lo que se pagó (D3).
    const estimadosDe = lista => (lista || [])
      .reduce((sum, item) => sum + (Number(item.montoEstimado) || 0), 0);

    // Estimados de los ítems YA cubiertos: es `totalCubierto` acotado a una
    // lista, que es lo que necesitan las minibarras por categoría.
    const cubiertosDe = lista => (lista || [])
      .filter(item => this.estaCubierto(item))
      .reduce((sum, item) => sum + (Number(item.montoEstimado) || 0), 0);

    // Montos reales de los ítems cubiertos. Distinto de `cubiertosDe` a
    // propósito: acá entra plata que efectivamente salió, y comparar esa
    // cifra contra el estimado es justamente el desvío (D3).
    const realesDe = lista => (lista || [])
      .filter(item => this.estaCubierto(item))
      .reduce((sum, item) => sum + (Number(item.montoReal) || 0), 0);

    // Servicios
    const subtotalServiciosFijos = estimadosDe(m.servicios.fijos);
    const subtotalServiciosVariables = estimadosDe(m.servicios.variables);
    const subtotalServicios = subtotalServiciosFijos + subtotalServiciosVariables;

    // Personales
    const subtotalPersonalesFijos = estimadosDe(m.personales.fijos);
    const subtotalPersonalesVariables = estimadosDe(m.personales.variables);
    const subtotalPersonales = subtotalPersonalesFijos + subtotalPersonalesVariables;

    // Extras
    const subtotalExtras = estimadosDe(m.extras);

    // Total General presupuestado (Egresos)
    const totalEgresos = subtotalServicios + subtotalPersonales + subtotalExtras;

    // Movimientos (Administrador de Ingresos y Egresos del mes)
    const movs = m.movimientos || [];
    const totalIngresos = movs
      .filter(x => x.flujo === 'Ingreso')
      .reduce((sum, x) => sum + (Number(x.monto) || 0), 0);

    const totalEgresosMovimientos = movs
      .filter(x => x.flujo === 'Gasto')
      .reduce((sum, x) => sum + (Number(x.monto) || 0), 0);

    // Conteo de ítems pagados vs pendientes en el presupuesto general
    const allPresupuestoItems = [
      ...(m.servicios.fijos || []),
      ...(m.servicios.variables || []),
      ...(m.personales.fijos || []),
      ...(m.personales.variables || []),
      ...(m.extras || [])
    ];
    const totalItemsPresupuesto = allPresupuestoItems.length;
    const pagadosCount = allPresupuestoItems.filter(i => this.estaCubierto(i)).length;
    const pendientesCount = totalItemsPresupuesto - pagadosCount;

    // --- D3: LA COBERTURA SE MIDE CONTRA EL ESTIMADO ---
    //
    // `totalCubierto` y `totalFaltante` son la MISMA suma (`montoEstimado` de
    // todos los ítems) partida en dos: los que tienen `montoReal` van al
    // primero, los que no al segundo. Por construcción no se solapan y no se
    // pierde nada, así que la identidad
    //
    //     totalCubierto + totalFaltante === totalEstimado
    //
    // se cumple siempre por construcción, no por conviene.
    const totalEstimado = totalEgresos;
    const totalReal = realesDe(allPresupuestoItems);
    const totalCubierto = cubiertosDe(allPresupuestoItems);
    let totalFaltante = totalEstimado - totalCubierto;

    // `totalCubierto` se recorre entero y `totalFaltante` sale por resta: son
    // dos operaciones de coma flotante sobre la misma lista y pueden diferir en
    // la última cifra. Cuando la diferencia es solo eso se ajusta, para que la
    // identidad se cumpla también al mostrar los tres números juntos. Un desvío
    // de un céntimo REAL no se toca: acá solo se.Absorbe el ruido de coma
    // flotante.
    if (totalFaltante !== 0 && Math.abs(totalCubierto + totalFaltante - totalEstimado) < 1e-6) {
      totalFaltante = Math.round((totalEstimado - totalCubierto) * 100) / 100;
    }

    // `desvio` = real menos estimado. Positivo es pasarse, negativo es ahorrar.
    const desvio = totalReal - totalEstimado;
    // Progreso de cobertura sobre el estimado, como fracción 0..1.
    const progresoCubierto = totalEstimado > 0 ? totalCubierto / totalEstimado : 0;

    // Alias que ya existían y que la interfaz sigue leyendo. Ahora apuntan a
    // las cifras nuevas, no a un concepto nuevo: `montoPagadoPresupuesto` es la
    // parte del PLANTAJE que está cubierta, y `montoPendientePresupuesto` la
    // que falta.
    const montoPagadoPresupuesto = totalCubierto;
    const montoPendientePresupuesto = totalFaltante;
    const porcentajePagado = progresoCubierto * 100;

    // --- Fuentes de egresos: SON INDEPENDIENTES entre sí, no son el mismo dato ---
    // 1) totalReal: lo que SALIÓ de verdad del presupuesto (lo que el usuario
    //    registró como pagado, que ya no es el estimado: por eso es `totalReal`
    //    y no `totalCubierto`).
    // 2) totalEgresosMovimientos: gastos sueltos anotados en el FLUJO DE CAJA (el feed).
    //
    // Evidencia de que no hay doble conteo estructural:
    //  · Un movimiento se crea con su propio id y NO guarda ninguna referencia al ítem
    //    de presupuesto (ver addMovement: no escribe presupuestoId ni nada equivalente).
    //  · Los esquemas son disjuntos: el ítem tiene tipo/rango, el movimiento tiene
    //    fecha/flujo/categoria/retornable.
    //  · El presupuesto solo modela egres. Los INGRESOS existen únicamente en los
    //    movimientos, así que el feed no puede ser un duplicado del presupuesto: sin él
    //    no habría forma de registrar un abono en toda la app.
    //
    // Ojo con el uso: si el usuario marca "Celular" como Pagado en el presupuesto Y
    // además anota un Gasto "Celular" en el feed, ahí sí se cuenta dos veces. Eso es
    // una duplicación manual del usuario, no un defecto de la fórmula, y la app no
    // enlaza ambos registros. Se documenta para no confundirlo con un bug.
    //
    // `totalDesembolsado` usa `totalReal` y no `totalCubierto` a propósito: es
    // plata que salió de la billetera, y mezclar ahí un estimado falsearía el
    // balance. Con los datos migrados las dos coinciden (D5 le pone el mismo
    // número a estimado y real), así que este cambio no mueve ni un centavo de
    // lo que la app mostraba antes.
    const totalDesembolsado = totalReal + totalEgresosMovimientos;

    // Balance Neto = ingresos del feed - todo lo desembolsado (presupuesto pagado + gastos del feed)
    const balanceNeto = totalIngresos - totalDesembolsado;

    // Cumplimiento (% de abonos sobre total egresos presupuestados)
    const porcentajeAvance = totalEstimado > 0 ? Math.min(100, (totalIngresos / totalEstimado) * 100) : 0;

    // Progreso individual por categoría (para las minibarras en los botones de segmentos)
    const itemsServicios = [...(m.servicios.fijos || []), ...(m.servicios.variables || [])];
    const montoPagadoServicios = cubiertosDe(itemsServicios);
    const pctPagadoServicios = subtotalServicios > 0 ? Math.min(100, (montoPagadoServicios / subtotalServicios) * 100) : 0;

    const itemsPersonales = [...(m.personales.fijos || []), ...(m.personales.variables || [])];
    const montoPagadoPersonales = cubiertosDe(itemsPersonales);
    const pctPagadoPersonales = subtotalPersonales > 0 ? Math.min(100, (montoPagadoPersonales / subtotalPersonales) * 100) : 0;

    const itemsExtras = m.extras || [];
    const montoPagadoExtras = cubiertosDe(itemsExtras);
    const pctPagadoExtras = subtotalExtras > 0 ? Math.min(100, (montoPagadoExtras / subtotalExtras) * 100) : 0;

    const pagadosMovs = movs.filter(x => x.estado === 'Pagado' || x.flujo === 'Gasto');
    const pctPagadoMovimientos = movs.length > 0 ? Math.min(100, (pagadosMovs.length / movs.length) * 100) : 0;

    // --- D3, POR CATEGORÍA: la misma pregunta de antes, con la plata REAL ---
    //
    // Arriba los tres subtotales son de `montoEstimado` ("cuánto iba a
    // gastar"). Estos tres son de `montoReal` ("cuánto salió"), con el mismo
    // filtro de cobertura que `totalReal`: solo los ítems que `estaCubierto`.
    // No hay criterio nuevo: es `realesDe` acotado a cada categoría, la misma
    // suma que ya produce `totalReal` sobre la lista entera.
    //
    // NO son dos versiones del mismo número. Con un item pagado por 1.456,78
    // sobre un estimado de 1.234,56, el estimado vale 1.234,56 y el real
    // 1.456,78: uno es el plan y el otro es el desvío. Por eso los campos
    // viven con nombres distintos y no se derivan uno del otro (D3).
    const subtotalServiciosReal = realesDe(itemsServicios);
    const subtotalPersonalesReal = realesDe(itemsPersonales);
    const subtotalExtrasReal = realesDe(itemsExtras);

    return {
      subtotalServiciosFijos,
      subtotalServiciosVariables,
      subtotalServicios,
      subtotalPersonalesFijos,
      subtotalPersonalesVariables,
      subtotalPersonales,
      subtotalExtras,
      // Las mismas tres categorías, pero REALIZADO (montoReal de lo cubierto).
      // Aditivos: los de arriba no cambian de valor ni de significado.
      subtotalServiciosReal,
      subtotalPersonalesReal,
      subtotalExtrasReal,
      totalEgresos,
      totalIngresos,
      totalEgresosMovimientos,
      totalDesembolsado,
      balanceNeto,
      porcentajeAvance,
      totalItemsPresupuesto,
      pagadosCount,
      pendientesCount,
      montoPagadoPresupuesto,
      montoPendientePresupuesto,
      porcentajePagado,
      montoPagadoServicios,
      pctPagadoServicios,
      montoPagadoPersonales,
      pctPagadoPersonales,
      montoPagadoExtras,
      pctPagadoExtras,
      pctPagadoMovimientos,
      // D3 — las cuatro cifras del modelo nuevo, con nombre propio.
      totalEstimado,
      totalReal,
      totalCubierto,
      totalFaltante,
      desvio,
      progresoCubierto
    };
  }

  // --- CÁLCULOS GLOBALES (PANEL GENERAL) ---
  calculateGlobalTotals() {
    let globalIngresos = 0;
    let globalEgresos = 0;
    let globalServicios = 0;
    let globalPersonales = 0;
    let globalExtras = 0;
    let globalDesembolsado = 0;
    let globalServiciosReal = 0;
    let globalPersonalesReal = 0;
    let globalExtrasReal = 0;

    // POR QUÉ HAY DOS SERIES DE TRES NÚMEROS Y NO UNA
    // ---------------------------------------------------
    // `globalServicios` / `globalPersonales` / `globalExtras` son el
    // PLANIFICADO y lo siguen siendo: suman `montoEstimado`. Tienen dos
    // consumidores reales y ninguno de los dos se toca:
    //   · `exportCSV` (store.js:1267) los escribe en columnas rotuladas
    //     SERVICIOS / PERSONALES / GASTOS EXTRA, junto a "TOTAL EGRESOS", que
    //     es el nombre del planificado en el resto de la app.
    //   · El detalle de la matriz los lee por mes desde `rows`.
    // Cambiarles el significado dejaría un Excel que dice una cosa y una
    // pantalla que dice otra, sin que nada se rompa visiblemente. Por eso son
    // intocables y el realizado vive en campos NUEVOS.
    //
    // Los `*Real` son la plata que salió, criterio `estaCubierto` (`montoReal`),
    // el mismo que ya usa `totalReal` por mes. Son los que lee la dona.
    const rows = this.data.mesesOrden.map(id => {
      const m = this.data.meses[id];
      if (!m) return null;
      const c = this.calculateMonthTotals(id);
      
      globalIngresos += c.totalIngresos;
      globalEgresos += c.totalEgresos;
      globalServicios += c.subtotalServicios;
      globalPersonales += c.subtotalPersonales;
      globalExtras += c.subtotalExtras;
      globalDesembolsado += c.totalDesembolsado;
      globalServiciosReal += c.subtotalServiciosReal;
      globalPersonalesReal += c.subtotalPersonalesReal;
      globalExtrasReal += c.subtotalExtrasReal;

      return {
        monthId: id,
        nombre: m.nombre,
        corto: m.corto,
        servicios: c.subtotalServicios,
        personales: c.subtotalPersonales,
        extras: c.subtotalExtras,
        totalEgresos: c.totalEgresos,
        ingresos: c.totalIngresos,
        totalDesembolsado: c.totalDesembolsado,
        balanceNeto: c.balanceNeto,
        porcentajeAvance: c.porcentajeAvance
      };
    }).filter(Boolean);

    const globalBalanceNeto = globalIngresos - globalDesembolsado;
    const globalPorcentajeCumplimiento = globalEgresos > 0 ? (globalIngresos / globalEgresos) * 100 : 0;

    return {
      globalIngresos,
      globalEgresos,
      globalBalanceNeto,
      globalPorcentajeCumplimiento,
      globalServicios,
      globalPersonales,
      globalExtras,
      // Realizado por categoría: la plata que salió, no la que se planeó.
      globalServiciosReal,
      globalPersonalesReal,
      globalExtrasReal,
      globalDesembolsado,
      rows
    };
  }

  // --- MUTACIONES DE GASTOS DE PRESUPUESTO ---
  addBudgetItem(monthId, section, subsection, item) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const entrada = item || {};

    // Se acepta `monto` como alias de `montoEstimado` para no romper a quien
    // todavía nombre el campo viejo; lo que se GUARDA es siempre el modelo
    // nuevo, con las dos caras del número separadas.
    const montoEstimado = normalizarMonto(
      entrada.montoEstimado !== undefined ? entrada.montoEstimado : entrada.monto
    );
    // Un monto que no es un número no se corrige a cero: se rechaza el alta
    // entera. Guardarlo como 0 silenciosamente convertía "1e309" o "abc" en
    // un total que después ya no cuadraba con lo que el usuario escribió.
    if (montoEstimado === null) return false;

    const newItem = {
      id: generateId(),
      concepto: entrada.concepto.trim(),
      montoEstimado: montoEstimado,
      montoReal: normalizarMonto(entrada.montoReal),
      tipo: entrada.tipo || 'Fijo',
      rango: entrada.rango || ''
    };

    // El formulario todavía ofrece elegir el "estado inicial", y ese control
    // no se toca en esta fase. Se traduce a un monto real con el valor del
    // estimado, que es EXACTAMENTE lo que hace la migración con un `Pagado`
    // viejo: un alta pagada y un dato migrado significan lo mismo, y ninguno
    // de los dos guarda un texto de estado (D2).
    if (newItem.montoReal === null && entrada.estado === 'Pagado') {
      newItem.montoReal = montoEstimado;
    }

    if (section === 'servicios') {
      if (subsection === 'fijos') m.servicios.fijos.push(newItem);
      else m.servicios.variables.push(newItem);
    } else if (section === 'personales') {
      if (subsection === 'fijos') m.personales.fijos.push(newItem);
      else m.personales.variables.push(newItem);
    } else if (section === 'extras') {
      newItem.tipo = 'Extra';
      m.extras.push(newItem);
    }

    this.save();
    return newItem;
  }

  updateBudgetItem(monthId, itemId, updatedFields) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const collections = [
      m.servicios.fijos,
      m.servicios.variables,
      m.personales.fijos,
      m.personales.variables,
      m.extras
    ];

    for (const coll of collections) {
      const idx = coll.findIndex(x => x.id === itemId);
      if (idx !== -1) {
        const campos = this.camposEditables(updatedFields, true);
        if (!campos) return false;

        coll[idx] = { ...coll[idx], ...campos };
        this.save();
        return true;
      }
    }
    return false;
  }

  /**
   * Prepara los campos de un parche de actualización.
   *
   * Tres cosas que antes se colaban:
   *  · `id`: no es un campo editable. Si el parche lo traía, el ítem quedaba
   *    con el id de otro, los dos findIndex lo encontraban siempre al primero
   *    y el segundo se volvía inoperable. Se descarta siempre.
   *  · `monto`: se valida con normalizarMonto(). Si no es un número finito en
   *    rango se devuelve null y el llamador rechaza el parche entero en vez de
   *    dejar un 0 donde el usuario puso otra cosa.
   *  · `estado`: con el modelo nuevo NO es un campo del ítem. Un texto de
   *    estado sería un segundo lugar donde vive la cobertura, y la cobertura se
   *    deduce de `montoReal` (D2). Se descarta siempre.
   *
   * `esPresupuesto` separa las dos formas porque `updateMovement` comparte esta
   * función: un movimiento SÍ tiene `monto` y SÍ tiene `estado` (D8), así que
   * sin el flag el movimiento se renombraría a `montoEstimado` y quedaría roto.
   *
   * @param {object} updatedFields el parche crudo que manda el formulario.
   * @param {boolean} esPresupuesto true para ítems de presupuesto.
   * @returns {?object} los campos limpios, o null si hay que rechazar el parche.
   */
  camposEditables(updatedFields, esPresupuesto = false) {
    const campos = { ...(updatedFields || {}) };
    delete campos.id;

    if (esPresupuesto) {
      // Alias del nombre viejo: un parche que dice `monto` se guarda como
      // `montoEstimado`. `estado` NO tiene alias a propósito, por lo que
      // explica la nota de arriba.
      if (campos.monto !== undefined && campos.montoEstimado === undefined) {
        campos.montoEstimado = campos.monto;
      }
      delete campos.monto;
      delete campos.estado;

      if (campos.montoEstimado !== undefined) {
        const estimado = normalizarMonto(campos.montoEstimado);
        if (estimado === null) return null;
        campos.montoEstimado = estimado;
      }

      // El monto real se valida por separado porque `null` es un valor
      // legítimo —quitar el pago es escribir null— y no debe rechazar el
      // parche. Lo ilegible se cae a `null`, igual que en la migración.
      if (campos.montoReal !== undefined) {
        campos.montoReal = normalizarMonto(campos.montoReal);
      }
    } else if (campos.monto !== undefined) {
      const monto = normalizarMonto(campos.monto);
      if (monto === null) return null;
      campos.monto = monto;
    }

    return campos;
  }

  deleteBudgetItem(monthId, itemId) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const collections = [
      m.servicios.fijos,
      m.servicios.variables,
      m.personales.fijos,
      m.personales.variables,
      m.extras
    ];

    for (const coll of collections) {
      const idx = coll.findIndex(x => x.id === itemId);
      if (idx !== -1) {
        coll.splice(idx, 1);
        this.save();
        return true;
      }
    }
    return false;
  }

  /**
   * Paga o deja de pagar un gasto (D2).
   *
   * No hay estado que alternar: pagar ES escribir `montoReal` y quitar el pago
   * es borrarlo. El ítem vuelve a quedar pendiente solo, sin segunda escritura.
   *
   * Con qué importe se paga lo elige quien paga —la fila abre el modal—, así que
   * acá el valor por defecto es el estimado: es el número con el que el gasto ya
   * estaba registrado, y por eso un fijo pagado a un clic queda en su estimado
   * en vez de inventarse otro.
   *
   * @param {string} monthId
   * @param {string} itemId
   * @param {?number} montoReal importe a registrar; null o ilegible = estimado.
   * @returns {string|false|null} 'Pagado' o 'Pendiente'; false si el mes no
   *   existe y null si el ítem ya no está. Los dos se conservan porque el
   *   llamador los distingue para poder avisar "el gasto ya no existe".
   */
  toggleBudgetItemStatus(monthId, itemId, montoReal = null) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const collections = [
      m.servicios.fijos,
      m.servicios.variables,
      m.personales.fijos,
      m.personales.variables,
      m.extras
    ];

    for (const coll of collections) {
      const item = coll.find(x => x.id === itemId);
      if (item) {
        if (this.estaCubierto(item)) {
          item.montoReal = null;
        } else {
          const importe = normalizarMonto(montoReal);
          item.montoReal = importe === null ? (Number(item.montoEstimado) || 0) : importe;
        }
        this.save();
        return this.estaCubierto(item) ? 'Pagado' : 'Pendiente';
      }
    }
    return null;
  }

  /**
   * Paga o deja de pagar TODOS los gastos del mes de una vez.
   *
   * No tiene control en la interfaz: se mantiene porque el store es la capa de
   * datos y la regla se deriva de la misma fuente que el toggle individual.
   * Al pagar en bloque no hay importe por ítem, así que cada uno toma su
   * estimado, que es lo único que se conoce.
   */
  toggleAllBudgetItems(monthId) {
    const m = this.getMonth(monthId);
    if (!m) return;

    const all = [
      ...m.servicios.fijos,
      ...m.servicios.variables,
      ...m.personales.fijos,
      ...m.personales.variables,
      ...m.extras
    ];

    const hayPendientes = all.some(i => !this.estaCubierto(i));
    const objetivo = hayPendientes ? 'Pagado' : 'Pendiente';

    all.forEach(i => {
      if (objetivo === 'Pendiente') {
        i.montoReal = null;
      } else if (!this.estaCubierto(i)) {
        i.montoReal = Number(i.montoEstimado) || 0;
      }
    });
    this.save();
    return objetivo;
  }

  // --- MUTACIONES DE MOVIMIENTOS (FLUJO DE CAJA) ---
  addMovement(monthId, mov) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const monto = normalizarMonto(mov.monto);
    // Mismo criterio que en addBudgetItem: si no se puede entender el monto,
    // no se registra el movimiento.
    if (monto === null) return false;

    const newMov = {
      id: generateId(),
      fecha: mov.fecha || new Date().toISOString().split('T')[0],
      concepto: mov.concepto.trim(),
      flujo: mov.flujo || 'Ingreso',
      categoria: mov.categoria || 'General',
      retornable: mov.retornable || 'No',
      estado: mov.estado || 'Pagado',
      monto: monto,
      ...(mov.metodo ? { metodo: mov.metodo } : {})
    };

    if (!m.movimientos) m.movimientos = [];
    m.movimientos.unshift(newMov);
    this.save();
    return newMov;
  }

  /**
   * Edita un movimiento existente.
   *
   * Misma forma que `updateBudgetItem`: se localiza por id dentro de la
   * colección del mes y la entrada se reemplaza por una mezcla del objeto
   * anterior con los campos nuevos, de modo que lo que el formulario no
   * envía sobrevive intacto (categoria, retornable, estado, fecha...).
   *
   * La limpieza del parche (descartar `id`, validar `monto`) la hace
   * `camposEditables()`, igual que en el ítem de presupuesto.
   */
  updateMovement(monthId, movId, updatedFields) {
    const m = this.getMonth(monthId);
    if (!m || !m.movimientos) return false;

    const idx = m.movimientos.findIndex(x => x.id === movId);
    if (idx !== -1) {
      const campos = this.camposEditables(updatedFields);
      if (!campos) return false;

      m.movimientos[idx] = { ...m.movimientos[idx], ...campos };
      this.save();
      return true;
    }
    return false;
  }

  deleteMovement(monthId, movId) {
    const m = this.getMonth(monthId);
    if (!m || !m.movimientos) return false;

    const idx = m.movimientos.findIndex(x => x.id === movId);
    if (idx !== -1) {
      m.movimientos.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  toggleMovementStatus(monthId, movId) {
    const m = this.getMonth(monthId);
    if (!m || !m.movimientos) return false;

    const mov = m.movimientos.find(x => x.id === movId);
    if (mov) {
      mov.estado = mov.estado === 'Pagado' ? 'Pendiente' : 'Pagado';
      this.save();
      return mov.estado;
    }
    return null;
  }

  // --- GESTIÓN DE NOTAS ---
  updateNotes(monthId, notesText) {
    const m = this.getMonth(monthId);
    if (!m) return;
    m.notas = notesText;
    if (Array.isArray(m.notasLista)) {
      if (!notesText || !notesText.trim()) {
        m.notasLista = [];
      } else if (m.notasLista.length === 1) {
        m.notasLista[0].texto = notesText;
      }
    }
    this.save();
  }

  getNotesList(monthId) {
    const m = this.getMonth(monthId);
    if (!m) return [];
    if (Array.isArray(m.notasLista) && m.notasLista.length > 0) {
      return [...m.notasLista].sort((a, b) => new Date(a.creadoEn || 0) - new Date(b.creadoEn || 0));
    }
    if (typeof m.notas === 'string' && m.notas.trim().length > 0) {
      return [{
        id: 'legacy_' + monthId,
        texto: m.notas.trim(),
        creadoEn: m.creadoEn || '2026-08-01T12:00:00.000Z',
        editadoEn: null,
        editado: false
      }];
    }
    return [];
  }

  sincronizarNotasTextoPlano(m) {
    if (!m) return;
    if (!Array.isArray(m.notasLista) || m.notasLista.length === 0) {
      m.notas = '';
    } else {
      const ordenadas = [...m.notasLista].sort((a, b) => new Date(a.creadoEn || 0) - new Date(b.creadoEn || 0));
      m.notas = ordenadas.map(n => n.texto).join('\n\n');
    }
  }

  asegurarNotasListaMigrada(m) {
    if (!m) return;
    if (!Array.isArray(m.notasLista)) {
      m.notasLista = [];
      if (typeof m.notas === 'string' && m.notas.trim().length > 0) {
        m.notasLista.push({
          id: generateId(),
          texto: m.notas.trim(),
          creadoEn: new Date().toISOString(),
          editadoEn: null,
          editado: false
        });
      }
    }
  }

  addNoteItem(monthId, texto) {
    const m = this.getMonth(monthId);
    if (!m) return false;
    const limpio = typeof texto === 'string' ? texto.trim() : '';
    if (!limpio) return false;

    this.asegurarNotasListaMigrada(m);
    const nuevaNota = {
      id: generateId(),
      texto: limpio,
      creadoEn: new Date().toISOString(),
      editadoEn: null,
      editado: false
    };
    m.notasLista.push(nuevaNota);
    this.sincronizarNotasTextoPlano(m);
    this.save();
    return nuevaNota;
  }

  updateNoteItem(monthId, noteId, nuevoTexto) {
    const m = this.getMonth(monthId);
    if (!m) return false;
    const limpio = typeof nuevoTexto === 'string' ? nuevoTexto.trim() : '';
    if (!limpio) return false;

    this.asegurarNotasListaMigrada(m);
    let item = m.notasLista.find(n => n.id === noteId);
    if (!item && String(noteId).startsWith('legacy_') && m.notasLista.length === 1) {
      item = m.notasLista[0];
    }
    if (!item) return false;

    if (item.texto !== limpio) {
      item.texto = limpio;
      item.editado = true;
      item.editadoEn = new Date().toISOString();
    }
    this.sincronizarNotasTextoPlano(m);
    this.save();
    return true;
  }

  deleteNoteItem(monthId, noteId) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    this.asegurarNotasListaMigrada(m);
    let idx = m.notasLista.findIndex(n => n.id === noteId);
    if (idx === -1 && String(noteId).startsWith('legacy_') && m.notasLista.length === 1) {
      idx = 0;
    }
    if (idx === -1) return false;

    m.notasLista.splice(idx, 1);
    this.sincronizarNotasTextoPlano(m);
    this.save();
    return true;
  }

  // --- GESTIÓN DE MESES ---
  /**
   * @param {string} nombre nombre visible del período nuevo.
   * @param {?string} clonarDeMesId mes origen del clon, o null para mes vacío.
   * @param {{extras?: boolean, notas?: boolean, movimientos?: boolean}} opciones
   *   Qué colecciones copIAN además de las cuatro de presupuesto cuando se clona.
   *   Es opcional a propósito: sin `opciones` el clon se comporta exactamente
   *   como antes (solo las cuatro de presupuesto), así que ningún llamador
   *   existente cambia de resultado por haberle agregado el parámetro.
   */
  addNewMonth(nombre, clonarDeMesId = null, opciones = {}) {
    const base = nombre.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Con los últimos 4 dígitos del timestamp la ventana de colisión era de 10
    // segundos: dos meses con el mismo nombre creados dentro de ese intervalo
    // compartían id, el segundo pisaba el contenido del primero y `mesesOrden`
    // quedaba con la entrada repetida. El timestamp completo hace la
    // colisión prácticamente imposible y el bucle cubre el mismo milisegundo.
    let id = base + '-' + Date.now();
    let intento = 1;
    while (this.data.meses[id]) {
      id = base + '-' + Date.now() + '-' + intento;
      intento++;
    }

    const corto = nombre.split(' ')[0] || nombre;

    let nuevoMes;

    if (clonarDeMesId && this.data.meses[clonarDeMesId]) {
      const base = this.data.meses[clonarDeMesId];
      nuevoMes = {
        id,
        nombre,
        corto,
        servicios: {
          fijos: base.servicios.fijos.map(i => clonarItemPresupuesto(i)),
          variables: base.servicios.variables.map(i => clonarItemPresupuesto(i))
        },
        personales: {
          fijos: base.personales.fijos.map(i => clonarItemPresupuesto(i)),
          variables: base.personales.variables.map(i => clonarItemPresupuesto(i))
        },
        // Un extra es una cuenta pendiente, igual que un gasto de presupuesto:
        // se copia con id nuevo y `montoReal` en null.
        extras: opciones.extras
          ? base.extras.map(i => clonarItemPresupuesto(i))
          : [],
        notas: opciones.notas ? base.notas : '',
        ...(opciones.notas && Array.isArray(base.notasLista)
          ? { notasLista: base.notasLista.map(n => ({ ...n, id: generateId() })) }
          : {}),
        // Un movimiento NO se resetea a Pendiente, a diferencia de los gastos.
        // Un movimiento es una transacción YA registrada, con su estado y su
        // fecha: ponerlo en Pendiente cambiaría su significado (un ingreso ya
        // cobrado volvería a ser un cobro pendiente) y falsearía el balance del
        // clon. Por eso además es opt-in: copiarlo puede duplicar ingresos.
        movimientos: opciones.movimientos
          ? base.movimientos.map(m => ({ ...m, id: generateId() }))
          : []
      };
    } else {
      nuevoMes = {
        id,
        nombre,
        corto,
        servicios: { fijos: [], variables: [] },
        personales: { fijos: [], variables: [] },
        extras: [],
        notas: '',
        movimientos: []
      };
    }

    this.data.meses[id] = nuevoMes;
    this.data.mesesOrden.push(id);
    this.save();
    return id;
  }

  deleteMonth(monthId) {
    if (this.data.mesesOrden.length <= 1) {
      if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast('Debes mantener al menos un mes en el sistema.', '⚠️');
      } else if (typeof alert === 'function') {
        alert('Debes mantener al menos un mes en el sistema.');
      }
      return false;
    }
    delete this.data.meses[monthId];
    this.data.mesesOrden = this.data.mesesOrden.filter(id => id !== monthId);
    if (this.data.activeMonthId === monthId) {
      this.data.activeMonthId = this.data.mesesOrden[0];
    }
    this.save();
    return true;
  }

  // --- EXPORTAR E IMPORTAR COPIAS DE SEGURIDAD ---
  exportJSON() {
    const jsonStr = JSON.stringify(this.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_gastos_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Restaura un archivo generado por `exportJSON()`.
   *
   * Antes de tocar `this.data` se valida la estructura completa. Si el archivo
   * no trae las colecciones que la app necesita para calcular, se devuelve
   * false y el estado que ya estaba en memoria queda intacto: antes se
   * aceptaba, se asignaba y recién después la app se caía al calcular.
   * Un archivo que sí pasa la validación pasa por `sanear()`, igual que
   * `leerLocal()` y `load()`.
   *
   * @returns {boolean} true si el respaldo quedó restaurado.
   */
  importJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('Error parseando JSON:', e);
      return false;
    }

    if (!esEstadoValido(parsed)) {
      console.warn('El archivo no tiene la estructura de un respaldo de la app: no se importó.');
      return false;
    }

    this.sanear(parsed);
    this.data = parsed;
    this.save();
    return true;
  }

  exportCSV() {
    // Exportar consolidado a CSV para abrir en Excel directamente
    let csv = 'MES,SERVICIOS,PERSONALES,GASTOS EXTRA,TOTAL EGRESOS,INGRESOS,BALANCE NETO,% AVANCE\n';
    const globalData = this.calculateGlobalTotals();
    
    globalData.rows.forEach(r => {
      csv += `"${r.nombre}",${r.servicios.toFixed(2)},${r.personales.toFixed(2)},${r.extras.toFixed(2)},${r.totalEgresos.toFixed(2)},${r.ingresos.toFixed(2)},${r.balanceNeto.toFixed(2)},${r.porcentajeAvance.toFixed(1)}%\n`;
    });

    csv += `"TOTALES",${globalData.globalServicios.toFixed(2)},${globalData.globalPersonales.toFixed(2)},${globalData.globalExtras.toFixed(2)},${globalData.globalEgresos.toFixed(2)},${globalData.globalIngresos.toFixed(2)},${globalData.globalBalanceNeto.toFixed(2)},${globalData.globalPorcentajeCumplimiento.toFixed(1)}%\n`;

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_general_gastos_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Formateador de moneda en Soles (S/ 0.00)
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return isNegative ? `-S/ ${absFormatted}` : `S/ ${absFormatted}`;
}

// Instancia global
window.financialStore = new FinancialStore();
window.formatCurrency = formatCurrency;
