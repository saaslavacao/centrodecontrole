-- ============================================================================
-- CENTRO DE CONTROLE PONTE DIGITAL — SCHEMA COMPLETO
-- Rodar direto no SQL Editor do Supabase, de cima pra baixo, uma vez só.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EMPRESAS (raiz) + CONFIGURAÇÕES (desacopladas)
-- ----------------------------------------------------------------------------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  nome_sidebar text not null,
  plano text default 'centro-de-controle',
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table configuracoes_empresa (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  logo_url text,
  cor_primaria text default '#2F6FEB',
  cor_secundaria text default '#F2B705',
  telefone text,
  whatsapp text,
  instagram text,
  endereco text,
  horario_funcionamento text,
  mensagem_boas_vindas text,
  meta_diaria numeric default 0,
  meta_mensal numeric default 0,
  tempo_medio_atendimento_min integer,
  atualizado_em timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 2. USUÁRIOS
-- ----------------------------------------------------------------------------
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  auth_user_id uuid references auth.users(id) not null unique,
  nome text,
  email text,
  telefone text,
  foto_url text,
  papel text default 'dono',      -- admin_ponte_digital | dono | operador
  ativo boolean default true,
  ultimo_login timestamptz,
  criado_por uuid references usuarios(id),
  criado_em timestamptz default now()
);
create index idx_usuarios_auth on usuarios(auth_user_id);
create index idx_usuarios_empresa on usuarios(empresa_id);

-- ----------------------------------------------------------------------------
-- 3. SERVIÇOS (catálogo fixo, nunca texto livre)
-- ----------------------------------------------------------------------------
create table servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  nome text not null,
  valor numeric not null,
  tempo_estimado_min integer,
  ativo boolean default true,
  deletado_em timestamptz
);
create index idx_servicos_empresa on servicos(empresa_id) where deletado_em is null;

-- ----------------------------------------------------------------------------
-- 4. CLIENTES
-- ----------------------------------------------------------------------------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  nome text not null,
  telefone text,
  whatsapp text,
  veiculo text,
  placa text,
  observacoes text,
  ultima_visita date,
  total_gasto numeric default 0,
  qtd_visitas integer default 0,
  status text default 'novo',     -- novo | recorrente | vip | em_risco | inativo
  ativo boolean default true,
  deletado_em timestamptz,
  criado_em timestamptz default now()
);
create index idx_clientes_empresa on clientes(empresa_id) where deletado_em is null;
create index idx_clientes_placa on clientes(placa);
create index idx_clientes_whatsapp on clientes(whatsapp);
create index idx_clientes_status on clientes(empresa_id, status);

-- ----------------------------------------------------------------------------
-- 5. ATENDIMENTOS
-- ----------------------------------------------------------------------------
create table atendimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  cliente_id uuid references clientes(id) not null,
  servico_id uuid references servicos(id) not null,
  status text default 'aguardando',  -- aguardando | lavando | finalizado | entregue
  valor numeric,
  observacoes text,
  deletado_em timestamptz,
  criado_em timestamptz default now(),
  finalizado_em timestamptz
);
create index idx_atend_empresa_status on atendimentos(empresa_id, status) where deletado_em is null;
create index idx_atend_cliente on atendimentos(cliente_id);
create index idx_atend_data on atendimentos(criado_em);

-- ----------------------------------------------------------------------------
-- 6. FINANCEIRO
-- ----------------------------------------------------------------------------
create table categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  nome text not null,
  tipo text not null check (tipo in ('entrada','saida'))
);

create table financeiro (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  categoria_id uuid references categorias_financeiras(id) not null,
  atendimento_id uuid references atendimentos(id),
  valor numeric not null,
  observacoes text,
  data date default current_date,
  deletado_em timestamptz
);
create index idx_fin_empresa_data on financeiro(empresa_id, data) where deletado_em is null;

-- ----------------------------------------------------------------------------
-- 7. CAMPANHAS
-- ----------------------------------------------------------------------------
create table campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  tipo text,                      -- ausentes | aniversario | pos_chuva | fim_de_semana | vip | personalizada
  titulo text,
  texto text,
  criado_em timestamptz default now()
);

create table campanhas_enviadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  campanha_id uuid references campanhas(id) not null,
  cliente_id uuid references clientes(id) not null,
  status text default 'enviado',  -- enviado | erro
  erro text,
  enviado_em timestamptz default now(),
  lido_em timestamptz
);
create index idx_camp_enviadas_empresa on campanhas_enviadas(empresa_id, campanha_id);

-- ----------------------------------------------------------------------------
-- 8. INSIGHTS (saída do Motor de Oportunidades) + CONVERSAS (memória da IA)
-- ----------------------------------------------------------------------------
create table insights (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  tipo text not null,
  categoria text not null,        -- comercial | financeira | atendimento | operacional | produtos | gestao
  prioridade text default 'media', -- alta | media | baixa
  titulo text not null,
  descricao text,
  impacto text,
  acao_sugerida text,
  origem text default 'motor_oportunidades', -- motor_oportunidades | copiloto
  status text default 'novo',     -- novo | visualizado | resolvido | arquivado
  criado_em timestamptz default now(),
  visualizado_em timestamptz,
  resolvido_em timestamptz
);
create index idx_insights_empresa_status on insights(empresa_id, status);
create index idx_insights_prioridade on insights(empresa_id, prioridade);

