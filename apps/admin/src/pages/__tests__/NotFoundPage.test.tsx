import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { NotFoundPage } from '../NotFoundPage'

describe('NotFoundPage', () => {
  it('ADM-UI-17: renders not found message', () => {
    renderWithProviders(<NotFoundPage />)
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument()
  })
})
