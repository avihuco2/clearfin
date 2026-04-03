import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { CategoryManager } from '@/components/category-manager'

interface Category {
  id: string
  name_he: string
  name_en: string | null
  icon: string | null
  color: string | null
  user_id: string | null
}

export default async function CategoriesPage() {
  const supabase = createServerComponentClient({ cookies })

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name_he, name_en, icon, color, user_id')
    .order('name_he', { ascending: true })
    .returns<Category[]>()

  const system = (categories ?? []).filter((c) => c.user_id === null)
  const user = (categories ?? []).filter((c) => c.user_id !== null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">קטגוריות</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          נהל קטגוריות לסיווג עסקאות
        </p>
      </div>

      <CategoryManager systemCategories={system} userCategories={user} />
    </div>
  )
}
