/* iClap es una vitrina externa: nunca modifica productos, carrito ni stock. */
(function(root,factory){
  var api=factory(root);
  if(typeof module==="object"&&module.exports) module.exports=api;
  else root.IClapCatalogo=api;
})(typeof window!=="undefined"?window:globalThis,function(root){
  "use strict";
  var ORIGIN="https://iclap-catalogo.vercel.app";
  var RELAY="https://pagina-tienda-seven.vercel.app/api/iclap?empresa=1122";
  function permitido(codigo){return String(codigo||"")==="1122";}
  function texto(v,max){return typeof v==="string"?v.slice(0,max||200):"";}
  function config(v){
    v=v&&typeof v==="object"&&!Array.isArray(v)?v:{};
    return {enabled:v.enabled!==false,mode:v.mode==="selected"?"selected":"all",
      skus:Array.from(new Set((Array.isArray(v.skus)?v.skus:[]).filter(function(s){return typeof s==="string"&&s.length>0&&s.length<=200;}))).slice(0,1000)};
  }
  function slug(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
  function precio(v){return typeof v==="number"&&Number.isFinite(v)&&v>0&&v<1e12?v:null;}
  function normalizar(data){
    if(!data||data.admin!==false||data.usingExampleData!==false||!Array.isArray(data.products)) throw new Error("Respuesta pública de iClap inválida");
    var seen=new Set();
    return data.products.slice(0,2000).filter(function(p){return p&&p.published===true&&typeof p.sku==="string"&&p.sku.length<=200&&p.sku&&typeof p.model==="string"&&p.model&&!seen.has(p.sku)&&(seen.add(p.sku),true);}).map(function(p){
      var variantes=Array.isArray(p.variants)?p.variants.slice(0,100):[];
      var valores=variantes.length?variantes.map(function(v){return v&&v.priceStatus!=="consult"?precio(v.fixedPriceArs):null;}):[p.priceStatus!=="consult"?precio(p.fixedPriceArs):null];
      var validos=valores.filter(function(n){return n!==null;});
      var status=["available","last_units","preorder","out_of_stock"].indexOf(p.availabilityStatus)>=0?p.availabilityStatus:"unknown";
      if(typeof p.stockQuantity==="number"&&p.stockQuantity<=0&&status!=="preorder")status="out_of_stock";
      var key=texto(p.imageKey,300);
      return {sku:p.sku,model:texto(p.model,180),category:texto(p.category,80),brand:texto(p.brand,60),
        condition:p.condition==="used"?"Usado seleccionado":"Nuevo",
        specs:[texto(p.storage,40),texto(p.battery,40),texto(p.grade,30)].filter(Boolean).join(" · "),
        price:validos.length?Math.min.apply(Math,validos):null,from:variantes.length>1,
        availability:status,image:key?ORIGIN+"/api/media?key="+encodeURIComponent(key):"",
        href:ORIGIN+"/producto/"+slug(p.model+"-"+p.sku)};
    });
  }
  function seleccion(products,cfg){var c=config(cfg);return c.enabled?products.filter(function(p){return c.mode!=="selected"||c.skus.indexOf(p.sku)>=0;}):[];}
  function urlAPI(){return root.location&&/^https?:$/.test(root.location.protocol)&&!(root.document&&root.document.getElementById("catalogo-vivo"))?"/api/iclap?empresa=1122":RELAY;}
  function urlImagen(image){
    if(typeof image!=="string"||image.indexOf(ORIGIN+"/api/media?key=")!==0)return "";
    var key=new URL(image).searchParams.get("key");
    var relay=new URL(urlAPI(),root.location&&root.location.href||RELAY);
    relay.pathname="/api/iclap-imagen";relay.search="?empresa=1122&key="+encodeURIComponent(key||"");
    return relay.href;
  }
  async function cargar(codigo,signal){
    if(!permitido(codigo))throw new Error("Integración no habilitada para esta empresa");
    var r=await root.fetch(urlAPI(),{method:"GET",credentials:"omit",cache:"no-store",signal:signal});
    if(!r.ok)throw new Error("No se pudo actualizar iClap");
    var data=await r.json();
    if(data.empresa!=="1122"||data.source!==ORIGIN||!Array.isArray(data.products))throw new Error("Respuesta iClap inválida");
    // Volver a seleccionar campos: nunca insertar HTML ni URLs arbitrarias del servidor.
    return data.products.slice(0,2000).filter(function(p){return p&&typeof p.sku==="string"&&typeof p.model==="string"&&typeof p.href==="string"&&p.href.indexOf(ORIGIN+"/producto/")===0;}).map(function(p){
      return {sku:texto(p.sku,200),model:texto(p.model,180),category:texto(p.category,80),brand:texto(p.brand,60),condition:texto(p.condition,40),specs:texto(p.specs,120),price:precio(p.price),from:p.from===true,
        availability:["available","last_units","preorder","out_of_stock"].indexOf(p.availability)>=0?p.availability:"unknown",
        href:ORIGIN+"/producto/"+encodeURIComponent(p.href.slice((ORIGIN+"/producto/").length)),
        image:urlImagen(p.image)};
    });
  }
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function dinero(n){return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);}
  var labels={available:"Disponible en iClap",last_units:"Últimas unidades",preorder:"Por encargo",out_of_stock:"Sin stock",unknown:"Consultar disponibilidad"};
  function estilos(){
    if(!root.document||root.document.getElementById("iclap-estilos"))return;
    var link=root.document.createElement("link");link.id="iclap-estilos";link.rel="stylesheet";
    var script=root.document.querySelector('script[src*="iclap-catalogo-v1.js"]');
    link.href=new URL("iclap-catalogo-v1.css?v=20261119-2",script?script.src:root.location.href).href;
    root.document.head.appendChild(link);
  }
  function card(p){
    return '<article class="ic-card">'+(p.image?'<img src="'+esc(p.image)+'" alt="'+esc(p.model)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'<div class="ic-placeholder" aria-hidden="true">📱</div>')+
      '<div class="ic-card-body"><span class="ic-condition">'+esc(p.condition)+'</span><h3>'+esc(p.model)+'</h3><p class="ic-spec">'+esc(p.specs||p.category)+'</p><p class="ic-price">'+(p.price?(p.from?'<small>Desde </small>':'')+esc(dinero(p.price)):'Consultar precio')+'</p><p class="ic-status" data-status="'+p.availability+'">'+esc(labels[p.availability]||labels.unknown)+'</p><a href="'+esc(p.href)+'" target="_blank" rel="noopener noreferrer" class="ic-action">Ver en iClap</a></div></article>';
  }
  function mount(host,options){
    if(!host)return function(){};
    host.replaceChildren();host.hidden=true;
    if(!permitido(options.codigo))return function(){};
    estilos();
    var alive=true,controller=null,products=[],query="",category="",limit=12,busy=false,cfg=config(options.config),generation=0,updated="",updatedMs=0;
    function valid(){return alive&&(!options.isValid||options.isValid());}
    host.classList.add("iclap-vitrina");
    host.innerHTML='<details class="ic-wrap"><summary class="ic-heading"><span class="ic-brand">📱 <b>iClap</b><span>Tecnología</span></span><span class="ic-toggle">Ver productos</span></summary><p class="ic-intro">iPhone, tecnología y más. Compra y atención directamente con iClap; no se agrega al pedido de la distribuidora.</p><div class="ic-toolbar"><input type="search" aria-label="Buscar en iClap" placeholder="Buscar en iClap…"><select aria-label="Categoría de iClap"><option value="">Todas las categorías</option></select><button type="button" data-ic-refresh>Actualizar iClap</button></div><p class="ic-info" role="status" aria-live="polite"></p><div class="ic-grid"></div><button type="button" class="ic-more" hidden>Mostrar más productos</button><p class="ic-foot">Precios y disponibilidad sujetos a confirmación en la ficha de iClap.</p></details>';
    host.querySelector("details").addEventListener("toggle",function(e){host.querySelector(".ic-toggle").textContent=e.target.open?"Ocultar productos":"Ver productos";if(e.target.open&&Date.now()-updatedMs>30000)load();});
    var grid=host.querySelector(".ic-grid"),info=host.querySelector(".ic-info"),more=host.querySelector(".ic-more"),refresh=host.querySelector("[data-ic-refresh]"),select=host.querySelector("select");
    function render(){
      if(!valid()){host.hidden=true;return;}
      var chosen=seleccion(products,cfg),q=query.toLocaleLowerCase("es");
      var found=chosen.filter(function(p){return (!category||p.category===category)&&(!q||[p.model,p.specs,p.brand,p.category].join(" ").toLocaleLowerCase("es").includes(q));});
      grid.innerHTML=found.slice(0,limit).map(card).join("");
      info.textContent=found.length?found.length+" producto(s) · actualizado "+updated:"No hay productos de iClap para mostrar con esta selección.";
      more.hidden=found.length<=limit;
      grid.querySelectorAll("img").forEach(function(img){img.addEventListener("error",function(){var placeholder=root.document.createElement("div");placeholder.className="ic-placeholder";placeholder.textContent="📱";placeholder.setAttribute("aria-hidden","true");img.replaceWith(placeholder);});});
    }
    async function load(){
      if(!valid()||busy)return;busy=true;var gen=++generation;
      refresh.disabled=true;info.textContent="Actualizando catálogo de iClap…";grid.replaceChildren();more.hidden=true;
      controller=new AbortController();var timer=setTimeout(function(){controller.abort();},14000);
      try{
        var saved=options.getConfig?await options.getConfig():options.config;
        if(!valid()||gen!==generation)return;
        cfg=config(saved);host.hidden=!cfg.enabled;if(!cfg.enabled)return;
        products=await cargar(options.codigo,controller.signal);
        updatedMs=Date.now();
        updated=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
        if(!valid()||gen!==generation)return;
        var cats=Array.from(new Set(seleccion(products,cfg).map(function(p){return p.category;}).filter(Boolean))).sort();
        select.innerHTML='<option value="">Todas las categorías</option>'+cats.map(function(c){return '<option>'+esc(c)+'</option>';}).join("");
        if(cats.indexOf(category)<0)category="";select.value=category;render();
      }catch(e){if(valid()&&gen===generation){products=[];grid.replaceChildren();info.textContent="No se pudo actualizar iClap. Podés reintentar; el catálogo habitual sigue funcionando.";}}
      finally{clearTimeout(timer);busy=false;refresh.disabled=false;}
    }
    host.querySelector("input").addEventListener("input",function(e){query=e.target.value;limit=12;render();});
    select.addEventListener("change",function(){category=select.value;limit=12;render();});
    more.addEventListener("click",function(){limit+=12;render();});refresh.addEventListener("click",load);
    function visible(){if(root.document.visibilityState==="visible"&&host.querySelector("details").open)load();}
    root.document.addEventListener("visibilitychange",visible);
    host.hidden=options.getConfig?true:!cfg.enabled;
    if(options.getConfig||cfg.enabled)load();
    return function(){alive=false;generation++;if(controller)controller.abort();root.document.removeEventListener("visibilitychange",visible);host.replaceChildren();host.hidden=true;};
  }
  function Section(props){
    var R=root.React,ref=R.useRef(null),serialized=JSON.stringify(config(props.config));
    R.useEffect(function(){return mount(ref.current,{codigo:props.codigo,config:props.config});},[props.codigo,serialized]);
    return R.createElement("div",{ref:ref,hidden:true,style:props.style});
  }
  function Editor(props){
    var R=root.React,h=R.createElement,c=config(props.value),state=R.useState([]),products=state[0],setProducts=state[1],status=R.useState(""),message=status[0],setMessage=status[1],qState=R.useState(""),q=qState[0],setQ=qState[1],refreshState=R.useState(0),round=refreshState[0],setRound=refreshState[1];
    R.useEffect(function(){
      if(!permitido(props.codigo))return;estilos();var alive=true,ctrl=new AbortController(),timer=setTimeout(function(){ctrl.abort();},14000);
      setMessage("Cargando productos públicos de iClap…");
      cargar(props.codigo,ctrl.signal).then(function(p){if(alive){setProducts(p);setMessage("");}}).catch(function(){if(alive)setMessage("No se pudo cargar iClap. La selección guardada no se modificó.");}).finally(function(){clearTimeout(timer);});
      return function(){alive=false;ctrl.abort();clearTimeout(timer);};
    },[props.codigo,round]);
    if(!permitido(props.codigo))return null;
    function change(patch){props.onChange(Object.assign({},c,patch));}
    var results=products.filter(function(p){return !q||[p.model,p.specs,p.category,p.sku].join(" ").toLowerCase().includes(q.toLowerCase());});
    return h("section",{className:"ic-editor",style:props.style},h("h3",null,"📱 iClap · Tecnología"),
      h("p",null,"Exclusivo de la empresa 1122. Misma selección en tienda y catálogo en vivo. No modifica stock, pedidos ni precios de la distribuidora."),
      h("label",{className:"ic-check"},h("input",{type:"checkbox",checked:c.enabled,onChange:function(e){change({enabled:e.target.checked});}}),"Mostrar apartado iClap"),
      h("label",null,"Productos a publicar",h("select",{"aria-label":"Productos a publicar de iClap",value:c.mode,onChange:function(e){change({mode:e.target.value});}},h("option",{value:"all"},"Todos los publicados en iClap"),h("option",{value:"selected"},"Elegir productos manualmente"))),
      h("p",null,c.mode==="all"?"Los nuevos productos publicados en iClap también aparecerán automáticamente.":c.skus.length+" producto(s) seleccionado(s). Los nuevos no se agregan solos."),
      h("div",{className:"ic-toolbar"},h("input",{type:"search","aria-label":"Buscar productos iClap para publicar",placeholder:"Buscar modelo o código…",value:q,onChange:function(e){setQ(e.target.value);}}),h("button",{type:"button",onClick:function(){setRound(round+1);}},"Recargar lista iClap")),
      message&&h("p",{role:"status"},message),
      c.mode==="selected"&&h("div",{className:"ic-picker"},results.map(function(p){return h("label",{key:p.sku,className:"ic-check"},h("input",{type:"checkbox",checked:c.skus.includes(p.sku),onChange:function(e){change({skus:e.target.checked?c.skus.concat([p.sku]):c.skus.filter(function(s){return s!==p.sku;})});}}),h("span",null,h("b",null,p.model),h("small",null,[p.specs,p.category,labels[p.availability]].filter(Boolean).join(" · "))));})),
      h("p",null,"Se aplica con el botón Guardar de la tienda. Podés usar vista previa y descartar sin publicar."));
  }
  var panelDispose=null;
  function panelCerrar(){if(panelDispose)panelDispose();panelDispose=null;}
  function panelAbrir(){
    panelCerrar();var host=root.document.getElementById("cv-iclap");if(!host)return;
    var emp=root.empresaData,codigo=emp&&emp.codigo,id=root._sbEmpId;
    panelDispose=mount(host,{codigo:codigo,getConfig:async function(){
      if(!id)throw new Error("Empresa sin sesión");
      var rows=await root.sbFetch("GET","/rest/v1/tienda_config?select=config&empresa_id=eq."+encodeURIComponent(id));
      if(!Array.isArray(rows))throw new Error("Configuración no disponible");
      return rows[0]&&rows[0].config&&rows[0].config.iclap;
    },isValid:function(){return root._sbEmpId===id&&permitido(root.empresaData&&root.empresaData.codigo)&&root.document.getElementById("catalogo-vivo").style.display!=="none";}});
  }
  return {permitido:permitido,config:config,normalizar:normalizar,seleccion:seleccion,cargar:cargar,mount:mount,Section:Section,Editor:Editor,panelAbrir:panelAbrir,panelCerrar:panelCerrar,origen:ORIGIN};
});
