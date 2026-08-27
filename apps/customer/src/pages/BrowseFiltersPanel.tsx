import { ChevronDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  BROWSE_FILTER_SECTIONS,
  type BrowseFilterState,
  type FilterSectionConfig,
  toggleListValue,
} from './browseFilters.config'

type BrowseFiltersPanelProps = {
  state: BrowseFilterState
  onChange: (next: BrowseFilterState) => void
  onClear: () => void
}

function initialOpenMap(): Record<string, boolean> {
  return Object.fromEntries(
    BROWSE_FILTER_SECTIONS.map((section) => [
      section.id,
      section.collapsible === false ? true : section.defaultOpen !== false,
    ])
  )
}

function sectionTitle(section: FilterSectionConfig, state: BrowseFilterState): string {
  if (section.type === 'dualRange') {
    return section.id === 'price'
      ? section.formatLabel(state.priceMin, state.priceMax)
      : section.formatLabel(state.yearMin, state.yearMax)
  }
  if (section.type === 'range') {
    return section.formatLabel(section.id === 'minRating' ? state.minRating : state.maxMileage)
  }
  return section.label
}

function selectedCount(section: FilterSectionConfig, state: BrowseFilterState): number {
  if (section.type === 'checkbox') return state[section.id].length
  if (section.type === 'seatGrid') return state.seats.length
  return 0
}

export function BrowseFiltersPanel({ state, onChange, onClear }: BrowseFiltersPanelProps) {
  const patch = (partial: Partial<BrowseFilterState>) => onChange({ ...state, ...partial })
  const [openMap, setOpenMap] = useState(initialOpenMap)
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({})

  const sections = useMemo(
    () => BROWSE_FILTER_SECTIONS.filter((section) => section.enabled !== false),
    []
  )

  const toggleOpen = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleListExpand = (id: string) => {
    setExpandedLists((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <aside className="browse-filters" aria-label="Filters">
      {sections.map((section, index) => {
        const collapsible = section.collapsible !== false
        const isOpen = collapsible ? openMap[section.id] !== false : true
        const count = selectedCount(section, state)
        const title = sectionTitle(section, state)

        return (
          <div key={section.id} className={`filter-block ${isOpen ? 'is-open' : 'is-collapsed'}`}>
            {index > 0 && <div className="filter-divider" />}

            <div className="filter-section">
              {collapsible ? (
                <button
                  type="button"
                  className="filter-section__toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggleOpen(section.id)}
                >
                  <span className="filter-section__toggle-label">
                    {title}
                    {count > 0 && <span className="filter-section__count">{count}</span>}
                  </span>
                  <ChevronDown size={16} className="filter-section__chevron" aria-hidden />
                </button>
              ) : (
                <label className="filter-section__label" htmlFor={section.type === 'sort' ? 'browse-sort' : undefined}>
                  {title}
                </label>
              )}

              {isOpen && (
                <div className="filter-section__body">
                  {section.type === 'sort' && (
                    <div className="filter-select-wrap">
                      <select
                        id="browse-sort"
                        className="filter-select"
                        value={state.sortBy}
                        onChange={(event) => patch({ sortBy: event.target.value })}
                      >
                        {section.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {section.type === 'select' && (
                    <div className="filter-select-wrap">
                      <select
                        id={`browse-${section.id}`}
                        aria-label={section.label}
                        className="filter-select"
                        value={state.location}
                        onChange={(event) => patch({ location: event.target.value })}
                      >
                        {section.options.map((option) => (
                          <option key={option.value || 'all'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {section.type === 'date' && (
                    <input
                      id="browse-start-date"
                      aria-label={section.label}
                      type="date"
                      className="filter-date"
                      value={state.startDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => patch({ startDate: event.target.value })}
                    />
                  )}

                  {section.type === 'dualRange' && (
                    <div className="range-group">
                      <input
                        type="range"
                        aria-label={`${section.label} minimum`}
                        min={section.min}
                        max={section.max}
                        step={section.step ?? 1}
                        value={section.id === 'price' ? state.priceMin : state.yearMin}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          if (section.id === 'price') {
                            patch({ priceMin: Math.min(next, state.priceMax) })
                          } else {
                            patch({ yearMin: Math.min(next, state.yearMax) })
                          }
                        }}
                      />
                      <input
                        type="range"
                        aria-label={`${section.label} maximum`}
                        min={section.min}
                        max={section.max}
                        step={section.step ?? 1}
                        value={section.id === 'price' ? state.priceMax : state.yearMax}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          if (section.id === 'price') {
                            patch({ priceMax: Math.max(next, state.priceMin) })
                          } else {
                            patch({ yearMax: Math.max(next, state.yearMin) })
                          }
                        }}
                      />
                    </div>
                  )}

                  {section.type === 'range' && (
                    <input
                      id={`browse-${section.id}`}
                      type="range"
                      aria-label={section.label}
                      min={section.min}
                      max={section.max}
                      step={section.step ?? 1}
                      value={section.id === 'minRating' ? state.minRating : state.maxMileage}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        if (section.id === 'minRating') patch({ minRating: next })
                        else patch({ maxMileage: next })
                      }}
                    />
                  )}

                  {section.type === 'checkbox' && (
                    <>
                      <div className="filter-list">
                        {(expandedLists[section.id] ||
                        !section.previewCount ||
                        section.options.length <= section.previewCount
                          ? section.options
                          : section.options.slice(0, section.previewCount)
                        ).map((option) => {
                          const selected = state[section.id]
                          const checked = selected.includes(option.value)
                          const Icon = option.icon
                          return (
                            <label key={option.value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  patch({
                                    [section.id]: toggleListValue(selected, option.value),
                                  } as Partial<BrowseFilterState>)
                                }
                              />
                              {Icon && <Icon size={14} className="filter-option__icon" aria-hidden />}
                              <span>{option.label}</span>
                            </label>
                          )
                        })}
                      </div>
                      {!!section.previewCount && section.options.length > section.previewCount && (
                        <button
                          type="button"
                          className="filter-show-more"
                          onClick={() => toggleListExpand(section.id)}
                        >
                          {expandedLists[section.id]
                            ? 'Show less'
                            : `Show more (${section.options.length - section.previewCount})`}
                        </button>
                      )}
                    </>
                  )}

                  {section.type === 'seatGrid' && (
                    <div className="seat-grid">
                      {section.options.map((seat) => {
                        const Icon = section.optionIcon
                        const active = state.seats.includes(seat)
                        return (
                          <button
                            key={seat}
                            type="button"
                            className={`seat-option ${active ? 'active' : ''}`}
                            onClick={() => patch({ seats: toggleListValue(state.seats, seat) })}
                          >
                            {Icon && <Icon size={13} aria-hidden />}
                            {seat}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      <div className="filter-divider" />

      <button type="button" className="clear-filters" onClick={onClear}>
        <X size={14} />
        Clear All Filters
      </button>
    </aside>
  )
}
