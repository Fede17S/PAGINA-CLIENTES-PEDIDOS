/* Sólo prepara el destinatario de WhatsApp; no modifica fichas ni envía mensajes. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WhatsAppTelefono=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function numero(valor){
    var s=String(valor==null?'':valor).trim();
    if(!s||!/^\+?[\d\s().-]+$/.test(s))return '';
    var n=s.replace(/\D/g,''),internacional=s[0]==='+'||n.indexOf('00')===0;
    if(n.indexOf('00')===0)n=n.slice(2);
    // Otros países requieren prefijo explícito, nunca se les agrega Argentina.
    if(internacional&&n.indexOf('54')!==0)return /^[1-9]\d{7,14}$/.test(n)?n:'';
    if(n.indexOf('54')===0&&(internacional||n.length>=12))n=n.slice(2);
    n=n.replace(/^0/,'');
    if(n.length===11&&n[0]==='9')n=n.slice(1);
    if(n.length===12&&n.indexOf('15')===0)n=n.slice(2);
    // Formato nacional: 0 + característica (2, 3 o 4 dígitos) + 15 + abonado.
    if(n.length===12){
      var candidatos=[];
      [2,3,4].forEach(function(k){var area=n.slice(0,k);if(n.slice(k,k+2)==='15'&&(area==='11'||/^[23]\d{2,3}$/.test(area)))candidatos.push(area+n.slice(k+2));});
      if(candidatos.length!==1)return '';
      n=candidatos[0];
    }
    return /^[1-9]\d{9}$/.test(n)?'549'+n:'';
  }
  return {numero:numero};
});
