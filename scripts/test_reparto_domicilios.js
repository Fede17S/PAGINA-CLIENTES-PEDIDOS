const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const name = ['PANEL-index_15.html','index.html'].find(p => fs.existsSync(path.join(root,p)));
const panel = fs.readFileSync(path.join(root,name),'utf8');
function between(a,b) {
  const start=panel.indexOf(a),end=panel.indexOf(b,start+a.length);
  assert(start>=0&&end>start,a);return panel.slice(start,end);
}
const ui = new Map(), opened=[], warnings=[], reads=[], writes=[];
const node = id => { if(!ui.has(id)) ui.set(id,{value:'',innerHTML:'',textContent:'',style:{}}); return ui.get(id); };
const key='019fb486-b4d2-7b73-a268-6ed59a2baa35';
let rows=[
  {id:key,uid:'CL100',name:'Almacén Sur',role:'cliente',direccion:'Belgrano 123, Rawson',lat:-43.3,lng:-65.1,telefono:'111'},
  {id:'uuid-otro',uid:'CL200',name:'Almacén Sur',role:'cliente',direccion:'Belgrano 999, Trelew',lat:-43.2,lng:-65.3,telefono:'222'},
  {id:'uuid-pin',uid:'CL300',name:'Cliente pin',role:'cliente',direccion:'',lat:-42.7,lng:-65.03,telefono:'333'},
  {id:'uuid-legado',uid:'CL400',name:'Cliente antiguo',role:'cliente',direccion:'Mitre 101, Madryn',lat:null,lng:null}
];
let rendered=[];
const ctx = vm.createContext({
  _sbEmpId:'emp-fixture',currentUser:{id:'admin',role:'admin'},_tengoRol:r=>r==='admin',_esCoAdmin:()=>false,_normalizarRoles:()=>[],
  _clientesDB:{[key]:{_sbId:key,id:'CL100',name:'Almacén Sur',direccion:'Vieja 10',lat:-40,lng:-60,role:'cliente'}},
  _geocodeCache:{},_mapaParadas:[],_mapaParadasRuta:null,_meConstruccionRuta:0,_meDomiciliosCache:null,_rutaMapaKey:null,
  _mapaLeaflet:null,_mapaMarkers:[],_mePosicion:{lat:-42.77,lng:-65.04},_meParadaElegidaKey:null,_ecFotoNueva:null,_zonasData:{},dbCli:[],
  rutasData:{r1:{clientes:{r1a:{id:'cl100',nom:'Almacén Sur'},r1b:{id:'CL200',nom:'Almacén Sur'},r1c:{id:'CL300',nom:'Cliente pin'}}}},
  navigator:{onLine:true},document:{getElementById:node,querySelectorAll:()=>[]},window:{open:url=>opened.push(new URL(url)),RecaudacionRuta:require('../recaudacion-ruta-v1.js')},
  console:{warn(){},error(){}},showNotif:msg=>warnings.push(msg),_initMapaBase(){},setTimeout(){},iniciarCliPickers(){},cerrarModal(){},showSaved(){},
  COLORS:['#e63946'],_programarGuardarRutasOffline(){},_meImporteNeto:()=>0,fM:String,escHtml:String,geocodeAddress:async()=>({lat:-44.1,lng:-65.6}),
  _sbGetRaw:async (table,q)=>{assert.equal(table,'usuarios');assert.match(q,/empresa_id=eq\.emp-fixture&order=id\.asc/);reads.push(q);return rows;},
  _guardarUsuarioVerificado:async (id,payload)=>{assert.equal(id,key);writes.push(payload);},_meNavApp:()=> 'gmaps'
});
vm.runInContext([
  between('function _rechazoDefinitivo(c)', 'function _devEstadoLabel'),
  between('function _hrNums(cli)', 'function _hrEstado('),
  between('function calcRuta(ruta)', 'function _poblarFiltroRepartidores'),
  between('function seleccionarRutaMapa()', 'function cargarGeocodeCache()'),
  between('function getDistKm(', 'var COLORS ='),
  between('function _meDomicilioClave(', 'function _meToggleCobro('),
  between('async function _meAplicarDatosRutasActualizados()', '// Elegir una parada'),
  between('function _meNav(i)', 'function _meNavSelectorHTML()'),
  between('function _usuarioPayloadCoincide(', 'async function _guardarUsuarioVerificado('),
  between('async function guardarEditCliente()', '/* ══ IMPORTADOR CSV DE CLIENTES')
].join('\n'),ctx);
const renderParadas = ctx.renderParadas;
ctx.renderParadas = p => { rendered=p;renderParadas(p); };

