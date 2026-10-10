/* diag-extras.mjs - Medir el alta de Extras, la geometria del scroll y que
 * textos NO estan centrados. Instrumento de medicion, no test: escribe numeros
 * que un humano tiene que revisar despues (ver la leccion de #198).
 *
 *   node odd\tasks\diag-extras.mjs
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();

  /* --- 0. MODO LECTOR: el estado en el que arranca el usuario real -------- */
  const lector = await sb.eval(`(() => {
    document.body.classList.add('read-only-mode');
    const vis = sel => {
      const e = document.querySelector(sel);
      if (!e) return 'AUSENTE';
      return getComputedStyle(e).display;
    };
    return {
      bodyReadOnly: document.body.classList.contains('read-only-mode'),
      altaServicios: vis('.btn-quick-add-service'),
      altaPersonales: vis('.btn-quick-add-personal'),
      altaExtras: vis('.btn-quick-add-extra'),
      altaGastoHeader: vis('#btnHeaderAddBudget'),
      altaIngresoHeader: vis('#btnHeaderAddIncome'),
      altaIngresoMov: vis('#btnQuickActionIncome'),
      altaGastoMov: vis('#btnQuickActionExpense'),
      nuevoMes: vis('#btnOpenNewMonthModal'),
      nota: vis('#btnOpenNotesModal'),
      toggleFila: vis('.btn-status-toggle'),
    };
  })()`);
  console.log('\n=== 0. CONTROLES DE ESCRITURA EN MODO LECTOR (display) ===');
  console.log(JSON.stringify(lector, null, 2));
  await sb.eval(`document.body.classList.remove('read-only-mode'); 'ok'`);

  /* --- 1. EL ALTA DE EXTRAS EN MODO ADMIN --------------------------------- */
  const alta = await sb.eval(`(() => {
    const b = document.querySelector('.btn-quick-add-extra');
    const g = document.querySelector('#ledgerGroupExtras');
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    const gr = g.getBoundingClientRect();
    return {
      existe: !!b,
      texto: b.textContent.trim(),
      colorTexto: cs.color,
      fondo: cs.backgroundColor,
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      dentroDelViewport: r.top >= 0 && r.bottom <= innerHeight,
      grupoY: +gr.y.toFixed(1),
      grupoH: +gr.height.toFixed(1),
      ordenEnDoc: [...document.querySelectorAll('#ledgerBody > *')].map(e => e.id || e.className),
    };
  })()`);
  console.log('\n=== 1. ALTA DE EXTRAS (modo admin) ===');
  console.log(JSON.stringify(alta, null, 2));

  /* --- 2. EL CLICK REAL: abre el modal? ----------------------------------- */
  const clickRes = await sb.eval(`(() => {
    document.querySelector('.btn-quick-add-extra').click();
    const m = document.getElementById('modalAddBudget');
    return {
      modalActivo: m.classList.contains('active'),
      tituloModal: document.getElementById('modalBudgetTitle').textContent,
      seccionSeleccionada: document.getElementById('budgetSection').value,
      subCampoDisplay: getComputedStyle(document.getElementById('selectBudgetSubsectionField')).display,
      rangoCampoDisplay: getComputedStyle(document.getElementById('inputBudgetRangeField')).display,
    };
  })()`);
  console.log('\n=== 2. CLICK EN EL BOTON DE EXTRAS ===');
  console.log(JSON.stringify(clickRes, null, 2));

  /* --- 3. EL FLUJO COMPLETO: escribir y enviar ---------------------------- */
  const submitRes = await sb.eval(`(() => {
    document.getElementById('budgetConcepto').value = 'PRUEBA EXTRA DIAGNOSTICO';
    document.getElementById('budgetMonto').value = '42.50';
    document.getElementById('budgetEstado').value = 'Pendiente';
    document.getElementById('formAddBudget').requestSubmit();
    const mes = window.financialStore.getActiveMonth();
    return {
      modalCerrado: !document.getElementById('modalAddBudget').classList.contains('active'),
      extrasEnStore: (mes.extras || []).map(x => x.concepto + '|' + x.monto + '|' + x.tipo),
      filasExtrasRenderizadas: document.querySelectorAll('#ledgerRowsExtras .expense-card-item').length,
      conteoGrupoExtras: document.querySelector('#ledgerGroupExtras [data-group-count]').textContent,
      subtotalExtras: document.getElementById('summaryTagExtras').textContent,
    };
  })()`);
  console.log('\n=== 3. FLUJO COMPLETO DE ALTA EN EXTRAS ===');
  console.log(JSON.stringify(submitRes, null, 2));

  /* --- 4. GEOMETRIA DEL SCROLL ------------------------------------------- */
  const geom = await sb.eval(`(() => {
    const main = document.querySelector('.main-content');
    const barra = document.querySelector('.ledger-toolbar');
    const grupos = [...document.querySelectorAll('.ledger-group')].map(g => {
      const hr = g.querySelector('.ledger-group-head').getBoundingClientRect();
      const primera = g.querySelector('.expense-card-item, .transaction-feed-item');
      const pr = primera ? primera.getBoundingClientRect() : null;
      return {
        grupo: g.id,
        headY: +hr.y.toFixed(1),
        primeraFilaY: pr ? +pr.y.toFixed(1) : null,
        filas: g.querySelectorAll('.expense-card-item, .transaction-feed-item').length,
      };
    });
    const doc = document.documentElement;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      mainScrollHeight: main.scrollHeight,
      mainClientHeight: main.clientHeight,
      scrollTotalPagina: doc.scrollHeight,
      barraY: +barra.getBoundingClientRect().y.toFixed(1),
      barraH: +barra.getBoundingClientRect().height.toFixed(1),
      grupos,
    };
  })()`);
  console.log('\n=== 4. GEOMETRIA ===');
  console.log(JSON.stringify(geom, null, 2));

  /* --- 5. TEXTOS QUE NO ESTAN CENTRADOS ---------------------------------- */
  /* No es "todo texto debe ir centrado": una fila de libro justifiable a la
   * izquierda esta bien. Se busca el caso donde la hoja YA centra en un sitio y
   * no en el hermano, y donde un bloque declara `center` y un hijo lo pisa. */
  const alineacion = await sb.eval(`(() => {
    const out = [];
    const visit = el => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const t = n.nodeValue.trim();
          if (t.length < 2 || !n.parentElement) continue;
          const p = n.parentElement;
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
          const pr = p.getBoundingClientRect();
          if (pr.width < 8 || pr.height < 6) continue;
          const rng = document.createRange();
          rng.selectNodeContents(n);
          const tr = rng.getBoundingClientRect();
          if (tr.width < 2) continue;
          const padre = p.parentElement;
          const prp = padre ? padre.getBoundingClientRect() : null;
          const dCentro = Math.abs((tr.x + tr.width / 2) - (prp ? prp.x + prp.width / 2 : 0));
          const nombre = e => e.id ? '#' + e.id
            : e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' && e.className ? e.className.trim().split(/\\s+/)[0] : '');
          out.push({
            sel: nombre(p), texto: t.slice(0, 34),
            alignPropio: cs.textAlign,
            padreSel: padre ? nombre(padre) : null,
            padreAlign: padre ? getComputedStyle(padre).textAlign : null,
            offsetCentroPx: +dCentro.toFixed(1),
            anchoTexto: +tr.width.toFixed(1),
            anchoPadre: prp ? +prp.width.toFixed(1) : null,
          });
        } else if (n.nodeType === 1) visit(n);
      }
    };
    visit(document.body);
    return out;
  })()`);
  console.log('\n=== 5. DESALINEACION HORIZONTAL (distancia del centro, px) ===');
  const desalineados = alineacion.filter(a =>
    a.anchoPadre && a.anchoTexto < a.anchoPadre - 4 && a.offsetCentroPx > 6);
  console.log('nodos de texto visibles:', alineacion.length, '| desalineados >6px:', desalineados.length);
  console.table(desalineados.map(a => ({
    sel: a.sel, texto: a.texto, align: a.alignPropio,
    padre: a.padreSel, pAlign: a.padreAlign, offset: a.offsetCentroPx,
  })));
} finally {
  await sb.close();
}