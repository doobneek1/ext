document.addEventListener("DOMContentLoaded", () => {
  const redirect = document.getElementById("redirectToggle");
  const recolorToggle = document.getElementById("recolorToggle");
  const greenMode = document.getElementById("greenModeToggle");
  const gayMode = document.getElementById("gayModeToggle");
  const recolorOptions = document.getElementById("recolorOptions");

  chrome.storage.local.get(["redirectEnabled", "greenMode", "gayMode"], (data) => {
    redirect.checked = data.redirectEnabled || false;

    const isAnyRecolor = data.greenMode || data.gayMode;
    recolorToggle.checked = isAnyRecolor;
    recolorOptions.style.display = isAnyRecolor ? "flex" : "none";
    greenMode.checked = !!data.greenMode;
    gayMode.checked = !!data.gayMode;
  });

  redirect.addEventListener("change", () => {
    chrome.storage.local.set({ redirectEnabled: redirect.checked });
  });

  recolorToggle.addEventListener("change", () => {
    if (!recolorToggle.checked) {
      recolorOptions.style.display = "none";
      greenMode.checked = false;
      gayMode.checked = false;
      chrome.storage.local.set({ greenMode: false, gayMode: false });
    } else {
      recolorOptions.style.display = "flex";
      chrome.storage.local.get(["greenMode", "gayMode"], (data) => {
        if (!data.greenMode && !data.gayMode) {
          greenMode.checked = true;
          chrome.storage.local.set({ greenMode: true, gayMode: false });
        }
      });
    }
  });

 greenMode.addEventListener("change", () => {
  if (greenMode.checked) {
    gayMode.checked = false;
    chrome.storage.local.set({ greenMode: true, gayMode: false });
  } else {
    chrome.storage.local.set({ greenMode: false });
  }
});

gayMode.addEventListener("change", () => {
  if (gayMode.checked) {
    greenMode.checked = false;
    chrome.storage.local.set({ greenMode: false, gayMode: true });
  } else {
    chrome.storage.local.set({ gayMode: false });
  }
});

});
