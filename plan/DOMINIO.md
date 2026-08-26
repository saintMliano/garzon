# Dominio propio — `garzondigital.cl`

> **Estado (2026-08-26): el dominio está EN VIVO y el correo también.** DNS delegado, Vercel
> enganchado, certificado emitido y `contacto@garzondigital.cl` recibiendo. Falta solo la Site URL
> de Supabase, que es higiene. Este archivo es la
> decisión escrita y el instructivo, para no volver a discutirlo desde cero ni buscar los valores
> en tutoriales sueltos.
>
> Verificado de punta a punta el mismo día, saltándose la caché del resolver local:
>
> ```
> https://garzondigital.cl               → 200   la landing
> https://garzondigital.cl/local/el-lalo → 200   la carta, en 0,93 s
> https://garzondigital.cl/dashboard     → 307   redirige a /login, como debe
> http://garzondigital.cl                → 308 → https
> https://www.garzondigital.cl           → 308 → https://garzondigital.cl/
> ```
>
> ```
> Registrant:   Emilio Galvez
> Creación:     2026-08-26 10:38 CLST
> Expiración:   2027-08-26 10:38 CLST   ← un año
> Nameservers:  andy.ns.cloudflare.com · karina.ns.cloudflare.com
> A del ápice:  216.198.79.1
> CNAME del www: 10a199e2e15a8bcc.vercel-dns-017.com
> ```
>
> **Al verificar, no confíes en el resolver de tu máquina.** Durante la espera queda cacheado el
> `NXDOMAIN` anterior, y sigue diciendo "no existe" mucho después de que el dominio funciona para
> todo el mundo. Pasó exactamente eso acá: `1.1.1.1`, `9.9.9.9` y OpenDNS ya devolvían la IP
> mientras `8.8.8.8` y el resolver local seguían en negativo. Para ver la realidad hay que
> preguntarle al autoritativo (`-Server andy.ns.cloudflare.com`) o fijar la IP a mano
> (`curl --resolve dominio:443:IP`).

---

## 1. Por qué este nombre

El producto **ya se llama Garzón Digital** en el `<title>`, el `manifest.json`, la imagen de
OpenGraph, el favicon, la landing y el pitch. Un dominio que no fuera la marca obligaba a explicar
la diferencia en cada conversación de venta, para siempre.

Que sea autoexplicativo es una ventaja, no un defecto: se vende puerta a puerta y por WhatsApp a
dueños de fuentes de soda, y el nombre tiene que sobrevivir a una conversación de tres minutos y
poder dictarse por teléfono sin deletrear.

**Descartados:** `garzon.cl` (tomado por *Domainer.cl*, un revendedor: sería pagar precio de reventa
por seis letras), `migarzon.cl` y `tugarzon.cl` (libres y más cortos, pero no son la marca), y
cualquier versión con tilde — un `xn--` rompe cosas en lugares difíciles de prever.

**Sin tilde en el dominio, con tilde en el texto.** "Garzón Digital" se escribe con tilde en toda
la interfaz; `garzondigital.cl` no la lleva. No es una inconsistencia, es cómo funcionan los
dominios.

---

## 2. La arquitectura elegida

```
NIC Chile  →  nameservers de Cloudflare
                    │
     Cloudflare (DNS autoritativo, gratis)
                    ├─ A / CNAME  →  Vercel              (la web, en DNS-only)
                    └─ MX + SPF + DKIM  →  Email Routing (el correo)
```

**La decisión de fondo era una sola: quién tiene el DNS.** Correo y web no compiten —son tipos de
registro distintos en la misma zona— pero **solo puede haber un proveedor autoritativo**.

Se eligió Cloudflare porque **Email Routing exige ser el DNS del dominio**: *"You must be using
Cloudflare DNS to use Email Service."* No funciona en modo parcial. Y tener
`hola@garzondigital.cl` importa hoy, para vender.

### Lo que cuesta esa elección

**Se pierde el comodín automático.** Vercel exige *sus* nameservers para emitir un certificado de
`*.garzondigital.cl`. Con el DNS en Cloudflare, cada subdominio de local (F11) se agrega uno por uno
como `CNAME`.

Se aceptó a sabiendas: **F11 es lo último del roadmap** y está declarado "para cuando un cliente lo
pida y lo pague". Agregar tres subdominios a mano cuando haya tres clientes es trabajo de un minuto,
y de paso evita que `cualquiercosa.garzondigital.cl` resuelva para locales que no existen. Si alguna
vez son cientos, la respuesta es *Cloudflare for SaaS*, no dar vuelta esta decisión.

### El proxy de Cloudflare va APAGADO

