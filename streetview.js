(function () {
  // Aggressive script re-execution prevention
  if (window.doobneekStreetViewActive) {
    console.log('[streetview.js] Script already active, preventing re-execution');
    return;
  }

  // Check if we're coming from browser back/forward navigation
  if (performance.navigation && performance.navigation.type === 2) {
    console.log('[streetview.js] Back/forward navigation detected, deferring script activation');
    // Wait longer before activating to ensure previous cleanup is complete
    setTimeout(() => {
      if (!window.doobneekStreetViewActive) {
        window.doobneekStreetViewActive = true;
        console.log('[streetview.js] Script activated after navigation delay');
      }
    }, 1000);
    return;
  }

  window.doobneekStreetViewActive = true;

  // Use EXACT same bubble paste method as text formatter in injector.js
  function dispatchInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Track URL changes and NO LET'S EDIT IT clicks
  let lastStreetViewUrl = '';
  let hasClickedNoLetsEdit = false;
  let bannerShown = false;
  let lastUrl = window.location.href;
  let urlCheckInterval = null;
  let observer = null;
  let globalClickHandler = null;
  let popstateHandler = null;
  let beforeunloadHandler = null;
  let visibilityHandler = null;
  let pagehideHandler = null;
  let activeModals = [];
  let mapsInstances = [];
  let injectedScripts = [];

  // Check if yourpeerredirect is enabled
  function isYourPeerRedirectEnabled() {
    return localStorage.getItem('yourpeerredirect') === 'true';
  }

  // Check if we're on street-view page with proper regex
  function isStreetViewPage(url) {
    return /\/questions\/street-view\/?$/.test(url);
  }

  // URL change detection function
  function handleUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      console.log('URL changed from:', lastUrl, 'to:', currentUrl);

      // Clean up observers when leaving street view pages
      const wasStreetView = isStreetViewPage(lastUrl);
      const isStreetView = isStreetViewPage(currentUrl);

      if (wasStreetView && !isStreetView) {
        console.log('[streetview.js] Leaving street view page, cleaning up resources');
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        // Clean up any active modals and maps when leaving street view
        cleanupMapsAndModals();
      }

      lastUrl = currentUrl;

      // Reset flags when URL changes
      hasClickedNoLetsEdit = false;
      bannerShown = false;

      // Run street view logic if on street-view page
      if (isStreetView) {
        showLoadingBanner();
        setTimeout(clickNoLetsEditIfNeeded, 500);

        // Reinitialize observer if needed
        if (!observer) {
          observer = new MutationObserver(clickNoLetsEditIfNeeded);
          const targetContainer = document.querySelector('main') || document.body;
          observer.observe(targetContainer, { childList: true, subtree: true });
        }
      }
    }
  }

  // Set up URL change monitoring using multiple methods
  function setupUrlChangeListener() {
    // Prevent conflicts with other scripts that might override history
    if (window.doobneekHistoryOverridden) {
      console.log('[streetview.js] History already overridden by another script, using fallback methods');
      // Method 2: Listen for popstate events only
      popstateHandler = handleUrlChange;
      window.addEventListener('popstate', popstateHandler);
      // Method 3: Periodic checking as fallback (reduced frequency)
      urlCheckInterval = setInterval(handleUrlChange, 5000);
      return;
    }

    window.doobneekHistoryOverridden = true;

    // Method 1: Override pushState and replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(handleUrlChange, 0);
    };

    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(handleUrlChange, 0);
    };

    // Method 2: Listen for popstate events
    popstateHandler = handleUrlChange;
    window.addEventListener('popstate', popstateHandler);

    // Method 3: Periodic checking as fallback (reduced frequency)
    urlCheckInterval = setInterval(handleUrlChange, 5000);

    console.log('URL change listener setup complete');
  }

  // Show loading banner immediately on street-view URL
  function showLoadingBanner() {
    const currentUrl = window.location.href;
    if (isStreetViewPage(currentUrl) && !bannerShown) {
      bannerShown = true;
      const banner = document.createElement('div');
      banner.id = 'doobneek-loading-banner';
      banner.textContent = 'doobneek is loading';
      Object.assign(banner.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#4CAF50',
        color: '#fff',
        fontSize: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999',
        opacity: '1',
        transition: 'opacity 2s ease-in-out',
      });
      document.body.appendChild(banner);
      console.log('[ℹ️] doobneek loading banner shown immediately.');

      // Fade out after 2 seconds
      setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => {
          if (banner.parentNode) {
            banner.remove();
          }
        }, 2000); // Wait for fade transition to complete
      }, 2000);
    }
  }

  // Click "NO, LET'S EDIT IT" button if not already clicked for this URL
  function clickNoLetsEditIfNeeded() {
    const currentUrl = window.location.href;
    
    // Reset flags if URL changed
    if (lastStreetViewUrl !== currentUrl) {
      hasClickedNoLetsEdit = false;
      bannerShown = false;
      lastStreetViewUrl = currentUrl;
      
      // Show banner immediately on URL change to street-view
      showLoadingBanner();
    }
    
    // Only click if yourpeerredirect IS enabled and we haven't clicked for this URL
    if (isYourPeerRedirectEnabled() && !hasClickedNoLetsEdit && isStreetViewPage(currentUrl)) {
      // Look for button by text content since :contains() isn't valid CSS
      const buttons = document.querySelectorAll('button');
      let noLetsEditButton = null;
      
      for (const btn of buttons) {
        const text = btn.textContent.trim().toUpperCase();
        if (text.includes('NO') && (text.includes('EDIT') || text.includes('LET'))) {
          noLetsEditButton = btn;
          break;
        }
      }
      
      if (noLetsEditButton) {
        console.log('Clicking NO, LET\'S EDIT IT button');
        noLetsEditButton.click();
        hasClickedNoLetsEdit = true;
        createBubble('NO, LET\'S EDIT IT Clicked!');
      }
    }
  }

  // Initialize URL change listener
  setupUrlChangeListener();

  // Show loading banner immediately on initial load if on street-view page
  showLoadingBanner();

  // Run the check when page loads and on mutations (only on street-view pages)
  if (isStreetViewPage(window.location.href)) {
    setTimeout(clickNoLetsEditIfNeeded, 500);
    observer = new MutationObserver(clickNoLetsEditIfNeeded);
    // Observe only specific containers instead of entire body
    const targetContainer = document.querySelector('main') || document.body;
    observer.observe(targetContainer, { childList: true, subtree: true });
  }

  // Bubble paste functionality - create visual feedback
  function createBubble(text) {
    const bubble = document.createElement('div');
    Object.assign(bubble.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(66, 133, 244, 0.9)',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '25px',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: '100002',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      animation: 'bubbleFade 2s ease-out forwards'
    });
    bubble.textContent = text;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes bubbleFade {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(bubble);

    setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
      if (style.parentNode) style.remove();
    }, 2000);
  }

  function loadGoogleMapsAPI(apiKey, callback) {
    if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
      callback();
      return;
    }

    // Check if script is already loading
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for existing script to load
      const checkGoogle = () => {
        if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
          callback();
        } else {
          setTimeout(checkGoogle, 100);
        }
      };
      checkGoogle();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,streetview,geometry`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-doobneek-script', 'true'); // Mark for cleanup
    script.onload = () => {
      // Double check that Google Maps is fully loaded
      const checkLoaded = () => {
        if (window.google && window.google.maps && window.google.maps.StreetViewPanorama) {
          callback();
        } else {
          setTimeout(checkLoaded, 50);
        }
      };
      checkLoaded();
    };
    script.onerror = () => {
      console.error('Google Maps API failed to load.');
      alert('Could not load Google Maps API.');
    };
    document.head.appendChild(script);
    injectedScripts.push(script); // Track for cleanup
  }

  async function createStreetViewPicker(locationData, apiKey) {
    // First fetch location details to get address and org/location names
    let streetAddress = '';
    let headerTitle = 'Street View Picker';

    // Extract UUID from current URL to fetch location details
    const currentUrl = window.location.href;
    const uuidMatch = currentUrl.match(/\/team\/location\/([a-f0-9-]+)/);

    if (uuidMatch && uuidMatch[1]) {
      try {
        const uuid = uuidMatch[1];
        const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations/${uuid}`);
        if (res.ok) {
          const data = await res.json();
          // Build street address from API data
          streetAddress = data.address?.street || '';
          // Build header title like in gghost notepad: locname/orgname
          const orgName = data.Organization?.name || '';
          const locName = data.name || '';
          if (orgName && locName) {
            headerTitle = `${locName} / ${orgName}`;
          } else if (orgName) {
            headerTitle = orgName;
          } else if (locName) {
            headerTitle = locName;
          }
        }
      } catch (error) {
        console.error('Failed to fetch location details:', error);
      }
    }

    const modal = document.createElement('div');
    modal.setAttribute('data-doobneek-modal', 'true'); // Mark for cleanup
    Object.assign(modal.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90vw',
      height: '90vh',
      maxWidth: '1000px',
      maxHeight: '700px',
      background: '#fff',
      zIndex: 100001,
      boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column'
    });
    activeModals.push(modal); // Track for cleanup

    const header = document.createElement('div');
    header.style.padding = '12px 16px';
    header.style.background = '#f1f1f1';
    header.style.borderBottom = '1px solid #ddd';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `<span style="font-weight:bold; font-size:16px;">${headerTitle}</span>`;

    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    Object.assign(closeButton.style, {
      background: 'transparent',
      border: 'none',
      fontSize: '20px',
      cursor: 'pointer',
      padding: '4px'
    });
    // Add a style rule to ensure the autocomplete suggestions appear over the modal.
    const style = document.createElement('style');
    style.textContent = '.pac-container { z-index: 100002 !important; }';

    closeButton.onclick = () => {
      // Clean up maps instances before closing modal
      cleanupModalMaps(modal);
      modal.remove();
      // Remove from tracking array
      const index = activeModals.indexOf(modal);
      if (index > -1) activeModals.splice(index, 1);
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
    header.appendChild(closeButton);
    modal.appendChild(header);
    document.head.appendChild(style);

    // Search bar
    const searchContainer = document.createElement('div');
    searchContainer.style.padding = '12px 16px';
    searchContainer.style.borderBottom = '1px solid #ddd';

    const searchInput = document.createElement('input');
    Object.assign(searchInput.style, {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '14px'
    });
    searchInput.type = 'text';
    searchInput.placeholder = 'Search for a location...';
    // Pre-fill with street address if available
    if (streetAddress) {
      searchInput.value = streetAddress;
    }

    searchContainer.appendChild(searchInput);
    modal.appendChild(searchContainer);

    // Map and Street View container
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flexGrow = '1';
    contentContainer.style.height = 'calc(100% - 120px)';

    // Map div (left side)
    const mapDiv = document.createElement('div');
    mapDiv.style.width = '50%';
    mapDiv.style.height = '100%';
    mapDiv.style.borderRight = '1px solid #ddd';

    // Street View div (right side)  
    const streetViewDiv = document.createElement('div');
    streetViewDiv.style.width = '50%';
    streetViewDiv.style.height = '100%';

    contentContainer.appendChild(mapDiv);
    contentContainer.appendChild(streetViewDiv);
    modal.appendChild(contentContainer);

    // Bottom bar with set button
    const bottomBar = document.createElement('div');
    Object.assign(bottomBar.style, {
      padding: '12px 16px',
      borderTop: '1px solid #ddd',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#f9f9f9'
    });

    const urlDisplay = document.createElement('span');
    urlDisplay.style.fontSize = '12px';
    urlDisplay.style.color = '#666';
    urlDisplay.style.maxWidth = '60%';
    urlDisplay.style.overflow = 'hidden';
    urlDisplay.style.textOverflow = 'ellipsis';
    urlDisplay.style.whiteSpace = 'nowrap';
    urlDisplay.textContent = 'Click on the map to select a Street View location';

    const setButton = document.createElement('button');
    setButton.textContent = 'Set Street View';
    Object.assign(setButton.style, {
      background: '#4285f4',
      color: 'white',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      opacity: '0.5',
      position: 'sticky',
      bottom: '0'
    });
    setButton.disabled = true;

    bottomBar.appendChild(urlDisplay);
    bottomBar.appendChild(setButton);
    modal.appendChild(bottomBar);

    document.body.appendChild(modal);

    // Helper function to truncate URL for display
    const truncateUrl = (url) => {
      if (!url) return '';
      if (url.length <= 80) return url;

      // For Street View URLs, show domain + coordinates + ellipsis
      if (url.includes('google.com/maps/@')) {
        const coordPart = url.split('/@')[1]?.split('/')[0];
        if (coordPart) {
          const coords = coordPart.split(',').slice(0, 2).join(',');
          return `google.com/maps/@${coords}...`;
        }
      }

      // Generic truncation
      return url.substring(0, 80) + '...';
    };

    loadGoogleMapsAPI(apiKey, () => {
      let currentStreetViewUrl = '';
      let map, panorama, marker;

      // Initialize map center - use existing streetview_url if available, otherwise use position or default
      let defaultCenter = { lat: 40.7128, lng: -74.0060 }; // NYC default
      let initialPov = { heading: 270, pitch: 0 };
      let initialStreetViewUrl = null;

      if (locationData.streetview_url) {
        try {
          const url = locationData.streetview_url;
          initialStreetViewUrl = url; // Preserve the original URL

          // Robustly parse lat, lng, heading, and pitch from the URL
          const urlParams = url.split('@')[1]?.split('/')[0]?.split(',');
          if (urlParams && urlParams.length >= 2) {
            defaultCenter = { lat: parseFloat(urlParams[0]), lng: parseFloat(urlParams[1]) };

            urlParams.forEach(param => {
              if (param.endsWith('h')) {
                initialPov.heading = parseFloat(param.slice(0, -1));
              } else if (param.endsWith('t')) {
                initialPov.pitch = parseFloat(param.slice(0, -1));
              }
            });
            console.log('Robustly parsed initial POV:', initialPov);
          }
        } catch (e) {
          console.error('Error parsing existing streetview_url:', e);
          // Fallback to original URL if parsing fails, which is already set
        }
      } else if (locationData.position?.coordinates) {
        // Use position data if no street view URL is provided
        defaultCenter = { lat: locationData.position.coordinates[1], lng: locationData.position.coordinates[0] };
      }

      map = new google.maps.Map(mapDiv, {
        center: defaultCenter,
        zoom: 15,
        streetViewControl: true
      });

      // Initialize Street View with parsed or default values
      panorama = new google.maps.StreetViewPanorama(streetViewDiv, {
        position: defaultCenter,
        pov: initialPov
      });

      map.setStreetView(panorama);

      // Track maps instances for cleanup
      const mapsInstance = { map, panorama, modal };
      mapsInstances.push(mapsInstance);

      // Generate initial Street View URL and enable set button immediately
      const generateStreetViewURL = (position, pov) => {
        const lat = position.lat();
        const lng = position.lng();
        return `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${panorama.getLocation()?.pano || 'unknown'}!2e0!7i16384!8i8192`;
      };

      // Enhanced URL generation - try multiple approaches to always enable the button
      const tryGenerateUrl = () => {
        if (initialStreetViewUrl) {
          currentStreetViewUrl = initialStreetViewUrl;
          urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
          setButton.disabled = false;
          setButton.style.opacity = '1';
          console.log('Using initial Street View URL:', currentStreetViewUrl);
          return true;
        }

        if (panorama.getLocation()) {
          currentStreetViewUrl = generateStreetViewURL(panorama.getLocation().latLng, panorama.getPov());
          urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
          setButton.disabled = false;
          setButton.style.opacity = '1';
          console.log('Generated URL from panorama location:', currentStreetViewUrl);
          return true;
        }

        // Fallback: generate URL from default center even without Street View data
        const lat = defaultCenter.lat;
        const lng = defaultCenter.lng;
        const heading = initialPov.heading;
        const pitch = initialPov.pitch;
        currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${heading}h,${pitch}t/data=!3m6!1e1!3m4!1s-fallback-pano!2e0!7i16384!8i8192`;
        urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
        setButton.disabled = false;
        setButton.style.opacity = '1';
        console.log('Generated fallback URL from coordinates:', currentStreetViewUrl);
        return true;
      };

      // Try immediately with retry limit
      let retryCount = 0;
      const maxRetries = 3;

      const attemptGenerate = () => {
        if (tryGenerateUrl()) {
          return; // Success, stop trying
        }

        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`[streetview.js] Retry ${retryCount}/${maxRetries} for URL generation`);
          setTimeout(attemptGenerate, 2000);
        } else {
          console.warn('[streetview.js] Max retries reached for URL generation');
        }
      };

      setTimeout(attemptGenerate, 500);

      // Also try when panorama loads
      panorama.addListener('position_changed', () => {
        if (!currentStreetViewUrl || currentStreetViewUrl.includes('fallback')) {
          tryGenerateUrl();
        }
      });

      // Search functionality
      const autocomplete = new google.maps.places.Autocomplete(searchInput);
      autocomplete.bindTo('bounds', map);

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;

        if (place.geometry.viewport) {
          map.fitBounds(place.geometry.viewport);
        } else {
          map.setCenter(place.geometry.location);
          map.setZoom(17);
        }

        if (marker) marker.setMap(null);
        marker = new google.maps.Marker({
          position: place.geometry.location,
          map: map
        });
      });

      // Click on map to set Street View
      map.addListener('click', (event) => {
        const clickedLocation = event.latLng;

        if (marker) marker.setMap(null);
        marker = new google.maps.Marker({
          position: clickedLocation,
          map: map,
          draggable: true
        });

        // Check if Street View is available at this location
        const streetViewService = new google.maps.StreetViewService();
        streetViewService.getPanorama({
          location: clickedLocation,
          radius: 50,
          source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
          if (status === 'OK') {
            panorama.setPosition(data.location.latLng);
            const heading = google.maps.geometry.spherical.computeHeading(data.location.latLng, clickedLocation);
            panorama.setPov({ heading: heading, pitch: 0 });

            // Generate Street View URL
            const lat = data.location.latLng.lat();
            const lng = data.location.latLng.lng();
            const pov = panorama.getPov();
            const zoom = panorama.getZoom();

            currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${data.location.pano}!2e0!7i16384!8i8192`;

            urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
            setButton.disabled = false;
            setButton.style.opacity = '1';
          } else {
            panorama.setPosition(clickedLocation);
            urlDisplay.textContent = 'Street View not available at this location';
            setButton.disabled = true;
            setButton.style.opacity = '0.5';
          }
        });

        // Update marker position when dragged
        marker.addListener('dragend', () => {
          const newPosition = marker.getPosition();
          streetViewService.getPanorama({
            location: newPosition,
            radius: 50,
            source: google.maps.StreetViewSource.OUTDOOR
          }, (data, status) => {
            if (status === 'OK') {
              panorama.setPosition(data.location.latLng);
              const lat = data.location.latLng.lat();
              const lng = data.location.latLng.lng();
              const pov = panorama.getPov();

              currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${data.location.pano}!2e0!7i16384!8i8192`;

              urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
              setButton.disabled = false;
              setButton.style.opacity = '1';
            }
          });
        });
      });

      // Update URL when Street View changes
      panorama.addListener('pov_changed', () => {
        if (currentStreetViewUrl && panorama.getLocation()) {
          const position = panorama.getLocation().latLng;
          const pov = panorama.getPov();
          const lat = position.lat();
          const lng = position.lng();

          currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${panorama.getLocation().pano}!2e0!7i16384!8i8192`;
          urlDisplay.textContent = truncateUrl(currentStreetViewUrl);
        }
      });

      // Set button click handler
      setButton.onclick = () => {
        // Ensure we always have a URL before proceeding
        if (!currentStreetViewUrl) {
          tryGenerateUrl();
        }

        if (currentStreetViewUrl) {
          // Debug: List all input and textarea elements
          console.log('=== DEBUG: All input elements ===');
          document.querySelectorAll('input').forEach((input, i) => {
            console.log(`Input ${i}:`, {
              tagName: input.tagName,
              type: input.type,
              className: input.className,
              placeholder: input.placeholder,
              id: input.id,
              name: input.name,
              element: input
            });
          });
          
          console.log('=== DEBUG: All textarea elements ===');
          document.querySelectorAll('textarea').forEach((textarea, i) => {
            console.log(`Textarea ${i}:`, {
              tagName: textarea.tagName,
              className: textarea.className,
              placeholder: textarea.placeholder,
              id: textarea.id,
              name: textarea.name,
              element: textarea
            });
          });
          
          // Find and fill the input field using bubble paste method
          const streetViewInput = document.querySelector(
            'input[placeholder*="google map streetview url"], ' +
            'input[placeholder*="streetview"], ' +
            'textarea[placeholder*="google map streetview url"], ' +
            'textarea[placeholder*="streetview"], ' +
            'input.Input[placeholder*="Enter the google map streetview url"], ' +
            'input.Input-fluid[placeholder*="Enter the google map streetview url"], ' +
            'textarea.TextArea-fluid[placeholder*="Enter the google map streetview url"], ' +
            'textarea.TextArea-fluid'
          );

          console.log('=== DEBUG: Selected element ===');
          console.log('streetViewInput found:', !!streetViewInput);
          if (streetViewInput) {
            console.log('Element details:', {
              tagName: streetViewInput.tagName,
              className: streetViewInput.className,
              placeholder: streetViewInput.placeholder,
              id: streetViewInput.id,
              name: streetViewInput.name,
              value: streetViewInput.value,
              disabled: streetViewInput.disabled,
              readOnly: streetViewInput.readOnly,
              element: streetViewInput
            });
          }

          if (streetViewInput) {
            // Comprehensive approach for React-controlled or special input fields
            streetViewInput.focus();

            // Try React-style property setting if available
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

            // Clear the field first
            nativeInputValueSetter.call(streetViewInput, '');
            streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Set the new value using native setter
            nativeInputValueSetter.call(streetViewInput, currentStreetViewUrl);

            // Simulate user editing by adding a character and removing it
            setTimeout(() => {
              // Add a space at the end (simulating user typing)
              const currentValue = streetViewInput.value;
              nativeInputValueSetter.call(streetViewInput, currentValue + ' ');
              streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));
              streetViewInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));

              // Remove the space (simulating user deleting)
              setTimeout(() => {
                nativeInputValueSetter.call(streetViewInput, currentValue);
                streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));
                streetViewInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));

                // Fire all events after the edit simulation
                const events = [
                  new Event('input', { bubbles: true }),
                  new Event('change', { bubbles: true }),
                  new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
                  new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }),
                  new Event('blur', { bubbles: true })
                ];

                events.forEach(event => streetViewInput.dispatchEvent(event));
              }, 100);
            }, 50);

            createBubble('Street View URL Pasted!');
            console.log('Street View URL pasted with React-style setter and comprehensive events:', currentStreetViewUrl);

            // Auto-click OK button after a short delay to make it stick
            setTimeout(() => {
              const okButton = document.querySelector('button.Button-primary');
              if (okButton && okButton.textContent.trim() === 'OK') {
                console.log('Auto-clicking OK button to make URL stick');
                okButton.click();
                createBubble('OK Clicked!');
              }
            }, 500);

            // Close the modal after successful paste
            setTimeout(() => {
              cleanupModalMaps(modal);
              modal.remove();
              // Remove from tracking array
              const index = activeModals.indexOf(modal);
              if (index > -1) activeModals.splice(index, 1);
              console.log('Street View modal closed after successful paste');
            }, 1000);
          } else {
            // Fallback to clipboard if input not found
            navigator.clipboard.writeText(currentStreetViewUrl).then(() => {
              createBubble('Copied to clipboard!');
              console.log('Street View URL copied to clipboard:', currentStreetViewUrl);
            }).catch(err => {
              console.error('Failed to copy to clipboard:', err);
              createBubble('Street View URL Set!');
            });

            // Close the modal even in fallback case
            setTimeout(() => {
              cleanupModalMaps(modal);
              modal.remove();
              // Remove from tracking array
              const index = activeModals.indexOf(modal);
              if (index > -1) activeModals.splice(index, 1);
              console.log('Street View modal closed after clipboard copy');
            }, 1500);
          }

          // Auto-click OK button when user clicks it - set up persistent listener
          if (!window.doobneekOkClickerActive) {
            window.doobneekOkClickerActive = true;

            globalClickHandler = function(e) {
              const okButton = e.target.closest('button.Button-primary');
              if (okButton && okButton.textContent.trim() === 'OK') {
                console.log('OK button clicked, setting up auto-clickers');

                // Click YES after delay
                setTimeout(() => {
                  console.log('=== AUTO-CLICKING YES BUTTON ===');

                  const yesButton = document.querySelector('button.Button-primary.Button-fluid');
                  if (yesButton && yesButton.textContent.trim() === 'YES') {
                    console.log('Clicking YES button');
                    yesButton.click();
                    createBubble('YES Clicked!');
                  } else {
                    const anyYesButton = Array.from(document.querySelectorAll('button')).find(btn =>
                      btn.textContent.trim().toUpperCase() === 'YES'
                    );
                    if (anyYesButton) {
                      console.log('Clicking YES button (fallback)');
                      anyYesButton.click();
                      createBubble('YES Clicked!');
                    }
                  }

                  // Click "Go to Next Section" after YES - only if URL ends with /thanks
                  setTimeout(() => {
                    console.log('=== AUTO-CLICKING GO TO NEXT SECTION ===');

                    // Check if current URL ends with /thanks
                    const currentUrl = window.location.href;
                    if (!currentUrl.endsWith('/thanks')) {
                      console.log('Skipping Go to Next Section - URL does not end with /thanks. Current URL:', currentUrl);
                      return;
                    }

                    const nextButtonSelectors = [
                      'button.Button.mt-4.Button-primary.Button-fluid',
                      'button.Button-primary.Button-fluid'
                    ];

                    let nextButton = null;
                    for (const selector of nextButtonSelectors) {
                      const buttons = document.querySelectorAll(selector);
                      for (const btn of buttons) {
                        const text = btn.textContent.trim().toUpperCase();
                        if (text.includes('NEXT') || text.includes('GO TO') || text.includes('CONTINUE')) {
                          nextButton = btn;
                          break;
                        }
                      }
                      if (nextButton) break;
                    }

                    if (nextButton) {
                      console.log('Clicking Go to Next Section button - URL ends with /thanks');
                      nextButton.click();
                      createBubble('Go to Next Section Clicked!');
                    } else {
                      const allButtons = document.querySelectorAll('button, a');
                      for (const btn of allButtons) {
                        const text = btn.textContent.trim().toLowerCase();
                        if (text.includes('go to next') || text.includes('next section') || text.includes('continue')) {
                          console.log('Clicking next button (fallback) - URL ends with /thanks:', text);
                          btn.click();
                          createBubble('Next Button Found!');
                          break;
                        }
                      }
                    }
                  }, 1500); // Wait 1.5s after YES
                }, 1000); // Wait 1s after OK
              }
            };

            document.addEventListener('click', globalClickHandler);
          }

          cleanupModalMaps(modal);
          modal.remove();
          // Remove from tracking array
          const index = activeModals.indexOf(modal);
          if (index > -1) activeModals.splice(index, 1);
        }
      };

    });
  }

  // Clean up maps instances for a specific modal
  function cleanupModalMaps(targetModal) {
    console.log('[streetview.js] Cleaning up maps for modal');
    const index = mapsInstances.findIndex(instance => instance.modal === targetModal);
    if (index > -1) {
      const instance = mapsInstances[index];
      try {
        // Properly dispose of Google Maps objects
        if (instance.panorama) {
          google.maps.event.clearInstanceListeners(instance.panorama);
          instance.panorama = null;
        }
        if (instance.map) {
          google.maps.event.clearInstanceListeners(instance.map);
          instance.map = null;
        }
      } catch (e) {
        console.warn('[streetview.js] Error cleaning up maps:', e);
      }
      mapsInstances.splice(index, 1);
    }
  }

  // Clean up all active modals and maps
  function cleanupMapsAndModals() {
    console.log('[streetview.js] Cleaning up all maps and modals');

    // Clean up all maps instances
    mapsInstances.forEach(instance => {
      try {
        if (instance.panorama) {
          google.maps.event.clearInstanceListeners(instance.panorama);
        }
        if (instance.map) {
          google.maps.event.clearInstanceListeners(instance.map);
        }
      } catch (e) {
        console.warn('[streetview.js] Error cleaning up maps instance:', e);
      }
    });
    mapsInstances.length = 0;

    // Clean up all active modals
    activeModals.forEach(modal => {
      try {
        if (modal.parentNode) {
          modal.remove();
        }
      } catch (e) {
        console.warn('[streetview.js] Error removing modal:', e);
      }
    });
    activeModals.length = 0;

    // Clean up injected scripts
    injectedScripts.forEach(script => {
      try {
        if (script.parentNode) {
          script.remove();
        }
      } catch (e) {
        console.warn('[streetview.js] Error removing script:', e);
      }
    });
    injectedScripts.length = 0;

    // Remove any remaining doobneek elements
    document.querySelectorAll('[data-doobneek-modal]').forEach(el => el.remove());
    document.querySelectorAll('[data-doobneek-script]').forEach(el => el.remove());
    document.querySelectorAll('#doobneek-loading-banner').forEach(el => el.remove());
  }

  // Cleanup function to prevent memory leaks
  function cleanup() {
    console.log('[streetview.js] Cleaning up all resources');

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }

    if (globalClickHandler) {
      document.removeEventListener('click', globalClickHandler);
      globalClickHandler = null;
    }

    if (popstateHandler) {
      window.removeEventListener('popstate', popstateHandler);
      popstateHandler = null;
    }

    if (beforeunloadHandler) {
      window.removeEventListener('beforeunload', beforeunloadHandler);
      beforeunloadHandler = null;
    }

    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }

    if (pagehideHandler) {
      window.removeEventListener('pagehide', pagehideHandler);
      pagehideHandler = null;
    }

    // Clean up all maps and modals
    cleanupMapsAndModals();

    // Reset global flags
    window.doobneekOkClickerActive = false;
    window.doobneekHistoryOverridden = false;

    // Clear global references
    if (window.createStreetViewPicker) {
      delete window.createStreetViewPicker;
    }
    window.doobneekStreetViewActive = false;
  }

  // Add cleanup on page unload
  beforeunloadHandler = cleanup;
  window.addEventListener('beforeunload', beforeunloadHandler);

  // Add cleanup on page visibility change (helps with back/forward navigation)
  visibilityHandler = () => {
    if (document.hidden) {
      console.log('[streetview.js] Page hidden, cleaning up resources');
      cleanupMapsAndModals();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  // Add cleanup on page hide (iOS Safari and some mobile browsers)
  pagehideHandler = cleanup;
  window.addEventListener('pagehide', pagehideHandler);

  // Force cleanup on navigation start
  window.addEventListener('beforeunload', () => {
    console.log('[streetview.js] beforeunload triggered, forcing cleanup');
    cleanup();
  });

  // Add cleanup on extension unload (if content script is reinjected)
  if (window.doobneekStreetViewLoaded) {
    console.log('[streetview.js] Script already loaded, cleaning up previous instance');
    cleanup();
  }
  window.doobneekStreetViewLoaded = true;

  window.createStreetViewPicker = createStreetViewPicker;
})();
