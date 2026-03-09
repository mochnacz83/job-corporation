-- Cria a tabela reagenda_history para persistência do histórico de reagendamento
create table if not exists public.reagenda_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    sa text,
    setor text,
    nome text not null,
    contato text not null,
    operadora text,
    tipo_atividade text,
    data_agendamento text,
    data_original_formatada text,
    data_nova text,
    last_contacted_at timestamp with time zone,
    is_manual_status boolean default false,
    status text not null default 'Pendente',
    decisao text default 'Pendente',
    periodo text,
    horario text,
    selecionado boolean default false,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Ativa políticas de segurança a nível de linha (Row Level Security)
alter table public.reagenda_history enable row level security;

-- Remove políticas existentes para evitar conflitos
drop policy if exists "Users can view their own history" on public.reagenda_history;
drop policy if exists "Users can insert their own history" on public.reagenda_history;
drop policy if exists "Users can update their own history" on public.reagenda_history;
drop policy if exists "Users can delete their own history" on public.reagenda_history;
drop policy if exists "Users can view their own reagenda history" on public.reagenda_history;
drop policy if exists "Users can insert their own reagenda history" on public.reagenda_history;
drop policy if exists "Users can update their own reagenda history" on public.reagenda_history;
drop policy if exists "Users can delete their own reagenda history" on public.reagenda_history;

-- Os usuários só podem acessar seus próprios dados
create policy "Users can view their own history"
    on public.reagenda_history for select
    using (auth.uid() = user_id);

create policy "Users can insert their own history"
    on public.reagenda_history for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own history"
    on public.reagenda_history for update
    using (auth.uid() = user_id);

create policy "Users can delete their own history"
    on public.reagenda_history for delete
    using (auth.uid() = user_id);

-- Adiciona a tabela ao cache em tempo real para sincronização com ui (opcional)
alter publication supabase_realtime add table public.reagenda_history;
