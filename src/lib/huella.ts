/** Huella técnica del dispositivo (sin permisos). Sobrevive a modo incógnito y borrado de datos. */
export async function huellaDispositivo(): Promise<string> {
  const n = navigator as Navigator & { deviceMemory?: number };
  let canvas = "";
  try {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 40;
    const x = c.getContext("2d");
    if (x) {
      x.textBaseline = "top";
      x.font = "16px Arial";
      x.fillStyle = "#f60";
      x.fillRect(10, 5, 80, 20);
      x.fillStyle = "#069";
      x.fillText("Cuyobuss 🚌 San Juan", 2, 12);
      canvas = c.toDataURL();
    }
  } catch {
    /* sin canvas */
  }
  const partes = [
    n.userAgent,
    n.platform,
    n.hardwareConcurrency,
    n.deviceMemory ?? "",
    n.maxTouchPoints,
    screen.width,
    screen.height,
    screen.colorDepth,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvas,
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(partes));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
