'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import Link from 'next/link'
import { Plus, Filter, ChevronDown, ChevronUp, Search, X, Package, Users, MapPin, Radio, Calendar, TrendingUp, DollarSign, BarChart3, Percent, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ArrowUpNarrowWide, ArrowDownNarrowWide, Trash2 } from 'lucide-react'

// Component for select all checkbox with indeterminate state
function SelectAllCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const checkboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <input
      type="checkbox"
      ref={checkboxRef}
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
      aria-label="Select all promotions"
    />
  )
}

interface Customer {
  customer_id: number
  customer_name: string
  parent_customer_id: number | null
  children?: Customer[]
}

interface Region {
  region_id: number
  region_name: string
  parent_region_id: number | null
  children?: Region[]
}

interface Category {
  category_id: number
  category_name: string
  parent_category_id: number | null
  children?: Category[]
}

interface Brand {
  brand_id: number
  brand_name: string
  parent_brand_id: number | null
  children?: Brand[]
}

interface Channel {
  channel_id: number
  channel_name: string
}

interface Promotion {
  promotion_id?: number // New field - unique promotion identifier
  promo_id: number // Keep for backward compatibility (maps to promotion_id or first promo_id)
  record_count: number
  discount_pct: number
  start_date: string
  end_date: string
  product_count: number
  customer_count: number
  region_count: number
  channel_count: number
  total_base_volume: number
  total_promo_volume: number
  total_incremental_volume: number
  total_incremental_revenue: number
  total_incremental_margin: number
  customer_names: string
  status: string
}

