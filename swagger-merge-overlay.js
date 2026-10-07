const fs = require('fs');
const path = require('path');

const OVERLAY_FILE = path.join(__dirname, 'swagger.openapi-overlay.json');
const CHAT_OVERLAY_FILE = path.join(__dirname, 'swagger.chat.overlay.json');
const REVIEWS_OVERLAY_FILE = path.join(__dirname, 'swagger.reviews.overlay.json');
const PAYMENT_OVERLAY_FILE = path.join(__dirname, 'swagger.payment.overlay.json');
const COUPON_OVERLAY_FILE = path.join(__dirname, 'swagger.coupon.overlay.json');

function normalizePathKey(routePath) {
  if (!routePath) return routePath;
  let p = routePath;
  if (p.startsWith('/api/')) p = p.slice(4);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** Match autogen path keys that differ only by a trailing slash. */
function resolveExistingPathKey(paths, rawPath) {
  if (paths[rawPath]) return rawPath;
  const normalized = normalizePathKey(rawPath);
  if (paths[normalized]) return normalized;
  for (const key of Object.keys(paths)) {
    if (normalizePathKey(key) === normalized) return key;
  }
  return rawPath;
}

function loadOverlayFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`${label} not found — skip`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadOverlay() {
  const main = loadOverlayFile(OVERLAY_FILE, 'swagger.openapi-overlay.json');
  if (!main) return null;

  const chat = loadOverlayFile(CHAT_OVERLAY_FILE, 'swagger.chat.overlay.json');
  if (chat) {
    main.paths = { ...(main.paths || {}), ...(chat.paths || {}) };
    mergeComponents(main, chat.components);
    if (Array.isArray(chat.tags) && chat.tags.length) {
      main.tags = [...(main.tags || []), ...chat.tags];
    }
  }

  const reviews = loadOverlayFile(REVIEWS_OVERLAY_FILE, 'swagger.reviews.overlay.json');
  if (reviews) {
    main.paths = { ...(main.paths || {}), ...(reviews.paths || {}) };
    mergeComponents(main, reviews.components);
    if (Array.isArray(reviews.tags) && reviews.tags.length) {
      main.tags = [...(main.tags || []), ...reviews.tags];
    }
  }

  const payment = loadOverlayFile(PAYMENT_OVERLAY_FILE, 'swagger.payment.overlay.json');
  if (payment) {
    main.paths = { ...(main.paths || {}), ...(payment.paths || {}) };
    mergeComponents(main, payment.components);
    if (Array.isArray(payment.tags) && payment.tags.length) {
      main.tags = [...(main.tags || []), ...payment.tags];
    }
  }

  const coupon = loadOverlayFile(COUPON_OVERLAY_FILE, 'swagger.coupon.overlay.json');
  if (coupon) {
    main.paths = { ...(main.paths || {}), ...(coupon.paths || {}) };
    mergeComponents(main, coupon.components);
    if (Array.isArray(coupon.tags) && coupon.tags.length) {
      main.tags = [...(main.tags || []), ...coupon.tags];
    }
  }

  return main;
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
  if (overlayOp.requestBody === false) {
    delete merged.requestBody;
  } else if (overlayOp.requestBody) {
    merged.requestBody = overlayOp.requestBody;
  }
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
  if (overlayComponents.responses) {
    target.components.responses = {
      ...(target.components.responses || {}),
      ...overlayComponents.responses
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

  // Routes documented only in overlay (e.g. new consumer endpoints before autogen picks them up)
  for (const [rawPath, overlayMethods] of Object.entries(overlay.paths || {})) {
    if (rawPath.startsWith('/swagger')) continue;
    const routePath = resolveExistingPathKey(paths, rawPath);
    if (!paths[routePath]) paths[routePath] = {};
    for (const [method, overlayOp] of Object.entries(overlayMethods)) {
      if (method === 'parameters' || !overlayOp || typeof overlayOp !== 'object') continue;
      const m = method.toLowerCase();
      if (!paths[routePath][m]) {
        paths[routePath][m] = JSON.parse(JSON.stringify(overlayOp));
        mergedOps++;
        continue;
      }
      paths[routePath][m] = mergeOperation(paths[routePath][m], overlayOp);
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
