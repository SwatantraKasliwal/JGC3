import { Compass, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Empty, Btn } from "../ui/index.jsx";

/* An address the app has no page for — an old bookmark, a mistyped link —
   says so, rather than quietly landing somewhere else. */
export default function NotFound() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="card">
      <Empty icon={Compass} title="Page not found"
        action={<Btn size="sm" icon={Home} onClick={() => nav("/", { replace: true })}>Go to the dashboard</Btn>}>
        There is no page at <b>{pathname}</b>. The link may be old, or mistyped — use the menu above
        to get where you were going.
      </Empty>
    </div>
  );
}
