// listener.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "userNameUpdated") {
        window.currentUserName = message.userName;
    sendResponse({ received: true });
  }
});
