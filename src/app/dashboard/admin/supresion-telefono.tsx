"use client";

import { useCallback, useState } from "react";
import { formatearMientrasEscribe, normalizarTelefonoChileno } from "@/lib/telefono";

/**
 * Supresión de datos por teléfono (solo super-admin).
 *
 * Esto NO es un buscador de clientes. Es la herramienta con la que se responde
 * una solicitud de supresión: llega un reclamo con un número, se comprueba qué
 * queda de ese número y se borra. Ver "todos los pedidos de este número" para
 * curiosear sería perfilamiento — otra finalidad, otra base legal (§7 del plan).
 *
 * Por eso el diseño renuncia a propósito a cosas que un buscador tendría:
 * no hay búsqueda parcial (el botón no se habilita hasta que el número está
 * completo), no se muestra el contenido de los pedidos ni el nombre de quien
 * los hizo, y no hay listado que recorrer sin traer un número desde afuera.
 *
 * Todo pasa por `/api/admin/telefono`, que es server-only: ninguna sesión del
 * navegador puede borrar la columna `telefono` por su cuenta.
 */

type LocalConTelefono = {
  localId: string;
  nombre: string;
  slug: string;
  pedidos: number;
  /** Fechas ISO (`YYYY-MM-DD`) del primer y del último pedido con ese número. */
  desde: string;
  hasta: string;
};

type Busqueda = {
  /** E.164, tal como lo canonizó el servidor. Es lo que viaja al borrar. */
  telefono: string;
  enmascarado: string;
  total: number;
  locales: LocalConTelefono[];
};

type Aviso = {
  enmascarado: string;
  borrados: number;
  /** Nombre del local, o `null` cuando la supresión fue en todos. */
  alcance: string | null;
};

/** Marca de "estoy borrando en todos": no colisiona con ningún uuid de local. */
const TODOS = "todos";

function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "3 pedidos" / "1 pedido". Aparece en botones y en confirmaciones. */
function pedidosTexto(n: number): string {
  return `${n} pedido${n === 1 ? "" : "s"}`;
}

