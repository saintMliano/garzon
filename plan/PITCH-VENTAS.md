# Pitch de ventas — Garzón Digital

Material para vender lo que **existe hoy**, no lo que está en el roadmap. Todo lo que está acá se
puede mostrar funcionando en un teléfono; lo que no, está en la sección de lo que el software **no**
hace, que es tan importante como la otra.

> **Regla que sostiene todo:** cada promesa de este documento se puede demostrar en vivo en menos de
> tres minutos. Una promesa que no se puede demostrar no es un argumento de venta, es una deuda que
> se cobra sola en la primera semana de uso.

---

## 1. Tres cosas que hay que tener claras antes de tocar el timbre

**Nadie lo está usando todavía.** Cero locales en operación real. No hay que esconderlo ni
inventar clientes: hay que convertirlo en la oferta. *"Estoy eligiendo cinco locales para arrancar;
te lo instalo y lo probás una semana completa, gratis, conmigo al lado."* Un dueño de fuente de soda
prefiere ser el primero y que lo atiendan bien, antes que ser el número 400 de un sistema donde
nadie le contesta el teléfono.

**Los datos de la demo son simulados.** "Fuente de Soda El Lalo" tiene un año de historia sembrada
para que los reportes se vean como se ven en un negocio andando. Sirve muchísimo para mostrar la
pantalla — **y hay que decir que es una demo**. Si un dueño llega a creer que son ventas reales de
otro cliente y después se entera, se perdió mucho más que una venta.

**La plata no pasa por acá.** Es una decisión de producto, no una carencia. El local cobra en su
caja, con su boleta, como siempre. Eso saca de la conversación al SII, a la retención de fondos de
terceros y a las comisiones — y saca también la objeción más grande que tienen los POS con
comisión por venta.

---

## 2. El pitch de 60 segundos

> "Hola, soy Emilio. Hice un sistema chileno para que tus clientes pidan desde la mesa con su
> teléfono, sin esperar al garzón, y el pedido aparezca al instante en la pantalla de la cocina.
>
> No toco tu plata: vos seguís cobrando en tu caja con tu boleta. No cobro comisión por venta.
>
> ¿Tenés dos minutos? Escaneá este QR con tu teléfono y hacé un pedido de prueba — mirá la pantalla."

Y ahí se calla y deja que la pantalla suene. **La demo vende, el discurso no.**

---

## 3. Lo que el software hace hoy

Todo lo de esta tabla está construido, probado y se puede mostrar.

### Para el comensal

| Función | Qué significa en la mesa |
|---|---|
| Carta por QR, sin app ni registro | Escanea y ve la carta. No descarga nada, no crea cuenta, no da su teléfono. |
| Fotos, descripción y precio por producto | La carta vende: un producto con foto se pide más que una línea de texto. |
| Buscador y categorías | En una carta de 59 productos, encontrar "papas" toma un segundo. |
| La mesa viene en el QR | Cada mesa tiene su propio código; el pedido llega ya identificado. |
| Propina sugerida (5/10/15/20 % y barra) | Sugerencia sobre el total. **La cobra el local en su caja**, no la plataforma. |
| Pantalla de seguimiento | El comensal ve si su pedido fue aceptado, si está en cocina o si está listo. |
| El carrito se corrige solo | Si cambió un precio o se agotó algo mientras miraba la carta, se lo dice con nombre y monto. Nunca hay sorpresa al confirmar. |
| Si se corta la señal, no se duplica | Reintentar el envío devuelve el mismo pedido. La cocina no recibe dos platos iguales. |

### Para el equipo del local

| Función | Qué significa en el turno |
|---|---|
| Cada persona con su cuenta | El dueño crea la cuenta de su garzón desde el panel. No se comparte una sola clave. |
| Dos roles: dueño y personal | El personal ve y despacha los pedidos. **No ve la caja ni puede cambiar precios.** |
| El garzón toma el pedido en su celular | Pantalla aparte, pensada para marcar rápido: mesa, grilla de productos, enviar. |
| "Frecuentes" | Los productos más vendidos del local, primeros. En una fuente de soda son casi todo el servicio. |
| "Se acabó" desde la mesa | El garzón agota un producto en el momento en que se entera, sin pedirle al dueño que entre al menú. |
| Queda registrado quién tomó cada pedido | Para cuando hay un reclamo y hace falta saber qué pasó. |

