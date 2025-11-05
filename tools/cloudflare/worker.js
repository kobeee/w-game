// Cloudflare Worker (scoped hardening + RSA-OAEP for /w-game-service only)
// - /w-game-service → upstream http://elvis1949.top:9100
//   * 当路径为 /api/v1/word/verify 且方法为 POST 时：
//     在边缘执行 RSA-OAEP 加密（从后端 /api/public-key 拉取公钥并缓存），
//     将密文放入 X-Encrypted-Payload 头，body 发送 '{}'，再转发至后端。
//   * 其它 /w-game-service 路径：保持原始代理行为。
// - 其它路由（/w-game-remote、/postcard-public、/postcard、/gemini）：保持你现有逻辑不变。

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': '*,Content-Type,Authorization,X-Goog-Api-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  const url = new URL(request.url);
  let upstreamUrlString;
  let upstreamHost;

  // Routing（与原有映射保持一致）
  if (url.pathname.startsWith('/w-game-service')) {
    upstreamHost = 'elvis1949.top:9100';
    const newPath = url.pathname.replace('/w-game-service', '');
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;

    // 仅拦截单词验证接口：/w-game-service/api/v1/word/verify（POST），容忍末尾斜杠
    const normalized = newPath.replace(/\/+$/, '');
    if (request.method === 'POST' && normalized === '/api/v1/word/verify') {
      // 使用去尾斜杠后的规范路径转发到上游，避免源站不接受结尾斜杠
      const upstreamUrlStringForVerify = `http://${upstreamHost}${normalized}${url.search}`;
      return proxyWGameServiceWithRSA(request, upstreamUrlStringForVerify, upstreamHost, url);
    }

    // 其它 /w-game-service 路径：保持原始代理
    return proxyGeneric(request, upstreamUrlString, upstreamHost);
  } else if (url.pathname.startsWith('/w-game-remote')) {
    upstreamHost = 'elvis1949.top:9090';
    const newPath = url.pathname.replace('/w-game-remote', '');
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    return proxyWGameRemote(request, upstreamUrlString, upstreamHost, url);
  } else if (url.pathname.startsWith('/postcard-public')) {
    upstreamHost = 'elvis1949.top:8080';
    const newPath = url.pathname.replace('/postcard-public', '');
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    return proxyGeneric(request, upstreamUrlString, upstreamHost);
  } else if (url.pathname.startsWith('/postcard')) {
    upstreamHost = 'elvis1949.top:8083';
    const newPath = url.pathname.replace('/postcard', '');
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    return proxyGeneric(request, upstreamUrlString, upstreamHost);
  } else if (url.pathname.startsWith('/gemini')) {
    upstreamHost = 'generativelanguage.googleapis.com';
    const newPath = url.pathname.replace('/gemini', '');
    upstreamUrlString = `https://${upstreamHost}${newPath}${url.search}`;
    return proxyGeneric(request, upstreamUrlString, upstreamHost);
  }

  return new Response('404 Not Found: The requested path does not match any routing rules.', { status: 404 });
}

