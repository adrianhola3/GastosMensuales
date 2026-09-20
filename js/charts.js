/**
 * CHARTS.JS - Gráficos interactivos adaptados al tema Neo-Fintech Obsidian
 */

let barChartInstance = null;
let donutChartInstance = null;

function renderGlobalCharts() {
  if (typeof Chart === 'undefined') return;
  if (!window.financialStore) return;

  const totals = window.financialStore.calculateGlobalTotals();
  if (!totals || !totals.rows) return;

  const labels = totals.rows.map(r => r.corto || r.nombre);
  const egresosData = totals.rows.map(r => r.totalEgresos);
  const ingresosData = totals.rows.map(r => r.ingresos);

  // 1. Gráfico de Barras: Comparativa Egresos vs Ingresos
  const barCanvas = document.getElementById('chartTrendBar') || document.getElementById('globalBarChart');
  if (barCanvas) {
    if (barChartInstance) {
      barChartInstance.destroy();
      barChartInstance = null;
    }

    const hasData = egresosData.some(v => v > 0) || ingresosData.some(v => v > 0);

    barChartInstance = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Egresos Presupuestados',
            data: egresosData,
            backgroundColor: '#f43f5e', // Coral/Rose
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: 'Ingresos / Abonos',
            data: ingresosData,
            backgroundColor: '#10b981', // Neon Emerald
            borderRadius: 6,
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
              boxWidth: 12,
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
            padding: 10,
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
  const donutCanvas = document.getElementById('chartCategoryDonut') || document.getElementById('globalDonutChart');
  if (donutCanvas) {
    if (donutChartInstance) {
      donutChartInstance.destroy();
      donutChartInstance = null;
    }

    const catLabels = ['Servicios del Hogar', 'Gastos Personales', 'Gastos Extra'];
    const catData = [totals.globalServicios, totals.globalPersonales, totals.globalExtras];
    const totalGastos = catData.reduce((a, b) => a + b, 0);

    donutChartInstance = new Chart(donutCanvas, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{
          data: totalGastos > 0 ? catData : [1, 1, 1],
          backgroundColor: totalGastos > 0 
            ? ['#38bdf8', '#a78bfa', '#fbbf24'] 
            : ['#1e293b', '#334155', '#1e293b'],
          hoverOffset: 6,
          borderWidth: 2,
          borderColor: '#131d33'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
              padding: 14
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#f8fafc',
            padding: 10,
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
