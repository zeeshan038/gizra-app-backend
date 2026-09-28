const fs = require('fs');
const path = require('path');
const {
  ROUTE_RESPONSE_OVERRIDES,
  SAMPLE_CONSUMER_RESTAURANT,
  SAMPLE_PROFILE_USER,
  SAMPLE_USERINFO,
  inferValueFromExpression
} = require('./swagger-response-samples');

const CONTROLLERS_DIR = path.join(__dirname, 'src/controllers');

/** @Route POST api/consumer/guest/request | POST /api/vendor/orders/:id/status */
function parseRouteLine(line) {
  const m = line.match(/@Route\s+(GET|POST|PUT|PATCH|DELETE)\s+\/?(?:api)?\/?(.+)/i);
  if (!m) return null;
  const method = m[1].toLowerCase();
  let routePath = m[2].trim().replace(/^\/+/, '');
  if (!routePath.startsWith('/')) routePath = `/${routePath}`;
  routePath = routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  return { method, path: routePath };
}

function walkControllers(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkControllers(full, files);
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

function splitExportHandlers(source) {
  const blocks = [];
  const re = /^export const (\w+) =/gm;
  let match;
  const starts = [];
  while ((match = re.exec(source)) !== null) {
    starts.push({ name: match[1], index: match.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    const chunk = source.slice(start, end);
    const headerStart = i === 0 ? 0 : starts[i - 1].index;
    const header = source.slice(headerStart, start);
    const routeMatches = [...header.matchAll(/@Route[^\n]*/g)];
    const routeLine = routeMatches.length ? routeMatches[routeMatches.length - 1][0] : null;
    if (!routeLine) continue;
    const route = parseRouteLine(routeLine);
    if (!route) continue;
    blocks.push({ ...route, body: chunk });
  }
  return blocks;
}

function extractBalanced(source, openIdx) {
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      if (depth === 0) {
        return source.slice(openIdx, i + 1);
      }
    }
  }
  return null;
}

/** Nested helpers in the same export must not override the handler's success response. */
function trimNestedFunctions(exportBody) {
  const cut = exportBody.search(/\n(async )?function [a-zA-Z_$]/);
  return cut === -1 ? exportBody : exportBody.slice(0, cut);
}

function findSuccessJsonLiterals(handlerBody) {
  const scope = trimNestedFunctions(handlerBody);
  const re = /res\.status\((200|201)\)\.json\s*\(/g;
  const literals = [];
  let m;
  while ((m = re.exec(scope)) !== null) {
    const statusCode = Number(m[1]);
    const openParen = m.index + m[0].length - 1;
    const afterParen = scope.indexOf('{', openParen);
    if (afterParen === -1) continue;
    const literal = extractBalanced(scope, afterParen);
    if (literal) literals.push({ statusCode, literal });
  }
  return literals;
}

function pickBestLiteral(literals) {
  if (!literals.length) return null;
  const withStatusTrue = literals.filter((entry) => /\bstatus\s*:\s*true\b/.test(entry.literal));
  const pool = withStatusTrue.length ? withStatusTrue : literals;
  const created = pool.filter((entry) => entry.statusCode === 201);
  if (created.length) return created[created.length - 1].literal;
  return pool[pool.length - 1].literal;
}

const PLACEHOLDER_BY_KEY = {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
  refresh_token: 'refresh_token_string',
  zone_wise_topic: 'zone_topic_name',
  email: 'user@example.com',
  phone: '+1234567890',
  f_name: 'John',
  l_name: 'Doe',
  name: 'Example',
  url: 'https://cdn.example.com/assets/file.png',
  image: 'https://cdn.example.com/image.png',
  logo: 'https://cdn.example.com/logo.png',
  cover_photo: 'https://cdn.example.com/cover.png',
  msg: 'Success',
  ref_code: 'REF123',
  type: 'new_join',
  package_id: 1,
  restaurant_id: 1,
  vendor_id: 1,
  user_id: 1,
  order_id: 1,
  zone_id: 1,
  id: 1
};

function placeholderForKey(key) {
  if (PLACEHOLDER_BY_KEY[key] !== undefined) return PLACEHOLDER_BY_KEY[key];
  if (key.endsWith('_id')) return 1;
  if (key.includes('token')) return 'token_string';
  if (key.includes('email')) return 'user@example.com';
  if (key.includes('phone')) return '+1234567890';
  if (key.includes('url') || key.includes('photo') || key.includes('image')) {
    return 'https://cdn.example.com/file.png';
  }
  const inferred = inferValueFromExpression('', key);
  if (inferred !== null) return inferred;
  return '…';
}

function skipSpreadAt(inner, i) {
  skipWsInner();
  if (inner.slice(i, i + 3) !== '...') return i;
  while (i < inner.length && inner[i] !== ',') i++;
  if (inner[i] === ',') i++;
  return i;

  function skipWsInner() {
    while (i < inner.length && /\s/.test(inner[i])) i++;
  }
}

function parseObjectLiteral(text) {
  const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  const obj = {};
  let i = 0;

  function skipWs() {
    while (i < inner.length && /\s/.test(inner[i])) i++;
  }

  function readKey() {
    skipWs();
    if (inner[i] === '}') return null;
    let key;
    if (inner[i] === "'" || inner[i] === '"') {
      const q = inner[i++];
      let s = '';
      while (i < inner.length && inner[i] !== q) {
        if (inner[i] === '\\') i++;
        s += inner[i++];
      }
      i++;
      key = s;
    } else {
      const start = i;
      while (i < inner.length && /[\w$]/.test(inner[i])) i++;
      key = inner.slice(start, i);
    }
    skipWs();
    if (inner[i] === ':') i++;
    return key;
  }

  function readValue(key) {
    skipWs();
    if (i >= inner.length) return undefined;

    if (inner[i] === '{') {
      const chunk = extractBalanced(inner, i);
      if (!chunk) return {};
      i += chunk.length;
      const innerOnly = chunk.slice(1, -1);
      const hasSpread = /^\s*\.\.\./.test(innerOnly);
      const hasNamedKeys = /[\w"']+\s*:/.test(innerOnly.replace(/\.\.\.[^,]+,?\s*/g, ''));
      if (hasSpread && !hasNamedKeys) {
        if (/restaurant/.test(innerOnly)) return { ...SAMPLE_CONSUMER_RESTAURANT };
        if (/formatProfileUser/.test(innerOnly)) return { ...SAMPLE_PROFILE_USER };
        if (key === 'data' || key === 'subscribed') {
          return {
            token: PLACEHOLDER_BY_KEY.token,
            zone_wise_topic: PLACEHOLDER_BY_KEY.zone_wise_topic,
            restaurant_id: 1
          };
        }
        return { items: '…' };
      }
      const parsed = parseObjectLiteral(chunk);
      if (/formatProfileUser/.test(innerOnly)) {
        return { ...SAMPLE_PROFILE_USER, ...parsed };
      }
      if (/^\s*\.\.\.restaurant/.test(innerOnly)) {
        return { ...SAMPLE_CONSUMER_RESTAURANT, ...parsed };
      }
      return parsed;
    }

    if (inner[i] === '[') {
      const chunk = extractBalanced(inner, i);
      i += chunk.length;
      return [];
    }

    if (inner.slice(i, i + 4) === 'true') {
      i += 4;
      return true;
    }
    if (inner.slice(i, i + 5) === 'false') {
      i += 5;
      return false;
    }
    if (inner.slice(i, i + 4) === 'null') {
      i += 4;
      return null;
    }

    if (inner[i] === "'" || inner[i] === '"') {
      const q = inner[i++];
      let s = '';
      while (i < inner.length && inner[i] !== q) {
        if (inner[i] === '\\') i++;
        s += inner[i++];
      }
      i++;
      return s;
    }

    const exprStart = i;
    while (i < inner.length && inner[i] !== ',' && inner[i] !== '}') i++;
    const expr = inner.slice(exprStart, i).trim();

    const inferred = inferValueFromExpression(expr, key);
    if (inferred !== null) return inferred;
    if (expr.includes('token')) return PLACEHOLDER_BY_KEY.token;
    return placeholderForKey(key);
  }

  while (i < inner.length) {
    skipWs();
    if (inner[i] === '}' || i >= inner.length) break;
    i = skipSpreadAt(inner, i);
    skipWs();
    if (inner[i] === '}' || i >= inner.length) break;
    const key = readKey();
    if (!key) break;
    obj[key] = readValue(key);
    skipWs();
    if (inner[i] === ',') i++;
  }

  return obj;
}

function exampleToOpenApiSchema(value) {
  if (value === null) return { nullable: true, example: null };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length ? exampleToOpenApiSchema(value[0]) : {},
      example: value
    };
  }
  if (typeof value === 'object') {
    const properties = {};
    for (const [k, v] of Object.entries(value)) {
      properties[k] = exampleToOpenApiSchema(v);
    }
    return { type: 'object', properties, example: value };
  }
  if (typeof value === 'boolean') return { type: 'boolean', example: value };
  if (typeof value === 'number') return { type: 'number', example: value };
  return { type: 'string', example: value };
}

function buildExampleMap() {
  const map = new Map();
  const files = walkControllers(CONTROLLERS_DIR);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const block of splitExportHandlers(source)) {
      const literals = findSuccessJsonLiterals(block.body);
      const literal = pickBestLiteral(literals);
      if (!literal) continue;
      const example = parseObjectLiteral(literal);
      if (!example || !Object.keys(example).length) continue;
      const key = `${block.method} ${block.path}`;
      map.set(key, example);
    }
  }
  for (const [routeKey, example] of Object.entries(ROUTE_RESPONSE_OVERRIDES)) {
    map.set(routeKey, example);
  }
  return map;
}

module.exports = {
  buildExampleMap,
  exampleToOpenApiSchema
};
