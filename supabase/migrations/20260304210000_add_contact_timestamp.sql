-- Adiciona colunas para controle do temporizador automático
alter table public.reagenda_history
  add column if not exists last_contacted_at timestamp with time zone,
  add column if not exists is_manual_status boolean default false;
