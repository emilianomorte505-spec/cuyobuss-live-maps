🚌 Cuyobuss

> Sistema inteligente de información y estimación de arribos en tiempo real para el transporte público de San Juan, Argentina (**RedTulum**), integrado con tags físicos **NFC** en paradas y reporte colaborativo de pasajeros a bordo.

---

## 📌 Visión del Proyecto

**Cuyobuss** resuelve la incertidumbre del transporte público en la calle mediante interacción física instantánea y crowdsourcing:
1. **Sin descargar aplicaciones:** El pasajero apoya su teléfono en el sticker NFC instalado en el poste de la parada (o escanea el QR de respaldo) y accede al instante a la webapp optimizada para móviles.
2. **Poste exacto:** Cada parada cuenta con su propia URL identificadora (`/p/:stopId`), mostrando únicamente las líneas y sentidos que se detienen en esa vereda física.
3. **Doble arribo programado:** Muestra en cuántos minutos llega el próximo colectivo y cuánto falta para el siguiente ("después: X min").
4. **"Waze de bondis" (Reporte en vivo):** Cuando un pasajero aborda la unidad y toca *"¡Me subí al colectivo!"*, el sistema calcula el desvío exacto frente a la planilla oficial y propaga el retraso o adelanto a todas las paradas siguientes del recorrido.

---

## 🛠️ Stack Tecnológico

* **Frontend:** [TanStack Start v1](https://tanstack.com/start) sobre **React 19** y **Vite 7**, aprovechando renderizado rápido en el Edge y Server Functions tipadas de punta a punta.
* **Enrutamiento & Estado:** [TanStack Router](https://tanstack.com/router) con rutas dinámicas seguras y [TanStack Query](https://tanstack.com/query) para refresco en tiempo real de arribos.
* **Estilos & Diseño:** Tailwind CSS v4 con arquitectura de diseño móvil nativa y modo oscuro de alto contraste (`cuyobuss.css`).
* **Backend & Base de Datos:** PostgreSQL en la nube con **Row Level Security (RLS)** y funciones RPC en servidor (`createServerFn`).
* **Autenticación:** Autenticación por correo y contraseña con sesión persistente (el usuario solo inicia sesión una vez en su dispositivo).
* **APIs Externas:** Google Maps Transit API (con filtrado geográfico estricto a 45 metros de poste) y motor de planillas oficiales RedTulum.
* **Monetización:** Arquitectura de paywall integrada para suscripción mensual ($1.500 ARS/mes) lista para pasarela de pagos (Mercado Pago).

---

## ⚙️ Arquitectura del Sistema

### 1. Interacción NFC y Enrutamiento Unificado
Cada chip físico (NTAG213 / NTAG215) se programa con una URL limpia y corta:
```text
https://tudominio.com/p/agustin-gomez-acha
https://tudominio.com/p/cordoba-acha
