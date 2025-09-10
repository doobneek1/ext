(function () {
  // Use EXACT same bubble paste method as text formatter in injector.js
  function dispatchInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Track URL changes and NO LET'S EDIT IT clicks
  let lastStreetViewUrl = '';
  let hasClickedNoLetsEdit = false;
  let bannerShown = false;

  // Check if yourpeerredirect is enabled
  function isYourPeerRedirectEnabled() {
    return localStorage.getItem('yourpeerredirect') === 'true';
  }

  // Show loading banner immediately on street-view URL
  function showLoadingBanner() {
    const currentUrl = window.location.href;
    if (currentUrl.includes('/questions/street-view') && !bannerShown) {
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
    if (isYourPeerRedirectEnabled() && !hasClickedNoLetsEdit && currentUrl.includes('/questions/street-view')) {
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

  // Show loading banner immediately on initial load if on street-view page
  showLoadingBanner();

  // Run the check when page loads and on mutations
  setTimeout(clickNoLetsEditIfNeeded, 500);
  const observer = new MutationObserver(clickNoLetsEditIfNeeded);
  observer.observe(document.body, { childList: true, subtree: true });

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
    // Add a style rule to ensure the autocomplete suggestions appear over the modal.
    const style = document.createElement('style');
    style.textContent = '.pac-container { z-index: 100002 !important; }';

    closeButton.onclick = () => {
      modal.remove();
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
      opacity: '0.5',
      position: 'sticky',
      bottom: '0'
    });
    setButton.disabled = true;

    bottomBar.appendChild(urlDisplay);
    bottomBar.appendChild(setButton);
    modal.appendChild(bottomBar);

    document.body.appendChild(modal);

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

      // Generate initial Street View URL and enable set button immediately
      const generateStreetViewURL = (position, pov) => {
        const lat = position.lat();
        const lng = position.lng();
        return `https://www.google.com/maps/@${lat},${lng},3a,75y,${pov.heading}h,${pov.pitch}t/data=!3m6!1e1!3m4!1s${panorama.getLocation()?.pano || 'unknown'}!2e0!7i16384!8i8192`;
      };

      // Set initial URL and enable button
      setTimeout(() => {
        if (initialStreetViewUrl) {
          currentStreetViewUrl = initialStreetViewUrl;
          urlDisplay.textContent = currentStreetViewUrl;
          setButton.disabled = false;
          setButton.style.opacity = '1';
        } else if (panorama.getLocation()) {
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
            const heading = google.maps.geometry.spherical.computeHeading(data.location.latLng, clickedLocation);
            panorama.setPov({ heading: heading, pitch: 0 });

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
          
          // Find and fill the input field
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
            streetViewInput.value = '';
            streetViewInput.dispatchEvent(new Event('input', { bubbles: true }));
            streetViewInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          // Copy to clipboard and show feedback
          navigator.clipboard.writeText(currentStreetViewUrl).then(() => {
            createBubble('Copied to clipboard!');
            console.log('Street View URL copied to clipboard:', currentStreetViewUrl);
          }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            createBubble('Street View URL Set!');
          });

          // Auto-click OK button when user clicks it
          document.addEventListener('click', function autoClickHandler(e) {
            const okButton = e.target.closest('button.Button-primary');
            if (okButton && okButton.textContent.trim() === 'OK') {
              console.log('OK button clicked, setting up auto-clickers');
              
              // Remove this listener since we only want it once
              document.removeEventListener('click', autoClickHandler);
              
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
                    anyYesButton.click();
                    createBubble('YES Clicked!');
                  }
                }
                
                // Click "Go to Next Section" after YES
                setTimeout(() => {
                  console.log('=== AUTO-CLICKING GO TO NEXT SECTION ===');
                  
                  const nextButtonSelectors = [
                    'button.Button.mt-4.Button-primary.Button-fluid',
                    'button.Button-primary.Button-fluid'
                  ];

                  let nextButton = null;
                  for (const selector of nextButtonSelectors) {
                    nextButton = document.querySelector(selector);
                    if (nextButton) {
                      const text = nextButton.textContent.trim().toUpperCase();
                      if (text.includes('NEXT') || text.includes('GO TO') || text.includes('CONTINUE')) {
                        break;
                      }
                      nextButton = null;
                    }
                  }

                  if (nextButton) {
                    console.log('Clicking Go to Next Section button');
                    nextButton.click();
                    createBubble('Go to Next Section Clicked!');
                  } else {
                    const allButtons = document.querySelectorAll('button, a');
                    for (const btn of allButtons) {
                      const text = btn.textContent.trim().toLowerCase();
                      if (text.includes('go to next') || text.includes('next section') || text.includes('continue')) {
                        console.log('Clicking next button (fallback):', text);
                        btn.click();
                        createBubble('Next Button Found!');
                        break;
                      }
                    }
                  }
                }, 1500); // Wait 1.5s after YES
              }, 1000); // Wait 1s after OK
            }
          }, { once: false }); // Keep listening until OK is clicked

          modal.remove();
        }
      };

    });
  }

  window.createStreetViewPicker = createStreetViewPicker;
})();
