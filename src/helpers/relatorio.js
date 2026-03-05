/**
 * relatorio.js — Helper de geração de relatório nativo do K6
 *
 * Exporta a função `handleSummary`, que o K6 chama automaticamente
 * ao final de cada execução com todos os dados consolidados.
 *
 * Retorna dois arquivos simultaneamente:
 *   - relatorio_<cenario>_<timestamp>.html  → Dashboard HTML standalone
 *   - summary_<cenario>_<timestamp>.json    → Dados brutos para integrações
 *
 * Uso nos arquivos de teste (basta adicionar as duas linhas abaixo):
 *   import { gerarHandleSummary } from '../helpers/relatorio.js';
 *   export const handleSummary = gerarHandleSummary('smoke'); // ou 'load' / 'stress'
 */



// ─── Utilitários ──────────────────────────────────────────────────────────────

/**
 * Formata um número de milissegundos para exibição legível
 * Ex: 1234.56 → "1234.56ms" | 0.003 → "0.003ms"
 */
function formatarMs(valor) {
  if (valor === undefined || valor === null) return 'N/A';
  return `${valor.toFixed(2)}ms`;
}

/**
 * Formata uma taxa (0 a 1) como percentual legível
 * Ex: 0.0032 → "0.32%"
 */
function formatarTaxa(valor) {
  if (valor === undefined || valor === null) return 'N/A';
  return `${(valor * 100).toFixed(2)}%`;
}

/**
 * Formata um número grande com separador de milhar
 * Ex: 142680 → "142.680"
 */
