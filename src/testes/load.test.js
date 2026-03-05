/**
 * load.test.js — Teste de Carga (Load Test)
 *
 * Simula o tráfego normal e de pico esperado para a aplicação.
 * Este é o teste mais importante para validar a capacidade do sistema
 * sob condições reais de uso.
 *
 * Estratégia de carga:
 * - Ramp-up gradual para evitar pico artificial de início
 * - Pico de 500 VUs sustentado por 2 minutos
 * - Ramp-down para verificar recuperação do sistema
 *
 * Grupos de teste (simulando jornadas reais de usuário):
 * 1. Leitura de Posts  — Listagem da página principal (100% das iterações)
 * 2. Detalhes de Post  — Acesso a um post específico (100% das iterações)
 * 3. Dados do Usuário  — Perfil do autor do post (100% das iterações)
 * 4. Criação de Post   — Submit de formulário (apenas 10% das iterações)
 *
 * Métricas customizadas:
 * - Trend: mede distribuição de latência por endpoint
 * - Counter: conta total de requisições por endpoint
 */

import http from 'k6/http';
import { sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Configurações centralizadas
import { BASE_URL, OPCOES_LOAD } from '../config/opcoes.js';

// Geração automática do relatório HTML ao final da execução
import { gerarHandleSummary } from '../helpers/relatorio.js';
export const handleSummary = gerarHandleSummary('load');

// Helpers de verificação
import {
  verificarRespostaLista,
  verificarRespostaGet,
  verificarRespostaPost,
  gerarPayloadPost,
} from '../helpers/verificacoes.js';

// ─── Configuração do teste ────────────────────────────────────────────────────
export const options = OPCOES_LOAD;

// ─── Métricas customizadas ────────────────────────────────────────────────────
// Trend: registra e agrega valores de tempo (p50, p90, p95, p99, avg, min, max)
// Permite análise granular de latência por endpoint individualmente.
const tendenciaListarPosts    = new Trend('duracao_listar_posts', true);    // true = em milissegundos
const tendenciaDetalhePost    = new Trend('duracao_detalhe_post', true);
const tendenciaDadosUsuario   = new Trend('duracao_dados_usuario', true);
const tendenciaCriarPost      = new Trend('duracao_criar_post', true);

// Counter: conta ocorrências (incremento simples)
// Útil para rastrear quantas vezes cada endpoint foi chamado no total.
const contadorListarPosts     = new Counter('total_listar_posts');
const contadorDetalhePost     = new Counter('total_detalhe_post');
const contadorDadosUsuario    = new Counter('total_dados_usuario');
const contadorCriarPost       = new Counter('total_criar_post');

// ─── Headers padrão ───────────────────────────────────────────────────────────
const HEADERS_PADRAO = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * sleepRealistico — Gera uma pausa entre requisições com variação aleatória
 *
 * Usuários reais não têm um timing uniforme. Adicionar variação ao sleep
 * evita que todos os VUs façam requisições exatamente ao mesmo tempo,
 * criando uma distribuição mais natural de carga.
 *
 * @param {number} base - Tempo mínimo de pausa em segundos
 * @param {number} variacao - Variação máxima adicional em segundos
 */
function sleepRealistico(base = 1, variacao = 2) {
  // Math.random() retorna entre 0 (inclusivo) e 1 (exclusivo)
  sleep(base + Math.random() * variacao);
}

/**
 * idAleatorio — Gera um ID inteiro aleatório dentro de um intervalo
 *
 * @param {number} min - ID mínimo (inclusivo)
 * @param {number} max - ID máximo (inclusivo)
 * @returns {number}
 */
function idAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Função principal de execução ─────────────────────────────────────────────
export default function () {
  // IDs aleatórios garantem que não testemos sempre o mesmo recurso,
  // o que poderia inflacionar artificialmente o cache da API.
  const idPost    = idAleatorio(1, 100);  // JSONPlaceholder tem posts de 1 a 100
  const idUsuario = idAleatorio(1, 10);   // JSONPlaceholder tem usuários de 1 a 10

  // ── Grupo 1: Leitura de Posts ──────────────────────────────────────────────
  // Simula o usuário acessando a página principal que lista os posts.
  // Este é o endpoint mais crítico — 100% das iterações passam por aqui.
  group('Leitura de Posts', function () {
    const resposta = http.get(`${BASE_URL}/posts`, {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'listar_posts',
        operacao: 'leitura',
        grupo: 'listagem',
      },
    });

    // Registra a duração nas métricas customizadas
    tendenciaListarPosts.add(resposta.timings.duration);
    contadorListarPosts.add(1);

    verificarRespostaLista(resposta, 'GET /posts');
    sleepRealistico(1, 1.5);
  });

  // ── Grupo 2: Detalhes de Post ──────────────────────────────────────────────
  // Simula o usuário clicando em um post para ver os detalhes.
  // Usa ID aleatório para evitar cache e simular tráfego real.
  group('Detalhes de Post', function () {
    const resposta = http.get(`${BASE_URL}/posts/${idPost}`, {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'detalhe_post',
        operacao: 'leitura',
        grupo: 'detalhe',
      },
    });

    tendenciaDetalhePost.add(resposta.timings.duration);
    contadorDetalhePost.add(1);

    verificarRespostaGet(resposta, `GET /posts/${idPost}`);
    sleepRealistico(0.5, 1);
  });

  // ── Grupo 3: Dados do Usuário ──────────────────────────────────────────────
  // Simula o carregamento do perfil do autor do post.
  // Representa a navegação para a página do autor.
  group('Dados do Usuário', function () {
    const resposta = http.get(`${BASE_URL}/users/${idUsuario}`, {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'dados_usuario',
        operacao: 'leitura',
        grupo: 'usuario',
      },
    });

    tendenciaDadosUsuario.add(resposta.timings.duration);
    contadorDadosUsuario.add(1);

    verificarRespostaGet(resposta, `GET /users/${idUsuario}`);
    sleepRealistico(1, 2);
  });

  // ── Grupo 4: Criação de Post ───────────────────────────────────────────────
  // Simula o usuário submetendo um formulário para criar um novo post.
  // Apenas 10% das iterações executam este grupo, pois operações de
  // escrita são muito menos frequentes que leituras em sistemas reais.
  // A proporção de 10% é uma heurística comum em testes de carga de APIs REST.
  if (Math.random() < 0.10) {
    group('Criação de Post', function () {
      const payload = gerarPayloadPost(idUsuario);

      const resposta = http.post(
        `${BASE_URL}/posts`,
        JSON.stringify(payload),
        {
          headers: HEADERS_PADRAO,
          tags: {
            endpoint: 'criar_post',
            operacao: 'escrita',
            grupo: 'criacao',
          },
        }
      );

      tendenciaCriarPost.add(resposta.timings.duration);
      contadorCriarPost.add(1);

      verificarRespostaPost(resposta, 'POST /posts', payload);
      sleepRealistico(2, 3); // Usuários demoram mais após submeter formulários
    });
  }
}
