'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { Save, X, Edit2, Calculator, Package, Users, MapPin, Radio, Calendar, Globe, Layers, RefreshCw, ChevronDown, ChevronUp, Search, Percent, ArrowUp, ArrowDown, Filter, ArrowUpDown } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PromotionRecord {
  promo_id: number
  product_id: number
  sku_name: string
  barcode: string | null
  customer_id: number
  customer_name: string
  region_id: number
  region_name: string
  channel_id: number
  channel_name: string
  time_id: number
  date: string
  discount_pct: number
  promo_price_calculated: number | null
  cogs_snapshot: number | null
  logs_snapshot: number | null
  base_price_snapshot: number | null
  base_volume_snapshot: number | null
  promo_volume_estimate: number | null
  incremental_volume: number | null
  incremental_revenue: number | null
  incremental_margin: number | null
}

type AggregationLevel = 'overall' | 'product' | 'customer' | 'region' | 'channel' | 'date'

interface AggregatedGroup {
  key: string
  label: string
  recordCount: number
  promoIds: number[]
  base_volume_snapshot: number | null
  promo_volume_estimate: number | null
}

interface Customer {
  customer_id: number
  customer_name: string
  parent_customer_id: number | null
  parent_id?: number | null
  parent_name?: string | null
  children?: Customer[]
}

interface Region {
  region_id: number
  region_name: string
  parent_region_id: number | null
  parent_id?: number | null
  parent_name?: string | null
  children?: Region[]
}

interface Category {
  category_id: number
  category_name: string
  parent_category_id: number | null
  parent_id?: number | null
  parent_name?: string | null
  children?: Category[]
}

interface Brand {
  brand_id: number
  brand_name: string
  parent_brand_id: number | null
  parent_id?: number | null
  parent_name?: string | null
  children?: Brand[]
}

interface Product {
  product_id: number
  sku_name: string
  barcode: string | null
  category_id: number | null
  brand_id: number | null
}

interface Channel {
  channel_id: number
  channel_name: string
}

