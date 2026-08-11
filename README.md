# Garzón Digital

SaaS de pedidos por QR para fuentes de soda y locales de comida en Chile.

El cliente escanea un QR en la mesa y pide desde `/local/[slug]` — menú público, carrito y checkout
sin login. La cocina gestiona los pedidos en `/dashboard`, un Kanban en tiempo real pensado para una
tablet. Cada local se autoadministra el menú, las fotos y su identidad visual; el alta de locales
nuevos se hace desde `/dashboard/admin`.

**Stack:** Next.js 16 (App Router, React 19, TypeScript) · TailwindCSS 4 · Supabase (Postgres, Auth,
Storage, Realtime) · Vitest.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar con los valores del proyecto Supabase
npm run dev
```

Con solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` la app corre. La service-role
key hace falta para el alta de locales, y las dos variables del CLI solo para migraciones.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Tests de integración contra Supabase real (necesita `.env.test`) |
| `npm run lint` | ESLint |
| `npm run db:backup` | **Respaldo de datos. Correr antes de cada `db:push`.** |
| `npm run db:push` | Aplica las migraciones pendientes de `supabase/migrations/` |
| `npm run db:diff` | Deriva entre el repo y la base *(requiere Docker)* |
| `npm run db:types` | Regenera `src/types/supabase.ts` desde la base |

## Migraciones

Las migraciones nuevas van en `supabase/migrations/` y se aplican con el CLI:

```bash
npm run db:backup
npx supabase migration new mi_cambio
# ... escribir el SQL ...
npm run db:push
```

La carpeta `migrations/` de la raíz es **historial previo**, aplicado a mano antes de que existiera
el pipeline. No se re-aplica y no se le agregan archivos.

> **El plan de Supabase es gratis: no hay Point-in-Time Recovery.** Si una migración rompe algo, no
> hay botón de deshacer — por eso `db:backup` no es opcional. Ese respaldo cubre los datos, no el
> esquema (que vive en git), ni las contraseñas, ni los archivos de Storage.

## Dónde está la documentación

- **[`CLAUDE.md`](CLAUDE.md)** — contexto y protocolos del proyecto. Lo carga cualquier instancia de
  IA que abra el repo. Empezar por acá.
- **[`developer-context.md`](developer-context.md)** — fuente de verdad viva: arquitectura, modelo
  de seguridad, roadmap y bitácora fechada de cambios.
- **[`plan/`](plan/README.md)** — planes ejecutables y auditorías. El vigente es
  [F5 — Turno autónomo](plan/F5-TURNO-AUTONOMO.md).

## Reglas que no se rompen

- **Multi-tenant single-DB:** todo cuelga de `local_id` y el aislamiento lo garantiza **RLS**, nunca
  un filtro del cliente.
- **El servidor decide:** el total de los pedidos se calcula en Postgres (`crear_pedido`,
  `SECURITY DEFINER`). Un total enviado por el navegador se ignora por diseño.
- **Tres clientes de Supabase, no se mezclan:** `lib/supabase.ts` (anónimo, páginas públicas),
  `lib/supabase/{client,server}.ts` (autenticado, dashboard) y `lib/supabase/admin.ts`
  (**service-role, solo servidor** — jamás al navegador).
