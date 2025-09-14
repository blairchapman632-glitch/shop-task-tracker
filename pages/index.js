import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [morning, setMorning] = useState([]);
  const [afternoon, setAfternoon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,period,active")
        .eq("active", true);

      if (error) {
        setErr(error.message);
      } else {
        setMorning((data || []).filter(t => t.period === "morning"));
        setAfternoon((data || []).filter(t => t.period === "afternoon"));
      }

      setLoading(false);
    };

    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Byford Pharmacy Chalkboard</h1>
      <p>Live tasks from Supabase</p>

      {loading && <p>Loading tasks…</p>}
      {err && <p style={{ color: "red" }}>Error: {err}</p>}

      {!loading && !err && (
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          <div>
            <h2>Morning</h2>
            {morning.length === 0 ? (
              <p style={{ color: "#666" }}>No morning tasks yet.</p>
            ) : (
              <ul>
                {morning.map(task => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2>Afternoon</h2>
            {afternoon.length === 0 ? (
              <p style={{ color: "#666" }}>No afternoon tasks yet.</p>
            ) : (
              <ul>
                {afternoon.map(task => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
