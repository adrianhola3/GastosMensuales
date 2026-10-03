/**
 * CHARTS.JS - Gráficos interactivos adaptados al tema Neo-Fintech Obsidian
 *
 * LA PALETA SE LEE DE LOS TOKENS CSS. Antes estaba hardcodeada y verificada en
 * el navegador: el donut devolvia `["#0ea5e9","#8b5cf6","#f59e0b"]` (saturacion
 * 0.86, 0.79, 0.96) y las barras `#10b981` / `#38bdf8`. Eso es el arcoiris que
 * la iteracion de paleta queria eliminar y que sobrevivia solo porque esta
 * archivo no podia leer variables CSS: Chart.js dibuja sobre un `<canvas>` y
 * no resuelve `var(--cat-servicios)`.
 *
 * `getComputedStyle(...).getPropertyValue('--cat-servicios')` devuelve el
 * token YA RESUELTO, como cadena de color que el canvas entiende. Por eso
 * aca no hay ni un literal de color: si la paleta cambia en `css/styles.css`,
 * los graficos cambian con ella.
 *
 * Postura del color en los graficos:
 *   · Donut: un acento por categoria, y solo ahi. Las 3 categorias del
 *     consolidado son 3Fatias distintas, asi que el color si significa algo
 *     (que porcion del gasto es de cada una).
 *   · Barras: dos series que NO son categorias (acumulado de ingresos vs
 *     balance acumulado), asi que van en los acentos de ESTADO, no de
 *     identidad: emerald = ingresos, rose = balance.
 *
 * Se conserva la restriction de la iteracion anterior: nada de SF Pro, nada de
 * `Inter` ni `JetBrains Mono` (esas dos familias no estan instaladas y el
 * navegador caia al fallback). Las dos unicas familias que se piden son
 * `system-ui` y un mono del sistema.
 */

let barChartInstance = null;
let donutChartInstance = null;

/**
 * Lee un token de :root ya resuelto.
 *
 * CERO literales de color en todo este archivo. Tampoco en el fallback: si
 * `--text-muted` no existiera, el fallback es `--text-secondary`, que es otro
 * token. El ultimo eslabon de cada cadena es un token que styles.css declara
 * siempre (`--bg-card` es la superficie de la tarjeta), asi que la cadena no
 * puede quedar vacia sin que el CSS entero este roto, y en ese caso el canvas
 * no tiene nada que dibujar igual.
 */
function readToken(tokenName, fallbackToken) {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(tokenName)
      .trim();
    if (value) return value;
  } catch (err) {
    /* sin getComputedStyle no hay tokens: se cae al token de respaldo */
  }
  return fallbackToken
    ? getComputedStyle(document.documentElement).getPropertyValue(fallbackToken).trim()
    : '';
}

/**
 * Una sola línea centrada cuando la serie está vacía.
 *
 * Sin esto, `beginAtZero` sobre datos todos-cero produce una escala 0..1 con
 * rótulos "S/ 0.2", "S/ 0.4"... que no son cifras del usuario, y el anillo
 * dibuja tres arcos neutros que parecen datos. Los dos son actively misleading:
 * un eje que inventa una escala y un anillo que finge una composición.
 *
 * El texto se pinta con los MISMOS tokens que el resto del gráfico, así que no
 * hay literales de color en este archivo.
 */