Lo importante para el dueño: **los permisos los hace cumplir la base de datos, no la pantalla**. No
es que al garzón se le escondan los botones — es que si intenta llegar a los reportes por otro
camino, el servidor le dice que no.

### Para la cocina

| Función | Qué significa en el turno |
|---|---|
| Tablero en tiempo real | Cuatro columnas: nuevos, aceptados, listos, entregados. El pedido aparece solo. |
| Sonido al entrar un pedido | Y un aviso permanente si el sonido quedó apagado, porque una tablet muteada es una cocina ciega. |
| Sigue funcionando sin WebSocket | Si el wifi del local bloquea la conexión en vivo, refresca igual. La pantalla nunca se queda pegada. |
| Deshacer una entrega | Un toque accidental se revierte; el pedido vuelve a la pantalla. |
| Historial del día | Los pedidos cerrados quedan a la vista para revisarlos. |

### Para el dueño

| Función | Qué significa para el negocio |
|---|---|
| Reportes por rango de fechas | Pedidos, venta, ticket promedio, y los productos que más se venden. |
| Gráfico por día y por mes | Un mes o un año completo, sin abrir Excel. |
| Tiempos reales de cocina | Cuánto se demora en aceptar, en tener listo y en entregar (medianas, no promedios). |
| Propinas en su propia línea | Separadas de la venta, porque son plata del personal y no del local. |
| Exportar a CSV | Para el contador, sin pedírselo a nadie. |
| Se administra solo | Cambiar precios, agotar un producto, subir fotos, cambiar logo y colores: todo desde su panel, sin llamarme. |
| Su marca, no la mía | Logo y colores del local en toda la carta. El sistema valida que el texto se lea sobre el color elegido. |

### Por debajo, aunque no se venda con esto

- El **total lo calcula el servidor**, no el teléfono del cliente: nadie puede editar precios desde
  el navegador.
- Cada local está **aislado por la base de datos**, no por un filtro en pantalla.
- **91 pruebas automáticas** corren antes de cada cambio.

---

## 4. Lo que NO hace

Conviene decirlo antes de que lo pregunten. Un "eso no lo hace, todavía" dicho de entrada compra
más confianza que un "sí, claro" que se descubre en la segunda semana.

- **No cobra en línea ni emite boletas.** No se integra con el SII. El local cobra en su caja.
- **No se conecta con la caja registradora ni con un POS existente.**
- **No imprime comandas** en impresora térmica. La cocina mira una pantalla (tablet, notebook o
  celular).
- **No lleva inventario ni descuenta stock.** "Agotar un producto" es un botón manual.
- **No hace delivery** ni se integra con Rappi, PedidosYa ni Uber Eats.
- **No maneja cuenta abierta por mesa ni divide la cuenta.** Cada pedido es un pedido.
- **No tiene reservas, fidelización ni cupones.**
- **No funciona sin internet**, ni el local ni el comensal.
- **Todavía no hay dominio propio por local.** La carta vive en una dirección de Garzón Digital.
- **No manda notificaciones al teléfono** cuando el pedido está listo: el comensal lo ve si tiene la
  pantalla de seguimiento abierta.

---

## 5. Precio

**Un solo plan. $29.900 al mes por local. Sin comisión por venta.**

- **$249.900 al año** — dos meses gratis.
- **Sin contrato de permanencia.** Se cancela cuando quiera.
- **Una semana de prueba gratis** — siete días, con su fin de semana adentro. Y si después se
  atrasa un pago hay **7 días más** antes de que se pausen los pedidos: nunca se corta el servicio
  en medio de un servicio.
- **Kit de inicio $15.000** (carta cargada por nosotros + 10 a 15 QR para las mesas). **Gratis con
  el plan anual.**

