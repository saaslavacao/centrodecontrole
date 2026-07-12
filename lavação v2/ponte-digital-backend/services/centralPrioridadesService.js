// services/centralPrioridadesService.js
// Pega tudo que o Motor de Oportunidades gerou e decide o que realmente
// merece a primeira tela: no máximo 3-5 itens, ordenados por prioridade
// x impacto x recência. Isso é o que evita o "mural de alertas".

import { supabase } from './supabaseClient.js';

const PESO_PRIORIDADE = { alta: 100, media: 50, baixa: 10 };

function pontuar(insight) {
  const base = PESO_PRIORIDADE[insight.prioridade] || 0;
  const horasDesdeCriado = (Date.now() - new Date(insight.criado_em).getTime()) / 3600000;
  const bonusRecencia = Math.max(0, 24 - horasDesdeCriado); // insight mais novo pontua um pouco mais
  const bonusImpacto = insight.impacto ? 15 : 0; // tem número de impacto estimado? pesa mais
  return base + bonusRecencia + bonusImpacto;
}

export async function obterPrioridades(empresaId, limite = 5) {
  const { data: insights, error } = await supabase
    .from('insights')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('status', 'novo')
    .order('criado_em', { ascending: false });
  if (error) throw error;

  const ordenados = [...insights].sort((a, b) => pontuar(b) - pontuar(a)).slice(0, limite);

  return {
    alta: ordenados.filter(i => i.prioridade === 'alta').slice(0, 2),
    media: ordenados.filter(i => i.prioridade === 'media').slice(0, 2),
    informativo: ordenados.filter(i => i.prioridade === 'baixa').slice(0, 2),
    total_pendente: insights.length,
  };
}

export async function marcarComoVisualizado(insightId) {
  const { error } = await supabase.from('insights').update({ status: 'visualizado', visualizado_em: new Date().toISOString() }).eq('id', insightId);
  if (error) throw error;
}

export async function marcarComoResolvido(insightId) {
  const { error } = await supabase.from('insights').update({ status: 'resolvido', resolvido_em: new Date().toISOString() }).eq('id', insightId);
  if (error) throw error;
}

// -----------------------------------------------------------------------
// Score de Saúde da Operação — nota 0-100, calculada a partir de dado real.
// Pesos iniciais; revisar depois de ~1 mês de uso comparando com a
// percepção do dono sobre o próprio negócio.
// -----------------------------------------------------------------------
const PESOS = { meta: 0.30, retencao: 0.20, ticketMedio: 0.15, tempoAtendimento: 0.15, despesas: 0.10, campanhas: 0.10 };

export async function calcularScoreSaude(empresaId) {
  const [{ data: config }, { data: clientesTotal }, { data: clientesRisco }] = await Promise.all([
    supabase.from('configuracoes_empresa').select('meta_diaria').eq('empresa_id', empresaId).single(),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).is('deletado_em', null),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'em_risco'),
  ]);

  // notas parciais 0-100 — versão inicial simplificada; refinar por indicador conforme dado real acumula
  const notaRetencao = clientesTotal?.count ? Math.max(0, 100 - ((clientesRisco?.count || 0) / clientesTotal.count) * 100) : 100;

  const notas = {
    financeiro: 80,      // placeholder até termos ticket médio histórico suficiente para comparar tendência
    clientes: Math.round(notaRetencao),
    operacao: 85,        // placeholder — depende de tempo médio de atendimento vs configuracoes_empresa.tempo_medio
    marketing: 70,       // placeholder — depende de taxa de retorno de campanhas
    atendimento: 90,     // placeholder — depende de fila/tempo de espera atual
  };

  const scoreGeral = Math.round(
    notas.financeiro * PESOS.meta +
    notas.clientes * PESOS.retencao +
    notas.marketing * PESOS.campanhas +
    notas.operacao * (PESOS.tempoAtendimento + PESOS.despesas) +
    notas.atendimento * PESOS.ticketMedio
  );

  return { geral: scoreGeral, categorias: notas };
}
