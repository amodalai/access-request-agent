import { useState } from "react";
import { useToolRun } from "@amodalai/react";
import { DecideModal } from "./components/DecideModal.js";
import { serial } from "./serial.js";
import { errorMessage, runTool } from "./tools.js";
import { latestReview, type Data, type Decision, type RequestRow } from "./types.js";

/**
 * The approver's actions on a request, shared by the queue and the detail
 * screen. Reviews queue up and run one at a time: the tool launcher is single
 * flight and aborts the run in flight when the next one starts.
 */
export function useRequestActions(data: Data) {
  const review = useToolRun<{ request_id: string }>("review_request");
  const decide = useToolRun<{ request_id: string; decision: Decision; note?: string }>("decide_request");
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [target, setTarget] = useState<{ req: RequestRow; decision: Decision } | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | undefined>();
  const [enqueue] = useState(serial);

  function onReview(request_id: string) {
    setReviewing((s) => new Set(s).add(request_id));
    setErrors((m) => {
      const next = new Map(m);
      next.delete(request_id);
      return next;
    });
    void enqueue(() => runReview(request_id));
  }

  async function runReview(request_id: string) {
    try {
      await runTool(review, { request_id });
      await data.refetch();
    } catch (err) {
      setErrors((m) => new Map(m).set(request_id, errorMessage(err, "Review failed.")));
    } finally {
      setReviewing((s) => {
        const next = new Set(s);
        next.delete(request_id);
        return next;
      });
    }
  }

  function onDecide(req: RequestRow, decision: Decision) {
    setDecideError(undefined);
    setTarget({ req, decision });
  }

  async function onConfirm(note: string) {
    if (!target) return;
    setDeciding(true);
    try {
      await runTool(decide, { request_id: target.req.request_id, decision: target.decision, note: note || undefined });
      await data.refetch();
      setTarget(null);
    } catch (err) {
      setDecideError(errorMessage(err, "The decision was not recorded."));
    } finally {
      setDeciding(false);
    }
  }

  const modal = target ? (
    <DecideModal
      req={target.req}
      decision={target.decision}
      recommendation={latestReview(data, target.req)?.recommendation}
      busy={deciding}
      error={decideError}
      onConfirm={(note) => void onConfirm(note)}
      onCancel={() => setTarget(null)}
    />
  ) : null;

  return { reviewing, errors, onReview, onDecide, modal };
}

export type RequestActions = ReturnType<typeof useRequestActions>;
