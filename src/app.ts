import express from 'express';
import apiRouter from './api/index';

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// 🔌 Connect the centralized API router
app.use('/api', apiRouter);

export default app;
