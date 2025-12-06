'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { Plus } from 'lucide-react'

export default function PromotionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string

  const { data: promotion } = useQuery({
    queryKey: ['promotion', id],
    queryFn: () => api.get(`/api/promotions/${id}`),
  })

  const { data: items } = useQuery({
    queryKey: ['promotion-items', id],
    queryFn: () => api.get(`/api/promotions/${id}/items`),
  })

  const estimateMutation = useMutation({
    mutationFn: () => api.post(`/api/promotions/${id}/estimate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotion', id] })
      queryClient.invalidateQueries({ queryKey: ['promotion-items', id] })
    },
  })

  const promotionData = promotion?.data?.data
  const itemsData = items?.data?.data || []

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
          >
            ← Back to Promotions
          </button>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {promotionData?.promotion_name || 'Loading...'}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {promotionData?.description || ''}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Promotion Items
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={() => estimateMutation.mutate()}
                disabled={estimateMutation.isPending}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {estimateMutation.isPending ? 'Estimating...' : 'Estimate Volumes'}
              </button>
            </div>
          </div>

          {itemsData.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No items added yet. Add items to this promotion.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Estimated Volume
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {itemsData.map((item: any) => (
                    <tr key={item.promotion_item_id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {item.sku_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {item.customer_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {item.discount_type === 'percentage' ? `${item.discount_value}%` : `£${item.discount_value}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.estimated_volume ? item.estimated_volume.toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

