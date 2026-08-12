# Fase 9 — Marca completa

Resuelve los hallazgos **M2** (white-label a medias) y **M3** (el editor de identidad no valida
contraste) de la [auditoría del 2026-08-10](AUDITORIA-2026-08-10.md).

## Objetivo

**Que el comensal sienta que está en el local, no en Garzón Digital** — y que el dueño no pueda
romper su propio menú eligiendo un color.

## Tareas

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| F9.1 | Utilidad de color: contraste WCAG y texto legible | TypeScript | [x] |
| F9.2 | Variables de marca en el servidor, para todo el flujo | TypeScript | [x] |
| F9.3 | Pantalla de seguimiento al white-label | TypeScript | [x] |
| F9.4 | Resto de hardcodes del flujo del cliente | TypeScript | [x] |
| F9.5 | Validación de contraste en el editor de identidad | TypeScript | [x] |
| F9.6 | Tests unitarios de la utilidad de color | Tests | [x] |

## El punto de partida, medido

| Archivo | Naranja fijo → | Uso de marca → |
|---|---|---|
| `menu-cliente.tsx` | 17 → **5** | 5 → **11** |
| `checkout-modal.tsx` | 8 → **0** | 3 → **8** |
| `cart-sheet.tsx` | 3 → **0** | 3 → **4** |
| `order-status.tsx` | 5 → **0** | **0** → **13** |

Los 5 naranjas que quedan son el aviso ámbar de cambios en el carrito.

## Decisiones

### El color semántico no es marca

El verde de "listo" y el rojo de "cancelado" **no se tocaron**, y es deliberado: son significado, no
identidad. Un local con marca roja no puede hacer que "pedido listo" se vea como "pedido rechazado".
Lo mismo con el ámbar del aviso de cambios de precio: una advertencia tiene que verse como
advertencia en todos los locales.

### El problema real no era el color, era el contraste

Cambiar naranja por `var(--brand)` a secas habría movido el bug en vez de arreglarlo: un local que
eligiera amarillo tendría botones con texto blanco invisible. Por eso la base de la fase es
`src/lib/color.ts`, con las fórmulas de contraste de la WCAG 2.1, y **dos variables derivadas**:

- **`--brand-texto`** — blanco o casi negro, el que se lea encima de la marca. Botón amarillo → texto
  oscuro; azul marino → texto blanco.
- **`--accent-legible`** — el acento oscurecido lo justo para leerse sobre blanco, **conservando su
  tono**. Para los precios no sirve elegir entre blanco y negro: hay que respetar el color del dueño
  y solo bajarle el brillo.

### La pantalla de seguimiento no podía pintarse ni queriendo

`order-status.tsx` no solo tenía 0 usos de las variables: se renderiza con un `return` temprano
**antes** del div que las definía, así que ahí no existían. Se movió la definición al Server
Component, envolviendo todo el flujo con `display: contents` — las variables heredan por el árbol sin
agregar una caja que altere el layout, y se calculan en el servidor, sin parpadeo al hidratar.

### El editor avisa, no prohíbe

`/dashboard/config` muestra el contraste real de cada color y una vista previa con el botón y los
precios como se van a ver. **No bloquea el guardado**: es la marca del dueño y la decisión es suya;
el sistema se limita a hacerla legible.

El aviso es **informativo (ℹ gris) y no una advertencia ámbar**, a propósito: el naranja por defecto
contrasta 2,8:1, así que una alerta aparecería en casi todos los locales sin que nadie haya tocado
nada — y una alerta que sale siempre es una alerta que nadie lee. No hay nada que corregir: el
sistema ya lo corrigió.

## El bug que encontró la revisión

Yo afirmé que el texto elegido **siempre** superaba AA, y mi test lo "confirmaba" con 8 colores.
El subagente del editor lo puso en duda: dijo que hay una franja de tonos medios donde ninguna de las
dos opciones llega.

**Tenía razón.** Un barrido sobre todo el cubo RGB encontró el peor caso: **`#8c5aff` con 4,18:1**,
por debajo del mínimo de 4,5. El test pasaba solo porque mis ocho colores de muestra no caían en esa
franja.

La causa: el texto oscuro del sistema es `#1c1917`, no negro puro. `textoSobre` ahora intenta primero
con la pareja suave y, si ninguna llega a AA, **escala a blanco o negro puros**, que sí cruzan el
umbral. Y el test dejó de ser una muestra: **barre el cubo RGB completo** (140.000+ colores), así que
la garantía es una propiedad verificada y no una suposición sobre los colores que a alguien se le
ocurrió probar.

## Verificación

- `npm test` **65/65** (58 + 7). Los de color son los **primeros tests puros del repo**: corren en
  ~400 ms contra el minuto que tardan los de integración.
- `tsc` y `build` limpios.
- **`npm run lint` sin errores en todo el repo, por primera vez**: se eliminaron de paso tres `as any`
  innecesarios en `tests/rls-aislamiento.test.ts` (`slug`, `activo` y `total` son columnas válidas en
  los tipos; lo que la base rechaza son los privilegios de columna, que TypeScript no modela).

## Pendiente

La revisión visual con ojos humanos. Todo está verificado por tipos, tests y conteo de hardcodes,
pero **nadie vio estas pantallas pintadas con un color que no sea naranja**. La prueba concreta:
poner un azul o un verde en `/dashboard/config` de Catire Kaffe y recorrer menú → carrito → checkout →
seguimiento.
