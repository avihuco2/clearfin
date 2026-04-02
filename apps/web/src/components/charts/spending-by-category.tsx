'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency } from '@/lib/format'

export interface CategorySpend {
  category_id: string
  name_he: string
  color: string
  total: number
}

interface SpendingByCategoryProps {
  data: CategorySpend[]
}

interface TooltipPayloadItem {
  name: string
  value: number
  payload: CategorySpend
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  if (!item) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-[var(--color-foreground)]">{item.payload.name_he}</p>
      <p className="text-[var(--color-primary)]">{formatCurrency(item.value)}</p>
    </div>
  )
}

export function SpendingByCategory({ data }: SpendingByCategoryProps) {
  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        אין נתונים להצגה
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="name_he"
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={55}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.category_id} fill={entry.color} stroke="none" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span className="text-xs text-[var(--color-foreground)]">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
