'use client'

interface DashboardStatsProps {
  data?: {
    total_promotions?: number
    total_items?: number
    total_estimated_volume?: number
    avg_volume_per_item?: number
  }
}

export function DashboardStats({ data }: DashboardStatsProps) {
  const stats = [
    {
      name: 'Total Promotions',
      value: data?.total_promotions || 0,
      icon: '📊',
    },
    {
      name: 'Total Items',
      value: data?.total_items || 0,
      icon: '📦',
    },
    {
      name: 'Estimated Volume',
      value: data?.total_estimated_volume?.toLocaleString() || '0',
      icon: '📈',
    },
    {
      name: 'Avg Volume/Item',
      value: data?.avg_volume_per_item?.toFixed(2) || '0',
      icon: '📉',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.name}
          className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    {stat.name}
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {stat.value}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

