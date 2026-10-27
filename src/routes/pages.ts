import express from 'express';
import { getAllLegalPages, getLegalPageBySlug } from '../controllers/shared/LegalPages';

const router = express.Router();

router.get('/legal', getAllLegalPages);
router.get('/:slug', getLegalPageBySlug);

export default router;
