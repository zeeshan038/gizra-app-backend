const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });

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

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  const fs = require('fs');
  const swaggerDoc = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));

  // Ensure components and schemas exist
  if (!swaggerDoc.components) swaggerDoc.components = {};
  if (!swaggerDoc.components.schemas) swaggerDoc.components.schemas = {};

  // Define schemas literally here to prevent swagger-autogen from treating them as payload examples
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
    { name: 'Consumer Cart' },
    { name: 'Consumer Orders' },
    { name: 'Vendor Auth' },
    { name: 'Vendor Catalog' },
    { name: 'Delivery Man Auth' },
    { name: 'Delivery Man Profile' },
    { name: 'Delivery Man Orders' },
    { name: 'Admin Auth' },
    { name: 'Admin Vendors' }
  ];

  const newPaths = {};

  for (const path in swaggerDoc.paths) {
    let newPath = path;
    if (path.startsWith('/api/')) {
      newPath = path.substring(4);
    }
    
    newPaths[newPath] = swaggerDoc.paths[path];

    for (const method in newPaths[newPath]) {
      const endpoint = newPaths[newPath][method];
      // Consumer
      if (newPath.startsWith('/consumer/cart')) endpoint.tags = ['Consumer Cart'];
      else if (newPath.startsWith('/consumer/restaurants')) endpoint.tags = ['Consumer Discover'];
      else if (newPath.startsWith('/consumer/order')) endpoint.tags = ['Consumer Orders'];
      else if (newPath.startsWith('/consumer')) endpoint.tags = ['Consumer Auth'];
      // Vendor
      else if (newPath.startsWith('/vendor/catalog')) endpoint.tags = ['Vendor Catalog'];
      else if (newPath.startsWith('/vendor')) endpoint.tags = ['Vendor Auth'];
      // Delivery Man
      else if (newPath.startsWith('/delivery-man/profile')) endpoint.tags = ['Delivery Man Profile'];
      else if (newPath.startsWith('/delivery-man/orders')) endpoint.tags = ['Delivery Man Orders'];
      else if (newPath.startsWith('/delivery-man')) endpoint.tags = ['Delivery Man Auth'];
      // Admin
      else if (newPath.startsWith('/admin/auth')) endpoint.tags = ['Admin Auth'];
      else if (newPath.startsWith('/admin/vendors')) endpoint.tags = ['Admin Vendors'];
      else if (newPath.startsWith('/admin')) endpoint.tags = ['Admin'];

      // Add standard error codes and responses
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

      if (!endpoint.responses) endpoint.responses = {};

      if (endpoint.responses['default']) {
        delete endpoint.responses['default'];
      }

      // Add default 200 response if no success code exists
      if (!endpoint.responses['200'] && !endpoint.responses['201']) {
        endpoint.responses['200'] = { 
          description: 'Successful operation',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
        };
      }

      // Merge standard error responses
      for (const [code, res] of Object.entries(standardResponses)) {
        if (!endpoint.responses[code] || !endpoint.responses[code].content) {
           endpoint.responses[code] = res;
        }
      }
    }
  }

  swaggerDoc.paths = newPaths;

  fs.writeFileSync(outputFile, JSON.stringify(swaggerDoc, null, 2));
  console.log("Swagger generated and tags applied successfully");
});
