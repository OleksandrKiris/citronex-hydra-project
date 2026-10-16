import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(process.env.HYDRA_SW_SOURCE || new URL("../sw.js", import.meta.url), "utf8");
const origin = "https://oleksandrkiris.github.io";
const root = `${origin}/citronex-hydra-project/`;

function harness({ network = async () => new Response("network"), cached = null } = {}) {
  const handlers = {};
  const calls = [];
  const writes = [];
  const matches = [];
  const timers = [];
  const clearedTimers = [];
  const delays = [];
  const added = [];
  const deleted = [];
  let currentCache;
  const cache = {
    match: async (request, options) => {
      matches.push({ request, options });
      return cached?.(request, options);
    },
    put: async (request, response) => writes.push({ request, body: await response.text() }),
    add: async (request) => {
      added.push(request);
      if (request.url.endsWith("primserv-icon-512.png")) throw new Error("optional icon unavailable");
    }
  };
  const caches = {
    open: async () => cache,
    match: async (request, options) => cached?.(request, options),
    keys: async () => ["unrelated-cache", "citronex-hydra-srzb-old", currentCache],
    delete: async (key) => deleted.push(key)
  };
  // Request resolves the worker's relative install URLs, like the browser does.
  class WorkerRequest extends Request {
    constructor(url, init) { super(new URL(url, root), init); }
  }
  const context = vm.createContext({
    self: {
      location: { origin },
      addEventListener: (name, listener) => { handlers[name] = listener; },
      skipWaiting: async () => calls.push("skipWaiting"),
      clients: { claim: async () => calls.push("claim") }
    },
    caches, URL, Request: WorkerRequest, Response,
    fetch: (request, options) => { calls.push({ request, options }); return network(request, options); },
    setTimeout: (callback, delay) => { delays.push(delay); return timers.push(callback); },
    clearTimeout: (id) => { clearedTimers.push(id); }
  });
  vm.runInContext(source, context);
  currentCache = vm.runInContext("CACHE_NAME", context);
  return {
    calls, writes, matches, timers, clearedTimers, delays, added, deleted,
    request({ path = "assets/icon.png", method = "GET", mode = "cors", accept = "image/png" } = {}) {
      const request = { url: new URL(path, root).href, method, mode, headers: new Headers({ accept }) };
      let result;
      handlers.fetch({ request, respondWith: (promise) => { result = promise; } });
      return { request, result };
    },
    async lifecycle(name) {
      let result;
      handlers[name]({ waitUntil: (promise) => { result = promise; } });
      await result;
    }
  };
}

test("non-GET and cross-origin requests remain outside worker handling", () => {
  const h = harness();
  assert.equal(h.request({ method: "POST" }).result, undefined);
  assert.equal(h.request({ path: "https://www.primserv.pl/" }).result, undefined);
  assert.equal(h.calls.length, 0);
});

for (const html of [{ mode: "navigate", accept: "*/*" }, { mode: "cors", accept: "text/html,application/xhtml+xml" }]) {
  const label = html.mode === "navigate" ? "navigation" : "HTML Accept";
  test(`${label}: online response is refreshed and cached`, async () => {
    const h = harness();
    const { result } = h.request(html);
    assert.equal(await (await result).text(), "network");
    assert.equal(h.calls[0].options.cache, "no-store");
    assert.equal(h.writes.length, 1);
  });
  test(`${label}: offline exact cache preserves language URL matching`, async () => {
    const h = harness({ network: async () => { throw new Error("offline"); }, cached: (r) => typeof r !== "string" ? new Response("cached page") : undefined });
    assert.equal(await (await h.request({ ...html, path: "?lang=ua" }).result).text(), "cached page");
    assert.equal(h.matches[0].options.ignoreSearch, true);
  });
  test(`${label}: offline fallback still serves index.html`, async () => {
    const h = harness({ network: async () => { throw new Error("offline"); }, cached: (r) => r === "./index.html" ? new Response("shell") : undefined });
    assert.equal(await (await h.request(html).result).text(), "shell");
  });
}

test("failed HTML response is returned, not cached", async () => {
  const h = harness({ network: async () => new Response("unavailable", { status: 503 }) });
  assert.equal((await h.request({ mode: "navigate" }).result).status, 503);
  assert.equal(h.writes.length, 0);
});

test("offline navigation without any shell returns a network error", async () => {
  const h = harness({ network: async () => { throw new Error("offline"); } });
  assert.equal((await h.request({ mode: "navigate" }).result).type, "error");
});

test("audio streams are fetched directly and do not enter generic asset caching", async () => {
  const h = harness();
  assert.equal(await (await h.request({ path: "assets/audio/intro-ua.mp3" }).result).text(), "network");
  assert.equal(h.writes.length, 0);
  assert.equal(h.matches.length, 0);
  assert.equal(h.timers.length, 0);
});

