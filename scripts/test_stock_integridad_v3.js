const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('stock-integridad-v3.js','utf8');
const panelPath=process.argv[2]||(fs.existsSync('PANEL-index_15.html')?'PANEL-index_15.html':'index.html');
const html=fs.readFileSync(panelPath,'utf8');
let passed=0;
function fixture(){
  const data={A:10,B:6},writes=[],prompts=[],storage={},notifs=[];
  const c={console,Date,Math,JSON,Number,String,Array,Set,Map,Promise,encodeURIComponent,
    navigator:{onLine:true},_sbEmpId:'empresa-prueba',stockData:{...data},currentUser:{name:'Prueba'},
    localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v},removeItem:k=>delete storage[k]},
    document:{getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}},
    dbStock:[{id:'A',n:'Producto A'},{id:'B',n:'Producto B'}],_ctrlStockOn:()=>true,
    renderEditItems(){},renderRutas(){},renderStock(){},_pgRender(){},_refrescarRutasEntreDispositivos:async()=>true,
    _productoUuidNuevo:()=> 'operacion-prueba',_stkItems:x=>x.map(i=>({codigo:i.id,cant:i.c})),
    _sbOfflineCache:{},_idbSet:async()=>{},_guardarRutasOffline(){},_sbCacheSave(){},
    showNotif:(m,t)=>notifs.push({m,t}),_confirmar:async p=>{prompts.push(p);return true;},
    _sbFetchTransporte:async(method,path,b)=>{
      if(method==='POST'&&path.endsWith('stock_deposito_panel'))return {ok:true,lotes:[{id:'L',codigo:'A',lote:'L-1',estado:'disponible',cantidad:2}]};
      if(method!=='GET'){
        writes.push({path,b:JSON.parse(JSON.stringify(b||{}))});
        if(path.endsWith('stock_ajustar_manual_atomico')){data[b.p_codigo]=b.p_nuevo;return {ok:true,nuevo:b.p_nuevo};}
        if(path.endsWith('ruta_editar_items_atomico'))return {ok:true,items:b.p_items,importe:b.p_importe,dscGeneral:b.p_dsc_general};
        return {ok:true};
      }
      if(path.includes('/empresas?'))return [{control_stock:c.control!==false}];
      if(path.includes('/backup_pedidos?'))return [{items:[{id:'A',c:3}],stock_devuelto:!!c.devuelto}];
      if(path.includes('/stock?'))return Object.entries(data).map(([codigo,cantidad])=>({codigo,cantidad,reservado:0}));
      throw Error('Lectura imprevista '+path);
    },_calcularPedidoUnico:o=>({total:(o.items||[]).reduce((n,x)=>n+x.c*100,0),generalYaIncluido:false,ahorroItems:0,montoDscGen:0}),
    _importeRutaConIVA:(r,k,n)=>n,getBackups:()=>[],saveBackups(){},actualizarVentaDeRuta:async()=>{},
    rutasData:{R:{clientes:{C:{items:[{id:'A',c:3,p:100,sub:300}],importe:300}}}}
  };
  c.window=c;vm.createContext(c);vm.runInContext(source,c);
  c.sbFetch=(m,p,b)=>c.StockSeguro.enviar(m,p,b,c._sbFetchTransporte);
  const call=(fn,b)=>c.sbFetch('POST','/rest/v1/rpc/'+fn,{p_empresa:c._sbEmpId,...b});
  return {c,data,writes,prompts,storage,notifs,call};
}
async function test(name,fn){await fn();passed++;console.log('OK '+name);}
async function run(){
await test('cancelar no envía ni modifica stock',async()=>{const f=fixture();f.c._confirmar=async()=>false;
  await assert.rejects(f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:2}]}),/cancelado/);assert.equal(f.writes.length,0);assert.equal(f.data.A,10);});
await test('el modal detalla antes/después y no desaparece solo',async()=>{const f=fixture();await f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:2}]});
  assert.equal(f.prompts.length,1);assert.equal(f.prompts[0].persistente,true);assert.match(f.prompts[0].mensaje,/10 → 8/);assert.equal(f.writes.length,1);});
await test('no escribe mientras espera y bloquea doble toque',async()=>{const f=fixture();let resolver;f.c._confirmar=()=>new Promise(r=>resolver=r);
  const p=f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:2}]});await new Promise(setImmediate);assert.equal(f.writes.length,0);
  await assert.rejects(f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:2}]}),/pendiente de confirmación/);resolver(true);await p;assert.equal(f.writes.length,1);});
await test('congela cantidades mostradas al confirmar',async()=>{const f=fixture();let resolver;f.c._confirmar=()=>new Promise(r=>resolver=r);
  const items=[{codigo:'A',cant:2}],p=f.call('stk_confirmar_salida',{p_items:items});await new Promise(setImmediate);items[0].cant=8;resolver(true);await p;assert.equal(f.writes[0].b.p_items[0].cant,2);});
await test('otra venta durante el modal exige revisar de nuevo',async()=>{const f=fixture();f.c._confirmar=async()=>{f.data.A=9;return true;};
  await assert.rejects(f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:2}]}),/stock cambió/);assert.equal(f.writes.length,0);});
await test('cambio de empresa invalida confirmación',async()=>{const f=fixture();f.c._confirmar=async()=>{f.c._sbEmpId='otra';return true;};
  await assert.rejects(f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:2}]}),/empresa cambió/);assert.equal(f.writes.length,0);});
