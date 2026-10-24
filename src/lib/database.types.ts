
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "cupo_dia": {
                  Row: {
                    "cerrado": boolean,"cupo": number | null,"fecha": string,"negocio_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cerrado"?: boolean,"cupo"?: number | null,"fecha": string,"negocio_id": string
                  }
                  Update: {
                    "cerrado"?: boolean,"cupo"?: number | null,"fecha"?: string,"negocio_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cupo_dia_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cupo_dia_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"eventos": {
                  Row: {
                    "descripcion": string | null,"desde": string,"fuente": string | null,"hasta": string | null,"id": number,"municipio": string,"nombre": string,"verificado_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "descripcion"?: string | null,"desde": string,"fuente"?: string | null,"hasta"?: string | null,"id"?: never,"municipio": string,"nombre": string,"verificado_en"?: string | null
                  }
                  Update: {
                    "descripcion"?: string | null,"desde"?: string,"fuente"?: string | null,"hasta"?: string | null,"id"?: never,"municipio"?: string,"nombre"?: string,"verificado_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "eventos_municipio_fkey"
      columns: ["municipio"]
isOneToOne: false
      referencedRelation: "municipios"
      referencedColumns: ["slug"]
    }
                  ]
                },"lugares": {
                  Row: {
                    "acceso": string | null,"actualizado": string,"categoria": string,"con_registro": boolean,"direccion": string,"es_servicio": boolean,"extra": Json | null,"fuentes": (string)[],"id": string,"lat": number | null,"lon": number | null,"municipio": string,"nombre": string,"plan": string | null,"precision": Database["public"]['Enums']["precision_ubicacion"] | null,"subtipo": string,"vereda": string | null,"verificado_en": string | null,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "acceso"?: string | null,"actualizado"?: string,"categoria": string,"con_registro"?: boolean,"direccion"?: string,"es_servicio"?: boolean,"extra"?: Json | null,"fuentes"?: (string)[],"id": string,"lat"?: number | null,"lon"?: number | null,"municipio": string,"nombre": string,"plan"?: string | null,"precision"?: Database["public"]['Enums']["precision_ubicacion"] | null,"subtipo"?: string,"vereda"?: string | null,"verificado_en"?: string | null,"visible"?: boolean
                  }
                  Update: {
                    "acceso"?: string | null,"actualizado"?: string,"categoria"?: string,"con_registro"?: boolean,"direccion"?: string,"es_servicio"?: boolean,"extra"?: Json | null,"fuentes"?: (string)[],"id"?: string,"lat"?: number | null,"lon"?: number | null,"municipio"?: string,"nombre"?: string,"plan"?: string | null,"precision"?: Database["public"]['Enums']["precision_ubicacion"] | null,"subtipo"?: string,"vereda"?: string | null,"verificado_en"?: string | null,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "lugares_municipio_fkey"
      columns: ["municipio"]
isOneToOne: false
      referencedRelation: "municipios"
      referencedColumns: ["slug"]
    }
                  ]
                },"municipios": {
                  Row: {
                    "caja": (number)[] | null,"centro": (number)[] | null,"nombre": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caja"?: (number)[] | null,"centro"?: (number)[] | null,"nombre": string,"slug": string
                  }
                  Update: {
                    "caja"?: (number)[] | null,"centro"?: (number)[] | null,"nombre"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"negocios": {
                  Row: {
                    "activo": boolean,"creado": string,"cupo_actualizado": string,"cupo_diario": number,"descripcion": string,"id": string,"lugar_id": string | null,"municipio": string,"nombre": string,"perfil_id": string,"precio_desde_cop": number | null,"tipo": Database["public"]['Enums']["tipo_reserva"],"verificado": boolean,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"creado"?: string,"cupo_actualizado"?: string,"cupo_diario": number,"descripcion"?: string,"id"?: string,"lugar_id"?: string | null,"municipio": string,"nombre": string,"perfil_id": string,"precio_desde_cop"?: number | null,"tipo": Database["public"]['Enums']["tipo_reserva"],"verificado"?: boolean,"whatsapp"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"creado"?: string,"cupo_actualizado"?: string,"cupo_diario"?: number,"descripcion"?: string,"id"?: string,"lugar_id"?: string | null,"municipio"?: string,"nombre"?: string,"perfil_id"?: string,"precio_desde_cop"?: number | null,"tipo"?: Database["public"]['Enums']["tipo_reserva"],"verificado"?: boolean,"whatsapp"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "negocios_lugar_id_fkey"
      columns: ["lugar_id"]
isOneToOne: true
      referencedRelation: "lugares"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_municipio_fkey"
      columns: ["municipio"]
isOneToOne: false
      referencedRelation: "municipios"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "negocios_perfil_id_fkey"
      columns: ["perfil_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ocupacion": {
                  Row: {
                    "fecha": string,"negocio_id": string,"personas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha": string,"negocio_id": string,"personas"?: number
                  }
                  Update: {
                    "fecha"?: string,"negocio_id"?: string,"personas"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocupacion_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocupacion_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "creado": string,"id": string,"nombre": string,"rol": Database["public"]['Enums']["rol_usuario"],"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "creado"?: string,"id": string,"nombre"?: string,"rol"?: Database["public"]['Enums']["rol_usuario"],"whatsapp"?: string | null
                  }
                  Update: {
                    "creado"?: string,"id"?: string,"nombre"?: string,"rol"?: Database["public"]['Enums']["rol_usuario"],"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reservas": {
                  Row: {
                    "actualizada": string,"codigo": string,"contacto": string,"creada": string,"estado": Database["public"]['Enums']["estado_reserva"],"fecha": string,"hora": string | null,"id": string,"lugar_id": string | null,"negocio_id": string | null,"noches": number,"nombre": string,"nota": string | null,"personas": number,"tipo": Database["public"]['Enums']["tipo_reserva"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizada"?: string,"codigo": string,"contacto": string,"creada"?: string,"estado"?: Database["public"]['Enums']["estado_reserva"],"fecha": string,"hora"?: string | null,"id"?: string,"lugar_id"?: string | null,"negocio_id"?: string | null,"noches"?: number,"nombre": string,"nota"?: string | null,"personas": number,"tipo": Database["public"]['Enums']["tipo_reserva"]
                  }
                  Update: {
                    "actualizada"?: string,"codigo"?: string,"contacto"?: string,"creada"?: string,"estado"?: Database["public"]['Enums']["estado_reserva"],"fecha"?: string,"hora"?: string | null,"id"?: string,"lugar_id"?: string | null,"negocio_id"?: string | null,"noches"?: number,"nombre"?: string,"nota"?: string | null,"personas"?: number,"tipo"?: Database["public"]['Enums']["tipo_reserva"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservas_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservas_negocio_id_fkey"
      columns: ["negocio_id"]
isOneToOne: false
      referencedRelation: "negocios_publicos"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "negocios_publicos": {
                  Row: {
                    "cupo_actualizado": string,"cupo_diario": number,"descripcion": string,"id": string,"lugar_id": string | null,"municipio": string,"nombre": string,"precio_desde_cop": number | null,"tipo": Database["public"]['Enums']["tipo_reserva"],"verificado": boolean
                  }
                  ComputedFields: never
                  Insert: {
                           "cupo_actualizado"?: string | null,"cupo_diario"?: number | null,"descripcion"?: string | null,"id"?: string | null,"lugar_id"?: string | null,"municipio"?: string | null,"nombre"?: string | null,"precio_desde_cop"?: number | null,"tipo"?: Database["public"]['Enums']["tipo_reserva"] | null,"verificado"?: boolean | null
                         }
                        Update: {
                           "cupo_actualizado"?: string | null,"cupo_diario"?: number | null,"descripcion"?: string | null,"id"?: string | null,"lugar_id"?: string | null,"municipio"?: string | null,"nombre"?: string | null,"precio_desde_cop"?: number | null,"tipo"?: Database["public"]['Enums']["tipo_reserva"] | null,"verificado"?: boolean | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "negocios_lugar_id_fkey"
      columns: ["lugar_id"]
isOneToOne: true
      referencedRelation: "lugares"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "negocios_municipio_fkey"
      columns: ["municipio"]
isOneToOne: false
      referencedRelation: "municipios"
      referencedColumns: ["slug"]
    }
                  ]
                }
          }
          Functions: {
            "ajustar_ocupacion":
{ Args: { "p_delta": number,"p_fecha": string,"p_negocio": string }; Returns: undefined
                           },
"cancelar_mi_reserva":
{ Args: { "p_codigo": string,"p_contacto": string }; Returns: {
              "codigo": string,"estado": Database["public"]['Enums']["estado_reserva"]
            }[]
                           },
"crear_reserva":
{ Args: { "p_contacto": string,"p_fecha": string,"p_hora": string,"p_lugar_id": string,"p_negocio_id"?: string,"p_noches": number,"p_nombre": string,"p_nota": string,"p_personas": number,"p_tipo": Database["public"]['Enums']["tipo_reserva"] }; Returns: {
              "codigo": string,"estado": Database["public"]['Enums']["estado_reserva"]
            }[]
                           },
"cupo_libre":
{ Args: { "fecha": string,"negocio": string }; Returns: number
                           },
"es_coordinador":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"hoy_bogota":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"mi_reserva":
{ Args: { "p_codigo": string,"p_contacto": string }; Returns: {
              "actualizada": string,"codigo": string,"creada": string,"estado": Database["public"]['Enums']["estado_reserva"],"fecha": string,"hora": string,"lugar_id": string,"negocio_id": string,"negocio_nombre": string,"noches": number,"nombre": string,"nota": string,"personas": number,"tipo": Database["public"]['Enums']["tipo_reserva"]
            }[]
                           },
"normalizar_contacto":
{ Args: { "p": string }; Returns: string
                           },
"purgar_reservas":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"vencer_reservas":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"whatsapp_negocio":
{ Args: { "p_negocio": string }; Returns: string
                           }
          }
          Enums: {
            "estado_reserva": "pendiente"|"confirmada"|"rechazada"|"cancelada"|"vencida","precision_ubicacion": "exacta"|"direccion"|"vereda"|"cabecera","rol_usuario": "prestador"|"coordinador"|"admin","tipo_reserva": "hotel"|"restaurante"|"caminata"|"actividad"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "estado_reserva": ["pendiente", "confirmada", "rechazada", "cancelada", "vencida"],"precision_ubicacion": ["exacta", "direccion", "vereda", "cabecera"],"rol_usuario": ["prestador", "coordinador", "admin"],"tipo_reserva": ["hotel", "restaurante", "caminata", "actividad"]
          }
        }
} as const
