import { useEffect, useState } from "react";
import QRCode from "qrcode";

const LinkDareQR = ({ value }: { value: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 240 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) {
    return <div className="link-dare__qr-placeholder">Generating…</div>;
  }
  return <img src={src} alt="QR code" className="link-dare__qr" />;
};

export default LinkDareQR;
