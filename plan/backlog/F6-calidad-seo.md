# F6 — Calidad, rendimiento y SEO (backlog, post-consolidación)

**Disparador:** después de T1–T8 (T7 ya adelanta los tipos generados, que originalmente eran parte
de esta fase). Especificación ejecutable pendiente; alcance previsto:

1. **Menú como Server Component:** `src/app/local/[slug]/page.tsx` hoy es 100 % cliente. Separar:
   un Server Component que haga el fetch inicial de local/categorías/productos (con el cliente
   anónimo de servidor) y un client component hijo con la interactividad (carrito, búsqueda,
   modales). Beneficios: primer render con contenido, y habilita `generateMetadata`.
2. **SEO por local:** `generateMetadata` con nombre, slogan y logo del local (title, description,
   OpenGraph). Página 404 real cuando el slug no existe (`notFound()`).
3. **Revalidación:** decidir estrategia (`revalidate` corto o fetch dinámico) — el menú cambia
   cuando el dueño edita; el toggle de disponibilidad debe reflejarse rápido.
4. **Accesibilidad y rendimiento:** pasada de Lighthouse en móvil sobre `/local/el-lalo` y el
   dashboard; corregir lo rojo.

## Nota de arquitectura

El fetch en servidor debe usar un cliente anónimo (las páginas públicas no tienen sesión); NO usar
el cliente admin para esto. El aislamiento sigue siendo RLS.
