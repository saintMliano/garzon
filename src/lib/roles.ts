/**
 * Roles dentro de un local.
 *
 * Son dos, decisión del dueño (plan/ROLES-Y-COMANDA.md §9): en una fuente de
 * soda la misma persona toma el pedido y lo cocina, así que separar "garzón" de
 * "cocina" habría sido burocracia sin uso.
 *
 * ⚠️ Este archivo NO es la frontera de seguridad. Todo lo que hay acá sirve
 * para decidir qué se dibuja y a dónde se redirige. Quien de verdad impide que
 * un `personal` cambie un precio o vea la caja es la base de datos:
 *   - las políticas RLS de `categorias`, `productos`, `locales` y `storage`
 *   - la guarda de rol dentro de las cinco RPC `reporte_*`
 *   - `marcar_disponibilidad()` y `productos_frecuentes()`
 * Ver supabase/migrations/20260820120000_f12_roles_local.sql.
 *
 * Si agregás una capacidad acá, agregá también su contraparte en el servidor.
 */

export const ROLES = ["dueño", "personal"] as const;
export type Rol = (typeof ROLES)[number];

export function esRolValido(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}

/** Nombre legible para la UI. En sentence case, como el resto del panel. */
export const NOMBRE_ROL: Record<Rol, string> = {
  dueño: "Dueño",
  personal: "Personal",
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  dueño: "Acceso completo: menú, precios, reportes, identidad del local y equipo.",
  personal: "Pedidos y comanda. No ve reportes ni puede cambiar precios.",
};

/**
 * Capacidades. La lista es corta a propósito: cada una tiene que corresponder a
 * algo que el servidor también sabe negar.
 */
export type Capacidad =
  | "ver_pedidos"
  | "avanzar_pedido"
  | "cancelar_pedido"
  | "ver_telefono"
  | "tomar_comanda"
  | "marcar_agotado"
  | "ver_reportes"
  | "editar_menu"
  | "editar_local"
  | "gestionar_equipo";

const CAPACIDADES: Record<Rol, ReadonlySet<Capacidad>> = {
  dueño: new Set<Capacidad>([
    "ver_pedidos",
    "avanzar_pedido",
    "cancelar_pedido",
    "ver_telefono",
    "tomar_comanda",
    "marcar_agotado",
    "ver_reportes",
    "editar_menu",
    "editar_local",
    "gestionar_equipo",
  ]),
  // Cancelar entra acá por decisión explícita del dueño: al fusionar cocina y
  // garzón en un solo rol, quien atiende la mesa es también quien tiene que
  // poder deshacer un pedido cuando se acabó el producto.
  personal: new Set<Capacidad>([
    "ver_pedidos",
    "avanzar_pedido",
    "cancelar_pedido",
    "ver_telefono",
    "tomar_comanda",
    "marcar_agotado",
  ]),
};

export function puede(rol: Rol | null | undefined, capacidad: Capacidad): boolean {
  if (!rol) return false;
  return CAPACIDADES[rol]?.has(capacidad) ?? false;
}

/**
 * Rutas del panel y qué capacidad exige cada una. Lo usa el layout para
 * redirigir a alguien que escribió una URL a mano, y para dibujar el menú.
 *
 * `/dashboard/cuenta` no está: la contraseña es de la persona, no del local, y
 * la puede cambiar cualquiera.
 */
export const CAPACIDAD_POR_RUTA: ReadonlyArray<{ ruta: string; capacidad: Capacidad }> = [
  { ruta: "/dashboard/reportes", capacidad: "ver_reportes" },
  { ruta: "/dashboard/menu", capacidad: "editar_menu" },
  { ruta: "/dashboard/config", capacidad: "editar_local" },
  { ruta: "/dashboard/equipo", capacidad: "gestionar_equipo" },
  { ruta: "/dashboard/comanda", capacidad: "tomar_comanda" },
];

/** Devuelve la capacidad que exige una ruta, o null si no exige ninguna. */
export function capacidadDeRuta(pathname: string): Capacidad | null {
  const match = CAPACIDAD_POR_RUTA.find(
    (r) => pathname === r.ruta || pathname.startsWith(`${r.ruta}/`)
  );
  return match ? match.capacidad : null;
}
