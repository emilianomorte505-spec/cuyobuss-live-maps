export type Arrival = {
  linea: string;
  destino: string;
  minutos: number;
  estado: "A tiempo" | "Demorado";
};

export type Stop = {
  /** Código corto que se graba en el tag NFC: /p/<code> */
  code: string;
  nombre: string;
  zona: string;
  lat: number;
  lng: number;
  /** Datos de ejemplo hasta conectar Google (Fase 2) */
  arribos: Arrival[];
};

export const STOPS: Stop[] = [
  {
    code: "cordoba-acha",
    nombre: "Av. Córdoba y Gral. Acha",
    zona: "San Juan, Capital",
    lat: -31.5375,
    lng: -68.5364,
    arribos: [
      { linea: "10", destino: "Barrio Justo P. Castro", minutos: 4, estado: "A tiempo" },
      { linea: "20", destino: "Villa Krause", minutos: 12, estado: "Demorado" },
      { linea: "50", destino: "Centro", minutos: 25, estado: "A tiempo" },
    ],
  },
  {
    code: "rawson",
    nombre: "Rawson · Av. Boulevard Sarmiento",
    zona: "Rawson, San Juan",
    lat: -31.5814,
    lng: -68.5322,
    arribos: [
      { linea: "12", destino: "Rawson", minutos: 8, estado: "A tiempo" },
      { linea: "15", destino: "Villa Nacusi", minutos: 18, estado: "A tiempo" },
    ],
  },
];

export const DEFAULT_STOP = STOPS[0]!;

export function findStop(code: string): Stop | undefined {
  return STOPS.find((s) => s.code === code.toLowerCase());
}
