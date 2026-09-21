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

  // 1. Gráfico de Barras: Ingresos Acumulados vs Balance Neto Acumulado
  const barCanvas = document.getElementById('chartTrendBar') || document.getElementById('globalBarChart');
  if (barCanvas) {
    if (barChartInstance) {
      barChartInstance.destroy();
      barChartInstance = null;
    }

    barChartInstance = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ingresos Acumulados',
            data: ingresosAcumulados,
            backgroundColor: '#10b981', // Cyber Emerald
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: 'Balance Neto Acumulado',
            data: balanceAcumulado,
            backgroundColor: '#38bdf8', // Luminous Sky Cyan
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
              color: '#a1a1aa',
              font: { family: 'Inter', weight: '600', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: '#161822',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#f8fafc',
            padding: 12,
            cornerRadius: 8,
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
              color: 'rgba(255, 255, 255, 0.06)'
            }
          },
          x: {
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter', weight: '600' }
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
            ? ['#0ea5e9', '#8b5cf6', '#f59e0b'] 
            : ['#161822', '#1b1e2a', '#161822'],
          hoverOffset: 6,
          borderWidth: 2,
          borderColor: '#0f1116'
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
              font: { family: 'Inter', size: 12, weight: '600' },
              padding: 14
            }
          },
          tooltip: {
            backgroundColor: '#151821',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#f8fafc',
            padding: 12,
            cornerRadius: 8,
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
