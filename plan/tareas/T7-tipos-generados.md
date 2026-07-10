# T7 — Tipos reales de la base: reemplazar `Database = Record<string, any>` (P3)

**Tipo:** TypeScript.
**Hallazgos que resuelve:** M5 y B4 de [`AUDITORIA.md`](../AUDITORIA.md).

## Contexto

`src/types/database.ts` termina con `export type Database = Record<string, any>;`, lo que anula el
tipado de **todas** las consultas de Supabase (los tres clientes pasan `<Database>` como genérico).
Además `Producto.categoria_id` está tipado `string` pero en la base es nullable
(`ON DELETE SET NULL`).

## Pasos

1. **Generar los tipos** con la CLI de Supabase (pedir al dueño el project-ref, visible en la URL
   del dashboard `https://supabase.com/dashboard/project/<project-ref>`):

   ```
   npx supabase login          # solo la primera vez; abre el navegador
   npx supabase gen types typescript --project-id <project-ref> --schema public > src/types/supabase.ts
   ```

   Si no hay acceso a la CLI/login, **fallback manual:** escribir `src/types/supabase.ts` a mano
   siguiendo el formato estándar `Database { public: { Tables: { locales: { Row/Insert/Update …`
   con el esquema real: `supabase-schema.sql` + columnas agregadas por migraciones
   (`locales.mesas text[]`, `locales.slogan`, `locales.color_acento`, `local_staff`,
   `platform_admins`) y las funciones `crear_pedido`/`get_order_status`.

2. En `src/types/database.ts`:
   - Reemplazar `export type Database = Record<string, any>;` por
     `export type { Database } from "./supabase";`
   - Corregir `Producto.categoria_id: string` → `categoria_id: string | null;`
   - **Mantener** las interfaces manuales existentes (`Local`, `Producto`, `Pedido`, etc.): son la
     capa de dominio que usa la UI. No reescribir los componentes para usar los tipos generados.

3. Compilar y corregir los errores de tipo que aparezcan (`npm run build`). Esperable:
   - Consultas donde ahora TypeScript infiere tipos estrictos y el código asumía `any`
     (agregar los casts mínimos o ajustar, sin cambiar lógica).
   - Usos de `prod.categoria_id` que asuman no-null (en `src/app/local/[slug]/page.tsx` se usa en
     `find`/`filter`, lo que tolera null sin cambios).

4. Si el paso 1 usó la CLI, documentar el comando en `developer-context.md` para regenerar tipos
   tras cada migración futura.

## Criterios de aceptación

- `npm run build` y `npm run lint` pasan sin errores.
- `src/types/supabase.ts` refleja TODAS las columnas reales (verificar contra las migraciones, no
  solo contra `supabase-schema.sql`, que es el esquema base sin endurecimiento).
- Ninguna consulta cambió de comportamiento: es una tarea de tipos, cero cambios de lógica.
- Prueba de fuego: escribir temporalmente `supabase.from("locales").select("columna_inexistente")`
  en un archivo debe marcar error de tipo; revertirlo.

## Verificación

Flujo real mínimo tras el build: cargar `/local/el-lalo`, crear un pedido de prueba, verlo en el
dashboard, entregarlo. **Limpiar el pedido de prueba.**

## Qué NO hacer

- No subir tokens de la CLI de Supabase ni el project-ref a ningún archivo versionado que no sea
  documentación (el project-ref no es secreto, pero los tokens sí).
- No refactorizar componentes "de paso".

## Al terminar

Marcar T7 en `plan/README.md`, entrada fechada en `developer-context.md`, commit en rama
`consolidacion/t7-tipos`.
