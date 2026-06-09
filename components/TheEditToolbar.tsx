'use client'

interface Props {
  total:       number
  loading:     boolean
  sort:        string
  onSort:      (v: string) => void
  searchInput: string
  onSearchInput: (v: string) => void
  onSearchSubmit: () => void
}

const SORT_OPTIONS = [
  { value: 'featured',   label: 'Sort: Featured' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'lead_time',  label: 'Lead Time: Shortest First' },
]

export function TheEditToolbar({
  total,
  loading,
  sort,
  onSort,
  searchInput,
  onSearchInput,
  onSearchSubmit,
}: Props) {
  return (
    <div style={{
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      gap:            16,
      marginBottom:   24,
      flexWrap:       'wrap',
    }}>
      {/* Left: count + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--stone, #7a7065)', margin: 0, whiteSpace: 'nowrap' }}>
          {loading ? 'Loading…' : `${total} piece${total !== 1 ? 's' : ''} available`}
        </p>

        <form
          onSubmit={e => { e.preventDefault(); onSearchSubmit() }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <input
            type="search"
            placeholder="Search the edit…"
            value={searchInput}
            onChange={e => onSearchInput(e.target.value)}
            style={{
              padding:      '6px 12px',
              fontSize:     12,
              border:       '1px solid var(--light-line, #e0ddd7)',
              borderRadius: 2,
              width:        200,
              background:   '#fff',
              outline:      'none',
            }}
          />
        </form>
      </div>

      {/* Right: sort */}
      <select
        value={sort}
        onChange={e => onSort(e.target.value)}
        style={{
          padding:      '7px 32px 7px 12px',
          fontSize:     12,
          border:       '1px solid var(--light-line, #e0ddd7)',
          borderRadius: 2,
          background:   '#fff',
          color:        'var(--ink, #1a1a18)',
          cursor:       'pointer',
          appearance:   'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237a7065'/%3E%3C/svg%3E")`,
          backgroundRepeat:   'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        {SORT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
