"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, orderNumber } from "@/lib/utils";
import { formatearTelefonoChileno } from "@/lib/telefono";
import type { OrderStatus, PedidoConItems } from "@/types/database";
import AvisoSuscripcion from "./aviso-suscripcion";
import { NavPanel } from "@/app/dashboard/nav-panel";
import { useConfirmar } from "@/componentes/usar-confirmar";
import { useRolLocal, avisarCambioDeLocal } from "@/lib/usar-rol";
import { puede } from "@/lib/roles";

const COLUMNS: { key: OrderStatus; label: string; icon: string; accent: string }[] = [
  { key: "nuevo", label: "Nuevos", icon: "🆕", accent: "from-blue-500 to-blue-600" },
  { key: "aceptado", label: "Aceptados", icon: "✅", accent: "from-amber-500 to-amber-600" },
  { key: "preparando", label: "En Cocina", icon: "🔥", accent: "from-orange-500 to-orange-600" },
  { key: "listo", label: "Listos", icon: "🔔", accent: "from-green-500 to-green-600" },
];

const NEXT_STATUS: Record<string, OrderStatus> = {
  nuevo: "aceptado", aceptado: "preparando", preparando: "listo", listo: "entregado",
};

const ACTION_LABELS: Record<string, string> = {
  nuevo: "Aceptar", aceptado: "A Cocina", preparando: "¡Listo!", listo: "Entregar",
};

const ACTION_ICONS: Record<string, string> = {
  nuevo: "✅", aceptado: "🔥", preparando: "🔔", listo: "📦",
};

// Singleton AudioContext: browsers suspend contexts created without a user
// gesture, so we create/resume this one lazily from a click handler and
// reuse it for every notification.
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

function playNotificationSound() {
  const ctx = sharedAudioCtx;
  if (!ctx || ctx.state !== "running") return;
  try {
    // Double beep for urgency
    [0, 0.2].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.25;
      osc.start(ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
      osc.stop(ctx.currentTime + offset + 0.3);
    });
  } catch { /* Audio not available */ }
}

// Medianoche de HOY en America/Santiago, consistente con la numeración de
// pedidos (que también usa hora de Chile) e independiente de la zona horaria
// que tenga configurada la tablet.
function medianocheChile(): Date {
  const now = new Date();
  const chileNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const offsetMs = now.getTime() - chileNow.getTime();
  chileNow.setHours(0, 0, 0, 0);
  return new Date(chileNow.getTime() + offsetMs);
}

