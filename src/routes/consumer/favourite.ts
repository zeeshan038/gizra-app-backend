import express from 'express';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  addFavourite,
  listFavourites,
  removeFavourite,
} from '../../controllers/consumer/Favourite';

const router = express.Router();

router.use(verifyConsumer);
router.use(requireRegisteredConsumer);

router.get('/list', listFavourites);
router.post('/add', addFavourite);
router.delete('/remove', removeFavourite);

export default router;
