import { describe, expect, it } from 'vitest'
import { interpretarHashHeredado } from '../src/lib/enlaceAuth.js'

describe('interpretarHashHeredado', () => {
  it('ignora rutas normales y el enlace nuevo con token_hash', () => {
    expect(interpretarHashHeredado('')).toBeNull()
    expect(interpretarHashHeredado('#/prestadores/panel')).toBeNull()
    expect(interpretarHashHeredado('#/prestadores/confirmar?token_hash=abc&type=signup')).toBeNull()
  })

  it('reconoce la sesión de confirmación en el hash', () => {
    const r = interpretarHashHeredado('#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=signup')
    expect(r?.estado).toBe('ok')
    expect(r?.destino).toBe('#/prestadores/confirmar?estado=ok&type=signup')
    expect(r?.requiereReescribir).toBe(false)
  })

  it('lleva la recuperación a la clave nueva', () => {
    expect(interpretarHashHeredado('#access_token=a&type=recovery')?.destino).toBe('#/prestadores/clave-nueva')
  })

  it('reconoce errores de enlace vencido', () => {
    const r = interpretarHashHeredado('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    expect(r?.estado).toBe('error')
    expect(r?.destino).toBe('#/prestadores/confirmar?estado=error')
  })

  it('reescribe cuando los parámetros llegan tras una ruta', () => {
    const r = interpretarHashHeredado('#/prestadores/confirmar#access_token=a&type=signup')
    expect(r?.requiereReescribir).toBe(true)
    expect(r?.hashSupabase).toBe('#access_token=a&type=signup')
  })
})
