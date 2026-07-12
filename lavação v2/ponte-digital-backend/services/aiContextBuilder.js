// services/aiContextBuilder.js
// IMPORTANTE: este arquivo roda só no servidor (dentro da Netlify Function),
// nunca no navegador. Por isso ele NÃO importa os services do front-end
// (clienteService.js, financeiroService.js...) — aqueles usam o cliente
// Supabase "de navegador" (via esm.sh) e dependem implicitamente do
// contexto do browser. Aqui usamos o `supabaseAdmin` (service role key,
// só existe no servidor) com queries diretas, um pouco duplicadas em
// relação aos services do front — é o preço de não termos um bundler
// nesta v1 ("JavaScript puro"). Se um dia entrar um bundler (Vite/esbuild),
// dá pra unificar num só arquivo de verdade compartilhado.

const PALAVRAS_POR_INTENCAO = {
  financeiro: ['venda', 'faturamento', 'meta', 'lucro', 'dinheiro', 'caixa'],
  clientes: ['cliente', 'chamar', 'retorno', 'vip', 'risco', 'sumiu', 'sumido'],
  operacao: ['fila', 'atendimento', 'aguardando', 'carro', 'operação', 'demora'],
  resumo: ['resumo', 'como está', 'como estão', 'geral', 'negócio', 'empresa'],
};

function identificarIntencao(pergunta) {
  const texto = pergunta.toLowerCase();
  for (const [intencao, palavras] of Object.entries(PALAVRAS_POR_INTENCAO)) {
    if (palavras.some(p => texto.includes(p))) return intencao;
  }
  return 'resumo';
}

function diasSemVisita(cliente) {
  if (!cliente.ultima_visita) return null;
  return Math.floor((Date.now() - new Date(cliente.ultima_visita).getTime()) / 86400000);
}

async function faturamentoDoDia(supabaseAdmin, empresaId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin.from('financeiro')
    .select('valor, categoria:categorias_financeiras(tipo)')
    .eq('empresa_id', empresaId).eq('data', hoje).is('deletado_em', null);
  return (data || []).filter(l => l.categoria?.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
}

async function faturamentoDoMes(supabaseAdmin, empresaId) {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin.from('financeiro')
    .select('valor, categoria:categorias_financeiras(tipo)')
    .eq('empresa_id', empresaId).gte('data', inicio).is('deletado_em', null);
  return (data || []).filter(l => l.categoria?.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
}

async function ticketMedio(supabaseAdmin, empresaId, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data } = await supabaseAdmin.from('atendimentos').select('valor')
    .eq('empresa_id', empresaId).eq('status', 'entregue').gte('criado_em', desde);
  if (!data?.length) return 0;
  return data.reduce((s, a) => s + Number(a.valor || 0), 0) / data.length;
}

async function clientesEmRisco(supabaseAdmin, empresaId, limite = 10) {
  const { data } = await supabaseAdmin.from('clientes').select('nome, ultima_visita')
    .eq('empresa_id', empresaId).eq('status', 'em_risco').is('deletado_em', null).limit(limite);
  return data || [];
}

async function clientesVip(supabaseAdmin, empresaId) {
  const { data } = await supabaseAdmin.from('clientes').select('nome')
    .eq('empresa_id', empresaId).eq('status', 'vip').is('deletado_em', null);
  return data || [];
}

async function atendimentosDeHoje(supabaseAdmin, empresaId) {
  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin.from('atendimentos').select('status')
    .eq('empresa_id', empresaId).is('deletado_em', null).gte('criado_em', inicioDoDia.toISOString());
  return data || [];
}

async function metaDiaria(supabaseAdmin, empresaId) {
  const { data } = await supabaseAdmin.from('configuracoes_empresa').select('meta_diaria').eq('empresa_id', empresaId).single();
  return data?.meta_diaria || 0;
}

/**
 * Monta o contexto para uma pergunta específica — só o necessário, nunca a base inteira.
 * `supabaseAdmin` é o client Supabase server-side (service role), criado dentro da function.
 */
export async function montarContexto(pergunta, empresaId, supabaseAdmin) {
  const intencao = identificarIntencao(pergunta);

  if (intencao === 'financeiro') {
    const [meta, hoje, mes, ticket] = await Promise.all([
      metaDiaria(supabaseAdmin, empresaId),
      faturamentoDoDia(supabaseAdmin, empresaId),
      faturamentoDoMes(supabaseAdmin, empresaId),
      ticketMedio(supabaseAdmin, empresaId),
    ]);
    return { intencao, metaHoje: meta, faturamentoHoje: hoje, faturamentoMes: mes, ticketMedio: Math.round(ticket) };
  }

  if (intencao === 'clientes') {
    const [risco, vips] = await Promise.all([clientesEmRisco(supabaseAdmin, empresaId), clientesVip(supabaseAdmin, empresaId)]);
    return {
      intencao,
      clientesSemRetorno: risco.map(c => ({ nome: c.nome, dias: diasSemVisita(c) })),
      clientesVip: vips.map(c => c.nome),
    };
  }

  if (intencao === 'operacao') {
    const atendimentos = await atendimentosDeHoje(supabaseAdmin, empresaId);
    return {
      intencao,
      atendimentosHoje: atendimentos.length,
      aguardando: atendimentos.filter(a => a.status === 'aguardando').length,
      finalizados: atendimentos.filter(a => a.status === 'entregue').length,
    };
  }

  // resumo geral — enxuto mesmo assim: contagens, não listas inteiras
  const [meta, hoje, risco, vips, atendimentos] = await Promise.all([
    metaDiaria(supabaseAdmin, empresaId),
    faturamentoDoDia(supabaseAdmin, empresaId),
    clientesEmRisco(supabaseAdmin, empresaId),
    clientesVip(supabaseAdmin, empresaId),
    atendimentosDeHoje(supabaseAdmin, empresaId),
  ]);
  return {
    intencao: 'resumo', metaHoje: meta, faturamentoHoje: hoje,
    clientesSemRetorno: risco.length, clientesVip: vips.length, atendimentosHoje: atendimentos.length,
  };
}

/** Últimas trocas do mesmo usuário, pra "e comparado com semana passada?" fazer sentido. */
export async function buscarMemoriaCurta(empresaId, usuarioId, supabaseAdmin, limite = 3) {
  const { data, error } = await supabaseAdmin.from('conversas_ia')
    .select('pergunta, resposta').eq('empresa_id', empresaId).eq('usuario_id', usuarioId)
    .order('criado_em', { ascending: false }).limit(limite);
  if (error) return [];
  return data.reverse();
}

/** Persona automática — lê o papel do usuário logado, sem pedir pra ele escolher modo. */
export async function obterModoDoUsuario(usuarioId, supabaseAdmin) {
  const { data } = await supabaseAdmin.from('usuarios').select('papel').eq('id', usuarioId).single();
  if (data?.papel === 'operador') return 'operador';
  return 'dono'; // dono e admin_ponte_digital usam a leitura "dono" por padrão
}
