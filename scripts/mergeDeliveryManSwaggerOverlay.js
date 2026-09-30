/**
 * Merges swagger-overlays/delivery-man.json into swagger.openapi-overlay.json
 * (paths, components, tag descriptions). Safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const overlayPath = path.join(root, 'swagger.openapi-overlay.json');
const fragmentPath = path.join(root, 'swagger-overlays', 'delivery-man.json');

const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf-8'));
const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf-8'));

for (const key of Object.keys(overlay.paths || {})) {
  if (key.startsWith('/delivery-man/') || key === '/delivery-man/profile/') {
    delete overlay.paths[key];
  }
}

Object.assign(overlay.paths, fragment.paths);

overlay.components = overlay.components || {};
overlay.components.parameters = overlay.components.parameters || {};
overlay.components.schemas = overlay.components.schemas || {};
Object.assign(overlay.components.parameters, fragment.components.parameters);
Object.assign(overlay.components.schemas, fragment.components.schemas);

if (Array.isArray(fragment.tags) && Array.isArray(overlay.tags)) {
  for (const tag of fragment.tags) {
    const idx = overlay.tags.findIndex((t) => t.name === tag.name);
    if (idx >= 0) {
      overlay.tags[idx] = { ...overlay.tags[idx], ...tag };
    } else {
      overlay.tags.push(tag);
    }
  }
}

fs.writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
console.log('Merged delivery-man swagger overlay:', Object.keys(fragment.paths).length, 'paths');
