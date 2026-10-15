import express from 'express';
import {
  createAdminBasicCampaign,
  createAdminFoodCampaign,
  deleteAdminCampaign,
  listAdminCampaigns,
  updateAdminCampaignStatus,
} from '../../controllers/admin/compaigns';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/list', listAdminCampaigns);
router.post('/basic', createAdminBasicCampaign);
router.post('/food', createAdminFoodCampaign);
router.patch('/:type/:id/status', updateAdminCampaignStatus);
router.delete('/:type/:id', deleteAdminCampaign);

export default router;
