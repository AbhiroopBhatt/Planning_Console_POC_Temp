'use client'

import { useQuery } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'

export default function FundPage() {
  const { data: summary } = useQuery({
    queryKey: ['fund-summary'],
    queryFn: () => api.get('/api/fund/summary'),
  })

  const { data: allocation } = useQuery({
    queryKey: ['fund-allocation'],
    queryFn: () => api.get('/api/fund/allocation'),
  })

  const summaryData = summary?.data?.data || {}
  const allocationData = allocation?.data?.data || []

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Fund Management
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Track and manage promotional fund allocation
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Allocated</h3>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              £{parseFloat(summaryData.total_allocated || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Revenue</h3>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              £{parseFloat(summaryData.total_revenue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Promotions</h3>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {summaryData.promotion_count || 0}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Fund Allocation by Promotion
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {allocationData.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                No fund allocation data available
              </div>
            ) : (
              allocationData.map((item: any) => (
                <div key={item.promotion_id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.promotion_name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Revenue: £{parseFloat(item.estimated_revenue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        £{parseFloat(item.allocated_fund || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Allocated</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

