#!/bin/bash
# =============================================================================
# executar-testes.sh — Script de execução com suporte a Grafana + InfluxDB
# Compatível com: Git Bash (Windows), macOS, Linux
#
# Uso:
#   ./scripts/executar-testes.sh <cenario> [--grafana]
#
# Exemplos:
#   ./scripts/executar-testes.sh smoke
#   ./scripts/executar-testes.sh load --grafana
#   ./scripts/executar-testes.sh stress --grafana
# =============================================================================

set -euo pipefail

VERMELHO='\033[0;31m'; VERDE='\033[0;32m'; AMARELO='\033[1;33m'
AZUL='\033[0;34m'; CIANO='\033[0;36m'; NEGRITO='\033[1m'; RESET='\033[0m'

log_info()    { echo -e "${AZUL}[INFO]${RESET}  $1"; }
log_sucesso() { echo -e "${VERDE}[OK]${RESET}    $1"; }
log_aviso()   { echo -e "${AMARELO}[AVISO]${RESET} $1"; }
log_erro()    { echo -e "${VERMELHO}[ERRO]${RESET}  $1"; }

INFLUXDB_URL="http://localhost:8086"
INFLUXDB_DB="k6"
GRAFANA_URL="http://localhost:3000"

# ─── Argumentos ──────────────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  log_erro "Nenhum cenário especificado."
  echo "Uso: $0 <cenario> [--grafana]"
  echo "Cenários: smoke | load | stress"
  exit 1
fi

CENARIO="$1"; MODO_GRAFANA=false
for arg in "$@"; do [ "$arg" = "--grafana" ] && MODO_GRAFANA=true; done

case "$CENARIO" in smoke|load|stress) ;; *)
  log_erro "Cenário inválido: '$CENARIO'. Use: smoke | load | stress"; exit 1 ;;
esac

# ─── Verificar K6 ────────────────────────────────────────────────────────────
if ! command -v k6 &> /dev/null; then
  log_erro "K6 não encontrado."
  echo "  Windows: winget install k6  ou  choco install k6"
  echo "  macOS:   brew install k6"
  echo "  Linux:   https://k6.io/docs/get-started/installation/"
  exit 1
fi
log_sucesso "K6 encontrado: $(k6 version | head -n1)"

# ─── Verificar stack Grafana (apenas com --grafana) ──────────────────────────
if [ "$MODO_GRAFANA" = true ]; then
  if ! curl -sf "${INFLUXDB_URL}/ping" > /dev/null 2>&1; then
    log_erro "InfluxDB não acessível em ${INFLUXDB_URL}"
    log_aviso "Suba a stack: docker-compose up -d  (aguarde ~15s)"
    exit 1
  fi
  log_sucesso "InfluxDB acessível"
  curl -sf "${GRAFANA_URL}/api/health" > /dev/null 2>&1 \
    && log_sucesso "Grafana acessível em ${GRAFANA_URL}" \
    || log_aviso "Grafana ainda inicializando, continuando..."
fi

# ─── Detectar diretório raiz — compatível com Git Bash no Windows ─────────────
# No Git Bash, BASH_SOURCE pode retornar caminhos mistos (ex: C:/Users/...)
# que quebram o 'cd'. A abordagem abaixo normaliza o caminho corretamente.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ_PROJETO="$(cd "${SCRIPT_DIR}/.." && pwd)"

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
PASTA_RELATORIO="${RAIZ_PROJETO}/reports/${TIMESTAMP}_${CENARIO}"
mkdir -p "$PASTA_RELATORIO"

ARQUIVO_TESTE="${RAIZ_PROJETO}/src/testes/${CENARIO}.test.js"
ARQUIVO_JSON="${PASTA_RELATORIO}/resultado.json"
ARQUIVO_SUMMARY="${PASTA_RELATORIO}/summary.json"
ARQUIVO_LOG="${PASTA_RELATORIO}/execucao.log"