Los registros que apuntan a Vercel van en **DNS-only (nube gris)**, nunca proxiados (nube naranja).
No es una preferencia: Vercel desaconseja explícitamente un proxy inverso por delante —le quita
visibilidad del tráfico para sus medidas de seguridad, agrega latencia y ensucia el caché—, y la
nube naranja es la causa conocida de los errores *"Invalid Configuration"* y *"Failed to Generate
Cert"* al agregar el dominio.

Cloudflare acá es **el DNS y el correo**, no un CDN por delante.

---

## 3. Instructivo

### 3.1 Cloudflare toma el DNS

1. Crear cuenta en Cloudflare → **Add a site** → `garzondigital.cl` → plan **Free**.
2. Cloudflare entrega **dos nameservers propios** (del estilo `algo.ns.cloudflare.com`). Son los
   suyos, asignados a la cuenta: no sirven los de ningún tutorial.
3. En NIC Chile (`clientes.nic.cl`) → el dominio → **Configuración Técnica** → **Servidores DNS**
   → pegar esos dos. NIC recibe cambios las 24 horas y **republica la zona cada 30 minutos**.
4. Esperar a que Cloudflare marque el sitio como **Active**.

> **No marcar "Configurar a NIC Chile como servidor secundario".** Esa casilla del formulario de NIC
> parece gratis y sensata, pero un DNS secundario necesita transferir la zona desde el primario por
> AXFR, y **Cloudflare solo ofrece transferencias salientes en el plan Enterprise**: *"Outgoing zone
> transfers are available to Enterprise customers"*. En el plan Free, NIC quedaría anunciado como
> autoritativo sin poder obtener nunca la zona — un secundario roto es peor que ningún secundario,
> porque una parte de las consultas se va a un servidor que no sabe responder.

Verificar la delegación desde afuera, sin depender del panel de Cloudflare:

```powershell
Resolve-DnsName -Name garzondigital.cl -Type NS -Server 8.8.8.8
```

Mientras la zona `.cl` no publique la delegación, la respuesta es `NXDOMAIN` — y eso es lo esperado,
no una señal de que algo salió mal. **NIC republica la zona cada 30 minutos.** Para saber si la
inscripción en sí quedó bien, que es una cosa distinta de la publicación, el whois responde al
instante:

```powershell
$c = New-Object System.Net.Sockets.TcpClient("whois.nic.cl", 43)
$w = New-Object System.IO.StreamWriter($c.GetStream()); $w.WriteLine("garzondigital.cl"); $w.Flush()
(New-Object System.IO.StreamReader($c.GetStream())).ReadToEnd()
```

> **Nunca marcar "Redireccionamiento Web" en NIC.** Ese servicio no deja el dominio en la barra de
> direcciones —muestra la URL de destino—, **solo funciona sobre http** (sin HTTPS), rompería los
> enlaces profundos tipo `/local/el-lalo?mesa=4` que van codificados en cada QR, y al activarlo
> **borra la configuración de servidores DNS**.

### 3.2 Vercel toma la web

1. Vercel → el proyecto → **Settings → Domains** → agregar **`garzondigital.cl`** y
   **`www.garzondigital.cl`** (los dos).
2. Vercel muestra los registros que necesita. **Copiar los que muestre el panel, no los de un
   tutorial.** Acá pasó exactamente eso: el `A` del ápice que asignó Vercel es **`216.198.79.1`**,
   de su pool anycast, y **no** el clásico `76.76.21.21` que sale en toda la documentación vieja.
   El `CNAME` del `www` es **único por proyecto** (del estilo `algo.vercel-dns-017.com`), ya no el
   viejo `cname.vercel-dns.com`. Los heredados siguen funcionando, pero no son los que corresponden.
3. Cargar esos registros en Cloudflare **con la nube en gris (DNS-only)**. Cloudflare pone el proxy
   **en naranja por defecto** al crear un `A` o un `CNAME`: hay que apagarlo a mano en cada uno.
4. El certificado TLS lo emite Vercel cuando el DNS resuelve.

**El principal es el ápice, sin `www`** *(decidido el 2026-08-26)*. Vercel propone lo contrario por
defecto —`www` principal y el ápice redirigiendo— y su razón es real: la especificación de DNS
prohíbe un `CNAME` en el ápice, así que este va con un `A` de IP fija, mientras que un `CNAME` les
permite redirigir tráfico ante un DDoS o por optimización.

Se eligió al revés por una razón del producto, no técnica: **este dominio se imprime en las mesas y
se dicta por teléfono.** Nadie dice "doble-ve doble-ve doble-ve" vendiéndole a un dueño de fuente de
soda, y la dirección canónica de un QR pegado a una mesa tiene que ser la corta. La objeción de
Vercel es menor a esta escala, y su propia documentación lo concede: *"Vercel maximizes the
reliability and performance of your apex domain if you choose to use it as your primary domain by
leveraging the Anycast methodology."*

