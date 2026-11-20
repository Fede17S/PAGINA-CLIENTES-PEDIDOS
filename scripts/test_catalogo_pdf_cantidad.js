// Generador real + jsPDF local. Datos ficticios: sin acceder a base, stock ni redes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {jsPDF}=require('../tmp/jspdf-2.5.1.umd.min.js');
const panel=fs.readFileSync(process.argv[2]||'PANEL-index_15.html','utf8');
function fn(name){let s=panel.indexOf('function '+name+'(');assert.ok(s>=0,name);if(panel.slice(s-6,s)==='async ')s-=6;if(name==='generarCatalogoPDF')return panel.slice(s,panel.indexOf('// ── PWA:',s));const next=panel.slice(s+16).search(/\n(?:async )?function /),block=panel.slice(s,next<0?panel.length:s+16+next),line=block.split('\n')[0];return line.trimEnd().endsWith('}')?line:block.slice(0,block.lastIndexOf('\n}')+2);}
const functions=['_tramosDe','_catTramosPDF','_catPrecio','_catOrdenar','_pdfTxt','_temporadaActual','_temporadaInfo','_dia0','_ofVigente','_ofAplicaLista','_listaIdDeNombre','_ofPrecioLista','generarCatalogoPDF'].map(fn).join('\n');
fs.mkdirSync('tmp/pdfs',{recursive:true});
async function run(ppp,lista,estilo,badge=true){
 const elementos={},value=(id,v)=>elementos[id]={value:v,style:{}},checked=(id,v)=>elementos[id]={checked:v,style:{}};
 for(const [id,v] of Object.entries({'cat-lista':lista,'cat-orden':'cat','cat-contacto':'','cat-tienda-url':'','cat-ppp':String(ppp),'cat-filtro-cat':'','cat-notas':'Datos ficticios para control de diseño','cat-estilo':estilo,'cat-leyenda':'','cat-incluir-promos':'si','cat-promo-titulo':'OFERTAS','cat-promo-texto':''}))value(id,v);
 for(const [id,v] of Object.entries({'cat-sin-foto':false,'cat-mostrar-caja':true,'cat-indice':false,'cat-badge-of':badge,'cat-novedades':true,'cat-temporada':true,'cat-mostrar-cod':true,'cat-mostrar-stock':true,'cat-solo-stock':false}))checked(id,v);
 elementos['btn-gen-catalogo']={};elementos['cat-progress']={style:{}};
 const now=new Date(),m=now.getMonth()+1,temporada=m===12||m<=2?'verano':m<=5?'otono':m<=8?'invierno':'primavera';
 const base={cat:'Prueba',activo:true,pCli:1200,pPat:1500,precios:{vip:1600},foto:'',unidadesBulto:12,temporada};
 const db=[{...base,id:'A',n:'ALFA PROMOCION POR DOCE UNIDADES',precioPromo:900,cantPromo:12},
  {...base,id:'B',n:'BETA DOS ESCALONES POR CANTIDAD',tramos:[{desde:6,precio:1000},{desde:24,precio:800}]},
  {...base,id:'C',n:'GAMMA OFERTA DIRECTA SIN MINIMO',ofertaActiva:true,ofertaTipo:'pct',ofertaPct:10},
  {...base,id:'D',n:'DELTA PRECIO NORMAL POR UNIDAD'},
  {...base,id:'E',n:'EPSILON PROMOCION POR PESO',vendePor:'peso',tramos:[{desde:2.5,precio:850}]},
  {...base,id:'F',n:'ZETA PRECIO PROMO SIN MINIMO INVALIDO',precioPromo:500},
  {...base,id:'G',n:'ETA OCHO TRAMOS COMPLETOS',tramos:Array.from({length:8},(_,i)=>({desde:(i+1)*10,precio:1100-i*50}))},
  {...base,id:'H',n:'THETA PROMO HEREDADA DEL CATALOGO'}];
 const prodData=Object.fromEntries(db.map(p=>[p.id,{...p,codigo:p.id,creadoEn:new Date(now.getFullYear(),now.getMonth(),2).toISOString()}]));
 prodData.H.tramos=[{desde:5,precio:950}];
 const original=JSON.stringify(prodData);
 const logs=[],cards=[],notifications=[];let output;
 function Instrumented(opts){const d=new jsPDF(opts),text=d.text.bind(d),rect=d.roundedRect.bind(d);
  d.text=function(t,x,y,o){logs.push({page:d.getCurrentPageInfo().pageNumber,text:Array.isArray(t)?t.join(' '):String(t),x,y,size:d.getFontSize(),width:Math.max(...(Array.isArray(t)?t:[t]).map(z=>d.getTextWidth(String(z)))),font:d.getFont().fontStyle});return text(t,x,y,o)};
  d.roundedRect=function(x,y,w,h,a,b,s){if(w>45&&h>30&&s==='FD')cards.push({page:d.getCurrentPageInfo().pageNumber,x,y,w,h});return rect(x,y,w,h,a,b,s)};return d;}
 const ctx=vm.createContext({console,Intl,Date,Number,Math,window:{jspdf:{jsPDF:Instrumented}},document:{getElementById:id=>elementos[id]||null},dbStock:db,_prodData:prodData,stockData:Object.fromEntries(db.map(p=>[p.id,100])),empresaData:{nombre:'DISTRIBUIDORA QA',color:'#213985'},_ctrlStockOn:()=>false,_sinStock:()=>false,fM:n=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n),getListasOrdenadas:()=>[['cli',{nombre:'Clientes'}],['pat',{nombre:'Patagonia'}],['vip',{nombre:'VIP'}]],showNotif:(...a)=>notifications.push(a),_compartirPDF:d=>{output=d;}});
 vm.runInContext(functions,ctx);await ctx.generarCatalogoPDF(false);
 assert.ok(output,JSON.stringify(notifications));
 const skuCard=(sku,page)=>{const n=logs.find(t=>t.text.startsWith(sku)&&t.page===page);return n&&cards.find(c=>c.page===page&&n.x>=c.x&&n.x<=c.x+c.w&&n.y>=c.y&&n.y<c.y+c.h)};
 const inCard=c=>logs.filter(t=>t.page===c.page&&t.x>=c.x&&t.x<=c.x+c.w&&t.y>=c.y&&t.y<c.y+c.h);
 for(const name of ['ALFA','BETA','EPSILON','ETA','THETA']){
  const occurrences=logs.filter(t=>t.text.startsWith(name));assert.ok(occurrences.length>=3,name+' debe salir en Ofertas, Novedades/Temporada y categoría');
  for(const occ of occurrences){const c=skuCard(name,occ.page);assert.ok(c,name);const texts=inCard(c),joined=texts.map(t=>t.text).join('\n');assert.match(joined,/Llevando/);assert.match(joined,lista==='ambas'?/CLI:.*\nPAT:/:name==='EPSILON'?/Por kg:/:/Unitario:/);
   assert.ok(!texts.some(t=>t.text.startsWith('Antes:')),name+' no tachar precio unitario');
   for(const t of texts.filter(t=>/Llevando|Unitario:|Por kg:|c\/u|\/kg|CLI:|PAT:/.test(t.text))){assert.ok(t.x-t.width/2>=c.x-0.1&&t.x+t.width/2<=c.x+c.w+.1,'precio fuera del ancho '+JSON.stringify(t));assert.ok(t.y<c.y+c.h-1,'precio cortado');assert.ok(t.y>occ.y+3,'nombre pisa precios '+name);}
   if(name==='ALFA')assert.match(joined,/Llevando 12\+ u\.: \$900,00 c\/u/);
   if(name==='ETA')for(let i=1;i<=8;i++)assert.ok(joined.includes('Llevando '+(i*10)+'+ u.'),'falta tramo '+i);
   if(name==='EPSILON')assert.match(joined,/2,5\+ kg: \$850,00\/kg/);
  }
 }
 for(const t of logs.filter(t=>t.text.startsWith('ZETA'))){const c=skuCard('ZETA',t.page);assert.ok(!inCard(c).some(t=>t.text.includes('$500,00')),'no publicar precio condicional sin mínimo');}
 if(lista!=='ambas'){const gamma=logs.find(t=>t.text.startsWith('GAMMA'));assert.ok(inCard(skuCard('GAMMA',gamma.page)).some(t=>t.text.startsWith('Antes:')),'oferta directa conserva precio anterior');}
 assert.equal(JSON.stringify(prodData),original,'no modificar promociones configuradas');
 const file='tmp/pdfs/catalogo-cantidad-'+ppp+'-'+lista+'-'+estilo+(badge?'':'-sinbadge')+'.pdf';fs.writeFileSync(file,Buffer.from(output.output('arraybuffer')));
 console.log(file+': unitario separado, mínimos y todos los tramos repetidos en cada sección, sin tachado engañoso y dentro de tarjeta');
 return {file,logs};
}
(async()=>{for(const [ppp,lista,estilo,badge] of [[4,'cli','moderno',true],[6,'pat','minimalista',true],[9,'vip','oscuro',true],[9,'ambas','degradado',true],[9,'cli','moderno',false]])await run(ppp,lista,estilo,badge)})().catch(e=>{console.error(e);process.exitCode=1});