export default function SupresionTelefono({
  onError,
}: {
  onError: (mensaje: string) => void;
}) {
  // Se guarda como se ve (`9 1234 5678`); a E.164 se convierte al consultar.
  const [telefono, setTelefono] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const telefonoE164 = normalizarTelefonoChileno(telefono);

  // La defensa central del diseño: sin número completo no hay consulta, y sin
  // consulta parcial no hay directorio de clientes que recorrer.
  const puedeBuscar = telefonoE164 !== null && !buscando && borrando === null;

  /**
   * Al tocar el número, lo que había en pantalla dejó de corresponderle: se
   * limpia en el mismo handler y no en un efecto (la regla del proyecto prohíbe
   * `setState` sincrónico dentro de `useEffect`).
   */
  function cambiarTelefono(valor: string) {
    setTelefono(formatearMientrasEscribe(valor));
    setBusqueda(null);
    setAviso(null);
  }

  function limpiar() {
    setTelefono("");
    setBusqueda(null);
    setAviso(null);
  }

  const buscar = useCallback(async () => {
    if (!telefonoE164) return;

    setBuscando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/admin/telefono?telefono=${encodeURIComponent(telefonoE164)}`);
      const body = await res.json();
      if (!res.ok || !body.ok) {
        onError(body.error || "No se pudo consultar el número.");
        return;
      }
      setBusqueda(body as Busqueda);
    } catch {
      onError("Error de red al consultar el número.");
    } finally {
      setBuscando(false);
    }
  }, [onError, telefonoE164]);

  /** `local === null` significa "en todos los locales". */
  async function borrar(local: LocalConTelefono | null) {
    if (!busqueda) return;

    const pedidos = local ? local.pedidos : busqueda.total;
    const donde = local
      ? `en ${local.nombre}`
      : `en TODOS los locales (${busqueda.locales.length})`;

    // Es irreversible y toca datos de una persona real: se confirma siempre, y
    // la confirmación dice a cuántos pedidos alcanza y qué NO se lleva consigo.
    const confirmado = window.confirm(
      `¿Borrar el teléfono ${busqueda.enmascarado} ${donde}?\n\n` +
        `Alcanza a ${pedidosTexto(pedidos)} y no se puede deshacer.\n` +
        `Los pedidos y sus ventas se conservan: lo único que desaparece es el teléfono.`
    );
    if (!confirmado) return;

    setBorrando(local ? local.localId : TODOS);
    try {
      const res = await fetch("/api/admin/telefono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sin `localId` el endpoint borra en todos; `undefined` no se serializa.
        body: JSON.stringify({ telefono: busqueda.telefono, localId: local?.localId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        onError(body.error || "No se pudo borrar el teléfono.");
        return;
      }

      const borrados = Number(body.borrados) || 0;
      setAviso({
        enmascarado: body.enmascarado || busqueda.enmascarado,
        borrados,
        alcance: local ? local.nombre : null,
      });

      // Lo que se mostraba ya no es cierto. En una supresión por local sobrevive
      // el resto de la lista; en una global no sobrevive nada.
      if (local) {
        setBusqueda((prev) =>
          prev
            ? {
                ...prev,
                total: Math.max(0, prev.total - borrados),
                locales: prev.locales.filter((l) => l.localId !== local.localId),
              }
            : prev
        );
      } else {
        setBusqueda((prev) => (prev ? { ...prev, total: 0, locales: [] } : prev));
      }
    } catch {
      onError("Error de red al borrar el teléfono.");
    } finally {
      setBorrando(null);
    }
  }

  const ocupado = buscando || borrando !== null;
  const sinNada = busqueda !== null && busqueda.locales.length === 0;

  return (
    <div className="max-w-2xl mx-auto dash-card rounded-2xl border-2 p-5 mt-4">
      <h2 className="font-bold dash-text-primary text-base">Supresión de datos</h2>
      <p className="text-[11px] dash-text-muted mt-1 leading-relaxed">
        Para responder cuando un comensal pide que borren su teléfono. Se consulta con el número
        completo que trae el reclamo: acá no hay listado de clientes ni búsqueda parcial, y no se
        muestra qué pidió ni cómo se llama.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (puedeBuscar) buscar();
        }}
        className="mt-4"
      >
        <label htmlFor="supresion-telefono" className="text-xs font-semibold dash-text-secondary block mb-1">
          Teléfono del reclamo
        </label>

        {/* El +56 va impreso al costado, no dentro del input: se escriben 9 dígitos. */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 flex items-stretch rounded-lg dash-bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-orange-500">
            <span className="flex items-center px-3 text-sm font-semibold dash-text-muted border-r border-stone-700 select-none">
              +56
            </span>
            <input
              id="supresion-telefono"
              type="tel"
              // `numeric` y no `tel`: el teclado de teléfono trae *, # y pausas
              // que acá no sirven de nada.
              inputMode="numeric"
              value={telefono}
              onChange={(e) => cambiarTelefono(e.target.value)}
              placeholder="9 1234 5678"
              autoComplete="off"
              aria-describedby="supresion-telefono-ayuda"
              className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm dash-text-primary outline-none tabular-nums placeholder:text-stone-600"
            />
          </div>

          <button
            type="submit"
            disabled={!puedeBuscar}
            className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
          >
            {buscando ? "Consultando…" : "Consultar"}
          </button>

          {(telefono !== "" || busqueda !== null) && (
            <button
              type="button"
              onClick={limpiar}
              disabled={ocupado}
              className="shrink-0 px-3 py-2 rounded-lg dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              Limpiar
            </button>
          )}
        </div>

        <p id="supresion-telefono-ayuda" className="text-[11px] dash-text-muted mt-1.5">
          Son 9 números y parten con 9. El botón se habilita recién con el número completo.
        </p>
      </form>

      {/* Resultado del borrado. Va arriba de la lista porque es lo que se le
          responde a la persona que reclamó. */}
      {aviso && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-xs font-semibold text-emerald-300">
            Listo: se borró el teléfono {aviso.enmascarado} de {pedidosTexto(aviso.borrados)}
            {aviso.alcance ? ` en ${aviso.alcance}` : " en todos los locales"}.
          </p>
          <p className="text-[11px] dash-text-muted mt-1 leading-relaxed">
            Los pedidos y sus ventas siguen ahí — son la contabilidad del local. Queda registrada la
            supresión con el número enmascarado, que es la prueba que se le puede mostrar a la
            persona. Vuelve a consultar si quieres comprobar que no quedó nada.
          </p>
        </div>
      )}

      {busqueda !== null &&
        (sinNada ? (
          /* `total: 0` es una respuesta buena y frecuente: la mejor forma de
             responder una supresión es no tener el dato. */
          <div className="mt-4 rounded-xl dash-bg-surface p-4">
            <p className="text-sm font-semibold dash-text-primary">No queda nada que borrar</p>
            <p className="text-[11px] dash-text-muted mt-1 leading-relaxed">
              Ningún pedido guarda ese número. Lo más probable es que ya lo haya borrado el purgado
              automático de los 7 días. Se le puede responder que el dato ya no está.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs dash-text-secondary">
              {busqueda.enmascarado} · {pedidosTexto(busqueda.total)} en{" "}
              {busqueda.locales.length === 1 ? "1 local" : `${busqueda.locales.length} locales`}
            </p>
            <p className="text-[11px] dash-text-muted mt-1 leading-relaxed">
              El responsable de los datos es cada local, así que lo normal es borrar en el local que
              recibió el reclamo; la opción global es para cuando la persona pide que no quede en
              ninguno. En ambos casos se conserva el pedido y su venta: lo que desaparece es el
              teléfono.
            </p>

            <div className="mt-3 space-y-3">
              {busqueda.locales.map((l) => {
                const trabajando = borrando === l.localId;
                return (
                  <div key={l.localId} className="rounded-xl dash-bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold dash-text-primary text-sm truncate">{l.nombre}</p>
                        <p className="text-[11px] dash-text-muted font-mono truncate">/{l.slug}</p>
                      </div>
                      <span className="shrink-0 px-2 py-1 rounded-lg border border-stone-700 text-[11px] font-bold dash-text-secondary">
                        {pedidosTexto(l.pedidos)}
                      </span>
                    </div>

                    <p className="text-[11px] dash-text-muted mt-2">
                      {l.desde === l.hasta
                        ? `El ${formatearFecha(l.desde)}`
                        : `Del ${formatearFecha(l.desde)} al ${formatearFecha(l.hasta)}`}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => borrar(l)}
                        disabled={ocupado}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30 hover:opacity-80 transition-opacity disabled:opacity-40"
                      >
                        {trabajando ? "Borrando…" : "Borrar en este local"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* La global va fuera de las tarjetas y separada: es la excepción,
                no el gesto por omisión. */}
            <div className="mt-4 pt-3 border-t border-stone-800 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] dash-text-muted">
                Si la persona pidió que no quede en ninguna parte:
              </p>
              <button
                onClick={() => borrar(null)}
                disabled={ocupado}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30 hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                {borrando === TODOS ? "Borrando…" : "Borrar en todos los locales"}
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
