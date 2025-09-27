export async function recordCompletion(supabase, taskId, staffId) {
  // Insert one completion row (task + staff). DB should auto-set timestamp.
  const { data, error } = await supabase
    .from("completions")
    .insert({ task_id: taskId, staff_id: staffId })
    .select()
    .single();

  if (error) {
    // Let the caller surface a friendly message (e.g., already recorded today).
    throw error;
  }
  return data;
}
