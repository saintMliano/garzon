import { describe, test, expect } from "vitest";
import {
  LARGO_NACIONAL,
  soloDigitos,
  normalizarTelefonoChileno,
  formatearTelefonoChileno,
  formatearMientrasEscribe,
  enmascararTelefono,
} from "@/lib/telefono";

const E164 = "+56912345678";

describe("Teléfono móvil chileno", () => {
  test("un móvil chileno son 9 dígitos", () => {
    expect(LARGO_NACIONAL).toBe(9);
  });

  test("soloDigitos descarta todo lo que no sea 0-9", () => {
    expect(soloDigitos("+56 (9) 1234-5678")).toBe("56912345678");
    expect(soloDigitos("sin números")).toBe("");
    expect(soloDigitos("")).toBe("");
  });

  describe("normalizarTelefonoChileno acepta lo que la gente escribe", () => {
    test("los 9 dígitos limpios", () => {
      expect(normalizarTelefonoChileno("912345678")).toBe(E164);
    });
    test("con el prefijo +56", () => {
      expect(normalizarTelefonoChileno("+56912345678")).toBe(E164);
    });
    test("con el 56 pero sin el +", () => {
      expect(normalizarTelefonoChileno("56912345678")).toBe(E164);
    });
    test("con el 0 del discado antiguo", () => {
      expect(normalizarTelefonoChileno("0912345678")).toBe(E164);
    });
    test("con espacios, guiones, puntos y paréntesis mezclados", () => {
      expect(normalizarTelefonoChileno("9 1234-5678")).toBe(E164);
      expect(normalizarTelefonoChileno("(9) 1234.5678")).toBe(E164);
      expect(normalizarTelefonoChileno("  +56 - 9 1234 5678  ")).toBe(E164);
    });
    test("pegado completo desde los contactos", () => {
      expect(normalizarTelefonoChileno("+56 9 1234 5678")).toBe(E164);
    });
  });

  describe("normalizarTelefonoChileno rechaza lo que no es un móvil", () => {
    /**
     * Los fijos son el rechazo que importa: el campo existe para avisar por
     * mensaje que el pedido está listo, y un fijo válido promete un aviso que
     * nunca va a llegar. Peor que un campo vacío.
     */
    test("fijo de Valparaíso (32)", () => {
      expect(normalizarTelefonoChileno("32 212 3456")).toBeNull();
      expect(normalizarTelefonoChileno("322123456")).toBeNull();
    });
    test("fijo de Santiago (2)", () => {
      expect(normalizarTelefonoChileno("2 2123 4567")).toBeNull();
      expect(normalizarTelefonoChileno("+56 2 2123 4567")).toBeNull();
    });
    test("demasiado corto", () => {
      expect(normalizarTelefonoChileno("91234567")).toBeNull();
      expect(normalizarTelefonoChileno("9")).toBeNull();
    });
    test("demasiado largo", () => {
      expect(normalizarTelefonoChileno("9123456789")).toBeNull();
      expect(normalizarTelefonoChileno("+56 9 1234 5678 9")).toBeNull();
    });
    test("cadena vacía o solo separadores", () => {
      expect(normalizarTelefonoChileno("")).toBeNull();
      expect(normalizarTelefonoChileno("   - () . +  ")).toBeNull();
    });
    test("solo letras", () => {
      expect(normalizarTelefonoChileno("no tengo teléfono")).toBeNull();
      expect(normalizarTelefonoChileno("nueve uno dos tres")).toBeNull();
    });
  });

  describe("formatearTelefonoChileno", () => {
    test("muestra el E.164 como se lee en Chile", () => {
      expect(formatearTelefonoChileno(E164)).toBe("9 1234 5678");
    });
    test("devuelve intacto lo que no puede formatear", () => {
      // Se usa para MOSTRAR datos ya guardados: un valor raro tiene que seguir
      // viéndose, no desaparecer ni romper la página.
      expect(formatearTelefonoChileno("")).toBe("");
      expect(formatearTelefonoChileno("223456789")).toBe("223456789");
      expect(formatearTelefonoChileno("pendiente")).toBe("pendiente");
    });
  });

  describe("formatearMientrasEscribe", () => {
    test("agrupa de forma progresiva mientras se teclea", () => {
      expect(formatearMientrasEscribe("9")).toBe("9");
      expect(formatearMientrasEscribe("9123")).toBe("9 123");
      expect(formatearMientrasEscribe("91234")).toBe("9 1234");
      expect(formatearMientrasEscribe("912345")).toBe("9 1234 5");
      expect(formatearMientrasEscribe("912345678")).toBe("9 1234 5678");
    });
    test("absorbe el número pegado con prefijo", () => {
      expect(formatearMientrasEscribe("+56 9 1234 5678")).toBe("9 1234 5678");
      expect(formatearMientrasEscribe("56912345678")).toBe("9 1234 5678");
      expect(formatearMientrasEscribe("0912345678")).toBe("9 1234 5678");
    });
    test("recorta el excedente en vez de arrastrarlo", () => {
      // El maxLength del navegador no protege del pegado.
      expect(formatearMientrasEscribe("91234567890000")).toBe("9 1234 5678");
    });
    test("nunca lanza con basura", () => {
      expect(formatearMientrasEscribe("")).toBe("");
      expect(formatearMientrasEscribe("hola")).toBe("");
      expect(formatearMientrasEscribe("---")).toBe("");
    });

    /**
     * React reescribe el valor del input en cada render: si reaplicar el formateo
     * cambiara el texto, el cursor saltaría de lugar al escribir. Este test
     * encontró el caso `5656...`, donde recortar a 9 dígitos dejaba OTRO `56` al
     * frente y la segunda pasada daba un valor distinto.
     */
    test("es idempotente sobre su propia salida", () => {
      const entradas = [
        "9",
        "9123",
        "912345",
        "912345678",
        "+56 9 1234 5678",
        "0912345678",
        "91234567890000",
        "5656912345678",
        "00912345678",
        "hola",
        "",
      ];
      for (const entrada of entradas) {
        const una = formatearMientrasEscribe(entrada);
        expect(formatearMientrasEscribe(una), `falló con "${entrada}"`).toBe(una);
      }
    });
  });

  test("ida y vuelta normalizar -> formatear -> normalizar da lo mismo", () => {
    const entradas = ["912345678", "+56912345678", "56912345678", "0912345678", "9 8765-4321"];
    for (const entrada of entradas) {
      const e164 = normalizarTelefonoChileno(entrada);
      expect(e164, `falló con "${entrada}"`).not.toBeNull();
      expect(normalizarTelefonoChileno(formatearTelefonoChileno(e164!))).toBe(e164);
    }
  });

  test("lo que sale del input formateado siempre se puede normalizar", () => {
    // El puente entre las dos funciones: si el comensal completó los 9 dígitos,
    // el valor visible del campo tiene que ser guardable sin más limpieza.
    const visible = formatearMientrasEscribe("+56 9 8765 4321");
    expect(normalizarTelefonoChileno(visible)).toBe("+56987654321");
  });

describe("enmascararTelefono", () => {
  test("deja ver los últimos cuatro y nada más", () => {
    expect(enmascararTelefono("+56912345678")).toBe("+56 9 ---- 5678");
    expect(enmascararTelefono("9 1234 5678")).toBe("+56 9 ---- 5678");
  });

  test("NUNCA deja cinco dígitos seguidos", () => {
    // Es la misma regla que hace cumplir el CHECK de `supresiones_telefono`:
    // si el enmascarado dejara pasar el número, la constancia de un borrado
    // conservaría justo el dato que se acaba de borrar.
    for (let i = 0; i < 500; i++) {
      const nacional = "9" + String(i * 199_991).padStart(8, "0").slice(0, 8);
      const enmascarado = enmascararTelefono(`+56${nacional}`);
      expect(enmascarado, `${nacional} quedó legible`).not.toMatch(/[0-9]{5,}/);
    }
  });

  test("no inventa nada con una entrada inválida", () => {
    expect(enmascararTelefono("322123456")).toBe("(número inválido)");
    expect(enmascararTelefono("")).toBe("(número inválido)");
  });
});

});
