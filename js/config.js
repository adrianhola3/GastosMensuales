/**
 * CONFIG.JS - Datos de conexión con la nube (Supabase)
 * ---------------------------------------------------------------------------
 * Este archivo es el ÚNICO lugar donde se configura el backend.
 *
 * Se completa con los datos del proyecto Supabase:
 *   - supabaseUrl    -> Project Settings > Data API > Project URL
 *                      (empieza con https:// y termina con .supabase.co)
 *   - supabaseAnonKey -> Project Settings > API Keys > Publishable / Anon key
 *
 * MIENTRAS LAS DOS CADENAS ESTÉN VACÍAS, LA APP FUNCIONA IGUAL QUE SIEMPRE:
 * todo se guarda en el navegador (localStorage) y no se intenta ninguna
 * conexión de red. No hay que cambiar nada más para que la app funcione hoy.
 *
 * Apenas se rellenan los dos valores, la app pasa a usar la nube como fuente
 * de verdad y guarda además una copia local como caché offline.
 *
 * Sobre seguridad: la "anon key" / "publishable key" está pensada para el
 * navegador y viaja en el bundle a propósito. Lo que protege los datos son las
 * políticas RLS de la tabla, NO esta clave. Nunca pongas acá la service_role.
 *
 * ---------------------------------------------------------------------------
 * ESTADO ACTUAL (verificado): SIN BACKEND
 * ---------------------------------------------------------------------------
 * El proyecto configurado antes de esta limpieza,
 * `bgcgmofroibrxthvdlil.supabase.co`, responde NXDOMAIN: no existe. No es un
 * fallo de red ni un proyecto pausado, es un proyecto borrado.
 *
 * Mientras estuvo así, `modoLocal: false` hacía que la app intentara hablar con
 * un host inexistente en cada guardado y cada 3 segundos, fallara, y lo tapara
 * con un `console.warn`. La interfaz decía "En línea" igual.
 *
 * Por eso hoy: `modoLocal: true` y las dos cadenas vacías. La app funciona
 * 100% en localStorage y el indicador dice "Solo local", que es la verdad.
 *
 * PARA VOLVER A LA NUBE:
 *   1. Crear el proyecto en Supabase y copiar Project URL + Publishable key.
 *   2. Correr `sql/01-seguridad.sql` contra la base nueva.
 *   3. Completar `supabaseUrl` y `supabaseAnonKey` acá abajo.
 *   4. Poner `modoLocal: false`.
 *   5. Crear el usuario administrador en el panel y asignarle
 *      `app_metadata = { "role": "admin" }`.
 * Sin el paso 2 y el 5, el modo administrador no puede escribir: RLS lo rechaza.
 * ---------------------------------------------------------------------------
 */

window.GASTOS_CONFIG = {
  /* MODO LOCAL: mientras esté en `true`, la app se comporta como si Supabase
     NO estuviera configurado. `estaConfigurado()` devuelve false, el store no
     intenta ninguna conexión de red y todo se guarda en el navegador
     (localStorage).
     *
     * Está en `true` porque hoy no hay proyecto al que conectarse. Ponerlo en
     * `false` sin completar las dos cadenas de abajo deja la app en el mismo
     * lugar, pero gastando una consulta DNS fallida por guardado.
     */
  modoLocal: true,

  supabaseUrl: '',
  supabaseAnonKey: ''
};
