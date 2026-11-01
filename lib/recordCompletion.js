// lib/recordCompletion.js

// Insert a completion row for today. coveringForStaffId = done for someone else (kiosk "Did you do it for them?")
export async function recordCompletion(supabase, taskId, staffId, currentPharmacyId, coveringForStaffId = null) {
  const { error } = await supabase.from("completions").insert([
        {
      task_id: Number(taskId),
      staff_id: Number(staffId),
      pharmacy_id: currentPharmacyId,
      covering_for_staff_id: coveringForStaffId ? Number(coveringForStaffId) : null,
      // Let Postgres default set completed_at = now() if you have it.
      // If not, uncomment the next line:
      // completed_at: new Date().toISOString(),
    },
  ]);
  if (error) throw error;
}

// Delete today's completion row for this task (undo)
export async function undoCompletion(supabase, taskId, currentPharmacyId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date();   end.setHours(23, 59, 59, 999);

  const { error } = await supabase
    .from("completions")
   .delete()
.eq("task_id", Number(taskId))
.eq("pharmacy_id", currentPharmacyId)
    .gte("completed_at", start.toISOString())
    .lt("completed_at", end.toISOString());

  if (error) throw error;
}
