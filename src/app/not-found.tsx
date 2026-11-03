import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <h1>This table is empty.</h1>
        <p>The page you’re looking for isn’t here.</p>
        <Link href="/" className="button primary">
          Back to the menu
        </Link>
      </div>
    </div>
  );
}
