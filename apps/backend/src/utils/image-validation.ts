const ALLOWED_IMAGES: Record<
  string,
  { mime: string; match: (b: Buffer) => boolean }
> = {
  jpeg: {
    mime: 'image/jpeg',
    match: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  png: {
    mime: 'image/png',
    match: b =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a
  },
  webp: {
    mime: 'image/webp',
    match: b =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP'
  },
  gif: {
    mime: 'image/gif',
    match: b => {
      const head = b.toString('ascii', 0, 6)

      return head === 'GIF87a' || head === 'GIF89a'
    }
  }
}

/**
 * Validates an uploaded photo buffer against an image-content allowlist by
 * sniffing magic bytes, so the stored extension is derived from verified
 * content instead of the client-provided mimetype. Rejects content that is
 * not a supported image (JPEG/PNG/WebP/GIF) so an attacker cannot plant
 * arbitrary content (e.g. HTML/SVG) into the same-origin store.
 *
 * @param buffer - Raw uploaded bytes
 * @param _declaredMimetype - Client-declared content type (untrusted, unused)
 * @returns The verified extension and canonical content type
 */
export const validateImage = (
  buffer: Buffer,
  _declaredMimetype: string
): { ext: string; mimetype: string } => {
  for (const [ext, { mime, match }] of Object.entries(ALLOWED_IMAGES)) {
    if (match(buffer)) return { ext, mimetype: mime }
  }

  // Carry both `.code` (recognized by route `handlerErrorInRoute` / HTTP
  // helper mapping) and `.statusCode` (recognized by the Fastify error handler),
  // so every route that validates content surfaces an explicit 415.
  throw Object.assign(new Error('Unsupported image type'), {
    code: 415,
    statusCode: 415,
    status: 415
  })
}
