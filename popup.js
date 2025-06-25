document.addEventListener("DOMContentLoaded", async () => {
  const FIREBASE_URL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes.json";
  const allReminders = [];

async function fetchAndRenderReminders() {
  const res = await fetch(FIREBASE_URL);
  const data = await res.json();

  allReminders.length = 0; // Clear if rerunning
  for (const uuid in data) {
    const locationData = data[uuid];
    if (locationData.reminder) {
      for (const date in locationData.reminder) {
        allReminders.push({
          uuid,
          date,
          note: locationData.reminder[date]
        });
      }
    }
  }

  allReminders.sort((a, b) => a.date.localeCompare(b.date));

  renderReminderList(allReminders);
  updateExtensionBadge(allReminders);

  // ✅ NOW attach the clear button
  const clearBtn = document.getElementById("clearReminderFilter");
  clearBtn?.addEventListener("click", () => renderReminderList(allReminders));
}


function renderReminderList(remindersToShow, filtered = false) {
  const list = document.getElementById("reminderList");
  const clearBtn = document.getElementById("clearReminderFilter");

  list.innerHTML = "";
  const today = new Date().toISOString().split("T")[0];

  for (const r of remindersToShow) {
    const dateText = r.date === today ? "Today" : r.date;
    const li = document.createElement("li");
    li.innerHTML = `<a href="https://gogetta.nyc/team/location/${r.uuid}" target="_blank">${dateText}</a>: ${r.note}`;
    list.appendChild(li);
  }

  // Toggle "Show All" button
  clearBtn.style.display = filtered ? "block" : "none";
}

document.getElementById("clearReminderFilter").addEventListener("click", () => {
  renderReminderList(allReminders);
});

function updateExtensionBadge(reminders) {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = reminders.filter(r => r.date >= today);
  const count = upcoming.length;

  chrome.runtime.sendMessage({ type: "setBadge", count });
}
  const redirect = document.getElementById("redirectToggle");
  const recolorToggle = document.getElementById("recolorToggle");
  const greenMode = document.getElementById("greenModeToggle");
  const gayMode = document.getElementById("gayModeToggle");
  const recolorOptions = document.getElementById("recolorOptions");
  const userNameSection = document.getElementById("userNameSection");
  const userNameInput = document.getElementById("userNameInput");
  const userNameStatus = document.getElementById("userNameStatus");
  userNameSection.style.display = "none";
  const { redirectEnabled, greenMode: gm, gayMode: ym } = await chrome.storage.local.get([
    "redirectEnabled", "greenMode", "gayMode"
  ]);
  redirect.checked = redirectEnabled || false;
  const isAnyRecolor = gm || ym;
  recolorToggle.checked = isAnyRecolor;
  recolorOptions.style.display = isAnyRecolor ? "flex" : "none";
  greenMode.checked = !!gm;
  gayMode.checked = !!ym;
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
const calendarInput = document.getElementById("reminderCalendar");
if (calendarInput) {
  calendarInput.addEventListener("change", (e) => {
    const selected = e.target.value;
    const filtered = allReminders.filter(r => r.date === selected);
    renderReminderList(filtered);
  });
}


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
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes("gogetta.nyc/team")) return;
    userNameSection.style.display = "block";
    const { userName } = await chrome.storage.local.get("userName");
    if (userName) userNameInput.value = userName;
    let saveTimeout = null;


  
const saveUserName = () => {
  const newUserName = userNameInput.value.trim();
  const reservedNames = ["reminder"]; // Add more if needed

  if (!newUserName) {
    chrome.storage.local.remove("userName");
    userNameStatus.textContent = "Username cleared.";
    chrome.tabs.sendMessage(tab.id, { type: "userNameUpdated", userName: null }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[popup.js] ⚠️ Message failed:", chrome.runtime.lastError.message);
      } else {
        console.log("[popup.js] ✅ Message acknowledged:", response);
      }
    });
  } else if (reservedNames.includes(newUserName.toLowerCase())) {
    userNameStatus.textContent = `"${newUserName}" is a reserved name. Please choose another.`;
    return; // ⛔ Do not save or send message
  } else {
    chrome.storage.local.set({ userName: newUserName });
    userNameStatus.textContent = "Username saved!";
    chrome.tabs.sendMessage(tab.id, { type: "userNameUpdated", userName: newUserName }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[popup.js] ⚠️ Message failed:", chrome.runtime.lastError.message);
      } else {
        console.log("[popup.js] ✅ Message acknowledged:", response);
      }
    });
  }

  setTimeout(() => {
    userNameStatus.textContent = "";
  }, 2000);
};

    userNameInput.addEventListener("keyup", () => {
      clearTimeout(saveTimeout);
      userNameStatus.textContent = "Typing...";
      saveTimeout = setTimeout(saveUserName, 1000);
    });
    userNameInput.addEventListener("blur", () => {
      clearTimeout(saveTimeout);
      saveUserName();
    });
window.addEventListener("beforeunload", () => {
  const newUserName = userNameInput.value.trim();
  chrome.storage.local.get("userName", ({ userName: storedName }) => {
    if (storedName !== newUserName) {
      chrome.storage.local.set({ userName: newUserName });
    }
  });
});
  });
await fetchAndRenderReminders(); // ⬅️ Call the function!


});



