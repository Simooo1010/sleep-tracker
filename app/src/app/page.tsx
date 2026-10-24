import Image from 'next/image';

export default function HomePage() {
  return (
    <main className="shell home">
      <div className="home-card">
        <div className="icon-tile home-logo">
          <Image src="/icon-512.png" alt="Icona di Sleep Tracker: una nuvola con una luna" width={512} height={512} priority unoptimized />
        </div>
        <h1 className="serif display-md home-title">Sleep Tracker</h1>
        <p className="body muted home-note">Stima da sola. Chiede solo una conferma.</p>
      </div>
    </main>
  );
}
