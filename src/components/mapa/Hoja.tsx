import { useState } from 'react';
import { Hoja } from './Hoja'; // Ajusta la ruta según dónde esté tu archivo Hoja.tsx
import { lugares } from '../../data/lugares'; // Importa tus datos desde la carpeta data

export function SeccionLugaresMapa() {
  const [isHojaAbierta, setIsHojaAbierta] = useState(true);

  return (
    <div className="relative w-full h-screen">
      {/* Aquí iría tu mapa interactivo de fondo */}
      
      {isHojaAbierta && (
        <Hoja 
          titulo="Lugares del Valle" 
          onCerrar={() => setIsHojaAbierta(false)}
        >
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              Explora los sitios registrados en los municipios:
            </p>
            
            {/* Recorremos el arreglo de lugares para listarlos */}
            {lugares.map((lugar, index) => (
              <div 
                key={index} 
                className="p-3 border rounded-lg shadow-xs bg-white hover:bg-gray-50 transition"
              >
                <h4 className="font-semibold text-gray-800">{lugar.nombre}</h4>
                <p className="text-xs text-gray-500 mt-1">{lugar.descripcion}</p>
              </div>
            ))}
          </div>
        </Hoja>
      )}
    </div>
  );
}
