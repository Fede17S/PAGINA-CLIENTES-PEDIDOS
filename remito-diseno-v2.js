/* Editor de remitos v2. Solo presentación: no escribe pedidos, stock ni numeradores. */
(function (w) {
  'use strict';
  var defaults = {version:1,plantilla:'clasico',color:'#233f8d',blancoNegro:false,showLogo:true,logoPos:'centro',logoAncho:50,
    showTelefono:true,showZona:true,showEncargado:true,showCuitCliente:true,showDirCliente:true,showCodigo:true,
    showObs:true,showFirma:true,minRows:15,fontEmpresa:11,fontTabla:9,pieTexto:''};
  var ids = {showTelefono:'pdf-show-telefono',showZona:'pdf-show-zona',showEncargado:'pdf-show-encargado',
    showCuitCliente:'pdf-show-cuit-cliente',showDirCliente:'pdf-show-dir-cliente',showCodigo:'pdf-show-codigo',
    showObs:'pdf-show-obs',showFirma:'pdf-show-firma',minRows:'pdf-min-rows',fontEmpresa:'pdf-font-empresa',
    fontTabla:'pdf-font-tabla',pieTexto:'pdf-pie-texto',color:'pdf-color',blancoNegro:'pdf-bn',showLogo:'pdf-logo',logoPos:'pdf-logo-pos',logoAncho:'pdf-logo-ancho'};
  var state = {emp:null,saved:null,raw:null,draft:null,history:[],redo:[],loading:null,ready:false,saving:false,seq:0,timer:null,pdf:null,zoom:1,ejemplo:'corto',mobile:'opciones'};
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function num(x, fallback, min, max) { var n=Number(x);return x===''||x==null||!Number.isFinite(n)?fallback:Math.max(min,Math.min(max,n)); }
  function normalize(raw) {
    raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    var c=Object.assign({},raw,defaults,raw);
    Object.keys(ids).forEach(function(k){if(typeof defaults[k]==='boolean') c[k]=raw[k]!==false;});
    c.blancoNegro=raw.blancoNegro===true;
    c.version=raw.version===2?2:1;
    c.plantilla=['clasico','compacto','moderno'].includes(raw.plantilla)?raw.plantilla:'clasico';
    c.color=/^#[0-9a-f]{6}$/i.test(raw.color||'')?raw.color:defaults.color;
    c.logoPos=['izquierda','centro','derecha'].includes(raw.logoPos)?raw.logoPos:'centro';
    c.logoAncho=num(raw.logoAncho,50,25,65);
    c.minRows=Math.round(num(raw.minRows,15,0,40));
    c.fontEmpresa=num(raw.fontEmpresa,11,9,18);c.fontTabla=num(raw.fontTabla,9,7,12);
    c.pieTexto=typeof raw.pieTexto==='string'?raw.pieTexto.slice(0,240):'';
    return c;
  }
  function empresa() {return typeof _sbEmpId!=='undefined'?_sbEmpId:null;}
  function empresaCfg() {
    if(typeof empresaData==='undefined'||!empresaData||empresaData.id&&String(empresaData.id)!==String(empresa()))return {};
    return (empresaData._config&&empresaData._config.pdf_config)||{};
  }
  function configGuardada() {return normalize(state.emp===empresa()&&state.saved?state.saved:empresaCfg());}
  function notify(text,error) {if(typeof showNotif==='function') showNotif(text,error?'err':'ok');}
  function canEdit() {
    if(typeof currentUser==='undefined'||!currentUser)return false;
    return [currentUser.role].concat(currentUser.roles||[]).some(function(r){return r==='admin'||r==='co-admin';});
  }
  async function ensure() {
    var emp=empresa();if(!emp)return false;
    if(state.emp!==emp){
      ++state.seq;state.emp=emp;state.saved=normalize(empresaCfg());state.raw=null;state.draft=clone(state.saved);
      state.history=[];state.redo=[];state.ready=false;state.loading=null;state.pdf=null;state.saving=false;
    }
    if(state.ready)return true;
    if(state.loading)return state.loading;
    var pending=(async function(){
      try{
        var rows=await sbGet('empresas_config','select=pdf_config&empresa_id=eq.'+encodeURIComponent(emp));
        if(empresa()!==emp||state.emp!==emp)return false;
        if(!Array.isArray(rows))throw Error('No se pudo leer el diseño guardado');
        state.raw=rows[0]?rows[0].pdf_config||null:null;state.saved=normalize(state.raw);state.draft=clone(state.saved);
        state.ready=true;state.history=[];state.redo=[];
        if(typeof empresaData!=='undefined'&&empresaData){empresaData._config=empresaData._config||{};empresaData._config.pdf_config=clone(state.saved);}
        return true;
      }catch(e){if(empresa()===emp)notify('No se pudo cargar el diseño. Se conserva el último disponible.',true);return false;}
      finally{if(state.emp===emp)state.loading=null;}
    })();state.loading=pending;return pending;
  }
  function safeText(value) {return String(value==null?'':value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/—|–/g,'-');}
  function money(n) {return '$'+Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function rgb(hex) {return [1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16);});}
  // Recibe importes ya calculados por el motor existente. No recalcula descuentos.
  function draw(doc, model, raw) {
    var c=normalize(raw), accent=c.blancoNegro?[25,25,25]:rgb(c.color), ink=c.blancoNegro?[25,25,25]:[25,32,44],line=[209,214,222];
    var first=doc.getNumberOfPages(), company=model.empresa||{}, cli=model.cliente||{}, start=12;
    function text(s,x,y,size,bold,opts){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor.apply(doc,ink);doc.text(Array.isArray(s)?s.map(safeText):safeText(s),x,y,opts||{});}
    function wrap(s,width,size){doc.setFont('helvetica','normal');doc.setFontSize(size);return doc.splitTextToSize(safeText(s),width);}
    if(c.showLogo&&model.logo){
      try{
        var props=doc.getImageProperties(model.logo),width=c.logoAncho,height=width*props.height/props.width;
        if(height>20){width*=20/height;height=20;}
        var x=c.logoPos==='izquierda'?12:c.logoPos==='derecha'?198-width:105-width/2;
        doc.addImage(model.logo,props.fileType,x,start,width,height);start+=height+5;
      }catch(e){/* Un logo inválido no impide imprimir el remito. */}
    }
    var title=wrap(company.nombre||'EMPRESA',184,c.fontEmpresa);
    text(title,105,start+3,c.fontEmpresa,true,{align:'center'});start+=title.length*c.fontEmpresa*.36+8;
    var left=[];[['CUIT',company.cuit],['Dirección',company.dir],['Tel.',company.tel],['Email',company.email]].forEach(function(p){if(p[1])left.push(p[0]+': '+p[1]);});
    var leftLines=wrap(left.join('\n'),106,8.3);
    text(leftLines,12,start,8.3,false);
    text('REMITO',198,start,14,true,{align:'right'});
    text('N°: '+(model.numero||'VISTA PREVIA'),198,start+6,9,true,{align:'right'});
    text('Fecha: '+(model.fecha||''),198,start+11,8.5,false,{align:'right'});
    var rightY=start+11;
    if(model.ruta){rightY+=5;var routeLines=wrap('Ruta: '+model.ruta,70,8);text(routeLines,198,rightY,8,false,{align:'right'});rightY+=(routeLines.length-1)*3.3;}
    if(model.vendedor){rightY+=5;var seller=wrap('Vendedor: '+model.vendedor,70,8);text(seller,198,rightY,8,false,{align:'right'});rightY+=(seller.length-1)*3;}
    var y=Math.max(start+leftLines.length*3.4,rightY)+6;
    doc.setDrawColor.apply(doc,accent);doc.setLineWidth(.6);doc.line(12,y,198,y);y+=6;
    text('DATOS DEL CLIENTE',12,y,9,true);y+=6;
    var fields=[['Cliente',cli.nombre||'Mostrador']];
    if(c.showDirCliente&&cli.dir)fields.push(['Dirección',cli.dir]);
    if(c.showTelefono&&cli.tel)fields.push(['Teléfono',cli.tel]);
    if(c.showCuitCliente&&cli.cuit)fields.push(['CUIT',cli.cuit]);
    if(c.showZona&&cli.zona)fields.push(['Zona',cli.zona]);
    if(c.showEncargado&&cli.encargado)fields.push(['Encargado',cli.encargado]);
    fields.forEach(function(field){var lines=wrap(field[0]+': '+field[1],184,9);text(lines,12,y,9,false);y+=lines.length*3.7+1.4;});
    y+=3;
    var rows=(model.filas||[]).map(function(r){return [safeText((c.showCodigo&&r.codigo?'['+r.codigo+'] ':'')+r.nombre),safeText(r.cantidad),money(r.lista),safeText(r.descuento||'-'),money(r.final),money(r.subtotal)];});
    var reales=rows.length;
    // Nunca agregar relleno para forzar otra hoja: solo completar lo que cabe.
    var pad=c.plantilla==='compacto'?1.6:2.4,lineH=c.fontTabla*.405;
    var estimated=rows.reduce(function(sum,row){
      var widths=[62,14,27,29,27,27],lines=Math.max.apply(null,row.map(function(value,i){return wrap(value,widths[i]-2*pad,c.fontTabla).length;}));
      return sum+lines*lineH+2*pad;
    },0)+lineH+2*pad;
    var extra=Math.min(Math.max(0,c.minRows-reales),Math.max(0,Math.floor((207-y-estimated)/(lineH+2*pad))));
    while(extra-->0)rows.push(['','','','','','']);
    doc.autoTable({startY:y,margin:{left:12,right:12,top:22,bottom:17},head:[['Descripción','Cant.','P. lista','Descuento','P. final','Subtotal']],body:rows,
      theme:'grid',showHead:'everyPage',rowPageBreak:'avoid',
      styles:{font:'helvetica',fontSize:c.fontTabla,textColor:ink,lineColor:line,lineWidth:.15,cellPadding:c.plantilla==='compacto'?1.6:2.4,overflow:'linebreak'},
      headStyles:{fillColor:c.plantilla==='moderno'?accent:[240,242,246],textColor:c.plantilla==='moderno'?[255,255,255]:ink,fontStyle:'bold'},
      alternateRowStyles:{fillColor:c.plantilla==='moderno'?[248,250,253]:[255,255,255]},
      columnStyles:{0:{cellWidth:62},1:{cellWidth:14,halign:'center'},2:{cellWidth:27,halign:'right'},3:{cellWidth:29},4:{cellWidth:27,halign:'right'},5:{cellWidth:27,halign:'right'}},
      didDrawPage:function(){if(doc.getCurrentPageInfo().pageNumber>first)text((company.nombre||'')+' - Remito '+(model.numero||'VISTA PREVIA'),12,13,8,true);}
    });
    y=doc.lastAutoTable.finalY+6;
    var totals=model.totales||[], obs= c.showObs?wrap(model.obs||'',84,8):[], cobros=wrap((model.cobros||[]).filter(Boolean).join('\n'),84,7.5);
    var obsHeight=c.showObs?Math.max(18,obs.length*3.1+8):0;
    var cobHeight=cobros.length?cobros.length*3+7:0;
    var signatures=c.showFirma?18:0;
    var leftH=obsHeight+cobHeight;
    var rightH=totals.length*7+13;
    var pieH=Math.max(leftH,rightH)+signatures;
    if(y+pieH>278){doc.addPage();y=25;text((company.nombre||'')+' - Remito '+(model.numero||'VISTA PREVIA'),12,13,8,true);}
    // Contenido excepcionalmente largo se pagina, en vez de salir de la hoja.
    var ly=y;
    function leftBlock(lines,size,label){
      if(!lines.length)return;
      text(label,12,ly+3,8,true);ly+=8;
      lines.forEach(function(s){if(ly>274){doc.addPage();ly=24;}text(s,12,ly,size,false);ly+=3.2;});ly+=5;
    }
    if(c.showObs){leftBlock(obs.length?obs:[' '],8,'Observaciones');}
    leftBlock(cobros,7.5,'Datos de pago y contacto');
    // Totales en la misma hoja que el comienzo del pie, incluso si la nota es larga.
    if(leftH>240){y=25;} // Nota extensa: los totales van en su última hoja, sin superponerse.
    if(leftH>240&&ly>150){doc.addPage();y=25;}
    var ty=y;
    totals.forEach(function(r){doc.setDrawColor.apply(doc,line);doc.rect(108,ty,90,7);text(r.label,110,ty+4.6,8,false);text(r.valor,196,ty+4.6,8,false,{align:'right'});ty+=7;});
    doc.setFillColor.apply(doc,c.plantilla==='moderno'?accent:[245,246,249]);doc.setDrawColor.apply(doc,accent);doc.rect(108,ty,90,12,'FD');
    var totalText='TOTAL: '+money(model.total);
    doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor.apply(doc,c.plantilla==='moderno'?[255,255,255]:ink);doc.text(totalText,195,ty+8,{align:'right'});
    var endY=Math.max(ty+12,ly)+14;
    if(c.showFirma){if(endY>277){doc.addPage();endY=35;}doc.setDrawColor.apply(doc,line);doc.line(12,endY,92,endY);doc.line(118,endY,198,endY);text('Firma de recepción',52,endY+4,7,false,{align:'center'});text('Aclaración',158,endY+4,7,false,{align:'center'});}
    var last=doc.getNumberOfPages();
    for(var p=first;p<=last;p++){doc.setPage(p);doc.setDrawColor.apply(doc,line);doc.line(12,283,198,283);
      var footer=wrap(c.pieTexto||company.nombre||'',150,7).slice(0,2);text(footer,12,287,7,false);
      text((p-first+1)+' / '+(last-first+1),198,289,7,false,{align:'right'});
    }
    doc.setPage(last);return doc;
  }
  function crear(model,cfg) {return draw(new w.jspdf.jsPDF(),model,cfg);}
  function modelo(obj,cli,meta,calc) {
    obj=obj||{};cli=cli||{};meta=meta||{};
    calc=calc||_calcularPedidoUnico(obj);
    var items=_itemsSinGeneralEmbebido(obj,calc), ed=typeof _getEmpDatos==='function'?_getEmpDatos():{};
    var filas=items.map(function(i){var d=_detallePrecioItem(i),b=typeof _itBulto==='function'?_itBulto(i):0;
      return {codigo:i.id||i.codigo||'',nombre:i.n||i.nombre||'',cantidad:b?d.cant/b+(i.esPeso?' kg':' bulto'):i.esPeso?(typeof _pgFmtPeso==='function'?_pgFmtPeso(d.cant):d.cant+' kg'):d.cant,
        lista:d.pLista*(b||1),descuento:d.label,final:d.pFinal*(b||1),subtotal:d.sub};});
    var totals=[{label:'Subtotal lista',valor:money(calc.subtotalLista)}];
    [['Descuento promo',calc.ahorroPromos],['Dsc. manual productos',calc.ahorroManual],['Descuento general',calc.montoDscGen]].forEach(function(r){if(r[1]>0)totals.push({label:r[0],valor:'-'+money(r[1])});});
    var base=calc.total,factura=obj.tipoComprobante==='factura_a';
    if(factura)totals.push({label:'IVA 21%',valor:money(Math.round(base*.21*100)/100)});
    var ex=typeof _getEmpExtra==='function'?_getEmpExtra():{},fiscal={ri:'Responsable Inscripto',mono:'Monotributo',exento:'Exento',cf:'Consumidor Final'};
    var cobros=[fiscal[ex.condIva]||'',ex.puntoVenta?'Pto. venta: '+ex.puntoVenta:''];
    [['Alias',ex.alias],['CBU',ex.cbu],['Titular',ex.titular],['Pago',ex.mpLink],['WhatsApp',typeof _waNumeroLindo==='function'?_waNumeroLindo():'']].forEach(function(r){if(r[1])cobros.push(r[0]+': '+r[1]);});
    ed=Object.assign({},ed,{nombre:ed.nombre||(typeof empresaData!=='undefined'&&empresaData&&empresaData.nombre)||'EMPRESA'});
    return {empresa:ed,logo:typeof empresaData!=='undefined'&&empresaData?empresaData.logo:null,
      cliente:{nombre:meta.nombre||obj.clienteNom||obj.nom||'Mostrador',dir:cli.direccion||cli.dir||'',tel:cli.tel||cli.telefono||'',cuit:cli.cuit||'',zona:cli.zona||'',encargado:cli.rec||cli.recepciona||''},
      filas:filas,totales:totals,total:Math.round(base*(factura?1.21:1)*100)/100,obs:obj.obs||'',cobros:cobros,
      numero:meta.numero||'',fecha:meta.fecha||'',ruta:meta.ruta||'',vendedor:meta.vendedor||''};
  }
  function setDraft(c,history) {if(history!==false){state.history.push(clone(state.draft));if(state.history.length>40)state.history.shift();state.redo=[];}state.draft=normalize(c);state.draft.version=2;sync();preview();}
  function readFields() {
    if(state.saving||!canEdit())return;var c=clone(state.draft);
    Object.keys(ids).forEach(function(k){var el=document.getElementById(ids[k]);if(el)c[k]=el.type==='checkbox'?el.checked:el.value;});setDraft(c);
  }
  function sync() {
    if(!state.draft)return;
    Object.keys(ids).forEach(function(k){var el=document.getElementById(ids[k]);if(!el)return;if(el.type==='checkbox')el.checked=!!state.draft[k];else el.value=state.draft[k];
      if(el.type==='range'&&el.nextElementSibling)el.nextElementSibling.textContent=state.draft[k]+(k==='logoAncho'?' mm':' pt');});
    var changed=state.draft.version!==2||JSON.stringify(normalize(state.draft))!==JSON.stringify(normalize(state.saved));
    var status=document.getElementById('rd-status');if(status)status.textContent=state.saving?'Guardando…':!state.ready?'No se pudo cargar. Reabrí esta pestaña para reintentar.':state.draft.version!==2?'Diseño anterior activo. Guardá para aplicar el nuevo editor.':changed?'Cambios sin guardar · solo los ves vos':'Diseño guardado · listo para usar';
    ['guardar','undo','redo','descartar','restaurar','anterior'].forEach(function(k){var el=document.getElementById('rd-'+k);if(el)el.disabled=!canEdit()||state.saving||!state.ready||(k==='undo'&&!state.history.length)||(k==='redo'&&!state.redo.length)||(k==='guardar'&&!changed)||(k==='anterior'&&!state.saved.disenoAnterior);});
    document.querySelectorAll('[data-rd-plantilla]').forEach(function(el){el.setAttribute('aria-pressed',String(el.dataset.rdPlantilla===state.draft.plantilla));});
  }
  function history(redo) {if(state.saving)return;var from=redo?state.redo:state.history,to=redo?state.history:state.redo;if(!from.length)return;to.push(clone(state.draft));state.draft=from.pop();sync();preview();}
  function plantilla(name) {var opts={clasico:{fontEmpresa:11,fontTabla:9,minRows:15},compacto:{fontEmpresa:11,fontTabla:8,minRows:0},moderno:{fontEmpresa:14,fontTabla:9,minRows:0}};if(opts[name])setDraft(Object.assign({},state.draft,opts[name],{plantilla:name}));}
  function discard() {if(state.saving)return;if(JSON.stringify(state.draft)!==JSON.stringify(state.saved)&&!w.confirm('¿Descartar los cambios sin guardar?'))return;state.history=[];state.redo=[];state.draft=clone(state.saved);sync();preview();}
  function restore() {if(state.saving||!w.confirm('¿Restaurar el diseño clásico? Solo cambia el borrador hasta que guardes.'))return;setDraft(Object.assign({},defaults,{version:2}));}
  function previous() {if(state.saving||!state.saved.disenoAnterior||!w.confirm('¿Recuperar el diseño anterior en el borrador? Se aplica recién al guardar.'))return;setDraft(Object.assign({},state.saved.disenoAnterior,{version:2}));}
  async function save() {
    if(!canEdit()){notify('Solo administración puede guardar el diseño.',true);return;}
    if(state.saving||!state.ready||state.emp!==empresa())return;
    var emp=state.emp, draft=clone(state.draft);draft.version=2;
    draft.disenoAnterior=clone(state.saved);delete draft.disenoAnterior.disenoAnterior;
    state.saving=true;sync();
    try{
      var rows=await sbGet('empresas_config','select=pdf_config&empresa_id=eq.'+encodeURIComponent(emp));
      if(emp!==empresa()||emp!==state.emp)return;
      if(!Array.isArray(rows))throw Error('No se pudo verificar el diseño actual');
      var latest=rows[0]?rows[0].pdf_config||null:null;
      if(JSON.stringify(latest)!==JSON.stringify(state.raw))throw Error('Otro administrador cambió el diseño. Recargá la página para cargar su versión antes de guardar.');
      await sbUpsert('empresas_config',{empresa_id:emp,pdf_config:draft});
      if(emp!==empresa()||emp!==state.emp)return;
      state.raw=clone(draft);state.saved=clone(draft);state.draft=clone(draft);state.history=[];state.redo=[];
      _pdfConfig=clone(draft);if(typeof empresaData!=='undefined'&&empresaData){empresaData._config=empresaData._config||{};empresaData._config.pdf_config=clone(draft);}
      notify('Diseño guardado para esta empresa.');
    }catch(e){notify('No se guardó: '+e.message,true);}finally{if(state.emp===emp){state.saving=false;sync();}}
  }
  var pdfjsPromise;
  function loadPdfjs() {
    if(!pdfjsPromise)pdfjsPromise=import('./pdfjs/pdf.min.mjs').then(function(lib){lib.GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.min.mjs',document.baseURI).href;return lib;}).catch(function(e){pdfjsPromise=null;throw e;});
    return pdfjsPromise;
  }
  function sample() {
    var nombres=['Alfajor triple caja x24','Producto de ejemplo con descripción extensa para revisar los saltos de línea','Artículo de perfumería'];
    var count=state.ejemplo==='largo'?38:3;
    var items=Array.from({length:count},function(_,i){return {id:'EJ-'+String(i+1).padStart(3,'0'),n:nombres[i%3],c:2,p:1500,sub:3000};});
    var obj={items:items,obs:'Ejemplo de diseño. No genera pedidos ni reserva números.',descuentos:{dscGenTipo:'%',dscGenValor:5}};
    var m=modelo(obj,{direccion:'Av. San Martín 450, Puerto Madryn',tel:'280 400-0000',cuit:'20-00000000-0',zona:'Centro',rec:'Encargado de ejemplo'},
      {nombre:'CLIENTE DE EJEMPLO',numero:'EJEMPLO - NO VÁLIDO',fecha:new Date().toLocaleDateString('es-AR'),ruta:'HR-EJEMPLO'});
    return m;
  }
  function preview() {clearTimeout(state.timer);state.timer=setTimeout(renderPreview,180);}
  async function renderPreview() {
    var target=document.getElementById('rd-pages');if(!target||!state.draft)return;
    var token=++state.seq,emp=state.emp,signature=JSON.stringify(state.draft)+'|'+state.ejemplo;
    try{
      var pdf=crear(sample(),state.draft);state.pdf=pdf;
      var lib=await loadPdfjs(),task=lib.getDocument({data:new Uint8Array(pdf.output('arraybuffer')),isEvalSupported:false,standardFontDataUrl:new URL('./pdfjs/standard_fonts/',document.baseURI).href});
      var loaded=await task.promise;
      if(token!==state.seq||emp!==state.emp){await loaded.destroy();return;}
      var fragment=document.createDocumentFragment();
      for(var p=1;p<=loaded.numPages;p++){
        if(token!==state.seq||emp!==state.emp){await loaded.destroy();return;}
        var page=await loaded.getPage(p),view=page.getViewport({scale:1.3}),canvas=document.createElement('canvas');
        canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=(state.zoom*100)+'%';canvas.style.height='auto';canvas.setAttribute('aria-label','Vista previa de remito, página '+p);
        await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;fragment.appendChild(canvas);
      }
      if(token===state.seq&&emp===state.emp){target.replaceChildren(fragment);state.renderedSignature=signature;target.dataset.plantilla=state.draft.plantilla;var count=document.getElementById('rd-pages-count');if(count)count.textContent=loaded.numPages+' página'+(loaded.numPages>1?'s':'')+' · PDF real';}
      await loaded.destroy();
    }catch(e){if(token===state.seq){
      target.textContent='Este navegador usa el visor PDF integrado. Si no se muestra, descargá el ejemplo.';
      if(state.pdf){
        if(state.fallbackUrl)URL.revokeObjectURL(state.fallbackUrl);
        state.fallbackUrl=URL.createObjectURL(state.pdf.output('blob'));
        var frame=document.createElement('iframe');frame.title='Vista previa PDF del remito';frame.src=state.fallbackUrl;
        frame.style.cssText='display:block;width:100%;height:65vh;border:0;background:white';target.appendChild(frame);
      }
    }}
  }
  function download(html) {
    try{
      var pdf=crear(sample(),state.draft);
      if(!html){if(typeof _guardarPDF==='function')_guardarPDF(pdf,'remito-ejemplo.pdf','Vista previa de remito');else pdf.save('remito-ejemplo.pdf');return;}
      var images=state.renderedSignature===JSON.stringify(state.draft)+'|'+state.ejemplo?Array.from(document.querySelectorAll('#rd-pages canvas')).map(function(c){return '<img alt="Página del remito" style="display:block;width:100%;max-width:794px;margin:auto" src="'+c.toDataURL('image/png')+'">';}).join(''):'';
      var data=pdf.output('datauristring');
      var contenido='<!DOCTYPE html><html lang="es"><meta charset="UTF-8"><title>Ejemplo de remito</title><style>@media print{a{display:none}img{break-after:page;max-height:285mm;object-fit:contain}}</style><a download="remito-ejemplo.pdf" href="'+data+'">Descargar PDF de ejemplo</a>'+images+(images?'':'<iframe title="Remito" style="width:100%;height:90vh" src="'+data+'"></iframe>')+'</html>';
      var url=URL.createObjectURL(new Blob([contenido],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='plantilla_remito.html';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);
    }catch(e){notify('No se pudo descargar: '+e.message,true);}
  }
  function mobile(tab) {state.mobile=tab;var root=document.getElementById('rd-editor');if(root)root.dataset.mobile=tab;document.querySelectorAll('[data-rd-mobile]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.rdMobile===tab));});if(tab==='preview')preview();}
  function mount() {
    var host=document.getElementById('cfg-panel-remito');if(!host)return;
    if(!host.querySelector('#rd-editor')){
      // Los campos anteriores conservan sus IDs y se mueven a grupos legibles.
      var oldFields={};Object.keys(ids).forEach(function(k){var el=document.getElementById(ids[k]);if(el)oldFields[k]=el;});
      host.innerHTML='<style>.rd-editor{padding:16px}.rd-top,.rd-actions,.rd-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.rd-top{justify-content:space-between;margin-bottom:14px}.rd-editor h3{margin:0;font-size:19px}.rd-editor p{font-size:12px;color:var(--muted);line-height:1.5}.rd-editor button,.rd-editor select{font:inherit;border:1px solid var(--border);background:var(--s2);color:var(--text);border-radius:10px;padding:10px;min-height:42px;cursor:pointer}.rd-editor button:disabled{opacity:.45;cursor:default}.rd-editor button[aria-pressed="true"]{border-color:var(--accent);background:var(--s3);box-shadow:inset 0 0 0 1px var(--accent)}.rd-editor .rd-save{background:var(--accent);color:#fff;font-weight:700}.rd-grid{display:grid;grid-template-columns:minmax(270px,360px) minmax(0,1fr);gap:18px;align-items:start}.rd-options details{border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--s2)}.rd-options summary{font-weight:700;padding:14px;cursor:pointer}.rd-fields{padding:0 14px 14px;display:grid;gap:12px}.rd-fields label{font-size:13px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}.rd-fields input[type="checkbox"]{width:18px;height:18px}.rd-fields input[type="range"]{flex:1;min-width:80px}.rd-fields input[type="text"],.rd-fields input[type="number"]{max-width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--s1);color:var(--text);box-sizing:border-box}.rd-templates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.rd-templates button{font-size:12px}.rd-preview{position:sticky;top:8px;min-width:0}.rd-pages{padding:12px;background:#dfe3eb;border-radius:12px;max-height:72vh;overflow:auto;min-height:250px}.rd-pages canvas{display:block;margin:0 auto 12px;box-shadow:0 3px 12px #0002;background:white}.rd-status{font-size:12px;margin:7px 0 0;color:var(--muted)}.rd-tabs{display:none}.rd-preview-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center}.rd-preview-tools label{font-size:12px}.rd-actions{margin-top:12px}@media(max-width:760px){.rd-editor{padding:10px}.rd-grid{display:block}.rd-tabs{display:flex;margin-bottom:12px}.rd-tabs button{flex:1}.rd-preview{position:static}.rd-editor[data-mobile="opciones"] .rd-preview{display:none}.rd-editor[data-mobile="preview"] .rd-options{display:none}.rd-top .rd-actions{margin:0}.rd-pages{max-height:65vh}.rd-top h3{font-size:17px}}</style>'+
        '<div id="rd-editor" class="rd-editor" data-mobile="opciones"><div class="rd-top"><div><h3>Diseñá tus remitos</h3><p>Probá los cambios antes de aplicarlos. No modifica ventas ni stock.</p><div id="rd-status" class="rd-status" role="status"></div></div><div class="rd-actions"><button id="rd-undo" type="button" title="Deshacer">↶ Deshacer</button><button id="rd-redo" type="button" title="Rehacer">↷ Rehacer</button><button id="rd-guardar" class="rd-save" type="button">Guardar diseño</button></div></div>'+
        '<div class="rd-tabs"><button type="button" data-rd-mobile="opciones" aria-pressed="true">Opciones</button><button type="button" data-rd-mobile="preview" aria-pressed="false">Vista previa</button></div><div class="rd-grid"><div class="rd-options">'+
        '<details open><summary>1. Estilo y marca</summary><div class="rd-fields"><div class="rd-templates"><button type="button" data-rd-plantilla="clasico">Clásico</button><button type="button" data-rd-plantilla="compacto">Compacto</button><button type="button" data-rd-plantilla="moderno">Moderno</button></div><label>Color del remito <input type="color" id="pdf-color"></label><label><input type="checkbox" id="pdf-bn"> Imprimir en blanco y negro</label><label><input type="checkbox" id="pdf-logo"> Mostrar logo de la empresa</label><label>Posición del logo <select id="pdf-logo-pos"><option value="izquierda">Izquierda</option><option value="centro">Centro</option><option value="derecha">Derecha</option></select></label><label>Ancho del logo <input type="range" id="pdf-logo-ancho" min="25" max="65"><span></span></label><p>Usa el logo cargado en la empresa, conservando sus proporciones.</p></div></details>'+
        '<details><summary>2. Datos del cliente</summary><div class="rd-fields" id="rd-cliente"></div></details><details><summary>3. Productos y texto</summary><div class="rd-fields" id="rd-tabla"></div></details><details><summary>4. Pie y firmas</summary><div class="rd-fields" id="rd-pie"></div></details><div class="rd-actions"><button type="button" id="rd-descartar">Descartar cambios</button><button type="button" id="rd-anterior">Recuperar diseño anterior</button><button type="button" id="rd-restaurar">Restaurar clásico</button></div></div>'+
        '<div class="rd-preview"><div class="rd-preview-tools"><label>Ejemplo <select id="rd-ejemplo"><option value="corto">Pedido corto</option><option value="largo">Pedido largo</option></select></label><label>Zoom <select id="rd-zoom"><option value="0.75">75%</option><option value="1" selected>Ajustar</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label><span id="rd-pages-count" class="rd-status"></span></div><div class="rd-pages" id="rd-pages" aria-live="polite">Preparando vista previa…</div><div class="rd-actions"><button type="button" id="rd-pdf">Descargar PDF de ejemplo</button><button type="button" id="rd-html">Descargar plantilla HTML</button></div><p>Ejemplo ficticio. No crea pedidos ni consume números de remito.</p></div></div></div>';
      var labels={showTelefono:'Teléfono',showZona:'Zona',showEncargado:'Encargado',showCuitCliente:'CUIT',showDirCliente:'Dirección',showCodigo:'Mostrar código del producto',showObs:'Observaciones',showFirma:'Firma y aclaración',minRows:'Filas mínimas (0 = sin relleno)',fontEmpresa:'Letra de empresa',fontTabla:'Letra de productos',pieTexto:'Texto del pie de página'};
      Object.keys(oldFields).forEach(function(k){var el=oldFields[k],dest=document.getElementById(['showTelefono','showZona','showEncargado','showCuitCliente','showDirCliente'].includes(k)?'rd-cliente':['showObs','showFirma','pieTexto'].includes(k)?'rd-pie':'rd-tabla');
        el.removeAttribute('oninput');el.removeAttribute('onchange');var label=document.createElement('label');label.append(document.createTextNode(labels[k]+' '),el);if(el.type==='range')label.append(document.createElement('span'));dest.appendChild(label);});
      host.querySelectorAll('input,select').forEach(function(el){if(!Object.values(ids).includes(el.id))return;el.disabled=!canEdit();el.addEventListener(el.type==='range'||el.type==='text'||el.type==='color'?'input':'change',readFields);});
      document.getElementById('rd-guardar').onclick=save;document.getElementById('rd-undo').onclick=function(){history(false);};document.getElementById('rd-redo').onclick=function(){history(true);};
      document.getElementById('rd-descartar').onclick=discard;document.getElementById('rd-restaurar').onclick=restore;
      document.getElementById('rd-anterior').onclick=previous;
      host.querySelectorAll('[data-rd-plantilla]').forEach(function(el){el.onclick=function(){plantilla(el.dataset.rdPlantilla);};});
      host.querySelectorAll('[data-rd-mobile]').forEach(function(el){el.onclick=function(){mobile(el.dataset.rdMobile);};});
      document.getElementById('rd-ejemplo').onchange=function(e){state.ejemplo=e.target.value;preview();};
      document.getElementById('rd-zoom').onchange=function(e){state.zoom=Number(e.target.value)||1;document.querySelectorAll('#rd-pages canvas').forEach(function(c){c.style.width=(state.zoom*100)+'%';});};
      document.getElementById('rd-pdf').onclick=function(){download(false);};document.getElementById('rd-html').onclick=function(){download(true);};
    }
    sync();mobile(state.mobile);preview();
  }
  async function open() {await ensure();mount();}
  w.addEventListener('beforeunload',function(e){if(state.emp===empresa()&&state.ready&&JSON.stringify(state.draft)!==JSON.stringify(state.saved)){e.preventDefault();e.returnValue='';}});
  w.RemitoDisenoV2={normalize:normalize,draw:draw,crear:crear,modelo:modelo,ensure:ensure,configGuardada:configGuardada,open:open,preview:preview,save:save,download:download};
})(window);
