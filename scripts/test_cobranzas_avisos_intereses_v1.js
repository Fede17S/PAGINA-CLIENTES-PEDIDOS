const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const panelPath = ['PANEL-index_15.html', 'index.html']
  .map(name => path.join(root, name))
  .find(file => fs.existsSync(file));
if (!panelPath) throw new Error('No se encontró el panel principal');
const panel = fs.readFileSync(panelPath, 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261031174132_cobranzas_avisos_intereses_v1.sql'),
  'utf8'
);

function check(ok, message) {
  if (!ok) throw new Error(message);
}

// Interfaz y flujo asistido.
check(panel.includes('id="modal-cob-config"'), 'Falta el configurador de cobranzas');
check(panel.includes('id="modal-cob-avisos"'), 'Falta la bandeja de avisos');
check(panel.includes('cobranza_guardar_config_v1'), 'La interfaz no guarda la configuración por RPC');
check(panel.includes('cobranza_generar_avisos_hoy_v1'), 'La interfaz no genera la cola del día');
check(panel.includes('cobranza_avisos_pendientes_v1'), 'La interfaz no consulta la cola de avisos');
check(panel.includes('cobranza_marcar_avisos_v1'), 'La interfaz no registra el estado de los avisos');
check(panel.includes('Abrir WhatsApp') && panel.includes('Marcar enviado'), 'Abrir y confirmar envío deben ser acciones separadas');
check(panel.includes('{monto_total}') && panel.includes('{fecha_entrega}') && panel.includes('{datos_pago}'), 'Faltan variables esenciales del mensaje');
check(panel.includes('id="cc2-btn-whatsapp"'), 'El botón de WhatsApp no tiene un estado controlable');
check(panel.includes('function _cc2AbrirWhatsAppSeguro(url)'), 'Falta la apertura compatible con navegador y Android');
check(panel.includes('window.open(url,"_system")'), 'La APK no intenta abrir WhatsApp fuera del WebView');
check(panel.includes('/Android|iPhone|iPad|iPod/i.test'), 'El navegador móvil no usa navegación directa a WhatsApp');
check(panel.includes('if(!abierta)window.location.href=url'), 'Falta el respaldo cuando el navegador bloquea la ventana');
check(panel.includes('select=telefono&id=eq.'), 'Cuenta corriente no recupera el teléfono desde el servidor');
check(panel.includes('max-width:960px') && panel.includes('max-height:calc(100dvh - 32px)'), 'El modal de cuenta corriente sigue limitado o sin alto adaptable');
check(panel.includes('repeat(auto-fit,minmax(170px,1fr))'), 'Las tarjetas no se adaptan al ancho disponible');

// Seguridad y aislamiento por empresa.
check(migration.includes('empresa_id uuid primary key references public.empresas'), 'La configuración no está aislada por distribuidora');
check(migration.includes("array['admin','co-admin']"), 'La configuración no está limitada a administradores');
check(migration.includes('public.app_empresa_id()=p_empresa_id'), 'La lectura de avisos no valida la empresa activa');
check(!/grant\s+(insert|update|delete|all)\s+on\s+public\.cobranza_/i.test(migration), 'El navegador no debe escribir directamente las tablas de cobranza');

// Idempotencia y cálculo simple, sin capitalización.
check(migration.includes('unique (empresa_id, ruta_cliente_id, fecha)'), 'Falta idempotencia diaria de intereses');
check(migration.includes('unique (empresa_id, ruta_cliente_id, etapa_dias)'), 'Falta idempotencia por etapa de aviso');
check(migration.includes('v.capital_pendiente*v.tasa_mensual_pct/100/30'), 'El interés no se calcula sólo sobre capital pendiente');
check(!/\(v\.capital_pendiente\s*\+\s*v_interes\).*tasa/i.test(migration), 'No se debe cobrar interés sobre interés');
check(migration.includes('greatest(v.aplicar_desde'), 'Falta el corte para impedir retroactividad involuntaria');
check(migration.includes('v_tope:=round(coalesce(v.importe,0)*v.tope_interes_pct/100,2)'), 'Falta el tope acumulado configurable');
check(migration.includes("on conflict(empresa_id,ruta_cliente_id,fecha) do nothing"), 'Un reintento podría duplicar intereses');
check(migration.includes("on conflict(empresa_id,ruta_cliente_id,etapa_dias) do nothing"), 'Un reintento podría duplicar avisos');

// Integración contable y ejecución diaria.
check(migration.includes("'ajuste_debito'"), 'El interés no queda registrado en Cuentas corrientes');
check(migration.includes("'sistema-cobranzas'"), 'Falta identificar los cargos automáticos');
check(migration.includes("'distribix-cobranzas-diario-v1'"), 'Falta la tarea diaria');
check(migration.includes("'5 12 * * *'"), 'La tarea diaria no está fijada a las 09:05 de Argentina');
check(migration.includes("rc.entregado is true") && migration.includes("coalesce(rc.rechazado,false) is false"), 'Sólo deben procesarse entregas válidas');

console.log('Cobranzas v1: configuración, avisos, interés simple, permisos e idempotencia OK');
