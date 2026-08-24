"use client";

import Link from "next/link";
import { puede, type Capacidad, type Rol } from "@/lib/roles";

/**
 * La navegación del panel, una sola vez.
 *
 * Antes estaba copiada a mano en las seis páginas: agregar una sección
 * significaba tocar seis archivos y olvidarse de uno.
 *
 * Esconder un link NO es un permiso — quien de verdad niega es la base. Esto
 * existe para que a nadie se le ofrezca una puerta que se le va a cerrar en la
 * cara.
 */

export type SeccionPanel = "pedidos" | "comanda" | "menu" | "config" | "reportes" | "equipo" | "admin";

type Entrada = {
  seccion: SeccionPanel;
  etiqueta: string;
  href: string;
  capacidad: Capacidad | null;
};

const ENTRADAS: Entrada[] = [
  { seccion: "pedidos", etiqueta: "Pedidos", href: "/dashboard", capacidad: null },
  { seccion: "comanda", etiqueta: "Comanda", href: "/dashboard/comanda", capacidad: "tomar_comanda" },
  { seccion: "menu", etiqueta: "Menú", href: "/dashboard/menu", capacidad: "marcar_agotado" },
  { seccion: "config", etiqueta: "Identidad", href: "/dashboard/config", capacidad: "editar_local" },
  { seccion: "reportes", etiqueta: "Reportes", href: "/dashboard/reportes", capacidad: "ver_reportes" },
  { seccion: "equipo", etiqueta: "Equipo", href: "/dashboard/equipo", capacidad: "gestionar_equipo" },
];

const CLASE_ACTIVA =
  "shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500";
const CLASE_INACTIVA =
  "shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary hover:opacity-80 transition-opacity";

export function NavPanel({
  actual,
  rol,
  esPlatformAdmin = false,
  className = "hidden md:flex",
}: {
  actual: SeccionPanel;
  rol: Rol | null;
  esPlatformAdmin?: boolean;
  /** Algunas páginas la muestran también en móvil. Se respeta lo que ya hacían. */
  className?: string;
}) {
  const visibles = ENTRADAS.filter((e) => e.capacidad === null || puede(rol, e.capacidad));

  return (
    <nav
      className={`${className} items-center gap-1 dash-bg-surface rounded-xl p-1 min-w-0 max-w-full overflow-x-auto`}
    >
      {visibles.map((e) =>
        e.seccion === actual ? (
          <span key={e.seccion} className={CLASE_ACTIVA}>
            {e.etiqueta}
          </span>
        ) : (
          <Link key={e.seccion} href={e.href} className={CLASE_INACTIVA}>
            {e.etiqueta}
          </Link>
        )
      )}

      {/* El super-admin de la plataforma no es un rol del local: vive en
          `platform_admins` y no tiene fila en `local_staff`. */}
      {esPlatformAdmin &&
        (actual === "admin" ? (
          <span className={CLASE_ACTIVA}>Alta de local</span>
        ) : (
          <Link href="/dashboard/admin" className={CLASE_INACTIVA}>
            Alta de local
          </Link>
        ))}
    </nav>
  );
}
