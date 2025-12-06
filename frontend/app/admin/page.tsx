'use client'

import { Layout } from '@/components/Layout'
import Link from 'next/link'
import { Settings, Brain, Wrench } from 'lucide-react'

const adminSections = [
  {
    name: 'Setup and Maintenance',
    href: '/admin/setup',
    description: 'Configure system settings, manage data, and maintain hierarchies',
    icon: Settings,
  },
  {
    name: 'ML Configuration',
    href: '/admin/ml-config',
    description: 'Configure ML models for volume estimation',
    icon: Brain,
  },
]

export default function AdminPage() {
  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Admin Panel
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage system configurations and settings
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {adminSections.map((section) => (
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

