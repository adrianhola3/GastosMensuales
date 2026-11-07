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
 * ESTADO ACTUAL (verificado): NUBE OPERATIVA
 * ---------------------------------------------------------------------------
 * Proyecto `bgcgmofroibrxthvdlil` (region us-east-1, org "Gastos Mensuales").
 * Habia quedado INACTIVE por inactividad, no borrado: se restauro con
 * POST /v1/projects/{ref}/restore y hoy responde ACTIVE_HEALTHY.
 *
 * Lo que corre sobre esa base, aplicado por `tools/provision-supabase.mjs`:
 *   - `sql/00-esquema.sql`   -> tabla public.gastos (id, data jsonb, updated_at)
 *   - `sql/01-seguridad.sql` -> RLS: lectura publica, escritura solo admin
 *   - usuario administrador con `app_metadata.role = "admin"`
 *   - registro publico por correo DESACTIVADO
 *
 * Verificado de punta a punta: lectura anonima 200, escritura anonima 401,
 * login del admin 200, rol presente en el JWT, escritura del admin 201.
 *
 * Si en algun momento hay que rehacerlo, NO se hace a mano: se corre
 *   node tools/provision-supabase.mjs status|adopt|wait|apply|verify
 * que es idempotente y comprueba el efecto en vez de suponerlo.
 *
 * Si el proyecto vuelve a pausarse (el plan Free lo hace por inactividad), el
 * sintoma es el mismo NXDOMAIN de antes: el host no resuelve aunque el proyecto
 * exista. Restaurar, no recrear.
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
  modoLocal: false,
  supabaseUrl: 'https://bgcgmofroibrxthvdlil.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnY2dtb2Zyb2licnh0aHZkbGlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzAxNjIsImV4cCI6MjEwNjQwNjE2Mn0.utBPVyah8BSXV9Nntioh6W8tpUmSii7JiOMNY5z7aG8'
};
