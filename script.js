// --- script.js ---

// --- Global Scope Variables ---
// Map and related services need to be accessible by initMap and other functions
let map;
let geocoder;
let autocompletePickup, autocompleteDest;
let pickupMarker, destMarker;
let userLocationCircle; // For accuracy circle from geolocation
let directionsService;
let directionsRenderer;
let pickupCoords = null;
let destCoords = null;

// --- Constants ---
const NIGERIA_CENTER = { lat: 9.0765, lng: 7.3986 }; // Google Maps uses {lat, lng}
const DEFAULT_ZOOM = 13;
const DUMMY_RATE_PER_KM = 150; // Naira - DEMO RATE ONLY - Requires Backend Logic

// --- DEMO Data ---
const existingAgencies = [
    "Federal Ministry of Finance", "Federal Ministry of Works", "Federal Ministry of Health",
    "Federal Ministry of Education", "Federal Ministry of Agriculture", "Federal Ministry of Justice",
    "NITDA", "FIRS", "CAC", "Nigeria Customs Service", "NIMASA", "NPA", "EFCC", "ICPC",
    "Budget Office of the Federation"
];

// ---- State Variables ---- (Defined later within DOMContentLoaded where appropriate)
let currentView = 'view-homepage'; // Default view
let currentDashboardSection = 'dashboard-overview';

// ---- Main Map Initialization Function (called by Google API callback) ----
// IMPORTANT: This function MUST be available globally
window.initMap = () => {
    console.log("Google Maps API loaded. Initializing map...");
    const mapElement = document.getElementById('map');

    if (!google || !google.maps) {
        console.error("Google Maps script failed to load properly.");
        if (mapElement) mapElement.innerHTML = '<p class="error-message">Could not load Google Map script.</p>';
        return;
    }
     if (!mapElement) {
        console.error("Map element not found in DOM yet for initMap.");
        // Attempt initialization later if view becomes active
        return;
    }

    try {
        map = new google.maps.Map(mapElement, {
            center: NIGERIA_CENTER,
            zoom: DEFAULT_ZOOM,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
             zoomControlOptions: {
                 position: google.maps.ControlPosition.BOTTOM_RIGHT
             },
        });

        geocoder = new google.maps.Geocoder();
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: true, // Use our custom draggable markers
            preserveViewport: false, // Adjust map viewport for route
            polylineOptions: {
                 strokeColor: '#006633',
                 strokeOpacity: 0.8,
                 strokeWeight: 6
            }
        });

        // Call setup functions that depend on google.maps being ready
        // Note: These functions are defined below, ensure they are available
        setupAutocomplete();
        setupMapListeners();

        console.log("Google Map initialized successfully.");

    } catch (error) {
        console.error("Error initializing Google Map:", error);
        mapElement.innerHTML = '<p class="error-message">Could not load Google Map.</p>';
    }
}; // End initMap

// ---- Autocomplete Setup ----
// Defined globally as it's called by initMap
function setupAutocomplete() {
    const pickupInput = document.getElementById('pickup-address');
    const destInput = document.getElementById('destination-address');

    if (!google.maps.places || !pickupInput || !destInput) {
        console.error("Autocomplete setup failed: Google Places library or input elements not found.");
        return;
    }
     console.log("Setting up Autocomplete...");

    const options = {
        componentRestrictions: { country: 'ng' },
        fields: ["formatted_address", "geometry", "name"],
        strictBounds: false,
    };

    autocompletePickup = new google.maps.places.Autocomplete(pickupInput, options);
    autocompleteDest = new google.maps.places.Autocomplete(destInput, options);

    autocompletePickup.addListener('place_changed', () => handlePlaceChanged(autocompletePickup, 'pickup'));
    autocompleteDest.addListener('place_changed', () => handlePlaceChanged(autocompleteDest, 'destination'));

     const preventSubmit = (e) => { if (e.key === 'Enter') e.preventDefault(); };
     pickupInput.addEventListener('keydown', preventSubmit);
     destInput.addEventListener('keydown', preventSubmit);
}

// ---- Map Event Listeners Setup ----
// Defined globally as it's called by initMap
function setupMapListeners() {
    if (!map) {
        console.error("Map not initialized, cannot set up listeners.");
        return;
    }
    console.log("Setting up Map Click Listener...");
    google.maps.event.clearListeners(map, 'click'); // Clear just in case
    map.addListener('click', handleMapClick);
}


// ==========================================================================
// Functions called by HTML onclick attributes need to be global
// ==========================================================================

