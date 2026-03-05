#!/bin/bash
# =============================================================================
# executar-testes.sh — Script de execução K6
# Compatível com: Git Bash (Windows), macOS, Linux
#
# Uso:
#   ./scripts/executar-testes.sh <cenario> [--grafana] [--cloud]
#
# Cenários:
#   smoke  — 1 VU / 30s
#   load   — até 500 VUs / ~6min
#   stress — até 1000 VUs / ~11min
#
# Flags:
#   --grafana  Envia métricas ao InfluxDB local + Grafana (requer docker-compose up -d)
#   --cloud    Envia resultados ao Grafana K6 Cloud em tempo real (requer k6 login cloud)
#
# Exemplos:
#   ./scripts/executar-testes.sh smoke
#   ./scripts/executar-testes.sh load --grafana
#   ./scripts/executar-testes.sh load --cloud
#   ./scripts/executar-testes.sh stress --cloud
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
GRAFANA_LOCAL_URL="http://localhost:3000"
K6_CLOUD_URL="https://app.k6.io"

# ─── Parse de argumentos ─────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  log_erro "Nenhum cenário especificado."
  echo ""
  echo "  Uso: $0 <cenario> [--grafana] [--cloud]"
  echo ""
  echo "  Cenários : smoke | load | stress"
  echo "  Flags    : --grafana  (InfluxDB + Grafana local)"
  echo "             --cloud    (Grafana K6 Cloud)"
  exit 1
fi

CENARIO="$1"
MODO_GRAFANA=false
MODO_CLOUD=false

for arg in "$@"; do
  [ "$arg" = "--grafana" ] && MODO_GRAFANA=true
  [ "$arg" = "--cloud" ]   && MODO_CLOUD=true
done

# Não permite usar --grafana e --cloud ao mesmo tempo
if [ "$MODO_GRAFANA" = true ] && [ "$MODO_CLOUD" = true ]; then
  log_erro "Use apenas --grafana OU --cloud, não os dois ao mesmo tempo."
  exit 1
fi

case "$CENARIO" in smoke|load|stress) ;; *)
  log_erro "Cenário inválido: '$CENARIO'. Use: smoke | load | stress"
  exit 1 ;;
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

# ─── Verificar autenticação no K6 Cloud ──────────────────────────────────────
if [ "$MODO_CLOUD" = true ]; then
  log_info "Verificando autenticação no Grafana K6 Cloud..."
  K6_CONFIG_FILE="${HOME}/.config/loadimpact/config.json"
  if [ ! -f "$K6_CONFIG_FILE" ]; then
    log_erro "Token do K6 Cloud não encontrado."
    echo ""
    echo "  Para autenticar, execute:"
    echo "  ${CIANO}k6 login cloud --token SEU_TOKEN_AQUI${RESET}"
    echo ""
    echo "  Obtenha seu token em: ${CIANO}${K6_CLOUD_URL}${RESET}"
    echo "  Navegue até: Account Settings → API Token"
    exit 1
  fi
  log_sucesso "Autenticação K6 Cloud encontrada"
fi

# ─── Verificar stack Grafana local ───────────────────────────────────────────
if [ "$MODO_GRAFANA" = true ]; then
  if ! curl -sf "${INFLUXDB_URL}/ping" > /dev/null 2>&1; then
    log_erro "InfluxDB não acessível em ${INFLUXDB_URL}"
    log_aviso "Suba a stack: docker-compose up -d  (aguarde ~15s)"
    exit 1
  fi
  log_sucesso "InfluxDB acessível"
  curl -sf "${GRAFANA_LOCAL_URL}/api/health" > /dev/null 2>&1 \
    && log_sucesso "Grafana local acessível em ${GRAFANA_LOCAL_URL}" \
    || log_aviso "Grafana ainda inicializando, continuando..."
fi

# ─── Detectar diretório raiz — compatível com Git Bash no Windows ────────────
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

if [ "$MODO_CLOUD" = true ]; then
  echo -e "${NEGRITO}${CIANO}║${RESET}  Modo     : ${VERDE}$(printf '%-38s' "Grafana K6 Cloud ☁")${RESET}${NEGRITO}${CIANO}║${RESET}"
elif [ "$MODO_GRAFANA" = true ]; then
  echo -e "${NEGRITO}${CIANO}║${RESET}  Modo     : ${VERDE}$(printf '%-38s' "Grafana + InfluxDB local")${RESET}${NEGRITO}${CIANO}║${RESET}"
else
  echo -e "${NEGRITO}${CIANO}║${RESET}  Modo     : $(printf '%-38s' "Local (HTML + JSON)")${NEGRITO}${CIANO}║${RESET}"
fi

echo -e "${NEGRITO}${CIANO}║${RESET}  Timestamp: $(printf '%-40s' "$TIMESTAMP")${NEGRITO}${CIANO}║${RESET}"
echo -e "${NEGRITO}${CIANO}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

log_info "Iniciando execução do teste '$CENARIO'..."

# Exporta o caminho absoluto para o handleSummary salvar o HTML corretamente
export K6_PASTA_RELATORIO="${PASTA_RELATORIO}"

# ─── Executar K6 ─────────────────────────────────────────────────────────────
if [ "$MODO_CLOUD" = true ]; then
  log_info "Transmitindo resultados para: ${K6_CLOUD_URL}"
  log_info "Acompanhe em tempo real após o início da execução"
  echo ""
  k6 run \
    --out cloud \
    --out "json=${ARQUIVO_JSON}" \
    --summary-export "${ARQUIVO_SUMMARY}" \
    --tag "cenario=${CENARIO}" \
    --tag "execucao=${TIMESTAMP}" \
    "$ARQUIVO_TESTE" \
    2>&1 | tee "$ARQUIVO_LOG"

elif [ "$MODO_GRAFANA" = true ]; then
  log_info "Métricas → InfluxDB: ${INFLUXDB_URL}/${INFLUXDB_DB}"
  log_info "Dashboard → Grafana: ${GRAFANA_LOCAL_URL}/d/k6-load-test-dashboard"
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
echo -e "  Arquivos locais salvos em:"
echo -e "  ${AMARELO}${PASTA_RELATORIO}${RESET}"
echo ""

if [ "$MODO_CLOUD" = true ]; then
  echo -e "  ${NEGRITO}☁  Relatório no Grafana K6 Cloud:${RESET}"
  echo -e "  ${CIANO}${K6_CLOUD_URL}${RESET}"
  echo ""
  echo -e "  O link direto para esta execução foi exibido"
  echo -e "  pelo K6 no início do teste (linha 'output: cloud')."

elif [ "$MODO_GRAFANA" = true ]; then
  echo -e "  ${NEGRITO}📊 Dashboard Grafana local:${RESET}"
  echo -e "  ${CIANO}${GRAFANA_LOCAL_URL}/d/k6-load-test-dashboard${RESET}"
  echo ""
  echo -e "  ${NEGRITO}Tag desta execução:${RESET} ${AMARELO}execucao=${TIMESTAMP}${RESET}"

else
  echo -e "  ${NEGRITO}📄 Relatório HTML gerado em:${RESET}"
  echo -e "  ${CIANO}${PASTA_RELATORIO}/${RESET}"
  echo ""
  echo -e "  Outras opções de visualização:"
  echo -e "  Grafana local : ${CIANO}./scripts/executar-testes.sh ${CENARIO} --grafana${RESET}"
  echo -e "  K6 Cloud      : ${CIANO}./scripts/executar-testes.sh ${CENARIO} --cloud${RESET}"
fi

echo ""
exit $STATUS_SAIDA
