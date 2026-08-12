-- ============================================
-- GARZÓN DIGITAL — F10: cerrar el EXECUTE por defecto de las funciones de
-- suscripción.
--
-- Postgres otorga EXECUTE a PUBLIC en toda función nueva, así que un `GRANT ...
-- TO authenticated` no restringe nada: `anon` ya lo tenía por herencia. F6 lo
-- había resuelto con un REVOKE explícito en los `reporte_*`; la migración de
-- suscripción lo omitió y un test lo dejó en rojo.
--
-- Hoy `estado_suscripcion` es SECURITY INVOKER y `locales` no tiene lectura
-- pública desde F7, así que un anónimo obtenía cero filas igual. Pero apoyarse
-- en eso es apoyarse en dos capas lejanas: el permiso se cierra acá.
--
-- Idempotente.
-- ============================================

REVOKE ALL ON FUNCTION estado_suscripcion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION situacion_suscripcion(text, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION estado_suscripcion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION situacion_suscripcion(text, date) TO authenticated;

-- `get_menu_publico` y `crear_pedido` son SECURITY DEFINER: corren como su
-- dueño, así que siguen pudiendo llamar a `situacion_suscripcion` sin que el
-- comensal anónimo tenga permiso para invocarla por su cuenta.

-- VERIFICACION
-- SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('estado_suscripcion','situacion_suscripcion');