export default function PlanPage() {
  // Filter states
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>([])
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>([])
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // UI state
  const [showFilters, setShowFilters] = useState(false)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set())
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [expandedBrands, setExpandedBrands] = useState<Set<number>>(new Set())
  const [customerSearch, setCustomerSearch] = useState('')
  const [regionSearch, setRegionSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  
  // Table state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [sortColumn, setSortColumn] = useState<keyof Promotion | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [pivotFilters, setPivotFilters] = useState<Record<string, string[]>>({})
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<string | null>(null)
  
  // Selection state
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<Set<number>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const queryClient = useQueryClient()

  // Fetch hierarchies
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

  // Fetch filtered promotions
  const { data: promotionsData, isLoading } = useQuery({
    queryKey: ['promotions', selectedCategoryIds, selectedBrandIds, selectedRegionIds, selectedChannelIds, selectedCustomerIds, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams()
      if (selectedCategoryIds.length > 0) {
        params.append('categoryIds', selectedCategoryIds.join(','))
      }
      if (selectedBrandIds.length > 0) {
        params.append('brandIds', selectedBrandIds.join(','))
      }
      if (selectedRegionIds.length > 0) {
        params.append('regionIds', selectedRegionIds.join(','))
      }
      if (selectedChannelIds.length > 0) {
        params.append('channelIds', selectedChannelIds.join(','))
      }
      if (selectedCustomerIds.length > 0) {
        params.append('customerIds', selectedCustomerIds.join(','))
      }
      if (startDate) {
        params.append('startDate', startDate)
      }
      if (endDate) {
        params.append('endDate', endDate)
      }
      return api.get(`/api/promotions?${params.toString()}`)
    },
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
  
  const promotions: Promotion[] = promotionsData?.data?.data?.promotions || []
  const statistics = promotionsData?.data?.data?.statistics || {
    total_promotions: 0,
    total_records: 0,
    total_base_volume: 0,
    total_promo_volume: 0,
    total_incremental_volume: 0,
    total_incremental_revenue: 0,
    total_incremental_margin: 0,
    avg_discount: 0
  }

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (promotionIds: number[]) => {
      if (promotionIds.length === 1) {
        const promotionId = promotionIds[0]
        console.log('Deleting single promotion with Promotion_ID:', promotionId)
        const response = await api.delete(`/api/promotions/fact/${promotionId}`)
        return response
      } else {
        // For bulk delete, use DELETE with body
        console.log('Deleting bulk promotions with Promotion_IDs:', promotionIds)
        const response = await api.request({
          method: 'DELETE',
          url: '/api/promotions/fact/bulk',
          data: { promotionIds }
        })
        return response
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      setSelectedPromotionIds(new Set())
      setShowDeleteConfirm(false)
      // Auto-dismiss success message after 3 seconds
      setTimeout(() => {
        deleteMutation.reset()
      }, 3000)
    },
    onError: (error: any) => {
      console.error('Delete error:', error)
      console.error('Error response:', error?.response)
      // Auto-dismiss error message after 5 seconds
      setTimeout(() => {
        deleteMutation.reset()
      }, 5000)
    },
  })

  // Selection handlers
  const handleSelectPromotion = (promotionId: number) => {
    setSelectedPromotionIds(prev => {
      const next = new Set(prev)
      if (next.has(promotionId)) {
        next.delete(promotionId)
      } else {
        next.add(promotionId)
      }
      return next
    })
  }

  const handleDelete = () => {
    const idsToDelete = Array.from(selectedPromotionIds)
    // Validate that we have promotion_id values (Promotion_ID), not promo_id values
    // promotion_id is the Promotion_ID that groups all records together
    const validIds = idsToDelete.filter(id => {
      const promo = promotions.find(p => (p.promotion_id ?? p.promo_id) === id)
      // Ensure we're using promotion_id (Promotion_ID), not promo_id
      if (promo && promo.promotion_id !== undefined) {
        return promo.promotion_id === id
      }
      // If promotion_id is undefined, log a warning but still try to delete
      if (promo && promo.promotion_id === undefined) {
        console.warn('Warning: promotion_id is undefined for promotion, using promo_id as fallback:', promo)
      }
      return true
    })
    
    console.log('Deleting promotions with Promotion_IDs:', validIds)
    console.log('Selected promotions details:', validIds.map(id => {
      const promo = promotions.find(p => (p.promotion_id ?? p.promo_id) === id)
      return { 
        selectedId: id, 
        promotion_id: promo?.promotion_id, 
        promo_id: promo?.promo_id,
        usingPromotionId: promo?.promotion_id === id
      }
    }))
    
    deleteMutation.mutate(validIds)
  }

  // Clear selection when filters change
  useEffect(() => {
    setSelectedPromotionIds(new Set())
  }, [selectedCategoryIds, selectedBrandIds, selectedRegionIds, selectedChannelIds, selectedCustomerIds, startDate, endDate])

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

  const clearFilters = () => {
    setSelectedCategoryIds([])
    setSelectedBrandIds([])
    setSelectedRegionIds([])
    setSelectedChannelIds([])
    setSelectedCustomerIds([])
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = selectedCategoryIds.length > 0 || 
    selectedBrandIds.length > 0 || 
    selectedRegionIds.length > 0 || 
    selectedChannelIds.length > 0 || 
    selectedCustomerIds.length > 0 || 
    startDate || 
    endDate

  // Render hierarchy tree
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  // Sorting
  const handleSort = (column: keyof Promotion) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
    setCurrentPage(1) // Reset to first page when sorting changes
  }

  // Get unique values for pivot filtering
  const columnValues = useMemo(() => {
    const values: Record<string, Set<string>> = {}
    if (promotions.length === 0) return values
    
    // Collect unique values for each column
    promotions.forEach(promo => {
      // promo_id / promotion_id
      if (!values.promo_id) values.promo_id = new Set()
      values.promo_id.add(String(promo.promotion_id || promo.promo_id))
      
      // discount_pct
      if (!values.discount_pct) values.discount_pct = new Set()
      values.discount_pct.add(String(promo.discount_pct))
      
      // record_count
      if (!values.record_count) values.record_count = new Set()
      values.record_count.add(String(promo.record_count))
      
      // product_count
      if (!values.product_count) values.product_count = new Set()
      values.product_count.add(String(promo.product_count))
      
      // customer_count
      if (!values.customer_count) values.customer_count = new Set()
      values.customer_count.add(String(promo.customer_count))
      
      // region_count
      if (!values.region_count) values.region_count = new Set()
      values.region_count.add(String(promo.region_count))
      
      // channel_count
      if (!values.channel_count) values.channel_count = new Set()
      values.channel_count.add(String(promo.channel_count))
      
      // status
      if (!values.status) values.status = new Set()
      values.status.add(promo.status || 'draft')
      
      // customer_names (first customer name for simplicity)
      if (!values.customer_names) values.customer_names = new Set()
      if (promo.customer_names) {
        promo.customer_names.split(',').forEach(name => {
          const trimmed = name.trim()
          if (trimmed) values.customer_names.add(trimmed)
        })
      }
    })
    return values
  }, [promotions])

  // Apply pivot filters
  const filteredPromotions = useMemo(() => {
    let filtered = promotions
    
    Object.entries(pivotFilters).forEach(([column, values]) => {
      if (values.length === 0) return
      
      filtered = filtered.filter(promo => {
        if (column === 'customer_names') {
          const names = promo.customer_names?.split(',').map(n => n.trim()) || []
          return values.some(v => names.includes(v))
        }
        
        const promoValue = String(promo[column as keyof Promotion] ?? '')
        return values.includes(promoValue)
      })
    })
    
    return filtered
  }, [promotions, pivotFilters])

  const sortedPromotions = useMemo(() => {
    if (!sortColumn) return filteredPromotions

    return [...filteredPromotions].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      const aStr = String(aVal)
      const bStr = String(bVal)
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr)
    })
  }, [filteredPromotions, sortColumn, sortDirection])

  const handleFilterToggle = (column: string, value: string) => {
    const currentFilters = pivotFilters[column] || []
    const newFilters = currentFilters.includes(value)
      ? currentFilters.filter(v => v !== value)
      : [...currentFilters, value]
    
    setPivotFilters({
      ...pivotFilters,
      [column]: newFilters
    })
    setCurrentPage(1) // Reset to first page when filter changes
  }

  const clearColumnFilter = (column: string) => {
    const newFilters = { ...pivotFilters }
    delete newFilters[column]
    setPivotFilters(newFilters)
    setCurrentPage(1)
  }

  const clearAllPivotFilters = () => {
    setPivotFilters({})
    setCurrentPage(1)
  }

  const hasActivePivotFilters = Object.keys(pivotFilters).some(col => pivotFilters[col].length > 0)

  // Pagination
  const totalPages = Math.ceil(sortedPromotions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedPromotions = sortedPromotions.slice(startIndex, endIndex)

  // Check if all on current page are selected
  const allSelectedOnPage = useMemo(() => {
    if (paginatedPromotions.length === 0) return false
    // Always use promotion_id (Promotion_ID) for selection
    const allIds = paginatedPromotions.map(p => p.promotion_id ?? p.promo_id).filter((id): id is number => id !== undefined)
    return allIds.length > 0 && allIds.every(id => selectedPromotionIds.has(id))
  }, [paginatedPromotions, selectedPromotionIds])

  // Check if some (but not all) on current page are selected
  const someSelectedOnPage = useMemo(() => {
    if (paginatedPromotions.length === 0) return false
    // Always use promotion_id (Promotion_ID) for selection
    const allIds = paginatedPromotions.map(p => p.promotion_id ?? p.promo_id).filter((id): id is number => id !== undefined)
    const selectedCount = allIds.filter(id => selectedPromotionIds.has(id)).length
    return selectedCount > 0 && selectedCount < allIds.length
  }, [paginatedPromotions, selectedPromotionIds])

  // Handle select all - defined after paginatedPromotions is available
  const handleSelectAll = () => {
    // Always use promotion_id (Promotion_ID) for selection, not promo_id
    // promotion_id is the Promotion_ID that groups all records together
    const allIds = paginatedPromotions.map(p => p.promotion_id ?? p.promo_id).filter((id): id is number => id !== undefined)
    const allSelected = allIds.every(id => selectedPromotionIds.has(id))
    
    if (allSelected) {
      // Deselect all on current page
      setSelectedPromotionIds(prev => {
        const next = new Set(prev)
        allIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      // Select all on current page
      setSelectedPromotionIds(prev => {
        const next = new Set(prev)
        allIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategoryIds, selectedBrandIds, selectedRegionIds, selectedChannelIds, selectedCustomerIds, startDate, endDate])

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
              Promotions Planning
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Create and manage your promotional campaigns
            </p>
          </div>
          <Link
            href="/plan/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Promotion
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-gray-100">Filters</span>
              {hasActiveFilters && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium rounded-full">
                  Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    clearFilters()
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear All
                </button>
              )}
              {showFilters ? (
                <ChevronUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              )}
            </div>
          </button>

          {showFilters && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Package className="h-4 w-4 inline mr-1" />
                    Category
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-48 overflow-y-auto">
                    <div className="mb-2">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search categories..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                      />
                    </div>
                    {renderHierarchyTree(
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
                    )}
                  </div>
                </div>

                {/* Brand Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Package className="h-4 w-4 inline mr-1" />
                    Brand
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-48 overflow-y-auto">
                    <div className="mb-2">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search brands..."
                        value={brandSearch}
                        onChange={(e) => setBrandSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                      />
                    </div>
                    {renderHierarchyTree(
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
                    )}
                  </div>
                </div>

                {/* Customer Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Users className="h-4 w-4 inline mr-1" />
                    Customer
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-48 overflow-y-auto">
                    <div className="mb-2">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                      />
                    </div>
                    {renderHierarchyTree(
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
                    )}
                  </div>
                </div>

                {/* Region Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <MapPin className="h-4 w-4 inline mr-1" />
                    Region
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-48 overflow-y-auto">
                    <div className="mb-2">
                      <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search regions..."
                        value={regionSearch}
                        onChange={(e) => setRegionSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                      />
                    </div>
                    {renderHierarchyTree(
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
                    )}
                  </div>
                </div>

                {/* Channel Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Radio className="h-4 w-4 inline mr-1" />
                    Channel
                  </label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-48 overflow-y-auto">
                    {channels.map(channel => (
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
                    ))}
                  </div>
                </div>

                {/* Date Range Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    Date Range
                  </label>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Statistics */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Promotion Strategy Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Promotions</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {statistics.total_promotions}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Records</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {statistics.total_records.toLocaleString()}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Discount</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {statistics.avg_discount.toFixed(1)}%
              </p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Base Volume</p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {statistics.total_base_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Promo Volume</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {statistics.total_promo_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Incremental Revenue</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                ${statistics.total_incremental_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Incremental Margin</p>
              <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                ${statistics.total_incremental_margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>

        {/* Promotions List */}
        {isLoading ? (
          <div className="text-center py-8">Loading promotions...</div>
        ) : promotions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {hasActiveFilters 
                ? 'No promotions match the selected filters.' 
                : 'No promotions yet. Create your first promotion to get started.'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Clear Filters
              </button>
            ) : (
              <Link
                href="/plan/new"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Promotion
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Table Header with Controls */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, sortedPromotions.length)} of {sortedPromotions.length} promotions
                </span>
                {hasActivePivotFilters && (
                  <button
                    onClick={clearAllPivotFilters}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <X className="h-3 w-3" />
                    Clear Pivot Filters
                  </button>
                )}
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>
              {selectedPromotionIds.size > 0 && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete ({selectedPromotionIds.size})
                </button>
              )}
            </div>

            {/* Active Pivot Filters Display */}
            {hasActivePivotFilters && (
              <div className="px-6 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
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
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      <SelectAllCheckbox
                        checked={allSelectedOnPage}
                        indeterminate={someSelectedOnPage && !allSelectedOnPage}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => handleSort('promo_id')}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1"
                        >
                          ID
                          {sortColumn === 'promo_id' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilterDropdownOpen(filterDropdownOpen === 'promo_id' ? null : 'promo_id')
                            }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                              pivotFilters.promo_id && pivotFilters.promo_id.length > 0 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : 'text-gray-400'
                            }`}
                            title="Filter ID"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                          {filterDropdownOpen === 'promo_id' && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setFilterDropdownOpen(null)}
                              />
                              <div className="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
                                <div className="p-2">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Promotion ID
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {Array.from(columnValues.promo_id || []).slice(0, 100).map((value) => {
                                      const isSelected = pivotFilters.promo_id?.includes(value) || false
                                      return (
                                        <label
                                          key={value}
                                          className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterToggle('promo_id', value)}
                                            className="rounded"
                                          />
                                          <span className="truncate">#{value}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                  {pivotFilters.promo_id && pivotFilters.promo_id.length > 0 && (
                                    <button
                                      onClick={() => clearColumnFilter('promo_id')}
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
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => handleSort('discount_pct')}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1"
                        >
                          Discount
                          {sortColumn === 'discount_pct' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilterDropdownOpen(filterDropdownOpen === 'discount_pct' ? null : 'discount_pct')
                            }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                              pivotFilters.discount_pct && pivotFilters.discount_pct.length > 0 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : 'text-gray-400'
                            }`}
                            title="Filter discount"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                          {filterDropdownOpen === 'discount_pct' && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setFilterDropdownOpen(null)}
                              />
                              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
                                <div className="p-2">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Discount %
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {Array.from(columnValues.discount_pct || []).sort((a, b) => Number(a) - Number(b)).map((value) => {
                                      const isSelected = pivotFilters.discount_pct?.includes(value) || false
                                      return (
                                        <label
                                          key={value}
                                          className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterToggle('discount_pct', value)}
                                            className="rounded"
                                          />
                                          <span>{value}%</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                  {pivotFilters.discount_pct && pivotFilters.discount_pct.length > 0 && (
                                    <button
                                      onClick={() => clearColumnFilter('discount_pct')}
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
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => handleSort('start_date')}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1"
                        >
                          Date Range
                          {sortColumn === 'start_date' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      <div className="flex items-center gap-2 group">
                        <button
                          onClick={() => handleSort('customer_names' as keyof Promotion)}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1"
                        >
                          <span>Customers</span>
                          {sortColumn === 'customer_names' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilterDropdownOpen(filterDropdownOpen === 'customer_names' ? null : 'customer_names')
                            }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                              pivotFilters.customer_names && pivotFilters.customer_names.length > 0 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : 'text-gray-400'
                            }`}
                            title="Filter customers"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                          {filterDropdownOpen === 'customer_names' && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setFilterDropdownOpen(null)}
                              />
                              <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
                                <div className="p-2">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Customers
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {Array.from(columnValues.customer_names || []).slice(0, 50).map((value) => {
                                      const isSelected = pivotFilters.customer_names?.includes(value) || false
                                      return (
                                        <label
                                          key={value}
                                          className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterToggle('customer_names', value)}
                                            className="rounded"
                                          />
                                          <span className="truncate">{value}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                  {pivotFilters.customer_names && pivotFilters.customer_names.length > 0 && (
                                    <button
                                      onClick={() => clearColumnFilter('customer_names')}
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
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center justify-end gap-2 group">
                        <button
                          onClick={() => handleSort('record_count')}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1 justify-end"
                        >
                          Records
                          {sortColumn === 'record_count' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilterDropdownOpen(filterDropdownOpen === 'record_count' ? null : 'record_count')
                            }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                              pivotFilters.record_count && pivotFilters.record_count.length > 0 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : 'text-gray-400'
                            }`}
                            title="Filter records"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                          {filterDropdownOpen === 'record_count' && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setFilterDropdownOpen(null)}
                              />
                              <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
                                <div className="p-2">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Record Count
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {Array.from(columnValues.record_count || []).sort((a, b) => Number(a) - Number(b)).slice(0, 50).map((value) => {
                                      const isSelected = pivotFilters.record_count?.includes(value) || false
                                      return (
                                        <label
                                          key={value}
                                          className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterToggle('record_count', value)}
                                            className="rounded"
                                          />
                                          <span>{value}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                  {pivotFilters.record_count && pivotFilters.record_count.length > 0 && (
                                    <button
                                      onClick={() => clearColumnFilter('record_count')}
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
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center justify-end gap-2 group">
                        <button
                          onClick={() => handleSort('total_incremental_revenue')}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1 justify-end"
                        >
                          Inc. Revenue
                          {sortColumn === 'total_incremental_revenue' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center justify-end gap-2 group">
                        <button
                          onClick={() => handleSort('total_incremental_margin')}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100 flex-1 justify-end"
                        >
                          Inc. Margin
                          {sortColumn === 'total_incremental_margin' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      <div className="flex items-center justify-center gap-2 group">
                        <button
                          onClick={() => handleSort('product_count' as keyof Promotion)}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100"
                          title="Sort by product count"
                        >
                          <span>Scope</span>
                          {sortColumn === 'product_count' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => handleSort('status' as keyof Promotion)}
                    >
                      <div className="flex items-center justify-center gap-2 group">
                        <button
                          onClick={() => handleSort('status' as keyof Promotion)}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-100"
                        >
                          <span>Status</span>
                          {sortColumn === 'status' ? (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilterDropdownOpen(filterDropdownOpen === 'status' ? null : 'status')
                            }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                              pivotFilters.status && pivotFilters.status.length > 0 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : 'text-gray-400'
                            }`}
                            title="Filter status"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                          {filterDropdownOpen === 'status' && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setFilterDropdownOpen(null)}
                              />
                              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="p-2">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Status
                                  </div>
                                  <div className="space-y-1">
                                    {Array.from(columnValues.status || []).map((value) => {
                                      const isSelected = pivotFilters.status?.includes(value) || false
                                      return (
                                        <label
                                          key={value}
                                          className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-xs"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterToggle('status', value)}
                                            className="rounded"
                                          />
                                          <span className="capitalize">{value}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                  {pivotFilters.status && pivotFilters.status.length > 0 && (
                                    <button
                                      onClick={() => clearColumnFilter('status')}
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
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedPromotions.map((promo: Promotion) => {
                    // Always use promotion_id (Promotion_ID) for deletion, not promo_id
                    // promotion_id is the Promotion_ID that groups all records together
                    const promotionId = promo.promotion_id ?? promo.promo_id
                    const isSelected = promotionId !== undefined && selectedPromotionIds.has(promotionId)
                    return (
                    <tr
                      key={promo.promo_id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => window.location.href = `/plan/fact/${promotionId}`}
                    >
                      <td 
                        className="px-4 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => promotionId !== undefined && handleSelectPromotion(promotionId)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          aria-label={`Select promotion ${promotionId}`}
                        />
                      </td>
                      <td 
                        className="px-6 py-4 whitespace-nowrap"
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          #{promo.promotion_id || promo.promo_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          <Percent className="h-3 w-3 mr-1" />
                          {promo.discount_pct}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(promo.start_date)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          to {formatDate(promo.end_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={promo.customer_names}>
                          {promo.customer_names || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">
                        {promo.record_count.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-blue-600 dark:text-blue-400">
                        ${promo.total_incremental_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-purple-600 dark:text-purple-400">
                        ${promo.total_incremental_margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1" title={`${promo.product_count} products`}>
                            <Package className="h-3 w-3" />
                            {promo.product_count}
                          </span>
                          <span className="flex items-center gap-1" title={`${promo.customer_count} customers`}>
                            <Users className="h-3 w-3" />
                            {promo.customer_count}
                          </span>
                          <span className="flex items-center gap-1" title={`${promo.region_count} regions`}>
                            <MapPin className="h-3 w-3" />
                            {promo.region_count}
                          </span>
                          <span className="flex items-center gap-1" title={`${promo.channel_count} channels`}>
                            <Radio className="h-3 w-3" />
                            {promo.channel_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          promo.status === 'active' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : promo.status === 'draft'
                            ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                          {promo.status || 'Draft'}
                        </span>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Delete Promotions?
                </h3>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Are you sure you want to delete <strong>{selectedPromotionIds.size}</strong> promotion(s)? 
                  This action cannot be undone and will delete all records associated with these promotions.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success/Error Messages */}
        {deleteMutation.isSuccess && (
          <div className="fixed bottom-4 right-4 z-50 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Successfully deleted promotion(s)
            </p>
          </div>
        )}
        {deleteMutation.isError && (
          <div className="fixed bottom-4 right-4 z-50 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {deleteMutation.error?.response?.data?.error || deleteMutation.error?.message || 'Failed to delete promotions. Please try again.'}
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
