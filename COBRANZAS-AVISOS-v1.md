# Cobranzas: avisos e intereses v1

Fecha: 31 de octubre de 2026

## Qué incorpora

- Configuración independiente por distribuidora.
- Cola diaria de recordatorios para entregas realizadas con saldo pendiente.
- Mensaje editable con cliente, monto, fecha, detalle de remitos, días de atraso y datos bancarios.
- Agrupación de varias entregas del mismo cliente en un solo mensaje.
- Registro separado de “WhatsApp abierto” y “mensaje enviado”.
- Interés simple diario opcional, sin capitalización.
- Días de gracia, tasa mensual, tope acumulado y fecha inicial configurables.
- Registro auditable de cada interés dentro de Cuentas Corrientes.
- Protección contra duplicados al reintentar la tarea diaria.

## Estado inicial seguro

Los avisos y los intereses quedan desactivados para todas las empresas. Cada distribuidora debe entrar a:

`Gestión de clientes → Cuentas corrientes → Configurar cobranzas`

y guardar sus propias condiciones.

## Envío de mensajes

La primera versión prepara el mensaje y abre WhatsApp con todos los datos completos. El usuario debe enviarlo y luego confirmar “Marcar enviado”.

El envío totalmente automático requiere una cuenta de WhatsApp Business Platform, un número habilitado, una plantilla aprobada por Meta y credenciales guardadas en una función segura del servidor. No se almacenan tokens de WhatsApp en el navegador.

## Cálculo del interés

Fórmula diaria:

`capital pendiente × tasa mensual / 100 / 30`

El proceso usa solamente capital pendiente, aplica el tope configurado y nunca calcula interés sobre interés. Cada empresa debe usar condiciones previamente informadas y acordadas con sus clientes. Como referencia general, el Código Civil y Comercial argentino regula intereses en los artículos 767 a 771: https://www.argentina.gob.ar/normativa/nacional/235975/texto

## Verificación

- Sintaxis de los 22 scripts del panel.
- Pruebas de cuentas corrientes, stock, rutas, navegación y permisos.
- Migración instalada en Supabase.
- Tarea diaria programada a las 09:05 de Argentina.
- Validación con cero avisos e intereses mientras el módulo está desactivado.

