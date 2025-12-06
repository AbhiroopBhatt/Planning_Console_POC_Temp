'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { api } from '@/lib/api'
import { ChevronRight, Filter, Download, RefreshCw, ChevronDown, ChevronUp, X, Search, BarChart3, Users, Package, DollarSign } from 'lucide-react'
import Link from 'next/link'

interface Customer {
  customer_id: number
  customer_name: string
  parent_customer_id: number | null
  parent_id?: number | null
  parent_name?: string | null
  children?: Customer[]
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

interface PriceRecord {
  price_id: number | null
  product_id: number
  sku_name: string
  barcode: string | number | null
  category_id: number | null
  brand_id: number | null
  customer_id: number
  rollup_customer_id: number
  time_id: number
  date: string
  year: number
  quarter: number
  month: number
  week: number
  day: number
  list_price: number | null
  customer_price: number | null
  base_price: number | null
  promo_price: number | null
  has_data: number
}

interface TimeDay {
  time_id: number
  date: string
  day: number
}

interface TimeWeek {
  year: number
  quarter: number
  month: number
  week: number
  days: TimeDay[]
}

interface TimeMonth {
  year: number
  quarter: number
  month: number
  weeks: TimeWeek[]
}

interface TimeQuarter {
  year: number
  quarter: number
  months: TimeMonth[]
}

interface TimeYear {
  year: number
  quarters: TimeQuarter[]
}

export default function PricesReportPage() {
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>([])
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [selectedTimeIds, setSelectedTimeIds] = useState<number[]>([])
  const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [expandedBrands, setExpandedBrands] = useState<Set<number>>(new Set())
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [dateSearch, setDateSearch] = useState('')

  // Fetch customer hierarchy
  const { data: customerData, isLoading: customersLoading } = useQuery({
    queryKey: ['customer-hierarchy'],
    queryFn: () => api.get('/api/fact-data/customers/hierarchy'),
  })

  // Fetch category hierarchy
  const { data: categoryData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['category-hierarchy'],
    queryFn: () => api.get('/api/fact-data/categories/hierarchy'),
  })

  // Fetch brand hierarchy
  const { data: brandData, isLoading: brandsLoading } = useQuery({
    queryKey: ['brand-hierarchy'],
    queryFn: () => api.get('/api/fact-data/brands/hierarchy'),
  })

  // Fetch time hierarchy
  const { data: timeData, isLoading: timeLoading, error: timeError } = useQuery({
    queryKey: ['time-hierarchy'],
    queryFn: () => api.get('/api/fact-data/time/hierarchy'),
    enabled: true, // Always fetch
  })

