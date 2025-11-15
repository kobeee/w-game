/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// =================================================
// 常数配置与密钥
// =================================================

// 硬编码的 RSA-2048 公钥（SPKI DER Base64 格式）
// 来自 src/backend/public.pem
const PUBLIC_KEY_DER_B64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmUCV4q8ZMH3NWCaJWq4PbGnpkil3uiZ5aoOeACy1x5BGof+39NHo4MUoEkZSBnTjNi9L26skISZjQ0QViOCdBfAhoZUbpDrG91nLwwWS6qBUuFj3blFDQ8hW5SBO9aR+HimINjdqKPD4ZAPWJqX1HnSuLeL2BIgSh7GqDqQwJiJ+Cv2opCtwbX0Lx8PC9kiipHDh59cbFIqX1AdEqjTzlLElCllK+1jdiEEfe6BUJ+xeV1iXuh33anmomhRJeH74VFESlRUQFnAgfZbW+70KysBxfmSmG8w3+AxNIQ9wj+m6Xwbk0bQAyPQSM5nginYNSkDMYGYgvxEGYQ9+PKxpdQIDAQAB';

// =================================================
// RSA-OAEP 加密工具函数
// =================================================

/**
 * 导入 RSA 公钥（SPKI DER 格式）
 * @param {string} pubkeyB64 - SPKI DER Base64 格式的公钥
 * @returns {Promise<CryptoKey>} - Web Crypto API 的 CryptoKey 对象
 */
async function importRsaPublicKey(pubkeyB64) {
  try {
    // 1. Base64 解码为二进制
    const binaryString = atob(pubkeyB64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. 导入 SPKI DER 格式的公钥
    const cryptoKey = await crypto.subtle.importKey(
      'spki',
      bytes.buffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false, // not extractable
      ['encrypt']
    );

    return cryptoKey;
  } catch (error) {
    throw new Error(`Failed to import RSA public key: ${error.message}`);
  }
}

/**
 * 使用 RSA-OAEP-SHA256 加密数据
 * @param {CryptoKey} publicKey - 导入的 RSA 公钥
 * @param {string} plaintext - 明文 JSON 字符串
 * @returns {Promise<string>} - Base64 编码的密文
 */
async function encryptRsaOaep(publicKey, plaintext) {
  try {
    // 将明文转为 Uint8Array
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // 使用 RSA-OAEP 加密
    const cipherBytes = await crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP'
      },
      publicKey,
      plaintextBytes
    );

    // 转为 Base64
    const binaryString = String.fromCharCode(...new Uint8Array(cipherBytes));
    const cipherB64 = btoa(binaryString);

    return cipherB64;
  } catch (error) {
    throw new Error(`RSA encryption failed: ${error.message}`);
  }
}

/**
 * 生成随机 nonce（用于防重放）
 * 采用 UUID v4 格式的简化版本
 * @returns {string} - 随机 nonce 字符串
 */
function generateNonce() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =================================================
// 主事件监听器
// =================================================
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * 处理所有传入的请求
 * @param {Request} request 客户端发来的请求
 */
