
// chrome.storage.local.get(["greenMode", "gayMode"], (data) => {
//   const isGreen = data.greenMode;
//   const isGay = data.gayMode;

//   if (!isGreen && !isGay) return;

//   const style = document.createElement("style");
//   style.type = "text/css";

//   const primary = isGay ? 'hotpink' : '#3ba832';
//   const gradient = `linear-gradient(270deg, red, orange, yellow, green, blue, indigo, violet)`;

//   style.textContent += `
//     :root {
//       --primary: ${primary} !important;
//       --info: ${primary} !important;
//       --blue: ${primary} !important;
//     }

//     ${isGay ? `
//       @keyframes rainbowShift {
//         0% { background-position: 0% 50%; }
//         50% { background-position: 100% 50%; }
//         100% { background-position: 0% 50%; }
//       }
//     ` : ''}

//     /* GoGetta buttons + new additions */
//     .Button-primary,
//     .ProgressBarValue,
//     input[type="submit"].Button-primary,
//     .categoryButton,
//     .Button.mt-3,
//     .Option,
//     .Option-active {
//     ${isGay
//       ? `
//         background: ${gradient} !important;
//         background-size: 400% 400%;
//         animation: rainbowShift 6s ease infinite;
//       `
//       : `
//         background-color: ${primary} !important;
//       `
//     }
//     color: white !important;
//     border-color: ${primary} !important;
//   }


//     /* Text & borders on GoGetta */
//     .text-info,
//     .text-blue,
//     .hover\\:text-blue-600,
//     .bg-blue,
//     .border-blue-500 {
//       ${isGay
//         ? `background: ${gradient} !important;`
//         : `background-color: ${primary} !important;`
//       }
//       color: white !important;
//       border-color: ${primary} !important;
//     }


//     /* Optional: improve text inside buttons with .Option class */
//     .Option div {
//       color: white !important;
//     }
      
//   `;

//   document.head.appendChild(style);
// });

function applyRecolor(data) {
  const isGreen = data.greenMode;
  const isGay = data.gayMode;

  const existing = document.getElementById('recolor-style');
  if (existing) existing.remove();

  if (!isGreen && !isGay) return;

  const style = document.createElement("style");
  style.id = 'recolor-style';
  style.type = "text/css";

  const replacementColor = isGay ? 'hotpink' : '#3ba832';
  const gradient = `linear-gradient(270deg, red, orange, yellow, green, blue, indigo, violet)`;

  style.textContent += `
    :root {
      --primary: ${replacementColor} !important;
      --info: ${replacementColor} !important;
      --blue: ${replacementColor} !important;
    }

    ${isGay ? `
      @keyframes rainbowShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
    ` : ''}

    .Button-primary,
    .ProgressBarValue,
    input[type="submit"].Button-primary,
    .categoryButton,
    .Button.mt-3,
    .Option,
    .Option-active {
      ${isGay
        ? `
          background: ${gradient} !important;
          background-size: 400% 400%;
          animation: rainbowShift 6s ease infinite;
        `
        : `
          background-color: ${replacementColor} !important;
        `}
      color: white !important;
      border-color: ${replacementColor} !important;
    }

    .text-info,
    .text-blue,
    .hover\\:text-blue-600,
    .bg-blue,
    .border-blue-500 {
      ${isGay
        ? `background: ${gradient} !important;`
        : `background-color: ${replacementColor} !important;`
      }
      color: white !important;
      border-color: ${replacementColor} !important;
    }

    .Option div {
      color: white !important;
    }

    /* 🟨 Amber background overrides */
    [class*="amber"],
    .bg-amber-300,
    [class*="bg-yellow-300"],
    [style*="#FFD54F"],
    [style*="#FFDC00"] {
      ${isGay
        ? `
          background: ${gradient} !important;
          background-size: 400% 400%;
          animation: rainbowShift 6s ease infinite;
        `
        : `
          background-color: ${replacementColor} !important;
        `}
      color: white !important;
      border-color: ${replacementColor} !important;
    }

    /* 🎨 SVG stroke overrides */
    svg [stroke="#FFD54F"],
    svg [stroke="#FFDC00"],
    svg [stroke="white"],
    svg [stroke="black"] {
      stroke: ${replacementColor} !important;
    }

    /* 🎨 SVG fill overrides */
    svg [fill="#FFD54F"],
    svg [fill="#FFDC00"],
    svg [fill="white"],
    svg [fill="black"] {
      fill: ${replacementColor} !important;
    }
  `;

  document.head.appendChild(style);
}

chrome.storage.local.get(["greenMode", "gayMode"], applyRecolor);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.greenMode || changes.gayMode)) {
    chrome.storage.local.get(["greenMode", "gayMode"], applyRecolor);
  }
});


chrome.storage.local.get(["greenMode", "gayMode"], applyRecolor);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.greenMode || changes.gayMode)) {
    chrome.storage.local.get(["greenMode", "gayMode"], applyRecolor);
  }
});

chrome.storage.local.get(["greenMode", "gayMode"], applyRecolor);

// 🔄 Respond to popup changes in real-time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.greenMode || changes.gayMode)) {
    chrome.storage.local.get(["greenMode", "gayMode"], applyRecolor);
  }
});