test("offline audio retains its existing exact-cache fallback", async () => {
  const h = harness({ network: async () => { throw new Error("offline"); }, cached: () => new Response("cached audio") });
  assert.equal(await (await h.request({ path: "assets/audio/intro-en.mp3" }).result).text(), "cached audio");
});

test("cached assets are returned and refreshed in the background", async () => {
  const h = harness({ cached: () => new Response("cached asset") });
  assert.equal(await (await h.request().result).text(), "cached asset");
  await new Promise(setImmediate);
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes[0].body, "network");
});

test("uncached assets use and cache a successful response", async () => {
  const h = harness();
  assert.equal(await (await h.request().result).text(), "network");
  assert.equal(h.writes.length, 1);
});

for (const status of [200, 404, 503]) {
  test(`settled asset HTTP ${status} clears the now-unused timeout`, async () => {
    const h = harness({ network: async () => new Response("result", { status }) });
    const response = await h.request().result;
    assert.equal(response.status, status);
    assert.deepEqual(h.delays, [1400]);
    assert.deepEqual(h.clearedTimers, [1]);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options, undefined, "No new request options, signal, or cancellation");
  });
}

test("rejected asset network request clears its timeout and retains the error fallback", async () => {
  const h = harness({ network: async () => { throw new Error("offline"); } });
  assert.equal((await h.request().result).type, "error");
  assert.deepEqual(h.clearedTimers, [1]);
  assert.equal(h.writes.length, 0);
});

test("timeout expiry still returns the existing cache result without aborting a late network response", async () => {
  let complete, timedOut = false;
  const h = harness({
    network: () => new Promise(resolve => { complete = resolve; }),
    cached: () => timedOut ? new Response("appeared while waiting") : undefined
  });
  const { result } = h.request();
  await new Promise(setImmediate);
  assert.equal(h.timers.length, 1);
  assert.equal(h.clearedTimers.length, 0);
  timedOut = true;
  h.timers[0]();
  assert.equal(await (await result).text(), "appeared while waiting");
  assert.deepEqual(h.clearedTimers, [1]);
  complete(new Response("late"));
  await new Promise(setImmediate);
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes.length, 0, "Late response policy is unchanged");
});

test("HTML, audio and already-cached assets never allocate an asset timeout", async () => {
  for (const request of [{ mode: "navigate" }, { path: "assets/audio/intro-pl.mp3" }, { path: "assets/icon.png" }]) {
    const h = harness({ cached: () => new Response("cached") });
    await h.request(request).result;
    assert.equal(h.timers.length, 0);
    assert.equal(h.clearedTimers.length, 0);
  }
});

test("concurrent asset requests clear only their own timeout", async () => {
  const pending = [];
  const h = harness({ network: () => new Promise(resolve => pending.push(resolve)) });
  const first = h.request({ path: "assets/first.png" }).result;
  const second = h.request({ path: "assets/second.png" }).result;
  await new Promise(setImmediate);
  assert.equal(h.timers.length, 2);
  pending[0](new Response("first"));
  assert.equal(await (await first).text(), "first");
  assert.deepEqual(h.clearedTimers, [1]);
  h.timers[1]();
  assert.equal((await second).type, "error");
  assert.deepEqual(h.clearedTimers, [1, 2]);
  pending[1](new Response("late second"));
  await new Promise(setImmediate);
  assert.equal(h.writes.length, 1);
});

test("failed asset responses are returned without caching", async () => {
  const h = harness({ network: async () => new Response("missing", { status: 404 }) });
  assert.equal((await h.request().result).status, 404);
  assert.equal(h.writes.length, 0);
});

for (const failure of ["offline", "timeout"]) {
  test(`asset ${failure} never receives an HTML shell fallback`, async () => {
    const h = harness({
      network: () => failure === "offline" ? Promise.reject(new Error("offline")) : new Promise(() => {}),
      cached: (r) => r === "./index.html" ? new Response("shell") : undefined
    });
    const { result } = h.request();
    if (failure === "timeout") {
      await new Promise(setImmediate);
      h.timers.forEach((callback) => callback());
    }
    assert.equal((await result).type, "error");
    assert.equal(h.matches.some(({ request }) => request === "./index.html"), false);
  });
}

test("installation tolerates optional asset failure and activates", async () => {
  const h = harness();
  await h.lifecycle("install");
  assert.equal(h.added.length, 6);
  assert.ok(h.added.every((r) => r.cache === "reload"));
  assert.ok(h.calls.includes("skipWaiting"));
});

test("activation retains the current and unrelated caches", async () => {
  const h = harness();
  await h.lifecycle("activate");
  assert.deepEqual(h.deleted, ["citronex-hydra-srzb-old"]);
  assert.ok(h.calls.includes("claim"));
});
