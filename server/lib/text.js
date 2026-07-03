export function stripBracketNoise(text) {
  return text
    .replace(/[（(][^()（）]*(?:提示|说明|注释|副歌重复|间奏|独白|念白|可选|建议)[^()（）]*[）)]/gi, '')
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ensureSongSections(text) {
  const hasSection = /\[(Intro|Verse|Pre-Chorus|Chorus|Bridge|Outro|主歌|副歌|桥段|前奏|尾奏)/i.test(text);
  if (hasSection) return text;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const groups = [
    ['[Intro]', lines.slice(0, 2)],
    ['[Verse 1]', lines.slice(2, 6)],
    ['[Chorus]', lines.slice(6, 10)],
    ['[Verse 2]', lines.slice(10, 14)],
    ['[Bridge]', lines.slice(14, 17)],
    ['[Outro]', lines.slice(17)]
  ];
  return groups
    .filter(([, body]) => body.length)
    .map(([tag, body]) => `${tag}\n${body.join('\n')}`)
    .join('\n\n');
}

export function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}
