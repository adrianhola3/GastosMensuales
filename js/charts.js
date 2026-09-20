/**
 * CHARTS.JS - Gráficos interactivos adaptados al tema Neo-Fintech Obsidian
 */

let barChartInstance = null;
let donutChartInstance = null;

function renderGlobalCharts() {
  if (typeof Chart === 'undefined') return;

  const totals = window.financialStore.calculateGlobalTotals();
  const labels = totals.rows.map(r => r.corto || r.nombre);
  const egresosData = totals.rows.map(r => r.totalEgresos);
  const ingresosData = totals.rows.map(r => r.ingresos);

  // 1. Gráfico de Barras: Comparativa Egresos vs Ingresos
  const barCtx = document.getElementById('globalBarChart');
  if (barCtx) {
    if (barChartInstance) barChartInstance.destroy();

    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Egresos Presupuestados',
            data: egresosData,
            backgroundColor: '#f43f5e', // Coral/Rose
            borderRadius: 8,
            borderSkipped: false,
          },
          {
            label: 'Ingresos / Abonos',
            data: ingresosData,
            backgroundColor: '#10b981', // Neon Emerald
            borderRadius: 8,
            borderSkipped: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 14,
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', weight: '600', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#f8fafc',
            padding: 12,
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
            ticks: {
              color: '#64748b',
              font: { family: 'JetBrains Mono', size: 11 },
              callback: function(value) {
                return 'S/ ' + value;
              }
            },
            grid: {
              color: 'rgba(30, 41, 59, 0.6)'
            }
          },
          x: {
            ticks: {
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', weight: '600' }
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
  const donutCtx = document.getElementById('globalDonutChart');
  if (donutCtx) {
    if (donutChartInstance) donutChartInstance.destroy();

    const catLabels = ['Servicios', 'Personales', 'Gastos Extra'];
    const catData = [totals.globalServicios, totals.globalPersonales, totals.globalExtras];

    donutChartInstance = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{
          data: catData,
          backgroundColor: ['#6366f1', '#a855f7', '#f59e0b'],
          hoverOffset: 6,
          borderWidth: 3,
          borderColor: '#131d33'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#f8fafc',
            padding: 12,
            callbacks: {
              label: function(context) {
                const total = catData.reduce((a, b) => a + b, 0);
                const percent = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${window.formatCurrency(context.raw)} (${percent}%)`;
              }
            }
          }
        }
      }
    });
  }
}

window.renderGlobalCharts = renderGlobalCharts;
