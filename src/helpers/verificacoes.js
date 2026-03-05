/**
 * verificacoes.js — Funções auxiliares para validação de respostas HTTP
 *
 * Este módulo centraliza todas as verificações de integridade das
 * respostas da API. Usar funções reutilizáveis evita duplicação de
 * código e garante consistência nas validações entre os testes.
 */

import { check } from 'k6';

// ─── Constantes de validação ──────────────────────────────────────────────────

// Tempo máximo aceitável de resposta em milissegundos para requisições GET
const TEMPO_MAX_GET_MS = 500;

// Tempo máximo aceitável para requisições POST (geralmente mais lentas)
const TEMPO_MAX_POST_MS = 800;

// Content-Type esperado para todas as respostas da API JSON
const CONTENT_TYPE_JSON = 'application/json; charset=utf-8';

// ─── Funções de verificação ───────────────────────────────────────────────────

/**
 * verificarRespostaGet
 *
 * Valida uma resposta HTTP de requisição GET contra um conjunto de
 * critérios de qualidade: status, corpo, content-type e tempo de resposta.
 *
 * @param {Object} resposta - Objeto de resposta do K6 (http.Response)
 * @param {string} nomeEndpoint - Nome legível do endpoint para logs
 * @returns {boolean} - true se todas as verificações passaram
 */
export function verificarRespostaGet(resposta, nomeEndpoint) {
  // O check() do K6 registra cada verificação individualmente nas métricas,
  // permitindo análise granular de qual validação específica falhou.
  const resultado = check(resposta, {
    // Verificação 1: Status HTTP deve ser 200 OK
    [`${nomeEndpoint} - status é 200`]: (r) => r.status === 200,

    // Verificação 2: O corpo da resposta não pode estar vazio
    [`${nomeEndpoint} - corpo não está vazio`]: (r) =>
      r.body !== null && r.body.length > 0,

    // Verificação 3: Content-Type deve indicar JSON
    [`${nomeEndpoint} - content-type é JSON`]: (r) =>
      r.headers['Content-Type'] === CONTENT_TYPE_JSON,

    // Verificação 4: Tempo de resposta dentro do threshold aceitável
    [`${nomeEndpoint} - tempo < ${TEMPO_MAX_GET_MS}ms`]: (r) =>
      r.timings.duration < TEMPO_MAX_GET_MS,
  });

  // Registra erro detalhado no log do K6 se alguma verificação falhar
  if (!resultado) {
    logarErro(nomeEndpoint, resposta);
  }

  return resultado;
}

/**
 * verificarRespostaPost
 *
 * Valida uma resposta HTTP de requisição POST. Além das verificações
 * padrão, valida se o recurso foi criado corretamente (status 201)
 * e se o body contém os campos esperados.
 *
 * @param {Object} resposta - Objeto de resposta do K6 (http.Response)
 * @param {string} nomeEndpoint - Nome legível do endpoint para logs
 * @param {Object} dadosEnviados - Payload original enviado na requisição
 * @returns {boolean} - true se todas as verificações passaram
 */
export function verificarRespostaPost(resposta, nomeEndpoint, dadosEnviados = {}) {
  // Tenta fazer o parse do JSON para validações mais profundas.
  // Se o parse falhar, as verificações de campo retornam false graciosamente.
  let corpo;
  try {
    corpo = resposta.json();
  } catch (_) {
    // Corpo não é JSON válido — as verificações de campo vão falhar naturalmente
    corpo = {};
  }

  const resultado = check(resposta, {
    // Verificação 1: Status HTTP deve ser 201 Created (recurso criado)
    [`${nomeEndpoint} - status é 201`]: (r) => r.status === 201,

    // Verificação 2: O corpo da resposta não pode estar vazio
    [`${nomeEndpoint} - corpo não está vazio`]: (r) =>
      r.body !== null && r.body.length > 0,

    // Verificação 3: Content-Type deve indicar JSON
    [`${nomeEndpoint} - content-type é JSON`]: (r) =>
      r.headers['Content-Type'] === CONTENT_TYPE_JSON,

    // Verificação 4: A resposta deve incluir um ID gerado pelo servidor
    [`${nomeEndpoint} - resposta contém ID`]: () =>
      corpo.id !== undefined && corpo.id !== null,

    // Verificação 5: O título enviado deve ser refletido na resposta
    [`${nomeEndpoint} - título foi persistido`]: () =>
      dadosEnviados.title ? corpo.title === dadosEnviados.title : true,

    // Verificação 6: Tempo de resposta POST dentro do threshold
    [`${nomeEndpoint} - tempo < ${TEMPO_MAX_POST_MS}ms`]: (r) =>
      r.timings.duration < TEMPO_MAX_POST_MS,
  });

  if (!resultado) {
    logarErro(nomeEndpoint, resposta);
  }

  return resultado;
}