// ---- View Management ----
window.showView = (viewId) => {
    console.log("Switching to view:", viewId);
    const views = document.querySelectorAll('.view'); // Select inside function to be safe
    views.forEach(view => {
        const isActive = view.id === viewId;
        view.classList.toggle('active', isActive);
        if (isActive) {
            // Check map size when its view becomes active
            if (map && (viewId === 'view-main-booking' || viewId === 'view-agency-dashboard')) {
                 setTimeout(() => {
                     google.maps.event.trigger(map, 'resize');
                     // map.setCenter(map.getCenter()); // Re-center might be disruptive
                     console.log("Map resize triggered for view:", viewId);
                }, 50);
            }
            // Add entry animation class
            view.classList.remove('animation-fadeIn', 'animation-slideInUp');
            void view.offsetWidth; // Trigger reflow
            view.classList.add(viewId === 'view-login' || viewId === 'view-homepage' ? 'animation-fadeIn' : 'animation-slideInUp');
        }
    });
    // Update global state variable (ensure it's defined)
    // Note: Defining currentView globally might be better if needed elsewhere outside DOMContentLoaded
    // For now, we rely on DOMContentLoaded to set up listeners that use it.
    // Let's define it globally for safety with logout etc.
    currentView = viewId;
    document.body.style.overflowY = (viewId === 'view-main-booking' || viewId === 'view-agency-dashboard') ? 'hidden' : 'auto';
    window.scrollTo(0, 0);
};

// ---- Logout ----
window.logout = () => {
    console.log("Logout");
    const userDisplayName = document.getElementById('user-display-name');
    const adminDisplayName = document.getElementById('admin-display-name');
    const userPhotoContainer = document.getElementById('user-photo-container');

    if (userDisplayName) userDisplayName.textContent = 'User Name';
    if (adminDisplayName) adminDisplayName.textContent = 'Agency Admin';
    if (userPhotoContainer) userPhotoContainer.style.backgroundImage = '';

    if(map) {
       clearMarkersAndRoute(); // Use the helper function
       if (userLocationCircle && userLocationCircle.getMap()) userLocationCircle.setMap(null);
       userLocationCircle = null;
       map.setCenter(NIGERIA_CENTER); map.setZoom(DEFAULT_ZOOM);
    }
    pickupCoords = null; destCoords = null;
    updateRouteAndEstimation();

    document.getElementById('login-form')?.reset();
    document.getElementById('booking-form')?.reset();
    setMinDateTime(); // Reset date

    showView('view-homepage');
    console.log('Logged Out (Demo)!');
};

// ---- Tab/Panel Switching ----
window.showPanel = (panelId) => {
    const tabBook = document.getElementById('tab-book');
    const tabTrips = document.getElementById('tab-trips');
    const panelBooking = document.getElementById('panel-booking');
    const panelTrips = document.getElementById('panel-trips');

    const isActive = (el) => el?.classList.contains('active');
    const setActive = (el) => el?.classList.add('active');
    const setInactive = (el) => el?.classList.remove('active');

    if (panelId === 'booking') { if (!isActive(panelBooking)) { setActive(panelBooking); setActive(tabBook); setInactive(panelTrips); setInactive(tabTrips); } }
    else if (panelId === 'trips') { if (!isActive(panelTrips)) { setActive(panelTrips); setActive(tabTrips); setInactive(panelBooking); setInactive(tabBook); } }

    if (panelId === 'booking' && map) {
        setTimeout(() => google.maps.event.trigger(map, 'resize'), 50);
    }
};

// ---- Dashboard Section Switching ----
window.showDashboardSection = (sectionId, clickedLink = null) => {
    const dashboardSections = document.querySelectorAll('.dashboard-section');
    const sidebarLinks = document.querySelectorAll('.sidebar-nav li a');

    console.log("Switching dashboard section to:", sectionId);
    dashboardSections.forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
    });
    sidebarLinks.forEach(link => {
        const linkTargetsSection = link.getAttribute('onclick')?.includes(`'${sectionId}'`);
        link.classList.toggle('active', linkTargetsSection || link === clickedLink);
    });
    // Update global state variable (needs to be defined globally or passed around)
    // currentDashboardSection = sectionId;
};

