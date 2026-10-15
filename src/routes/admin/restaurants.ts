import express from 'express';
import multer from 'multer';
import {
  bulkExportAdminRestaurants,
  bulkImportAdminRestaurants,
  createAdminRestaurantHandler,
  downloadBulkImportTemplate,
  listAdminRestaurantCuisines,
  listAdminRestaurantJoinRequests,
  listAdminRestaurants,
} from '../../controllers/admin/restaurant';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(verifyAdmin);

router.get('/list', listAdminRestaurants);
router.get('/join-requests', listAdminRestaurantJoinRequests);
router.get('/cuisines', listAdminRestaurantCuisines);
router.post('/create', createAdminRestaurantHandler);
router.post('/bulk-import', upload.single('upload_excel'), bulkImportAdminRestaurants);
router.post('/bulk-export', bulkExportAdminRestaurants);
router.get('/bulk-import/template', downloadBulkImportTemplate);

export default router;
