# Imprimir comandas — decisión: postergado

**Estado:** ⏸ **Postergado a propósito, no olvidado.** Decisión del dueño, 2026-08-20.
**Se retoma:** cuando haya un cliente real que lo pida, con su impresora a la vista.

---

## Por qué no se construye ahora

El diseño del ticket, el manejo de errores y hasta la codificación de caracteres
dependen del modelo concreto. Construirlo sin una impresora enfrente es adivinar,
y lo más probable es adivinar mal.

Hoy además aporta poco: el producto **ya exige una pantalla en la cocina** para el
Kanban, así que el local ve el pedido igual. `plan/PITCH-VENTAS.md` lo declara
como límite ("no imprime comandas en impresora térmica") y esa línea **se queda
ahí** hasta que exista de verdad.

---

## Lo que ya se investigó, para no repetirlo

### No son impresoras láser

Los locales usan **térmicas de 80mm** (Epson TM-T20/T88, Star TSP100, y genéricas
tipo XPrinter/POS-80) o **matriz de punto** (Epson TM-U220) en la cocina caliente
—el papel térmico se ennegrece con el calor de la plancha y la grasa—. La láser de
la oficina no sirve: hoja carta, lenta, sin cortador.

### El obstáculo de fondo

Un navegador **no puede abrir un socket TCP ni mandar bytes crudos por USB**, y
aunque pudiera, la impresora vive dentro de la red del local y el servidor está en
la nube: no la alcanza.

### Los cuatro caminos, y cuál queda

| Camino | Veredicto |
|---|---|
| **`window.print()` + CSS de 80mm** | ✅ **El elegido cuando se retome** |
| Impresora que consulta la nube (Star CloudPRNT, Epson Server Direct) | ❌ Descartado — ver abajo |
| Nube de impresoras chinas (Feie y similares) | ❌ Descartado — ver abajo |
| Agente local instalado en un PC | ❌ Solo si un cliente ya tiene su parque y no lo va a cambiar |
| WebUSB / Web Bluetooth | ❌ Solo Chrome, y en Windows hay que cambiar el driver a mano |

### Por qué `window.print()` y no CloudPRNT

**Imprimiendo por el sistema operativo, el problema de "cada impresora es
distinta" deja de ser nuestro.** Todo el lío de ESC/POS —comandos de corte
distintos, tablas de caracteres, la "ñ" que sale como basura— existe solo si
mandamos los bytes nosotros. Con `window.print()` habla el **driver**, que lo
escribió el fabricante: nosotros mandamos HTML y nos olvidamos del modelo.

Eso es **más genérico que CloudPRNT**, no menos: sirve con cualquier térmica que
tenga driver, de cualquier marca.

Y el costo marginal es casi cero: **el dispositivo ya está en la cocina** para el
Kanban. El cliente compra una térmica genérica y nada más — contra una CloudPRNT,
varias veces más barato y sin aparatos nuevos.

- **CloudPRNT es propietario de Star** (Epson tiene su equivalente, igual de
  cerrado). Vive en el firmware: no existe la impresora china que lo hable. Era la
  respuesta correcta para una app web *sin* dispositivo en el local — y nosotros
  sí tenemos uno.
- **Las nubes chinas baratas** (Feie y parecidas) sí imprimen desde internet, pero
  **la nube es de ellos**: las comandas viajarían a un servidor de un tercero no
  contratado, con documentación en chino y latencia desde Chile sin medir. Con una
  política de privacidad publicada, meter ese salto en el camino del pedido no
  compensa lo que ahorra.

---

## Qué especificar el día que se venda

**Un requisito, no un modelo:** *"cualquier impresora térmica de 80mm con driver
para Windows"*. El cliente la compra donde quiera y a precio local, y nosotros no
entramos en el negocio de importar, tener stock y responder garantías — que es
otro negocio, con peores márgenes.

Si se quiere "llave en mano", la versión intermedia es **recomendar uno o dos
modelos que se consigan fácil en Chile** y certificar contra esos: se gana la
prueba sin cargar el inventario.

---

## Dos trampas para cuando se implemente

1. **Va a imprimir dos veces.** Es el mismo problema que la idempotencia de F8. La
   pantalla de cocina se refresca y se reconecta sola por diseño, así que
   reimprimiría todo lo que ve. El "ya se imprimió" tiene que vivir **en la base**
   —una columna o un evento en `pedido_eventos`—, nunca en memoria del navegador,
   o la cocina termina con tres copias del mismo pedido y deja de confiar en el
   papel.

2. **La comanda NO es una boleta.** Un papelito interno para la cocina no tiene
   implicancia tributaria. Pero un impreso que *parezca* comprobante para el
   cliente —con total, con los datos del local— bordea el terreno del SII y la
   boleta electrónica, que es exactamente lo que este producto decidió **no**
   hacer (ver `CLAUDE.md`: la plata no pasa por la plataforma). La regla al
   implementar: **la comanda no lleva total y no se le entrega al comensal.**

---

## Dónde valdría más

No en la fuente de soda con una tablet en la cocina, que ya ve el pedido. Sí en:

- Cocinas con plancha donde una pantalla no aguanta el calor y la grasa.
- **Locales que ya trabajan con papel y no quieren cambiar su forma de trabajar.**
- Locales con dos estaciones: el bar imprime las bebidas, la cocina la comida.

El segundo es el argumento de venta más fuerte y no es técnico: *"tu cocina sigue
funcionando igual que hoy"*. Para un dueño tradicional que desconfía de
digitalizarse, eso baja la barrera más que cualquier función nueva.
