const CONSUMER_DISCOVER_PATH_ORDER = [
  '/consumer/home-slider',
  '/consumer/categories',
  '/consumer/restaurants/popular',
  '/consumer/restaurants/nearby',
  '/consumer/restaurants/all',
  '/consumer/restaurants/{id}/foods',
  '/consumer/restaurants/specfic/{id}',
];

export const swaggerUiCustomerOptions = {
  customSiteTitle: 'Gizra Customer API',
  swaggerOptions: {
    operationsSorter: (a: { get: (k: string) => string }, b: { get: (k: string) => string }) => {
      const pathA = a.get('path');
      const pathB = b.get('path');
      const tagA = a.get('tag') ?? '';
      const tagB = b.get('tag') ?? '';
      if (tagA === 'Consumer Discover' && tagB === 'Consumer Discover') {
        const ia = CONSUMER_DISCOVER_PATH_ORDER.indexOf(pathA);
        const ib = CONSUMER_DISCOVER_PATH_ORDER.indexOf(pathB);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
      }
      return pathA.localeCompare(pathB);
    },
  },
};