create table conversas_ia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  usuario_id uuid references usuarios(id) not null,
  pergunta text not null,
  resposta text not null,
  contexto_json jsonb,
  criado_em timestamptz default now()
);
create index idx_conversas_empresa_usuario on conversas_ia(empresa_id, usuario_id, criado_em desc);

-- ----------------------------------------------------------------------------
-- 9. LOGS (auditoria)
-- ----------------------------------------------------------------------------
create table logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) not null,
  usuario_id uuid references usuarios(id),
  acao text not null,             -- criou | alterou | excluiu
  tabela text not null,
  registro_id uuid,
  detalhes jsonb,
  criado_em timestamptz default now()
);
create index idx_logs_empresa_data on logs(empresa_id, criado_em);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Função auxiliar: empresa_id do usuário logado
create or replace function empresa_do_usuario_logado()
returns uuid
language sql
security definer
stable
as $$
  select empresa_id from usuarios where auth_user_id = auth.uid() limit 1;
$$;

-- Função auxiliar: é admin da Ponte Digital?
create or replace function is_admin_ponte_digital()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from usuarios where auth_user_id = auth.uid() and papel = 'admin_ponte_digital'
  );
$$;

alter table empresas enable row level security;
alter table configuracoes_empresa enable row level security;
alter table usuarios enable row level security;
alter table servicos enable row level security;
alter table clientes enable row level security;
alter table atendimentos enable row level security;
alter table categorias_financeiras enable row level security;
alter table financeiro enable row level security;
alter table campanhas enable row level security;
alter table campanhas_enviadas enable row level security;
alter table insights enable row level security;
alter table conversas_ia enable row level security;
alter table logs enable row level security;

-- empresas: só a própria + admin vê todas
create policy "empresa - ver a propria" on empresas for select
  using (id = empresa_do_usuario_logado() or is_admin_ponte_digital());

-- configuracoes_empresa
create policy "config - isolada por empresa" on configuracoes_empresa for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());

-- usuarios: enxerga usuários da própria empresa
create policy "usuarios - isolado por empresa" on usuarios for select
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "usuarios - atualizar o proprio" on usuarios for update
  using (auth_user_id = auth.uid());

-- tabelas de negócio: mesmo padrão em todas
create policy "servicos - isolado" on servicos for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "clientes - isolado" on clientes for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "atendimentos - isolado" on atendimentos for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "categorias_financeiras - isolado" on categorias_financeiras for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "financeiro - isolado" on financeiro for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "campanhas - isolado" on campanhas for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "campanhas_enviadas - isolado" on campanhas_enviadas for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "insights - isolado" on insights for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "conversas_ia - isolado" on conversas_ia for all
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());
create policy "logs - isolado" on logs for select
  using (empresa_id = empresa_do_usuario_logado() or is_admin_ponte_digital());

-- ============================================================================
-- STORAGE — bucket para logo das empresas (upload pela tela de Configurações)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- leitura pública (a logo aparece na sidebar sem exigir login de terceiros)
create policy "logos - leitura publica"
on storage.objects for select
using (bucket_id = 'logos');

-- upload só do próprio usuário, e só dentro da pasta da própria empresa
-- (o caminho do arquivo é sempre "{empresa_id}/logo.ext" — ver index.html)
create policy "logos - upload isolado por empresa"
on storage.objects for insert
with check (
  bucket_id = 'logos'
  and (storage.foldername(name))[1] = empresa_do_usuario_logado()::text
);

create policy "logos - update isolado por empresa"
on storage.objects for update
using (
  bucket_id = 'logos'
  and (storage.foldername(name))[1] = empresa_do_usuario_logado()::text
);

-- ============================================================================
-- SEED — ABF LAVACAR (dado inicial para o primeiro cliente)
-- Rodar só uma vez. Troque o e-mail pelo do Agnaldo depois de criar o usuário
-- em Authentication > Users no painel do Supabase.
-- ============================================================================
insert into empresas (slug, nome, nome_sidebar) values
  ('abf-lavacar', 'ABF Lavacar', 'ABF LAVACAR');

insert into configuracoes_empresa (empresa_id, cor_primaria, cor_secundaria, meta_diaria, meta_mensal, mensagem_boas_vindas)
select id, '#2F6FEB', '#F2B705', 1500, 45000, 'Sua empresa está saudável hoje.'
from empresas where slug = 'abf-lavacar';

insert into servicos (empresa_id, nome, valor, tempo_estimado_min)
select id, s.nome, s.valor, s.tempo from empresas, (values
  ('Lavagem simples', 40, 25),
  ('Lavagem completa', 70, 40),
  ('Higienização', 120, 60),
  ('Polimento', 150, 80)
) as s(nome, valor, tempo)
where empresas.slug = 'abf-lavacar';

insert into categorias_financeiras (empresa_id, nome, tipo)
select id, c.nome, c.tipo from empresas, (values
  ('Lavagens', 'entrada'),
  ('Serviços extras', 'entrada'),
  ('Produtos', 'saida'),
  ('Funcionários', 'saida'),
  ('Aluguel', 'saida')
) as c(nome, tipo)
where empresas.slug = 'abf-lavacar';

-- Depois de criar o usuário no Authentication do Supabase, rode (trocando o e-mail):
-- insert into usuarios (empresa_id, auth_user_id, nome, email, papel)
-- select e.id, u.id, 'Agnaldo', 'agnaldo@abflavacar.com.br', 'dono'
-- from empresas e, auth.users u
-- where e.slug = 'abf-lavacar' and u.email = 'agnaldo@abflavacar.com.br';
