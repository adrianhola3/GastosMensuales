/**
 * STORE.JS - Manejo del estado, persistencia y cálculos financieros
 */

const STORAGE_KEY = 'control_gastos_mensuales_db_v1';

// Generador de IDs únicos
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Datos iniciales idénticos a los del Excel del usuario
function getDefaultData() {
  const baseServiciosFijos = [
    { id: generateId(), concepto: 'Internet de casa', monto: 89.90, tipo: 'Fijo', estado: 'Pendiente' },
    { id: generateId(), concepto: 'Celular', monto: 39.90, tipo: 'Fijo', estado: 'Pendiente' },
    { id: generateId(), concepto: 'CIUNAC (Inglés)', monto: 83.00, tipo: 'Fijo', estado: 'Pendiente' },
    { id: generateId(), concepto: 'Pasajes', monto: 150.00, tipo: 'Fijo', estado: 'Pendiente' },
    { id: generateId(), concepto: 'Corte de cabello', monto: 25.00, tipo: 'Fijo', estado: 'Pendiente' }
  ];

  const baseServiciosVariables = [
    { id: generateId(), concepto: 'Productos de casa: Jabón, shampoo, papel...', monto: 30.00, tipo: 'Variable', rango: '20-40', estado: 'Pendiente' }
  ];

  const basePersonalesFijos = [
    { id: generateId(), concepto: 'Gimnasio', monto: 103.54, tipo: 'Fijo', estado: 'Pendiente' },
    { id: generateId(), concepto: 'Consulta dermatólogo', monto: 50.00, tipo: 'Fijo', estado: 'Pendiente' }
  ];

  const basePersonalesVariables = [
    { id: generateId(), concepto: 'Productos dermatológicos: Jabón cerave...', monto: 45.00, tipo: 'Variable', rango: '10-80', estado: 'Pendiente' }
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
    let movimientos = [];

    if (m.id === 'agosto-2026') {
      extras = [
        { id: generateId(), concepto: 'Matrícula 2026-B de la universidad', monto: 83.00, tipo: 'Extra', estado: 'Pagado' }
      ];
      notas = 'Matrícula 2026-B universitaria pagada. Controlar compras dermatológicas del mes.';
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
    this.data = this.leerLocal() || getDefaultData();
    this.pendienteCarga = this.load();
  }

  /**
   * Lee SOLO la copia local. Es sincrónico y es el que garantiza que la app
   * abra al instante, aunque no haya red.
   *
   * No borra ni filtra datos del usuario: si el archivo está estructuralmente
   * roto, sanear() lo repara y recién ahí se vuelve a persistir.
   */
  leerLocal() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.meses && parsed.mesesOrden) {
          if (this.sanear(parsed)) {
            this.save(parsed);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error al cargar datos de LocalStorage:', e);
    }
    const initial = getDefaultData();
    this.save(initial);
    return initial;
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
    if (hayFilaRemota) {
      if (this.sanear(remoto)) {
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
      const listas = [
        ...Object.values(m.servicios),
        ...Object.values(m.personales),
        m.extras,
        m.movimientos
      ].filter(Array.isArray);

      listas.forEach(lista => {
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

    if (this.remotoListo && window.gastosRemoto && window.gastosRemoto.estaConfigurado()) {
      try {
        await window.gastosRemoto.guardar(JSON.parse(JSON.stringify(this.data)));
      } catch (e) {
        console.warn('No se pudo sincronizar con Supabase:', e);
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

  // --- CÁLCULOS POR MES ---
  calculateMonthTotals(monthId) {
    const m = this.getMonth(monthId);
    if (!m) return null;

    // Servicios
    const subtotalServiciosFijos = (m.servicios.fijos || []).reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const subtotalServiciosVariables = (m.servicios.variables || []).reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const subtotalServicios = subtotalServiciosFijos + subtotalServiciosVariables;

    // Personales
    const subtotalPersonalesFijos = (m.personales.fijos || []).reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const subtotalPersonalesVariables = (m.personales.variables || []).reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const subtotalPersonales = subtotalPersonalesFijos + subtotalPersonalesVariables;

    // Extras
    const subtotalExtras = (m.extras || []).reduce((sum, item) => sum + (Number(item.monto) || 0), 0);

    // Total General Presupuestado (Egresos)
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
    const pagadosCount = allPresupuestoItems.filter(i => i.estado === 'Pagado').length;
    const montoPagadoPresupuesto = allPresupuestoItems
      .filter(i => i.estado === 'Pagado')
      .reduce((s, i) => s + (Number(i.monto) || 0), 0);
    const montoPendientePresupuesto = Math.max(0, totalEgresos - montoPagadoPresupuesto);
    const porcentajePagado = totalEgresos > 0 ? (montoPagadoPresupuesto / totalEgresos) * 100 : 0;
    const pendientesCount = totalItemsPresupuesto - pagadosCount;

    // --- Fuentes de egresos: SON INDEPENDIENTES entre sí, no son el mismo dato ---
    // 1) montoPagadoPresupuesto: ítems del PRESUPUESTO PLANEADO marcados como Pagado.
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
    // La suma es correcta; lo engañoso era el nombre "totalGastadoReal", que sugería
    // que una sola cifra reflejaba "lo real". Se renombra a totalDesembolsado.
    const totalDesembolsado = montoPagadoPresupuesto + totalEgresosMovimientos;

    // Balance Neto = ingresos del feed - todo lo desembolsado (presupuesto pagado + gastos del feed)
    const balanceNeto = totalIngresos - totalDesembolsado;

    // Cumplimiento (% de abonos sobre total egresos presupuestados)
    const porcentajeAvance = totalEgresos > 0 ? Math.min(100, (totalIngresos / totalEgresos) * 100) : 0;

    // Progreso individual por categoría (para las minibarras en los botones de segmentos)
    const itemsServicios = [...(m.servicios.fijos || []), ...(m.servicios.variables || [])];
    const pagadosServicios = itemsServicios.filter(i => i.estado === 'Pagado');
    const montoPagadoServicios = pagadosServicios.reduce((s, i) => s + (Number(i.monto) || 0), 0);
    const pctPagadoServicios = subtotalServicios > 0 ? Math.min(100, (montoPagadoServicios / subtotalServicios) * 100) : 0;

    const itemsPersonales = [...(m.personales.fijos || []), ...(m.personales.variables || [])];
    const pagadosPersonales = itemsPersonales.filter(i => i.estado === 'Pagado');
    const montoPagadoPersonales = pagadosPersonales.reduce((s, i) => s + (Number(i.monto) || 0), 0);
    const pctPagadoPersonales = subtotalPersonales > 0 ? Math.min(100, (montoPagadoPersonales / subtotalPersonales) * 100) : 0;

    const itemsExtras = m.extras || [];
    const pagadosExtras = itemsExtras.filter(i => i.estado === 'Pagado');
    const montoPagadoExtras = pagadosExtras.reduce((s, i) => s + (Number(i.monto) || 0), 0);
    const pctPagadoExtras = subtotalExtras > 0 ? Math.min(100, (montoPagadoExtras / subtotalExtras) * 100) : 0;

    const pagadosMovs = movs.filter(x => x.estado === 'Pagado' || x.flujo === 'Gasto');
    const pctPagadoMovimientos = movs.length > 0 ? Math.min(100, (pagadosMovs.length / movs.length) * 100) : 0;

    return {
      subtotalServiciosFijos,
      subtotalServiciosVariables,
      subtotalServicios,
      subtotalPersonalesFijos,
      subtotalPersonalesVariables,
      subtotalPersonales,
      subtotalExtras,
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
      pctPagadoMovimientos
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
      globalDesembolsado,
      rows
    };
  }

  // --- MUTACIONES DE GASTOS DE PRESUPUESTO ---
  addBudgetItem(monthId, section, subsection, item) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const newItem = {
      id: generateId(),
      concepto: item.concepto.trim(),
      monto: parseFloat(item.monto) || 0,
      tipo: item.tipo || 'Fijo',
      rango: item.rango || '',
      estado: item.estado || 'Pendiente'
    };

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
        coll[idx] = { ...coll[idx], ...updatedFields };
        if (updatedFields.monto !== undefined) {
          coll[idx].monto = parseFloat(updatedFields.monto) || 0;
        }
        this.save();
        return true;
      }
    }
    return false;
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

  toggleBudgetItemStatus(monthId, itemId) {
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
        item.estado = item.estado === 'Pagado' ? 'Pendiente' : 'Pagado';
        this.save();
        return item.estado;
      }
    }
    return null;
  }

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

    const hasPending = all.some(i => i.estado === 'Pendiente');
    const targetState = hasPending ? 'Pagado' : 'Pendiente';

    all.forEach(i => i.estado = targetState);
    this.save();
    return targetState;
  }

  // --- MUTACIONES DE MOVIMIENTOS (FLUJO DE CAJA) ---
  addMovement(monthId, mov) {
    const m = this.getMonth(monthId);
    if (!m) return false;

    const newMov = {
      id: generateId(),
      fecha: mov.fecha || new Date().toISOString().split('T')[0],
      concepto: mov.concepto.trim(),
      flujo: mov.flujo || 'Ingreso',
      categoria: mov.categoria || 'General',
      retornable: mov.retornable || 'No',
      estado: mov.estado || 'Pagado',
      monto: parseFloat(mov.monto) || 0
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
   * `monto` se castea a float igual que en `addMovement`: el formulario
   * entrega texto y sin esto "45.50" quedaría guardado como cadena, que
   * después suma mal en los totales.
   */
  updateMovement(monthId, movId, updatedFields) {
    const m = this.getMonth(monthId);
    if (!m || !m.movimientos) return false;

    const idx = m.movimientos.findIndex(x => x.id === movId);
    if (idx !== -1) {
      m.movimientos[idx] = { ...m.movimientos[idx], ...updatedFields };
      if (updatedFields.monto !== undefined) {
        m.movimientos[idx].monto = parseFloat(updatedFields.monto) || 0;
      }
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
    this.save();
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
    const id = nombre.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);
    const corto = nombre.split(' ')[0] || nombre;

    let nuevoMes;

    if (clonarDeMesId && this.data.meses[clonarDeMesId]) {
      const base = this.data.meses[clonarDeMesId];
      nuevoMes = {
        id,
        nombre,
        corto,
        servicios: {
          fijos: base.servicios.fijos.map(i => ({ ...i, id: generateId(), estado: 'Pendiente' })),
          variables: base.servicios.variables.map(i => ({ ...i, id: generateId(), estado: 'Pendiente' }))
        },
        personales: {
          fijos: base.personales.fijos.map(i => ({ ...i, id: generateId(), estado: 'Pendiente' })),
          variables: base.personales.variables.map(i => ({ ...i, id: generateId(), estado: 'Pendiente' }))
        },
        // Un extra es una cuenta pendiente, igual que un gasto de presupuesto:
        // se copia con id nuevo y vuelve a Pendiente.
        extras: opciones.extras
          ? base.extras.map(i => ({ ...i, id: generateId(), estado: 'Pendiente' }))
          : [],
        notas: opciones.notas ? base.notas : '',
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
      alert('Debes mantener al menos un mes en el sistema.');
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

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.meses && parsed.mesesOrden) {
        this.data = parsed;
        this.save();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error parseando JSON:', e);
      return false;
    }
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
