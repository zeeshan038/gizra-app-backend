import { Request } from 'express';
import { parseConsumerSearchQuery } from './restaurantSearchHelpers';

function isBlankQueryValue(raw: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim().toLowerCase();
  return s === '' || s === 'null' || s === 'undefined';
}

function isMenuTypeFilter(raw: unknown): boolean {
  if (isBlankQueryValue(raw)) return false;
  const type = String(raw).trim().toLowerCase();
  return type !== 'all';
}

function isTruthyFilterFlag(raw: unknown): boolean {
  if (isBlankQueryValue(raw)) return false;
  return raw === '1' || raw === 'true' || raw === true;
}

function minRatingFromQuery(query: Record<string, unknown>): number | undefined {
  if (query.rating_5 === '1' || query.rating_5 === 'true') return 5;
  if (query.rating_4_plus === '1' || query.rating_4_plus === 'true') return 4.01;
  if (query.rating_4 === '1' || query.rating_4 === 'true') return 4;
  if (query.rating_3_plus === '1' || query.rating_3_plus === 'true') return 3.01;
  if (query.rating_3 === '1' || query.rating_3 === 'true') return 3;
  return undefined;
}

/**
 * PHP GET /api/v1/products/search — food-only listing with extra filters (not the app search bar).
 * App search bar (`name` + zone/coords only) must use combined search (tokenized, + restaurants).
 */
export function isPhpFilteredProductSearch(req: Request): boolean {
  const q = req.query;
  const textQuery = parseConsumerSearchQuery(req);

  const hasStructuralFilters =
    !isBlankQueryValue(q.restaurant_id) ||
    !isBlankQueryValue(q.category_id) ||
    (!isBlankQueryValue(q.min_price) && String(q.min_price).trim() !== '') ||
    (!isBlankQueryValue(q.max_price) && String(q.max_price).trim() !== '') ||
    minRatingFromQuery(q as Record<string, unknown>) != null ||
    isMenuTypeFilter(q.type);

  if (textQuery && !hasStructuralFilters) {
    return false;
  }

  if (!isBlankQueryValue(q.restaurant_id)) return true;
  if (!isBlankQueryValue(q.category_id)) return true;
  if (!isBlankQueryValue(q.min_price) && String(q.min_price).trim() !== '') return true;
  if (!isBlankQueryValue(q.max_price) && String(q.max_price).trim() !== '') return true;
  if (minRatingFromQuery(q as Record<string, unknown>) != null) return true;
  if (isTruthyFilterFlag(q.popular)) return true;
  if (isTruthyFilterFlag(q.new)) return true;
  if (isMenuTypeFilter(q.type)) return true;
  return false;
}
