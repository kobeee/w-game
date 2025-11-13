// Cloudflare Worker - Gemini 直连代理（简化版，移除所有缓存）
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

const GEMINI_API_KEY = (globalThis && globalThis.GEMINI_API_KEY) || '';
const GEMINI_DEFAULT_MODEL = (globalThis && globalThis.GEMINI_DEFAULT_MODEL) || 'gemini-2.5-flash-lite';
const ALLOW_ORIGINS = (globalThis && globalThis.ALLOW_ORIGINS) || '*';

function handleOptions(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = resolveAllowedOrigin(origin);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': '*,Content-Type,Authorization,X-Goog-Api-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  const url = new URL(request.url);

  if (url.pathname.startsWith('/gemini')) {
    const newPath = url.pathname.replace('/gemini', '');
    if (newPath === '/generate') {
      const model = url.searchParams.get('model') || GEMINI_DEFAULT_MODEL;
      const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      return proxyGemini(request, upstream);
    }
    const upstreamUrlString = `https://generativelanguage.googleapis.com${newPath}${url.search}`;
    return proxyGemini(request, upstreamUrlString);
  }

  if (url.pathname.startsWith('/w-game-remote')) {
    const upstreamHost = 'elvis1949.top:9090';
    const newPath = url.pathname.replace('/w-game-remote', '');
    const upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    return proxyWGameRemote(request, upstreamUrlString, upstreamHost, url);
  } else if (url.pathname.startsWith('/postcard-public')) {
    const upstreamHost = 'elvis1949.top:8080';
    const newPath = url.pathname.replace('/postcard-public', '');
    const upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    return proxyGeneric(request, upstreamUrlString, upstreamHost);
  } else if (url.pathname.startsWith('/postcard')) {
    const upstreamHost = 'elvis1949.top:8083';
    const newPath = url.pathname.replace('/postcard', '');
    const upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    return proxyGeneric(request, upstreamUrlString, upstreamHost);
  }

  return new Response('404 Not Found', { status: 404 });
}

async function proxyGemini(request, upstreamUrlString) {
  try {
    const headers = new Headers(request.headers);
    headers.delete('key');
    headers.delete('X-Goog-Api-Key');
    headers.set('x-goog-api-key', GEMINI_API_KEY || '');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Connection', 'keep-alive');

    const upstreamResp = await fetch(upstreamUrlString, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    });

    const respHeaders = new Headers(upstreamResp.headers);
    sanitizeResponseHeaders(respHeaders);
    tagDebugHeaders(respHeaders, upstreamResp.status, 'gemini-proxy');
    respHeaders.set('Access-Control-Allow-Origin', resolveAllowedOrigin(request.headers.get('Origin') || ''));

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders
    });
  } catch (e) {
    return new Response(`Bad Gateway (gemini): ${e.message}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

async function proxyWGameRemote(request, upstreamUrlString, upstreamHost, url) {
  const headers = new Headers(request.headers);
  headers.set('Host', upstreamHost);
  headers.delete('Origin');
  headers.delete('Accept-Encoding');
  headers.set('Connection', 'keep-alive');
  const realIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
  if (realIp) headers.set('X-Forwarded-For', realIp);

  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  };

  try {
    const upstreamResp = await fetch(upstreamUrlString, init);
    const respHeaders = new Headers(upstreamResp.headers);
    sanitizeResponseHeaders(respHeaders);
    if (url.pathname.endsWith('.json')) {
      respHeaders.set('Content-Type', 'application/json; charset=utf-8');
    }
    tagDebugHeaders(respHeaders, upstreamResp.status, 'w-game-remote');
    const body = await upstreamResp.arrayBuffer();
    return new Response(body, { status: upstreamResp.status, headers: respHeaders });
  } catch (e) {
    return new Response(`Bad Gateway (w-game-remote): ${e.message}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

async function proxyGeneric(request, upstreamUrlString, upstreamHost) {
  const headers = new Headers(request.headers);
  headers.set('Host', upstreamHost);
  headers.set('Origin', new URL(upstreamUrlString).origin);
  const response = await fetch(upstreamUrlString, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow',
  });
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Goog-Api-Key, *');
  newResponse.headers.delete('content-security-policy');
  return newResponse;
}

// 维基中文释义路由已下线（改为离线本地映射方案）

function sanitizeResponseHeaders(respHeaders) {
  respHeaders.delete('Content-Encoding');
  respHeaders.delete('Transfer-Encoding');
  respHeaders.delete('Connection');
  respHeaders.delete('content-security-policy');
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  respHeaders.set('Access-Control-Allow-Headers', '*,Content-Type,Authorization,X-Goog-Api-Key');
}

function tagDebugHeaders(respHeaders, status, scope) {
  respHeaders.set('X-Upstream-Status', String(status));
  respHeaders.set('X-Edge-Debug', scope);
}

function resolveAllowedOrigin(origin) {
  if (!ALLOW_ORIGINS || ALLOW_ORIGINS === '*') return '*';
  const allowed = ALLOW_ORIGINS.split(',').map(o => o.trim());
  return allowed.includes(origin) ? origin : allowed[0] || '*';
}
