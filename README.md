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
- [Web Dashboard Local (K6 nativo)](#web-dashboard-local-k6-nativo)
- [Dashboard Grafana + InfluxDB](#dashboard-grafana--influxdb)
- [Grafana K6 Cloud](#grafana-k6-cloud)
- [GitHub Actions — CI com K6 Cloud](#github-actions--ci-com-k6-cloud)
- [Métricas Monitoradas](#métricas-monitoradas)

---

## Visão Geral

Projeto de testes de performance estruturado para uso em produção, com três cenários bem definidos (smoke, load e stress) contra a API pública [JSONPlaceholder](https://jsonplaceholder.typicode.com).

**Quatro formas de visualizar resultados:**
- **Relatório HTML nativo** — gerado automaticamente pelo K6 ao final de cada execução, sem dependências externas
- **Web Dashboard local** — dashboard interativo no navegador em tempo real, nativo do K6, sem Docker
- **Dashboard Grafana + InfluxDB** — monitoramento em tempo real com histórico e gráficos de séries temporais
- **Grafana K6 Cloud** — relatórios hospedados na nuvem com histórico e comparação entre execuções

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

### Controle de VUs via Variáveis de Ambiente

Para evitar ultrapassar limites de planos gratuitos (a cota gratuita do K6 Cloud é restrita a apenas **50 VUs**) ou escalar os testes localmente, você pode definir as variáveis de ambiente `VUS_LOAD` e `VUS_STRESS`. Os estágios de ramp-up e ramp-down são ajustados proporcionalmente de forma automática.

- `VUS_LOAD`: Pico de Virtual Users no teste de carga. Padrão: `500`.
- `VUS_STRESS`: Pico de Virtual Users no teste de stress. Padrão: `1000`.

**Exemplo de uso limitando para uso na nuvem:**
```bash
VUS_LOAD=50 ./scripts/executar-testes.sh load
VUS_STRESS=50 ./scripts/executar-testes.sh stress
```

> **Nota sobre CI/CD:** Os workflows no GitHub Actions possuem limites diferentes ajustados por padrão:
> - `.github/workflows/k6-performance.yml` (K6 Cloud): Restrito a **50 VUs** no load e stress para respeitar rigorosamente a cota do plano gratuito da Grafana.
> - `.github/workflows/k6-tests.yml` (Runner Local/HTML): Configurado para rodar com os **500 VUs** totais exigidos pelo projeto, pois usa apenas a infraestrutura do GitHub Actions e gera o relatório em HTML sem bater nas restrições da nuvem.

### Via script (recomendado)

```bash
# Smoke test — ~30 segundos
./scripts/executar-testes.sh smoke

# Load test — ~5 minutos
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

- **Status geral** — passou ou falhou baseado nos thresholds
- **Cards de resumo** — total de requisições, RPS médio, p95, p99, taxa de erros, VUs no pico
- **Tabela de thresholds** — cada threshold configurado com seu status individual
- **Métricas detalhadas** — tabela completa com avg, min, p50, p90, p95, p99, max, data_received, data_sent

### Como o handleSummary está implementado

O helper `src/helpers/relatorio.js` exporta a função `gerarHandleSummary(cenario)`. Cada arquivo de teste importa e re-exporta em duas linhas:

```js
// Exemplo em load.test.js (mesmo padrão nos outros)
import { gerarHandleSummary } from '../helpers/relatorio.js';
export const handleSummary = gerarHandleSummary('load');
```

---

## Web Dashboard Local (K6 nativo)

O K6 possui um dashboard interativo embutido desde a versão v0.49, acessível direto no navegador durante a execução. Não requer Docker, Grafana, InfluxDB nem nenhuma dependência externa.

### Como usar

```bash
# Smoke test com web dashboard
k6 run --out web-dashboard src/testes/smoke.test.js

# Load test com web dashboard
k6 run --out web-dashboard src/testes/load.test.js

# Stress test com web dashboard
k6 run --out web-dashboard src/testes/stress.test.js
```

Assim que o teste iniciar, o K6 exibirá no terminal:

```
web dashboard: http://127.0.0.1:5665
```

Abra esse endereço no navegador. O dashboard atualiza automaticamente em tempo real enquanto o teste executa.

### Exportar o relatório ao final

Para salvar o dashboard como um arquivo HTML estático ao final da execução:

```bash
k6 run --out web-dashboard=open,export=reports/web-dashboard.html src/testes/load.test.js
```

O parâmetro `open` abre o navegador automaticamente, e `export` salva o HTML ao finalizar.

### Personalizar a porta

Se a porta padrão `5665` já estiver em uso:

```bash
K6_WEB_DASHBOARD_PORT=5700 k6 run --out web-dashboard src/testes/load.test.js
```

### O que o web dashboard exibe

| Painel | Descrição |
|--------|-----------|
| Overview | VUs ativos, RPS, taxa de erros e checks em tempo real |
| Timings | Gráficos de latência p50 / p90 / p95 / p99 ao longo do tempo |
| Summary | Resumo final de todas as métricas após a execução |
| Thresholds | Status de cada threshold configurado |
| Scenarios | Detalhes de cada stage e progresso dos VUs |

### Comparação com as outras opções

| | Web Dashboard | Grafana local | K6 Cloud |
|---|---|---|---|
| Instalação | Nenhuma (nativo K6) | Docker necessário | Conta + token |
| Funciona offline | ✓ | ✓ | ✗ |
| Tempo real | ✓ | ✓ | ✓ |
| Histórico de execuções | ✗ | ✓ | ✓ |
| Exporta HTML | ✓ | ✗ | ✗ |
| Versão K6 mínima | v0.49+ | Qualquer | Qualquer |

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

## Grafana K6 Cloud

O K6 Cloud é a solução oficial da Grafana para relatórios de performance hospedados na nuvem. O teste roda **na sua máquina**, mas os resultados são transmitidos em tempo real para o dashboard em `app.k6.io`.

### Passo 1 — Criar conta

Acesse [grafana.com/products/cloud/k6](https://grafana.com/products/cloud/k6) e crie uma conta gratuita.

> **⚠️ Observação Importante:** Para os testes executados com integração ao web-dashboard em nuvem do K6 (K6 Cloud), o plano gratuito possui uma limitação mensal de **500 VUs (Virtual Users)**. Para a execução de testes com um volume alto de VUs, será necessário possuir um plano pago.

### Passo 2 — Obter o token

No painel do K6 Cloud, navegue até:
```
Account Settings → API Token → Copy
```

### Passo 3 — Autenticar o K6 na sua máquina

```bash
k6 login cloud --token SEU_TOKEN_AQUI
```

Isso salva o token localmente em `~/.config/loadimpact/config.json`. Você só precisa fazer isso uma vez.

### Passo 4 — Executar o teste com a flag --cloud

```bash
# Smoke test
./scripts/executar-testes.sh smoke --cloud

# Load test
./scripts/executar-testes.sh load --cloud

# Stress test
./scripts/executar-testes.sh stress --cloud
```

O K6 exibirá no terminal um link direto para o relatório logo no início da execução:

```
output: cloud (https://app.k6.io/runs/123456)
```

### Passo 5 — Acompanhar em tempo real

Abra o link exibido no terminal. O dashboard atualiza automaticamente enquanto o teste executa, com:

- Gráficos de VUs, RPS e latência em tempo real
- Percentis p50 / p90 / p95 / p99
- Taxa de erros por endpoint
- Status de cada threshold
- Histórico comparando com execuções anteriores

### Comparação entre as opções de relatório

| | Local (handleSummary) | Grafana local | K6 Cloud |
|---|---|---|---|
| Configuração | Nenhuma | Docker necessário | Conta + token |
| Funciona offline | ✓ | ✓ | ✗ |
| Tempo real | ✗ | ✓ | ✓ |
| Histórico de execuções | ✗ | ✓ | ✓ |
| Gráficos interativos | ✗ | ✓ | ✓ |
| Comparação entre runs | ✗ | Manual | ✓ automático |
| Dados ficam em | Local | Local | Nuvem Grafana |

---

## GitHub Actions — CI com K6 Cloud

O workflow `.github/workflows/k6-performance.yml` executa os testes automaticamente em todo push na branch `main`, enviando os resultados direto para o K6 Cloud.

### Estratégia de execução

```
push → main
         │
         ▼
    🔥 smoke         ← roda primeiro
         │
    ┌────┴────┐
    ▼         ▼
📈 load   💥 stress  ← rodam em paralelo, só se o smoke passar
```

Se o smoke falhar, load e stress são cancelados automaticamente — evitando desperdiçar créditos do K6 Cloud com testes desnecessários.

### Passo 1 — Adicionar o token como secret no GitHub

No seu repositório, acesse:
```
Settings → Secrets and variables → Actions → New repository secret
```

| Campo | Valor |
|-------|-------|
| Name  | `K6_CLOUD_TOKEN` |
| Value | Seu token de `app.k6.io → Account Settings → API Token` |

### Passo 2 — Fazer push na branch main

```bash
git add .
git commit -m "feat: adiciona testes de performance K6"
git push origin main
```

O workflow dispara automaticamente. Acompanhe em:
```
GitHub → seu repositório → Actions → K6 Performance Tests
```

### Passo 3 — Ver os relatórios no K6 Cloud

Cada job exibe no GitHub Actions Summary um link direto para o relatório em `app.k6.io`. O dashboard mostra gráficos em tempo real enquanto o teste executa.

### Tags aplicadas em cada execução

Cada teste enviado ao K6 Cloud recebe as seguintes tags para rastreabilidade:

| Tag | Valor | Descrição |
|-----|-------|-----------|
| `cenario` | `smoke` / `load` / `stress` | Identifica o tipo de teste |
| `branch` | `main` | Branch que disparou o workflow |
| `commit` | SHA do commit | Permite correlacionar resultado com código |
| `workflow` | ID da execução | Liga o resultado ao run do GitHub Actions |

### Quando o workflow NÃO dispara

O workflow só roda quando arquivos relevantes são alterados:
- `src/**` — arquivos de teste
- `scripts/**` — scripts de execução
- `.github/workflows/k6-performance.yml` — o próprio workflow

Mudanças apenas no `README.md` ou em outros arquivos não disparam os testes.

---

## Licença

MIT — Livre para uso em projetos pessoais e comerciais.