function TimerBadge({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "warning" | "danger">("normal");

  useEffect(() => {
    function update() {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, "0")}`);
      setUrgency(mins >= 15 ? "danger" : mins >= 8 ? "warning" : "normal");
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className={`text-xs font-mono font-bold tabular-nums ${
      urgency === "danger" ? "text-red-400" : urgency === "warning" ? "text-amber-400" : "text-stone-500"
    }`}>
      ⏱ {elapsed}
    </span>
  );
}

export default function DashboardPage() {
  // El rol es por local: lo resuelve el hook compartido a partir del local
  // seleccionado. Solo decide qué se dibuja; quien niega es la base.
  const { rol } = useRolLocal();
  const { confirmar, dialogo } = useConfirmar();

  const supabase = useMemo(() => createClient(), []);
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 });
  const prevCountRef = useRef(0);

  const [localId, setLocalId] = useState<string | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [resolvingLocal, setResolvingLocal] = useState(true);
  const [noLocal, setNoLocal] = useState(false);

  const [localesList, setLocalesList] = useState<{ id: string; nombre: string; slug: string }[]>([]);

  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado del canal realtime, visible en el header: en una cocina hay que
  // poder distinguir "no hay pedidos" de "perdí la conexión".
  const [conexion, setConexion] = useState<"conectando" | "en-vivo" | "sin-conexion">("conectando");

  // Pedidos cerrados hoy (entregados o cancelados), para poder revisarlos y
  // deshacer una entrega marcada por error.
  const [cerrados, setCerrados] = useState<PedidoConItems[]>([]);
  const [showCerrados, setShowCerrados] = useState(false);

  // Toast de deshacer tras marcar un pedido como entregado.
  const [undoPedido, setUndoPedido] = useState<{ id: string; numero: number } | null>(null);

  // Pedido cuyo teléfono está a la vista. Es UNO solo, no un conjunto: la
  // pantalla de la cocina está a la vista del público (y a veces del comensal
  // que espera), así que el número se muestra a pedido, de a uno y sin
  // persistirse — al recargar o cambiar de local vuelve a estar oculto.
  const [telefonoVisibleId, setTelefonoVisibleId] = useState<string | null>(null);

  // Espejos en ref de "lo vigente ahora". `localIdRef` deja descartar respuestas
  // en vuelo del local anterior; `showCerradosRef` deja que el handler de
  // realtime consulte el panel sin entrar en las dependencias del efecto (si
  // entrara, abrir el panel forzaría una re-suscripción del canal).
  // Se declaran ANTES del efecto de realtime para que React los sincronice primero.
  const localIdRef = useRef<string | null>(null);
  const showCerradosRef = useRef(false);

  useEffect(() => { localIdRef.current = localId; }, [localId]);
  useEffect(() => { showCerradosRef.current = showCerrados; }, [showCerrados]);

  useEffect(() => {
    async function resolveLocal() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: adminRow } = await supabase
        .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      // Solo controla la visibilidad del link "Alta de local", no el acceso a datos.
      setIsPlatformAdmin(!!adminRow);

      // Los locales gestionables salen SIEMPRE de local_staff: la RLS exige esa
      // fila para leer/escribir datos, así que ser super-admin no basta por sí
      // solo. Listar todos los locales mostraba cocinas vacías sin error.
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
    setLoading(true);
    setConexion("conectando");
    setCerrados([]);
    // Sin esto, "Deshacer" seguía visible tras cambiar de local: reabría el
    // pedido del local anterior y en pantalla no pasaba nada.
    setUndoPedido(null);
    // Un teléfono revelado no puede sobrevivir al cambio de local: es el dato
    // de un cliente de otra cocina.
    setTelefonoVisibleId(null);
    if (typeof window !== "undefined") {
      avisarCambioDeLocal(chosen.id); // avisa a la nav: el rol es por local
      // y puede cambiar al cambiar de local.
    }
  }

  // Kanban: todos los pedidos activos del local, sin filtro de fecha (son
  // pocos por definición ya que excluyen estados terminales).
  const fetchPedidos = useCallback(async () => {
    if (!localId) return;

    const { data } = await supabase
      .from("pedidos")
      .select(`*, pedido_items (*, producto:productos (*))`)
      .eq("local_id", localId)
      .not("estado", "in", "(entregado,cancelado)")
      .order("created_at", { ascending: true });

    // Con wifi malo, la respuesta del local anterior puede llegar DESPUÉS de
    // haber cambiado de local en el selector. Sin esta guarda, el header decía
    // "Local B" y el Kanban mostraba pedidos de A — y tocar "Aceptar" avanzaba
    // un pedido del local equivocado.
    if (localIdRef.current !== localId) return;

    setPedidos((data ?? []) as PedidoConItems[]);
    setLoading(false);

    // Stats del header: sí filtran por día, pero excluyen cancelados para
    // que la "Venta" no cuente pedidos rechazados.
    const today = medianocheChile();

    const { data: allToday } = await supabase
      .from("pedidos")
      .select("total")
      .eq("local_id", localId)
      .gte("created_at", today.toISOString())
      .neq("estado", "cancelado")
      .returns<{ total: number }[]>();

    if (localIdRef.current !== localId) return;

    if (allToday) {
      setTodayStats({ count: allToday.length, total: allToday.reduce((s, p) => s + p.total, 0) });
    }
  }, [supabase, localId]);

  // Pedidos ya cerrados hoy. Se consultan aparte del Kanban porque son los
  // únicos que no queremos en pantalla permanentemente.
  const fetchCerrados = useCallback(async () => {
    if (!localId) return;

    const { data } = await supabase
      .from("pedidos")
      .select(`*, pedido_items (*, producto:productos (*))`)
      .eq("local_id", localId)
      .in("estado", ["entregado", "cancelado"])
      // Por `updated_at` y no `created_at`: una fuente de soda que cierra
      // después de medianoche entrega pedidos tomados "ayer", y con el filtro
      // por fecha de creación esos quedaban fuera del panel de ningún día.
      .gte("updated_at", medianocheChile().toISOString())
      .order("updated_at", { ascending: false });

    if (localIdRef.current !== localId) return;

    setCerrados((data ?? []) as PedidoConItems[]);
  }, [supabase, localId]);

  useEffect(() => {
    if (!localId) return;

    // Carga inicial INMEDIATA, sin esperar al canal realtime. Antes el primer
    // fetch colgaba del callback SUBSCRIBED: si el wifi del local bloquea
    // WebSockets, la cocina se quedaba en "Cargando dashboard..." hasta que
    // entraba el polling de respaldo, 30 segundos después.
    // (El estado "conectando" es el inicial y lo repone handleLocalChange; no
    //  se setea acá para no encadenar renders dentro del efecto.)
    //
    // La regla set-state-in-effect da un falso positivo acá: ambas funciones son
    // async y su primer statement es un `await` a Supabase, así que ningún
    // setState ocurre de forma síncrona durante el commit del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPedidos();
    fetchCerrados();

    // El topic incluye el local: `channel()` REUTILIZA el canal si el topic ya
    // existe, y `removeChannel()` no lo da de baja hasta que el servidor
    // responde el "leave". Con un topic fijo, cambiar de local devolvía el canal
    // viejo en estado `leaving`, el `.subscribe()` era un no-op y el local nuevo
    // se quedaba sin realtime (y el indicador clavado en "Sin conexión").
    const channel = supabase
      .channel(`dashboard-orders-${localId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `local_id=eq.${localId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          playNotificationSound();
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        }
        fetchPedidos();

        // Un pedido cerrado desde OTRA tablet también tiene que aparecer acá:
        // es justo el caso multi-tablet que motiva el panel.
        const estadoNuevo = (payload.new as { estado?: string } | null)?.estado;
        if (showCerradosRef.current || estadoNuevo === "entregado" || estadoNuevo === "cancelado") {
          fetchCerrados();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Además de la carga inicial, cubre cada re-suscripción tras una
          // reconexión (puede haber pedidos perdidos en el hueco).
          setConexion("en-vivo");
          fetchPedidos();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConexion("sin-conexion");
          console.warn(`[dashboard] realtime "${status}"; dependiendo del polling de respaldo`);
        }
      });

    // Polling de respaldo: cubre huecos de realtime (reconexiones lentas,
    // eventos perdidos, etc.).
    function refrescar() {
      fetchPedidos();
      if (showCerradosRef.current) fetchCerrados();
    }

    const pollInterval = setInterval(refrescar, 30000);

    function handleVisibility() {
      if (document.visibilityState === "visible") refrescar();
    }
    function handleOnline() {
      refrescar();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [supabase, localId, fetchPedidos, fetchCerrados]);

  // Oculta el toast de error automáticamente.
  useEffect(() => {
    if (!errorMsg) return;
    const timeout = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timeout);
  }, [errorMsg]);

  // La ventana para deshacer una entrega es generosa: en pleno servicio nadie
  // reacciona en 3 segundos. Pasado el plazo, el pedido sigue recuperable desde
  // el panel "Cerrados hoy".
  useEffect(() => {
    if (!undoPedido) return;
    const timeout = setTimeout(() => setUndoPedido(null), 12000);
    return () => clearTimeout(timeout);
  }, [undoPedido]);

  // El navegador puede suspender el AudioContext por su cuenta (cambio de
  // pestaña, ahorro de energía). Se vigila para que el aviso de "sin sonido"
  // refleje el estado real y no lo que creíamos al activarlo.
  useEffect(() => {
    const interval = setInterval(() => {
      setSoundEnabled(sharedAudioCtx?.state === "running");
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const nuevoCount = pedidos.filter((p) => p.estado === "nuevo").length;
    document.title = nuevoCount > prevCountRef.current && prevCountRef.current > 0
      ? `(${nuevoCount}) 🔔 Nuevo Pedido | Garzón Digital`
      : "Dashboard | Garzón Digital";
    prevCountRef.current = nuevoCount;
  }, [pedidos]);

  // Compare-and-set: solo aplica el update si el pedido sigue en
  // `currentStatus`, para no pisar cambios hechos desde otra tablet.
  async function updateStatus(
    pedidoId: string, currentStatus: string, targetStatus?: string
  ): Promise<boolean> {
    const nextStatus = targetStatus ?? NEXT_STATUS[currentStatus];
    if (!nextStatus) return false;

    setUpdatingId(pedidoId);
    const { data, error } = await supabase
      .from("pedidos")
      .update({ estado: nextStatus })
      .eq("id", pedidoId)
      .eq("estado", currentStatus)
      .select();
    setUpdatingId(null);

    if (error || !data || data.length === 0) {
      setErrorMsg("No se pudo actualizar el pedido; reintenta.");
      fetchPedidos();
      return false;
    }

    fetchPedidos();
    // Solo cuando el movimiento afecta al panel: con `showCerrados` cerrado, un
    // simple "Aceptar" no tiene por qué disparar una consulta con joins de todos
    // los pedidos cerrados del día, en la pantalla más caliente del producto.
    const tocaCerrados =
      nextStatus === "entregado" || nextStatus === "cancelado" || currentStatus === "entregado";
    if (tocaCerrados || showCerrados) fetchCerrados();
    return true;
  }

  // Avance normal del Kanban. Marcar "Entregado" saca el pedido de la pantalla,
  // así que ese paso deja un toast de deshacer: en cocina los toques
  // accidentales existen y antes no había vuelta atrás.
  async function handleAvanzar(pedido: PedidoConItems) {
    const esEntrega = pedido.estado === "listo";
    const ok = await updateStatus(pedido.id, pedido.estado);
    if (ok && esEntrega) {
      setUndoPedido({ id: pedido.id, numero: pedido.numero_pedido });
    }
  }

  async function handleReject(pedidoId: string, currentStatus: string) {
    // La misma advertencia de siempre, repartida: la pregunta arriba y la
    // consecuencia abajo. Rechazar es terminal —no hay vuelta desde `cancelado`—
    // así que va en rojo y no con el cuadro gris del navegador.
    const ok = await confirmar({
      titulo: "¿Rechazar este pedido?",
      detalle: "El cliente será notificado.",
      destructivo: true,
    });
    if (!ok) return;
    await updateStatus(pedidoId, currentStatus, "cancelado");
  }

  // Deshacer una entrega: devuelve el pedido a la columna "Listos".
  // Requiere la transición entregado → listo (migración f5-1).
  async function handleReabrir(pedidoId: string) {
    setUndoPedido(null);
    const ok = await updateStatus(pedidoId, "entregado", "listo");
    if (!ok) setErrorMsg("No se pudo reabrir el pedido; puede que ya lo haya movido otra tablet.");
  }

  async function enableSound() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state !== "running") await ctx.resume();
      setSoundEnabled(ctx.state === "running");
    } catch {
      setSoundEnabled(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (resolvingLocal || (localId && loading)) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-dvh dashboard-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 border-4 border-stone-800 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
          </div>
          <p className="text-stone-500 text-sm font-medium">Cargando dashboard...</p>
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

  const nuevoCount = pedidos.filter((p) => p.estado === "nuevo").length;

  return (
    <div className="flex flex-col min-h-dvh dashboard-dark">
      {/* ===== HEADER ===== */}
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
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
                <h1 className="font-bold dash-text-primary text-base truncate">{localNombre || "Garzón Digital"}</h1>
              )}
              <p className="text-xs dash-text-muted">Garzón Digital · Panel de Control</p>
            </div>
          </div>

          {/* flex-wrap y no un ancho fijo: este bloque llegó a tener nav de siete
              entradas, botón de comanda, dos estadísticas, estado de conexión,
              "cerrados hoy" y tres iconos. Sin esto, en un notebook de 1024 px
              empujaba el ancho del body y el Kanban entero quedaba con scroll
              horizontal. */}
          <div className="flex items-center justify-end gap-2.5 md:gap-3 flex-wrap min-w-0">
            {/* Un toque de la cocina a la comanda. En un local chico la misma
                persona alterna entre las dos pantallas todo el servicio, así que
                este botón también se ve en móvil, donde la nav no.

                Secundario y no primario: este tablero existe para VER los
                pedidos que entran y moverlos de columna, no para tomarlos. Esto
                es un atajo a otra pantalla, y en gradiente le ganaba en peso
                visual a los botones de avance de las tarjetas, que son la razón
                por la que la cocina mira esta pantalla. Esos botones no llevan
                `btn-primario` porque no son uno solo ni son siempre el mismo:
                cada uno se pinta del color de la columna a la que manda el
                pedido, que es información y no jerarquía. Acá no hay primario, y
                está bien: la acción principal del panel es de a un pedido. */}
            {puede(rol, "tomar_comanda") && (
              <Link
                href="/dashboard/comanda"
                className="btn-secundario px-3.5 py-2 rounded-lg text-xs font-bold hover:scale-[1.02] active:scale-95 transition-transform whitespace-nowrap"
              >
                + Tomar pedido
              </Link>
            )}

            {/* Stats */}
            <div className="hidden lg:flex items-center gap-5">
              <div className="text-right">
                <p className="text-2xs dash-text-muted uppercase tracking-wider font-medium">Pedidos</p>
                <p className="text-lg font-bold dash-text-primary tabular-nums">{todayStats.count}</p>
              </div>
              {/* La venta del día es caja, y la caja es del dueño. Ojo: esto es
                  cosmético — el personal lee `pedidos.total` porque lo necesita
                  para trabajar, así que la suma se la podría hacer solo. Lo que
                  sí está cerrado de verdad son los reportes, que es donde vive
                  el histórico. */}
              {puede(rol, "ver_reportes") && (
                <>
                  <div className="w-px h-8 bg-stone-800" />
                  <div className="text-right">
                    <p className="text-2xs dash-text-muted uppercase tracking-wider font-medium">Venta</p>
                    <p className="text-lg font-bold text-green-400 tabular-nums">{formatPrice(todayStats.total)}</p>
                  </div>
                </>
              )}
            </div>

            {/* Estado de la conexión: distingue "no hay pedidos" de "no llegan".
                Cambia solo, sin que nadie toque nada, y dice si el sistema
                sigue funcionando: exactamente el caso de `aria-live`. "Polite"
                y no `alert` porque caerse del realtime no interrumpe el
                servicio — el polling de 30 segundos sigue trayendo pedidos. */}
            <div
              aria-live="polite"
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                conexion === "en-vivo"
                  ? "text-green-400"
                  : conexion === "sin-conexion"
                    ? "bg-red-950/60 text-red-300 border border-red-900/60"
                    : "dash-text-muted"
              }`}
              title={
                conexion === "sin-conexion"
                  ? "Sin conexión en vivo: los pedidos se actualizan cada 30 segundos"
                  : undefined
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  conexion === "en-vivo"
                    ? "bg-green-400 animate-pulse"
                    : conexion === "sin-conexion"
                      ? "bg-red-400"
                      : "bg-stone-500"
                }`}
              />
              {conexion === "en-vivo" ? "En vivo" : conexion === "sin-conexion" ? "Sin conexión" : "Conectando"}
            </div>

            {/* Cerrados hoy: red de seguridad ante una entrega marcada por error. */}
            <button
              onClick={() => { setShowCerrados((v) => !v); fetchCerrados(); }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80 whitespace-nowrap ${
                showCerrados ? "bg-stone-700 text-white" : "dash-bg-surface dash-text-secondary"
              }`}
            >
              📦 Cerrados hoy{cerrados.length > 0 && ` (${cerrados.length})`}
            </button>

            {/* El desbloqueo de sonido vive ahora en la barra de aviso de abajo:
                un botón discreto en el header pasaba desapercibido y la cocina
                se quedaba muda sin enterarse. */}

            {/* Contador de pedidos nuevos. NO es un botón: nunca tuvo `onClick`
                y no hay ninguna pantalla de notificaciones adonde llevar. Tenía
                el mismo fondo y tamaño que los dos botones de al lado, así que
                se tocaba y no pasaba nada; sin `dash-bg-surface` se lee como lo
                que es, un indicador.

                El `aria-live` va acá y no en el globo rojo: el globo aparece y
                desaparece con el contador, y una región viva que nace junto con
                su contenido no anuncia nada. El envoltorio está siempre, así que
                la llegada de un pedido —que es la única forma en que este
                tablero se actualiza solo— sí se escucha. "Polite" para no
                cortar a quien esté leyendo una comanda a mitad de servicio. */}
            <div className="relative" aria-live="polite">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" aria-hidden="true">🔔</div>
              {nuevoCount > 0 && (
                <span
                  aria-label={nuevoCount === 1 ? "1 pedido nuevo" : `${nuevoCount} pedidos nuevos`}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-2xs font-bold rounded-full flex items-center justify-center"
                >
                  {nuevoCount}
                </span>
              )}
            </div>

            {/* Sign out */}
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
          <NavPanel actual="pedidos" rol={rol} esPlatformAdmin={isPlatformAdmin} className="flex" />
        </div>
      </header>

      <AvisoSuscripcion localId={localId} />

      {/* ===== AVISO DE SONIDO =====
          El navegador exige un gesto del usuario para reproducir audio, y el
          permiso se pierde en cada recarga de la tablet. Antes eso dejaba la
          cocina muda sin que nadie lo notara: ahora ocupa una barra entera y no
          se puede ignorar. */}
      {!soundEnabled && (
        <button
          onClick={enableSound}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-950/70 border-b border-red-900/70 text-red-200 text-sm font-semibold hover:bg-red-900/60 transition-colors"
        >
          <span className="text-base">🔕</span>
          Los pedidos nuevos no van a sonar — toca aquí para activar el sonido
        </button>
      )}

      {/* ===== MOBILE STATS ===== */}
      <div className="sm:hidden flex items-center gap-4 px-4 py-3 border-b border-stone-800">
        <div className="flex-1 text-center">
          <p className="text-2xs dash-text-muted uppercase tracking-wider">Pedidos</p>
          <p className="text-xl font-bold dash-text-primary">{todayStats.count}</p>
        </div>
        <div className="w-px h-8 bg-stone-800" />
        <div className="flex-1 text-center">
          <p className="text-2xs dash-text-muted uppercase tracking-wider">Venta</p>
          <p className="text-xl font-bold text-green-400">{formatPrice(todayStats.total)}</p>
        </div>
      </div>

      {/* ===== CERRADOS HOY =====
          Antes, un pedido entregado desaparecía de la pantalla para siempre.
          Este panel es la red de seguridad: permite revisarlos y devolver a la
          cocina el que se marcó por error. */}
      {showCerrados && (
        <section className="border-b border-stone-800 bg-stone-950/40 px-3 md:px-5 py-4">
          <div className="max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold dash-text-primary text-sm">
                📦 Cerrados hoy <span className="dash-text-muted font-normal">({cerrados.length})</span>
              </h2>
              <button
                onClick={() => setShowCerrados(false)}
                className="text-xs dash-text-muted hover:opacity-70 transition-opacity"
              >
                Cerrar ✕
              </button>
            </div>

            {cerrados.length === 0 ? (
              <p className="dash-text-muted text-sm py-2">
                Todavía no hay pedidos entregados ni rechazados hoy.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {cerrados.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="dash-card rounded-xl border p-3 flex flex-col gap-2 opacity-80"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-black dash-text-primary">
                          {orderNumber(pedido.numero_pedido)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-2xs font-bold ${
                            pedido.estado === "cancelado"
                              ? "bg-red-950/60 text-red-300"
                              : "bg-green-950/60 text-green-300"
                          }`}
                        >
                          {pedido.estado === "cancelado" ? "Rechazado" : "Entregado"}
                        </span>
                      </div>
                      <span className="text-2xs dash-text-muted tabular-nums">
                        {formatPrice(pedido.total)}
                      </span>
                    </div>

                    <p className="text-xs dash-text-secondary truncate">
                      {pedido.nombre_cliente}
                      {pedido.mesa && <span className="dash-text-muted"> · {pedido.mesa}</span>}
                    </p>

                    <p className="text-xs dash-text-muted truncate">
                      {pedido.pedido_items.map((i) => `${i.cantidad}x ${i.producto?.nombre ?? "Producto"}`).join(", ")}
                    </p>

                    {pedido.estado === "entregado" && (
                      <button
                        onClick={() => handleReabrir(pedido.id)}
                        disabled={updatingId === pedido.id}
                        className="mt-1 px-3 py-2 rounded-lg text-xs font-semibold dash-bg-surface dash-text-secondary hover:opacity-80 transition-opacity disabled:opacity-50"
                      >
                        ↩ Reabrir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== KANBAN BOARD ===== */}
      <main className="flex-1 p-3 md:p-5 overflow-x-auto">
        {/* lg (1024px) y no xl (1280px): una tablet de 10-11" en horizontal ronda
            los 1100-1180px y caía en 2 columnas, justo en el dispositivo para el
            que está pensada esta pantalla. */}
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
          {COLUMNS.map((col) => {
            const colPedidos = pedidos.filter((p) => p.estado === col.key);

            return (
              <div key={col.key} className="flex flex-col min-w-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{col.icon}</span>
                    <h2 className="font-bold dash-text-primary text-base">{col.label}</h2>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold text-white bg-gradient-to-r ${col.accent}`}>
                    {colPedidos.length}
                  </span>
                </div>

                {/* Column body */}
                <div className="flex-1 space-y-3">
                  {colPedidos.length === 0 ? (
                    <div className="dash-col-empty rounded-2xl border-2 border-dashed p-8 text-center dash-text-muted text-sm">
                      <span className="text-2xl block mb-2 opacity-40">{col.icon}</span>
                      Sin pedidos
                    </div>
                  ) : (
                    colPedidos.map((pedido, i) => (
                      <div
                        key={pedido.id}
                        className={`stagger-card dash-card rounded-2xl border-2 p-4 transition-all hover:border-stone-600 ${
                          pedido.estado === "nuevo" ? "border-blue-800 ring-1 ring-blue-900/50" : ""
                        }`}
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        {/* Order header */}
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black dash-text-primary">{orderNumber(pedido.numero_pedido)}</span>
                            {/* Un retiro no tiene mesa: si no se distingue de un
                                golpe de vista, el plato termina esperando en un
                                mesón que nadie atiende. Ámbar, el mismo semántico
                                que ya usan las notas y el temporizador para decir
                                "ojo con esto"; nunca el color de marca del local. */}
                            {pedido.tipo_entrega === "retiro" && (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-950/60 text-amber-300 text-2xs font-bold">
                                🛍 Retiro
                              </span>
                            )}
                            {pedido.mesa && (
                              <span className="px-2 py-0.5 rounded-lg dash-bg-surface text-2xs font-semibold dash-text-secondary">
                                {pedido.mesa}
                              </span>
                            )}
                          </div>
                          <TimerBadge createdAt={pedido.created_at} />
                        </div>

                        {/* Customer */}
                        <p className="text-sm font-semibold dash-text-secondary mb-2.5 flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full dash-bg-surface flex items-center justify-center text-2xs">👤</span>
                          {pedido.nombre_cliente}
                        </p>

                        {/* Contacto de quien viene a retirar.
                            El número NO se pinta junto al nombre: la pantalla de
                            cocina está encendida todo el turno y a la vista del
                            público, así que tener teléfonos de clientes expuestos
                            de forma permanente no corresponde. Hay que pedirlo.
                            Va acá arriba y no en la fila de acciones de abajo
                            porque esa fila decide el estado del pedido: mezclar un
                            "llamar" con "Rechazar"/"Entregar" invita al toque
                            equivocado en pleno servicio. */}
                        {pedido.tipo_entrega === "retiro" && pedido.telefono && (
                          <div className="mb-2.5">
                            <button
                              onClick={() =>
                                setTelefonoVisibleId((actual) => (actual === pedido.id ? null : pedido.id))
                              }
                              className="px-2.5 py-1.5 rounded-lg dash-bg-surface text-2xs font-semibold dash-text-secondary hover:opacity-80 transition-opacity"
                            >
                              {telefonoVisibleId === pedido.id ? "Ocultar contacto" : "📞 Contactar"}
                            </button>

                            {telefonoVisibleId === pedido.id && (
                              <div className="mt-2 dash-bg-surface rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold dash-text-primary tabular-nums">
                                  {formatearTelefonoChileno(pedido.telefono)}
                                </span>
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <a
                                    href={`tel:${pedido.telefono}`}
                                    className="px-2.5 py-1.5 rounded-lg bg-stone-700 text-white text-2xs font-bold hover:opacity-80 transition-opacity"
                                  >
                                    📞 Llamar
                                  </a>
                                  {/* `wa.me` quiere el número SIN el `+`, al revés
                                      que `tel:`, que lo necesita para no depender
                                      del prefijo local de la tablet. */}
                                  <a
                                    href={`https://wa.me/${pedido.telefono.replace(/^\+/, "")}?text=${encodeURIComponent(
                                      `Hola ${pedido.nombre_cliente} 👋 Tu pedido ${orderNumber(pedido.numero_pedido)} de ${localNombre} ya está listo para retirar.`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1.5 rounded-lg bg-green-700 text-white text-2xs font-bold hover:opacity-80 transition-opacity"
                                  >
                                    💬 WhatsApp
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Items */}
                        <div className="space-y-1.5 mb-3">
                          {pedido.pedido_items.map((item) => (
                            <div key={item.id} className="flex items-start justify-between text-sm">
                              <div className="flex-1 min-w-0">
                                <span className="font-bold dash-text-primary text-sm">{item.cantidad}x </span>
                                <span className="dash-text-secondary text-sm">{item.producto?.nombre ?? "Producto"}</span>
                                {item.notas && (
                                  <p className="text-xs text-amber-400 italic mt-0.5">📝 {item.notas}</p>
                                )}
                              </div>
                              <span className="text-2xs dash-text-muted ml-2 whitespace-nowrap tabular-nums">
                                {formatPrice(item.precio_unitario * item.cantidad)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Order notes */}
                        {pedido.notas && (
                          <div className="dash-bg-surface rounded-xl px-3 py-2 mb-3 text-xs text-amber-300 border border-amber-900/30">
                            📋 {pedido.notas}
                          </div>
                        )}

                        {/* Total + Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-stone-800 gap-2">
                          <span className="font-bold dash-text-primary text-base tabular-nums">{formatPrice(pedido.total)}</span>
                          <div className="flex items-center gap-1.5">
                            {pedido.estado !== "listo" && (
                              <button
                                onClick={() => handleReject(pedido.id, pedido.estado)}
                                disabled={updatingId === pedido.id}
                                className="px-2.5 py-2 rounded-lg text-2xs font-semibold text-red-400/70 hover:text-red-300 hover:bg-red-950/30 transition-colors disabled:opacity-50"
                              >
                                Rechazar
                              </button>
                            )}
                            <button
                              onClick={() => handleAvanzar(pedido)}
                              disabled={updatingId === pedido.id}
                              className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.03] active:scale-95 shadow-lg bg-gradient-to-r disabled:opacity-60 disabled:hover:scale-100 ${
                                COLUMNS.find(c => c.key === (NEXT_STATUS[pedido.estado] ?? pedido.estado))?.accent ?? "from-stone-600 to-stone-700"
                              }`}
                            >
                              {ACTION_ICONS[pedido.estado]} {ACTION_LABELS[pedido.estado] ?? "Siguiente"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Toasts: se apilan para que el de deshacer no tape al de error. */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        {undoPedido && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-800/95 border border-stone-600 text-stone-100 text-sm font-medium shadow-lg backdrop-blur-sm">
            <span>Pedido {orderNumber(undoPedido.numero)} entregado</span>
            <button
              onClick={() => handleReabrir(undoPedido.id)}
              className="px-3 py-1.5 rounded-lg bg-stone-700 hover:bg-stone-600 text-white text-sm font-bold transition-colors"
            >
              ↩ Deshacer
            </button>
          </div>
        )}

        {/* `alert` y no "polite": este toast dice que el toque NO surtió efecto
            y se borra solo a los 4 segundos. Si espera turno, se va antes de
            que lo anuncien y el pedido queda clavado sin que nadie sepa. */}
        {errorMsg && (
          <div role="alert" className="px-4 py-2.5 rounded-xl bg-red-950/80 border border-red-800/60 text-red-200 text-sm font-medium shadow-lg backdrop-blur-sm">
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {dialogo}
    </div>
  );
}
