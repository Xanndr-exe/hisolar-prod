globalThis._importMeta_=globalThis._importMeta_||{url:"file:///_entry.js",env:process.env};import 'node-fetch-native/polyfill';
import { Server as Server$1 } from 'node:http';
import { Server } from 'node:https';
import destr from 'destr';
import { eventHandler, setHeaders, sendRedirect, defineEventHandler, handleCacheHeaders, createEvent, getRequestHeader, getRequestHeaders, setResponseHeader, createError, createApp, createRouter as createRouter$1, lazyEventHandler, toNodeListener } from 'h3';
import { createFetch as createFetch$1, Headers } from 'ofetch';
import { createCall, createFetch } from 'unenv/runtime/fetch/index';
import { createHooks } from 'hookable';
import { snakeCase } from 'scule';
import { hash } from 'ohash';
import { withoutBase, parseURL, withQuery, joinURL, withLeadingSlash, withoutTrailingSlash } from 'ufo';
import { createStorage } from 'unstorage';
import defu from 'defu';
import { toRouteMatcher, createRouter } from 'radix3';
import { promises } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

const _runtimeConfig = {"app":{"baseURL":"/","buildAssetsDir":"/_nuxt/","cdnURL":""},"nitro":{"envPrefix":"NUXT_","routeRules":{"/__nuxt_error":{"cache":false}}},"public":{},"API_URL":"http://localhost:1337"};
const ENV_PREFIX = "NITRO_";
const ENV_PREFIX_ALT = _runtimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_";
const getEnv = (key) => {
  const envKey = snakeCase(key).toUpperCase();
  return destr(
    process.env[ENV_PREFIX + envKey] ?? process.env[ENV_PREFIX_ALT + envKey]
  );
};
function isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function overrideConfig(obj, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey);
    if (isObject(obj[key])) {
      if (isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
      }
      overrideConfig(obj[key], subKey);
    } else {
      obj[key] = envValue ?? obj[key];
    }
  }
}
overrideConfig(_runtimeConfig);
const config$1 = deepFreeze(_runtimeConfig);
const useRuntimeConfig = () => config$1;
function deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

const _assets = {

};

function normalizeKey(key) {
  if (!key) {
    return "";
  }
  return key.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

const assets$1 = {
  getKeys() {
    return Promise.resolve(Object.keys(_assets))
  },
  hasItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(id in _assets)
  },
  getItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].import() : null)
  },
  getMeta (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].meta : {})
  }
};

const storage = createStorage({});

const useStorage = () => storage;

storage.mount('/assets', assets$1);

const config = useRuntimeConfig();
const _routeRulesMatcher = toRouteMatcher(
  createRouter({ routes: config.nitro.routeRules })
);
function createRouteRulesHandler() {
  return eventHandler((event) => {
    const routeRules = getRouteRules(event);
    if (routeRules.headers) {
      setHeaders(event, routeRules.headers);
    }
    if (routeRules.redirect) {
      return sendRedirect(
        event,
        routeRules.redirect.to,
        routeRules.redirect.statusCode
      );
    }
  });
}
function getRouteRules(event) {
  event.context._nitro = event.context._nitro || {};
  if (!event.context._nitro.routeRules) {
    const path = new URL(event.node.req.url, "http://localhost").pathname;
    event.context._nitro.routeRules = getRouteRulesForPath(
      withoutBase(path, useRuntimeConfig().app.baseURL)
    );
  }
  return event.context._nitro.routeRules;
}
function getRouteRulesForPath(path) {
  return defu({}, ..._routeRulesMatcher.matchAll(path).reverse());
}

