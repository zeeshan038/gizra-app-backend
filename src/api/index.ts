import express from 'express';
import prisma from '../db/index';

const router = express.Router();

import userRoutes from "./consumer/routes/user";

router.use("/user", userRoutes);

// Basic test API
router.get("/test", async (req, res) => {
  try {
    // Ping DB
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: "success",
      message: "API is working perfectly!",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "API is running, but database connection failed",
      error: String(error)
    });
  }
});

export default router;