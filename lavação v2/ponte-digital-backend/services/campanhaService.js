// services/campanhaService.js

import { supabase } from './supabaseClient.js';

export async function listar(empresaId) {
  const { data, error } = await supabase.from('campanhas').select('*').eq('empresa_id', empresaId).order('criado_em', { ascending: false });
  if (error) throw error;
  return data;
}

export async function criar(empresaId, { tipo, titulo, texto }) {
  const { data, error } = await supabase.from('campanhas').insert({ empresa_id: empresaId, tipo, titulo, texto }).select().single();
  if (error) throw error;
  return data;
}

export async function registrarEnvio(empresaId, campanhaId, clienteId) {
  const { data, error } = await supabase.from('campanhas_enviadas')
    .insert({ empresa_id: empresaId, campanha_id: campanhaId, cliente_id: clienteId, status: 'enviado' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function marcarComoLida(envioId) {
  const { error } = await supabase.from('campanhas_enviadas').update({ lido_em: new Date().toISOString() }).eq('id', envioId);
  if (error) throw error;
}

/** % de clientes que voltaram (novo atendimento) em até 7 dias após receber a campanha. */
export async function taxaDeRetorno(campanhaId) {
  const { data: envios, error } = await supabase
    .from('campanhas_enviadas')
    .select('cliente_id, enviado_em')
    .eq('campanha_id', campanhaId);
  if (error) throw error;
  if (!envios.length) return 0;

  let retornaram = 0;
  for (const envio of envios) {
    const limite = new Date(new Date(envio.enviado_em).getTime() + 7 * 86400000).toISOString();
    const { data: atendimento } = await supabase
      .from('atendimentos')
      .select('id')
      .eq('cliente_id', envio.cliente_id)
      .gte('criado_em', envio.enviado_em)
      .lte('criado_em', limite)
      .limit(1);
    if (atendimento?.length) retornaram++;
  }
  return Math.round((retornaram / envios.length) * 100);
}
