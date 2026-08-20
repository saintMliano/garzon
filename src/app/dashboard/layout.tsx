"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { capacidadDeRuta, puede } from "@/lib/roles";
import { useRolLocal } from "@/lib/usar-rol";

/**
 * Guarda de rutas del panel.
 *
 * Es la segunda línea, no la primera: si alguien escribe /dashboard/reportes a
 * mano, la base igual le va a negar los datos (guarda de rol dentro de las RPC
 * `reporte_*`). Esto está para que no vea una pantalla rota y crea que el
 * sistema falla, sino que entienda que esa sección no es suya.
 *
 * No bloquea el render mientras resuelve: hacerlo agregaría un parpadeo a todas
 * las páginas del panel a cambio de nada, porque lo que protege los datos está
 * del lado del servidor.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { cargando, rol, sinLocal } = useRolLocal();

  useEffect(() => {
    if (cargando || sinLocal || !rol) return;

    const capacidad = capacidadDeRuta(pathname);
    if (capacidad && !puede(rol, capacidad)) {
      router.replace("/dashboard");
    }
  }, [cargando, rol, sinLocal, pathname, router]);

  return <>{children}</>;
}
