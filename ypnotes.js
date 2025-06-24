(async function showReadOnlyNoteOverlay() {
  const NOTE_API = "https://us-central1-your-project-id.cloudfunctions.net/locationNote";

  function createDraggableNote(text) {
    const note = document.createElement("div");
    note.id = "yp-note-overlay";
    note.textContent = text || "(No notes available)";
    Object.assign(note.style, {
      position: "fixed",
      top: "100px",
      right: "20px",
      width: "300px",
      height: "150px",
      background: "#fff",
      border: "2px solid #000",
      borderRadius: "8px",
      padding: "10px",
      fontSize: "14px",
      overflowY: "auto",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      zIndex: 9999,
      cursor: "move",
      userSelect: "text",
      whiteSpace: "pre-wrap"
    });

    let offsetX = 0, offsetY = 0, isDragging = false;

    note.addEventListener("mousedown", (e) => {
      isDragging = true;
      offsetX = e.clientX - note.getBoundingClientRect().left;
      offsetY = e.clientY - note.getBoundingClientRect().top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      note.style.left = `${e.clientX - offsetX}px`;
      note.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });

    document.body.appendChild(note);
  }

  function getSlug() {
    const match = window.location.pathname.match(/^\/locations\/([^\/#?]+)/);
    return match ? match[1] : null;
  }

  async function getUUIDFromSlug(slug) {
    try {
      const res = await fetch(`https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations-by-slug/${slug}`);
      const json = await res.json();
      return json?.id || null;
    } catch (err) {
      console.error("❌ Failed to fetch UUID from slug:", err);
      return null;
    }
  }

  const slug = getSlug();
  if (!slug) return;

  const uuid = await getUUIDFromSlug(slug);
  if (!uuid) return;

  try {
    const res = await fetch(`${NOTE_API}?uuid=${uuid}`);
    const data = await res.json();
    const noteText = typeof data.note === "string" ? data.note.trim() : "";
    createDraggableNote(noteText);
  } catch (err) {
    console.error("❌ Failed to fetch note:", err);
  }
})();
