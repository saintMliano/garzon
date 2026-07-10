# F5 — Dominios propios (backlog, post-consolidación)

**Disparador:** cerrar un cliente que pida su propio dominio. No empezar antes de completar T1–T8.
Este es un esbozo de diseño para dimensionar; la especificación ejecutable se escribirá cuando
llegue el caso real (decisiones de hosting/SSL dependen del proveedor de deploy elegido).

## Diseño previsto

1. **Base:** `ALTER TABLE locales ADD COLUMN IF NOT EXISTS dominio text UNIQUE;` (nullable; solo
   locales con dominio propio la usan). Editable SOLO por service-role (mismo patrón T4).
2. **Enrutado por Host en `src/proxy.ts`:** si `request.headers.get('host')` no es el dominio
   principal de la plataforma, resolver el local por `dominio` y hacer rewrite interno de `/` a
   `/local/<slug>` (rewrite, no redirect: el cliente ve su dominio limpio). Cachear la resolución
   (el proxy corre en cada request).
3. **SSL / DNS:** depende del hosting (en Vercel: Domains API + instrucciones de CNAME al dueño).
   Documentar el procedimiento de alta manual antes de automatizar.
4. **SEO por dominio** se coordina con F6 (`generateMetadata` necesita el menú como Server
   Component).

## Riesgos a vigilar

- El rewrite por Host no debe abrir un bypass del aislamiento: la resolución del local sigue
  siendo por datos (`dominio` → `slug`), y toda lectura sigue pasando por RLS/RPC como hoy.
- `NEXT_PUBLIC_DEMO_SLUG` y la landing solo aplican al dominio principal.
