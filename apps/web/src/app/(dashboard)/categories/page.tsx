import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { sql } from '@clearfin/db/client'
import { CategoryManager } from '@/components/category-manager'

interface CategoryWithCount {
  id: string
  name_he: string
  name_en: string | null
  icon: string | null
  color: string | null
  user_id: string | null
  transactionCount: number
}

export default async function CategoriesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const rows = await sql<CategoryWithCount[]>`
    SELECT
      c.id, c.name_he, c.name_en, c.icon, c.color, c.user_id,
      COUNT(t.id)::int AS "transactionCount"
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = ${session.user.id}
    WHERE c.user_id IS NULL OR c.user_id = ${session.user.id}
    GROUP BY c.id
    ORDER BY c.name_he ASC
  `

  const system = rows.filter((c) => c.user_id === null)
  const user = rows.filter((c) => c.user_id !== null)

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
