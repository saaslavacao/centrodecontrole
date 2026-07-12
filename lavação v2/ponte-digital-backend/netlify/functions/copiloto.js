// netlify/functions/copiloto.js
// Endpoint: POST /.netlify/functions/copiloto  { pergunta: string }
// Cabeçalho: Authorization: Bearer <access_token do Supabase Auth>
//
// Esta function é a ÚNICA parte do sistema que toca a chave da Groq e a
// service role key do Supabase. As duas ficam em variáveis de ambiente do
// Netlify — nunca no front-end, nunca em código versionado.

import { createClient } from '@supabase/supabase-js';
import { montarContexto, buscarMemoriaCurta, obterModoDoUsuario } from '../../services/aiContextBuilder.js';

const PROMPT_MESTRE = `Você é o Copiloto Inteligente da Ponte Digital, um assistente de gestão para lavações automotivas.

Sua função é analisar dados operacionais reais e gerar decisões simples e úteis.

REGRAS:
- Não invente dados.
- Não estime valores.
- Use apenas o contexto fornecido.
- Seja direto e objetivo.
- Não explique conceitos genéricos.
- Sempre sugira ações práticas.
- Responda em português.

FORMATO DE RESPOSTA:

📊 SITUAÇÃO ATUAL
...

⚠️ ALERTAS
...

💡 O QUE FAZER AGORA
...`;

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método não permitido' };
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. valida quem está perguntando
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { statusCode: 401, body: 'Token ausente' };

  const { data: { user }, error: errAuth } = await supabaseAdmin.auth.getUser(token);
  if (errAuth || !user) return { statusCode: 401, body: 'Token inválido' };

  const { data: usuario, error: errUsuario } = await supabaseAdmin
    .from('usuarios').select('id, empresa_id, papel').eq('auth_user_id', user.id).single();
  if (errUsuario || !usuario) return { statusCode: 403, body: 'Usuário não vinculado a nenhuma empresa' };

  const { pergunta } = JSON.parse(event.body || '{}');
  if (!pergunta) return { statusCode: 400, body: 'Campo "pergunta" é obrigatório' };

  // 2. monta só o contexto necessário (nunca a base inteira)
  const [contexto, memoria, modo] = await Promise.all([
    montarContexto(pergunta, usuario.empresa_id, supabaseAdmin),
    buscarMemoriaCurta(usuario.empresa_id, usuario.id, supabaseAdmin),
    obterModoDoUsuario(usuario.id, supabaseAdmin),
  ]);

  const mensagens = [
    { role: 'system', content: `${PROMPT_MESTRE}\n\nPriorize, na sua leitura, o que for relevante para o modo ${modo}.` },
    ...memoria.flatMap(m => ([
      { role: 'user', content: m.pergunta },
      { role: 'assistant', content: m.resposta },
    ])),
    { role: 'user', content: `${pergunta}\n\nCONTEXTO:\n${JSON.stringify(contexto)}` },
  ];

  // 3. chama a Groq
  const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: mensagens,
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!resposta.ok) {
    const erro = await resposta.text();
    return { statusCode: 502, body: `Erro na Groq: ${erro}` };
  }

  const dados = await resposta.json();
  const textoResposta = dados.choices?.[0]?.message?.content || 'Não consegui gerar uma resposta agora.';

  // 4. grava a memória curta pra próxima pergunta
  await supabaseAdmin.from('conversas_ia').insert({
    empresa_id: usuario.empresa_id, usuario_id: usuario.id,
    pergunta, resposta: textoResposta, contexto_json: contexto,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resposta: textoResposta }),
  };
};
