'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { ChevronDown, ChevronUp, Search, X, Calendar, Percent, Package, Users, MapPin, Radio } from 'lucide-react'

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

export default function NewPromotionPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  
  // Scope selections
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>([])
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>([])
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  
  // Form data
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [discountPct, setDiscountPct] = useState<number | ''>('')
  
  // UI state
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set())
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [expandedBrands, setExpandedBrands] = useState<Set<number>>(new Set())
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [regionSearch, setRegionSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')

  // Fetch hierarchies
  const { data: customerData } = useQuery({
    queryKey: ['customer-hierarchy'],
    queryFn: () => api.get('/api/fact-data/customers/hierarchy'),
  })

  const { data: regionData, isLoading: regionsLoading, error: regionsError } = useQuery({
    queryKey: ['region-hierarchy'],
    queryFn: () => api.get('/api/fact-data/regions/hierarchy'),
  })

  const { data: channelData, isLoading: channelsLoading, error: channelsError } = useQuery({
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
  })

  const customers: Customer[] = customerData?.data?.data?.customers || []
  const customerHierarchy: Customer[] = customerData?.data?.data?.hierarchy || []
  const regions: Region[] = regionData?.data?.data?.regions || []
  const regionHierarchy: Region[] = regionData?.data?.data?.hierarchy || []
  const channels: Channel[] = channelData?.data?.data || []

  // Debug: Log data to console
  console.log('Region Data:', regionData)
  console.log('Channel Data:', channelData)
  console.log('Regions:', regions)
  console.log('Region Hierarchy:', regionHierarchy)
  console.log('Channels:', channels)
  console.log('Regions Error:', regionsError)
  console.log('Channels Error:', channelsError)
  const categories: Category[] = categoryData?.data?.data?.categories || []
  const categoryHierarchy: Category[] = categoryData?.data?.data?.hierarchy || []
  const brands: Brand[] = brandData?.data?.data?.brands || []
  const brandHierarchy: Brand[] = brandData?.data?.data?.hierarchy || []
  const products: Product[] = productsData?.data?.data || []

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

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/promotions/create-fact', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      router.push(`/plan`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
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
    if (!startDate || !endDate) {
      alert('Please select start date and end date')
      return
    }
    if (discountPct === '' || discountPct === null || discountPct === undefined) {
      alert('Please enter discount percentage')
      return
    }

    createMutation.mutate({
      productIds: selectedProductIds,
      customerIds: selectedCustomerIds,
      regionIds: selectedRegionIds,
      channelIds: selectedChannelIds,
      startDate,
      endDate,
      discountPct: Number(discountPct)
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

  // Calculate total combinations
  const totalCombinations = useMemo(() => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return selectedProductIds.length * 
           selectedCustomerIds.length * 
           selectedRegionIds.length * 
           selectedChannelIds.length * 
           days
  }, [selectedProductIds, selectedCustomerIds, selectedRegionIds, selectedChannelIds, startDate, endDate])

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
          >
            ← Back to Promotions
          </button>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            Create New Promotion
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Select scope and enter promotion details
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Scope Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Scope Selection
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Users className="h-4 w-4 inline mr-1" />
                  Customer {selectedCustomerIds.length > 0 && `(${selectedCustomerIds.length} selected)`}
                </label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
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

              {/* Region Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <MapPin className="h-4 w-4 inline mr-1" />
                  Region {selectedRegionIds.length > 0 && `(${selectedRegionIds.length} selected)`}
                </label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
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
                  {regionsLoading ? (
                    <div className="text-center py-4 text-sm text-gray-500">Loading regions...</div>
                  ) : regionsError ? (
                    <div className="text-center py-4 text-sm text-red-500">
                      Error loading regions: {regionsError instanceof Error ? regionsError.message : 'Unknown error'}
                    </div>
                  ) : filteredRegions.length === 0 ? (
                    <div className="text-center py-4 text-sm text-gray-500">No regions found</div>
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
                  {channelsLoading ? (
                    <div className="text-center py-4 text-sm text-gray-500">Loading channels...</div>
                  ) : channelsError ? (
                    <div className="text-center py-4 text-sm text-red-500">
                      Error loading channels: {channelsError instanceof Error ? channelsError.message : 'Unknown error'}
                    </div>
                  ) : channels.length === 0 ? (
                    <div className="text-center py-4 text-sm text-gray-500">No channels found</div>
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
                  </details>
                </div>

                {/* Brand Filter */}
                <div className="mb-2">
                  <details className="border border-gray-300 dark:border-gray-600 rounded-md p-2">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filter by Brand {selectedBrandIds.length > 0 && `(${selectedBrandIds.length})`}
                    </summary>
                    <div className="mt-2 max-h-48 overflow-y-auto">
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
                  </details>
                </div>

                {/* Product List */}
                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-64 overflow-y-auto">
                  <div className="mb-2">
                    <Search className="h-4 w-4 absolute mt-2.5 ml-2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                    />
                  </div>
                  {filteredProducts.map(product => (
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
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Promotion Details */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Promotion Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
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
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g., 50 for 50%"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
                {discountPct !== '' && (
                  <p className="mt-1 text-xs text-gray-500">
                    Save {discountPct}%
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Promotion Summary
            </h3>
            <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <p>Products: {selectedProductIds.length}</p>
              <p>Customers: {selectedCustomerIds.length}</p>
              <p>Regions: {selectedRegionIds.length}</p>
              <p>Channels: {selectedChannelIds.length}</p>
              {startDate && endDate && (
                <p>Date Range: {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}</p>
              )}
              {discountPct !== '' && <p>Discount: {discountPct}%</p>}
              <p className="font-semibold mt-2">
                Total Records to Create: {totalCombinations.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || totalCombinations === 0}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : `Create Promotion (${totalCombinations.toLocaleString()} records)`}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
