// Exercise scalar math extracted from the installed SDK's shipped GLSL.
// This reproduces NaN propagation, not GPU rendering or image quality.
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const bundle = readFileSync('node_modules/@navaramap/three/dist/index.js', 'utf8');
const literal = [...bundle.matchAll(/"(?:[^"\\]|\\.)*"/g)]
  .find(([s]) => s.includes('float normalizeElevationHeight('));
assert.ok(literal, 'installed SDK elevation shader found');
const shader = JSON.parse(literal[0]);
const functions = ['nvr_branchFreeTernary', 'pseudoLog', 'normalizeElevationHeight'].map(name => {
  const match = shader.match(new RegExp(`float ${name}\\([^)]*\\)\\s*\\{[^}]*\\}`));
  assert.ok(match, `SDK scalar function ${name} found`);
  return match[0].replace(/^float /, 'function ')
    .replace(/\b(?:float|bool) (\w+)(?=\s*[,\)])/g, '$1')
    .replace(/\bfloat\(/g, 'Number(')
    .replace(/\bfloat /g, 'let ');
}).join('\n');
function normalize(boundary, height) {
  return vm.runInNewContext(`${functions}\nnormalizeElevationHeight(height)`, {
    uLogBoundary: boundary, uLogBase: Math.log(boundary), uLogarithmic: false,
    uElevationMinMaxHeightAndBoundary: { x: -5, y: 60 }, height,
    Number, log: Math.log, clamp: (x, low, high) => Math.min(high, Math.max(low, x)),
  });
}
for (const height of [-5, 0, 3.8, 35.7, 56.3, 60]) {
  assert.ok(Number.isNaN(normalize(undefined, height)), 'omitted boundary poisons even linear mode');
  const actual = normalize(10, height);
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - (height + 5) / 65) < 1e-12, 'fixed linear ramp preserved');
}
assert.ok(Number.isNaN(normalize(0, 0)), 'zero boundary poisons the sea-level sample');
console.log('PASS terra SDK shader scalar math: NaN reproduction and finite linear elevation ramp');
