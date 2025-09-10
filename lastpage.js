(function combinedOutdatedButtons() {
  const host = location.hostname;
  const isYourPeer = host === "test.yourpeer.nyc";
  const isGoGetta = host === "www.gogetta.nyc" || host === "gogetta.nyc";
  const path = location.pathname;
  const url = new URL(window.location.href);
  const sortBy = url.searchParams.get("sortBy");

  // ✅ YP Buttons (only on test.yourpeer.nyc/locations?sortBy=recentlyUpdated)
  if (isYourPeer && path === "/locations" && sortBy === "recentlyUpdated") {
    const currentPage = parseInt(url.searchParams.get("page") || "1", 10);

    const createButton = (id, text, onClick, topOffset) => {
      if (document.getElementById(id)) return;
      const btn = document.createElement("button");
      btn.id = id;
      btn.textContent = text;
      Object.assign(btn.style, {
        position: "fixed",
        top: `${topOffset}px`,
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
      btn.onclick = onClick;
      document.body.appendChild(btn);
    };

    createButton("more-outdated", "More outdated", () => {
      url.searchParams.set("page", (currentPage + 1).toString());
      window.location.href = url.toString();
    }, 10);

    if (currentPage > 1) {
      createButton("less-outdated", "Less outdated", () => {
        if (currentPage === 2) {
          url.searchParams.delete("page");
        } else {
          url.searchParams.set("page", (currentPage - 1).toString());
        }
        window.location.href = url.toString();
      }, 50);
    }
  }

  // ✅ "Most outdated page" button (only on gogetta)
  if (isGoGetta && !document.getElementById("yp-last-page-button")) {
    const btn = document.createElement("button");
    btn.id = "yp-last-page-button";
    btn.textContent = "Most outdated page";
    Object.assign(btn.style, {
      position: "fixed",
      top: "40px",
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
      const preloadUrl = "https://test.yourpeer.nyc/locations?sortBy=recentlyUpdated&page=70";
      window.location.href = preloadUrl;

      const timeout = 10000;
      const observer = new MutationObserver((mutationsList, obs) => {
        const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
        if (spanParent) {
          const spans = spanParent.querySelectorAll("span");
          if (spans.length === 3) {
            const totalPagesText = spans[2].textContent.trim();
            const totalPages = parseInt(totalPagesText, 10);
            if (!isNaN(totalPages)) {
              obs.disconnect();
              clearTimeout(observerTimeout);
              const finalUrl = `https://test.yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
              if (window.location.href !== finalUrl) {
                window.location.href = finalUrl;
              }
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      const observerTimeout = setTimeout(() => {
        observer.disconnect();
        console.warn("⏳ Timeout: Did not find pagination element.");
      }, timeout);
    };

    document.body.appendChild(btn);
  }
})();
