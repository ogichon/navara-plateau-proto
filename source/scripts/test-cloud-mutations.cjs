// Run the behavior suite against isolated source mutants; never edit the worktree.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/awakening.ts', 'utf8');
const mutations = [
  ...[
    ['all phases', '0xd8a878'],
    ['Before', 'phase === "before" ? 0xd8a878 : 0xffffff'],
    ['After', 'phase === "after" ? 0xa5b6da : 0xffffff'],
    ['wave', 'phase === "wave" ? 0xb1ced2 : 0xffffff'],
    ...['cyberpunk', 'gold', 'holographic'].map(look => [look, `direction === "${look}" && phase !== "before" ? 0xe4c99f : 0xffffff`]),
  ].map(([name, color]) => [`photo color ${name}`, 'color: new Color().setHex(0xffffff),\n    opacity: 1,', `color: new Color().setHex(${color}),\n    opacity: 1,`]),
  ['photo complete override', '    setStatus(`${place.label} / ${state}`);', '    if (phase === "complete") photoLayer.update({ raster: { color: new Color().setHex(0xe4c99f), opacity: 1 } } as any);\n    setStatus(`${place.label} / ${state}`);'],
  ['photo opacity', 'color: new Color().setHex(0xffffff),\n    opacity: 1,', 'color: new Color().setHex(0xffffff),\n    opacity: 0.5,'],
  ['photo toggle restored', '  const cloudButton =', '  const photoButton = document.createElement("button"); photoButton.id = "basemap-check"; document.getElementById("capture")!.insertAdjacentElement("afterend", photoButton);\n  const cloudButton ='],
  ['photo status restored', '${place.label} / ${state}', '${place.label} / ${state} / ベースマップ確認中'],
  ['default OFF', 'get("clouds") !== "off"', 'get("clouds") === "off"'],
  ['pass left running', 'clouds.visible = false;', 'clouds.visible = true;'],
  ...['overlay', 'shadow', 'shadowLength'].flatMap(key => [
    [`${key} retained OFF`, `atmosphere.${key}.value = null;`, ''],
    [`${key} not restored ON`, `atmosphere.${key}.value = cloudOutputs.${key};`, ''],
  ]),
  ['shadow enable retained', 'atmosphere.enableShadows.value = false;', ''],
  ['shadow enable not restored', 'atmosphere.enableShadows.value = cloudOutputs.enableShadows;', ''],
  ['pass not restarted', 'clouds.visible = true;', 'clouds.visible = false;'],
  ['grade resets toggle', 'const grade = (before: boolean) => {', 'const grade = (before: boolean) => { cloudsEnabled = true; applyClouds(); reportClouds();'],
  ['place loses toggle', '${cloudsEnabled ? "" : "&clouds=off"}', ''],
];
const vm = require('node:vm');
const harness = fs.readFileSync('scripts/test-awakening.cjs', 'utf8')
  .replace('(async () => { for (const place', 'globalThis.result = (async () => { for (const place')
  .replace('.catch(error => { console.error(error); process.exitCode = 1; });', ';');
const run = async text => {
  const context = vm.createContext({
    require: name => name === 'node:fs' ? { readFileSync: () => text } : require(name),
    console: { log() {}, warn() {}, error() {} }, setImmediate, URLSearchParams,
  });
  vm.runInContext(harness, context);
  await context.result;
};
(async () => {
  await run(source);
  for (const [name, from, to] of mutations) {
    assert.ok(source.includes(from), `mutation target exists: ${name}`);
    await assert.rejects(run(source.replace(from, to)), { name: 'AssertionError' }, `surviving mutant: ${name}`);
  }
  console.log(`PASS photo/cloud mutations: ${mutations.length}/${mutations.length} rejected by behavioral assertions`);
})().catch(error => { console.error(error); process.exitCode = 1; });
