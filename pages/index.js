import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"

export default function Home() {
  const [morning, setMorning] = useState([])
  const [afternoon, setAfternoon] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,period,active")
        .eq("active", true)

      if (error) {
        setError(error.message)
      } else {
        setMorning(data.filter(t => t.period === "morning"))
        setAfternoon(data.filter(t => t.period === "afternoon"))
      }

      setLoading(false)
    }

    loadTasks()
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>Byford Pharmacy Chalkboard</h1>
      <p>Live tasks from Supabase</p>

      {loading && <p>Loading tasks…</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!loading && !error && (
        <div style={{ display: "flex", gap: 40 }}>
          <div>
            <h2>Morning</h2>
            <ul>
              {morning.map(task => (
                <li key={task.id}>{task.title}</li>
              ))}
            </ul>
          </div>

          <div>
            <h2>Afternoon</h2>
            <ul>
              {afternoon.