  // Fetch products (filtered by category and brand)
  const { data: productsData, isLoading: productsLoading } = useQuery({
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

  // Fetch prices report from DuckDB
  const { data: pricesData, isLoading: pricesLoading, refetch: refetchPrices } = useQuery({
    queryKey: ['duckdb-prices-report', selectedCustomerIds, selectedCategoryIds, selectedBrandIds, selectedProductIds, selectedTimeIds],
    queryFn: () => {
      const params = new URLSearchParams()
      if (selectedCustomerIds.length > 0) {
        params.append('customerIds', selectedCustomerIds.join(','))
      }
      if (selectedCategoryIds.length > 0) {
        params.append('categoryIds', selectedCategoryIds.join(','))
      }
      if (selectedBrandIds.length > 0) {
        params.append('brandIds', selectedBrandIds.join(','))
      }
      if (selectedProductIds.length > 0) {
        params.append('productIds', selectedProductIds.join(','))
      }
      if (selectedTimeIds.length > 0) {
        params.append('timeIds', selectedTimeIds.join(','))
      }
      return api.get(`/api/duckdb/reports/prices?${params.toString()}`)
    },
    enabled: selectedCustomerIds.length > 0 || selectedCategoryIds.length > 0 || selectedBrandIds.length > 0 || selectedProductIds.length > 0 || selectedTimeIds.length > 0,
  })

  const customers: Customer[] = customerData?.data?.data?.customers || []
  const customerHierarchy: Customer[] = customerData?.data?.data?.hierarchy || []
  const categories: Category[] = categoryData?.data?.data?.categories || []
  const categoryHierarchy: Category[] = categoryData?.data?.data?.hierarchy || []
  const brands: Brand[] = brandData?.data?.data?.brands || []
  const brandHierarchy: Brand[] = brandData?.data?.data?.hierarchy || []
  const products: Product[] = productsData?.data?.data || []
  const timeHierarchy: TimeYear[] = timeData?.data?.data?.hierarchy || timeData?.data?.hierarchy || []
  const prices: PriceRecord[] = pricesData?.data?.data?.prices || []
  const reportStats = pricesData?.data?.data || {}

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customerHierarchy
    const searchLower = customerSearch.toLowerCase()
    return customerHierarchy.filter(customer => 
      customer.customer_name.toLowerCase().includes(searchLower) ||
      customer.customer_id.toString().includes(searchLower)
    )
  }, [customerHierarchy, customerSearch])

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!categorySearch) return categoryHierarchy
    const searchLower = categorySearch.toLowerCase()
    return categoryHierarchy.filter(category => 
      category.category_name.toLowerCase().includes(searchLower) ||
      category.category_id.toString().includes(searchLower)
    )
  }, [categoryHierarchy, categorySearch])

  // Filter brands by search
  const filteredBrands = useMemo(() => {
    if (!brandSearch) return brandHierarchy
    const searchLower = brandSearch.toLowerCase()
    return brandHierarchy.filter(brand => 
      brand.brand_name.toLowerCase().includes(searchLower) ||
      brand.brand_id.toString().includes(searchLower)
    )
  }, [brandHierarchy, brandSearch])

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    const searchLower = productSearch.toLowerCase()
    return products.filter(product =>
      product.sku_name.toLowerCase().includes(searchLower) ||
      product.barcode?.toLowerCase().includes(searchLower) ||
      product.product_id.toString().includes(searchLower)
    )
  }, [products, productSearch])

  // Recursive function to get all children IDs
  const getAllChildrenIds = (item: Customer | Category | Brand): number[] => {
    const id = 'customer_id' in item ? item.customer_id : 'category_id' in item ? item.category_id : item.brand_id
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

  const toggleCustomerExpand = (customerId: number) => {
    setExpandedCustomers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(customerId)) {
        newSet.delete(customerId)
      } else {
        newSet.add(customerId)
      }
      return newSet
    })
  }

  const toggleCategoryExpand = (categoryId: number) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
  }

  const toggleBrandExpand = (brandId: number) => {
    setExpandedBrands(prev => {
      const newSet = new Set(prev)
      if (newSet.has(brandId)) {
        newSet.delete(brandId)
      } else {
        newSet.add(brandId)
      }
      return newSet
    })
  }

  const getSelectedCategoryNames = () => {
    return categories
      .filter(c => selectedCategoryIds.includes(c.category_id))
      .map(c => c.category_name)
      .slice(0, 2)
  }

  const getSelectedBrandNames = () => {
    return brands
      .filter(b => selectedBrandIds.includes(b.brand_id))
      .map(b => b.brand_name)
      .slice(0, 2)
  }

  const getSelectedCustomerNames = () => {
    return customers
      .filter(c => selectedCustomerIds.includes(c.customer_id))
      .map(c => c.customer_name)
      .slice(0, 2)
  }

  const getSelectedProductNames = () => {
    return products
      .filter(p => selectedProductIds.includes(p.product_id))
      .map(p => p.sku_name)
      .slice(0, 2)
  }

  const clearAllFilters = () => {
    setSelectedCustomerIds([])
    setSelectedCategoryIds([])
    setSelectedBrandIds([])
    setSelectedProductIds([])
    setSelectedTimeIds([])
    setOpenFilter(null)
  }

  // Time hierarchy handlers
  const toggleYearExpand = (year: number) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev)
      if (newSet.has(year)) {
        newSet.delete(year)
      } else {
        newSet.add(year)
      }
      return newSet
    })
  }

  const toggleQuarterExpand = (year: number, quarter: number) => {
    const key = `${year}-Q${quarter}`
    setExpandedQuarters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const toggleMonthExpand = (year: number, quarter: number, month: number) => {
    const key = `${year}-Q${quarter}-M${month}`
    setExpandedMonths(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const toggleWeekExpand = (year: number, quarter: number, month: number, week: number) => {
    const key = `${year}-Q${quarter}-M${month}-W${week}`
    setExpandedWeeks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const handleTimeToggle = (timeId: number, includeChildren: boolean, days?: TimeDay[]) => {
    setSelectedTimeIds(prev => {
      if (includeChildren && days) {
        const allTimeIds = days.map(d => d.time_id)
        const newIds = prev.filter(id => !allTimeIds.includes(id))
        return [...newIds, ...allTimeIds]
      } else {
        if (prev.includes(timeId)) {
          return prev.filter(id => id !== timeId)
        } else {
          return [...prev, timeId]
        }
      }
    })
  }

  // Get all time IDs from a year/quarter/month/week
  const getAllTimeIdsFromPeriod = (year?: TimeYear, quarter?: TimeQuarter, month?: TimeMonth, week?: TimeWeek): number[] => {
    if (week) {
      return week.days.map(d => d.time_id)
    }
    if (month) {
      return month.weeks.flatMap(w => w.days.map(d => d.time_id))
    }
    if (quarter) {
      return quarter.months.flatMap(m => m.weeks.flatMap(w => w.days.map(d => d.time_id)))
    }
    if (year) {
      return year.quarters.flatMap(q => q.months.flatMap(m => m.weeks.flatMap(w => w.days.map(d => d.time_id))))
    }
    return []
  }

  // Filter time hierarchy by search
  const filteredTimeHierarchy = useMemo(() => {
    if (!dateSearch) return timeHierarchy
    const searchLower = dateSearch.toLowerCase()
    // Filter through the hierarchy
    return timeHierarchy.filter(year => {
      const yearStr = year.year.toString()
      const hasMatchingQuarter = year.quarters.some(q => {
        const quarterStr = `Q${q.quarter}`
        const hasMatchingMonth = q.months.some(m => {
          const monthStr = m.month.toString()
          const hasMatchingWeek = m.weeks.some(w => {
            const weekStr = w.week.toString()
            return w.days.some(d => {
              const dateStr = d.date || ''
              return dateStr.toLowerCase().includes(searchLower) || 
                     yearStr.includes(searchLower) ||
                     quarterStr.includes(searchLower) ||
                     monthStr.includes(searchLower) ||
                     weekStr.includes(searchLower)
            })
          })
          return hasMatchingWeek
        })
        return hasMatchingMonth
      })
      return yearStr.includes(searchLower) || hasMatchingQuarter
    })
  }, [timeHierarchy, dateSearch])

  // Render time hierarchy tree
  const renderTimeTree = () => {
    return filteredTimeHierarchy.map(year => {
      const isYearExpanded = expandedYears.has(year.year)
      const yearTimeIds = getAllTimeIdsFromPeriod(year)
      const isYearSelected = yearTimeIds.every(id => selectedTimeIds.includes(id)) && yearTimeIds.length > 0

      return (
        <div key={year.year} className="ml-2">
          <div className="flex items-center gap-2 py-1">
            <button
              onClick={() => toggleYearExpand(year.year)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              {isYearExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isYearSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTimeIds(prev => [...new Set([...prev, ...yearTimeIds])])
                  } else {
                    setSelectedTimeIds(prev => prev.filter(id => !yearTimeIds.includes(id)))
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {year.year}
              </span>
            </label>
          </div>
          {isYearExpanded && (
            <div className="ml-6">
              {year.quarters.map(quarter => {
                const quarterKey = `${year.year}-Q${quarter.quarter}`
                const isQuarterExpanded = expandedQuarters.has(quarterKey)
                const quarterTimeIds = getAllTimeIdsFromPeriod(undefined, quarter)
                const isQuarterSelected = quarterTimeIds.every(id => selectedTimeIds.includes(id)) && quarterTimeIds.length > 0

                return (
                  <div key={quarterKey} className="ml-2">
                    <div className="flex items-center gap-2 py-1">
                      <button
                        onClick={() => toggleQuarterExpand(year.year, quarter.quarter)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        {isQuarterExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                      </button>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isQuarterSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTimeIds(prev => [...new Set([...prev, ...quarterTimeIds])])
                            } else {
                              setSelectedTimeIds(prev => prev.filter(id => !quarterTimeIds.includes(id)))
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Q{quarter.quarter}
                        </span>
                      </label>
                    </div>
                    {isQuarterExpanded && (
                      <div className="ml-6">
                        {quarter.months.map(month => {
                          const monthKey = `${year.year}-Q${quarter.quarter}-M${month.month}`
                          const isMonthExpanded = expandedMonths.has(monthKey)
                          const monthTimeIds = getAllTimeIdsFromPeriod(undefined, undefined, month)
                          const isMonthSelected = monthTimeIds.every(id => selectedTimeIds.includes(id)) && monthTimeIds.length > 0

                          return (
                            <div key={monthKey} className="ml-2">
                              <div className="flex items-center gap-2 py-1">
                                <button
                                  onClick={() => toggleMonthExpand(year.year, quarter.quarter, month.month)}
                                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                >
                                  {isMonthExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronUp className="h-4 w-4" />
                                  )}
                                </button>
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isMonthSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedTimeIds(prev => [...new Set([...prev, ...monthTimeIds])])
                                      } else {
                                        setSelectedTimeIds(prev => prev.filter(id => !monthTimeIds.includes(id)))
                                      }
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {new Date(year.year, month.month - 1, 1).toLocaleString('default', { month: 'long' })}
                                  </span>
                                </label>
                              </div>
                              {isMonthExpanded && (
                                <div className="ml-6">
                                  {month.weeks.map(week => {
                                    const weekKey = `${year.year}-Q${quarter.quarter}-M${month.month}-W${week.week}`
                                    const isWeekExpanded = expandedWeeks.has(weekKey)
                                    const weekTimeIds = getAllTimeIdsFromPeriod(undefined, undefined, undefined, week)
                                    const isWeekSelected = weekTimeIds.every(id => selectedTimeIds.includes(id)) && weekTimeIds.length > 0

                                    return (
                                      <div key={weekKey} className="ml-2">
                                        <div className="flex items-center gap-2 py-1">
                                          <button
                                            onClick={() => toggleWeekExpand(year.year, quarter.quarter, month.month, week.week)}
                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                          >
                                            {isWeekExpanded ? (
                                              <ChevronDown className="h-4 w-4" />
                                            ) : (
                                              <ChevronUp className="h-4 w-4" />
                                            )}
                                          </button>
                                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={isWeekSelected}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setSelectedTimeIds(prev => [...new Set([...prev, ...weekTimeIds])])
                                                } else {
                                                  setSelectedTimeIds(prev => prev.filter(id => !weekTimeIds.includes(id)))
                                                }
                                              }}
                                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                              Week {week.week}
                                            </span>
                                          </label>
                                        </div>
                                        {isWeekExpanded && (
                                          <div className="ml-6">
                                            {week.days.map(day => {
                                              const isDaySelected = selectedTimeIds.includes(day.time_id)
                                              return (
                                                <div key={day.time_id} className="ml-2">
                                                  <label className="flex items-center gap-2 py-1 cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      checked={isDaySelected}
                                                      onChange={(e) => handleTimeToggle(day.time_id, false)}
                                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                                      {new Date(day.date).toLocaleDateString()}
                                                    </span>
                                                  </label>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    })
  }

  const renderCategoryTree = (category: Category, level: number = 0) => {
    const isExpanded = expandedCategories.has(category.category_id)
    const isSelected = selectedCategoryIds.includes(category.category_id)
    const hasChildren = category.children && category.children.length > 0

    return (
      <div key={category.category_id} className="ml-4">
        <div className="flex items-center gap-2 py-1">
          {hasChildren && (
            <button
              onClick={() => toggleCategoryExpand(category.category_id)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-6" />}
          <label className="flex items-center gap-2 flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleCategoryToggle(category.category_id, e.target.checked && hasChildren)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {category.category_name} ({category.category_id})
            </span>
          </label>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-6">
            {category.children!.map(child => renderCategoryTree(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const renderBrandTree = (brand: Brand, level: number = 0) => {
    const isExpanded = expandedBrands.has(brand.brand_id)
    const isSelected = selectedBrandIds.includes(brand.brand_id)
    const hasChildren = brand.children && brand.children.length > 0

    return (
      <div key={brand.brand_id} className="ml-4">
        <div className="flex items-center gap-2 py-1">
          {hasChildren && (
            <button
              onClick={() => toggleBrandExpand(brand.brand_id)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-6" />}
          <label className="flex items-center gap-2 flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleBrandToggle(brand.brand_id, e.target.checked && hasChildren)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {brand.brand_name} ({brand.brand_id})
            </span>
          </label>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-6">
            {brand.children!.map(child => renderBrandTree(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const renderCustomerTree = (customer: Customer, level: number = 0) => {
    const isExpanded = expandedCustomers.has(customer.customer_id)
    const isSelected = selectedCustomerIds.includes(customer.customer_id)
    const hasChildren = customer.children && customer.children.length > 0

    return (
      <div key={customer.customer_id} className="ml-4">
        <div className="flex items-center gap-2 py-1">
          {hasChildren && (
            <button
              onClick={() => toggleCustomerExpand(customer.customer_id)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-6" />}
          <label className="flex items-center gap-2 flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleCustomerToggle(customer.customer_id, e.target.checked && hasChildren)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {customer.customer_name} ({customer.customer_id})
            </span>
          </label>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-6">
            {customer.children!.map(child => renderCustomerTree(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const hasActiveFilters = selectedCustomerIds.length > 0 || selectedCategoryIds.length > 0 || 
                          selectedBrandIds.length > 0 || selectedProductIds.length > 0 || selectedTimeIds.length > 0

  return (
    <Layout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/admin" className="hover:text-gray-700 dark:hover:text-gray-300">Admin</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/admin/setup" className="hover:text-gray-700 dark:hover:text-gray-300">Setup and Maintenance</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/admin/setup/data-management" className="hover:text-gray-700 dark:hover:text-gray-300">Data Management</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/admin/setup/data-management" className="hover:text-gray-700 dark:hover:text-gray-300">DuckDB Fact Data Management</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-gray-100">Prices Report (DuckDB)</span>
        </nav>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
              Prices Report (DuckDB)
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Analyze pricing data from DuckDB fact_prices_all_combinations view with customer rollup
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetchPrices()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </button>
            {prices.length > 0 && (
              <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
            )}
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Filter className="h-4 w-4" />
                <span>Filters:</span>
              </div>

              {/* Category Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilter(openFilter === 'category' ? null : 'category')}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategoryIds.length > 0
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  Category
                  {selectedCategoryIds.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                      {selectedCategoryIds.length}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </button>
                {openFilter === 'category' && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search categories..."
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3">
                      {categoriesLoading ? (
                        <div className="text-center text-sm text-gray-500 py-4">Loading...</div>
                      ) : filteredCategories.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-4">No categories found</div>
                      ) : (
                        filteredCategories.map(category => renderCategoryTree(category))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Brand Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilter(openFilter === 'brand' ? null : 'brand')}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedBrandIds.length > 0
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  Brand
                  {selectedBrandIds.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                      {selectedBrandIds.length}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </button>
                {openFilter === 'brand' && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search brands..."
                          value={brandSearch}
                          onChange={(e) => setBrandSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3">
                      {brandsLoading ? (
                        <div className="text-center text-sm text-gray-500 py-4">Loading...</div>
                      ) : filteredBrands.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-4">No brands found</div>
                      ) : (
                        filteredBrands.map(brand => renderBrandTree(brand))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilter(openFilter === 'customer' ? null : 'customer')}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCustomerIds.length > 0
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  Customer
                  {selectedCustomerIds.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                      {selectedCustomerIds.length}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </button>
                {openFilter === 'customer' && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search customers..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3">
                      {customersLoading ? (
                        <div className="text-center text-sm text-gray-500 py-4">Loading...</div>
                      ) : filteredCustomers.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-4">No customers found</div>
                      ) : (
                        filteredCustomers.map(customer => renderCustomerTree(customer))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Product Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilter(openFilter === 'product' ? null : 'product')}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedProductIds.length > 0
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  Product
                  {selectedProductIds.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                      {selectedProductIds.length}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </button>
                {openFilter === 'product' && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search products..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3">
                      {productsLoading ? (
                        <div className="text-center text-sm text-gray-500 py-4">Loading...</div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-4">
                          {selectedCategoryIds.length === 0 && selectedBrandIds.length === 0
                            ? 'No products found'
                            : 'No products match selected categories/brands'}
                        </div>
                      ) : (
                        filteredProducts.map(product => (
                          <label
                            key={product.product_id}
                            className="flex items-center gap-2 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(product.product_id)}
                              onChange={() => handleProductToggle(product.product_id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {product.sku_name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                ID: {product.product_id} {product.barcode && `| ${product.barcode}`}
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Date/Time Filter */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTimeIds.length > 0
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  Date
                  {selectedTimeIds.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                      {selectedTimeIds.length}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </button>
                {openFilter === 'date' && (
                  <div className="absolute top-full left-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search dates (year, month, date)..."
                          value={dateSearch}
                          onChange={(e) => setDateSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-3">
                      {timeLoading ? (
                        <div className="text-center text-sm text-gray-500 py-4">Loading dates...</div>
                      ) : timeError ? (
                        <div className="text-center text-sm text-red-500 py-4">
                          Error loading dates: {timeError instanceof Error ? timeError.message : 'Unknown error'}
                        </div>
                      ) : !timeHierarchy || timeHierarchy.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-4">
                          No dates available. {timeData ? 'Data structure: ' + JSON.stringify(Object.keys(timeData?.data || {})) : 'No data received.'}
                        </div>
                      ) : filteredTimeHierarchy.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-4">No dates match your search</div>
                      ) : (
                        renderTimeTree()
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BarChart3 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Total Records
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {reportStats.totalRecords?.toLocaleString() || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Customers
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {reportStats.customerCount?.toLocaleString() || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BarChart3 className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      With Data
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {reportStats.recordsWithData?.toLocaleString() || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Package className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Products
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {reportStats.productCount?.toLocaleString() || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Avg Price
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {reportStats.recordsWithData > 0
                        ? `$${(
                            prices
                              .filter(p => p.has_data === 1)
                              .reduce((sum, p) => sum + (p.customer_price || p.list_price || 0), 0) /
                            reportStats.recordsWithData
                          ).toFixed(2)}`
                        : '$0.00'}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <RefreshCw className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Query Time
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {reportStats.executionTimeMs !== undefined
                        ? `${reportStats.executionTimeMs} ms`
                        : '-'}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prices Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Price Data
            </h2>
          </div>
          <div className="overflow-x-auto">
            {pricesLoading ? (
              <div className="px-6 py-12 text-center text-gray-500">Loading prices...</div>
            ) : prices.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {hasActiveFilters
                    ? 'No price data found for selected filters'
                    : 'Select customers and/or products to view prices'}
                </p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Customer (Parent)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Rollup Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Has Data
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      List Price
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Customer Price
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Base Price
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Promo Price
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {prices.map((price, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {price.sku_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          ID: {price.product_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          ID: {price.customer_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          ID: {price.rollup_customer_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {price.date ? new Date(price.date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          price.has_data === 1 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {price.has_data === 1 ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {price.list_price !== null ? `$${price.list_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                        {price.customer_price !== null ? `$${price.customer_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {price.base_price !== null ? `$${price.base_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {price.promo_price !== null ? `$${price.promo_price.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close filter dropdowns */}
      {openFilter && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenFilter(null)}
        />
      )}
    </Layout>
  )
}
