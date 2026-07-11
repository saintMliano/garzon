// ============================================================
// Tipos de la base de datos (formato `supabase gen types typescript`).
// ESCRITOS A MANO a partir de `supabase-schema.sql` + `migrations/*.sql`
// (no hubo acceso a la CLI de Supabase en este entorno).
//
// IMPORTANTE: tras cada migración futura, actualizar este archivo o
// regenerarlo con:
//   npx supabase gen types typescript --project-id <project-ref> --schema public > src/types/supabase.ts
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categorias: {
        Row: {
          id: string;
          local_id: string;
          nombre: string;
          icono: string | null;
          orden: number | null;
        };
        Insert: {
          id?: string;
          local_id: string;
          nombre: string;
          icono?: string | null;
          orden?: number | null;
        };
        Update: {
          id?: string;
          local_id?: string;
          nombre?: string;
          icono?: string | null;
          orden?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "categorias_local_id_fkey";
            columns: ["local_id"];
            isOneToOne: false;
            referencedRelation: "locales";
            referencedColumns: ["id"];
          }
        ];
      };
      locales: {
        Row: {
          id: string;
          nombre: string;
          slug: string;
          direccion: string | null;
          telefono: string | null;
          logo_url: string | null;
          color_primario: string | null;
          color_acento: string | null;
          slogan: string | null;
          activo: boolean | null;
          mesas: string[] | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          nombre: string;
          slug: string;
          direccion?: string | null;
          telefono?: string | null;
          logo_url?: string | null;
          color_primario?: string | null;
          color_acento?: string | null;
          slogan?: string | null;
          activo?: boolean | null;
          mesas?: string[] | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          nombre?: string;
          slug?: string;
          direccion?: string | null;
          telefono?: string | null;
          logo_url?: string | null;
          color_primario?: string | null;
          color_acento?: string | null;
          slogan?: string | null;
          activo?: boolean | null;
          mesas?: string[] | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      local_staff: {
        Row: {
          user_id: string;
          local_id: string;
          created_at: string | null;
        };
        Insert: {
          user_id: string;
          local_id: string;
          created_at?: string | null;
        };
        Update: {
          user_id?: string;
          local_id?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "local_staff_local_id_fkey";
            columns: ["local_id"];
            isOneToOne: false;
            referencedRelation: "locales";
            referencedColumns: ["id"];
          }
        ];
      };
      pedido_items: {
        Row: {
          id: string;
          pedido_id: string;
          producto_id: string | null;
          cantidad: number;
          precio_unitario: number;
          notas: string | null;
        };
        Insert: {
          id?: string;
          pedido_id: string;
          producto_id?: string | null;
          cantidad?: number;
          precio_unitario: number;
          notas?: string | null;
        };
        Update: {
          id?: string;
          pedido_id?: string;
          producto_id?: string | null;
          cantidad?: number;
          precio_unitario?: number;
          notas?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          }
        ];
      };
      pedidos: {
        Row: {
          id: string;
          local_id: string;
          numero_pedido: number;
          estado: string | null;
          nombre_cliente: string;
          mesa: string | null;
          total: number;
          notas: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          local_id: string;
          numero_pedido: number;
          estado?: string | null;
          nombre_cliente: string;
          mesa?: string | null;
          total: number;
          notas?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          local_id?: string;
          numero_pedido?: number;
          estado?: string | null;
          nombre_cliente?: string;
          mesa?: string | null;
          total?: number;
          notas?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_local_id_fkey";
            columns: ["local_id"];
            isOneToOne: false;
            referencedRelation: "locales";
            referencedColumns: ["id"];
          }
        ];
      };
      platform_admins: {
        Row: {
          user_id: string;
          created_at: string | null;
        };
        Insert: {
          user_id: string;
          created_at?: string | null;
        };
        Update: {
          user_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      productos: {
        Row: {
          id: string;
          local_id: string;
          categoria_id: string | null;
          nombre: string;
          descripcion: string | null;
          precio: number;
          imagen_url: string | null;
          disponible: boolean | null;
          orden: number | null;
        };
        Insert: {
          id?: string;
          local_id: string;
          categoria_id?: string | null;
          nombre: string;
          descripcion?: string | null;
          precio: number;
          imagen_url?: string | null;
          disponible?: boolean | null;
          orden?: number | null;
        };
        Update: {
          id?: string;
          local_id?: string;
          categoria_id?: string | null;
          nombre?: string;
          descripcion?: string | null;
          precio?: number;
          imagen_url?: string | null;
          disponible?: boolean | null;
          orden?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productos_local_id_fkey";
            columns: ["local_id"];
            isOneToOne: false;
            referencedRelation: "locales";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      crear_pedido: {
        Args: {
          p_local_id: string;
          p_nombre: string;
          p_mesa: string | null;
          p_notas: string | null;
          p_items: Json;
        };
        Returns: string;
      };
      get_order_status: {
        Args: {
          p_order_id: string;
        };
        Returns: {
          estado: string;
          numero_pedido: number;
          created_at: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
