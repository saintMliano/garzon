-- ============================================
-- GARZÓN DIGITAL — Fase 4.2: Almacenamiento de imágenes (Supabase Storage)
-- Bucket público "menu" para fotos de productos (y logos más adelante).
-- Lectura pública; escritura solo del staff del local, scopeada por la
-- primera carpeta de la ruta = local_id (ej. "<local_id>/<archivo>").
-- Idempotente.
-- ============================================

-- Bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu', 'menu', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas sobre storage.objects (creadas como postgres).
DROP POLICY IF EXISTS "menu public read" ON storage.objects;
CREATE POLICY "menu public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'menu');

DROP POLICY IF EXISTS "menu staff insert" ON storage.objects;
CREATE POLICY "menu staff insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu'
    AND (storage.foldername(name))[1] IN (
      SELECT local_id::text FROM public.local_staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "menu staff update" ON storage.objects;
CREATE POLICY "menu staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu'
    AND (storage.foldername(name))[1] IN (
      SELECT local_id::text FROM public.local_staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "menu staff delete" ON storage.objects;
CREATE POLICY "menu staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu'
    AND (storage.foldername(name))[1] IN (
      SELECT local_id::text FROM public.local_staff WHERE user_id = auth.uid()
    )
  );

-- VERIFICACION
-- SELECT id, public FROM storage.buckets WHERE id = 'menu';
-- SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'menu%';
