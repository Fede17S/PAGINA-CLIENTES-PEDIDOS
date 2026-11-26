const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const panel=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'PANEL-index_15.html'))?'PANEL-index_15.html':'index.html'),'utf8');
const api=require('../ruta-consolidado-v1.js');
const ruta={hrNum:'HR-0051',nombre:'Centro · miércoles',fecha:'2026-11-25',repartidorNom:'Reparto de prueba',clientes:{
  uno:{entregado:true,items:[{id:'4',n:'Alfajor mixto (caja x12)',c:24,_esCaja:true,_ub:12},{id:'A',n:'Café molido',esPeso:true,gramos:275,c:0.275},{id:'otro',n:'Café molido',c:2},
    {id:'N',n:'No se incluye',pendiente:true,c:500},{id:'malo',c:'no es cantidad'}, {n:'Sin código',c:2}]},
  dos:{items:[{codigo:'4',nombre:'Alfajor mixto',cantidad:'5'},{id:'A',n:'Café molido',esPeso:true,c:1.125},{id:'A',n:'Café molido',c:1},{n:'sin código',c:3}],devoluciones:[{codigo:'4',cantidad:2,estado:'aplicada'}]},
  revisar:{rechazado:true,items:[{id:'4',n:'Alfajor mixto',c:1}]},
  rechazado:{rechazado:true,rechazo_confirmado:true,items:[{id:'4',n:'Alfajor mixto',c:3}]},
  vacio:{items:[]},
}};
const original=JSON.stringify(ruta);
const consolidado=api.contar(ruta,false);
assert.equal(consolidado.filas.find(x=>x.codigo==='4').cantidad,30);
assert.equal(consolidado.filas.find(x=>x.codigo==='4').nombre,'Alfajor mixto');
assert.equal(consolidado.filas.find(x=>x.codigo==='A'&&x.peso).cantidad,1.4);
assert.equal(consolidado.filas.find(x=>x.codigo==='A'&&!x.peso).cantidad,1);
assert.equal(consolidado.filas.filter(x=>x.nombre==='Café molido').length,3);
assert.equal(consolidado.filas.find(x=>!x.codigo).cantidad,5);
assert.equal(consolidado.unidades,38);
assert.equal(consolidado.kilos,1.4);
assert.equal(consolidado.pedidos,3);
assert.equal(consolidado.descartados,1);
assert.equal(consolidado.sinProductos,1);
assert.equal(consolidado.lineasInvalidas,1);
assert.equal(api.contar(ruta,true).filas.find(x=>x.codigo==='4').cantidad,33);
assert.equal(api.contar({clientes:{}},true).filas.length,0);
assert.equal(JSON.stringify(ruta),original);
assert.match(api.datos(ruta,'Empresa').titulo,/HR-0051/);
assert.equal(api.datos(ruta,'Empresa').fecha,'25/11/2026');
assert.ok(panel.includes('window.RutaConsolidado.abrir(rutaKey,bConsol)'));
assert.ok(panel.includes('imprimirPedidosDeRuta(rutaKey)'));
assert.ok(panel.includes('descargarPDFRuta(rutaKey)'));
console.log('Consolidado de ruta: bultos en unidades, pesos, agrupación por código, filtros y cantidades sin tocar la ruta OK');
if(process.argv.includes('--browser')) navegador().catch(e=>{console.error(e);process.exitCode=1;});

