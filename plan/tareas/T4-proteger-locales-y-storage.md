# T4 — Proteger columnas de `locales` y límites del bucket `menu` (P1)

**Tipo:** SQL (una migración).
**Hallazgos que resuelve:** S4 y M4 de [`AUDITORIA.md`](../AUDITORIA.md).

## Contexto

- La política "Staff update locales" (`migrations/fase4-1-menu-rls.sql`) deja al staff actualizar
  **cualquier columna** de su local, incluidas `slug` (rompería los QRs impresos del local, o
  permitiría squatear un slug) y `activo` (autodesactivación accidental). El alta/edición de esas
  columnas debe quedar reservada al service-role (onboarding / soporte).
- El bucket `menu` no tiene límite de tamaño ni de tipos MIME: cualquier staff puede subir archivos
  arbitrarios de cualquier tamaño.

Columnas que el staff SÍ edita hoy desde `/dashboard/config`: `nombre`, `slogan`, `direccion`,
`telefono`, `logo_url`, `color_primario`, `color_acento`. Además `mesas` está pensada para ser
configurable por local (Fase 3). Esas ocho se mantienen editables.

## Pasos

1. Crear `migrations/consolidacion-t4-locales-storage.sql` con **exactamente**:

```sql
-- ============================================
-- GARZÓN DIGITAL — Consolidación T4: columnas protegidas de `locales`
-- y límites del bucket `menu`.
-- El staff solo puede actualizar las columnas de branding/operación de su
-- local; `slug`, `activo`, `id` y `created_at` quedan reservadas al
-- service-role. Idempotente.
-- ============================================

-- 1. Privilegios de columna en `locales` (la RLS de Fase 4.1 sigue
--    decidiendo QUÉ filas; esto decide QUÉ columnas).
REVOKE UPDATE ON locales FROM authenticated;
REVOKE UPDATE ON locales FROM anon;
GRANT UPDATE (nombre, slogan, direccion, telefono, logo_url,
              color_primario, color_acento, mesas)
  ON locales TO authenticated;

-- 2. Límites del bucket de imágenes: 3 MB y solo imágenes.
UPDATE storage.buckets
SET file_size_limit = 3145728,  -- 3 MB
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE id = 'menu';

-- VERIFICACION
-- SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_name = 'locales' AND privilege_type = 'UPDATE' ORDER BY column_name;
-- SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'menu';
```

2. Aplicarla en el SQL Editor de Supabase.

## Criterios de aceptación

- En `/dashboard/config`, el dueño sigue pudiendo guardar nombre, slogan, dirección, teléfono,
  colores y logo sin errores.
- Con la sesión de staff (devtools):
  `await supabase.from('locales').update({ slug: 'hackeado' }).eq('id', '<su local>')` →
  error de permisos. Lo mismo con `{ activo: false }`.
- Subir una imagen > 3 MB o un `.pdf` desde el editor de producto → Supabase la rechaza (el
  editor debe mostrar su mensaje de error existente, no romperse en blanco).
- El onboarding (`/dashboard/admin`) sigue funcionando: usa service-role, que no se ve afectado.

## Verificación

1. Ejercitar `/dashboard/config` (guardar un cambio real y revertirlo).
2. Probar los dos UPDATEs prohibidos desde devtools.
3. Subir una foto válida (< 3 MB, jpg/png) a un producto de prueba → funciona; intentar un archivo
   inválido → falla con mensaje. **Eliminar el producto y el objeto de Storage de prueba.**

## Qué NO hacer

- No tocar las políticas RLS existentes (ni de `locales` ni de `storage.objects`).
- No quitar `mesas` de las columnas editables (es configuración operativa del local).
- Si `/dashboard/config` enviara en su UPDATE columnas que no cambia (p. ej. incluye `slug` en el
  payload), el guardado fallará: en ese caso ajustar el `update()` de
  `src/app/dashboard/config/page.tsx` para enviar **solo** las 8 columnas permitidas, y reportarlo
  en el commit.

## Al terminar

Marcar T4 en `plan/README.md`, entrada fechada en `developer-context.md`, commit en rama
`consolidacion/t4-locales-storage`.
