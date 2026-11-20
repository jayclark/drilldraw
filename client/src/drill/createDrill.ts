import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Sport } from "../../../shared/drill";

/** Create a drill on the server and navigate to its shareable URL. */
export function useCreateDrill() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Resolves to an error message on failure (also exposed as `error`), or null once navigating. */
  const create = async (sport: Sport = "hockey"): Promise<string | null> => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sport }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url)
        throw new Error(
          body.error ?? `Couldn't create a drill (${res.status}).`,
        );
      navigate(body.url);
      return null;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't create a drill.";
      setError(message);
      setCreating(false);
      return message;
    }
  };

  return { create, creating, error };
}