(async()=>{
  node('mapa-ruta-sel').value='r1';
  await ctx.optimizarYMostrar('manual');
  assert.equal(rendered[0].dir,rows[0].direccion,'UID gana aunque haya un cliente con igual nombre');
  assert.equal(rendered[0].tel,'111');
  assert.match(node('mapa-paradas').innerHTML,/Belgrano 123, Rawson/);
  assert.match(node('mapa-paradas').innerHTML,/Ubicación fijada en el mapa/);
  ctx._meNav(0);
  assert.equal(opened.at(-1).searchParams.get('destination'),'-43.3,-65.1');
  assert.equal(rendered[2].pinGuardado,true,'Un pin sin dirección sigue navegable');
  const idx=await ctx._meCargarDomicilios();
  assert.equal(ctx._meParadaConDomicilio('a',{nom:'Almacén Sur'},idx).dir,'','No adivinar entre homónimos sin ID');
  assert.equal(ctx._meParadaConDomicilio('a',{id:'no-existe',nom:'Cliente antiguo'},idx).dir,'','No resolver por nombre si hay un ID desconocido');
  assert.equal(ctx._meParadaConDomicilio('a',{nom:'Cliente antiguo'},idx).dir,rows[3].direccion);
  assert.equal(ctx._meParadaConDomicilio('a',{id:key},idx).dir,rows[0].direccion,'Resolver UUID y UID');

  rows[0]={...rows[0],direccion:'Nueva 456, Rawson',lat:null,lng:null};
  ctx._geocodeCache['nueva 456, rawson']={lat:-45,lng:-66};
  await ctx._meAplicarDatosRutasActualizados();
  assert.equal(rendered[0].dir,rows[0].direccion);
  assert.match(node('mapa-paradas').innerHTML,/Nueva 456, Rawson/);
  assert.doesNotMatch(node('mapa-paradas').innerHTML,/Belgrano 123, Rawson/);
  assert.equal(rendered[0].pinGuardado,false);
  assert.equal(rendered[0].lat,-45,'Podemos mostrar un resultado aproximado en el mapa interno');
  ctx._meNav(0);
  assert.equal(opened.at(-1).searchParams.get('destination'),'Nueva 456, Rawson, Argentina','Navegar usa la dirección, no la coordenada aproximada');
  ctx._meAbrirRutaCompleta();
  assert.match(opened.at(-1).searchParams.get('waypoints'),/^Nueva 456, Rawson, Argentina\|/);

  rows[0]={...rows[0],direccion:''};
  await ctx._meAplicarDatosRutasActualizados();
  assert.equal(rendered[0].dir,'','Una dirección eliminada no debe volver desde el caché');
  const before=opened.length;ctx._meNav(0);
  assert.equal(opened.length,before);
  assert.match(warnings.at(-1),/no tiene dirección ni ubicación/);

  const datos={'ec-key':key,'ec-id':'CL100','ec-name':'Almacén Sur','ec-lista':'Clientes','ec-rol':'cliente','ec-dir':'Domicilio a mano 22, Madryn'};
  Object.entries(datos).forEach(([id,value])=>{node(id).value=value;});
  ctx.dbCli.push({id:'CL100',lat:-40,lng:-60});
  await ctx.guardarEditCliente();
  assert.equal(writes.length,1);
  assert.equal(writes[0].lat,null);assert.equal(writes[0].lng,null);
  assert.equal(ctx._clientesDB[key].lat,null);assert.equal(ctx.dbCli[0].lng,null);
  assert.equal(ctx._usuarioPayloadCoincide({lat:0,lng:0},{lat:null,lng:null}),false);
  assert.equal(ctx._usuarioPayloadCoincide({lat:null,lng:null},{lat:null,lng:null}),true);
  node('ec-lat').value='-42.8';node('ec-lng').value='-65.04';
  await ctx.guardarEditCliente();
  assert.equal(writes[1].lat,-42.8,'El pin nuevo confirmado se guarda junto con la dirección');
  assert.equal(writes[1].lng,-65.04);

  assert(reads.length>=4);
  assert.equal(writes.length,2,'Las únicas escrituras son ediciones explícitas de la ficha, nunca desde Reparto');
  node('mapa-ruta-sel').value='otra-ruta';ctx.seleccionarRutaMapa();assert.equal(ctx._mapaParadas.length,0);
  console.log('Reparto: ID estable, homónimos, direcciones nuevas y borradas, destino y pin de Gestión de Clientes OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
