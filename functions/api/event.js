export async function onRequestPost({ request }) {
  const body = await request.text()
  const res = await fetch('https://plausible.io/api/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('User-Agent'),
      'X-Forwarded-For': request.headers.get('CF-Connecting-IP'),
    },
    body,
  })
  return new Response(res.body, { status: res.status })
}
