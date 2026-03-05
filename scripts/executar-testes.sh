#!/bin/bash
# =============================================================================
# executar-testes.sh — Script de execução dos testes de performance K6
#
# Uso:
#   ./scripts/executar-testes.sh <cenario>
#
# Cenários disponíveis:
#   smoke  — Teste de fumaça (1 VU, 30 segundos)
#   load   — Teste de carga  (até 500 VUs, ~6 minutos)
#   stress — Teste de stress (até 1000 VUs, ~11 minutos)
#
# Exemplos:
#   ./scripts/executar-testes.sh smoke
#   ./scripts/executar-testes.sh load
#   ./scripts/executar-testes.sh stress
#
# O script cria automaticamente uma pasta de relatórios com timestamp
# e exporta os resultados em formato JSON para análise posterior.
# =============================================================================

set -euo pipefail  # Encerra imediatamente em caso de erro

# ─── Cores para output no terminal ────────────────────────────────────────────
VERMELHO='\033[0;31m'
VERDE='\033[0;32m'
AMARELO='\033[1;33m'
AZUL='\033[0;34m'
CIANO='\033[0;36m'
NEGRITO='\033[1m'
RESET='\033[0m'

# ─── Funções de log ────────────────────────────────────────────────────────────
log_info()    { echo -e "${AZUL}[INFO]${RESET}  $1"; }
log_sucesso() { echo -e "${VERDE}[OK]${RESET}    $1"; }
log_aviso()   { echo -e "${AMARELO}[AVISO]${RESET} $1"; }
log_erro()    { echo -e "${VERMELHO}[ERRO]${RESET}  $1"; }

# ─── Validação de argumentos ──────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  log_erro "Nenhum cenário especificado."
  echo ""
  echo "Uso: $0 <cenario>"
  echo ""
  echo "Cenários disponíveis:"
  echo "  smoke  — Teste rápido de sanidade (1 VU / 30s)"
  echo "  load   — Teste de carga normal (até 500 VUs / ~6min)"
  echo "  stress — Teste de stress extremo (até 1000 VUs / ~11min)"
  echo ""
  exit 1
fi

CENARIO="$1"

# Valida se o cenário informado é válido
case "$CENARIO" in
  smoke|load|stress)
    ;;  # Cenário válido, continua
  *)
    log_erro "Cenário inválido: '$CENARIO'"
    log_erro "Use: smoke | load | stress"
    exit 1
    ;;
esac

# ─── Verificação de dependências ──────────────────────────────────────────────
if ! command -v k6 &> /dev/null; then
  log_erro "K6 não encontrado. Por favor, instale o K6 antes de continuar."
  echo ""
  echo "Instalação no macOS:   brew install k6"
  echo "Instalação no Linux:   https://k6.io/docs/get-started/installation/"
  echo "Instalação no Windows: choco install k6"
  exit 1
fi

K6_VERSAO=$(k6 version | head -n1)
log_sucesso "K6 encontrado: $K6_VERSAO"

# ─── Configuração de diretórios ───────────────────────────────────────────────

# Detecta o diretório raiz do projeto (pai do diretório 'scripts')
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ_PROJETO="$(dirname "$SCRIPT_DIR")"

# Gera timestamp no formato YYYY-MM-DD_HH-MM-SS para nomear a pasta do relatório
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')

# Pasta do relatório: reports/YYYY-MM-DD_HH-MM-SS_cenario/
PASTA_RELATORIO="$RAIZ_PROJETO/reports/${TIMESTAMP}_${CENARIO}"
mkdir -p "$PASTA_RELATORIO"

log_sucesso "Pasta de relatório criada: $PASTA_RELATORIO"

# ─── Definição dos arquivos de teste ─────────────────────────────────────────
ARQUIVO_TESTE="$RAIZ_PROJETO/src/testes/${CENARIO}.test.js"

if [ ! -f "$ARQUIVO_TESTE" ]; then
  log_erro "Arquivo de teste não encontrado: $ARQUIVO_TESTE"
  exit 1
fi

# ─── Arquivos de saída ────────────────────────────────────────────────────────
ARQUIVO_JSON="$PASTA_RELATORIO/resultado.json"
ARQUIVO_SUMMARY="$PASTA_RELATORIO/summary.json"
ARQUIVO_LOG="$PASTA_RELATORIO/execucao.log"

