export default function Home() {
  const morningTasks = [
    "Fridge Temp.",
    "Sweep/vacuum floors",
    "Clean benches",
    "Clean screens",
    "Clean Green Room",
    "Fill Stock OTC",
    "Fill Shop",
    "Floor mopped",
  ];

  const afternoonTasks = [
    "Dry Clean",
    "Out of stock tags",
    "Pull stock forward",
    "Dishes",
    "Bins emptied",
    "Floor swept",
    "File scripts",
    "Signs cleaned",
    "Clean toilet room",
    "Water plants",
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-blue-600 mb-6">
        Byford Pharmacy Chalkboard
      </h1>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-3">Morning</h2>
          <ul className="space-y-2">
            {morningTasks.map((task, idx) => (
              <li
                key={idx}
                className="p-3 bg-white rounded shadow hover:bg-blue-50"
              >
                {task}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Afternoon</h2>
          <ul className="space-y-2">
            {afternoonTasks.map((task, idx) => (
              <li
                key={idx}
                className="p-3 bg-white rounded shadow hover:bg-blue-50"
              >
                {task}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
