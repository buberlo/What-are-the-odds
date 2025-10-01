const svgMarkup = (width, height, label) => {
  const fontSize = Math.max(Math.floor(Math.min(width, height) * 0.035), 18);
  const padding = Math.max(Math.floor(fontSize * 0.8), 16);
  const textWidth = Math.floor(label.length * fontSize * 0.6);
  const rectWidth = textWidth + padding * 2;
  const rectHeight = fontSize + padding;
  const rectX = Math.max(width - rectWidth - padding, padding);
  const rectY = Math.max(height - rectHeight - padding, padding);
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(0,0,0,0.5)" />
      </filter>
    </defs>
    <rect x="${rectX}" y="${rectY}" rx="${Math.floor(padding / 2)}" ry="${Math.floor(padding / 2)}" width="${rectWidth}" height="${rectHeight}" fill="rgba(15,23,42,0.55)" />
    <text x="${rectX + rectWidth - padding}" y="${rectY + rectHeight - Math.floor(padding / 2)}" font-size="${fontSize}" font-family="'Inter','Segoe UI',sans-serif" text-anchor="end" fill="#f8fafc" filter="url(#shadow)">${label}</text>
  </svg>`;
};

export const buildWatermarkBuffer = (width, height, slug, createdAt) => {
  const ts = new Date(createdAt).toISOString();
  const label = `${slug || "proof"} · ${ts}`;
  return Buffer.from(svgMarkup(width, height, label));
};
