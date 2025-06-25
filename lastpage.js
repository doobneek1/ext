(function addLastPageButton() {
  const isValidPage = location.hostname.includes("yourpeer.nyc") || location.hostname.includes("gogetta.nyc");
  if (!isValidPage) return;
  if (document.getElementById("yp-last-page-button")) return;

  const btn = document.createElement("button");
  btn.id = "yp-last-page-button";
  btn.textContent = "Most outdated page";
  Object.assign(btn.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    zIndex: "999999",
    padding: "8px 12px",
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    fontSize: "13px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
  });

  btn.onclick = () => {
    const targetUrl = "https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=70";
    window.location.href = targetUrl;

    const timeout = 10000; // 10 seconds timeout for the observer

    const observer = new MutationObserver((mutationsList, obs) => {
      const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
      if (spanParent) {
        const spans = spanParent.querySelectorAll("span");
        if (spans.length === 3) {
          const totalPagesText = spans[2].textContent.trim();
          console.log(`Found total pages text: "${totalPagesText}"`); // Logging
          const totalPages = parseInt(totalPagesText, 10);
          if (!isNaN(totalPages)) {
            console.log(`Parsed total pages: ${totalPages}`); // Logging
            obs.disconnect(); // Stop observing
            clearTimeout(observerTimeout); // Clear the timeout
            const lastPageUrl = `https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
            window.location.href = lastPageUrl;
          } else {
            console.warn("Could not parse total pages from text:", totalPagesText); // Logging
          }
        } else {
          // console.log("Found spanParent, but it does not contain 3 spans. Found:", spans.length); // Logging - can be verbose
        }
      } else {
        // console.log("spanParent not found yet."); // Logging - can be very verbose
      }
    });

    // Start observing the document body for added nodes and subtree changes
    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout for the observer
    const observerTimeout = setTimeout(() => {
      observer.disconnect();
      console.warn("⏳ Timeout: MutationObserver did not find pagination element in time.");
    }, timeout);
  };

  document.body.appendChild(btn);
})();
