export type Arrival = {
  linea: string;
  destino: string;
  /** -1 = todavía sin horario confirmado para esa línea */
  minutos: number;
  /** Minutos hasta el colectivo siguiente al próximo; -1 = desconocido */
  minutosProximo: number;
  estado: "A tiempo" | "Demorado" | "Sin datos";
};

/** Línea fija asignada a la parada: nunca cambia ni desaparece de la pantalla. */
export type Linea = {
  linea: string;
  destino: string;
};

export type Stop = {
  /** Código corto que se graba en el tag NFC: /p/<code> */
  code: string;
  nombre: string;
  zona: string;
  lat: number;
  lng: number;
  /** Sentido de circulación del poste (una vereda = una parada). */
  sentido: string;
  /** Líneas que realmente frenan en este poste. */
  lineas: Linea[];
};

export const STOPS: Stop[] = [
  {
    code: "agustin-gomez-acha",
    nombre: "Agustín Gómez y Gral. Acha Sur",
    zona: "Rawson, San Juan",
    lat: -31.5961434,
    lng: -68.5162306,
    sentido: "Hacia el Centro",
    lineas: [{ linea: "203", destino: "Centro · Plaza 25 de Mayo" }],
  },
  {
    code: "cordoba-acha",
    nombre: "Av. Córdoba y Gral. Acha",
    zona: "San Juan, Capital",
    lat: -31.5375,
    lng: -68.5364,
    sentido: "Hacia el Centro",
    lineas: [
      { linea: "210", destino: "Centro · Plaza 25 de Mayo" },
      { linea: "205", destino: "Centro · Plaza 25 de Mayo" },
    ],
  },
  {
    code: "rawson",
    nombre: "Rawson · Av. Boulevard Sarmiento",
    zona: "Rawson, San Juan",
    lat: -31.5814,
    lng: -68.5322,
    sentido: "Hacia el Centro",
    lineas: [{ linea: "12", destino: "Centro · Plaza 25 de Mayo" }],
  },
];

export const DEFAULT_STOP = STOPS[0]!;

export function findStop(code: string): Stop | undefined {
  return STOPS.find((s) => s.code === code.toLowerCase());
}

/** Tarjetas fijas de la parada, siempre en el mismo orden, aún sin horario. */
export function arribosBase(stop: Stop): Arrival[] {
  return stop.lineas.map((l) => ({
    linea: l.linea,
    destino: l.destino,
    minutos: -1,
    minutosProximo: -1,
    estado: "Sin datos" as const,
  }));
}
