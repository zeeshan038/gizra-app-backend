import express from 'express';
import apiRouter from './api/index';
import dotenv from 'dotenv';
import { testConnection } from './db/index';

dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

app.use('/api', apiRouter);

// Test database connection
testConnection();

export default app;
