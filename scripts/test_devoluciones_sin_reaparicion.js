const fs = require("fs");
const vm = require("vm");

const path = process.argv[2] || "PANEL-index_15.html";
const src = fs.readFileSync(path, "utf8");
const start = src.indexOf("function _devClone");
const end = src.indexOf("function _devAbrir", start);
if (start < 0 || end < 0) throw new Error("No se encontró el motor de sincronización de devoluciones");

let patchBody = null;
const ctx = {
  window:{RepartoRevision:{}}, // motor legado: sus fusiones se conservan para colas antiguas
  console,
  JSON,
  Date,
  Math,
  String,
  Array,
  Object,
  RegExp,
  encodeURIComponent,
  _sbEmpId: "empresa-1",
  _devEstado: (d) => (d && d.estado) || "aplicada",
  _sbGetRaw: async () => [{
    id: "cliente-1",
    rechazo_confirmado: true,
    devoluciones: [{
      id: "nota-1",
      estado: "notificada",
      actualizadoEn: "2026-07-30T10:00:00Z",
      historial: [{ accion: "notificada", ts: "2026-07-30T10:00:00Z" }],
    }],
  }],
  sbPatch: async (_table, _match, body) => {
    patchBody = body;
    return [{ id: "cliente-1", devoluciones: body.devoluciones }];
  },
};
vm.createContext(ctx);
vm.runInContext(src.slice(start, end), ctx);

// Una lectura vieja "notificada" no puede revivir una resolución más nueva.
const remota = {
  id: "nota-a",
  estado: "rechazada",
  actualizadoEn: "2026-08-10T12:01:00Z",
  historial: [{ accion: "rechazada", ts: "2026-08-10T12:01:00Z" }],
};
const vieja = {
  id: "nota-a",
  estado: "notificada",
  actualizadoEn: "2026-08-10T12:00:00Z",
  historial: [{ accion: "notificada", ts: "2026-08-10T12:00:00Z" }],
};
const fusion = ctx._devAplicarOperacionLista([remota], {
  action: "upsert",
  noteKey: ctx._devClaveNota(vieja),
  note: vieja,
});
if (fusion[0].estado !== "rechazada") throw new Error("Una nota rechazada volvió a notificada");

// Quitar una nota no puede borrar ni modificar las otras.
const restante = ctx._devAplicarOperacionLista(
  [{ id: "nota-a" }, { id: "nota-b", estado: "notificada" }],
  { action: "remove", noteKey: "id:nota-a" }
);
if (restante.length !== 1 || restante[0].id !== "nota-b") throw new Error("El borrado por nota afectó otros registros");

(async () => {
  // Si el pedido completo ya fue rechazado, el servidor fuerza el cierre de la
  // nota y neutraliza su flag de stock aunque llegue una operación vieja.
  await ctx._devReplayNota({
    cliId: "cliente-1",
    action: "upsert",
    noteKey: "id:nota-1",
    note: {
      id: "nota-1",
      estado: "aplicada",
      stkDev: true,
      actualizadoEn: "2026-08-10T12:02:00Z",
      historial: [{ accion: "aplicada", ts: "2026-08-10T12:02:00Z" }],
    },
  });
  const cerrada = patchBody && patchBody.devoluciones && patchBody.devoluciones[0];
  if (!cerrada || cerrada.estado !== "rechazada" || cerrada.stkDev !== false || !cerrada.stockAbsorbidoPorRechazo) {
    throw new Error("Una nota pudo reactivarse dentro de un pedido ya rechazado");
  }

  const required = [
    ["cola por nota", /_enqueue\("DEV_NOTE"/],
    ["replay por nota", /op\.method==="DEV_NOTE"/],
    ["purga de delete temporal", /id_temporal_invalido/],
    ["referencia estable al aplicar", /"-aplicar-"\+_ncCantidadAccion/],
    ["referencia estable al revertir", /"-revertir-"\+accion/],
    ["pedido completo cierra notas", /stockAbsorbidoPorRechazo=true/],
  ];
  const failed = required.filter(([, re]) => !re.test(src));
  if (failed.length) throw new Error("Faltan blindajes: " + failed.map(([name]) => name).join(", "));

  console.log("Devoluciones: persistencia, cola e idempotencia de stock OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
