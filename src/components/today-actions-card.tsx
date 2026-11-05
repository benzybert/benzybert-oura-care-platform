type ActionRow = { rule: string; title: string; task: string };

/** Today's suggested actions from last night's numbers. Shown on the member home tab. */
export function TodayActionsCard({ actions }: { actions: ActionRow[] }) {
  return (
    <div className="card">
      <h2>פעולות להיום</h2>
      {actions.length === 0 ? (
        <p className="muted">אין פעולות מומלצות. הלילה האחרון היה בסדר.</p>
      ) : (
        actions.map((a) => (
          <div className="row" key={a.rule}>
            <div>
              <strong>{a.title}</strong>
              <p className="muted">{a.task}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
