/* Cálculo compartido de recaudación. No escribe cobros, stock ni asientos. */
(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;else root.RecaudacionRuta=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  var tz=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"});
  function cent(v){var n=Number(v);return Number.isFinite(n)?Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*100):0;}
  function texto(v){return v==null?"":String(v).trim();}
  function lista(v){return Array.isArray(v)?v:[];}
  function dia(v){
    var s=texto(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    var d=new Date(s);if(!s||!Number.isFinite(d.getTime()))return "";
    var p={};tz.formatToParts(d).forEach(function(t){p[t.type]=t.value;});
    return p.year+"-"+p.month+"-"+p.day;
  }
  function medio(s){
    s=texto(s).toLowerCase();
    return s.indexOf("efec")>=0?"efectivo":s.indexOf("transf")>=0?"transferencia":"otros";
  }
  function definitivo(c){return !!(c&&c.rechazado===true&&(c.rechazoConfirmado===true||c.rechazo_confirmado===true));}
  function descuento(c){
    if(definitivo(c))return 0;
    var vistos=new Set();
    return lista(c&&c.devoluciones).reduce(function(s,n){
      if(!n||(n.estado||"aplicada")!=="aplicada")return s;
      if(n.motivo==="rotura"||!(n.descuenta===undefined?(n.motivo==="devolucion"||n.motivo==="faltante"):n.descuenta===true))return s;
      var id=texto(n.id);if(id&&vistos.has(id))return s;if(id)vistos.add(id);
      return s+Math.max(0,cent(n.monto));
    },0);
  }
  function pagos(c,fechas){
    c=c||{};
    var ad=lista(c.pagosAdicionales||c.pagos_adicionales), origen=new Map(), vistos=new Set(), out=[];
    var entrega=fechas?dia(c.entregadoEn||c.entregado_en):"", anterior=fechas?dia(c.fecha):"";
    function put(forma,monto,fecha,referencia){
      if(!monto)return;
      var registrado=fechas?dia(fecha):"";
      out.push({medio:forma,cent:monto,dia:registrado||entrega||anterior,estimado:!!fechas&&!registrado,adicional:referencia});
    }
    put("efectivo",cent(c.efectivo),c.entregadoEn||c.entregado_en,false);
    put("transferencia",cent(c.transferencia),c.entregadoEn||c.entregado_en,false);
    ad.forEach(function(p){
      if(!p||!p.cc_op_id||p.revierte||cent(p.monto)<=0)return;
      origen.set(String(p.cc_op_id),medio(p.forma||p.modo));
    });
    ad.forEach(function(p){
      if(!p)return;
      var clave=texto(p.cc_op_id);
      if(clave&&vistos.has(clave))return; // El mismo pago aplicado una vez a esta parada.
      var m=cent(p.monto);if(!m)return;
      if(clave)vistos.add(clave);
      var f=origen.get(texto(p.revierte))||medio(p.forma||p.modo);
      put(f,m,p.fecha,true);
    });
    return out;
  }
  function resumenVacio(){return {efectivo:0,transferencia:0,otros:0,cobrado:0,excluido:0,estimado:0,sinFecha:0};}
  function sumar(r,p){
    r[p.medio]+=p.cent;r.cobrado+=p.cent;
    if(!p.dia)r.sinFecha+=p.cent;else if(p.estimado)r.estimado+=p.cent;
  }
  function parada(c,importe){
    c=c||{};
    var cartera=resumenVacio(), carteraBruta=resumenVacio(), rech=definitivo(c), notas=descuento(c), ad=0;
    pagos(c,false).forEach(function(p){sumar(carteraBruta,p);if(p.adicional)ad+=p.cent;});
    if(!rech)cartera=carteraBruta;else cartera.excluido=carteraBruta.cobrado;
    var total=rech?0:Math.max(0,cent(importe==null?c.importe:importe)-notas);
    return {total:total,desc:notas,ef:cent(c.efectivo),tr:cent(c.transferencia),ad:ad,
      cobrado:cartera.cobrado,efectivo:cartera.efectivo,transferencia:cartera.transferencia,otros:cartera.otros,
      saldo:total-cartera.cobrado,excluido:cartera.excluido,definitivo:rech};
  }
  // El mes de la hoja compara con la vista de HR. El mes de cobro no toma
  // la fecha de creación como si fuera un pago reciente. Para el cobro base
  // sólo existe fecha de entrega; si falta, se informa que es estimada.
  function periodo(filas,mes,porHoja){
    var r=resumenVacio(), detalle=new Map(), refs=new Map(), ids=new Set();
    lista(filas).forEach(function(c){
      if(!c||!c.id||ids.has(String(c.id)))return;ids.add(String(c.id));
      var ruta=(Array.isArray(c.ruta)?c.ruta[0]:c.ruta)||{}, mesRuta=dia(ruta.fecha).slice(0,7);
      if(porHoja&&mesRuta!==mes)return;
      var medioRuta=detalle.get(c.ruta_id)||{id:c.ruta_id, nombre:ruta.hr_num||ruta.nombre||"Hoja de ruta", cobrado:0, excluido:0};
      var rech=definitivo(c), ps=pagos(c,!porHoja);
      var porParada=resumenVacio();
      ps.forEach(function(p){
        if(!porHoja&&p.dia.slice(0,7)!==mes){
          if(!p.dia&&!rech)r.sinFecha+=p.cent;
          return;
        }
        if(rech){r.excluido+=p.cent;medioRuta.excluido+=p.cent;return;}
        sumar(porParada,p);sumar(r,p);medioRuta.cobrado+=p.cent;
      });
      if(porHoja) refs.set(String(c.id),porParada);
      if(medioRuta.cobrado||medioRuta.excluido)detalle.set(c.ruta_id,medioRuta);
    });
    r.detalle=Array.from(detalle.values()).sort(function(a,b){return String(a.nombre).localeCompare(String(b.nombre),"es",{numeric:true});});
    r.refs=refs;
    return r;
  }
  function conciliar(res,movs){
    var asentado=0, diferencias=0, faltante=0, exceso=0, refsActivas=new Map(), rev=0;
    lista(movs).forEach(function(m){
      if(!m||m.anulado||m.tipo!=="ingreso"||m.origen!=="venta")return;
      var k=/^venta:([^:]+):(ef|tr)$/.exec(texto(m.ref_pedido));
      if(!k||!res.refs.has(k[1]))return;
      var g=refsActivas.get(m.ref_pedido)||{cent:0,n:0};g.cent+=Number(m.monto_cent)||0;g.n++;
      refsActivas.set(m.ref_pedido,g);
    });
    res.refs.forEach(function(p,id){
      [["ef","efectivo"],["tr","transferencia"]].forEach(function(par){
        var g=refsActivas.get("venta:"+id+":"+par[0])||{cent:0,n:0};
        var delta=p[par[1]]-g.cent;
        asentado+=g.cent;if(delta)diferencias++;if(g.n>1)rev++;
        faltante+=Math.max(0,delta);exceso+=Math.max(0,-delta);
      });
    });
    return {asentado:asentado,diferencia:faltante-exceso,faltante:faltante,exceso:exceso,referencias:diferencias,repetidas:rev};
  }
  function mesEntrega(c){return dia(c.entregadoEn||c.entregado_en||c.fecha).slice(0,7);}
  return {cent:cent,dia:dia,definitivo:definitivo,descuento:descuento,pagos:pagos,parada:parada,periodo:periodo,conciliar:conciliar,mesEntrega:mesEntrega};
});
