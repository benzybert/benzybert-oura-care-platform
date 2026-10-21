/**
 * Logout is a POST form, not a link: Next.js prefetches links in the viewport,
 * and a GET /api/logout would sign the user out just by rendering the page.
 */
export function LogoutButton() {
  return (
    <form action="/api/logout" method="post">
      <button className="btn secondary" type="submit">
        התנתקות
      </button>
    </form>
  );
}
