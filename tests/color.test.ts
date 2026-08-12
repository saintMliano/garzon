import { describe, test, expect } from "vitest";
import { contraste, textoSobre, legibleSobre, variablesDeMarca, CONTRASTE_AA } from "@/lib/color";

describe("Utilidad de color (F9)", () => {
  test("valores WCAG conocidos", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 es el gris canónico que apenas pasa AA sobre blanco
    expect(contraste("#ffffff", "#767676")).toBeGreaterThan(4.5);
    expect(contraste("#ffffff", "#777777")).toBeLessThan(4.6);
  });
  test("texto sobre marca clara y oscura", () => {
    expect(textoSobre("#ffe600")).toBe("#1c1917"); // amarillo -> texto oscuro
    expect(textoSobre("#1e3a8a")).toBe("#ffffff"); // azul marino -> texto blanco
    expect(textoSobre("#f97316")).toBeTruthy();
  });
  test("el texto elegido supera AA en colores representativos", () => {
    for (const c of ["#ffe600","#f97316","#1e3a8a","#ffffff","#000000","#22c55e","#fca5a5","#84cc16"]) {
      expect(contraste(c, textoSobre(c)), `falló con ${c}`).toBeGreaterThanOrEqual(CONTRASTE_AA);
    }
  });

  /**
   * Este es el test que importa, y el que descubrió un bug real: con la pareja
   * suave del sistema (blanco y #1c1917) hay una franja de violetas y grises
   * medios —el peor caso es #8c5aff— donde NINGUNA de las dos llega a AA; el
   * techo ahí es 4.18:1. Ocho colores de muestra no lo encontraban.
   *
   * Barre todo el cubo RGB para que la garantía sea una propiedad verificada y
   * no una suposición sobre los colores que a alguien se le ocurrió probar.
   */
  test("el texto elegido supera AA para CUALQUIER color del cubo RGB", () => {
    let peor = { hex: "", razon: Infinity };
    for (let r = 0; r <= 255; r += 5) {
      for (let g = 0; g <= 255; g += 5) {
        for (let b = 0; b <= 255; b += 5) {
          const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
          const razon = contraste(hex, textoSobre(hex));
          if (razon < peor.razon) peor = { hex, razon };
        }
      }
    }
    expect(peor.razon, `el peor color fue ${peor.hex}`).toBeGreaterThanOrEqual(CONTRASTE_AA);
  });

  test("el caso que rompía la pareja suave ahora escala a un extremo", () => {
    // #8c5aff daba 4.18:1 con #1c1917; con negro puro cruza el umbral.
    expect(contraste("#8c5aff", textoSobre("#8c5aff"))).toBeGreaterThanOrEqual(CONTRASTE_AA);
    expect(textoSobre("#8c5aff")).toBe("#000000");
  });
  test("legibleSobre oscurece hasta pasar AA", () => {
    const pal = legibleSobre("#fde047", "#ffffff"); // amarillo pálido
    expect(contraste(pal, "#ffffff")).toBeGreaterThanOrEqual(CONTRASTE_AA);
    // conserva el tono: sigue siendo más verde/rojo que azul
    expect(pal).not.toBe("#1c1917");
  });
  test("color inválido cae al default", () => {
    const v = variablesDeMarca("no-es-color", null);
    expect(v["--brand"]).toBe("#f97316");
    expect(v["--accent"]).toBe("#f97316");
  });
});
