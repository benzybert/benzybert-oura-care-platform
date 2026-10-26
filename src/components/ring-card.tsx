import { disconnectOura, syncNow } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";

/**
 * The ring's connection: connect, sync now, disconnect. `missing` lists the Oura scopes the stored connection lacks
 * (members who connected before the app asked for everything): approving them is one pass through Oura's consent screen.
 */
export function RingCard({
  oura,
  missing,
  back,
}: {
  oura: { lastSyncAt: Date | null } | null;
  missing: string[];
  back?: "ring";
}) {
  return (
    <div className="card" id="ring">
      <h2>הטבעת</h2>
      {oura ? (
        <>
          <div className="row">
            <span>
              <span className="badge ok">מחובר</span>{" "}
              <span className="muted">סנכרון אחרון: {oura.lastSyncAt ? fmtDateTime(oura.lastSyncAt) : "עוד לא"}</span>
            </span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <form action={syncNow}>
                {back && <input type="hidden" name="back" value={back} />}
                <button className="btn" type="submit">
                  סנכרן עכשיו
                </button>
              </form>
              <form action={disconnectOura}>
                <button className="btn secondary" type="submit">
                  נתק וימחק את הטוקנים
                </button>
              </form>
            </span>
          </div>
          {missing.length > 0 && (
            <div className="row">
              <span className="muted">
                יש עוד נתונים ש-Oura לא מסרה עדיין (למשל חמצן בדם, חוסן, גיל לב וכלי דם, VO2 max, סוללת הטבעת). כדי לקבל אותם צריך לאשר
                ל-Oura הרשאות נוספות (פעם אחת), ולסמן את כל התיבות במסך האישור של Oura.
              </span>
              <a className="btn" href="/api/oura/connect">
                אישור הרשאות נוספות
              </a>
            </div>
          )}
        </>
      ) : (
        <div className="row">
          <span className="muted">הטבעת לא מחוברת.</span>
          <a className="btn" href="/api/oura/connect">
            חבר Oura
          </a>
        </div>
      )}
    </div>
  );
}