// ===== /w-game-service 针对性代理（带 RSA 加密，仅 /api/v1/word/verify） =====
async function proxyWGameServiceWithRSA(request, upstreamUrlString, upstreamHost, url) {
  try {
    // 读取明文 JSON
    const text = await request.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (e) {
      return new Response('INVALID_JSON', { status: 400, headers: corsHeadersJson() });
    }

    // 基础校验
    const word = (body?.word || '').toString().trim().toUpperCase();
    if (!word || word.length < 3) {
      return new Response(JSON.stringify({ error: 'INVALID_WORD' }), { status: 422, headers: corsHeadersJson() });
    }

    // 构造加密前 payload（与后端协议一致）
    const clientPayload = {
      word,
      client_ts: Date.now(),
      nonce: generateNonce(),
      client_id: 'wx-miniapp',
      key_id: '2025Q4-01',
    };

    // 使用内置公钥（SPKI Base64），避免网络依赖导致不可用
    const publicKey = await getCachedPublicKey();
    if (!publicKey) {
      const h = new Headers(corsHeadersJson());
      h.set('X-Edge-Error', 'PUBLIC_KEY_UNAVAILABLE');
      return new Response(JSON.stringify({ error: 'PUBLIC_KEY_UNAVAILABLE' }), { status: 503, headers: h });
    }

    // 使用 Web Crypto API 执行 RSA-OAEP(SHA-256) 加密
    const ciphertextB64 = await encryptPayload(publicKey, JSON.stringify(clientPayload));
    if (!ciphertextB64) {
      const h = new Headers(corsHeadersJson());
      h.set('X-Edge-Error', 'ENCRYPT_FAILED');
      return new Response(JSON.stringify({ error: 'ENCRYPT_FAILED' }), { status: 500, headers: h });
    }

    // 组装上游请求（仅设置头，body 为空 JSON）
    const headers = new Headers(request.headers);
    headers.set('Host', upstreamHost);
    headers.delete('Origin');
    headers.set('X-Encrypted-Payload', ciphertextB64);
    headers.set('Content-Type', 'application/json');
    headers.set('Connection', 'keep-alive');

    const realIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
    if (realIp) headers.set('X-Forwarded-For', realIp);

    const init = {
      method: 'POST',
      headers,
      redirect: 'follow',
      body: '{}',
    };

    const upstreamResp = await fetch(upstreamUrlString, init);

    // 清理响应头，适配小游戏运行时
    const respHeaders = new Headers(upstreamResp.headers);
    sanitizeResponseHeaders(respHeaders);
    tagDebugHeaders(respHeaders, upstreamResp.status, 'w-game-service');

    const bodyBuf = await upstreamResp.arrayBuffer();
    return new Response(bodyBuf, { status: upstreamResp.status, headers: respHeaders });
  } catch (e) {
    return new Response(`Bad Gateway (w-game-service): ${e && e.message ? e.message : 'upstream error'}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// ===== 你现有的 /w-game-remote 强化代理，保持不变 =====
async function proxyWGameRemote(request, upstreamUrlString, upstreamHost, url) {
  const headers = new Headers(request.headers);
  headers.set('Host', upstreamHost);
  headers.delete('Origin');               // avoid cross-origin misjudgement
  headers.delete('Accept-Encoding');      // forbid upstream br/gzip
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
    return new Response(`Bad Gateway (w-game-remote): ${e && e.message ? e.message : 'upstream error'}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// ===== 其它路由：保持通用代理 =====
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

// ===== 工具函数 =====
function sanitizeResponseHeaders(respHeaders) {
  respHeaders.delete('Content-Encoding');
  respHeaders.delete('Transfer-Encoding');
  respHeaders.delete('Connection');
  respHeaders.delete('content-security-policy');
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  respHeaders.set('Access-Control-Allow-Headers', '*,Content-Type,Authorization,X-Goog-Api-Key');
  respHeaders.set('Cache-Control', 'public, max-age=300');
}

function tagDebugHeaders(respHeaders, status, scope) {
  respHeaders.set('X-Upstream-Status', String(status));
  respHeaders.set('X-Edge-Debug', scope);
}

function corsHeadersJson() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };
}

// 内置公钥（SPKI Base64）——请将后端 RSA 公钥（public.pem，经 SPKI Base64 编码）贴到此处
// 获取方式（任选其一）：
// 1) 服务器上执行：awk 'NF {sub(/\r/, ""); printf "%s", $0}' src/backend/public.pem | base64
// 2) 临时启用后端接口 /api/public-key 拉一次获取后，复制其返回的 publicKey 字段
const PUBLIC_KEY_B64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmUCV4q8ZMH3NWCaJWq4PbGnpkil3uiZ5aoOeACy1x5BGof+39NHo4MUoEkZSBnTjNi9L26skISZjQ0QViOCdBfAhoZUbpDrG91nLwwWS6qBUuFj3blFDQ8hW5SBO9aR+HimINjdqKPD4ZAPWJqX1HnSuLeL2BIgSh7GqDqQwJiJ+Cv2opCtwbX0Lx8PC9kiipHDh59cbFIqX1AdEqjTzlLElCllK+1jdiEEfe6BUJ+xeV1iXuh33anmomhRJeH74VFESlRUQFnAgfZbW+70KysBxfmSmG8w3+AxNIQ9wj+m6Xwbk0bQAyPQSM5nginYNSkDMYGYgvxEGYQ9+PKxpdQIDAQAB';

let cachedKey = null; // { cryptoKey, expireAt }
async function getCachedPublicKey() {
  const now = Date.now();
  if (cachedKey && cachedKey.expireAt > now) return cachedKey.cryptoKey;
  const b64 = PUBLIC_KEY_B64 && PUBLIC_KEY_B64.trim();
  if (!b64) return null;
  const key = await importSpkiB64(b64);
  if (!key) return null;
  cachedKey = { cryptoKey: key, expireAt: now + 30 * 60 * 1000 }; // 30 分钟缓存
  return key;
}

async function importSpkiB64(b64) {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // 尝试按 DER 直接导入
    try {
      return await crypto.subtle.importKey(
        'spki',
        bytes.buffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );
    } catch (_) {
      // 若失败，可能是 PEM 文本被 base64 了一次：还原为字符串后提取 PEM 内部 base64
      const text = new TextDecoder().decode(bytes);
      const m = text.match(/-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/);
      if (!m) return null;
      const inner = m[1].replace(/\s+/g, '');
      const innerBin = atob(inner);
      const innerBytes = new Uint8Array(innerBin.length);
      for (let i = 0; i < innerBin.length; i++) innerBytes[i] = innerBin.charCodeAt(i);
      return await crypto.subtle.importKey(
      'spki',
        innerBytes.buffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );
    }
  } catch (e) {
    return null;
  }
}

async function encryptPayload(publicKey, text) {
  try {
    const enc = new TextEncoder();
    const buf = enc.encode(text);
    const ciphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, buf);
    const bytes = new Uint8Array(ciphertext);
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str);
  } catch (e) {
    return null;
  }
}

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const toHex = (n) => n.toString(16).padStart(2, '0');
  const b = Array.from(bytes, toHex).join('');
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}
