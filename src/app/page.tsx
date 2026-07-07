import Link from "next/link";

const FEATURES = [
  {
    icon: "⚡",
    title: "Pedidos Instantáneos",
    desc: "El cliente escanea un QR, elige del menú y el pedido llega a la cocina en menos de 1 segundo.",
  },
  {
    icon: "💰",
    title: "0% Comisión",
    desc: "Sin costos por venta. No dependas de apps de delivery que cobran 30% de cada pedido.",
  },
  {
    icon: "📊",
    title: "Dashboard en Vivo",
    desc: "Panel tipo Kanban con sonido al recibir pedido. Gestiona todo desde una tablet o computador.",
  },
  {
    icon: "📱",
    title: "PWA Instalable",
    desc: "Tus clientes pueden instalar el menú en su pantalla de inicio. Sin descargas de app store.",
  },
  {
    icon: "🎨",
    title: "Tu Marca, Tu Estilo",
    desc: "Colores, logo y menú personalizado. Cada local tiene su propia identidad visual.",
  },
  {
    icon: "🔒",
    title: "Datos Propios",
    desc: "Tú eres dueño de toda la información. Base de datos propia y control total.",
  },
];

const STEPS = [
  { num: "1", label: "El cliente escanea el QR en la mesa", icon: "📷" },
  { num: "2", label: "Elige productos y confirma el pedido", icon: "🛒" },
  { num: "3", label: "El pedido aparece al instante en tu pantalla", icon: "🖥️" },
  { num: "4", label: "Preparas, marcas 'listo' y el cliente lo ve en su celular", icon: "✅" },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden" style={{
        background: "linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #292524 100%)",
      }}>
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #f97316 0%, transparent 70%)" }} />

        <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
          <div className="w-20 h-20 mx-auto rounded-[22px] bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-2xl shadow-orange-500/30 mb-8 animate-fade-in">
            <span className="text-4xl">🍔</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-5 animate-fade-in" style={{ animationDelay: "100ms" }}>
            Garzón
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400"> Digital</span>
          </h1>

          <p className="text-lg md:text-xl text-stone-400 mb-10 max-w-xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: "200ms" }}>
            Sistema de pedidos para fuentes de soda y locales de comida. Tus clientes piden desde el celular, tú gestionas todo en tiempo real.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in" style={{ animationDelay: "300ms" }}>
            <Link
              href="/local/el-lalo"
              className="group flex items-center justify-center gap-2 h-14 px-8 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-[15px] shadow-xl shadow-orange-500/20 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span className="text-lg">📱</span> Probar Menú Demo
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 h-14 px-8 rounded-2xl border-2 border-stone-600 text-stone-300 font-semibold text-[15px] hover:border-orange-500 hover:text-orange-400 active:scale-[0.98] transition-all"
            >
              <span className="text-lg">🖥️</span> Ver Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section className="max-w-4xl mx-auto px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-black text-stone-900 text-center mb-12">
          Así de simple funciona
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <div key={step.num} className="stagger-card relative" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex flex-col items-center text-center p-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 flex items-center justify-center text-2xl mb-4 shadow-sm">
                  {step.icon}
                </div>
                <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-xs font-black text-stone-500">{step.num}</span>
                <p className="text-sm font-semibold text-stone-700 leading-snug">{step.label}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 text-stone-300">→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="bg-white border-y border-stone-100">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-20">
          <h2 className="text-2xl md:text-3xl font-black text-stone-900 text-center mb-3">
            Todo lo que tu local necesita
          </h2>
          <p className="text-stone-500 text-center mb-12 text-sm">Sin comisiones. Sin apps externas. Sin complicaciones.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="stagger-card group p-5 rounded-2xl border border-stone-100 hover:border-orange-200 hover:shadow-md transition-all"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-11 h-11 rounded-xl bg-orange-50 group-hover:bg-orange-100 flex items-center justify-center text-xl mb-3 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-bold text-stone-800 text-[15px] mb-1">{f.title}</h3>
                <p className="text-[13px] text-stone-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-4xl mx-auto px-6 py-16 md:py-20 text-center">
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-10 md:p-14 shadow-xl">
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">
            ¿Tienes un local de comida?
          </h2>
          <p className="text-stone-400 mb-8 text-sm max-w-md mx-auto">
            Digitaliza tu negocio sin pagar comisiones. Prueba gratis y ve los resultados.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/local/el-lalo"
              className="h-12 px-8 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm shadow-lg shadow-orange-500/20 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Ver Demo en Vivo →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-100 py-6 text-center">
        <p className="text-xs text-stone-400">Garzón Digital — MVP v1.0 · Viña del Mar, Chile</p>
      </footer>
    </div>
  );
}
