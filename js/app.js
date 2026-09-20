/**
 * APP.JS - Controlador moderno de interfaz de usuario (Neo-Fintech Redesign)
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.financialStore;
  let activeFeedFilter = 'all'; // 'all', 'ingreso', 'gasto', 'pagado', 'pendiente'

  // --- Elementos del DOM ---
  const viewMes = document.getElementById('viewMes');
  const viewPanel = document.getElementById('viewPanel');
  const btnNavMes = document.getElementById('btnNavMes');
  const btnNavPanel = document.getElementById('btnNavPanel');
  const monthPillsContainer = document.getElementById('monthPillsContainer');
  const toastEl = document.getElementById('neoToast');
  const toastText = document.getElementById('toastText');
  const toastIcon = document.getElementById('toastIcon');

  // Modales
  const modalAddBudget = document.getElementById('modalAddBudget');
  const modalAddMovement = document.getElementById('modalAddMovement');
  const modalNewMonth = document.getElementById('modalNewMonth');
  const modalAdminAuth = document.getElementById('modalAdminAuth');
  const formAdminAuth = document.getElementById('formAdminAuth');
  const adminPinInput = document.getElementById('adminPinInput');

  // Modo de Seguridad (Solo Lectura vs Administrador)
  const btnToggleAuthMode = document.getElementById('btnToggleAuthMode');
  const authModeIcon = document.getElementById('authModeIcon');
  const authModeLabel = document.getElementById('authModeLabel');

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === 'true' || urlParams.get('pin') === 'adripro1234') {
    localStorage.setItem('finanzas_is_admin', 'true');
  }
  if (urlParams.get('view') === 'readonly') {
    localStorage.setItem('finanzas_is_admin', 'false');
  }

  // Por defecto en nuevos navegadores (como el del padre), inicia en false (Solo Lectura)
  let isAdmin = localStorage.getItem('finanzas_is_admin') === 'true';

  function updateAuthModeUI() {
    if (isAdmin) {
      document.body.classList.remove('read-only-mode');
      if (authModeIcon) authModeIcon.textContent = '👑';
      if (authModeLabel) authModeLabel.textContent = 'Modo Administrador';
      if (btnToggleAuthMode) {
        btnToggleAuthMode.className = 'mode-badge admin-active';
        btnToggleAuthMode.title = 'Haz clic para bloquear y volver al modo solo lectura';
      }
    } else {
      document.body.classList.add('read-only-mode');
      if (authModeIcon) authModeIcon.textContent = '🔒';
      if (authModeLabel) authModeLabel.textContent = 'Solo Lectura';
      if (btnToggleAuthMode) {
        btnToggleAuthMode.className = 'mode-badge readonly-active';
        btnToggleAuthMode.title = 'Haz clic para ingresar PIN y desbloquear edición';
      }
    }
  }

  updateAuthModeUI();

  if (btnToggleAuthMode) {
    btnToggleAuthMode.addEventListener('click', () => {
      if (isAdmin) {
        isAdmin = false;
        localStorage.setItem('finanzas_is_admin', 'false');
        updateAuthModeUI();
        showToast('Modo Solo Lectura activado. Edición bloqueada.', '🔒');
      } else {
        if (modalAdminAuth) {
          adminPinInput.value = '';
          modalAdminAuth.classList.add('active');
          setTimeout(() => adminPinInput.focus(), 150);
        }
      }
    });
  }

  if (formAdminAuth) {
    formAdminAuth.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredPin = adminPinInput.value.trim();
      const validPin = localStorage.getItem('finanzas_admin_pin') || 'adripro1234';

      if (enteredPin === 'adripro1234' || enteredPin === validPin) {
        isAdmin = true;
        localStorage.setItem('finanzas_is_admin', 'true');
        localStorage.setItem('finanzas_admin_pin', 'adripro1234');
        updateAuthModeUI();
        modalAdminAuth.classList.remove('active');
        showToast('¡Modo Administrador desbloqueado!', '👑');
      } else {
        alert('PIN o contraseña incorrecta.');
        adminPinInput.value = '';
        adminPinInput.focus();
      }
    });
  }

  // --- ENRUTAMIENTO DE VISTAS ---
  function switchView(viewName, targetMonthId = null) {
    if (targetMonthId) {
      store.data.activeMonthId = targetMonthId;
      store.save();
    }
    store.data.currentView = viewName;
    store.save();

    if (viewName === 'panel') {
      viewMes.classList.remove('active');
      viewPanel.classList.add('active');
      btnNavMes.classList.remove('active');
      btnNavPanel.classList.add('active');
      renderPanelView();
    } else {
      viewMes.classList.add('active');
      viewPanel.classList.remove('active');
      btnNavMes.classList.add('active');
      btnNavPanel.classList.remove('active');
      renderMonthView();
    }
  }

  // --- RENDERIZADO DEL SELECTOR DE MESES (HORIZONTAL PILLS) ---
  function renderMonthPills() {
    monthPillsContainer.innerHTML = '';
    const months = store.getAllMonthsList();
    const activeId = store.data.activeMonthId;

    months.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `month-pill-btn ${m.id === activeId ? 'active' : ''}`;
      btn.innerHTML = `<span>🗓</span> ${m.nombre}`;

      btn.addEventListener('click', () => {
        switchView('mes', m.id);
      });

      monthPillsContainer.appendChild(btn);
    });

    // Auto-scroll para centrar la píldora activa
    const activePill = monthPillsContainer.querySelector('.month-pill-btn.active');
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  // --- RENDER: VISTA MENSUAL ---
  function renderMonthView() {
    renderMonthPills();

    const month = store.getActiveMonth();
    if (!month) return;

    const totals = store.calculateMonthTotals(month.id);

    // 1. Tarjetas de Métricas Principales (Grandes)
    document.getElementById('monthTotalIngresos').textContent = window.formatCurrency(totals.totalIngresos);
    const movs = month.movimientos || [];
    const ingresosCount = movs.filter(x => x.flujo === 'Ingreso').length;
    document.getElementById('monthIngresosCount').textContent = `${ingresosCount} abono${ingresosCount === 1 ? '' : 's'} registrado${ingresosCount === 1 ? '' : 's'}`;

    document.getElementById('monthTotalEgresos').textContent = window.formatCurrency(totals.totalEgresos);
    document.getElementById('monthGastosCount').textContent = `${totals.pagadosCount} de ${totals.totalItemsPresupuesto} gastos pagados`;

    const balanceEl = document.getElementById('monthBalanceNeto');
    balanceEl.textContent = window.formatCurrency(totals.balanceNeto);
    if (totals.balanceNeto >= 0) {
      balanceEl.style.color = 'var(--accent-emerald)';
      document.getElementById('monthBalanceStatusLabel').textContent = 'Superávit / Saldo a favor';
    } else {
      balanceEl.style.color = 'var(--accent-rose)';
      document.getElementById('monthBalanceStatusLabel').textContent = 'Monto pendiente de cobertura';
    }

    const pctAvance = totals.porcentajeAvance.toFixed(1);
    document.getElementById('monthAbonoPercentLabel').textContent = `${pctAvance}%`;

    // 2. Dual Indicadores de Progreso y Métricas en Tiempo Real
    updateLiveProgressAndTotals(month.id);

    // 3. Gastos de Servicios
    renderExpenseCategory('listServiciosFijos', month.servicios.fijos || [], month.id);

    // 4. Gastos Personales
    renderExpenseCategory('listPersonalesFijos', month.personales.fijos || [], month.id);
    renderExpenseCategory('listPersonalesVariables', month.personales.variables || [], month.id);

    // 5. Gastos Extraordinarios
    renderExpenseCategory('listGastosExtra', month.extras || [], month.id);

    // 6. Feed de Transacciones (Flujo de Caja Real)
    renderTransactionFeed(month);

    // 7. Notas del Mes
    const notesTextarea = document.getElementById('monthNotesTextarea');
    if (notesTextarea) notesTextarea.value = month.notas || '';

    // 8. Aplicar segmentos activos (multi-selección interactiva y fluida)
    renderActiveSegments();
  }

  // Función dedicada para actualizar métricas, subtotales y barras de progreso al instante SIN alterar el DOM de los gastos (sin salto de scroll)
  function updateLiveProgressAndTotals(monthId) {
    const month = store.getMonth(monthId);
    if (!month) return;
    const totals = store.calculateMonthTotals(monthId);

    // Valores en tarjetas principales
    const elIngresos = document.getElementById('monthTotalIngresos');
    if (elIngresos) elIngresos.textContent = window.formatCurrency(totals.totalIngresos);
    const movs = month.movimientos || [];
    const ingresosCount = movs.filter(x => x.flujo === 'Ingreso').length;
    const elIngresosCount = document.getElementById('monthIngresosCount');
    if (elIngresosCount) elIngresosCount.textContent = `${ingresosCount} abono${ingresosCount === 1 ? '' : 's'} registrado${ingresosCount === 1 ? '' : 's'}`;

    const elEgresos = document.getElementById('monthTotalEgresos');
    if (elEgresos) elEgresos.textContent = window.formatCurrency(totals.totalEgresos);
    const elGastosCount = document.getElementById('monthGastosCount');
    if (elGastosCount) elGastosCount.textContent = `${totals.pagadosCount} de ${totals.totalItemsPresupuesto} gastos pagados`;

    const balanceEl = document.getElementById('monthBalanceNeto');
    if (balanceEl) {
      balanceEl.textContent = window.formatCurrency(totals.balanceNeto);
      balanceEl.style.color = totals.balanceNeto >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    }
    const elBalanceStatus = document.getElementById('monthBalanceStatusLabel');
    if (elBalanceStatus) {
      elBalanceStatus.textContent = totals.balanceNeto >= 0 ? 'Superávit / Saldo a favor' : 'Monto pendiente de cobertura';
    }
    const elAbonoPercent = document.getElementById('monthAbonoPercentLabel');
    if (elAbonoPercent) elAbonoPercent.textContent = `${totals.porcentajeAvance.toFixed(1)}%`;

    // Dual Barras de Progreso (Sticky)
    const pctPagado = (totals.porcentajePagado || 0).toFixed(1);
    const elPaidTextInfo = document.getElementById('paidTextInfo');
    if (elPaidTextInfo) {
      elPaidTextInfo.innerHTML = `<span>✓</span> Gastos Pagados: <strong>${window.formatCurrency(totals.montoPagadoPresupuesto)}</strong> de <strong>${window.formatCurrency(totals.totalEgresos)}</strong>`;
    }
    const elPaidPercentBadge = document.getElementById('paidPercentBadge');
    if (elPaidPercentBadge) {
      elPaidPercentBadge.textContent = `${pctPagado}% Pagado (${totals.pagadosCount} de ${totals.totalItemsPresupuesto})`;
    }
    const elPaidBarFill = document.getElementById('paidBarFill');
    if (elPaidBarFill) {
      elPaidBarFill.style.width = `${Math.min(100, totals.porcentajePagado || 0)}%`;
    }
    const elPaidSummaryLabel = document.getElementById('paidSummaryLabel');
    if (elPaidSummaryLabel) {
      elPaidSummaryLabel.textContent = `✓ Pagado: ${window.formatCurrency(totals.montoPagadoPresupuesto)}`;
    }
    const elPendingSummaryLabel = document.getElementById('pendingSummaryLabel');
    if (elPendingSummaryLabel) {
      elPendingSummaryLabel.textContent = `⏳ Pendiente: ${window.formatCurrency(totals.montoPendientePresupuesto)}`;
    }

    const pctAvance = totals.porcentajeAvance.toFixed(1);
    const elCoverageTextInfo = document.getElementById('coverageTextInfo');
    if (elCoverageTextInfo) {
      elCoverageTextInfo.textContent = `📈 Cobertura: ${pctAvance}%`;
    }

    // Subtotales en las tarjetas
    const elSubServFijos = document.getElementById('subtotalServiciosFijos');
    if (elSubServFijos) elSubServFijos.textContent = window.formatCurrency(totals.subtotalServiciosFijos);
    const elSubServVar = document.getElementById('subtotalServiciosVariables');
    if (elSubServVar) elSubServVar.textContent = window.formatCurrency(totals.subtotalServiciosVariables);
    const elSubServTot = document.getElementById('subtotalTotalServicios');
    if (elSubServTot) elSubServTot.textContent = window.formatCurrency(totals.subtotalServicios);

    const elSubPersFijos = document.getElementById('subtotalPersonalesFijos');
    if (elSubPersFijos) elSubPersFijos.textContent = window.formatCurrency(totals.subtotalPersonalesFijos);
    const elSubPersVar = document.getElementById('subtotalPersonalesVariables');
    if (elSubPersVar) elSubPersVar.textContent = window.formatCurrency(totals.subtotalPersonalesVariables);
    const elSubPersTot = document.getElementById('subtotalTotalPersonales');
    if (elSubPersTot) elSubPersTot.textContent = window.formatCurrency(totals.subtotalPersonales);

    const elSubExtras = document.getElementById('subtotalGastosExtra');
    if (elSubExtras) elSubExtras.textContent = window.formatCurrency(totals.subtotalExtras);

    const elGrandTotal = document.getElementById('grandTotalAmount');
    if (elGrandTotal) elGrandTotal.textContent = window.formatCurrency(totals.totalEgresos);

    // Tags de resumen en encabezados de acordeón
    const tagServ = document.getElementById('summaryTagServicios');
    if (tagServ) tagServ.textContent = window.formatCurrency(totals.subtotalServicios);
    const tagPers = document.getElementById('summaryTagPersonales');
    if (tagPers) tagPers.textContent = window.formatCurrency(totals.subtotalPersonales);
    const tagExt = document.getElementById('summaryTagExtras');
    if (tagExt) tagExt.textContent = window.formatCurrency(totals.subtotalExtras);
    const tagMovs = document.getElementById('summaryTagMovimientos') || document.getElementById('summaryTagFlujo');
    if (tagMovs) tagMovs.textContent = `${movs.length} movs`;

    // Badges en las píldoras de navegación de segmentos
    const badgeServ = document.getElementById('badgeSegServicios');
    if (badgeServ) badgeServ.textContent = window.formatCurrency(totals.subtotalServicios);
    const badgePers = document.getElementById('badgeSegPersonales');
    if (badgePers) badgePers.textContent = window.formatCurrency(totals.subtotalPersonales);
    const badgeExt = document.getElementById('badgeSegExtras');
    if (badgeExt) badgeExt.textContent = window.formatCurrency(totals.subtotalExtras);
    const badgeMovs = document.getElementById('badgeSegMovimientos') || document.getElementById('badgeSegFlujo');
    if (badgeMovs) badgeMovs.textContent = `${movs.length} movs`;

    // Minibarras de progreso por debajo de cada segmento
    const miniServ = document.getElementById('miniBarServicios');
    if (miniServ) miniServ.style.width = `${Math.min(100, totals.pctPagadoServicios || 0)}%`;
    const miniPers = document.getElementById('miniBarPersonales');
    if (miniPers) miniPers.style.width = `${Math.min(100, totals.pctPagadoPersonales || 0)}%`;
    const miniExt = document.getElementById('miniBarExtras');
    if (miniExt) miniExt.style.width = `${Math.min(100, totals.pctPagadoExtras || 0)}%`;
    const miniMovs = document.getElementById('miniBarMovimientos');
    if (miniMovs) miniMovs.style.width = `${Math.min(100, totals.pctPagadoMovimientos || 0)}%`;
  }

  // Renderizador de filas amplias de gastos
  function renderExpenseCategory(containerId, items, monthId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.25rem 1.75rem; color: var(--text-muted); font-size: 0.88rem; font-style: italic;">
          Sin gastos registrados en esta categoría.
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'expense-card-item';
      const isPaid = item.estado === 'Pagado';

      row.innerHTML = `
        <div class="expense-item-info">
          <div class="expense-item-title">${item.concepto}</div>
          <div class="expense-item-tags">
            <span class="tag-badge ${item.tipo === 'Variable' ? 'tag-variable' : ''}">
              ${item.tipo || 'Fijo'}
            </span>
            ${item.rango ? `<span class="tag-badge font-mono">Rango: ${item.rango}</span>` : ''}
          </div>
        </div>

        <div class="expense-item-amount font-mono">
          ${window.formatCurrency(item.monto)}
        </div>

        <div>
          <button type="button" class="btn-status-toggle ${isPaid ? 'status-pagado' : 'status-pendiente'}" data-item-id="${item.id}" title="Presiona para cambiar estado">
            ${isPaid ? '✓ Pagado' : '⏳ Pendiente'}
          </button>
        </div>

        <div>
          <button type="button" class="btn-ghost-rose btn-delete-expense admin-action-btn" data-item-id="${item.id}" title="Eliminar gasto">
            ✕
          </button>
        </div>
      `;

      // Evento: Alternar estado en el lugar SIN salto de scroll ni recrear el DOM
      const toggleBtn = row.querySelector('.btn-status-toggle');
      toggleBtn.addEventListener('click', () => {
        const newState = store.toggleBudgetItemStatus(monthId, item.id);
        toggleBtn.className = `btn-status-toggle ${newState === 'Pagado' ? 'status-pagado' : 'status-pendiente'}`;
        toggleBtn.textContent = newState === 'Pagado' ? '✓ Pagado' : '⏳ Pendiente';
        updateLiveProgressAndTotals(monthId);
        showToast(`Gasto marcado como "${newState}"`, newState === 'Pagado' ? '✓' : '⏳');
      });

      // Evento: Eliminar gasto
      const deleteBtn = row.querySelector('.btn-delete-expense');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (confirm(`¿Eliminar gasto "${item.concepto}"?`)) {
            store.deleteBudgetItem(monthId, item.id);
            renderMonthView();
            showToast(`Gasto "${item.concepto}" eliminado`, '🗑');
          }
        });
      }

      container.appendChild(row);
    });
  }

  // Renderizador de Feed de Transacciones (Flujo de Caja Real)
  function renderTransactionFeed(month) {
    const feedContainer = document.getElementById('transactionsFeedList');
    feedContainer.innerHTML = '';
    const movs = month.movimientos || [];

    // Filtrar según filtro activo
    let filtered = movs;
    if (activeFeedFilter === 'ingreso') {
      filtered = movs.filter(m => m.flujo === 'Ingreso');
    } else if (activeFeedFilter === 'gasto') {
      filtered = movs.filter(m => m.flujo === 'Gasto');
    } else if (activeFeedFilter === 'pagado') {
      filtered = movs.filter(m => m.estado === 'Pagado');
    } else if (activeFeedFilter === 'pendiente') {
      filtered = movs.filter(m => m.estado === 'Pendiente');
    }

    if (filtered.length === 0) {
      feedContainer.innerHTML = `
        <div class="empty-feed-placeholder">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">💸</div>
          <strong>No hay transacciones para este filtro</strong>
          <p>Usa los botones superiores para registrar un nuevo abono o pago ejecutado.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(m => {
      const item = document.createElement('div');
      item.className = 'transaction-feed-item';
      const isIngreso = m.flujo === 'Ingreso';
      const isPaid = m.estado === 'Pagado';

      item.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon-circle ${isIngreso ? 'tx-icon-ingreso' : 'tx-icon-gasto'}">
            ${isIngreso ? '↑' : '↓'}
          </div>
          <div class="tx-details">
            <h4>${m.concepto}</h4>
            <p>
              <span class="font-mono">${m.fecha || 'Sin fecha'}</span>
              <span>•</span>
              <span>${m.categoria || 'General'}</span>
              ${m.retornable === 'Sí' ? '<span style="color:#38bdf8; font-weight:700;">• Retornable</span>' : ''}
            </p>
          </div>
        </div>

        <div class="tx-right">
          <div class="tx-amount font-mono ${isIngreso ? 'tx-amount-ingreso' : 'tx-amount-gasto'}">
            ${isIngreso ? '+' : '-'} ${window.formatCurrency(m.monto)}
          </div>
          <button type="button" class="btn-status-toggle ${isPaid ? 'status-pagado' : 'status-pendiente'}" style="min-width: 110px; padding: 0.45rem 0.9rem; font-size: 0.8rem;">
            ${isPaid ? '✓ Pagado' : '⏳ Pendiente'}
          </button>
          <button type="button" class="btn-ghost-rose btn-delete-tx" title="Eliminar transacción">✕</button>
        </div>
      `;

      // Alternar estado de la transacción en el lugar (sin saltos ni scroll)
      const feedToggleBtn = item.querySelector('.btn-status-toggle');
      feedToggleBtn.addEventListener('click', () => {
        const newState = store.toggleMovementStatus(month.id, m.id);
        feedToggleBtn.className = `btn-status-toggle ${newState === 'Pagado' ? 'status-pagado' : 'status-pendiente'}`;
        feedToggleBtn.textContent = newState === 'Pagado' ? '✓ Pagado' : '⏳ Pendiente';
        updateLiveProgressAndTotals(month.id);
        showToast(`Movimiento marcado como "${newState}"`, newState === 'Pagado' ? '✓' : '⏳');
      });

      // Eliminar transacción
      item.querySelector('.btn-delete-tx').addEventListener('click', () => {
        if (confirm(`¿Eliminar transacción "${m.concepto}"?`)) {
          store.deleteMovement(month.id, m.id);
          renderMonthView();
          showToast(`Transacción eliminada`, '🗑');
        }
      });

      feedContainer.appendChild(item);
    });
  }

  // --- RENDER: VISTA CONSOLIDADA GENERAL (MULTIMES) ---
  function renderPanelView() {
    const totals = store.calculateGlobalTotals();

    // KPIs Globales
    document.getElementById('kpiGlobalIngresos').textContent = window.formatCurrency(totals.globalIngresos);
    document.getElementById('kpiGlobalEgresos').textContent = window.formatCurrency(totals.globalEgresos);
    
    const balanceEl = document.getElementById('kpiGlobalBalance');
    balanceEl.textContent = window.formatCurrency(totals.globalBalanceNeto);
    balanceEl.style.color = totals.globalBalanceNeto >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';

    document.getElementById('kpiGlobalCumplimiento').textContent = `${totals.globalPorcentajeCumplimiento.toFixed(1)}%`;

    // Matriz Multimes
    const tbody = document.getElementById('globalMatrixBody');
    tbody.innerHTML = '';

    totals.rows.forEach(r => {
      const tr = document.createElement('tr');
      const pct = r.porcentajeAvance;
      const isCurrentActive = r.monthId === store.data.activeMonthId;

      tr.innerHTML = `
        <td>
          <button type="button" class="matrix-month-btn" data-month-id="${r.monthId}">
            <span>🗓 ${r.nombre}</span>
            <span style="font-size: 0.8rem; opacity: 0.8;">→</span>
          </button>
          ${isCurrentActive ? '<span style="font-size:0.7rem; background:rgba(99,102,241,0.2); color:#a5b4fc; font-weight:700; padding:2px 8px; border-radius:999px; margin-left:6px;">Activo</span>' : ''}
        </td>
        <td class="font-mono text-right">${window.formatCurrency(r.servicios)}</td>
        <td class="font-mono text-right">${window.formatCurrency(r.personales)}</td>
        <td class="font-mono text-right">${window.formatCurrency(r.extras)}</td>
        <td class="font-mono text-right" style="color: var(--accent-rose); font-weight: 700;">${window.formatCurrency(r.totalEgresos)}</td>
        <td class="font-mono text-right" style="color: var(--accent-emerald); font-weight: 700;">${window.formatCurrency(r.ingresos)}</td>
        <td class="font-mono text-right" style="font-weight: 800; color: ${r.balanceNeto >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
          ${window.formatCurrency(r.balanceNeto)}
        </td>
        <td class="font-mono text-center" style="font-weight: 700;">${pct.toFixed(1)}%</td>
        <td style="min-width: 130px; text-align: center;">
          <div style="height: 8px; background: var(--bg-card-inner); border-radius: 999px; overflow: hidden; border: 1px solid var(--border-subtle); margin: 0 auto;">
            <div style="width: ${Math.min(100, pct)}%; height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-emerald)); border-radius: 999px;"></div>
          </div>
        </td>
      `;

      tr.querySelector('.matrix-month-btn').addEventListener('click', () => {
        switchView('mes', r.monthId);
      });

      tbody.appendChild(tr);
    });

    // Fila de Totales
    const tfoot = document.getElementById('globalMatrixFoot');
    tfoot.innerHTML = `
      <tr>
        <td style="font-weight: 800; color: #ffffff;">TOTAL AÑO</td>
        <td class="font-mono text-right" style="font-weight: 700;">${window.formatCurrency(totals.globalServicios)}</td>
        <td class="font-mono text-right" style="font-weight: 700;">${window.formatCurrency(totals.globalPersonales)}</td>
        <td class="font-mono text-right" style="font-weight: 700;">${window.formatCurrency(totals.globalExtras)}</td>
        <td class="font-mono text-right" style="color: var(--accent-rose); font-weight: 800;">${window.formatCurrency(totals.globalEgresos)}</td>
        <td class="font-mono text-right" style="color: var(--accent-emerald); font-weight: 800;">${window.formatCurrency(totals.globalIngresos)}</td>
        <td class="font-mono text-right" style="font-weight: 800; color: ${totals.globalBalanceNeto >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
          ${window.formatCurrency(totals.globalBalanceNeto)}
        </td>
        <td class="font-mono text-center" style="font-weight: 800;">${totals.globalPorcentajeCumplimiento.toFixed(1)}%</td>
        <td></td>
      </tr>
    `;

    // Renderizar Gráficos Chart.js
    setTimeout(() => {
      if (window.renderGlobalCharts) {
        window.renderGlobalCharts();
      }
    }, 60);
  }

  // --- FILTROS DE FEED DE MOVIMIENTOS ---
  document.querySelectorAll('.feed-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.feed-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFeedFilter = pill.getAttribute('data-filter');
      const month = store.getActiveMonth();
      renderTransactionFeed(month);
    });
  });

  // --- SELECTOR DE SEGMENTOS: MULTI-SELECCIÓN INTERACTIVA CON ANIMACIÓN ---
  const activeSegments = new Set(['servicios']);

  function renderActiveSegments() {
    const allKeys = ['servicios', 'personales', 'extras', 'movimientos', 'notas'];
    const isAllSelected = allKeys.every(k => activeSegments.has(k));

    // Actualizar estado activo en botones
    document.querySelectorAll('.segment-pill-btn').forEach(btn => {
      const seg = btn.getAttribute('data-segment');
      if (seg === 'all') {
        btn.classList.toggle('active', isAllSelected);
      } else {
        btn.classList.toggle('active', activeSegments.has(seg));
      }
    });

    // Mostrar u ocultar tarjetas con animación
    let visibleCount = 0;
    document.querySelectorAll('[data-segment-card]').forEach(card => {
      const seg = card.getAttribute('data-segment-card');
      const isCardActive = activeSegments.has(seg) || (seg === 'flujo' && activeSegments.has('movimientos'));

      if (isCardActive) {
        visibleCount++;
        if (card.style.display === 'none' || !card.style.display) {
          card.style.display = 'block';
          card.classList.remove('card-anim-out');
          card.classList.add('card-anim-in');
        }
      } else {
        if (card.style.display !== 'none') {
          card.classList.remove('card-anim-in');
          card.classList.add('card-anim-out');
          setTimeout(() => {
            const stillActive = activeSegments.has(seg) || (seg === 'flujo' && activeSegments.has('movimientos'));
            if (!stillActive) {
              card.style.display = 'none';
              card.classList.remove('card-anim-out');
            }
          }, 180);
        }
      }
    });

    // Mensaje de estado vacío si no hay ningún segmento seleccionado
    const emptyNotice = document.getElementById('noSegmentsSelectedNotice');
    if (emptyNotice) {
      emptyNotice.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  }

  function toggleSegment(segment) {
    const allKeys = ['servicios', 'personales', 'extras', 'movimientos', 'notas'];
    if (segment === 'all') {
      const isAllSelected = allKeys.every(k => activeSegments.has(k));
      if (isAllSelected) {
        activeSegments.clear();
      } else {
        allKeys.forEach(k => activeSegments.add(k));
      }
    } else {
      if (activeSegments.has(segment)) {
        activeSegments.delete(segment);
      } else {
        activeSegments.add(segment);
      }
    }
    renderActiveSegments();
  }

  document.querySelectorAll('.segment-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSegment(btn.getAttribute('data-segment'));
    });
  });

  // --- ACORDEÓN: COLAPSAR / EXPANDIR TARJETAS AL HACER CLIC EN SU ENCABEZADO ---
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // No colapsar si se hace clic en botones de acción
      const card = header.closest('.content-card-box');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });

  // --- NAVEGACIÓN SECUENCIAL DE MESES ---
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    const order = store.data.mesesOrden;
    const currIdx = order.indexOf(store.data.activeMonthId);
    if (currIdx > 0) {
      switchView('mes', order[currIdx - 1]);
    } else {
      showToast('Estás en el primer mes registrado', 'ℹ');
    }
  });

  document.getElementById('btnNextMonth').addEventListener('click', () => {
    const order = store.data.mesesOrden;
    const currIdx = order.indexOf(store.data.activeMonthId);
    if (currIdx < order.length - 1) {
      switchView('mes', order[currIdx + 1]);
    } else {
      showToast('Estás en el último mes registrado', 'ℹ');
    }
  });

  // Switch de vistas de navegación principal
  btnNavMes.addEventListener('click', () => switchView('mes'));
  btnNavPanel.addEventListener('click', () => switchView('panel'));

  // --- NOTAS AUTO-SAVE ---
  let notesTimer = null;
  const notesTextarea = document.getElementById('monthNotesTextarea');
  const notesFeedback = document.getElementById('notesFeedback');

  notesTextarea.addEventListener('input', () => {
    notesFeedback.textContent = 'Guardando notas...';
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      store.updateNotes(store.data.activeMonthId, notesTextarea.value);
      notesFeedback.textContent = '✓ Guardado automáticamente';
      setTimeout(() => {
        notesFeedback.textContent = 'Guardado en tiempo real';
      }, 2000);
    }, 500);
  });

  // --- MODAL: AGREGAR GASTO PRESUPUESTADO ---
  const formAddBudget = document.getElementById('formAddBudget');
  const selectBudgetSection = document.getElementById('budgetSection');
  const selectBudgetSubsectionField = document.getElementById('budgetSubsectionField');
  const inputBudgetRangeField = document.getElementById('budgetRangeField');

  function openAddBudgetModal(defaultSection = 'servicios', defaultSubsection = 'fijos') {
    formAddBudget.reset();
    selectBudgetSection.value = defaultSection;
    if (defaultSection === 'extras') {
      selectBudgetSubsectionField.style.display = 'none';
      inputBudgetRangeField.style.display = 'none';
    } else {
      selectBudgetSubsectionField.style.display = 'block';
      document.getElementById('budgetSubsection').value = defaultSubsection;
      inputBudgetRangeField.style.display = defaultSubsection === 'variables' ? 'block' : 'none';
    }
    modalAddBudget.classList.add('active');
  }

  selectBudgetSection.addEventListener('change', (e) => {
    if (e.target.value === 'extras') {
      selectBudgetSubsectionField.style.display = 'none';
      inputBudgetRangeField.style.display = 'none';
    } else {
      selectBudgetSubsectionField.style.display = 'block';
    }
  });

  document.getElementById('budgetSubsection').addEventListener('change', (e) => {
    inputBudgetRangeField.style.display = e.target.value === 'variables' ? 'block' : 'none';
  });

  // Botones para abrir modal de presupuesto
  document.getElementById('btnHeaderAddBudget').addEventListener('click', () => openAddBudgetModal());
  document.querySelector('.btn-quick-add-service').addEventListener('click', () => openAddBudgetModal('servicios', 'fijos'));
  document.querySelector('.btn-quick-add-personal').addEventListener('click', () => openAddBudgetModal('personales', 'fijos'));
  document.querySelector('.btn-quick-add-extra').addEventListener('click', () => openAddBudgetModal('extras'));

  formAddBudget.addEventListener('submit', (e) => {
    e.preventDefault();
    const section = selectBudgetSection.value;
    const subsection = document.getElementById('budgetSubsection').value;
    const concepto = document.getElementById('budgetConcepto').value;
    const monto = parseFloat(document.getElementById('budgetMonto').value) || 0;
    const rango = document.getElementById('budgetRango').value;
    const estado = document.getElementById('budgetEstado').value;
    const tipo = section === 'extras' ? 'Extra' : (subsection === 'variables' ? 'Variable' : 'Fijo');

    store.addBudgetItem(store.data.activeMonthId, section, subsection, {
      concepto,
      monto,
      tipo,
      rango,
      estado
    });

    modalAddBudget.classList.remove('active');
    renderMonthView();
    showToast(`Gasto "${concepto}" agregado`, '✓');
  });

  // --- MODAL: REGISTRAR MOVIMIENTO (FLUJO DE CAJA) ---
  const formAddMovement = document.getElementById('formAddMovement');
  const modalMovementTitle = document.getElementById('modalMovementTitle');
  const selectMovFlujo = document.getElementById('movFlujo');
  const inputMovFecha = document.getElementById('movFecha');
  const btnSubmitMovement = document.getElementById('btnSubmitMovement');

  function openMovementModal(tipoFlujo = 'Ingreso') {
    formAddMovement.reset();
    inputMovFecha.value = new Date().toISOString().slice(0, 10);
    selectMovFlujo.value = tipoFlujo;

    if (tipoFlujo === 'Ingreso') {
      modalMovementTitle.textContent = 'Registrar Ingreso / Abono';
      btnSubmitMovement.textContent = 'Registrar Ingreso';
      btnSubmitMovement.className = 'btn btn-success btn-lg';
      document.getElementById('movCategoria').value = 'Ingreso / Sueldo';
    } else {
      modalMovementTitle.textContent = 'Registrar Gasto Real Ejecutado';
      btnSubmitMovement.textContent = 'Registrar Gasto';
      btnSubmitMovement.className = 'btn btn-danger btn-lg';
      document.getElementById('movCategoria').value = 'Gastos Extra';
    }

    modalAddMovement.classList.add('active');
  }

  document.getElementById('btnHeaderAddIncome').addEventListener('click', () => openMovementModal('Ingreso'));
  document.getElementById('btnQuickActionIncome').addEventListener('click', () => openMovementModal('Ingreso'));
  document.getElementById('btnQuickActionExpense').addEventListener('click', () => openMovementModal('Gasto'));

  formAddMovement.addEventListener('submit', (e) => {
    e.preventDefault();
    const concepto = document.getElementById('movConcepto').value;
    const monto = parseFloat(document.getElementById('movMonto').value) || 0;
    const flujo = selectMovFlujo.value;
    const categoria = document.getElementById('movCategoria').value;
    const retornable = document.getElementById('movRetornable').value;
    const estado = document.getElementById('movEstado').value;
    const fecha = inputMovFecha.value;

    store.addMovement(store.data.activeMonthId, {
      concepto,
      monto,
      flujo,
      categoria,
      retornable,
      estado,
      fecha
    });

    modalAddMovement.classList.remove('active');
    renderMonthView();
    showToast(`Movimiento "${concepto}" registrado`, flujo === 'Ingreso' ? '↑' : '↓');
  });

  // --- MODAL: AGREGAR NUEVO MES ---
  const formNewMonth = document.getElementById('formNewMonth');
  const selectCloneFrom = document.getElementById('newMonthCloneSelect');

  document.getElementById('btnOpenNewMonthModal').addEventListener('click', () => {
    formNewMonth.reset();
    selectCloneFrom.innerHTML = '<option value="">-- No clonar (mes vacío) --</option>';
    store.getAllMonthsList().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `Clonar gastos recurrentes de ${m.nombre}`;
      if (m.id === store.data.activeMonthId) opt.selected = true;
      selectCloneFrom.appendChild(opt);
    });
    modalNewMonth.classList.add('active');
  });

  formNewMonth.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = document.getElementById('newMonthName').value.trim();
    const cloneId = selectCloneFrom.value || null;
    if (!nombre) return;

    const newId = store.addNewMonth(nombre, cloneId);
    modalNewMonth.classList.remove('active');
    switchView('mes', newId);
    showToast(`Nuevo mes "${nombre}" creado`, '🎉');
  });

  // Cierre general de modales
  document.querySelectorAll('.btn-close-sheet, .btn-close-sheet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active');
    }
  });

  // --- TOAST NOTIFICATIONS ---
  let toastTimer = null;
  function showToast(message, icon = '✓') {
    if (!toastEl) return;
    toastIcon.textContent = icon;
    toastText.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2600);
  }

  // Inicialización
  switchView(store.data.currentView || 'mes');
});
