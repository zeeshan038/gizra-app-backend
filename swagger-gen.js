const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });
const fs = require('fs');
const { buildExampleMap, exampleToOpenApiSchema } = require('./swagger-controller-examples');
const { applyRequestBodies } = require('./swagger-request-bodies');
const { applyOpenApiOverlay } = require('./swagger-merge-overlay');

const doc = {
  info: {
    title: 'Gizra API',
    description: 'Backend API for Gizra application',
    version: '1.0.0'
  },
  servers: [
    {
      url: '/api',
      description: 'Main API endpoints'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

const outputFile = './swagger.json';
const endpointsFiles = ['./src/index.ts', './src/routes/index.ts'];

const ROLES = [
  {
    file: './swagger-customer.json',
    title: 'Gizra Customer API',
    description: 'Customer (consumer) app endpoints',
    prefixes: ['/config', '/pages', '/consumer', '/payment', '/upload', '/storage']
  },
  {
    file: './swagger-vendor.json',
    title: 'Gizra Vendor API',
    description: 'Vendor web panel and POS endpoints',
    prefixes: ['/config', '/pages', '/vendor', '/upload', '/storage']
  },
  {
    file: './swagger-driver.json',
    title: 'Gizra Driver API',
    description: 'Delivery man / driver app endpoints',
    prefixes: ['/config', '/pages', '/delivery-man', '/upload', '/storage']
  },
  {
    file: './swagger-admin.json',
    title: 'Gizra Admin API',
    description: 'Admin dashboard endpoints',
    prefixes: ['/config', '/pages', '/admin', '/upload', '/storage']
  }
];

const standardResponses = {
  '400': {
    description: 'Bad Request - Invalid input or missing parameters',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { status: false, msg: 'Bad Request' }
      }
    }
  },
  '401': {
    description: 'Unauthorized - Invalid or missing authentication token',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { status: false, msg: 'Unauthorized' }
      }
    }
  },
  '403': {
    description: 'Forbidden - You do not have permission to access this resource',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { status: false, msg: 'Forbidden' }
      }
    }
  },
  '404': {
    description: 'Not Found - The requested resource could not be found',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { status: false, msg: 'Not Found' }
      }
    }
  },
  '500': {
    description: 'Internal Server Error - Something went wrong on the server',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { status: false, msg: 'Internal Server Error' }
      }
    }
  }
};

const genericSuccessExample = {
  status: true,
  msg: 'Operation successful'
};

const defaultSuccessContent = {
  'application/json': {
    schema: { $ref: '#/components/schemas/ApiResponse' },
    example: genericSuccessExample
  }
};

/** Swagger UI needs content + example; autogen often leaves 200 as description-only. */
function ensureJsonResponseBody(response, kind, successExample) {
  if (!response || typeof response !== 'object') return;
  const isSuccess = kind === 'success';
  const template = isSuccess
    ? {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiResponse' },
          example: successExample || genericSuccessExample
        }
      }
    : standardResponses[kind]?.content;
  if (!template) return;

  if (!response.content || !response.content['application/json']) {
    response.content = JSON.parse(JSON.stringify(template));
    return;
  }
  const json = response.content['application/json'];
  if (!json.schema) {
    json.schema = isSuccess
      ? { $ref: '#/components/schemas/ApiResponse' }
      : { $ref: '#/components/schemas/ApiError' };
  }
  if (!json.example && !json.examples) {
    json.example = isSuccess
      ? successExample || genericSuccessExample
      : standardResponses[kind]?.content?.['application/json']?.example;
  }
}

function applyControllerSuccessExample(endpoint, method, routePath, exampleMap) {
  const key = `${method.toLowerCase()} ${routePath}`;
  const example = exampleMap.get(key);
  if (!example) return;

  for (const code of ['200', '201']) {
    const response = endpoint.responses?.[code];
    if (!response) continue;
    if (!response.content) response.content = {};
    if (!response.content['application/json']) response.content['application/json'] = {};
    const json = response.content['application/json'];
    json.example = example;
    json.schema = exampleToOpenApiSchema(example);
  }
}

