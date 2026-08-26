import { describe, test, expect } from "vitest";
import {
  PEDIDOS_DEMO,
  PEDIDOS_ENTREGADOS,
  PEDIDOS_PENDIENTES,
  PEDIDOS_RECHAZADOS,
  PEDIDOS_TOTAL,
  TICKET_PROMEDIO,
  TOP_PRODUCTOS,
  UNIDADES_MAXIMAS,
  VENTAS_POR_DIA,
  VENTA_ENTREGADA,
  VENTA_MAXIMA_DIA,
  VENTA_PENDIENTE,
  VENTA_TOTAL,
  PROPINAS_TOTAL,
} from "@/componentes/landing/datos-demo";

/**
 * Las maquetas del panel que muestra la landing llevan datos inventados a mano.
 * Que sean inventados no los exime de cuadrar: **un dueño de local que mira esa
 * página va a sumar**, y si el gráfico dice una cosa y el "Venta total" dice
 * otra, la maqueta deja de vender y pasa a restar credibilidad — justo lo
 * contrario de para lo que está.
 *
 * Este archivo es barato (funciones puras, no toca la base) y protege de la
 * forma más probable de romperlo: alguien retoca un número suelto en el JSX o
 * en la lista de días y no rehace la aritmética de al lado.
 */
describe("Datos de las maquetas de la landing", () => {
  test("La venta total es exactamente la suma de las barras del gráfico", () => {
    const suma = VENTAS_POR_DIA.reduce((acc, d) => acc + d.venta, 0);
    expect(suma).toBe(VENTA_TOTAL);
  });

  test("El máximo declarado es el mayor día de la serie", () => {
    expect(Math.max(...VENTAS_POR_DIA.map((d) => d.venta))).toBe(VENTA_MAXIMA_DIA);
  });

  test("El ticket promedio sale de los pedidos NO rechazados", () => {
    // La regla del panel: un pedido rechazado no suma a la venta ni al
    // promedio. Si el divisor fueran todos los pedidos, el ticket saldría más
    // bajo de lo que el local factura de verdad.
    const noRechazados = PEDIDOS_TOTAL - PEDIDOS_RECHAZADOS;
    expect(Math.round(VENTA_TOTAL / noRechazados)).toBe(TICKET_PROMEDIO);
  });

  test("Entregado más pendiente es toda la venta, en plata y en pedidos", () => {
    expect(VENTA_ENTREGADA + VENTA_PENDIENTE).toBe(VENTA_TOTAL);
    expect(PEDIDOS_ENTREGADOS + PEDIDOS_PENDIENTES).toBe(PEDIDOS_TOTAL - PEDIDOS_RECHAZADOS);
  });

  test("La propina NO está incluida en la venta", () => {
    // No es una comprobación aritmética sino la regla de negocio de `CLAUDE.md`:
    // la propina es plata del personal, no venta del local. Si alguna vez
    // alguien la suma al total, este test lo detiene antes de que la landing
    // enseñe la suma equivocada.
    expect(PROPINAS_TOTAL).toBeGreaterThan(0);
    expect(VENTA_TOTAL).toBe(VENTAS_POR_DIA.reduce((acc, d) => acc + d.venta, 0));
    expect(VENTA_TOTAL).not.toBe(VENTA_ENTREGADA + VENTA_PENDIENTE + PROPINAS_TOTAL);
  });

  test("La tabla de productos va ordenada por unidades, como la ordena la RPC", () => {
    const unidades = TOP_PRODUCTOS.map((p) => p.unidades);
    expect([...unidades].sort((a, b) => b - a)).toEqual(unidades);
    expect(UNIDADES_MAXIMAS).toBe(unidades[0]);
  });

  test("Lo que vende cada producto cabe dentro de la venta del período", () => {
    const suma = TOP_PRODUCTOS.reduce((acc, p) => acc + p.venta, 0);
    expect(suma).toBeLessThan(VENTA_TOTAL);
  });

  test("El total de cada pedido del tablero es la suma de sus líneas", () => {
    for (const pedidos of Object.values(PEDIDOS_DEMO)) {
      for (const pedido of pedidos) {
        const suma = pedido.lineas.reduce((acc, l) => acc + l.precio * l.cantidad, 0);
        expect(suma, `pedido ${pedido.numero}`).toBe(pedido.total);
      }
    }
  });

  test("Un mismo precio unitario no cambia de un pedido a otro", () => {
    // Los seis pedidos del tablero comparten productos. Si el churrasco vale
    // $6.900 en una tarjeta y $7.400 en la de al lado, la maqueta se cae sola
    // ante cualquiera que mire dos tarjetas seguidas.
    const precios = new Map<string, number>();
    for (const pedidos of Object.values(PEDIDOS_DEMO)) {
      for (const pedido of pedidos) {
        for (const linea of pedido.lineas) {
          const visto = precios.get(linea.nombre);
          if (visto === undefined) precios.set(linea.nombre, linea.precio);
          else expect(linea.precio, linea.nombre).toBe(visto);
        }
      }
    }
  });
});
