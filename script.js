const map = L.map('map').setView([33.5, 30.5], 6);

const tileLayers = {
  antique: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
};
tileLayers.antique.addTo(map);

const timelineSlider = document.getElementById('year-slider');
const yearDisplay = document.getElementById('year-display');
const playBtn = document.getElementById('play-btn');
const legendContainer = document.getElementById('legend');
const mapStyleSelect = document.getElementById('map-style');
const showTrailsCheck = document.getElementById('show-trails');
const elasticTimelineCheck = document.getElementById('elastic-timeline');
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');
const chronicleList = document.getElementById('chronicle-list');
const chronicleYear = document.getElementById('chronicle-year');
const filtersList = document.getElementById('filters-list');
const searchInput = document.getElementById('figure-search');

let isPlaying = false;
let animationFrameId;
let lastTimestamp = 0;
let figuresData = [];
let visibleFigures = new Set();
const markers = {};
const polylines = {};

mapStyleSelect.addEventListener('change', (e) => {
  Object.values(tileLayers).forEach(layer => map.removeLayer(layer));
  tileLayers[e.target.value].addTo(map);
});

showTrailsCheck.addEventListener('change', updateMap);
speedSlider.addEventListener('input', (e) => speedDisplay.textContent = e.target.value + "x");
elasticTimelineCheck.addEventListener('change', updateTimelineBounds);

function formatYear(year) {
  const rounded = Math.round(year);
  return rounded < 1 ? Math.abs(rounded - 1) + " BC" : rounded + " AD";
}

function updateYearDisplay() {
  const currentVal = parseFloat(timelineSlider.value);
  yearDisplay.textContent = formatYear(currentVal);
  chronicleYear.textContent = formatYear(currentVal);
}

function createMarkerIcon(color) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 100%; height: 100%; border-radius: 50%;"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

function updateTimelineBounds() {
  if (!elasticTimelineCheck.checked) return;
  
  let minYear = Infinity, maxYear = -Infinity;
  figuresData.forEach(fig => {
    if (visibleFigures.has(fig.id)) {
      if (fig.waypoints[0].year < minYear) minYear = fig.waypoints[0].year;
      if (fig.waypoints[fig.waypoints.length - 1].year > maxYear) maxYear = fig.waypoints[fig.waypoints.length - 1].year;
    }
  });

  if (minYear !== Infinity && maxYear !== -Infinity) {
    if (minYear === maxYear) maxYear = minYear + 1;
    timelineSlider.min = minYear;
    timelineSlider.max = maxYear;
    let curr = parseFloat(timelineSlider.value);
    if (curr < minYear) timelineSlider.value = minYear;
    if (curr > maxYear) timelineSlider.value = maxYear;
    updateYearDisplay();
  }
}

function removeFigureElements(id) {
  if (markers[id]) { map.removeLayer(markers[id]); markers[id] = null; }
  if (polylines[id]) { map.removeLayer(polylines[id]); polylines[id] = null; }
}

