const fs = require('fs');
const path = require('path');

const OVERLAY_FILE = path.join(__dirname, 'swagger.openapi-overlay.json');

function normalizePathKey(routePath) {
  if (!routePath) return routePath;
  let p = routePath;
  if (p.startsWith('/api/')) p = p.slice(4);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function loadOverlay() {
  if (!fs.existsSync(OVERLAY_FILE)) {
    console.warn('swagger.openapi-overlay.json not found — skip overlay merge');
    return null;
  }
  return JSON.parse(fs.readFileSync(OVERLAY_FILE, 'utf-8'));
}

function indexOverlayPaths(overlay) {
  const index = new Map();
  for (const [rawPath, methods] of Object.entries(overlay.paths || {})) {
    if (rawPath.startsWith('/swagger')) continue;
    const key = normalizePathKey(rawPath);
    if (!index.has(key)) index.set(key, {});
    const bucket = index.get(key);
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters' || !operation || typeof operation !== 'object') continue;
      bucket[method.toLowerCase()] = operation;
    }
  }
  return index;
}

function mergeResponses(baseResponses, overlayResponses) {
  if (!overlayResponses) return baseResponses;
  const out = baseResponses ? JSON.parse(JSON.stringify(baseResponses)) : {};
  for (const [code, overlayRes] of Object.entries(overlayResponses)) {
    if (!overlayRes || typeof overlayRes !== 'object') continue;
    if (!out[code]) {
      out[code] = JSON.parse(JSON.stringify(overlayRes));
      continue;
    }
    const merged = { ...out[code], ...overlayRes };
    if (overlayRes.content) merged.content = overlayRes.content;
    if (overlayRes.description) merged.description = overlayRes.description;
    out[code] = merged;
  }
  return out;
}

function mergeOperation(baseOp, overlayOp) {
  if (!overlayOp) return baseOp;
  if (!baseOp) return JSON.parse(JSON.stringify(overlayOp));

  const merged = { ...baseOp };

  for (const field of ['summary', 'description', 'operationId', 'deprecated']) {
    if (overlayOp[field] != null && overlayOp[field] !== '') {
      merged[field] = overlayOp[field];
    }
  }

  if (overlayOp.tags?.length) merged.tags = overlayOp.tags;
  if (overlayOp.security) merged.security = overlayOp.security;
  if (overlayOp.parameters?.length) merged.parameters = overlayOp.parameters;
  if (overlayOp.requestBody) merged.requestBody = overlayOp.requestBody;
  merged.responses = mergeResponses(baseOp.responses, overlayOp.responses);

  return merged;
}

function mergeComponents(target, overlayComponents) {
  if (!overlayComponents) return;
  if (!target.components) target.components = {};
  if (overlayComponents.securitySchemes) {
    target.components.securitySchemes = {
      ...(target.components.securitySchemes || {}),
      ...overlayComponents.securitySchemes
    };
  }
  if (overlayComponents.parameters) {
    target.components.parameters = {
      ...(target.components.parameters || {}),
      ...overlayComponents.parameters
    };
  }
  if (overlayComponents.schemas) {
    target.components.schemas = {
      ...(target.components.schemas || {}),
      ...overlayComponents.schemas
    };
  }
}

/**
 * Apply hand-maintained OpenAPI (bodies, schemas, examples) onto autogen paths.
 * Overlay wins on conflicts; autogen-only routes keep generated docs.
 */
function applyOpenApiOverlay(swaggerDoc, paths) {
  const overlay = loadOverlay();
  if (!overlay) return 0;

  mergeComponents(swaggerDoc, overlay.components);

  if (Array.isArray(overlay.tags) && overlay.tags.length) {
    swaggerDoc.tags = overlay.tags;
  }

  const overlayIndex = indexOverlayPaths(overlay);
  let mergedOps = 0;

  for (const [routePath, methods] of Object.entries(paths)) {
    const overlayMethods = overlayIndex.get(normalizePathKey(routePath));
    if (!overlayMethods) continue;

    for (const [method, endpoint] of Object.entries(methods)) {
      if (method === 'parameters' || !endpoint || typeof endpoint !== 'object') continue;
      const overlayOp = overlayMethods[method.toLowerCase()];
      if (!overlayOp) continue;
      paths[routePath][method] = mergeOperation(endpoint, overlayOp);
      mergedOps++;
    }
  }

  return mergedOps;
}

module.exports = {
  applyOpenApiOverlay,
  normalizePathKey,
  OVERLAY_FILE
};
