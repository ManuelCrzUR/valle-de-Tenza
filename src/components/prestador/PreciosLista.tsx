import { useEffect, useState } from 'react'
import { Button, TextField } from '../ui'
import { supabase } from '../../lib/supabase'

const MAX = 40

interface Fila { id: string; item: string; price_cop: number | null; note: string | null; sort_order: number }
interface Borrador { item: string; precio: string; note: string }

interface Props {
  businessId: string
  onAviso: (aviso: string) => void
  onError: (error: string) => void
}

function precioValido(texto: string): { ok: boolean; valor: number | null } {
  if (!texto.trim()) return { ok: true, valor: null }
  const n = Number(texto)
  return { ok: Number.isInteger(n) && n >= 0 && n <= 50_000_000, valor: n }
}

export function PreciosLista({ businessId, onAviso, onError }: Props) {
  const [filas, setFilas] = useState<Fila[]>([])
  const [edicion, setEdicion] = useState<Record<string, Borrador>>({})
  const [nuevo, setNuevo] = useState<Borrador>({ item: '', precio: '', note: '' })

  useEffect(() => {
    if (!supabase) return
    let vivo = true
    supabase.from('business_prices').select('id,item,price_cop,note,sort_order').eq('business_id', businessId).order('sort_order')
      .then(({ data }) => {
        if (!vivo || !data) return
        const lista = data as Fila[]
        setFilas(lista)
        setEdicion(Object.fromEntries(lista.map((f) => [f.id, { item: f.item, precio: f.price_cop == null ? '' : String(f.price_cop), note: f.note ?? '' }])))
      })
    return () => { vivo = false }
  }, [businessId])

  async function agregar() {
    if (!supabase) return
    const item = nuevo.item.trim()
    const p = precioValido(nuevo.precio)
    if (!item) { onError('Escribe el nombre del producto o servicio.'); return }
    if (!p.ok) { onError('El precio debe ser un entero en pesos, entre 0 y 50.000.000.'); return }
    if (filas.length >= MAX) { onError(`Máximo ${MAX} precios por negocio.`); return }
    const orden = filas.reduce((m, f) => Math.max(m, f.sort_order), -1) + 1
    const { data, error } = await supabase.from('business_prices')
      .insert({ business_id: businessId, item, price_cop: p.valor, note: nuevo.note.trim() || null, sort_order: orden })
      .select('id,item,price_cop,note,sort_order').single()
    if (error || !data) { onError('No pude agregar el precio.'); return }
    const fila = data as Fila
    setFilas((l) => [...l, fila])
    setEdicion((e) => ({ ...e, [fila.id]: { item: fila.item, precio: fila.price_cop == null ? '' : String(fila.price_cop), note: fila.note ?? '' } }))
    setNuevo({ item: '', precio: '', note: '' })
    onError('')
    onAviso('Precio agregado.')
  }

  async function guardar(fila: Fila) {
    if (!supabase) return
    const b = edicion[fila.id]
    const item = b.item.trim()
    const p = precioValido(b.precio)
    if (!item) { onError('El nombre del precio no puede quedar vacío.'); return }
    if (!p.ok) { onError('El precio debe ser un entero en pesos, entre 0 y 50.000.000.'); return }
    const cambios = { item, price_cop: p.valor, note: b.note.trim() || null }
    const { error } = await supabase.from('business_prices').update(cambios).eq('id', fila.id)
    if (error) { onError('No pude guardar el precio.'); return }
    setFilas((l) => l.map((f) => f.id === fila.id ? { ...f, ...cambios } : f))
    onError('')
    onAviso('Precio guardado.')
  }

  async function borrar(fila: Fila) {
    if (!supabase) return
    const { error } = await supabase.from('business_prices').delete().eq('id', fila.id)
    if (error) { onError('No pude borrar el precio.'); return }
    setFilas((l) => l.filter((f) => f.id !== fila.id))
    onError('')
    onAviso('Precio borrado.')
  }

  function campo(id: string, cambios: Partial<Borrador>) {
    setEdicion((e) => ({ ...e, [id]: { ...e[id], ...cambios } }))
  }

  return (
    <section className="prestador-seccion" aria-labelledby="precios-lista">
      <h3 id="precios-lista" className="t-h3">Lista de precios ({filas.length}/{MAX})</h3>
      <ul className="prestador-precios">
        {filas.map((f) => {
          const b = edicion[f.id]
          if (!b) return null
          return (
            <li key={f.id} className="prestador-precio">
              <TextField label="Producto o servicio" value={b.item} maxLength={120} onChange={(e) => campo(f.id, { item: e.target.value })} />
              <TextField label="Precio (COP, opcional)" type="number" inputMode="numeric" min={0} step={1} value={b.precio} onChange={(e) => campo(f.id, { precio: e.target.value })} />
              <TextField label="Nota (opcional)" value={b.note} maxLength={160} onChange={(e) => campo(f.id, { note: e.target.value })} />
              <div className="prestador-acciones">
                <Button variant="secondary" onClick={() => void guardar(f)}>Guardar precio</Button>
                <Button variant="ghost" onClick={() => void borrar(f)}>Borrar<span className="sr-only"> {f.item}</span></Button>
              </div>
            </li>
          )
        })}
      </ul>
      {filas.length < MAX ? (
        <div className="prestador-precio">
          <TextField label="Nuevo: producto o servicio" value={nuevo.item} maxLength={120} onChange={(e) => setNuevo({ ...nuevo, item: e.target.value })} />
          <TextField label="Nuevo: precio (COP, opcional)" type="number" inputMode="numeric" min={0} step={1} value={nuevo.precio} onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })} />
          <TextField label="Nuevo: nota (opcional)" value={nuevo.note} maxLength={160} onChange={(e) => setNuevo({ ...nuevo, note: e.target.value })} />
          <Button variant="secondary" onClick={() => void agregar()}>Agregar precio</Button>
        </div>
      ) : <p>Llegaste al máximo de {MAX} precios.</p>}
    </section>
  )
}
