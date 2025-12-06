'use client'

import { useQuery } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns'
import { useState } from 'react'

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const { data } = useQuery({
    queryKey: ['calendar-events', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: () => {
      const startDate = monthStart.toISOString().split('T')[0]
      const endDate = monthEnd.toISOString().split('T')[0]
      return api.get(`/api/calendar/events?startDate=${startDate}&endDate=${endDate}`)
    },
  })

  const events = data?.data?.data || []

  const getEventsForDate = (date: Date) => {
    return events.filter((event: any) => {
      const start = new Date(event.start)
      const end = new Date(event.end)
      return date >= start && date <= end
    })
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
              Calendar
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              View and manage your promotional calendar
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="bg-gray-50 dark:bg-gray-800 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {day}
              </div>
            ))}
            {days.map((day) => {
              const dayEvents = getEventsForDate(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-white dark:bg-gray-800 min-h-[100px] p-2 ${
                    !isSameMonth(day, currentDate) ? 'opacity-50' : ''
                  } ${isToday(day) ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    isToday(day) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event: any) => (
                      <div
                        key={event.id}
                        className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded px-1 py-0.5 truncate"
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Layout>
  )
}