**Consecuencia que hay que respetar:** `NEXT_PUBLIC_SITE_URL` es `https://garzondigital.cl`, sin
`www`. Si alguna vez se da vuelta la decisión, esa variable se cambia el mismo día — si no, el
`metadataBase` anuncia una URL que redirige y las miniaturas de WhatsApp apuntan al lado
equivocado.

### 3.3 El correo *(hecho el 2026-08-26)*

`contacto@garzondigital.cl` → reenvía a la casilla personal. Verificado desde afuera, que es la
única forma de saber si el correo va a llegar y no solo si el panel se puso verde:

```
MX    route1/2/3.mx.cloudflare.net   (prioridades 72 / 93 / 31)
SPF   v=spf1 include:_spf.mx.cloudflare.net ~all
DKIM  presente
```

El botón **"Add missing records"** de Cloudflare escribe los tres `MX` y el SPF solo; no hay que
escribirlos a mano. El proxy no es un tema acá: la nube naranja solo aplica a `A`, `AAAA` y `CNAME`.

Dos cosas que no son obvias:

- **El catch-all va en `drop`, no en reenviar.** Una regla que atrapa todo lo demás termina siendo
  un imán de spam, y no gana nada: nadie escribe a una dirección que no se publicó.
- **Reenviar no es enviar.** Email Routing recibe y reenvía; *responder* desde
  `contacto@garzondigital.cl` se configura aparte, con el "Enviar como" del cliente de correo más un
  relay SMTP. Verificarlo al configurarlo en vez de darlo por hecho.

### 3.4 En el repo *(hecho el 2026-08-26)*

- `metadataBase` en `src/app/layout.tsx`, tomado de `NEXT_PUBLIC_SITE_URL`.
- `NEXT_PUBLIC_SITE_URL` en `.env.example` — **hay que definirla también en el entorno de
  producción de Vercel**, o el fallback la deja apuntando a la URL de la preview.
- Las referencias a `garzon-one.vercel.app` en `CLAUDE.md`, `plan/PITCH-VENTAS.md` y `README.md`,
  que ahora apuntan al dominio propio.

### 3.5 La variable de entorno

`NEXT_PUBLIC_SITE_URL = https://garzondigital.cl` en Vercel, tipo **Config** (no *Secret*: el
prefijo `NEXT_PUBLIC_` compila el valor dentro del bundle del navegador, así que es público por
diseño y marcarlo secreto solo impediría releerlo) y **solo en Production**. Si se agregara también
a Preview, cada rama de prueba anunciaría imágenes del dominio de producción — el respaldo a
`VERCEL_URL` existe justamente para que cada preview se anuncie a sí misma.

Los cambios de variables **no afectan a los despliegues ya construidos**, solo al siguiente.

### 3.6 Después, con calma

- **Supabase → Authentication → URL Configuration → Site URL.** Riesgo bajo: se verificó que el
  proyecto no usa `emailRedirectTo` ni enlaces mágicos en ninguna parte. Es higiene.
- **Los QR se generan recién ahora, con el dominio definitivo.** No hay ninguno impreso todavía;
  este es exactamente el orden correcto.

---

## 4. Dos cosas que quedan abiertas

**La renovación no es un trámite administrativo.** $9.990 al año, exento de IVA, sin descuento por
volumen (2 años son exactamente $19.980). **Se compró por un año: vence el 2027-08-26.** Hay que
ponerse un recordatorio propio, sin depender solo del aviso de NIC — y conviene extenderlo a dos o
tres años apenas haya un cliente real, que no sale más caro por año y saca el vencimiento del
camino. La razón no es la del sitio web de cualquier empresa:
**los QR van impresos y pegados en las mesas de los clientes**. Si el dominio vence, cada QR de cada
local queda muerto de golpe, y eso no se arregla con un correo de disculpa — se arregla
reimprimiendo, local por local.

**Esto desbloquea "olvidé mi contraseña".** `CLAUDE.md` lo tiene como no-existe porque *"necesita
correo y el SMTP del plan gratis no es confiable"*. Con dominio propio y un proveedor de correo
transaccional de verdad (Resend, Postmark — **no** el reenvío de Cloudflare, que no sirve para eso)
esa función pasa de imposible a una tarde de trabajo. No es para ahora, pero conviene saber que la
puerta se abrió.

---

## 5. Titularidad

Inscrito a nombre de **una persona natural**, no de una sociedad. Si más adelante se factura a
través de una SpA, el traspaso es un trámite aparte de **$9.990**. No es un problema, pero conviene
tenerlo anotado y no descubrirlo el día de la primera factura.
