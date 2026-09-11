import express from 'express';
const router = express.Router();


import userRoutes from "./consumer/routes/user";

router.use("/user", userRoutes);



export default router;