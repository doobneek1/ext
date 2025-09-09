// listener.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "userNameUpdated") {
    console.log("[listener.js] Updated username:", message.userName);
    window.currentUserName = message.userName;
    sendResponse({ received: true });
  }
});
