"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, statusColor, timeAgo, orderNumber } from "@/lib/utils";
import type { OrderStatus, PedidoConItems } from "@/types/database";

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

function TimerBadge({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "warning" | "danger">("normal");

  useEffect(() => {
    function update() {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
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
  const supabase = useMemo(() => createClient(), []);
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 });
  const prevCountRef = useRef(0);

  const [localId, setLocalId] = useState<string | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [resolvingLocal, setResolvingLocal] = useState(true);
  const [noLocal, setNoLocal] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function resolveLocal() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setResolvingLocal(false); setNoLocal(true); return; }

      const { data: staff } = await supabase
        .from("local_staff").select("local_id").eq("user_id", user.id).limit(1).maybeSingle();

      if (!staff) { setResolvingLocal(false); setNoLocal(true); return; }

      const { data: local } = await supabase
        .from("locales").select("nombre, slug").eq("id", staff.local_id).single();

      setLocalId(staff.local_id);
      setLocalNombre(local?.nombre ?? "");
      setResolvingLocal(false);
    }
    resolveLocal();
  }, [supabase]);

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

    setPedidos((data ?? []) as PedidoConItems[]);
    setLoading(false);

    // Stats del header: sí filtran por día, pero excluyen cancelados para
    // que la "Venta" no cuente pedidos rechazados.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: allToday } = await supabase
      .from("pedidos")
      .select("total")
      .eq("local_id", localId)
      .gte("created_at", today.toISOString())
      .neq("estado", "cancelado")
      .returns<{ total: number }[]>();

    if (allToday) {
      setTodayStats({ count: allToday.length, total: allToday.reduce((s, p) => s + p.total, 0) });
    }
  }, [supabase, localId]);

  useEffect(() => {
    if (!localId) return;

    const channel = supabase
      .channel("dashboard-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `local_id=eq.${localId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          playNotificationSound();
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        }
        fetchPedidos();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Cubre tanto la carga inicial como cada re-suscripción tras una
          // reconexión.
          fetchPedidos();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[dashboard] realtime "${status}"; dependiendo del polling de respaldo`);
        }
      });

    // Polling de respaldo: cubre huecos de realtime (reconexiones lentas,
    // eventos perdidos, etc.).
    const pollInterval = setInterval(() => fetchPedidos(), 30000);

    function handleVisibility() {
      if (document.visibilityState === "visible") fetchPedidos();
    }
    function handleOnline() {
      fetchPedidos();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [supabase, localId, fetchPedidos]);

  // Oculta el toast de error automáticamente.
  useEffect(() => {
    if (!errorMsg) return;
    const timeout = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timeout);
  }, [errorMsg]);

  useEffect(() => {
    const nuevoCount = pedidos.filter((p) => p.estado === "nuevo").length;
    document.title = nuevoCount > prevCountRef.current && prevCountRef.current > 0
      ? `(${nuevoCount}) 🔔 Nuevo Pedido | Garzón Digital`
      : "Dashboard | Garzón Digital";
    prevCountRef.current = nuevoCount;
  }, [pedidos]);

  // Compare-and-set: solo aplica el update si el pedido sigue en
  // `currentStatus`, para no pisar cambios hechos desde otra tablet.
  async function updateStatus(pedidoId: string, currentStatus: string, targetStatus?: string) {
    const nextStatus = targetStatus ?? NEXT_STATUS[currentStatus];
    if (!nextStatus) return;

    setUpdatingId(pedidoId);
    const { data, error } = await supabase
      .from("pedidos")
      .update({ estado: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", pedidoId)
      .eq("estado", currentStatus)
      .select();
    setUpdatingId(null);

    if (error || !data || data.length === 0) {
      setErrorMsg("No se pudo actualizar el pedido; reintenta.");
      fetchPedidos();
      return;
    }

    fetchPedidos();
  }

  async function handleReject(pedidoId: string, currentStatus: string) {
    if (!window.confirm("¿Rechazar este pedido? El cliente será notificado.")) return;
    await updateStatus(pedidoId, currentStatus, "cancelado");
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
      <div className="flex flex-1 items-center justify-center min-h-screen dashboard-dark">
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
      <div className="flex flex-1 items-center justify-center min-h-screen dashboard-dark px-6">
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
    <div className="flex flex-col min-h-screen dashboard-dark">
      {/* ===== HEADER ===== */}
      <header className="dash-header border-b px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
              🍔
            </div>
            <div>
              <h1 className="font-bold dash-text-primary text-base">{localNombre || "Garzón Digital"}</h1>
              <p className="text-[11px] dash-text-muted">Garzón Digital · Panel de Control</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1 dash-bg-surface rounded-xl p-1">
              <span className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500">
                Pedidos
              </span>
              <Link
                href="/dashboard/menu"
                className="px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary hover:opacity-80 transition-opacity"
              >
                Menú
              </Link>
              <Link
                href="/dashboard/config"
                className="px-3 py-2 rounded-lg text-xs font-semibold dash-text-secondary hover:opacity-80 transition-opacity"
              >
                Identidad
              </Link>
            </nav>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-5">
              <div className="text-right">
                <p className="text-[10px] dash-text-muted uppercase tracking-wider font-medium">Pedidos</p>
                <p className="text-lg font-bold dash-text-primary tabular-nums">{todayStats.count}</p>
              </div>
              <div className="w-px h-8 bg-stone-800" />
              <div className="text-right">
                <p className="text-[10px] dash-text-muted uppercase tracking-wider font-medium">Venta</p>
                <p className="text-lg font-bold text-green-400 tabular-nums">{formatPrice(todayStats.total)}</p>
              </div>
            </div>

            {/* Sound unlock (autoplay policy: requiere gesto del usuario) */}
            {!soundEnabled && (
              <button
                onClick={enableSound}
                className="px-3 py-2 rounded-xl dash-bg-surface dash-text-secondary text-xs font-semibold hover:opacity-80 transition-opacity whitespace-nowrap"
              >
                🔔 Activar sonido
              </button>
            )}

            {/* Notification bell */}
            <div className="relative">
              <div className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center text-lg">🔔</div>
              {nuevoCount > 0 && (
                <>
                  <div className="notification-dot" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{nuevoCount}</span>
                </>
              )}
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="w-10 h-10 rounded-xl dash-bg-surface flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
              title="Cerrar sesión"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      {/* ===== MOBILE STATS ===== */}
      <div className="sm:hidden flex items-center gap-4 px-4 py-3 border-b border-stone-800">
        <div className="flex-1 text-center">
          <p className="text-[10px] dash-text-muted uppercase tracking-wider">Pedidos</p>
          <p className="text-xl font-bold dash-text-primary">{todayStats.count}</p>
        </div>
        <div className="w-px h-8 bg-stone-800" />
        <div className="flex-1 text-center">
          <p className="text-[10px] dash-text-muted uppercase tracking-wider">Venta</p>
          <p className="text-xl font-bold text-green-400">{formatPrice(todayStats.total)}</p>
        </div>
      </div>

      {/* ===== KANBAN BOARD ===== */}
      <main className="flex-1 p-3 md:p-5 overflow-x-auto">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0">
          {COLUMNS.map((col) => {
            const colPedidos = pedidos.filter((p) => p.estado === col.key);

            return (
              <div key={col.key} className="flex flex-col min-w-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{col.icon}</span>
                    <h2 className="font-bold dash-text-primary text-[15px]">{col.label}</h2>
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
                            {pedido.mesa && (
                              <span className="px-2 py-0.5 rounded-lg dash-bg-surface text-[11px] font-semibold dash-text-secondary">
                                {pedido.mesa}
                              </span>
                            )}
                          </div>
                          <TimerBadge createdAt={pedido.created_at} />
                        </div>

                        {/* Customer */}
                        <p className="text-sm font-semibold dash-text-secondary mb-2.5 flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full dash-bg-surface flex items-center justify-center text-[11px]">👤</span>
                          {pedido.nombre_cliente}
                        </p>

                        {/* Items */}
                        <div className="space-y-1.5 mb-3">
                          {pedido.pedido_items.map((item) => (
                            <div key={item.id} className="flex items-start justify-between text-sm">
                              <div className="flex-1 min-w-0">
                                <span className="font-bold dash-text-primary text-[13px]">{item.cantidad}x </span>
                                <span className="dash-text-secondary text-[13px]">{item.producto?.nombre ?? "Producto"}</span>
                                {item.notas && (
                                  <p className="text-[11px] text-amber-400 italic mt-0.5">📝 {item.notas}</p>
                                )}
                              </div>
                              <span className="text-[11px] dash-text-muted ml-2 whitespace-nowrap tabular-nums">
                                {formatPrice(item.precio_unitario * item.cantidad)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Order notes */}
                        {pedido.notas && (
                          <div className="dash-bg-surface rounded-xl px-3 py-2 mb-3 text-[11px] text-amber-300 border border-amber-900/30">
                            📋 {pedido.notas}
                          </div>
                        )}

                        {/* Total + Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-stone-800 gap-2">
                          <span className="font-bold dash-text-primary text-[15px] tabular-nums">{formatPrice(pedido.total)}</span>
                          <div className="flex items-center gap-1.5">
                            {pedido.estado !== "listo" && (
                              <button
                                onClick={() => handleReject(pedido.id, pedido.estado)}
                                disabled={updatingId === pedido.id}
                                className="px-2.5 py-2 rounded-lg text-[11px] font-semibold text-red-400/70 hover:text-red-300 hover:bg-red-950/30 transition-colors disabled:opacity-50"
                              >
                                Rechazar
                              </button>
                            )}
                            <button
                              onClick={() => updateStatus(pedido.id, pedido.estado)}
                              disabled={updatingId === pedido.id}
                              className={`px-4 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all hover:scale-[1.03] active:scale-95 shadow-lg bg-gradient-to-r disabled:opacity-60 disabled:hover:scale-100 ${
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

      {/* Toast de error, discreto y auto-ocultable */}
      {errorMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-950/80 border border-red-800/60 text-red-200 text-sm font-medium shadow-lg backdrop-blur-sm">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
