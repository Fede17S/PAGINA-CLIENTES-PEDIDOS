const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const lib=require('../pedidos-proveedor-v2.js');
const catalog={U1:{id:'U1',codigo:'001',nombre:'Producto A',proveedorId:'P1',precioBase:100,unidadesBulto:20,unidadBulto:'bulto'},
 U2:{id:'U2',codigo:'002',nombre:'Producto B',proveedorId:'P2',precioBase:50.25,unidadesBulto:12,unidadBulto:'caja'},
 U3:{id:'U3',codigo:'003',precioBase:0,unidadesBulto:1},U4:{id:'U4',codigo:'004',proveedorId:'P1',precioBase:200,vendePor:'peso',unidadesBulto:24}};
const suppliers=[{id:'P1',nombre:'Proveedor Uno',whatsapp:'+5492801234567'},{id:'P2',nombre:'Proveedor Dos',telefono:'02801234567'}];
const raw=[{id:'001',n:'Producto A',cant:240,total:48000},{id:'U2',n:'Producto B',cant:25,total:2500},{id:'003',n:'Falta costo',cant:2,total:200},
 {id:'DESCONOCIDO',n:'Cliente privado <script>',cant:1,total:999,_ub:6},{id:'004',n:'Producto por peso',cant:.75,total:300,esPeso:true}];
const before=JSON.stringify({catalog,suppliers,raw});const model=lib.preparar(raw,catalog,suppliers);
assert.equal(model.grupos.length,3);assert.equal(model.rows[0].costoCompra,24000);assert.equal(model.rows[0].equivalencia,'12 bultos x20');
assert.equal(model.rows[1].equivalencia,'2 cajas x12 + 1 u sueltas');assert.equal(model.rows[1].costoCompra,1256.25);
assert.equal(model.rows[2].costoCompra,null,'Precio 0 no significa gratis');assert.equal(model.rows[3].costoCompra,null,'No usar venta ni costo histórico como compra actual');
assert.equal(model.rows[4].costoCompra,150);assert.equal(model.rows[4].equivalencia,'0,75 kg');assert.equal(model.rows[4].unidadesBulto,null);
const s=lib.resumen(model.rows);assert.equal(s.compra,25406.25);assert.equal(s.venta,51999);assert.equal(s.faltantes,2);assert.equal(s.unidades,268);assert.equal(s.kg,.75);
assert.equal(JSON.stringify({catalog,suppliers,raw}),before,'No modificar catálogo ni demanda');
for(const n of ['+5492801234567','005492801234567','5492801234567','02801234567','2801234567'])assert.equal(lib.telefono(n),'5492801234567');
assert.equal(lib.telefono('+15551234567'),'15551234567');assert.equal(lib.telefono('compras@proveedor'),'');assert.equal(lib.telefono('123'),'');
const g=model.grupos.find(g=>g.id==='P1'),msg=lib.texto(g,'Empresa QA','19/11/2026');
assert.ok(msg.includes('Proveedor Uno'));assert.ok(msg.includes('240u'));assert.ok(msg.includes('12 bultos x20'));assert.ok(msg.includes('0,75 kg'));
for(const privateValue of ['Producto B','Cliente privado','24000','48000','precioBase','Costo'])assert.ok(!msg.includes(privateValue),privateValue);
const csv=lib.csv(model.rows);assert.ok(csv.includes('Subtotal compra referencia'));assert.ok(csv.includes('Importe venta lineas'));assert.ok(csv.includes('1256.25'));
const injected=lib.preparar([{id:'?sql',n:'=HYPERLINK("x")',cant:1,total:1}],{},[]);assert.ok(lib.csv(injected.rows).includes("'=HYPERLINK"),'Evitar fórmulas ejecutables al abrir CSV');
const conflict=lib.preparar([{id:'DUP',n:'No adivinar',cant:2,total:100}],{a:{codigo:'DUP',precioBase:1},b:{codigo:'DUP',precioBase:99}},[]);assert.equal(conflict.rows[0].costoCompra,null);
const noGuess=lib.preparar([{id:'M',n:'Crema X150 ml',cant:240,total:100}],{a:{id:'M',precioBase:1}},[]);assert.equal(noGuess.rows[0].unidadesBulto,null);
for(const value of [null,'',0,-10,NaN,'no-numero'])assert.equal(lib.preparar([{id:'M',cant:2,total:100}],{M:{id:'M',precioBase:value}},[]).rows[0].costoCompra,null);
// Las dos entradas reales (período y selección de días) conservan kg y packs sin multiplicar.
const html=fs.readFileSync(process.argv[2]||'PANEL-index_15.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'('),next=html.slice(start+10).search(/\n(?:async )?function /),block=html.slice(start,next<0?html.length:start+10+next);return block.slice(0,block.lastIndexOf('\n}')+2);}
const ctx=vm.createContext({pedidosAcumData:{20261118:{a:{items:[{id:'001',n:'Producto A',c:240,sub:48000,_esCaja:true,_ub:20},{id:'004',n:'Peso',c:.5,sub:100,esPeso:true}]}},20261119:{b:{items:[{id:'001',n:'Producto A',c:1,sub:200},{id:'004',n:'Peso',c:.25,sub:50,esPeso:true}]}}},_paDiaEnPeriodo:d=>d==='20261118'});
vm.runInContext(fn('_paAgregarConsolidado')+'\n'+fn('_paConsolidar'),ctx);
let result=ctx._paConsolidar();assert.equal(result.find(p=>p.id==='001').cant,240);assert.equal(result.find(p=>p.id==='001')._ub,20);assert.equal(result.find(p=>p.id==='004').esPeso,true);
ctx._paDiaEnPeriodo=()=>true;result=ctx._paConsolidar();assert.equal(result.find(p=>p.id==='001').cant,241);assert.equal(result.find(p=>p.id==='004').cant,.75);
const sum={};ctx._paAgregarConsolidado(sum,{id:'__proto__',c:'2',sub:'100'});ctx._paAgregarConsolidado(sum,{id:'__proto__',c:'3',sub:'50'});assert.equal(Object.values(sum)[0].cant,5);assert.equal(Object.values(sum)[0].total,150);
const source=fs.readFileSync('pedidos-proveedor-v2.js','utf8');assert.ok(!/sbPost\(|sbPatch\(|sbUpsert\(|sbDelete\(|saveBackups\(|localStorage\./.test(source));
console.log('Compras v2: proveedores, códigos/UUID, costo compra separado venta, bultos/restos/kg, costos faltantes/ambiguos, WhatsApp privado, CSV seguro, períodos y cantidades intactas OK');
