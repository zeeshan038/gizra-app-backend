const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });
const fs = require('fs');

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
    prefixes: ['/consumer', '/upload']
  },
  {
    file: './swagger-vendor.json',
    title: 'Gizra Vendor API',
    description: 'Vendor web panel and POS endpoints',
    prefixes: ['/vendor', '/upload']
  },
  {
    file: './swagger-driver.json',
    title: 'Gizra Driver API',
    description: 'Delivery man / driver app endpoints',
    prefixes: ['/delivery-man', '/upload']
  },
  {
    file: './swagger-admin.json',
    title: 'Gizra Admin API',
    description: 'Admin dashboard endpoints',
    prefixes: ['/admin', '/upload']
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
      data: { type: 'object', nullable: true }
    }
  };

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
    { name: 'Consumer Zone' },
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
    { name: 'Delivery Man Profile' },
    { name: 'Delivery Man Orders' },
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
      else if (newPath.startsWith('/consumer/restaurants')) endpoint.tags = ['Consumer Discover'];
      else if (newPath.startsWith('/consumer/foods')) endpoint.tags = ['Consumer Foods'];
      else if (newPath.startsWith('/consumer/order')) endpoint.tags = ['Consumer Orders'];
      else if (newPath.startsWith('/consumer/addresses')) endpoint.tags = ['Consumer Addresses'];
      else if (newPath.startsWith('/consumer/favourites')) endpoint.tags = ['Consumer Favourites'];
      else if (newPath.startsWith('/consumer/zone')) endpoint.tags = ['Consumer Zone'];
      else if (newPath.startsWith('/consumer/config')) endpoint.tags = ['Consumer Config'];
      else if (newPath.startsWith('/consumer')) endpoint.tags = ['Consumer Auth'];
      else if (newPath.startsWith('/vendor/catalog')) endpoint.tags = ['Vendor Catalog'];
      else if (newPath.startsWith('/vendor/orders')) endpoint.tags = ['Vendor Orders (Web Panel & POS)'];
      else if (newPath.startsWith('/vendor/restaurant')) endpoint.tags = ['Vendor Restaurant'];
      else if (newPath.startsWith('/vendor')) endpoint.tags = ['Vendor Auth'];
      else if (newPath.startsWith('/delivery-man/profile')) endpoint.tags = ['Delivery Man Profile'];
      else if (newPath.startsWith('/delivery-man/orders')) endpoint.tags = ['Delivery Man Orders'];
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
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
        };
      }

      for (const [code, res] of Object.entries(standardResponses)) {
        if (!endpoint.responses[code] || !endpoint.responses[code].content) {
          endpoint.responses[code] = res;
        }
      }
    }
  }

  swaggerDoc.paths = newPaths;

  fs.writeFileSync(outputFile, JSON.stringify(swaggerDoc, null, 2));
  console.log(`swagger.json: ${Object.keys(newPaths).length} paths (combined)`);
  writeRoleSpecs(swaggerDoc);
});
