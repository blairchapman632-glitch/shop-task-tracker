// /lib/recordCompletion.ts
// Simple helper to insert a completion row.
// Usage (next step): await recordCompletion(supabase, taskId, staffId)

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordCompletionArgs = {
  supabase: SupabaseClient;
  taskId: number;   // bigint in DB → use number in TS
  staffId: number;  // bigint in DB → use number in TS
};

export async function recordCompletion({ supabase, taskId, staffId }: RecordCompletionArgs) {
  // Defensive checks
  if (!supabase) throw new Error("Supabase client missing");
  if (typeof taskId !== "number" || typeof staffId !== "number") {
    throw new Error("taskId and staffId must be numbers");
  }

  const { data, error } = await supabase
    .from("completions")
    .insert({
      task_id: taskId,
      staff_id: staffId,
      // completed_at defaults in DB to Perth time, so we don't need to send it
    })
    .select()
    .single();

  if (error) {
    // Pass a clean error up to the caller (UI will handle toast/message)
    throw new Error(error.message);
  }

  return data;
}
