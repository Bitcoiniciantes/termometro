window.BI_CONFIG = window.BI_CONFIG || {
  api: {
    fearGreed: 'https://api.alternative.me/fng/?limit=31&format=json'
  }
};
window.BI = window.BI || {
  fetchJSON: async function (url, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 8000;
    var retries = opts.retries != null ? opts.retries : 1;
    for (var attempt = 0; attempt <= retries; attempt++) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeout);
      try {
        var response = await fetch(url, { signal: controller.signal, headers: opts.headers });
        clearTimeout(timer);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      } catch (error) {
        clearTimeout(timer);
        if (attempt === retries) throw error;
        await new Promise(function (resolve) { setTimeout(resolve, 600 * (attempt + 1)); });
      }
    }
  }
};
