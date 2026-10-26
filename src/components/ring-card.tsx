import { disconnectOura, syncNow } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";

/**
 * The ring's connection: connect, sync now, disconnect. `askMore` (see needsMorePermissions) offers the one-time
 * approval of more permissions to a member who connected before the app asked for everything.
 */
export function RingCard({
  oura,
  askMore,
  back,
}: {
  oura: { lastSyncAt: Date | null } | null;
  askMore: boolean;
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
          {askMore && (
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
