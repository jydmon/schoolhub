import LogoutButton from "./LogoutButton";

export function SiplatMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SIPlat" role="img">
      <defs>
        <linearGradient id="siplatMark" x1="40" y1="24" x2="472" y2="488" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="0.5" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#siplatMark)" />
      <g stroke="#fff" strokeWidth="28" strokeLinecap="round">
        <line x1="256" y1="256" x2="256" y2="140" />
        <line x1="256" y1="256" x2="150" y2="330" />
        <line x1="256" y1="256" x2="362" y2="330" />
      </g>
      <circle cx="256" cy="140" r="30" fill="#fff" />
      <circle cx="150" cy="330" r="30" fill="#fff" />
      <circle cx="362" cy="330" r="30" fill="#fff" />
      <circle cx="256" cy="256" r="52" fill="#fff" />
      <circle cx="256" cy="256" r="20" fill="url(#siplatMark)" />
    </svg>
  );
}

export default function TopBar({ email, role }: { email: string; role: string }) {
  return (
    <div className="topbar">
      <div className="brand">
        <SiplatMark size={30} />
        <span className="wordmark">SIPlat</span>
      </div>
      <div className="flex-between" style={{ gap: 16 }}>
        <span className="who">{email} · {role}</span>
        <LogoutButton />
      </div>
    </div>
  );
}
