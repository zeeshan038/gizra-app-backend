import express from 'express';
import { verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  addFavourite,
  listFavourites,
  removeFavourite,
} from '../../controllers/consumer/Favourite';

const router = express.Router();

router.use(verifyConsumer);

router.get('/list', listFavourites);
router.post('/add', addFavourite);
router.delete('/remove', removeFavourite);

export default router;
