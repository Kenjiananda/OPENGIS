import { useEffect, useRef, useState, useCallback } from 'react'
import {createRoot} from 'react-dom/client'
import { Search, CircleDashed, LandPlot, Route, Info, Layers, Timer, Pentagon, MapPin, AtSignIcon, Hospital, FireExtinguisher, MapPinned, Sun, Moon, Users } from 'lucide-react'
import maplibregl, { Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'



const API = 'http://127.0.0.1:8000'

// Tailwind class strings for the app shell. Note this theme makes --border and
// --card pure white in light mode, so surfaces are separated by shadows and
// `ring-ring` hairlines rather than by border colors.
const cls = {
  container: 'w-screen h-screen flex flex-row overflow-hidden',
  sidebar: 'w-[50px] h-full bg-sidebar text-sidebar-foreground flex flex-col items-center py-2 z-10 shrink-0 shadow-md',
  sidebarTop: 'flex flex-col items-center w-full flex-1',
  sidebarBottom: 'flex flex-col items-center w-full pb-2',
  sidebarDivider: 'w-[30px] h-px bg-ring/40 my-1',
  map: 'flex-1 h-full min-w-0',
}

function SidebarBtn({ icon, active, tooltip, onClick }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`w-10 h-10 my-0.5 flex items-center justify-center rounded-md cursor-pointer transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      }`}
    >
      {icon}
    </button>
  )
}

function Panel({ title, open, onClose, children }) {
  return (
    <div
      className={`fixed top-0 left-[50px] h-full w-[320px] shrink-0 z-[9] flex flex-col bg-card text-card-foreground transition-transform duration-[250ms] ease-out ${
        open ? 'translate-x-0 shadow-xl' : '-translate-x-full shadow-none'
      }`}
    >
      <div className="flex items-center gap-2.5 p-4 min-w-[320px] border-b border-ring/30">
        <button
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer text-[22px] leading-none text-muted-foreground hover:text-foreground"
        >
          ‹
        </button>
        <span className="text-base font-semibold whitespace-nowrap">{title}</span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto min-w-[320px]">
        {children}
      </div>
    </div>
  )
}

function InputField({ label, placeholder, value, onChange, onKeyDown, overlay }) {
  return (
    <div className="mb-4">
      {label && (
        <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">{label}</p>
      )}
      <div className="relative">
        <input
          type="text"
          placeholder={overlay ? '' : placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className="w-full px-3 py-2.5 rounded-md text-sm bg-input text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary"
        />
        {overlay && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-normal text-muted-foreground pointer-events-none">
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide m-0">
          {label}
        </p>
        <span className="text-[13px] font-semibold text-foreground">
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
        className="w-full cursor-pointer accent-primary"
      />
    </div>
  )
}

const panelBtnVariants = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground ring-1 ring-ring hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
}

function PanelBtn({ onClick, variant = 'primary', tooltip, children }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`w-full p-2.5 mb-2 rounded-md text-sm font-medium cursor-pointer border-none transition-opacity ${panelBtnVariants[variant]}`}
    >
      {children}
    </button>
  )
}

