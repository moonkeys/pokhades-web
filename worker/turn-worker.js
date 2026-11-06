// Mini-serveur gratuit (Cloudflare Worker) qui fabrique les identifiants du relais TURN de
// Cloudflare pour le multijoueur (src/net/net.ts). Cloudflare ne donne pas d'identifiant fixe :
// il faut appeler son API avec une clé secrète, qui ne doit surtout pas finir dans le jeu
// publié. Le jeu appelle donc ce Worker, qui garde la clé et renvoie des identifiants
// qui expirent seuls.
//
// Secrets (wrangler secret put) : TURN_KEY_ID, TURN_KEY_API_TOKEN.
// Variable (wrangler.toml) : ALLOWED_ORIGINS, les sites autorisés à l'appeler, séparés par des
// virgules (le tien sur GitHub Pages ; localhost passe toujours, pour les tests).
// Mise en place pas à pas : README.md, « Multijoueur : relais TURN ».

const TTL_SECONDS = 6 * 60 * 60; // plus long qu'une partie ; la durée d'un relais n'est pas facturée
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin) || LOCAL.test(origin);
    // Pas d'en-tête CORS pour un site inconnu : le navigateur bloque la réponse, et le quota
    // gratuit n'est pas mangé par n'importe qui.
    const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Méthode refusée', { status: 405, headers: cors });
    if (!ok) return new Response('Origine refusée', { status: 403 });

    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
    if (!res.ok) return new Response(`Cloudflare a refusé (${res.status})`, { status: 502, headers: cors });
    const { iceServers } = await res.json();
    // Le port 53 est bloqué par les navigateurs et fait attendre l'ICE pour rien.
    const clean = iceServers.map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }));
    return new Response(JSON.stringify({ iceServers: clean }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
  },
};
