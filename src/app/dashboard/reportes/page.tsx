"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";
import type { OrderStatus } from "@/types/database";
import AvisoSuscripcion from "../aviso-suscripcion";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";

// ============================================================
// Tipos de las RPCs de reportes (F6).
// Los montos son enteros en pesos chilenos.
// ============================================================

type ResumenVentas = {
  pedidos_total: number;
  pedidos_entregados: number;
  pedidos_pendientes: number;
  pedidos_cancelados: number;
  venta_entregada: number;
  venta_total: number;
  ticket_promedio: number;
  /** Va aparte de la venta a propósito: la propina es del personal, no del local. */
  propinas_total: number;
};

type VentaPorDia = {
  dia: string; // YYYY-MM-DD
  pedidos: number;
  venta: number;
};

type VentaPorMes = {
  mes: string; // YYYY-MM-DD (primer día del mes)
  pedidos: number;
  venta: number;
};

type TopProducto = {
  // `string | null` a propósito, aunque los tipos generados digan `string`:
  // Postgres no expone la nulabilidad de las columnas que devuelve una función,
  // y `pedido_items.producto_id` es ON DELETE SET NULL, así que un producto
  // borrado del menú deja ítems históricos sin id. No lo "corrijas" a `string`.
  producto_id: string | null;
  nombre: string;
  unidades: number;
  venta: number;
};

/**
 * Tiempos reales de cocina (F8), calculados desde la bitácora `pedido_eventos`.
 * Son **medianas** en segundos: un pedido olvidado media hora en la pantalla
 * distorsiona un promedio y vuelve inservible la métrica.
 */
type TiemposCocina = {
  pedidos_medidos: number;
  seg_hasta_aceptado: number;
  seg_hasta_listo: number;
  seg_hasta_entregado: number;
};

/**
 * Resultado del reporte, etiquetado con la `clave` (local + rango) que lo produjo.
 * Comparar esa clave contra la actual es lo que define si hay que mostrar el
 * spinner, sin necesidad de un `setLoading(true)` sincrónico dentro del efecto.
 */
type DatosReporte = {
  clave: string;
  resumen: ResumenVentas | null;
  porDia: VentaPorDia[];
  porMes: VentaPorMes[];
  topProductos: TopProducto[];
  tiempos: TiemposCocina | null;
};

type PedidoExport = {
  numero_pedido: number;
  created_at: string;
  mesa: string | null;
  nombre_cliente: string;
  estado: OrderStatus;
  total: number;
};


// ============================================================
// Fechas — SIEMPRE en America/Santiago.
// La tablet del local puede estar en cualquier zona; el corte de día del
// sistema (numeración de pedidos, RPCs de reporte) es el chileno.
// ============================================================

function hoyChile(): string {
  // en-CA da formato YYYY-MM-DD
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

/** Suma (o resta) días a una fecha YYYY-MM-DD. Mediodía UTC evita saltos por horario de verano. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Primer día del mes al que pertenece `fecha`. */
function primerDiaMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

/** Diferencia en ms entre la hora de Chile y UTC para un instante dado (cubre el cambio de hora). */
function offsetChileMs(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instante);

  const p: Record<string, string> = {};
  for (const parte of partes) p[parte.type] = parte.value;

  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24, // algunos motores devuelven "24" para medianoche
    Number(p.minute),
    Number(p.second)
  );
  return comoUtc - instante.getTime();
}

/** ¿Este instante son exactamente las 00:00 de `fecha` en Chile? (sv-SE da "YYYY-MM-DD HH:mm:ss") */
function esMedianocheChile(instante: Date, fecha: string): boolean {
  return instante.toLocaleString("sv-SE", { timeZone: "America/Santiago" }) === `${fecha} 00:00:00`;
}

/**
 * Instante UTC de las 00:00 de `fecha` en hora de Chile.
 * Se usa para que el CSV cubra exactamente el mismo rango que las RPCs.
 *
 * Dos candidatos porque el offset del día puede no ser el del instante tentativo
 * (cambio de hora). Se valida cuál cae de verdad en la medianoche pedida.
 */
function inicioDiaChile(fecha: string): Date {
  const tentativo = new Date(`${fecha}T00:00:00Z`);
  const c1 = new Date(tentativo.getTime() - offsetChileMs(tentativo));
  const c2 = new Date(tentativo.getTime() - offsetChileMs(c1));

  const validos = [c1, c2].filter((c) => esMedianocheChile(c, fecha));
  // En el cambio de hora de septiembre la medianoche no existe (00:00 salta a 01:00)
  // y ningún candidato es válido; Postgres resuelve ese caso hacia adelante, así
  // que se toma el instante mayor y el CSV queda alineado con las RPCs.
  const elegidos = validos.length > 0 ? validos : [c1, c2];
  return new Date(Math.max(...elegidos.map((c) => c.getTime())));
}

