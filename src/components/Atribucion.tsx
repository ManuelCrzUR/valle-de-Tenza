// Atribución obligatoria de los datos de logística (OSRM/OSM y Open-Meteo).
export function Atribucion({ clima = true }: { clima?: boolean }) {
  return (
    <p className="atribucion">
      Rutas: © <a href="https://project-osrm.org/" target="_blank" rel="noreferrer">OSRM</a>, datos © colaboradores de{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap (ODbL)</a>.
      {clima && <> Clima: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo (CC-BY 4.0)</a>.</>}
    </p>
  )
}
