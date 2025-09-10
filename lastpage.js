(function combinedOutdatedButtons() {
  const host = location.hostname;
  const isYourPeer = host === "yourpeer.nyc";
  const isGoGetta = host === "gogetta.nyc" || host === "gogetta.nyc";
  const path = location.pathname;
  const url = new URL(window.location.href);
  const sortBy = url.searchParams.get("sortBy");

  // ✅ YP Buttons (only on yourpeer.nyc/locations?sortBy=recentlyUpdated)
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
        left: "0px",
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

})();
