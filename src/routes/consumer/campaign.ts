import express from 'express';
import {
  getBasicCampaignDetails,
  getBasicCampaigns,
  getItemCampaigns,
} from '../../controllers/consumer/Marketing';

const router = express.Router();
router.get('/basic', getBasicCampaigns);
router.get('/basic-details', getBasicCampaignDetails);
router.get('/item', getItemCampaigns);
export default router;