const defaultCacheOptions = {
  name: "_",
  base: "/cache",
  swr: true,
  maxAge: 1
};
function defineCachedFunction(fn, opts) {
  opts = { ...defaultCacheOptions, ...opts };
  const pending = {};
  const group = opts.group || "nitro";
  const name = opts.name || fn.name || "_";
  const integrity = hash([opts.integrity, fn, opts]);
  const validate = opts.validate || (() => true);
  async function get(key, resolver, shouldInvalidateCache) {
    const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":").replace(/:\/$/, ":index");
    const entry = await useStorage().getItem(cacheKey) || {};
    const ttl = (opts.maxAge ?? opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = shouldInvalidateCache || entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl || !validate(entry);
    const _resolve = async () => {
      const isPending = pending[key];
      if (!isPending) {
        if (entry.value !== void 0 && (opts.staleMaxAge || 0) >= 0) {
          entry.value = void 0;
          entry.integrity = void 0;
          entry.mtime = void 0;
          entry.expires = void 0;
        }
        pending[key] = Promise.resolve(resolver());
      }
      entry.value = await pending[key];
      if (!isPending) {
        entry.mtime = Date.now();
        entry.integrity = integrity;
        delete pending[key];
        if (validate(entry)) {
          useStorage().setItem(cacheKey, entry).catch((error) => console.error("[nitro] [cache]", error));
        }
      }
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (opts.swr && entry.value) {
      _resolvePromise.catch(console.error);
      return entry;
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const shouldBypassCache = opts.shouldBypassCache?.(...args);
    if (shouldBypassCache) {
      return fn(...args);
    }
    const key = await (opts.getKey || getKey)(...args);
    const shouldInvalidateCache = opts.shouldInvalidateCache?.(...args);
    const entry = await get(key, () => fn(...args), shouldInvalidateCache);
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
const cachedFunction = defineCachedFunction;
function getKey(...args) {
  return args.length > 0 ? hash(args, {}) : "";
}
function escapeKey(key) {
  return key.replace(/[^\dA-Za-z]/g, "");
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions) {
  const _opts = {
    ...opts,
    getKey: async (event) => {
      const key = await opts.getKey?.(event);
      if (key) {
        return escapeKey(key);
      }
      const url = event.node.req.originalUrl || event.node.req.url;
      const friendlyName = escapeKey(decodeURI(parseURL(url).pathname)).slice(
        0,
        16
      );
      const urlHash = hash(url);
      return `${friendlyName}.${urlHash}`;
    },
    validate: (entry) => {
      if (entry.value.code >= 400) {
        return false;
      }
      if (entry.value.body === void 0) {
        return false;
      }
      return true;
    },
    group: opts.group || "nitro/handlers",
    integrity: [opts.integrity, handler]
  };
  const _cachedHandler = cachedFunction(
    async (incomingEvent) => {
      const reqProxy = cloneWithProxy(incomingEvent.node.req, { headers: {} });
      const resHeaders = {};
      let _resSendBody;
      const resProxy = cloneWithProxy(incomingEvent.node.res, {
        statusCode: 200,
        getHeader(name) {
          return resHeaders[name];
        },
        setHeader(name, value) {
          resHeaders[name] = value;
          return this;
        },
        getHeaderNames() {
          return Object.keys(resHeaders);
        },
        hasHeader(name) {
          return name in resHeaders;
        },
        removeHeader(name) {
          delete resHeaders[name];
        },
        getHeaders() {
          return resHeaders;
        },
        end(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2();
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return this;
        },
        write(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2();
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return this;
        },
        writeHead(statusCode, headers2) {
          this.statusCode = statusCode;
          if (headers2) {
            for (const header in headers2) {
              this.setHeader(header, headers2[header]);
            }
          }
          return this;
        }
      });
      const event = createEvent(reqProxy, resProxy);
      event.context = incomingEvent.context;
      const body = await handler(event) || _resSendBody;
      const headers = event.node.res.getHeaders();
      headers.etag = headers.Etag || headers.etag || `W/"${hash(body)}"`;
      headers["last-modified"] = headers["Last-Modified"] || headers["last-modified"] || new Date().toUTCString();
      const cacheControl = [];
      if (opts.swr) {
        if (opts.maxAge) {
          cacheControl.push(`s-maxage=${opts.maxAge}`);
        }
        if (opts.staleMaxAge) {
          cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
        } else {
          cacheControl.push("stale-while-revalidate");
        }
      } else if (opts.maxAge) {
        cacheControl.push(`max-age=${opts.maxAge}`);
      }
      if (cacheControl.length > 0) {
        headers["cache-control"] = cacheControl.join(", ");
      }
      const cacheEntry = {
        code: event.node.res.statusCode,
        headers,
        body
      };
      return cacheEntry;
    },
    _opts
  );
  return defineEventHandler(async (event) => {
    if (opts.headersOnly) {
      if (handleCacheHeaders(event, { maxAge: opts.maxAge })) {
        return;
      }
      return handler(event);
    }
    const response = await _cachedHandler(event);
    if (event.node.res.headersSent || event.node.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["last-modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.node.res.statusCode = response.code;
    for (const name in response.headers) {
      event.node.res.setHeader(name, response.headers[name]);
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

const plugins = [
  
];

function hasReqHeader(event, name, includes) {
  const value = getRequestHeader(event, name);
  return value && typeof value === "string" && value.toLowerCase().includes(includes);
}
function isJsonRequest(event) {
  return hasReqHeader(event, "accept", "application/json") || hasReqHeader(event, "user-agent", "curl/") || hasReqHeader(event, "user-agent", "httpie/") || event.node.req.url?.endsWith(".json") || event.node.req.url?.includes("/api/");
}
function normalizeError(error) {
  const cwd = process.cwd();
  const stack = (error.stack || "").split("\n").splice(1).filter((line) => line.includes("at ")).map((line) => {
    const text = line.replace(cwd + "/", "./").replace("webpack:/", "").replace("file://", "").trim();
    return {
      text,
      internal: line.includes("node_modules") && !line.includes(".cache") || line.includes("internal") || line.includes("new Promise")
    };
  });
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage ?? (statusCode === 404 ? "Not Found" : "");
  const message = error.message || error.toString();
  return {
    stack,
    statusCode,
    statusMessage,
    message
  };
}

const errorHandler = (async function errorhandler(error, event) {
  const { stack, statusCode, statusMessage, message } = normalizeError(error);
  const errorObject = {
    url: event.node.req.url,
    statusCode,
    statusMessage,
    message,
    stack: "",
    data: error.data
  };
  event.node.res.statusCode = errorObject.statusCode !== 200 && errorObject.statusCode || 500;
  if (errorObject.statusMessage) {
    event.node.res.statusMessage = errorObject.statusMessage;
  }
  if (error.unhandled || error.fatal) {
    const tags = [
      "[nuxt]",
      "[request error]",
      error.unhandled && "[unhandled]",
      error.fatal && "[fatal]",
      Number(errorObject.statusCode) !== 200 && `[${errorObject.statusCode}]`
    ].filter(Boolean).join(" ");
    console.error(tags, errorObject.message + "\n" + stack.map((l) => "  " + l.text).join("  \n"));
  }
  if (isJsonRequest(event)) {
    event.node.res.setHeader("Content-Type", "application/json");
    event.node.res.end(JSON.stringify(errorObject));
    return;
  }
  const isErrorPage = event.node.req.url?.startsWith("/__nuxt_error");
  const res = !isErrorPage ? await useNitroApp().localFetch(withQuery(joinURL(useRuntimeConfig().app.baseURL, "/__nuxt_error"), errorObject), {
    headers: getRequestHeaders(event),
    redirect: "manual"
  }).catch(() => null) : null;
  if (!res) {
    const { template } = await import('../error-500.mjs');
    event.node.res.setHeader("Content-Type", "text/html;charset=UTF-8");
    event.node.res.end(template(errorObject));
    return;
  }
  for (const [header, value] of res.headers.entries()) {
    setResponseHeader(event, header, value);
  }
  if (res.status && res.status !== 200) {
    event.node.res.statusCode = res.status;
  }
  if (res.statusText) {
    event.node.res.statusMessage = res.statusText;
  }
  event.node.res.end(await res.text());
});

const assets = {
  "/favicon.ico": {
    "type": "image/vnd.microsoft.icon",
    "etag": "\"10be-n8egyE9tcb7sKGr/pYCaQ4uWqxI\"",
    "mtime": "2023-04-02T15:50:52.563Z",
    "size": 4286,
    "path": "../public/favicon.ico"
  },
  "/logo.svg": {
    "type": "image/svg+xml",
    "etag": "\"45e-9Z5N2Exb1PTOuXOmvO15MW4DEoc\"",
    "mtime": "2023-04-02T15:50:50.423Z",
    "size": 1118,
    "path": "../public/logo.svg"
  },
  "/_nuxt/Callout.3c9839f9.js": {
    "type": "application/javascript",
    "etag": "\"464-unsQblHRVQ2qYVU1/Fj1Vu8B/Bg\"",
    "mtime": "2023-04-02T15:50:50.403Z",
    "size": 1124,
    "path": "../public/_nuxt/Callout.3c9839f9.js"
  },
  "/_nuxt/Icon.6eb7e0ad.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"43-HKNx8AP472KnvMSUDdekBkH8V00\"",
    "mtime": "2023-04-02T15:50:50.403Z",
    "size": 67,
    "path": "../public/_nuxt/Icon.6eb7e0ad.css"
  },
  "/_nuxt/Icon.d532c67e.js": {
    "type": "application/javascript",
    "etag": "\"68da-qbtQAcOvU1XlNA6q68oozDPuREA\"",
    "mtime": "2023-04-02T15:50:50.403Z",
    "size": 26842,
    "path": "../public/_nuxt/Icon.d532c67e.js"
  },
  "/_nuxt/_slug_.227ee956.js": {
    "type": "application/javascript",
    "etag": "\"3382-1nuaMJWbLw67AqzeFXaOY9wGIcA\"",
    "mtime": "2023-04-02T15:50:50.403Z",
    "size": 13186,
    "path": "../public/_nuxt/_slug_.227ee956.js"
  },
  "/_nuxt/_slug_.4fd82873.js": {
    "type": "application/javascript",
    "etag": "\"d6-JbG0b/m0vomdR+ZzDPEKjXiXXKs\"",
    "mtime": "2023-04-02T15:50:50.403Z",
    "size": 214,
    "path": "../public/_nuxt/_slug_.4fd82873.js"
  },
  "/_nuxt/about.26eaf987.js": {
    "type": "application/javascript",
    "etag": "\"1557-XXACwHCYLfd0MW0xtbcJ2dJtuIE\"",
    "mtime": "2023-04-02T15:50:50.393Z",
    "size": 5463,
    "path": "../public/_nuxt/about.26eaf987.js"
  },
  "/_nuxt/company-logo.d84539f4.js": {
    "type": "application/javascript",
    "etag": "\"50-BTj9XkEuJk2hXzkoTNNVaw45dU4\"",
    "mtime": "2023-04-02T15:50:50.393Z",
    "size": 80,
    "path": "../public/_nuxt/company-logo.d84539f4.js"
  },
  "/_nuxt/composables.528cd3e8.js": {
    "type": "application/javascript",
    "etag": "\"61-2+5u1zTYVNW4dbcrAHDIGPxVtW0\"",
    "mtime": "2023-04-02T15:50:50.393Z",
    "size": 97,
    "path": "../public/_nuxt/composables.528cd3e8.js"
  },
  "/_nuxt/default.201e3253.js": {
    "type": "application/javascript",
    "etag": "\"1508-odC4Xr3EPqjzCJcg91oFohXmSfA\"",
    "mtime": "2023-04-02T15:50:50.393Z",
    "size": 5384,
    "path": "../public/_nuxt/default.201e3253.js"
  },
  "/_nuxt/default.9726d374.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"aa-x9c0xVKvR0ugfClKv8Zb0Y4mnrw\"",
    "mtime": "2023-04-02T15:50:50.373Z",
    "size": 170,
    "path": "../public/_nuxt/default.9726d374.css"
  },
  "/_nuxt/entry.0835186d.js": {
    "type": "application/javascript",
    "etag": "\"12af44-10jUbnKaBixmuQ1jBdtPNi6Ve2E\"",
    "mtime": "2023-04-02T15:50:50.363Z",
    "size": 1224516,
    "path": "../public/_nuxt/entry.0835186d.js"
  },
  "/_nuxt/entry.0cd3990f.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"80bb-YD6r9Kzbey+rI4BcUb+ZKINaHAI\"",
    "mtime": "2023-04-02T15:50:50.303Z",
    "size": 32955,
    "path": "../public/_nuxt/entry.0cd3990f.css"
  },
  "/_nuxt/error-404.8bdbaeb8.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"e70-jl7r/kE1FF0H+CLPNh+07RJXuFI\"",
    "mtime": "2023-04-02T15:50:50.303Z",
    "size": 3696,
    "path": "../public/_nuxt/error-404.8bdbaeb8.css"
  },
  "/_nuxt/error-404.b5fbf7ef.js": {
    "type": "application/javascript",
    "etag": "\"8fb-OQWglaKTY4kGCqtN1rZUddINTlk\"",
    "mtime": "2023-04-02T15:50:50.303Z",
    "size": 2299,
    "path": "../public/_nuxt/error-404.b5fbf7ef.js"
  },
  "/_nuxt/error-500.a4a6e025.js": {
    "type": "application/javascript",
    "etag": "\"7a4-itlS92PsO3IFuSdySkjXlAhAWK0\"",
    "mtime": "2023-04-02T15:50:50.303Z",
    "size": 1956,
    "path": "../public/_nuxt/error-500.a4a6e025.js"
  },
  "/_nuxt/error-500.b63a96f5.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"7e0-loEWA9n4Kq4UMBzJyT6hY9SSl00\"",
    "mtime": "2023-04-02T15:50:50.293Z",
    "size": 2016,
    "path": "../public/_nuxt/error-500.b63a96f5.css"
  },
  "/_nuxt/error-component.5366bd34.js": {
    "type": "application/javascript",
    "etag": "\"532-l+3n3HFX7OOYYPbTD9ZZImg39CQ\"",
    "mtime": "2023-04-02T15:50:50.293Z",
    "size": 1330,
    "path": "../public/_nuxt/error-component.5366bd34.js"
  },
  "/_nuxt/index.ae18da8d.js": {
    "type": "application/javascript",
    "etag": "\"3356-VUQQDMTZQPU0X5B1FeyHaWKP5LE\"",
    "mtime": "2023-04-02T15:50:50.283Z",
    "size": 13142,
    "path": "../public/_nuxt/index.ae18da8d.js"
  },
  "/_nuxt/map.10cc0611.js": {
    "type": "application/javascript",
    "etag": "\"28c-gBb+WcZMRCFLPjeVDCZk2cvJ17A\"",
    "mtime": "2023-04-02T15:50:50.273Z",
    "size": 652,
    "path": "../public/_nuxt/map.10cc0611.js"
  },
  "/_nuxt/order.079a8373.js": {
    "type": "application/javascript",
    "etag": "\"1cae-j/s+jgaYTLaqtgzwnnuNO7gQNkw\"",
    "mtime": "2023-04-02T15:50:50.273Z",
    "size": 7342,
    "path": "../public/_nuxt/order.079a8373.js"
  },
  "/_nuxt/swiper-vue.5ad429d7.js": {
    "type": "application/javascript",
    "etag": "\"2781f-swsOie1WonTbpT/tvEeJ7PMx9yM\"",
    "mtime": "2023-04-02T15:50:50.273Z",
    "size": 161823,
    "path": "../public/_nuxt/swiper-vue.5ad429d7.js"
  },
  "/_nuxt/swiper-vue.5d658486.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"47c9-aPT9pvOWdtc300uxjsZ4pGHVLOY\"",
    "mtime": "2023-04-02T15:50:50.253Z",
    "size": 18377,
    "path": "../public/_nuxt/swiper-vue.5d658486.css"
  },
  "/img/3d-house-with-solar-pannels.jpg": {
    "type": "image/jpeg",
    "etag": "\"25e4b-uwhWTBhEqubWMpbA8H3DaE/T2GI\"",
    "mtime": "2023-04-02T15:50:52.543Z",
    "size": 155211,
    "path": "../public/img/3d-house-with-solar-pannels.jpg"
  },
  "/img/3d-house-with-solar-pannels.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"5e-K5/gUA+hhO45s4z3kQrkXwILmDI\"",
    "mtime": "2023-04-02T15:50:52.493Z",
    "size": 94,
    "path": "../public/img/3d-house-with-solar-pannels.jpg:Zone.Identifier"
  },
  "/img/Pallet-longi-400-bf-min.webp:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"16d-v7MrxumFl7Af6qQTb6UmFoSVdvg\"",
    "mtime": "2023-04-02T15:50:52.483Z",
    "size": 365,
    "path": "../public/img/Pallet-longi-400-bf-min.webp:Zone.Identifier"
  },
  "/img/Rectangle 2.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:52.483Z",
    "size": 58,
    "path": "../public/img/Rectangle 2.jpg:Zone.Identifier"
  },
  "/img/Rectangle.jpg": {
    "type": "image/jpeg",
    "etag": "\"567f3-tRipbmACKVnqex4z8LPvTVgzAx4\"",
    "mtime": "2023-04-02T15:50:52.473Z",
    "size": 354291,
    "path": "../public/img/Rectangle.jpg"
  },
  "/img/cloud.png": {
    "type": "image/png",
    "etag": "\"4541-pe3nwdQDXoDavMzJTkr0CElbNDU\"",
    "mtime": "2023-04-02T15:50:52.453Z",
    "size": 17729,
    "path": "../public/img/cloud.png"
  },
  "/img/cloud.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:52.453Z",
    "size": 58,
    "path": "../public/img/cloud.png:Zone.Identifier"
  },
  "/img/company-logo.png": {
    "type": "image/png",
    "etag": "\"ebcc-Nh652naPQTzl/O0Hnw6eQbEMayQ\"",
    "mtime": "2023-04-02T15:50:52.443Z",
    "size": 60364,
    "path": "../public/img/company-logo.png"
  },
  "/img/company-logo.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"1a-1Z/ITN1SF8bPdHhXA2VfeNprWCs\"",
    "mtime": "2023-04-02T15:50:52.443Z",
    "size": 26,
    "path": "../public/img/company-logo.png:Zone.Identifier"
  },
  "/img/gettyimages-1384831593-1024x1024.jpg": {
    "type": "image/jpeg",
    "etag": "\"20b5b-WZCNWw7bJf+Z1W83aWtLOl2ZTVI\"",
    "mtime": "2023-04-02T15:50:52.433Z",
    "size": 133979,
    "path": "../public/img/gettyimages-1384831593-1024x1024.jpg"
  },
  "/img/gradient-bg.jpg": {
    "type": "image/jpeg",
    "etag": "\"132a4-s5ZiPdm+s0j9PyQklZfBPZ8esIo\"",
    "mtime": "2023-04-02T15:50:52.423Z",
    "size": 78500,
    "path": "../public/img/gradient-bg.jpg"
  },
  "/img/gradient-bg.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3c-MrPL8FA/L4rKByxWyqbmGkhA3Wg\"",
    "mtime": "2023-04-02T15:50:52.413Z",
    "size": 60,
    "path": "../public/img/gradient-bg.jpg:Zone.Identifier"
  },
  "/img/gradient-bg.png": {
    "type": "image/png",
    "etag": "\"116a9f-3UnT3l+/ww4rjPcxo321SBpdQG8\"",
    "mtime": "2023-04-02T15:50:52.403Z",
    "size": 1141407,
    "path": "../public/img/gradient-bg.png"
  },
  "/img/gradient-bg.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3fa-eGxiwY9UkL1B62R7n2KBdLJVO+0\"",
    "mtime": "2023-04-02T15:50:52.343Z",
    "size": 1018,
    "path": "../public/img/gradient-bg.png:Zone.Identifier"
  },
  "/img/hero-bg-transparent.png": {
    "type": "image/png",
    "etag": "\"365bd-yJpbRu+X0+LOiUrqJgzXytoLJ6g\"",
    "mtime": "2023-04-02T15:50:52.333Z",
    "size": 222653,
    "path": "../public/img/hero-bg-transparent.png"
  },
  "/img/hero-bg-transparent.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"b8-ENVGdJpQ6BEB3gJdk09CjUTvYFM\"",
    "mtime": "2023-04-02T15:50:52.313Z",
    "size": 184,
    "path": "../public/img/hero-bg-transparent.png:Zone.Identifier"
  },
  "/img/hero-image.jpg": {
    "type": "image/jpeg",
    "etag": "\"cc891-FqtHTQ0L7Tc67hEw4tNeXdCf/RQ\"",
    "mtime": "2023-04-02T15:50:52.303Z",
    "size": 837777,
    "path": "../public/img/hero-image.jpg"
  },
  "/img/hero-image.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"e8-Fa2ea6ZyVJiBe83vZn9bkE24qo4\"",
    "mtime": "2023-04-02T15:50:52.173Z",
    "size": 232,
    "path": "../public/img/hero-image.jpg:Zone.Identifier"
  },
  "/img/house-in-garden-at-night.jpg": {
    "type": "image/jpeg",
    "etag": "\"8213-G8gt1Vg4alnabFvpARTs4g4/olM\"",
    "mtime": "2023-04-02T15:50:52.153Z",
    "size": 33299,
    "path": "../public/img/house-in-garden-at-night.jpg"
  },
  "/img/house-on-the-river.jpeg": {
    "type": "image/jpeg",
    "etag": "\"5b58c-SBW+oABqtC02NcIutDWuGJg1zAI\"",
    "mtime": "2023-04-02T15:50:52.093Z",
    "size": 374156,
    "path": "../public/img/house-on-the-river.jpeg"
  },
  "/img/illustration-house.png": {
    "type": "image/png",
    "etag": "\"2c8d1-NHO6mJnzH/i4SW4eFrSW0hieP8E\"",
    "mtime": "2023-04-02T15:50:52.043Z",
    "size": 182481,
    "path": "../public/img/illustration-house.png"
  },
  "/img/illustration-house.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:52.013Z",
    "size": 58,
    "path": "../public/img/illustration-house.png:Zone.Identifier"
  },
  "/img/illustration.png": {
    "type": "image/png",
    "etag": "\"2a761-0ARSi0L4dmiwsT+DQg+Gq+tyrcE\"",
    "mtime": "2023-04-02T15:50:51.983Z",
    "size": 173921,
    "path": "../public/img/illustration.png"
  },
  "/img/illustration.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:51.963Z",
    "size": 58,
    "path": "../public/img/illustration.png:Zone.Identifier"
  },
  "/img/image-main.webp": {
    "type": "image/webp",
    "etag": "\"fab6-iHIdPhNSlL9DXyKVI4tMNiZi5Mg\"",
    "mtime": "2023-04-02T15:50:51.963Z",
    "size": 64182,
    "path": "../public/img/image-main.webp"
  },
  "/img/image-ref-specifications.png": {
    "type": "image/png",
    "etag": "\"ad8e3-KxwYCihw6nsoZ2PbbggXN/e96HE\"",
    "mtime": "2023-04-02T15:50:51.923Z",
    "size": 710883,
    "path": "../public/img/image-ref-specifications.png"
  },
  "/img/image-ref-specifications.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:51.873Z",
    "size": 58,
    "path": "../public/img/image-ref-specifications.png:Zone.Identifier"
  },
  "/img/ingeneers-install-panels.jpg": {
    "type": "image/jpeg",
    "etag": "\"3ba2a-nFEXpQg8ZlZjKEnSUsGhQFsJp1k\"",
    "mtime": "2023-04-02T15:50:51.853Z",
    "size": 244266,
    "path": "../public/img/ingeneers-install-panels.jpg"
  },
  "/img/ingeneers-install-panels.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"5e-K5/gUA+hhO45s4z3kQrkXwILmDI\"",
    "mtime": "2023-04-02T15:50:51.843Z",
    "size": 94,
    "path": "../public/img/ingeneers-install-panels.jpg:Zone.Identifier"
  },
  "/img/le-cloud-object.png": {
    "type": "image/png",
    "etag": "\"2a3e0-46D9bdj9qB21myqkkel1kJPLp6c\"",
    "mtime": "2023-04-02T15:50:51.833Z",
    "size": 173024,
    "path": "../public/img/le-cloud-object.png"
  },
  "/img/logo-white.png": {
    "type": "image/png",
    "etag": "\"de1b-HSd96VGsXqogl9ONehBJ+62jxhg\"",
    "mtime": "2023-04-02T15:50:51.823Z",
    "size": 56859,
    "path": "../public/img/logo-white.png"
  },
  "/img/panel 1.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:51.813Z",
    "size": 58,
    "path": "../public/img/panel 1.png:Zone.Identifier"
  },
  "/img/panel 2.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:51.813Z",
    "size": 58,
    "path": "../public/img/panel 2.png:Zone.Identifier"
  },
  "/img/panel-1.png": {
    "type": "image/png",
    "etag": "\"250dd-rGHXRbNzCTsOLTUYltLUrhzUyIE\"",
    "mtime": "2023-04-02T15:50:51.813Z",
    "size": 151773,
    "path": "../public/img/panel-1.png"
  },
  "/img/panel-2.png": {
    "type": "image/png",
    "etag": "\"1b6b7-S8gfi/uoDtyhTnvLn8rjHIhKHIc\"",
    "mtime": "2023-04-02T15:50:51.793Z",
    "size": 112311,
    "path": "../public/img/panel-2.png"
  },
  "/img/panel-400.webp": {
    "type": "image/webp",
    "etag": "\"7ff8e-w+u+mClV68Gmbi5j82erzYwZhgc\"",
    "mtime": "2023-04-02T15:50:51.783Z",
    "size": 524174,
    "path": "../public/img/panel-400.webp"
  },
  "/img/productafbeelding-longi-410-bf-min.webp:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"178-jznK3WBlS8XwUUX9sTtCBXn47Wk\"",
    "mtime": "2023-04-02T15:50:51.753Z",
    "size": 376,
    "path": "../public/img/productafbeelding-longi-410-bf-min.webp:Zone.Identifier"
  },
  "/img/reference-image-of-panel.webp": {
    "type": "image/webp",
    "etag": "\"8e230-SNmB70CSLqxsRjRdQbsKvZkPILY\"",
    "mtime": "2023-04-02T15:50:51.713Z",
    "size": 582192,
    "path": "../public/img/reference-image-of-panel.webp"
  },
  "/img/roof-pannels.jpg": {
    "type": "image/jpeg",
    "etag": "\"f4db6-Hq02XdrkPOwKiu73lyD2C0xvXMk\"",
    "mtime": "2023-04-02T15:50:51.653Z",
    "size": 1002934,
    "path": "../public/img/roof-pannels.jpg"
  },
  "/img/roof-with-solar-panels.jpg": {
    "type": "image/jpeg",
    "etag": "\"102fca-BWEz5oEreLCK0551T52AAul4lC0\"",
    "mtime": "2023-04-02T15:50:51.553Z",
    "size": 1060810,
    "path": "../public/img/roof-with-solar-panels.jpg"
  },
  "/img/scewed-product.png": {
    "type": "image/png",
    "etag": "\"2bacd9-+lo9/Dv9LphVoxhAtGxpZNCvMSU\"",
    "mtime": "2023-04-02T15:50:51.423Z",
    "size": 2862297,
    "path": "../public/img/scewed-product.png"
  },
  "/img/scewed-product.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:51.303Z",
    "size": 58,
    "path": "../public/img/scewed-product.png:Zone.Identifier"
  },
  "/img/second-gradient.png": {
    "type": "image/png",
    "etag": "\"68b2d-N5wyIJekbAkKoL1uj42/b/SinXk\"",
    "mtime": "2023-04-02T15:50:51.293Z",
    "size": 428845,
    "path": "../public/img/second-gradient.png"
  },
  "/img/second-gradient.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"3a-9vo2E/8dOgxJIDg4MZRb0Qf1i7A\"",
    "mtime": "2023-04-02T15:50:51.243Z",
    "size": 58,
    "path": "../public/img/second-gradient.png:Zone.Identifier"
  },
  "/img/soil.png": {
    "type": "image/png",
    "etag": "\"551e1c-jkcBfTX6JVr/YoR6iNqJA6zU8wM\"",
    "mtime": "2023-04-02T15:50:51.223Z",
    "size": 5578268,
    "path": "../public/img/soil.png"
  },
  "/img/soil.png:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"10b-h5uTtlfoBet4sKTix/hjhg7UatI\"",
    "mtime": "2023-04-02T15:50:51.043Z",
    "size": 267,
    "path": "../public/img/soil.png:Zone.Identifier"
  },
  "/img/solar-house.jpg": {
    "type": "image/jpeg",
    "etag": "\"15539f-PQuw89gAf1dC7yoaJWX+C6Q6+TA\"",
    "mtime": "2023-04-02T15:50:51.033Z",
    "size": 1397663,
    "path": "../public/img/solar-house.jpg"
  },
  "/img/solar-house.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"5e-K5/gUA+hhO45s4z3kQrkXwILmDI\"",
    "mtime": "2023-04-02T15:50:50.993Z",
    "size": 94,
    "path": "../public/img/solar-house.jpg:Zone.Identifier"
  },
  "/img/solar-panel-close-look.jpg": {
    "type": "image/jpeg",
    "etag": "\"299a6e-yWLsZm9mThQzdcIUDnub7wUWj8Q\"",
    "mtime": "2023-04-02T15:50:50.993Z",
    "size": 2726510,
    "path": "../public/img/solar-panel-close-look.jpg"
  },
  "/img/solar-panel-on-roof.jpg": {
    "type": "image/jpeg",
    "etag": "\"148854-/AUt4Q2Ayb7m3iFTQQIRAuSVmMw\"",
    "mtime": "2023-04-02T15:50:50.933Z",
    "size": 1345620,
    "path": "../public/img/solar-panel-on-roof.jpg"
  },
  "/img/solar-panels-field.jpg": {
    "type": "image/jpeg",
    "etag": "\"a7d9d1-MZCAjob/pzqbfQ7JbVk3PbzwdO8\"",
    "mtime": "2023-04-02T15:50:50.903Z",
    "size": 11000273,
    "path": "../public/img/solar-panels-field.jpg"
  },
  "/img/solar-roof-mobile-image.jpg": {
    "type": "image/jpeg",
    "etag": "\"968c1-hGLaOhYptLQ2iDVzbF/uAISIBOI\"",
    "mtime": "2023-04-02T15:50:50.523Z",
    "size": 616641,
    "path": "../public/img/solar-roof-mobile-image.jpg"
  },
  "/img/solar-roof-mobile-image.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"5e-K5/gUA+hhO45s4z3kQrkXwILmDI\"",
    "mtime": "2023-04-02T15:50:50.493Z",
    "size": 94,
    "path": "../public/img/solar-roof-mobile-image.jpg:Zone.Identifier"
  },
  "/img/solar-systems-black-pallete.jpg": {
    "type": "image/jpeg",
    "etag": "\"d8b98-jmteefYJweVE2I649nrdEeupwp4\"",
    "mtime": "2023-04-02T15:50:50.473Z",
    "size": 887704,
    "path": "../public/img/solar-systems-black-pallete.jpg"
  },
  "/img/solar-systems-field.jpg": {
    "type": "image/jpeg",
    "etag": "\"d8e4a-f71yZ4Ut2XN+8ryNkAEcb/6nzZM\"",
    "mtime": "2023-04-02T15:50:50.443Z",
    "size": 888394,
    "path": "../public/img/solar-systems-field.jpg"
  },
  "/img/solar-systems-field.jpg:Zone.Identifier": {
    "type": "text/plain; charset=utf-8",
    "etag": "\"5e-K5/gUA+hhO45s4z3kQrkXwILmDI\"",
    "mtime": "2023-04-02T15:50:50.423Z",
    "size": 94,
    "path": "../public/img/solar-systems-field.jpg:Zone.Identifier"
  }
};