await test('offline no agenda movimientos para después',async()=>{const f=fixture();f.c.navigator.onLine=false;
  await assert.rejects(f.call('stk_devolver',{p_items:[{codigo:'A',cant:2}]}),/conexión/);assert.equal(f.writes.length,0);});
await test('devolución refleja entrada, no salida',async()=>{const f=fixture();await f.call('stk_devolver',{p_items:[{codigo:'A',cant:2}]});assert.match(f.prompts[0].mensaje,/10 → 12/);});
await test('editar precios no inventa movimientos',async()=>{const f=fixture();await f.call('pedido_editar_atomico',{p_pedido_id:'P',p_patch:{items:[{id:'A',c:3,p:200}]}});assert.equal(f.prompts.length,0);assert.equal(f.writes.length,1);});
await test('editar rechazado no vuelve a devolver stock',async()=>{const f=fixture();f.c.devuelto=true;await f.call('pedido_editar_atomico',{p_pedido_id:'P',p_patch:{items:[]}});assert.equal(f.prompts.length,0);});
await test('preventa no exige movimiento inexistente',async()=>{const f=fixture();f.c.control=false;await f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:50}]});assert.equal(f.prompts.length,0);});
await test('manual siempre se confirma aun en preventa',async()=>{const f=fixture();f.c.control=false;await f.call('stock_ajustar_manual_atomico',{p_codigo:'A',p_nuevo:12,p_esperado:10});assert.equal(f.prompts.length,1);});
await test('vendedor termina el pedido sin un segundo modal de stock',async()=>{const f=fixture();f.c.currentUser={role:'vendedor',name:'Vendedora'};
  await f.call('pedido_confirmar_atomico',{p_local_id:'pedido-local',p_pedido:{},p_items_stock:[{codigo:'A',cant:2}]});
  assert.equal(f.prompts.length,0);assert.equal(f.writes.length,1);assert.match(f.writes[0].path,/pedido_confirmar_atomico$/);});
await test('confirmación manual previa se consume una sola vez',async()=>{const f=fixture();f.c.StockSeguro.autorizarManual('A',10,12);
  await f.call('stock_ajustar_manual_atomico',{p_codigo:'A',p_nuevo:12,p_esperado:10});assert.equal(f.prompts.length,0);
  f.data.A=10;await f.call('stock_ajustar_manual_atomico',{p_codigo:'A',p_nuevo:12,p_esperado:10});assert.equal(f.prompts.length,1);});
await test('rechaza escritura directa, decimales y stock insuficiente',async()=>{const f=fixture();
  await assert.rejects(f.c.sbFetch('PATCH','/rest/v1/stock?codigo=eq.A',{cantidad:20}),/confirmación/);
  await assert.rejects(f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:1.5}]}),/Cantidad inválida/);
  await assert.rejects(f.call('stk_confirmar_salida',{p_items:[{codigo:'A',cant:20}]}),/Stock insuficiente/);assert.equal(f.writes.length,0);});
await test('cuarentena consulta RPC autorizada, no tabla privada',async()=>{const f=fixture();await f.call('stock_lote_cambiar_estado',{p_lote_id:'L',p_destino:'cuarentena',p_cantidad:2});assert.match(f.prompts[0].mensaje,/10 → 8/);});
await test('pendientes viejos de stock/productos no se reproducen',async()=>{const {c}=fixture();
  for(const op of [{method:'STOCK_OUT'},{method:'STOCK_RETURN'},{method:'SB_POST',path:'productos'},{method:'SB_PATCH',path:'ruta_clientes',data:{body:{items:[]}}},{method:'PATCH',path:'empresas/E/backupPedidos/P',data:{items:[]}}])assert.equal(c.StockSeguro.esDiferida(op),true);
  assert.equal(c.StockSeguro.esDiferida({method:'SB_PATCH',path:'ruta_clientes',data:{body:{monto_pagado:200}}}),false);});
await test('cancelar edición no deja items locales agregados o eliminados',async()=>{const f=fixture();f.c._confirmar=async()=>false;
  const before=JSON.stringify(f.c.rutasData);const ok=await f.c.guardarItemsEditados('R','C',[],null);assert.equal(ok,false);assert.equal(JSON.stringify(f.c.rutasData),before);assert.equal(f.writes.length,0);});
await test('editar ruta envía UNA operación conjunta y recién después actualiza',async()=>{const f=fixture();
  const ok=await f.c.guardarItemsEditados('R','C',[{id:'A',c:1,p:100,sub:100}],null);assert.equal(ok,true);assert.equal(f.writes.length,1);assert.match(f.writes[0].path,/ruta_editar_items_atomico$/);assert.equal(f.writes[0].b.p_items_esperados[0].c,3);assert.equal(f.c.rutasData.R.clientes.C.items[0].c,1);});
await test('refresh stock acepta inventario vacío del servidor',async()=>{const f=fixture();delete f.data.A;delete f.data.B;await f.c._stkRefrescar();assert.equal(Object.keys(f.c.stockData).length,0);});
await test('no reactiva productos automáticamente',async()=>{const f=fixture();f.c._stkAutoApagarSinStock();assert.equal(f.writes.length,0);});
assert.match(html,/stock-integridad-v3\.js\?v=20260930-1/);assert.match(fs.readFileSync('sw.js','utf8'),/stock-integridad-v3/);
console.log(passed+' pruebas de integridad de stock aprobadas');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
