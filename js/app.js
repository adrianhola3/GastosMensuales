/**
 * APP.JS - Controlador moderno de interfaz de usuario (Neo-Fintech Redesign)
 */

/**
 * ÚNICO lugar del cliente donde se decide el rol de la sesión.
 * El resto de la app solo consulta lo que aquí se devuelve.
 *
 * Antes el rol se decidía con ?admin=true y con un PIN escrito en este mismo archivo.
 * Eso no era seguridad: cualquiera que abriera el link podía leer el PIN en el código
 * fuente o simplemente agregar ?admin=true a la URL. Un secreto que viaja en el bundle
 * no es un secreto, así que ya no hay ni PIN ni parámetros que otorguen admin.
 *
 * Ahora el rol sale de la sesión REAL de Supabase: si el usuario se autenticó,
 * es administrador; si no, es lector. Sin backend configurado no hay sesión que
 * consultar, así que todos quedan en lector y se mantiene el aviso de
 * "funcionalidad en desarrollo" como antes.
 *
 * POR QUÉ SIGUE SIENDO SINCRÓNICA: hay varios lugares que la llaman sin esperarla
 * (updateAuthModeUI, setRoleReadOnly, el arranque). Consultar la sesión de
 * supabase-js es asíncrono, así que en vez de romper esos llamados se mantiene
 * una copia en memoria que refresca refrescarSesion(). El valor por defecto es
 * 'lector': ante cualquier duda, menos permisos.
 */
let sesionActual = { rol: 'lector', configurado: false };

function obtenerSesion() {
  return sesionActual;
}

/**
 * Consulta la sesión real de Supabase y actualiza la copia en memoria.
 * @returns {Promise<object>} la sesión ya actualizada.
 */
function refrescarSesion() {
  const remoto = window.gastosRemoto;
  if (!remoto || !remoto.estaConfigurado()) {
    sesionActual = { rol: 'lector', configurado: false };
    return Promise.resolve(sesionActual);
  }

  return Promise.resolve()
    .then(() => (typeof remoto.esperarSesion === 'function' ? remoto.esperarSesion() : remoto.haySesion()))
    .catch(() => false)
    .then((hay) => {
      sesionActual = { rol: hay ? 'admin' : 'lector', configurado: true };
      return sesionActual;
    });
}

/**
 * Escapa texto antes de interpolarlo dentro de innerHTML.
 * Sin esto, un concepto como `<img src=x onerror=alert(1)>` se ejecutaría como HTML.
 * Se aplica a TODO dato que venga del usuario (o de un JSON importado).
 */
