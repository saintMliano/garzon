# Teléfono del comensal en el checkout — plan de implementación

Agregar el teléfono al pedido para que la cocina pueda contactar a quien pidió **para retiro**, y
dejar planteada la base para un futuro plan de fidelización.

> **Advertencia de alcance.** No soy abogado y esto no es asesoría legal. Es un diseño técnico
> alineado con lo que la ley chilena exige, más la lista de lo que hay que decidir y documentar.
> Antes del primer cliente pagado, un abogado tiene que revisar dos cosas concretas: el **contrato
> de encargo de tratamiento** con el local y la **política de privacidad** pública.

---

## 1. Lo que este cambio significa de verdad

Hoy la base guarda, por pedido, un **nombre de pila** y una **mesa**. Eso no identifica a nadie: hay
cientos de "Juan" en la Mesa 3. La plataforma es, en la práctica, anónima.

Un teléfono **sí identifica a una persona**, es único, es permanente y es el dato con el que se la
puede contactar. Con este cambio, Garzón Digital pasa de no tener datos personales a administrar
**una base de datos de teléfonos de miles de comensales, de varios locales a la vez**. Ese cambio de
categoría es el punto entero de este documento: no es un campo más en un formulario.

Y llega en el peor momento posible para improvisar: la **Ley 21.719**, que reemplaza al régimen
actual y crea una Agencia de Protección de Datos Personales con facultad de multar, entra en
vigencia en **diciembre de 2026** — es decir, aproximadamente cuando estarías instalando tus
primeros clientes pagados. *(Confirmar la fecha exacta de entrada en vigencia con un abogado.)*

---

## 2. Decisiones del dueño del producto (2026-08-19)

| # | Decisión | Resuelto |
|---|---|---|
| D1 | Verificación | **Solo formato.** Sin SMS. Más botón de WhatsApp en cocina. |
| D2 | Cuándo se pide | **Obligatorio en retiro, opcional en mesa.** |
| D3 | Conservación | **Dos ciclos de vida separados.** Ver §5 — no es "guardarlo y ya". |
| D4 | CSV de reportes | **No lo incluye.** |
| D5 | Formato | **Solo móvil chileno**, `+56 9 XXXX XXXX`. |
| D6 | Respaldo | **Se acepta el teléfono en el respaldo**, con el archivo protegido (§4.3). |
| D7 | Base demo | **Sin teléfonos.** Los 7.900 pedidos sembrados quedan en `NULL`. |

---

## 3. Diseño técnico

### 3.1 Base de datos

```sql
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'mesa'
  CHECK (tipo_entrega IN ('mesa', 'retiro'));

-- Se guarda SIEMPRE en E.164. Un solo formato en la base evita que el mismo
-- número aparezca escrito de cuatro maneras y sea imposible de borrar después.
ALTER TABLE pedidos ADD CONSTRAINT pedidos_telefono_valido
  CHECK (telefono IS NULL OR telefono ~ '^\+569[0-9]{8}$');
```

- **El staff no puede escribir `telefono`.** Igual que `total` y `propina`: sin `GRANT UPDATE`, se
  escribe solo desde `crear_pedido`. Sí puede leerlo (es el punto).
- **Sin índice.** No se busca por teléfono; buscarlo rápido no es una función deseable acá.

**Nota sobre `tipo_entrega`:** hoy "Para llevar" es apenas texto libre en la columna `mesa`. Colgar
una regla de negocio de una cadena de texto es frágil; el campo propio además le sirve a la cocina
para agrupar los retiros.

### 3.2 El campo en el formulario

El `+56` es **fijo, impreso en el campo**, no editable y no tipeable. El comensal escribe **9
dígitos empezando por 9**:

```
┌───────┬─────────────────────────────┐
│  +56  │  9 1234 5678                │
└───────┴─────────────────────────────┘
    ↑ prefijo fijo, no es un input
```

- `inputMode="numeric"` y `autoComplete="tel-national"`: teclado numérico en el celular y
  autocompletado del navegador.
