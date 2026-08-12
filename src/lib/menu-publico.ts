import { cache } from "react";
import { supabase } from "@/lib/supabase";
import type { LocalPublico, Categoria, Producto } from "@/types/database";

export type MenuPublico = {
  local: LocalPublico;
  categorias: Categoria[];
  productos: Producto[];
};

/**
 * Trae el menú público de un local en UNA sola consulta (RPC `get_menu_publico`).
 *
 * Se llama desde el Server Component: el dato viaja dentro del HTML en vez de
 * costarle al celular del comensal dos oleadas de consultas sobre 4G.
 *
 * Envuelto en `cache()` de React para que la página y `generateMetadata`, que
 * corren en el mismo request, compartan una única ida a la base en vez de
 * pedir lo mismo dos veces.
 *
 * Devuelve `null` si el local no existe o está inactivo (la RPC devuelve NULL).
 * Lanza si la consulta falla de verdad — quien llama distingue "no existe" de
 * "no se pudo cargar", que para el comensal son mensajes muy distintos.
 */
export const getMenuPublico = cache(async (slug: string): Promise<MenuPublico | null> => {
  const { data, error } = await supabase.rpc("get_menu_publico", { p_slug: slug });

  if (error) {
    throw new Error(`No se pudo cargar el menú de "${slug}": ${error.message}`);
  }
  if (!data) return null;

  // La RPC devuelve jsonb, que en los tipos generados es `Json`. La forma real
  // la fija la migración f7_menu_publico y la cubren los tests de integración.
  const menu = data as unknown as MenuPublico;
  if (!menu.local?.id) return null;

  return {
    local: {
      ...menu.local,
      // Si el campo faltara (una versión vieja de la RPC), se toma por
      // habilitado. Un local que sí pagó y no puede vender por un dato ausente
      // es mucho peor que uno moroso vendiendo un día de más.
      pedidos_habilitados: menu.local.pedidos_habilitados !== false,
    },
    categorias: menu.categorias ?? [],
    productos: menu.productos ?? [],
  };
});
