'use client';

import type { ReactNode } from 'react';

export function DataTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  empty = { title: 'No records', description: 'Nothing to show here yet.' },
}: {
  columns: { key: string; header: string; render?: (row: T) => ReactNode; className?: string }[];
  rows: T[];
  keyField: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: string; action?: ReactNode };
}) {
  if (rows.length === 0) {
    return (
      <div className="surface">
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <h3 className="text-sm font-semibold text-paper-700">{empty.title}</h3>
          {empty.description && (
            <p className="mt-1 max-w-sm text-sm text-paper-400">{empty.description}</p>
          )}
          {empty.action && <div className="mt-4">{empty.action}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-paper-100 bg-paper-50/50">
            {columns.map((col) => (
              <th key={col.key} className={`th ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={keyField(row)}
              className={`table-row ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={`td ${col.className ?? ''}`}>
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
