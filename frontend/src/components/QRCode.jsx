export default function QRCodeComponent({ value, size = 180 }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;

  return (
    <div className="qr-wrapper">
      <img src={qrUrl} alt={`QR: ${value}`} width={size} height={size} />
    </div>
  );
}