function fechaHoraChile(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** "2026-08-11" → "lun 11 ago" */
function etiquetaDia(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "2026-08-11" → "11 de agosto de 2026" */
function fechaLarga(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ============================================================
// Rangos
// ============================================================

type PresetRango = "hoy" | "ayer" | "7dias" | "mes" | "mes_pasado" | "anio" | "anio_pasado" | "personalizado";

const PRESETS: { id: PresetRango; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7dias", label: "Últimos 7 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
  { id: "anio", label: "Este año" },
  { id: "anio_pasado", label: "Año pasado" },
  { id: "personalizado", label: "Personalizado" },
];

function rangoDePreset(preset: Exclude<PresetRango, "personalizado">): { desde: string; hasta: string } {
  const hoy = hoyChile();
  switch (preset) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case "7dias":
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes":
      return { desde: primerDiaMes(hoy), hasta: hoy };
    case "mes_pasado": {
      const finMesPasado = sumarDias(primerDiaMes(hoy), -1);
      return { desde: primerDiaMes(finMesPasado), hasta: finMesPasado };
    }
    case "anio":
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case "anio_pasado": {
      const anioPasado = Number(hoy.slice(0, 4)) - 1;
      return { desde: `${anioPasado}-01-01`, hasta: `${anioPasado}-12-31` };
    }
  }
}

const ETIQUETA_ESTADO: Record<OrderStatus, string> = {
  nuevo: "Nuevo",
  aceptado: "Aceptado",
  preparando: "Preparando",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Rechazado",
};

/** Tope de días que se dibujan en el gráfico; más que eso es ilegible igual. */
const MAX_DIAS_GRAFICO = 180;

/**
 * A partir de este largo de rango el gráfico pasa de días a meses. Dos meses de
 * barras diarias ya son ilegibles en una pantalla, y un año es imposible.
 */
const DIAS_PARA_AGRUPAR_POR_MES = 62;

/** Días entre dos fechas YYYY-MM-DD, ambas inclusive. */
function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T12:00:00Z`).getTime();
  const b = new Date(`${hasta}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/** Primer día del mes siguiente al de `fecha` (YYYY-MM-DD). */
function mesSiguiente(fecha: string): string {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  return mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
}

/** "2026-03-01" → "mar 2026" */
function etiquetaMes(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

/** 95 → "1 min 35 s". Para tiempos de cocina, los segundos sueltos no dicen nada. */
function duracion(segundos: number): string {
  if (segundos <= 0) return "—";
  const min = Math.floor(segundos / 60);
  const seg = Math.round(segundos % 60);
  if (min === 0) return `${seg} s`;
  if (min < 60) return seg > 0 ? `${min} min ${seg} s` : `${min} min`;
  const horas = Math.floor(min / 60);
  return `${horas} h ${min % 60} min`;
}

// ============================================================
// CSV
// ============================================================

function campoCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export default function ReportesPage() {
  // El rol es por local: lo resuelve el hook compartido a partir del local
  // seleccionado. Solo decide qué se dibuja; quien niega es la base.
  const { rol } = useRolLocal();

  const supabase = useMemo(() => createClient(), []);

  const [localId, setLocalId] = useState<string | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [localSlug, setLocalSlug] = useState("");
  const [resolvingLocal, setResolvingLocal] = useState(true);
  const [noLocal, setNoLocal] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [localesList, setLocalesList] = useState<{ id: string; nombre: string; slug: string }[]>([]);

  const rangoInicial = useMemo(() => rangoDePreset("hoy"), []);
  const [preset, setPreset] = useState<PresetRango>("hoy");
  const [desde, setDesde] = useState(rangoInicial.desde);
  const [hasta, setHasta] = useState(rangoInicial.hasta);

  const [datos, setDatos] = useState<DatosReporte | null>(null);
  const [errorCarga, setErrorCarga] = useState<{ clave: string; msg: string } | null>(null);
  const [intento, setIntento] = useState(0); // lo incrementa "Reintentar"
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);
  /** Barra elegida en el gráfico de ventas. Ver el comentario del gráfico. */
  const [barraElegida, setBarraElegida] = useState<string | null>(null);

  const rangoValido = desde <= hasta;
  const clave = `${localId ?? ""}|${desde}|${hasta}`;

  const errorMsg = errorCarga?.clave === clave ? errorCarga.msg : null;
  const datosVigentes = datos?.clave === clave ? datos : null;
  const loading = !datosVigentes && !errorMsg;

  const resumen = datosVigentes?.resumen ?? null;
  const porDia = useMemo(() => datosVigentes?.porDia ?? [], [datosVigentes]);
  const porMes = useMemo(() => datosVigentes?.porMes ?? [], [datosVigentes]);
  const topProductos = useMemo(() => datosVigentes?.topProductos ?? [], [datosVigentes]);
  const tiempos = datosVigentes?.tiempos ?? null;

  // ===== Resolución de local (mismo patrón que /dashboard/menu) =====
  useEffect(() => {
    async function resolveLocal() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: adminRow } = await supabase
        .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      // Solo controla la visibilidad del link "Alta de local", no el acceso a datos.
      setIsPlatformAdmin(!!adminRow);

      // Los locales gestionables salen SIEMPRE de local_staff: la RLS exige esa fila
      // para leer datos, así que ser super-admin no basta por sí solo.
      const { data: staffRows, error: staffError } = await supabase
        .from("local_staff")
        .select("local_id, locales(id, nombre, slug)")
        .eq("user_id", user.id);

      let availableLocales: { id: string; nombre: string; slug: string }[] = [];

      if (!staffError) {
        availableLocales = (staffRows ?? [])
          .map((s) => s.locales)
          .filter((l): l is { id: string; nombre: string; slug: string } => Boolean(l && l.id))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
      }

      if (availableLocales.length === 0) {
        setResolvingLocal(false);
        setNoLocal(true);
        return;
      }

      setLocalesList(availableLocales);

      const savedLocalId = typeof window !== "undefined" ? localStorage.getItem("garzon_selected_local_id") : null;
      const validSaved = availableLocales.find((l) => l.id === savedLocalId);
      const chosen = validSaved || availableLocales[0];

      setLocalId(chosen.id);
      setLocalNombre(chosen.nombre);
      setLocalSlug(chosen.slug);
      if (typeof window !== "undefined") {
        localStorage.setItem("garzon_selected_local_id", chosen.id);
      }
      setResolvingLocal(false);
    }
    resolveLocal();
  }, [supabase]);

  function handleLocalChange(newId: string) {
    const chosen = localesList.find((l) => l.id === newId);
    if (!chosen) return;
    setLocalId(chosen.id);
    setLocalNombre(chosen.nombre);
    setLocalSlug(chosen.slug);
    if (typeof window !== "undefined") {
      avisarCambioDeLocal(chosen.id); // avisa a la nav: el rol es por local
      // y puede cambiar al cambiar de local.
    }
    // El efecto de carga reacciona al cambio de localId.
  }

  // ===== Carga del reporte =====
  // Nunca se llama setState de forma sincrónica acá: todo ocurre después del
  // await, y el spinner sale de comparar `datos.clave` con la clave actual.
  useEffect(() => {
    if (!localId || !rangoValido) return;
    let vigente = true;

    async function correr(currentLocalId: string, claveActual: string) {
      const args = { p_local_id: currentLocalId, p_desde: desde, p_hasta: hasta };

      const [resResumen, resDias, resMeses, resTop, resTiempos] = await Promise.all([
        supabase.rpc("reporte_ventas", args),
        supabase.rpc("reporte_ventas_por_dia", args),
        supabase.rpc("reporte_ventas_por_mes", args),
        supabase.rpc("reporte_top_productos", { ...args, p_limite: 10 }),
        supabase.rpc("reporte_tiempos", args),
      ]);

      if (!vigente) return; // el usuario ya cambió de rango o de local

      if (resResumen.error || resDias.error || resMeses.error || resTop.error || resTiempos.error) {
        setErrorCarga({ clave: claveActual, msg: "No se pudo cargar el reporte; reintenta en unos segundos." });
        return;
      }

      const filas = (resResumen.data as ResumenVentas[] | null) ?? [];
      setDatos({
        clave: claveActual,
        resumen: filas[0] ?? null,
        porDia: (resDias.data as VentaPorDia[] | null) ?? [],
        porMes: (resMeses.data as VentaPorMes[] | null) ?? [],
        topProductos: (resTop.data as TopProducto[] | null) ?? [],
        tiempos: ((resTiempos.data as TiemposCocina[] | null) ?? [])[0] ?? null,
      });
    }

    // El .catch importa: si el fetch se cae por red (y no devuelve `{ error }`),
    // sin esto la promesa queda rechazada sin manejar y el spinner se queda
    // girando para siempre. En una tablet con wifi malo eso pasa.
    correr(localId, clave).catch(() => {
      if (!vigente) return;
      setErrorCarga({ clave, msg: "No se pudo cargar el reporte; revisa la conexión." });
    });
    return () => { vigente = false; };
  }, [supabase, localId, desde, hasta, rangoValido, clave, intento]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function aplicarPreset(nuevo: PresetRango) {
    setPreset(nuevo);
    if (nuevo === "personalizado") return; // conserva el rango visible como punto de partida
    const rango = rangoDePreset(nuevo);
    setDesde(rango.desde);
    setHasta(rango.hasta);
  }

  // ===== Serie del gráfico, rellenada con ceros =====
  // Las RPC solo devuelven periodos CON pedidos: sin el relleno, un martes
  // muerto desaparecería del gráfico en vez de mostrarse en cero — que es
  // justamente el dato que el dueño necesita ver.
  //
  // Por días para rangos cortos y por meses para los largos: un año en barras
  // diarias son 365 rayas ilegibles.
  const agrupadoPorMes = rangoValido && diasEntre(desde, hasta) > DIAS_PARA_AGRUPAR_POR_MES;

  const serieGrafico = useMemo(() => {
    if (!rangoValido) return [] as { clave: string; etiqueta: string; pedidos: number; venta: number }[];

    if (agrupadoPorMes) {
      const porClave = new Map(porMes.map((m) => [m.mes, m]));
      const serie: { clave: string; etiqueta: string; pedidos: number; venta: number }[] = [];
      let cursor = primerDiaMes(desde);
      const tope = primerDiaMes(hasta);
      while (cursor <= tope) {
        const m = porClave.get(cursor);
        serie.push({
          clave: cursor,
          etiqueta: etiquetaMes(cursor),
          pedidos: m?.pedidos ?? 0,
          venta: m?.venta ?? 0,
        });
        cursor = mesSiguiente(cursor);
      }
      return serie;
    }

    const porFecha = new Map(porDia.map((d) => [d.dia, d]));
    const serie: { clave: string; etiqueta: string; pedidos: number; venta: number }[] = [];
    let cursor = desde;
    while (cursor <= hasta && serie.length < MAX_DIAS_GRAFICO) {
      const d = porFecha.get(cursor);
      serie.push({
        clave: cursor,
        etiqueta: etiquetaDia(cursor),
        pedidos: d?.pedidos ?? 0,
        venta: d?.venta ?? 0,
      });
      cursor = sumarDias(cursor, 1);
    }
    return serie;
  }, [agrupadoPorMes, porDia, porMes, desde, hasta, rangoValido]);

  const maxVentaDia = useMemo(
    () => serieGrafico.reduce((max, d) => Math.max(max, d.venta), 0),
    [serieGrafico]
  );
  const maxUnidades = useMemo(
    () => topProductos.reduce((max, p) => Math.max(max, p.unidades), 0),
    [topProductos]
  );

  // ===== Exportar CSV =====
  async function exportarCsv() {
    if (!localId || !rangoValido) return;
    setExportando(true);
    setErrorExport(null);

    const inicio = inicioDiaChile(desde).toISOString();
    const fin = inicioDiaChile(sumarDias(hasta, 1)).toISOString(); // exclusivo

    // Paginado: PostgREST puede topar la cantidad de filas por respuesta.
    const PAGINA = 1000;
    const MAX_PAGINAS = 20;
    const filas: PedidoExport[] = [];

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data, error } = await supabase
        .from("pedidos")
        .select("numero_pedido, created_at, mesa, nombre_cliente, estado, total")
        .eq("local_id", localId)
        .gte("created_at", inicio)
        .lt("created_at", fin)
        .order("created_at", { ascending: true })
        .order("numero_pedido", { ascending: true }) // desempate: sin él el paginado puede repetir filas
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

      if (error) {
        setErrorExport("No se pudo exportar el detalle; reintenta.");
        setExportando(false);
        return;
      }

      const lote = (data ?? []) as PedidoExport[];
      filas.push(...lote);
      if (lote.length < PAGINA) break;

      // Un CSV recortado en silencio se lee como si fuera completo, y con eso el
      // dueño concilia una caja con datos que le faltan. Si se llega al tope, se
      // avisa en vez de entregar un archivo mudo.
      if (pagina === MAX_PAGINAS - 1) {
        setErrorExport(
          `El archivo quedó limitado a ${filas.length.toLocaleString("es-CL")} pedidos. ` +
            "Exportá el período en tramos más cortos para tenerlo completo."
        );
      }
    }

    const cabecera = ["Número", "Fecha y hora", "Mesa", "Cliente", "Estado", "Total"].join(";");
    const cuerpo = filas.map((p) =>
      [
        p.numero_pedido,
        campoCsv(fechaHoraChile(p.created_at)),
        campoCsv(p.mesa ?? ""),
        campoCsv(p.nombre_cliente ?? ""),
        campoCsv(ETIQUETA_ESTADO[p.estado] ?? p.estado),
        p.total,
      ].join(";")
    );

    // BOM para que Excel en español lea bien las tildes.
    const contenido = `﻿${[cabecera, ...cuerpo].join("\r\n")}\r\n`;
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `pedidos-${localSlug || "local"}-${desde}_a_${hasta}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);

    setExportando(false);
  }

  // ===== Pantallas de espera / sin local =====
  if (resolvingLocal) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-dvh dashboard-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
          </div>
          <p className="text-stone-500 text-sm font-medium">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  if (noLocal) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-dvh dashboard-dark px-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl dash-bg-surface flex items-center justify-center text-2xl">⚠️</div>
          <h2 className="font-bold dash-text-primary text-base">Sin local asociado</h2>
          <p className="text-stone-500 text-sm">Tu cuenta no está vinculada a ningún local. Contacta al administrador.</p>
          <button
            onClick={handleSignOut}
            className="mt-2 px-4 py-2 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
          >Cerrar sesión</button>
        </div>
      </div>
    );
  }

  const ventaPendiente = resumen ? resumen.venta_total - resumen.venta_entregada : 0;
  // Sin fila de resumen se trata como período vacío: mejor el estado honesto que una pantalla en blanco.
  const sinPedidos = !resumen || resumen.pedidos_total === 0;
  const rangoEsUnDia = desde === hasta;

  return (
    <div className="flex flex-col min-h-dvh dashboard-dark">
      {/* ===== HEADER ===== */}
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
              🍔
            </div>
            <div className="min-w-0">
              {localesList.length > 1 ? (
                <div className="flex items-center gap-2">
                  <select
                    value={localId ?? ""}
                    onChange={(e) => handleLocalChange(e.target.value)}
                    className="bg-stone-900 border border-stone-700 text-white font-bold text-sm md:text-base rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-sm"
                  >
                    {localesList.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <h1 className="font-bold dash-text-primary text-base">{localNombre || "Garzón Digital"}</h1>
              )}
              <p className="text-[11px] dash-text-muted">Garzón Digital · Panel de control</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 md:gap-3 flex-wrap min-w-0">

            {/* La cuenta vive al lado de cerrar sesión, no entre las pestañas del
                local: la contraseña es de la persona, no del local. */}
            <Link
              href="/dashboard/cuenta"
              className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
              title="Tu cuenta"
            >
              🔑
            </Link>

            <button
              onClick={handleSignOut}
              className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
              title="Cerrar sesión"
            >
              🚪
            </button>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto mt-2.5">
          <NavPanel actual="reportes" rol={rol} esPlatformAdmin={isPlatformAdmin} className="flex" />
        </div>
      </header>

      <AvisoSuscripcion localId={localId} />

      <main className="flex-1 p-3 md:p-5">
        <div className="max-w-[1600px] mx-auto space-y-4">
          {/* ===== SELECTOR DE RANGO ===== */}
          <div className="dash-card rounded-2xl border-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => aplicarPreset(p.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-transform hover:scale-[1.03] active:scale-95 ${
                      preset === p.id
                        ? "text-stone-900 bg-gradient-to-r from-orange-500 to-amber-500"
                        : "dash-bg-surface dash-text-secondary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                onClick={exportarCsv}
                disabled={exportando || loading || !rangoValido || sinPedidos}
                className="px-3 py-2 rounded-xl text-xs font-semibold dash-bg-surface dash-text-primary hover:opacity-80 transition-opacity disabled:opacity-40"
                title="Descargar el detalle de pedidos del período"
              >
                {exportando ? "Preparando…" : "⬇ Exportar CSV"}
              </button>
            </div>

            {preset === "personalizado" && (
              <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-stone-800">
                <div>
                  <label htmlFor="reportes-desde" className="text-xs font-semibold dash-text-secondary block mb-1">Desde</label>
                  <input
                    id="reportes-desde"
                    type="date"
                    value={desde}
                    max={hoyChile()}
                    onChange={(e) => setDesde(e.target.value)}
                    className="rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label htmlFor="reportes-hasta" className="text-xs font-semibold dash-text-secondary block mb-1">Hasta</label>
                  <input
                    id="reportes-hasta"
                    type="date"
                    value={hasta}
                    max={hoyChile()}
                    onChange={(e) => setHasta(e.target.value)}
                    className="rounded-lg dash-bg-surface px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] dash-text-muted mt-3">
              {rangoEsUnDia
                ? fechaLarga(desde)
                : `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`}
              {" · hora de Chile"}
            </p>
          </div>

          {!rangoValido ? (
            <div className="dash-card rounded-2xl border-2 p-10 text-center">
              <p className="dash-text-secondary text-sm font-semibold">
                La fecha de inicio no puede ser posterior a la de término.
              </p>
            </div>
          ) : loading ? (
            <div className="dash-card rounded-2xl border-2 p-16 flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
                <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
              </div>
              <p className="text-stone-500 text-sm font-medium">Calculando el período...</p>
            </div>
          ) : errorMsg ? (
            <div className="dash-card rounded-2xl border-2 p-10 text-center space-y-3">
              <p className="text-red-300 text-sm font-semibold">⚠️ {errorMsg}</p>
              <button
                onClick={() => { setErrorCarga(null); setIntento((n) => n + 1); }}
                className="px-4 py-2 rounded-xl dash-bg-surface dash-text-secondary text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                Reintentar
              </button>
            </div>
          ) : sinPedidos ? (
            <div className="dash-card rounded-2xl border-2 p-16 text-center">
              <div className="text-3xl mb-3">🧾</div>
              <p className="dash-text-secondary text-sm font-semibold">Sin pedidos en este período</p>
              <p className="dash-text-muted text-xs mt-1">Prueba con otro rango de fechas.</p>
            </div>
          ) : resumen ? (
            <>
              {/* ===== TARJETAS PRINCIPALES ===== */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="dash-card rounded-2xl border-2 p-5">
                  <p className="text-xs font-semibold dash-text-muted uppercase tracking-wide">Venta total</p>
                  <p className="text-3xl md:text-4xl font-bold dash-text-primary tabular-nums mt-2">
                    {formatPrice(resumen.venta_total)}
                  </p>
                  <p className="text-[11px] dash-text-muted mt-1">No incluye pedidos rechazados.</p>
                </div>

                <div className="dash-card rounded-2xl border-2 p-5">
                  <p className="text-xs font-semibold dash-text-muted uppercase tracking-wide">Pedidos</p>
                  <p className="text-3xl md:text-4xl font-bold dash-text-primary tabular-nums mt-2">
                    {resumen.pedidos_total.toLocaleString("es-CL")}
                  </p>
                  <p className="text-[11px] dash-text-muted mt-1">Total recibidos en el período.</p>
                </div>

                <div className="dash-card rounded-2xl border-2 p-5">
                  <p className="text-xs font-semibold dash-text-muted uppercase tracking-wide">Ticket promedio</p>
                  <p className="text-3xl md:text-4xl font-bold dash-text-primary tabular-nums mt-2">
                    {formatPrice(resumen.ticket_promedio)}
                  </p>
                  <p className="text-[11px] dash-text-muted mt-1">Promedio por pedido no rechazado.</p>
                </div>
              </div>

              {/* ===== DESGLOSE POR ESTADO ===== */}
              <div className="dash-card rounded-2xl border-2 p-4">
                <h2 className="font-bold dash-text-primary text-sm mb-3">Desglose del período</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-green-500">
                    <p className="text-xs font-semibold dash-text-secondary">Entregados</p>
                    <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                      {formatPrice(resumen.venta_entregada)}
                    </p>
                    <p className="text-[11px] dash-text-muted mt-0.5">
                      {resumen.pedidos_entregados} pedido(s) · esto es lo que debería estar en la caja
                    </p>
                  </div>

                  <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-amber-500">
                    <p className="text-xs font-semibold dash-text-secondary">Pendientes</p>
                    <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                      {formatPrice(ventaPendiente)}
                    </p>
                    <p className="text-[11px] dash-text-muted mt-0.5">
                      {resumen.pedidos_pendientes} pedido(s) · todavía en curso, aún no cobrados
                    </p>
                  </div>

                  <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-stone-600">
                    <p className="text-xs font-semibold dash-text-secondary">Rechazados</p>
                    <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                      {resumen.pedidos_cancelados.toLocaleString("es-CL")}
                    </p>
                    <p className="text-[11px] dash-text-muted mt-0.5">
                      No suman a la venta ni al ticket promedio
                    </p>
                  </div>

                  {/* La propina va SEPARADA de la venta a propósito: no es plata del
                      local, es del personal. Sumarla a "venta" inflaría el número con
                      el que el dueño calcula su negocio. */}
                  <div className="rounded-xl dash-bg-surface px-4 py-3 border-l-4 border-sky-500">
                    <p className="text-xs font-semibold dash-text-secondary">Propinas</p>
                    <p className="text-2xl font-bold dash-text-primary tabular-nums mt-1">
                      {formatPrice(resumen.propinas_total)}
                    </p>
                    <p className="text-[11px] dash-text-muted mt-0.5">
                      Aparte de la venta · las cobra el local en caja y son del personal
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== TIEMPOS DE COCINA (F8) =====
                  Sale de la bitácora `pedido_eventos`, no de `updated_at` — que
                  dejó de ser confiable cuando se habilitó reabrir una entrega.
                  Solo se muestra si hay pedidos medidos: los históricos anteriores
                  a F8 no tienen eventos y darían ceros engañosos. */}
              {tiempos && tiempos.pedidos_medidos > 0 && (
                <div className="dash-card rounded-2xl border-2 p-4">
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-bold dash-text-primary text-sm">Tiempos de cocina</h2>
                    <span className="text-[11px] dash-text-muted">
                      mediana de {tiempos.pedidos_medidos} pedido{tiempos.pedidos_medidos !== 1 && "s"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { etiqueta: "Hasta aceptar", seg: tiempos.seg_hasta_aceptado, detalle: "cuánto espera el cliente a que le tomen el pedido" },
                      { etiqueta: "Hasta estar listo", seg: tiempos.seg_hasta_listo, detalle: "desde que entra hasta que sale de cocina" },
                      { etiqueta: "Hasta entregar", seg: tiempos.seg_hasta_entregado, detalle: "el ciclo completo" },
                    ].map((t) => (
                      <div key={t.etiqueta} className="dash-bg-surface rounded-xl p-3">
                        <p className="text-[11px] dash-text-muted uppercase tracking-wide font-medium">
                          {t.etiqueta}
                        </p>
                        <p className="text-xl font-bold dash-text-primary tabular-nums mt-0.5">
                          {duracion(t.seg)}
                        </p>
                        <p className="text-[11px] dash-text-muted mt-1 leading-snug">{t.detalle}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== VENTAS POR DÍA ===== */}
              {!rangoEsUnDia && serieGrafico.length > 1 && (
                <div className="dash-card rounded-2xl border-2 p-4">
                  <div className="flex items-baseline justify-between mb-4">
                    {/* "sin rechazados" explícito: el resumen de arriba cuenta TODOS los
                        pedidos y esta serie excluye los cancelados, así que sin la
                        aclaración el dueño vería dos cifras distintas de "pedidos"
                        en la misma pantalla y no sabría cuál creer. */}
                    <h2 className="font-bold dash-text-primary text-sm">
                      Ventas por {agrupadoPorMes ? "mes" : "día"}{" "}
                      <span className="font-normal dash-text-muted text-[11px]">· sin rechazados</span>
                    </h2>
                    {(() => {
                      const elegida = serieGrafico.find((d) => d.clave === barraElegida);
                      return elegida ? (
                        <span className="text-[11px] dash-text-secondary tabular-nums" aria-live="polite">
                          {elegida.etiqueta}: {formatPrice(elegida.venta)} · {elegida.pedidos} pedido(s)
                        </span>
                      ) : (
                        <span className="text-[11px] dash-text-muted">Máximo: {formatPrice(maxVentaDia)}</span>
                      );
                    })()}
                  </div>

                  {/* El valor de cada barra se mostraba solo con `group-hover` y un
                      `title`. En una pantalla táctil —que es donde vive este panel,
                      la tablet de la cocina— no hay ninguna de las dos cosas, así
                      que el gráfico no tenía un solo número legible. Ahora cada
                      barra es un botón: tocarla la fija y su dato sale en el
                      encabezado. El hover se conserva para el notebook.

                      Botones y no `role="img"` sobre el conjunto: `img` vuelve
                      presentacional todo lo de adentro, y entonces las barras
                      dejarían de poder tocarse. Cada botón lleva su propio
                      `aria-label` con la cifra, que es el dato que antes no salía
                      por ningún lado. */}
                  <div className="overflow-x-auto">
                    <div
                      role="group"
                      aria-label={`Ventas por ${agrupadoPorMes ? "mes" : "día"}, ${serieGrafico.length} ${agrupadoPorMes ? "meses" : "días"}, máximo ${formatPrice(maxVentaDia)}`}
                      className="flex items-end gap-1 md:gap-1.5 h-44 min-w-full"
                    >
                      {serieGrafico.map((d) => {
                        const alturaPct = maxVentaDia > 0 ? (d.venta / maxVentaDia) * 100 : 0;
                        const elegida = barraElegida === d.clave;
                        return (
                          <button
                            key={d.clave}
                            type="button"
                            onClick={() => setBarraElegida(elegida ? null : d.clave)}
                            aria-pressed={elegida}
                            aria-label={`${d.etiqueta}: ${formatPrice(d.venta)} en ${d.pedidos} pedido(s)`}
                            className="flex-1 min-w-[14px] h-full flex flex-col justify-end items-center group rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                            title={`${d.etiqueta} · ${d.pedidos} pedido(s) · ${formatPrice(d.venta)}`}
                          >
                            <span
                              className={`text-[10px] dash-text-secondary tabular-nums transition-opacity whitespace-nowrap ${
                                elegida ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}
                            >
                              {d.venta > 0 ? formatPrice(d.venta) : "—"}
                            </span>
                            <div
                              className={`w-full rounded-t-md transition-[height] ${
                                d.venta > 0
                                  ? "bg-gradient-to-t from-orange-600 to-amber-400"
                                  : "bg-stone-800"
                              } ${elegida ? "ring-2 ring-white/70" : ""}`}
                              style={{ height: d.venta > 0 ? `max(4px, ${alturaPct}%)` : "3px" }}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-1 md:gap-1.5 mt-2 min-w-full">
                      {serieGrafico.map((d, i) => {
                        // Con rangos largos se etiquetan solo algunos para que no se pisen.
                        const paso = Math.ceil(serieGrafico.length / (agrupadoPorMes ? 12 : 15));
                        const mostrar = i % paso === 0 || i === serieGrafico.length - 1;
                        return (
                          <div key={d.clave} className="flex-1 min-w-[14px] text-center">
                            <span className="text-[10px] dash-text-muted tabular-nums whitespace-nowrap">
                              {mostrar ? (agrupadoPorMes ? d.etiqueta.slice(0, 3) : d.clave.slice(8, 10)) : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!agrupadoPorMes && serieGrafico.length >= MAX_DIAS_GRAFICO && (
                    <p className="text-[11px] dash-text-muted mt-2">
                      Se muestran los primeros {MAX_DIAS_GRAFICO} días del rango.
                    </p>
                  )}
                </div>
              )}

              {/* ===== TOP PRODUCTOS ===== */}
              <div className="dash-card rounded-2xl border-2 p-4">
                <h2 className="font-bold dash-text-primary text-sm mb-3">Productos más vendidos</h2>

                {topProductos.length === 0 ? (
                  <div className="dash-col-empty rounded-xl border-2 border-dashed p-8 text-center dash-text-muted text-sm">
                    Sin productos vendidos en este período.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-2 text-xs font-semibold dash-text-muted uppercase tracking-wide">Producto</th>
                          <th className="pb-2 text-xs font-semibold dash-text-muted uppercase tracking-wide w-[35%]">Proporción</th>
                          <th className="pb-2 text-xs font-semibold dash-text-muted uppercase tracking-wide text-right">Unidades</th>
                          <th className="pb-2 text-xs font-semibold dash-text-muted uppercase tracking-wide text-right">Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProductos.map((p, i) => {
                          const anchoPct = maxUnidades > 0 ? (p.unidades / maxUnidades) * 100 : 0;
                          return (
                            <tr key={p.producto_id ?? `sin-id-${i}`} className="border-t border-stone-800">
                              <td className="py-2.5 pr-3 dash-text-primary font-semibold">
                                <span className="dash-text-muted tabular-nums mr-2">{i + 1}.</span>
                                {p.nombre}
                              </td>
                              <td className="py-2.5 pr-3">
                                <div className="h-2 rounded-full bg-stone-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                                    style={{ width: `${anchoPct}%` }}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 text-right dash-text-primary tabular-nums font-bold whitespace-nowrap">
                                {p.unidades.toLocaleString("es-CL")}
                              </td>
                              <td className="py-2.5 text-right dash-text-secondary tabular-nums whitespace-nowrap">
                                {formatPrice(p.venta)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>

      {/* Toast del exportador, discreto y descartable. */}
      {errorExport && (
        <button
          onClick={() => setErrorExport(null)}
          // El aviso aparece abajo del todo, lejos del botón de exportar que se
          // acaba de tocar, y se va solo. Sin `alert` no se entera nadie que no
          // esté mirando esa esquina.
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-950/80 border border-red-800/60 text-red-200 text-sm font-medium shadow-lg backdrop-blur-sm"
        >
          ⚠️ {errorExport}
        </button>
      )}
    </div>
  );
}
