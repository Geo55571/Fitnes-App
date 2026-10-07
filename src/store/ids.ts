let counter = 0;

export function newId(prefix = ''): string {
  counter = (counter + 1) % 1296;
  const rand = Math.floor(Math.random() * 36 ** 5).toString(36).padStart(5, '0');
  return `${prefix}${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${rand}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function inviteCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
