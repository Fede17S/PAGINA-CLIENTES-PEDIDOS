const fs = require("fs");
const vm = require("vm");

const panelPath = fs.existsSync("PANEL-index_15.html") ? "PANEL-index_15.html" : "index.html";
const html = fs.readFileSync(panelPath, "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .map((match) => match[2]);

const errors = [];
scripts.forEach((source, index) => {
  try {
    new vm.Script(source, { filename: `inline-script-${index + 1}.js` });
  } catch (error) {
    errors.push(error.message);
  }
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`${scripts.length} scripts inline: sintaxis OK`);
