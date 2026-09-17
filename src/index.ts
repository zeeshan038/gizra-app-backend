import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import apiRouter from './routes/index'
import { connectDB } from './config/database';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();

// Patch BigInt toJSON to prevent serialization errors globally
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

// Middleware to parse JSON bodies
app.use(express.json());

// Mount our routes
app.use('/api', apiRouter)

// Swagger Setup
const swaggerDocument = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../swagger.json'), 'utf-8')
);

const options = {
  swaggerOptions: {
    url: '/swagger.json'
  }
};
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(undefined, options));

// Serve the raw swagger JSON
app.get('/swagger.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

// Test database connection
connectDB();

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

export default app;
