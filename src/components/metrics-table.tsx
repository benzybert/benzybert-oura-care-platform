import { fmt, fmtDay } from "@/lib/format";
import type { DayMetric } from "@/lib/types";

export function MetricsTable({
  days,
  limit = 14,
  showStress = false,
}: {
  days: DayMetric[];
  limit?: number;
  showStress?: boolean;
}) {
  const rows = [...days].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, limit);
  if (rows.length === 0) return <p className="muted">עוד אין נתונים.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>תאריך</th>
            <th>ציון שינה</th>
            <th>מוכנות</th>
            <th>HRV</th>
            <th>דופק מנוחה</th>
            <th>שעות שינה</th>
            <th>צעדים</th>
            {showStress && <th>מתח (דק׳)</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.day}>
              <td>{fmtDay(d.day)}</td>
              <td>{fmt(d.sleepScore)}</td>
              <td>{fmt(d.readinessScore)}</td>
              <td>{fmt(d.averageHrv, 1)}</td>
              <td>{fmt(d.lowestHeartRate)}</td>
              <td>{fmt(d.totalSleepHours, 1)}</td>
              <td>{d.steps === null ? "–" : d.steps.toLocaleString("he-IL")}</td>
              {showStress && <td>{fmt(d.stressMinutes)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