// ---- Map Interaction Handlers ----
// These need to be accessible by listeners set up in initMap/setupAutocomplete/setupMapListeners
// Defining them globally makes this easier.
function handlePlaceChanged(autocompleteInstance, type) {
    const place = autocompleteInstance.getPlace();
    const pickupAddressInput = document.getElementById('pickup-address'); // Get elements inside function
    const destAddressInput = document.getElementById('destination-address');

    if (!place.geometry || !place.geometry.location) { console.warn("Autocomplete: No geometry available."); return; }
    if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
    else { map.setCenter(place.geometry.location); map.setZoom(16); }

    const location = place.geometry.location;
    const address = place.formatted_address || place.name;

    if (type === 'pickup') {
        pickupCoords = location;
        if(pickupAddressInput) pickupAddressInput.value = address;
        updateMarker(location, address, 'pickup');
    } else {
        destCoords = location;
        if(destAddressInput) destAddressInput.value = address;
        updateMarker(location, address, 'destination');
    }
    updateRouteAndEstimation();
}

function handleMapClick(event) {
    const clickedLatLng = event.latLng;
    const pickupAddressInput = document.getElementById('pickup-address'); // Get elements inside function
    const destAddressInput = document.getElementById('destination-address');

    if (!clickedLatLng || !geocoder) return;
    console.log("Map clicked at:", clickedLatLng.toString());
    showLoading();

    geocoder.geocode({ location: clickedLatLng }, (results, status) => {
        hideLoading();
        if (status === "OK" && results && results[0]) {
            const address = results[0].formatted_address;
            if (!pickupCoords || (pickupCoords && destCoords)) {
                pickupCoords = clickedLatLng; destCoords = null;
                if(pickupAddressInput) pickupAddressInput.value = address;
                if(destAddressInput) destAddressInput.value = '';
                updateMarker(clickedLatLng, address, 'pickup');
                if (destMarker) destMarker.setMap(null); destMarker = null;
                console.log("Pickup location set via map click.");
            } else if (pickupCoords && !destCoords) {
                destCoords = clickedLatLng;
                if(destAddressInput) destAddressInput.value = address;
                updateMarker(clickedLatLng, address, 'destination');
                 console.log("Destination location set via map click.");
            }
            updateRouteAndEstimation();
        } else { alert("No address found."); console.error("Geocoder failed: " + status); }
    });
}

function updateMarker(location, address, type) {
    if (!map) return;
    let marker = (type === 'pickup') ? pickupMarker : destMarker;
    const title = (type === 'pickup') ? 'Pickup Location' : 'Destination Location';
    const iconUrl = (type === 'pickup') ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23006633" width="30px" height="30px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>' : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23CC0000" width="30px" height="30px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';

    const markerOptions = { position: location, map: map, title: title, draggable: true, animation: google.maps.Animation.DROP, icon: { url: iconUrl } };

    if (marker) { marker.setPosition(location); }
    else { marker = new google.maps.Marker(markerOptions); }

    // Clear existing listeners before adding new ones to prevent duplicates
    google.maps.event.clearInstanceListeners(marker);
    // Add InfoWindow
    const infowindowContent = `<b>${title}</b><br>${address || 'Dropped Pin'}`;
    const infowindow = new google.maps.InfoWindow({ content: infowindowContent });
    marker.addListener('click', () => { infowindow.open(map, marker); });
    // Add Drag End Listener
    marker.addListener('dragend', () => handleMarkerDragEnd(marker, type));

    if (type === 'pickup') pickupMarker = marker; else destMarker = marker;
}

function handleMarkerDragEnd(marker, type) {
    const newLatLng = marker.getPosition();
    const pickupAddressInput = document.getElementById('pickup-address'); // Get elements inside function
    const destAddressInput = document.getElementById('destination-address');

    if (!newLatLng || !geocoder) return;
    console.log(`${type} marker dragged to:`, newLatLng.toString());
    showLoading();

    geocoder.geocode({ location: newLatLng }, (results, status) => {
        hideLoading();
        let address = `Map Location (${newLatLng.lat().toFixed(4)}, ${newLatLng.lng().toFixed(4)})`;
        if (status === "OK" && results && results[0]) { address = results[0].formatted_address; }
        else { console.warn("Reverse geocode failed after drag: " + status); }

        const inputField = (type === 'pickup') ? pickupAddressInput : destAddressInput;
        if(inputField) inputField.value = address;

        if (type === 'pickup') pickupCoords = newLatLng; else destCoords = newLatLng;
        updateRouteAndEstimation();
    });
}

function clearMarkersAndRoute() {
    if (pickupMarker) pickupMarker.setMap(null); pickupMarker = null;
    if (destMarker) destMarker.setMap(null); destMarker = null;
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
    console.log("Markers and route cleared");
}

