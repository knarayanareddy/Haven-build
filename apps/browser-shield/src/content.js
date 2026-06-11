(() => {
  const text = `${document.title} ${document.body?.innerText?.slice(0, 4000) ?? ''}`;
  const patterns = ['anydesk', 'teamviewer', 'gift card', 'cadeaukaart', 'bitcoin', 'urgent', 'pincode', 'digid'];
  const found = patterns.filter((pattern) => text.toLowerCase().includes(pattern));
  if (!found.length) return;
  chrome.runtime.sendMessage({ type: 'HAVEN_PAGE_RISK', url: location.href, page_title: document.title, visible_text: text, patterns: found });
})();
