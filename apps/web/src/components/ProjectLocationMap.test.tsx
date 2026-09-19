// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProjectLocationMap } from './ProjectLocationMap'

afterEach(() => { cleanup(); delete window.L; vi.restoreAllMocks() })

it('preserves the Leaflet container when editing changes and blocks position changes while locked', () => {
  let click: (event: { latlng: { lat: number; lng: number } }) => void = () => {}
  const map = { setView: vi.fn().mockReturnThis(), invalidateSize: vi.fn().mockReturnThis(), whenReady: vi.fn(), remove: vi.fn(), on: vi.fn((event: string, callback: typeof click) => { if (event === 'click') click = callback }) }
  const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn(), getLatLng: vi.fn(), on: vi.fn(), dragging: { enable: vi.fn(), disable: vi.fn() } }
  window.L = {
    map: vi.fn((element: HTMLElement) => { element.classList.add('leaflet-container'); return map }),
    marker: vi.fn(() => marker),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  }
  const onChange = vi.fn()
  const props = { latitude: -32.1592514, longitude: -52.1736994, onChange }
  const { container, rerender } = render(<ProjectLocationMap {...props} editable={false} />)
  const canvas = container.querySelector('.leaflet-container')!
  expect(canvas.classList.contains('map-frame')).toBe(false)
  expect(canvas.parentElement?.classList.contains('map-frame')).toBe(true)
  click({ latlng: { lat: -32, lng: -52 } })
  expect(onChange).not.toHaveBeenCalled()
  rerender(<ProjectLocationMap {...props} editable />)
  expect(container.querySelector('.leaflet-container')).toBe(canvas)
  expect(marker.dragging.enable).toHaveBeenCalled()
  click({ latlng: { lat: -32, lng: -52 } })
  expect(onChange).toHaveBeenCalledWith(-32, -52)
  rerender(<ProjectLocationMap {...props} editable={false} />)
  onChange.mockClear()
  click({ latlng: { lat: -31, lng: -51 } })
  expect(onChange).not.toHaveBeenCalled()
  expect(container.querySelector('.leaflet-container')).toBe(canvas)
})
