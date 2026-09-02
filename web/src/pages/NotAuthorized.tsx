export function NotAuthorized() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-3 text-4xl">🚫</div>
      <h1 className="text-lg font-semibold text-slate-100">Access Denied</h1>
      <p className="mt-1 text-sm text-slate-400">You do not have permission to view this section.</p>
    </div>
  );
}
