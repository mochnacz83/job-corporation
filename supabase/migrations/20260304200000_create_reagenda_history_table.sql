-- Cria a tabela de histórico de reagendamentos para manter dados salvos de forma persistente
create table if not exists public.reagenda_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  sa text,
  setor text,
  nome text,
  contato text,
  operadora text,
  tipo_atividade text,
  data_agendamento text,
  data_original_formatada text,
  data_nova text,
  status text default 'Pendente',
  decisao text default 'Pendente',
  periodo text,
  horario text,
  selecionado boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativa políticas de segurança a nível de linha (Row Level Security)
alter table public.reagenda_history enable row level security;

-- Permite que usuários leiam/vejam o histórico que eles mesmos inseriram
create policy "Users can view their own reagenda history"
  on public.reagenda_history for select
  using ( auth.uid() = user_id );

-- Permite que usuários insiram novos contatos no próprio histórico
create policy "Users can insert their own reagenda history"
  on public.reagenda_history for insert
  with check ( auth.uid() = user_id );

-- Permite que usuários atualizem os dados do próprio histórico
create policy "Users can update their own reagenda history"
  on public.reagenda_history for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- Permite que usuários excluam seus próprios contatos do histórico
create policy "Users can delete their own reagenda history"
  on public.reagenda_history for delete
  using ( auth.uid() = user_id );

-- Adiciona a tabela ao cache em tempo real para sincronização com ui (opcional)
alter publication supabase_realtime add table public.reagenda_history;