/** Overlay merge replaces response content and drops examples; re-attach without overwriting $ref schemas. */
function applySuccessExamplesAfterOverlay(paths, exampleMap) {
  for (const routePath of Object.keys(paths)) {
    const methods = paths[routePath];
    for (const method of Object.keys(methods)) {
      if (method === 'parameters') continue;
      const endpoint = methods[method];
      if (!endpoint?.responses) continue;
      const key = `${method.toLowerCase()} ${routePath}`;
      const example = exampleMap.get(key);
      for (const code of ['200', '201']) {
        if (endpoint.responses[code]) {
          ensureJsonResponseBody(endpoint.responses[code], 'success', example);
        }
      }
    }
  }
}

function pathMatches(routePath, prefixes) {
  return prefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`));
}

function usedTags(allTags, paths) {
  const names = new Set();
  for (const methods of Object.values(paths)) {
    for (const endpoint of Object.values(methods)) {
      if (endpoint && Array.isArray(endpoint.tags)) {
        endpoint.tags.forEach((tag) => names.add(tag));
      }
    }
  }
  return (allTags || []).filter((tag) => names.has(tag.name));
}

function writeRoleSpecs(swaggerDoc) {
  for (const role of ROLES) {
    const paths = {};
    for (const [routePath, methods] of Object.entries(swaggerDoc.paths)) {
      if (routePath.startsWith('/swagger')) continue;
      if (pathMatches(routePath, role.prefixes)) {
        paths[routePath] = methods;
      }
    }

    const spec = {
      openapi: swaggerDoc.openapi,
      info: {
        title: role.title,
        description: role.description,
        version: swaggerDoc.info.version
      },
      servers: swaggerDoc.servers,
      tags: usedTags(swaggerDoc.tags, paths),
      components: swaggerDoc.components,
      paths
    };

    fs.writeFileSync(role.file, JSON.stringify(spec, null, 2));
    console.log(`${role.file}: ${Object.keys(paths).length} paths`);
  }
}

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  const swaggerDoc = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));

  if (!swaggerDoc.components) swaggerDoc.components = {};
  if (!swaggerDoc.components.schemas) swaggerDoc.components.schemas = {};

  swaggerDoc.components.schemas.ApiError = {
    type: 'object',
    properties: {
      status: { type: 'boolean', example: false },
      msg: { type: 'string', example: 'Something went wrong' }
    }
  };

  swaggerDoc.components.schemas.ApiResponse = {
    type: 'object',
    properties: {
      status: { type: 'boolean', example: true },
      msg: { type: 'string', example: 'Operation successful' },
      data: {
        nullable: true,
        oneOf: [
          { type: 'object' },
          { type: 'array' },
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' }
        ]
      }
    }
  };

  const controllerExamples = buildExampleMap();
  console.log(`Controller success examples: ${controllerExamples.size} endpoints`);

  swaggerDoc.tags = [
    { name: 'Consumer Auth' },
    { name: 'Consumer Discover' },
    { name: 'Consumer Foods' },
    { name: 'Consumer Cart' },
    { name: 'Consumer Orders' },
    {
      name: 'Consumer Addresses',
      description:
        'Saved delivery locations for checkout. Use delivery_address_id on POST /consumer/order/place.'
    },
    { name: 'Consumer Favourites', description: 'Wish list for foods and restaurants (legacy PHP wish-list).' },
    {
      name: 'Consumer Chat',
      description:
        'In-app chat (PHP customer/message/*). REST + Socket `chat_message` / `watch_conversation`. Registered customer JWT.'
    },
    { name: 'Consumer Zone' },
    {
      name: 'App Config (All Apps)',
      description:
        'Shared bootstrap — GET /config (PHP GET /api/v1/config). Payment toggles, min app versions, etc. Legal HTML also available on GET /pages/*.'
    },
    {
      name: 'Legal Pages (All Apps)',
      description:
        'Terms, privacy, about, refund/shipping/cancellation policies from admin Business Settings → Pages (`data_settings`). Optional header X-localization. PHP web parity: GET /pages/{slug}?format=legacy returns raw HTML JSON string.'
    },
    { name: 'Consumer Config' },
    { name: 'Vendor Auth' },
    { name: 'Vendor Catalog' },
    { name: 'Vendor Restaurant' },
    {
      name: 'Vendor Orders (Web Panel & POS)',
      description:
        'Marketplace order APIs shared by the Restaurant Web Panel (vendor.gizra.app) and the Vendor POS app. Authenticate with POST /vendor/login (Bearer JWT). Lists consumer-placed orders only (excludes order_type=pos counter sales). POS uses the same endpoints for live orders, status updates, and FCM new_order payloads after POST /consumer/order/place.'
    },
    { name: 'Delivery Man Auth' },
    { name: 'Delivery Man Home' },
    { name: 'Delivery Man Earnings' },
    { name: 'Delivery Man Profile' },
    { name: 'Delivery Man Orders' },
    {
      name: 'Delivery Man Chat',
      description: 'PHP delivery-man/message/* — chat with customer and vendor.'
    },
    { name: 'Delivery Man Notifications' },
    { name: 'Vendor Notifications' },
    {
      name: 'Vendor Chat',
      description: 'PHP vendor/message/* — chat with customers and drivers. Inbox JSON key `conversation`.'
    },
    { name: 'Consumer Notifications' },
    { name: 'Admin Auth' },
    { name: 'Admin Vendors' },
    { name: 'Admin Banners' },
    { name: 'Admin Zones' },
    { name: 'Upload' }
  ];

  const newPaths = {};

  for (const rawPath in swaggerDoc.paths) {
    if (rawPath.startsWith('/swagger')) continue;

    let newPath = rawPath;
    if (rawPath.startsWith('/api/')) {
      newPath = rawPath.substring(4);
    }

    newPaths[newPath] = swaggerDoc.paths[rawPath];

    for (const method in newPaths[newPath]) {
      const endpoint = newPaths[newPath][method];
      if (!endpoint || typeof endpoint !== 'object' || !endpoint.responses && method === 'parameters') {
        continue;
      }
      if (method === 'parameters') continue;

      if (newPath.startsWith('/consumer/cart')) endpoint.tags = ['Consumer Cart'];
      else if (
        newPath.startsWith('/consumer/restaurants') ||
        newPath === '/consumer/categories' ||
        newPath === '/consumer/home-slider'
      ) { 
        endpoint.tags = ['Consumer Discover'];
      }
      else if (newPath.startsWith('/consumer/foods')) endpoint.tags = ['Consumer Foods'];
      else if (newPath.startsWith('/consumer/order')) endpoint.tags = ['Consumer Orders'];
      else if (newPath.startsWith('/consumer/addresses')) endpoint.tags = ['Consumer Addresses'];
      else if (newPath.startsWith('/consumer/favourites')) endpoint.tags = ['Consumer Favourites'];
      else if (newPath.startsWith('/consumer/message')) endpoint.tags = ['Consumer Chat'];
      else if (newPath.startsWith('/consumer/zone')) endpoint.tags = ['Consumer Zone'];
      else if (newPath === '/config' || newPath === '/consumer/config') {
        endpoint.tags = ['App Config (All Apps)'];
      } else if (newPath.startsWith('/pages')) endpoint.tags = ['Legal Pages (All Apps)'];
      else if (newPath.startsWith('/consumer/config')) endpoint.tags = ['Consumer Config'];
      else if (newPath.startsWith('/consumer')) endpoint.tags = ['Consumer Auth'];
      else if (newPath.startsWith('/vendor/catalog')) endpoint.tags = ['Vendor Catalog'];
      else if (newPath.startsWith('/vendor/orders')) endpoint.tags = ['Vendor Orders (Web Panel & POS)'];
      else if (newPath.startsWith('/vendor/message')) endpoint.tags = ['Vendor Chat'];
      else if (newPath.startsWith('/vendor/restaurant')) endpoint.tags = ['Vendor Restaurant'];
      else if (newPath.startsWith('/vendor')) endpoint.tags = ['Vendor Auth'];
      else if (newPath.startsWith('/delivery-man/earnings')) endpoint.tags = ['Delivery Man Earnings'];
      else if (newPath.startsWith('/delivery-man/home')) endpoint.tags = ['Delivery Man Home'];
      else if (newPath.startsWith('/delivery-man/profile')) endpoint.tags = ['Delivery Man Profile'];
      else if (newPath.startsWith('/delivery-man/orders')) endpoint.tags = ['Delivery Man Orders'];
      else if (newPath.startsWith('/delivery-man/message')) endpoint.tags = ['Delivery Man Chat'];
      else if (newPath.startsWith('/delivery-man')) endpoint.tags = ['Delivery Man Auth'];
      else if (newPath.startsWith('/admin/auth')) endpoint.tags = ['Admin Auth'];
      else if (newPath.startsWith('/admin/vendors')) endpoint.tags = ['Admin Vendors'];
      else if (newPath.startsWith('/admin/banners')) endpoint.tags = ['Admin Banners'];
      else if (newPath.startsWith('/admin/zones')) endpoint.tags = ['Admin Zones'];
      else if (newPath.startsWith('/admin')) endpoint.tags = ['Admin'];
      else if (newPath.startsWith('/upload')) endpoint.tags = ['Upload'];

      if (!endpoint.responses) endpoint.responses = {};

      if (endpoint.responses['default']) {
        delete endpoint.responses['default'];
      }

      if (!endpoint.responses['200'] && !endpoint.responses['201']) {
        endpoint.responses['200'] = {
          description: 'Successful operation',
          content: JSON.parse(JSON.stringify(defaultSuccessContent))
        };
      }

      applyControllerSuccessExample(endpoint, method, newPath, controllerExamples);

      for (const code of ['200', '201']) {
        if (endpoint.responses[code]) {
          if (!endpoint.responses[code].description) {
            endpoint.responses[code].description = 'Successful operation';
          }
          const key = `${method.toLowerCase()} ${newPath}`;
          ensureJsonResponseBody(
            endpoint.responses[code],
            'success',
            controllerExamples.get(key)
          );
        }
      }

      for (const [code, res] of Object.entries(standardResponses)) {
        if (!endpoint.responses[code]) {
          endpoint.responses[code] = JSON.parse(JSON.stringify(res));
        } else {
          if (!endpoint.responses[code].description && res.description) {
            endpoint.responses[code].description = res.description;
          }
          ensureJsonResponseBody(endpoint.responses[code], code);
        }
      }
    }
  }

  applyRequestBodies(newPaths, swaggerDoc.components);

  const overlayMerged = applyOpenApiOverlay(swaggerDoc, newPaths);
  if (overlayMerged) {
    console.log(`OpenAPI overlay merged: ${overlayMerged} operations`);
  }

  applySuccessExamplesAfterOverlay(newPaths, controllerExamples);

  for (const discoverPath of [
    '/consumer/home-slider',
    '/consumer/categories',
  ]) {
    const op = newPaths[discoverPath]?.get;
    if (op) op.tags = ['Consumer Discover'];
  }

  swaggerDoc.paths = newPaths;

  fs.writeFileSync(outputFile, JSON.stringify(swaggerDoc, null, 2));
  console.log(`swagger.json: ${Object.keys(newPaths).length} paths (combined)`);
  writeRoleSpecs(swaggerDoc);
});
