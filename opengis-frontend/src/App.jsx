import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'

const API = 'http://127.0.0.1:8000'

function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState('')
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const currentMarker = useRef(null)
  const currentLocation = useRef(null)

  useEffect(() => {
    if (map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [121.5644995, 25.0338352],
      zoom: 13
    })

    map.current.addControl(new maplibregl.NavigationControl())
    
    const recenterBtn = document.createElement('button')
    recenterBtn.className = 'recenter-btn'

    const img = document.createElement('img')
    img.src = '/images/recenter-button.jpg'
    img.style.width = '24px'
    img.style.height = '24px'
    img.style.objectFit = 'contain'
    recenterBtn.appendChild(img)

    recenterBtn.onclick = () => {
      if (!currentLocation.current) {
        setStatus('No location pinned yet!')
        return
      }
      const { lat, lng } = currentLocation.current
      map.current.flyTo({ center: [lng, lat], zoom: 15 })
      setStatus('Re-centered to pinned location')
    }

    class RecenterControl {
      onAdd(map) {
        this._map = map
        this._container = document.createElement('div')
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group'
        this._container.appendChild(recenterBtn)
        return this._container
      }
      onRemove() {
        this._container.parentNode.removeChild(this._container)
        this._map = undefined
      }
    }

    map.current.addControl(new RecenterControl(), 'bottom-right')

    // Fix 2 & 3 — click on map to place marker
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat

      // Remove old marker
      if (currentMarker.current) {
        currentMarker.current.remove()
      }

      // Place new marker at clicked location
      currentMarker.current = new maplibregl.Marker({ color: '#FF0000' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup().setText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`))
        .addTo(map.current)

      currentLocation.current = { lat, lng }
      setStatus(`Pinned: ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    })

  }, [])

  const handleGeocode = async () => {
    try {
      setStatus('Searching...')
      const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(address.trim())
      let latitude, longitude, displayAddress

      if (isCoordinate) {
        const [lat, lng] = address.split(',').map(s => parseFloat(s.trim()))
        const res = await axios.get(`${API}/geocode/reverse`, {
          params: { latitude: lat, longitude: lng }
        })
        latitude = res.data.latitude
        longitude = res.data.longitude
        displayAddress = res.data.address
      } else {
        const res = await axios.get(`${API}/geocode/forward`, {
          params: { address }
        })
        latitude = res.data.latitude
        longitude = res.data.longitude
        displayAddress = res.data.address
      }

      // Fix 1 — remove old marker before placing new one
      if (currentMarker.current) {
        currentMarker.current.remove()
      }

      map.current.flyTo({ center: [longitude, latitude], zoom: 15 })

      currentMarker.current = new maplibregl.Marker({ color: '#FF0000' })
        .setLngLat([longitude, latitude])
        .setPopup(new maplibregl.Popup().setText(displayAddress))
        .addTo(map.current)

      currentLocation.current = { lat: latitude, lng: longitude }
      setStatus(`Found: ${displayAddress}`)

    } catch (err) {
      setStatus('Location not found')
    }
  }

  const handleBuffer = async () => {
    try {
      // Fix 2 — use pinned location instead of map center
      if (!currentLocation.current) {
        setStatus('Please search for a location or click on the map first!')
        return
      }

      setStatus('Calculating buffer...')
      const { lat, lng } = currentLocation.current

      const res = await axios.post(`${API}/spatial/buffer`,
        { type: 'Point', coordinates: [lng, lat] },
        { params: { distance_meters: 500 } }
      )

      if (map.current.getSource('buffer')) {
        map.current.removeLayer('buffer-layer')
        map.current.removeSource('buffer')
      }

      map.current.addSource('buffer', {
        type: 'geojson',
        data: { type: 'Feature', geometry: res.data.geometry }
      })
      map.current.addLayer({
        id: 'buffer-layer',
        type: 'fill',
        source: 'buffer',
        paint: { 'fill-color': '#0080ff', 'fill-opacity': 0.3 }
      })
      setStatus('Buffer drawn — 500m around pinned location')
    } catch (err) {
      setStatus('Buffer failed')
    }
  }

  const handleViewshed = async () => {
    try {
      setStatus('Running viewshed...')
      const res = await axios.get(`${API}/viewshed/`, {
        params: {
          latitude: 25.0338352,
          longitude: 121.5644995,
          radius_meters: 1000,
          observer_height: 10
        }
      })

      if (map.current.getSource('viewshed')) {
        map.current.removeLayer('viewshed-layer')
        map.current.removeSource('viewshed')
      }

      map.current.addSource('viewshed', {
        type: 'geojson',
        data: { type: 'Feature', geometry: res.data.visible_area }
      })
      map.current.addLayer({
        id: 'viewshed-layer',
        type: 'fill',
        source: 'viewshed',
        paint: { 'fill-color': '#00FF00', 'fill-opacity': 0.4 }
      })
      setStatus('Viewshed rendered!')
    } catch (err) {
      setStatus('Viewshed failed: ' + err.message)
    }
  }

  // Fix 3 — re-center to current marker location
  const handleRecenter = () => {
    if (!currentLocation.current) {
      setStatus('No location pinned yet!')
      return
    }
    const { lat, lng } = currentLocation.current
    map.current.flyTo({ center: [lng, lat], zoom: 15 })
    setStatus('Re-centered to pinned location')
  }

  const handleRoute = async () => {
    try {
      setStatus('Calculating route...')

      const resolveLocation = async (input) => {
        const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(input.trim())
        if (isCoordinate) {
          const [lat, lng] = input.split(',').map(s => parseFloat(s.trim()))
          return { lat, lng }
        } else {
          const res = await axios.get(`${API}/geocode/forward`, {
            params: { address: input }
          })
          return { lat: res.data.latitude, lng: res.data.longitude }
        }
      }

      const start = await resolveLocation(routeStart)
      const end = await resolveLocation(routeEnd)

      if (map.current.getSource('route')) {
        map.current.removeLayer('route-layer')
        map.current.removeSource('route')
      }

      const res = await axios.get(`${API}/routing/shortest-path`, {
        params: {
          start_lat: start.lat,
          start_lng: start.lng,
          end_lat: end.lat,
          end_lng: end.lng
        }
      })

      map.current.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: res.data.geometry }
      })
      map.current.addLayer({
        id: 'route-layer',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#FF6600', 'line-width': 4 }
      })

      const km = (res.data.distance_meters / 1000).toFixed(2)
      setStatus(`Total Route: ${km} km.`)

      //show the entire route

    const coordinates = res.data.geometry.coordinates
    const bounds = coordinates.reduce((bounds, coords) => {
      return bounds.extend(coords)
    },new maplibregl.LngLatBounds(coordinates[0], coordinates[0]))

    map.current.fitBounds(bounds, {padding: 80})

    } catch (err) {
      setStatus('Route failed: ' + err.message)
    }
  }

  return (
  <div className="map-container">
    <div ref={mapContainer} className="map" />

    <div className="control-panel">
      <h3>Kenji's GIS</h3>

      <input
        type="text"
        placeholder="Search address..."
        value={address}
        onChange={e => setAddress(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleGeocode()}
        className="search-input"
      />
      <button onClick={handleGeocode} className="btn btn-primary">
        Search Address
      </button>
      <button onClick={handleBuffer} className="btn btn-primary">
        Buffer (500m)
      </button>
      <button onClick={handleViewshed} className="btn btn-primary">
        Viewshed (Taipei 101)
      </button>

      <div className="route-section">
        <p>Shortest Path</p>
        <input
          type="text"
          placeholder="Start: address or coordinate"
          value={routeStart}
          onChange={e => setRouteStart(e.target.value)}
          className="search-input"
        />
        <input
          type="text"
          placeholder="End: address or coordinate"
          value={routeEnd}
          onChange={e => setRouteEnd(e.target.value)}
          className="search-input"
        />
        <button onClick={handleRoute} className="btn btn-route">
          Find Shortest Path
        </button>
      </div>

      {status && (
        <div className="status-bar">
          {status}
        </div>
      )}
    </div>
  </div>
)
}

function btnStyle(color) {
  return {
    width: '100%', padding: '8px', marginBottom: '8px',
    background: color, color: 'white', border: 'none',
    borderRadius: '4px', cursor: 'pointer', fontSize: '14px'
  }
}

export default App