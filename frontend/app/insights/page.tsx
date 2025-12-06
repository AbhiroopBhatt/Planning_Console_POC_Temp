'use client'

import { useQuery } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function InsightsPage() {
  const { data: trends } = useQuery({
    queryKey: ['trends'],
    queryFn: () => api.get('/api/analytics/trends?startDate=2025-01-01&endDate=2025-03-31'),
  })

  const chartData = trends?.data?.data?.map((item: any) => ({
    date: item.date,
    volume: parseFloat(item.total_volume) || 0,
    products: item.product_count || 0,
  })) || []

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Insights
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Analytics and trends for your promotions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Volume Trends
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="volume" stroke="#3b82f6" name="Volume" />
              <Line type="monotone" dataKey="products" stroke="#10b981" name="Products" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Layout>
  )
}

