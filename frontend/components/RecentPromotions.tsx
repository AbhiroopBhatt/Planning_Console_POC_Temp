'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import Link from 'next/link'

export function RecentPromotions() {
  const { data, isLoading } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get('/api/promotions'),
  })

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  // Access promotions from the new API response structure
  const promotions = data?.data?.data?.promotions || []

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Recent Promotions
        </h2>
        <Link
          href="/plan"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          View All
        </Link>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {promotions.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
            No promotions yet. Create your first promotion to get started.
          </div>
        ) : (
          promotions.slice(0, 5).map((promo: any) => (
            <Link
              key={promo.promo_id}
              href={`/plan/fact/${promo.promo_id}`}
              className="block px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Promotion #{promo.promo_id}
                    </h3>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {promo.discount_pct}% OFF
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(promo.start_date)} - {formatDate(promo.end_date)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {promo.record_count || 0} records • {promo.product_count || 0} products • {promo.customer_count || 0} customers
                  </p>
                </div>
                <div className="text-right ml-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    promo.status === 'active' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : promo.status === 'draft'
                      ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {promo.status || 'Draft'}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

