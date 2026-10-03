import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  getVendorShop,
  updateShopAnnouncement,
  updateVendorShop,
} from '../../controllers/vendor/shop';

const router = express.Router();

router.use(verifyVendor);

router.get('/', getVendorShop);
router.put('/', updateVendorShop);
router.put('/announcement', updateShopAnnouncement);

export default router;
