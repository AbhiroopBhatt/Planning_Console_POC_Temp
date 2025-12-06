'use client'

import { Layout } from '@/components/Layout'
import Link from 'next/link'
import { Settings, Network, Database, Wrench, ChevronRight } from 'lucide-react'

const setupSections = [
  {
    name: 'Hierarchy Management',
    href: '/admin/setup/hierarchy',
    description: 'Configure and manage hierarchical relationships in Neo4j',
    icon: Network,
  },
  {
    name: 'Data Management',
    href: '/admin/setup/data-management',
    description: 'View and explore all tables and data in PostgreSQL',
    icon: Database,
  },
]

export default function SetupPage() {
  return (
    <Layout>
      <div className="space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/admin" className="hover:text-gray-700 dark:hover:text-gray-300">Admin</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-gray-100">Setup and Maintenance</span>
        </nav>

        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Setup and Maintenance
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Configure system settings, manage data, and maintain hierarchies
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {setupSections.map((section) => (
            <Link
              key={section.name}
              href={section.href}
              className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <section.icon className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {section.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  )
}

