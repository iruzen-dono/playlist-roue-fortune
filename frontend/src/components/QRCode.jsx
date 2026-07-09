// QRCode léger — rend un QR via une URL publique (API statique)
// Alternative sans dépendance : afficher un code avec bordure
export default function QRCodeComponent({ value, size = 200 }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;

  return (
    <div style={styles.wrapper}>
      <img
        src={qrUrl}
        alt={`QR: ${value}`}
        width={size}
        height={size}
        style={styles.qr}
      />
      <p style={styles.url}>{value}</p>
    </div>
  );
}

const styles = {
  wrapper: { textAlign: 'center' },
  qr: { borderRadius: '8px', background: 'white', padding: '8px' },
  url: { color: '#8888aa', fontSize: '0.7rem', marginTop: '4px', wordBreak: 'break-all' },
};