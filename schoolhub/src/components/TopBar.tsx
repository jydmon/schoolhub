import LogoutButton from "./LogoutButton";

export default function TopBar({ email, role }: { email: string; role: string }) {
  return (
    <div className="topbar">
      <div className="brand">
        <span className="logo-dot" />
        <span>SchoolHub</span>
      </div>
      <div className="flex-between" style={{ gap: 16 }}>
        <span className="who">
          {email} · {role}
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
