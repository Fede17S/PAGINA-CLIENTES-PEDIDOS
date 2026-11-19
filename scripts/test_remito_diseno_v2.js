const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const panelPath=fs.existsSync('PANEL-index_15.html')?'PANEL-index_15.html':'index.html';
const panel=fs.readFileSync(panelPath,'utf8'),moduleCode=fs.readFileSync('remito-diseno-v2.js','utf8');
const events={},writes=[],alerts=[];
const saved={A:{minRows:0,fontEmpresa:12,color:'#112233',extraCompat:'conservar'},B:{version:2,minRows:5,color:'#445566'}};
const document={getElementById:()=>null,querySelectorAll:()=>[]};
let getFailure=false;
const ctx={console,URL,Blob,document,setTimeout,clearTimeout,_sbEmpId:'A',_pdfConfig:{},empresaData:{_config:{}},
 currentUser:{role:'admin'},showNotif:s=>alerts.push(s),
 sbGet:async(table,query)=>{assert.equal(table,'empresas_config');if(getFailure)throw Error('offline');const emp=query.split('eq.')[1];return [{pdf_config:saved[emp]}];},
 sbUpsert:async(table,row)=>{assert.equal(table,'empresas_config');writes.push(row);saved[row.empresa_id]=JSON.parse(JSON.stringify(row.pdf_config));},
 addEventListener:(k,v)=>events[k]=v,confirm:()=>true};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(moduleCode,ctx);
const api=ctx.RemitoDisenoV2;
assert.equal(api.normalize({minRows:0}).minRows,0);
assert.equal(api.normalize({minRows:''}).minRows,15);
assert.equal(api.normalize({minRows:-10}).minRows,0);
assert.equal(api.normalize({minRows:100}).minRows,40);
assert.equal(api.normalize({fontEmpresa:100}).fontEmpresa,18);
assert.equal(api.normalize({fontTabla:0}).fontTabla,7);
assert.equal(api.normalize({color:'<script>',logoPos:'x'}).color,'#233f8d');
assert.equal(api.normalize({blancoNegro:null}).blancoNegro,false);
assert.equal(api.normalize({showLogo:false}).showLogo,false);
(async()=>{
 await api.ensure();assert.equal(api.configGuardada().minRows,0);assert.equal(api.configGuardada().version,1);
 await api.save();assert.equal(writes.length,1);assert.equal(saved.A.version,2);
 assert.equal(saved.A.extraCompat,'conservar');assert.equal(saved.A.disenoAnterior.fontEmpresa,12);
 // Detectar cambios de otro administrador antes de sobrescribir.
 saved.A.color='#abcdef';await api.save();assert.equal(writes.length,1);
 assert.ok(alerts.some(s=>s.includes('Otro administrador')));
 ctx._sbEmpId='B';ctx.empresaData={_config:{}};await api.ensure();
 assert.equal(api.configGuardada().color,'#445566');
 ctx.currentUser={role:'vendedor'};await api.save();assert.equal(writes.length,1);
 ctx._sbEmpId='C';ctx.empresaData={_config:{}};ctx.currentUser={role:'admin'};getFailure=true;
 assert.equal(await api.ensure(),false);await api.save();assert.equal(writes.length,1,'No guardar si no se cargó la configuración');
 // Lectura lenta de empresa anterior no contamina la actual.
 getFailure=false;let finishA;
 ctx._sbEmpId='D';ctx.sbGet=()=>new Promise(resolve=>finishA=resolve);const loadingA=api.ensure();
 ctx._sbEmpId='E';ctx.sbGet=async()=>[{pdf_config:{version:2,color:'#770077'}}];await api.ensure();
 finishA([{pdf_config:{version:2,color:'#009900'}}]);await loadingA;
 assert.equal(api.configGuardada().color,'#770077');
 assert.ok(panel.includes('await window.RemitoDisenoV2.ensure()'));
 assert.ok(panel.includes('doc=window.RemitoDisenoV2.crear(window.RemitoDisenoV2.modelo(bk'));
 assert.ok(panel.includes('window.RemitoDisenoV2.draw(doc,window.RemitoDisenoV2.modelo(cli'));
 assert.ok(panel.includes('var _calcDiseno={items:ordenes[t]'));
 assert.ok(!/sb(?:Post|Patch|Upsert|Del)\(['"](?:stock|backup_pedidos|ventas|rutas)/.test(moduleCode));
 console.log('Diseño remitos: compatibilidad, límites, guardado aislado, permisos, conflictos, fallos y carreras OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
