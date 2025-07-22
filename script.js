const map = new maplibregl.Map({
    container: 'map', 
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [28.0, 53.5], 
    zoom: 4.7
});

const BELARUS_BOUNDS = [23.17, 51.25, 32.77, 56.17];
let geojsonDataCache = null;

const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const modalOverlay = document.getElementById('about-modal-overlay');
const closeModalBtn = document.getElementById('close-modal-btn');
const lightboxOverlay = document.getElementById('lightbox-overlay');
const lightboxImage = document.getElementById('lightbox-image');

class AboutControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this._container.innerHTML = `<button type="button" aria-label="Аб праекце" title="Аб праекце"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm1-8h-2V7h2v2z" fill="currentColor"/></svg></button>`;
        
        this._container.onclick = () => {
            modalOverlay.classList.remove('hidden');
        };
        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}

class ResetViewControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this._container.innerHTML = '<button type="button" aria-label="Вярнуцца да пачатковага выгляду" title="Вярнуцца да пачатковага выгляду"><b>⛶</b></button>';
        
        this._container.onclick = () => {
            this._map.fitBounds(BELARUS_BOUNDS, {
                padding: 10, 
                duration: 2300 
            });
        };
        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}

map.on('load', async () => { 
    try {
        map.addSource('monuments', {
            type: 'geojson',
            data: 'monuments.geojson'
        });

        const image = await map.loadImage('photos/image.png');
        
        map.addImage('monument-icon', image.data);

        map.addLayer({
            id: 'monument-points',
            type: 'symbol',
            source: 'monuments',
            layout: {
                'icon-image': 'monument-icon',
                'icon-allow-overlap': true,
                'icon-anchor': 'bottom',
                'icon-size': [
                    'interpolate', 
                    ['linear'],    
                    ['zoom'],      
                    6, 0.05,     
                    15, 0.09,
                ]

            }
            
        });

        map.on('click', 'monument-points', (e) => {
            const feature = e.features[0];
            openSidebarForFeature(feature);

        });

        map.on('mouseenter', 'monument-points', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'monument-points', () => { map.getCanvas().style.cursor = ''; });

        map.addControl(new AboutControl(), 'top-left');
        map.addControl(new ResetViewControl(), 'top-left');

        await handleUrlHash();



    } catch (error) {
        console.error('Не удалось загрузить ресурсы для карты:', error);
    }
});

closeSidebarBtn.addEventListener('click', () => {
    sidebar.classList.remove('visible');
    if (window.location.hash.startsWith('#monument/')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
});

function closeModal() {
    modalOverlay.classList.add('hidden');
}

closeModalBtn.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

sidebar.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('card-image')) {
        lightboxImage.src = e.target.dataset.fullSrc;
        lightboxOverlay.classList.remove('hidden');
    }
});

lightboxOverlay.addEventListener('click', () => {
    lightboxOverlay.classList.add('hidden');
});

window.onpopstate = function(event) {
    if (!event.state || event.state.sidebar !== 'open') {
        sidebar.classList.remove('visible');
    }
};

function openSidebarForFeature(feature) {
    const properties = feature.properties;
    const coordinates = feature.geometry.coordinates;
    const contentHTML = `
        <div class="card-container">
            <div class="card-image-wrapper">
                <img class="card-image" 
                    src="${properties.imageUrl_preview}" 
                    data-full-src="${properties.imageUrl_full}" 
                    alt="${properties.city || properties.title}">
            </div>
            <div class="card-text-wrapper">
                <header class="card-header">
                    <h2>${properties.city}</h2>
                </header>
                
                ${properties.title ? `<div class="card-body"><p>${properties.title}</p></div>` : ''}
    
                <div class="card-tags">
                    ${properties.regionHashtag ? `<span class="tag">${properties.regionHashtag}</span>` : ''}
                    ${properties.monumentType ? `<span class="tag">${properties.monumentType}</span>` : ''}
                </div>
            </div>
        </div>
    `;
    sidebarContent.innerHTML = contentHTML;

    const isMobile = window.innerWidth <= 480;
    let padding;
    if (isMobile) {
        sidebar.classList.add('visible', 'measure-helper');
        padding = { bottom: sidebar.offsetHeight };
        sidebar.classList.remove('visible', 'measure-helper');
    } else {
        padding = { right: sidebar.offsetWidth };
    }

    map.flyTo({
        center: coordinates,
        zoom: 15,
        speed: 1.5,
        padding: padding
    });
    
    history.pushState({sidebar: 'open', id: properties.source_id}, '', `#monument/${properties.source_id}`);

    sidebar.classList.add('visible');
}

async function handleUrlHash() {
    if (window.location.hash.startsWith('#monument/')) {
        const objectId = parseInt(window.location.hash.replace('#monument/', ''), 10);
        if (isNaN(objectId)) return;

        try {
            let geojsonData;
            if (geojsonDataCache) {
                console.log('Using data from cache.');
                geojsonData = geojsonDataCache;
            } else {
                console.log('Cache is empty. Loading monuments.geojson...');
                const response = await fetch('monuments.geojson');
                if (!response.ok) return;
                geojsonData = await response.json();
                
                geojsonDataCache = geojsonData;
            }
            const feature = geojsonData.features.find(f => f.properties.source_id === objectId);
            if (feature) {
                openSidebarForFeature(feature);
            }
        } catch (error) {
            console.error("Error processing URL hash:", error);
        }
    }
}