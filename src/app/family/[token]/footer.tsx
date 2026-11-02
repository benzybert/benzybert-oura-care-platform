/** The two sentences every family page ends with. */
export function FamilyFooter({ emergency, delay }: { emergency: string; delay: string }) {
  return (
    <section className="card hw-safety">
      <p>{emergency}</p>
      <p className="muted small">{delay}</p>
    </section>
  );
}
