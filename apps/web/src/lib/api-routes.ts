/** Single source of truth for all API route paths.
 *  Import this in client code instead of hardcoding strings. */
export const API_ROUTES = {
  accounts: {
    list:   '/api/accounts' as const,
    create: '/api/accounts' as const,
    delete: (id: string) => `/api/accounts/${id}` as const,
  },
  scrape: {
    trigger: '/api/scrape/trigger' as const,
    otp:     '/api/scrape/otp' as const,
    status:  (jobId: string) => `/api/scrape/${jobId}` as const,
  },
  transactions: {
    list:   '/api/transactions' as const,
    update: (id: string) => `/api/transactions/${id}` as const,
  },
  categories: {
    list:   '/api/categories' as const,
    create: '/api/categories' as const,
  },
  categorize: {
    trigger: '/api/categorize' as const,
  },
} as const
