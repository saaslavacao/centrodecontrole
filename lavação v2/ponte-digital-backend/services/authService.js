// services/authService.js
// Login + resolução de "quem é o usuário logado e de qual empresa ele é".
// Isso alimenta o EMPRESA config do front-end e toda chamada de RLS depois.

import { supabase } from './supabaseClient.js';

export async function login(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSessaoAtual() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Busca o registro em `usuarios` do usuário logado, junto com a empresa
 * e as configurações — tudo que o front-end precisa pra montar o EMPRESA config.
 */
export async function carregarContextoDoUsuario() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: usuario, error: errUsuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome, email, papel, ativo')
    .eq('auth_user_id', user.id)
    .single();
  if (errUsuario) throw errUsuario;

  const { data: empresa, error: errEmpresa } = await supabase
    .from('empresas')
    .select('id, slug, nome, nome_sidebar')
    .eq('id', usuario.empresa_id)
    .single();
  if (errEmpresa) throw errEmpresa;

  const { data: config, error: errConfig } = await supabase
    .from('configuracoes_empresa')
    .select('*')
    .eq('empresa_id', usuario.empresa_id)
    .single();
  if (errConfig) throw errConfig;

  // atualiza último login, sem bloquear o carregamento se falhar
  supabase.from('usuarios').update({ ultimo_login: new Date().toISOString() }).eq('id', usuario.id).then(() => {});

  return { usuario, empresa, config };
}
