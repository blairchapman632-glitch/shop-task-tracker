// /lib/recordCompletion.js
// Usage: await recordCompletion(supabase, taskId, staffId)

export async function recordCompletion(supabase, taskId, staffId) {
  if (!supabase) throw new Error("Supabase client missing");
  if (typeof taskId !== "number" || typeof staffId !== "number") {
    throw new Error("taskId and staffId must be numbers");
  }

  const { data, error } = await supabase
    .from("completions")
    .insert({ task_id: taskId, staff_id: staffId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
