// services/financeiroService.js

import { supabase } from './supabaseClient.js';

export async function lancamentosDoDia(empresaId, data = new Date().toISOString().slice(0, 10)) {
  const { data: linhas, error } = await supabase
    .from('financeiro')
    .select('*, categoria:categorias_financeiras(nome, tipo)')
    .eq('empresa_id', empresaId)
    .eq('data', data)
    .is('deletado_em', null);
  if (error) throw error;
  return linhas;
}

export async function resumoDoDia(empresaId, data = new Date().toISOString().slice(0, 10)) {
  const linhas = await lancamentosDoDia(empresaId, data);
  const entradas = linhas.filter(l => l.categoria?.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
  const saidas = linhas.filter(l => l.categoria?.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0);
  return { entradas, saidas, lucro: entradas - saidas, linhas };
}

export async function resumoDoMes(empresaId, referencia = new Date()) {
  const inicio = new Date(referencia.getFullYear(), referencia.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: linhas, error } = await supabase
    .from('financeiro')
    .select('*, categoria:categorias_financeiras(nome, tipo)')
    .eq('empresa_id', empresaId)
    .gte('data', inicio).lte('data', fim)
    .is('deletado_em', null);
  if (error) throw error;

  const entradas = linhas.filter(l => l.categoria?.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
  const saidas = linhas.filter(l => l.categoria?.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0);
  return { entradas, saidas, lucro: entradas - saidas };
}

export async function registrarLancamento(empresaId, { categoriaId, valor, observacoes, data }) {
  const { data: linha, error } = await supabase.from('financeiro')
    .insert({ empresa_id: empresaId, categoria_id: categoriaId, valor, observacoes, data: data || new Date().toISOString().slice(0, 10) })
    .select().single();
  if (error) throw error;
  return linha;
}

export async function ticketMedio(empresaId, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await supabase
    .from('atendimentos')
    .select('valor')
    .eq('empresa_id', empresaId)
    .eq('status', 'entregue')
    .gte('criado_em', desde);
  if (error) throw error;
  if (!data.length) return 0;
  return data.reduce((s, a) => s + Number(a.valor || 0), 0) / data.length;
}

/** Faturamento por dia da semana, últimas N semanas — alimenta o calendário de movimento. */
export async function faturamentoPorDiaDaSemana(empresaId, semanas = 8) {
  const desde = new Date(Date.now() - semanas * 7 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('atendimentos')
    .select('valor, criado_em')
    .eq('empresa_id', empresaId)
    .eq('status', 'entregue')
    .gte('criado_em', desde);
  if (error) throw error;

  const porDia = [0, 0, 0, 0, 0, 0, 0]; // dom .. sáb
  for (const a of data) porDia[new Date(a.criado_em).getDay()] += Number(a.valor || 0);
  return porDia;
}
