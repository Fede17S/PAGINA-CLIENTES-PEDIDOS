/* Geometría del panel y portal del consolidado. Sin datos ni operaciones de negocio. */
(function(root,factory){var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.PanelViewport=api;api.iniciar();}})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  function valor(v){v=Number(v);return Number.isFinite(v)&&v>=0?v:0;}
  function insets(info){
    var m=info.medidos||{},s={top:valor(m.top),right:valor(m.right),bottom:valor(m.bottom),left:valor(m.left)};
    if(s.top||s.right||s.bottom||s.left)return s;
    // Safari normal ya reserva su barra de sistema: no sumar otra por el tamaño del iPhone.
    if(!(info.nativo||info.standalone))return s;
    if(info.iphone&&info.screenMax>=812){
      if(info.width>info.height){s.left=47;s.right=47;s.bottom=21;}
      else{s.top=info.screenMax>=850?59:47;s.bottom=34;}
    }else if(info.nativo&&info.android)s.top=28; // Respaldo del WebView nativo que no informa env().
    return s;
  }
  var started=false,frame=0,probe=null,modal=null,observer=null,prevFocus=null,overflow=null,open=false;
  function actualizar(){
    if(!root.document||!root.document.body)return;
    if(!probe){probe=root.document.createElement('div');probe.id='panel-safe-area-probe';probe.setAttribute('aria-hidden','true');probe.style.cssText='position:fixed;inset:0 auto auto 0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';root.document.body.appendChild(probe);}
    var cs=root.getComputedStyle(probe),ua=root.navigator.userAgent||'',v=root.visualViewport,w=valor(root.innerWidth),h=valor(root.innerHeight);
    var nativo=!!(root.Capacitor&&typeof root.Capacitor.isNativePlatform==='function'&&root.Capacitor.isNativePlatform());
    var standalone=!!root.navigator.standalone||!!(root.matchMedia&&root.matchMedia('(display-mode: standalone)').matches);
    var safe=insets({medidos:{top:parseFloat(cs.paddingTop),right:parseFloat(cs.paddingRight),bottom:parseFloat(cs.paddingBottom),left:parseFloat(cs.paddingLeft)},
      nativo:nativo,standalone:standalone,iphone:/iPhone|iPod/.test(ua),android:/Android/.test(ua),width:w,height:h,screenMax:Math.max(root.screen&&root.screen.width||0,root.screen&&root.screen.height||0)});
    var style=root.document.documentElement.style;
    Object.keys(safe).forEach(function(k){style.setProperty('--safe-'+k,safe[k]+'px');});
    var top=v?valor(v.offsetTop):0,left=v?valor(v.offsetLeft):0,width=v?valor(v.width):w,height=v?valor(v.height):h;
    if(!width)width=w;if(!height)height=h;
    style.setProperty('--panel-vv-top',top+'px');style.setProperty('--panel-vv-left',left+'px');style.setProperty('--panel-vv-width',width+'px');style.setProperty('--panel-vv-height',height+'px');
    style.setProperty('--modal-safe-top',Math.max(0,safe.top-top)+'px');style.setProperty('--modal-safe-left',Math.max(0,safe.left-left)+'px');
    style.setProperty('--modal-safe-right',Math.max(0,safe.right-Math.max(0,w-width-left))+'px');
    style.setProperty('--modal-safe-bottom',Math.max(0,safe.bottom-Math.max(0,h-height-top))+'px');
  }
  function programar(){if(frame)return;frame=root.requestAnimationFrame(function(){frame=0;actualizar();});}
  function sincronizarModal(){
    if(!modal)return;var visible=modal.classList.contains('open');
    root.document.body.classList.toggle('pp-modal-open',visible);
    if(visible&&!open){open=true;prevFocus=root.document.activeElement;overflow=root.document.body.style.overflow;root.document.body.style.overflow='hidden';actualizar();
      root.requestAnimationFrame(function(){if(modal.classList.contains('open'))modal.querySelector('.modal-cls').focus({preventScroll:true});});
    }else if(!visible&&open){open=false;if(overflow!==null)root.document.body.style.overflow=overflow;overflow=null;
      if(prevFocus&&prevFocus.isConnected)try{prevFocus.focus({preventScroll:true});}catch(e){}prevFocus=null;
    }
  }
  function prepararConsolidado(){
    var next=root.document.getElementById('modal-consol-sel');if(!next)return;
    // Evitar el stacking context del main fijo (header y FAB estaban por encima).
    if(next.parentNode!==root.document.body)root.document.body.appendChild(next);
    if(modal===next){sincronizarModal();return;}modal=next;
    if(observer)observer.disconnect();observer=new root.MutationObserver(sincronizarModal);observer.observe(modal,{attributes:true,attributeFilter:['class']});
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','consol-sel-titulo');
    modal.addEventListener('keydown',function(e){
      if(root.document.getElementById('pp-wa-selector'))return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();modal.classList.remove('open');sincronizarModal();}
      if(e.key==='Tab'){
        var focusables=Array.from(modal.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')).filter(function(el){return el.getClientRects().length;});
        if(!focusables.length)return;var first=focusables[0],last=focusables[focusables.length-1];
        if(e.shiftKey&&root.document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&root.document.activeElement===last){e.preventDefault();first.focus();}
      }
    });sincronizarModal();
  }
  function iniciar(){
    if(started)return;started=true;
    root.addEventListener('resize',programar);root.addEventListener('orientationchange',programar);
    if(root.visualViewport){root.visualViewport.addEventListener('resize',programar);root.visualViewport.addEventListener('scroll',programar);}
    actualizar();if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',function(){actualizar();prepararConsolidado();},{once:true});else prepararConsolidado();
    root.setTimeout(actualizar,500); // Capacitor puede inyectarse después del primer script.
  }
  return {insets:insets,actualizar:actualizar,prepararConsolidado:prepararConsolidado,iniciar:iniciar};
});