function updateMap() {
  const currentYear = parseFloat(timelineSlider.value);
  const activeEvents = [];

  figuresData.forEach(figure => {
    if (!visibleFigures.has(figure.id)) {
      removeFigureElements(figure.id);
      return;
    }

    const waypoints = figure.waypoints;
    const startYear = waypoints[0].year;
    const endYear = waypoints[waypoints.length - 1].year;

    if (currentYear < startYear || currentYear > endYear) {
      removeFigureElements(figure.id);
      return;
    }

    let lat = 0, lon = 0, desc = "", ref = "";
    let pathCoordinates = [];
    let currentSegmentIndex = -1;

    for (let i = 0; i < waypoints.length - 1; i++) {
        if (currentYear >= waypoints[i].year && currentYear <= waypoints[i + 1].year) {
            currentSegmentIndex = i;
            break;
        }
    }

    if (currentSegmentIndex !== -1) {
      for (let i = 0; i <= currentSegmentIndex; i++) pathCoordinates.push([waypoints[i].lat, waypoints[i].lon]);
      const w1 = waypoints[currentSegmentIndex];
      const w2 = waypoints[currentSegmentIndex + 1];
      const span = w2.year - w1.year;
      
      if (span === 0) {
        lat = w1.lat; lon = w1.lon; desc = w1.description; ref = w1.reference || "";
      } else {
        const ratio = (currentYear - w1.year) / span;
        lat = w1.lat + (w2.lat - w1.lat) * ratio;
        lon = w1.lon + (w2.lon - w1.lon) * ratio;
        desc = ratio > 0.5 ? w2.description : w1.description;
        ref = ratio > 0.5 ? (w2.reference || "") : (w1.reference || "");
      }
      pathCoordinates.push([lat, lon]);
    } else if (currentYear === endYear) {
      const last = waypoints[waypoints.length - 1];
      lat = last.lat; lon = last.lon; desc = last.description; ref = last.reference || "";
      pathCoordinates.push([lat, lon]);
    }

    const refHtml = ref ? `<br><i style="font-size:0.85em; color:#666;">${ref}</i>` : "";
    activeEvents.push({ figure: figure.name, color: figure.color, desc: desc, ref: ref });

    if (!markers[figure.id]) {
      markers[figure.id] = L.marker([lat, lon], { icon: createMarkerIcon(figure.color) }).addTo(map);
    } else {
      if (!map.hasLayer(markers[figure.id])) markers[figure.id].addTo(map);
      markers[figure.id].setLatLng([lat, lon]);
    }
    markers[figure.id].bindPopup(`<b>${figure.name}</b><br>${formatYear(currentYear)}: ${desc}${refHtml}`);

    if (showTrailsCheck.checked) {
      if (!polylines[figure.id]) {
        polylines[figure.id] = L.polyline(pathCoordinates, { color: figure.color, weight: 3, opacity: 0.6, dashArray: '5, 10' }).addTo(map);
      } else {
        if (!map.hasLayer(polylines[figure.id])) polylines[figure.id].addTo(map);
        polylines[figure.id].setLatLngs(pathCoordinates);
      }
    } else {
      if (polylines[figure.id] && map.hasLayer(polylines[figure.id])) map.removeLayer(polylines[figure.id]);
    }
  });

  chronicleList.innerHTML = activeEvents.map(ev => 
    `<div class="chronicle-item" style="border-left-color: ${ev.color};">
      <strong>${ev.figure}:</strong> ${ev.desc}
      ${ev.ref ? `<div class="verse-ref">${ev.ref}</div>` : ''}
    </div>`
  ).join('');
}

function playLoop(timestamp) {
  if (!isPlaying) return;
  if (!lastTimestamp) lastTimestamp = timestamp;
  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  
  const speed = parseFloat(speedSlider.value);
  let val = parseFloat(timelineSlider.value);
  const max = parseFloat(timelineSlider.max);
  val += speed * delta;
  
  if (val >= max) {
    timelineSlider.value = max;
    updateYearDisplay();
    updateMap();
    isPlaying = false;
    playBtn.textContent = 'Play';
    return;
  }
  
  timelineSlider.value = val;
  updateYearDisplay();
  updateMap();
  animationFrameId = requestAnimationFrame(playLoop);
}

function togglePlay() {
  if (isPlaying) {
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);
    playBtn.textContent = 'Play';
  } else {
    isPlaying = true;
    lastTimestamp = 0;
    playBtn.textContent = 'Pause';
    animationFrameId = requestAnimationFrame(playLoop);
  }
}

function buildLegend() {
  const visibleData = figuresData.filter(f => visibleFigures.has(f.id));
  legendContainer.innerHTML = visibleData.map(fig => `
    <div class="legend-item">
      <div class="legend-color" style="background-color: ${fig.color};"></div>
      <span>${fig.name}</span>
    </div>
  `).join('');
}

function renderFilters(searchTerm = "") {
  const categories = [...new Set(figuresData.map(f => f.category))];
  filtersList.innerHTML = categories.map(cat => {
    const figs = figuresData.filter(f => f.category === cat && f.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (figs.length === 0) return '';
    return `
      <div class="filter-category">
        <strong>${cat}</strong>
        ${figs.map(f => `
          <label class="filter-label">
            <input type="checkbox" value="${f.id}" ${visibleFigures.has(f.id) ? 'checked' : ''}>
            <span style="color: ${f.color}; text-shadow: 0px 0px 1px #000;">&#11044;</span> ${f.name}
          </label>
        `).join('')}
      </div>
    `;
  }).join('');

  document.querySelectorAll('#filters-list input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e) => {
      if (e.target.checked) visibleFigures.add(e.target.value);
      else visibleFigures.delete(e.target.value);
      buildLegend();
      updateTimelineBounds();
      updateMap();
    });
  });
}

searchInput.addEventListener('input', (e) => renderFilters(e.target.value));

fetch('data/figures.json')
  .then(response => response.json())
  .then(data => {
    figuresData = data;
    figuresData.forEach(fig => {
      fig.waypoints.sort((a, b) => a.year - b.year);
      visibleFigures.add(fig.id);
    });
    
    renderFilters();
    buildLegend();
    updateTimelineBounds();
    updateMap();
  })
  .catch(err => console.error("Error fetching figures", err));

timelineSlider.addEventListener('input', () => {
  updateYearDisplay();
  updateMap();
  if (isPlaying) {
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);
    playBtn.textContent = 'Play';
  }
});

playBtn.addEventListener('click', togglePlay);