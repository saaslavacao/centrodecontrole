// services/clienteService.js
// Toda regra sobre "o que é VIP", "o que é risco" mora aqui — nunca no front-end.

import { supabase } from './supabaseClient.js';

const DIAS_RISCO = 30;      // sem visita há mais que isso = em risco
const DIAS_INATIVO = 90;
const VISITAS_RECORRENTE = 2;
const GASTO_VIP = 1500;     // total gasto a partir do qual vira VIP

export function calcularStatus(cliente) {
  if (!cliente.ultima_visita) return 'novo';
  const dias = Math.floor((Date.now() - new Date(cliente.ultima_visita).getTime()) / 86400000);
  if (dias > DIAS_INATIVO) return 'inativo';
  if (cliente.total_gasto >= GASTO_VIP) return 'vip';
  if (dias > DIAS_RISCO) return 'em_risco';
  if (cliente.qtd_visitas >= VISITAS_RECORRENTE) return 'recorrente';
  return 'novo';
}

export async function listar(empresaId, { busca = '', status = null } = {}) {
  let query = supabase.from('clientes').select('*').eq('empresa_id', empresaId).is('deletado_em', null);
  if (status) query = query.eq('status', status);
  if (busca) query = query.or(`nome.ilike.%${busca}%,placa.ilike.%${busca}%,veiculo.ilike.%${busca}%`);
  const { data, error } = await query.order('ultima_visita', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buscarPorId(id) {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function criar(empresaId, dados) {
  const { data, error } = await supabase.from('clientes')
    .insert({ empresa_id: empresaId, ...dados, status: 'novo' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, dados) {
  const { data, error } = await supabase.from('clientes').update(dados).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function emRisco(empresaId, limite = 5) {
  const clientes = await listar(empresaId, { status: 'em_risco' });
  return clientes.slice(0, limite);
}

export async function vip(empresaId) {
  return listar(empresaId, { status: 'vip' });
}

/** Agrupa clientes por faixa de dias sem retorno — usado na Agenda de Retorno. */
export async function agendaDeRetorno(empresaId) {
  const { data, error } = await supabase.from('clientes')
    .select('*')
    .eq('empresa_id', empresaId)
    .is('deletado_em', null)
    .not('ultima_visita', 'is', null)
    .order('ultima_visita', { ascending: true });
  if (error) throw error;

  const hoje = Date.now();
  const diasDe = (c) => Math.floor((hoje - new Date(c.ultima_visita).getTime()) / 86400000);
  const faixas = [
    { label: '15 dias sem voltar', min: 14, max: 24, clientes: [] },
    { label: '30 dias sem voltar', min: 25, max: 44, clientes: [] },
    { label: '60 dias sem voltar', min: 45, max: 74, clientes: [] },
    { label: '90 dias sem voltar', min: 75, max: Infinity, clientes: [] },
  ];
  for (const c of data) {
    const dias = diasDe(c);
    const faixa = faixas.find(f => dias >= f.min && dias <= f.max);
    if (faixa) faixa.clientes.push({ ...c, dias });
  }
  return faixas;
}

/** Recalcula total_gasto, qtd_visitas e status a partir do histórico de atendimentos. */
export async function recalcularEstatisticas(clienteId) {
  const { data: atendimentos, error } = await supabase
    .from('atendimentos')
    .select('valor, status')
    .eq('cliente_id', clienteId)
    .eq('status', 'entregue')
    .is('deletado_em', null);
  if (error) throw error;

  const totalGasto = atendimentos.reduce((soma, a) => soma + (a.valor || 0), 0);
  const qtdVisitas = atendimentos.length;
  const cliente = await buscarPorId(clienteId);
  const status = calcularStatus({ ...cliente, total_gasto: totalGasto, qtd_visitas: qtdVisitas });

  return atualizar(clienteId, { total_gasto: totalGasto, qtd_visitas: qtdVisitas, status });
}
