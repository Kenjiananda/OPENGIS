import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, CircleDashed, LandPlot, Route, Info, Layers, Timer, Pentagon, MapPin } from 'lucide-react'
import maplibregl, { Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'



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
    top: '0',
    left: '50px',
    right: '0',
    background: '#1a1a1a',
    padding: '10px 20px',
    fontSize: '13px',
    color: 'white',
    zIndex: 100,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '1px solid #333',
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
      position: 'fixed',
      top: '0',
      left: '50px',
      height: '100%',
      width: '320px',
      height: '100%',
      background: 'white',
      flexShrink: 0,
      display: 'flex',
      transform: open? 'translateX(0)' : 'translateX(-100%)',
      flexDirection: 'column',
      transition: 'transform 0.25s ease',
      boxShadow: open ? '4px 0 16px rgba(0,0,0,0.2)' : 'none',
      zIndex: 9,
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

function InputField({ label, placeholder, value, onChange, onKeyDown, overlay }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && <p style={{ fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder={overlay ? '' : placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd',
            borderRadius: '6px', fontSize: '14px', outline: 'none',
            fontFamily: 'Segoe UI, Arial, sans-serif',
          }}
        />
        {overlay && (
          <div style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', gap: '6px',
            color: '#999', opacity: 0.7, fontSize: '14px', fontWeight: 400,
            pointerEvents: 'none',
          }}>
            {overlay}
          </div>
        )}
      </div>
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

function StatusLine({ status }) {
  if (!status) return null
  return (
    <p style={{ fontSize: '12px', color: '#2d4a6e', background: '#eef4fa', padding: '8px 10px', borderRadius: '6px', marginBottom: '12px' }}>
      {status}
    </p>
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

function getNextDefaultName(shapesList) {
  const used = new Set(
    shapesList
      .map(s => /^Shape (\d+)$/.exec(s.name))
      .filter(Boolean)
      .map(m => Number(m[1]))
  )
  let n = 1
  while (used.has(n)) n++
  return `Shape ${n}`
}

function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [status, setStatus] = useState('')
  const [activePanel, setActivePanel] = useState(null)
  const [address, setAddress] = useState('')
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const [isochroneRadius, setIsochroneRadius] = useState(3)
  const [bufferDistance, setBufferDistance] = useState(500)
  const [viewshedRadius, setViewshedRadius] = useState(1000)
  const [viewshedHeight, setViewshedHeight] = useState(10)
  const currentMarker = useRef(null)
  const currentLocation = useRef(null)
  const [shapes, setShapes] = useState([])
  const [selectedShapeIds, setSelectedShapeIds] = useState([])
  const [focusedShapeId, setFocusedShapeId] = useState(null)
  const shapeCounter = useRef(0)
  const drawRef = useRef(null)
  const currentBufferGeometry = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [121.5644995, 25.0338352],
      zoom: 13
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: map.current, lib: maplibregl }),
        modes: [new TerraDrawPolygonMode(), new TerraDrawSelectMode()]
      })
      draw.start()
      drawRef.current = draw

      draw.on('finish', (id) => {
        const feature = draw.getSnapshot().find(f => f.id === id)
        if (feature) {
          addShape(feature.geometry, '#9b59b6')
          draw.clear()
          draw.setMode('select')
          setIsDrawing(false)
          isDrawingRef.current = false
        }
      })
      handleUseMyLocation() //auto request location
    })

    map.current.on('click', (e) =>{
      if (isDrawingRef.current) return 
      const{lng, lat} = e.lngLat
      if(currentMarker.current) currentMarker.current.remove()
      currentMarker.current = new maplibregl.Marker({color: '#e74c3c'})
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup().setText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`))
        .addTo(map.current)
      currentLocation.current ={lat, lng}
      setStatus(`Pinned —  ${lat.toFixed(5)}, ${lng.toFixed(5)}`)

      if(map.current.getSource('buffer')){
        throttledBuffer(bufferDistance)
      }

      if(map.current.getSource('viewshed')){
      throttledViewshed(viewshedRadius, viewshedHeight)
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

  const togglePanel = (name) => {
    if (drawRef.current) drawRef.current.setMode('select')
    setIsDrawing(false)
    isDrawingRef.current = false
    setActivePanel(prev => {
      if (prev && prev !== name) clearFeaturePreview(prev)
      return prev === name ? null : name
    })
  }

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
      setStatus(`Location Found — ${displayAddress}`)
    } catch (err) { setStatus('Location not found') }
  }

  const getLiveLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })

  const geoErrorMessage = (err) => {
    const messages = {
      1: 'Location permission denied',
      2: 'Location unavailable',
      3: 'Location request timed out',
    }
    return messages[err.code] || err.message || 'Failed to get your location'
  }

  const handleUseMyLocation = async () => {
    setStatus('Getting your location...')
    try {
      const { lat, lng } = await getLiveLocation()
      let displayAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      try {
        const res = await axios.get(`${API}/geocode/reverse`, { params: { latitude: lat, longitude: lng } })
        displayAddress = res.data.address
      } catch (err) {
        // reverse geocoding failed — fall back to raw coordinates
      }

      if (currentMarker.current) currentMarker.current.remove()
      map.current.flyTo({ center: [lng, lat], zoom: 15 })
      currentMarker.current = new maplibregl.Marker({ color: '#e74c3c' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup().setText(displayAddress))
        .addTo(map.current)
      currentLocation.current = { lat, lng }
      setStatus(`Location Found — ${displayAddress}`)

      if (map.current.getSource('buffer')) {
        throttledBuffer(bufferDistance)
      }
      if (map.current.getSource('viewshed')) {
        throttledViewshed(viewshedRadius, viewshedHeight)
      }
    } catch (err) {
      setStatus(geoErrorMessage(err))
    }
  }

  const addShape = (geometry, color = '#3498db', name = null) => {
    const id = shapeCounter.current++
    const layerId = `shape-${id}`
    map.current.addSource(layerId, { type: 'geojson', data: { type: 'Feature', geometry } })
    map.current.addLayer({ id: layerId, type: 'fill', source: layerId, paint: { 'fill-color': color, 'fill-opacity': 0.35 } })
    setShapes(prev => [...prev, { id, name: name || getNextDefaultName(prev), geometry }])
  }

  const removeShape = (id) => {
    const layerId = `shape-${id}`
    const outlineId = `shape-outline-${id}`
    if (map.current.getLayer(outlineId)) map.current.removeLayer(outlineId)
    if (map.current.getLayer(layerId)) map.current.removeLayer(layerId)
    if (map.current.getSource(layerId)) map.current.removeSource(layerId)
    setShapes(prev => prev.filter(s => s.id !== id))
    setSelectedShapeIds(prev => prev.filter(sid => sid !== id))
  }

  const renameShape = (id, newName) => {
    setShapes(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s))
  }

  const handleShapeNameBlur = (id) => {
    setShapes(prev => {
      const shape = prev.find(s => s.id === id)
      if (shape && !shape.name.trim()) {
        const others = prev.filter(s => s.id !== id)
        return prev.map(s => s.id === id ? { ...s, name: getNextDefaultName(others) } : s)
      }
      return prev
    })
  }

  const highlightShape = (id, selected) => {
    const layerId = `shape-${id}`
    const outlineId = `shape-outline-${id}`
    if (!map.current.getLayer(layerId)) return
    map.current.setPaintProperty(layerId, 'fill-opacity', selected ? 0.6 : 0.35)
    if (selected) {
      if (!map.current.getLayer(outlineId)) {
        map.current.addLayer({ id: outlineId, type: 'line', source: layerId, paint: { 'line-color': '#f1c40f', 'line-width': 3 } })
      }
    } else if (map.current.getLayer(outlineId)) {
      map.current.removeLayer(outlineId)
    }
  }

  const toggleDrawingPolygon = () => {
    if (!drawRef.current) return
    if (isDrawing) {
      drawRef.current.setMode('select')
      setIsDrawing(false)
      isDrawingRef.current = false
      setStatus('Drawing cancelled')
    } else {
      drawRef.current.setMode('polygon')
      setIsDrawing(true)
      isDrawingRef.current = true
      setStatus('Click points to draw a polygon, double-click to finish')
    }
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

    currentBufferGeometry.current = res.data.geometry

    if (map.current.getSource('buffer')) {
      map.current.getSource('buffer').setData({ type: 'Feature', geometry: res.data.geometry })
    } else {
      map.current.addSource('buffer', { type: 'geojson', data: { type: 'Feature', geometry: res.data.geometry } })
      map.current.addLayer({ id: 'buffer-layer', type: 'fill', source: 'buffer', paint: { 'fill-color': '#3498db', 'fill-opacity': 0.3 } })
    }
    setStatus(`Buffer active — ${distance}m`)
  } catch (err) {
    setStatus('Buffer failed')
  }
}, [])

const commitBuffer = () => {
  if (!currentBufferGeometry.current) {
    setStatus('No active buffer to add')
    return
  }
  addShape(currentBufferGeometry.current, '#3498db')
  setStatus('Buffer added to shapes')
}

const throttledBuffer = useThrottle(runBuffer, 150)

const handleBufferSlider = (e) => {
  const distance = Number(e.target.value)
  setBufferDistance(distance)
  throttledBuffer(distance)
}

const clearBuffer = ({ silent = false } = {}) => {
  if (map.current.getSource('buffer')) {
    map.current.removeLayer('buffer-layer')
    map.current.removeSource('buffer')
    currentBufferGeometry.current = null
    if (!silent) setStatus('Buffer removed')
  }
}
  const runViewshed = useCallback (async (radius, height) => {
    if(!currentLocation.current){
      setStatus('location is not Pinned!')
      return
    }
    try{
      const {lat, lng} = currentLocation.current
      const res = await axios.get(`${API}/viewshed/`,{
        params: {latitude: lat, longitude: lng, radius_meters: radius, observer_height: height}
      })
      if (map.current.getSource('viewshed')){
        map.current.getSource('viewshed').setData({type: 'Feature', geometry: res.data.visible_area}) 
      }else{
        map.current.addSource('viewshed', {type: 'geojson', data: {type: 'Feature', geometry: res.data.visible_area}})
        map.current.addLayer({ id: 'viewshed-layer', type: 'fill', source: 'viewshed', paint: { 'fill-color': '#2ecc71', 'fill-opacity': 0.4 } })
      }
      setStatus(`Viewshed active — ${radius}m radius, ${height}m height`)
    }catch(err){
      setStatus('viewshed failed: ' +  err.message)
    }
  }, [])

  const runIsochrone = async () => {
    if (!currentLocation.current) { setStatus('Pin a location first!'); return }
    try {
      setStatus('Calculating isochrone...')
      const { lat, lng } = currentLocation.current
      const res = await axios.get(`${API}/routing/isochrone`, {
        params: { lat, lng, radius_km: isochroneRadius, grid_size: 8 }
      })
      const features = res.data.points.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { duration: p.duration_seconds }
      }))
      const geojson = { type: 'FeatureCollection', features }

      if (map.current.getSource('isochrone')) {
        map.current.getSource('isochrone').setData(geojson)
      } else {
        map.current.addSource('isochrone', { type: 'geojson', data: geojson })
        map.current.addLayer({
          id: 'isochrone-layer', type: 'heatmap', source: 'isochrone',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'duration'], 0, 1, 900, 0],
            'heatmap-radius': 40,
            'heatmap-opacity': 0.7,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.3, '#2ecc71',
              0.6, '#f1c40f',
              1, '#e74c3c'
            ]
          }
        })
      }
      setStatus('Isochrone rendered')
    } catch (err) { setStatus('Isochrone failed: ' + err.message) }
  }

  const clearIsochrone = ({ silent = false } = {}) => {
    if (map.current.getSource('isochrone')) {
      map.current.removeLayer('isochrone-layer')
      map.current.removeSource('isochrone')
      if (!silent) setStatus('Isochrone removed')
    }
  }

  const throttledViewshed = useThrottle(runViewshed, 150)

  const handleViewshedRadiusSlider = (e) => {
    const radius = Number(e.target.value)
    setViewshedRadius(radius)
    throttledViewshed(radius, viewshedHeight)
  }

  const handleViewshedHeightSlider = (e) => {
    const height = Number(e.target.value)
    setViewshedHeight(height)
    throttledViewshed(viewshedRadius, height)
  }

  const clearViewshed = ({ silent = false } = {}) => {
    if(map.current.getSource('viewshed')){
      map.current.removeLayer('viewshed-layer')
      map.current.removeSource('viewshed')
      if (!silent) setStatus('viewshed removed')
    }
  }

  const clearRoute = ({ silent = false } = {}) => {
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-layer')
      map.current.removeSource('route')
      if (!silent) setStatus('Route removed')
    }
  }

  const clearFeaturePreview = (panelName) => {
    if (panelName === 'buffer') clearBuffer({ silent: true })
    else if (panelName === 'viewshed') clearViewshed({ silent: true })
    else if (panelName === 'route') clearRoute({ silent: true })
    else if (panelName === 'isochrone') clearIsochrone({ silent: true })
  }

  const toggleShapeSelect = (id) => {
    setSelectedShapeIds(prev => {
      const isSelected = prev.includes(id)
      highlightShape(id, !isSelected)
      return isSelected ? prev.filter(sid => sid !== id) : [...prev, id]
    })
  }

  const runOverlay = async (operation) => {
    if (selectedShapeIds.length < 2) return
    try {
      setStatus(`Running ${operation}...`)
      const geometries = shapes.filter(s => selectedShapeIds.includes(s.id)).map(s => s.geometry)
      const res = await axios.post(`${API}/spatial/${operation}`, { geometries })
      selectedShapeIds.forEach(id => removeShape(id))
      addShape(res.data.geometry, '#e74c3c')
      setSelectedShapeIds([])
      setStatus(`${operation} complete`)
    } catch (err) {
      setStatus(`${operation} failed: ` + (err.response?.data?.detail || err.message))
    }
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
      
      let start
      if(routeStart.trim() === ''){
        try {
          start = await getLiveLocation()
        } catch (err) {
          setStatus('No live location available, allow location access or enter a starting point!')
          return
        }
      }else{
        start = await resolveLocation(routeStart)
      }
      const end = await resolveLocation(routeEnd)

      if (currentMarker.current) currentMarker.current.remove()
      currentMarker.current = new maplibregl.Marker({ color: '#e74c3c' })
        .setLngLat([end.lng, end.lat])
        .addTo(map.current)
      currentLocation.current = end

      clearRoute({ silent: true })
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
      const hour = Math.floor(mins / 60)
      const remainingMins = mins % 60
      if(hour == 0){
        setStatus(`${km} km —— ${remainingMins}min `)
      }else{
        setStatus(`${km} km —— ${hour}h ${remainingMins}min `)   
      }
      
    } catch (err) { setStatus('Route failed: ' + err.message) }
  }

  
  return (
    <div style={styles.container}>

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <SidebarBtn icon={<Search size={20} strokeWidth={1.5} />} active={activePanel === 'search'} tooltip="Search" onClick={() => togglePanel('search')} />
          <div style={styles.sidebarDivider} />
          <SidebarBtn icon={<CircleDashed size={20} strokeWidth={1.5} />} active={activePanel === 'buffer'} tooltip="Buffer" onClick={() => togglePanel('buffer')} />
          <SidebarBtn icon={<LandPlot  size={20} strokeWidth={1.5} />} active={activePanel === 'viewshed'} tooltip="Viewshed" onClick={() => togglePanel('viewshed')} />
          <SidebarBtn icon={<Route size={20} strokeWidth={1.5} />} active={activePanel === 'route'} tooltip="Shortest Path" onClick={() => togglePanel('route')} />
          <SidebarBtn icon={<Layers size={20} strokeWidth={1.5} />} active={activePanel === 'shapes'} tooltip="Shapes" onClick={() => togglePanel('shapes')} />
          <SidebarBtn icon={<Timer size={20} strokeWidth={1.5} />} active={activePanel === 'isochrone'} tooltip="Drive Time" onClick={() => togglePanel('isochrone')} />
          <SidebarBtn icon={<Pentagon size={20} strokeWidth={1.5} />} active={isDrawing} tooltip="Draw Polygon" onClick={toggleDrawingPolygon} />
        </div>  
      </div>

      {/* Search Panel */}
      <Panel title="Search Location" open={activePanel === 'search'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <InputField
          label="Address or Coordinates"
          placeholder="e.g. Taipei 101 or 25.033, 121.564"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGeocode()}
        />
        <PanelBtn onClick={handleGeocode}>Search</PanelBtn>
        <PanelBtn onClick={handleUseMyLocation}>My Location</PanelBtn>
      </Panel>

      {/*Buffer Panel */}
      <Panel title="Buffer" open={activePanel === 'buffer'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
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
        <PanelBtn onClick={commitBuffer}>Add to Shapes</PanelBtn>
        <PanelBtn onClick={clearBuffer} color='#999'>Clear Buffer</PanelBtn>
      </Panel>

      {/*Viewshed panel*/}
      <Panel title="Viewshed" open={activePanel === 'viewshed'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <SliderField
        label="Radius"
        value={viewshedRadius}
        min = {200}
        max ={3000}
        step = {100}
        unit = "m"
        onChange={handleViewshedRadiusSlider}
        />
        <SliderField
        label="Observer Height"
        value={viewshedHeight}
        min = {1}
        max ={50}
        step = {1}
        unit = "m"
        onChange={handleViewshedHeightSlider}
        />
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px'}}>
          Drag to adjust radius and height
        </p>
        <PanelBtn onClick={clearViewshed} color="#999">Clear Viewshed</PanelBtn>
      </Panel>

      {/* Route Panel */}
      <Panel title="Shortest Path" open={activePanel === 'route'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <InputField
          label="Start Point"
          placeholder=""
          value={routeStart}
          onChange={e => setRouteStart(e.target.value)}
          overlay={routeStart.trim() === '' && !!navigator.geolocation ? (
            <>
              <MapPin size={13} strokeWidth={2} />
              My location
            </>
          ) : null}
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

      {/* Shapes Panel */}
      <Panel title="Shapes" open={activePanel === 'shapes'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
          Select 2 or more shapes to combine.
        </p>
        {shapes.length === 0 && <p style={{ fontSize: '13px', color: '#666' }}>No shapes yet — add a buffer or draw a polygon.</p>}
        {shapes.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={selectedShapeIds.includes(s.id)}
              onChange={() => toggleShapeSelect(s.id)}
            />
            <input
              type="text"
              value={s.name}
              onChange={e => renameShape(s.id, e.target.value)}
              onFocus={() => setFocusedShapeId(s.id)}
              onBlur={() => { setFocusedShapeId(null); handleShapeNameBlur(s.id) }}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              style={{
                fontSize: '13px', flex: 1, minWidth: 0, padding: '2px 4px',
                border: focusedShapeId === s.id ? '1px solid #ddd' : '1px solid transparent',
                borderRadius: '4px',
                background: focusedShapeId === s.id ? 'white' : 'transparent',
                outline: 'none', fontFamily: 'Segoe UI, Arial, sans-serif',
              }}
            />
            <button onClick={() => removeShape(s.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        {selectedShapeIds.length >= 2 && (
          <>
            <PanelBtn onClick={() => runOverlay('intersect')} color="#8e44ad">Intersect</PanelBtn>
            <PanelBtn onClick={() => runOverlay('union')} color="#8e44ad">Union</PanelBtn>
          </>
        )}
      </Panel>

      <Panel title="Drive Time" open={activePanel === 'isochrone'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <SliderField
          label="Radius"
          value={isochroneRadius}
          min={1}
          max={10}
          step={1}
          unit="km"
          onChange={e => setIsochroneRadius(Number(e.target.value))}
        />
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
          Pin a location, then calculate approximate drive-time coverage. Green = fast, red = slow.
        </p>
        <PanelBtn onClick={runIsochrone}>Calculate</PanelBtn>
        <PanelBtn onClick={clearIsochrone} color="#999">Clear</PanelBtn>
      </Panel>

      {/* Map */}
      <div ref={mapContainer} style={styles.map} />

      {/* Status bar */}

    </div>
  )
}

export default App