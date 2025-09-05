export async function POST() {
  return new Response('Stripe webhook endpoint', { status: 200 });
}