function readAsset (id) {
  const serverDir = dirname(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve(serverDir, assets[id].path))
}

const publicAssetBases = [];

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base of publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = { gzip: ".gz", br: ".br" };
const _f4b49z = eventHandler((event) => {
  if (event.node.req.method && !METHODS.has(event.node.req.method)) {
    return;
  }
  let id = decodeURIComponent(
    withLeadingSlash(
      withoutTrailingSlash(parseURL(event.node.req.url).pathname)
    )
  );
  let asset;
  const encodingHeader = String(
    event.node.req.headers["accept-encoding"] || ""
  );
  const encodings = [
    ...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(),
    ""
  ];
  if (encodings.length > 1) {
    event.node.res.setHeader("Vary", "Accept-Encoding");
  }
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      throw createError({
        statusMessage: "Cannot find static asset " + id,
        statusCode: 404
      });
    }
    return;
  }
  const ifNotMatch = event.node.req.headers["if-none-match"] === asset.etag;
  if (ifNotMatch) {
    event.node.res.statusCode = 304;
    event.node.res.end();
    return;
  }
  const ifModifiedSinceH = event.node.req.headers["if-modified-since"];
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= new Date(asset.mtime)) {
    event.node.res.statusCode = 304;
    event.node.res.end();
    return;
  }
  if (asset.type && !event.node.res.getHeader("Content-Type")) {
    event.node.res.setHeader("Content-Type", asset.type);
  }
  if (asset.etag && !event.node.res.getHeader("ETag")) {
    event.node.res.setHeader("ETag", asset.etag);
  }
  if (asset.mtime && !event.node.res.getHeader("Last-Modified")) {
    event.node.res.setHeader("Last-Modified", asset.mtime);
  }
  if (asset.encoding && !event.node.res.getHeader("Content-Encoding")) {
    event.node.res.setHeader("Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !event.node.res.getHeader("Content-Length")) {
    event.node.res.setHeader("Content-Length", asset.size);
  }
  return readAsset(id);
});