function formatarNumero(valor) {
  if (valor === undefined || valor === null) return 'N/A';
  // toLocaleString() não é suportado no runtime do K6 — formatação manual
  return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Retorna classe CSS de cor baseada em se o threshold passou ou falhou
 */
function corThreshold(passou) {
  return passou ? 'status-pass' : 'status-fail';
}

/**
 * Extrai o valor de um percentil de uma métrica do summary do K6
 * O K6 armazena percentis com a chave "p(95)", "p(99)", etc.
 */
function percentil(metrica, p) {
  if (!metrica || !metrica.values) return null;
  // O K6 armazena a mediana (p50) como 'med'
  if (p === 50 && metrica.values['med'] !== undefined) {
    return metrica.values['med'];
  }
  return metrica.values[`p(${p})`];
}

// ─── Gerador do HTML ──────────────────────────────────────────────────────────

/**
 * gerarHtml
 *
 * Recebe o objeto `data` do K6 (contém todas as métricas e thresholds)
 * e retorna uma string HTML completa e standalone.
 *
 * @param {Object} data    - Objeto de summary do K6
 * @param {string} cenario - Nome do cenário (smoke | load | stress)
 * @returns {string}       - HTML completo como string
 */
function gerarHtml(data, cenario) {
  // toLocaleString() com opções não é suportado no K6 — formatação manual
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const agora = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

  // Extrai métricas principais do objeto de summary
  const duracaoHttp = data.metrics.http_req_duration;
  const falhasHttp = data.metrics.http_req_failed;
  const requisicoes = data.metrics.http_reqs;
  const vus = data.metrics.vus_max;
  const iteracoes = data.metrics.iterations;
  const dadosReceb = data.metrics.data_received;
  const dadosEnviad = data.metrics.data_sent;

  // Valores calculados
  const p95 = percentil(duracaoHttp, 95);
  const p99 = percentil(duracaoHttp, 99);
  const p50 = percentil(duracaoHttp, 50);
  const avgDuracao = duracaoHttp?.values?.avg;
  const taxaErro = falhasHttp?.values?.rate;
  const totalReqs = requisicoes?.values?.count;
  const rps = requisicoes?.values?.rate;
  const vusMax = vus?.values?.max;

  // Verifica status geral dos thresholds
  const todosPassaram = Object.values(data.metrics)
    .every(m => !m.thresholds || Object.values(m.thresholds).every(t => !t.ok === false));

  // Constrói linhas da tabela de thresholds
  let linhasThresholds = '';
  for (const [nomeMetrica, metrica] of Object.entries(data.metrics)) {
    if (!metrica.thresholds) continue;
    for (const [condicao, resultado] of Object.entries(metrica.thresholds)) {
      const passou = resultado.ok !== false;
      linhasThresholds += `
        <tr>
          <td><span class="metric-name">${nomeMetrica}</span></td>
          <td class="threshold-cond">${condicao}</td>
          <td class="${passou ? 'val-pass' : 'val-fail'}">${passou ? '✓ Passou' : '✗ Falhou'}</td>
        </tr>`;
    }
  }

  if (!linhasThresholds) {
    linhasThresholds = '<tr><td colspan="3" style="text-align:center;color:#4a5568">Nenhum threshold configurado</td></tr>';
  }

  // ── HTML ──────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>K6 Report — ${cenario.toUpperCase()} — ${agora}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;700;800&display=swap');
    :root {
      --bg:      #0a0d14; --bg2: #0f1420; --card: #141926; --elev: #1a2035;
      --border:  #1e2840; --border2: #2a3a5c;
      --text:    #e8edf5; --text2: #8a96b0; --muted: #4a5568;
      --blue:    #3b82f6; --cyan: #06b6d4; --green: #10b981;
      --yellow:  #f59e0b; --red: #ef4444;  --purple: #8b5cf6;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg); color: var(--text);
      font-family: 'Syne', sans-serif; min-height: 100vh;
    }
    body::before {
      content: ''; position: fixed; inset: 0; z-index: 0;
      background-image:
        linear-gradient(rgba(59,130,246,.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(59,130,246,.03) 1px, transparent 1px);
      background-size: 40px 40px; pointer-events: none;
    }
    .wrap { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 40px 24px 80px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px; margin-bottom: 48px; padding-bottom: 28px; border-bottom: 1px solid var(--border); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(59,130,246,.1); border: 1px solid rgba(59,130,246,.3); color: var(--blue); font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 4px 10px; border-radius: 4px; letter-spacing: .08em; text-transform: uppercase; width: fit-content; margin-bottom: 10px; }
    .badge::before { content: ''; width: 6px; height: 6px; background: var(--blue); border-radius: 50%; animation: blink 2s ease-in-out infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
    h1 { font-size: clamp(26px,4vw,38px); font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
    h1 span { background: linear-gradient(135deg, var(--blue), var(--cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .meta { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text2); margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
    .status-global { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 14px; }
    .status-global.pass { background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.35); color: var(--green); }
    .status-global.fail { background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); color: var(--red); }

    /* Section */
    .sec-title { font-size: 11px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
    .sec-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, var(--border), transparent); }
    .section { margin-bottom: 44px; }

    /* KPI grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 14px; }
    .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; position: relative; overflow: hidden; transition: border-color .2s, transform .2s; }
    .kpi:hover { border-color: var(--border2); transform: translateY(-2px); }
    .kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .kpi.blue::before   { background: linear-gradient(90deg, var(--blue), transparent); }
    .kpi.cyan::before   { background: linear-gradient(90deg, var(--cyan), transparent); }
    .kpi.green::before  { background: linear-gradient(90deg, var(--green), transparent); }
    .kpi.yellow::before { background: linear-gradient(90deg, var(--yellow), transparent); }
    .kpi.red::before    { background: linear-gradient(90deg, var(--red), transparent); }
    .kpi.purple::before { background: linear-gradient(90deg, var(--purple), transparent); }
    .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
    .kpi-value { font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 600; line-height: 1; margin-bottom: 5px; }
    .kpi.blue .kpi-value   { color: var(--blue); }
    .kpi.cyan .kpi-value   { color: var(--cyan); }
    .kpi.green .kpi-value  { color: var(--green); }
    .kpi.yellow .kpi-value { color: var(--yellow); }
    .kpi.red .kpi-value    { color: var(--red); }
    .kpi.purple .kpi-value { color: var(--purple); }
    .kpi-sub { font-size: 11px; color: var(--text2); font-family: 'JetBrains Mono', monospace; }

    /* Threshold table */
    .tbl { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-family: 'JetBrains Mono', monospace; }
    .tbl th { background: var(--elev); color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 12px 18px; text-align: left; border-bottom: 1px solid var(--border); }
    .tbl td { padding: 12px 18px; font-size: 13px; color: var(--text2); border-bottom: 1px solid var(--border); }
    .tbl tr:last-child td { border-bottom: none; }
    .tbl tr:hover td { background: rgba(255,255,255,.02); }
    .metric-name { color: var(--cyan); }
    .threshold-cond { color: var(--text); }
    .val-pass { color: var(--green); font-weight: 700; }
    .val-fail { color: var(--red); font-weight: 700; }

    /* Metrics table */
    .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media(max-width:680px) { .metrics-grid { grid-template-columns: 1fr; } }
    .metrics-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .metrics-card-title { background: var(--elev); padding: 12px 18px; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--text2); border-bottom: 1px solid var(--border); }
    .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; border-bottom: 1px solid var(--border); }
    .metric-row:last-child { border-bottom: none; }
    .metric-key { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text2); }
    .metric-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--text); font-weight: 600; }

    /* Charts */
    .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    @media(max-width:850px) { .charts-grid { grid-template-columns: 1fr; } }
    .chart-container { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; position: relative; height: 320px; }

    /* Footer */
    .footer { text-align: center; padding-top: 28px; border-top: 1px solid var(--border); font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--muted); }
  </style>
