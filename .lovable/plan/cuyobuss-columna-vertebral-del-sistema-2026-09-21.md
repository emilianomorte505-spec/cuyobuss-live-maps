# Cuyobuss — columna vertebral del sistema

Tu interfaz HTML pasa tal cual a la app (mismos colores, logo, tipografías, paywall y tarjetas de arribos). No se cambia nada del diseño. Lo que se agrega es el motor que la alimenta sola.

## Cómo funciona una parada

```text
Tag NFC  ->  cuyobuss.app/p/cordoba-acha
                 |
         la web busca esa parada (lat/lng)
                 |
         consulta a Google con esas coordenadas
                 |
         devuelve líneas + minutos  ->  tu interfaz
```

Cada tag lleva solo un código corto de parada en la URL. La parada guarda nombre y coordenadas; los horarios nunca se cargan a mano.

## Fase 1 — La interfaz (esta entrega)

- Página principal con el diseño exacto que enviaste.
- Ruta por parada: `/p/<codigo>` — es la URL que se graba en cada tag NFC.
- Paywall y "Probar una parada gratis" funcionando igual que en tu HTML.
- Datos aún de ejemplo, para poder imprimir y probar el flujo del tag.

## Fase 2 — Datos automáticos de Google

- Se conecta Google Maps (Transit/Routes) desde el servidor de la app.
- Por cada parada se piden los próximos arribos usando sus coordenadas y la hora actual.
- Respuesta cacheada unos minutos, así muchos toques de NFC no disparan muchas consultas (Google se cobra por consulta).
- Si Google no responde, se muestra el último dato conocido en vez de una pantalla vacía.

Necesito de tu lado: autorizar la conexión de Google Maps cuando te aparezca el cartel. Si no la tenés, te guío para crearla.

## Fase 3 — Tus paradas

- Base de datos de paradas: código, nombre, coordenadas, barrio.
- Pantalla interna para cargar una parada en 20 segundos y generar la URL del tag.
- Empezamos con una parada real (Av. Córdoba y Gral. Acha), la validamos en la calle, y recién ahí se replica al resto.

## Fase 4 — Suscripción

- Membresía $1.500 ARS/mes con cobro real (Mercado Pago en Argentina).
- Cuentas de usuario para recordar quién pagó.

## Detalles técnicos

- App en React + TanStack Start; el HTML se porta a componentes, con todos los colores como variables de diseño en `src/styles.css`.
- Ruta de parada: `src/routes/p.$stopId.tsx`.
- Las consultas a Google se hacen solo del lado del servidor con una función de servidor; la clave nunca queda en el navegador.
- Datos de paradas y suscripciones en Lovable Cloud (base de datos y logins incluidos).

## Orden sugerido

Fase 1 ahora. Apenas la apruebes y conectemos Google, seguimos con la Fase 2 sobre la misma parada de prueba.
