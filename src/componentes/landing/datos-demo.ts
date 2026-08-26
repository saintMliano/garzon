/**
 * Los datos de las dos maquetas de la landing, en un solo lugar.
 *
 * Son inventados a mano, y por eso están acá y no dispersos en el JSX: un dueño
 * de local que mira la página **va a sumar**. Si el gráfico dice una cosa y el
 * "Venta total" dice otra, la maqueta deja de vender y pasa a restar. Las
 * invariantes de abajo son las mismas que cumple el panel de verdad, y hay un
 * test que las verifica (`tests/landing-demo.test.ts`):
 *
 *   1. `VENTA_TOTAL` es exactamente la suma de `VENTAS_POR_DIA`.
 *   2. `TICKET_PROMEDIO` = `VENTA_TOTAL / (pedidos − rechazados)`.
 *   3. `VENTA_ENTREGADA + VENTA_PENDIENTE` = `VENTA_TOTAL`.
 *   4. La venta de cada producto es `unidades × precio` y la tabla va ordenada
 *      por unidades, como la ordena `reporte_top_productos`.
 *   5. El total de cada pedido del tablero es la suma de sus líneas.
 *
 * Y una que no es aritmética sino de negocio: **la propina no entra en la
 * venta**. Es plata del personal, no del local (ver `CLAUDE.md`). Acá aparece
 * en su propio recuadro, igual que en `/dashboard/reportes`, y esa separación
 * es parte de lo que la landing muestra.
 */

/** Agosto de 2026, del 1 al 26. El 1 cayó sábado; los lunes el local cierra. */
export const VENTAS_POR_DIA = [
  { dia: 1, venta: 412_400 },
  { dia: 2, venta: 388_700 },
  { dia: 3, venta: 0 }, // lunes, cerrado
  { dia: 4, venta: 236_800 },
  { dia: 5, venta: 251_300 },
  { dia: 6, venta: 268_900 },
  { dia: 7, venta: 341_500 },
  { dia: 8, venta: 429_600 },
  { dia: 9, venta: 396_200 },
  { dia: 10, venta: 0 },
  { dia: 11, venta: 244_100 },
  { dia: 12, venta: 259_700 },
  { dia: 13, venta: 273_400 },
  { dia: 14, venta: 356_800 },
  { dia: 15, venta: 441_900 },
  { dia: 16, venta: 402_300 },
  { dia: 17, venta: 0 },
  { dia: 18, venta: 248_600 },
  { dia: 19, venta: 262_100 },
  { dia: 20, venta: 279_800 },
  { dia: 21, venta: 362_400 },
  { dia: 22, venta: 447_500 }, // el máximo del mes
  { dia: 23, venta: 409_100 },
  { dia: 24, venta: 0 },
  { dia: 25, venta: 253_900 },
  { dia: 26, venta: 187_200 }, // hoy, todavía en curso
];

export const VENTA_MAXIMA_DIA = 447_500;

/** Suma exacta de `VENTAS_POR_DIA`. */
export const VENTA_TOTAL = 7_154_200;

export const PEDIDOS_TOTAL = 1_234;
export const PEDIDOS_RECHAZADOS = 21;
/** `VENTA_TOTAL / (1.234 − 21)`, redondeado como lo hace la RPC. */
export const TICKET_PROMEDIO = 5_898;

export const VENTA_ENTREGADA = 7_057_800;
export const PEDIDOS_ENTREGADOS = 1_199;
export const VENTA_PENDIENTE = 96_400;
export const PEDIDOS_PENDIENTES = 14;

/** Aparte de la venta, siempre. Es del personal. */
export const PROPINAS_TOTAL = 312_700;

/** Medianas, como las calcula `reporte_tiempos`. */
export const TIEMPOS = [
  {
    titulo: "Hasta aceptar",
    valor: "48 s",
    detalle: "cuánto espera el cliente a que le tomen el pedido",
  },
  {
    titulo: "Hasta estar listo",
    valor: "9 min 20 s",
    detalle: "desde que entra hasta que sale de cocina",
  },
  {
    titulo: "Hasta entregar",
    valor: "11 min 45 s",
    detalle: "el ciclo completo",
  },
];

/**
 * Ordenados por unidades, que es como los ordena `reporte_top_productos` y como
 * se dibuja el medidor de proporción. El detalle que hace verosímil la tabla:
 * la bebida es lo que más se vende y el churrasco lo que más plata deja. Eso es
 * justo lo que un dueño no sabe sin mirar un reporte.
 */
