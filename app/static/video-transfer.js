// The current recording survives navigation and refresh within this tab.
// Only the File is in IndexedDB. The API key stays in sessionStorage.
window.VideoTransfer = (() => {
  const slot = "fortebank-current-video", legacySlot = "fortebank-pending-video";
  const ttl = 60 * 60 * 1000;
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("fortebank-video-transfer", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function cleanup(files) {
    const cursor = files.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if (item.value.expires < Date.now()) item.delete();
      item.continue();
    };
  }
  async function save(file) {
    const db = await database(), id = crypto.randomUUID();
    const previous = sessionStorage.getItem(slot) || sessionStorage.getItem(legacySlot);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite"), files = tx.objectStore("files");
        cleanup(files);
        if (previous) files.delete(previous);
        files.put({ file, expires: Date.now() + ttl }, id);
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
      sessionStorage.setItem(slot, id);
      sessionStorage.removeItem(legacySlot);
      sessionStorage.removeItem("fortebank-review-job");
      return id;
    } finally { db.close(); }
  }
  async function load() {
    const legacy = sessionStorage.getItem(legacySlot);
    const id = sessionStorage.getItem(slot) || legacy;
    const db = await database();
    try {
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite"), files = tx.objectStore("files");
        cleanup(files);
        let value = null;
        if (id) {
          const request = files.get(id);
          request.onsuccess = () => {
            if (request.result?.expires > Date.now()) {
              value = { id, file: request.result.file };
              files.put({ file: value.file, expires: Date.now() + ttl }, id);
            }
          };
        }
        tx.oncomplete = () => resolve(value);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
      if (result) {
        sessionStorage.setItem(slot, id);
        if (legacy) sessionStorage.setItem("fortebank-craft-ready", id);
      } else {
        sessionStorage.removeItem(slot);
        sessionStorage.removeItem("fortebank-craft-ready");
      }
      sessionStorage.removeItem(legacySlot);
      return result;
    } finally { db.close(); }
  }
  return { save, load };
})();
