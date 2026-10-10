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
 */

window.GASTOS_CONFIG = {
  supabaseUrl: 'https://bgcgmofroibrxthvdlil.supabase.co',
  supabaseAnonKey: 'sb_publishable_1PIXKBVWdxOx5RnDLkEskQ_nS5TiqU7'
};
