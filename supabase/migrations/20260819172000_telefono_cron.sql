-- ============================================
-- GARZÓN DIGITAL — Agendar el borrado automático de teléfonos
--
-- La migración anterior creó `borrar_telefonos_antiguos()` e intentó agendarla,
-- pero `pg_cron` no estaba habilitado en el proyecto y el intento cayó en su
-- manejador de excepciones. Resultado: la función existía y NADIE la llamaba.
--
-- Eso no es un detalle de infraestructura. La política de privacidad le promete
-- al comensal que su teléfono se borra a los 7 días; sin el agendamiento, esa
-- promesa sería falsa y es exactamente el tipo de compromiso que se fiscaliza.
--
-- Idempotente: `cron.schedule` con un nombre que ya existe reemplaza la tarea.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 04:20 de la madrugada: fuera de cualquier hora de servicio de un local de
-- comida, y desfasado de la hora en punto para no competir con el resto del
-- mundo agendando a las 4:00.
SELECT cron.schedule(
  'borrar-telefonos-antiguos',
  '20 4 * * *',
  $tarea$SELECT borrar_telefonos_antiguos(7)$tarea$
);

-- VERIFICACION
-- SELECT jobname, schedule, command, active FROM cron.job
--   WHERE jobname = 'borrar-telefonos-antiguos';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
