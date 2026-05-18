/**
 * Tipos generados automáticamente desde la base de datos.
 *
 * Para regenerar:
 *   npx supabase gen types typescript --local > lib/supabase/types.ts
 *
 * (o con --project-id si la base de datos está en Supabase Cloud)
 *
 * NO editar a mano. El archivo se regenera tras cada migración.
 */

export type Database = {
  // Placeholder: ejecutar el comando de arriba después de aplicar las migraciones
  // para generar los tipos reales.
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