- Se formatea mientras escribe (`9 1234 5678`) y se descartan los no-dígitos al vuelo, así que pegar
  `+56 9 1234 5678` desde los contactos funciona: se detecta el `56` inicial y se ignora.
- Tope duro de 9 dígitos.
- Validación en vivo, pero el error aparece **al salir del campo**, no en la primera tecla. Un error
  rojo mientras alguien todavía escribe es hostil.
- Se guarda en E.164: `+56912345678`.

**Sin bloquear números "sospechosos"** tipo `999999999`. Bloquearlos rechaza pedidos reales por un
beneficio nulo: quien quiere dar un número falso lo va a dar igual.

**Doble validación, como todo en este proyecto:** el navegador valida para dar un mensaje útil, y
`crear_pedido` valida de nuevo porque el navegador no decide. Diferencia importante: el servidor
**no debe rechazar el pedido completo** por un teléfono raro si el pedido es válido en todo lo
demás — normaliza, y si no puede, guarda `NULL`. Perder una venta real por un número mal escrito es
peor que no poder llamar.

### 3.3 En la cocina: llamar y WhatsApp

En los pedidos de **retiro**, tras un toque en "Contactar":

- **Llamar** → `tel:+56912345678`
- **WhatsApp** → `https://wa.me/56912345678?text=<mensaje>`

El mensaje va pre-escrito y editable, con el nombre del local y el número de pedido:

> Hola Juan 👋 Tu pedido #14 de Fuente de Soda El Lalo ya está listo para retirar.

**Por qué `wa.me` y no una API de WhatsApp:** el link abre el WhatsApp **del propio local**, con su
número, y **una persona aprieta enviar**. No hay proveedor de mensajería de por medio, no hay
sub-encargado nuevo, no hay costo por mensaje, y Garzón Digital no transmite nada — solo arma un
enlace. Es la opción más simple y también la más limpia legalmente. Una API de WhatsApp Business
metería un tercero en la cadena y obligaría a rehacer el análisis de datos.

**El teléfono no se muestra en la tarjeta del Kanban**: va detrás del toque. La pantalla de cocina
suele estar a la vista del público, y no corresponde tener teléfonos de clientes expuestos todo el
turno frente al mesón.

**No entra al CSV** (D4). Un CSV termina en un WhatsApp o en un correo, y ahí se pierde todo control.

### 3.4 Borrado automático del teléfono operativo

```sql
-- Corre a diario (pg_cron). El pedido se conserva para los reportes; lo que
-- desaparece es el dato personal adherido al pedido.
UPDATE pedidos
   SET telefono = NULL
 WHERE telefono IS NOT NULL
   AND estado IN ('entregado', 'cancelado')
   AND updated_at < now() - interval '7 days';
```

Esto **no** contradice el plan de fidelización: quien acepte estar en la lista de contactos del
local queda en otra tabla, con otra base legal y otro ciclo de vida (§5). Son dos cosas distintas
que casualmente empiezan por el mismo número.

---

## 4. Tratamiento de datos personales (legislación chilena)

### 4.1 Qué ley aplica

- **Ley 19.628**, sobre protección de la vida privada, es la vigente hoy.
- **Ley 21.719** la reemplaza y entra en vigencia en **diciembre de 2026**. Crea la **Agencia de
  Protección de Datos Personales**, con facultades de fiscalización y multas de hasta **20.000 UTM**
  para infracciones gravísimas (del orden de mil millones de pesos).
- Para el envío de publicidad se suma la **Ley 19.496** del consumidor (SERNAC): toda comunicación
  comercial debe identificar al remitente y ofrecer una forma de pedir que paren.

Para un local pequeño el riesgo práctico no es la multa máxima: es que **por primera vez existe un
lugar donde un comensal puede reclamar** y alguien tiene que responder.

### 4.2 Quién es quién