/**
 * verificarRespostaLista
 *
 * Valida respostas que retornam arrays/listas de recursos.
 * Verifica adicionalmente se o corpo é um array não vazio.
 *
 * @param {Object} resposta - Objeto de resposta do K6 (http.Response)
 * @param {string} nomeEndpoint - Nome legível do endpoint para logs
 * @returns {boolean} - true se todas as verificações passaram
 */
export function verificarRespostaLista(resposta, nomeEndpoint) {
  let itens;
  try {
    itens = resposta.json();
  } catch (_) {
    itens = null;
  }

  const resultado = check(resposta, {
    [`${nomeEndpoint} - status é 200`]: (r) => r.status === 200,

    [`${nomeEndpoint} - corpo não está vazio`]: (r) =>
      r.body !== null && r.body.length > 0,

    // Verifica se a resposta é um array com pelo menos um item
    [`${nomeEndpoint} - retorna lista não vazia`]: () =>
      Array.isArray(itens) && itens.length > 0,

    [`${nomeEndpoint} - tempo < ${TEMPO_MAX_GET_MS}ms`]: (r) =>
      r.timings.duration < TEMPO_MAX_GET_MS,
  });

  if (!resultado) {
    logarErro(nomeEndpoint, resposta);
  }

  return resultado;
}

/**
 * logarErro
 *
 * Registra informações detalhadas de erro no log do K6.
 * Esta função é chamada automaticamente quando uma verificação falha,
 * mas também pode ser chamada manualmente para depuração.
 *
 * @param {string} nomeEndpoint - Nome do endpoint que falhou
 * @param {Object} resposta - Objeto de resposta do K6
 */
export function logarErro(nomeEndpoint, resposta) {
  // console.error() no K6 registra no nível ERROR, visível nos logs de execução
  console.error(
    `[FALHA] Endpoint: ${nomeEndpoint} | ` +
    `Status: ${resposta.status} | ` +
    `Duração: ${resposta.timings.duration.toFixed(2)}ms | ` +
    `URL: ${resposta.url}`
  );

  // Loga parte do corpo para diagnóstico (limitado a 200 chars para não poluir logs)
  if (resposta.body) {
    const resumoCorpo = resposta.body.substring(0, 200);
    console.error(`[FALHA] Corpo da resposta (primeiros 200 chars): ${resumoCorpo}`);
  }
}

/**
 * gerarPayloadPost
 *
 * Gera um payload padronizado e realista para requisições POST.
 * Centralizar a geração do payload facilita manutenção e garante
 * que os dados enviados nos testes sejam consistentes.
 *
 * @param {number} idUsuario - ID do usuário autor do post
 * @returns {Object} - Payload formatado para a API de posts
 */
export function gerarPayloadPost(idUsuario) {
  const timestamp = Date.now();
  return {
    title: `Teste de carga K6 - ${timestamp}`,
    body: `Post gerado automaticamente pelo teste de performance. ` +
          `Usuário: ${idUsuario}. Timestamp: ${timestamp}.`,
    userId: idUsuario,
  };
}