# ─── Exibição do cabeçalho ────────────────────────────────────────────────────
echo ""
echo -e "${NEGRITO}${CIANO}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${NEGRITO}${CIANO}║           K6 - TESTE DE PERFORMANCE                  ║${RESET}"
echo -e "${NEGRITO}${CIANO}╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${NEGRITO}${CIANO}║${RESET}  Projeto  : k6-load-test                             ${NEGRITO}${CIANO}║${RESET}"
echo -e "${NEGRITO}${CIANO}║${RESET}  Cenário  : ${AMARELO}$(printf '%-38s' "$CENARIO")${RESET}${NEGRITO}${CIANO}║${RESET}"
echo -e "${NEGRITO}${CIANO}║${RESET}  Arquivo  : $(printf '%-40s' "${CENARIO}.test.js")${NEGRITO}${CIANO}║${RESET}"
echo -e "${NEGRITO}${CIANO}║${RESET}  Timestamp: $(printf '%-40s' "$TIMESTAMP")${NEGRITO}${CIANO}║${RESET}"
echo -e "${NEGRITO}${CIANO}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── Executar o teste ─────────────────────────────────────────────────────────
log_info "Iniciando execução do teste '$CENARIO'..."
log_info "Alvo: https://jsonplaceholder.typicode.com"
echo ""

# Executa o K6 com:
# --out json          : Exporta todas as métricas em tempo real para JSON
# --summary-export    : Exporta o resumo final em JSON separado
# 2>&1 | tee          : Exibe no terminal E salva em arquivo de log simultaneamente
set +e  # Desabilita o encerramento por erro para capturar o código de saída do pipeline

k6 run \
  --out "json=${ARQUIVO_JSON}" \
  --summary-export "${ARQUIVO_SUMMARY}" \
  "$ARQUIVO_TESTE" \
  2>&1 | tee "$ARQUIVO_LOG"

# Captura o código de saída do K6 (0 = sucesso, diferente de 0 = threshold violado)
STATUS_SAIDA=${PIPESTATUS[0]}

set -e  # Reabilita o encerramento por erro para o restante do script

# ─── Resultado da execução ────────────────────────────────────────────────────
echo ""
echo -e "${NEGRITO}${CIANO}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${NEGRITO}${CIANO}║                EXECUÇÃO CONCLUÍDA                    ║${RESET}"
echo -e "${NEGRITO}${CIANO}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

if [ $STATUS_SAIDA -eq 0 ]; then
  echo -e "  Status    : ${VERDE}${NEGRITO}✓ TODOS OS THRESHOLDS PASSARAM${RESET}"
else
  echo -e "  Status    : ${VERMELHO}${NEGRITO}✗ ALGUM THRESHOLD FOI VIOLADO (código: $STATUS_SAIDA)${RESET}"
fi

echo ""
echo -e "  ${NEGRITO}Arquivos gerados:${RESET}"
echo -e "  ├── ${CIANO}resultado.json${RESET}  → Métricas completas em tempo real"
echo -e "  ├── ${CIANO}summary.json${RESET}    → Resumo final com todos os thresholds"
echo -e "  └── ${CIANO}execucao.log${RESET}    → Log completo da execução"
echo ""
echo -e "  ${NEGRITO}Localização:${RESET}"
echo -e "  ${AMARELO}$PASTA_RELATORIO${RESET}"
echo ""
echo -e "  ${NEGRITO}Para gerar o relatório HTML interativo:${RESET}"
echo -e "  Abra o arquivo ${CIANO}reports/relatorio.html${RESET} no navegador"
echo ""

# ─── Instruções pós-execução ──────────────────────────────────────────────────
echo -e "${NEGRITO}Próximos passos:${RESET}"
echo ""
echo "  1. Analise o summary.json para verificar métricas consolidadas:"
echo "     cat $ARQUIVO_SUMMARY | python3 -m json.tool"
echo ""
echo "  2. Para análise detalhada, importe o resultado.json no Grafana"
echo "     (requer InfluxDB + Grafana configurados)"
echo ""
echo "  3. Abra reports/relatorio.html para visualização interativa"
echo ""
echo "  4. Compare com execuções anteriores em reports/"
echo "     ls -la $RAIZ_PROJETO/reports/"
echo ""

exit $STATUS_SAIDA
