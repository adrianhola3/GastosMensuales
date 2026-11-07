-- =====================================================================
-- 00-esquema.sql
-- Estructura minima que la app espera. Se corre ANTES de 01-seguridad.sql.
--
-- La app no usa tablas relacionales: guarda TODO el documento de gastos en una
-- sola fila (id = 1) con la forma { id, data: {...} }. Ver js/supabase-store.js,
-- donde TABLA = 'gastos' y FILA_ID = 1.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
-- =====================================================================

begin;

create table if not exists public.gastos (
  id         bigint primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- `create table if not exists` NO toca una tabla que ya existe: si la tabla
-- venia de antes sin `updated_at`, la columna nunca se agregaba y el trigger de
-- abajo fallaba en cada UPDATE con
--   record "new" has no field "updated_at"
-- Eso dejaba la app sin poder guardar NADA, y el error quedaba tapado como un
-- console.warn. Por eso la columna se asegura aparte, de forma explicita.
alter table public.gastos
  add column if not exists updated_at timestamptz not null default now();

-- RLS encendido. Las politicas concretas viven en 01-seguridad.sql: aca solo se
-- activa el interruptor. Una tabla con RLS y sin politicas es inaccesible, y eso
-- es preferible a una tabla abierta por olvido.
alter table public.gastos enable row level security;

-- `updated_at` se mantiene solo. Hoy la app no lo lee; esta para que la
-- deteccion de conflictos entre pestanas tenga una columna real sobre la que
-- comparar cuando se implemente, sin volver a migrar la tabla.
create or replace function public.gastos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gastos_touch_updated_at on public.gastos;
create trigger gastos_touch_updated_at
  before update on public.gastos
  for each row
  execute function public.gastos_touch_updated_at();

commit;