function StatusLine({ status }) {
  if (!status) return null
  return (
    <p className="text-xs text-foreground bg-accent ring-1 ring-ring/50 px-2.5 py-2 rounded-md mb-3">
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

// The assistant is told to leave `location` empty for "near me" style requests,
// but it often echoes the user's own wording instead ("here", "my location").
// Treat those as blank so they fall through to the live-GPS branch.
// Axios's own message for a failed request is just "Request failed with status
// code 404", which hides the reason. The backend always sends a human-readable
// explanation in `detail` (e.g. "not found in Taipei or New Taipei"), so prefer it.
function apiError(err) {
  return err.response?.data?.detail || err.message
}

function isSelfReferentialLocation(text) {
  const normalized = (text || '').trim().toLowerCase()
  return normalized === '' || ['here', 'me', 'near me', 'my location', 'current location', 'my current location'].includes(normalized)
}

function getNextDefaultName(shapesList, prefix = 'Shape') {
  const pattern = new RegExp(`^${prefix} (\\d+)$`)
  const used = new Set(
    shapesList
      .map(s => pattern.exec(s.name))
      .filter(Boolean)
      .map(m => Number(m[1]))
  )
  let n = 1
  while (used.has(n)) n++
  return `${prefix} ${n}`
}

function createIconMarkerElement(IconComponent, color, size = 30) {
    const outer = document.createElement('div')
    outer.style.width = `${size}px`
    outer.style.height = `${size}px`

    const inner = document.createElement('div')
    Object.assign(inner.style, {
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'white', borderRadius: '50%', border: `2px solid ${color}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)', cursor: 'pointer', transition: 'transform 0.15s ease',
    })
    outer.appendChild(inner)

    const root = createRoot(inner)
    root.render(<IconComponent size={Math.round(size * 0.6)} color={color} strokeWidth={2.25} />)
    return { element: outer, innerEl: inner, root }
  }

  function createImageMarkerElement(src, size = 30) {
    const outer = document.createElement('div')
    outer.style.width = `${size}px`
    outer.style.height = `${size}px`

    const inner = document.createElement('div')
    Object.assign(inner.style, {
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'white', borderRadius: '50%', border: '2px solid #666',
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)', cursor: 'pointer', transition: 'transform 0.15s ease',
    })
    const img = document.createElement('img')
    img.src = src
    img.style.width = '70%'; img.style.height = '70%'; img.style.objectFit = 'contain'
    inner.appendChild(img)
    outer.appendChild(inner)
    return { element: outer, innerEl: inner, root: null }
  }

  function setMarkerHighlight(innerEl, active) {
    innerEl.style.transform = active ? 'scale(1.35)' : 'scale(1)'
    innerEl.style.zIndex = active ? '10' : '0'
  }

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str ?? ''
    return div.innerHTML
  }

  // Builds the raw HTML for a marker's hover popup — used via maplibregl.Popup#setHTML,
  // not JSX, so styling is inline rather than Tailwind classes.
  function buildFeaturePopupHtml(name, address, metaLines) {
    return `
      <div style="font-family: Segoe UI, Arial, sans-serif; min-width: 170px; max-width: 240px;">
        <p style="margin:0 0 2px; font-size:13px; font-weight:600; color:#1a1a1a;">${escapeHtml(name)}</p>
        ${address ? `<p style="margin:0 0 6px; font-size:11px; color:#666;">${escapeHtml(address)}</p>` : ''}
        ${(metaLines || []).map(line => `<p style="margin:0; font-size:11px; font-weight:500; color:#2d4a6e;">${escapeHtml(line)}</p>`).join('')}
      </div>
    `
  }

  // Wires hover-to-preview behavior on a marker's DOM element: scales the icon
  // (matching the existing list-hover effect) and shows a popup at its coordinates,
  // like Google Maps' hover card. No panTo here (unlike list-item hover) — the
  // marker is already on screen, and panning under the cursor would just cause
  // mouseleave/mouseenter to fight each other.
  function attachMarkerHoverPopup(mapInstance, element, innerEl, lngLat, popup) {
    element.addEventListener('mouseenter', () => {
      setMarkerHighlight(innerEl, true)
      popup.setLngLat(lngLat).addTo(mapInstance)
    })
    element.addEventListener('mouseleave', () => {
      setMarkerHighlight(innerEl, false)
      popup.remove()
    })
  }


function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [status, setStatus] = useState('')
  const [theme, setTheme] = useState('light')
  const [activePanel, setActivePanel] = useState(null)
  const [address, setAddress] = useState('')
  const [assistantInput, setAssistantInput] = useState('')
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const [isochroneMinutes, setIsochroneMinutes] = useState(15)
  const [bufferDistance, setBufferDistance] = useState(500)
  const [viewshedRadius, setViewshedRadius] = useState(1000)
  const [viewshedHeight, setViewshedHeight] = useState(10)
  const [nearbyResults, setNearbyResults] = useState([])
  const [nearbyCategory, setNearbyCategory] = useState('hospital')
  const [nearbyRadius, setNearbyRadius] = useState(5000)
  const [nearbySearchCenter, setNearbySearchCenter] = useState(null)
  const nearbyMarkersRef = useRef([])
  const [bestDestCategory, setBestDestCategory] = useState('hospital')
  const [bestDestRadius, setBestDestRadius] = useState(5000)
  const [originAInput, setOriginAInput] = useState('')
  const [originBInput, setOriginBInput] = useState('')
  const [bestDestOrigins, setBestDestOrigins] = useState([])
  const [bestDestResults, setBestDestResults] = useState([])
  const originMarkersRef = useRef([])
  const bestDestMarkersRef = useRef([])
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
  const activePanelRef = useRef(null)
  

  useEffect(() => {
    activePanelRef.current = activePanel
  },[activePanel])

  // The theme's `.dark` block overrides the CSS custom properties, so the class
  // has to sit on an ancestor of everything — <html> is the usual place.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

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
          addShape(feature.geometry, '#9b59b6', null, activePanelRef.current, 'Polygon')
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

      if(map.current.getSource('buffer') && activePanelRef.current === 'buffer'){
        throttledBuffer(bufferDistance)
      }

      if(map.current.getSource('viewshed') && activePanelRef.current === 'viewshed'){
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
    if (['buffer', 'viewshed', 'route', 'isochrone', 'nearby', 'best-destination'].includes(name)) {
      clearOtherPreviews(name)
    }
    setActivePanel(prev => {
      return prev === name ? null : name
    })
  }

  const pinLocation = async (locationText) => {
    const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(locationText.trim())
    let latitude, longitude, displayAddress
    if (isCoordinate) {
      const [lat, lng] = locationText.split(',').map(s => parseFloat(s.trim()))
      const res = await axios.get(`${API}/geocode/reverse`, { params: { latitude: lat, longitude: lng } })
      latitude = res.data.latitude; longitude = res.data.longitude; displayAddress = res.data.address
    } else {
      const res = await axios.get(`${API}/geocode/forward`, { params: { address: locationText } })
      latitude = res.data.latitude; longitude = res.data.longitude; displayAddress = res.data.address
    }
    if (currentMarker.current) currentMarker.current.remove()
    map.current.flyTo({ center: [longitude, latitude], zoom: 15 })
    currentMarker.current = new maplibregl.Marker({ color: '#e74c3c' })
      .setLngLat([longitude, latitude])
      .setPopup(new maplibregl.Popup().setText(displayAddress))
      .addTo(map.current)
    currentLocation.current = { lat: latitude, lng: longitude }
    return { lat: latitude, lng: longitude, displayAddress }
  }

  const handleGeocode = async (overrideAddress) => {
    try {
      setStatus('Searching...')
      const query = overrideAddress ?? address
      const { displayAddress } = await pinLocation(query)
      setStatus(` ${displayAddress}`)
    } catch (err) { setStatus('Location not found') }
  }

  

  const dispatch = {
    
    geocode: (params) => {
      if(!params.location || params.location.trim() === ''){
        handleUseMyLocation()
      }else{
        handleGeocode(params.location)
      }
    },
    no_action: (params) => setStatus(params.reason),
    create_buffer: async (params) => {
      try {
        await resolveAssistantLocation(params.location)
        setBufferDistance(params.distance_meters)
        await runBuffer(params.distance_meters)
        commitBuffer()
      } catch (err) {
        setStatus('Could not create buffer: ' + apiError(err))
      }
    },
    create_buffers: (params) => createMultipleBuffers(params.locations, params.distances_meters, params.operation),
    viewshed: async (params) => {
      try {
        await resolveAssistantLocation(params.location)
        setViewshedRadius(params.radius_meters)
        setViewshedHeight(params.observer_height)
        await runViewshed(params.radius_meters, params.observer_height)
      } catch (err) {
        setStatus('Could not calculate viewshed: ' + apiError(err))
      }
    },
    isochrone: async (params) => {
      try {
        await resolveAssistantLocation(params.location)
        // The assistant still speaks in km; treat it as a rough drive-time budget
        // (Taipei traffic averages well under 30km/h, so ~3 min per km is realistic).
        const minutes = params.max_minutes ?? Math.min(60, Math.max(5, Math.round((params.radius_km ?? 5) * 3)))
        setIsochroneMinutes(minutes)
        await runIsochrone(minutes)
      } catch (err) {
        setStatus('Could not calculate isochrone: ' + apiError(err))
      }
    },
    find_route: (params) => handleRoute(params.start_location, params.end_location),
    find_nearby_features: (params) => runNearbyFeatures(params.category, params.location, params.radius_meters),
    find_best_destination: (params) => runBestDestination(params.origin_a, params.origin_b, params.category, params.radius_meters, params.mode),
  }


  const handleAssistantQuery = async(text) => {
    try{
      setStatus('Thinking...')
      const res = await axios.post(`${API}/assistant/query`, {message: text})
      const {action, params} = res.data
      const handler = dispatch[action]
      if (handler){
        handler(params)
      }else{
        setStatus(`Assistant asked for an action this app doesn't support: ${action}`)
      }
    }catch (err){
      // The backend puts the real reason (quota exceeded, no tool call, etc.) in
      // `detail` — show it instead of failing silently to the console.
      setStatus(apiError(err))
    }
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

  // Shared by every assistant action that takes a `location` param: resolves a
  // named place via pinLocation, or falls back to live GPS (dropping the same
  // red marker) when the assistant left it blank or echoed a self-referential
  // phrase like "here" — see isSelfReferentialLocation.
  const resolveAssistantLocation = async (location) => {
    if (location && !isSelfReferentialLocation(location)) {
      return await pinLocation(location)
    }
    let center
    try {
      center = await getLiveLocation()
    } catch (err) {
      throw new Error(geoErrorMessage(err))
    }
    if (currentMarker.current) currentMarker.current.remove()
    currentMarker.current = new maplibregl.Marker({ color: '#e74c3c' })
      .setLngLat([center.lng, center.lat])
      .addTo(map.current)
    currentLocation.current = center
    return center
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
      setStatus(`${displayAddress}`)

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

  const addShape = (geometry, color = '#3498db', name = null, origin = activePanel, typeLabel = 'Shape') => {
    const id = shapeCounter.current++
    const layerId = `shape-${id}`
    map.current.addSource(layerId, { type: 'geojson', data: { type: 'Feature', geometry } })
    map.current.addLayer({ id: layerId, type: 'fill', source: layerId, paint: { 'fill-color': color, 'fill-opacity': 0.35 } })
    setShapes(prev => [...prev, { id, name: name || getNextDefaultName(prev, typeLabel), geometry, origin }])
    return id
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
  
  useEffect(() => {
    if (!map.current) return
    shapes.forEach(s => {
      const layerId = `shape-${s.id}`
      const outlineId = `shape-outline-${s.id}`
      const visible = activePanel === 'shapes' || activePanel === s.origin
      const visibility = visible ? 'visible' : 'none'
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', visibility)
      }
      if (map.current.getLayer(outlineId)) {
        map.current.setLayoutProperty(outlineId, 'visibility', visibility)
      }
    })
  }, [activePanel, shapes])

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
      clearOtherPreviews(null)
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
  clearOtherPreviews('buffer')
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
  const id = addShape(currentBufferGeometry.current, '#3498db',  null, undefined, 'Buffer')
  setStatus('Buffer added to shapes')
  return id
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
    clearOtherPreviews('viewshed')
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
      setStatus('viewshed failed: ' + apiError(err))
    }
  }, [])

  const runIsochrone = async (overrideRadius) => {
    if (!currentLocation.current) { setStatus('Pin a location first!'); return }
    clearOtherPreviews('isochrone')
    try {
      setStatus('Calculating isochrone...')
      const minutes = overrideRadius ?? isochroneMinutes
      const { lat, lng } = currentLocation.current
      // Mapbox's Isochrone API caps at 4 contours and 60 minutes.
      const res = await axios.get(`${API}/routing/isochrone`, {
        params: { lat, lng, max_minutes: minutes, bands: 4 }
      })
      // Bands come back ordered fastest -> slowest; tag each with its position
      // so the color ramp below doesn't need to know actual duration values.
      const features = res.data.features.map((f, i) => ({
        ...f,
        properties: { ...f.properties, band_index: i }
      }))
      const geojson = { type: 'FeatureCollection', features }

      if (map.current.getSource('isochrone')) {
        map.current.getSource('isochrone').setData(geojson)
      } else {
        map.current.addSource('isochrone', { type: 'geojson', data: geojson })
        map.current.addLayer({
          id: 'isochrone-layer', type: 'fill', source: 'isochrone',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['get', 'band_index'],
              0, '#2ecc71',
              1.5, '#f1c40f',
              3, '#e74c3c'
            ],
            'fill-opacity': 0.35,
            'fill-outline-color': '#ffffff'
          }
        })
      }
      setStatus('Isochrone rendered')
    } catch (err) { setStatus('Isochrone failed: ' + apiError(err)) }
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

  const clearNearbyFeatures = ({ silent = false } = {}) => {
    nearbyMarkersRef.current.forEach(({ marker, root, popup }) => {
      marker.remove()
      if (root) root.unmount()
      if (popup) popup.remove()
    })
    nearbyMarkersRef.current = []
    setNearbyResults([])
    if (!silent) setStatus('Nearby results cleared')
  }


  const clearBestDestination = ({ silent = false } = {}) => {
    originMarkersRef.current.forEach(m => m.remove())
    originMarkersRef.current = []
    bestDestMarkersRef.current.forEach(({ marker, root, popup }) => {
      marker.remove()
      if (root) root.unmount()
      if (popup) popup.remove()
    })
    bestDestMarkersRef.current = []
    setBestDestResults([])
    setBestDestOrigins([])
    if (!silent) setStatus('Results cleared')
  }

  const clearOtherPreviews = (keep) => {
    if(keep !== 'buffer') clearBuffer({silent: true})
    if(keep !== 'viewshed') clearViewshed({silent: true})
    if(keep !== 'route') clearRoute({silent: true})
    if(keep !== 'isochrone') clearIsochrone({silent: true})
      if(keep !== 'nearby') clearNearbyFeatures({silent: true})
      if(keep !== 'best-destination') clearBestDestination({silent: true})
  }

  const toggleShapeSelect = (id) => {
    setSelectedShapeIds(prev => {
      const isSelected = prev.includes(id)
      highlightShape(id, !isSelected)
      return isSelected ? prev.filter(sid => sid !== id) : [...prev, id]
    })
  }

  // overrideIds/overrideGeometries let a caller that just created shapes in this
  // same tick (e.g. createMultipleBuffers) pass them directly, since `shapes`
  // state won't reflect a setShapes() call from earlier in the same function yet.
  const runOverlay = async (operation, overrideIds, overrideGeometries) => {
    const ids = overrideIds ?? selectedShapeIds
    if (ids.length < 2) return
    try {
      setStatus(`Running ${operation}...`)
      const geometries = overrideGeometries ?? shapes.filter(s => ids.includes(s.id)).map(s => s.geometry)
      const res = await axios.post(`${API}/spatial/${operation}`, { geometries })
      ids.forEach(id => removeShape(id))
      addShape(res.data.geometry, '#e74c3c', null, undefined, operation.charAt(0).toUpperCase() + operation.slice(1))
      setSelectedShapeIds([])
      setStatus(`${operation} complete`)
    } catch (err) {
      setStatus(`${operation} failed: ` + apiError(err))
    }
  }

  const createMultipleBuffers = async (locations, distancesMeters, operation) => {
    if (!locations || !distancesMeters || locations.length !== distancesMeters.length) {
      setStatus('Could not create buffers: locations and distances must line up one-to-one')
      return
    }
    const op = (operation || 'none').toLowerCase()
    if (op !== 'none' && op !== 'union' && op !== 'intersect') {
      setStatus(`Could not create buffers: "${operation}" isn't a real operation — expected union, intersect, or none`)
      return
    }

    try {
      const ids = []
      const geometries = []
      for (let i = 0; i < locations.length; i++) {
        setStatus(`Creating buffer ${i + 1} of ${locations.length}...`)
        await resolveAssistantLocation(locations[i])
        setBufferDistance(distancesMeters[i])
        await runBuffer(distancesMeters[i])
        const id = commitBuffer()
        ids.push(id)
        geometries.push(currentBufferGeometry.current)
      }

      if (op === 'none') {
        setStatus(`Created ${ids.length} buffers`)
        return
      }
      if (ids.length < 2) {
        setStatus(`Need at least 2 buffers to ${op}, only got ${ids.length}`)
        return
      }
      await runOverlay(op, ids, geometries)
    } catch (err) {
      setStatus('Could not create buffers: ' + apiError(err))
    }
  }

  const handleRoute = async (overrideStart, overrideEnd) => {
    try {
      setStatus('Calculating route...')
      clearOtherPreviews('route')
      const resolveLocation = async (input) => {
        const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(input.trim())
        if (isCoordinate) {
          const [lat, lng] = input.split(',').map(s => parseFloat(s.trim()))
          return { lat, lng }
        }
        const res = await axios.get(`${API}/geocode/forward`, { params: { address: input } })
        return { lat: res.data.latitude, lng: res.data.longitude }
      }

      const startText = overrideStart ?? routeStart
      const endText = overrideEnd ?? routeEnd

      let start
      if(startText.trim() === ''){
        try {
          start = await getLiveLocation()
        } catch (err) {
          setStatus('No live location available, allow location access or enter a starting point!')
          return
        }
      }else{
        start = await resolveLocation(startText)
      }
      const end = await resolveLocation(endText)

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
        setStatus(`${km} km (${remainingMins}min) `)
      }else{
        setStatus(`${km} km (${hour}h ${remainingMins}min) `)   
      }
      
    } catch (err) { setStatus('Route failed: ' + apiError(err)) }
  }

  // radiusMeters defaults here because the assistant may omit it — the tool schema
  // marks it optional, and passing undefined through would blank the radius slider.
  const runNearbyFeatures = async (category, location, radiusMeters = 5000) => {
    try {
      setStatus('Searching nearby...')
      clearOtherPreviews('nearby')
      clearNearbyFeatures({ silent: true })

      const center = await resolveAssistantLocation(location)

      setNearbySearchCenter(center)

      const res = await axios.get(`${API}/routing/nearby-routes`, {
        params: { lat: center.lat, lng: center.lng, radius_m: radiusMeters, category }
      })
      const results = res.data.results

      results.forEach(r => {
        const { element, innerEl, root } = category === 'police_station'
          ? createImageMarkerElement('/images/police_station_icon.png')
          : createIconMarkerElement(category === 'hospital' ? Hospital : FireExtinguisher, category === 'hospital' ? '#c73d3d' : '#ff0000')
        const marker = new maplibregl.Marker({ element }).setLngLat([r.lng, r.lat]).addTo(map.current)
        const popup = new maplibregl.Popup({ offset: 20, closeButton: false, closeOnClick: false })
          .setHTML(buildFeaturePopupHtml(r.name, r.address, [
            `${(r.driving_distance_m / 1000).toFixed(2)} km — ${Math.round(r.driving_duration_s / 60)} min drive`,
          ]))
        attachMarkerHoverPopup(map.current, element, innerEl, [r.lng, r.lat], popup)
        nearbyMarkersRef.current.push({ id: r.id, marker, innerEl, root, popup })
      })

      setNearbyResults(results)
      setNearbyCategory(category)
      setNearbyRadius(radiusMeters)
      setActivePanel('nearby')

      if (results.length > 0) {
        const bounds = results.reduce((b, r) => b.extend([r.lng, r.lat]), new maplibregl.LngLatBounds([center.lng, center.lat], [center.lng, center.lat]))
        map.current.fitBounds(bounds, { padding: 80, maxZoom: 16 })
        setStatus(`Found ${results.length} result${results.length === 1 ? '' : 's'} nearby`)
      } else {
        map.current.flyTo({ center: [center.lng, center.lat], zoom: 14 })
        setStatus(`No results found within ${radiusMeters}m`)
      }
    } catch (err) {
      setStatus('Nearby search failed: ' + apiError(err))
    }
  }

  const handleNearbyHover = (r, active) => {
    const entry = nearbyMarkersRef.current.find(m => m.id === r.id)
    if (entry) setMarkerHighlight(entry.innerEl, active)
    if (active) map.current.panTo([r.lng, r.lat])
  }

  // Unlike resolveAssistantLocation, this can't touch the singular
  // currentMarker/currentLocation refs — two independent origins need two
  // independent pins that stick around at once.
  const resolveOriginLocation = async (text) => {
    const trimmed = (text || '').trim()
    if (isSelfReferentialLocation(trimmed)) {
      try {
        return await getLiveLocation()
      } catch (err) {
        throw new Error(geoErrorMessage(err))
      }
    }
    const isCoordinate = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(trimmed)
    if (isCoordinate) {
      const [lat, lng] = trimmed.split(',').map(s => parseFloat(s.trim()))
      return { lat, lng }
    }
    const res = await axios.get(`${API}/geocode/forward`, { params: { address: trimmed } })
    return { lat: res.data.latitude, lng: res.data.longitude }
  }

  // Overrides let the assistant dispatch pass values straight through instead of
  // relying on originAInput/bestDestCategory state, which wouldn't be updated yet
  // in the same tick right after a setOriginAInput() call — same hazard runOverlay
  // and createMultipleBuffers hit with `shapes` state earlier.
  const runBestDestination = async (overrideOriginA, overrideOriginB, overrideCategory, overrideRadius, overrideMode) => {
    try {
      setStatus('Finding best match...')
      clearOtherPreviews('best-destination')
      clearBestDestination({ silent: true })

      const originAText = overrideOriginA ?? originAInput
      const originBText = overrideOriginB ?? originBInput
      const category = overrideCategory ?? bestDestCategory
      const radius = overrideRadius ?? bestDestRadius
      const mode = overrideMode ?? 'priority'

      const [a, b] = await Promise.all([
        resolveOriginLocation(originAText),
        resolveOriginLocation(originBText),
      ])
      const origins = [
        { ...a, label: 'Origin A' },
        { ...b, label: 'Origin B' },
      ]

      origins.forEach((o, i) => {
        const marker = new maplibregl.Marker({ color: i === 0 ? '#4a90d9' : '#9b59b6' })
          .setLngLat([o.lng, o.lat])
          .setPopup(new maplibregl.Popup().setText(o.label))
          .addTo(map.current)
        originMarkersRef.current.push(marker)
      })
      setBestDestOrigins(origins)
      setOriginAInput(isSelfReferentialLocation(originAText) ? '' : originAText)
      setOriginBInput(isSelfReferentialLocation(originBText) ? '' : originBText)
      setBestDestCategory(category)
      setBestDestRadius(radius)

      const res = await axios.post(`${API}/routing/best-destination`, {
        origins: origins.map(o => ({ lat: o.lat, lng: o.lng, label: o.label })),
        category,
        radius_m: radius,
        mode,
      })
      const results = res.data.results

      results.forEach((r, i) => {
        const size = i === 0 ? 38 : 30
        const { element, innerEl, root } = category === 'police_station'
          ? createImageMarkerElement('/images/police_station_icon.png', size)
          : createIconMarkerElement(category === 'hospital' ? Hospital : FireExtinguisher, category === 'hospital' ? '#c73d3d' : '#ff0000', size)
        const marker = new maplibregl.Marker({ element }).setLngLat([r.lng, r.lat]).addTo(map.current)
        const metaLines = [
          i === 0 ? 'Best match' : null,
          ...r.durations_s.map((d, j) => `${origins[j]?.label || `Origin ${j + 1}`}: ${Math.round(d / 60)} min drive`),
        ].filter(Boolean)
        const popup = new maplibregl.Popup({ offset: size / 2 + 6, closeButton: false, closeOnClick: false })
          .setHTML(buildFeaturePopupHtml(r.name, r.address, metaLines))
        attachMarkerHoverPopup(map.current, element, innerEl, [r.lng, r.lat], popup)
        bestDestMarkersRef.current.push({ id: r.id, marker, innerEl, root, popup })
      })

      setBestDestResults(results)
      setActivePanel('best-destination')

      if (results.length > 0) {
        const bounds = origins.reduce((b, o) => b.extend([o.lng, o.lat]), new maplibregl.LngLatBounds([origins[0].lng, origins[0].lat], [origins[0].lng, origins[0].lat]))
        results.forEach(r => bounds.extend([r.lng, r.lat]))
        map.current.fitBounds(bounds, { padding: 80, maxZoom: 15 })
        setStatus(`Best match: ${results[0].name}`)
      } else {
        const bounds = origins.reduce((b, o) => b.extend([o.lng, o.lat]), new maplibregl.LngLatBounds([origins[0].lng, origins[0].lat], [origins[0].lng, origins[0].lat]))
        map.current.fitBounds(bounds, { padding: 120, maxZoom: 14 })
        setStatus(`No ${category.replace('_', ' ')} found within ${radius}m of both`)
      }
    } catch (err) {
      setStatus('Could not find best match: ' + apiError(err))
    }
  }

  const handleBestDestHover = (r, active) => {
    const entry = bestDestMarkersRef.current.find(m => m.id === r.id)
    if (entry) setMarkerHighlight(entry.innerEl, active)
    if (active) map.current.panTo([r.lng, r.lat])
  }


  
  return (
    <div className={cls.container}>

      {/* Sidebar */}
      <div className={cls.sidebar}>
        <div className={cls.sidebarTop}>
          <SidebarBtn icon={<Search size={20} strokeWidth={1.5} />} active={activePanel === 'search'} tooltip="Search" onClick={() => togglePanel('search')} />
          <div className={cls.sidebarDivider} />
          <SidebarBtn icon={<CircleDashed size={20} strokeWidth={1.5} />} active={activePanel === 'buffer'} tooltip="Buffer" onClick={() => togglePanel('buffer')} />
          <SidebarBtn icon={<Pentagon size={20} strokeWidth={1.5} />} active={isDrawing} tooltip="Draw Polygon" onClick={toggleDrawingPolygon} />
          <SidebarBtn icon={<LandPlot  size={20} strokeWidth={1.5} />} active={activePanel === 'viewshed'} tooltip="Viewshed" onClick={() => togglePanel('viewshed')} />
          <SidebarBtn icon={<Route size={20} strokeWidth={1.5} />} active={activePanel === 'route'} tooltip="Shortest Path" onClick={() => togglePanel('route')} />
          <SidebarBtn icon={<Layers size={20} strokeWidth={1.5} />} active={activePanel === 'shapes'} tooltip="Shapes" onClick={() => togglePanel('shapes')} />
          <SidebarBtn icon={<Timer size={20} strokeWidth={1.5} />} active={activePanel === 'isochrone'} tooltip="Drive Time" onClick={() => togglePanel('isochrone')} />
          <SidebarBtn icon={<MapPinned size={20} strokeWidth={1.5} />} active={activePanel === 'nearby'} tooltip="Nearby Places" onClick={() => togglePanel('nearby')} />
          <SidebarBtn icon={<Users size={20} strokeWidth={1.5} />} active={activePanel === 'best-destination'} tooltip="Best For Everyone" onClick={() => togglePanel('best-destination')} />
        </div>
        <div className={cls.sidebarBottom}>
          <SidebarBtn
            icon={theme === 'dark' ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
            tooltip={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
          />
        </div>
      </div>

      {/* Search Panel */}
      <Panel title="Search Location" open={activePanel === 'search'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <InputField
          label="Search or Ask the assistant"
          placeholder="Where is Taipei 101?"
          value={assistantInput}
          onChange={e => setAssistantInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAssistantQuery(assistantInput)}
        />
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
        <PanelBtn onClick={clearBuffer} variant="secondary">Clear Buffer</PanelBtn>
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
        <PanelBtn onClick={clearViewshed} variant="secondary">Clear Viewshed</PanelBtn>
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
        <PanelBtn onClick={() => handleRoute()}>Find Route</PanelBtn>
      </Panel>

      {/* Shapes Panel */}
      <Panel title="Shapes" open={activePanel === 'shapes'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
          Select 2 or more shapes to combine.
        </p>
        {shapes.length === 0 && <p style={{ fontSize: '13px', color: '#666' }}>No shapes yet! add a buffer or draw a polygon.</p>}
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
            <PanelBtn onClick={() => runOverlay('intersect')}>Intersect</PanelBtn>
            <PanelBtn onClick={() => runOverlay('union')}>Union</PanelBtn>
          </>
        )}
      </Panel>

      <Panel title="Drive Time" open={activePanel === 'isochrone'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />
        <SliderField
          label="Drive Time"
          value={isochroneMinutes}
          min={5}
          max={60}
          step={5}
          unit=" min"
          onChange={e => setIsochroneMinutes(Number(e.target.value))}
        />
        <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
          Pin a location to see how far you can drive in that time, in live traffic. Green = closest, red = furthest.
        </p>
        <PanelBtn onClick={() => runIsochrone()}>Calculate</PanelBtn>
        <PanelBtn onClick={clearIsochrone} variant="secondary">Clear</PanelBtn>
      </Panel>

      {/* Nearby Places Panel */}
      <Panel title="Nearby Places" open={activePanel === 'nearby'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />

        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {[['hospital', 'Hospital'], ['police_station', 'Police'], ['fire_department', 'Fire Dept.']].map(([val, label]) => (
            <button key={val} onClick={() => setNearbyCategory(val)} style={{
              flex: 1, padding: '8px', fontSize: '12px', cursor: 'pointer', borderRadius: '6px',
              border: nearbyCategory === val ? '2px solid #2d4a6e' : '1px solid #ddd',
              background: nearbyCategory === val ? '#eef4fa' : 'white',
              // Explicit dark text: the backgrounds above are hardcoded light, so
              // inheriting the panel's card-foreground makes these white-on-white in dark mode.
              color: 'rgb(37 34 34)',
            }}>{label}</button>
          ))}
        </div>

        <SliderField label="Radius" value={nearbyRadius} min={500} max={10000} step={500} unit="m"
          onChange={e => setNearbyRadius(Number(e.target.value))} />

        <PanelBtn onClick={() => {
          if (!currentLocation.current) { setStatus('Pin a location first!'); return }
          const { lat, lng } = currentLocation.current
          runNearbyFeatures(nearbyCategory, `${lat},${lng}`, nearbyRadius)
        }}>Search Near Pinned Location</PanelBtn>

        <div style={{ height: '1px', background: '#eee', margin: '14px 0' }} />

        {nearbyResults.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No results yet! pin a location and search, or ask the assistant (e.g. "hospitals near me").</p>
        )}
        {nearbyResults.map(r => (
          <div key={r.id}
            onMouseEnter={() => handleNearbyHover(r, true)}
            onMouseLeave={() => handleNearbyHover(r, false)}
            onClick={() => map.current.flyTo({ center: [r.lng, r.lat], zoom: 17 })}
            className="p-2.5 mb-2 rounded-md ring-1 ring-ring/40 cursor-pointer transition-colors hover:bg-accent"
          >
            <p className="text-sm font-semibold mb-0.5">{r.name}</p>
            {r.address && <p className="text-xs text-muted-foreground mb-1.5">{r.address}</p>}
            <p className="text-xs font-medium text-foreground/70 mb-2">
              {(r.driving_distance_m / 1000).toFixed(2)} km({Math.round(r.driving_duration_s / 60)} min drive)
            </p>
            <button onClick={(e) => {
              e.stopPropagation()
              if(nearbySearchCenter){
                setRouteStart(`${nearbySearchCenter.lat}, ${nearbySearchCenter.lng}`)
              }
              setRouteEnd(`${r.lat},${r.lng}`)
              togglePanel('route')
            }} className="px-2.5 py-1.5 rounded-md text-xs font-medium border-none cursor-pointer bg-primary text-primary-foreground hover:opacity-90">
              Navigate
            </button>
          </div>
        ))}
        {nearbyResults.length > 0 && <PanelBtn onClick={clearNearbyFeatures} variant="secondary">Clear Results</PanelBtn>}
      </Panel>

      {/* Best For Everyone Panel */}
      <Panel title="Best For Everyone" open={activePanel === 'best-destination'} onClose={() => setActivePanel(null)}>
        <StatusLine status={status} />

        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {[['hospital', 'Hospital'], ['police_station', 'Police'], ['fire_department', 'Fire Dept.']].map(([val, label]) => (
            <button key={val} onClick={() => setBestDestCategory(val)} style={{
              flex: 1, padding: '8px', fontSize: '12px', cursor: 'pointer', borderRadius: '6px',
              border: bestDestCategory === val ? '2px solid #2d4a6e' : '1px solid #ddd',
              background: bestDestCategory === val ? '#eef4fa' : 'white',
              color: 'rgb(37 34 34)',
            }}>{label}</button>
          ))}
        </div>

        <InputField
          label="Origin A"
          placeholder="Address or coordinate"
          value={originAInput}
          onChange={e => setOriginAInput(e.target.value)}
          overlay={originAInput.trim() === '' && !!navigator.geolocation ? (
            <>
              <MapPin size={13} strokeWidth={2} />
              My location
            </>
          ) : null}
        />
        <InputField
          label="Origin B"
          placeholder="Address or coordinate"
          value={originBInput}
          onChange={e => setOriginBInput(e.target.value)}
          overlay={originBInput.trim() === '' && !!navigator.geolocation ? (
            <>
              <MapPin size={13} strokeWidth={2} />
              My location
            </>
          ) : null}
        />

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <div style={{ flex: 1 }}>
            <PanelBtn
              tooltip="For emergencies occasions"
              onClick={() => runBestDestination(undefined, undefined, undefined, undefined, 'priority')}
            >Urgent</PanelBtn>
          </div>
          <div style={{ flex: 1 }}>
            <PanelBtn
              tooltip="Picks the fastest combined travel time for both people"
              onClick={() => runBestDestination(undefined, undefined, undefined, undefined, 'efficient')}
            >Efficient</PanelBtn>
          </div>
        </div>

        <div style={{ height: '1px', background: '#eee', margin: '14px 0' }} />

        {bestDestResults.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No results yet! enter both starting points (leave one blank for your own location) and search.</p>
        )}
        {bestDestResults.map((r, i) => (
          <div key={r.id}
            onMouseEnter={() => handleBestDestHover(r, true)}
            onMouseLeave={() => handleBestDestHover(r, false)}
            onClick={() => map.current.flyTo({ center: [r.lng, r.lat], zoom: 17 })}
            className="p-2.5 mb-2 rounded-md ring-1 ring-ring/40 cursor-pointer transition-colors hover:bg-accent"
          >
            {i === 0 && (
              <span className="inline-block px-1.5 py-0.5 mb-1 rounded text-[10px] font-semibold uppercase tracking-wide bg-primary text-primary-foreground">
                Best match
              </span>
            )}
            <p className="text-sm font-semibold mb-0.5">{r.name}</p>
            {r.address && <p className="text-xs text-muted-foreground mb-1.5">{r.address}</p>}
            <div className="text-xs font-medium text-foreground/70">
              {r.durations_s.map((d, j) => (
                <p key={j} className="mb-0.5">{bestDestOrigins[j]?.label || `Origin ${j + 1}`}: {Math.round(d / 60)} min drive</p>
              ))}
            </div>
          </div>
        ))}
        {bestDestResults.length > 0 && <PanelBtn onClick={clearBestDestination} variant="secondary">Clear Results</PanelBtn>}
      </Panel>


      {/* Map */}
      <div ref={mapContainer} className={cls.map} />

      <button
        onClick = {handleUseMyLocation}
        title = "My Location"
        style={{
          position: 'fixed',
          bottom: '90px',
          right: '10px',
          width: '29px',
          height: '29px',
          background: 'white',
          border: 'none',
          borderRadius: '4px',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
           <MapPin size={18} strokeWidth={1.75} color="#333" />
      </button>

    

    </div>
  )
}

export default App