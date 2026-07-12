// services/dashboardService.js
// Um único ponto de entrada para o front-end montar a tela inicial —
// evita a tela fazendo 8 chamadas soltas pros outros services.

import { supabase } from './supabaseClient.js';
import { resumoDoDia, resumoDoMes, ticketMedio } from './financeiroService.js';
import { emRisco, vip } from './clienteService.js';
import { listarHoje, agruparPorStatus } from './atendimentoService.js';
import { obterPrioridades, calcularScoreSaude } from './centralPrioridadesService.js';

export async function carregarResumo(empresaId) {
  const [config, financeiroDia, financeiroMes, ticket, clientesRisco, clientesVip,
    atendimentosHoje, prioridades, score, totais] = await Promise.all([
    supabase.from('configuracoes_empresa').select('*').eq('empresa_id', empresaId).single().then(r => r.data),
    resumoDoDia(empresaId),
    resumoDoMes(empresaId),
    ticketMedio(empresaId, 30),
    emRisco(empresaId),
    vip(empresaId),
    listarHoje(empresaId),
    obterPrioridades(empresaId),
    calcularScoreSaude(empresaId),
    contarClientes(empresaId),
  ]);

  const metaDiaria = config?.meta_diaria || 0;
  const metaMensal = config?.meta_mensal || 0;

  return {
    config,
    kpis: {
      carrosHoje: atendimentosHoje.length,
      faturamentoHoje: financeiroDia.entradas,
      faturamentoMes: financeiroMes.entradas,
      ticketMedio: Math.round(ticket),
      clientesNovos: totais.novos,
      clientesRecorrentes: totais.recorrentes,
      metaDiariaPct: metaDiaria ? Math.min(100, Math.round((financeiroDia.entradas / metaDiaria) * 100)) : 0,
      metaMensalPct: metaMensal ? Math.min(100, Math.round((financeiroMes.entradas / metaMensal) * 100)) : 0,
      clientesEmRisco: clientesRisco.length,
      clientesVip: clientesVip.length,
    },
    meta: {
      diaria: metaDiaria,
      atualDiaria: financeiroDia.entradas,
      faltamDiaria: Math.max(0, metaDiaria - financeiroDia.entradas),
    },
    clientesRisco,
    kanban: agruparPorStatus(atendimentosHoje),
    prioridades,
    score,
  };
}

async function contarClientes(empresaId) {
  const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ count: novos }, { count: recorrentes }] = await Promise.all([
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).gte('criado_em', seteDiasAtras),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'recorrente'),
  ]);
  return { novos: novos || 0, recorrentes: recorrentes || 0 };
}
