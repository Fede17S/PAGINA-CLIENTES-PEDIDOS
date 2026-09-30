const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const panel=process.argv[2]||'index.html';
const html=fs.readFileSync(panel,'utf8');
const ini=html.indexOf('function _rvtClienteTieneUbicacion');
const fin=html.indexOf('function _rvtHacerPedido',ini);
assert.ok(ini>0&&fin>ini,'no se encontró el módulo de navegación de Mi día');
assert.match(html,/class="md-nav-btn"[\s\S]{0,300}_rvtNavegarCliente/,'falta el botón visible en la tarjeta');
const abiertos=[],avisos=[],clientes={
  gps:{lat:-42.7692,lng:-65.0385,direccion:'Dirección secundaria'},
  dir:{direccion:'Lewis Jones 1265, Puerto Madryn'},
  vacio:{}
};
const ctx={Number,String,isFinite,encodeURIComponent,
  window:{open:(url,target)=>{abiertos.push({url,target});}},location:{href:''},
  showNotif:(m,t)=>avisos.push({m,t}),_rvtCli:id=>clientes[id]};
vm.createContext(ctx);vm.runInContext(html.slice(ini,fin),ctx);
assert.equal(ctx._rvtNavegarCliente('gps'),true);
assert.match(decodeURIComponent(abiertos.pop().url),/destination=-42\.7692,-65\.0385$/);
assert.equal(ctx._rvtNavegarCliente('dir'),true);
assert.match(decodeURIComponent(abiertos.pop().url),/destination=Lewis Jones 1265, Puerto Madryn$/);
assert.equal(ctx._rvtNavegarCliente('vacio'),false);
assert.match(avisos[0].m,/no tiene una dirección/i);
console.log('Mi día: navegación por GPS y respaldo por dirección OK');
