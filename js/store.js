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
    { id: generateId(), concepto: 'Productos de casa: Jabón, shampoo, pap...', monto: 30.00, tipo: 'Variable', rango: '20-40', estado: 'Pendiente' }
  ];

  const basePersonalesFijos = [
    { id: generateId(), concepto: 'Gimnasio', monto: 103.54, tipo: 'Fijo', estado: 'Pendiente' },
    { id: generateId(), concepto: 'Spotify', monto: 11.90, tipo: 'Fijo', estado: 'Pendiente' },
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
      movimientos = [
        { 
          id: generateId(), 
          fecha: '2026-09-20', 
          concepto: 'Yapeo de 559', 
          flujo: 'Ingreso', 
          categoria: 'Gastos Extra', 
          retornable: 'No', 
          estado: 'Pagado', 
          monto: 559.00 
        },
        { 
          id: generateId(), 
          fecha: '2026-08-15', 
          concepto: 'Matrícula 2026-B', 
          flujo: 'Gasto', 
          categoria: 'Gastos Extra', 
          retornable: 'No', 
          estado: 'Pagado', 
          monto: 83.00 
        }
      ];
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
    this.data = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.meses && parsed.mesesOrden) {
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

  save(dataToSave = null) {
    if (dataToSave) {
      this.data = dataToSave;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Error al guardar datos en LocalStorage:', e);
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

    // Movimientos (Administrador de Ingresos y Egresos)
    const movs = m.movimientos || [];
    const totalIngresos = movs
      .filter(x => x.flujo === 'Ingreso' && x.estado === 'Pagado')
      .reduce((sum, x) => sum + (Number(x.monto) || 0), 0);

    const totalEgresosEjecutados = movs
      .filter(x => x.flujo === 'Gasto' && x.estado === 'Pagado')
      .reduce((sum, x) => sum + (Number(x.monto) || 0), 0);

    // En el Excel: Balance del mes = Ingresos - Total Egresos (presupuestados)
    const balanceNeto = totalIngresos - totalEgresos;

    // Cumplimiento (% de abonos sobre total egresos)
    const porcentajeAvance = totalEgresos > 0 ? Math.min(100, (totalIngresos / totalEgresos) * 100) : 0;

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

    const pagadosMovs = movs.filter(x => x.estado === 'Pagado');
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
      totalEgresosEjecutados,
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

    const rows = this.data.mesesOrden.map(id => {
      const m = this.data.meses[id];
      if (!m) return null;
      const c = this.calculateMonthTotals(id);
      
      globalIngresos += c.totalIngresos;
      globalEgresos += c.totalEgresos;
      globalServicios += c.subtotalServicios;
      globalPersonales += c.subtotalPersonales;
      globalExtras += c.subtotalExtras;

      return {
        monthId: id,
        nombre: m.nombre,
        corto: m.corto,
        servicios: c.subtotalServicios,
        personales: c.subtotalPersonales,
        extras: c.subtotalExtras,
        totalEgresos: c.totalEgresos,
        ingresos: c.totalIngresos,
        balanceNeto: c.balanceNeto,
        porcentajeAvance: c.porcentajeAvance
      };
    }).filter(Boolean);

    const globalBalanceNeto = globalIngresos - globalEgresos;
    const globalPorcentajeCumplimiento = globalEgresos > 0 ? (globalIngresos / globalEgresos) * 100 : 0;

    return {
      globalIngresos,
      globalEgresos,
      globalBalanceNeto,
      globalPorcentajeCumplimiento,
      globalServicios,
      globalPersonales,
      globalExtras,
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
  addNewMonth(nombre, clonarDeMesId = null) {
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
        extras: [],
        notas: '',
        movimientos: []
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
