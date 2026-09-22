/**
 * Horarios oficiales cargados desde la planilla de la línea.
 * Clave: `<código de parada>|<línea>`.
 */
export type Horarios = {
  /** Lunes a viernes */
  lv: string[];
  /** Sábado */
  sab: string[];
  /** Domingo y feriados */
  dom: string[];
};

export const TIMETABLES: Record<string, Horarios> = {
  // Agustín Gómez y Gral. Acha Sur — Línea 203 hacia el Centro
  "agustin-gomez-acha|203": {
    lv: [
      "06:42", "07:07", "07:38", "08:04", "08:31", "08:58", "09:25", "09:52",
      "10:17", "10:44", "11:11", "11:38", "12:05", "12:32", "12:59", "13:41",
      "14:25", "15:09", "15:47", "16:14", "16:41", "17:08", "17:35", "18:02",
      "18:29", "18:56", "19:23", "19:50", "20:14", "20:41", "21:08", "21:35",
      "22:02", "23:39",
    ],
    sab: [
      "06:19", "07:05", "07:52", "08:37", "09:22", "10:06", "10:50", "11:35",
      "12:20", "13:05", "13:50", "15:22", "16:07", "16:52", "17:37", "18:22",
      "19:07", "19:52", "20:34", "21:19", "22:04", "22:48",
    ],
    dom: [
      "07:06", "08:30", "09:52", "11:12", "12:34", "13:56", "15:23", "16:43",
      "18:03", "19:23", "20:40",
    ],
  },
};

/** Minutos desde medianoche, hora de San Juan (Argentina, UTC-3). */
function ahoraEnArgentina(now: Date) {
  const arg = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return {
    dia: arg.getUTCDay(), // 0 domingo … 6 sábado
    minutos: arg.getUTCHours() * 60 + arg.getUTCMinutes(),
  };
}

function aMinutos(hhmm: string) {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function horariosDe(stopCode: string, linea: string): Horarios | undefined {
  return TIMETABLES[`${stopCode}|${linea}`];
}

/**
 * Minutos que faltan para los próximos colectivos según la planilla.
 * Si ya pasó el último del día, toma el primero del día siguiente.
 */
export function proximosMinutos(horarios: Horarios, now = new Date(), cuantos = 3): number[] {
  const { dia, minutos } = ahoraEnArgentina(now);
  const deHoy = dia === 0 ? horarios.dom : dia === 6 ? horarios.sab : horarios.lv;
  const siguienteDia = (dia + 1) % 7;
  const deManana = siguienteDia === 0 ? horarios.dom : siguienteDia === 6 ? horarios.sab : horarios.lv;

  const restantes = deHoy.map(aMinutos).filter((m) => m >= minutos);
  const proximos = restantes.map((m) => m - minutos);

  for (const m of deManana.map(aMinutos)) {
    if (proximos.length >= cuantos) break;
    proximos.push(1440 - minutos + m);
  }

  return proximos.slice(0, cuantos);
}
