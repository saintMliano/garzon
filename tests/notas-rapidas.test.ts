import { describe, test, expect } from "vitest";
import { NOTAS_RAPIDAS, agregarNotaRapida } from "@/lib/notas-rapidas";

/**
 * Atajos de nota, compartidos por la comanda del garzón y el carrito del
 * comensal. Es una función pura: no toca la base y corre en milisegundos.
 */
describe("Atajos de nota", () => {
  test("Sobre un campo vacío, el atajo queda tal cual", () => {
    expect(agregarNotaRapida("", "Sin mayo")).toBe("Sin mayo");
    expect(agregarNotaRapida("   ", "Sin ají")).toBe("Sin ají");
  });

  test("Se encadenan sin pisar lo que el usuario ya escribió", () => {
    expect(agregarNotaRapida("bien cocido", "Sin mayo")).toBe("bien cocido, sin mayo");
    expect(agregarNotaRapida("Sin mayo", "Sin ají")).toBe("Sin mayo, sin ají");
  });

  test("Tocar dos veces el mismo atajo NO lo repite", () => {
    // Con el teléfono en la mano es fácil tocar dos veces, y "sin mayo, sin
    // mayo" llega así a la pantalla de la cocina.
    expect(agregarNotaRapida("Sin mayo", "Sin mayo")).toBe("Sin mayo");
    expect(agregarNotaRapida("bien cocido, sin ají", "Sin ají")).toBe("bien cocido, sin ají");
  });

  test("La comparación no distingue mayúsculas ni espacios sobrantes", () => {
    expect(agregarNotaRapida("SIN MAYO", "Sin mayo")).toBe("SIN MAYO");
    expect(agregarNotaRapida("bien cocido ,  sin palta ", "Sin palta")).toBe(
      "bien cocido ,  sin palta"
    );
  });

  test("Encadenar todos los atajos no duplica ninguno", () => {
    const texto = NOTAS_RAPIDAS.reduce((acc, n) => agregarNotaRapida(acc, n), "");
    const partes = texto.split(",").map((p) => p.trim().toLowerCase());
    expect(partes).toHaveLength(NOTAS_RAPIDAS.length);
    expect(new Set(partes).size).toBe(NOTAS_RAPIDAS.length);
  });

  test("Ninguna nota encadenada se pasa del tope de 300 que exige crear_pedido", () => {
    const texto = NOTAS_RAPIDAS.reduce((acc, n) => agregarNotaRapida(acc, n), "");
    expect(texto.length).toBeLessThanOrEqual(300);
  });
});