export default function FactPromotionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = params.id as string

  const [editingRecords, setEditingRecords] = useState<Set<number>>(new Set())
  const [editedVolumes, setEditedVolumes] = useState<Map<number, { base_volume_snapshot: number | null, promo_volume_estimate: number | null }>>(new Map())
  
  // Bulk edit mode
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [aggregationLevel, setAggregationLevel] = useState<AggregationLevel>('overall')
  const [bulkEditValues, setBulkEditValues] = useState<Map<string, { base_volume_snapshot: number | null, promo_volume_estimate: number | null }>>(new Map())
  
  // Chart controls
  const [chartProductView, setChartProductView] = useState<'all' | 'individual'>('all')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [timeAggregation, setTimeAggregation] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  // Edit mode state
  const [editMode, setEditMode] = useState<'view' | 'scope' | 'line'>('view')
  const [scopeEditMode, setScopeEditMode] = useState<'scope' | 'line'>('scope')

  // Scope edit state
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>([])
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>([])
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editDiscountPct, setEditDiscountPct] = useState<number | ''>('')
  
  // Scope edit UI state
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set())
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [expandedBrands, setExpandedBrands] = useState<Set<number>>(new Set())
  const [customerSearch, setCustomerSearch] = useState('')
  const [regionSearch, setRegionSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')

  // Records table sorting and filtering
  const [recordsSortColumn, setRecordsSortColumn] = useState<keyof PromotionRecord | null>(null)
  const [recordsSortDirection, setRecordsSortDirection] = useState<'asc' | 'desc'>('asc')
  const [recordsPivotFilters, setRecordsPivotFilters] = useState<Record<string, string[]>>({})
  const [recordsFilterDropdownOpen, setRecordsFilterDropdownOpen] = useState<string | null>(null)

  const { data: promotionData, isLoading } = useQuery({
    queryKey: ['fact-promotion', id],
    queryFn: () => api.get(`/api/promotions/fact/${id}`),
  })

  // Fetch hierarchies for scope editor
  const { data: customerData } = useQuery({
    queryKey: ['customer-hierarchy'],
    queryFn: () => api.get('/api/fact-data/customers/hierarchy'),
  })

  const { data: regionData } = useQuery({
    queryKey: ['region-hierarchy'],
    queryFn: () => api.get('/api/fact-data/regions/hierarchy'),
  })

  const { data: channelData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/api/fact-data/channels'),
  })

  const { data: categoryData } = useQuery({
    queryKey: ['category-hierarchy'],
    queryFn: () => api.get('/api/fact-data/categories/hierarchy'),
  })

  const { data: brandData } = useQuery({
    queryKey: ['brand-hierarchy'],
    queryFn: () => api.get('/api/fact-data/brands/hierarchy'),
  })

  const { data: productsData } = useQuery({
    queryKey: ['products', selectedCategoryIds, selectedBrandIds],
    queryFn: () => {
      const params = new URLSearchParams()
      if (selectedCategoryIds.length > 0) {
        params.append('categoryIds', selectedCategoryIds.join(','))
      }
      if (selectedBrandIds.length > 0) {
        params.append('brandIds', selectedBrandIds.join(','))
      }
      return api.get(`/api/fact-data/products?${params.toString()}`)
    },
    enabled: editMode === 'scope' && scopeEditMode === 'scope',
  })

  const customers: Customer[] = customerData?.data?.data?.customers || []
  const customerHierarchy: Customer[] = customerData?.data?.data?.hierarchy || []
  const regions: Region[] = regionData?.data?.data?.regions || []
  const regionHierarchy: Region[] = regionData?.data?.data?.hierarchy || []
  const channels: Channel[] = channelData?.data?.data || []
  const categories: Category[] = categoryData?.data?.data?.categories || []
  const categoryHierarchy: Category[] = categoryData?.data?.data?.hierarchy || []
  const brands: Brand[] = brandData?.data?.data?.brands || []
  const brandHierarchy: Brand[] = brandData?.data?.data?.hierarchy || []
  const products: Product[] = productsData?.data?.data || []

  const updateVolumesMutation = useMutation({
    mutationFn: (records: any[]) => api.put('/api/promotions/fact/volumes', { records }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fact-promotion', id] })
      setEditingRecords(new Set())
      setEditedVolumes(new Map())
      setBulkEditValues(new Map())
    },
  })

  const updateScopeMutation = useMutation({
    mutationFn: (data: any) => api.put(`/api/promotions/fact/${id}/scope`, data),
    onSuccess: async (response) => {
      const data = response.data?.data
      console.log('Scope update response:', data)
      
      // Invalidate and refetch to ensure fresh data
      // Wait a brief moment to ensure backend transaction is committed
      await new Promise(resolve => setTimeout(resolve, 100))
      await queryClient.invalidateQueries({ queryKey: ['fact-promotion', id] })
      await queryClient.refetchQueries({ queryKey: ['fact-promotion', id] })
      
      setEditMode('view')
      // Clear scope edit state
      setSelectedProductIds([])
      setSelectedCustomerIds([])
      setSelectedRegionIds([])
      setSelectedChannelIds([])
      setEditStartDate('')
      setEditEndDate('')
      setEditDiscountPct('')
      
      if (data) {
        setEditMessage({ 
          type: 'success', 
          message: `Promotion updated: ${data.records_added} added, ${data.records_updated} updated, ${data.records_deleted} deleted. New group range: ${data.new_group_range ? `${data.new_group_range.min_promo_id}-${data.new_group_range.max_promo_id}` : 'N/A'}` 
        })
        setTimeout(() => setEditMessage(null), 5000)
        
        // If records were added but group didn't expand, log a warning
        if (data.records_added > 0 && data.new_group_range) {
          console.log(`Added ${data.records_added} records. Group range: ${data.new_group_range.min_promo_id}-${data.new_group_range.max_promo_id}`)
        }
      }
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error'
      setEditMessage({ type: 'error', message: `Failed to update promotion: ${errorMsg}` })
      setTimeout(() => setEditMessage(null), 5000)
    },
  })

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: number, data: any }) => 
      api.put(`/api/promotions/fact/${id}/line/${lineId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fact-promotion', id] })
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error'
      setEditMessage({ type: 'error', message: `Failed to update line: ${errorMsg}` })
      setTimeout(() => setEditMessage(null), 5000)
    },
  })

  const [reestimateMessage, setReestimateMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [editMessage, setEditMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const reestimateVolumesMutation = useMutation({
    mutationFn: () => api.post(`/api/promotions/fact/${id}/reestimate`),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['fact-promotion', id] })
      const data = response.data?.data
      if (data) {
        const message = `Successfully re-estimated ${data.records_updated} records using ${data.model_used}. ${data.records_skipped > 0 ? `${data.records_skipped} records skipped (null base volumes).` : ''} ${data.records_failed > 0 ? `${data.records_failed} records failed.` : ''}`
        setReestimateMessage({ type: 'success', message })
        setTimeout(() => setReestimateMessage(null), 5000)
      }
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error'
      setReestimateMessage({ type: 'error', message: `Failed to re-estimate volumes: ${errorMsg}` })
      setTimeout(() => setReestimateMessage(null), 5000)
    },
  })

  const summary = promotionData?.data?.data?.summary
  const records: PromotionRecord[] = promotionData?.data?.data?.records || []

  // Get unique values for pivot filtering on records
  const recordsColumnValues = useMemo(() => {
    const values: Record<string, Set<string>> = {}
    if (records.length === 0) return values
    
    records.forEach(record => {
      // Collect unique values for each column
      if (!values.sku_name) values.sku_name = new Set()
      values.sku_name.add(record.sku_name)
      
      if (!values.customer_name) values.customer_name = new Set()
      values.customer_name.add(record.customer_name)
      
      if (!values.region_name) values.region_name = new Set()
      values.region_name.add(record.region_name)
      
      if (!values.channel_name) values.channel_name = new Set()
      values.channel_name.add(record.channel_name)
      
      if (!values.date) values.date = new Set()
      values.date.add(record.date)
    })
    return values
  }, [records])

  // Apply pivot filters to records
  const filteredRecords = useMemo(() => {
    let filtered = records
    
    Object.entries(recordsPivotFilters).forEach(([column, values]) => {
      if (values.length === 0) return
      
      filtered = filtered.filter(record => {
        const recordValue = String(record[column as keyof PromotionRecord] ?? '')
        return values.includes(recordValue)
      })
    })
    
    return filtered
  }, [records, recordsPivotFilters])

  // Sort records
  const sortedRecords = useMemo(() => {
    if (!recordsSortColumn) return filteredRecords

    return [...filteredRecords].sort((a, b) => {
      const aVal = a[recordsSortColumn]
      const bVal = b[recordsSortColumn]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return recordsSortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      // Handle dates
      if (recordsSortColumn === 'date') {
        const aDate = new Date(aVal as string).getTime()
        const bDate = new Date(bVal as string).getTime()
        return recordsSortDirection === 'asc' ? aDate - bDate : bDate - aDate
      }

      const aStr = String(aVal)
      const bStr = String(bVal)
      return recordsSortDirection === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr)
    })
  }, [filteredRecords, recordsSortColumn, recordsSortDirection])

  const handleRecordsSort = (column: keyof PromotionRecord) => {
    if (recordsSortColumn === column) {
      setRecordsSortDirection(recordsSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setRecordsSortColumn(column)
      setRecordsSortDirection('asc')
    }
  }

  const handleRecordsFilterToggle = (column: string, value: string) => {
    const currentFilters = recordsPivotFilters[column] || []
    const newFilters = currentFilters.includes(value)
      ? currentFilters.filter(v => v !== value)
      : [...currentFilters, value]
    
    setRecordsPivotFilters({
      ...recordsPivotFilters,
      [column]: newFilters
    })
  }

  const clearRecordsColumnFilter = (column: string) => {
    const newFilters = { ...recordsPivotFilters }
    delete newFilters[column]
    setRecordsPivotFilters(newFilters)
  }

  const clearAllRecordsFilters = () => {
    setRecordsPivotFilters({})
  }

  const hasActiveRecordsFilters = Object.keys(recordsPivotFilters).some(col => recordsPivotFilters[col].length > 0)

  // Track if we've initialized selections in this edit session
  const [scopeInitialized, setScopeInitialized] = useState(false)

  // Initialize scope selections from current promotion when entering edit mode
  useEffect(() => {
    if (editMode === 'scope' && scopeEditMode === 'scope' && records.length > 0 && summary) {
      // Only initialize once when entering edit mode
      if (!scopeInitialized) {
        const uniqueProducts = [...new Set(records.map(r => r.product_id))]
        const uniqueCustomers = [...new Set(records.map(r => r.customer_id))]
        const uniqueRegions = [...new Set(records.map(r => r.region_id))]
        const uniqueChannels = [...new Set(records.map(r => r.channel_id))]
        
        // Always initialize with current promotion data when entering edit mode
        setSelectedProductIds(uniqueProducts)
        setSelectedCustomerIds(uniqueCustomers)
        setSelectedRegionIds(uniqueRegions)
        setSelectedChannelIds(uniqueChannels)
        
        if (summary.start_date) {
          setEditStartDate(summary.start_date)
        }
        if (summary.end_date) {
          setEditEndDate(summary.end_date)
        }
        if (summary.discount_pct !== undefined) {
          setEditDiscountPct(summary.discount_pct)
        }
        
        setScopeInitialized(true)
      }
    } else if (editMode !== 'scope') {
      // Reset initialization flag when exiting edit mode
      setScopeInitialized(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, scopeEditMode]) // Only re-run when edit mode changes

  // Filter by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customerHierarchy
    const searchLower = customerSearch.toLowerCase()
    return customerHierarchy.filter(c => 
      c.customer_name.toLowerCase().includes(searchLower) ||
      c.customer_id.toString().includes(searchLower)
    )
  }, [customerHierarchy, customerSearch])

  const filteredRegions = useMemo(() => {
    if (!regionSearch) return regionHierarchy
    const searchLower = regionSearch.toLowerCase()
    return regionHierarchy.filter(r => 
      r.region_name.toLowerCase().includes(searchLower) ||
      r.region_id.toString().includes(searchLower)
    )
  }, [regionHierarchy, regionSearch])

  const filteredCategories = useMemo(() => {
    if (!categorySearch) return categoryHierarchy
    const searchLower = categorySearch.toLowerCase()
    return categoryHierarchy.filter(c => 
      c.category_name.toLowerCase().includes(searchLower) ||
      c.category_id.toString().includes(searchLower)
    )
  }, [categoryHierarchy, categorySearch])

  const filteredBrands = useMemo(() => {
    if (!brandSearch) return brandHierarchy
    const searchLower = brandSearch.toLowerCase()
    return brandHierarchy.filter(b => 
      b.brand_name.toLowerCase().includes(searchLower) ||
      b.brand_id.toString().includes(searchLower)
    )
  }, [brandHierarchy, brandSearch])

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    const searchLower = productSearch.toLowerCase()
    return products.filter(p =>
      p.sku_name.toLowerCase().includes(searchLower) ||
      p.barcode?.toLowerCase().includes(searchLower) ||
      p.product_id.toString().includes(searchLower)
    )
  }, [products, productSearch])

  // Recursive function to get all children IDs
  const getAllChildrenIds = (item: Customer | Region | Category | Brand): number[] => {
    const id = 'customer_id' in item ? item.customer_id 
      : 'region_id' in item ? item.region_id
      : 'category_id' in item ? item.category_id 
      : item.brand_id
    const ids = [id]
    if (item.children) {
      item.children.forEach(child => {
        ids.push(...getAllChildrenIds(child as any))
      })
    }
    return ids
  }

  const handleCustomerToggle = (customerId: number, includeChildren: boolean) => {
    setSelectedCustomerIds(prev => {
      const customer = customers.find(c => c.customer_id === customerId)
      if (!customer) return prev

      if (includeChildren) {
        const allIds = getAllChildrenIds(customer as Customer)
        const newIds = prev.filter(id => !allIds.includes(id))
        return [...newIds, ...allIds]
      } else {
        if (prev.includes(customerId)) {
          return prev.filter(id => id !== customerId)
        } else {
          return [...prev, customerId]
        }
      }
    })
  }

  const handleRegionToggle = (regionId: number, includeChildren: boolean) => {
    setSelectedRegionIds(prev => {
      const region = regions.find(r => r.region_id === regionId)
      if (!region) return prev

      if (includeChildren) {
        const allIds = getAllChildrenIds(region as Region)
        const newIds = prev.filter(id => !allIds.includes(id))
        return [...newIds, ...allIds]
      } else {
        if (prev.includes(regionId)) {
          return prev.filter(id => id !== regionId)
        } else {
          return [...prev, regionId]
        }
      }
    })
  }

  const handleCategoryToggle = (categoryId: number, includeChildren: boolean) => {
    setSelectedCategoryIds(prev => {
      const category = categories.find(c => c.category_id === categoryId)
      if (!category) return prev

      if (includeChildren) {
        const allIds = getAllChildrenIds(category as Category)
        const newIds = prev.filter(id => !allIds.includes(id))
        return [...newIds, ...allIds]
      } else {
        if (prev.includes(categoryId)) {
          return prev.filter(id => id !== categoryId)
        } else {
          return [...prev, categoryId]
        }
      }
    })
  }

  const handleBrandToggle = (brandId: number, includeChildren: boolean) => {
    setSelectedBrandIds(prev => {
      const brand = brands.find(b => b.brand_id === brandId)
      if (!brand) return prev

      if (includeChildren) {
        const allIds = getAllChildrenIds(brand as Brand)
        const newIds = prev.filter(id => !allIds.includes(id))
        return [...newIds, ...allIds]
      } else {
        if (prev.includes(brandId)) {
          return prev.filter(id => id !== brandId)
        } else {
          return [...prev, brandId]
        }
      }
    })
  }

  const handleProductToggle = (productId: number) => {
    setSelectedProductIds(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId)
      } else {
        return [...prev, productId]
      }
    })
  }

  // Render hierarchy tree (reusable component)
  const renderHierarchyTree = (
    items: (Customer | Region | Category | Brand)[],
    selectedIds: number[],
    expanded: Set<number>,
    onToggle: (id: number, includeChildren: boolean) => void,
    onExpand: (id: number) => void,
    level: number = 0
  ) => {
    return items.map((item) => {
      const id = 'customer_id' in item ? item.customer_id 
        : 'region_id' in item ? item.region_id
        : 'category_id' in item ? item.category_id 
        : item.brand_id
      const name = 'customer_name' in item ? item.customer_name
        : 'region_name' in item ? item.region_name
        : 'category_name' in item ? item.category_name
        : item.brand_name
      const isSelected = selectedIds.includes(id)
      const hasChildren = item.children && item.children.length > 0
      const isExpanded = expanded.has(id)

      return (
        <div key={id} className="select-none">
          <div 
            className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
              isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
          >
            {hasChildren && (
              <button
                type="button"
                onClick={() => onExpand(id)}
                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3 rotate-[-90deg]" />
                )}
              </button>
            )}
            {!hasChildren && <div className="w-4" />}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(id, false)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {hasChildren && (
              <button
                type="button"
                onClick={() => onToggle(id, true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                + children
              </button>
            )}
            <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
              {name} (ID: {id})
            </span>
          </div>
          {hasChildren && isExpanded && (
            <div>
              {renderHierarchyTree(
                item.children as any,
                selectedIds,
                expanded,
                onToggle,
                onExpand,
                level + 1
              )}
            </div>
          )}
        </div>
      )
    })
  }

  // Calculate total combinations for preview
  const editTotalCombinations = useMemo(() => {
    if (!editStartDate || !editEndDate) return 0
    const start = new Date(editStartDate)
    const end = new Date(editEndDate)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return selectedProductIds.length * 
           selectedCustomerIds.length * 
           selectedRegionIds.length * 
           selectedChannelIds.length * 
           days
  }, [selectedProductIds, selectedCustomerIds, selectedRegionIds, selectedChannelIds, editStartDate, editEndDate])

  // Handle scope save
  const handleScopeSave = () => {
    if (selectedCustomerIds.length === 0) {
      alert('Please select at least one customer')
      return
    }
    if (selectedRegionIds.length === 0) {
      alert('Please select at least one region')
      return
    }
    if (selectedChannelIds.length === 0) {
      alert('Please select at least one channel')
      return
    }
    if (selectedProductIds.length === 0) {
      alert('Please select at least one product')
      return
    }
    if (!editStartDate || !editEndDate) {
      alert('Please select start date and end date')
      return
    }
    if (editDiscountPct === '' || editDiscountPct === null || editDiscountPct === undefined) {
      alert('Please enter discount percentage')
      return
    }

    if (confirm(`This will update the promotion scope. ${editTotalCombinations} records will be created. Continue?`)) {
      updateScopeMutation.mutate({
        productIds: selectedProductIds,
        customerIds: selectedCustomerIds,
        regionIds: selectedRegionIds,
        channelIds: selectedChannelIds,
        startDate: editStartDate,
        endDate: editEndDate,
        discountPct: Number(editDiscountPct)
      })
    }
  }

  // Create aggregated groups based on selected level
  const aggregatedGroups = useMemo(() => {
    const groups = new Map<string, AggregatedGroup>()

    sortedRecords.forEach(record => {
      let key = ''
      let label = ''

      switch (aggregationLevel) {
        case 'overall':
          key = 'overall'
          label = 'All Records'
          break
        case 'product':
          key = `product_${record.product_id}`
          label = record.sku_name
          break
        case 'customer':
          key = `customer_${record.customer_id}`
          label = record.customer_name
          break
        case 'region':
          key = `region_${record.region_id}`
          label = record.region_name
          break
        case 'channel':
          key = `channel_${record.channel_id}`
          label = record.channel_name
          break
        case 'date':
          key = `date_${record.date}`
          label = new Date(record.date).toLocaleDateString()
          break
      }

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          recordCount: 0,
          promoIds: [],
          base_volume_snapshot: null,
          promo_volume_estimate: null
        })
      }

      const group = groups.get(key)!
      group.recordCount++
      group.promoIds.push(record.promo_id)
      
      // If all records in group have same volume, use it; otherwise null
      if (group.base_volume_snapshot === null) {
        group.base_volume_snapshot = record.base_volume_snapshot
      } else if (group.base_volume_snapshot !== record.base_volume_snapshot) {
        group.base_volume_snapshot = null // Mixed values
      }

      if (group.promo_volume_estimate === null) {
        group.promo_volume_estimate = record.promo_volume_estimate
      } else if (group.promo_volume_estimate !== record.promo_volume_estimate) {
        group.promo_volume_estimate = null // Mixed values
      }
    })

    return Array.from(groups.values())
  }, [sortedRecords, aggregationLevel])

  const handleEdit = (promoId: number) => {
    const record = sortedRecords.find(r => r.promo_id === promoId)
    if (record) {
      setEditingRecords(prev => new Set(prev).add(promoId))
      setEditedVolumes(prev => {
        const newMap = new Map(prev)
        newMap.set(promoId, {
          base_volume_snapshot: record.base_volume_snapshot,
          promo_volume_estimate: record.promo_volume_estimate
        })
        return newMap
      })
    }
  }

  const handleCancel = (promoId: number) => {
    setEditingRecords(prev => {
      const newSet = new Set(prev)
      newSet.delete(promoId)
      return newSet
    })
    setEditedVolumes(prev => {
      const newMap = new Map(prev)
      newMap.delete(promoId)
      return newMap
    })
  }

  const handleSave = async (promoId: number) => {
    const volumes = editedVolumes.get(promoId)
    if (!volumes) return

    await updateVolumesMutation.mutateAsync([{
      promo_id: promoId,
      base_volume_snapshot: volumes.base_volume_snapshot,
      promo_volume_estimate: volumes.promo_volume_estimate
    }])
  }

  const handleBulkSave = async () => {
    if (bulkEditMode) {
      // Save bulk edits
      const recordsToUpdate: any[] = []
      
      bulkEditValues.forEach((volumes, key) => {
        const group = aggregatedGroups.find(g => g.key === key)
        if (group && (volumes.base_volume_snapshot !== null || volumes.promo_volume_estimate !== null)) {
          group.promoIds.forEach(promoId => {
            recordsToUpdate.push({
              promo_id: promoId,
              base_volume_snapshot: volumes.base_volume_snapshot,
              promo_volume_estimate: volumes.promo_volume_estimate
            })
          })
        }
      })
      
      // Filter to only include records that are currently visible (after filters)
      const visiblePromoIds = new Set(sortedRecords.map(r => r.promo_id))
      const filteredUpdates = recordsToUpdate.filter(r => visiblePromoIds.has(r.promo_id))
      
      if (filteredUpdates.length > 0) {
        await updateVolumesMutation.mutateAsync(filteredUpdates)
      }
      return
    } else {
      // Save individual edits
      const recordsToUpdate = Array.from(editingRecords).map(promoId => {
        const volumes = editedVolumes.get(promoId)
        return {
          promo_id: promoId,
          base_volume_snapshot: volumes?.base_volume_snapshot || null,
          promo_volume_estimate: volumes?.promo_volume_estimate || null
        }
      })

      if (recordsToUpdate.length > 0) {
        await updateVolumesMutation.mutateAsync(recordsToUpdate)
      }
    }
  }

  const handleBulkValueChange = (key: string, field: 'base_volume_snapshot' | 'promo_volume_estimate', value: number | null) => {
    setBulkEditValues(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(key) || { base_volume_snapshot: null, promo_volume_estimate: null }
      newMap.set(key, {
        ...current,
        [field]: value
      })
      return newMap
    })
  }

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const stats = {
      totalIncrementalVolume: 0,
      totalIncrementalRevenue: 0,
      totalIncrementalMargin: 0,
      avgBaseVolume: 0,
      avgPromoVolume: 0
    }

    sortedRecords.forEach(record => {
      if (record.incremental_volume !== null) stats.totalIncrementalVolume += Number(record.incremental_volume) || 0
      if (record.incremental_revenue !== null) stats.totalIncrementalRevenue += Number(record.incremental_revenue) || 0
      if (record.incremental_margin !== null) stats.totalIncrementalMargin += Number(record.incremental_margin) || 0
      if (record.base_volume_snapshot !== null) stats.avgBaseVolume += Number(record.base_volume_snapshot) || 0
      if (record.promo_volume_estimate !== null) stats.avgPromoVolume += Number(record.promo_volume_estimate) || 0
    })

    const count = sortedRecords.length
    if (count > 0) {
      stats.avgBaseVolume = stats.avgBaseVolume / count
      stats.avgPromoVolume = stats.avgPromoVolume / count
    }

    return stats
  }, [sortedRecords])

  // Get unique products for chart product selection
  const uniqueProducts = useMemo(() => {
    const productsMap = new Map<number, { product_id: number, sku_name: string }>()
    sortedRecords.forEach(record => {
      if (!productsMap.has(record.product_id)) {
        productsMap.set(record.product_id, {
          product_id: record.product_id,
          sku_name: record.sku_name
        })
      }
    })
    return Array.from(productsMap.values()).sort((a, b) => a.sku_name.localeCompare(b.sku_name))
  }, [sortedRecords])

  // Process chart data based on selected options
  const chartData = useMemo(() => {
    if (sortedRecords.length === 0) return []

    // Filter records by product if individual product is selected
    let filteredRecords = sortedRecords
    if (chartProductView === 'individual' && selectedProductId !== null) {
      filteredRecords = sortedRecords.filter(r => r.product_id === selectedProductId)
    }

    // Group by date and aggregate volumes
    const dailyData = new Map<string, { date: string, baseVolume: number, promoVolume: number }>()
    
    filteredRecords.forEach(record => {
      if (!record.date) return
      
      const dateKey = record.date.split('T')[0] // Get date part only
      const existing = dailyData.get(dateKey) || { date: dateKey, baseVolume: 0, promoVolume: 0 }
      
      existing.baseVolume += Number(record.base_volume_snapshot) || 0
      existing.promoVolume += Number(record.promo_volume_estimate) || 0
      
      dailyData.set(dateKey, existing)
    })

    // Convert to array and sort by date - keep original date for aggregation processing
    let dataArray = Array.from(dailyData.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Apply time aggregation
    if (timeAggregation === 'weekly') {
      const weeklyData = new Map<string, { date: string, baseVolume: number, promoVolume: number, weekStart: Date, weekEnd: Date }>()
      
      dataArray.forEach(item => {
        const date = new Date(item.date)
        const dayOfWeek = date.getDay()
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Monday as start of week
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() + diff)
        weekStart.setHours(0, 0, 0, 0)
        
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        
        const weekKey = weekStart.toISOString().split('T')[0]
        const existing = weeklyData.get(weekKey) || {
          date: weekKey,
          baseVolume: 0,
          promoVolume: 0,
          weekStart,
          weekEnd
        }
        
        existing.baseVolume += item.baseVolume
        existing.promoVolume += item.promoVolume
        
        weeklyData.set(weekKey, existing)
      })
      
      dataArray = Array.from(weeklyData.values()).map(item => ({
        date: `${item.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${item.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        baseVolume: item.baseVolume,
        promoVolume: item.promoVolume,
        sortDate: item.weekStart.toISOString()
      })).sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime())
    } else if (timeAggregation === 'monthly') {
      const monthlyData = new Map<string, { date: string, baseVolume: number, promoVolume: number, monthDate: Date }>()
      
      dataArray.forEach(item => {
        const date = new Date(item.date)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
        
        const existing = monthlyData.get(monthKey) || {
          date: monthKey,
          baseVolume: 0,
          promoVolume: 0,
          monthDate: monthStart
        }
        
        existing.baseVolume += item.baseVolume
        existing.promoVolume += item.promoVolume
        
        monthlyData.set(monthKey, existing)
      })
      
      dataArray = Array.from(monthlyData.values()).map(item => ({
        date: item.monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        baseVolume: item.baseVolume,
        promoVolume: item.promoVolume,
        sortDate: item.monthDate.toISOString()
      })).sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime())
    } else {
      // Daily - format dates nicely
      dataArray = dataArray.map(item => ({
        date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        baseVolume: item.baseVolume,
        promoVolume: item.promoVolume,
        sortDate: item.date
      }))
    }

    return dataArray
  }, [filteredRecords, chartProductView, selectedProductId, timeAggregation])

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-8">Loading promotion details...</div>
      </Layout>
    )
  }

  if (!summary) {
    return (
      <Layout>
        <div className="text-center py-8 text-red-500">Promotion not found</div>
      </Layout>
    )
  }

  const hasBulkEdits = bulkEditMode && bulkEditValues.size > 0
  const hasIndividualEdits = !bulkEditMode && editingRecords.size > 0
  const hasAnyEdits = hasBulkEdits || hasIndividualEdits

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
          >
            ← Back to Promotions
          </button>
          
          {/* Re-estimate Message */}
          {reestimateMessage && (
            <div className={`mb-4 p-4 rounded-md ${
              reestimateMessage.type === 'success' 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{reestimateMessage.message}</p>
                <button
                  onClick={() => setReestimateMessage(null)}
                  className="ml-4 text-current opacity-70 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Edit Message */}
          {editMessage && (
            <div className={`mb-4 p-4 rounded-md ${
              editMessage.type === 'success' 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{editMessage.message}</p>
                <button
                  onClick={() => setEditMessage(null)}
                  className="ml-4 text-current opacity-70 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                Promotion #{summary.promo_id}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {summary.record_count?.toLocaleString()} records
              </p>
            </div>
            <div className="flex items-center gap-3">
              {editMode === 'view' ? (
                <>
                  <button
                    onClick={() => setEditMode('scope')}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="Edit promotion scope"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Promotion
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('This will re-estimate promo volumes for all records in this promotion using the active ML model. Existing estimates will be overwritten. Continue?')) {
                        reestimateVolumesMutation.mutate()
                      }
                    }}
                    disabled={reestimateVolumesMutation.isPending || updateVolumesMutation.isPending}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    title="Re-estimate promo volumes using the active ML model"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${reestimateVolumesMutation.isPending ? 'animate-spin' : ''}`} />
                    {reestimateVolumesMutation.isPending ? 'Re-estimating...' : 'Re-estimate Volumes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (confirm('Discard all changes and exit edit mode?')) {
                        setEditMode('view')
                        setEditingRecords(new Set())
                        setEditedVolumes(new Map())
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Edit
                  </button>
                  <button
                    onClick={() => setScopeEditMode(scopeEditMode === 'scope' ? 'line' : 'scope')}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {scopeEditMode === 'scope' ? (
                      <>
                        <Layers className="h-4 w-4 mr-2" />
                        Switch to Line Edit
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4 mr-2" />
                        Switch to Scope Edit
                      </>
                    )}
                  </button>
                </>
              )}
              {hasAnyEdits && editMode === 'view' && (
                <button
                  onClick={handleBulkSave}
                  disabled={updateVolumesMutation.isPending}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateVolumesMutation.isPending 
                    ? 'Saving...' 
                    : `Save ${bulkEditMode ? `All (${bulkEditValues.size} groups)` : `All (${editingRecords.size} records)`}`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scope Edit Mode - Show scope editor when in scope edit mode */}
        {editMode === 'scope' && scopeEditMode === 'scope' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-blue-500 dark:border-blue-600 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Promotion Scope</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Modify the scope selections below. Changes will add/remove/update promotion records accordingly.
            </p>

            {/* Scope Selection */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Users className="h-4 w-4 inline mr-1" />
                    Customer {selectedCustomerIds.length > 0 && `(${selectedCustomerIds.length} selected)`}
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
                    <div className="mb-2 relative">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    {filteredCustomers.length === 0 ? (
                      <div className="text-center py-4 text-sm text-gray-500">Loading customers...</div>
                    ) : (
                      renderHierarchyTree(
                        filteredCustomers,
                        selectedCustomerIds,
                        expandedCustomers,
                        handleCustomerToggle,
                        (id) => {
                          setExpandedCustomers(prev => {
                            const next = new Set(prev)
                            if (next.has(id)) {
                              next.delete(id)
                            } else {
                              next.add(id)
                            }
                            return next
                          })
                        }
                      )
                    )}
                  </div>
                </div>

                {/* Region Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    Region {selectedRegionIds.length > 0 && `(${selectedRegionIds.length} selected)`}
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
                    <div className="mb-2 relative">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search regions..."
                        value={regionSearch}
                        onChange={(e) => setRegionSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    {filteredRegions.length === 0 ? (
                      <div className="text-center py-4 text-sm text-gray-500">Loading regions...</div>
                    ) : (
                      renderHierarchyTree(
                        filteredRegions,
                        selectedRegionIds,
                        expandedRegions,
                        handleRegionToggle,
                        (id) => {
                          setExpandedRegions(prev => {
                            const next = new Set(prev)
                            if (next.has(id)) {
                              next.delete(id)
                            } else {
                              next.add(id)
                            }
                            return next
                          })
                        }
                      )
                    )}
                  </div>
                </div>

                {/* Channel Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Radio className="h-4 w-4 inline mr-1" />
                    Channel {selectedChannelIds.length > 0 && `(${selectedChannelIds.length} selected)`}
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
                    {channels.length === 0 ? (
                      <div className="text-center py-4 text-sm text-gray-500">Loading channels...</div>
                    ) : (
                      channels.map(channel => (
                        <label key={channel.channel_id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedChannelIds.includes(channel.channel_id)}
                            onChange={() => {
                              setSelectedChannelIds(prev =>
                                prev.includes(channel.channel_id)
                                  ? prev.filter(id => id !== channel.channel_id)
                                  : [...prev, channel.channel_id]
                              )
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {channel.channel_name} (ID: {channel.channel_id})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Product Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Package className="h-4 w-4 inline mr-1" />
                    Products {selectedProductIds.length > 0 && `(${selectedProductIds.length} selected)`}
                  </label>
                  
                  {/* Category Filter */}
                  <div className="mb-2">
                    <details className="border border-gray-300 dark:border-gray-600 rounded-md p-2">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by Category {selectedCategoryIds.length > 0 && `(${selectedCategoryIds.length})`}
                      </summary>
                      <div className="mt-2 max-h-48 overflow-y-auto">
                        <div className="mb-2 relative">
                          <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search categories..."
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        {filteredCategories.length === 0 ? (
                          <div className="text-center py-2 text-sm text-gray-500">Loading categories...</div>
                        ) : (
                          renderHierarchyTree(
                            filteredCategories,
                            selectedCategoryIds,
                            expandedCategories,
                            handleCategoryToggle,
                            (id) => {
                              setExpandedCategories(prev => {
                                const next = new Set(prev)
                                if (next.has(id)) {
                                  next.delete(id)
                                } else {
                                  next.add(id)
                                }
                                return next
                              })
                            }
                          )
                        )}
                      </div>
                    </details>
                  </div>

                  {/* Brand Filter */}
                  <div className="mb-2">
                    <details className="border border-gray-300 dark:border-gray-600 rounded-md p-2">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by Brand {selectedBrandIds.length > 0 && `(${selectedBrandIds.length})`}
                      </summary>
                      <div className="mt-2 max-h-48 overflow-y-auto">
                        <div className="mb-2 relative">
                          <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search brands..."
                            value={brandSearch}
                            onChange={(e) => setBrandSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        {filteredBrands.length === 0 ? (
                          <div className="text-center py-2 text-sm text-gray-500">Loading brands...</div>
                        ) : (
                          renderHierarchyTree(
                            filteredBrands,
                            selectedBrandIds,
                            expandedBrands,
                            handleBrandToggle,
                            (id) => {
                              setExpandedBrands(prev => {
                                const next = new Set(prev)
                                if (next.has(id)) {
                                  next.delete(id)
                                } else {
                                  next.add(id)
                                }
                                return next
                              })
                            }
                          )
                        )}
                      </div>
                    </details>
                  </div>

                  {/* Product List */}
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
                    <div className="mb-2 relative">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search products..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    {filteredProducts.length === 0 ? (
                      <div className="text-center py-4 text-sm text-gray-500">No products found</div>
                    ) : (
                      filteredProducts.map(product => (
                        <label key={product.product_id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(product.product_id)}
                            onChange={() => handleProductToggle(product.product_id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                            {product.sku_name} {product.barcode && `(${product.barcode})`}
                          </span>
                          <span className="text-xs text-gray-500">ID: {product.product_id}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Promotion Details */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Promotion Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      End Date
                    </label>
                    <input
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      min={editStartDate}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Percent className="h-4 w-4 inline mr-1" />
                      Discount Percentage (Save X%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editDiscountPct}
                      onChange={(e) => setEditDiscountPct(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="e.g., 50 for 50%"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    {editDiscountPct !== '' && (
                      <p className="mt-1 text-xs text-gray-500">
                        Save {editDiscountPct}%
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Updated Promotion Summary
                </h3>
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <p>Products: {selectedProductIds.length}</p>
                  <p>Customers: {selectedCustomerIds.length}</p>
                  <p>Regions: {selectedRegionIds.length}</p>
                  <p>Channels: {selectedChannelIds.length}</p>
                  {editStartDate && editEndDate && (
                    <p>Date Range: {new Date(editStartDate).toLocaleDateString()} to {new Date(editEndDate).toLocaleDateString()}</p>
                  )}
                  {editDiscountPct !== '' && <p>Discount: {editDiscountPct}%</p>}
                  <p className="font-semibold mt-2">
                    Total Records After Update: {editTotalCombinations.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Discard all changes and exit edit mode?')) {
                      setEditMode('view')
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleScopeSave}
                  disabled={updateScopeMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateScopeMutation.isPending ? 'Saving...' : `Save Scope Changes (${editTotalCombinations.toLocaleString()} records)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Discount</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{summary.discount_pct}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Date Range</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {new Date(summary.start_date).toLocaleDateString()} - {new Date(summary.end_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Incremental Volume</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {summaryStats.totalIncrementalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Incremental Revenue</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                ${summaryStats.totalIncrementalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Time Series Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Volume Time Series</h2>
          
          {/* Chart Controls */}
          <div className="mb-6 space-y-4">
            {/* Product Selection */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">View:</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chartProductView"
                    value="all"
                    checked={chartProductView === 'all'}
                    onChange={(e) => {
                      setChartProductView('all')
                      setSelectedProductId(null)
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">All Products</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chartProductView"
                    value="individual"
                    checked={chartProductView === 'individual'}
                    onChange={(e) => {
                      setChartProductView('individual')
                      if (uniqueProducts.length > 0 && selectedProductId === null) {
                        setSelectedProductId(uniqueProducts[0].product_id)
                      }
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Individual Product</span>
                </label>
              </div>
              {chartProductView === 'individual' && (
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => setSelectedProductId(parseInt(e.target.value))}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {uniqueProducts.map(product => (
                    <option key={product.product_id} value={product.product_id}>
                      {product.sku_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Time Aggregation */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Aggregation:</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="timeAggregation"
                    value="daily"
                    checked={timeAggregation === 'daily'}
                    onChange={(e) => setTimeAggregation('daily')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Daily</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="timeAggregation"
                    value="weekly"
                    checked={timeAggregation === 'weekly'}
                    onChange={(e) => setTimeAggregation('weekly')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Weekly</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="timeAggregation"
                    value="monthly"
                    checked={timeAggregation === 'monthly'}
                    onChange={(e) => setTimeAggregation('monthly')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Monthly</span>
                </label>
              </div>
            </div>
          </div>

          {/* Chart */}
          {chartData.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No volume data available for the selected criteria
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  className="dark:stroke-gray-400"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                />
                <YAxis 
                  stroke="#6b7280"
                  className="dark:stroke-gray-400"
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  label={{ value: 'Volume', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280' } }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    color: '#374151'
                  }}
                  labelStyle={{ color: '#374151', fontWeight: 'bold' }}
                  formatter={(value: any) => [Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }), '']}
                  className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                />
                <Line 
                  type="monotone" 
                  dataKey="baseVolume" 
                  name="Base Volume"
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="promoVolume" 
                  name="Promo Volume"
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bulk Edit Mode Toggle */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEditMode}
                  onChange={(e) => {
                    setBulkEditMode(e.target.checked)
                    if (!e.target.checked) {
                      setBulkEditValues(new Map())
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Layers className="h-4 w-4 inline mr-1" />
                  Bulk Edit Mode
                </span>
              </label>
              {bulkEditMode && (
                <select
                  value={aggregationLevel}
                  onChange={(e) => {
                    setAggregationLevel(e.target.value as AggregationLevel)
                    setBulkEditValues(new Map())
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="overall">Overall (All Records)</option>
                  <option value="product">By Product</option>
                  <option value="customer">By Customer</option>
                  <option value="region">By Region</option>
                  <option value="channel">By Channel</option>
                  <option value="date">By Date</option>
                </select>
              )}
            </div>
            {bulkEditMode && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {aggregatedGroups.length} {aggregationLevel === 'overall' ? 'group' : `${aggregationLevel}s`} • {sortedRecords.length} visible records
              </p>
            )}
          </div>
        </div>

        {/* Bulk Edit View */}
        {bulkEditMode && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Bulk Edit by {aggregationLevel === 'overall' ? 'Overall' : aggregationLevel.charAt(0).toUpperCase() + aggregationLevel.slice(1)}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {aggregationLevel === 'overall' ? 'Group' : aggregationLevel.charAt(0).toUpperCase() + aggregationLevel.slice(1)}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Records</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Base Volume</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Promo Volume</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {aggregatedGroups.map((group) => {
                    const bulkValue = bulkEditValues.get(group.key) || {
                      base_volume_snapshot: group.base_volume_snapshot,
                      promo_volume_estimate: group.promo_volume_estimate
                    }

                    return (
                      <tr key={group.key} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {group.label}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                          {group.recordCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bulkValue.base_volume_snapshot ?? ''}
                            onChange={(e) => handleBulkValueChange(
                              group.key,
                              'base_volume_snapshot',
                              e.target.value === '' ? null : Number(e.target.value)
                            )}
                            placeholder={group.base_volume_snapshot !== null ? String(group.base_volume_snapshot) : 'Enter volume'}
                            className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bulkValue.promo_volume_estimate ?? ''}
                            onChange={(e) => handleBulkValueChange(
                              group.key,
                              'promo_volume_estimate',
                              e.target.value === '' ? null : Number(e.target.value)
                            )}
                            placeholder={group.promo_volume_estimate !== null ? String(group.promo_volume_estimate) : 'Enter volume'}
                            className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Records Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Promotion Records {hasActiveRecordsFilters && `(${sortedRecords.length} filtered)`}
            </h2>
            <div className="flex items-center gap-3">
              {hasActiveRecordsFilters && (
                <button
                  onClick={clearAllRecordsFilters}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear Filters
                </button>
              )}
              {!bulkEditMode && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Click edit icon to modify individual records
                </p>
              )}
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveRecordsFilters && (
            <div className="px-6 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Active Filters:</span>
                {Object.entries(recordsPivotFilters).map(([col, values]) => 
                  values.length > 0 && (
                    <div key={col} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-xs">
                      <span className="font-medium">{col}:</span>
                      <span>{values.slice(0, 3).join(', ')}{values.length > 3 ? ` +${values.length - 3} more` : ''}</span>
                      <button
                        onClick={() => clearRecordsColumnFilter(col)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {[
                    { key: 'sku_name' as keyof PromotionRecord, label: 'Product', align: 'left' },
                    { key: 'customer_name' as keyof PromotionRecord, label: 'Customer', align: 'left' },
                    { key: 'region_name' as keyof PromotionRecord, label: 'Region', align: 'left' },
                    { key: 'channel_name' as keyof PromotionRecord, label: 'Channel', align: 'left' },
                    { key: 'date' as keyof PromotionRecord, label: 'Date', align: 'left' },
                    { key: 'base_price_snapshot' as keyof PromotionRecord, label: 'Base Price', align: 'right' },
                    { key: 'promo_price_calculated' as keyof PromotionRecord, label: 'Promo Price', align: 'right' },
                    { key: 'base_volume_snapshot' as keyof PromotionRecord, label: 'Base Volume', align: 'right' },
                    { key: 'promo_volume_estimate' as keyof PromotionRecord, label: 'Promo Volume', align: 'right' },
                    { key: 'incremental_volume' as keyof PromotionRecord, label: 'Incr. Volume', align: 'right' },
                    { key: 'incremental_revenue' as keyof PromotionRecord, label: 'Incr. Revenue', align: 'right' },
                    { key: 'incremental_margin' as keyof PromotionRecord, label: 'Incr. Margin', align: 'right' },
                  ].map(({ key, label, align }, colIndex) => {
                    const isSorted = recordsSortColumn === key
                    const hasFilter = recordsPivotFilters[key] && recordsPivotFilters[key].length > 0
                    const columnValues = recordsColumnValues[key] || new Set()
                    const isFirstColumn = colIndex === 0
                    return (
                      <th
                        key={key}
                        className={`px-4 py-3 text-${align} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}
                      >
                        <div className="flex items-center gap-2 group" style={{ flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
                          <button
                            onClick={() => handleRecordsSort(key)}
                            className={`flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 ${align === 'right' ? 'flex-row-reverse' : ''}`}
                          >
                            <span>{label}</span>
                            {isSorted && (
                              recordsSortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </button>
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRecordsFilterDropdownOpen(recordsFilterDropdownOpen === key ? null : key)
                              }}
                              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                                hasFilter ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                              }`}
                              title={`Filter ${label.toLowerCase()}`}
                            >
                              <Filter className="h-3 w-3" />
                            </button>
                            {recordsFilterDropdownOpen === key && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setRecordsFilterDropdownOpen(null)}
                                />
                                <div className={`absolute ${isFirstColumn ? 'left-0' : align === 'right' ? 'right-0' : 'left-0'} mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto`}>
                                  <div className="p-2">
                                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                      Filter {label}
                                    </div>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                      {Array.from(columnValues).slice(0, 100).map((value) => {
                                        const isSelected = recordsPivotFilters[key]?.includes(value) || false
                                        return (
                                          <label
                                            key={value}
                                            className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => handleRecordsFilterToggle(key, value)}
                                              className="rounded"
                                            />
                                            <span className="truncate">
                                              {key === 'date' ? new Date(value).toLocaleDateString() : value}
                                            </span>
                                          </label>
                                        )
                                      })}
                                      {Array.from(columnValues).length > 100 && (
                                        <div className="text-xs text-gray-500 p-1">
                                          Showing first 100 values
                                        </div>
                                      )}
                                    </div>
                                    {hasFilter && (
                                      <button
                                        onClick={() => clearRecordsColumnFilter(key)}
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
                  {!bulkEditMode && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {sortedRecords.map((record, idx) => {
                  const isEditing = editingRecords.has(record.promo_id)
                  const volumes = editedVolumes.get(record.promo_id) || {
                    base_volume_snapshot: record.base_volume_snapshot,
                    promo_volume_estimate: record.promo_volume_estimate
                  }

                  return (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {record.sku_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {record.customer_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {record.region_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {record.channel_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(record.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {record.base_price_snapshot !== null ? `$${Number(record.base_price_snapshot).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {record.promo_price_calculated !== null ? `$${Number(record.promo_price_calculated).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={volumes.base_volume_snapshot ?? ''}
                            onChange={(e) => {
                              const newVolumes = new Map(editedVolumes)
                              const current = newVolumes.get(record.promo_id) || { base_volume_snapshot: null, promo_volume_estimate: null }
                              newVolumes.set(record.promo_id, {
                                ...current,
                                base_volume_snapshot: e.target.value === '' ? null : Number(e.target.value)
                              })
                              setEditedVolumes(newVolumes)
                            }}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                          />
                        ) : (
                          <span className="text-gray-900 dark:text-gray-100">
                            {record.base_volume_snapshot !== null ? Number(record.base_volume_snapshot).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={volumes.promo_volume_estimate ?? ''}
                            onChange={(e) => {
                              const newVolumes = new Map(editedVolumes)
                              const current = newVolumes.get(record.promo_id) || { base_volume_snapshot: null, promo_volume_estimate: null }
                              newVolumes.set(record.promo_id, {
                                ...current,
                                promo_volume_estimate: e.target.value === '' ? null : Number(e.target.value)
                              })
                              setEditedVolumes(newVolumes)
                            }}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                          />
                        ) : (
                          <span className="text-gray-900 dark:text-gray-100">
                            {record.promo_volume_estimate !== null ? Number(record.promo_volume_estimate).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                        {record.incremental_volume !== null ? Number(record.incremental_volume).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                        {record.incremental_revenue !== null ? `$${Number(record.incremental_revenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                        {record.incremental_margin !== null ? `$${Number(record.incremental_margin).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'}
                      </td>
                      {!bulkEditMode && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleSave(record.promo_id)}
                                disabled={updateVolumesMutation.isPending}
                                className="text-green-600 hover:text-green-700"
                                title="Save"
                              >
                                <Save className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleCancel(record.promo_id)}
                                className="text-red-600 hover:text-red-700"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEdit(record.promo_id)}
                              className="text-blue-600 hover:text-blue-700"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
