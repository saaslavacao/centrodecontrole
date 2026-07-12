// services/motorOportunidades.js
// Roda no servidor (Netlify Function agendada — ver netlify/functions/rodar-motor-oportunidades.js).
// Recebe `supabaseAdmin` (service role) de quem chama; não usa o cliente de navegador
// pelo mesmo motivo explicado em aiContextBuilder.js. Não usa IA: cada função aqui
// é uma query + uma condição. Grava o resultado em `insights`.

async function jaExisteHoje(supabaseAdmin, empresaId, tipo) {
  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin.from('insights')
    .select('id').eq('empresa_id', empresaId).eq('tipo', tipo)
    .gte('criado_em', inicioDoDia.toISOString()).limit(1);
  return !!data?.length;
}

async function registrar(supabaseAdmin, empresaId, insight) {
  if (await jaExisteHoje(supabaseAdmin, empresaId, insight.tipo)) return;
  await supabaseAdmin.from('insights').insert({ empresa_id: empresaId, origem: 'motor_oportunidades', ...insight });
}

async function faturamentoDoDia(supabaseAdmin, empresaId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin.from('financeiro')
    .select('valor, categoria:categorias_financeiras(tipo)')
    .eq('empresa_id', empresaId).eq('data', hoje).is('deletado_em', null);
  return (data || []).filter(l => l.categoria?.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
}

async function ticketMedioPeriodo(supabaseAdmin, empresaId, dias) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data } = await supabaseAdmin.from('atendimentos').select('valor')
    .eq('empresa_id', empresaId).eq('status', 'entregue').gte('criado_em', desde);
  if (!data?.length) return 0;
  return data.reduce((s, a) => s + Number(a.valor || 0), 0) / data.length;
}

// --- Regras individuais -----------------------------------------------

async function checarMetaDiaria(supabaseAdmin, empresaId) {
  const { data: config } = await supabaseAdmin.from('configuracoes_empresa').select('meta_diaria').eq('empresa_id', empresaId).single();
  if (!config?.meta_diaria) return;
  const entradas = await faturamentoDoDia(supabaseAdmin, empresaId);
  const pct = (entradas / config.meta_diaria) * 100;
  if (pct < 70) {
    const faltam = config.meta_diaria - entradas;
    await registrar(supabaseAdmin, empresaId, {
      tipo: 'META_ABAIXO', categoria: 'gestao', prioridade: pct < 50 ? 'alta' : 'media',
      titulo: `Meta diária ${Math.round(100 - pct)}% abaixo do esperado`,
      impacto: `R$ ${faltam.toFixed(0)} de faturamento em risco`,
      acao_sugerida: 'Acionar campanha para clientes ausentes; priorizar lavagem completa',
    });
  }
}

async function checarClientesSemRetorno(supabaseAdmin, empresaId) {
  const { data: clientes } = await supabaseAdmin.from('clientes')
    .select('id').eq('empresa_id', empresaId).eq('status', 'em_risco').is('deletado_em', null);
  if ((clientes?.length || 0) >= 5) {
    await registrar(supabaseAdmin, empresaId, {
      tipo: 'CLIENTES_SEM_RETORNO', categoria: 'comercial', prioridade: 'alta',
      titulo: `${clientes.length} clientes não retornam há mais de 30 dias`,
      acao_sugerida: 'Enviar campanha de retorno',
    });
  }
}

async function checarClientesVipEmRisco(supabaseAdmin, empresaId) {
  const { data: clientes } = await supabaseAdmin.from('clientes')
    .select('id, nome, ultima_visita').eq('empresa_id', empresaId).eq('status', 'vip').is('deletado_em', null);
  const emRisco = (clientes || []).filter(c => {
    if (!c.ultima_visita) return false;
    const dias = Math.floor((Date.now() - new Date(c.ultima_visita).getTime()) / 86400000);
    return dias > 20;
  });
  if (emRisco.length) {
    await registrar(supabaseAdmin, empresaId, {
      tipo: 'VIP_EM_RISCO', categoria: 'comercial', prioridade: 'media',
      titulo: `${emRisco.length} cliente(s) VIP há mais de 20 dias sem voltar`,
      descricao: emRisco.map(c => c.nome).join(', '),
      acao_sugerida: 'Ligar ou mandar mensagem pessoal, não campanha em massa',
    });
  }
}

async function checarTicketMedio(supabaseAdmin, empresaId) {
  const atual = await ticketMedioPeriodo(supabaseAdmin, empresaId, 7);
  const anterior = await ticketMedioPeriodo(supabaseAdmin, empresaId, 14); // aproximação simples pra v1
  if (!anterior) return;
  const variacao = atual - anterior;
  if (Math.abs(variacao) >= 10) {
    await registrar(supabaseAdmin, empresaId, {
      tipo: variacao > 0 ? 'TICKET_SUBIU' : 'TICKET_CAIU',
      categoria: 'produtos', prioridade: variacao > 0 ? 'baixa' : 'media',
      titulo: `Ticket médio ${variacao > 0 ? 'aumentou' : 'caiu'} R$ ${Math.abs(variacao).toFixed(0)}`,
      acao_sugerida: variacao < 0 ? 'Reforçar oferta de adicionais (higienização, polimento)' : null,
    });
  }
}

async function checarMelhorDiaDaSemana(supabaseAdmin, empresaId) {
  const semanas = 8;
  const desde = new Date(Date.now() - semanas * 7 * 86400000).toISOString();
  const { data } = await supabaseAdmin.from('atendimentos').select('valor, criado_em')
    .eq('empresa_id', empresaId).eq('status', 'entregue').gte('criado_em', desde);
  const porDia = [0, 0, 0, 0, 0, 0, 0];
  for (const a of data || []) porDia[new Date(a.criado_em).getDay()] += Number(a.valor || 0);

  const nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const maiorIndice = porDia.indexOf(Math.max(...porDia));
  const hojeIndice = new Date().getDay();
  if ((hojeIndice + 1) % 7 === maiorIndice) {
    await registrar(supabaseAdmin, empresaId, {
      tipo: 'DIA_FORTE_AMANHA', categoria: 'operacional', prioridade: 'baixa',
      titulo: `Amanhã (${nomes[maiorIndice]}) costuma ser o dia mais forte`,
      acao_sugerida: 'Considere reforçar a equipe ou o estoque de produtos',
    });
  }
}

/** Roda todas as regras para uma empresa. */
export async function rodar(supabaseAdmin, empresaId) {
  await Promise.allSettled([
    checarMetaDiaria(supabaseAdmin, empresaId),
    checarClientesSemRetorno(supabaseAdmin, empresaId),
    checarClientesVipEmRisco(supabaseAdmin, empresaId),
    checarTicketMedio(supabaseAdmin, empresaId),
    checarMelhorDiaDaSemana(supabaseAdmin, empresaId),
  ]);
}

/** Roda para todas as empresas ativas — usado pela function agendada. */
export async function rodarParaTodasAsEmpresas(supabaseAdmin) {
  const { data: empresas, error } = await supabaseAdmin.from('empresas').select('id').eq('ativo', true);
  if (error) throw error;
  for (const empresa of empresas) await rodar(supabaseAdmin, empresa.id);
}
