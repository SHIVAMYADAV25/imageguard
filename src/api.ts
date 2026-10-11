// Minimal HTTP API (for wiring a UI later):  POST /search (multipart)  |  GET /blobs/:id
//   curl -F image=@me.jpg -F selfie=@selfie.jpg -F owner=true -F adult=true -F usernames=foo http://localhost:3000/search
import fs from 'node:fs';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { config } from './config';
import { runSearch } from './pipeline';
import { IntakeError } from './intake/validate';
import { blobPath } from './verify/blobs';
import { HashBlocklist } from './moderation/blocklist';
import { checkUpload } from './moderation/checkUpload';

async function main() {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: config.limits.uploadBytes, files: 2 } });

  app.post('/search', async (req, reply) => {
    const f: Record<string, string> = {};
    let image: Buffer | undefined, selfie: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        if (part.fieldname === 'image') image = buf;
        if (part.fieldname === 'selfie') selfie = buf;
      } else f[part.fieldname] = String(part.value);
    }
    const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
    try {
      return await runSearch({
        imageBuffer: image ?? Buffer.alloc(0), selfieBuffer: selfie, imageUrl: f.imageUrl,
        keywords: list(f.keywords), usernames: list(f.usernames), knownUrls: list(f.urls),
        declaration: { isOwnerOrAuthorized: f.owner === 'true', isAdult: f.adult === 'true' },
      });
    } catch (e) {
      if (e instanceof IntakeError) return reply.code(422).send({ error: e.code, message: e.message, refer: e.refer });
      throw e;
    }
  });

  app.get<{ Params: { id: string } }>('/blobs/:id', async (req, reply) => {
    const p = blobPath(req.params.id);
    if (!fs.existsSync(p)) return reply.code(404).send();
    return reply.type('image/jpeg').send(fs.readFileSync(p));
  });

  // ---- Platform-side simulator: what a participating platform does with hashes + uploads -------
  const blocklist = new HashBlocklist();
  app.post<{ Body: { hash?: string; caseRef?: string } }>('/moderation/hashes', async (req, reply) => {
    const { hash, caseRef } = req.body ?? {};
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return reply.code(422).send({ error: 'hash must be 64 hex chars' });
    return blocklist.add(hash, caseRef);
  });
  app.post('/moderation/check', async (req, reply) => {
    for await (const part of req.parts()) if (part.type === 'file') return checkUpload(await part.toBuffer(), blocklist);
    return reply.code(422).send({ error: 'send an image file' });
  });

  app.get('/healthz', async () => ({ ok: true }));
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
  console.log('ImageGuard API on http://127.0.0.1:3000');
}
main().catch((e) => { console.error(e); process.exit(1); });