async function navegador(){
  const {chromium}=require(process.env.CODEX_NODE_MODULES?path.join(process.env.CODEX_NODE_MODULES,'playwright'):'playwright');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const div=panel.slice(panel.indexOf('<div id="modal-hr-consolidado"'),panel.indexOf('<script src="zxing-browser-',panel.indexOf('<div id="modal-hr-consolidado"')));
  const css=[...panel.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n').replace(/^@import[^\r\n]*$/gm,'');
  const script=fs.readFileSync(path.join(root,'ruta-consolidado-v1.js'),'utf8');
  const fixtureRuta=JSON.parse(original);
  fixtureRuta.clientes.bulk={items:Array.from({length:83},(_,i)=>({id:'QA-'+i,n:'Producto de verificación '+String(i+1).padStart(2,'0')+(i===5?' - descripción larga para comprobar que el nombre se puede envolver sin tapar la cantidad ni la medida':''),c:i+1}))};
  try{
    for(const size of [{width:1280,height:900},{width:360,height:650},{width:740,height:390}]){
      const p=await b.newPage({viewport:size,acceptDownloads:true});
      p.setDefaultTimeout(7000);
      const errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.route('**/*',async r=>r.request().url().startsWith('https://hr-consol-qa.test/')?r.fulfill({contentType:'text/html',body:
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+
        ' :root {--header-h:56px;--safe-top:0px;--modal-safe-top:40px;--modal-safe-left:10px;--modal-safe-right:10px;--modal-safe-bottom:18px} #qa-trigger{position:relative;z-index:2}</style>'+
        '<div class="main"><button id="qa-trigger" onclick="RutaConsolidado.abrir(\'HR\',this)">Consolidar ruta</button><div style="height:2000px"></div></div>'+div}):r.abort());
      await p.goto('https://hr-consol-qa.test/');
      await p.evaluate(r=>{
        window.rutasData={HR:r,vacia:{nombre:'Vacía',clientes:{}}};window._sbEmpId='qa-empresa';
        window.currentUser={id:'QA'};window._getEmpDatos=()=>({nombre:'Distribuidora de prueba'});
        window.showNotif=(s)=>{window.errorPdf=s;};window._guardarPDF=(doc,nombre)=>doc.save(nombre);
      },fixtureRuta);
      await p.addScriptTag({path:path.join(root,'tmp/jspdf-2.5.1.umd.min.js')});
      await p.addScriptTag({path:path.join(root,'tmp/jspdf-autotable-3.5.28.min.js')});
      await p.addScriptTag({content:script});
      await p.getByRole('button',{name:'Consolidar ruta',exact:true}).click();
      const mod=p.getByRole('dialog',{name:'Consolidado de ruta'});
      await mod.waitFor();
      assert.equal(await p.locator('#hr-consol-filas tr').count(),88);
      assert.match(await p.locator('#hr-consol-aviso').textContent(),/1 rechazo confirmado excluido/);
      const alfajor=p.getByRole('row').filter({hasText:'Alfajor mixto'});
      assert.match(await alfajor.innerText(),/30 u\./);
      await p.getByRole('checkbox',{name:'Incluir pedidos con rechazo confirmado'}).check();
      assert.match(await alfajor.innerText(),/33 u\./);
      await p.getByRole('checkbox').uncheck();
      assert.match(await p.locator('#hr-consol-resumen').textContent(),/1,4 kg/);
      const medidas=await p.evaluate(()=>{
        const y=id=>document.getElementById(id).getBoundingClientRect();
        return {cerrar:y('hr-consol-close').top,pie:y('hr-consol-print').bottom,w:document.documentElement.scrollWidth,
          h:innerHeight,lock:getComputedStyle(document.querySelector('.main')).overflow};
      });
      assert.ok(medidas.cerrar>=40&&medidas.pie<=medidas.h-18&&medidas.w<=size.width&&medidas.lock==='hidden');
      if(size.width===1280){
        const desc=p.waitForEvent('download');
        await p.getByRole('button',{name:'Descargar PDF'}).click();
        const pdf=await desc;
        assert.equal(pdf.suggestedFilename(),'Consolidado-HR-0051.pdf');
        if(process.env.HR_QA_DIR)await pdf.saveAs(path.join(process.env.HR_QA_DIR,pdf.suggestedFilename()));
        await p.evaluate(()=>{window.open=url=>{window.impreso=url;return {opener:window};};});
        await p.getByRole('button',{name:'Imprimir PDF'}).click();
        assert.match(await p.evaluate(()=>window.impreso),/^blob:/);
        await p.evaluate(()=>{window.Capacitor={isNativePlatform:()=>true};window.RutaConsolidado.abrir('HR',document.getElementById('qa-trigger'));});
        assert.ok(await p.getByRole('button',{name:'Abrir / compartir PDF'}).isVisible());
        assert.ok(await p.locator('#hr-consol-download').isHidden());
      }
      if(process.env.HR_QA_DIR&&size.width===360){
        await p.locator('#hr-consol-scroll').evaluate(el=>el.scrollTop=0);
        await p.screenshot({path:path.join(process.env.HR_QA_DIR,'modal-movil.png')});
      }
      await p.locator('#hr-consol-close').focus();
      await p.keyboard.press('Escape');
      await mod.waitFor({state:'hidden'});
      await p.waitForFunction(()=>document.activeElement===document.getElementById('qa-trigger'));
      await p.evaluate(()=>window.RutaConsolidado.abrir('vacia'));
      assert.ok(await p.locator('#hr-consol-print').isDisabled());
      assert.ok(await p.getByText('No hay productos cargados para consolidar.').isVisible());
      assert.equal(await p.evaluate(()=>window.errorPdf),undefined);
      assert.deepEqual(errors,[]);
      await p.close();
      console.log('Modal y exportación de ruta '+size.width+'×'+size.height+' OK');
    }
  }finally{await b.close();}
}
