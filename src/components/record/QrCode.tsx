import qrcode from "qrcode-generator";

/**
 * A QR code as inline SVG — one path, no image request, no client script,
 * so it prints crisply at any size and inherits the ink colour. Rendered on
 * the server; medium error correction survives a creased or photocopied
 * printout without making the code needlessly dense.
 */
export function QrCode({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();

  const n = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }

  return (
    <svg viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className={className} role="img" aria-label={label}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}
