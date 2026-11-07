export const PREFIJO_LUGAR = 'place:'
export const PREFIJO_EMPRESA = 'business:'

export function esEmpresa(id: string): boolean {
  return id.startsWith(PREFIJO_EMPRESA)
}

export function idEstatico(id: string): string {
  return id.startsWith(PREFIJO_LUGAR) ? id.slice(PREFIJO_LUGAR.length) : id
}

export function idPublicoEstatico(id: string): string {
  if (id.startsWith(PREFIJO_LUGAR) || id.startsWith(PREFIJO_EMPRESA)) return id
  return `${PREFIJO_LUGAR}${id}`
}

export function idEmpresa(uuid: string): string {
  return uuid.startsWith(PREFIJO_EMPRESA) ? uuid : `${PREFIJO_EMPRESA}${uuid}`
}
