import { Button } from '../ui'
import { supabase } from '../../lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024

interface Props {
  ownerId: string
  businessId: string
  menuPath: string | null
  onCambio: (path: string | null) => void
  onAviso: (aviso: string) => void
  onError: (error: string) => void
}

export function MenuPdf({ ownerId, businessId, menuPath, onCambio, onAviso, onError }: Props) {
  const urlActual = supabase && menuPath ? supabase.storage.from('business-menus').getPublicUrl(menuPath).data.publicUrl : null

  async function subir(file: File | undefined) {
    if (!supabase || !file) return
    if (file.type !== 'application/pdf') { onError('El menú debe ser un archivo PDF.'); return }
    if (file.size > MAX_BYTES) { onError('El PDF debe pesar 5 MB o menos.'); return }
    const path = `${ownerId}/${businessId}/${crypto.randomUUID()}.pdf`
    const subida = await supabase.storage.from('business-menus').upload(path, file, { contentType: 'application/pdf' })
    if (subida.error) { onError('No pude subir el PDF. Revisa que el bucket business-menus exista.'); return }
    const { error } = await supabase.from('businesses').update({ menu_path: path }).eq('id', businessId)
    if (error) {
      await supabase.storage.from('business-menus').remove([path])
      onError('No pude guardar el menú en el negocio.')
      return
    }
    if (menuPath) await supabase.storage.from('business-menus').remove([menuPath])
    onCambio(path)
    onError('')
    onAviso(menuPath ? 'Menú reemplazado.' : 'Menú subido.')
  }

  async function borrar() {
    if (!supabase || !menuPath) return
    const { error } = await supabase.from('businesses').update({ menu_path: null }).eq('id', businessId)
    if (error) { onError('No pude borrar el menú.'); return }
    await supabase.storage.from('business-menus').remove([menuPath])
    onCambio(null)
    onError('')
    onAviso('Menú borrado.')
  }

  return (
    <section className="prestador-seccion" aria-labelledby="menu-pdf">
      <h3 id="menu-pdf" className="t-h3">Menú en PDF</h3>
      <label className="vd-field">
        <span className="vd-field-label">{menuPath ? 'Reemplazar menú (PDF, máx. 5 MB)' : 'Subir menú (PDF, máx. 5 MB)'}</span>
        <input className="vd-input" type="file" accept="application/pdf" onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {urlActual && (
        <div className="prestador-acciones">
          <a className="vd-btn vd-btn-secondary" href={urlActual} target="_blank" rel="noopener noreferrer">Ver menú actual</a>
          <Button variant="ghost" onClick={() => void borrar()}>Borrar menú</Button>
        </div>
      )}
    </section>
  )
}
