export async function hashPin(
  pin: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const usedSalt = salt ?? crypto.randomUUID();
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(usedSalt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return { hash, salt: usedSalt };
}

export async function verifyPin(
  pin: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const { hash } = await hashPin(pin, salt);
  return hash === storedHash;
}
