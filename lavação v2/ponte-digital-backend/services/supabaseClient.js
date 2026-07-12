// services/supabaseClient.js
// Cliente único do Supabase, usado por todos os services do lado do navegador.
// SUPABASE_URL e SUPABASE_ANON_KEY vêm de configuração pública — são seguros
// de expor no front-end, porque quem protege o dado é a RLS no banco, não essa chave.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = window.PONTE_DIGITAL_CONFIG?.supabaseUrl || '';
export const SUPABASE_ANON_KEY = window.PONTE_DIGITAL_CONFIG?.supabaseAnonKey || '';

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function isConfigurado() {
  return !!supabase;
}