function handleLocationFound(position) {
    hideLoading();
    if (!map) { console.error("Map not ready."); return; }
    const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
    const accuracy = position.coords.accuracy;
    const latLng = new google.maps.LatLng(pos.lat, pos.lng);
    const pickupAddressInput = document.getElementById('pickup-address'); // Get element inside function
    const destAddressInput = document.getElementById('destination-address');

    map.setCenter(latLng); map.setZoom(16);
    if (userLocationCircle) userLocationCircle.setMap(null);
    userLocationCircle = new google.maps.Circle({ /* ... options ... */ map, center: latLng, radius: accuracy });

    showLoading();
    geocoder.geocode({ location: latLng }, (results, status) => {
        hideLoading();
        let address = `Current Location (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`;
        if (status === "OK" && results && results[0]) address = results[0].formatted_address;
        else console.warn("Reverse geocode failed: " + status);

        if(pickupAddressInput) pickupAddressInput.value = address;
        pickupCoords = latLng;
        updateMarker(latLng, address, 'pickup');
        destCoords = null; if(destAddressInput) destAddressInput.value = '';
        if (destMarker) destMarker.setMap(null); destMarker = null;
        updateRouteAndEstimation();
        alert('Location found and set as pickup!');
    });
}
function handleLocationError(error) { /* ... same error handling ... */ hideLoading(); let message = "..."; console.error(message); alert(message); }
function showLoading() { const el = document.getElementById('loading-indicator'); if(el) el.style.display = 'block'; }
function hideLoading() { const el = document.getElementById('loading-indicator'); if(el) el.style.display = 'none'; }

function calculateAndDisplayRoute() {
    const estDistanceEl = document.getElementById('est-distance'); // Get elements inside function
    const estCostEl = document.getElementById('est-cost');

    if (!pickupCoords || !destCoords || !directionsService || !directionsRenderer || !map) {
        if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
        if (estDistanceEl) estDistanceEl.textContent = '--';
        if (estCostEl) estCostEl.textContent = '--';
        return;
    }
    console.log("Calculating route...");
    showLoading();

    const request = { origin: pickupCoords, destination: destCoords, travelMode: google.maps.TravelMode.DRIVING };

    directionsService.route(request, (result, status) => {
        hideLoading();
        if (status === google.maps.DirectionsStatus.OK && result) {
            console.log("Directions Result:", result);
            directionsRenderer.setDirections(result);

            const route = result.routes[0];
            if (route?.legs?.[0]) {
                const leg = route.legs[0];
                const distanceText = leg.distance?.text || '-- km';
                const durationText = leg.duration?.text || '--';
                const distanceValueKm = (leg.distance?.value || 0) / 1000;
                const estimatedCost = distanceValueKm * DUMMY_RATE_PER_KM;

                if (estDistanceEl) estDistanceEl.textContent = distanceText;
                if (estCostEl) estCostEl.textContent = `₦${estimatedCost.toFixed(0)} (${durationText})`;
            }
        } else {
            console.error("Directions request failed: " + status);
            alert("Could not calculate directions: " + status);
            directionsRenderer.setDirections({ routes: [] });
            if (estDistanceEl) estDistanceEl.textContent = '--';
            if (estCostEl) estCostEl.textContent = '--';
        }
    });
}
// Alias function for clarity in calls
const updateRouteAndEstimation = calculateAndDisplayRoute;

function showAgencySuggestions(filteredAgencies) { /* ... same as before ... */ const el = document.getElementById('agency-suggestions'); if (!el) return; el.innerHTML = ''; if(filteredAgencies.length === 0){ el.style.display = 'none'; return;} filteredAgencies.forEach(agency=>{ /*...create div, add listener...*/ }); el.style.display = 'block'; }

function handlePhotoUpload(event) { /* ... same as before, ensure targetContainer defined correctly ... */ const file = event.target.files[0]; const targetContainer = document.getElementById(currentView === 'view-main-booking' ? 'user-photo-container' : 'admin-photo-container'); if(file && file.type.startsWith('image/') && targetContainer){ /*...*/ } else if(file){ alert("Invalid file type"); } if(event.target) event.target.value=null; }

function setMinDateTime() { /* ... same as before ... */ const el = document.getElementById('trip-datetime'); if(!el) return; const now = new Date(); const offset = now.getTimezoneOffset(); const localDate = new Date(now.getTime() - (offset * 60 * 1000)); const formatted = localDate.toISOString().slice(0,16); el.min = formatted; console.log("Min datetime set:", formatted); }


