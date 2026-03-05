# k6-load-test

> Suíte de testes de performance com K6 para APIs REST — com relatório HTML nativo, integração Grafana + InfluxDB e automação via script bash.

---

## Índice

- [Visão Geral](#visão-geral)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Versões e Dependências](#versões-e-dependências)
- [Instalação](#instalação)
- [Como Executar os Testes](#como-executar-os-testes)
- [Relatório Nativo do K6 (handleSummary)](#relatório-nativo-do-k6-handlesummary)
- [Dashboard Grafana + InfluxDB](#dashboard-grafana--influxdb)
- [Métricas Monitoradas](#métricas-monitoradas)

---

## Visão Geral

Projeto de testes de performance estruturado para uso em produção, com três cenários bem definidos (smoke, load e stress) contra a API pública [JSONPlaceholder](https://jsonplaceholder.typicode.com).

**Três formas de visualizar resultados:**
- **Relatório HTML nativo** — gerado automaticamente pelo K6 ao final de cada execução, sem dependências externas (agora com gráficos interativos via Chart.js).
- **Dashboard Grafana** — monitoramento em tempo real com gráficos de séries temporais via InfluxDB.
- **GitHub Pages** — relatórios HTML consolidados automaticamente pelo pipeline de CI/CD (GitHub Actions).

---

## Estrutura do Projeto

```
k6-load-test/
├── src/
│   ├── testes/
│   │   ├── smoke.test.js         # 1 VU / 30s — validação de sanidade
│   │   ├── load.test.js          # até 500 VUs — carga normal e pico
│   │   └── stress.test.js        # até 1000 VUs — ponto de ruptura
│   ├── config/
│   │   └── opcoes.js             # BASE_URL, thresholds e stages centralizados
│   └── helpers/
│       ├── verificacoes.js       # check(), logarErro(), gerarPayloadPost()
│       └── relatorio.js          # handleSummary — gera HTML + JSON ao final
├── infra/
│   └── grafana/
│       ├── dashboards/
│       │   └── k6-dashboard.json         # Dashboard provisionado automaticamente
│       └── provisioning/
│           ├── datasources/influxdb.yml  # Conexão automática ao InfluxDB
│           └── dashboards/dashboards.yml # Carregamento automático do dashboard
├── reports/
│   └── relatorio.html            # Template de demonstração (dados simulados)
├── scripts/
│   └── executar-testes.sh        # Script bash com suporte a --grafana
└── docker-compose.yml            # Stack InfluxDB 1.8 + Grafana 10
```

---

## Versões e Dependências

| Ferramenta   | Versão        | Uso                                      |
|--------------|---------------|------------------------------------------|
| K6           | v0.54+        | Ferramenta principal de testes           |
| InfluxDB     | 1.8           | Banco de séries temporais para métricas  |
| Grafana      | 10.2.0        | Dashboard de visualização em tempo real  |
| Docker       | 20+           | Orquestração da stack de observabilidade |
| Node.js      | v18+ (LTS)    | Apenas referência — K6 tem runtime próprio |

> **Nota:** O K6 **não usa** `node_modules`. Não execute `npm install`.

---

## Instalação

### 1. Instalar o K6

**macOS:**
```bash
brew install k6
```

**Linux (Debian/Ubuntu):**
```bash
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
  https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list

sudo apt-get update && sudo apt-get install k6
```

**Windows:**
```bash
choco install k6
```

**Verificar instalação:**
```bash
k6 version
```

### 2. Clonar e configurar o projeto

```bash
git clone <url-do-repositorio>
cd k6-load-test
chmod +x scripts/executar-testes.sh
```

### 3. Instalar Docker (apenas para Grafana)

Siga as instruções em [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) para seu sistema operacional.

---

## Como Executar os Testes

### Via script (recomendado)

```bash
# Smoke test — ~30 segundos
./scripts/executar-testes.sh smoke

# Load test — ~6 minutos
./scripts/executar-testes.sh load

# Stress test — ~11 minutos
./scripts/executar-testes.sh stress
```

### Diretamente com K6

```bash
k6 run src/testes/smoke.test.js
k6 run src/testes/load.test.js
k6 run src/testes/stress.test.js
```

### Via Docker

```bash
docker run --rm -i \
  -v $(pwd):/scripts \
  grafana/k6 run /scripts/src/testes/load.test.js
```

### Via Github Actions (CI/CD)

O projeto já conta com um workflow automatizado em `.github/workflows/k6-tests.yml`. 
- **Automático:** Roda os testes `smoke` a cada push/pull request na `main`.
- **Manual (Workflow Dispatch):** Permite disparar os cenários `load` ou `stress` manualmente através da aba *Actions* do GitHub.
- Ao final das execuções, o relatório HTML é salvo e automaticamente publicado no **GitHub Pages** usando a branch órfã `gh-pages`.

---

## Relatório Nativo do K6 (handleSummary)

O K6 chama automaticamente a função `handleSummary` ao **final de cada execução**. Não é necessário nenhuma flag extra — basta rodar o teste normalmente.

### O que é gerado

Ao final de qualquer execução, dois arquivos são salvos automaticamente na pasta `reports/`:

```
reports/
├── relatorio_load_2024-01-15T14-32-00.html   ← Dashboard HTML standalone
└── relatorio_load_2024-01-15T14-32-00.json   ← Dados brutos para integrações
```

O nome do arquivo inclui o **cenário** e o **timestamp** da execução, garantindo que execuções anteriores nunca sejam sobrescritas.

### Como visualizar o relatório HTML

```bash
# Após executar qualquer teste, abra o arquivo gerado:

# macOS
open reports/relatorio_load_*.html

# Linux
xdg-open reports/relatorio_load_*.html

# Windows
start reports/relatorio_load_*.html
```

O relatório é um arquivo **standalone** — funciona offline, sem servidor, sem dependências além de uma conexão para carregar as fontes do Google Fonts.

### O que o relatório HTML contém

- **Status geral** — passou ou falhou baseado nos thresholds.
- **Cards de resumo** — total de requisições, RPS médio, p95, p99, taxa de erros, VUs no pico.
- **Tabela de thresholds** — cada threshold configurado com seu status individual.
- **Gráficos Visuais (Novo)** — Gráficos interativos renderizados com Chart.js demonstrando P50, P90, P95, e P99 graficamente, além da proporção de sucessos/falhas.
- **Métricas detalhadas** — tabela completa com avg, min, p50, p90, p95, p99, max, data_received, data_sent.

### Como o handleSummary está implementado

O helper `src/helpers/relatorio.js` exporta a função `gerarHandleSummary(cenario)`. Cada arquivo de teste importa e re-exporta em duas linhas:

```js
// Exemplo em load.test.js (mesmo padrão nos outros)
import { gerarHandleSummary } from '../helpers/relatorio.js';
export const handleSummary = gerarHandleSummary('load');
```

---

## Dashboard Grafana + InfluxDB

Para monitoramento **em tempo real** enquanto o teste executa, com gráficos de séries temporais.

### Passo 1 — Subir a stack

```bash
docker-compose up -d
```

Aguarde ~15 segundos para os containers inicializarem completamente.

**Verificar se está tudo rodando:**
```bash
docker-compose ps
# Esperado: k6-influxdb e k6-grafana com status "healthy"
```

### Passo 2 — Executar o teste com a flag --grafana

```bash
# Smoke test com Grafana
./scripts/executar-testes.sh smoke --grafana

# Load test com Grafana (recomendado)
./scripts/executar-testes.sh load --grafana

# Stress test com Grafana
./scripts/executar-testes.sh stress --grafana
```

O script valida automaticamente se o InfluxDB está acessível antes de iniciar.
Se a stack não estiver rodando, ele avisa e para com uma mensagem de erro clara.

### Passo 3 — Abrir o Grafana

Acesse no navegador:

```
http://localhost:3000
```

**Credenciais padrão:**
- Usuário: `admin`
- Senha: `admin123`

### Passo 4 — Acessar o dashboard

O dashboard **K6 Load Test — Performance Dashboard** é provisionado automaticamente.
Ele aparece em: **Dashboards → K6 Load Tests → K6 Load Test — Performance Dashboard**

Ou acesse diretamente pela URL:
```
http://localhost:3000/d/k6-load-test-dashboard
```

### Passo 5 — Acompanhar em tempo real

Durante a execução do teste, o Grafana atualiza os painéis a cada **5 segundos** automaticamente.

**Ajuste o intervalo de tempo** no canto superior direito do Grafana para cobrir a duração do teste. Exemplo: para um load test de 6 minutos, selecione `Last 15 minutes`.

### Passo 6 — Filtrar por execução

Cada execução recebe uma tag `execucao=YYYY-MM-DD_HH-MM-SS` aplicada pelo script.
Use essa tag nas queries do Grafana para isolar e comparar execuções específicas.

### Painéis disponíveis no dashboard

| Painel | Descrição |
|--------|-----------|
| Cards de resumo | p95, p99, taxa de erros, RPS médio, VUs no pico, total de requisições |
| Throughput × VUs | RPS e usuários virtuais sobrepostos no mesmo gráfico ao longo do tempo |
| Latência por fase | p50 / p90 / p95 / p99 ao longo de toda a execução |
| Taxa de erros | Linha com marcações visuais nos thresholds de 1% e 5% |
| p95 por endpoint | Latência separada por tag `endpoint` (listar_posts, detalhe_post, dados_usuario, criar_post) |
| RPS por endpoint | Volume de requisições separado por endpoint |
| Decomposição da latência | Duração total dividida em TCP connect + TLS handshake + TTFB + recebimento |

### Derrubar a stack

```bash
# Derruba os containers mas preserva os dados
docker-compose down

# Derruba e apaga todos os dados (histórico do InfluxDB e configurações do Grafana)
docker-compose down -v
```

---

## Métricas Monitoradas

### Thresholds de SLA

| Métrica | Cenário | Threshold | Descrição |
|---------|---------|-----------|-----------|
| `http_req_duration` p95 | smoke / load | `< 500ms` | 95% das requisições em menos de 500ms |
| `http_req_duration` p99 | smoke / load | `< 1000ms` | 99% das requisições em menos de 1 segundo |
| `http_req_failed` | smoke | `< 0.1%` | Quase zero erros — smoke é verificação de sanidade |
| `http_req_failed` | load | `< 1%` | Menos de 1% de falhas em carga normal |
| `http_req_failed` | stress | `< 10%` | Até 10% tolerado — objetivo é encontrar o limite |
| `http_req_duration{endpoint:listar_posts}` | load | `< 400ms` | SLA específico do endpoint de listagem |
| `http_req_duration{endpoint:criar_post}` | load | `< 600ms` | SLA específico do endpoint de criação |

### Métricas Nativas do K6

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `http_reqs` | Counter | Total de requisições e taxa por segundo |
| `http_req_duration` | Trend | Tempo total da requisição (ms) com todos os percentis |
| `http_req_waiting` | Trend | Tempo aguardando resposta (TTFB) |
| `http_req_connecting` | Trend | Tempo de estabelecimento de conexão TCP |
| `http_req_tls_handshaking` | Trend | Tempo de handshake TLS/SSL |
| `http_req_failed` | Rate | Proporção de requisições com falha |
| `vus` | Gauge | Número atual de usuários virtuais |
| `vus_max` | Gauge | Número máximo de VUs atingido |
| `iterations` | Counter | Total de iterações da função `default` |
| `checks` | Rate | Taxa de verificações `check()` que passaram |
| `data_sent` | Counter | Volume total de dados enviados |
| `data_received` | Counter | Volume total de dados recebidos |

### Métricas Customizadas (Load Test)

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `duracao_listar_posts` | Trend | Latência isolada do GET /posts |
| `duracao_detalhe_post` | Trend | Latência isolada do GET /posts/:id |
| `duracao_dados_usuario` | Trend | Latência isolada do GET /users/:id |
| `duracao_criar_post` | Trend | Latência isolada do POST /posts |
| `total_listar_posts` | Counter | Contagem de chamadas ao endpoint de listagem |
| `total_detalhe_post` | Counter | Contagem de chamadas ao endpoint de detalhe |
| `total_dados_usuario` | Counter | Contagem de chamadas ao endpoint de usuários |
| `total_criar_post` | Counter | Contagem de chamadas ao endpoint de criação |

### Métricas Customizadas (Stress Test)

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `stress_duracao_geral` | Trend | Latência geral de todas as requisições |
| `stress_total_requisicoes` | Counter | Total de requisições realizadas |
| `stress_taxa_erros` | Rate | Proporção de requisições com falha |
| `stress_taxa_sucesso` | Rate | Proporção de requisições bem-sucedidas |

---

## Licença

MIT — Livre para uso em projetos pessoais e comerciais.
