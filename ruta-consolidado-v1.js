(function(root,factory){
  var api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.RutaConsolidado=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
  "use strict";

  var nf=new Intl.NumberFormat("es-AR",{maximumFractionDigits:3});
  var orden=new Intl.Collator("es-AR",{numeric:true,sensitivity:"base"});
  function texto(v){return v==null?"":String(v).trim();}
  function cantidad(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function elegido(it,keys){
    for(var i=0;i<keys.length;i++){var v=it[keys[i]];if(v!=null&&texto(v)!=="")return v;}
    return "";
  }
  function contar(ruta,incluirRechazados){
    var productos=new Map(), descartados=0, confirmados=0, pedidos=0, sinProductos=0, lineasInvalidas=0;
    Object.values(ruta&&ruta.clientes||{}).forEach(function(cli){
      if(!cli)return;
      var confirmado=cli.rechazado===true&&(cli.rechazoConfirmado===true||cli.rechazo_confirmado===true);
      if(confirmado)confirmados++;
      if(confirmado&&!incluirRechazados){descartados++;return;}
      var hay=false;
      (Array.isArray(cli.items)?cli.items:[]).forEach(function(it){
        if(!it||it.pendiente)return;
        var codigo=texto(elegido(it,["id","codigo","cod"])), peso=it.esPeso===true||cantidad(it.gramos)>0;
        // c en cajas/bultos ya contiene unidades individuales, nunca c × _ub.
        // En peso usar gramos cuando están presentes (c expresa kilogramos).
        var c=cantidad(elegido(it,["c","cant","cantidad","qty"]));
        var n=peso?Math.round(cantidad(it.gramos)||c*1000):c;
        var nombre=texto(elegido(it,["n","nombre","producto"]));
        if(it._esCaja) nombre=nombre.replace(/\s*\((?:caja|bulto|pack|bl[ií]ster|display|paquete)\s+x\s*\d+\)\s*$/i,"").trim();
        if(!n||(!codigo&&!nombre)){lineasInvalidas++;return;}
        var llave=JSON.stringify([codigo,codigo?"":nombre.toLocaleLowerCase("es-AR"),peso]);
        var existente=productos.get(llave);
        if(!existente){
          existente={codigo:codigo,nombre:nombre,peso:peso,cantidad:0};
          productos.set(llave,existente);
        }
        if(!existente.nombre&&nombre)existente.nombre=nombre;
        existente.cantidad+=n;
        hay=true;
      });
      if(hay)pedidos++;else sinProductos++;
    });
    var gramos=0, unidades=0;
    var filas=Array.from(productos.values()).map(function(p){
      if(p.peso)gramos+=p.cantidad;else unidades+=p.cantidad;
      return {codigo:p.codigo,nombre:p.nombre||"Producto "+p.codigo,peso:p.peso,cantidad:p.peso?p.cantidad/1000:p.cantidad};
    }).sort(function(a,b){return orden.compare(a.nombre,b.nombre)||orden.compare(a.codigo,b.codigo)||Number(a.peso)-Number(b.peso);});
    return {filas:filas,pedidos:pedidos,sinProductos:sinProductos,lineasInvalidas:lineasInvalidas,confirmados:confirmados,
      descartados:descartados,unidades:unidades,kilos:gramos/1000};
  }
  function fecha(v){
    var s=texto(v), f=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(f)return f[3]+"/"+f[2]+"/"+f[1];
    var d=new Date(s);
    return s&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",day:"2-digit",month:"2-digit",year:"numeric"}).format(d):"";
  }
  function datos(ruta,empresa){
    var num=texto(ruta.hrNum), nombre=texto(ruta.nombre), titulo=nombre||num||"Hoja de Ruta";
    if(num&&nombre&&nombre.toLowerCase().indexOf(num.toLowerCase())!==0)titulo=num+" - "+nombre;
    return {titulo:titulo,empresa:texto(empresa)||"DISTRIBIX",fecha:fecha(ruta.fecha),repartidor:texto(ruta.repartidorNom),nombreArchivo:num||nombre||"ruta"};
  }
  function avisos(res){
    var partes=[];
    if(res.descartados)partes.push(res.descartados+(res.descartados===1?" rechazo confirmado excluido":" rechazos confirmados excluidos"));
    else if(res.confirmados)partes.push(res.confirmados+(res.confirmados===1?" rechazo confirmado incluido":" rechazos confirmados incluidos"));
    if(res.sinProductos)partes.push(res.sinProductos+(res.sinProductos===1?" pedido sin productos computables":" pedidos sin productos computables"));
    if(res.lineasInvalidas)partes.push(res.lineasInvalidas+(res.lineasInvalidas===1?" línea inválida omitida":" líneas inválidas omitidas"));
    return partes;
  }
  function resumen(res){
    return [nf.format(res.pedidos)+(res.pedidos===1?" pedido con productos":" pedidos con productos"),
      nf.format(res.filas.length)+(res.filas.length===1?" producto":" productos"),nf.format(res.unidades)+" u."]
      .concat(res.filas.some(function(p){return p.peso;})?[nf.format(res.kilos)+" kg"]:[]);
  }
  function info(meta){return [meta.fecha?"Fecha: "+meta.fecha:"",meta.repartidor?"Repartidor: "+meta.repartidor:""].filter(Boolean);}
  function pdfTxt(s){
    return texto(s).normalize("NFC").replace(/[\u2010-\u2015]/g,"-").replace(/[^\x20-\x7E\xA1-\xFF]/g," ").replace(/\s+/g," ").trim();
  }
  function crearPDF(jsPDF,res,meta){
    var doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true,putOnlyUsedFonts:true});
    if(typeof doc.autoTable!=="function")throw Error("No se cargó el generador de tablas para PDF.");
    var w=doc.internal.pageSize.getWidth(), h=doc.internal.pageSize.getHeight(), m=13, ancho=w-2*m, yTabla=62;
    doc.setProperties({title:"Consolidado de ruta - "+pdfTxt(meta.titulo),subject:"Productos y cantidades",creator:"DISTRIBIX"});
    function escribir(t,y,size,estilo,color,max){
      doc.setFont("helvetica",estilo);doc.setFontSize(size);doc.setTextColor.apply(doc,color);
      var l=doc.splitTextToSize(pdfTxt(t),ancho);
      if(l.length>max){l=l.slice(0,max);l[max-1]=l[max-1].trim().replace(/\S{1,8}$/,"")+"...";}
      doc.text(l,m,y,{lineHeightFactor:1.15});
    }
    doc.autoTable({
      startY:yTabla,
      margin:{top:yTabla,right:m,bottom:16,left:m},
      head:[["Código","Producto","Cantidad","Medida"]],
      body:res.filas.map(function(p){return [pdfTxt(p.codigo)||"-",pdfTxt(p.nombre)||"-",nf.format(p.cantidad),p.peso?"kg":"u."];}),
      showHead:"everyPage",rowPageBreak:"avoid",theme:"striped",
      styles:{font:"helvetica",fontSize:9,cellPadding:{top:1.7,left:3,bottom:1.7,right:3},overflow:"linebreak",textColor:[29,39,54],valign:"middle"},
      headStyles:{fillColor:[29,53,107],textColor:[255,255,255],fontStyle:"bold"},
      alternateRowStyles:{fillColor:[243,246,251]},
      columnStyles:{0:{cellWidth:24},1:{cellWidth:117},2:{cellWidth:25,halign:"right",fontStyle:"bold"},3:{cellWidth:18}},
      didDrawPage:function(){
        escribir(meta.empresa,14,10,"bold",[63,80,110],1);
        escribir("Consolidado de ruta",23,20,"bold",[14,25,47],1);
        escribir(meta.titulo,31,12,"bold",[29,53,107],2);
        escribir(info(meta).join("  |  ")||"Productos y cantidades de la hoja",42,9,"normal",[66,76,92],1);
        escribir(resumen(res).join("  |  "),49,9,"bold",[29,39,54],1);
        escribir(["Cantidades de la hoja, sin descontar devoluciones."].concat(avisos(res)).join("  |  "),55,8,"normal",[66,76,92],2);
      }
    });
    var total=doc.getNumberOfPages();
    for(var i=1;i<=total;i++){
      doc.setPage(i);doc.setDrawColor(204,214,227);doc.line(m,h-12,w-m,h-12);
      doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(72,84,105);
      doc.text("DISTRIBIX  /  Hoja de Ruta",m,h-7);
      doc.text("Página "+i+" de "+total,w-m,h-7,{align:"right"});
    }
    return doc;
  }

  var contexto=null, preparado=false;
  function el(id){return root.document.getElementById(id);}
  function nodo(tag,text,cls){
    var x=root.document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;
  }
  function vigente(){
    return contexto&&root.currentUser===contexto.usuario&&root._sbEmpId===contexto.empresa&&el("modal-hr-consolidado").classList.contains("open");
  }
  function pintar(){
    if(!contexto)return;
    var incluir=el("hr-consol-rechazados").checked;
    var res=contexto.res=contar(contexto.ruta,incluir);
    el("hr-consol-incluir").hidden=!res.confirmados;
    el("hr-consol-resumen").replaceChildren.apply(el("hr-consol-resumen"),resumen(res).map(function(t){return nodo("span",t);}));
    var a=avisos(res), aviso=el("hr-consol-aviso");aviso.textContent=a.join(" · ");aviso.hidden=!a.length;
    var fragmento=root.document.createDocumentFragment();
    res.filas.forEach(function(p){
      var tr=nodo("tr"), nombre=nodo("th",p.nombre);nombre.scope="row";
      tr.append(nodo("td",p.codigo||"-","hrc-codigo"),nombre,nodo("td",nf.format(p.cantidad)+" "+(p.peso?"kg":"u."),"hrc-cant"));
      fragmento.append(tr);
    });
    el("hr-consol-filas").replaceChildren(fragmento);
    el("hr-consol-tabla").hidden=!res.filas.length;
    el("hr-consol-vacio").hidden=!!res.filas.length;
    el("hr-consol-print").disabled=el("hr-consol-download").disabled=!res.filas.length;
  }
  function cerrar(){el("modal-hr-consolidado").classList.remove("open");}
  function preparar(modal){
    if(preparado)return;preparado=true;
    modal.addEventListener("click",function(e){if(e.target===modal)cerrar();});
    modal.addEventListener("keydown",function(e){
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();cerrar();return;}
      if(e.key!=="Tab")return;
      var f=Array.from(modal.querySelectorAll("button:not(:disabled),input:not(:disabled),[tabindex='0']")).filter(function(x){return x.getClientRects().length;});
      if(!f.length)return;
      var primero=f[0],ultimo=f[f.length-1],activo=root.document.activeElement;
      if(e.shiftKey&&(activo===primero||!modal.contains(activo))){e.preventDefault();ultimo.focus();}
      if(!e.shiftKey&&(activo===ultimo||!modal.contains(activo))){e.preventDefault();primero.focus();}
    });
    el("hr-consol-close").addEventListener("click",cerrar);
    el("hr-consol-rechazados").addEventListener("change",pintar);
    el("hr-consol-print").addEventListener("click",function(){exportar(true);});
    el("hr-consol-download").addEventListener("click",function(){exportar(false);});
    new root.MutationObserver(function(){
      if(modal.classList.contains("open")||!contexto)return;
      var prev=contexto.foco;contexto=null;
      root.document.body.classList.remove("hrc-modal-open");
      if(prev&&prev.isConnected)prev.focus({preventScroll:true});
    }).observe(modal,{attributes:true,attributeFilter:["class"]});
  }
  function nativo(){
    return !!(root.Capacitor&&root.Capacitor.isNativePlatform&&root.Capacitor.isNativePlatform());
  }
  function abrir(rk,origen){
    var ruta=root.rutasData&&root.rutasData[rk], modal=el("modal-hr-consolidado");
    if(!ruta||!modal||!root.currentUser)return false;
    preparar(modal);
    var empresa=typeof root._getEmpDatos==="function"?root._getEmpDatos().nombre:"";
    contexto={ruta:ruta,meta:datos(ruta,empresa),usuario:root.currentUser,empresa:root._sbEmpId,foco:origen||root.document.activeElement,res:null};
    el("hr-consol-ruta").textContent=[contexto.meta.titulo].concat(info(contexto.meta)).join(" · ");
    el("hr-consol-rechazados").checked=false;
    el("hr-consol-print").textContent=nativo()?"Abrir / compartir PDF":"Imprimir PDF";
    el("hr-consol-download").hidden=nativo();
    pintar();
    el("hr-consol-scroll").scrollTop=0;
    if(root.PanelViewport)root.PanelViewport.actualizar();
    root.document.body.classList.add("hrc-modal-open");
    modal.classList.add("open");
    el("hr-consol-close").focus({preventScroll:true});
    return true;
  }
  async function exportar(imprimir){
    if(!vigente()||!contexto.res.filas.length)return;
    if(!root.jspdf||typeof root.jspdf.jsPDF!=="function"){
      root.showNotif("No se cargó el generador PDF. Volvé a abrir el panel con conexión.","err");return;
    }
    try{
      var ctx=contexto, doc=crearPDF(root.jspdf.jsPDF,ctx.res,ctx.meta);
      var base=ctx.meta.nombreArchivo.replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"ruta";
      var nombre="Consolidado-"+base+".pdf";
      if(imprimir&&!nativo()){
        if(typeof doc.autoPrint==="function")doc.autoPrint();
        var url=root.URL.createObjectURL(doc.output("blob"));
        var visor=null;
        try{visor=root.open(url,"_blank");if(visor)visor.opener=null;}catch(e){}
        if(visor){root.setTimeout(function(){root.URL.revokeObjectURL(url);},300000);return;}
        root.URL.revokeObjectURL(url);
      }
      if(typeof root._guardarPDF==="function")await root._guardarPDF(doc,nombre,"Consolidado de ruta");
      else doc.save(nombre);
    }catch(e){
      root.showNotif("No se pudo generar el consolidado en PDF. "+texto(e&&e.message),"err");
    }
  }
  return {contar:contar,datos:datos,avisos:avisos,resumen:resumen,crearPDF:crearPDF,abrir:abrir};
});
