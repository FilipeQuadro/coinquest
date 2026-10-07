/**
 * Only Vite build output (`assets/name-HASH.js|css`) is content-hashed. Game sprites under
 * `public/assets/<folder>/` keep stable names, so they must get a precache revision or installed
 * PWAs keep serving the old art forever after a sprite is replaced.
 */
export const hashedBuildAssetPattern = /^assets\/[^/]+-[\w-]{8}\.(?:js|css)$/
