// Worker: เสิร์ฟ .mp4 จาก R2 (รองรับ Range) ส่วนอื่นส่งต่อให้ static assets
const MP4_RE = /^\/[A-Za-z0-9._-]+\.mp4$/;

async function serveVideo(request, env, key) {
  const isHead = request.method === 'HEAD';
  const opts = { onlyIf: request.headers };
  if (request.headers.has('Range')) opts.range = request.headers;

  let object;
  try {
    object = isHead ? await env.VIDEOS.head(key) : await env.VIDEOS.get(key, opts);
  } catch (err) {
    // range เกินขนาดไฟล์ -> R2 โยน error
    const head = await env.VIDEOS.head(key);
    if (!head) return new Response('Not found', { status: 404 });
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${head.size}`, 'Accept-Ranges': 'bytes' },
    });
  }
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (!headers.get('Content-Type')) headers.set('Content-Type', 'video/mp4');
  headers.set('Cache-Control', 'public, max-age=86400');

  if (isHead) {
    headers.set('Content-Length', String(object.size));
    return new Response(null, { status: 200, headers });
  }

  // onlyIf ไม่ผ่าน -> ไม่มี body
  if (!('body' in object) || object.body === undefined) {
    const status = request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since') ? 304 : 412;
    return new Response(null, { status, headers });
  }

  const size = object.size;
  const r = object.range;
  let status = 200;
  let length = size;
  if (r) {
    let start;
    let end;
    if (r.suffix !== undefined) {
      length = Math.min(r.suffix, size);
      start = size - length;
    } else {
      start = r.offset ?? 0;
      length = r.length !== undefined ? Math.min(r.length, size - start) : size - start;
    }
    end = start + length - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    status = 206;
  }
  headers.set('Content-Length', String(length));
  return new Response(object.body, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (MP4_RE.test(url.pathname)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      return serveVideo(request, env, decodeURIComponent(url.pathname.slice(1)));
    }
    return env.ASSETS.fetch(request);
  },
};
