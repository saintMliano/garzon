import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMenuPublico } from "@/lib/menu-publico";
import { variablesDeMarca } from "@/lib/color";
import MenuCliente from "./menu-cliente";

/**
 * Menú público del local — Server Component.
 *
 * Antes esta página era un componente de cliente que, ya en el celular del
 * comensal, hacía dos oleadas secuenciales de consultas: primero `locales` por
 * slug y recién con el id a la vista, `categorias` + `productos`. Medido desde
 * fibra eran 0,4-1,1 s solo de base; en 4G dentro de un local, sumando bundle e
 * hidratación, 3-6 s hasta ver la carta.
 *
 * Ahora los datos se traen en el servidor con una sola llamada y viajan dentro
 * del HTML: el primer render ya trae el menú puesto.
 */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;

  // No romper la página por un fallo de metadata: si la base no responde, se
  // sirve un título genérico y el error real lo maneja el render.
  let menu = null;
  try {
    menu = await getMenuPublico(slug);
  } catch {
    menu = null;
  }

  if (!menu) {
    return { title: "Local no encontrado | Garzón Digital" };
  }

  const { local } = menu;
  const descripcion =
    local.slogan?.trim() ||
    (local.direccion ? `Pide desde tu mesa en ${local.nombre} · ${local.direccion}` : `Pide desde tu mesa en ${local.nombre}`);

  return {
    title: `${local.nombre} — Menú`,
    description: descripcion,
    // El caso real de uso: el dueño manda el link del menú por WhatsApp o lo
    // pone en su Instagram. Sin esto se veía el metadata genérico de Next.
    openGraph: {
      title: `${local.nombre} — Menú`,
      description: descripcion,
      type: "website",
      images: local.logo_url ? [{ url: local.logo_url }] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocalPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const menu = await getMenuPublico(slug);

  // La mesa viene del QR (`?mesa=Mesa%205`). Se lee acá en vez de con un efecto
  // en el navegador: llega ya puesta en el primer render, sin parpadeo, y sin
  // depender de que el JS haya hidratado.
  const mesaParam = (await searchParams).mesa;
  const mesaDelQR = typeof mesaParam === "string" ? mesaParam : null;

  // 404 de verdad y no un 200 con cara de error: si el QR está mal impreso o el
  // local se dio de baja, un buscador no debe indexar esa página como válida.
  if (!menu) notFound();

  // Las variables de marca se calculan en el servidor y envuelven TODO el flujo.
  // Antes vivían dentro del render del menú, así que la pantalla de seguimiento
  // —que sale por un return temprano— quedaba fuera de su alcance y no había
  // forma de pintarla con la marca del local.
  //
  // `contents` hace que este div no genere caja: las variables heredan por el
  // árbol igual, pero el layout de los hijos queda exactamente como estaba.
  const marca = variablesDeMarca(menu.local.color_primario, menu.local.color_acento) as CSSProperties;

  return (
    <div className="contents" style={marca}>
      <MenuCliente
        slug={slug}
        local={menu.local}
        categorias={menu.categorias}
        productos={menu.productos}
        mesaDelQR={mesaDelQR}
      />
    </div>
  );
}
