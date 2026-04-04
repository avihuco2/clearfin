'use client'

import { createContext, useContext, useState } from 'react'

export interface CategoryOption {
  id: string
  name_he: string
}

interface CategoriesContextValue {
  categories: CategoryOption[]
  addCategory: (cat: CategoryOption) => void
}

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: [],
  addCategory: () => {},
})

export function CategoriesProvider({
  initial,
  children,
}: {
  initial: CategoryOption[]
  children: React.ReactNode
}) {
  const [categories, setCategories] = useState<CategoryOption[]>(initial)

  function addCategory(cat: CategoryOption) {
    setCategories((prev) =>
      [...prev, cat].sort((a, b) => a.name_he.localeCompare(b.name_he, 'he')),
    )
  }

  return (
    <CategoriesContext.Provider value={{ categories, addCategory }}>
      {children}
    </CategoriesContext.Provider>
  )
}

export function useCategories() {
  return useContext(CategoriesContext)
}
