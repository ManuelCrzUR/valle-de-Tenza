import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, TextField } from '../components/ui'
import { PinEmpresa } from '../components/prestador/PinEmpresa'
import { CATEGORIAS, MUNICIPIOS } from '../data/lugares'
import type { CategoriaId } from '../data/lugares'
import { supabase } from '../lib/supabase'
import { usePagina } from '../usePagina'
import { useSesion } from '../state/sesion'
import '../styles/prestador.css'

const CATEGORIAS_OK = new Set<CategoriaId>(['alojamiento', 'restaurante', 'comercio', 'atraccion', 'monumento', 'naturaleza', 'operador'])

interface Empresa {
  id: string
  name: string
  category: CategoriaId
  municipality: string
  description: string
  contact: string | null
  lat: number | null
  lng: number | null
  status: 'draft' | 'published'
}

interface Foto {
  id: string
  storage_path: string
  alt: string | null
  sort_order: number
  is_cover: boolean
}

const vacia = {
  name: '',
  category: 'restaurante' as CategoriaId,
  municipality: 'tenza',
  description: '',
  contact: '',
  lat: null as number | null,
  lng: null as number | null,
  status: 'draft' as 'draft' | 'published',
}

function urlDe(path: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/business-photos/${path}`
}

function nombreSeguro(file: File): string {
  const base = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-48) || 'foto'
  return `${crypto.randomUUID()}-${base}`
}

export default function PrestadorPanel() {
  usePagina('Panel del prestador')
  const { configurado, listo, usuario } = useSesion()
  const nav = useNavigate()
  const [perfil, setPerfil] = useState({ name: '', bio: '' })
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [activa, setActiva] = useState<string | 'nueva' | null>(null)
  const [form, setForm] = useState(vacia)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!listo || !supabase || !usuario) return
    let vivo = true
    Promise.all([
      supabase.from('profiles').select('name,bio').eq('id', usuario.id).maybeSingle(),
      supabase.from('businesses').select('id,name,category,municipality,description,contact,lat,lng,status').eq('owner_id', usuario.id).order('created_at'),
    ]).then(([p, b]) => {
      if (!vivo) return
      if (p.data) setPerfil({ name: p.data.name ?? '', bio: p.data.bio ?? '' })
      if (b.data) setEmpresas(b.data as Empresa[])
      if (p.error || b.error) setError('No pude leer tu perfil o tus negocios. Si la migración 003 no está aplicada, el panel no puede guardar.')
    })
    return () => { vivo = false }
  }, [listo, usuario])

  useEffect(() => {
    if (!supabase || activa === 'nueva' || !activa) { setFotos([]); return }
    let vivo = true
    supabase.from('business_photos').select('id,storage_path,alt,sort_order,is_cover').eq('business_id', activa).order('sort_order')
      .then(({ data }) => { if (vivo && data) setFotos(data as Foto[]) })
    return () => { vivo = false }
  }, [activa])

  function elegir(empresa: Empresa) {
    setActiva(empresa.id)
    setForm({
      name: empresa.name,
      category: empresa.category,
      municipality: empresa.municipality,
      description: empresa.description,
      contact: empresa.contact ?? '',
      lat: empresa.lat,
      lng: empresa.lng,
      status: empresa.status,
    })
    setError('')
    setAviso('')
  }

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !usuario) return
    setOcupado(true)
    setError('')
    const { error: err } = await supabase.from('profiles').update({ name: perfil.name.trim() || null, bio: perfil.bio.trim() || null }).eq('id', usuario.id)
    setOcupado(false)
    setError(err ? 'No guardé el perfil.' : '')
    setAviso(err ? '' : 'Perfil guardado.')
  }

  async function guardarEmpresa(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !usuario) return
    if (form.description.trim().length < 10) { setError('La descripción necesita al menos 10 caracteres.'); return }
    if (form.status === 'published' && (form.lat == null || form.lng == null)) { setError('Para publicar, marca el punto en el mapa.'); return }
    setOcupado(true)
    setError('')
    const fila = {
      owner_id: usuario.id,
      name: form.name.trim(),
      category: form.category,
      municipality: form.municipality,
      description: form.description.trim(),
      contact: form.contact.trim() || null,
      lat: form.lat,
      lng: form.lng,
      status: form.status,
    }
    if (activa && activa !== 'nueva') {
      const { data, error: err } = await supabase.from('businesses').update(fila).eq('id', activa).select('id,name,category,municipality,description,contact,lat,lng,status')
      setOcupado(false)
      if (err || !data?.length) { setError('No se guardó. Solo la persona titular puede editar este negocio.'); return }
      const actual = data[0] as Empresa
      setEmpresas((lista) => lista.map((item) => item.id === actual.id ? actual : item))
      setAviso(actual.status === 'published' ? 'Negocio publicado.' : 'Borrador guardado.')
      return
    }
    const { data, error: err } = await supabase.from('businesses').insert(fila).select('id,name,category,municipality,description,contact,lat,lng,status').single()
    setOcupado(false)
    if (err || !data) { setError('No pude crear el negocio.'); return }
    const creada = data as Empresa
    setEmpresas((lista) => [...lista, creada])
    setActiva(creada.id)
    setAviso('Negocio creado. Ya puedes subir fotos.')
  }

  async function borrarEmpresa() {
    if (!supabase || !activa || activa === 'nueva') return
    setOcupado(true)
    const { error: err } = await supabase.from('businesses').delete().eq('id', activa)
    setOcupado(false)
    if (err) { setError('No pude borrar el negocio.'); return }
    setEmpresas((lista) => lista.filter((item) => item.id !== activa))
    setActiva(null)
    setForm(vacia)
    setAviso('Negocio borrado.')
  }

  async function subirFotos(files: FileList | null) {
    if (!supabase || !usuario || !files || !activa || activa === 'nueva') { setError('Guarda el negocio antes de subir fotos.'); return }
    setOcupado(true)
    setError('')
    for (const file of [...files].slice(0, 8)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4_000_000) {
        setError('Cada foto debe ser JPG, PNG o WebP de hasta 4 MB.')
        continue
      }
      const path = `${usuario.id}/${activa}/${nombreSeguro(file)}`
      const subida = await supabase.storage.from('business-photos').upload(path, file, { contentType: file.type })
      if (subida.error) { setError('No pude subir una foto. Revisa que el bucket business-photos exista.'); continue }
      const { data, error: err } = await supabase.from('business_photos').insert({
        business_id: activa,
        storage_path: path,
        alt: form.name || 'Foto del negocio',
        sort_order: fotos.length,
        is_cover: fotos.length === 0,
      }).select('id,storage_path,alt,sort_order,is_cover').single()
      if (!err && data) setFotos((lista) => [...lista, data as Foto])
    }
    setOcupado(false)
    setAviso('Fotos actualizadas.')
  }

  async function portada(foto: Foto) {
    if (!supabase || !activa || activa === 'nueva') return
    await supabase.from('business_photos').update({ is_cover: false }).eq('business_id', activa)
    const { error: err } = await supabase.from('business_photos').update({ is_cover: true }).eq('id', foto.id)
    if (err) { setError('No pude marcar la portada.'); return }
    setFotos((lista) => lista.map((item) => ({ ...item, is_cover: item.id === foto.id })))
  }

  async function borrarFoto(foto: Foto) {
    if (!supabase) return
    await supabase.storage.from('business-photos').remove([foto.storage_path])
    const { error: err } = await supabase.from('business_photos').delete().eq('id', foto.id)
    if (err) { setError('No pude borrar la foto.'); return }
    setFotos((lista) => lista.filter((item) => item.id !== foto.id))
  }

  async function salir() {
    await supabase?.auth.signOut()
    nav('/prestadores')
  }

  if (!listo) return <div className="wrap pagina"><p>Cargando la sesión…</p></div>
  if (!configurado) {
    return (
      <div className="wrap pagina">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Panel</h1>
        <p className="prestador-aviso" role="status">Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. No hay sesión que restaurar.</p>
        <Link to="/prestadores">Volver</Link>
      </div>
    )
  }
  if (!usuario) {
    return (
      <div className="wrap pagina">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Panel</h1>
        <p>Entra para ver tus negocios.</p>
        <Link to="/prestadores/entrar">Entrar</Link>
      </div>
    )
  }

  return (
    <div className="wrap pagina">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Mi panel</h1>
      <p className="sub">{usuario.email}. La sesión vive en Supabase, no en una contraseña de este navegador.</p>
      <div className="prestador-acciones">
        <Button variant="secondary" onClick={() => void salir()}>Salir</Button>
      </div>

      <form className="prestador-form" onSubmit={(e) => void guardarPerfil(e)}>
        <h2 className="t-h2">Perfil</h2>
        <TextField label="Nombre" value={perfil.name} onChange={(e) => setPerfil({ ...perfil, name: e.target.value })} maxLength={80} />
        <TextField label="Bio (opcional)" value={perfil.bio} onChange={(e) => setPerfil({ ...perfil, bio: e.target.value })} maxLength={400} />
        <Button type="submit" variant="secondary" disabled={ocupado}>Guardar perfil</Button>
      </form>

      <h2 className="t-h2">Negocios</h2>
      <div className="prestador-lista">
        {empresas.map((empresa) => (
          <button key={empresa.id} type="button" className="panel prestador-card" onClick={() => elegir(empresa)}>
            <strong>{empresa.name}</strong>
            <span> · {empresa.status === 'published' ? 'publicado' : 'borrador'}</span>
          </button>
        ))}
        <Button variant="secondary" onClick={() => { setActiva('nueva'); setForm(vacia); setFotos([]); setAviso(''); setError('') }}>Nuevo negocio</Button>
      </div>

      {activa && (
        <form className="prestador-form" onSubmit={(e) => void guardarEmpresa(e)}>
          <h2 className="t-h2">{activa === 'nueva' ? 'Nuevo negocio' : 'Editar negocio'}</h2>
          <TextField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} />
          <label className="vd-field">
            <span className="vd-field-label">Categoría</span>
            <select className="vd-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CategoriaId })}>
              {CATEGORIAS.filter((c) => CATEGORIAS_OK.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
          </label>
          <label className="vd-field">
            <span className="vd-field-label">Municipio</span>
            <select className="vd-input" value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })}>
              {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
            </select>
          </label>
          <label className="vd-field">
            <span className="vd-field-label">Descripción</span>
            <textarea className="vd-input" required minLength={10} maxLength={800} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <TextField label="Contacto público (opcional)" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} maxLength={160} />
          <p>Marca el punto en el mapa de este sitio. No se crea un lugar en OpenStreetMap.</p>
          <PinEmpresa lat={form.lat} lng={form.lng} onCambio={(lat, lng) => setForm({ ...form, lat, lng })} />
          {form.lat != null && <p>Punto: {form.lat.toFixed(5)}, {form.lng?.toFixed(5)}</p>}
          <label className="vd-field">
            <span className="vd-field-label">Estado</span>
            <select className="vd-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'published' })}>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
            </select>
          </label>
          {activa !== 'nueva' && (
            <>
              <label className="vd-field">
                <span className="vd-field-label">Fotos (JPG, PNG o WebP)</span>
                <input className="vd-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => void subirFotos(e.target.files)} />
              </label>
              <div className="prestador-fotos">
                {fotos.map((foto) => (
                  <figure key={foto.id}>
                    <img src={urlDe(foto.storage_path)} alt={foto.alt ?? ''} />
                    <figcaption>{foto.is_cover ? 'Portada' : 'Galería'}</figcaption>
                    <button type="button" onClick={() => void portada(foto)}>Hacer portada</button>
                    <button type="button" onClick={() => void borrarFoto(foto)}>Borrar</button>
                  </figure>
                ))}
              </div>
            </>
          )}
          <div className="prestador-acciones">
            <Button type="submit" variant="cta" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar negocio'}</Button>
            {activa !== 'nueva' && <Button type="button" variant="secondary" onClick={() => void borrarEmpresa()}>Borrar</Button>}
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {aviso && <p className="prestador-aviso" role="status">{aviso}</p>}
    </div>
  )
}
