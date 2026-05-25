#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function usage() {
  console.log([
    'Usage:',
    '  node scripts/ai-sync/check-visual-anchor-package.js <project_dir>',
    '',
    'Checks <project_dir>/06-prototype-visual handoff state for Claude Code <-> Codex.',
    '',
    'Exit codes:',
    '  0  ready, partial-soft, failed-soft, or no-package-soft',
    '  1  invalid package or missing required files',
    '  2  strict gate requires Codex visual-anchor generation before HTML prototype',
  ].join('\n'));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { __error: err.message };
  }
}

function exists(file) {
  return fs.existsSync(file);
}

function rel(base, file) {
  return path.relative(base, file) || '.';
}

function fail(message, details = []) {
  console.log(`STATUS: invalid`);
  console.log(`NEXT_ACTION: fix visual anchor package`);
  console.log(`MESSAGE: ${message}`);
  details.forEach(d => console.log(`- ${d}`));
  process.exit(1);
}

const projectDir = process.argv[2];
if (!projectDir || projectDir === '-h' || projectDir === '--help') {
  usage();
  process.exit(projectDir ? 0 : 1);
}

const root = path.resolve(projectDir);
const visualDir = path.join(root, '06-prototype-visual');
const requestPath = path.join(visualDir, 'request.json');
const manifestPath = path.join(visualDir, 'manifest.json');

if (!exists(visualDir)) {
  console.log('STATUS: no-package');
  console.log('GATE_MODE: soft');
  console.log('NEXT_ACTION: continue normal HTML prototype; note visual consistency risk in audit');
  process.exit(0);
}

const request = exists(requestPath) ? readJson(requestPath) : null;
if (request && request.__error) {
  fail(`request.json is not valid JSON: ${request.__error}`);
}

const gateMode = request && request.gateMode === 'strict' ? 'strict' : 'soft';

if (!exists(manifestPath)) {
  console.log('STATUS: request-only');
  console.log(`GATE_MODE: ${gateMode}`);
  if (request) {
    console.log(`REQUEST: ${rel(root, requestPath)}`);
    console.log(`REQUIRED_RUNTIME: ${request.requiredRuntime || 'unknown'}`);
    console.log(`FLOW_MODE: ${request.flowMode || 'unknown'}`);
    const pages = Array.isArray(request.pages) ? request.pages.length : 0;
    console.log(`REQUESTED_PAGES: ${pages}`);
  }
  if (gateMode === 'strict') {
    console.log('NEXT_ACTION: switch to Codex and generate visual anchor package before HTML prototype');
    process.exit(2);
  }
  console.log('NEXT_ACTION: continue normal HTML prototype or switch to Codex for optional visual anchor package');
  process.exit(0);
}

const manifest = readJson(manifestPath);
if (manifest.__error) {
  fail(`manifest.json is not valid JSON: ${manifest.__error}`);
}

const errors = [];
if (manifest.packageType !== 'visual-anchor-manifest') {
  errors.push('manifest.packageType must be visual-anchor-manifest');
}
if (!['ready', 'partial', 'failed'].includes(manifest.status)) {
  errors.push('manifest.status must be ready, partial, or failed');
}

const fingerprintPath = path.join(visualDir, manifest.visualFingerprint || 'visual-fingerprint.md');
if (manifest.status !== 'failed' && !exists(fingerprintPath)) {
  errors.push(`missing visual fingerprint: ${rel(root, fingerprintPath)}`);
}

if (manifest.auditPath) {
  const auditPath = path.join(visualDir, manifest.auditPath);
  if (!exists(auditPath)) errors.push(`missing audit file: ${rel(root, auditPath)}`);
}

const images = Array.isArray(manifest.images) ? manifest.images : [];
if (manifest.status !== 'failed' && images.length === 0) {
  errors.push('manifest.images must include at least one image unless status=failed');
}

images.forEach((item, idx) => {
  if (!item.pageId) errors.push(`images[${idx}].pageId is required`);
  if (!item.image) {
    errors.push(`images[${idx}].image is required`);
  } else {
    const imagePath = path.join(visualDir, item.image);
    if (!exists(imagePath)) errors.push(`missing image: ${rel(root, imagePath)}`);
  }
  if (item.prompt) {
    const promptPath = path.join(visualDir, item.prompt);
    if (!exists(promptPath)) errors.push(`missing prompt: ${rel(root, promptPath)}`);
  }
});

if (request && request.acceptance && Number.isFinite(request.acceptance.minImages)) {
  const minImages = request.acceptance.minImages;
  if (manifest.status === 'ready' && images.length < minImages) {
    errors.push(`ready manifest has ${images.length} images, below request.acceptance.minImages=${minImages}`);
  }
}

if (errors.length) {
  fail('visual anchor package failed validation', errors);
}

console.log(`STATUS: ${manifest.status}`);
console.log(`GATE_MODE: ${gateMode}`);
console.log(`MANIFEST: ${rel(root, manifestPath)}`);
console.log(`IMAGES: ${images.length}`);
if (manifest.visualFingerprint) console.log(`VISUAL_FINGERPRINT: ${rel(root, fingerprintPath)}`);
if (manifest.auditPath) console.log(`AUDIT: ${rel(root, path.join(visualDir, manifest.auditPath))}`);

if (manifest.status === 'ready') {
  console.log('NEXT_ACTION: Claude Code must read manifest + visual fingerprint before HTML prototype');
  process.exit(0);
}

if (manifest.status === 'partial') {
  if (gateMode === 'strict') {
    console.log('NEXT_ACTION: switch to Codex and complete missing visual anchor pages');
    process.exit(2);
  }
  console.log('NEXT_ACTION: continue with partial visual constraints; record missing pages in prototype audit');
  process.exit(0);
}

console.log('NEXT_ACTION: downgrade to normal HTML prototype; record visual anchor failure reason in audit');
process.exit(0);
