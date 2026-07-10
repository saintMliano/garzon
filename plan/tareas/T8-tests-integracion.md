# T8 — Suite mínima de tests de integración (P3, ejecutar al final)

**Tipo:** tests (Vitest) + configuración.
**Hallazgo que resuelve:** M6 de [`AUDITORIA.md`](../AUDITORIA.md).
**Prerrequisito:** T2, T3 y T4 aplicadas (los tests cubren sus reglas). **Nunca** correr contra un
proyecto con datos reales de clientes: usar el proyecto de desarrollo actual o uno de staging.

## Contexto

No existe ningún test. Lo más valioso que se puede proteger con poco esfuerzo son las
**invariantes de seguridad**: aislamiento RLS entre locales, total calculado en servidor, y las
reglas nuevas de T2/T3/T4. Son tests de integración contra la API real de Supabase (no unit tests
con mocks: lo que hay que probar es justamente la base).

## Pasos

1. Instalar: `npm i -D vitest dotenv`.
2. Agregar script en `package.json`: `"test": "vitest run"`.
3. Crear `vitest.config.ts` mínimo (entorno `node`, `testTimeout: 20000`).
4. Crear `.env.test.example` (versionado) con:

   ```
   TEST_SUPABASE_URL=
   TEST_SUPABASE_ANON_KEY=
   TEST_SUPABASE_SERVICE_ROLE_KEY=
   ```

   y agregar `.env.test` a `.gitignore`. Los tests cargan `.env.test` con `dotenv` y **fallan con
   mensaje claro si falta alguna variable** (nunca defaultear a producción).

5. Crear `tests/setup.ts` con helpers que usen el **service-role** para preparar y limpiar el
   escenario en `beforeAll`/`afterAll`:
   - Crea 2 locales de prueba (`test-local-a-<timestamp>`, `test-local-b-<timestamp>`) con 1
     categoría y 2 productos cada uno (uno `disponible=false`).
   - Crea 2 usuarios (`test-a-<timestamp>@test.garzon`, contraseña aleatoria) vinculados por
     `local_staff` a su local respectivo.
   - `afterAll`: borra pedidos, productos, categorías, locales, vínculos y usuarios creados.
     La limpieza debe correr aunque los tests fallen.

6. Tests (un archivo por área, nombres descriptivos en español):

   **`tests/rls-aislamiento.test.ts`**
   - El cliente **anónimo** no puede `select` de `pedidos` ni `pedido_items` (0 filas / error).
   - El cliente anónimo no puede `insert` directo en `pedidos`.
   - Staff A (login real con `signInWithPassword`) ve los pedidos de su local y **cero** pedidos
     del local B.
   - Staff A no puede `update` un pedido del local B (0 filas afectadas).
   - Staff A no puede `update` `slug` ni `activo` de su propio local (error de permisos — T4).
   - Staff A no puede `update` `total` de un pedido (error de permisos — T3).

   **`tests/crear-pedido.test.ts`** (cliente anónimo, vía `rpc`)
   - Pedido válido: retorna uuid; el `total` en la base = suma de precios reales del servidor
     (verificado con service-role), aunque el payload no incluya total alguno.
   - Producto de otro local en los items → error "Producto no disponible".
   - Producto con `disponible=false` → error.
   - `cantidad: 100` → error "Cantidad inválida" (T2).
   - 51 items distintos → error (T2).
   - 16 pedidos válidos seguidos al mismo local → el 16.º falla con "Demasiados pedidos" (T2).
     *(Este test debe correr al final del archivo para no contaminar los demás, o usar el local B.)*
   - Local con `activo=false` → error "Local no disponible".

   **`tests/estados.test.ts`** (staff con login real — T3)
   - `nuevo → aceptado → preparando → listo → entregado` funciona paso a paso.
   - `nuevo → entregado` directo → error de transición.
   - `cancelado → nuevo` → error de transición.
   - `listo → cancelado` → error de transición.

   **`tests/get-order-status.test.ts`** (cliente anónimo)
   - Devuelve `estado`, `numero_pedido`, `created_at` de un pedido creado en el setup.
   - Con un uuid aleatorio devuelve vacío (no error que filtre información).

7. Correr `npm test` hasta que pase completo dos veces seguidas (verifica que la limpieza deja el
   estado neutro). Verificar en el dashboard de Supabase que no quedaron datos `test-*` huérfanos.

## Criterios de aceptación

- `npm test` verde, dos corridas consecutivas.
- Cero filas/usuarios de prueba residuales tras la corrida.
- Ningún secreto en archivos versionados; `.env.test` ignorado por git.
- Los tests no dependen del local demo `el-lalo` ni lo tocan.

## Qué NO hacer

- No usar mocks para las invariantes de seguridad (perderían todo su valor).
- No bajar los timeouts a menos de 15 s (latencia real de red contra Supabase).
- No correr contra producción, jamás.

## Al terminar

Marcar T8 en `plan/README.md`, entrada fechada en `developer-context.md` (incluir cómo correr los
tests), commit en rama `consolidacion/t8-tests`.
