"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esRolValido, type Rol } from "@/lib/roles";

/**
 * Resuelve quién sos y qué rol tenés **en el local que está seleccionado**.
 *
 * El rol es por local, no por persona: la PK de `local_staff` es
 * (user_id, local_id), así que alguien puede ser dueño en un local y personal
 * en otro. Todo lo que dependa del rol tiene que mirar el local activo.
 *
 * ⚠️ Esto decide qué se dibuja, no a qué se puede acceder. Quien niega de
 * verdad es la base (RLS + guardas en las RPC). Ver src/lib/roles.ts.
 */

export const CLAVE_LOCAL_SELECCIONADO = "garzon_selected_local_id";

/** Las páginas que cambian de local avisan con esto para que la nav se entere. */
export const EVENTO_LOCAL_CAMBIADO = "garzon:local-cambiado";

export type LocalDelStaff = {
  id: string;
  nombre: string;
  slug: string;
  rol: Rol;
};

export type EstadoRol = {
  cargando: boolean;
  userId: string | null;
  /** El local activo. `null` si la persona no tiene ninguno. */
  localId: string | null;
  localNombre: string | null;
  rol: Rol | null;
  esPlatformAdmin: boolean;
  locales: LocalDelStaff[];
  /** Sin ninguna fila en `local_staff`: no es de ningún local. */
  sinLocal: boolean;
};

const INICIAL: EstadoRol = {
  cargando: true,
  userId: null,
  localId: null,
  localNombre: null,
  rol: null,
  esPlatformAdmin: false,
  locales: [],
  sinLocal: false,
};

export function avisarCambioDeLocal(localId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLAVE_LOCAL_SELECCIONADO, localId);
  window.dispatchEvent(new CustomEvent(EVENTO_LOCAL_CAMBIADO, { detail: localId }));
}

export function useRolLocal(): EstadoRol {
  const [estado, setEstado] = useState<EstadoRol>(INICIAL);

  useEffect(() => {
    // Mismo patrón que `aviso-suscripcion`: el trabajo asíncrono va en una IIFE
    // con bandera de vigencia, para no dejar un setState colgando cuando el
    // componente ya se desmontó.
    let vigente = true;

    async function resolver() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!vigente) return;

      if (!user) {
        setEstado({ ...INICIAL, cargando: false });
        return;
      }

      const [{ data: adminRow }, { data: staffRows }] = await Promise.all([
        supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("local_staff")
          .select("local_id, rol, locales(id, nombre, slug)")
          .eq("user_id", user.id),
      ]);
      if (!vigente) return;

      const locales: LocalDelStaff[] = (staffRows ?? [])
        .map((fila) => {
          const local = fila.locales as { id: string; nombre: string; slug: string } | null;
          if (!local?.id) return null;
          // Un rol que no reconocemos se trata como el más restrictivo. Fallar
          // hacia "personal" y no hacia "dueño" es la única opción sensata acá.
          const rol: Rol = esRolValido(fila.rol) ? fila.rol : "personal";
          return { id: local.id, nombre: local.nombre, slug: local.slug, rol };
        })
        .filter((l): l is LocalDelStaff => l !== null)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      if (locales.length === 0) {
        setEstado({
          ...INICIAL,
          cargando: false,
          userId: user.id,
          esPlatformAdmin: !!adminRow,
          sinLocal: true,
        });
        return;
      }

      const guardado = window.localStorage.getItem(CLAVE_LOCAL_SELECCIONADO);
      const elegido = locales.find((l) => l.id === guardado) ?? locales[0];

      setEstado({
        cargando: false,
        userId: user.id,
        localId: elegido.id,
        localNombre: elegido.nombre,
        rol: elegido.rol,
        esPlatformAdmin: !!adminRow,
        locales,
        sinLocal: false,
      });
    }

    void resolver();

    // `storage` cubre otra pestaña; el evento propio cubre esta misma.
    const alCambiar = () => {
      void resolver();
    };
    window.addEventListener(EVENTO_LOCAL_CAMBIADO, alCambiar);
    window.addEventListener("storage", alCambiar);
    return () => {
      vigente = false;
      window.removeEventListener(EVENTO_LOCAL_CAMBIADO, alCambiar);
      window.removeEventListener("storage", alCambiar);
    };
  }, []);

  return estado;
}
