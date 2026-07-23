const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Creando / actualizando local 'Catire Kaffe'...");

  // 1. Upsert Local
  const slug = "catirekaffe";
  
  // Buscar si ya existe
  const { data: existingLocal } = await supabase
    .from("locales")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  let localId;

  if (existingLocal) {
    localId = existingLocal.id;
    console.log(`Local 'catirekaffe' encontrado (ID: ${localId}). Actualizando datos...`);
    const { error: updateErr } = await supabase
      .from("locales")
      .update({
        nombre: "Catire Kaffe",
        direccion: "Cafetería de Especialidad & Wafflería",
        color_primario: "#d97706",
        color_acento: "#b45309",
        slogan: "Si quieres tomar el mejor café, ¡llégate!",
        activo: true,
        mesas: ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Barra"],
      })
      .eq("id", localId);
    if (updateErr) throw new Error(`Error actualizando local: ${updateErr.message}`);
  } else {
    const { data: newLocal, error: createErr } = await supabase
      .from("locales")
      .insert({
        nombre: "Catire Kaffe",
        slug: slug,
        direccion: "Cafetería de Especialidad & Wafflería",
        color_primario: "#d97706",
        color_acento: "#b45309",
        slogan: "Si quieres tomar el mejor café, ¡llégate!",
        activo: true,
        mesas: ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Barra"],
      })
      .select()
      .single();
    if (createErr || !newLocal) throw new Error(`Error creando local: ${createErr?.message}`);
    localId = newLocal.id;
    console.log(`Local 'Catire Kaffe' creado exitosamente con ID: ${localId}`);
  }

  // Vincular con super-admin si no esta vinculado
  const superAdminUserId = "e5d25ae3-445b-4ef2-aef1-e567b23fdb1c";
  const { data: existingStaff } = await supabase
    .from("local_staff")
    .select("user_id")
    .eq("local_id", localId)
    .eq("user_id", superAdminUserId)
    .maybeSingle();

  if (!existingStaff) {
    await supabase.from("local_staff").insert({
      user_id: superAdminUserId,
      local_id: localId,
    });
    console.log(`Usuario super-admin vinculado al local Catire Kaffe.`);
  }

  // 2. Limpiar productos y categorias previas si existian para reinstalar limpiamente
  await supabase.from("productos").delete().eq("local_id", localId);
  await supabase.from("categorias").delete().eq("local_id", localId);

  // 3. Crear Categorias y Productos
  const menuData = [
    {
      categoria: "Café Clásico",
      icono: "☕",
      orden: 1,
      productos: [
        { nombre: "Espresso", precio: 2500, descripcion: "Espresso clásico concentrado", orden: 1 },
        { nombre: "Doble Espresso", precio: 2800, descripcion: "Doble extracción de espresso", orden: 2 },
        { nombre: "Americano", precio: 2800, descripcion: "Espresso rebajado con agua caliente", orden: 3 },
        { nombre: "Ristretto", precio: 2500, descripcion: "Extracción de espresso corta y densa", orden: 4 },
        { nombre: "Guayoyo", precio: 2500, descripcion: "Café suave tradicional estilo venezolano", orden: 5 },
        { nombre: "Lungo", precio: 2800, descripcion: "Extracción larga de espresso", orden: 6 },
      ],
    },
    {
      categoria: "Café Frío",
      icono: "🧊",
      orden: 2,
      productos: [
        { nombre: "Cold Brew", precio: 4000, descripcion: "Café de especialidad extraído en frío por 12+ hrs", orden: 1 },
        { nombre: "Strawberry Fresh", precio: 5500, descripcion: "Refrescante bebida de café frío con frutilla", orden: 2 },
        { nombre: "Lemon Fresh", precio: 5500, descripcion: "Refrescante bebida de café frío con limón", orden: 3 },
        { nombre: "Maracuyá Fresh", precio: 5500, descripcion: "Refrescante bebida de café frío con maracuyá", orden: 4 },
        { nombre: "Mocaccino c/ Chantilly", precio: 6000, descripcion: "Mocaccino helado servido con crema chantilly", orden: 5 },
        { nombre: "Latte / Cappuccino c/ Chantilly", precio: 6000, descripcion: "Café helado con leche y crema chantilly", orden: 6 },
        { nombre: "Matcha Latte c/ Chantilly", precio: 6000, descripcion: "Matcha helado con leche y crema chantilly", orden: 7 },
        { nombre: "Affogato", precio: 5500, descripcion: "Espresso caliente servido sobre una bola de helado de vainilla", orden: 8 },
        { nombre: "Strawberry Frappú c/ Chantilly", precio: 7000, descripcion: "Frappuccino de frutilla y café coronado con crema chantilly", orden: 9 },
        { nombre: "Milkshake Oreo c/ Chantilly", precio: 6500, descripcion: "Milkshake de galleta Oreo coronado con crema chantilly", orden: 10 },
      ],
    },
    {
      categoria: "Café con Leche",
      icono: "🥛",
      orden: 3,
      productos: [
        { nombre: "Mocaccino Simple", precio: 3500, descripcion: "Espresso, leche vaporizada y cacao", orden: 1 },
        { nombre: "Mocaccino Doble", precio: 4500, descripcion: "Doble espresso, leche vaporizada y cacao", orden: 2 },
        { nombre: "Choco Kaffe Doble", precio: 6000, descripcion: "Deliciosa combinación de chocolate cremoso y café", orden: 3 },
        { nombre: "Cappuccino Simple", precio: 3000, descripcion: "Espresso con leche vaporizada y espuma cremosa", orden: 4 },
        { nombre: "Cappuccino Doble", precio: 3800, descripcion: "Doble espresso con leche vaporizada y espuma cremosa", orden: 5 },
        { nombre: "Latte Simple", precio: 3000, descripcion: "Espresso suave con abundante leche tibia", orden: 6 },
        { nombre: "Latte Doble", precio: 3800, descripcion: "Doble espresso con abundante leche tibia", orden: 7 },
        { nombre: "Macchiato Simple", precio: 3000, descripcion: "Espresso manchado con una gota de leche", orden: 8 },
        { nombre: "Macchiato Doble", precio: 3800, descripcion: "Doble espresso manchado con leche", orden: 9 },
        { nombre: "Chocolate Caliente Doble", precio: 4500, descripcion: "Chocolate caliente espeso de especialidad", orden: 10 },
        { nombre: "Flat White Doble", precio: 3800, descripcion: "Doble ristretto con fina capa de leche micro-vaporizada", orden: 11 },
        { nombre: "Matcha Latte Doble", precio: 4500, descripcion: "Té Matcha ceremonial con leche vaporizada", orden: 12 },
      ],
    },
    {
      categoria: "Especiales & Filtrados",
      icono: "✨",
      orden: 4,
      productos: [
        { nombre: "Café Filtrado de Especialidad", precio: 6000, descripcion: "Métodos de filtrado según el grano disponible del día (V60 / Chemex / Aeropress)", orden: 1 },
        { nombre: "Kaffe Oreo Chocolate", precio: 6000, descripcion: "Café especial preparado con base de galletas Oreo y chocolate", orden: 2 },
        { nombre: "Kaffe Oreo Vainilla", precio: 6000, descripcion: "Café especial preparado con base de galletas Oreo y vainilla", orden: 3 },
        { nombre: "Kaffe Nutella", precio: 6000, descripcion: "Café especial con rica cremosidad de Nutella", orden: 4 },
        { nombre: "Kaffe Brownie", precio: 6500, descripcion: "Café especial acompañado de deliciosos trozos de brownie", orden: 5 },
        { nombre: "Kaffe Boston", precio: 6000, descripcion: "Receta especial de café dulce de la casa", orden: 6 },
        { nombre: "Kaffe Manjar", precio: 5500, descripcion: "Café especial endulzado con manjar artesanal", orden: 7 },
        { nombre: "Té en Hoja (Variedades)", precio: 4000, descripcion: "Selección de tés orgánicos en hoja a elección", orden: 8 },
        { nombre: "Adicional Leche Vegetal", precio: 600, descripcion: "Cambio a leche vegetal (almendra, soya u avena)", orden: 9 },
      ],
    },
    {
      categoria: "Waffles Dulces",
      icono: "🧇",
      orden: 5,
      productos: [
        { nombre: "Waffle Simple (Manjar)", precio: 3500, descripcion: "Waffle recién horneado con manjar artesanal", orden: 1 },
        { nombre: "Waffle Simple (Leche Condensada)", precio: 3500, descripcion: "Waffle recién horneado con leche condensada", orden: 2 },
        { nombre: "Waffle Simple (Nutella)", precio: 4500, descripcion: "Waffle recién horneado cubierto de Nutella", orden: 3 },
        { nombre: "Waffle Simple (Mermelada)", precio: 3500, descripcion: "Waffle recién horneado con mermelada de la casa", orden: 4 },
        { nombre: "Waffle Doble: Manjar y Fruta", precio: 6000, descripcion: "Waffle doble con manjar, fruta fresca a elección y crema chantilly", orden: 5 },
        { nombre: "Waffle Doble: Leche Condensada y Fruta", precio: 6000, descripcion: "Waffle doble con leche condensada, fruta fresca y crema chantilly", orden: 6 },
        { nombre: "Waffle Doble: Nutella y Fruta", precio: 7000, descripcion: "Waffle doble con Nutella, fruta fresca y crema chantilly", orden: 7 },
        { nombre: "Waffle Doble: Mermelada y Fruta", precio: 6000, descripcion: "Waffle doble con mermelada, fruta fresca y crema chantilly", orden: 8 },
        { nombre: "Waffle Fresa Rumbera", precio: 8000, descripcion: "Base nutella, oreo, frutilla fresca, sirope de chocolate y crema chantilly", orden: 9 },
        { nombre: "Waffle Choco Oreo", precio: 7000, descripcion: "Base nutella, galletas oreo chocolate, sirope de chocolate y crema chantilly", orden: 10 },
        { nombre: "Waffle Chococoton", precio: 8000, descripcion: "Base nutella, melocotón, galletas oreo chocolate, sirope de chocolate y crema chantilly", orden: 11 },
        { nombre: "Waffle Niña Vainilla", precio: 6500, descripcion: "Base manjar, galletas oreo vainilla, sirope de caramelo y crema chantilly", orden: 12 },
        { nombre: "Waffle Choco Banana", precio: 8000, descripcion: "Base nutella, banana fresca, galletas oreo chocolate, sirope de chocolate y crema chantilly", orden: 13 },
        { nombre: "Waffle Catirekaffe", precio: 9000, descripcion: "1/4 de cada base, fruta de la estación, helado, sirope a elección y crema chantilly", orden: 14 },
        { nombre: "Waffle 50/50", precio: 7000, descripcion: "Media base nutella y media base manjar, fruta fresca, sirope y crema chantilly", orden: 15 },
      ],
    },
    {
      categoria: "Waffles Salados",
      icono: "🥓",
      orden: 6,
      productos: [
        { nombre: "Waffle Jamón Queso", precio: 4500, descripcion: "Jamón y abundante queso gratinado", orden: 1 },
        { nombre: "Waffle Pollo Queso", precio: 5500, descripcion: "Mix pollo mayo casero, queso gratinado y salsa especial de la casa", orden: 2 },
        { nombre: "Waffle Pepperoni", precio: 5000, descripcion: "Pepperoni artesanal y abundante queso gratinado", orden: 3 },
        { nombre: "Waffle Pollo Italiano", precio: 7000, descripcion: "Mix pollo mayo, palta fresca, tomate cherry, queso gratinado y salsa especial", orden: 4 },
        { nombre: "Waffle Mechada Italiana", precio: 8000, descripcion: "Carne mechada tierna, palta fresca, tomate cherry, queso gratinado y salsa especial", orden: 5 },
        { nombre: "Waffle Pollo Palta", precio: 6500, descripcion: "Mix pollo mayo y palta fresca laminada", orden: 6 },
        { nombre: "Adicional Versión Italiana (Palta + Tomate Cherry)", precio: 1500, descripcion: "Adiciona palta y tomate cherry a tu Waffle Jamón Queso o Pepperoni", orden: 7 },
      ],
    },
  ];

  let totalProductos = 0;

  for (const item of menuData) {
    const { data: catData, error: catErr } = await supabase
      .from("categorias")
      .insert({
        local_id: localId,
        nombre: item.categoria,
        icono: item.icono,
        orden: item.orden,
      })
      .select()
      .single();

    if (catErr || !catData) {
      throw new Error(`Error creando categoría '${item.categoria}': ${catErr?.message}`);
    }

    const prodsToInsert = item.productos.map((p) => ({
      local_id: localId,
      categoria_id: catData.id,
      nombre: p.nombre,
      precio: p.precio,
      descripcion: p.descripcion,
      disponible: true,
      orden: p.orden,
    }));

    const { error: prodsErr } = await supabase.from("productos").insert(prodsToInsert);
    if (prodsErr) {
      throw new Error(`Error creando productos para '${item.categoria}': ${prodsErr.message}`);
    }

    totalProductos += prodsToInsert.length;
    console.log(`Categoría '${item.categoria}' insertada con ${prodsToInsert.length} productos.`);
  }

  console.log(`\n🎉 ¡Carga completada exitosamente!`);
  console.log(`Local: Catire Kaffe`);
  console.log(`Slug: ${slug}`);
  console.log(`Categorías creadas: ${menuData.length}`);
  console.log(`Total productos insertados: ${totalProductos}`);
  console.log(`URL demo local: /local/${slug}`);
}

main().catch((err) => {
  console.error("Error en seed script:", err);
  process.exit(1);
});
