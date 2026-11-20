import { Link } from "react-router-dom";
import { Header } from "../components/Header";
import { RecentDrills } from "../components/RecentDrills";

export function NotFound({
  message = "That page doesn't exist.",
}: {
  message?: string;
}) {
  return (
    <div className="page">
      <Header>
        <RecentDrills />
      </Header>
      <main className="not-found">
        <h1>Not found</h1>
        <p>{message}</p>
        <Link className="btn btn-primary" to="/">
          Go to drilldraw
        </Link>
      </main>
    </div>
  );
}
