// document.addEventListener("DOMContentLoaded", () => {
//   const redirect = document.getElementById("redirectToggle");
//   const recolorToggle = document.getElementById("recolorToggle");
//   const greenMode = document.getElementById("greenModeToggle");
//   const gayMode = document.getElementById("gayModeToggle");
//   const recolorOptions = document.getElementById("recolorOptions");

//   chrome.storage.local.get(["redirectEnabled", "greenMode", "gayMode"], (data) => {
//     redirect.checked = data.redirectEnabled || false;

//     const isAnyRecolor = data.greenMode || data.gayMode;
//     recolorToggle.checked = isAnyRecolor;
//     recolorOptions.style.display = isAnyRecolor ? "flex" : "none";
//     greenMode.checked = !!data.greenMode;
//     gayMode.checked = !!data.gayMode;
//   });

//   redirect.addEventListener("change", () => {
//     chrome.storage.local.set({ redirectEnabled: redirect.checked });
//   });

//   recolorToggle.addEventListener("change", () => {
//     if (!recolorToggle.checked) {
//       recolorOptions.style.display = "none";
//       greenMode.checked = false;
//       gayMode.checked = false;
//       chrome.storage.local.set({ greenMode: false, gayMode: false });
//     } else {
//       recolorOptions.style.display = "flex";
//       chrome.storage.local.get(["greenMode", "gayMode"], (data) => {
//         if (!data.greenMode && !data.gayMode) {
//           greenMode.checked = true;
//           chrome.storage.local.set({ greenMode: true, gayMode: false });
//         }
//       });
//     }
//   });

//  greenMode.addEventListener("change", () => {
//   if (greenMode.checked) {
//     gayMode.checked = false;
//     chrome.storage.local.set({ greenMode: true, gayMode: false });
//   } else {
//     chrome.storage.local.set({ greenMode: false });
//   }
// });

// gayMode.addEventListener("change", () => {
//   if (gayMode.checked) {
//     greenMode.checked = false;
//     chrome.storage.local.set({ greenMode: false, gayMode: true });
//   } else {
//     chrome.storage.local.set({ gayMode: false });
//   }
// });

// });
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

  // Username handling
  const userNameInput = document.getElementById("userNameInput");
  const userNameStatus = document.getElementById("userNameStatus");
  let saveTimeout = null;

  // Load username from localStorage
  const savedUserName = localStorage.getItem("userName");
  if (savedUserName) {
    userNameInput.value = savedUserName;
  }

  const saveUserName = () => {
    const newUserName = userNameInput.value.trim();
    if (newUserName) {
      localStorage.setItem("userName", newUserName);
      userNameStatus.textContent = "Username saved!";
      setTimeout(() => {
        userNameStatus.textContent = "";
      }, 2000);
    } else {
      // If user clears the name, remove it from storage
      localStorage.removeItem("userName");
      userNameStatus.textContent = "Username cleared.";
       setTimeout(() => {
        userNameStatus.textContent = "";
      }, 2000);
    }
  };

  userNameInput.addEventListener("keyup", () => {
    clearTimeout(saveTimeout);
    userNameStatus.textContent = "Typing...";
    saveTimeout = setTimeout(() => {
      saveUserName();
    }, 1000); // Save 1 second after user stops typing
  });

  userNameInput.addEventListener("blur", () => {
    clearTimeout(saveTimeout); // Clear any pending keyup save
    saveUserName(); // Save immediately on blur
  });
  
  // Also save when popup closes (though blur should generally cover it)
  window.addEventListener("unload", () => {
    // Make sure any pending input is captured if user closes popup quickly
    // However, direct saving here can be unreliable in some browsers for `unload`.
    // The blur event is generally more reliable for this.
    // If there's a value different from what's saved, try one last save.
    if (localStorage.getItem("userName") !== userNameInput.value.trim() && userNameInput.value.trim()) {
        saveUserName();
    } else if (!userNameInput.value.trim() && localStorage.getItem("userName")) {
        saveUserName(); // Handles clearing the name and then closing
    }
});

});
