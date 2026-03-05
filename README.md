# k6-load-test

> Projeto de testes de performance para desafio Outsera APIs REST usando K6, com foco em cenários de carga realistas e relatórios detalhados.

---

## Descrição

Este projeto implementa uma suíte completa de testes de performance usando o [K6](https://k6.io/), uma ferramenta moderna de testes de carga desenvolvida pela Grafana Labs. O projeto é estruturado para uso em ambientes de produção, com cenários bem definidos, métricas customizadas, thresholds de SLA e scripts de automação.

A API alvo é a [JSONPlaceholder](https://jsonplaceholder.typicode.com), uma API pública de testes que simula operações CRUD reais.

---

## Arquitetura do Projeto

```
k6-load-test/
├── src/
│   ├── testes/
│   │   ├── smoke.test.js       # Teste de sanidade (1 VU / 30s)
│   │   ├── load.test.js        # Teste de carga normal (até 500 VUs)
│   │   └── stress.test.js      # Teste de stress extremo (até 1000 VUs)
│   ├── config/
│   │   └── opcoes.js           # Thresholds e configurações centralizadas
│   └── helpers/
│       └── verificacoes.js     # Funções reutilizáveis de validação
├── reports/
│   └── relatorio.html          # Relatório HTML interativo (dados simulados)
├── scripts/
│   └── executar-testes.sh      # Script de execução com criação de relatórios
└── README.md
```

---

## Versões Utilizadas

| Ferramenta | Versão Recomendada | Notas |
|------------|--------------------|-------|
| K6         | v0.54+             | Ferramenta principal de testes |
| Node.js    | v18+ (LTS)         | Apenas para referência; K6 tem runtime próprio |
| Bash       | 5.x+               | Para execução dos scripts shell |

---

## Instalação

### K6

**Linux (Debian/Ubuntu):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows (Chocolatey):**
```bash
choco install k6
```

**Docker:**
```bash
docker pull grafana/k6
```

### Clonar e configurar o projeto

```bash
git clone <url-do-repositorio>
cd k6-load-test
chmod +x scripts/executar-testes.sh
```

> **Nota:** O K6 não utiliza `node_modules`. Não é necessário executar `npm install`. Os imports nos arquivos `.js` são resolvidos pelo runtime nativo do K6.

---

## Como Executar os Testes

### Usando o script de automação (recomendado)

O script `executar-testes.sh` cria automaticamente uma pasta com timestamp para os resultados:

```bash
# Teste de fumaça (smoke) — ~30 segundos
./scripts/executar-testes.sh smoke

# Teste de carga (load) — ~6 minutos
./scripts/executar-testes.sh load

# Teste de stress — ~11 minutos
./scripts/executar-testes.sh stress
```

### Usando K6 diretamente

```bash
# Smoke test
k6 run src/testes/smoke.test.js

# Load test com saída JSON
k6 run --out json=reports/resultado.json src/testes/load.test.js

# Stress test com resumo exportado
k6 run \
  --out json=reports/resultado.json \
  --summary-export=reports/summary.json \
  src/testes/stress.test.js
```

### Usando Docker

```bash
docker run --rm -i \
  -v $(pwd):/scripts \
  grafana/k6 run /scripts/src/testes/load.test.js
```

---

## Relatório HTML Interativo

O arquivo `reports/relatorio.html` é um dashboard standalone com dados simulados realistas para visualização dos resultados de um teste de carga com 500 VUs.

Para visualizar:
```bash
# Linux
xdg-open reports/relatorio.html

# Windows
start reports/relatorio.html
```

O relatório inclui:
- Cards de resumo executivo (requisições totais, RPS, p95, p99, taxa de erro)
- Gráfico de throughput ao longo do tempo
- Gráfico de latência por fase do teste
- Comparação de latência por endpoint
- Tabela de thresholds com status passou/falhou
- Seção de gargalos identificados e recomendações

---

## Métricas Monitoradas

### Thresholds de SLA

| Métrica | Threshold | Descrição |
|---------|-----------|-----------|
| `http_req_duration` p95 | `< 500ms` | 95% das requisições devem responder em menos de 500ms |
| `http_req_duration` p99 | `< 1000ms` | 99% das requisições devem responder em menos de 1 segundo |
| `http_req_failed` | `< 1%` | Menos de 1% das requisições podem falhar (load/smoke) |
| `http_req_failed` | `< 10%` | Até 10% de falha é tolerado no teste de stress |

### Métricas Customizadas (Load Test)

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `duracao_listar_posts` | Trend | Latência exclusiva do endpoint GET /posts |
| `duracao_detalhe_post` | Trend | Latência exclusiva do endpoint GET /posts/:id |
| `duracao_dados_usuario` | Trend | Latência exclusiva do endpoint GET /users/:id |
| `duracao_criar_post` | Trend | Latência exclusiva do endpoint POST /posts |
| `total_listar_posts` | Counter | Contagem total de chamadas ao endpoint de listagem |
| `total_detalhe_post` | Counter | Contagem total de chamadas ao endpoint de detalhe |
| `total_dados_usuario` | Counter | Contagem total de chamadas ao endpoint de usuários |
| `total_criar_post` | Counter | Contagem total de chamadas ao endpoint de criação |

### Métricas Customizadas (Stress Test)

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `stress_duracao_geral` | Trend | Latência geral de todas as requisições |
| `stress_total_requisicoes` | Counter | Total de requisições realizadas |
| `stress_taxa_erros` | Rate | Proporção de requisições com falha |
| `stress_taxa_sucesso` | Rate | Proporção de requisições bem-sucedidas |

### Métricas Nativas do K6

| Métrica | Descrição |
|---------|-----------|
| `http_reqs` | Total de requisições HTTP realizadas |
| `http_req_duration` | Tempo total da requisição (ms) |
| `http_req_waiting` | Tempo aguardando resposta (TTFB) |
| `http_req_connecting` | Tempo de estabelecimento de conexão TCP |
| `http_req_tls_handshaking` | Tempo de handshake TLS/SSL |
| `vus` | Número atual de usuários virtuais ativos |
| `vus_max` | Número máximo de VUs configurado |
| `iterations` | Total de iterações da função `default` |
| `checks` | Taxa de verificações passando |
| `data_sent` | Volume de dados enviados |
| `data_received` | Volume de dados recebidos |

---

## Estrutura dos Relatórios Gerados

Após cada execução pelo script, é criada uma pasta em `reports/` com a seguinte estrutura:

```
reports/
└── 2024-01-15_14-30-00_load/
    ├── resultado.json    # Stream completo de métricas (uma linha JSON por ponto)
    ├── summary.json      # Resumo final com todos os thresholds e percentis
    └── execucao.log      # Log completo do terminal durante a execução
```

### Analisar o summary.json

```bash
cat reports/2024-01-15_14-30-00_load/summary.json | python3 -m json.tool | grep -A5 "http_req_duration"
```

---

## Integração com Grafana (Opcional)

Para monitoramento em tempo real com dashboards visuais:

```bash
# Iniciar InfluxDB e Grafana com Docker Compose
docker-compose up -d influxdb grafana

# Executar teste enviando métricas para InfluxDB
k6 run \
  --out influxdb=http://localhost:8086/k6 \
  src/testes/load.test.js
```

Acesse o Grafana em `http://localhost:3000` e importe o dashboard oficial do K6 (ID: 2587).

