document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.instagram.com/' });
  window.close();
});

document.getElementById('toggle').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'igu_toggle' });
    window.close();
  } catch (e) {
    msg.textContent = 'Open instagram.com in this tab first (refresh it if you just installed the extension).';
  }
});
