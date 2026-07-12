// netlify/functions/rodar-motor-oportunidades.js
// Function AGENDADA — roda sozinha, sem ninguém clicar em nada.
// Configuração do agendamento fica no netlify.toml (ver na raiz do projeto).

import { createClient } from '@supabase/supabase-js';
import { rodarParaTodasAsEmpresas } from '../../services/motorOportunidades.js';

export const handler = async () => {
  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    await rodarParaTodasAsEmpresas(supabaseAdmin);
    return { statusCode: 200, body: 'Motor de Oportunidades executado com sucesso.' };
  } catch (erro) {
    console.error('Erro ao rodar o Motor de Oportunidades:', erro);
    return { statusCode: 500, body: 'Erro ao rodar o Motor de Oportunidades.' };
  }
};