const _lazy_oDVEiq = () => import('../handlers/renderer.mjs');

const handlers = [
  { route: '', handler: _f4b49z, lazy: false, middleware: true, method: undefined },
  { route: '/__nuxt_error', handler: _lazy_oDVEiq, lazy: true, middleware: false, method: undefined },
  { route: '/**', handler: _lazy_oDVEiq, lazy: true, middleware: false, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const h3App = createApp({
    debug: destr(false),
    onError: errorHandler
  });
  const router = createRouter$1();
  h3App.use(createRouteRulesHandler());
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(
        /\/+/g,
        "/"
      );
      h3App.use(middlewareBase, handler);
    } else {
      const routeRules = getRouteRulesForPath(
        h.route.replace(/:\w+|\*\*/g, "_")
      );
      if (routeRules.cache) {
        handler = cachedEventHandler(handler, {
          group: "nitro/routes",
          ...routeRules.cache
        });
      }
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router);
  const localCall = createCall(toNodeListener(h3App));
  const localFetch = createFetch(localCall, globalThis.fetch);
  const $fetch = createFetch$1({
    fetch: localFetch,
    Headers,
    defaults: { baseURL: config.app.baseURL }
  });
  globalThis.$fetch = $fetch;
  const app = {
    hooks,
    h3App,
    router,
    localCall,
    localFetch
  };
  for (const plugin of plugins) {
    plugin(app);
  }
  return app;
}
const nitroApp = createNitroApp();
const useNitroApp = () => nitroApp;

const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const server = cert && key ? new Server({ key, cert }, toNodeListener(nitroApp.h3App)) : new Server$1(toNodeListener(nitroApp.h3App));
const port = destr(process.env.NITRO_PORT || process.env.PORT) || 3e3;
const host = process.env.NITRO_HOST || process.env.HOST;
const s = server.listen(port, host, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const protocol = cert && key ? "https" : "http";
  const i = s.address();
  const baseURL = (useRuntimeConfig().app.baseURL || "").replace(/\/$/, "");
  const url = `${protocol}://${i.family === "IPv6" ? `[${i.address}]` : i.address}:${i.port}${baseURL}`;
  console.log(`Listening ${url}`);
});
{
  process.on(
    "unhandledRejection",
    (err) => console.error("[nitro] [dev] [unhandledRejection] " + err)
  );
  process.on(
    "uncaughtException",
    (err) => console.error("[nitro] [dev] [uncaughtException] " + err)
  );
}
const nodeServer = {};

export { useRuntimeConfig as a, getRouteRules as g, nodeServer as n, useNitroApp as u };
//# sourceMappingURL=node-server.mjs.map
