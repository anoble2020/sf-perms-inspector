// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchFieldPermissions') {
    handleFetchFieldPermissions(request, sendResponse);
    // Indicate async response
    return true;
  }
  if (request.action === 'getSessionId') {
    // Get the sid cookie for the my.salesforce.com domain
    const url = `https://${request.domain}`;
    chrome.cookies.get({ url, name: 'sid' }, (cookie) => {
      if (cookie && cookie.value) {
        sendResponse({ sessionId: cookie.value, domain: request.domain });
      } else {
        sendResponse({ error: 'Session ID not found' });
      }
    });
    return true;
  }
});

async function handleFetchFieldPermissions(request, sendResponse) {
  try {
    const { fieldInfo, apiVersion, serverUrl } = request;
    const domain = new URL(serverUrl).hostname;
    // Get the session ID from cookies
    chrome.cookies.get({ url: serverUrl, name: 'sid' }, async (cookie) => {
      console.log('Cookie object:', cookie);
      if (!cookie || !cookie.value) {
        sendResponse({ success: false, error: 'Session ID (sid) cookie not found' });
        return;
      }
      const sessionId = cookie.value;
      console.log('Using sessionId:', sessionId);
      const query = `
        SELECT Id, Field, PermissionsEdit, PermissionsRead, 
               Parent.Name, Parent.Type, Parent.Profile.Name
        FROM FieldPermissions 
        WHERE Field = '${fieldInfo.objectName}.${fieldInfo.fieldName}'
        ORDER BY Parent.Type, Parent.Name
      `;
      const apiUrl = `${serverUrl}/services/data/v${apiVersion}/query/?q=${encodeURIComponent(query)}`;
      console.log('API URL:', apiUrl);
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `OAuth ${sessionId}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        if (!response.ok) {
          sendResponse({ success: false, error: `API request failed: ${response.status}` });
          return;
        }
        const data = await response.json();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
} 