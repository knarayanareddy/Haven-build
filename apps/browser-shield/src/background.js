chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'HAVEN_PAGE_RISK') return;
  chrome.storage.local.get(['havenSupabaseUrl', 'havenAccessToken', 'havenElderId']).then(async (config) => {
    if (!config.havenSupabaseUrl || !config.havenAccessToken || !config.havenElderId) return;
    await fetch(`${config.havenSupabaseUrl}/functions/v1/fn-browser-shield`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.havenAccessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ elder_id: config.havenElderId, url: message.url, page_title: message.page_title, visible_text: message.visible_text }),
    }).catch(() => undefined);
  });
});
