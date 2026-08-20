import { cn } from '@/lib/cn';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
};

/**
 * docs/05-design-system.md §2 — a real table from `md` up, stacked cards below.
 * One column definition serves both, so the two views cannot drift.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  empty,
  selectable,
  selected,
  onToggle,
}: {
  rows: T[];
  columns: Column<T>[];
  empty: string;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">{empty}</p>;
  }

  return (
    <>
      <table className="hidden w-full border-collapse overflow-hidden rounded-lg bg-surface text-sm md:table">
        <thead>
          <tr className="border-b border-divider text-left">
            {selectable ? <th className="w-10 p-3"><span className="sr-only">Select</span></th> : null}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('p-3 text-xs font-bold uppercase tracking-[1px] text-ink-muted', column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-divider last:border-0">
              {selectable ? (
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Select row ${row.id}`}
                    checked={selected?.has(row.id) ?? false}
                    onChange={() => onToggle?.(row.id)}
                    className="h-5 w-5 accent-[var(--color-primary-500)]"
                  />
                </td>
              ) : null}
              {columns.map((column) => (
                <td key={column.key} className={cn('p-3 align-top', column.className)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md bg-surface p-4 text-sm">
            {columns.map((column) => (
              <div key={column.key} className="flex justify-between gap-3 py-0.5">
                <span className="text-xs uppercase tracking-[1px] text-ink-muted">{column.header}</span>
                <span className="text-right">{column.render(row)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
