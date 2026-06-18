import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'


const API = 'http://127.0.0.1:8000'

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sidebar: {
    width: '50px',
    height: '100%',
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 0',
    zIndex: 10,
    flexShrink: 0,
  },
  sidebarTop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    flex: 1,
  },
  sidebarBottom: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    paddingBottom: '8px',
  },
  sidebarDivider: {
    width: '30px',
    height: '1px',
    background: '#333',
    margin: '4px 0',
  },
  map: {
    flex: 1,
    height: '100%',
    minWidth: 0,
  },
  statusBar: {
    position: 'fixed',
    bottom: '24px',
    left: '70px',
    background: 'white',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    color: '#333',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    zIndex: 100,
    maxWidth: '500px',
    pointerEvents: 'none',
  }
}

function SidebarBtn({ icon, active, tooltip, onClick }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        width: '50px',
        height: '50px',
        background: active ? '#2d4a6e' : 'none',
        border: 'none',
        borderLeft: active ? '3px solid #4a9eda' : '3px solid transparent',
        color: active ? 'white' : '#aaa',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        transition: 'background 0.2s',
      }}
    >
      {icon}
    </button>
  )
}

function Panel({ title, open, onClose, children }) {
  return (
    <div style={{
      width: open ? '320px' : '0',
      height: '100%',
      background: 'white',
      overflow: 'hidden',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s ease',
      boxShadow: open ? '2px 0 12px rgba(0,0,0,0.3)' : 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px',
        borderBottom: '1px solid #eee',
        gap: '10px',
        minWidth: '320px',
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '22px', color: '#666', lineHeight: 1,
        }}>‹</button>
        <span style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '16px', flex: 1, overflowY: 'auto', minWidth: '320px' }}>
        {children}
      </div>
    </div>
  )
}

function InputField({ label, placeholder, value, onChange, onKeyDown }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && <p style={{ fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', padding: '10px 12px', border: '1px solid #ddd',
          borderRadius: '6px', fontSize: '14px', outline: 'none',
          fontFamily: 'Segoe UI, Arial, sans-serif',
        }}
      />
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <p style={{ fontSize: '12px', color: '#666', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
          {label}
        </p>
        <span style={{ fontSize: '13px', color: '#2d4a6e', fontWeight: 600 }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          accentColor: '#4a9eda',
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

function PanelBtn({ onClick, color = '#2d4a6e', children }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '10px', background: color,
      color: 'white', border: 'none', borderRadius: '6px',
      cursor: 'pointer', fontSize: '14px', fontWeight: 500,
      marginBottom: '8px', fontFamily: 'Segoe UI, Arial, sans-serif',
    }}>
      {children}
    </button>
  )
}

function useThrottle(callback, delay){
  const lastCall = useRef(0)
  const timeoutRef = useRef(null)

  return useCallback((...args)=>{
    const now = Date.now()
    const remaining = delay - (now - lastCall.current)

    if(remaining <= 0){
      lastCall.current = now
      callback(...args)
    }else{
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        lastCall.current = Date.now()
        callback(...args)
      }, remaining);
    }
  }, [callback, delay])
}

