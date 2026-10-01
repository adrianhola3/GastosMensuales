/**
 * SUPABASE-STORE.JS - Capa de persistencia en la nube
 * ---------------------------------------------------------------------------
 * Habla con Supabase y expone UNA sola interfaz: window.gastosRemoto.
 *
 * Tabla usada (una sola fila):
 *     gastos (id = 1, data jsonb)
 * Todo el estado de la app vive dentro de `data`.
 *
 * Acceso de administrador: hay dos caminos, correo + contraseña (signInWithPassword)
 * y GitHub por OAuth (signInWithOAuth con el proveedor 'github'). El de GitHub
 * sirve para cuentas creadas sin contraseña. Para que funcione, la URL de
 * redirección tiene que estar registrada en el panel de Supabase, en
 * Authentication → URL Configuration.
 *
 * SQL para crearla (se corre una sola vez, en el SQL Editor de Supabase):
 *
 *   create table if not exists public.gastos (
 *     id   int primary key,
 *     data jsonb not null default '{}'::jsonb
 *   );
 *
 *   alter table public.gastos enable row level security;
 *
 *   -- Solo usuarios autenticados pueden leer y escribir.
 *   create policy "gastos: leer autenticados"
 *     on public.gastos for select to authenticated using (true);
 *
 *   create policy "gastos: escribir autenticados"
 *     on public.gastos for insert to authenticated with check (true);
 *
 *   create policy "gastos: actualizar autenticados"
 *     on public.gastos for update to authenticated using (true) with check (true);
 *
 * IMPORTANTE: sin esas políticas, la anon key no puede leer ni escribir nada
 * aunque esté bien configurada, y la app se queda callada en localStorage.
 *
 * ---------------------------------------------------------------------------
 * REGLA DE ORO DE ESTE ARCHIVO: si Supabase no está configurado, NADA de lo
 * que hay abajo lanza excepciones ni rompe la app. Todos los métodos fallan
 * suave (devuelven null o un valor neutro) para que el resto de la aplicación
 * pueda seguir usando localStorage sin enterarse de nada.
 */

