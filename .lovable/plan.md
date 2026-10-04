# Mejorar lectura al sol y avisos a bordo

## Cambios
- Aumentar contraste, peso y tamaño de textos secundarios, estados y próximos horarios en la pantalla de parada.
- Sustituir estilos de color incrustados por clases coherentes con la interfaz Cuyobuss.
- Mostrar el resultado de “Me subí” en un aviso destacado, diferenciando éxito y problema.
- Reemplazar “No encontramos una pasada cercana en la planilla” por una explicación simple: no se pudo identificar ese colectivo y no se modificaron los horarios.
- Mantener el botón disponible por línea y conservar el límite actual entre reportes.

## Verificación
- Revisar la parada en tamaño de celular y escritorio.
- Probar un aviso a bordo y confirmar que el mensaje sea legible, claro y no desacomode las tarjetas.
- Confirmar que la aplicación compile sin errores.

## Detalles técnicos
- Cambios limitados a `StopPage` y a los estilos visuales Cuyobuss; solo se ajustará el texto de respuesta del servidor.
- No se modificarán horarios, pagos, cuentas ni reglas de acceso.
