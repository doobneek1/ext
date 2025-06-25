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
    const targetUrl = "https://yourpeer.nyc/locations?sortBy=recentlyUpdated";
    window.location.href = targetUrl;

    const intervalTime = 300;
    const timeout = 10000;
    const start = Date.now();

    const findAndRedirect = setInterval(() => {
      const spanParent = document.querySelector("div.flex.items-center.justify-between > div.text-dark.font-medium");
      if (spanParent) {
        const spans = spanParent.querySelectorAll("span");
        if (spans.length === 3) {
          const totalPagesText = spans[2].textContent.trim();
          const totalPages = parseInt(totalPagesText, 10);
          if (!isNaN(totalPages)) {
            clearInterval(findAndRedirect);
            const lastPageUrl = `https://yourpeer.nyc/locations?sortBy=recentlyUpdated&page=${totalPages}`;
            window.location.href = lastPageUrl;
          }
        }
      }

      if (Date.now() - start > timeout) {
        clearInterval(findAndRedirect);
        console.warn("⏳ Timeout: pagination not found in time.");
      }
    }, intervalTime);
  };

  document.body.appendChild(btn);
})();
