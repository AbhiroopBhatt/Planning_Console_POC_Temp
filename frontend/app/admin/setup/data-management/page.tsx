'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { Database, ChevronRight, Search, RefreshCw, BarChart3, DollarSign, Layers, DatabaseZap, TrendingUp, ArrowUp, ArrowDown, Filter, X } from 'lucide-react'
import Link from 'next/link'

// Shared table component with sorting and filtering
function SortableTable({
  rows,
  dataLoading,
  pagination,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  pivotFilters,
  setPivotFilters,
  onPageChange,
  columns
}: {
  rows: any[]
  dataLoading: boolean
  pagination?: any
  sortBy: string | null
  setSortBy: (col: string | null) => void
  sortOrder: 'asc' | 'desc'
  setSortOrder: (order: 'asc' | 'desc') => void
  pivotFilters: Record<string, string[]>
  setPivotFilters: (filters: Record<string, string[]>) => void
  onPageChange: (page: number) => void
  columns?: string[]
}) {
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<string | null>(null)
  
  const availableColumns = columns || (rows.length > 0 ? Object.keys(rows[0]) : [])
  
  // Get unique values for pivot filtering
  const columnValues = useMemo(() => {
    const values: Record<string, Set<string>> = {}
    availableColumns.forEach(col => {
      values[col] = new Set()
      rows.forEach(row => {
        const val = row[col]
        if (val !== null && val !== undefined) {
          values[col].add(String(val))
        }
      })
    })
    return values
  }, [rows, availableColumns])

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
    onPageChange(1) // Reset to first page when sorting changes
  }

  const toggleFilter = (column: string, value: string) => {
    const currentFilters = pivotFilters[column] || []
    const newFilters = currentFilters.includes(value)
      ? currentFilters.filter(v => v !== value)
      : [...currentFilters, value]
    
    setPivotFilters({
      ...pivotFilters,
      [column]: newFilters
    })
    onPageChange(1) // Reset to first page when filter changes
  }

  const clearColumnFilter = (column: string) => {
    const newFilters = { ...pivotFilters }
    delete newFilters[column]
    setPivotFilters(newFilters)
    onPageChange(1) // Reset to first page when filter is cleared
  }

  const clearAllFilters = () => {
    setPivotFilters({})
    onPageChange(1) // Reset to first page when filters are cleared
  }

  const hasActiveFilters = Object.keys(pivotFilters).some(col => pivotFilters[col].length > 0)

  if (dataLoading) {
    return <div className="px-6 py-12 text-center text-gray-500">Loading data...</div>
  }

  if (rows.length === 0) {
    return <div className="px-6 py-12 text-center text-gray-500">No data found</div>
  }

  return (
    <>
      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Active Filters:</span>
            {Object.entries(pivotFilters).map(([col, values]) => 
              values.length > 0 && (
                <div key={col} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-xs">
                  <span className="font-medium">{col}:</span>
                  <span>{values.join(', ')}</span>
                  <button
                    onClick={() => clearColumnFilter(col)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {availableColumns.map((key, colIndex) => {
                const isSorted = sortBy === key
                const hasFilter = pivotFilters[key] && pivotFilters[key].length > 0
                const isFirstColumn = colIndex === 0
                return (
                  <th
                    key={key}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    <div className="flex items-center gap-2 group">
                      <button
                        onClick={() => handleSort(key)}
                        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1"
                      >
                        <span>{key}</span>
                        {isSorted && (
                          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        )}
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setFilterDropdownOpen(filterDropdownOpen === key ? null : key)}
                          className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                            hasFilter ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                          }`}
                          title="Filter column"
                        >
                          <Filter className="h-3 w-3" />
                        </button>
                        {filterDropdownOpen === key && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setFilterDropdownOpen(null)}
                            />
                            <div className={`absolute ${isFirstColumn ? 'left-0' : 'right-0'} mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto`}>
                              <div className="p-2">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Filter {key}
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {Array.from(columnValues[key] || []).slice(0, 100).map((value) => {
                                    const isSelected = pivotFilters[key]?.includes(value) || false
                                    return (
                                      <label
                                        key={value}
                                        className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleFilter(key, value)}
                                          className="rounded"
                                        />
                                        <span className="truncate">{value}</span>
                                      </label>
                                    )
                                  })}
                                  {Array.from(columnValues[key] || []).length > 100 && (
                                    <div className="text-xs text-gray-500 p-1">
                                      Showing first 100 values
                                    </div>
                                  )}
                                </div>
                                {hasFilter && (
                                  <button
                                    onClick={() => clearColumnFilter(key)}
                                    className="mt-2 w-full text-xs text-red-600 hover:underline"
                                  >
                                    Clear filter
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row: any, idx: number) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                {availableColumns.map((colKey, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
                  >
                    {row[colKey] !== null && row[colKey] !== undefined
                      ? String(row[colKey])
                      : <span className="text-gray-400">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page === pagination.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// DuckDB View Component
function DuckDBView({
  selectedTable,
  onTableSelect,
  page,
  setPage,
  search,
  setSearch,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  pivotFilters,
  setPivotFilters
}: {
  selectedTable: string | null
  onTableSelect: (table: string) => void
  page: number
  setPage: (page: number) => void
  search: string
  setSearch: (search: string) => void
  sortBy: string | null
  setSortBy: (col: string | null) => void
  sortOrder: 'asc' | 'desc'
  setSortOrder: (order: 'asc' | 'desc') => void
  pivotFilters: Record<string, string[]>
  setPivotFilters: (filters: Record<string, string[]>) => void
}) {
  const limit = 50

  // Reset page when filters or sort change
  useEffect(() => {
    if (selectedTable && (Object.keys(pivotFilters).length > 0 || sortBy !== null)) {
      setPage(1)
    }
  }, [JSON.stringify(pivotFilters), sortBy, sortOrder, selectedTable])

  const { data: tables, isLoading: tablesLoading, error: tablesError, refetch: refetchTables } = useQuery({
    queryKey: ['duckdb-tables'],
    queryFn: () => api.get('/api/duckdb/tables'),
  })

  const { data: tableData, isLoading: dataLoading, refetch: refetchData } = useQuery({
    queryKey: ['duckdb-table-data', selectedTable, page, search, sortBy, sortOrder, pivotFilters],
    queryFn: () => {
      if (!selectedTable) return null
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (search) params.append('search', search)
      if (sortBy) {
        params.append('sortBy', sortBy)
        params.append('sortOrder', sortOrder)
      }
      if (pivotFilters && Object.keys(pivotFilters).length > 0) {
        params.append('pivotFilters', JSON.stringify(pivotFilters))
      }
      return api.get(`/api/duckdb/tables/${selectedTable}?${params}`)
    },
    enabled: !!selectedTable,
  })

  const { data: tableSchema } = useQuery({
    queryKey: ['duckdb-table-schema', selectedTable],
    queryFn: () => api.get(`/api/duckdb/tables/${selectedTable}/schema`),
    enabled: !!selectedTable,
  })


  // Mutation for creating fact table views
  const { mutate: createFactViews, isPending: creatingViews } = useMutation({
    mutationFn: () => api.post('/api/duckdb/create-fact-views'),
    onSuccess: () => {
      refetchTables()
      alert('Fact table views created/refreshed successfully!')
    },
    onError: (error: any) => {
      alert(`Error creating views: ${error?.response?.data?.error || error.message}`)
    }
  })

  const tableList = tables?.data?.data || []
  const data = tableData?.data?.data
  const rows = data?.rows || []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      {/* Action Button */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Fact Table Materialized Views
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Create/refresh materialized views for fact_prices and fact_costs with customer rollup
            </p>
          </div>
          <button
            onClick={() => createFactViews()}
            disabled={creatingViews}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DatabaseZap className="h-4 w-4 mr-2" />
            {creatingViews ? 'Creating...' : 'Create/Refresh Fact Views'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tables List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                DuckDB Tables/Views
              </h2>
              <button
                onClick={() => refetchTables()}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
              {tablesLoading ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">Loading...</div>
              ) : tablesError ? (
                <div className="px-4 py-8 text-center text-sm text-red-500">
                  Error loading tables: {tablesError instanceof Error ? tablesError.message : 'Unknown error'}
                </div>
              ) : !tables ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No response from server</div>
              ) : tableList.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No tables found in DuckDB
                  <br />
                  <span className="text-xs text-gray-400 mt-2 block">
                    Build a graph in Hierarchy Management to create rollup views
                  </span>
                </div>
              ) : (
                tableList.map((table: any) => (
                  <button
                    key={table.name}
                    onClick={() => {
                      onTableSelect(table.name)
                      setPage(1)
                      setSearch('')
                      setSortBy(null)
                      setSortOrder('asc')
                      setPivotFilters({})
                    }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                      selectedTable === table.name
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{table.name}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {table.type || 'TABLE'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Table Data View */}
        <div className="lg:col-span-3">
          {selectedTable ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {selectedTable}
                  </h2>
                  {pagination && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {pagination.total.toLocaleString()} total rows
                    </p>
                  )}
                </div>
                <button
                  onClick={() => refetchData()}
                  className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Schema Info */}
            {tableSchema?.data?.data && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Schema
                </h3>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {tableSchema.data.data.map((col: any) => (
                    <div key={col.column_name} className="text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{col.column_name}</span>
                      <span className="text-gray-500"> ({col.data_type})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <SortableTable
                rows={rows}
                dataLoading={dataLoading}
                pagination={pagination}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                pivotFilters={pivotFilters}
                setPivotFilters={setPivotFilters}
                onPageChange={setPage}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Layers className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              Select a table or view from the left to view its data
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

type TabType = 'tables' | 'fact-data' | 'duckdb' | 'duckdb-fact-data'

export default function DataManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('tables')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [pivotFilters, setPivotFilters] = useState<Record<string, string[]>>({})
  const limit = 50

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['data-management-tables'],
    queryFn: () => api.get('/api/data-management/tables'),
  })

  const { data: tableData, isLoading: dataLoading, refetch } = useQuery({
    queryKey: ['table-data', selectedTable, page, search, sortBy, sortOrder, pivotFilters],
    queryFn: () => {
      if (!selectedTable) return null
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (search) params.append('search', search)
      if (sortBy) {
        params.append('sortBy', sortBy)
        params.append('sortOrder', sortOrder)
      }
      if (pivotFilters && Object.keys(pivotFilters).length > 0) {
        params.append('pivotFilters', JSON.stringify(pivotFilters))
      }
      return api.get(`/api/data-management/tables/${selectedTable}?${params}`)
    },
    enabled: !!selectedTable && activeTab === 'tables',
  })

  const { data: tableSchema } = useQuery({
    queryKey: ['table-schema', selectedTable],
    queryFn: () => api.get(`/api/data-management/tables/${selectedTable}/schema`),
    enabled: !!selectedTable && activeTab === 'tables',
  })

  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName)
    setPage(1)
    setSearch('')
    setSortBy(null)
    setSortOrder('asc')
    setPivotFilters({})
  }


  const tableList = tables?.data?.data || []
  const data = tableData?.data?.data
  const rows = data?.rows || []
  const pagination = data?.pagination

  return (
    <Layout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/admin" className="hover:text-gray-700 dark:hover:text-gray-300">Admin</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/admin/setup" className="hover:text-gray-700 dark:hover:text-gray-300">Setup and Maintenance</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-gray-100">Data Management</span>
        </nav>

        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Data Management
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            View and explore all tables and data in pc_postgres_db
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('tables')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tables'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Tables
              </div>
            </button>
            <button
              onClick={() => setActiveTab('fact-data')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'fact-data'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Fact Data Management
              </div>
            </button>
            <button
              onClick={() => setActiveTab('duckdb')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'duckdb'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                DuckDB Views
              </div>
            </button>
            <button
              onClick={() => setActiveTab('duckdb-fact-data')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'duckdb-fact-data'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                DuckDB Fact Data
              </div>
            </button>
          </nav>
        </div>

        {activeTab === 'fact-data' ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/admin/setup/data-management/fact-data/prices"
              className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Prices Report
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    View prices against different hierarchies of customers and products
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>

            <Link
              href="/admin/setup/data-management/fact-data/costs"
              className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Costs Report
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Analyze cost data (COGS & LOGS) across customer and product hierarchies
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>
          </div>
        ) : activeTab === 'duckdb-fact-data' ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/admin/setup/data-management/duckdb-fact-data/prices"
              className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Prices Report (DuckDB)
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    View prices from DuckDB Prices_allcombo_view with customer rollup and drilldown
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>

            <Link
              href="/admin/setup/data-management/duckdb-fact-data/costs"
              className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Costs Report (DuckDB)
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    View costs from DuckDB Costs_allcombo_view with customer rollup and drilldown
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>

            <Link
              href="/admin/setup/data-management/duckdb-fact-data/base-volumes"
              className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Base Volumes Report (DuckDB)
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    View base volumes from DuckDB Basevolume_allcombo_view with customer rollup and drilldown
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>
          </div>
        ) : activeTab === 'duckdb' ? (
          <DuckDBView
            selectedTable={selectedTable}
            onTableSelect={handleTableSelect}
            page={page}
            setPage={setPage}
            search={search}
            setSearch={setSearch}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            pivotFilters={pivotFilters}
            setPivotFilters={setPivotFilters}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
          {/* Tables List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Tables
                </h2>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
                {tablesLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">Loading...</div>
                ) : tableList.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">No tables found</div>
                ) : (
                  tableList.map((table: any) => (
                    <button
                      key={table.table_name}
                      onClick={() => handleTableSelect(table.table_name)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                        selectedTable === table.table_name
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{table.table_name}</span>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {table.column_count} columns
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Table Data View */}
          <div className="lg:col-span-3">
            {selectedTable ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {selectedTable}
                      </h2>
                      {pagination && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {pagination.total.toLocaleString()} total rows
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => refetch()}
                      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Refresh"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                {/* Schema Info */}
                {tableSchema?.data?.data && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Schema
                    </h3>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {tableSchema.data.data.map((col: any) => (
                        <div key={col.column_name} className="text-gray-600 dark:text-gray-400">
                          <span className="font-medium">{col.column_name}</span>
                          <span className="text-gray-500"> ({col.data_type})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Table */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <SortableTable
                    rows={rows}
                    dataLoading={dataLoading}
                    pagination={pagination}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    sortOrder={sortOrder}
                    setSortOrder={setSortOrder}
                    pivotFilters={pivotFilters}
                    setPivotFilters={setPivotFilters}
                    onPageChange={setPage}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Select a table from the left to view its data
                </p>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </Layout>
  )
}
