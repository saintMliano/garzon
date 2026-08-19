export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          icono: string | null
          id: string
          local_id: string
          nombre: string
          orden: number | null
        }
        Insert: {
          icono?: string | null
          id?: string
          local_id: string
          nombre: string
          orden?: number | null
        }
        Update: {
          icono?: string | null
          id?: string
          local_id?: string
          nombre?: string
          orden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      local_staff: {
        Row: {
          created_at: string | null
          local_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          local_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          local_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_staff_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      locales: {
        Row: {
          activo: boolean | null
          color_acento: string | null
          color_primario: string | null
          created_at: string | null
          direccion: string | null
          id: string
          limite_pedidos_min: number
          logo_url: string | null
          mesas: string[] | null
          nombre: string
          plan: string
          slogan: string | null
          slug: string
          suscripcion_estado: string
          suscripcion_hasta: string | null
          suscripcion_notas: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          color_acento?: string | null
          color_primario?: string | null
          created_at?: string | null
          direccion?: string | null
          id?: string
          limite_pedidos_min?: number
          logo_url?: string | null
          mesas?: string[] | null
          nombre: string
          plan?: string
          slogan?: string | null
          slug: string
          suscripcion_estado?: string
          suscripcion_hasta?: string | null
          suscripcion_notas?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          color_acento?: string | null
          color_primario?: string | null
          created_at?: string | null
          direccion?: string | null
          id?: string
          limite_pedidos_min?: number
          logo_url?: string | null
          mesas?: string[] | null
          nombre?: string
          plan?: string
          slogan?: string | null
          slug?: string
          suscripcion_estado?: string
          suscripcion_hasta?: string | null
          suscripcion_notas?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      pedido_eventos: {
        Row: {
          actor: string | null
          created_at: string
          estado_anterior: string | null
          estado_nuevo: string
          id: string
          local_id: string
          pedido_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo: string
          id?: string
          local_id: string
          pedido_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo?: string
          id?: string
          local_id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_eventos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          id: string
          notas: string | null
          pedido_id: string
          precio_unitario: number
          producto_id: string | null
        }
        Insert: {
          cantidad?: number
          id?: string
          notas?: string | null
          pedido_id: string
          precio_unitario: number
          producto_id?: string | null
        }
        Update: {
          cantidad?: number
          id?: string
          notas?: string | null
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          client_request_id: string | null
          created_at: string | null
          estado: string | null
          id: string
          local_id: string
          mesa: string | null
          nombre_cliente: string
          notas: string | null
          numero_pedido: number
          propina: number
          propina_pct: number
          telefono: string | null
          tipo_entrega: string
          total: number
          updated_at: string | null
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          local_id: string
          mesa?: string | null
          nombre_cliente: string
          notas?: string | null
          numero_pedido: number
          propina?: number
          propina_pct?: number
          telefono?: string | null
          tipo_entrega?: string
          total: number
          updated_at?: string | null
        }
        Update: {
          client_request_id?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          local_id?: string
          mesa?: string | null
          nombre_cliente?: string
          notas?: string | null
          numero_pedido?: number
          propina?: number
          propina_pct?: number
          telefono?: string | null
          tipo_entrega?: string
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      productos: {
        Row: {
          categoria_id: string | null
          descripcion: string | null
          disponible: boolean | null
          id: string
          imagen_url: string | null
          local_id: string
          nombre: string
          orden: number | null
          precio: number
        }
        Insert: {
          categoria_id?: string | null
          descripcion?: string | null
          disponible?: boolean | null
          id?: string
          imagen_url?: string | null
          local_id: string
          nombre: string
          orden?: number | null
          precio: number
        }
        Update: {
          categoria_id?: string | null
          descripcion?: string | null
          disponible?: boolean | null
          id?: string
          imagen_url?: string | null
          local_id?: string
          nombre?: string
          orden?: number | null
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      supresiones_telefono: {
        Row: {
          actor: string | null
          created_at: string
          id: string
          local_id: string | null
          pedidos_afectados: number
          telefono_enmascarado: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: string
          local_id?: string | null
          pedidos_afectados: number
          telefono_enmascarado: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: string
          local_id?: string | null
          pedidos_afectados?: number
          telefono_enmascarado?: string
        }
        Relationships: [
          {
            foreignKeyName: "supresiones_telefono_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      borrar_telefonos_antiguos: { Args: { p_dias?: number }; Returns: number }
      crear_pedido: {
        Args: {
          p_client_request_id?: string
          p_items: Json
          p_local_id: string
          p_mesa: string
          p_nombre: string
          p_notas: string
          p_propina_pct?: number
          p_telefono?: string
          p_tipo_entrega?: string
        }
        Returns: string
      }
      estado_suscripcion: {
        Args: { p_local_id: string }
        Returns: {
          dias_restantes: number
          estado: string
          hasta: string
          pedidos_habilitados: boolean
          plan: string
          situacion: string
        }[]
      }
      get_menu_publico: { Args: { p_slug: string }; Returns: Json }
      get_order_status: {
        Args: { p_order_id: string }
        Returns: {
          created_at: string
          estado: string
          numero_pedido: number
        }[]
      }
      reporte_tiempos: {
        Args: { p_desde: string; p_hasta: string; p_local_id: string }
        Returns: {
          pedidos_medidos: number
          seg_hasta_aceptado: number
          seg_hasta_entregado: number
          seg_hasta_listo: number
        }[]
      }
      reporte_top_productos: {
        Args: {
          p_desde: string
          p_hasta: string
          p_limite?: number
          p_local_id: string
        }
        Returns: {
          nombre: string
          producto_id: string
          unidades: number
          venta: number
        }[]
      }
      reporte_ventas: {
        Args: { p_desde: string; p_hasta: string; p_local_id: string }
        Returns: {
          pedidos_cancelados: number
          pedidos_entregados: number
          pedidos_pendientes: number
          pedidos_total: number
          propinas_total: number
          ticket_promedio: number
          venta_entregada: number
          venta_total: number
        }[]
      }
      reporte_ventas_por_dia: {
        Args: { p_desde: string; p_hasta: string; p_local_id: string }
        Returns: {
          dia: string
          pedidos: number
          venta: number
        }[]
      }
      reporte_ventas_por_mes: {
        Args: { p_desde: string; p_hasta: string; p_local_id: string }
        Returns: {
          mes: string
          pedidos: number
          venta: number
        }[]
      }
      situacion_suscripcion: {
        Args: { p_estado: string; p_hasta: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
