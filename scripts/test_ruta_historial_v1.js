const fs=require('node:fs'),assert=require('node:assert/strict'),api=require('../ruta-historial-v1.js');
const cambios=[{campo:'efectivo',antes:0,despues:500},{campo:'transferencia',antes:0,despues:250},{campo:'entregado',antes:false,despues:true},
 {campo:'items',antes:[{id:'A',n:'Producto QA',c:2,p:100,sub:200,disc:null},{id:'B',n:'Quitado',c:1,p:10}],despues:[{id:'A',n:'Producto QA',c:3,p:90,sub:270,disc:{tipo:'%',valor:10}},{id:'C',n:'Agregado',c:1,p:50}]},
 {campo:'pagos_adicionales',antes:[],despues:[{monto:300,forma:'transferencia',nota:'Abono QA'}]}];
const e={id:'audit1',ts:'2026-11-20T10:00:00Z',quien:'Ana QA',uid:'ana',rol:'repartidor',origen:'Reparto',servidor:true,verificado:true,cambios};
const before=JSON.stringify(e),ev=api.eventos({auditLog:[e,{id:'viejo',ts:'2026-07-01',desc:'Cambio antiguo'},{id:'aux',accion:'confirmar_rechazo',complementadoPor:'audit1'}]});
assert.equal(ev.length,2);assert.equal(ev[0].quien,'Ana QA');assert.equal(ev[0].rol,'Repartidor');assert.equal(ev[0].origen,'Reparto');assert.equal(ev[0].verificado,true);
const texto=ev[0].detalle.join('\n');for(const x of ['Efectivo: $0,00 → $500,00','Transferencia: $0,00 → $250,00','Entregado: No → Sí','cantidad: 2 → 3','precio unitario: $100,00 → $90,00','descuento: Sin dato → 10%','Quitado: Quitado','Agregado: Agregado','Pago agregado: $300,00'])assert.ok(texto.includes(x),x);
assert.equal(ev[1].quien,'Usuario no registrado');assert.equal(ev[1].rol,'Perfil no registrado');assert.equal(JSON.stringify(e),before,'solo lectura');
const nota={id:'N',producto:'Producto QA',cantidad:2,monto:200,estado:'aplicada',stkDev:true};
const resumen=api.detalles([{campo:'devoluciones',antes:[nota],despues:[{...nota,estado:'rechazada',stkDev:false,stockAbsorbidoPorRechazo:true}]}]).join('\n');assert.ok(resumen.includes('sin duplicar'));assert.ok(!resumen.includes('Sí → No'));
const logNotas=[{...e,cambios:[{campo:'devoluciones',antes:[],despues:[nota]}]}];
assert.equal(api.eventos({auditLog:logNotas,devoluciones:[{...nota,historial:[{accion:'aplicada',ts:e.ts,por:'ana'}]}]}).length,1,'no duplicar evento de la misma nota');
assert.equal(api.eventos({auditLog:Array.from({length:55},(_,i)=>({...e,id:'a'+i,ts:new Date(2026,10,20,12,i).toISOString()}))}).length,55,'no truncar a 30');
const duplicados=api.detalleItems([{id:'A',n:'Duplicado',c:1,p:10},{id:'A',n:'Duplicado',c:2,p:8}],[{id:'A',n:'Duplicado',c:3,p:9}]);assert.equal(duplicados.length,3,'no inventar correspondencia entre líneas duplicadas');
const html=fs.readFileSync(process.argv[2]||(fs.existsSync('PANEL-index_15.html')?'PANEL-index_15.html':'index.html'),'utf8');assert.ok(html.includes('HistorialRuta.pintar(logDiv,cli,rutaKey,cliKey)'));assert.ok(!html.includes('if(log.length > 30) log = log.slice(-30)'));
console.log('Historial: usuario/rol, efectivo/transferencia, entrega, productos/precios/descuentos, pagos, notas sin doble stock, legado y 55 eventos conservados OK');