(function () {
  'use strict';

  const TABLA = 'gastos';
  const FILA_ID = 1;
  const PROVEEDOR_OAUTH = 'github';

  /**
   * Traducción de los errores técnicos de Supabase a mensajes en español.
   * Se muestra el mensaje real al usuario: un "error desconocido" hace perder
   * la confianza en la app y no ayuda a arreglar nada.
   */
  function traducirError(error) {
    if (!error) return 'No se pudo completar la operación. Inténtalo de nuevo.';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'Sin conexión a internet.';
    }

    const codigo = String(error.code || '');
    const mensaje = String(error.message || error.error_description || error || '');

    // Credenciales incorrectas: Supabase devuelve el mismo error a propósito
    // para no revelar si el correo existe o no.
    if (codigo === 'invalid_credentials' || /invalid login credentials/i.test(mensaje)) {
      return 'Correo o contraseña incorrectos.';
    }

    // El usuario se registró pero nunca confirmó el correo.
    if (codigo === 'email_not_confirmed' || /email not confirmed/i.test(mensaje)) {
      return 'El correo todavía no fue confirmado. Revisa tu bandeja de entrada.';
    }

    // drowned: se mandó mail de recuperación sin que exista ese usuario.
    if (codigo === 'user_not_found' || /unable to validate email/i.test(mensaje)) {
      return 'Correo o contraseña incorrectos.';
    }

    // Problemas de red o CORS: el SDK no pudo ni hablar con el servidor.
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)) {
      return 'Sin conexión a internet. Revisá tu conexión e intentá otra vez.';
    }

    // CORS bloqueado por el navegador.
    if (/cors|blocked by|failed to execute 'fetch'/i.test(mensaje)) {
      return 'No se pudo conectar con el servidor. Revisá la configuración del proyecto.';
    }

    //429 = demasiados intentos seguidos.
    if (codigo === '429' || /too many requests|rate limit/i.test(mensaje)) {
      return 'Demasiados intentos seguidos. Esperá un momento e intentá otra vez.';
    }

    if (mensaje) return mensaje;
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }

  // --- Estado interno -------------------------------------------------------

  let cliente = null;          // instancia de supabase-js
  let clienteIntentado = false;
  const oyentesSesion = new Set();

  // Escrituras encadenadas. Sin esto, dos guardados seguidos pueden llegar al
  // servidor en cualquier orden y quedar guardado el más viejo al final.
  let colaEscritura = Promise.resolve();

  // Resuelve apenas Supabase nos informa si hay sesión o si pasó el tiempo máximo.
  let resolverSesionInicial = null;
  const SESION_INICIAL_TIMEOUT_MS = 4000;

  function credenciales() {
    const cfg = window.GASTOS_CONFIG || {};
    return {
      url: String(cfg.supabaseUrl || '').trim(),
      key: String(cfg.supabaseAnonKey || '').trim()
    };
  }

  /** ¿Están los dos datos de conexión completos? */
  function estaConfigurado() {
    const { url, key } = credenciales();
    return url.length > 0 && key.length > 0;
  }

  /** ¿Está además el SDK cargado en la página? Sin él no se puede crear el cliente. */
  function sdkDisponible() {
    return typeof window.supabase !== 'undefined' &&
      typeof window.supabase.createClient === 'function';
  }

  /**
   * URL de la página sin query ni fragmento, para usarla como destino de retorno.
   *
   * Importante: la app usa '#' para navegar, así que window.location.href puede
   * terminar en '#' o traer parámetros de la redirección anterior. Si se pasa tal
   * cual a Supabase, al volver se arma una URL con doble '#' ('##access_token=...')
   * y el SDK no reconoce el token: la sesión nunca se abre y el usuario queda
   * como visitante sin ninguna pista de por qué.
   */
  function urlDeRetornoLimpia() {
    return window.location.origin + window.location.pathname;
  }

  function notificarSesion() {
    oyentesSesion.forEach(cb => {
      try { cb(haySesion()); } catch (e) { console.error('Error en listener de sesión:', e); }
    });
  }

  /**
   * Devuelve el cliente de Supabase, o null si todavía no se puede.
   * Nunca lanza: un fallo al crear el cliente solo significa "seguimos local".
   */
  function obtenerCliente() {
    if (cliente) return cliente;
    if (clienteIntentado) return null;
    clienteIntentado = true;

    if (!estaConfigurado() || !sdkDisponible()) return null;

    try {
      const { url, key } = credenciales();

      // detectSessionInUrl: Supabase lee el token que vuelve en el fragmento de
      // la URL, lo intercambia por una sesión y lo limpia de la barra de
      // direcciones. Sin esto, un login exitoso deja al usuario fuera.
      // flowType 'pkce' evita además que el token de acceso viaje en la URL.
      cliente = window.supabase.createClient(url, key, {
        auth: {
          detectSessionInUrl: true,
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true
        }
      });

      // Supabase emite INITIAL_SESSION al recuperar la sesión guardada, y
      // PASSWORD_RECOVERY / SIGNED_IN al volver del proveedor OAuth.
      cliente.auth.onAuthStateChange((evento, sesion) => {
        if (resolverSesionInicial) {
          resolverSesionInicial(sesion);
          resolverSesionInicial = null;
        }
        notificarSesion();
      });

      return cliente;
    } catch (e) {
      console.error('[supabase-store] No se pudo crear el cliente:', e);
      cliente = null;
      return null;
    }
  }

  // --- Interfaz pública -----------------------------------------------------

  /**
   * Carga el estado desde la nube.
   * @returns {Promise<object|null>} el estado, o null si no hay fila / no hay red.
   */
  function cargar() {
    const cli = obtenerCliente();
    if (!cli) return Promise.resolve(null);

    return cli
      .from(TABLA)
      .select('data')
      .eq('id', FILA_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        return data && data.data ? data.data : null;
      })
      .catch(e => {
        // Sin conexión o sin permisos: se avisa y se sigue con la copia local.
        console.warn('[supabase-store] No se pudo leer de la nube:', e && e.message ? e.message : e);
        return null;
      });
  }

  /**
   * Guarda el estado completo en la nube (upsert sobre la fila id = 1).
   * Las escrituras se encadenan para que respeten el orden de llegada.
   * @returns {Promise<void>} nunca rechaza: un fallo de red no debe romper la app.
   */
  function guardar(estado) {
    const cli = obtenerCliente();
    if (!cli || !estado) return Promise.resolve();

    colaEscritura = colaEscritura
      .then(() => cli
        .from(TABLA)
        .upsert({ id: FILA_ID, data: estado }, { onConflict: 'id' })
        .then(({ error }) => { if (error) throw error; }))
      .catch(e => {
        console.warn('[supabase-store] No se pudo guardar en la nube:', e && e.message ? e.message : e);
      });

    return colaEscritura;
  }

  /**
   * Inicia sesión con correo y contraseña.
   * @returns {Promise<{ok: boolean, error: string|null}>}
   */
  function iniciarSesion(email, password) {
    const cli = obtenerCliente();
    if (!cli) {
      return Promise.resolve({
        ok: false,
        error: 'La nube no está configurada. Completá los datos en js/config.js.'
      });
    }
    if (!email || !password) {
      return Promise.resolve({ ok: false, error: 'Escribí tu correo y tu contraseña.' });
    }

    return cli.auth
      .signInWithPassword({ email: String(email).trim(), password: String(password) })
      .then(({ data, error }) => {
        if (error) return { ok: false, error: traducirError(error) };
        if (!data || !data.session) return { ok: false, error: 'No se pudo iniciar sesión.' };
        notificarSesion();
        return { ok: true, error: null };
      })
      .catch(e => ({ ok: false, error: traducirError(e) }));
  }

  /**
   * Inicia sesión con GitHub por OAuth. Supabase no devuelve sesión aquí: lo que
   * devuelve es la URL del diálogo de GitHub, y a eso navega el navegador. Por eso
   * el camino feliz casi nunca llega a resolverse; el retorno de {ok:true} existe
   * solo para mantener la forma del resultado.
   * @returns {Promise<{ok: boolean, error: string|null}>}
   */
  function iniciarSesionConGithub() {
    const cli = obtenerCliente();
    if (!cli) {
      return Promise.resolve({
        ok: false,
        error: 'La nube no está configurada. Completá los datos en js/config.js.'
      });
    }

    return cli.auth
      .signInWithOAuth({
        provider: PROVEEDOR_OAUTH,
        options: { redirectTo: urlDeRetornoLimpia() }
      })
      .then(({ data, error }) => {
        if (error) return { ok: false, error: traducirError(error) };
        if (!data || !data.url) return { ok: false, error: 'No se pudo iniciar el acceso con GitHub.' };
        window.location.href = data.url;
        return { ok: true, error: null };
      })
      .catch(e => ({ ok: false, error: traducirError(e) }));
  }

  /** Cierra la sesión. Nunca rechaza. */
  function salirDeSesion() {
    const cli = obtenerCliente();
    if (!cli) return Promise.resolve();

    return Promise.resolve()
      .then(() => cli.auth.signOut())
      .catch(e => {
        console.warn('[supabase-store] No se pudo cerrar la sesión:', e && e.message ? e.message : e);
      })
      .then(() => { notificarSesion(); });
  }

  /**
   * ¿Hay sesión activa? Es sincrónico a propósito: el cliente de supabase-js
   * guarda la sesión en memoria, así que responde al instante.
   * OJO: recién al cargar la página puede todavía dar false aunque el usuario
   * tenga la sesión guardada. Para eso está esperarSesion().
   */
  function haySesion() {
    const cli = obtenerCliente();
    if (!cli) return false;
    try {
      const actual = cli.auth.getSession();
      return !!(actual && actual.data && actual.data.session);
    } catch (e) {
      return false;
    }
  }

  /**
   * Espera a que Supabase termine de recuperar la sesión guardada.
   * @returns {Promise<boolean>} true si al final hay sesión.
   * Si no hay red, resuelve al pasar el tiempo en lugar de quedarse colgado.
   */
  function esperarSesion() {
    const cli = obtenerCliente();
    if (!cli) return Promise.resolve(false);
    if (haySesion()) return Promise.resolve(true);

    return new Promise(resolve => {
      let resuelto = false;
      const terminar = valor => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(temporizador);
        resolverSesionInicial = null;
        resolve(valor);
      };

      const temporizador = setTimeout(() => terminar(haySesion()), SESION_INICIAL_TIMEOUT_MS);
      resolverSesionInicial = (sesion) => terminar(!!sesion);

      // getSession() resuelve de forma asíncrona y es más fiable que la caché
      // en memoria: al volver del proveedor OAuth el token todavía se está
      // intercambiando por una sesión, y este await espera a que termine.
      Promise.resolve(cli.auth.getSession())
        .then(({ data }) => terminar(!!(data && data.session)))
        .catch(() => terminar(haySesion()));
    });
  }

  /** Suscribe un callback que se dispara en cada cambio de sesión. */
  function alCambiarSesion(cb) {
    if (typeof cb !== 'function') return;
    oyentesSesion.add(cb);
    obtenerCliente(); // asegura que el cliente exista para que se emitan eventos
  }

  window.gastosRemoto = {
    estaConfigurado,
    cargar,
    guardar,
    iniciarSesion,
    iniciarSesionConGithub,
    salirDeSesion,
    haySesion,
    alCambiarSesion,
    esperarSesion,
    // Expuesto solo para diagnóstico en la consola del navegador.
    _traducirError: traducirError
  };
})();