export const TOP_PRODUCTOS = [
  { nombre: "Bebida en lata 350 ml", unidades: 486, venta: 874_800 },
  { nombre: "Churrasco italiano", unidades: 214, venta: 1_476_600 },
  { nombre: "Completo italiano", unidades: 186, venta: 706_800 },
  { nombre: "Papas fritas grandes", unidades: 152, venta: 790_400 },
  { nombre: "Barros luco", unidades: 88, venta: 633_600 },
  { nombre: "Café cortado", unidades: 74, venta: 177_600 },
];

export const UNIDADES_MAXIMAS = 486;

// ===== TABLERO DE COCINA =====

export type EstadoDemo = "nuevo" | "aceptado" | "preparando" | "listo";

export type LineaDemo = {
  cantidad: number;
  nombre: string;
  precio: number;
  /** Nota de esa línea. El mismo producto puede ir dos veces con notas distintas. */
  nota?: string;
};

export type PedidoDemo = {
  numero: string;
  /** Lo que el panel muestra como nombre: para un pedido de mesa, es la mesa. */
  cliente: string;
  mesa?: string;
  retiro?: boolean;
  /** Estático a propósito: un cronómetro que corre obligaría a mandar JS a la landing. */
  tiempo: string;
  /** El umbral del panel: ámbar a los 8 minutos, rojo a los 15. */
  urgencia: "normal" | "aviso";
  lineas: LineaDemo[];
  total: number;
  notaPedido?: string;
};

export const PEDIDOS_DEMO: Record<EstadoDemo, PedidoDemo[]> = {
  nuevo: [
    {
      numero: "#118",
      cliente: "Mesa 4",
      mesa: "Mesa 4",
      tiempo: "0:38",
      urgencia: "normal",
      // Dos líneas del mismo producto, una con nota y otra sin. No es un
      // descuido de la maqueta: es cómo funciona el carrito de verdad.
      lineas: [
        { cantidad: 1, nombre: "Churrasco italiano", precio: 6_900, nota: "Sin tomate" },
        { cantidad: 1, nombre: "Churrasco italiano", precio: 6_900 },
        { cantidad: 1, nombre: "Bebida en lata 350 ml", precio: 1_800 },
      ],
      total: 15_600,
    },
    {
      numero: "#119",
      cliente: "Camila",
      retiro: true,
      tiempo: "1:52",
      urgencia: "normal",
      lineas: [
        { cantidad: 2, nombre: "Completo italiano", precio: 3_800 },
        { cantidad: 1, nombre: "Papas fritas grandes", precio: 5_200 },
      ],
      total: 12_800,
      notaPedido: "Paso a buscarlo a las 13:30",
    },
  ],
  aceptado: [
    {
      numero: "#117",
      cliente: "Mesa 2",
      mesa: "Mesa 2",
      tiempo: "4:07",
      urgencia: "normal",
      lineas: [
        { cantidad: 1, nombre: "Barros luco", precio: 7_200 },
        { cantidad: 1, nombre: "Papas fritas grandes", precio: 5_200 },
        { cantidad: 2, nombre: "Bebida en lata 350 ml", precio: 1_800 },
      ],
      total: 16_000,
    },
  ],
  preparando: [
    {
      numero: "#115",
      cliente: "Mesa 7",
      mesa: "Mesa 7",
      tiempo: "9:12",
      urgencia: "aviso",
      lineas: [
        { cantidad: 3, nombre: "Churrasco italiano", precio: 6_900, nota: "Uno sin ají" },
        { cantidad: 2, nombre: "Papas fritas grandes", precio: 5_200 },
      ],
      total: 31_100,
    },
    {
      numero: "#116",
      cliente: "Barra",
      mesa: "Barra",
      tiempo: "6:44",
      urgencia: "normal",
      lineas: [
        { cantidad: 2, nombre: "Completo italiano", precio: 3_800 },
        { cantidad: 1, nombre: "Café cortado", precio: 2_400 },
      ],
      total: 10_000,
    },
  ],
  listo: [
    {
      numero: "#114",
      cliente: "Mesa 1",
      mesa: "Mesa 1",
      tiempo: "12:31",
      urgencia: "aviso",
      lineas: [
        { cantidad: 2, nombre: "Barros luco", precio: 7_200 },
        { cantidad: 2, nombre: "Bebida en lata 350 ml", precio: 1_800 },
      ],
      total: 18_000,
    },
  ],
};