function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [status, setStatus] = useState('')
  const [activePanel, setActivePanel] = useState(null)
  const [address, setAddress] = useState('')
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const [bufferDistance, setBufferDistance] = useState(500)
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

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat
      if (currentMarker.current) currentMarker.current.remove()
      currentMarker.current = new maplibregl.Marker({ color: '#e74c3c' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup().setText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`))
        .addTo(map.current)
      currentLocation.current = { lat, lng }
      setStatus(`📍 Pinned: ${lat.toFixed(5)}, ${lng.toFixed(5)}`)

      if(map.current.getSource('buffer')){
        throttledBuffer(bufferDistance)
      }
    })

    const recenterBtn = document.createElement('button')
    recenterBtn.className = 'recenter-btn'
    const img = document.createElement('img')
    img.src = '/images/recenter-button.jpg'
    img.style.width = '24px'
    img.style.height = '24px'
    img.style.objectFit = 'contain'
    recenterBtn.appendChild(img)
    recenterBtn.onclick = () => {
      if (!currentLocation.current) { setStatus('No location pinned yet!'); return }
      const { lat, lng } = currentLocation.current
      map.current.flyTo({ center: [lng, lat], zoom: 15 })
      setStatus('Re-centered to pinned location')
    }

    class RecenterControl {
      onAdd() {
        this._container = document.createElement('div')
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group'
        this._container.appendChild(recenterBtn)
        return this._container
      }
      onRemove() { this._container.parentNode.removeChild(this._container) }
    }

    map.current.addControl(new RecenterControl(), 'bottom-right')
  }, [])

  const togglePanel = (name) => setActivePanel(prev => prev === name ? null : name)

  const handleGeocode = async () => {
    try {
      setStatus('Searching...')
      const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(address.trim())
      let latitude, longitude, displayAddress
      if (isCoordinate) {
        const [lat, lng] = address.split(',').map(s => parseFloat(s.trim()))
        const res = await axios.get(`${API}/geocode/reverse`, { params: { latitude: lat, longitude: lng } })
        latitude = res.data.latitude; longitude = res.data.longitude; displayAddress = res.data.address
      } else {
        const res = await axios.get(`${API}/geocode/forward`, { params: { address } })
        latitude = res.data.latitude; longitude = res.data.longitude; displayAddress = res.data.address
      }
      if (currentMarker.current) currentMarker.current.remove()
      map.current.flyTo({ center: [longitude, latitude], zoom: 15 })
      currentMarker.current = new maplibregl.Marker({ color: '#e74c3c' })
        .setLngLat([longitude, latitude])
        .setPopup(new maplibregl.Popup().setText(displayAddress))
        .addTo(map.current)
      currentLocation.current = { lat: latitude, lng: longitude }
      setStatus(`📍 Found: ${displayAddress}`)
    } catch (err) { setStatus('Location not found') }
  }

 const runBuffer = useCallback(async (distance) => {
  if (!currentLocation.current) {
    setStatus('Search or pin a location first!')
    return
  }
  try {
    const { lat, lng } = currentLocation.current
    const res = await axios.post(`${API}/spatial/buffer`,
      { type: 'Point', coordinates: [lng, lat] },
      { params: { distance_meters: distance } }
    )

    if (map.current.getSource('buffer')) {
      map.current.getSource('buffer').setData({ type: 'Feature', geometry: res.data.geometry })
    } else {
      map.current.addSource('buffer', { type: 'geojson', data: { type: 'Feature', geometry: res.data.geometry } })
      map.current.addLayer({ id: 'buffer-layer', type: 'fill', source: 'buffer', paint: { 'fill-color': '#3498db', 'fill-opacity': 0.3 } })
    }
    setStatus(`⭕ Buffer: ${distance}m around pinned location`)
  } catch (err) {
    setStatus('Buffer failed')
  }
}, [])

const throttledBuffer = useThrottle(runBuffer, 150)

const handleBufferSlider = (e) => {
  const distance = Number(e.target.value)
  setBufferDistance(distance)
  throttledBuffer(distance)
}

const clearBuffer = () => {
  if (map.current.getSource('buffer')) {
    map.current.removeLayer('buffer-layer')
    map.current.removeSource('buffer')
    setStatus('Buffer removed')
  }
}




  const handleViewshed = async () => {
    try {
      if (!currentLocation.current) { setStatus('Search or pin a location first!'); return }
      setStatus('Running viewshed...')
      const { lat, lng } = currentLocation.current
      const res = await axios.get(`${API}/viewshed/`, {
        params: { latitude: lat, longitude: lng, radius_meters: 1000, observer_height: 10 }
      })
      if (map.current.getSource('viewshed')) {
        map.current.removeLayer('viewshed-layer')
        map.current.removeSource('viewshed')
      }
      map.current.addSource('viewshed', { type: 'geojson', data: { type: 'Feature', geometry: res.data.visible_area } })
      map.current.addLayer({ id: 'viewshed-layer', type: 'fill', source: 'viewshed', paint: { 'fill-color': '#2ecc71', 'fill-opacity': 0.4 } })
      setStatus('👁️ Viewshed rendered!')
    } catch (err) { setStatus('Viewshed failed: ' + err.message) }
  }

  const handleRoute = async () => {
    try {
      setStatus('Calculating route...')
      const resolveLocation = async (input) => {
        const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(input.trim())
        if (isCoordinate) {
          const [lat, lng] = input.split(',').map(s => parseFloat(s.trim()))
          return { lat, lng }
        }
        const res = await axios.get(`${API}/geocode/forward`, { params: { address: input } })
        return { lat: res.data.latitude, lng: res.data.longitude }
      }
      const start = await resolveLocation(routeStart)
      const end = await resolveLocation(routeEnd)
      if (map.current.getSource('route')) {
        map.current.removeLayer('route-layer')
        map.current.removeSource('route')
      }
      const res = await axios.get(`${API}/routing/shortest-path`, {
        params: { start_lat: start.lat, start_lng: start.lng, end_lat: end.lat, end_lng: end.lng }
      })
      map.current.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: res.data.geometry } })
      map.current.addLayer({ id: 'route-layer', type: 'line', source: 'route', paint: { 'line-color': '#e67e22', 'line-width': 4 } })
      const coordinates = res.data.geometry.coordinates
      const bounds = coordinates.reduce((bounds, coord) => bounds.extend(coord),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]))
      map.current.fitBounds(bounds, { padding: 80 })
      const km = (res.data.distance_meters / 1000).toFixed(2)
      const mins = Math.round(res.data.duration_seconds / 60)
      setStatus(`🗺️ Route: ${km} km — ${mins} mins driving`)
    } catch (err) { setStatus('Route failed: ' + err.message) }
  }

  return (
    <div style={styles.container}>

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <SidebarBtn icon="🔍" active={activePanel === 'search'} tooltip="Search" onClick={() => togglePanel('search')} />
          <div style={styles.sidebarDivider} />
          <SidebarBtn icon="⭕" active={activePanel === 'buffer'} tooltip="Buffer" onClick={() => togglePanel('buffer')} />
          <SidebarBtn icon="👁️" tooltip="Viewshed" onClick={handleViewshed} />
          <SidebarBtn icon="🗺️" active={activePanel === 'route'} tooltip="Shortest Path" onClick={() => togglePanel('route')} />
        </div>
        <div style={styles.sidebarBottom}>
          <div style={styles.sidebarDivider} />
          <SidebarBtn icon="ℹ️" tooltip="About" />
        </div>
      </div>

      {/* Search Panel */}
      <Panel title="Search Location" open={activePanel === 'search'} onClose={() => setActivePanel(null)}>
        <InputField
          label="Address or Coordinates"
          placeholder="e.g. Taipei 101 or 25.033, 121.564"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGeocode()}
        />
        <PanelBtn onClick={handleGeocode}>Search</PanelBtn>
      </Panel>

      {/*Buffer Panel */}
      <Panel title="Buffer" open={activePanel === 'buffer'} onClose={() => setActivePanel(null)}>
        <SliderField
        label = "Distance"
        value={bufferDistance}
        min={100}
        max={2000}
        step={50}
        unit="m"
        onChange={handleBufferSlider}
        />
        <p style= {{ fontSize: '12px', color: '#999', marginBottom: '12px'}}>
          Drag to adjust buffer diameter!
        </p>
        <PanelBtn onClick={clearBuffer} color='#999'>Clear Buffer</PanelBtn>
      </Panel>

      {/* Route Panel */}
      <Panel title="Shortest Path" open={activePanel === 'route'} onClose={() => setActivePanel(null)}>
        <InputField
          label="Start Point"
          placeholder="Address or coordinate"
          value={routeStart}
          onChange={e => setRouteStart(e.target.value)}
        />
        <InputField
          label="End Point"
          placeholder="Address or coordinate"
          value={routeEnd}
          onChange={e => setRouteEnd(e.target.value)}
        />
        <div style={{ height: '1px', background: '#eee', margin: '12px 0' }} />
        <PanelBtn onClick={handleRoute} color="#8B4513">Find Route</PanelBtn>
      </Panel>

      {/* Map */}
      <div ref={mapContainer} style={styles.map} />

      {/* Status bar */}
      {status && <div style={styles.statusBar}>{status}</div>}
    </div>
  )
}

export default App