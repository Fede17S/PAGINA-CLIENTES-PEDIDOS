-- Prueba transaccional sobre empresa/productos ficticios. Siempre ROLLBACK.
begin;
do $$
declare e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid(); c4 uuid:=gen_random_uuid(); doc jsonb; tok_admin text; tok_rep text;
  respuesta jsonb; cantidad integer; nota jsonb; aviso jsonb;
begin
  insert into public.empresas(id,codigo,nombre,control_stock)values(e,'QA_RR_'||e,'QA temporal revisión reparto',true);
  tok_admin:=public.app_firmar_token(e,'qa_admin',1);tok_rep:=public.app_firmar_token(e,'qa_reparto',1);
  perform set_config('request.headers',jsonb_build_object('x-empresa-token',tok_admin)::text,true);
  insert into public.usuarios(empresa_id,uid,name,role)values(e,'qa_admin','QA Admin','admin'),(e,'qa_reparto','QA Reparto','repartidor');
  insert into public.productos(empresa_id,codigo,nombre)values(e,'QA_RR','QA Producto');
  insert into public.stock(empresa_id,codigo,cantidad)values(e,'QA_RR',100);
  insert into public.rutas(id,empresa_id,nombre)values(r,e,'QA Ruta');
  doc:='[{"id":"QA_RR","n":"QA Producto","c":10,"p":100,"sub":1000}]'::jsonb;
  insert into public.ruta_clientes(id,ruta_id,empresa_id,nom,importe,items,efectivo,transferencia)
    values(c,r,e,'QA Pedido',1000,doc,0,0),(c2,r,e,'QA Pedido 2',1000,doc,0,0),(c3,r,e,'QA Pedido 3',1000,doc,0,0);
  insert into public.ruta_clientes(id,ruta_id,empresa_id,nom,importe,items,devoluciones)values(c4,r,e,'QA Legado',1000,doc,
    '[{"producto":"QA Producto","codigo":"QA_RR","cantidad":1,"motivo":"devolucion","ts":"2026-07-30T10:00:00Z","estado":"notificada","monto":100}]'::jsonb);
  tok_admin:=public.app_firmar_token(e,'qa_admin',1);tok_rep:=public.app_firmar_token(e,'qa_reparto',1);
  perform set_config('request.headers',jsonb_build_object('x-empresa-token',tok_rep)::text,true);
  perform set_config('role','anon',true);
  nota:='{"id":"nc_qa_1","producto":"QA Producto","codigo":"QA_RR","cantidad":2,"motivo":"devolucion","precioUnit":999999,"monto":999999,"estado":"aplicada","stkDev":true}'::jsonb;
  respuesta:=public.reparto_revision_v1(e,c,'notificar_nota',jsonb_build_object('nota',nota));
  if respuesta->'parada'->'devoluciones'->0->>'estado'<>'notificada' or (respuesta->'parada'->'devoluciones'->0->>'monto')::numeric<>200 then raise exception 'QA notificación no segura'; end if;
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>100 then raise exception 'QA notificó y tocó stock'; end if;
  begin
    perform public.reparto_revision_v1(e,c,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
    raise exception 'QA repartidor aprobó';
  exception when others then if sqlerrm not like '%REVISION_SOLO_ADMIN%' then raise;end if;end;
  perform set_config('request.headers',jsonb_build_object('x-empresa-token',tok_admin)::text,true);
  respuesta:=public.reparto_revision_v1(e,c,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  perform public.reparto_revision_v1(e,c,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>102 then raise exception 'QA doble devolución'; end if;
  -- Volver a notificar no resucita ni pisa la nota aprobada.
  respuesta:=public.reparto_revision_v1(e,c,'notificar_nota',jsonb_build_object('nota',nota));
  if respuesta->'parada'->'devoluciones'->0->>'estado'<>'aplicada' then raise exception 'QA revivió nota';end if;
  perform public.reparto_revision_v1(e,c,'notificar_rechazo','{"id":"rr_qa_1","motivo":"Rechazó la mercadería"}');
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>102 then raise exception 'QA rechazo pendiente tocó stock';end if;
  respuesta:=public.reparto_revision_v1(e,c,'confirmar_rechazo');
  perform public.reparto_revision_v1(e,c,'confirmar_rechazo');
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>110 then raise exception 'QA rechazo completo duplicó parcial';end if;
  if not (respuesta->'parada'->>'rechazo_confirmado')::boolean then raise exception 'QA rechazo no confirmado';end if;
  begin perform public.reparto_revision_v1(e,c,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));raise exception 'QA nota post rechazo';
    exception when others then if sqlerrm not like '%REVISION_PEDIDO_YA_RECHAZADO%' then raise;end if;end;
  -- No aprobar el rechazo conserva pedido y stock. Replay del aviso no lo revive.
  aviso:='{"id":"rr_qa_2","motivo":"Local cerrado"}';
  perform public.reparto_revision_v1(e,c2,'notificar_rechazo',aviso);
  perform public.reparto_revision_v1(e,c2,'desestimar_rechazo');
  respuesta:=public.reparto_revision_v1(e,c2,'notificar_rechazo',aviso);
  if (respuesta->'parada'->>'rechazado')::boolean then raise exception 'QA rechazo reapareció';end if;
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>110 then raise exception 'QA no aprobar movió stock';end if;
  -- Rotura no devuelve mercadería.
  nota:=nota||'{"id":"nc_qa_rotura","motivo":"rotura"}'::jsonb;
  perform public.reparto_revision_v1(e,c2,'notificar_nota',jsonb_build_object('nota',nota));
  perform public.reparto_revision_v1(e,c2,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>110 then raise exception 'QA rotura volvió a stock';end if;
  -- Rechazar una nota pendiente no mueve stock. No se puede aplicar después.
  nota:=nota||'{"id":"nc_qa_rechazada","motivo":"devolucion"}'::jsonb;
  perform public.reparto_revision_v1(e,c2,'notificar_nota',jsonb_build_object('nota',nota));
  perform public.reparto_revision_v1(e,c2,'rechazar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  begin perform public.reparto_revision_v1(e,c2,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));raise exception 'QA aplicó nota rechazada';
    exception when others then if sqlerrm not like '%REVISION_CAMBIO_EN_OTRO_DISPOSITIVO%' then raise;end if;end;
  -- Cantidad excedida y producto ajeno fallan sin efectos parciales.
  begin perform public.reparto_revision_v1(e,c3,'notificar_nota',jsonb_build_object('nota',nota||'{"id":"nc_qa_exceso","cantidad":11}'));raise exception 'QA aceptó exceso';
    exception when others then if sqlerrm not like '%REVISION_CANTIDAD_SUPERA_PEDIDO%' then raise;end if;end;
  if (select jsonb_array_length(coalesce(devoluciones,'[]'::jsonb)) from public.ruta_clientes where id=c3)<>0 then raise exception 'QA quedó escritura parcial';end if;
  begin perform public.reparto_revision_v1(gen_random_uuid(),c3,'notificar_rechazo',aviso);raise exception 'QA accedió otra empresa';
    exception when others then if sqlerrm not like '%REVISION_EMPRESA_DENEGADA%' then raise;end if;end;
  begin perform public.reparto_revision_v1(e,c3,'notificar_rechazo','{"id":"rr_qa_reprog","motivo":"Pidió otro día"}');raise exception 'QA reprogramación como rechazo';
    exception when others then if sqlerrm not like '%REVISION_USAR_REPROGRAMACION_SIN_STOCK%' then raise;end if;end;
  -- Rechazo total con rotura aprobada: sólo vuelve la parte sana (8 de 10).
  perform public.reparto_revision_v1(e,c2,'notificar_rechazo','{"id":"rr_qa_rotura_total","motivo":"Rechazó mercadería"}');
  perform public.reparto_revision_v1(e,c2,'confirmar_rechazo');
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>118 then raise exception 'QA rotura regresó al rechazar completo';end if;
  -- Si falla la reversión por stock insuficiente, la nota y el movimiento no quedan a medias.
  nota:=nota||'{"id":"nc_qa_error","cantidad":2}'::jsonb;
  perform public.reparto_revision_v1(e,c3,'notificar_nota',jsonb_build_object('nota',nota));
  perform public.reparto_revision_v1(e,c3,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  perform public.stk_confirmar_salida(e,'qa_consumir_todo','[{"codigo":"QA_RR","cant":120}]'::jsonb,'qa_admin','QA transaccional');
  begin perform public.reparto_revision_v1(e,c3,'rechazar_nota',jsonb_build_object('nota',nota,'esperado','aplicada'));raise exception 'QA permitió stock negativo';
    exception when others then if sqlerrm not like '%STOCK_INSUFICIENTE%' then raise;end if;end;
  if (select devoluciones->0->>'estado' from public.ruta_clientes where id=c3)<>'aplicada' then raise exception 'QA reversión fallida cambió la nota';end if;
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>0 then raise exception 'QA stock parcial después del error';end if;
  nota:='{"producto":"QA Producto","codigo":"QA_RR","cantidad":1,"motivo":"devolucion","ts":"2026-07-30T10:00:00Z"}'::jsonb;
  perform public.reparto_revision_v1(e,c4,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  perform public.reparto_revision_v1(e,c4,'aplicar_nota',jsonb_build_object('nota',nota,'esperado','notificada'));
  if (select stock.cantidad from public.stock where empresa_id=e and codigo='QA_RR')<>1 then raise exception 'QA legado duplicó devolución';end if;
  perform set_config('role','postgres',true);
end $$;
rollback;
select 'OK: reportar sin stock, rol admin, doble clic/reintento, parcial+total, no aprobar sin stock, replay, rotura, exceso, otra empresa y reprogramación. Fixtures revertidos.' as resultado;
