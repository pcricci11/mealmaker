interface SearchQueryProgress {
  query: string;
  status: "searching" | "found" | "not_found";
}

export interface SmartSetupProgress {
  phase: "parsing" | "matching" | "searching" | "done";
  message: string;
  searchQueries: SearchQueryProgress[];
}

export default function SmartSetupProgressModal({
  progress,
  onCancel,
}: {
  progress: SmartSetupProgress;
  onCancel?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-2xl max-w-md w-full h-full md:h-auto flex items-center justify-center p-8">
        {progress.phase === "done" ? (
          <div className="text-center space-y-3">
            <div className="text-3xl">✨</div>
            <p className="text-gray-700 font-medium">{progress.message}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col items-center space-y-3">
              {progress.phase === "searching" ? (
                <div className="text-3xl">🔍</div>
              ) : (
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-200 border-t-emerald-600" />
              )}
              <p className="text-gray-700 font-medium">{progress.message}</p>
            </div>

            {progress.phase === "searching" &&
              progress.searchQueries.length > 0 && (
                <ul className="space-y-2">
                  {progress.searchQueries.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg bg-gray-50"
                    >
                      {q.status === "searching" && (
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-emerald-200 border-t-emerald-600 shrink-0" />
                      )}
                      {q.status === "found" && (
                        <span className="text-emerald-600 shrink-0">✓</span>
                      )}
                      {q.status === "not_found" && (
                        <span className="text-orange-500 shrink-0">—</span>
                      )}
                      <span className="text-gray-700 truncate">{q.query}</span>
                      {q.status === "found" && (
                        <span className="text-emerald-600 text-xs ml-auto shrink-0">
                          Looks delicious! 🤤
                        </span>
                      )}
                      {q.status === "not_found" && (
                        <span className="text-orange-500 text-xs ml-auto shrink-0">
                          Still hunting...
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

            {onCancel && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