const sinDatos = {
  id: 'gastos-sin-datos',
  afterDraw(chart, args, opts) {
    if (!opts || !opts.texto) return;
    const ctx = chart.ctx;
    const area = chart.chartArea;
    if (!area) return;
    ctx.save();
    ctx.fillStyle = readToken('--text-muted', '--text-secondary');
    ctx.font = `12px ${readToken('--font-body')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.texto, (area.left + area.right) / 2, (area.top + area.bottom) / 2);
    ctx.restore();
  },
};

function renderGlobalCharts() {
  if (typeof Chart === 'undefined') return;
  if (!window.financialStore) return;

  const totals = window.financialStore.calculateGlobalTotals();
  if (!totals || !totals.rows) return;

  const labels = totals.rows.map(r => r.corto || r.nombre);

  // Calcular series acumulativas históricas período a período
  let runningIngresos = 0;
  let runningBalance = 0;
  const ingresosAcumulados = [];
  const balanceAcumulado = [];

  totals.rows.forEach(r => {
    runningIngresos += (r.ingresos || 0);
    const mesBalance = (r.balanceNeto !== undefined) ? r.balanceNeto : ((r.ingresos || 0) - (r.totalEgresos || 0));
    runningBalance += mesBalance;
    ingresosAcumulados.push(runningIngresos);
    balanceAcumulado.push(runningBalance);
  });

  // Tokens de estado. Los lee una vez por render: `getComputedStyle` fuerza
  // recalculo de estilo, asi que llamarlo por serie seria trabajo de mas.
  //
  // TRAMPA DE ESTA API: `getPropertyValue` sobre una custom property devuelve
  // el token YA SUSTITUIDO pero NO resuelto a color. Un token declarado como
  // `color-mix(in srgb, ...)` vuelve como la cadena literal
  // "color-mix(in srgb, #74b496 72%, #f4f5f7)", y el canvas no la parsea: la
  // serie se dibuja invisible. Verificado en el navegador antes de corregirlo:
  // las barras salian con `dsColors[0] === 'color-mix(in srgb, #74b496 72%, ...)'`
  // y el area bajo la curva era negra.
  //
  // Por eso las barras usan `--accent-emerald` / `--accent-rose` y NO
  // `--text-emerald` / `--text-rose`: los primeros son hex planos. El donut si
  // puede usar `--cat-*`, que tambien son hex planos.
  const colorIngresos = readToken('--accent-emerald', '--accent-cyan');
  const colorBalance = readToken('--accent-rose', '--accent-cyan');
  const colorAxis = readToken('--text-muted', '--text-secondary');
  // El grid se lee de `--hairline-strong`, no de `--hairline`: sobre la
  // superficie #0f1015 un filete al 9% es invisible y el eje queda flotando.
  const colorGrid = readToken('--hairline-strong', '--hairline');
  // El tooltip va sobre `--bg-inset`: con `--bg-surface` el cuadro del tooltip
  // queda del mismo color que la sección y sus bordes son lo único que se ve.
  const colorTooltipBg = readToken('--bg-inset', '--bg-surface');
  const colorTooltipBorder = readToken('--hairline-strong', '--hairline');
  const colorTooltipTitle = readToken('--text-main', '--text-primary');
  const colorTooltipBody = readToken('--text-secondary', '--text-main');
  const fontSans = readToken('--font-body');
  const fontMono = readToken('--font-mono');

  // Sin datos acumulados, `beginAtZero` produce una escala 0..1 y el eje rotula
  // "S/ 0.2", "S/ 0.4"... que no son cifras del usuario. En ese caso el eje se
  // oculta en vez de mentir: queda el campo vacío con su leyenda.
  const hayDatosSerie = ingresosAcumulados.concat(balanceAcumulado)
    .some(v => Number(v) !== 0);

  // Marca la sección para que la hoja baje el lienzo a 120px cuando no hay
  // nada que dibujar. Sin esto quedaban 280px de vacío por una línea de texto.
  const marcarVacio = (canvas, vacio) => {
    const seccion = canvas.closest('.chart-section');
    if (seccion) seccion.classList.toggle('is-empty', vacio);
  };

  // 1. Gráfico de Barras: Ingresos Acumulados vs Balance Neto Acumulado
  const barCanvas = document.getElementById('chartTrendBar') || document.getElementById('globalBarChart');
  if (barCanvas) {
    marcarVacio(barCanvas, !hayDatosSerie);
    if (barChartInstance) {
      barChartInstance.destroy();
      barChartInstance = null;
    }

    barChartInstance = new Chart(barCanvas, {
      type: 'bar',
      plugins: [sinDatos],
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ingresos acumulados',
            data: ingresosAcumulados,
            backgroundColor: colorIngresos,
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: 'Balance acumulado',
            data: balanceAcumulado,
            backgroundColor: colorBalance,
            borderRadius: 6,
            borderSkipped: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          'gastos-sin-datos': {
            texto: hayDatosSerie ? '' : 'Sin ingresos registrados en el acumulado.'
          },
          legend: {
            // Sin datos, una leyenda de dos series y cero barras es ruido: se
            // oculta y queda la sola línea de estado vacío.
            display: hayDatosSerie,
            position: 'top',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              color: colorAxis,
              font: { family: fontSans, weight: '400', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: colorTooltipBg,
            borderColor: colorTooltipBorder,
            borderWidth: 1,
            titleColor: colorTooltipTitle,
            bodyColor: colorTooltipBody,
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label}: ${window.formatCurrency(context.raw)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            display: hayDatosSerie,
            ticks: {
              color: colorAxis,
              font: { family: fontMono, size: 11 },
              maxTicksLimit: 6,
              callback: function(value) {
                return 'S/ ' + value;
              }
            },
            grid: {
              color: colorGrid
            }
          },
          x: {
            ticks: {
              color: colorAxis,
              font: { family: fontSans, weight: '400' }
            },
            grid: {
              display: false
            }
          }
        }
      }
    });
  }

  // 2. Gráfico Doughnut: Distribución acumulada por categorías
  const donutCanvas = document.getElementById('chartCategoryDonut') || document.getElementById('globalDonutChart');
  if (donutCanvas) {
    if (donutChartInstance) {
      donutChartInstance.destroy();
      donutChartInstance = null;
    }

    const catLabels = ['Servicios del hogar', 'Gastos personales', 'Gastos extra'];
    const catData = [totals.globalServicios, totals.globalPersonales, totals.globalExtras];
    const totalGastos = catData.reduce((a, b) => a + b, 0);

    // Un acento por categoria, leido del token. El estado vacio usa las
    // superficies, no los acentos: sin datos no hay nada que categorizar y un
    // arcoiris de 3 tonos seria mentira visual.
    const colorServicios = readToken('--cat-servicios', '--text-main');
    const colorPersonales = readToken('--cat-personales', '--text-main');
    const colorExtras = readToken('--cat-extras', '--text-main');
    const colorSurface = readToken('--bg-surface', '--bg-card');
    const colorInset = readToken('--bg-inset', '--bg-card');
    const colorCard = readToken('--bg-card');

    donutChartInstance = new Chart(donutCanvas, {
      type: 'doughnut',
      plugins: [sinDatos],
      data: {
        labels: catLabels,
        datasets: [{
          data: totalGastos > 0 ? catData : [1, 1, 1],
          backgroundColor: totalGastos > 0
            ? [colorServicios, colorPersonales, colorExtras]
            : [colorSurface, colorInset, colorSurface],
          hoverOffset: 4,
          borderWidth: 0,
          borderColor: colorCard
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          'gastos-sin-datos': {
            texto: totalGastos > 0 ? '' : 'Sin gastos registrados en el acumulado.'
          },
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              color: colorAxis,
              font: { family: fontSans, size: 12, weight: '400' },
              padding: 14
            }
          },
          tooltip: {
            backgroundColor: colorTooltipBg,
            borderColor: colorTooltipBorder,
            borderWidth: 1,
            titleColor: colorTooltipTitle,
            bodyColor: colorTooltipBody,
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: function(context) {
                if (totalGastos === 0) return ' Sin gastos registrados aún';
                const percent = ((catData[context.dataIndex] / totalGastos) * 100).toFixed(1);
                return ` ${context.label}: ${window.formatCurrency(catData[context.dataIndex])} (${percent}%)`;
              }
            }
          }
        }
      }
    });
  }
}

window.renderGlobalCharts = renderGlobalCharts;
