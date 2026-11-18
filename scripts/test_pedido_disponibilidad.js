const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const name=['PANEL-index_15.html','index.html'].find(p=>fs.existsSync(path.join(root,p)));
const panel=fs.readFileSync(path.join(root,name),'utf8');
const {chromium}=require(process.env.CODEX_NODE_MODULES?path.join(process.env.CODEX_NODE_MODULES,'playwright'):'playwright');
function between(a,b){const i=panel.indexOf(a),j=panel.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return panel.slice(i,j);}
const code=[
  between('function _stkDisponible(', '// La tabla de stock'),
  between('function _ctrlStockOn()', '// Al editar un pedido'),
  between('function filtrar(t)', 'function _mostrarPromoBtn('),
  between('function _puedeCajaP(', '// Modo caja/unidad del método'),
  between('var _pgModos =', '// ===== FINANZAS'),
  between('function _pgRenderCats()', '// === MODAL DEL CARRITO'),
  between('function _cartDelta(', 'var dscGenRem'),
  between('async function _sbInsertBackup(data)', 'async function _sbGetCC(')
].join('\n');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.route('**/*',route=>route.abort());
   await page.setContent('<div id="ped-cats"></div><div id="ped-grilla"></div><input id="bus-ped"><div id="res-ped"></div><input id="cant-ped" value="1"><div id="fam-overlay"><div id="fam-overlay-body"></div></div>');
   await page.addScriptTag({content:code});
   const result=await page.evaluate(async()=>{
    const element=id=>document.getElementById(id);
    Object.assign(window,{
     empresaData:{control_stock:true},_sbEmpId:'fixture',currentUser:{id:'admin'},_prodData:{},
     stockData:{A:10,B:20,C:0,D:20,E:0,F:-2},ordenes:{ped:[]},tipoLista:{ped:'Clientes'},itemSel:{ped:null},_modoCaja:{ped:false},
     _pgQ:'',_pgCat:'',_cartDscOpen:-1,getListasOrdenadas:()=>[],fM:String,escHtml:String,
     _portadaDe:()=>null,_ofVigente:()=>false,_ofPrecioLista:()=>null,
     _minCompraPedidoProd:()=>1,_cantInicialPedidoProd:()=>1,_recalcPromoVigente:()=>false,
     _cartRecalcSub:i=>{i.sub=i.p*i.c;},_promoPrecioUnitarioSeguro:()=>null,
     renderItems(){},_renderCartModal(){},_renderCajaToggle(){},_asegurarStockParaPedido(){},
     _openFamOverlay:(title,html)=>{element('fam-overlay-body').innerHTML=html;},
     showNotif:msg=>window.notices.push(msg),notices:[],prompt:()=> '500',
     dbStock:[
      {id:'A',n:'Permitido familia',familia:'Familia',cat:'Venta',activo:true},
      {id:'B',n:'Bloqueado familia',familia:'Familia',cat:'Ocultos',activo:false},
      {id:'C',n:'Agotado familia',familia:'Familia',cat:'Ocultos',activo:true},
      {id:'D',n:'Bloqueado solo',cat:'Ocultos',activo:false},
      {id:'E',n:'Agotado solo',cat:'Ocultos',activo:true},
      {id:'F',n:'Stock negativo',cat:'Ocultos',activo:true},
      {id:'G',n:'Nunca contado',cat:'Sin ficha',activo:true}
     ].map(p=>({...p,pCli:100,unidadesBulto:1}))
    });
    _pgRenderCats();_pgRender();
    const inicio=element('ped-grilla').textContent,categorias=element('ped-cats').textContent;
    _pgAbrirFamilia('Familia');
    const familia=element('fam-overlay-body').textContent;
    for(const id of ['B','C','D','E','F']){
     _pgDelta(id,1);_pgSetCant(id,'5');_pgvDelta(id,1);_pgvSetCant(id,'10');
     itemSel.ped={...dbStock.find(p=>p.id===id),pre:100};await agregar('ped');
    }
    const trasBloqueados=ordenes.ped.length;
    element('bus-ped').value='Bloqueado';filtrar('ped');
    const buscador=element('res-ped').textContent;
    _pgDelta('A',1);_pgvDelta('A',1);_pgvSetCant('A','3');
    const cantidadBuena=ordenes.ped[0].c;
    const producto=dbStock.find(p=>p.id==='A');producto.activo=false;
    _pgRender();
    const filaOculta=!document.getElementById('pgv-A');
    _cartDelta(0,1);_pgSetCant('A','10');_pgPesoPrompt('A');
    const cantidadBloqueada=ordenes.ped[0].c;
    const valido=_pedValidarDisponibles(ordenes.ped,true);
    _cartDelta(0,-1);const reduccion=ordenes.ped[0].c;
    _cartDel(0);const borrados=ordenes.ped.length;
    let lecturas=0;
    window._sbGetRaw=async(table,query)=>{
      if(table!=='productos'||!query.includes('empresa_id=eq.fixture')||!query.includes('select=id,codigo,activo'))throw Error('Consulta no acotada');
      lecturas++;return dbStock.map(p=>({id:p.id,codigo:p.id,activo:p.id!=='G'&&p.activo}));
    };
    ordenes.ped=[{id:'G',n:'Nunca contado',c:1,p:100,sub:100}];
    const antesStock=JSON.stringify(stockData);
    let escritura=false;
    window._stkRpc=()=>{escritura=true;throw Error('No debe llegar al guardado');};
    let errorGuardado='';
    try{await _sbInsertBackup({items:ordenes.ped});}catch(e){errorGuardado=e.message;}
    const sinStockTocado=JSON.stringify(stockData)===antesStock;
    const remotoOculto=!element('ped-grilla').textContent.includes('Nunca contado');
    empresaData.control_stock=false;
    const preventa=_pedProductoDisponible(dbStock.find(p=>p.id==='C'));
    const bloqueadoPreventa=_pedProductoDisponible(dbStock.find(p=>p.id==='B'));
    return {inicio,categorias,familia,trasBloqueados,buscador,cantidadBuena,filaOculta,cantidadBloqueada,valido,reduccion,borrados,
     lecturas,escritura,errorGuardado,sinStockTocado,remotoOculto,preventa,bloqueadoPreventa};
   });
   assert.match(result.inicio,/1 opciones/);
   assert.match(result.inicio,/Nunca contado/);
   assert.doesNotMatch(result.inicio,/Bloqueado|Agotado|Stock negativo/);
   assert.doesNotMatch(result.categorias,/Ocultos/);
   assert.match(result.familia,/Permitido familia/);
   assert.doesNotMatch(result.familia,/Bloqueado|Agotado/);
   assert.equal(result.trasBloqueados,0);assert.equal(result.buscador,'');
   assert.equal(result.cantidadBuena,3);assert.equal(result.cantidadBloqueada,3);
   assert(result.filaOculta&&!result.valido);
   assert.equal(result.reduccion,2);assert.equal(result.borrados,0);
   assert.equal(result.lecturas,1);assert.equal(result.escritura,false);
   assert.match(result.errorGuardado,/productos no disponibles/);
   assert(result.sinStockTocado&&result.remotoOculto&&result.preventa&&!result.bloqueadoPreventa);
   console.log(`Nuevo pedido ${width}px: catálogo, familias, búsqueda, cantidades, carrito y bloqueo remoto OK`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
