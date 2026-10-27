import { Request, Response } from 'express';
import {
  LEGAL_PAGES,
  loadAllLegalPages,
  loadLegalPageContent,
  resolveLegalPageSlug,
} from '../../utils/config/legalPages';

function resolveLocale(req: Request): string | undefined {
  const raw = req.headers['x-localization'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return undefined;
}

/** PHP HomeController JSON: response body is only the HTML string (use ?format=legacy). */
function wantsLegacyPhpJson(req: Request): boolean {
  const f = req.query.format;
  return f === 'legacy' || f === 'php';
}

/**
 * All legal / policy pages (admin Business Settings → Pages)
 * @Route GET /api/pages/legal
 * @Access Public
 */
export const getAllLegalPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const locale = resolveLocale(req);
    const pages = await loadAllLegalPages(locale);
    res.status(200).json({
      status: true,
      msg: 'Success',
      data: pages,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    res.status(500).json({ status: false, msg });
  }
};

/**
 * Single page — terms, privacy, about, refund, shipping, cancellation
 * @Route GET /api/pages/{slug}
 * @Access Public
 */
export const getLegalPageBySlug = async (req: Request, res: Response): Promise<void> => {
  const slugParam = String(req.params.slug ?? '').trim();
  const def = resolveLegalPageSlug(slugParam);

  if (!def) {
    const allowed = LEGAL_PAGES.map((p) => p.slug).join(', ');
    res.status(404).json({
      status: false,
      msg: `Unknown page. Use one of: ${allowed}`,
    });
    return;
  }

  try {
    const locale = resolveLocale(req);
    const page = await loadLegalPageContent(def, locale);

    if (wantsLegacyPhpJson(req)) {
      res.status(200).json(page.content);
      return;
    }

    res.status(200).json({
      status: true,
      msg: page.content
        ? 'Success'
        : 'Success — content is empty; save HTML in Admin → Business Settings → Pages (data_settings)',
      data: page,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    res.status(500).json({ status: false, msg });
  }
};
