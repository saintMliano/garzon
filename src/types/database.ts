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
}

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
