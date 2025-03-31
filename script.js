// --- script.js ---

document.addEventListener('DOMContentLoaded', () => {
    // ---- Configuration ----
    const NIGERIA_CENTER = [9.0765, 7.3986]; // Approx center of Nigeria (Abuja)
    const DEFAULT_ZOOM = 13;
    const MAX_ZOOM = 18;
    const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    const DUMMY_RATE_PER_KM = 150; // Naira - DEMO RATE ONLY - Requires Backend Logic

    // ---- DEMO Data ----
    // For Agency Autocomplete Demo
    const existingAgencies = [
        "Federal Ministry of Finance", "Federal Ministry of Works", "Federal Ministry of Health",
        "Federal Ministry of Education", "Federal Ministry of Agriculture", "Federal Ministry of Justice",
        "NITDA", "FIRS", "CAC", "Nigeria Customs Service", "NIMASA", "NPA", "EFCC", "ICPC",
        "Budget Office of the Federation"
        // Add more representative agencies - ideally fetched from backend
    ];

    // ---- DOM Elements ----
    const views = document.querySelectorAll('.view');
    // Map & Booking Elements
    const mapElement = document.getElementById('map');
    const locateButton = document.getElementById('locate-btn');
    const pickupAddressInput = document.getElementById('pickup-address');
    const destAddressInput = document.getElementById('destination-address');
    const loadingIndicator = document.getElementById('loading-indicator');
    const tabBook = document.getElementById('tab-book');
    const tabTrips = document.getElementById('tab-trips');
    const panelBooking = document.getElementById('panel-booking');
    const panelTrips = document.getElementById('panel-trips');
    const estDistanceEl = document.getElementById('est-distance');
    const estCostEl = document.getElementById('est-cost');
    // User Profile Elements
    const userDisplayName = document.getElementById('user-display-name');
    const userPhotoContainer = document.getElementById('user-photo-container');
    const photoUploadInput = document.getElementById('photo-upload');
    // Registration Elements
    const agencyNameInput = document.getElementById('agency-name');
    const agencySuggestionsContainer = document.getElementById('agency-suggestions');
    // Login Elements
    const loginEmailInput = document.getElementById('login-email');
    // Dashboard Elements
    const adminDisplayName = document.getElementById('admin-display-name');
    const dashboardSections = document.querySelectorAll('.dashboard-section');
    const sidebarLinks = document.querySelectorAll('.sidebar-nav li a');

    // ---- State ----
    let map = null;
    let pickupMarker = null;
    let destMarker = null;
    let userLocationMarker = null; // Separate marker for current location accuracy circle
    let pickupCoords = null;
    let destCoords = null;
    let currentView = 'view-homepage'; // Start with homepage
    let currentDashboardSection = 'dashboard-overview'; // Default dashboard section

    // ---- View Management ----
    // Make globally accessible for inline onclick calls in HTML
    window.showView = (viewId) => {
        console.log("Switching to view:", viewId);
        views.forEach(view => {
            const isActive = view.id === viewId;
            view.classList.toggle('active', isActive);
            if (isActive) {
                // Initialize map only when booking view becomes active and if not already initialized
                if (viewId === 'view-main-booking' && !map) {
                    // Delay map init slightly ensures div is visible and sized correctly
                     setTimeout(initializeMap, 50);
                } else if (map && (viewId === 'view-main-booking' || viewId === 'view-agency-dashboard')) {
                    // Invalidate map size if switching back to a view containing it
                     setTimeout(() => map.invalidateSize(), 50);
                }
                // Add entry animation class
                view.classList.remove('animation-fadeIn', 'animation-slideInUp'); // Remove old animations
                void view.offsetWidth; // Trigger reflow to restart animation
                view.classList.add(viewId === 'view-login' || viewId === 'view-homepage' ? 'animation-fadeIn' : 'animation-slideInUp');
            }
        });
        currentView = viewId;
        // Adjust body scroll based on view type
        document.body.style.overflowY = (viewId === 'view-main-booking' || viewId === 'view-agency-dashboard') ? 'hidden' : 'auto';
        window.scrollTo(0, 0); // Scroll to top on view change
    }

    // ---- Authentication Simulation ----
    function handleLogin(event) {
        event.preventDefault(); // Prevent actual form submission
        const userEmail = loginEmailInput.value;
        if (!userEmail) { // Basic validation
            alert("Please enter your email address.");
            return;
        }
        console.log("Login attempt for:", userEmail);

        // **DEMO LOGIC:** Simple check for admin user based on email pattern
        // Replace this with actual backend authentication
        const isAdmin = userEmail.toLowerCase().includes('admin@'); // Example: Check if email contains 'admin@'

        if (isAdmin) {
            if (adminDisplayName) { adminDisplayName.textContent = userEmail.split('@')[0] + " (Admin)"; }
            showView('view-agency-dashboard');
            showDashboardSection(currentDashboardSection); // Show default or last viewed dashboard section
            console.log('Admin Login Successful (Demo)!');
        } else {
            if (userDisplayName) { userDisplayName.textContent = userEmail.split('@')[0]; }
            showView('view-main-booking');
             // Ensure map is initialized for staff view
             if (!map) { setTimeout(initializeMap, 50); }
            console.log('Staff Login Successful (Demo)!');
        }
         document.getElementById('login-form').reset(); // Clear form
    }

    function handleRegistration(event, type) {
         event.preventDefault();
         // Add basic form validation checks here if needed before proceeding
         console.log(`Registration attempt (${type})`);
         alert(`Registration Successful (${type} - Demo)! Please proceed to login.`);
         showView('view-login'); // Redirect to login after registration
    }

    // Make logout globally accessible for onclick
    window.logout = () => {
         console.log("Logout");
         // Reset UI elements
         if (userDisplayName) { userDisplayName.textContent = 'User Name'; }
         if (adminDisplayName) { adminDisplayName.textContent = 'Agency Admin'; }
         if (userPhotoContainer) { userPhotoContainer.style.backgroundImage = ''; } // Clear photo

         // Clear map state if it exists
         if(map) {
            clearMarkersAndRoute();
            if (userLocationMarker && map.hasLayer(userLocationMarker)) {
                map.removeLayer(userLocationMarker);
                userLocationMarker = null;
            }
            map.setView(NIGERIA_CENTER, DEFAULT_ZOOM); // Reset map view
         }
         pickupCoords = null;
         destCoords = null;
         updateEstimationBox(); // Clear estimation

         // Clear forms (optional, good practice)
         document.getElementById('login-form')?.reset();
         document.getElementById('booking-form')?.reset();

         showView('view-homepage'); // Go back to homepage after logout
         console.log('Logged Out (Demo)!');
    }

    // ---- Map Initialization & Geolocation ----
    function initializeMap() {
         if(map) return; // Prevent re-initialization
         console.log("Initializing map...");
        try {
            // Ensure the map container is visible before initializing
             if (!mapElement || mapElement.offsetParent === null) {
                console.warn("Map container not visible, delaying initialization.");
                setTimeout(initializeMap, 100); // Retry after a short delay
                return;
            }

            map = L.map(mapElement, { zoomControl: false }).setView(NIGERIA_CENTER, DEFAULT_ZOOM);
            L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);
            L.control.scale({ imperial: false }).addTo(map);

            // Map Click Listener
            map.on('click', handleMapClick);

            console.log("Map initialized successfully.");
            map.invalidateSize(); // Ensure correct sizing after initialization

        } catch (error) {
            console.error("Error initializing Leaflet map:", error);
            if (mapElement) {
                mapElement.innerHTML = '<p class="error-message">Could not load map. Check connection.</p>';
            }
        }
    }

    function handleMapClick(e) {
        console.log("Map clicked at: ", e.latlng);
         // Logic: first click sets pickup, second sets destination
         if (!pickupCoords || (pickupCoords && destCoords)) {
             setPickupLocation(e.latlng);
             // Clear destination if setting new pickup
             destCoords = null;
             if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
             // Update input field (NOTE: Reverse geocoding needed for real address)
             pickupAddressInput.value = `Map Location (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`;
             destAddressInput.value = '';
             alert("Pickup location set. Click map again for destination.");
         } else if (pickupCoords && !destCoords) {
             setDestinationLocation(e.latlng);
             // Update input field (NOTE: Reverse geocoding needed for real address)
             destAddressInput.value = `Map Location (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`;
              alert("Destination location set.");
         }
         updateEstimationBox();
    }

    function createDraggableMarker(latlng, type) {
        const marker = L.marker(latlng, { draggable: true })
            .addTo(map)
            .bindPopup(`${type} Location`).openPopup();

        marker.on('dragend', function(event){
            const newCoords = event.target.getLatLng();
            const inputField = (type === 'Pickup') ? pickupAddressInput : destAddressInput;
            const coordVar = (type === 'Pickup') ? 'pickupCoords' : 'destCoords';

            window[coordVar] = newCoords; // Update global coordinate state
            inputField.value = `Map Location (${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)})`;
            updateEstimationBox();
        });
        return marker;
    }

    function setPickupLocation(latlng) {
        pickupCoords = latlng;
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupMarker = createDraggableMarker(latlng, 'Pickup');
    }

    function setDestinationLocation(latlng) {
         destCoords = latlng;
        if (destMarker) map.removeLayer(destMarker);
        destMarker = createDraggableMarker(latlng, 'Destination');
    }

    function clearMarkersAndRoute() {
        if (pickupMarker && map.hasLayer(pickupMarker)) map.removeLayer(pickupMarker); pickupMarker = null;
        if (destMarker && map.hasLayer(destMarker)) map.removeLayer(destMarker); destMarker = null;
        // Placeholder for removing a route line if drawn by a routing plugin
    }

    function handleLocationFound(e) {
        hideLoading();
        const radius = e.accuracy / 2; const latlng = e.latlng;
        map.setView(latlng, DEFAULT_ZOOM + 2);

        if (userLocationMarker && map.hasLayer(userLocationMarker)) map.removeLayer(userLocationMarker);
        userLocationMarker = L.circle(latlng, radius, { color: '#007bff', weight: 1, opacity: 0.5, fillOpacity: 0.1 }).addTo(map)
            .bindPopup(`Location Accuracy: ${radius.toFixed(0)}m`).openPopup();

        setPickupLocation(latlng);
        pickupAddressInput.value = `Current Location (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
        // Clear destination when using current location
        destCoords = null; destAddressInput.value = '';
        if (destMarker && map.hasLayer(destMarker)) { map.removeLayer(destMarker); destMarker = null; }
        updateEstimationBox();
        alert('Location found and set as pickup!');
    }
    function handleLocationError(e) {
        hideLoading();
        console.error("Geolocation error:", e.message);
        let message = "Could not get your location. Check browser permissions and ensure location services are on.";
        if (e.code === 1) message = "Location access denied. Please enable permissions.";
        else if (e.code === 2) message = "Location information unavailable.";
        else if (e.code === 3) message = "Getting location timed out.";
        alert(message);
    }
    function showLoading() { if(loadingIndicator) loadingIndicator.style.display = 'block'; }
    function hideLoading() { if(loadingIndicator) loadingIndicator.style.display = 'none'; }

    // ---- Cost Estimation (Demo) ----
    function updateEstimationBox() {
        if (pickupCoords && destCoords && map) {
            try {
                const distanceMeters = map.distance(pickupCoords, destCoords);
                const distanceKm = distanceMeters / 1000;
                const estimatedCost = distanceKm * DUMMY_RATE_PER_KM;

                if (estDistanceEl) estDistanceEl.textContent = distanceKm.toFixed(1);
                if (estCostEl) estCostEl.textContent = `₦${estimatedCost.toFixed(0)}`;
            } catch (e) {
                 console.error("Error calculating distance/cost:", e);
                 if (estDistanceEl) estDistanceEl.textContent = '--';
                 if (estCostEl) estCostEl.textContent = '--';
            }
        } else {
            if (estDistanceEl) estDistanceEl.textContent = '--';
            if (estCostEl) estCostEl.textContent = '--';
        }
    }

    // ---- Tab Switching Logic (Ride Panel) ----
    // Make globally accessible for onclick
    window.showPanel = (panelId) => {
        const isActive = (el) => el?.classList.contains('active');
        const setActive = (el) => el?.classList.add('active');
        const setInactive = (el) => el?.classList.remove('active');

        if (panelId === 'booking') { if (!isActive(panelBooking)) { setActive(panelBooking); setActive(tabBook); setInactive(panelTrips); setInactive(tabTrips); } }
        else if (panelId === 'trips') { if (!isActive(panelTrips)) { setActive(panelTrips); setActive(tabTrips); setInactive(panelBooking); setInactive(tabBook); } }

        if (panelId === 'booking' && map) {
            setTimeout(() => map.invalidateSize(), 50); // Ensure map resizes correctly
        }
    }

    // ---- Agency Autocomplete (Demo) ----
    function showAgencySuggestions(filteredAgencies) {
        if (!agencySuggestionsContainer) return;
        agencySuggestionsContainer.innerHTML = '';
        if (filteredAgencies.length === 0) {
            agencySuggestionsContainer.style.display = 'none';
            return;
        }
        filteredAgencies.forEach(agency => {
            const div = document.createElement('div');
            div.textContent = agency;
            div.addEventListener('click', () => {
                if (agencyNameInput) agencyNameInput.value = agency;
                agencySuggestionsContainer.style.display = 'none';
            });
            agencySuggestionsContainer.appendChild(div);
        });
        agencySuggestionsContainer.style.display = 'block';
    }

    // ---- User Photo Upload (Trigger) ----
     function handlePhotoUpload(event) {
         const file = event.target.files[0];
         const targetContainer = currentView === 'view-main-booking' ? userPhotoContainer : document.getElementById('admin-photo-container'); // Handle admin photo too if needed

         if (file && file.type.startsWith('image/') && targetContainer) {
             const reader = new FileReader();
             reader.onload = (e) => {
                 targetContainer.style.backgroundImage = `url('${e.target.result}')`;
                 targetContainer.style.backgroundSize = 'cover';
                 // TODO: Add backend call here to upload image data
                 console.log("Photo selected (Demo). Upload to backend needed.");
             }
             reader.readAsDataURL(file);
         } else if (file) {
             alert("Please select a valid image file (JPEG, PNG, GIF, etc.).");
         }
         // Reset file input to allow selecting the same file again if needed
         event.target.value = null;
     }

    // ---- Dashboard Section Switching Logic ----
    // Make globally accessible for onclick
    window.showDashboardSection = (sectionId, clickedLink = null) => {
        console.log("Switching dashboard section to:", sectionId);
        dashboardSections.forEach(section => {
            section.classList.toggle('active', section.id === sectionId);
        });
        sidebarLinks.forEach(link => {
            const linkTargetsSection = link.getAttribute('onclick')?.includes(`'${sectionId}'`);
            link.classList.toggle('active', linkTargetsSection || link === clickedLink);
        });
        currentDashboardSection = sectionId;
    }

    // ---- Event Listeners Setup ----
    function setupEventListeners() {
        // Authentication Forms
        document.getElementById('login-form')?.addEventListener('submit', handleLogin);
        document.getElementById('register-staff-form')?.addEventListener('submit', (e) => handleRegistration(e, 'Staff'));
        document.getElementById('register-agency-form')?.addEventListener('submit', (e) => handleRegistration(e, 'Agency'));

        // Geolocation Button
        locateButton?.addEventListener('click', () => {
            if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
            if (!map) { initializeMap(); }
            if (!map) { alert('Map could not be initialized.'); return; }
            showLoading();
            navigator.geolocation.getCurrentPosition(handleLocationFound, handleLocationError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        });

        // Booking Form (Demo Submission)
        document.getElementById('booking-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            // Add form validation here before showing alert
            alert('Booking Request Confirmed (Demo Only)! Driver assignment via backend.');
            // TODO: Collect form data and send via Fetch/AJAX to backend
        });

        // Agency Name Autocomplete Listener
        agencyNameInput?.addEventListener('input', (e) => {
           const inputText = e.target.value.toLowerCase();
           if (inputText.length < 2) { if(agencySuggestionsContainer) agencySuggestionsContainer.style.display = 'none'; return; }
           const filtered = existingAgencies.filter(agency => agency.toLowerCase().includes(inputText));
           showAgencySuggestions(filtered);
        });
        // Hide agency suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (agencySuggestionsContainer && !agencyNameInput?.contains(e.target) && !agencySuggestionsContainer.contains(e.target)) {
                agencySuggestionsContainer.style.display = 'none';
            }
        });

        // User Photo Upload Trigger
        userPhotoContainer?.addEventListener('click', () => { photoUploadInput?.click(); });
        document.getElementById('admin-photo-container')?.addEventListener('click', () => alert("Admin photo upload not implemented in this demo.")); // Placeholder for admin photo
        photoUploadInput?.addEventListener('change', handlePhotoUpload);

        // Address Input Manual Change Listener (to clear coords for estimation)
         pickupAddressInput?.addEventListener('input', () => { if(!pickupAddressInput.value.includes("Map Location") && !pickupAddressInput.value.includes("Current Location")) { pickupCoords = null; if(pickupMarker && map.hasLayer(pickupMarker)) map.removeLayer(pickupMarker); pickupMarker = null; updateEstimationBox();} });
         destAddressInput?.addEventListener('input', () => { if(!destAddressInput.value.includes("Map Location")) { destCoords = null; if(destMarker && map.hasLayer(destMarker)) map.removeLayer(destMarker); destMarker = null; updateEstimationBox(); } });

        // Setup listeners for dashboard sidebar/tabs (using onclick in HTML simplifies this part for demo)

        console.log("Event listeners set up.");
    }

    // ---- Initialization ----
    setupEventListeners();
    showView(currentView); // Show the initial view (homepage)
    console.log("NGovRide Initialized. Current view:", currentView);

}); // End DOMContentLoaded