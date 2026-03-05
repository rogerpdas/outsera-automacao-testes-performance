/**
 * opcoes.js — Configurações centralizadas para os testes de performance K6
 *
 * Este arquivo define os thresholds globais, tags de segmentação e
 * a URL base da API. Centralizar essas configurações garante
 * consistência entre os diferentes cenários de teste.
 */

// ─── URL base da API alvo ─────────────────────────────────────────────────────
// Nunca use URLs hardcoded nos arquivos de teste. Sempre importe daqui.
export const BASE_URL = 'https://jsonplaceholder.typicode.com';

// ─── Tags globais ─────────────────────────────────────────────────────────────
// Tags são usadas para segmentar e filtrar resultados nos relatórios.
// Podem ser sobrepostas por tags locais em cada requisição.
export const TAGS_GLOBAIS = {
  ambiente: 'homologacao',   // Ex: development, staging, production
  projeto: 'k6-load-test',   // Nome do projeto para rastreabilidade
  api: 'jsonplaceholder',    // Identificador da API testada
};

// ─── Thresholds globais ───────────────────────────────────────────────────────
// Define os critérios de aceite (SLA) para os testes.
// O K6 marca o teste como FALHA se algum threshold for violado.
export const THRESHOLDS_PADRAO = {
  // Duração das requisições HTTP
  // p95 < 500ms: 95% das requisições devem responder em menos de 500ms
  // p99 < 1000ms: 99% das requisições devem responder em menos de 1 segundo
  http_req_duration: ['p(95)<500', 'p(99)<1000'],

  // Taxa de falha das requisições
  // rate < 0.01: menos de 1% das requisições podem falhar
  http_req_failed: ['rate<0.01'],
};

// ─── Thresholds tolerantes (para testes de stress) ───────────────────────────
// Em cenários de stress, aceitamos uma margem de erro maior,
// pois o objetivo é encontrar o ponto de ruptura do sistema.
export const THRESHOLDS_STRESS = {
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  http_req_failed: ['rate<0.10'], // Até 10% de erros é tolerado em stress
};

// ─── Configuração do cenário Smoke ───────────────────────────────────────────
// Smoke test: validação rápida de que o sistema está operacional.
// Usa o mínimo de carga possível para detectar erros óbvios.
export const OPCOES_SMOKE = {
  vus: 1,         // Apenas 1 usuário virtual
  duration: '30s', // Duração curta de 30 segundos
  thresholds: {
    ...THRESHOLDS_PADRAO,
    // Smoke é mais rigoroso — erros aqui indicam problema grave
    http_req_failed: ['rate<0.001'],
  },
  tags: TAGS_GLOBAIS,
};

// ─── Configuração do cenário Load ────────────────────────────────────────────
// Load test: simula carga normal e pico de tráfego esperado.
// Usa stages para simular ramp-up gradual, pico e ramp-down.
export const OPCOES_LOAD = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp-up inicial até 100 VUs
    { duration: '1m', target: 300 },  // Subida para carga média de 300 VUs
    { duration: '1m', target: 500 },  // Subida até o pico de 500 VUs
    { duration: '2m', target: 500 },  // Sustentação do pico por 2 minutos
    { duration: '30s', target: 0 },   // Ramp-down gradual até zero
  ],
  thresholds: {
    ...THRESHOLDS_PADRAO,
    // Thresholds por grupo (endpoint específico)
    'http_req_duration{endpoint:listar_posts}': ['p(95)<400'],
    'http_req_duration{endpoint:detalhe_post}': ['p(95)<400'],
    'http_req_duration{endpoint:dados_usuario}': ['p(95)<450'],
    'http_req_duration{endpoint:criar_post}': ['p(95)<600'],
  },
  tags: TAGS_GLOBAIS,
};

// ─── Configuração do cenário Stress ──────────────────────────────────────────
// Stress test: empurra o sistema além da capacidade normal para
// identificar gargalos, vazamentos de memória e pontos de falha.
export const OPCOES_STRESS = {
  stages: [
    { duration: '2m', target: 200 },   // Aquecimento com 200 VUs
    { duration: '2m', target: 400 },   // Subida para 400 VUs
    { duration: '2m', target: 600 },   // Subida para 600 VUs
    { duration: '2m', target: 800 },   // Subida para 800 VUs
    { duration: '2m', target: 1000 },  // Pico máximo de 1000 VUs
    { duration: '1m', target: 0 },     // Ramp-down rápido
  ],
  thresholds: THRESHOLDS_STRESS,
  tags: {
    ...TAGS_GLOBAIS,
    cenario: 'stress',
  },
};