- **El local es el responsable** del tratamiento: es quien decide para qué quiere el teléfono.
- **Garzón Digital es el encargado**: procesa por cuenta del local.
- **Supabase (y AWS) son sub-encargados.**

Esto define **quién responde ante el comensal**, y exige un **contrato de encargo** por escrito con
cada local — cláusulas dentro del contrato de servicio, no un documento aparte. Mínimo:

- que tratas los datos **solo** siguiendo instrucciones del local y para la finalidad del servicio;
- que **no los usas para nada propio**: nada de marketing de la plataforma, nada de vender datos,
  **nada de cruzar información entre locales**;
- las medidas de seguridad concretas (§4.4);
- que hay **sub-encargados** y cuáles son (Supabase/AWS), con su ubicación;
- que le **avisas al local sin demora** si hay una filtración;
- qué pasa al terminar el contrato: **borras o devuelves** los datos;
- que el local puede auditarte;
- **una cláusula preparada para fidelización** (§5.4), aunque la función todavía no exista.

### 4.3 Dónde viven los datos

**El proyecto de Supabase está en `us-east-2`, es decir en Ohio, Estados Unidos.** Verificado contra
la cuenta real.

Con nombres de pila da lo mismo. Con teléfonos, **todo dato personal de los comensales chilenos
queda almacenado en Estados Unidos**, y eso es una transferencia internacional. La Ley 21.719 la
permite, pero exige una base: adecuación, garantías contractuales (cláusulas tipo) o una excepción.
Estados Unidos no tiene declaración de adecuación de Chile.

1. **Declararlo** en la política de privacidad y en el contrato. Ocultarlo es el error caro.
2. **Preguntarle al abogado** qué instrumento corresponde.
3. **Cambiar de región no resuelve lo legal** — no hay región Supabase en Chile, y São Paulo sigue
   siendo internacional. Sí ayudaría a la latencia, pero **exige recrear el proyecto**: si alguna
   vez se hace, es antes del primer cliente, no después.

**El respaldo local (D6).** `npm run db:backup` escribe un JSON en texto plano en el notebook.
Verificado: el repositorio **no** está dentro de OneDrive y `backups/` está en `.gitignore`, así que
hoy no se sincroniza ni se sube a GitHub. Lo que falta, si el respaldo va a contener teléfonos:

- **no mover el proyecto** a una carpeta sincronizada (OneDrive, Drive, Dropbox);
- **cifrar el disco** con BitLocker — es una casilla en Windows y cubre el caso realista: notebook
  robado o perdido;
- **rotar los respaldos**: hoy hay cinco acumulados, dos de ellos truncados e inútiles. Que el
  script conserve los últimos 3 y borre el resto;
- **no mandarlos por correo ni WhatsApp**, nunca.

### 4.4 Controles, mapeados a lo que exige la ley

| Principio | Qué se hace en concreto |
|---|---|
| **Licitud** | Base legal = ejecución del contrato (pedido de retiro). Para fidelización, consentimiento aparte (§5). |
| **Finalidad** | El teléfono del pedido se usa **solo** para ese pedido. |
| **Proporcionalidad** | Solo teléfono, obligatorio solo en retiro. Nada de correo, RUT ni dirección. |
| **Calidad** | Validación de formato y normalización a E.164. |
| **Conservación limitada** | Borrado automático a los 7 días (§3.4). |
| **Seguridad** | HTTPS; RLS por local; `service-role` solo en el servidor; sin `GRANT UPDATE` al staff; teléfono oculto tras un toque; **nunca en URLs, logs ni mensajes de error**. |
| **Transparencia** | Aviso corto junto al campo + política de privacidad pública (hoy **no existe**). |
| **Derechos (ARCOP)** | Acceder, rectificar, suprimir, oponerse, portar. Ver §4.5. |
| **Confidencialidad** | Deber de secreto en el contrato. |

### 4.5 Derechos del comensal, en la práctica

El comensal los ejerce **ante el local** (responsable), y tú le das la herramienta:

