/**
 * smoke.test.js — Teste de Fumaça (Smoke Test)
 *
 * O smoke test é o teste mais simples e rápido. Seu objetivo é validar
 * que o sistema básico está funcionando antes de aplicar qualquer carga.
 *
 * Estratégia:
 * - Apenas 1 usuário virtual (VU)
 * - Duração de 30 segundos
 * - Testa os endpoints mais críticos em sequência
 * - Falha imediata em qualquer erro indica problema grave de infraestrutura
 *
 * Quando executar:
 * - Antes de qualquer deploy em produção
 * - Como verificação de sanidade após incidentes
 * - Como primeiro passo antes dos testes de carga e stress
 */

import http from 'k6/http';
import { sleep } from 'k6';

// Importações das configurações centralizadas
import { BASE_URL, OPCOES_SMOKE } from '../config/opcoes.js';

// Importações dos helpers de verificação
import {
  verificarRespostaLista,
  verificarRespostaGet,
  verificarRespostaPost,
  gerarPayloadPost,
} from '../helpers/verificacoes.js';

// ─── Configuração do teste ────────────────────────────────────────────────────
// Exportar `options` é o mecanismo padrão do K6 para definir parâmetros de execução
export const options = OPCOES_SMOKE;

// ─── Headers padrão ───────────────────────────────────────────────────────────
// Definidos uma vez e reutilizados em todas as requisições do arquivo
const HEADERS_PADRAO = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// ─── Função principal de execução ─────────────────────────────────────────────
// Esta função é executada repetidamente pelo K6 para cada VU durante o teste.
// No smoke test, temos apenas 1 VU, então ela roda sequencialmente.
export default function () {

  // ── Teste 1: Listagem de Posts ──────────────────────────────────────────────
  // Valida que o endpoint principal de listagem está respondendo corretamente
  const respostaLista = http.get(`${BASE_URL}/posts`, {
    headers: HEADERS_PADRAO,
    tags: {
      endpoint: 'listar_posts',
      operacao: 'leitura',
      cenario: 'smoke',
    },
  });

  verificarRespostaLista(respostaLista, 'GET /posts');

  // Pausa entre requisições para simular comportamento humano
  // Em smoke tests, 1 segundo fixo é suficiente
  sleep(1);

  // ── Teste 2: Detalhe de um Post específico ──────────────────────────────────
  // Valida que o endpoint de item único funciona corretamente
  const respostaDetalhe = http.get(`${BASE_URL}/posts/1`, {
    headers: HEADERS_PADRAO,
    tags: {
      endpoint: 'detalhe_post',
      operacao: 'leitura',
      cenario: 'smoke',
    },
  });

  verificarRespostaGet(respostaDetalhe, 'GET /posts/1');

  sleep(1);

  // ── Teste 3: Criação de um novo Post ───────────────────────────────────────
  // Valida que operações de escrita também estão funcionando
  // A JSONPlaceholder não persiste de verdade, mas simula o comportamento
  const payload = gerarPayloadPost(1); // Usuário ID 1 para o smoke test

  const respostaPost = http.post(
    `${BASE_URL}/posts`,
    JSON.stringify(payload), // K6 exige que o body seja uma string
    {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'criar_post',
        operacao: 'escrita',
        cenario: 'smoke',
      },
    }
  );

  verificarRespostaPost(respostaPost, 'POST /posts', payload);

  sleep(1);
}
