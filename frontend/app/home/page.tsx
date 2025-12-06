'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Layout } from '@/components/Layout'
import { DashboardStats } from '@/components/DashboardStats'
import { RecentPromotions } from '@/components/RecentPromotions'

export default function HomePage() {
  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/analytics/dashboard'),
  })

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Overview of your promotions planning
          </p>
        </div>

        <DashboardStats data={dashboardData?.data} />

        <RecentPromotions />
      </div>
    </Layout>
  )
}

