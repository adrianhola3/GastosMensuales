-- =====================================================================
-- 01-seguridad.sql
-- Quién puede escribir en la tabla de gastos.
--
-- Va dentro de una transacción a propósito. Si algo falla a medio camino, se
-- deshace todo: es preferible quedarse con las políticas viejas (inseguras pero
-- funcionales) que con la tabla sin ninguna política, que la dejaría sin
-- lectura ni escritura para nadie.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. La función que responde "¿este usuario es administrador?"
--    Lee el rol del JWT. No toca ninguna tabla, así que no se puede
--    called recursivamente a sí misma por las políticas.
-- ---------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Se borran las políticas permisivas actuales.
--    Son las que dejan escribir a cualquiera: "usando (true)" sin mirar
--    quién es el que escribe.
-- ---------------------------------------------------------------------
drop policy if exists "gastos: leer autenticados"      on public.gastos;
drop policy if exists "gastos: escribir autenticados"  on public.gastos;
drop policy if exists "gastos: actualizar autenticados" on public.gastos;

-- Esta NO estaba en el esquema documentado y se encontró al verificar:.allow
-- SELECT a {anon, authenticated}. `anon` es el rol de quien NO tiene sesión,
-- o sea que cualquier persona con el enlace podia leer los gastos sin cuenta
-- ni contraseña. Se elimina acá porque la lectura de más abajo la cubre.
drop policy if exists "gastos: lectura publica" on public.gastos;

-- ---------------------------------------------------------------------
-- 3. Políticas nuevas.
--    Leer: todo el que esté autenticado. El padre tiene que ver lo mismo
--    que el hijo, para eso existe.
--    Escribir, actualizar y borrar: solo el administrador.
-- ---------------------------------------------------------------------
create policy "gastos: leer autenticados"
  on public.gastos for select to authenticated
  using (true);

create policy "gastos: escribir solo admin"
  on public.gastos for insert to authenticated
  with check (public.es_admin());

create policy "gastos: actualizar solo admin"
  on public.gastos for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy "gastos: borrar solo admin"
  on public.gastos for delete to authenticated
  using (public.es_admin());

commit;

-- ---------------------------------------------------------------------
-- COMO ASIGNAR LOS ROLES (esto NO es SQL, se hace en el panel)
--
--   Authentication -> Users -> New user
--     Crear al padre con su correo y una contraseña.
--     NO se le pone role: 'admin'. Sin rol, lee y no escribe. Ya está.
--
--   Authentication -> Users -> (tu usuario) -> Edit User -> app_metadata
--     Agregar:   { "role": "admin" }
--
--   IMPORTANTE: después de cambiar app_metadata hay que cerrar sesión y
--   volver a entrar. El rol viaja dentro del token, y el token viejo sigue
--   siendo válido hasta que vence.
--
--   Authentication -> Sign In / Providers
--     DESACTIVAR "Enable email signups".
--     Si queda activado, cualquiera que se invente un correo en tu proyecto
--     entra y lee los gastos. Con esto apagado, las dos cuentas que ustedes
--     crearon son las únicas que existen.
-- =====================================================================