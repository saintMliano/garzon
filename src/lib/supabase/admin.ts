import { createClient } from "@supabase/supabase-js";

// ============================================================
// CLIENTE ADMIN — SOLO SERVIDOR.
// Usa la SERVICE-ROLE key (bypassa RLS y permite operaciones de auth admin).
// NUNCA importar este archivo desde un client component ni exponer la llave
// al navegador. Solo debe usarse en route handlers / server actions.
// ============================================================

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY para el cliente admin"
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
