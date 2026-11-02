# prestamos
Negocio de Préstamos: PWA para controlar clientes, cuotas, cobros y caja. Funciona sin internet.

## Novedades v1.4
- Cada fecha de pago que vence sin pago genera su interés pendiente ("Int.") y la cuota se corre a la fecha siguiente (conserva su número).
- Capital pendiente e interés pendiente se muestran por separado.
- Botón "Pagó con atraso": no se cobra el interés, la cuota vuelve a su fecha y queda anotado en "Intereses no cobrados" (con opción "Volver a cobrar").
- Mensaje de WhatsApp y estado de cuenta con capital e interés por separado.
- Solo aplica a préstamos con "interés por período" mayor que 0.
