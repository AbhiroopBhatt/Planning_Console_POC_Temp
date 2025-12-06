'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { Network, ChevronRight, Database, Key, CheckCircle2, XCircle, Plus, Trash2, ArrowRight, Play, Loader2, FileText, X } from 'lucide-react'
import Link from 'next/link'

interface Table {
  table_name: string
  column_count: number
}

interface TableDetails {
  columns: Array<{
    column_name: string
    data_type: string
    is_nullable: boolean
    column_default: string | null
    ordinal_position: number
  }>
  primary_keys: Array<{
    column_name: string
    ordinal_position: number
  }>
}

interface Relationship {
  relationship_id?: number
  from_node: string
  from_node_column: string
  relationship_name: string
  to_node: string
  to_node_column: string
  source_table: string
  source_from_column: string
  source_to_column: string
}

export default function HierarchyManagementPage() {
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [tableDetails, setTableDetails] = useState<Record<string, TableDetails>>({})
  const [showRelationshipForm, setShowRelationshipForm] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null)
  const [relationshipForm, setRelationshipForm] = useState<Relationship>({
    from_node: '',
    from_node_column: '',
    relationship_name: '',
    to_node: '',
    to_node_column: '',
    source_table: '',
    source_from_column: '',
    source_to_column: ''
  })

  // Fetch all tables
  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['hierarchy-tables'],
    queryFn: () => api.get('/api/hierarchy/tables'),
  })

  const tables: Table[] = tablesData?.data?.data || []

  // Fetch table details when tables are selected
  const { mutate: fetchTableDetails, isPending: detailsLoading } = useMutation({
    mutationFn: async (tableNames: string[]) => {
      const response = await api.post('/api/hierarchy/tables/details', { tableNames })
      return response.data.data
    },
    onSuccess: (data) => {
      setTableDetails(data)
    },
  })

  const handleTableSelection = (tableName: string) => {
    const newSelection = selectedTables.includes(tableName)
      ? selectedTables.filter(t => t !== tableName)
      : [...selectedTables, tableName]
    
    setSelectedTables(newSelection)
    
    if (newSelection.length > 0) {
      fetchTableDetails(newSelection)
    } else {
      setTableDetails({})
    }
  }

  const handleSelectAll = () => {
    if (selectedTables.length === tables.length) {
      setSelectedTables([])
      setTableDetails({})
    } else {
      const allTableNames = tables.map(t => t.table_name)
      setSelectedTables(allTableNames)
      fetchTableDetails(allTableNames)
    }
  }

  // Fetch relationships
  const { data: relationshipsData, refetch: refetchRelationships } = useQuery({
    queryKey: ['hierarchy-relationships'],
    queryFn: () => api.get('/api/hierarchy/relationships'),
    enabled: selectedTables.length > 0
  })

  const relationships: Relationship[] = relationshipsData?.data?.data || []

  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [buildGraphStatus, setBuildGraphStatus] = useState<'idle' | 'building' | 'success' | 'error'>('idle')
  const [buildGraphStats, setBuildGraphStats] = useState<any>(null)
  const [logFileInfo, setLogFileInfo] = useState<{ filename: string; path: string } | null>(null)
  const [showLogViewer, setShowLogViewer] = useState(false)
  const [logContent, setLogContent] = useState<string>('')
  const [loadingLog, setLoadingLog] = useState(false)

  // Create/Update relationship
  const { mutate: saveRelationship, isPending: savingRelationship } = useMutation({
    mutationFn: async (rel: Relationship) => {
      if (rel.relationship_id) {
        return api.put(`/api/hierarchy/relationships/${rel.relationship_id}`, rel)
      } else {
        return api.post('/api/hierarchy/relationships', rel)
      }
    },
    onSuccess: (response) => {
      refetchRelationships()
      if (editingRelationship) {
        setSuccessMessage('Relationship updated successfully!')
      } else {
        setSuccessMessage('Relationship added successfully!')
      }
      
      // Reset form but keep it open for adding another
      setEditingRelationship(null)
      setRelationshipForm({
        from_node: '',
        from_node_column: '',
        relationship_name: '',
        to_node: '',
        to_node_column: '',
        source_table: '',
        source_from_column: '',
        source_to_column: ''
      })
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    },
    onError: (error: any) => {
      setSuccessMessage(null)
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to save relationship'
      alert(`Error: ${errorMessage}`)
      console.error('Error saving relationship:', error)
    }
  })

  // Delete relationship
  const { mutate: deleteRelationship, isPending: deletingRelationship } = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/api/hierarchy/relationships/${id}`)
      return response.data
    },
    onSuccess: () => {
      refetchRelationships()
      setSuccessMessage('Relationship deleted successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete relationship'
      alert(`Error: ${errorMessage}`)
      console.error('Error deleting relationship:', error)
    }
  })

  const handleEditRelationship = (rel: Relationship) => {
    setEditingRelationship(rel)
    setRelationshipForm(rel)
    setShowRelationshipForm(true)
  }

  const handleSubmitRelationship = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate form
    if (!relationshipForm.from_node || !relationshipForm.from_node_column || 
        !relationshipForm.relationship_name || !relationshipForm.to_node || 
        !relationshipForm.to_node_column || !relationshipForm.source_table) {
      alert('Please fill in all required fields')
      return
    }
    
    console.log('Submitting relationship:', relationshipForm)
    saveRelationship(relationshipForm)
  }

  // Build graph mutation
  const { mutate: buildGraph, isPending: buildingGraph } = useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/hierarchy/build-graph', { selectedTables })
      return response.data
    },
    onSuccess: (data) => {
      setBuildGraphStatus('success')
      setBuildGraphStats(data.stats)
      if (data.logFileName && data.logFile) {
        setLogFileInfo({ filename: data.logFileName, path: data.logFile })
      }
      setSuccessMessage(`Graph built successfully! Created ${data.stats.nodesCreated} nodes and ${data.stats.relationshipsCreated} relationships.`)
      setTimeout(() => {
        setSuccessMessage(null)
        setBuildGraphStatus('idle')
      }, 5000)
    },
    onError: (error: any) => {
      setBuildGraphStatus('error')
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to build graph'
      if (error?.response?.data?.logFileName && error?.response?.data?.logFile) {
        setLogFileInfo({ filename: error.response.data.logFileName, path: error.response.data.logFile })
      }
      setSuccessMessage(`Error: ${errorMessage}`)
      setTimeout(() => {
        setSuccessMessage(null)
        setBuildGraphStatus('idle')
      }, 5000)
      console.error('Error building graph:', error)
    }
  })

  const handleBuildGraph = () => {
    if (selectedTables.length === 0) {
      alert('Please select at least one table as a node')
      return
    }
    
    if (relationships.length === 0) {
      if (!confirm('No relationships defined. Do you want to build graph with nodes only?')) {
        return
      }
    }
    
    setBuildGraphStatus('building')
    setSuccessMessage(null)
    setLogFileInfo(null)
    buildGraph()
  }

  const handleViewLog = async () => {
    if (!logFileInfo) return
    
    setLoadingLog(true)
    setShowLogViewer(true)
    try {
      const response = await api.get(`/api/hierarchy/logs/${logFileInfo.filename}`)
      setLogContent(response.data.content)
    } catch (error) {
      console.error('Error loading log file:', error)
      setLogContent('Error loading log file. Please check the backend logs.')
    } finally {
      setLoadingLog(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/admin" className="hover:text-gray-700 dark:hover:text-gray-300">Admin</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/admin/setup" className="hover:text-gray-700 dark:hover:text-gray-300">Setup and Maintenance</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-gray-100">Hierarchy Management</span>
        </nav>

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Network className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              Hierarchy Management
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Select tables from PostgreSQL to create nodes in Neo4j graph database
            </p>
          </div>
        </div>

        {/* Step 1: Select Tables */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Step 1: Select Tables (Nodes)
            </h2>
            {tables.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                {selectedTables.length === tables.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {tablesLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading tables...</p>
            </div>
          ) : tables.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No tables found in the database</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tables.map((table) => (
                <label
                  key={table.table_name}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedTables.includes(table.table_name)
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                      : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTables.includes(table.table_name)}
                    onChange={() => handleTableSelection(table.table_name)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {table.table_name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({table.column_count} columns)
                      </span>
                    </div>
                  </div>
                  {selectedTables.includes(table.table_name) && (
                    <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  )}
                </label>
              ))}
            </div>
          )}

          {selectedTables.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                <strong>{selectedTables.length}</strong> table{selectedTables.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Primary Keys */}
        {selectedTables.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
              <Key className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Step 2: Primary Keys
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Review the primary key columns for each selected table. These will be used as node identifiers in Neo4j.
            </p>

            {detailsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-500">Loading table details...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedTables.map((tableName) => {
                  const details = tableDetails[tableName]
                  const hasPrimaryKey = details?.primary_keys && details.primary_keys.length > 0

                  return (
                    <div
                      key={tableName}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {tableName}
                        </h3>
                        {hasPrimaryKey ? (
                          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Primary Key Found
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                            <XCircle className="h-4 w-4" />
                            No Primary Key
                          </span>
                        )}
                      </div>

                      {details ? (
                        <div className="space-y-3">
                          {hasPrimaryKey ? (
                            <div>
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Primary Key Columns:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {details.primary_keys.map((pk) => (
                                  <span
                                    key={pk.column_name}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-md text-sm font-medium"
                                  >
                                    <Key className="h-3 w-3" />
                                    {pk.column_name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                ⚠️ This table does not have a primary key. You may need to select a unique column manually.
                              </p>
                            </div>
                          )}

                          <div className="mt-4">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              All Columns ({details.columns.length}):
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {details.columns.map((col) => {
                                const isPrimaryKey = details.primary_keys.some(
                                  pk => pk.column_name === col.column_name
                                )
                                return (
                                  <div
                                    key={col.column_name}
                                    className={`p-2 rounded text-sm ${
                                      isPrimaryKey
                                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                        : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {col.column_name}
                                      </span>
                                      {isPrimaryKey && (
                                        <Key className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                      )}
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {col.data_type}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Loading details...</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Define Relationships */}
        {selectedTables.length > 0 && Object.keys(tableDetails).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Step 3: Define Relationships
              </h2>
              <button
                onClick={() => {
                  setShowRelationshipForm(true)
                  setEditingRelationship(null)
                  setRelationshipForm({
                    from_node: '',
                    from_node_column: '',
                    relationship_name: '',
                    to_node: '',
                    to_node_column: '',
                    source_table: '',
                    source_from_column: '',
                    source_to_column: ''
                  })
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Relationship
              </button>
            </div>

            {/* Success Message */}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    {successMessage}
                  </p>
                </div>
              </div>
            )}

            {/* Relationship Form */}
            {showRelationshipForm && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {editingRelationship ? 'Edit Relationship' : 'Create New Relationship'}
                  </h3>
                  {!editingRelationship && (
                    <button
                      onClick={() => {
                        setShowRelationshipForm(false)
                        setRelationshipForm({
                          from_node: '',
                          from_node_column: '',
                          relationship_name: '',
                          to_node: '',
                          to_node_column: '',
                          source_table: '',
                          source_from_column: '',
                          source_to_column: ''
                        })
                        setSuccessMessage(null)
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Close
                    </button>
                  )}
                </div>
                <form onSubmit={handleSubmitRelationship} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* From Node */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        From Node (Table) *
                      </label>
                      <select
                        value={relationshipForm.from_node}
                        onChange={(e) => {
                          setRelationshipForm({ ...relationshipForm, from_node: e.target.value, from_node_column: '' })
                        }}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                      >
                        <option value="">Select table</option>
                        {selectedTables.map(table => (
                          <option key={table} value={table}>{table}</option>
                        ))}
                      </select>
                    </div>

                    {/* From Node Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        From Node Column *
                      </label>
                      <select
                        value={relationshipForm.from_node_column}
                        onChange={(e) => setRelationshipForm({ ...relationshipForm, from_node_column: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                        disabled={!relationshipForm.from_node}
                      >
                        <option value="">Select column</option>
                        {relationshipForm.from_node && tableDetails[relationshipForm.from_node]?.columns.map(col => (
                          <option key={col.column_name} value={col.column_name}>
                            {col.column_name} ({col.data_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Relationship Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Relationship Name *
                      </label>
                      <input
                        type="text"
                        value={relationshipForm.relationship_name}
                        onChange={(e) => setRelationshipForm({ ...relationshipForm, relationship_name: e.target.value })}
                        placeholder="e.g., BELONGS_TO, HAS_PARENT"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                      />
                    </div>

                    {/* To Node */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        To Node (Table) *
                      </label>
                      <select
                        value={relationshipForm.to_node}
                        onChange={(e) => {
                          setRelationshipForm({ ...relationshipForm, to_node: e.target.value, to_node_column: '' })
                        }}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                      >
                        <option value="">Select table</option>
                        {selectedTables.map(table => (
                          <option key={table} value={table}>{table}</option>
                        ))}
                      </select>
                    </div>

                    {/* To Node Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        To Node Column *
                      </label>
                      <select
                        value={relationshipForm.to_node_column}
                        onChange={(e) => setRelationshipForm({ ...relationshipForm, to_node_column: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                        disabled={!relationshipForm.to_node}
                      >
                        <option value="">Select column</option>
                        {relationshipForm.to_node && tableDetails[relationshipForm.to_node]?.columns.map(col => (
                          <option key={col.column_name} value={col.column_name}>
                            {col.column_name} ({col.data_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Source Table */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Source Table (PostgreSQL) *
                      </label>
                      <select
                        value={relationshipForm.source_table}
                        onChange={(e) => {
                          setRelationshipForm({ 
                            ...relationshipForm, 
                            source_table: e.target.value,
                            source_from_column: '',
                            source_to_column: ''
                          })
                        }}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                      >
                        <option value="">Select source table</option>
                        {tables.map(table => (
                          <option key={table.table_name} value={table.table_name}>{table.table_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Source From Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Source From Column *
                      </label>
                      <select
                        value={relationshipForm.source_from_column}
                        onChange={(e) => setRelationshipForm({ ...relationshipForm, source_from_column: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                        disabled={!relationshipForm.source_table}
                      >
                        <option value="">Select column</option>
                        {relationshipForm.source_table && tableDetails[relationshipForm.source_table]?.columns.map(col => (
                          <option key={col.column_name} value={col.column_name}>
                            {col.column_name} ({col.data_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Source To Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Source To Column *
                      </label>
                      <select
                        value={relationshipForm.source_to_column}
                        onChange={(e) => setRelationshipForm({ ...relationshipForm, source_to_column: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                        required
                        disabled={!relationshipForm.source_table}
                      >
                        <option value="">Select column</option>
                        {relationshipForm.source_table && tableDetails[relationshipForm.source_table]?.columns.map(col => (
                          <option key={col.column_name} value={col.column_name}>
                            {col.column_name} ({col.data_type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRelationshipForm(false)
                        setEditingRelationship(null)
                        setRelationshipForm({
                          from_node: '',
                          from_node_column: '',
                          relationship_name: '',
                          to_node: '',
                          to_node_column: '',
                          source_table: '',
                          source_from_column: '',
                          source_to_column: ''
                        })
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingRelationship}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingRelationship ? 'Saving...' : editingRelationship ? 'Update' : 'Create'} Relationship
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Relationships List */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Defined Relationships ({relationships.length})
              </h3>
              <div className="space-y-3">
                {relationships.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <p>No relationships defined yet. Click "Add Relationship" to create one.</p>
                  </div>
                ) : (
                  relationships.map((rel) => (
                    <div
                      key={rel.relationship_id}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-mono">
                                {rel.from_node}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400">.</span>
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {rel.from_node_column}
                              </span>
                            </div>
                            <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-md text-sm font-medium">
                              {rel.relationship_name}
                            </span>
                            <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-mono">
                                {rel.to_node}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400">.</span>
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {rel.to_node_column}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            <span className="font-medium">Source Table:</span>{' '}
                            <span className="font-mono">{rel.source_table}</span>
                            {rel.source_from_column && rel.source_to_column && (
                              <>
                                {' '}(<span className="font-mono">{rel.source_from_column}</span> →{' '}
                                <span className="font-mono">{rel.source_to_column}</span>)
                              </>
                            )}
                          </div>
                          {rel.relationship_id && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              Relationship ID: <span className="font-mono">{rel.relationship_id}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleEditRelationship(rel)}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete this relationship?\n\n${rel.from_node}.${rel.from_node_column} → ${rel.relationship_name} → ${rel.to_node}.${rel.to_node_column}`)) {
                                if (rel.relationship_id) {
                                  console.log('Deleting relationship ID:', rel.relationship_id)
                                  deleteRelationship(rel.relationship_id)
                                }
                              }
                            }}
                            disabled={deletingRelationship}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={deletingRelationship ? 'Deleting...' : 'Delete'}
                          >
                            {deletingRelationship ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Build Graph Section */}
        {selectedTables.length > 0 && Object.keys(tableDetails).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Network className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Build Graph
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Import selected nodes and relationships into Neo4j graph database
                </p>
              </div>
              <button
                onClick={handleBuildGraph}
                disabled={buildingGraph || buildGraphStatus === 'building'}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {buildingGraph || buildGraphStatus === 'building' ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Building Graph...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Build Graph
                  </>
                )}
              </button>
            </div>

            {/* Build Status */}
            {buildGraphStatus === 'building' && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                      Building graph in progress...
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                      Importing {selectedTables.length} node table(s) and {relationships.length} relationship(s) from PostgreSQL to Neo4j
                    </p>
                  </div>
                </div>
              </div>
            )}

            {buildGraphStatus === 'success' && buildGraphStats && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900 dark:text-green-300">
                      Graph built successfully!
                    </p>
                    <div className="mt-2 text-sm text-green-800 dark:text-green-400">
                      <p>• Nodes created: <strong>{buildGraphStats.nodesCreated}</strong></p>
                      <p>• Relationships created: <strong>{buildGraphStats.relationshipsCreated}</strong></p>
                      {buildGraphStats.errors && buildGraphStats.errors.length > 0 && (
                        <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
                          <p className="font-medium">Warnings:</p>
                          <ul className="list-disc list-inside mt-1">
                            {buildGraphStats.errors.slice(0, 5).map((err: string, idx: number) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {logFileInfo && (
                        <div className="mt-3 pt-3 border-t border-green-300 dark:border-green-700">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-green-700 dark:text-green-300" />
                            <span className="text-xs text-green-700 dark:text-green-300">
                              Log file: <code className="bg-green-100 dark:bg-green-900/50 px-1 py-0.5 rounded">{logFileInfo.filename}</code>
                            </span>
                            <button
                              onClick={handleViewLog}
                              className="ml-2 text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                            >
                              View Log
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {buildGraphStatus === 'error' && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900 dark:text-red-300">
                      Failed to build graph. Please check the error message above.
                    </p>
                    {logFileInfo && (
                      <div className="mt-3 pt-3 border-t border-red-300 dark:border-red-700">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-red-700 dark:text-red-300" />
                          <span className="text-xs text-red-700 dark:text-red-300">
                            Log file: <code className="bg-red-100 dark:bg-red-900/50 px-1 py-0.5 rounded">{logFileInfo.filename}</code>
                          </span>
                          <button
                            onClick={handleViewLog}
                            className="ml-2 text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                          >
                            View Log
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <strong>Note:</strong> This will clear existing graph data and create new nodes and relationships based on your current configuration. 
                All columns from node tables will be imported as properties, and relationships will be created based on your defined mappings.
              </p>
            </div>
          </div>
        )}

        {/* Log Viewer Modal */}
        {showLogViewer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Build Graph Log
                  </h3>
                  {logFileInfo && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({logFileInfo.filename})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowLogViewer(false)
                    setLogContent('')
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loadingLog ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700">
                    {logContent || 'No log content available'}
                  </pre>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => {
                    setShowLogViewer(false)
                    setLogContent('')
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
