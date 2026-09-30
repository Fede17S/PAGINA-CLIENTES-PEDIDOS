const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(process.argv[2] || (fs.existsSync("PANEL-index_15.html")?"PANEL-index_15.html":"index.html"), "utf8");
const start = src.indexOf("function _esConflictoPedidoRuta");
const end = src.indexOf("async function _replayOfflineOp", start);
if (start < 0 || end < 0) throw new Error("No se encontró el bloque de movimiento seguro");

function build(overrides = {}) {
  const calls = { get: [], patch: [], del: [], secureDel: [], insert: [] };
  const ctx = {
    console,
    _sbEmpId: "empresa-1",
    encodeURIComponent,
    Date,
    String,
    Array,
    Object,
    RegExp,
    _sbGetRaw: async (_table, query) => {
      calls.get.push(query);
      return [];
    },
    sbPatch: async (table, match, body) => {
      calls.patch.push({ table, match, body });
      return [{ id: table === "ruta_clientes" ? "rc-1" : "pedido-1" }];
    },
    _sbLimpiarDuplicadoRuta: async (cliente, canonica) => {
      calls.secureDel.push({ cliente, canonica });
      return { ok: true };
    },
    _sbInsertRutaCli: async (ruta, cli) => {
      calls.insert.push({ ruta, cli });
      return "rc-nueva";
    },
    ...overrides,
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end), ctx);
  return { ctx, calls };
}

(async () => {
  // Caso normal: la fila existe. Debe hacer PATCH, nunca INSERT+DELETE.
  {
    const { ctx, calls } = build({
      _sbGetRaw: async (_table, query) => {
        calls.get.push(query);
        if (query.includes("id=eq.rc-1")) {
          return [{ id: "rc-1", ruta_id: "ruta-vieja", pedido_id: "pedido-1", audit_log: [] }];
        }
        return [];
      },
    });
    const id = await ctx._moverRutaClienteServidor(
      { src: "ruta-vieja", srcCli: "rc-1", dst: "ruta-nueva", cli: { pedidoId: "pedido-1" } },
      { id: "op-1", ts: "2026-08-04T12:00:00Z" }
    );
    if (id !== "rc-1") throw new Error("El movimiento cambió el ID de la parada");
    if (calls.insert.length || calls.del.length) throw new Error("El movimiento normal insertó o borró filas");
    const routePatch = calls.patch.find((x) => x.table === "ruta_clientes");
    if (!routePatch || routePatch.body.ruta_id !== "ruta-nueva") throw new Error("No actualizó ruta_id");
    const backupPatch = calls.patch.find((x) => x.table === "backup_pedidos");
    if (!backupPatch || backupPatch.body.ruta_vinculada_id !== "ruta-nueva") throw new Error("No sincronizó Backup Pedidos");
  }

  // Carrera entre dispositivos: si el PATCH choca con la clave única, toma la
  // fila ganadora, completa el movimiento y limpia únicamente la copia vieja.
  {
    let routePatches = 0;
    const calls = { get: [], patch: [], del: [], secureDel: [], insert: [] };
    const { ctx } = build({
      _sbGetRaw: async (_table, query) => {
        calls.get.push(query);
        if (query.includes("id=eq.rc-vieja")) {
          return [{ id: "rc-vieja", ruta_id: "ruta-vieja", pedido_id: null, audit_log: [] }];
        }
        if (query.includes("pedido_id=eq.pedido-2")) {
          return [{ id: "rc-ganadora", ruta_id: "otra-ruta", pedido_id: "pedido-2", audit_log: [] }];
        }
        return [];
      },
      sbPatch: async (table, match, body) => {
        calls.patch.push({ table, match, body });
        if (table === "ruta_clientes" && routePatches++ === 0) {
          throw new Error('duplicate key value violates unique constraint "ruta_clientes_empresa_pedido_uidx"');
        }
        return [{ id: table === "ruta_clientes" ? "rc-ganadora" : "pedido-2" }];
      },
      _sbLimpiarDuplicadoRuta: async (cliente, canonica) => {
        calls.secureDel.push({ cliente, canonica });
        return { ok: true };
      },
    });
    const id = await ctx._moverRutaClienteServidor(
      { src: "ruta-vieja", srcCli: "rc-vieja", dst: "ruta-final", cli: { pedidoId: "pedido-2" } },
      { id: "op-2" }
    );
    if (id !== "rc-ganadora") throw new Error("No recuperó la fila ganadora");
    if (!calls.secureDel.some((x) => x.cliente === "rc-vieja" && x.canonica === "rc-ganadora")) {
      throw new Error("No delegó la limpieza exacta al servidor");
    }
  }

  console.log("Movimiento de rutas: replay idempotente y autorreparación OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
