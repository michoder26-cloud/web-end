import type { Payload } from 'payload'
import React from 'react'

import { formatValue, type FieldDefinition } from '@/lib/data'

type Props = {
  data?: { data?: Record<string, unknown>; dataType?: number | { id: number } }
  payload: Payload
}

/** Shows an entry in the admin panel using the labels people chose, instead of raw JSON. */
export async function RecordSummary({ data, payload }: Props) {
  const typeId = typeof data?.dataType === 'object' ? data.dataType?.id : data?.dataType
  if (!typeId || !data?.data) return null
  const type = await payload.findByID({ collection: 'data-types', depth: 0, id: typeId })
  const fields = (type.fields ?? []) as FieldDefinition[]

  return (
    <table style={{ borderCollapse: 'collapse', marginBottom: 32, width: '100%' }}>
      <tbody>
        {fields.map((field) => (
          <tr key={field.name} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
            <th scope="row" style={{ padding: '10px 16px 10px 0', textAlign: 'left', verticalAlign: 'top', width: '30%' }}>
              {field.label}
            </th>
            <td style={{ overflowWrap: 'anywhere', padding: '10px 0', whiteSpace: 'pre-line' }}>
              {formatValue(data.data?.[field.name])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