async function handleRequest(request) {
  // 处理 CORS 预检请求 (OPTIONS)
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  const url = new URL(request.url);

  let upstreamUrlString; // 将用于构建完整的上游 URL 字符串
  let upstreamHost;      // 将用于设置 Host 和 Origin 头
  let needsEncryption = false; // 是否需要 RSA 加密

  // 1. 【核心路由逻辑】根据请求路径决定上游目标地址
  // (优先匹配更具体的路径 /postcard-public，防止 /postcard 规则误匹配)

  // 规则 5: /w-game-service -> http://elvis1949.top:9100（需要 RSA 加密）
  if (url.pathname.startsWith('/w-game-service')) {
    upstreamHost = 'elvis1949.top:9100';
    const newPath = url.pathname.replace('/w-game-service', '');
    // 【修复】拼接协议、主机、新路径以及原始查询参数 (url.search)
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
    needsEncryption = request.method === 'POST'; // 仅 POST 需要加密
  }
  // 规则 4: /w-game-remote -> http://elvis1949.top:9090
  else if (url.pathname.startsWith('/w-game-remote')) {
    upstreamHost = 'elvis1949.top:9090';
    const newPath = url.pathname.replace('/w-game-remote', '');
    // 【修复】拼接协议、主机、新路径以及原始查询参数 (url.search)
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
  }
  // 规则 3: /postcard-public -> http://elvis1949.top:8080
  else if (url.pathname.startsWith('/postcard-public')) {
    upstreamHost = 'elvis1949.top:8080';
    const newPath = url.pathname.replace('/postcard-public', '');
    // 【修复】拼接协议、主机、新路径以及原始查询参数 (url.search)
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
  }
  // 规则 2: /postcard -> http://elvis1949.top:8083
  else if (url.pathname.startsWith('/postcard')) {
    upstreamHost = 'elvis1949.top:8083';
    const newPath = url.pathname.replace('/postcard', '');
    // 【修复】拼接协议、主机、新路径以及原始查询参数 (url.search)
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
  }
  // 规则 1: /gemini -> https://generativelanguage.googleapis.com
  else if (url.pathname.startsWith('/gemini')) {
    upstreamHost = 'generativelanguage.googleapis.com';
    const newPath = url.pathname.replace('/gemini', '');
    // 【修复】拼接协议、主机、新路径以及原始查询参数 (url.search)
    upstreamUrlString = `https://${upstreamHost}${newPath}${url.search}`;
  }
  // 如果没有任何规则匹配
  else {
    return new Response('404 Not Found: The requested path does not match any routing rules.', { status: 404 });
  }

  // 2. 准备转发请求的 Headers
  const headers = new Headers(request.headers);
  headers.set('Host', upstreamHost);
  // 从构建好的完整 URL 中获取正确的 Origin
  headers.set('Origin', new URL(upstreamUrlString).origin);

  // 3. 处理请求体加密（仅限 /w-game-service 且为 POST）
  let body = request.body;
  if (needsEncryption) {
    try {
      // 读取原始请求体（明文 JSON）
      const bodyText = await request.text();
      const bodyJson = JSON.parse(bodyText);

      // 构造完整的加密载荷（补充时间戳和 nonce）
      const encryptPayload = {
        word: (bodyJson.word || '').toUpperCase(), // 单词改为大写，保持后端兼容性
        client_ts: Date.now(), // 当前时间戳（毫秒）
        nonce: generateNonce(), // 生成随机 nonce
        client_id: 'cloudflare-worker', // Worker 作为代理客户端
        key_id: '1' // 密钥版本号
      };

      // 导入公钥并加密
      const publicKey = await importRsaPublicKey(PUBLIC_KEY_DER_B64);
      const encryptPayloadStr = JSON.stringify(encryptPayload);
      const cipherB64 = await encryptRsaOaep(publicKey, encryptPayloadStr);

      // 清空原始体，使用加密后的密文放在头部
      headers.set('X-Encrypted-Payload', cipherB64);
      body = null; // 不再发送请求体
    } catch (error) {
      console.error('[Worker] RSA 加密失败:', error.message);
      return new Response(
        JSON.stringify({ error: 'RSA_ENCRYPTION_FAILED', message: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4. 转发请求，并包含原始的 body/headers 和 method
  const response = await fetch(upstreamUrlString, {
    method: request.method,
    headers: headers,
    body: body,
    redirect: 'follow'
  });

  // 5. 处理从上游返回的响应
  const newResponse = new Response(response.body, response);

  // 6. 设置允许跨域的响应头 (CORS headers)
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Goog-Api-Key, X-Encrypted-Payload, *');

  newResponse.headers.delete('content-security-policy');

  return newResponse;
}

/**
 * 处理 CORS 预检请求 (OPTIONS)
 */
function handleOptions() {
  return new Response(null, {
    status: 204, // No Content
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Goog-Api-Key, *',
      'Access-Control-Max-Age': '86400', // 缓存预检结果一天
    },
  });
}