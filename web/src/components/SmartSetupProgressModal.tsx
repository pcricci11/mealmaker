import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        fullScreenMobile={false}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md"
      >
        <DialogTitle className="sr-only">Setup Progress</DialogTitle>
        <DialogDescription className="sr-only">Smart setup is in progress</DialogDescription>

        {progress.phase === "done" ? (
          <div className="text-center space-y-3 py-8">
            <div className="text-3xl">&#10024;</div>
            <p className="text-gray-700 font-medium">{progress.message}</p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center space-y-3">
              {progress.phase === "searching" ? (
                <div className="text-3xl">&#128269;</div>
              ) : (
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-200 border-t-orange-500" />
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
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-orange-200 border-t-orange-500 shrink-0" />
                      )}
                      {q.status === "found" && (
                        <span className="text-green-600 shrink-0">&#10003;</span>
                      )}
                      {q.status === "not_found" && (
                        <span className="text-orange-500 shrink-0">&mdash;</span>
                      )}
                      <span className="text-gray-700 truncate">{q.query}</span>
                      {q.status === "found" && (
                        <span className="text-green-600 text-xs ml-auto shrink-0">
                          Looks delicious!
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
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