function escaparHTML(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

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
  // Modales de Seguridad y Selección Inicial
  const modalSessionRoleSelect = document.getElementById('modalSessionRoleSelect');
  const roleSelectStepChoices = document.getElementById('roleSelectStepChoices');
  const roleSelectStepPending = document.getElementById('roleSelectStepPending');
  const btnChooseReadOnly = document.getElementById('btnChooseReadOnly');
  const btnChooseAdmin = document.getElementById('btnChooseAdmin');
  const btnBackToRoleChoices = document.getElementById('btnBackToRoleChoices');

  // Modo de Seguridad (Solo Lectura vs Administrador)
  const btnToggleAuthMode = document.getElementById('btnToggleAuthMode');
  const authModeIcon = document.getElementById('authModeIcon');
  const authModeLabel = document.getElementById('authModeLabel');

  // Indicador de modo de conexión (localStorage vs nube)
  const indicadorConexion = document.getElementById('indicadorConexion');
  const indicadorConexionTexto = document.getElementById('indicadorConexionTexto');

  // Modal de acceso: aviso de "en desarrollo" o formulario real de login
  const modalAdminAuth = document.getElementById('modalAdminAuth');
  const adminAuthAviso = document.getElementById('adminAuthAviso');
  const formAdminLogin = document.getElementById('formAdminLogin');
  const adminLoginEmail = document.getElementById('adminLoginEmail');
  const adminLoginPassword = document.getElementById('adminLoginPassword');
  const adminLoginError = document.getElementById('adminLoginError');
  const btnAdminLoginSubmit = document.getElementById('btnAdminLoginSubmit');

  // --- SESIÓN Y ROL ---
  // El rol NO se decide acá: sale de obtenerSesion(), la única fuente de verdad.
  // Se eliminó la lectura de query params (?admin=true / ?pin=...), que permitía
  // obtener admin solo agregando un parámetro a la URL.
  const sesion = obtenerSesion();
  let isAdmin = sesion.rol === 'admin';

  // Solo estado de interfaz: recuerda si en esta pestaña el usuario ya eligió
  // cómo entrar. No concede ningún privilegio por sí mismo.
  const ELECCION_ROL_KEY = 'finanzas_session_role_chosen';

  function updateAuthModeUI() {
    const conNube = sesionActual.configurado;
    if (isAdmin) {
      document.body.classList.remove('read-only-mode');
      if (authModeIcon) authModeIcon.textContent = '👑';
      if (authModeLabel) authModeLabel.textContent = 'Modo Administrador';
      if (btnToggleAuthMode) {
        btnToggleAuthMode.className = 'mode-badge admin-active';
        // Con backend conectado, este botón deja de ser un simple interruptor
        // de interfaz y pasa a ser el cierre de sesión real.
        btnToggleAuthMode.title = conNube
          ? 'Haz clic para cerrar sesión y volver al modo solo lectura'
          : 'Haz clic para bloquear y volver al modo solo lectura';
      }
    } else {
      document.body.classList.add('read-only-mode');
      if (authModeIcon) authModeIcon.textContent = '🔒';
      if (authModeLabel) authModeLabel.textContent = 'Solo Lectura';
      if (btnToggleAuthMode) {
        btnToggleAuthMode.className = 'mode-badge readonly-active';
        btnToggleAuthMode.title = conNube
          ? 'Haz clic para iniciar sesión y desbloquear la edición'
          : 'El desbloqueo de edición se activará al conectar el backend';
      }
    }
  }

  // --- INDICADOR DE CONEXIÓN (T6) ---
  // Mínimo y con las mismas variables del tema, para que no desentone.
  function updateIndicadorConexion() {
    if (!indicadorConexion) return;
    const enLinea = sesionActual.configurado;
    indicadorConexion.className = enLinea ? 'conn-badge conn-online' : 'conn-badge conn-offline';
    if (indicadorConexionTexto) {
      indicadorConexionTexto.textContent = enLinea ? 'En línea' : 'Sin conexión';
    }
    indicadorConexion.title = enLinea
      ? 'Los datos se guardan en Supabase y también en este navegador'
      : 'Los datos se guardan solo en este navegador';
  }

  // Aplica una sesión nueva a toda la interfaz. Se llama al arranque, después
  // de iniciar/cerrar sesión y cuando Supabase avisa que cambió la sesión.
  function aplicarSesion() {
    const nueva = obtenerSesion();
    isAdmin = nueva.rol === 'admin';
    updateIndicadorConexion();
    updateAuthModeUI();

    // Si hay sesión válida, no tiene sentido seguir pidiendo elegir rol.
    if (isAdmin) {
      if (modalSessionRoleSelect) modalSessionRoleSelect.classList.remove('active');
      if (modalAdminAuth) modalAdminAuth.classList.remove('active');
      if (adminLoginPassword) adminLoginPassword.value = '';
      if (adminLoginError) adminLoginError.style.display = 'none';
    }
  }

  updateAuthModeUI();
  updateIndicadorConexion();

  // mostrarAviso = true lleva directo al aviso de "pendiente de backend",
  // que es lo que se ve al intentar editar sin tener rol de administrador.
  function openRoleSelectModal(mostrarAviso = false) {
    if (!modalSessionRoleSelect) return;
    if (roleSelectStepChoices) roleSelectStepChoices.style.display = mostrarAviso ? 'none' : 'block';
    if (roleSelectStepPending) roleSelectStepPending.style.display = mostrarAviso ? 'block' : 'none';
    modalSessionRoleSelect.classList.add('active');
  }

  function setRoleReadOnly() {
    // Se vuelve a consultar obtenerSesion(): es el único lugar que decide el rol.
    // La elección explícita de "lector" en esta pestaña solo puede RESTRINGIR el
    // acceso, nunca ampliarlo: si hay sesión real pero el usuario pidió ver en
    // modo lectura, se respeta su elección hasta que recargue o cierre sesión.
    isAdmin = obtenerSesion().rol === 'admin' &&
      sessionStorage.getItem(ELECCION_ROL_KEY) !== 'lector';
    sessionStorage.setItem(ELECCION_ROL_KEY, 'lector');
    updateAuthModeUI();
    if (modalSessionRoleSelect) modalSessionRoleSelect.classList.remove('active');
    showToast('Ingresaste en Modo Solo Lectura', '🔒');
  }

  /**
   * Abre el modal de acceso al administrador.
   * Sin backend configurado se muestra el aviso de "en desarrollo" (igual que
   * antes). Con backend configurado se muestra el formulario de correo y
   * contraseña, que es lo único que puede dar acceso de verdad.
   */
  function openAdminAuthModal() {
    if (!modalAdminAuth) return;
    const conNube = sesionActual.configurado;

    if (adminAuthAviso) adminAuthAviso.style.display = conNube ? 'none' : 'block';
    if (formAdminLogin) formAdminLogin.style.display = conNube ? 'block' : 'none';
    if (adminLoginError) {
      adminLoginError.style.display = 'none';
      adminLoginError.textContent = '';
    }

    modalAdminAuth.classList.add('active');

    if (conNube && adminLoginEmail) {
      setTimeout(() => adminLoginEmail.focus(), 80);
    }
  }

  function mostrarErrorLogin(mensaje) {
    if (!adminLoginError) return;
    adminLoginError.textContent = mensaje;
    adminLoginError.style.display = 'block';
  }

  // AL ENTRAR A LA PÁGINA: muestra la selección si no se eligió en esta pestaña.
  // Se espera a resolver la sesión de Supabase: si el usuario ya tiene la sesión
  // abierta, hay que entrar directo como administrador y no preguntarle nada.
  const hasChosenRole = sessionStorage.getItem(ELECCION_ROL_KEY);
  if (!hasChosenRole) {
    setTimeout(() => {
      openRoleSelectModal(false);
    }, 60);
  }

  // Eventos de selección de rol
  if (btnChooseReadOnly) {
    btnChooseReadOnly.addEventListener('click', () => {
      setRoleReadOnly();
    });
  }

  if (btnChooseAdmin) {
    btnChooseAdmin.addEventListener('click', () => {
      // Antes este botón pedía un PIN. Ese PIN estaba escrito en el código fuente,
      // así que no protegía nada. Ahora el desbloqueo depende del backend y se
      // informa con claridad, en vez de simular una contraseña falsa.
      if (sesionActual.configurado) openAdminAuthModal();
      else openRoleSelectModal(true);
    });
  }

  if (btnBackToRoleChoices) {
    btnBackToRoleChoices.addEventListener('click', () => {
      openRoleSelectModal(false);
    });
  }

  // Envío del login real
  if (formAdminLogin) {
    formAdminLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const remoto = window.gastosRemoto;
      if (!remoto || !remoto.estaConfigurado()) {
        mostrarErrorLogin('La nube no está configurada. Completá los datos en js/config.js.');
        return;
      }

      const email = adminLoginEmail ? adminLoginEmail.value : '';
      const password = adminLoginPassword ? adminLoginPassword.value : '';

      if (!email || !password) {
        mostrarErrorLogin('Escribí tu correo y tu contraseña.');
        return;
      }

      if (btnAdminLoginSubmit) {
        btnAdminLoginSubmit.disabled = true;
        btnAdminLoginSubmit.textContent = 'Entrando…';
      }

      remoto.iniciarSesion(email, password)
        .then(resultado => {
          if (resultado && resultado.ok) {
            sesionActual = { rol: 'admin', configurado: true };
            sessionStorage.setItem(ELECCION_ROL_KEY, 'admin');
            aplicarSesion();
            showToast('Sesión iniciada. Modo Administrador activo.', '👑');
          } else {
            // Se muestra el mensaje real de Supabase, ya traducido al español.
            mostrarErrorLogin(resultado && resultado.error
              ? resultado.error
              : 'No se pudo iniciar sesión.');
          }
        })
        .catch(err => {
          console.error('Error inesperado en el login:', err);
          mostrarErrorLogin('Ocurrió un error inesperado. Intentá de nuevo.');
        })
        .then(() => {
          if (btnAdminLoginSubmit) {
            btnAdminLoginSubmit.disabled = false;
            btnAdminLoginSubmit.textContent = 'Entrar';
          }
        });
    });
  }

  // Botón del pie del Sidebar: con backend conectado hace de cierre de sesión.
  if (btnToggleAuthMode) {
    btnToggleAuthMode.addEventListener('click', () => {
      const remoto = window.gastosRemoto;

      if (isAdmin) {
        if (remoto && sesionActual.configurado) {
          // Cierre de sesión real: corta la sesión en el servidor.
          Promise.resolve(remoto.salirDeSesion())
            .catch(() => {})
            .then(() => {
              sesionActual = { rol: 'lector', configurado: true };
              sessionStorage.setItem(ELECCION_ROL_KEY, 'lector');
              aplicarSesion();
              showToast('Sesión cerrada. Modo Solo Lectura.', '🔒');
            });
        } else {
          sesionActual = { rol: 'lector', configurado: sesionActual.configurado };
          sessionStorage.setItem(ELECCION_ROL_KEY, 'lector');
          aplicarSesion();
          showToast('Modo Solo Lectura activado. Edición bloqueada.', '🔒');
        }
      } else {
        if (sesionActual.configurado) openAdminAuthModal();
        else openRoleSelectModal(true);
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

    if (window.innerWidth <= 1024) {
      toggleSidebar(false);
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
      btn.innerHTML = `<span>${escaparHTML(m.nombre)}</span> <span style="opacity:0.6; font-size:0.75rem;">${m.id === activeId ? '●' : '›'}</span>`;

      btn.addEventListener('click', () => {
        switchView('mes', m.id);
        if (window.innerWidth <= 1024) {
          toggleSidebar(false);
        }
      });

      monthPillsContainer.appendChild(btn);
    });

    // Auto-scroll para centrar la píldora activa
    const activePill = monthPillsContainer.querySelector('.month-pill-btn.active');
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    if (totals.balanceNeto > 0) {
      balanceEl.style.color = 'var(--text-emerald)';
      document.getElementById('monthBalanceStatusLabel').textContent = 'Saldo a favor disponible';
    } else if (totals.balanceNeto < 0) {
      balanceEl.style.color = 'var(--text-rose)';
      document.getElementById('monthBalanceStatusLabel').textContent = 'Déficit (gastos superan ingresos)';
    } else {
      balanceEl.style.color = 'var(--text-cyan)';
      document.getElementById('monthBalanceStatusLabel').textContent = 'Equilibrado (S/ 0.00)';
    }

    const pctAvance = totals.porcentajeAvance.toFixed(1);
    document.getElementById('monthAbonoPercentLabel').textContent = `${pctAvance}%`;

    // 2. Dual Indicadores de Progreso y Métricas en Tiempo Real
    updateLiveProgressAndTotals(month.id);

    // 3. Gastos de Servicios
    renderExpenseCategory('listServiciosFijos', month.servicios.fijos || [], month.id);
    renderExpenseCategory('listServiciosVariables', month.servicios.variables || [], month.id);

    // 4. Gastos Personales
    renderExpenseCategory('listPersonalesFijos', month.personales.fijos || [], month.id);
    renderExpenseCategory('listPersonalesVariables', month.personales.variables || [], month.id);

    // 5. Gastos Extraordinarios
    renderExpenseCategory('listGastosExtra', month.extras || [], month.id);

    // 6. Feed de Transacciones (Flujo de Caja Real)
    renderTransactionFeed(month);

    // 7. Notas del Mes (indicador en botón topbar)
    const notesTextarea = document.getElementById('monthNotesTextarea');
    if (notesTextarea) notesTextarea.value = month.notas || '';
    const btnOpenNotes = document.getElementById('btnOpenNotesModal');
    if (btnOpenNotes) {
      const hasNotes = Boolean(month.notas && month.notas.trim().length > 0);
      btnOpenNotes.classList.toggle('has-notes', hasNotes);
      btnOpenNotes.innerHTML = hasNotes
        ? `<img src="assets/icons/notas.jpg" alt="Notas" class="ui-icon-img ui-icon-xs" /> Notas <span class="notes-dot-badge">●</span>`
        : `<img src="assets/icons/notas.jpg" alt="Notas" class="ui-icon-img ui-icon-xs" /> Notas`;
    }

    // 8. Aplicar segmentos activos (multi-selección interactiva y fluida)
    renderActiveSegments();

    if (sidebarSearchInput && sidebarSearchInput.value.trim().length > 0) {
      performSidebarSearch(sidebarSearchInput.value);
    }
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
      if (totals.balanceNeto > 0) {
        balanceEl.style.color = 'var(--text-emerald)';
      } else if (totals.balanceNeto < 0) {
        balanceEl.style.color = 'var(--text-rose)';
      } else {
        balanceEl.style.color = 'var(--text-cyan)';
      }
    }
    const elBalanceStatus = document.getElementById('monthBalanceStatusLabel');
    if (elBalanceStatus) {
      if (totals.balanceNeto > 0) {
        elBalanceStatus.textContent = 'Saldo a favor disponible';
      } else if (totals.balanceNeto < 0) {
        elBalanceStatus.textContent = 'Déficit (gastos superan ingresos)';
      } else {
        elBalanceStatus.textContent = 'Equilibrado (S/ 0.00)';
      }
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

    // Actualizar indicador en topbar
    const elTopbarBalance = document.getElementById('topbarBalanceValue');
    if (elTopbarBalance) {
      elTopbarBalance.textContent = window.formatCurrency(totals.balanceNeto);
      elTopbarBalance.style.color = totals.balanceNeto >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    }
    const elHeaderMonthBadge = document.getElementById('activeMonthHeaderBadge');
    if (elHeaderMonthBadge) {
      elHeaderMonthBadge.textContent = month.nombre;
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
          <div class="expense-item-title">${escaparHTML(item.concepto)}</div>
          <div class="expense-item-tags">
            <span class="tag-badge ${item.tipo === 'Variable' ? 'tag-variable' : ''}">
              ${escaparHTML(item.tipo || 'Fijo')}
            </span>
            ${item.rango ? `<span class="tag-badge font-mono">Rango: ${escaparHTML(item.rango)}</span>` : ''}
          </div>
        </div>

        <div class="expense-item-amount font-mono">
          ${window.formatCurrency(item.monto)}
        </div>

        <div>
          <button type="button" class="btn-status-toggle ${isPaid ? 'status-pagado' : 'status-pendiente'}" data-item-id="${escaparHTML(item.id)}" title="Presiona para cambiar estado">
            ${isPaid ? '✓ Pagado' : '⏳ Pendiente'}
          </button>
        </div>

        <div>
          <button type="button" class="btn-ghost-rose btn-delete-expense admin-action-btn" data-item-id="${escaparHTML(item.id)}" title="Eliminar gasto">
            ✕
          </button>
        </div>
      `;

      // Evento: Alternar estado en el lugar SIN salto de scroll ni recrear el DOM
      const toggleBtn = row.querySelector('.btn-status-toggle');
      toggleBtn.addEventListener('click', () => {
        if (item.tipo === 'Variable' && item.estado !== 'Pagado') {
          // Si es gasto variable y está pendiente, solicitar el monto efectivamente gastado
          openPayVariableModal(monthId, item, row);
        } else {
          const newState = store.toggleBudgetItemStatus(monthId, item.id);
          item.estado = newState;
          toggleBtn.className = `btn-status-toggle ${newState === 'Pagado' ? 'status-pagado' : 'status-pendiente'}`;
          toggleBtn.textContent = newState === 'Pagado' ? '✓ Pagado' : '⏳ Pendiente';
          updateLiveProgressAndTotals(monthId);
          showToast(`Gasto marcado como "${newState}"`, newState === 'Pagado' ? '✓' : '⏳');
        }
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
    }

    if (filtered.length === 0) {
      feedContainer.innerHTML = `
        <div class="empty-feed-placeholder">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">💸</div>
          <strong>No hay movimientos registrados</strong>
          <p>Usa los botones superiores para registrar un ingreso o gasto.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(m => {
      const item = document.createElement('div');
      item.className = 'transaction-feed-item';
      const isIngreso = m.flujo === 'Ingreso';

      item.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon-circle ${isIngreso ? 'tx-icon-ingreso' : 'tx-icon-gasto'}">
            ${isIngreso ? '↑' : '↓'}
          </div>
          <div class="tx-details">
            <h4>${escaparHTML(m.concepto)}</h4>
            <p>
              <span class="font-mono">${escaparHTML(m.fecha || 'Sin fecha')}</span>
              <span>•</span>
              <span style="font-weight: 700; color: ${isIngreso ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${escaparHTML(m.flujo || 'Movimiento')}</span>
            </p>
          </div>
        </div>

        <div class="tx-right">
          <div class="tx-amount font-mono ${isIngreso ? 'tx-amount-ingreso' : 'tx-amount-gasto'}">
            ${isIngreso ? '+' : '-'} ${window.formatCurrency(m.monto)}
          </div>
          <button type="button" class="btn-ghost-rose btn-delete-tx admin-action-btn" title="Eliminar movimiento">✕</button>
        </div>
      `;

      // Evento: Eliminar movimiento
      const deleteBtn = item.querySelector('.btn-delete-tx');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (confirm(`¿Eliminar movimiento "${m.concepto}"?`)) {
            store.deleteMovement(month.id, m.id);
            renderMonthView();
            showToast(`Movimiento eliminado`, '🗑');
          }
        });
      }

      feedContainer.appendChild(item);
    });
  }

  // --- RENDER: VISTA CONSOLIDADA GENERAL (MULTIMES) ---
  function renderPanelView() {
    const totals = store.calculateGlobalTotals();

    const elKpiIngresos = document.getElementById('kpiGlobalIngresos');
    if (elKpiIngresos) elKpiIngresos.textContent = window.formatCurrency(totals.globalIngresos);

    const elKpiEgresos = document.getElementById('kpiGlobalEgresos');
    if (elKpiEgresos) elKpiEgresos.textContent = window.formatCurrency(totals.globalEgresos);

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
          <button type="button" class="matrix-month-btn" data-month-id="${escaparHTML(r.monthId)}">
            <span>🗓 ${escaparHTML(r.nombre)}</span>
            <span style="font-size: 0.8rem; opacity: 0.8;">→</span>
          </button>
          ${isCurrentActive ? '<span class="matrix-active-badge">Activo</span>' : ''}
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
  const activeSegments = new Set(['servicios', 'personales', 'movimientos', 'extras']);

  function renderActiveSegments() {
    const allKeys = ['servicios', 'personales', 'movimientos', 'extras'];
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

    // Mostrar u ocultar tarjetas con animación sin forzar colapso
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
          }, 160);
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
    const allKeys = ['servicios', 'personales', 'movimientos', 'extras'];
    const allCards = document.querySelectorAll('[data-segment-card]');

    if (segment === 'all') {
      const allActive = allKeys.every(k => activeSegments.has(k));
      const allExpanded = Array.from(allCards).every(c => !c.classList.contains('collapsed'));

      if (!allActive || !allExpanded) {
        // Si no estaban todas visibles y expandidas, activarlas y expandirlas
        allKeys.forEach(k => activeSegments.add(k));
        allCards.forEach(c => {
          c.style.display = 'block';
          c.classList.remove('card-anim-out', 'collapsed');
        });
      } else {
        // Si ya estaban todas expandidas, alternar a contraerlas
        allCards.forEach(c => c.classList.add('collapsed'));
      }
    } else {
      if (activeSegments.has(segment)) {
        activeSegments.delete(segment);
      } else {
        activeSegments.add(segment);
        const c = document.querySelector(`[data-segment-card="${segment}"]`);
        if (c) {
          c.classList.remove('collapsed'); // Inicia expandida
        }
      }
    }
    renderActiveSegments();
  }

  document.querySelectorAll('.segment-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSegment(btn.getAttribute('data-segment'));
    });
  });

  const btnRestoreAll = document.getElementById('btnRestoreAllSegments');
  if (btnRestoreAll) {
    btnRestoreAll.addEventListener('click', () => {
      toggleSegment('all');
    });
  }

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

  // --- BARRA DE BÚSQUEDA ESPECÍFICA EN COLUMNA IZQUIERDA ---
  const sidebarSearchInput = document.getElementById('sidebarSearchInput');
  const btnClearSidebarSearch = document.getElementById('btnClearSidebarSearch');
  const sidebarSearchResultsFeedback = document.getElementById('sidebarSearchResultsFeedback');
  const searchResultsCountText = document.getElementById('searchResultsCountText');

  function performSidebarSearch(rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();

    if (!query) {
      if (btnClearSidebarSearch) btnClearSidebarSearch.style.display = 'none';
      if (sidebarSearchResultsFeedback) sidebarSearchResultsFeedback.style.display = 'none';

      // Restaurar visibilidad de todos los elementos
      document.querySelectorAll('.expense-card-item').forEach(item => {
        item.style.display = '';
      });
      document.querySelectorAll('.transaction-feed-item').forEach(item => {
        item.style.display = '';
      });
      return;
    }

    if (btnClearSidebarSearch) btnClearSidebarSearch.style.display = 'flex';
    if (sidebarSearchResultsFeedback) sidebarSearchResultsFeedback.style.display = 'flex';

    // Desplegar todas las categorías para ver resultados completos
    const allKeys = ['servicios', 'personales', 'movimientos', 'extras'];
    allKeys.forEach(k => activeSegments.add(k));
    document.querySelectorAll('[data-segment-card]').forEach(card => {
      card.style.display = 'block';
      card.classList.remove('collapsed');
    });
    renderActiveSegments();

    let matchCount = 0;

    // 1. Filtrar filas de gastos
    document.querySelectorAll('.expense-card-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      const matches = text.includes(query);
      item.style.display = matches ? '' : 'none';
      if (matches) matchCount++;
    });

    // 2. Filtrar transacciones del feed
    document.querySelectorAll('.transaction-feed-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      const matches = text.includes(query);
      item.style.display = matches ? '' : 'none';
      if (matches) matchCount++;
    });

    if (searchResultsCountText) {
      searchResultsCountText.textContent = `${matchCount} resultado${matchCount === 1 ? '' : 's'} encontrado${matchCount === 1 ? '' : 's'}`;
    }
  }

  if (sidebarSearchInput) {
    sidebarSearchInput.addEventListener('input', (e) => {
      performSidebarSearch(e.target.value);
    });

    sidebarSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        sidebarSearchInput.value = '';
        performSidebarSearch('');
        sidebarSearchInput.blur();
      }
    });
  }

  if (btnClearSidebarSearch) {
    btnClearSidebarSearch.addEventListener('click', () => {
      if (sidebarSearchInput) {
        sidebarSearchInput.value = '';
        sidebarSearchInput.focus();
      }
      performSidebarSearch('');
    });
  }

  // Atajo de teclado: presionar "/" para enfocar la búsqueda
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      if (sidebarSearchInput) {
        sidebarSearchInput.focus();
        sidebarSearchInput.select();
      }
    }
  });

  // --- CONTROL DE SIDEBAR RESPONSIVE (DRAWER MÓVIL) ---
  const btnToggleMobileSidebar = document.getElementById('btnToggleMobileSidebar');
  const btnCloseSidebar = document.getElementById('btnCloseSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const appSidebar = document.getElementById('appSidebar');

  function toggleSidebar(open) {
    if (!appSidebar) return;
    const shouldOpen = open !== undefined ? open : !appSidebar.classList.contains('sidebar-open');
    appSidebar.classList.toggle('sidebar-open', shouldOpen);
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.toggle('active', shouldOpen);
    }
  }

  if (btnToggleMobileSidebar) {
    btnToggleMobileSidebar.addEventListener('click', () => toggleSidebar(true));
  }
  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => toggleSidebar(false));
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
  }

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

  // Switch de vistas de navegación principal con auto-cierre en móvil
  btnNavMes.addEventListener('click', () => {
    switchView('mes');
    if (window.innerWidth <= 1024) toggleSidebar(false);
  });
  btnNavPanel.addEventListener('click', () => {
    switchView('panel');
    if (window.innerWidth <= 1024) toggleSidebar(false);
  });

  // --- NOTAS MODAL & AUTO-SAVE ---
  const modalMonthNotes = document.getElementById('modalMonthNotes');
  const btnOpenNotesModal = document.getElementById('btnOpenNotesModal');
  const modalNotesSubtitle = document.getElementById('modalNotesSubtitle');
  const notesTextarea = document.getElementById('monthNotesTextarea');
  const notesFeedback = document.getElementById('notesFeedback');
  let notesTimer = null;

  if (btnOpenNotesModal && modalMonthNotes) {
    btnOpenNotesModal.addEventListener('click', () => {
      const month = store.getActiveMonth();
      if (notesTextarea) notesTextarea.value = month ? (month.notas || '') : '';
      if (modalNotesSubtitle && month) {
        modalNotesSubtitle.textContent = `Recordatorios y observaciones de ${month.nombre}`;
      }
      modalMonthNotes.classList.add('active');
      setTimeout(() => {
        if (notesTextarea) notesTextarea.focus();
      }, 120);
    });
  }

  if (notesTextarea) {
    notesTextarea.addEventListener('input', () => {
      if (notesFeedback) notesFeedback.textContent = 'Guardando notas...';
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        store.updateNotes(store.data.activeMonthId, notesTextarea.value);
        if (notesFeedback) {
          notesFeedback.textContent = '✓ Guardado automáticamente';
          setTimeout(() => {
            notesFeedback.textContent = 'Guardado en tiempo real';
          }, 2000);
        }
        const month = store.getActiveMonth();
        if (btnOpenNotesModal && month) {
          const hasNotes = Boolean(month.notas && month.notas.trim().length > 0);
          btnOpenNotesModal.classList.toggle('has-notes', hasNotes);
          btnOpenNotesModal.innerHTML = hasNotes
            ? `<img src="assets/icons/notas.jpg" alt="Notas" class="ui-icon-img ui-icon-xs" /> Notas <span class="notes-dot-badge">●</span>`
            : `<img src="assets/icons/notas.jpg" alt="Notas" class="ui-icon-img ui-icon-xs" /> Notas`;
        }
      }, 400);
    });
  }

  // --- MODAL: AGREGAR GASTO PRESUPUESTADO ---
  const formAddBudget = document.getElementById('formAddBudget');
  const selectBudgetSection = document.getElementById('budgetSection');
  const selectBudgetSubsectionField = document.getElementById('selectBudgetSubsectionField') || document.getElementById('budgetSubsectionField');
  const inputBudgetRangeField = document.getElementById('inputBudgetRangeField') || document.getElementById('budgetRangeField');

  function openAddBudgetModal(defaultSection = 'servicios', defaultSubsection = 'fijos') {
    if (formAddBudget) formAddBudget.reset();
    if (selectBudgetSection) selectBudgetSection.value = defaultSection;
    if (defaultSection === 'extras') {
      if (selectBudgetSubsectionField) selectBudgetSubsectionField.style.display = 'none';
      if (inputBudgetRangeField) inputBudgetRangeField.style.display = 'none';
    } else {
      if (selectBudgetSubsectionField) selectBudgetSubsectionField.style.display = 'block';
      const elSub = document.getElementById('budgetSubsection');
      if (elSub) elSub.value = defaultSubsection;
      if (inputBudgetRangeField) inputBudgetRangeField.style.display = defaultSubsection === 'variables' ? 'block' : 'none';
    }
    const modal = document.getElementById('modalAddBudget');
    if (modal) modal.classList.add('active');
    setTimeout(() => {
      const elConcepto = document.getElementById('budgetConcepto');
      if (elConcepto) elConcepto.focus();
    }, 100);
  }

  if (selectBudgetSection) {
    selectBudgetSection.addEventListener('change', (e) => {
      if (e.target.value === 'extras') {
        if (selectBudgetSubsectionField) selectBudgetSubsectionField.style.display = 'none';
        if (inputBudgetRangeField) inputBudgetRangeField.style.display = 'none';
      } else {
        if (selectBudgetSubsectionField) selectBudgetSubsectionField.style.display = 'block';
      }
    });
  }

  const elBudgetSubsection = document.getElementById('budgetSubsection');
  if (elBudgetSubsection) {
    elBudgetSubsection.addEventListener('change', (e) => {
      if (inputBudgetRangeField) inputBudgetRangeField.style.display = e.target.value === 'variables' ? 'block' : 'none';
    });
  }

  // Botones para abrir modal de presupuesto
  const btnHeaderAddBudget = document.getElementById('btnHeaderAddBudget');
  if (btnHeaderAddBudget) btnHeaderAddBudget.addEventListener('click', () => openAddBudgetModal());

  const btnAddServ = document.querySelector('.btn-quick-add-service');
  if (btnAddServ) btnAddServ.addEventListener('click', () => openAddBudgetModal('servicios', 'fijos'));

  const btnAddPers = document.querySelector('.btn-quick-add-personal');
  if (btnAddPers) btnAddPers.addEventListener('click', () => openAddBudgetModal('personales', 'fijos'));

  const btnAddExt = document.querySelector('.btn-quick-add-extra');
  if (btnAddExt) btnAddExt.addEventListener('click', () => openAddBudgetModal('extras'));

  if (formAddBudget) {
    formAddBudget.addEventListener('submit', (e) => {
      e.preventDefault();
      const section = selectBudgetSection ? selectBudgetSection.value : 'servicios';
      const elSub = document.getElementById('budgetSubsection');
      const subsection = elSub ? elSub.value : 'fijos';
      const concepto = document.getElementById('budgetConcepto').value.trim();
      const monto = parseFloat(document.getElementById('budgetMonto').value) || 0;
      const elRango = document.getElementById('budgetRango');
      const rango = elRango ? elRango.value.trim() : '';
      const elEstado = document.getElementById('budgetEstado');
      const estado = elEstado ? elEstado.value : 'Pendiente';
      const tipo = section === 'extras' ? 'Extra' : (subsection === 'variables' ? 'Variable' : 'Fijo');

      store.addBudgetItem(store.data.activeMonthId, section, subsection, {
        concepto,
        monto,
        tipo,
        rango,
        estado
      });

      const modal = document.getElementById('modalAddBudget');
      if (modal) modal.classList.remove('active');
      renderMonthView();
      showToast(`Gasto "${concepto}" agregado`, '✓');
    });
  }

  // --- MODAL: CONFIRMAR PAGO DE GASTO VARIABLE CON MONTO REAL ---
  let currentVariableRowTarget = null;
  let currentVariableItemTarget = null;

  function openPayVariableModal(monthId, item, row) {
    const modal = document.getElementById('modalPayVariableExpense');
    if (!modal) return;

    document.getElementById('payVarMonthId').value = monthId;
    document.getElementById('payVarItemId').value = item.id;
    document.getElementById('payVarItemTitle').textContent = item.concepto;
    document.getElementById('payVarItemEstimated').innerHTML = `Presupuestado: <strong class="font-mono" style="color: var(--accent-cyan); font-size: 0.84rem;">${window.formatCurrency(item.monto)}</strong>`;

    const rangeBadge = document.getElementById('payVarItemRangeBadge');
    if (rangeBadge) {
      if (item.rango) {
        rangeBadge.textContent = `Rango sugerido: ${item.rango}`;
        rangeBadge.style.display = 'inline-block';
      } else {
        rangeBadge.style.display = 'none';
      }
    }

    const inputAmount = document.getElementById('payVarActualAmount');
    inputAmount.value = Number(item.monto).toFixed(2);

    currentVariableRowTarget = row;
    currentVariableItemTarget = item;

    modal.classList.add('active');
    setTimeout(() => {
      inputAmount.focus();
      inputAmount.select();
    }, 80);
  }

  const formPayVar = document.getElementById('formPayVariableExpense');
  if (formPayVar) {
    formPayVar.addEventListener('submit', (e) => {
      e.preventDefault();
      const monthId = document.getElementById('payVarMonthId').value;
      const itemId = document.getElementById('payVarItemId').value;
      const inputAmount = document.getElementById('payVarActualAmount');
      const realAmount = parseFloat(inputAmount.value);

      if (isNaN(realAmount) || realAmount < 0) {
        alert('Por favor ingresa un monto válido.');
        return;
      }

      // Actualizar monto real y estado Pagado en la base de datos
      store.updateBudgetItem(monthId, itemId, { monto: realAmount, estado: 'Pagado' });

      // Actualizar el estado del ítem en memoria local
      if (currentVariableItemTarget) {
        currentVariableItemTarget.monto = realAmount;
        currentVariableItemTarget.estado = 'Pagado';
      }

      // Actualizar visualmente la fila en el DOM inmediatamente
      if (currentVariableRowTarget) {
        const toggleBtn = currentVariableRowTarget.querySelector('.btn-status-toggle');
        if (toggleBtn) {
          toggleBtn.className = 'btn-status-toggle status-pagado';
          toggleBtn.textContent = '✓ Pagado';
        }
        const amountEl = currentVariableRowTarget.querySelector('.expense-item-amount');
        if (amountEl) {
          amountEl.textContent = window.formatCurrency(realAmount);
        }
      }

      // Actualizar métricas vivas y subtotales
      updateLiveProgressAndTotals(monthId);

      // Cerrar modal
      const modal = document.getElementById('modalPayVariableExpense');
      if (modal) modal.classList.remove('active');

      showToast(`Gasto pagado por ${window.formatCurrency(realAmount)}`, '✓');
    });
  }

  // --- MODAL: REGISTRAR MOVIMIENTO (FLUJO DE CAJA) ---
  const formAddMovement = document.getElementById('formAddMovement');
  const modalMovementTitle = document.getElementById('modalMovementTitle');
  const inputMovFlujo = document.getElementById('movFlujo');
  const inputMovFecha = document.getElementById('movFecha');
  const btnSubmitMovement = document.getElementById('btnSubmitMovement');

  function openMovementModal(tipoFlujo = 'Ingreso') {
    formAddMovement.reset();
    inputMovFecha.value = new Date().toISOString().slice(0, 10);
    if (inputMovFlujo) inputMovFlujo.value = tipoFlujo;

    if (tipoFlujo === 'Ingreso') {
      modalMovementTitle.textContent = 'Registrar Ingreso';
      btnSubmitMovement.textContent = 'Registrar Ingreso';
      btnSubmitMovement.className = 'btn btn-success btn-lg';
    } else {
      modalMovementTitle.textContent = 'Registrar Gasto';
      btnSubmitMovement.textContent = 'Registrar Gasto';
      btnSubmitMovement.className = 'btn btn-danger btn-lg';
    }

    modalAddMovement.classList.add('active');
    setTimeout(() => {
      const elConcepto = document.getElementById('movConcepto');
      if (elConcepto) elConcepto.focus();
    }, 120);
  }

  const btnHAddIncome = document.getElementById('btnHeaderAddIncome');
  if (btnHAddIncome) btnHAddIncome.addEventListener('click', () => openMovementModal('Ingreso'));
  const btnQAIncome = document.getElementById('btnQuickActionIncome');
  if (btnQAIncome) btnQAIncome.addEventListener('click', () => openMovementModal('Ingreso'));
  const btnQAExpense = document.getElementById('btnQuickActionExpense');
  if (btnQAExpense) btnQAExpense.addEventListener('click', () => openMovementModal('Gasto'));

  if (formAddMovement) {
    formAddMovement.addEventListener('submit', (e) => {
      e.preventDefault();
      const concepto = document.getElementById('movConcepto').value.trim();
      const monto = parseFloat(document.getElementById('movMonto').value) || 0;
      const flujo = inputMovFlujo ? inputMovFlujo.value : 'Ingreso';
      const fecha = inputMovFecha.value;

      store.addMovement(store.data.activeMonthId, {
        concepto,
        monto,
        flujo,
        categoria: flujo === 'Ingreso' ? 'Ingreso' : 'Gasto',
        retornable: 'No',
        estado: 'Pagado',
        fecha
      });

      modalAddMovement.classList.remove('active');
      renderMonthView();
      showToast(`${flujo} "${concepto}" registrado`, flujo === 'Ingreso' ? '↑' : '↓');
    });
  }

  // --- MODAL: AGREGAR NUEVO MES ---
  const formNewMonth = document.getElementById('formNewMonth');
  const selectCloneFrom = document.getElementById('newMonthCloneSelect');
  const btnOpenNM = document.getElementById('btnOpenNewMonthModal');

  if (btnOpenNM && formNewMonth && selectCloneFrom) {
    btnOpenNM.addEventListener('click', () => {
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
  }

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
      // Bloquear cierre al hacer clic fuera si es el modal de selección obligatoria de rol
      if (e.target.id === 'modalSessionRoleSelect') {
        const sheet = e.target.querySelector('.modal-sheet');
        if (sheet) {
          sheet.classList.remove('modal-shake');
          void sheet.offsetWidth; // trigger reflow
          sheet.classList.add('modal-shake');
        }
        return; // No permitir salir sin elegir una de las opciones
      }
      e.target.classList.remove('active');
    }
  });

  // Prevenir que Escape cierre el modal de selección obligatoria
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const roleModal = document.getElementById('modalSessionRoleSelect');
      if (roleModal && roleModal.classList.contains('active')) {
        const sheet = roleModal.querySelector('.modal-sheet');
        if (sheet) {
          sheet.classList.remove('modal-shake');
          void sheet.offsetWidth;
          sheet.classList.add('modal-shake');
        }
        e.preventDefault();
        e.stopPropagation();
      }
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

  // Inicialización: se dibuja ya con la copia local para que la app abra
  // instantánea, sin esperar a la red.
  switchView(store.data.currentView || 'mes');

  // --- ARRANQUE ASÍNCRONO: nube y sesión ---
  // 1) Cuando la carga remota termine y traiga datos distintos, se redibuja.
  if (typeof store.alCambiarEstado === 'function') {
    store.alCambiarEstado(() => {
      switchView(store.data.currentView || 'mes');
    });
  }

  // 2) Se resuelve la sesión real de Supabase y se refleja en toda la interfaz.
  const remoto = window.gastosRemoto;
  if (remoto && typeof remoto.alCambiarSesion === 'function') {
    remoto.alCambiarSesion(() => {
      // Un cambio de sesión fuera de este flujo (por ejemplo, cerrar sesión en
      // otra pestaña) se respeta igual.
      if (remoto.haySesion()) {
        sesionActual = { rol: 'admin', configurado: true };
        sessionStorage.setItem(ELECCION_ROL_KEY, 'admin');
      } else {
        sesionActual = { rol: 'lector', configurado: remoto.estaConfigurado() };
        sessionStorage.setItem(ELECCION_ROL_KEY, 'lector');
      }
      aplicarSesion();
    });
  }

  refrescarSesion()
    .then(() => {
      aplicarSesion();
      // Si la sesión ya estaba activa, el aviso de "en desarrollo" y la
      // selección de rol sobran: se ocultan y se entra directo a editar.
      if (obtenerSesion().rol === 'admin') {
        if (modalAdminAuth) modalAdminAuth.classList.remove('active');
        if (modalSessionRoleSelect) modalSessionRoleSelect.classList.remove('active');
        showToast('Sesión activa. Modo Administrador.', '👑');
      }
    })
    .catch(e => {
      console.warn('No se pudo resolver la sesión inicial:', e);
    });
});