- función en el panel para **buscar por teléfono dentro de un local y borrarlo**, incluyendo su
  eventual inscripción de fidelización;
- plazo de respuesta comprometido en el contrato;
- el borrado a 7 días hace que, en la mayoría de los casos, la respuesta sea "ya no lo tenemos".

**La mejor forma de responder una solicitud de borrado es no tener el dato.**

### 4.6 Aviso en el checkout

> Lo usamos solo para avisarte cuando tu pedido esté listo. Lo ve únicamente este local y se borra a
> los 7 días. [Cómo tratamos tus datos]

---

## 5. Fidelización y promociones (fase futura, planteada ahora)

**La pregunta era si se pueden guardar "sencillamente" para marketing. La respuesta honesta es no —
pero sí se puede hacer, y bien, con un poco más de diseño.**

### 5.1 Por qué no "sencillamente"

Un teléfono que el comensal entregó **para que le avisen que su pedido está listo** no puede después
usarse para mandarle promociones. Eso es un **cambio de finalidad**, y es la infracción más común y
más sancionada en protección de datos, en todas las jurisdicciones. No es un tecnicismo: es la
diferencia entre un negocio serio y uno que hace spam.

Hay además una razón puramente práctica, que suele doler antes que la legal: **WhatsApp banea
números que mandan promociones no solicitadas.** Si el local usa su WhatsApp de siempre para mandar
ofertas a 400 personas que no las pidieron, pierde el WhatsApp con el que atiende a todo el mundo. Y
quien se lo recomendó fuiste tú.

### 5.2 Cómo sí

**Dos ciclos de vida separados, desde el primer día:**

| | Teléfono del pedido | Contacto de fidelización |
|---|---|---|
| Dónde vive | `pedidos.telefono` | tabla nueva `contactos_local` |
| Base legal | Ejecución del contrato | **Consentimiento** explícito |
| Cómo se obtiene | Se pide en retiro | Casilla **desmarcada** y opcional |
| Cuánto dura | 7 días | Hasta que la persona se dé de baja |
| Para qué | Avisar de *ese* pedido | Promociones de *ese* local |

La casilla, debajo del teléfono, desmarcada:

> ☐ Quiero recibir las promociones de Fuente de Soda El Lalo por WhatsApp.

Reglas que no se negocian:

- **Desmarcada por defecto.** Una casilla premarcada no es consentimiento.
- **El pedido funciona igual si no la marca.** No se puede condicionar el servicio.
- **Se guarda la prueba**: qué local, qué número, cuándo, y **el texto exacto** que se le mostró. La
  carga de probar el consentimiento es del responsable, y sin el texto no se prueba nada.
- **Baja fácil y siempre disponible**, y todo mensaje comercial debe decir cómo darse de baja
  (Ley 19.496).
- **La lista es del local, no de la plataforma.** Nunca se cruza entre locales. Esto ya lo garantiza
  la RLS y así tiene que seguir.

### 5.3 Esbozo de la tabla

```sql
CREATE TABLE contactos_local (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id      uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  telefono      text NOT NULL,
  nombre        text,
  consentido_en timestamptz NOT NULL DEFAULT now(),
  texto_consentimiento text NOT NULL,   -- la prueba de QUÉ aceptó
  baja_en       timestamptz,            -- NULL = activo
  UNIQUE (local_id, telefono)
);
```

Con RLS por `local_id`, como todo lo demás.

### 5.4 Qué hacer **ahora** aunque la función sea futura

1. **La cláusula en el contrato** con el local: quién es responsable de la lista, que la plataforma
   no la usa para sí, y que no se cruza entre locales.
2. **La política de privacidad** menciona la finalidad de fidelización como **opcional y basada en
   consentimiento**, aunque todavía no exista el botón.
3. **No adelantarse recolectando.** Guardar teléfonos hoy "para cuando exista fidelización" es
   exactamente el cambio de finalidad que hay que evitar. La lista empieza el día que exista la
   casilla, con la gente que la marque desde ese día. Empezar limpio cuesta unos meses de lista más
   corta y ahorra el único problema que después no se puede arreglar.

