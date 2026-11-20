const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const api=require('../whatsapp-telefono-v1.js');
const esperado='5492804123456';
const casos=['2804123456','280 412-3456','(0280) 4123456','02804123456','92804123456','54 280 4123456','+54 280 4123456','+54 9 280 4123456','5492804123456','005492804123456','00542804123456','0280 15 4123456','280154123456','152804123456'];
for(const n of casos){assert.equal(api.numero(n),esperado,n);assert.equal(api.numero(api.numero(n)),esperado,'idempotencia '+n);}
for(const [n,out] of [['011 15 12345678','5491112345678'],['0351 15 2345678','5493512345678'],['02965 15 123456','5492965123456'],['+59899123456','59899123456'],['0059899123456','59899123456'],['+1 (555) 123-4567','15551234567'],['+34 612345678','34612345678']])assert.equal(api.numero(n),out,n);
for(const n of ['',null,undefined,'4123456','154123456','549','54','2804123456 int 3','2804123456/2804555555','++5492804123456','tel:2804123456','2804123456#','0000'])assert.equal(api.numero(n),'',String(n));
const panel=fs.readFileSync(process.argv[2]||'PANEL-index_15.html','utf8');
function fn(name){const s=panel.indexOf('function '+name+'(');assert.ok(s>=0,name);const next=panel.slice(s+10).search(/\n(?:async )?function /),block=panel.slice(s,next<0?panel.length:s+10+next),line=block.split('\n')[0];return line.trimEnd().endsWith('}')?line:block.slice(0,block.lastIndexOf('\n}')+2);}
const ctx=vm.createContext({window:{WhatsAppTelefono:api},_clientesDB:{a:{id:'CLIENTE',tel:'0280 15 4123456'}},_hrAtt:String});
for(const name of ['_cc2NumeroWhatsApp','_cobTelefonoWhatsApp','_waTel','_telDePedido','_hrBlQuick'])vm.runInContext(fn(name),ctx);
for(const n of casos)for(const name of ['_cc2NumeroWhatsApp','_cobTelefonoWhatsApp','_waTel'])assert.equal(ctx[name](n),esperado,name+' '+n);
assert.equal(ctx._telDePedido({clienteTel:'2804123456'}),esperado);
assert.equal(ctx._telDePedido({clienteTel:'4123456',clienteId:'CLIENTE'}),esperado,'si el pedido está incompleto usa la ficha');
assert.equal(ctx._telDePedido({clienteTel:'2804123456 int 3'}),'','no convertir texto en otro destinatario');
assert.ok(ctx._hrBlQuick({}, {tel:'0280 15 4123456',dir:''}).includes('https://wa.me/'+esperado));
assert.ok(!ctx._hrBlQuick({}, {tel:'123',dir:''}).includes('wa.me/'));
assert.ok(panel.includes('src="whatsapp-telefono-v1.js?v=20261119-1"'));
assert.ok(!/fetch\(|localStorage|sbFetch|sbPatch|fbPatch/.test(fs.readFileSync('whatsapp-telefono-v1.js','utf8')));
console.log('WhatsApp: formatos locales/internacionales, 0/15, prefijo sin duplicar, incompletos, cuentas, avisos, pedidos, campañas y hoja de ruta OK; sin modificar fichas');