El argumento de precio, dicho corto: *"Los sistemas con comisión te cobran entre 2 % y 5 % de todo
lo que vendas. Si vendés cinco millones al mes, eso son entre 100 y 250 mil pesos. Acá pagás
$29.900 vendas lo que vendas."*

---

## 6. Objeciones, con respuesta honesta

**"¿Y si se cae el sistema en pleno mediodía?"**
Se sigue atendiendo como siempre: la carta impresa y el garzón no desaparecen. El sistema no
reemplaza a nadie, saca la parte más lenta. Y la cocina no depende de la conexión en vivo: si se
corta, refresca igual.

**"Mis clientes son viejos, no van a saber usarlo."**
Ninguno tiene que usarlo. Conviven: quien quiere pedir del teléfono lo hace, quien quiere llamar al
garzón lo llama. Donde más se nota es en la mesa que ya sabe qué quiere y espera diez minutos a que
la miren.

**"¿Quién más lo usa?"**
Nadie todavía; estoy eligiendo los primeros cinco locales. Por eso la prueba es gratis y por eso te
acompaño la primera semana en persona. Cuando tenga cien clientes ya no voy a poder hacer eso.

**"¿Una semana es muy poco para probarlo?"**
Una semana es un ciclo completo de tu local: tu lunes flojo y tu sábado lleno. Si en siete días con
tu fin de semana adentro no viste la diferencia, un mes no te la iba a mostrar tampoco. Y si
necesitás unos días más porque justo tuviste una semana rara, me decís y te los doy.

**"¿Y si quiero irme?"**
Te vas. No hay permanencia y tus datos son tuyos: los reportes se exportan a CSV cuando quieras,
incluso si dejaste de pagar.

**"¿Se queda con parte de la propina?"**
No. La propina es una sugerencia que aparece en la comanda; la cobrás vos en tu caja. Por acá no
pasa un peso.

**"Ya tengo Instagram con la carta."**
La carta en Instagram muestra; esta toma el pedido y lo manda a la cocina. Y cuando cambia un
precio, se cambia en un lugar y ya está — no hay que rehacer una imagen.

---

## 7. La demo en vivo, en tres minutos

1. **Que escanee él.** Su teléfono, su mano. Que vea la carta cargar.
2. **Que agregue dos cosas y confirme** con su nombre. Ahí aparece la propina sugerida: se toca "sin
   propina" para mostrar que baja a cero de un toque.
3. **Girar la pantalla de la cocina.** El pedido ya está ahí, y sonó.
4. **Aceptar y marcar listo** delante de él, y que mire cómo cambia su propio teléfono.
5. **Abrir los reportes de la demo** — diciendo que son datos de demostración — para que vea la
   forma que va a tener su información en un mes.

---

## 8. Lo que sabés vos y no va en el pitch

Notas internas. No son para el cliente, pero conviene tenerlas presentes al prometer.

- **Nada de esto lo usó una persona real todavía.** Ni la carta en un celular sobre 4G dentro de un
  local con muros. Es el riesgo más grande que queda y solo se cierra instalando el primer piloto.
- **El menú se midió desde fibra**, no desde 4G: la consulta de la carta baja de 385 ms a 185 ms tras
  el cambio a Server Component. Es la consulta, no la pantalla completa. **No prometas segundos de
  carga**: prometé que se ve rápido y dejá que lo compruebe en su propio teléfono.
- **La cuenta de Supabase está en plan gratis**, y los proyectos gratuitos se pausan por inactividad.
  Hay que pasar a Pro **antes** de instalar el primer QR real.
- **La credencial demo de Catire Kaffe es genérica** y hay que rotarla antes de mostrarla a alguien.
- **Catire Kaffe tiene 59 productos y 0 fotos.** Una carta sin fotos se ve mucho peor de lo que el
  sistema puede verse.
- **Falta protección anti-abuso en el checkout** (decisión pendiente, en `F8-CONFIANZA.md`). Con
  pocos locales no es un problema; con veinte, sí.
- **Los tiempos de cocina de la demo (1 min 45 s / 14 min / 17 min) son simulados.** No los cites
  como rendimiento real de nadie.
