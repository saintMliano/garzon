export type OrderStatus =
    | "nuevo"
    | "aceptado"
    | "preparando"
    | "listo"
    | "entregado"
    | "cancelado";

export interface Local {
    id: string;
    nombre: string;
    slug: string;
    direccion: string | null;
    telefono: string | null;
    logo_url: string | null;
    color_primario: string;
    color_acento: string | null;
    slogan: string | null;
    activo: boolean;
    created_at: string;
    mesas: string[] | null;
    /** Tope de pedidos por minuto que aplica `crear_pedido`. Solo lo cambia el service-role. */
    limite_pedidos_min: number;
}

/**
 * El local tal como lo ve el comensal: lo que devuelve `get_menu_publico`, que
 * es una lista blanca de columnas y NO todo `Local`. Escribirlo aparte evita que
 * el código del menú dé por sentado un campo que la RPC nunca envía.
 *
 * `pedidos_habilitados` resume la suscripción en un booleano. El motivo no viaja
 * al teléfono del comensal: no tiene por qué enterarse de si el local pagó.
 */
export type LocalPublico = Pick<
    Local,
    | "id" | "nombre" | "slug" | "direccion" | "telefono" | "logo_url"
    | "color_primario" | "color_acento" | "slogan" | "mesas"
> & { pedidos_habilitados: boolean };

export interface Categoria {
    id: string;
    local_id: string;
    nombre: string;
    icono: string | null;
    orden: number;
}

export interface Producto {
    id: string;
    local_id: string;
    categoria_id: string | null;
    nombre: string;
    descripcion: string | null;
    precio: number;
    imagen_url: string | null;
    disponible: boolean;
    orden: number;
}

export interface Pedido {
    id: string;
    local_id: string;
    numero_pedido: number;
    estado: OrderStatus;
    nombre_cliente: string;
    mesa: string | null;
    total: number;
    notas: string | null;
    created_at: string;
    updated_at: string;
    /** Propina sugerida (F10). NO va incluida en `total`: es plata del personal. */
    propina: number;
    propina_pct: number;
    /**
     * Móvil del comensal en E.164 (`+56912345678`), solo en pedidos de retiro.
     * Es un DATO PERSONAL: se borra solo a los 7 días y no sale del local que
     * recibió el pedido. No lo agregues a exportaciones ni a RPCs públicas.
     */
    telefono: string | null;
    tipo_entrega: "mesa" | "retiro";
}

export interface PedidoItem {
    id: string;
    pedido_id: string;
    producto_id: string;
    cantidad: number;
    precio_unitario: number;
    notas: string | null;
    producto?: Producto;
}

export interface PedidoConItems extends Pedido {
    pedido_items: (PedidoItem & { producto: Producto })[];
}

export interface LocalStaff {
    user_id: string;
    local_id: string;
    created_at: string;
}

// Cart types (client-side only)
export interface CartItem {
    producto: Producto;
    cantidad: number;
    notas: string;
}

// Supabase Database type
export type { Database } from "./supabase";
