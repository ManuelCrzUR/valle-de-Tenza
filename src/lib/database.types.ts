
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
            "eventos": {
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "precision_ubicacion": "exacta"|"direccion"|"vereda"|"cabecera"
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
            "precision_ubicacion": ["exacta", "direccion", "vereda", "cabecera"]
          }
        }
} as const
