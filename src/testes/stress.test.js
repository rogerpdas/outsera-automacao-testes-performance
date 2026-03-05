/**
 * stress.test.js — Teste de Stress (Stress Test)
 *
 * O teste de stress empurra o sistema além de sua capacidade normal para
 * identificar o ponto de ruptura, gargalos de performance e comportamento
 * sob condições extremas.
 *
 * Objetivos do stress test:
 * 1. Identificar o número máximo de VUs que o sistema suporta
 * 2. Verificar se o sistema se recupera após sobrecarga (resiliência)
 * 3. Detectar vazamentos de memória (memory leaks) em execução prolongada
 * 4. Validar mensagens de erro retornadas sob alta carga
 * 5. Medir degradação gradual de performance conforme carga aumenta
 *
 * Estratégia de carga:
 * - Ramp-up mais agressivo (200 VUs a cada 2 minutos)
 * - Pico máximo de 1000 VUs
 * - Thresholds tolerantes (até 10% de erro é aceitável)
 * - Ramp-down de 1 minuto para observar recuperação
 *
 * ATENÇÃO: Este teste gera carga significativa.
 * Execute apenas em ambientes de homologação/staging.
 * NUNCA execute diretamente em produção sem janela de manutenção.
 */

import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Configurações centralizadas
import { BASE_URL, OPCOES_STRESS } from '../config/opcoes.js';

// Helpers de verificação
import { logarErro, gerarPayloadPost } from '../helpers/verificacoes.js';

// ─── Configuração do teste ────────────────────────────────────────────────────
export const options = OPCOES_STRESS;

// ─── Métricas customizadas ────────────────────────────────────────────────────
// Em stress tests, monitoramos adicionalmente a taxa de erros por endpoint
// para identificar qual serviço específico está falhando primeiro.

const tendenciaGeral         = new Trend('stress_duracao_geral', true);
const contadorRequisicoes    = new Counter('stress_total_requisicoes');

// Rate: mede proporção (0 a 1) de ocorrências verdadeiras vs total
// Ideal para monitorar taxa de erros em tempo real durante o stress.
const taxaErros              = new Rate('stress_taxa_erros');
const taxaSuccesso           = new Rate('stress_taxa_sucesso');

// ─── Headers padrão ───────────────────────────────────────────────────────────
const HEADERS_PADRAO = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * sleepAgressivo — Pausa menor que o teste de carga normal
 *
 * Em stress tests, mantemos o sleep mínimo para maximizar
 * a pressão sobre o sistema. Ainda assim, alguma variação
 * é necessária para evitar thundering herd (avalanche síncrona).
 */
function sleepAgressivo() {
  sleep(0.5 + Math.random() * 1.0); // Entre 0.5s e 1.5s
}

/**
 * idAleatorio — Gera ID aleatório em intervalo definido
 */
function idAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * registrarResultado — Registra nas métricas customizadas se a requisição foi bem-sucedida
 *
 * @param {Object} resposta - Resposta HTTP do K6
 * @param {string} nomeEndpoint - Nome do endpoint para log de erros
 */
function registrarResultado(resposta, nomeEndpoint) {
  const sucesso = resposta.status >= 200 && resposta.status < 400;

  // Registra nas métricas de rate (0 = falha, 1 = sucesso)
  taxaErros.add(!sucesso);
  taxaSuccesso.add(sucesso);
  tendenciaGeral.add(resposta.timings.duration);
  contadorRequisicoes.add(1);

  // Loga erro apenas quando necessário para não sobrecarregar os logs
  // sob alta carga (1000 VUs podem gerar muitos erros simultaneamente)
  if (!sucesso) {
    logarErro(nomeEndpoint, resposta);
  }

  return sucesso;
}

// ─── Função principal de execução ─────────────────────────────────────────────
export default function () {
  const idPost    = idAleatorio(1, 100);
  const idUsuario = idAleatorio(1, 10);

  // ── Bloco 1: Requisições de leitura básica ─────────────────────────────────
  // Foco principal do stress: endpoints de leitura são os mais acessados
  group('Stress - Leitura', function () {
    // GET /posts — endpoint mais crítico e mais acessado
    const respostaPosts = http.get(`${BASE_URL}/posts`, {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'listar_posts',
        operacao: 'leitura',
        cenario: 'stress',
      },
    });

    // Validação simplificada para stress test — priorizamos velocidade
    const sucessoPosts = check(respostaPosts, {
      'stress - /posts status 200': (r) => r.status === 200,
      'stress - /posts responde': (r) => r.timings.duration < 5000, // Limite bem generoso no stress
    });
    registrarResultado(respostaPosts, 'stress GET /posts');

    sleepAgressivo();

    // GET /posts/:id — endpoint de detalhe
    const respostaDetalhe = http.get(`${BASE_URL}/posts/${idPost}`, {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'detalhe_post',
        operacao: 'leitura',
        cenario: 'stress',
      },
    });

    check(respostaDetalhe, {
      'stress - /posts/:id status 200': (r) => r.status === 200,
    });
    registrarResultado(respostaDetalhe, `stress GET /posts/${idPost}`);

    sleepAgressivo();
  });

  // ── Bloco 2: Dados de usuário ──────────────────────────────────────────────
  group('Stress - Usuários', function () {
    const respostaUsuario = http.get(`${BASE_URL}/users/${idUsuario}`, {
      headers: HEADERS_PADRAO,
      tags: {
        endpoint: 'dados_usuario',
        operacao: 'leitura',
        cenario: 'stress',
      },
    });

    check(respostaUsuario, {
      'stress - /users/:id status 200': (r) => r.status === 200,
    });
    registrarResultado(respostaUsuario, `stress GET /users/${idUsuario}`);

    sleepAgressivo();
  });

  // ── Bloco 3: Operações de escrita (5% das iterações) ──────────────────────
  // Menos frequente que no load test para focar a pressão nas leituras,
  // mas ainda presente para simular a mistura real de operações.
  if (Math.random() < 0.05) {
    group('Stress - Escrita', function () {
      const payload = gerarPayloadPost(idUsuario);

      const respostaPost = http.post(
        `${BASE_URL}/posts`,
        JSON.stringify(payload),
        {
          headers: HEADERS_PADRAO,
          tags: {
            endpoint: 'criar_post',
            operacao: 'escrita',
            cenario: 'stress',
          },
        }
      );

      check(respostaPost, {
        'stress - POST /posts status 201': (r) => r.status === 201,
      });
      registrarResultado(respostaPost, 'stress POST /posts');

      sleepAgressivo();
    });
  }
}
