/** Format CLP price: 4500 → "$4.500" */
export function formatPrice(price: number): string {
    return "$" + price.toLocaleString("es-CL");
}

/** Normalize string for accent-insensitive search: "Dinámico" → "dinamico" */
export function normalizar(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Map order status to display label */
export function statusLabel(status: string): string {
    const labels: Record<string, string> = {
        nuevo: "🆕 Nuevo",
        aceptado: "✅ Aceptado",
        preparando: "🔥 Preparando",
        listo: "🔔 Listo",
        entregado: "📦 Entregado",
    };
    return labels[status] ?? status;
}

/** Map order status to Tailwind color classes */
export function statusColor(status: string): string {
    const colors: Record<string, string> = {
        nuevo: "bg-blue-500",
        aceptado: "bg-amber-500",
        preparando: "bg-orange-500",
        listo: "bg-green-500",
        entregado: "bg-gray-400",
    };
    return colors[status] ?? "bg-gray-400";
}

/** Map order status to lighter bg for cards */
export function statusBg(status: string): string {
    const colors: Record<string, string> = {
        nuevo: "bg-blue-50 border-blue-200",
        aceptado: "bg-amber-50 border-amber-200",
        preparando: "bg-orange-50 border-orange-200",
        listo: "bg-green-50 border-green-200",
        entregado: "bg-gray-50 border-gray-200",
    };
    return colors[status] ?? "bg-gray-50 border-gray-200";
}

/** Time ago formatter */
export function timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "ahora";
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `hace ${diffHr}h`;
    return date.toLocaleDateString("es-CL");
}

/** Simple order number padder: 5 → "#005" */
export function orderNumber(num: number): string {
    return "#" + String(num).padStart(3, "0");
}