**Y un argumento de venta que sale gratis de hacerlo bien:** *"la lista de clientes es tuya, no mía
— y la armaste con gente que dijo que sí"*. Es exactamente lo contrario de lo que ofrecen las apps
de delivery, que se quedan con el cliente.

---

## 6. Tareas

| # | Tarea | Tipo | Depende de |
|---|-------|------|-----------|
| T1 | Migración: `telefono`, `tipo_entrega`, CHECK, sin GRANT UPDATE al staff | SQL | **[x]** |
| T2 | `crear_pedido` v9: normaliza y valida; `NULL` si no puede; nunca tumba el pedido | SQL | **[x]** |
| T3 | `normalizarTelefonoChileno()` + tests unitarios de casos borde | TS | **[x]** |
| T4 | Checkout: campo con `+56` fijo, formateo en vivo, obligatorio en retiro, aviso de privacidad | TS | **[x]** |
| T5 | Cocina: "Contactar" con llamar y WhatsApp (`wa.me` + mensaje pre-escrito), solo en retiros | TS | **[x]** |
| T6 | Borrado automático a los 7 días (`pg_cron`) + test que compruebe que borra | SQL | **[x]** |
| T7 | Respaldo: rotación (conservar 3) y limpieza de los truncados; seeder demo con `telefono NULL` | Scripts | **[x]** |
| T8 | Búsqueda y borrado por teléfono en el panel de super-admin | TS | **pendiente** |
| T9 | Página `/privacidad` + enlace desde checkout y landing | TS | **[x]** (borrador, falta abogado) |
| T10 | Tests: aislamiento, que no se filtre por `get_order_status`, que el staff no lo escriba, que no salga en el CSV | Tests | **[x]** |
| — | **Cláusulas de encargo y revisión legal** | Fuera del código | abogado |
| — | **Fase futura: fidelización** (§5) | — | T1-T10 |

### Estado (2026-08-19)

**T1 a T7, T9 y T10 implementadas y mergeadas.** Queda T8 (búsqueda y borrado por teléfono desde el
panel), que es la herramienta para responder una solicitud de supresión — hoy la cubre parcialmente
el borrado automático a los 7 días, pero hay que construirla antes de tener volumen real.

Dos cosas que aparecieron al implementar y que el plan no anticipaba:

1. **`pg_cron` no estaba habilitado en el proyecto.** La primera migración creó
   `borrar_telefonos_antiguos()` e intentó agendarla; el intento cayó en su manejador de excepciones
   y la función quedó existiendo sin que nadie la llamara. Es decir: la promesa de "se borra a los 7
   días" habría sido falsa mientras la política de privacidad la afirmaba. Se resolvió con una
   segunda migración que habilita la extensión y agenda la tarea; verificado contra `cron.job`.
2. **El borrado se hace por EDAD y no por estado.** La versión del plan solo tocaba pedidos
   entregados o cancelados, lo que dejaba vivos para siempre los teléfonos de pedidos abandonados en
   `nuevo` o `preparando` — justo los que nadie revisa. Ahora ningún teléfono sobrevive los 7 días,
   pase lo que pase con el pedido.

Orden: T1→T2→T3→T4→T5 entregan la función completa; T6→T7→T10 la dejan defendible; T8 y T9 son
requisito antes de que exista el **primer teléfono real de un cliente que no seas tú**.

## 7. Lo que NO haría

- **Verificación por SMS.**
- **Pedirlo a todos como obligatorio**: rompe la minimización y debilita la base legal.
- **Guardar el teléfono del pedido indefinidamente** "por si algún día hay fidelización" (§5.4).
- **Un buscador por teléfono para el staff.** Ver "todos los pedidos de este número" es perfilamiento
  de clientes: otra finalidad, otra base legal.
- **Reutilizar contactos entre locales.** Sería el peor incumplimiento posible, y la RLS ya lo
  impide: que siga así.
