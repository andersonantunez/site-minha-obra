import { useEffect, useRef } from 'react'

type LatLng = { lat: number; lng: number }
type LeafletMarker = { addTo: (map: LeafletMap) => LeafletMarker; setLatLng: (position: [number,number]) => void; getLatLng: () => LatLng; on: (event: string, callback: () => void) => void; dragging?: { enable: () => void; disable: () => void } }
type LeafletMap = { setView: (position: [number,number], zoom: number) => LeafletMap; invalidateSize: (options?: { pan?: boolean }) => LeafletMap; on: (event: string, callback: (value: { latlng: LatLng }) => void) => void; remove: () => void }
type LeafletApi = { map: (element: HTMLElement) => LeafletMap; tileLayer: (url: string, options: { attribution: string; maxZoom: number }) => { addTo: (map: LeafletMap) => void }; marker: (position: [number,number], options: { draggable: boolean; autoPan: boolean; title: string }) => LeafletMarker }

declare global { interface Window { L?: LeafletApi } }

export function ProjectLocationMap({ latitude, longitude, editable, onChange }: { latitude: number | null; longitude: number | null; editable: boolean; onChange: (latitude: number, longitude: number) => void }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const editableRef = useRef(editable)
  const coordinatesRef = useRef({ latitude, longitude })
  useEffect(() => { coordinatesRef.current = { latitude, longitude } }, [latitude, longitude])
  useEffect(() => {
    let cancelled = false
    let retry: number | undefined
    const initialize = () => {
      if (cancelled || mapRef.current) return
      const element = elementRef.current
      if (!element || !window.L) { retry = window.setTimeout(initialize, 50); return }
      const coordinates = coordinatesRef.current
      const position: [number,number] = coordinates.latitude !== null && coordinates.longitude !== null ? [coordinates.latitude, coordinates.longitude] : [-14.235, -51.9253]
      const map = window.L.map(element).setView(position, coordinates.latitude === null ? 4 : 17)
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
      const marker = window.L.marker(position, { draggable: editableRef.current, autoPan: true, title: 'Local exato da obra' }).addTo(map)
      marker.on('dragend', () => { if (!editableRef.current) return; const point = marker.getLatLng(); onChange(point.lat, point.lng) })
      map.on('click', ({ latlng }) => { if (!editableRef.current) return; marker.setLatLng([latlng.lat,latlng.lng]); onChange(latlng.lat,latlng.lng) })
      mapRef.current = map
      markerRef.current = marker
      window.requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    }
    initialize()
    return () => { cancelled = true; if (retry !== undefined) window.clearTimeout(retry); mapRef.current?.remove(); mapRef.current = null; markerRef.current = null }
  }, [onChange])
  useEffect(() => {
    editableRef.current = editable
    if (editable) markerRef.current?.dragging?.enable()
    else markerRef.current?.dragging?.disable()
    window.requestAnimationFrame(() => {
      const map = mapRef.current
      map?.invalidateSize({ pan: false })
      if (latitude !== null && longitude !== null) map?.setView([latitude, longitude], 17)
    })
  }, [editable, latitude, longitude])
  useEffect(() => {
    const element=elementRef.current
    if (!element || !window.ResizeObserver) return
    const observer=new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (latitude !== null && longitude !== null) { markerRef.current?.setLatLng([latitude,longitude]); mapRef.current?.setView([latitude,longitude],17) }
  }, [latitude,longitude])
  return <div ref={elementRef} className={`map-frame ${editable ? 'editing' : 'locked'}`} role="application" aria-label={editable ? 'Mapa em modo de alteração da localização da obra' : 'Mapa da localização da obra bloqueado para alterações'} />
}
