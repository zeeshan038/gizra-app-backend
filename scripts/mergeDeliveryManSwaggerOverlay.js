/**
 * Merges swagger-overlays/*.json into swagger.openapi-overlay.json
 * (paths, components, tag descriptions). Safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const overlayPath = path.join(root, 'swagger.openapi-overlay.json');
const overlaysDir = path.join(root, 'swagger-overlays');

const FRAGMENTS = [
  {
    file: 'delivery-man.json',
    clearPathPrefixes: ['/delivery-man/'],
  },
  {
    file: 'notifications-inbox.json',
    clearPathPrefixes: [
      '/delivery-man/notifications',
      '/delivery-man/fcm-token',
      '/vendor/notifications',
      '/consumer/notifications',
    ],
  },
];

function mergeComponents(target, source) {
  target.components = target.components || {};
  target.components.parameters = target.components.parameters || {};
  target.components.schemas = target.components.schemas || {};
  target.components.responses = target.components.responses || {};

  if (source.components?.parameters) {
    Object.assign(target.components.parameters, source.components.parameters);
  }
  if (source.components?.schemas) {
    Object.assign(target.components.schemas, source.components.schemas);
  }
  if (source.components?.responses) {
    Object.assign(target.components.responses, source.components.responses);
  }
}

function mergeTags(target, sourceTags) {
  if (!Array.isArray(sourceTags) || !Array.isArray(target.tags)) return;
  for (const tag of sourceTags) {
    const idx = target.tags.findIndex((t) => t.name === tag.name);
    if (idx >= 0) {
      target.tags[idx] = { ...target.tags[idx], ...tag };
    } else {
      target.tags.push(tag);
    }
  }
}

const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf-8'));
overlay.paths = overlay.paths || {};

for (const { file, clearPathPrefixes } of FRAGMENTS) {
  const fragmentPath = path.join(overlaysDir, file);
  if (!fs.existsSync(fragmentPath)) {
    console.warn('Skip missing overlay:', file);
    continue;
  }

  for (const key of Object.keys(overlay.paths)) {
    if (clearPathPrefixes.some((p) => key.startsWith(p))) {
      delete overlay.paths[key];
    }
  }

  const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf-8'));
  Object.assign(overlay.paths, fragment.paths);
  mergeComponents(overlay, fragment);
  mergeTags(overlay, fragment.tags);
  console.log('Merged swagger overlay:', file, '—', Object.keys(fragment.paths).length, 'paths');
}

fs.writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
console.log('Updated', overlayPath);
