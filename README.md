# prestamos
Negocio de Préstamos: PWA para controlar clientes, cuotas, cobros y caja. Funciona sin internet.

## Novedades v1.6
- Se quitaron los días de atraso de cada fila (intereses, cuotas vencidas o parciales, estado de cuenta y lista de pago). Los días quedan una sola vez por cliente ("Atrasado · N d") y en el mensaje de WhatsApp.
- El resumen bajo la tabla muestra cuántos períodos de interés están pendientes.

## Novedades v1.5
- Se quitaron los botones "Registrar pago" y "Pagó con atraso" de la fila de interés pendiente.
- Un pago a capital que completa la cuota atrasada da por no cobrados los intereses pendientes (quedan en "Intereses no cobrados", con "Volver a cobrar"). Un abono parcial no borra nada.
- Para cobrar el interés, se registra antes en "Pagos de interés": se aplica a la fecha más antigua y el monto viene prellenado.
- La fila de interés pendiente muestra "Debe $X".

## Novedades v1.4
- Cada fecha de pago que vence sin pago genera su interés pendiente ("Int.") y la cuota se corre a la fecha siguiente (conserva su número).
- Capital pendiente e interés pendiente se muestran por separado.
- Botón "Pagó con atraso": no se cobra el interés, la cuota vuelve a su fecha y queda anotado en "Intereses no cobrados" (con opción "Volver a cobrar").
- Mensaje de WhatsApp y estado de cuenta con capital e interés por separado.
- Solo aplica a préstamos con "interés por período" mayor que 0.