</head>
<body>
<div class="wrap">

  <header class="header">
    <div>
      <div class="badge">k6-load-test · ${cenario} · jsonplaceholder</div>
      <h1>Relatório K6<br><span>${cenario.toUpperCase()}</span></h1>
      <div class="meta">
        <span>🕐 Gerado em: ${agora}</span>
        <span>🎯 Alvo: https://jsonplaceholder.typicode.com</span>
        <span>🔧 Ferramenta: K6 (handleSummary nativo)</span>
      </div>
    </div>
    <div class="${corThreshold(todosPassaram)} status-global ${todosPassaram ? 'pass' : 'fail'}">
      ${todosPassaram ? '✓ TODOS OS THRESHOLDS PASSARAM' : '✗ THRESHOLD(S) VIOLADO(S)'}
    </div>
  </header>

  <div class="section">
    <div class="sec-title">Resumo Executivo</div>
    <div class="kpi-grid">
      <div class="kpi blue">
        <div class="kpi-label">Total de Requisições</div>
        <div class="kpi-value">${formatarNumero(totalReqs)}</div>
        <div class="kpi-sub">${rps ? rps.toFixed(1) + ' req/s médio' : 'N/A'}</div>
      </div>
      <div class="kpi yellow">
        <div class="kpi-label">Latência p95</div>
        <div class="kpi-value">${formatarMs(p95)}</div>
        <div class="kpi-sub">threshold: &lt; 500ms</div>
      </div>
      <div class="kpi purple">
        <div class="kpi-label">Latência p99</div>
        <div class="kpi-value">${formatarMs(p99)}</div>
        <div class="kpi-sub">threshold: &lt; 1000ms</div>
      </div>
      <div class="kpi ${taxaErro && taxaErro > 0.01 ? 'red' : 'green'}">
        <div class="kpi-label">Taxa de Erros</div>
        <div class="kpi-value">${formatarTaxa(taxaErro)}</div>
        <div class="kpi-sub">threshold: &lt; 1%</div>
      </div>
      <div class="kpi cyan">
        <div class="kpi-label">Mediana (p50)</div>
        <div class="kpi-value">${formatarMs(p50)}</div>
        <div class="kpi-sub">avg: ${formatarMs(avgDuracao)}</div>
      </div>
      <div class="kpi blue">
        <div class="kpi-label">VUs no Pico</div>
        <div class="kpi-value">${vusMax ?? 'N/A'}</div>
        <div class="kpi-sub">${formatarNumero(iteracoes?.values?.count)} iterações</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="sec-title">Resultado dos Thresholds</div>
    <table class="tbl">
      <thead>
        <tr>
          <th>Métrica</th>
          <th>Condição</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${linhasThresholds}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="sec-title">Gráficos de Análise (Agregados)</div>
    <div class="charts-grid">
      <div class="chart-container">
        <canvas id="latencyChart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="reqsChart"></canvas>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="sec-title">Métricas Detalhadas</div>
    <div class="metrics-grid">

      <div class="metrics-card">
        <div class="metrics-card-title">⏱ Latência HTTP (http_req_duration)</div>
        <div class="metric-row"><span class="metric-key">avg</span><span class="metric-val">${formatarMs(avgDuracao)}</span></div>
        <div class="metric-row"><span class="metric-key">min</span><span class="metric-val">${formatarMs(duracaoHttp?.values?.min)}</span></div>
        <div class="metric-row"><span class="metric-key">p(50)</span><span class="metric-val">${formatarMs(p50)}</span></div>
        <div class="metric-row"><span class="metric-key">p(90)</span><span class="metric-val">${formatarMs(percentil(duracaoHttp, 90))}</span></div>
        <div class="metric-row"><span class="metric-key">p(95)</span><span class="metric-val">${formatarMs(p95)}</span></div>
        <div class="metric-row"><span class="metric-key">p(99)</span><span class="metric-val">${formatarMs(p99)}</span></div>
        <div class="metric-row"><span class="metric-key">max</span><span class="metric-val">${formatarMs(duracaoHttp?.values?.max)}</span></div>
      </div>

      <div class="metrics-card">
        <div class="metrics-card-title">📡 Requisições e Tráfego</div>
        <div class="metric-row"><span class="metric-key">http_reqs total</span><span class="metric-val">${formatarNumero(totalReqs)}</span></div>
        <div class="metric-row"><span class="metric-key">http_reqs rate</span><span class="metric-val">${rps ? rps.toFixed(2) + '/s' : 'N/A'}</span></div>
        <div class="metric-row"><span class="metric-key">http_req_failed</span><span class="metric-val">${formatarTaxa(taxaErro)}</span></div>
        <div class="metric-row"><span class="metric-key">data_received</span><span class="metric-val">${dadosReceb?.values?.count ? (dadosReceb.values.count / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}</span></div>
        <div class="metric-row"><span class="metric-key">data_sent</span><span class="metric-val">${dadosEnviad?.values?.count ? (dadosEnviad.values.count / 1024).toFixed(2) + ' KB' : 'N/A'}</span></div>
        <div class="metric-row"><span class="metric-key">iterations</span><span class="metric-val">${formatarNumero(iteracoes?.values?.count)}</span></div>
        <div class="metric-row"><span class="metric-key">vus_max</span><span class="metric-val">${vusMax ?? 'N/A'}</span></div>
      </div>

    </div>
  </div>

  <footer class="footer">
    <p>k6-load-test · Cenário: ${cenario} · Gerado via handleSummary · ${agora}</p>
  </footer>

</div>
</div>
<script>
  Chart.defaults.color = '#8a96b0';
  Chart.defaults.font.family = "'Syne', sans-serif";

  // Gráfico 1: Latência
  new Chart(document.getElementById('latencyChart'), {
    type: 'bar',
    data: {
      labels: ['p50', 'p90', 'p95', 'p99', 'Máx'],
      datasets: [{
        label: 'Latência (ms)',
        data: [
          ${p50 || 0},
          ${percentil(duracaoHttp, 90) || 0},
          ${p95 || 0},
          ${p99 || 0},
          ${duracaoHttp?.values?.max || 0}
        ],
        backgroundColor: [
          'rgba(6, 182, 212, 0.4)',  
          'rgba(59, 130, 246, 0.4)', 
          'rgba(245, 158, 11, 0.4)', 
          'rgba(239, 68, 68, 0.4)',  
          'rgba(139, 92, 246, 0.4)'  
        ],
        borderColor: ['#06b6d4', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Distribuição de Latência (Percentis)', color: '#e8edf5', font: { size: 14 } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });

  // Gráfico 2: Sucesso vs Falha
  const falhas = ${falhasHttp?.values?.passes || Math.round((taxaErro || 0) * totalReqs)};
  const sucessos = ${totalReqs} - falhas;
  new Chart(document.getElementById('reqsChart'), {
    type: 'doughnut',
    data: {
      labels: ['Sucesso', 'Falha'],
      datasets: [{
        data: [sucessos, falhas],
        backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(239, 68, 68, 0.8)'],
        borderColor: '#141926',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: 'Requisições (Status)', color: '#e8edf5', font: { size: 14 } }
      }
    }
  });
</script>
</body>
</html>`;
}

// ─── Exportação principal ─────────────────────────────────────────────────────

/**
 * gerarHandleSummary
 *
 * Fábrica que retorna a função handleSummary configurada para o cenário.
 * Cada arquivo de teste chama esta função passando seu nome de cenário.
 *
 * O K6 chamará handleSummary automaticamente no final da execução.
 * O retorno é um objeto onde cada chave é um caminho de arquivo
 * e o valor é o conteúdo a ser escrito.
 *
 * @param {string} cenario - Nome do cenário: 'smoke' | 'load' | 'stress'
 * @returns {Function}     - A função handleSummary pronta para ser exportada
 */
/**
 * gerarResumoTexto
 *
 * Gera um resumo em texto simples das métricas principais para exibir
 * no terminal ao final da execução. Substitui o textSummary externo
 * do jslib, funcionando 100% offline e no Windows/Git Bash.
 */
function gerarResumoTexto(data, cenario) {
  const d = data.metrics.http_req_duration;
  const f = data.metrics.http_req_failed;
  const r = data.metrics.http_reqs;
  const v = data.metrics.vus_max;

  const linha = (k, v) => `  ${k.padEnd(30)} ${v}`;

  return [
    '',
    `  ✓ Relatório HTML gerado em: reports/relatorio_${cenario}_*.html`,
    '',
    '  ── Resumo do Teste ──────────────────────────────────',
    linha('Cenário:', cenario),
    linha('Total de requisições:', r?.values?.count ?? 'N/A'),
    linha('RPS médio:', r?.values?.rate ? r.values.rate.toFixed(2) + '/s' : 'N/A'),
    linha('VUs no pico:', v?.values?.max ?? 'N/A'),
    '',
    '  ── Latência (http_req_duration) ─────────────────────',
    linha('avg:', d?.values?.avg ? d.values.avg.toFixed(2) + 'ms' : 'N/A'),
    linha('p(50):', d?.values?.['med'] !== undefined ? d.values['med'].toFixed(2) + 'ms' : 'N/A'),
    linha('p(90):', d?.values?.['p(90)'] ? d.values['p(90)'].toFixed(2) + 'ms' : 'N/A'),
    linha('p(95):', d?.values?.['p(95)'] ? d.values['p(95)'].toFixed(2) + 'ms' : 'N/A'),
    linha('p(99):', d?.values?.['p(99)'] ? d.values['p(99)'].toFixed(2) + 'ms' : 'N/A'),
    linha('max:', d?.values?.max ? d.values.max.toFixed(2) + 'ms' : 'N/A'),
    '',
    '  ── Erros ────────────────────────────────────────────',
    linha('http_req_failed:', f?.values?.rate ? (f.values.rate * 100).toFixed(2) + '%' : '0.00%'),
    '  ─────────────────────────────────────────────────────',
    '',
  ].join('\n');
}

export function gerarHandleSummary(cenario) {
  return function (data) {
    // Timestamp para nomear os arquivos desta execução
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Usa a variável de ambiente K6_PASTA_RELATORIO definida pelo script bash,
    // que contém o caminho absoluto da pasta de saída criada pelo executar-testes.sh.
    // Fallback para 'reports' caso o teste seja executado diretamente via k6 run.
    const pasta = __ENV.K6_PASTA_RELATORIO || 'reports';
    const prefixo = pasta + '/relatorio_' + cenario + '_' + ts;

    const htmlGerado = gerarHtml(data, cenario);

    return {
      // Relatório HTML standalone com visual completo
      [prefixo + '.html']: htmlGerado,

      // index.html estático para que o GitHub Pages consiga ler o último relatório automaticamente
      [pasta + '/index.html']: htmlGerado,

      // JSON bruto para integrações externas ou scripts de análise
      [prefixo + '.json']: JSON.stringify(data, null, 2),

      // Resumo no terminal — gerado localmente, sem dependência externa
      stdout: gerarResumoTexto(data, cenario),
    };
  };
}