// ==========================================================================
// Code that MUST run after the DOM is ready
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {

    // ---- DOM Element References ----
    // It's generally safer to get references here, although global ones are used above too
    const locateButton = document.getElementById('locate-btn');
    const pickupAddressInput = document.getElementById('pickup-address');
    const destAddressInput = document.getElementById('destination-address');
    const agencyNameInput = document.getElementById('agency-name');
    const agencySuggestionsContainer = document.getElementById('agency-suggestions');
    const userPhotoContainer = document.getElementById('user-photo-container');
    const photoUploadInput = document.getElementById('photo-upload');
    const dateTimeInput = document.getElementById('trip-datetime'); // Needed for setMinDateTime

    // ---- Event Listeners Setup ----
    function setupEventListeners() {
        // Auth Forms
        document.getElementById('login-form')?.addEventListener('submit', handleLogin);
        document.getElementById('register-staff-form')?.addEventListener('submit', (e) => handleRegistration(e, 'Staff'));
        document.getElementById('register-agency-form')?.addEventListener('submit', (e) => handleRegistration(e, 'Agency'));

        // Geolocation Button
        locateButton?.addEventListener('click', () => {
            if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
            if (!map) { alert('Map not ready yet.'); return; }
            showLoading();
            navigator.geolocation.getCurrentPosition(handleLocationFound, handleLocationError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        });

        // Booking Form
        document.getElementById('booking-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!pickupCoords || !destCoords) { alert("Please set pickup & destination."); return; }
            if (!document.getElementById('trip-purpose')?.value.trim()) { alert("Please enter trip purpose."); document.getElementById('trip-purpose')?.focus(); return; }
            if (!dateTimeInput?.value) { alert("Please select date/time."); dateTimeInput?.focus(); return; }
            if (!document.getElementById('passengers')?.value) { alert("Enter # passengers."); document.getElementById('passengers')?.focus(); return; }
            const selectedDate = new Date(dateTimeInput.value);
             if (selectedDate < new Date(new Date().toISOString().slice(0, 16))) { alert("Selected date/time cannot be in the past."); return; }
            alert('Booking Request OK (Demo Only)!');
            // TODO: Send data to backend
        });

        // Agency Autocomplete
        agencyNameInput?.addEventListener('input', (e) => {
           const inputText = e.target.value.toLowerCase();
           if (inputText.length < 2) { if(agencySuggestionsContainer) agencySuggestionsContainer.style.display = 'none'; return; }
           const filtered = existingAgencies.filter(agency => agency.toLowerCase().includes(inputText));
           showAgencySuggestions(filtered);
        });
        document.addEventListener('click', (e) => { // Hide agency suggestions
            if (agencySuggestionsContainer && !agencyNameInput?.contains(e.target) && !agencySuggestionsContainer.contains(e.target)) {
                agencySuggestionsContainer.style.display = 'none';
            }
        });

        // Photo Upload
        userPhotoContainer?.addEventListener('click', () => { photoUploadInput?.click(); });
        document.getElementById('admin-photo-container')?.addEventListener('click', () => alert("Admin photo upload requires backend."));
        photoUploadInput?.addEventListener('change', handlePhotoUpload);

        // Clear Coords on Manual Address Change
        const clearCoordsIfManual = (inputElement, coordType, markerType) => {
             const looksAutomatic = inputElement?.value.includes("Map Location") || inputElement?.value.includes("Current Location") || (google?.maps && inputElement?.value === autocompletePickup?.getPlace()?.formatted_address) || (google?.maps && inputElement?.value === autocompleteDest?.getPlace()?.formatted_address);
             if (!looksAutomatic && window[coordType]) {
                console.log(`Clearing ${coordType}`);
                window[coordType] = null;
                let marker = window[markerType]; // Access global marker
                if (marker && marker.getMap()) { marker.setMap(null); }
                window[markerType] = null;
                updateRouteAndEstimation();
            }
        };
        pickupAddressInput?.addEventListener('change', () => clearCoordsIfManual(pickupAddressInput, 'pickupCoords', 'pickupMarker'));
        destAddressInput?.addEventListener('change', () => clearCoordsIfManual(destAddressInput, 'destCoords', 'destMarker'));

        console.log("Event listeners set up.");
    } // End setupEventListeners

    // ---- Initialization ----
    setupEventListeners();
    setMinDateTime(); // Set min date on load
    // Ensure the initial view is shown *after* listeners are attached
    // showView function should be globally defined now
    if(typeof showView === 'function'){
       showView(currentView);
    } else {
       console.error("showView function not found globally!");
       // Fallback: Manually activate default view if showView isn't global
        document.getElementById('view-homepage')?.classList.add('active');
    }
    console.log("NGovRide Initialized (DOM Ready). Waiting for Google Maps API callback (initMap)...");

}); // End DOMContentLoaded listener
