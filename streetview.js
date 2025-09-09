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
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,streetview`;
  script.async = true;
  script.defer = true;
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
}

function createStreetViewPicker(locationData, apiKey) {
  const modal = document.createElement('div');
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

  const header = document.createElement('div');
  header.style.padding = '12px 16px';
  header.style.background = '#f1f1f1';
  header.style.borderBottom = '1px solid #ddd';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.innerHTML = '<span style="font-weight:bold; font-size:16px;">Street View Picker</span>';

  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  Object.assign(closeButton.style, {
    background: 'transparent',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px'
  });
  closeButton.onclick = () => modal.remove();
  header.appendChild(closeButton);
  modal.appendChild(header);

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
    opacity: '0.5'
  });
  setButton.disabled = true;

  bottomBar.appendChild(urlDisplay);
  bottomBar.appendChild(setButton);
  modal.appendChild(bottomBar);

  document.body.appendChild(modal);

  loadGoogleMapsAPI(apiKey, () => {
    let currentStreetViewUrl = '';
    let map, panorama, marker;

    // Initialize map
    const defaultCenter = locationData.position?.coordinates 
      ? { lat: locationData.position.coordinates[1], lng: locationData.position.coordinates[0] }
      : { lat: 40.7128, lng: -74.0060 }; // NYC default

    map = new google.maps.Map(mapDiv, {
      center: defaultCenter,
      zoom: 15,
      streetViewControl: true
    });

    // Initialize Street View
    panorama = new google.maps.StreetViewPanorama(streetViewDiv, {
      position: defaultCenter,
      pov: { heading: 270, pitch: 0 }
    });

    map.setStreetView(panorama);

    // Generate initial Street View URL and enable set button immediately
    const generateStreetViewURL = (position, pov) => {
      const lat = position.lat();
      const lng = position.lng();
      return `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${panorama.getLocation()?.pano || 'unknown'}!2e0!7i16384!8i8192`;
    };

    // Set initial URL and enable button
    setTimeout(() => {
      if (panorama.getLocation()) {
        currentStreetViewUrl = generateStreetViewURL(panorama.getLocation().latLng, panorama.getPov());
        urlDisplay.textContent = currentStreetViewUrl;
        setButton.disabled = false;
        setButton.style.opacity = '1';
      }
    }, 1000);

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
          panorama.setPov({ heading: 270, pitch: 0 });
          
          // Generate Street View URL
          const lat = data.location.latLng.lat();
          const lng = data.location.latLng.lng();
          const pov = panorama.getPov();
          const zoom = panorama.getZoom();
          
          currentStreetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${data.location.pano}!2e0!7i16384!8i8192`;
          
          urlDisplay.textContent = currentStreetViewUrl;
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
            
            urlDisplay.textContent = currentStreetViewUrl;
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
        urlDisplay.textContent = currentStreetViewUrl;
      }
    });

    // Set button click handler
    setButton.onclick = () => {
      if (currentStreetViewUrl) {
        // Find and fill the input field
        const streetViewInput = document.querySelector(
          'input[placeholder*="google map streetview url"], ' +
          'input[placeholder*="streetview"], ' +
          'input.Input[placeholder*="Enter the google map streetview url"], ' +
          'input.Input-fluid[placeholder*="Enter the google map streetview url"]'
        );
        
        if (streetViewInput) {
          // Bubble paste functionality - create visual feedback
          const createBubble = (text) => {
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
          };
          
          // Use EXACT same bubble paste method as text formatter in injector.js
          function dispatchInput(el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          // Execute the exact text formatter pattern from injector.js:164-166
          createBubble('Street View URL Pasted!');
          streetViewInput.value = currentStreetViewUrl;
          dispatchInput(streetViewInput);
          streetViewInput.focus();
          streetViewInput.selectionStart = streetViewInput.selectionEnd = streetViewInput.value.length;
          
          console.log('Street View URL set using text formatter method:', currentStreetViewUrl);
          
          // Auto-click OK button after paste
          setTimeout(() => {
            const okButton = document.querySelector('button.Button.mt-3.Button-primary[type="button"]');
            if (okButton && okButton.textContent.trim() === 'OK') {
              okButton.click();
              createBubble('OK Clicked!');
              console.log('OK button clicked automatically');
              
              // Wait for OK processing then click "Go to Next Session"
              setTimeout(() => {
                const nextButtons = [
                  'button:contains("Go to Next Session")',
                  'button[class*="Button"]:contains("Next")',
                  'a[href*="next"]',
                  'button:contains("Continue")',
                  'button:contains("Proceed")'
                ];
                
                // Try to find the next session button
                let nextButton = null;
                for (const selector of nextButtons) {
                  if (selector.includes(':contains')) {
                    // Handle text-based selectors manually
                    const text = selector.split(':contains("')[1].replace('")', '');
                    const buttons = document.querySelectorAll('button, a');
                    for (const btn of buttons) {
                      if (btn.textContent.trim().includes(text)) {
                        nextButton = btn;
                        break;
                      }
                    }
                  } else {
                    nextButton = document.querySelector(selector);
                  }
                  if (nextButton) break;
                }
                
                if (nextButton) {
                  nextButton.click();
                  createBubble('Go to Next Session!');
                  console.log('Next session button clicked automatically');
                } else {
                  // Fallback: look for any button with "next" in class or text
                  const allButtons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
                  for (const btn of allButtons) {
                    const text = btn.textContent.toLowerCase();
                    const className = (btn.className || '').toLowerCase();
                    if (text.includes('next') || text.includes('continue') || text.includes('proceed') || 
                        className.includes('next') || className.includes('continue')) {
                      btn.click();
                      createBubble('Next Button Found!');
                      console.log('Next button found and clicked:', btn);
                      break;
                    }
                  }
                }
              }, 1500);
              
            } else {
              console.warn('OK button not found or text does not match');
            }
          }, 1000);
          
        } else {
          console.error('Could not find Street View input field');
        }
        modal.remove();
      }
    };

    // Initialize with existing data if available
    if (locationData.street_view_link) {
      try {
        const url = new URL(locationData.street_view_link);
        const params = new URLSearchParams(url.search);
        const cbll = params.get('cbll');
        if (cbll) {
          const [lat, lng] = cbll.split(',').map(Number);
          const position = { lat, lng };
          map.setCenter(position);
          panorama.setPosition(position);
          
          if (marker) marker.setMap(null);
          marker = new google.maps.Marker({
            position: position,
            map: map
          });
          
          currentStreetViewUrl = locationData.street_view_link;
          urlDisplay.textContent = currentStreetViewUrl;
          setButton.disabled = false;
          setButton.style.opacity = '1';
        }
      } catch (e) {
        console.error("Error parsing existing street_view_link:", e);
      }
    }
  });
}
