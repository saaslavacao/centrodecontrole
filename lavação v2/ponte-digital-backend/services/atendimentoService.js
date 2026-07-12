// services/atendimentoService.js
// Kanban: aguardando -> lavando -> finalizado -> entregue.
// Ao chegar em "entregue", atualiza automaticamente cliente e financeiro.

import { supabase } from './supabaseClient.js';
import { recalcularEstatisticas } from './clienteService.js';

const PROXIMO_STATUS = { aguardando: 'lavando', lavando: 'finalizado', finalizado: 'entregue' };

export async function listarHoje(empresaId) {
  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('atendimentos')
    .select('*, cliente:clientes(nome, veiculo, placa), servico:servicos(nome, valor)')
    .eq('empresa_id', empresaId)
    .is('deletado_em', null)
    .gte('criado_em', inicioDoDia.toISOString())
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return data;
}

export async function criar(empresaId, { clienteId, servicoId, valor, observacoes }) {
  const { data, error } = await supabase.from('atendimentos')
    .insert({ empresa_id: empresaId, cliente_id: clienteId, servico_id: servicoId, valor, observacoes, status: 'aguardando' })
    .select().single();
  if (error) throw error;
  return data;
}

/** Avança para o próximo estágio do kanban. Ao entregar, atualiza cliente e financeiro. */
export async function avancar(atendimentoId) {
  const { data: atual, error: errAtual } = await supabase.from('atendimentos').select('*').eq('id', atendimentoId).single();
  if (errAtual) throw errAtual;

  const proximo = PROXIMO_STATUS[atual.status];
  if (!proximo) return atual; // já está em "entregue"

  const patch = { status: proximo };
  if (proximo === 'entregue') patch.finalizado_em = new Date().toISOString();

  const { data: atualizado, error } = await supabase.from('atendimentos').update(patch).eq('id', atendimentoId).select().single();
  if (error) throw error;

  if (proximo === 'entregue') {
    await supabase.from('clientes').update({ ultima_visita: new Date().toISOString().slice(0, 10) }).eq('id', atual.cliente_id);
    await recalcularEstatisticas(atual.cliente_id);
    await lancarFinanceiroDoAtendimento(atualizado);
  }
  return atualizado;
}

async function lancarFinanceiroDoAtendimento(atendimento) {
  const { data: categoria } = await supabase
    .from('categorias_financeiras')
    .select('id')
    .eq('empresa_id', atendimento.empresa_id)
    .eq('nome', 'Lavagens')
    .single();
  if (!categoria) return; // categoria "Lavagens" não existe — configuração incompleta, não trava o fluxo
  await supabase.from('financeiro').insert({
    empresa_id: atendimento.empresa_id,
    categoria_id: categoria.id,
    atendimento_id: atendimento.id,
    valor: atendimento.valor,
    data: new Date().toISOString().slice(0, 10),
  });
}

export function agruparPorStatus(atendimentos) {
  const grupos = { aguardando: [], lavando: [], finalizado: [], entregue: [] };
  for (const a of atendimentos) grupos[a.status]?.push(a);
  return grupos;
}

// -----------------------------------------------------------------------
// services/servicoService.js (catálogo de serviços) — mesmo arquivo por
// simplicidade nesta v1; separar depois se o catálogo crescer.
// -----------------------------------------------------------------------
export async function listarServicos(empresaId) {
  const { data, error } = await supabase.from('servicos')
    .select('*').eq('empresa_id', empresaId).eq('ativo', true).is('deletado_em', null)
    .order('nome');
  if (error) throw error;
  return data;
}

export async function servicoMaisVendido(empresaId, dias = 7) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await supabase
    .from('atendimentos')
    .select('servico:servicos(nome), servico_id')
    .eq('empresa_id', empresaId)
    .eq('status', 'entregue')
    .gte('criado_em', desde);
  if (error) throw error;

  const contagem = {};
  for (const a of data) contagem[a.servico?.nome] = (contagem[a.servico?.nome] || 0) + 1;
  return Object.entries(contagem).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));
}
