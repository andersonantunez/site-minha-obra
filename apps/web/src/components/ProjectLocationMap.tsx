import { useEffect, useRef } from 'react'

type LatLng = { lat: number; lng: number }
type LeafletMarker = { addTo: (map: LeafletMap) => LeafletMarker; setLatLng: (position: [number,number]) => void; getLatLng: () => LatLng; on: (event: string, callback: () => void) => void }
type LeafletMap = { setView: (position: [number,number], zoom: number) => LeafletMap; on: (event: string, callback: (value: { latlng: LatLng }) => void) => void; remove: () => void }
type LeafletApi = { map: (element: HTMLElement) => LeafletMap; tileLayer: (url: string, options: { attribution: string; maxZoom: number }) => { addTo: (map: LeafletMap) => void }; marker: (position: [number,number], options: { draggable: boolean; autoPan: boolean; title: string }) => LeafletMarker }

declare global { interface Window { L?: LeafletApi } }

export function ProjectLocationMap({ latitude, longitude, onChange }: { latitude: number | null; longitude: number | null; onChange: (latitude: number, longitude: number) => void }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const initialPosition = useRef<[number,number]>([latitude ?? -14.235, longitude ?? -51.9253])
  const initialZoom = useRef(latitude === null ? 4 : 17)
  useEffect(() => {
    if (!elementRef.current || !window.L || mapRef.current) return
    const position = initialPosition.current
    const map = window.L.map(elementRef.current).setView(position, initialZoom.current)
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    const marker = window.L.marker(position, { draggable: true, autoPan: true, title: 'Local exato da obra' }).addTo(map)
    marker.on('dragend', () => { const point = marker.getLatLng(); onChange(point.lat, point.lng) })
    map.on('click', ({ latlng }) => { marker.setLatLng([latlng.lat,latlng.lng]); onChange(latlng.lat,latlng.lng) })
    mapRef.current = map
    markerRef.current = marker
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [onChange])
  useEffect(() => {
    if (latitude !== null && longitude !== null) { markerRef.current?.setLatLng([latitude,longitude]); mapRef.current?.setView([latitude,longitude],17) }
  }, [latitude,longitude])
  return <div ref={elementRef} className="map-frame" role="application" aria-label="Mapa para ajustar a localização da obra" />
}