# ─── Cabeçalho ───────────────────────────────────────────────────────────────
echo ""
echo -e "${NEGRITO}${CIANO}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${NEGRITO}${CIANO}║           K6 - TESTE DE PERFORMANCE                  ║${RESET}"
echo -e "${NEGRITO}${CIANO}╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${NEGRITO}${CIANO}║${RESET}  Cenário  : ${AMARELO}$(printf '%-38s' "$CENARIO")${RESET}${NEGRITO}${CIANO}║${RESET}"
if [ "$MODO_GRAFANA" = true ]; then
  echo -e "${NEGRITO}${CIANO}║${RESET}  Modo     : ${VERDE}$(printf '%-38s' "Grafana + InfluxDB")${RESET}${NEGRITO}${CIANO}║${RESET}"
else
  echo -e "${NEGRITO}${CIANO}║${RESET}  Modo     : $(printf '%-38s' "Arquivo JSON + HTML local")${NEGRITO}${CIANO}║${RESET}"
fi
echo -e "${NEGRITO}${CIANO}║${RESET}  Timestamp: $(printf '%-40s' "$TIMESTAMP")${NEGRITO}${CIANO}║${RESET}"
echo -e "${NEGRITO}${CIANO}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

log_info "Iniciando execução do teste '$CENARIO'..."

# ─── Executar K6 ─────────────────────────────────────────────────────────────
# Exporta o caminho absoluto da pasta para que o handleSummary
# consiga salvar o HTML no lugar certo — necessário no Git Bash/Windows
export K6_PASTA_RELATORIO="${PASTA_RELATORIO}"

if [ "$MODO_GRAFANA" = true ]; then
  log_info "Métricas → InfluxDB: ${INFLUXDB_URL}/${INFLUXDB_DB}"
  log_info "Dashboard → Grafana: ${GRAFANA_URL}/d/k6-load-test-dashboard"
  echo ""
  k6 run \
    --out "influxdb=${INFLUXDB_URL}/${INFLUXDB_DB}" \
    --out "json=${ARQUIVO_JSON}" \
    --summary-export "${ARQUIVO_SUMMARY}" \
    --tag "execucao=${TIMESTAMP}" \
    --tag "cenario=${CENARIO}" \
    "$ARQUIVO_TESTE" \
    2>&1 | tee "$ARQUIVO_LOG"
else
  k6 run \
    --out "json=${ARQUIVO_JSON}" \
    --summary-export "${ARQUIVO_SUMMARY}" \
    "$ARQUIVO_TESTE" \
    2>&1 | tee "$ARQUIVO_LOG"
fi

STATUS_SAIDA=${PIPESTATUS[0]}

# ─── Resultado ───────────────────────────────────────────────────────────────
echo ""
echo -e "${NEGRITO}${CIANO}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${NEGRITO}${CIANO}║                EXECUÇÃO CONCLUÍDA                    ║${RESET}"
echo -e "${NEGRITO}${CIANO}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
[ $STATUS_SAIDA -eq 0 ] \
  && echo -e "  Status : ${VERDE}${NEGRITO}✓ TODOS OS THRESHOLDS PASSARAM${RESET}" \
  || echo -e "  Status : ${VERMELHO}${NEGRITO}✗ THRESHOLD VIOLADO (código: $STATUS_SAIDA)${RESET}"
echo ""
echo -e "  Arquivos salvos em: ${AMARELO}${PASTA_RELATORIO}${RESET}"
echo ""

if [ "$MODO_GRAFANA" = true ]; then
  echo -e "  ${NEGRITO}Abra o dashboard:${RESET}"
  echo -e "  ${CIANO}${GRAFANA_URL}/d/k6-load-test-dashboard${RESET}"
  echo ""
  echo -e "  ${NEGRITO}Tag desta execução:${RESET} ${AMARELO}execucao=${TIMESTAMP}${RESET}"
else
  echo -e "  Relatório HTML gerado em: ${CIANO}reports/relatorio_${CENARIO}_*.html${RESET}"
  echo ""
  echo -e "  Para visualizar no Grafana:"
  echo -e "  1. ${CIANO}docker-compose up -d${RESET}"
  echo -e "  2. ${CIANO}./scripts/executar-testes.sh ${CENARIO} --grafana${RESET}"
fi
echo ""
exit $STATUS_SAIDA
