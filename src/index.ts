import http from 'http';
import express, { Request, Response } from 'express';
import { initSocketServer } from './sockets';
import dotenv from 'dotenv';
import cors from 'cors';
import apiRouter from './routes/index'
import { connectDB } from './config/database';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const origins =[
  "http://localhost:5174",
  "http://localhost:5173",
  "https://vendor.gizra.app",
  "https://gizra-restaurant-pannel.vercel.app"
]
app.use(cors({
  origin: origins,
  credentials: true
}));

// Patch BigInt toJSON to prevent serialization errors globally
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

// Middleware to parse JSON bodies
app.use(express.json());

// Mount our routes
app.use('/api', apiRouter)

// Swagger Setup (role specs at repo root — same pattern as Jikanzo)
const openApiDir = path.join(__dirname, '..');

function loadOpenApi(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(openApiDir, filename), 'utf-8'));
}

const swaggerCustomer = loadOpenApi('swagger-customer.json');
const swaggerVendor = loadOpenApi('swagger-vendor.json');
const swaggerDriver = loadOpenApi('swagger-driver.json');
const swaggerAdmin = loadOpenApi('swagger-admin.json');
const swaggerCombined = loadOpenApi('swagger.json');

const sendJson =
  (doc: object) =>
  (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(doc);
  };

app.get('/swagger-customer.json', sendJson(swaggerCustomer));
app.get('/swagger-vendor.json', sendJson(swaggerVendor));
app.get('/swagger-driver.json', sendJson(swaggerDriver));
app.get('/swagger-admin.json', sendJson(swaggerAdmin));
app.get('/swagger.json', sendJson(swaggerCombined));

// serveFiles embeds each spec in its own swagger-ui-init.js (shared swaggerUi.serve breaks multi-spec)
const swaggerExplorerOpts = {
  swaggerOptions: {
    urls: [
      { url: '/swagger-customer.json', name: 'Customer' },
      { url: '/swagger-vendor.json', name: 'Vendor' },
      { url: '/swagger-driver.json', name: 'Driver' },
      { url: '/swagger-admin.json', name: 'Admin' },
    ],
  },
};

app.use(
  '/swagger/customer',
  ...swaggerUi.serveFiles(swaggerCustomer),
  swaggerUi.setup(swaggerCustomer, { customSiteTitle: 'Gizra Customer API' })
);
app.use(
  '/swagger/vendor',
  ...swaggerUi.serveFiles(swaggerVendor),
  swaggerUi.setup(swaggerVendor, { customSiteTitle: 'Gizra Vendor API' })
);
app.use(
  '/swagger/driver',
  ...swaggerUi.serveFiles(swaggerDriver),
  swaggerUi.setup(swaggerDriver, { customSiteTitle: 'Gizra Driver API' })
);
app.use(
  '/swagger/admin',
  ...swaggerUi.serveFiles(swaggerAdmin),
  swaggerUi.setup(swaggerAdmin, { customSiteTitle: 'Gizra Admin API' })
);
app.use(
  '/swagger',
  ...swaggerUi.serveFiles(undefined, swaggerExplorerOpts),
  swaggerUi.setup(null, { ...swaggerExplorerOpts, explorer: true, customSiteTitle: 'Gizra API' })
);

const port = process.env.PORT || 3000;

connectDB()
  .then(async () => {
    const httpServer = http.createServer(app);
    await initSocketServer(httpServer);
    httpServer.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch(() => {
    process.exit(1);
  });

export default app;
