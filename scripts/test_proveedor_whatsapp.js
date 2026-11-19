const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'PANEL-index_15.html','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const next=source.slice(start+10).search(/\n(?:async )?function /),end=next<0?source.length:start+10+next;const block=source.slice(start,end),line=block.split('\n')[0];return line.trimEnd().endsWith('}')?line:block.slice(0,block.lastIndexOf('\n}')+2);}
const prods=[{id:'001',n:'ACTRON & Té Ñ',cant:240,total:220836},{id:'002',n:'Otro producto',cant:3,total:900}],observaciones=[{cliente:'Cliente QA',obs:'Separar cajas & revisar'}];
function fixture(agent,native,clip){
 const calls={open:[],navigation:[],links:[],clipboard:[],notifications:[],copies:0},body={appendChild(){}},ctx={console,encodeURIComponent,Date,
  empresaData:{nombre:'Distribuidora QA'},_paSelProds:structuredClone(prods),_paSelObs:structuredClone(observaciones),_paConsolidar:()=>[prods[1]],
  navigator:{userAgent:agent,clipboard:clip==='missing'?undefined:{writeText(txt){calls.clipboard.push(txt);if(clip==='throw')throw Error('bloqueado');return clip==='fail'?Promise.reject(Error('sin permiso')):Promise.resolve();}}},
  document:{body,activeElement:{focus(){}},createElement(tag){return {value:'',style:{},setAttribute(){},focus(){},select(){},setSelectionRange(){},remove(){},click(){calls.links.push({url:this.href,target:this.target,rel:this.rel});}};},execCommand(){calls.copies++;return true;}},
  showNotif:(...args)=>calls.notifications.push(args)};
 ctx.window={Capacitor:native?{isNativePlatform:()=>true}:undefined,open:(...args)=>{calls.open.push(args);return null;}};
 Object.defineProperty(ctx.window,'location',{value:{set href(value){calls.navigation.push(value);}}});
 vm.createContext(ctx);for(const name of ['_cc2AbrirWhatsAppSeguro','_paTextoProveedor','_paAbrirWhatsAppProveedor','_exportSelTexto','_exportProvTexto','_paCopiarPedidoProveedor'])vm.runInContext(fn(name),ctx);
 return {ctx,calls};
}
(async()=>{
 for(const [agent,native] of [['Android',false],['iPhone',false],['Windows',false],['Android',true]]){
  for(const clip of ['ok','fail','missing']){
   const {ctx,calls}=fixture(agent,native,clip),before=JSON.stringify(ctx._paSelProds);
   ctx._exportSelTexto();
   assert.equal(calls.clipboard.length,0,'WhatsApp nunca espera/copía al portapapeles');
   const url=native?calls.open[0][0]:agent==='Windows'?calls.links[0].url:calls.navigation[0];
   const message=new URL(url).searchParams.get('text');assert.equal(message,ctx._paTextoProveedor(ctx._paSelProds,ctx._paSelObs));
   assert.ok(message.includes('240u'));assert.ok(message.includes('243 unidades'));assert.ok(message.includes('ACTRON & Té Ñ'));assert.ok(message.includes('Separar cajas & revisar'));
   assert.equal(JSON.stringify(ctx._paSelProds),before);
   if(native)assert.equal(calls.open[0][1],'_system');
   if(agent==='Windows'){assert.equal(calls.links.length,1);assert.equal(calls.navigation.length,0);assert.equal(calls.links[0].rel,'noopener noreferrer');}
  }
 }
 for(const clip of ['ok','fail','missing','throw']){
  const {ctx,calls}=fixture('Windows',false,clip);await ctx._paCopiarPedidoProveedor(true);
  assert.equal(calls.links.length+calls.open.length+calls.navigation.length,0,'Copiar no abre ni envía');
  assert.equal(calls.copies,clip==='ok'?0:1);assert.ok(calls.notifications.some(n=>n[0].includes('copiado')));
 }
 const {ctx,calls}=fixture('Windows',false,'ok');ctx._exportProvTexto();let text=new URL(calls.links[0].url).searchParams.get('text');assert.ok(text.includes('Otro producto'));assert.ok(!text.includes('ACTRON'));assert.ok(!text.includes('Observaciones'));
 ctx._paSelProds=[];ctx._exportSelTexto();assert.equal(calls.links.length,1);assert.ok(calls.notifications.some(n=>n[0].includes('No hay productos')));
 // Volumen de la captura: 113 productos, sin truncar la última línea ni las notas.
 ctx._paSelProds=Array.from({length:113},(_,i)=>({id:String(i+1),n:'Producto extenso '+i+' · presentación caja x24',cant:i+1,total:1000}));ctx._exportSelTexto();text=new URL(calls.links[1].url).searchParams.get('text');assert.ok(text.includes('Producto extenso 112'));assert.ok(text.includes('6441 unidades'));assert.ok(text.includes('Separar cajas'));
 // Reutilizar el filtro REAL de proveedores del modal y exportar sólo lo visible.
 const body={innerHTML:''};ctx.document.getElementById=()=>body;ctx.escHtml=s=>String(s);ctx.fM=n=>String(n);ctx._paSelObs=[];
 ctx._prodData={a:{codigo:'001',proveedorId:'P1'},b:{codigo:'002',proveedorId:'P2'}};ctx._provData=[{id:'P1',nombre:'Prov 1'},{id:'P2',nombre:'Prov 2'}];ctx._paConsolTodos=structuredClone(prods);
 for(const name of ['_paMapaProveedores','_paProvHue','_paPintarConsol'])vm.runInContext(fn(name),ctx);
 ctx._paConsolFiltro='P2';ctx._paPintarConsol();assert.equal(ctx._paSelProds.length,1);ctx._exportSelTexto();text=new URL(calls.links[2].url).searchParams.get('text');assert.ok(!text.includes('ACTRON'));assert.ok(text.includes('3 unidades'));
 const exported=source.slice(source.indexOf('function _paTextoProveedor('),source.indexOf('function _exportSelCSV('));assert.ok(!/sbFetch\(|sbPatch\(|sbUpsert\(|saveBackups\(|localStorage\./.test(exported));
 console.log('Proveedor WhatsApp: clic inmediato PC/Android/iPhone/APK, sin depender del portapapeles, Copiar separado/fallback, filtro y 113 productos íntegros, sin escrituras OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
