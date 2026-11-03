import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Empty, Btn } from "../ui/index.jsx";

/* A page that throws while drawing itself shows this instead of a blank
   screen — what happened, and two ways out — while the menu bar above stays
   usable. Keyed on the route by AppShell, so moving to another page clears it. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Left in the console for whoever is asked to look into it.
    console.error("Page failed to render:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card">
        <Empty icon={AlertTriangle} title="Something went wrong on this page"
          action={(
            <span className="row wrap" style={{ gap: 8, justifyContent: "center" }}>
              <Btn size="sm" icon={RotateCcw} onClick={() => this.setState({ error: null })}>Try again</Btn>
              <Btn size="sm" variant="ghost" onClick={() => window.location.reload()}>Reload the app</Btn>
            </span>
          )}>
          Nothing was saved or lost by this. Try again, or reload; if it keeps happening, tell the admin
          what you were doing — “{String(error?.message || error).slice(0, 160)}”.
        </Empty>
      </div>
    );
  }
}
